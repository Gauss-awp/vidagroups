-- =====================================================================
-- VidaGroups · Etapa 17: rachas, logros del grupo y resumen del año
--   Todo se calcula con lo que ya se carga (asistencia, consolidación,
--   ofrenda). No agrega tablas. Respeta los permisos de cada uno.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rachas: reuniones seguidas que vino cada hermano (la actual y la mejor)
-- ---------------------------------------------------------------------
create or replace function public.rachas_grupo(p_grupo uuid)
returns table (miembro_id uuid, racha_actual int, mejor_racha int)
language sql stable security invoker set search_path = public as $$
  with
  r as (select id, fecha from public.reuniones where grupo_id = p_grupo and fecha <= current_date),
  m as (select id, creado_en::date as desde from public.miembros_grupo where grupo_id = p_grupo and activo),
  x as (
    select m.id as miembro_id, r.fecha, coalesce(a.presente, false) as presente,
           row_number() over (partition by m.id order by r.fecha) as n
      from m
      join r on r.fecha >= m.desde
      left join public.asistencias a on a.reunion_id = r.id and a.miembro_id = m.id
  ),
  -- Cada tramo de "vino" seguido forma una isla
  islas as (
    select miembro_id, count(*) as largo, max(n) as fin
      from (select x.*, n - row_number() over (partition by miembro_id order by n) as isla from x where presente) t
     group by miembro_id, isla
  ),
  ultimo as (select miembro_id, max(n) as n from x group by miembro_id)
  select u.miembro_id,
         coalesce((select i.largo from islas i where i.miembro_id = u.miembro_id and i.fin = u.n), 0)::int,
         coalesce((select max(i.largo) from islas i where i.miembro_id = u.miembro_id), 0)::int
    from ultimo u
$$;

-- ---------------------------------------------------------------------
-- Logros del mes de un grupo
-- ---------------------------------------------------------------------
create or replace function public.logros_grupo(p_grupo uuid)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  f as (select date_trunc('month', current_date)::date as mes),
  r as (
    select re.id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes
      from public.reuniones re
     where re.grupo_id = p_grupo and re.fecha <= current_date
  ),
  m as (select count(*) as n, count(*) filter (where creado_en >= (select mes from f)) as nuevos
          from public.miembros_grupo where grupo_id = p_grupo and activo),
  semanas as (select distinct date_trunc('week', fecha)::date as s from r),
  -- Semanas seguidas con reunión cargada, contando desde la última
  seguidas as (
    select count(*) as n
      from (select s, row_number() over (order by s desc) as k from semanas) t
     where s = date_trunc('week', (select max(fecha) from r))::date - ((k - 1) * 7)::int
  )
  select jsonb_build_object(
    'miembros', (select n from m),
    'nuevos_mes', (select nuevos from m),
    'reuniones_mes', (select count(*) from r where fecha >= (select mes from f)),
    'asistencia_mes', (select case when count(*) = 0 or (select n from m) = 0 then null
                                   else round(100.0 * sum(presentes) / (count(*) * (select n from m)))::int end
                         from r where fecha >= (select mes from f)),
    'record', (select jsonb_build_object('presentes', presentes, 'fecha', fecha) from r order by presentes desc, fecha desc limit 1),
    'record_es_del_mes', coalesce((select fecha >= (select mes from f) from r order by presentes desc, fecha desc limit 1), false),
    'completadas_mes', (select count(*) from public.tarjetas_consolidacion t
                         where t.grupo_id = p_grupo and t.completada_en >= (select mes from f)),
    'semanas_seguidas', (select n from seguidas),
    'c_mes', (select count(*) from public.asistencias a join r on r.id = a.reunion_id
               where a.consolidado and r.fecha >= (select mes from f))
  )
$$;

-- ---------------------------------------------------------------------
-- Resumen del año de un grupo
-- ---------------------------------------------------------------------
create or replace function public.resumen_anual_grupo(p_grupo uuid, p_anio int)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  r as (
    select re.id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.consolidado) as consol,
           (select count(*) from public.miembros_grupo m
             where m.grupo_id = p_grupo and m.activo and m.creado_en::date <= re.fecha) as esperados
      from public.reuniones re
     where re.grupo_id = p_grupo and extract(year from re.fecha) = p_anio and re.fecha <= current_date
  ),
  por_mes as (
    select extract(month from fecha)::int as mes, count(*) as reuniones,
           case when sum(esperados) > 0 then round(100.0 * sum(presentes) / sum(esperados))::int end as asistencia
      from r group by 1
  ),
  constantes as (
    select m.id, trim(m.nombre || ' ' || coalesce(m.apellido, '')) as nombre,
           count(*) filter (where a.presente) as vino, count(r.id) as total
      from public.miembros_grupo m
      join r on r.fecha >= m.creado_en::date
      left join public.asistencias a on a.reunion_id = r.id and a.miembro_id = m.id
     where m.grupo_id = p_grupo and m.activo
     group by m.id, m.nombre, m.apellido
  )
  select jsonb_build_object(
    'anio', p_anio,
    'reuniones', (select count(*) from r),
    'asistencia', (select case when sum(esperados) > 0 then round(100.0 * sum(presentes) / sum(esperados))::int end from r),
    'mejor_mes', (select jsonb_build_object('mes', mes, 'asistencia', asistencia) from por_mes where asistencia is not null order by asistencia desc, mes limit 1),
    'record', (select jsonb_build_object('presentes', presentes, 'fecha', fecha) from r order by presentes desc, fecha limit 1),
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'reuniones', reuniones, 'asistencia', asistencia) order by mes) from por_mes), '[]'::jsonb),
    'nuevos', (select count(*) from public.miembros_grupo m where m.grupo_id = p_grupo and extract(year from m.creado_en) = p_anio),
    'consolidados', (select count(*) from public.tarjetas_consolidacion t where t.grupo_id = p_grupo and extract(year from t.completada_en) = p_anio),
    'c_cargadas', (select coalesce(sum(consol), 0) from r),
    'miembros', (select count(*) from public.miembros_grupo m where m.grupo_id = p_grupo and m.activo),
    'constantes', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'vino', vino, 'total', total) order by (vino::numeric / total) desc, vino desc)
        from (select * from constantes where total >= 4 order by (vino::numeric / total) desc, vino desc limit 5) c
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.rachas_grupo(uuid) from public, anon;
revoke execute on function public.logros_grupo(uuid) from public, anon;
revoke execute on function public.resumen_anual_grupo(uuid, int) from public, anon;
grant execute on function public.rachas_grupo(uuid) to authenticated;
grant execute on function public.logros_grupo(uuid) to authenticated;
grant execute on function public.resumen_anual_grupo(uuid, int) to authenticated;

notify pgrst, 'reload schema';
