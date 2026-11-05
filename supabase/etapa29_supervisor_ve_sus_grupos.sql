-- =====================================================================
-- VidaGroups · Etapa 29: cada Guía Supervisor ve solo las cuentas de SUS grupos
--   · Un Guía Supervisor ve y aprueba a quienes pidieron sumarse a un grupo
--     que él supervisa, y solo puede sumarlos a sus grupos.
--   · Los pedidos de "grupo nuevo" o sin grupo los ven y aprueban los
--     encargados de la red, el pastor de la red y el Administrador.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

create or replace function public.puede_aprobar_perfil(p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.profiles p
     where p.id = p_perfil
       and (
         public.administra_red(p.red_id)
         or public.es_administrador()
         or (
           public.mi_rol() = 'guia_supervisor' and public.mi_red() = p.red_id
           and p.solicitud_grupo_id is not null
           and exists (select 1 from public.groups g
                        where g.id = p.solicitud_grupo_id
                          and (g.supervisor_id = auth.uid() or public.es_cosupervisor(g.id)))
         )
       )
  )
$$;
revoke execute on function public.puede_aprobar_perfil(uuid) from public, anon;
grant execute on function public.puede_aprobar_perfil(uuid) to authenticated;

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
     and (public.puede_aprobar_perfil(p.id) or (p.red_id is null and (public.es_administrador() or public.es_apostol())))
   order by lower(coalesce(g.nombre, p.solicitud_grupo_nuevo, 'zzz')), p.creado_en;
end;
$$;

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
  if not public.puede_aprobar_perfil(p_perfil) then
    raise exception 'Esta cuenta la aprueban los encargados de la red o el Guía Supervisor del grupo que pidió';
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
    if not (public.administra_red(v_red) or public.es_administrador())
       and not exists (select 1 from public.groups g where g.id = p_grupo and (g.supervisor_id = auth.uid() or public.es_cosupervisor(g.id))) then
      raise exception 'Solo podés sumarlo a un grupo que supervisás';
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
  if not public.puede_aprobar_perfil(p_perfil) then
    raise exception 'No podés rechazar esta cuenta';
  end if;
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles set estado = 'inactivo' where id = p_perfil and estado = 'pendiente';
  perform set_config('app.dev_switch', 'off', true);
end;
$$;

commit;

notify pgrst, 'reload schema';
