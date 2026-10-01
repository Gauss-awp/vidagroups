-- =====================================================================
-- VidaGroups · Etapa 5: reporte mensual
--   + arreglo: tarjetas que no se conectaron con su grupo
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- (Si todavía no corriste etapa4_consolidacion.sql, corrélo antes que este.)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Arreglo: conectar tarjetas con su grupo sin importar mayúsculas ni espacios
-- ---------------------------------------------------------------------

update public.tarjetas_consolidacion t
   set grupo_id = g.id
  from public.groups g
 where t.grupo_id is null
   and t.gv_asignado is not null
   and lower(trim(g.nombre)) = lower(trim(t.gv_asignado))
   and (t.red_id is null or g.red_id = t.red_id);

create or replace function public.sincronizar_gv_tarjeta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nombre_anterior text := case when tg_op = 'UPDATE' then old.gv_asignado end;
  v_grupo_anterior uuid := case when tg_op = 'UPDATE' then old.grupo_id end;
begin
  if new.grupo_id is distinct from v_grupo_anterior and new.grupo_id is not null then
    select nombre into new.gv_asignado from public.groups where id = new.grupo_id;
  elsif new.gv_asignado is distinct from v_nombre_anterior then
    if coalesce(trim(new.gv_asignado), '') = '' then
      new.gv_asignado := null;
      new.grupo_id := null;
    elsif not exists (select 1 from public.groups where id = new.grupo_id and lower(trim(nombre)) = lower(trim(new.gv_asignado))) then
      select id into new.grupo_id
        from public.groups
       where lower(trim(nombre)) = lower(trim(new.gv_asignado))
         and (new.red_id is null or red_id = new.red_id)
       order by creado_en
       limit 1;
    end if;
  elsif new.grupo_id is null and v_grupo_anterior is not null then
    new.gv_asignado := null;
  end if;

  if new.estado = 'completada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'completada' then
      new.completada_en := now();
    end if;
  else
    new.completada_en := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Reporte mensual por grupo. Respeta permisos: cada uno ve sus grupos.
-- ---------------------------------------------------------------------

create or replace function public.reporte_mensual(p_anio int, p_mes int)
returns table (
  grupo_id uuid, grupo text, red_id uuid, red text, guia text,
  miembros int, nuevos int, reuniones int, asistencia_pct int, habitos_pct int,
  tarjetas_nuevas int, completadas int
)
language sql stable security invoker set search_path = public as $$
  with rango as (
    select make_date(p_anio, p_mes, 1) as desde,
           (make_date(p_anio, p_mes, 1) + interval '1 month')::date as hasta
  ),
  m as (
    select mg.grupo_id,
           count(*) filter (where mg.activo) as miembros,
           count(*) filter (where mg.creado_en >= r.desde and mg.creado_en < r.hasta) as nuevos
      from public.miembros_grupo mg, rango r
     group by mg.grupo_id
  ),
  re as (
    select reu.grupo_id,
           count(distinct reu.id) as reuniones,
           count(a.miembro_id) filter (where a.presente) as presentes
      from public.reuniones reu
      cross join rango r
      left join public.asistencias a on a.reunion_id = reu.id
     where reu.fecha >= r.desde and reu.fecha < r.hasta
     group by reu.grupo_id
  ),
  hab as (
    select h.grupo_id,
           count(*) filter (where rd.completado) as hechos,
           count(distinct (rd.habito_id, rd.fecha)) as dias
      from public.registros_diarios rd
      join public.habitos h on h.id = rd.habito_id
      cross join rango r
     where rd.fecha >= r.desde and rd.fecha < r.hasta
     group by h.grupo_id
  ),
  t as (
    select tc.grupo_id,
           count(*) filter (where tc.creado_en >= r.desde and tc.creado_en < r.hasta) as nuevas,
           count(*) filter (where tc.completada_en >= r.desde and tc.completada_en < r.hasta) as completadas
      from public.tarjetas_consolidacion tc, rango r
     where tc.grupo_id is not null
     group by tc.grupo_id
  )
  select g.id, g.nombre, g.red_id, rd.nombre,
         nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''),
         coalesce(m.miembros, 0)::int,
         coalesce(m.nuevos, 0)::int,
         coalesce(re.reuniones, 0)::int,
         case when coalesce(re.reuniones, 0) * coalesce(m.miembros, 0) > 0
              then round(100.0 * re.presentes / (re.reuniones * m.miembros))::int end,
         case when coalesce(hab.dias, 0) * coalesce(m.miembros, 0) > 0
              then least(100, round(100.0 * hab.hechos / (hab.dias * m.miembros)))::int end,
         coalesce(t.nuevas, 0)::int,
         coalesce(t.completadas, 0)::int
    from public.groups g
    left join m   on m.grupo_id = g.id
    left join re  on re.grupo_id = g.id
    left join hab on hab.grupo_id = g.id
    left join t   on t.grupo_id = g.id
    left join public.redes rd on rd.id = g.red_id
    left join public.profiles p on p.id = g.guia_id
   order by rd.nombre nulls last, g.nombre
$$;

grant execute on function public.reporte_mensual(int, int) to authenticated;

commit;

notify pgrst, 'reload schema';
