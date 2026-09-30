-- =====================================================================
-- VidaGroups · Etapa 1 (parte A): redes, aprobación de registros y seguridad
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- Todo corre dentro de una transacción: si algo falla, no se aplica nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. TABLAS NUEVAS
-- ---------------------------------------------------------------------

create table if not exists public.redes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  creado_en timestamptz not null default now()
);

-- Pastores asignados a cada red (ven todo lo de esas redes)
create table if not exists public.redes_pastores (
  red_id    uuid not null references public.redes(id) on delete cascade,
  perfil_id uuid not null references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (red_id, perfil_id)
);

-- Encargados de cada red (responsabilidad que se suma al rol)
create table if not exists public.redes_encargados (
  red_id    uuid not null references public.redes(id) on delete cascade,
  perfil_id uuid not null references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (red_id, perfil_id)
);

insert into public.redes (nombre) values
  ('Misión Joven'), ('Red de Hombres'), ('Red de Mujeres'), ('Revolución Kids')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- 2. COLUMNAS NUEVAS
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists red_id uuid references public.redes(id) on delete set null;
-- Los perfiles que ya existen quedan activos; los nuevos arrancan pendientes
alter table public.profiles add column if not exists estado text not null default 'activo';
alter table public.profiles alter column estado set default 'pendiente';
alter table public.profiles drop constraint if exists profiles_estado_check;
alter table public.profiles add constraint profiles_estado_check check (estado in ('pendiente', 'activo', 'inactivo'));

alter table public.groups add column if not exists red_id uuid references public.redes(id) on delete set null;
alter table public.tarjetas_consolidacion add column if not exists red_id uuid references public.redes(id) on delete set null;
alter table public.eventos_globales add column if not exists red_id uuid references public.redes(id) on delete set null;

create index if not exists profiles_red_idx on public.profiles(red_id);
create index if not exists groups_red_idx on public.groups(red_id);
create index if not exists tarjetas_red_idx on public.tarjetas_consolidacion(red_id);

-- Roles válidos. 'mision_joven' queda solo mientras se actualiza la app (parte B).
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol in ('apostol', 'pastor', 'guia_supervisor', 'consolidacion', 'guia', 'mision_joven', 'supervisor'));

-- ---------------------------------------------------------------------
-- 3. FUNCIONES DE PERMISOS
-- ---------------------------------------------------------------------

create or replace function public.rango_rol(p_rol text)
returns int language sql immutable as $$
  select case p_rol
    when 'apostol' then 4
    when 'pastor' then 3
    when 'guia_supervisor' then 2
    when 'consolidacion' then 2
    when 'mision_joven' then 2
    when 'supervisor' then 2
    else 1
  end
$$;

create or replace function public.mi_red()
returns uuid language sql stable security definer set search_path = public as $$
  select red_id from public.profiles where id = auth.uid()
$$;

create or replace function public.estoy_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select estado = 'activo' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.es_apostol()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'apostol' and estado = 'activo' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.es_pastor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'pastor' and estado = 'activo' from public.profiles where id = auth.uid()), false)
$$;

-- Apóstol, o Pastor asignado a esa red
create or replace function public.es_pastor_de_red(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_apostol()
      or (p_red is not null and public.es_pastor() and exists (
            select 1 from public.redes_pastores where red_id = p_red and perfil_id = auth.uid()))
$$;

-- Apóstol, Pastor de la red o Encargado de la red
create or replace function public.administra_red(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_pastor_de_red(p_red)
      or (p_red is not null and public.estoy_activo() and (
            exists (select 1 from public.redes_encargados where red_id = p_red and perfil_id = auth.uid())
            -- Transición: el rol viejo "mision_joven" funciona como encargado de su red
            or (public.mi_rol() = 'mision_joven' and public.mi_red() = p_red)))
$$;

create or replace function public.red_de_perfil(p_perfil uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select red_id from public.profiles where id = p_perfil
$$;

create or replace function public.es_coguia(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grupo_guias where grupo_id = p_grupo and guia_id = auth.uid())
$$;

-- ¿Puedo ver y gestionar este grupo?
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
       )
  )
$$;

-- ¿Soy guía del grupo al que está asignada esta tarjeta? (hoy se conecta por nombre)
create or replace function public.es_guia_de_tarjeta(p_gv text, p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
     where g.nombre = p_gv
       and (p_red is null or g.red_id = p_red)
       and (g.guia_id = auth.uid() or public.es_coguia(g.id))
  )
$$;

-- ---------------------------------------------------------------------
-- 4. TRIGGERS
-- ---------------------------------------------------------------------

-- 4.1 Registro: la persona elige su red y queda pendiente
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_red uuid;
begin
  select id into v_red from public.redes
   where id::text = coalesce(new.raw_user_meta_data ->> 'red_id', '');

  insert into public.profiles (id, email, nombre, apellido, red_id, estado)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    v_red,
    'pendiente'
  );
  return new;
end;
$$;

-- 4.2 Quién puede cambiar rol, red, estado y superior
create or replace function public.validar_cambios_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sup_rol text;
  v_sup_red uuid;
begin
  new.id := old.id;
  new.email := old.email;
  new.creado_en := old.creado_en;

  -- Modo dev (solo la cuenta del desarrollador)
  if current_setting('app.dev_switch', true) = 'on' then
    return new;
  end if;

  if new.rol is distinct from old.rol
     or new.supervisor_id is distinct from old.supervisor_id
     or new.red_id is distinct from old.red_id
     or new.estado is distinct from old.estado then

    -- auth.uid() es NULL en el SQL Editor: se permite
    if auth.uid() is not null and not public.es_apostol() then
      if old.id = auth.uid() then
        -- Una persona pendiente solo puede cambiar la red que eligió
        if not (old.estado = 'pendiente'
                and new.rol = old.rol
                and new.estado = old.estado
                and new.supervisor_id is not distinct from old.supervisor_id) then
          raise exception 'No podés cambiar tu propio rol, estado ni superior';
        end if;
      elsif public.administra_red(old.red_id) or (old.red_id is null and public.es_pastor()) then
        if old.rol in ('apostol', 'pastor', 'mision_joven') or new.rol in ('apostol', 'pastor', 'mision_joven') then
          raise exception 'Solo el Apóstol puede asignar o modificar Pastores';
        end if;
        if new.red_id is distinct from old.red_id and not public.administra_red(new.red_id) then
          raise exception 'No administrás la red a la que querés mover a esta persona';
        end if;
      else
        raise exception 'No tenés permiso para cambiar roles, redes ni superiores de esta persona';
      end if;
    end if;

    if new.supervisor_id is not null then
      if new.supervisor_id = new.id then
        raise exception 'Una persona no puede ser su propio superior';
      end if;
      select rol, red_id into v_sup_rol, v_sup_red from public.profiles where id = new.supervisor_id;
      if v_sup_rol is null then
        raise exception 'El superior elegido no existe';
      end if;
      if public.rango_rol(v_sup_rol) <= public.rango_rol(new.rol) then
        raise exception 'El superior tiene que tener un rol mayor al de la persona';
      end if;
      if v_sup_rol in ('guia_supervisor', 'mision_joven') and v_sup_red is distinct from new.red_id then
        raise exception 'El Guía Supervisor tiene que ser de la misma red';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_cambios_perfil on public.profiles;
create trigger trg_validar_cambios_perfil
  before update on public.profiles
  for each row execute function public.validar_cambios_perfil();

-- 4.3 profiles.supervisor_id es la fuente; relaciones_supervision y groups se sincronizan
create or replace function public.sincronizar_supervision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.supervisor_id is null then
    delete from public.relaciones_supervision where guia_id = new.id;
  else
    insert into public.relaciones_supervision (guia_id, supervisor_id)
    values (new.id, new.supervisor_id)
    on conflict (guia_id) do update set supervisor_id = excluded.supervisor_id;
  end if;

  update public.groups
     set supervisor_id = new.supervisor_id
   where guia_id = new.id
     and supervisor_id is distinct from new.supervisor_id;

  return new;
end;
$$;

-- 4.4 Grupo nuevo: toma el superior y la red de su guía
create or replace function public.asignar_supervisor_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select supervisor_id, coalesce(new.red_id, red_id)
    into new.supervisor_id, new.red_id
    from public.profiles where id = new.guia_id;
  return new;
end;
$$;

-- 4.5 Tarjeta nueva: toma la red de quien la carga
create or replace function public.red_por_defecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.red_id is null then
    new.red_id := public.mi_red();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tarjeta_red on public.tarjetas_consolidacion;
create trigger trg_tarjeta_red
  before insert on public.tarjetas_consolidacion
  for each row execute function public.red_por_defecto();

-- 4.6 Evento global nuevo: de la red de quien lo crea (Apóstol y Pastores: de toda la iglesia)
create or replace function public.red_evento_por_defecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.red_id is null and not (public.es_apostol() or public.es_pastor()) then
    new.red_id := public.mi_red();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_global_red on public.eventos_globales;
create trigger trg_evento_global_red
  before insert on public.eventos_globales
  for each row execute function public.red_evento_por_defecto();

-- 4.7 Un Pastor que crea una red queda asignado a ella
create or replace function public.asignar_creador_red()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.es_pastor() then
    insert into public.redes_pastores (red_id, perfil_id) values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_asignar_creador_red on public.redes;
create trigger trg_asignar_creador_red
  after insert on public.redes
  for each row execute function public.asignar_creador_red();

-- ---------------------------------------------------------------------
-- 5. FUNCIONES QUE USA LA APP (ahora respetan los permisos)
-- ---------------------------------------------------------------------

create or replace function public.asignar_guia(p_guia uuid, p_sup uuid)
returns void language sql security invoker set search_path = public as $$
  update public.profiles set supervisor_id = p_sup where id = p_guia;
$$;

create or replace function public.quitar_guia(p_guia uuid)
returns void language sql security invoker set search_path = public as $$
  update public.profiles set supervisor_id = null where id = p_guia;
$$;

create or replace function public.get_relaciones()
returns setof public.relaciones_supervision language sql stable security invoker set search_path = public as $$
  select * from public.relaciones_supervision;
$$;

-- ---------------------------------------------------------------------
-- 6. DATOS: todo lo existente pasa a Misión Joven
-- ---------------------------------------------------------------------

-- Unificar supervisores: lo cargado en relaciones_supervision pasa a profiles
update public.profiles p
   set supervisor_id = r.supervisor_id
  from public.relaciones_supervision r
 where p.id = r.guia_id
   and p.supervisor_id is null
   and r.supervisor_id is not null;

update public.profiles
   set red_id = (select id from public.redes where nombre = 'Misión Joven')
 where red_id is null and rol <> 'apostol';

update public.profiles set estado = 'activo' where estado = 'pendiente';

update public.groups
   set red_id = (select id from public.redes where nombre = 'Misión Joven')
 where red_id is null;

update public.tarjetas_consolidacion
   set red_id = (select id from public.redes where nombre = 'Misión Joven')
 where red_id is null;

update public.eventos_globales
   set red_id = (select id from public.redes where nombre = 'Misión Joven')
 where red_id is null;

-- ---------------------------------------------------------------------
-- 7. POLÍTICAS: se borran todas y se crean de nuevo
-- ---------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

alter table public.redes            enable row level security;
alter table public.redes_pastores   enable row level security;
alter table public.redes_encargados enable row level security;

-- REDES: la lista es pública (se elige al registrarse)
create policy redes_select on public.redes
  for select to anon, authenticated using (true);
create policy redes_insert on public.redes
  for insert to authenticated with check (public.es_apostol() or public.es_pastor());
create policy redes_update on public.redes
  for update to authenticated using (public.es_pastor_de_red(id)) with check (public.es_pastor_de_red(id));
create policy redes_delete on public.redes
  for delete to authenticated using (public.es_apostol());

-- PASTORES POR RED: los asigna el Apóstol
create policy redes_pastores_select on public.redes_pastores
  for select to authenticated using (public.estoy_activo());
create policy redes_pastores_escritura on public.redes_pastores
  for all to authenticated using (public.es_apostol()) with check (public.es_apostol());

-- ENCARGADOS POR RED: los designan los Pastores de esa red
create policy redes_encargados_select on public.redes_encargados
  for select to authenticated using (public.estoy_activo());
create policy redes_encargados_escritura on public.redes_encargados
  for all to authenticated using (public.es_pastor_de_red(red_id)) with check (public.es_pastor_de_red(red_id));

-- PERFILES
create policy perfiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.es_apostol()
    or (public.estoy_activo() and (
          public.administra_red(red_id)
          or public.es_subordinado(id)
          or id in (select public.superiores(auth.uid()))
          or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
          or (red_id is null and public.es_pastor())
    ))
  );

create policy perfiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.es_apostol() or public.administra_red(red_id) or (red_id is null and public.es_pastor()))
  with check (id = auth.uid() or public.es_apostol() or public.administra_red(red_id));

-- RELACIONES DE SUPERVISIÓN (solo lectura; las mantiene el trigger)
create policy relaciones_select on public.relaciones_supervision
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.es_apostol()
      or supervisor_id = auth.uid()
      or guia_id = auth.uid()
      or public.administra_red(public.red_de_perfil(guia_id))
      or public.es_subordinado(guia_id)
    )
  );

-- GRUPOS
create policy grupos_select on public.groups
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or guia_id = auth.uid()
      or supervisor_id = auth.uid()
      or public.es_subordinado(guia_id)
      or public.es_coguia(id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
    )
  );

create policy grupos_insert on public.groups
  for insert to authenticated
  with check (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (guia_id = auth.uid() and red_id is not distinct from public.mi_red())
      or public.es_subordinado(guia_id)
    )
  );

create policy grupos_update on public.groups
  for update to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or guia_id = auth.uid()
      or supervisor_id = auth.uid()
      or public.es_subordinado(guia_id)
      or public.es_coguia(id)
    )
  )
  with check (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or guia_id = auth.uid()
      or public.es_subordinado(guia_id)
      or public.es_coguia(id)
    )
  );

create policy grupos_delete on public.groups
  for delete to authenticated
  using (public.administra_red(red_id) or public.es_subordinado(guia_id));

-- CO-GUÍAS
create policy grupo_guias_todo on public.grupo_guias
  for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

-- MIEMBROS, HÁBITOS Y REGISTROS
create policy miembros_todo on public.miembros_grupo
  for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

create policy habitos_todo on public.habitos
  for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

create policy registros_todo on public.registros_diarios
  for all to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_habito(habito_id)))
  with check (
    public.puede_gestionar_grupo(public.grupo_de_habito(habito_id))
    and public.grupo_de_habito(habito_id) = public.grupo_de_miembro(miembro_id)
  );

-- TARJETAS DE CONSOLIDACIÓN
create policy tarjetas_select on public.tarjetas_consolidacion
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
      or public.es_guia_de_tarjeta(gv_asignado, red_id)
    )
  );

create policy tarjetas_insert on public.tarjetas_consolidacion
  for insert to authenticated
  with check (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
    )
  );

-- El guía puede actualizar el avance de las tarjetas de su grupo
create policy tarjetas_update on public.tarjetas_consolidacion
  for update to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
      or public.es_guia_de_tarjeta(gv_asignado, red_id)
    )
  )
  with check (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
      or public.es_guia_de_tarjeta(gv_asignado, red_id)
    )
  );

create policy tarjetas_delete on public.tarjetas_consolidacion
  for delete to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
    )
  );

-- EVENTOS GLOBALES (de una red, o de toda la iglesia si red_id es NULL)
create policy eventos_globales_select on public.eventos_globales
  for select to authenticated
  using (public.estoy_activo() and (red_id is null or red_id = public.mi_red() or public.administra_red(red_id)));

create policy eventos_globales_escritura on public.eventos_globales
  for all to authenticated
  using (
    public.estoy_activo() and (
      (red_id is null and (public.es_apostol() or public.es_pastor()))
      or public.administra_red(red_id)
    )
  )
  with check (
    public.estoy_activo() and (
      (red_id is null and (public.es_apostol() or public.es_pastor()))
      or public.administra_red(red_id)
    )
  );

-- PAGOS DE EVENTOS GLOBALES
create policy evento_pagos_todo on public.evento_pagos
  for all to authenticated
  using (public.puede_gestionar_grupo(coalesce(public.grupo_de_miembro(miembro_id), grupo_id)))
  with check (public.puede_gestionar_grupo(coalesce(public.grupo_de_miembro(miembro_id), grupo_id)));

-- EVENTOS Y PAGOS DEL SISTEMA ANTERIOR (se unifican en la etapa 2)
create policy eventos_select on public.eventos
  for select to authenticated
  using (public.estoy_activo() and (grupo_id is null or public.puede_gestionar_grupo(grupo_id)));

create policy eventos_insert on public.eventos
  for insert to authenticated
  with check (
    creado_por = auth.uid() and public.estoy_activo() and (
      (grupo_id is null and (public.es_apostol() or public.es_pastor()))
      or (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
    )
  );

create policy eventos_update on public.eventos
  for update to authenticated
  using (public.es_apostol() or creado_por = auth.uid())
  with check (public.es_apostol() or creado_por = auth.uid());

create policy eventos_delete on public.eventos
  for delete to authenticated
  using (public.es_apostol() or creado_por = auth.uid());

create policy pagos_select on public.pagos_evento
  for select to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

create policy pagos_insert on public.pagos_evento
  for insert to authenticated
  with check (
    registrado_por = auth.uid()
    and public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))
  );

create policy pagos_update on public.pagos_evento
  for update to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)))
  with check (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

create policy pagos_delete on public.pagos_evento
  for delete to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

-- ---------------------------------------------------------------------
-- 8. PERMISOS DE ACCESO
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select on public.redes to anon;
grant select, insert, update, delete on public.redes, public.redes_pastores, public.redes_encargados to authenticated;

commit;

-- Que la API vea las tablas y columnas nuevas
notify pgrst, 'reload schema';
