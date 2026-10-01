-- =====================================================================
-- VidaGroups · Etapa 6
--   1. Consolidador como responsabilidad (puede ser también Guía Supervisor)
--   2. El Guía Supervisor ve la consolidación de sus grupos
--   3. Panel del Guía Supervisor
--   4. Teléfono del perfil y cumpleaños de los miembros
--   5. Eliminar mi cuenta
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 4. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists telefono text;
alter table public.miembros_grupo add column if not exists cumpleanos date;

-- ---------------------------------------------------------------------
-- 1. Consolidadores por red
-- ---------------------------------------------------------------------
create table if not exists public.redes_consolidadores (
  red_id    uuid not null references public.redes(id) on delete cascade,
  perfil_id uuid not null references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (red_id, perfil_id)
);
alter table public.redes_consolidadores enable row level security;
revoke all on public.redes_consolidadores from anon;
grant select, insert, delete on public.redes_consolidadores to authenticated;

-- Quien hoy tiene el rol Consolidador pasa a tener la responsabilidad en su red
insert into public.redes_consolidadores (red_id, perfil_id)
select red_id, id from public.profiles
 where rol = 'consolidacion' and red_id is not null and estado = 'activo'
on conflict do nothing;

create or replace function public.es_consolidador_de(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_red is not null and public.estoy_activo() and (
    exists (select 1 from public.redes_consolidadores where red_id = p_red and perfil_id = auth.uid())
    or (public.mi_rol() = 'consolidacion' and public.mi_red() = p_red)
  )
$$;

drop policy if exists redes_consolidadores_select on public.redes_consolidadores;
create policy redes_consolidadores_select on public.redes_consolidadores
  for select to authenticated using (public.estoy_activo());

-- Los designan el Encargado, el Pastor de la red o el Apóstol
drop policy if exists redes_consolidadores_escritura on public.redes_consolidadores;
create policy redes_consolidadores_escritura on public.redes_consolidadores
  for all to authenticated
  using (public.administra_red(red_id))
  with check (public.administra_red(red_id));

-- ---------------------------------------------------------------------
-- 2. Políticas que usaban el rol Consolidador
-- ---------------------------------------------------------------------
drop policy if exists tarjetas_select on public.tarjetas_consolidacion;
create policy tarjetas_select on public.tarjetas_consolidacion
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or public.es_consolidador_de(red_id)
      or public.puede_gestionar_grupo(grupo_id)
    )
  );

drop policy if exists tarjetas_insert on public.tarjetas_consolidacion;
create policy tarjetas_insert on public.tarjetas_consolidacion
  for insert to authenticated
  with check (public.estoy_activo() and (public.administra_red(red_id) or public.es_consolidador_de(red_id)));

drop policy if exists tarjetas_update on public.tarjetas_consolidacion;
create policy tarjetas_update on public.tarjetas_consolidacion
  for update to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id) or public.es_consolidador_de(red_id) or public.puede_gestionar_grupo(grupo_id)
    )
  )
  with check (
    public.estoy_activo() and (
      public.administra_red(red_id) or public.es_consolidador_de(red_id) or public.puede_gestionar_grupo(grupo_id)
    )
  );

drop policy if exists tarjetas_delete on public.tarjetas_consolidacion;
create policy tarjetas_delete on public.tarjetas_consolidacion
  for delete to authenticated
  using (public.estoy_activo() and (public.administra_red(red_id) or public.es_consolidador_de(red_id)));

drop policy if exists grupos_select on public.groups;
create policy grupos_select on public.groups
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or guia_id = auth.uid()
      or supervisor_id = auth.uid()
      or public.es_subordinado(guia_id)
      or public.es_coguia(id)
      or public.es_consolidador_de(red_id)
    )
  );

drop policy if exists perfiles_select on public.profiles;
create policy perfiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.es_apostol()
    or (public.estoy_activo() and (
          public.administra_red(red_id)
          or public.es_subordinado(id)
          or id in (select public.superiores(auth.uid()))
          or public.es_consolidador_de(red_id)
          or (red_id is null and public.es_pastor())
    ))
  );

-- Guía y supervisor solo marcan el avance de la tarjeta (si existe el control de la auditoría)
create or replace function public.limitar_edicion_guia_tarjeta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_permitidos text[] := array['fonovisita','visita','pilares','pilar_1','pilar_2','pilar_3','pilar_4','pilar_5',
                               'comenzo_gv','encuentro','observacion','notas'];
begin
  if auth.uid() is null
     or current_setting('app.dev_switch', true) = 'on'
     or public.administra_red(old.red_id)
     or public.es_consolidador_de(old.red_id) then
    return new;
  end if;
  if (to_jsonb(new) - v_permitidos) is distinct from (to_jsonb(old) - v_permitidos) then
    raise exception 'Solo podés marcar el avance de la tarjeta';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Panel del Guía Supervisor (respeta permisos)
-- ---------------------------------------------------------------------
create or replace function public.panel_supervisor()
returns jsonb
language sql stable security invoker set search_path = public as $$
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
        from (select tc.id, tc.nombre, tc.gv_asignado, tc.fonovisita, tc.visita, tc.pilares, tc.comenzo_gv, tc.encuentro, tc.creado_en
                from public.tarjetas_consolidacion tc join g on g.id = tc.grupo_id
               where coalesce(tc.estado, '') <> 'completada'
               order by tc.creado_en desc limit 20) t), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- 5. Eliminar mi cuenta
-- ---------------------------------------------------------------------
create or replace function public.eliminar_mi_cuenta()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'Tenés que iniciar sesión para eliminar tu cuenta';
  end if;
  if exists (select 1 from public.groups where guia_id = v_id) then
    raise exception 'Sos guía de un grupo. Antes de eliminar tu cuenta, pedile al encargado de tu red que asigne otro guía.';
  end if;

  -- Operación del sistema: saltea los controles de roles para limpiar referencias
  perform set_config('app.dev_switch', 'on', true);

  delete from public.relaciones_supervision where guia_id = v_id or supervisor_id = v_id;
  update public.profiles set supervisor_id = null where supervisor_id = v_id;
  update public.tarjetas_consolidacion set creado_por = null where creado_por = v_id;

  -- Borra el usuario; el perfil y sus responsabilidades se borran en cascada
  delete from auth.users where id = v_id;
end;
$$;

-- Permisos de las funciones nuevas
revoke execute on function public.es_consolidador_de(uuid) from public, anon;
revoke execute on function public.panel_supervisor() from public, anon;
revoke execute on function public.eliminar_mi_cuenta() from public, anon;
revoke execute on function public.limitar_edicion_guia_tarjeta() from public, anon, authenticated;
grant execute on function public.es_consolidador_de(uuid) to authenticated;
grant execute on function public.panel_supervisor() to authenticated;
grant execute on function public.eliminar_mi_cuenta() to authenticated;

commit;

notify pgrst, 'reload schema';
