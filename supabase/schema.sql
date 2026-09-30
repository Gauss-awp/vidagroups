-- =====================================================================
-- VidaGroups · Esquema completo para Supabase
-- Pegá TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Pensado para un proyecto nuevo (se ejecuta una sola vez).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Perfil de cada usuario de la app (se crea solo al registrarse)
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null default '',
  nombre        text not null default '',
  apellido      text not null default '',
  rol           text not null default 'guia'
                check (rol in ('apostol', 'pastor', 'supervisor', 'guia')),
  supervisor_id uuid references public.profiles(id) on delete set null,
  creado_en     timestamptz not null default now(),
  constraint perfil_no_se_supervisa check (supervisor_id is null or supervisor_id <> id)
);
create index profiles_supervisor_idx on public.profiles(supervisor_id);
create index profiles_rol_idx on public.profiles(rol);

-- Cadena Apóstol → Pastor → Supervisor → Guía.
-- Se mantiene sola a partir de profiles.supervisor_id (ver trigger más abajo).
create table public.relaciones_supervision (
  supervisor_id  uuid not null references public.profiles(id) on delete cascade,
  supervisado_id uuid not null references public.profiles(id) on delete cascade,
  creado_en      timestamptz not null default now(),
  primary key (supervisor_id, supervisado_id),
  constraint un_superior_directo unique (supervisado_id)
);

-- Grupos de vida
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  descripcion   text,
  guia_id       uuid not null references public.profiles(id) on delete restrict,
  supervisor_id uuid references public.profiles(id) on delete set null,
  creado_en     timestamptz not null default now()
);
create index groups_guia_idx on public.groups(guia_id);
create index groups_supervisor_idx on public.groups(supervisor_id);

-- Miembros (hermanos) de cada grupo.
-- La mayoría no usa la app, por eso guardamos nombre/teléfono acá;
-- usuario_id es opcional por si el hermano también tiene cuenta.
create table public.miembros_grupo (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.groups(id) on delete cascade,
  usuario_id uuid references public.profiles(id) on delete set null,
  nombre     text not null,
  apellido   text not null default '',
  telefono   text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
create index miembros_grupo_idx on public.miembros_grupo(grupo_id);

-- Hábitos que sigue cada grupo (ej: Asistencia al grupo, Lectura bíblica, Oración)
create table public.habitos (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.groups(id) on delete cascade,
  nombre    text not null,
  creado_en timestamptz not null default now()
);
create index habitos_grupo_idx on public.habitos(grupo_id);

-- Registro diario: si un miembro cumplió un hábito un día determinado
create table public.registros_diarios (
  id         uuid primary key default gen_random_uuid(),
  habito_id  uuid not null references public.habitos(id) on delete cascade,
  miembro_id uuid not null references public.miembros_grupo(id) on delete cascade,
  fecha      date not null default current_date,
  completado boolean not null default false,
  constraint registro_unico unique (habito_id, miembro_id, fecha)
);
create index registros_fecha_idx on public.registros_diarios(fecha);
create index registros_miembro_idx on public.registros_diarios(miembro_id);

-- Encuentros, campamentos y otros eventos.
-- grupo_id NULL = evento general de la iglesia.
-- costo_total = lo que tiene que pagar CADA persona.
create table public.eventos (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid references public.groups(id) on delete cascade,
  nombre       text not null,
  tipo         text not null default 'encuentro'
               check (tipo in ('encuentro', 'campamento', 'otro')),
  costo_total  numeric(12, 2) not null default 0 check (costo_total >= 0),
  fecha_evento date,
  descripcion  text,
  creado_por   uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en    timestamptz not null default now()
);
create index eventos_grupo_idx on public.eventos(grupo_id);

-- Pagos de cada miembro para un evento (cuotas)
create table public.pagos_evento (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references public.eventos(id) on delete cascade,
  miembro_id     uuid not null references public.miembros_grupo(id) on delete cascade,
  monto_pagado   numeric(12, 2) not null check (monto_pagado > 0),
  fecha_pago     date not null default current_date,
  registrado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  nota           text,
  creado_en      timestamptz not null default now()
);
create index pagos_evento_idx on public.pagos_evento(evento_id);
create index pagos_miembro_idx on public.pagos_evento(miembro_id);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES DE JERARQUÍA (security definer para evitar recursión de RLS)
-- ---------------------------------------------------------------------

create or replace function public.rango_rol(p_rol text)
returns int language sql immutable as $$
  select case p_rol
    when 'apostol'    then 4
    when 'pastor'     then 3
    when 'supervisor' then 2
    else 1
  end
$$;

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid()
$$;

-- Todas las personas que están DEBAJO de p_id en la cadena (directas e indirectas)
create or replace function public.subordinados(p_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive arbol as (
    select id from public.profiles where supervisor_id = p_id
    union
    select p.id from public.profiles p join arbol a on p.supervisor_id = a.id
  )
  select id from arbol
$$;

-- Todas las personas que están ARRIBA de p_id en la cadena
create or replace function public.superiores(p_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive cadena as (
    select supervisor_id as id from public.profiles
     where id = p_id and supervisor_id is not null
    union
    select p.supervisor_id from public.profiles p
      join cadena c on p.id = c.id
     where p.supervisor_id is not null
  )
  select id from cadena
$$;

-- ¿La persona está debajo mío en la cadena?
create or replace function public.es_subordinado(p_objetivo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subordinados(auth.uid()) as s(id) where s.id = p_objetivo
  )
$$;

-- ¿Puedo ver y gestionar este grupo? (Guía dueño, sus superiores, o el Apóstol)
create or replace function public.puede_gestionar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         public.mi_rol() = 'apostol'
         or g.guia_id = auth.uid()
         or g.supervisor_id = auth.uid()
         or public.es_subordinado(g.guia_id)
       )
  )
$$;

create or replace function public.grupo_de_miembro(p_miembro uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select grupo_id from public.miembros_grupo where id = p_miembro
$$;

create or replace function public.grupo_de_habito(p_habito uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select grupo_id from public.habitos where id = p_habito
$$;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- 3.1 Crear el perfil automáticamente al registrarse (siempre como 'guia')
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, apellido)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- 3.2 Validar cambios de rol y de superior
create or replace function public.validar_cambios_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol_actor    text;
  v_rol_superior text;
begin
  -- Campos que nunca se cambian desde la app
  new.id        := old.id;
  new.email     := old.email;
  new.creado_en := old.creado_en;

  if new.rol is distinct from old.rol
     or new.supervisor_id is distinct from old.supervisor_id then

    -- auth.uid() es NULL cuando se ejecuta desde el SQL Editor: se permite.
    if auth.uid() is not null then
      v_rol_actor := public.mi_rol();

      if v_rol_actor = 'apostol' then
        null; -- el Apóstol puede todo
      elsif v_rol_actor = 'pastor' then
        if old.id = auth.uid() then
          raise exception 'No podés cambiar tu propio rol ni tu superior';
        end if;
        if old.rol = 'apostol' or new.rol = 'apostol' then
          raise exception 'Solo el Apóstol puede asignar o modificar el rol de Apóstol';
        end if;
      else
        raise exception 'Solo el Apóstol o un Pastor pueden cambiar roles y superiores';
      end if;
    end if;

    if new.supervisor_id is not null then
      select rol into v_rol_superior from public.profiles where id = new.supervisor_id;
      if v_rol_superior is null then
        raise exception 'El superior elegido no existe';
      end if;
      if public.rango_rol(v_rol_superior) <= public.rango_rol(new.rol) then
        raise exception 'El superior tiene que tener un rol mayor al de la persona';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validar_cambios_perfil
  before update on public.profiles
  for each row execute function public.validar_cambios_perfil();

-- 3.3 Mantener relaciones_supervision y groups.supervisor_id sincronizados
create or replace function public.sincronizar_supervision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.relaciones_supervision where supervisado_id = new.id;

  if new.supervisor_id is not null then
    insert into public.relaciones_supervision (supervisor_id, supervisado_id)
    values (new.supervisor_id, new.id);
  end if;

  update public.groups
     set supervisor_id = new.supervisor_id
   where guia_id = new.id
     and supervisor_id is distinct from new.supervisor_id;

  return new;
end;
$$;

create trigger trg_sincronizar_supervision
  after insert or update of supervisor_id on public.profiles
  for each row execute function public.sincronizar_supervision();

-- 3.4 Al crear un grupo (o cambiarle el guía) se copia el superior del guía
create or replace function public.asignar_supervisor_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select supervisor_id into new.supervisor_id
    from public.profiles where id = new.guia_id;
  return new;
end;
$$;

create trigger trg_asignar_supervisor_grupo
  before insert or update of guia_id on public.groups
  for each row execute function public.asignar_supervisor_grupo();

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles               enable row level security;
alter table public.relaciones_supervision enable row level security;
alter table public.groups                 enable row level security;
alter table public.miembros_grupo         enable row level security;
alter table public.habitos                enable row level security;
alter table public.registros_diarios      enable row level security;
alter table public.eventos                enable row level security;
alter table public.pagos_evento           enable row level security;

-- PROFILES -----------------------------------------------------------
-- Cada uno se ve a sí mismo, a su cadena hacia arriba y hacia abajo.
-- Apóstol y Pastores ven a todos (para poder asignar roles).
create policy perfiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.mi_rol() in ('apostol', 'pastor')
    or public.es_subordinado(id)
    or id in (select public.superiores(auth.uid()))
  );

-- Cada uno edita su nombre; roles/superior los valida el trigger 3.2
create policy perfiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.mi_rol() in ('apostol', 'pastor'))
  with check (id = auth.uid() or public.mi_rol() in ('apostol', 'pastor'));

-- RELACIONES DE SUPERVISIÓN (solo lectura, se mantiene por trigger) ---
create policy relaciones_select on public.relaciones_supervision
  for select to authenticated
  using (
    supervisor_id = auth.uid()
    or supervisado_id = auth.uid()
    or public.mi_rol() in ('apostol', 'pastor')
    or public.es_subordinado(supervisado_id)
  );

-- GROUPS ---------------------------------------------------------------
create policy grupos_select on public.groups
  for select to authenticated
  using (
    public.mi_rol() = 'apostol'
    or guia_id = auth.uid()
    or supervisor_id = auth.uid()
    or public.es_subordinado(guia_id)
  );

create policy grupos_insert on public.groups
  for insert to authenticated
  with check (
    guia_id = auth.uid()
    or public.mi_rol() = 'apostol'
    or public.es_subordinado(guia_id)
  );

create policy grupos_update on public.groups
  for update to authenticated
  using (
    public.mi_rol() = 'apostol'
    or guia_id = auth.uid()
    or supervisor_id = auth.uid()
    or public.es_subordinado(guia_id)
  )
  with check (
    guia_id = auth.uid()
    or public.mi_rol() = 'apostol'
    or public.es_subordinado(guia_id)
  );

create policy grupos_delete on public.groups
  for delete to authenticated
  using (public.mi_rol() = 'apostol' or public.es_subordinado(guia_id));

-- MIEMBROS -------------------------------------------------------------
create policy miembros_todo on public.miembros_grupo
  for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

-- HÁBITOS --------------------------------------------------------------
create policy habitos_todo on public.habitos
  for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

-- REGISTROS DIARIOS ----------------------------------------------------
create policy registros_todo on public.registros_diarios
  for all to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_habito(habito_id)))
  with check (
    public.puede_gestionar_grupo(public.grupo_de_habito(habito_id))
    and public.grupo_de_habito(habito_id) = public.grupo_de_miembro(miembro_id)
  );

-- EVENTOS --------------------------------------------------------------
-- Los generales (grupo_id NULL) los ve todo el mundo.
create policy eventos_select on public.eventos
  for select to authenticated
  using (grupo_id is null or public.puede_gestionar_grupo(grupo_id));

-- Guía: solo para su grupo. Supervisor/Pastor/Apóstol: para sus grupos o generales.
create policy eventos_insert on public.eventos
  for insert to authenticated
  with check (
    creado_por = auth.uid()
    and (
      (grupo_id is null and public.mi_rol() in ('apostol', 'pastor', 'supervisor'))
      or (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
    )
  );

create policy eventos_update on public.eventos
  for update to authenticated
  using (public.mi_rol() = 'apostol' or creado_por = auth.uid())
  with check (public.mi_rol() = 'apostol' or creado_por = auth.uid());

create policy eventos_delete on public.eventos
  for delete to authenticated
  using (public.mi_rol() = 'apostol' or creado_por = auth.uid());

-- PAGOS ----------------------------------------------------------------
-- Ve y registra pagos quien gestiona el grupo del miembro (Guía y superiores).
create policy pagos_select on public.pagos_evento
  for select to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

create policy pagos_insert on public.pagos_evento
  for insert to authenticated
  with check (
    registrado_por = auth.uid()
    and public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))
    and exists (
      select 1 from public.eventos e
       where e.id = evento_id
         and (e.grupo_id is null or e.grupo_id = public.grupo_de_miembro(miembro_id))
    )
  );

create policy pagos_update on public.pagos_evento
  for update to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)))
  with check (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

create policy pagos_delete on public.pagos_evento
  for delete to authenticated
  using (
    public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))
    and (registrado_por = auth.uid() or public.mi_rol() in ('apostol', 'pastor'))
  );

-- =====================================================================
-- 5. PRIMER APÓSTOL
-- Registrate primero desde la app y después ejecutá esto (con tu correo):
--
--   update public.profiles set rol = 'apostol' where email = 'tu-correo@ejemplo.com';
--
-- Desde ahí, todos los demás roles se asignan en la app → Administrar Iglesia.
-- =====================================================================
