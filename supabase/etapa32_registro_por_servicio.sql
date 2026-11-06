-- =====================================================================
-- VidaGroups · Etapa 32: al registrarse, cada uno elige su servicio
--   (Guía, Guía Supervisor, Pastor, Encargado de red o Consolidación).
--   Quien aprueba ve qué pidió y la app le propone ese rol.
--   Además, el panel del Guía Supervisor muestra el Pos-encuentro y el
--   Reencuentro de las personas nuevas.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.profiles add column if not exists solicitud_rol text;

CREATE OR REPLACE FUNCTION public.copiar_solicitud_grupo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta jsonb;
  v_id text;
begin
  select raw_user_meta_data into v_meta from auth.users where id = new.id;
  v_id := v_meta ->> 'grupo_id';
  if v_id ~ '^[0-9a-fA-F-]{36}$' and exists (select 1 from public.groups where id = v_id::uuid and red_id is not distinct from new.red_id) then
    new.solicitud_grupo_id := v_id::uuid;
  end if;
  new.solicitud_grupo_nuevo := nullif(left(trim(coalesce(v_meta ->> 'grupo_nuevo', '')), 80), '');
  new.solicitud_rol := case when v_meta ->> 'rol_pedido' in ('guia', 'guia_supervisor', 'pastor', 'encargado', 'consolidacion') then v_meta ->> 'rol_pedido' end;
  new.solicitud_no_guia := coalesce((v_meta ->> 'no_guia')::boolean, false) or coalesce(new.solicitud_rol, 'guia') <> 'guia';
  return new;
end;
$function$;

drop function if exists public.elegir_solicitud_grupo(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.elegir_solicitud_grupo(p_grupo uuid, p_nuevo text, p_no_guia boolean DEFAULT false, p_rol text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles
     set solicitud_grupo_id = case when p_grupo is not null and exists (select 1 from public.groups g where g.id = p_grupo and g.red_id = profiles.red_id) then p_grupo end,
         solicitud_grupo_nuevo = case when p_grupo is null then nullif(left(trim(coalesce(p_nuevo, '')), 80), '') end,
         solicitud_rol = case when p_rol in ('guia', 'guia_supervisor', 'pastor', 'encargado', 'consolidacion') then p_rol else solicitud_rol end,
         solicitud_no_guia = coalesce(p_no_guia, false) or coalesce(p_rol, 'guia') <> 'guia'
   where id = auth.uid() and estado = 'pendiente';
  perform set_config('app.dev_switch', 'off', true);
end;
$function$;
revoke execute on function public.elegir_solicitud_grupo(uuid, text, boolean, text) from public, anon;
grant execute on function public.elegir_solicitud_grupo(uuid, text, boolean, text) to authenticated;

drop function if exists public.solicitudes_pendientes();
CREATE OR REPLACE FUNCTION public.solicitudes_pendientes()
 RETURNS TABLE(id uuid, nombre text, email text, red_id uuid, red text, creado_en timestamp with time zone, grupo_id uuid, grupo text, grupo_guias text, grupo_nuevo text, grupo_nuevo_existe uuid, no_guia boolean, rol_pedido text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select p.id, public.nombre_de_perfil(p.id), p.email, p.red_id, r.nombre, p.creado_en,
         p.solicitud_grupo_id, g.nombre,
         (select x.guias from public.grupos_para_registro(p.red_id) x where x.id = p.solicitud_grupo_id),
         p.solicitud_grupo_nuevo,
         (select g2.id from public.groups g2
           where g2.red_id = p.red_id and lower(trim(g2.nombre)) = lower(trim(p.solicitud_grupo_nuevo)) limit 1),
         p.solicitud_no_guia,
         p.solicitud_rol
    from public.profiles p
    left join public.redes r on r.id = p.red_id
    left join public.groups g on g.id = p.solicitud_grupo_id
   where p.estado = 'pendiente'
     and p.iglesia_id is not distinct from public.mi_iglesia()
     and (public.puede_aprobar_perfil(p.id) or (p.red_id is null and (public.es_administrador() or public.es_apostol())))
   order by lower(coalesce(g.nombre, p.solicitud_grupo_nuevo, 'zzz')), p.creado_en;
end;
$function$;
revoke execute on function public.solicitudes_pendientes() from public, anon;
grant execute on function public.solicitudes_pendientes() to authenticated;

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
        or public.es_cosupervisor(gr.id)
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
        from (select tc.id, tc.nombre, tc.gv_asignado, tc.fonovisita, tc.visita, tc.pilares, tc.pilar_1, tc.pilar_2, tc.pilar_3, tc.pilar_4, tc.pilar_5, tc.comenzo_gv, tc.encuentro, tc.pos_encuentro, tc.reencuentro, tc.creado_en
                from public.tarjetas_consolidacion tc join g on g.id = tc.grupo_id
               where coalesce(tc.estado, '') <> 'completada'
               order by tc.creado_en desc limit 20) t), '[]'::jsonb)
  )
$function$;

commit;

notify pgrst, 'reload schema';
