-- =====================================================================
-- VidaGroups · Etapa 8: base preparada para varias iglesias
--
-- Cada iglesia ve SOLO sus datos. Vida Nueva pasa a ser la iglesia nº 1
-- y todo lo existente queda asignado a ella. La app no cambia.
--
-- Cómo funciona: además de las políticas que ya existen (qué ve cada rol),
-- cada tabla suma una política RESTRICTIVA que exige que el dato sea de
-- la iglesia de quien consulta. Las dos tienen que cumplirse a la vez.
--
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Iglesias
-- ---------------------------------------------------------------------
create table if not exists public.iglesias (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  slug              text not null unique,
  codigo_invitacion text not null unique default upper(substr(md5(random()::text), 1, 8)),
  activa            boolean not null default true,
  creado_en         timestamptz not null default now()
);

insert into public.iglesias (nombre, slug) values ('Vida Nueva', 'vida-nueva')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2. Columnas de iglesia y datos existentes → Vida Nueva
-- ---------------------------------------------------------------------
alter table public.profiles  add column if not exists iglesia_id uuid references public.iglesias(id);
alter table public.redes     add column if not exists iglesia_id uuid references public.iglesias(id);
alter table public.eventos   add column if not exists iglesia_id uuid references public.iglesias(id);
alter table public.auditoria add column if not exists iglesia_id uuid references public.iglesias(id);

update public.profiles  set iglesia_id = (select id from public.iglesias where slug = 'vida-nueva') where iglesia_id is null;
update public.redes     set iglesia_id = (select id from public.iglesias where slug = 'vida-nueva') where iglesia_id is null;
update public.eventos   set iglesia_id = (select id from public.iglesias where slug = 'vida-nueva') where iglesia_id is null;
update public.auditoria set iglesia_id = (select id from public.iglesias where slug = 'vida-nueva') where iglesia_id is null;

alter table public.redes   alter column iglesia_id set not null;
alter table public.eventos alter column iglesia_id set not null;

create index if not exists profiles_iglesia_idx on public.profiles(iglesia_id);
create index if not exists redes_iglesia_idx on public.redes(iglesia_id);
create index if not exists eventos_iglesia_idx on public.eventos(iglesia_id);

-- El nombre de una red se repite entre iglesias ("Red de Mujeres" puede existir en varias)
alter table public.redes drop constraint if exists redes_nombre_key;
alter table public.redes drop constraint if exists redes_iglesia_nombre_key;
alter table public.redes add constraint redes_iglesia_nombre_key unique (iglesia_id, nombre);

-- ---------------------------------------------------------------------
-- 3. Funciones de iglesia
-- ---------------------------------------------------------------------
create or replace function public.mi_iglesia()
returns uuid language sql stable security definer set search_path = public as $$
  select iglesia_id from public.profiles where id = auth.uid()
$$;

create or replace function public.iglesia_de_red(p_red uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select iglesia_id from public.redes where id = p_red
$$;

create or replace function public.iglesia_de_grupo(p_grupo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select r.iglesia_id from public.groups g join public.redes r on r.id = g.red_id where g.id = p_grupo
$$;

create or replace function public.iglesia_de_perfil(p_perfil uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select iglesia_id from public.profiles where id = p_perfil
$$;

-- El Apóstol y los Pastores administran solo redes de SU iglesia
create or replace function public.es_pastor_de_red(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_red is not null
     and public.iglesia_de_red(p_red) = public.mi_iglesia()
     and (
       public.es_apostol()
       or (public.es_pastor() and exists (
             select 1 from public.redes_pastores where red_id = p_red and perfil_id = auth.uid()))
     )
$$;

-- ---------------------------------------------------------------------
-- 4. Triggers: cada dato nuevo toma la iglesia que corresponde
-- ---------------------------------------------------------------------

-- Registro: la iglesia sale de la red elegida
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_red uuid;
  v_iglesia uuid;
begin
  select id, iglesia_id into v_red, v_iglesia from public.redes
   where id::text = coalesce(new.raw_user_meta_data ->> 'red_id', '');

  insert into public.profiles (id, email, nombre, apellido, red_id, iglesia_id, estado)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    v_red,
    v_iglesia,
    'pendiente'
  );
  return new;
end;
$$;

-- Nadie cambia de iglesia desde la app, y la red y el superior tienen que ser de la misma iglesia
create or replace function public.proteger_iglesia_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.iglesia_id is distinct from old.iglesia_id then
    raise exception 'No se puede cambiar la iglesia de una persona desde la app';
  end if;
  if new.red_id is not null and public.iglesia_de_red(new.red_id) is distinct from new.iglesia_id then
    raise exception 'La red elegida no pertenece a tu iglesia';
  end if;
  if new.supervisor_id is not null and public.iglesia_de_perfil(new.supervisor_id) is distinct from new.iglesia_id then
    raise exception 'El superior tiene que ser de la misma iglesia';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_iglesia_perfil on public.profiles;
create trigger trg_proteger_iglesia_perfil
  before update on public.profiles
  for each row execute function public.proteger_iglesia_perfil();

-- Redes nuevas: de la iglesia de quien las crea
create or replace function public.iglesia_por_defecto_red()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.iglesia_id is null then
    new.iglesia_id := public.mi_iglesia();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_iglesia_red on public.redes;
create trigger trg_iglesia_red
  before insert on public.redes
  for each row execute function public.iglesia_por_defecto_red();

-- Eventos nuevos: la iglesia del grupo, de la red o de quien lo crea
create or replace function public.iglesia_de_evento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.iglesia_id := coalesce(
    public.iglesia_de_grupo(new.grupo_id),
    public.iglesia_de_red(new.red_id),
    new.iglesia_id,
    public.mi_iglesia()
  );
  return new;
end;
$$;

drop trigger if exists trg_evento_iglesia on public.eventos;
create trigger trg_evento_iglesia
  before insert or update on public.eventos
  for each row execute function public.iglesia_de_evento();

-- Auditoría: guarda la iglesia de quien hizo el cambio
alter table public.auditoria alter column iglesia_id set default public.mi_iglesia();

-- ---------------------------------------------------------------------
-- 5. Políticas RESTRICTIVAS: el dato tiene que ser de mi iglesia
-- ---------------------------------------------------------------------
alter table public.iglesias enable row level security;
revoke all on public.iglesias from anon;
grant select on public.iglesias to authenticated;

drop policy if exists iglesias_select on public.iglesias;
create policy iglesias_select on public.iglesias
  for select to authenticated using (id = public.mi_iglesia());

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('profiles',               'id = auth.uid() or iglesia_id = public.mi_iglesia()'),
      ('redes',                  'iglesia_id = public.mi_iglesia()'),
      ('redes_pastores',         'public.iglesia_de_red(red_id) = public.mi_iglesia()'),
      ('redes_encargados',       'public.iglesia_de_red(red_id) = public.mi_iglesia()'),
      ('redes_consolidadores',   'public.iglesia_de_red(red_id) = public.mi_iglesia()'),
      ('groups',                 'public.iglesia_de_red(red_id) = public.mi_iglesia()'),
      ('grupo_guias',            'public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()'),
      ('miembros_grupo',         'public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()'),
      ('habitos',                'public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()'),
      ('reuniones',              'public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()'),
      ('registros_diarios',      'public.iglesia_de_grupo(public.grupo_de_habito(habito_id)) = public.mi_iglesia()'),
      ('asistencias',            'public.iglesia_de_grupo(public.grupo_de_reunion(reunion_id)) = public.mi_iglesia()'),
      ('pagos_evento',           'public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia()'),
      ('seguimientos_faltas',    'public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia()'),
      ('tarjetas_consolidacion', 'public.iglesia_de_red(red_id) = public.mi_iglesia()'),
      ('eventos',                'iglesia_id = public.mi_iglesia()'),
      ('relaciones_supervision', 'public.iglesia_de_perfil(guia_id) = public.mi_iglesia()'),
      ('auditoria',              'iglesia_id = public.mi_iglesia()')
    ) as t(tabla, condicion)
  loop
    execute format('drop policy if exists solo_mi_iglesia on public.%I', r.tabla);
    execute format(
      'create policy solo_mi_iglesia on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      r.tabla, r.condicion, r.condicion
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos de las funciones nuevas
-- ---------------------------------------------------------------------
revoke execute on function public.mi_iglesia() from public, anon;
revoke execute on function public.iglesia_de_red(uuid) from public, anon;
revoke execute on function public.iglesia_de_grupo(uuid) from public, anon;
revoke execute on function public.iglesia_de_perfil(uuid) from public, anon;
revoke execute on function public.proteger_iglesia_perfil() from public, anon, authenticated;
revoke execute on function public.iglesia_por_defecto_red() from public, anon, authenticated;
revoke execute on function public.iglesia_de_evento() from public, anon, authenticated;
grant execute on function public.mi_iglesia() to authenticated;
grant execute on function public.iglesia_de_red(uuid) to authenticated;
grant execute on function public.iglesia_de_grupo(uuid) to authenticated;
grant execute on function public.iglesia_de_perfil(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
