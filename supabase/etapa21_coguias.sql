-- =====================================================================
-- VidaGroups · Etapa 21: dos guías en un mismo grupo (co-guías)
--   El guía principal sigue siendo uno; se le pueden sumar otros guías.
--   Los co-guías ven y cargan todo el grupo igual que el principal
--   (asistencia, miembros, consolidación, notas) y les llegan los recordatorios.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- Solo guías o guías supervisores activos, de la misma red, y distintos del principal
create or replace function public.validar_coguia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text;
  v_estado text;
  v_red uuid;
  v_grupo_red uuid;
  v_principal uuid;
begin
  select rol, estado, red_id into v_rol, v_estado, v_red from public.profiles where id = new.guia_id;
  select red_id, guia_id into v_grupo_red, v_principal from public.groups where id = new.grupo_id;
  if v_rol is null or v_rol not in ('guia', 'guia_supervisor') then
    raise exception 'El segundo guía tiene que tener rol Guía o Guía Supervisor';
  end if;
  if v_estado is distinct from 'activo' then
    raise exception 'La cuenta del segundo guía todavía no está aprobada';
  end if;
  if v_red is distinct from v_grupo_red then
    raise exception 'El segundo guía tiene que ser de la misma red que el grupo';
  end if;
  if new.guia_id = v_principal then
    raise exception 'Esa persona ya es el guía principal del grupo';
  end if;
  return new;
end;
$$;
revoke execute on function public.validar_coguia() from public, anon, authenticated;
drop trigger if exists trg_validar_coguia on public.grupo_guias;
create trigger trg_validar_coguia before insert or update on public.grupo_guias
  for each row execute function public.validar_coguia();

-- Historial de guías: los co-guías también quedan registrados
create or replace function public.historial_coguia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
    values (new.grupo_id, 'guia', new.guia_id, public.nombre_de_perfil(new.guia_id));
    return new;
  end if;
  update public.historial_liderazgo set hasta = now()
   where grupo_id = old.grupo_id and rol = 'guia' and perfil_id = old.guia_id and hasta is null;
  return old;
end;
$$;
revoke execute on function public.historial_coguia() from public, anon, authenticated;
drop trigger if exists trg_historial_coguia on public.grupo_guias;
create trigger trg_historial_coguia after insert or delete on public.grupo_guias
  for each row execute function public.historial_coguia();

-- El cambio de guía principal no cierra el registro de los co-guías
create or replace function public.registrar_liderazgo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.guia_id is distinct from old.guia_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'guia' and hasta is null
       and perfil_id is not distinct from (case when tg_op = 'INSERT' then null else old.guia_id end);
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

-- Nombres de los guías de un grupo (para mostrar "Guías: Catt y Joaco")
create or replace function public.guias_del_grupo(p_grupo uuid)
returns table (perfil_id uuid, nombre text, principal boolean)
language sql stable security definer set search_path = public as $$
  select g.guia_id, public.nombre_de_perfil(g.guia_id), true
    from public.groups g
   where g.id = p_grupo and (public.puede_gestionar_grupo(p_grupo) or public.es_administrador())
  union all
  select gg.guia_id, public.nombre_de_perfil(gg.guia_id), false
    from public.grupo_guias gg
   where gg.grupo_id = p_grupo and (public.puede_gestionar_grupo(p_grupo) or public.es_administrador())
$$;

-- Planilla de equipo: si dos personas figuran con el mismo grupo, la segunda queda como co-guía
CREATE OR REPLACE FUNCTION public.aplicar_preaprobacion_perfil(p_perfil uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil public.profiles%rowtype;
  v_pre    public.preaprobaciones%rowtype;
  v_sup    uuid;
  v_gid    uuid;
  v_guia   uuid;
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

  -- 4. El grupo que guía (si no existe, se crea). Si otra persona de la planilla
  --    ya es guía de ese grupo, esta queda como segundo guía (co-guía).
  if v_pre.grupo is not null then
    select id, guia_id into v_gid, v_guia from public.groups
     where red_id = v_pre.red_id and lower(trim(nombre)) = lower(v_pre.grupo)
     limit 1;
    if v_gid is null then
      insert into public.groups (nombre, red_id, guia_id) values (v_pre.grupo, v_pre.red_id, p_perfil);
    elsif v_guia = p_perfil then
      null;
    elsif exists (select 1 from public.preaprobaciones x
                   where x.red_id = v_pre.red_id and lower(x.grupo) = lower(v_pre.grupo) and x.perfil_id = v_guia) then
      insert into public.grupo_guias (grupo_id, guia_id) values (v_gid, p_perfil) on conflict do nothing;
    else
      update public.groups set guia_id = p_perfil where id = v_gid;
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
$function$;

-- Panel del Administrador: co-guías en la lista de grupos y para agregarlos o quitarlos
drop function if exists public.admin_grupos();
CREATE OR REPLACE FUNCTION public.admin_grupos()
 RETURNS TABLE(id uuid, nombre text, red_id uuid, red text, guia_id uuid, guia text, supervisor text, segundos text[], miembros integer, ultima_reunion date, reuniones_4_semanas integer, coguias text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.solo_administrador();
  return query
  select g.id, g.nombre, g.red_id, r.nombre, g.guia_id,
         coalesce(nullif(trim(coalesce(pg.nombre, '') || ' ' || coalesce(pg.apellido, '')), ''), pg.email),
         coalesce(nullif(trim(coalesce(ps.nombre, '') || ' ' || coalesce(ps.apellido, '')), ''), ps.email),
         array(select coalesce(nullif(trim(coalesce(x.nombre, '') || ' ' || coalesce(x.apellido, '')), ''), x.email)
                 from public.grupo_supervisores gs join public.profiles x on x.id = gs.perfil_id where gs.grupo_id = g.id),
         (select count(*)::int from public.miembros_grupo m where m.grupo_id = g.id and m.activo),
         (select max(re.fecha) from public.reuniones re where re.grupo_id = g.id and re.fecha <= current_date),
         (select count(*)::int from public.reuniones re where re.grupo_id = g.id and re.fecha between current_date - 28 and current_date),
         array(select coalesce(nullif(trim(coalesce(x.nombre, '') || ' ' || coalesce(x.apellido, '')), ''), x.email)
                 from public.grupo_guias gg join public.profiles x on x.id = gg.guia_id where gg.grupo_id = g.id)
    from public.groups g
    join public.redes r on r.id = g.red_id
    left join public.profiles pg on pg.id = g.guia_id
    left join public.profiles ps on ps.id = g.supervisor_id
   where r.iglesia_id = public.mi_iglesia()
   order by r.nombre, g.nombre;
end;
$function$;

create or replace function public.admin_coguia(p_grupo uuid, p_perfil uuid, p_agregar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  if not exists (select 1 from public.groups g join public.redes r on r.id = g.red_id
                  where g.id = p_grupo and r.iglesia_id = public.mi_iglesia()) then
    raise exception 'Ese grupo no es de tu iglesia';
  end if;
  if p_agregar then
    insert into public.grupo_guias (grupo_id, guia_id) values (p_grupo, p_perfil) on conflict do nothing;
  else
    delete from public.grupo_guias where grupo_id = p_grupo and guia_id = p_perfil;
  end if;
end;
$$;

revoke execute on function public.guias_del_grupo(uuid) from public, anon;
revoke execute on function public.admin_grupos() from public, anon;
revoke execute on function public.admin_coguia(uuid, uuid, boolean) from public, anon;
revoke execute on function public.aplicar_preaprobacion_perfil(uuid) from public, anon, authenticated;
grant execute on function public.guias_del_grupo(uuid) to authenticated;
grant execute on function public.admin_grupos() to authenticated;
grant execute on function public.admin_coguia(uuid, uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
