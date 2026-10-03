-- =====================================================================
-- VidaGroups · Etapa 10: planilla de asistencia de los grupos
--   1. Datos del grupo para el encabezado (día y horario, barrio, dirección, líder supervisor)
--   2. Datos de cada reunión: nota de la semana, ofrenda, material y quién lo compartió
--   3. Consolidación semanal de cada ausente ("C" + motivo)
--   4. Rol de cada miembro dentro del grupo: guía o equipo (timoteos, anfitrión, colaboradores)
--   5. El panel del supervisor muestra los 5 pilares por separado
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

alter table public.groups
  add column if not exists dia_horario text,
  add column if not exists barrio text,
  add column if not exists direccion text,
  add column if not exists lider_supervisor text;

alter table public.reuniones
  add column if not exists ofrenda numeric(12, 2),
  add column if not exists material text,
  add column if not exists compartio text;

alter table public.asistencias
  add column if not exists consolidado boolean not null default false,
  add column if not exists motivo text;

alter table public.miembros_grupo
  add column if not exists rol_equipo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'miembros_rol_equipo_valido') then
    alter table public.miembros_grupo
      add constraint miembros_rol_equipo_valido check (rol_equipo is null or rol_equipo in ('guia', 'equipo'));
  end if;
end;
$$;

-- Los pilares de la consolidación marcados uno por uno también cuentan como "pilares" completos
update public.tarjetas_consolidacion
   set pilar_1 = true, pilar_2 = true, pilar_3 = true, pilar_4 = true, pilar_5 = true
 where pilares and not (coalesce(pilar_1, false) or coalesce(pilar_2, false) or coalesce(pilar_3, false)
                        or coalesce(pilar_4, false) or coalesce(pilar_5, false));

CREATE OR REPLACE FUNCTION public.panel_supervisor()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  g as (
    select gr.id, gr.nombre, gr.guia_id, gr.red_id
      from public.groups gr
     where gr.supervisor_id = auth.uid() or public.es_subordinado(gr.guia_id) or gr.guia_id = auth.uid()
  ),
  m as (
    select grupo_id, count(*) as n,
           count(*) filter (where creado_en >= (select mes from f)) as nuevos
      from public.miembros_grupo where activo group by grupo_id
  ),
  r as (
    select re.grupo_id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes
      from public.reuniones re
     where re.fecha >= (select mes_ant from f)
  ),
  asis as (
    select g.id as grupo_id,
           (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id) as ultima,
           sum(r.presentes) filter (where r.fecha >= (select mes from f)) as pres_mes,
           count(r.fecha) filter (where r.fecha >= (select mes from f)) as reu_mes,
           sum(r.presentes) filter (where r.fecha < (select mes from f)) as pres_ant,
           count(r.fecha) filter (where r.fecha < (select mes from f)) as reu_ant
      from g left join r on r.grupo_id = g.id
     group by g.id
  ),
  alertas as (select grupo_id, count(*) as n from public.miembros_en_alerta(3) group by grupo_id),
  tarj as (
    select t.grupo_id, count(*) filter (where not coalesce(t.comenzo_gv, false)) as sin_empezar
      from public.tarjetas_consolidacion t
     where coalesce(t.estado, '') <> 'completada'
     group by t.grupo_id
  ),
  filas as (
    select g.id, g.nombre,
           nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '') as guia,
           p.telefono as guia_telefono,
           g.guia_id = auth.uid() as es_mio,
           coalesce(m.n, 0) as miembros,
           coalesce(m.nuevos, 0) as nuevos,
           a.ultima as ultima_reunion,
           case when a.reu_mes * coalesce(m.n, 0) > 0 then round(100.0 * a.pres_mes / (a.reu_mes * m.n))::int end as asistencia,
           case when a.reu_ant * coalesce(m.n, 0) > 0 then round(100.0 * a.pres_ant / (a.reu_ant * m.n))::int end as asistencia_anterior,
           coalesce(al.n, 0) as alertas,
           coalesce(tj.sin_empezar, 0) as sin_empezar,
           (select jsonb_build_object(
                     'id', e.id, 'nombre', e.nombre, 'moneda', e.moneda, 'costo', e.costo_total,
                     'recaudado', coalesce((select sum(pe.monto_pagado)
                                              from public.pagos_evento pe
                                              join public.miembros_grupo mm on mm.id = pe.miembro_id
                                             where pe.evento_id = e.id and mm.grupo_id = g.id), 0))
              from public.eventos e
             where e.fecha_evento >= (select hoy from f) and e.costo_total > 0
               and (e.grupo_id = g.id or (e.grupo_id is null and (e.red_id is null or e.red_id = g.red_id)))
             order by e.fecha_evento
             limit 1) as evento
      from g
      left join m on m.grupo_id = g.id
      left join asis a on a.grupo_id = g.id
      left join alertas al on al.grupo_id = g.id
      left join tarj tj on tj.grupo_id = g.id
      left join public.profiles p on p.id = g.guia_id
  )
  select jsonb_build_object(
    'grupos', coalesce((select jsonb_agg(to_jsonb(x) order by x.asistencia nulls first, x.nombre) from filas x), '[]'::jsonb),
    'cumples', coalesce((
      select jsonb_agg(jsonb_build_object('id', mm.id, 'nombre', trim(mm.nombre || ' ' || coalesce(mm.apellido, '')),
                                          'grupo', g.nombre, 'dia', to_char(mm.cumpleanos, 'DD/MM'))
                       order by to_char(mm.cumpleanos, 'MMDD'))
        from public.miembros_grupo mm join g on g.id = mm.grupo_id
       where mm.activo and mm.cumpleanos is not null
         and case
               when to_char((select hoy from f), 'MMDD') <= to_char((select hoy from f) + 6, 'MMDD')
                 then to_char(mm.cumpleanos, 'MMDD') between to_char((select hoy from f), 'MMDD') and to_char((select hoy from f) + 6, 'MMDD')
               else to_char(mm.cumpleanos, 'MMDD') >= to_char((select hoy from f), 'MMDD')
                 or to_char(mm.cumpleanos, 'MMDD') <= to_char((select hoy from f) + 6, 'MMDD')
             end), '[]'::jsonb),
    'tarjetas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.creado_en desc)
        from (select tc.id, tc.nombre, tc.gv_asignado, tc.fonovisita, tc.visita, tc.pilares, tc.pilar_1, tc.pilar_2, tc.pilar_3, tc.pilar_4, tc.pilar_5, tc.comenzo_gv, tc.encuentro, tc.creado_en
                from public.tarjetas_consolidacion tc join g on g.id = tc.grupo_id
               where coalesce(tc.estado, '') <> 'completada'
               order by tc.creado_en desc limit 20) t), '[]'::jsonb)
  )
$function$;

commit;

notify pgrst, 'reload schema';
