-- =====================================================================
-- VidaGroups · Etapa 12: sección "Supervisores" del Panel Pastoral
--   Una tarjeta por Guía Supervisor con cómo vienen sus grupos, para que
--   los pastores de la red vean a qué supervisor acompañar.
--   Respeta permisos: cada pastor ve los supervisores de sus redes.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

create or replace function public.panel_supervisores()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  sup as (
    select p.id, p.email, p.telefono,
           coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email) as nombre
      from public.profiles p
     where p.rol = 'guia_supervisor' and p.estado = 'activo'
  ),
  g as (
    select gr.id, gr.nombre, gr.supervisor_id, gr.guia_id
      from public.groups gr
     where gr.supervisor_id in (select id from sup)
  ),
  m as (
    select grupo_id, count(*) as n from public.miembros_grupo where activo group by grupo_id
  ),
  r as (
    select re.id, re.grupo_id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.consolidado) as consol
      from public.reuniones re
     where re.grupo_id in (select id from g) and re.fecha >= (select mes_ant from f)
  ),
  alertas as (
    select grupo_id, count(*) as n from public.miembros_en_alerta(3) group by grupo_id
  ),
  por_grupo as (
    select g.id, g.nombre, g.supervisor_id,
           nullif(trim(coalesce(pg.nombre, '') || ' ' || coalesce(pg.apellido, '')), '') as guia,
           coalesce(m.n, 0) as miembros,
           (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id) as ultima,
           coalesce(sum(r.presentes) filter (where r.fecha >= (select mes from f)), 0) as pres_mes,
           count(r.id) filter (where r.fecha >= (select mes from f)) * coalesce(m.n, 0) as esp_mes,
           coalesce(sum(r.presentes) filter (where r.fecha < (select mes from f)), 0) as pres_ant,
           count(r.id) filter (where r.fecha < (select mes from f)) * coalesce(m.n, 0) as esp_ant,
           coalesce(sum(r.consol) filter (where r.fecha >= (select hoy from f) - 7), 0) as c_semana,
           coalesce(max(al.n), 0) as alertas,
           (select count(*) from public.tarjetas_consolidacion t
             where t.grupo_id = g.id and not coalesce(t.comenzo_gv, false)
               and coalesce(t.estado, '') <> 'completada') as sin_empezar
      from g
      left join m on m.grupo_id = g.id
      left join r on r.grupo_id = g.id
      left join alertas al on al.grupo_id = g.id
      left join public.profiles pg on pg.id = g.guia_id
     group by g.id, g.nombre, g.supervisor_id, pg.nombre, pg.apellido, m.n
  ),
  por_sup as (
    select s.id, s.nombre, s.email, s.telefono,
           count(pg.id) as grupos,
           coalesce(sum(pg.miembros), 0) as miembros,
           case when sum(pg.esp_mes) > 0 then round(100.0 * sum(pg.pres_mes) / sum(pg.esp_mes))::int end as asistencia,
           case when sum(pg.esp_ant) > 0 then round(100.0 * sum(pg.pres_ant) / sum(pg.esp_ant))::int end as asistencia_anterior,
           count(pg.id) filter (where pg.miembros > 0 and (pg.ultima is null or pg.ultima < (select hoy from f) - 14)) as sin_reunion,
           coalesce(sum(pg.sin_empezar), 0) as sin_empezar,
           coalesce(sum(pg.c_semana), 0) as c_semana,
           coalesce(sum(pg.alertas), 0) as alertas,
           coalesce(jsonb_agg(jsonb_build_object(
             'id', pg.id, 'nombre', pg.nombre, 'guia', pg.guia, 'miembros', pg.miembros, 'ultima', pg.ultima,
             'asistencia', case when pg.esp_mes > 0 then round(100.0 * pg.pres_mes / pg.esp_mes)::int end,
             'alertas', pg.alertas,
             'sin_reunion', pg.miembros > 0 and (pg.ultima is null or pg.ultima < (select hoy from f) - 14)
           ) order by pg.nombre) filter (where pg.id is not null), '[]'::jsonb) as lista_grupos
      from sup s
      left join por_grupo pg on pg.supervisor_id = s.id
     group by s.id, s.nombre, s.email, s.telefono
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by (x.sin_reunion + x.alertas) desc, x.asistencia nulls first, x.nombre), '[]'::jsonb)
    from por_sup x
   where x.grupos > 0
$$;

revoke execute on function public.panel_supervisores() from public, anon;
grant execute on function public.panel_supervisores() to authenticated;

notify pgrst, 'reload schema';
