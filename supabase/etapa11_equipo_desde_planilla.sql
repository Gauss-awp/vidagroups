-- =====================================================================
-- VidaGroups · Etapa 11: configurar el equipo de la red desde una planilla
--   El encargado carga correo, rol, supervisor, grupo y si consolida.
--   · Quien ya se registró queda aprobado al instante.
--   · Quien todavía no, queda aprobado SOLO apenas se registra con ese correo.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

create table if not exists public.preaprobaciones (
  id                uuid primary key default gen_random_uuid(),
  red_id            uuid not null references public.redes(id) on delete cascade,
  email             text not null,
  nombre            text,
  rol               text not null check (rol in ('guia', 'guia_supervisor', 'consolidacion')),
  supervisor_email  text,
  grupo             text,
  consolidador      boolean not null default false,
  perfil_id         uuid references public.profiles(id) on delete set null,
  aplicado_en       timestamptz,
  creado_por        uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en         timestamptz not null default now(),
  unique (red_id, email)
);

-- Los correos siempre en minúscula
create or replace function public.normalizar_preaprobacion()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  new.supervisor_email := nullif(lower(trim(coalesce(new.supervisor_email, ''))), '');
  new.grupo := nullif(trim(coalesce(new.grupo, '')), '');
  return new;
end;
$$;
drop trigger if exists trg_normalizar_preaprobacion on public.preaprobaciones;
create trigger trg_normalizar_preaprobacion before insert or update on public.preaprobaciones
  for each row execute function public.normalizar_preaprobacion();

alter table public.preaprobaciones enable row level security;
revoke all on public.preaprobaciones from anon;
grant select, insert, update, delete on public.preaprobaciones to authenticated;

drop policy if exists preaprobaciones_todo on public.preaprobaciones;
create policy preaprobaciones_todo on public.preaprobaciones
  for all to authenticated
  using (public.administra_red(red_id))
  with check (public.administra_red(red_id));

drop policy if exists solo_mi_iglesia on public.preaprobaciones;
create policy solo_mi_iglesia on public.preaprobaciones as restrictive for all to authenticated
  using (public.iglesia_de_red(red_id) = public.mi_iglesia())
  with check (public.iglesia_de_red(red_id) = public.mi_iglesia());

-- ---------------------------------------------------------------------
-- Aplica la configuración de una persona (uso interno)
-- ---------------------------------------------------------------------
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
revoke execute on function public.aplicar_preaprobacion_perfil(uuid) from public, anon, authenticated;

-- Cuando alguien se registra, si estaba en la planilla, queda aprobado solo
create or replace function public.preaprobar_al_registrarse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.aplicar_preaprobacion_perfil(new.id);
  return new;
end;
$$;
revoke execute on function public.preaprobar_al_registrarse() from public, anon, authenticated;

drop trigger if exists trg_preaprobar_al_registrarse on public.profiles;
create trigger trg_preaprobar_al_registrarse after insert on public.profiles
  for each row execute function public.preaprobar_al_registrarse();

-- ---------------------------------------------------------------------
-- La llama el encargado al guardar la planilla: aplica a quienes ya se registraron
-- ---------------------------------------------------------------------
create or replace function public.aplicar_preaprobaciones(p_red uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_x record;
  v_aplicados int := 0;
begin
  if not public.administra_red(p_red) then
    raise exception 'Solo el encargado o el pastor de la red puede hacer esto';
  end if;

  -- Primero los supervisores, así sus guías los encuentran
  for v_x in
    select p.id
      from public.preaprobaciones x
      join public.profiles p on lower(p.email) = x.email and p.iglesia_id = public.iglesia_de_red(x.red_id)
     where x.red_id = p_red and x.aplicado_en is null
     order by case x.rol when 'guia_supervisor' then 0 when 'consolidacion' then 1 else 2 end
  loop
    if public.aplicar_preaprobacion_perfil(v_x.id) then
      v_aplicados := v_aplicados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'aplicados', v_aplicados,
    'esperando', (select count(*) from public.preaprobaciones where red_id = p_red and aplicado_en is null)
  );
end;
$$;
revoke execute on function public.aplicar_preaprobaciones(uuid) from public, anon;
grant execute on function public.aplicar_preaprobaciones(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
