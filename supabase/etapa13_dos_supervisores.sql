-- =====================================================================
-- VidaGroups · Etapa 13: un grupo puede tener dos Guías Supervisores
--   El supervisor principal sigue siendo el supervisor del guía.
--   El segundo se agrega por grupo (por ejemplo, "Flor y Samu").
--   El segundo supervisor ve y acompaña el grupo igual que el principal:
--   su panel, la asistencia, la consolidación y las notas pastorales.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

create table if not exists public.grupo_supervisores (
  grupo_id  uuid not null references public.groups(id) on delete cascade,
  perfil_id uuid not null references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);

-- Solo Guías Supervisores, de la misma red, y distinto del principal
create or replace function public.validar_cosupervisor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text;
  v_red uuid;
  v_grupo_red uuid;
  v_principal uuid;
begin
  select rol, red_id into v_rol, v_red from public.profiles where id = new.perfil_id;
  select red_id, supervisor_id into v_grupo_red, v_principal from public.groups where id = new.grupo_id;
  if v_rol is distinct from 'guia_supervisor' then
    raise exception 'El segundo supervisor tiene que ser un Guía Supervisor';
  end if;
  if v_red is distinct from v_grupo_red then
    raise exception 'El segundo supervisor tiene que ser de la misma red que el grupo';
  end if;
  if new.perfil_id = v_principal then
    raise exception 'Esa persona ya es el supervisor principal del grupo';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validar_cosupervisor on public.grupo_supervisores;
create trigger trg_validar_cosupervisor before insert or update on public.grupo_supervisores
  for each row execute function public.validar_cosupervisor();

-- Historial de liderazgo: el segundo supervisor también queda registrado
create or replace function public.historial_cosupervisor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
    values (new.grupo_id, 'supervisor', new.perfil_id, public.nombre_de_perfil(new.perfil_id));
    return new;
  else
    update public.historial_liderazgo set hasta = now()
     where grupo_id = old.grupo_id and rol = 'supervisor' and perfil_id = old.perfil_id and hasta is null;
    return old;
  end if;
end;
$$;
drop trigger if exists trg_historial_cosupervisor on public.grupo_supervisores;
create trigger trg_historial_cosupervisor after insert or delete on public.grupo_supervisores
  for each row execute function public.historial_cosupervisor();

-- El registro del supervisor principal no cierra el del segundo (y al revés)
create or replace function public.registrar_liderazgo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.guia_id is distinct from old.guia_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'guia' and hasta is null;
    if new.guia_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'guia', new.guia_id, public.nombre_de_perfil(new.guia_id));
    end if;
  end if;

  if tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'supervisor' and hasta is null
       and perfil_id is not distinct from (case when tg_op = 'INSERT' then null else old.supervisor_id end);
    if new.supervisor_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'supervisor', new.supervisor_id, public.nombre_de_perfil(new.supervisor_id));
    end if;
  end if;
  return new;
end;
$$;

-- ¿Soy el segundo supervisor de este grupo?
create or replace function public.es_cosupervisor(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = auth.uid()
  )
$$;

-- ¿Es guía de algún grupo que superviso como segundo supervisor?
create or replace function public.es_guia_cosupervisado(p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
      join public.grupo_supervisores gs on gs.grupo_id = g.id
     where gs.perfil_id = auth.uid() and g.guia_id = p_perfil
  )
$$;

alter table public.grupo_supervisores enable row level security;
revoke all on public.grupo_supervisores from anon;
grant select, insert, delete on public.grupo_supervisores to authenticated;

drop policy if exists grupo_supervisores_select on public.grupo_supervisores;
create policy grupo_supervisores_select on public.grupo_supervisores
  for select to authenticated using (public.puede_gestionar_grupo(grupo_id));

drop policy if exists grupo_supervisores_escritura on public.grupo_supervisores;
create policy grupo_supervisores_escritura on public.grupo_supervisores
  for all to authenticated
  using (public.administra_red((select red_id from public.groups where id = grupo_id)))
  with check (public.administra_red((select red_id from public.groups where id = grupo_id)));

drop policy if exists solo_mi_iglesia on public.grupo_supervisores;
create policy solo_mi_iglesia on public.grupo_supervisores as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

-- ---------------------------------------------------------------------
-- Permisos: el segundo supervisor puede lo mismo que el principal
-- ---------------------------------------------------------------------
create or replace function public.puede_gestionar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         public.administra_red(g.red_id)
         or g.guia_id = auth.uid()
         or g.supervisor_id = auth.uid()
         or public.es_subordinado(g.guia_id)
         or public.es_coguia(g.id)
         or public.es_cosupervisor(g.id)
       )
  )
$$;

create or replace function public.puede_ver_notas(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         g.guia_id = auth.uid()
         or public.es_coguia(g.id)
         or (g.supervisor_id = auth.uid() and public.mi_rol() = 'guia_supervisor')
         or (public.es_cosupervisor(g.id) and public.mi_rol() = 'guia_supervisor')
       )
  )
$$;

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
      or public.es_cosupervisor(id)
      or public.es_consolidador_de(red_id)
    )
  );

drop policy if exists grupos_update on public.groups;
create policy grupos_update on public.groups
  for update to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id) or guia_id = auth.uid() or supervisor_id = auth.uid()
      or public.es_subordinado(guia_id) or public.es_coguia(id) or public.es_cosupervisor(id)
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
          or public.es_guia_cosupervisado(id)
          or public.es_consolidador_de(red_id)
          or (red_id is null and public.es_pastor())
    ))
  );

-- ---------------------------------------------------------------------
-- Paneles: el grupo aparece en el panel de los dos supervisores
-- ---------------------------------------------------------------------
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
        from (select tc.id, tc.nombre, tc.gv_asignado, tc.fonovisita, tc.visita, tc.pilares, tc.pilar_1, tc.pilar_2, tc.pilar_3, tc.pilar_4, tc.pilar_5, tc.comenzo_gv, tc.encuentro, tc.creado_en
                from public.tarjetas_consolidacion tc join g on g.id = tc.grupo_id
               where coalesce(tc.estado, '') <> 'completada'
               order by tc.creado_en desc limit 20) t), '[]'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION public.panel_supervisores()
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
    union
    select gr.id, gr.nombre, gs.perfil_id, gr.guia_id
      from public.grupo_supervisores gs
      join public.groups gr on gr.id = gs.grupo_id
     where gs.perfil_id in (select id from sup)
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
$function$;

-- ---------------------------------------------------------------------
-- Planilla de equipo: columna opcional "Correo del 2º supervisor"
-- ---------------------------------------------------------------------
alter table public.preaprobaciones add column if not exists supervisor2_email text;

create or replace function public.normalizar_preaprobacion()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  new.supervisor_email := nullif(lower(trim(coalesce(new.supervisor_email, ''))), '');
  new.supervisor2_email := nullif(lower(trim(coalesce(new.supervisor2_email, ''))), '');
  new.grupo := nullif(trim(coalesce(new.grupo, '')), '');
  return new;
end;
$$;

create or replace function public.aplicar_preaprobacion_perfil(p_perfil uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_perfil public.profiles%rowtype;
  v_pre    public.preaprobaciones%rowtype;
  v_sup    uuid;
begin
  select * into v_perfil from public.profiles where id = p_perfil;
  if not found then return false; end if;

  select * into v_pre from public.preaprobaciones
   where email = lower(v_perfil.email) and aplicado_en is null
     and public.iglesia_de_red(red_id) = v_perfil.iglesia_id
   order by creado_en desc limit 1;
  if not found then return false; end if;

  -- Operación del sistema: saltea el control de roles
  perform set_config('app.dev_switch', 'on', true);

  -- 1. Aprobado, con su rol y su red
  update public.profiles
     set estado = 'activo', rol = v_pre.rol, red_id = v_pre.red_id,
         nombre = coalesce(nullif(nombre, ''), split_part(coalesce(v_pre.nombre, ''), ' ', 1))
   where id = p_perfil;

  -- 2. Su supervisor, si ya tiene cuenta
  if v_pre.supervisor_email is not null then
    select id into v_sup from public.profiles
     where lower(email) = v_pre.supervisor_email and iglesia_id = v_perfil.iglesia_id and id <> p_perfil;
    if v_sup is not null then
      update public.profiles set supervisor_id = v_sup where id = p_perfil;
    end if;
  end if;

  -- 3. Los que lo esperaban como supervisor
  update public.profiles p
     set supervisor_id = p_perfil
    from public.preaprobaciones x
   where x.red_id = v_pre.red_id and x.supervisor_email = lower(v_perfil.email)
     and x.perfil_id = p.id and p.supervisor_id is null and p.id <> p_perfil;

  -- 4. El grupo que guía (si no existe, se crea)
  if v_pre.grupo is not null then
    update public.groups set guia_id = p_perfil
     where red_id = v_pre.red_id and lower(trim(nombre)) = lower(v_pre.grupo);
    if not found then
      insert into public.groups (nombre, red_id, guia_id) values (v_pre.grupo, v_pre.red_id, p_perfil);
    end if;
  end if;

  -- 4b. Segundo supervisor de su(s) grupo(s), si ya tiene cuenta
  if v_pre.supervisor2_email is not null then
    insert into public.grupo_supervisores (grupo_id, perfil_id)
    select g.id, s.id
      from public.groups g
      join public.profiles s on lower(s.email) = v_pre.supervisor2_email and s.iglesia_id = v_perfil.iglesia_id
     where g.guia_id = p_perfil and s.id <> coalesce(g.supervisor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    on conflict do nothing;
  end if;

  -- 4c. Los grupos que lo esperaban como segundo supervisor
  insert into public.grupo_supervisores (grupo_id, perfil_id)
  select g.id, p_perfil
    from public.preaprobaciones x
    join public.groups g on g.guia_id = x.perfil_id
   where x.red_id = v_pre.red_id and x.supervisor2_email = lower(v_perfil.email)
     and x.perfil_id is not null and coalesce(g.supervisor_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_perfil
  on conflict do nothing;

  -- 5. Consolidador/a de la red
  if v_pre.consolidador then
    insert into public.redes_consolidadores (red_id, perfil_id) values (v_pre.red_id, p_perfil)
    on conflict do nothing;
  end if;

  update public.preaprobaciones set perfil_id = p_perfil, aplicado_en = now() where id = v_pre.id;
  perform set_config('app.dev_switch', 'off', true);
  return true;
end;
$$;

-- Permisos de las funciones nuevas
revoke execute on function public.es_cosupervisor(uuid) from public, anon;
revoke execute on function public.es_guia_cosupervisado(uuid) from public, anon;
revoke execute on function public.validar_cosupervisor() from public, anon, authenticated;
revoke execute on function public.historial_cosupervisor() from public, anon, authenticated;
revoke execute on function public.aplicar_preaprobacion_perfil(uuid) from public, anon, authenticated;
grant execute on function public.es_cosupervisor(uuid) to authenticated;
grant execute on function public.es_guia_cosupervisado(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
