-- =====================================================================
-- VidaGroups · Etapa 27: al aprobar una cuenta se asigna su grupo
--   · Al registrarse, el guía dice en qué grupo sirve (uno que ya existe,
--     o "es un grupo nuevo" con su nombre).
--   · Quien aprueba (Guía Supervisor de la red, encargados, pastor o
--     Administrador) lo asigna en el mismo paso: lo suma al grupo o crea
--     el grupo nuevo. Los guías ya no crean grupos por su cuenta.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists solicitud_grupo_id uuid references public.groups(id) on delete set null,
  add column if not exists solicitud_grupo_nuevo text;

-- Lo que eligió al registrarse llega en los datos de la cuenta: se copia al perfil
create or replace function public.copiar_solicitud_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
end;
$$;
revoke execute on function public.copiar_solicitud_grupo() from public, anon, authenticated;
drop trigger if exists trg_copiar_solicitud_grupo on public.profiles;
create trigger trg_copiar_solicitud_grupo before insert on public.profiles
  for each row execute function public.copiar_solicitud_grupo();

-- Grupos de una red, para elegir al registrarse (solo nombre y el nombre de pila de sus guías)
create or replace function public.grupos_para_registro(p_red uuid)
returns table (id uuid, nombre text, guias text)
language sql stable security definer set search_path = public as $$
  select g.id, g.nombre,
         (select string_agg(split_part(trim(coalesce(p.nombre, '')), ' ', 1), ' y ' order by x.principal desc)
            from (select g.guia_id as pid, true as principal
                  union all select gg.guia_id, false from public.grupo_guias gg where gg.grupo_id = g.id) x
            join public.profiles p on p.id = x.pid)
    from public.groups g
   where g.red_id = p_red
   order by g.nombre
$$;
revoke execute on function public.grupos_para_registro(uuid) from public;
grant execute on function public.grupos_para_registro(uuid) to anon, authenticated;

-- Mientras espera, puede cambiar lo que pidió
create or replace function public.elegir_solicitud_grupo(p_grupo uuid, p_nuevo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles
     set solicitud_grupo_id = case when p_grupo is not null and exists (select 1 from public.groups g where g.id = p_grupo and g.red_id = profiles.red_id) then p_grupo end,
         solicitud_grupo_nuevo = case when p_grupo is null then nullif(left(trim(coalesce(p_nuevo, '')), 80), '') end
   where id = auth.uid() and estado = 'pendiente';
  perform set_config('app.dev_switch', 'off', true);
end;
$$;
revoke execute on function public.elegir_solicitud_grupo(uuid, text) from public, anon;
grant execute on function public.elegir_solicitud_grupo(uuid, text) to authenticated;

-- ¿Puedo aprobar cuentas de esta red?
create or replace function public.puede_aprobar(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and (
    public.administra_red(p_red)
    or public.es_administrador()
    or (public.mi_rol() = 'guia_supervisor' and public.mi_red() = p_red)
  )
$$;

-- Cuentas que esperan, con el grupo que pidieron
create or replace function public.solicitudes_pendientes()
returns table (
  id uuid, nombre text, email text, red_id uuid, red text, creado_en timestamptz,
  grupo_id uuid, grupo text, grupo_guias text, grupo_nuevo text, grupo_nuevo_existe uuid
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select p.id, public.nombre_de_perfil(p.id), p.email, p.red_id, r.nombre, p.creado_en,
         p.solicitud_grupo_id, g.nombre,
         (select x.guias from public.grupos_para_registro(p.red_id) x where x.id = p.solicitud_grupo_id),
         p.solicitud_grupo_nuevo,
         (select g2.id from public.groups g2
           where g2.red_id = p.red_id and lower(trim(g2.nombre)) = lower(trim(p.solicitud_grupo_nuevo)) limit 1)
    from public.profiles p
    left join public.redes r on r.id = p.red_id
    left join public.groups g on g.id = p.solicitud_grupo_id
   where p.estado = 'pendiente'
     and p.iglesia_id is not distinct from public.mi_iglesia()
     and (public.puede_aprobar(p.red_id) or (p.red_id is null and (public.es_administrador() or public.es_apostol())))
   order by lower(coalesce(g.nombre, p.solicitud_grupo_nuevo, 'zzz')), p.creado_en;
end;
$$;

-- Aprobar: rol + grupo (sumarlo a uno existente o crear el nuevo)
create or replace function public.aprobar_cuenta(p_perfil uuid, p_rol text, p_grupo uuid default null, p_grupo_nuevo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_red uuid;
  v_estado text;
  v_gid uuid;
  v_nombre text := nullif(trim(coalesce(p_grupo_nuevo, '')), '');
begin
  select red_id, estado into v_red, v_estado from public.profiles where id = p_perfil;
  if v_estado is distinct from 'pendiente' then
    raise exception 'Esa cuenta ya no está pendiente';
  end if;
  if not public.puede_aprobar(v_red) then
    raise exception 'No podés aprobar cuentas de esta red';
  end if;
  if p_rol not in ('guia', 'guia_supervisor', 'consolidacion', 'pastor') then
    raise exception 'Rol inválido';
  end if;
  -- El Guía Supervisor aprueba guías; los demás roles los aprueban los encargados
  if public.mi_rol() = 'guia_supervisor' and not public.administra_red(v_red) and not public.es_administrador() and p_rol <> 'guia' then
    raise exception 'Como Guía Supervisor podés aprobar guías. Los otros roles los aprueban los encargados de la red.';
  end if;
  if p_rol = 'pastor' and not (public.es_administrador() or public.es_apostol()) then
    raise exception 'Los pastores los aprueba el Administrador';
  end if;
  if (p_grupo is not null or v_nombre is not null) and p_rol not in ('guia', 'guia_supervisor') then
    raise exception 'Solo los guías y los Guías Supervisores pueden guiar un grupo';
  end if;

  perform set_config('app.dev_switch', 'on', true);
  update public.profiles
     set estado = 'activo', rol = p_rol, solicitud_grupo_id = null, solicitud_grupo_nuevo = null
   where id = p_perfil;

  if p_grupo is not null then
    if not exists (select 1 from public.groups where id = p_grupo and red_id = v_red) then
      raise exception 'Ese grupo no es de la red';
    end if;
    v_gid := p_grupo;
    if (select guia_id from public.groups where id = v_gid) <> p_perfil then
      insert into public.grupo_guias (grupo_id, guia_id) values (v_gid, p_perfil) on conflict do nothing;
    end if;
  elsif v_nombre is not null then
    -- Si ya existe uno con ese nombre (por ejemplo, lo pidieron dos personas), se suma ahí
    select id into v_gid from public.groups where red_id = v_red and lower(trim(nombre)) = lower(v_nombre) limit 1;
    if v_gid is null then
      insert into public.groups (nombre, red_id, guia_id, supervisor_id)
      values (v_nombre, v_red, p_perfil, case when public.mi_rol() = 'guia_supervisor' then auth.uid() end)
      returning id into v_gid;
    elsif (select guia_id from public.groups where id = v_gid) <> p_perfil then
      insert into public.grupo_guias (grupo_id, guia_id) values (v_gid, p_perfil) on conflict do nothing;
    end if;
  end if;

  if v_gid is not null then
    perform public.sincronizar_guias_con_supervision(v_gid);
  end if;
  perform set_config('app.dev_switch', 'off', true);
  return v_gid;
end;
$$;

create or replace function public.rechazar_cuenta(p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_aprobar((select red_id from public.profiles where id = p_perfil)) then
    raise exception 'No podés rechazar cuentas de esta red';
  end if;
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles set estado = 'inactivo' where id = p_perfil and estado = 'pendiente';
  perform set_config('app.dev_switch', 'off', true);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.puede_aprobar(uuid)', 'public.solicitudes_pendientes()',
    'public.aprobar_cuenta(uuid, text, uuid, text)', 'public.rechazar_cuenta(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
