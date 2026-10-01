-- =====================================================================
-- VidaGroups · Panel Pastoral: todo lo que el pastor necesita en una consulta
-- Respeta permisos: el Pastor ve sus redes, el Apóstol ve toda la iglesia.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

create or replace function public.panel_pastoral()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  fechas as (
    select current_date as hoy,
           date_trunc('week', current_date)::date as semana_actual,
           date_trunc('month', current_date)::date as mes_actual
  ),
  grupos as (
    select g.id, g.nombre, g.red_id, g.guia_id, g.creado_en from public.groups g
  ),
  mpg as (
    select grupo_id, count(*) as n,
           count(*) filter (where creado_en >= (select mes_actual from fechas)) as nuevos_mes
      from public.miembros_grupo where activo group by grupo_id
  ),
  reus as (
    select r.id, r.grupo_id, r.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = r.id and a.presente) as presentes
      from public.reuniones r
     where r.fecha >= (select semana_actual from fechas) - 7 * 8
  ),
  -- Asistencia de las últimas 8 semanas (lunes a domingo)
  semanas as (
    select s.semana,
           coalesce(sum(r.presentes), 0) as presentes,
           coalesce(sum(m.n) filter (where r.id is not null), 0) as esperados,
           count(r.id) as reuniones
      from generate_series(0, 7) as i
     cross join lateral (select (select semana_actual from fechas) - 7 * i as semana) s
      left join reus r on r.fecha >= s.semana and r.fecha < s.semana + 7
      left join mpg m on m.grupo_id = r.grupo_id
     group by s.semana
  ),
  -- Grupos con miembros que no registran reunión hace 14 días o más
  sin_reunion as (
    select g.id, g.nombre, g.red_id,
           nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '') as guia,
           (select max(r.fecha) from public.reuniones r where r.grupo_id = g.id) as ultima
      from grupos g
      join mpg on mpg.grupo_id = g.id
      left join public.profiles p on p.id = g.guia_id
     where g.creado_en < now() - interval '14 days'
       and coalesce((select max(r.fecha) from public.reuniones r where r.grupo_id = g.id), '1900-01-01')
           < (select hoy from fechas) - 14
  ),
  -- Asistencia de los últimos 30 días contra los 30 anteriores, por grupo
  asis_grupo as (
    select r.grupo_id,
           sum(r.presentes) filter (where r.fecha >= (select hoy from fechas) - 30)::numeric
             / nullif(count(*) filter (where r.fecha >= (select hoy from fechas) - 30) * max(m.n), 0) as actual,
           sum(r.presentes) filter (where r.fecha < (select hoy from fechas) - 30 and r.fecha >= (select hoy from fechas) - 60)::numeric
             / nullif(count(*) filter (where r.fecha < (select hoy from fechas) - 30 and r.fecha >= (select hoy from fechas) - 60) * max(m.n), 0) as anterior
      from (select rr.id, rr.grupo_id, rr.fecha,
                   (select count(*) from public.asistencias a where a.reunion_id = rr.id and a.presente) as presentes
              from public.reuniones rr
             where rr.fecha >= (select hoy from fechas) - 60) r
      join mpg m on m.grupo_id = r.grupo_id
     group by r.grupo_id
  ),
  en_baja as (
    select g.id, g.nombre, g.red_id,
           round(a.actual * 100)::int as actual, round(a.anterior * 100)::int as anterior
      from asis_grupo a join grupos g on g.id = a.grupo_id
     where a.actual is not null and a.anterior is not null and a.anterior - a.actual >= 0.15
  ),
  -- Resumen por red (mes actual)
  redes_resumen as (
    select rd.id, rd.nombre,
           count(distinct g.id) as grupos,
           coalesce(sum(distinct_m.n), 0) as miembros,
           coalesce(sum(distinct_m.nuevos_mes), 0) as nuevos,
           (select round(100.0 * sum(r.presentes) / nullif(sum(m2.n), 0))
              from reus r join grupos g2 on g2.id = r.grupo_id join mpg m2 on m2.grupo_id = r.grupo_id
             where g2.red_id = rd.id and r.fecha >= (select mes_actual from fechas))::int as asistencia,
           (select count(*) from public.tarjetas_consolidacion t
             where t.red_id = rd.id and t.completada_en >= (select mes_actual from fechas)) as completadas
      from public.redes rd
      join grupos g on g.red_id = rd.id
      left join mpg distinct_m on distinct_m.grupo_id = g.id
     group by rd.id, rd.nombre
  ),
  -- Próximo evento con costo
  proximo as (
    select e.id, e.nombre, e.fecha_evento, e.moneda, e.costo_total, e.grupo_id, e.red_id,
           coalesce((select sum(p.monto_pagado) from public.pagos_evento p where p.evento_id = e.id), 0) as recaudado,
           case
             when e.grupo_id is not null then coalesce((select n from mpg where grupo_id = e.grupo_id), 0)
             when e.red_id is not null then coalesce((select sum(m.n) from mpg m join grupos g on g.id = m.grupo_id where g.red_id = e.red_id), 0)
             else coalesce((select sum(n) from mpg), 0)
           end as personas
      from public.eventos e
     where e.fecha_evento >= (select hoy from fechas) and e.costo_total > 0
     order by e.fecha_evento
     limit 1
  )
  select jsonb_build_object(
    'semanas', (select jsonb_agg(jsonb_build_object(
                  'semana', semana, 'presentes', presentes, 'esperados', esperados, 'reuniones', reuniones,
                  'pct', case when esperados > 0 then round(100.0 * presentes / esperados)::int end)
                  order by semana) from semanas),
    'sin_reunion', coalesce((select jsonb_agg(to_jsonb(x) order by x.ultima nulls first) from sin_reunion x), '[]'::jsonb),
    'en_baja', coalesce((select jsonb_agg(to_jsonb(x) order by x.actual) from en_baja x), '[]'::jsonb),
    'tarjetas_sin_fonovisita', (select count(*) from public.tarjetas_consolidacion t
                                 where not coalesce(t.fonovisita, false)
                                   and coalesce(t.estado, '') <> 'completada'
                                   and t.creado_en < now() - interval '3 days'),
    'pendientes', (select count(*) from public.profiles where estado = 'pendiente'),
    'alertas_faltas', (select count(*) from public.miembros_en_alerta(3)),
    'redes', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from redes_resumen x), '[]'::jsonb),
    'proximo_evento', (select to_jsonb(x) from proximo x),
    'totales', jsonb_build_object(
      'grupos', (select count(*) from grupos),
      'miembros', (select coalesce(sum(n), 0) from mpg),
      'nuevos_mes', (select coalesce(sum(nuevos_mes), 0) from mpg)
    )
  )
$$;

grant execute on function public.panel_pastoral() to authenticated;

notify pgrst, 'reload schema';
