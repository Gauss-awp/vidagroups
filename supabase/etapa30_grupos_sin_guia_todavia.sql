-- =====================================================================
-- VidaGroups · Etapa 30: el Guía Supervisor arma sus grupos antes de que
-- se registren los guías
--   · Un grupo se puede crear sin guía todavía. Así aparece en la lista
--     del registro, y cuando su guía se registra y lo elige, el pedido le
--     llega al Guía Supervisor de ese grupo.
--   · El primer guía que se aprueba en un grupo sin guía queda como principal;
--     los siguientes, como segundo guía.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.groups alter column guia_id drop not null;

-- La función cambia la firma (el guía pasa a ser opcional)
drop function if exists public.crear_grupo_con_guias(text, uuid, uuid, smallint, text, uuid);

CREATE OR REPLACE FUNCTION public.equipo_del_grupo(p_grupo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g record;
begin
  select * into g from public.groups where id = p_grupo;
  if g.id is null or not (public.puede_gestionar_grupo(p_grupo) or public.es_administrador()) then
    raise exception 'No tenés acceso a este grupo';
  end if;
  return jsonb_build_object(
    'guias', (
      select coalesce(jsonb_agg(x order by x.principal desc, x.nombre), '[]'::jsonb) from (
        select g.guia_id as id, public.nombre_de_perfil(g.guia_id) as nombre, true as principal where g.guia_id is not null
        union all
        select gg.guia_id, public.nombre_de_perfil(gg.guia_id), false from public.grupo_guias gg where gg.grupo_id = p_grupo
      ) x
    ),
    'supervisores', (
      select coalesce(jsonb_agg(x order by x.principal desc, x.nombre), '[]'::jsonb) from (
        select g.supervisor_id as id, public.nombre_de_perfil(g.supervisor_id) as nombre, true as principal where g.supervisor_id is not null
        union all
        select gs.perfil_id, public.nombre_de_perfil(gs.perfil_id), false from public.grupo_supervisores gs where gs.grupo_id = p_grupo
      ) x
    ),
    'puede_guias', public.puede_editar_guias(p_grupo),
    'puede_supervision', public.puede_editar_supervision(p_grupo)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.equipo_candidatos(p_grupo uuid, p_tipo text)
 RETURNS TABLE(id uuid, nombre text, rol text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_red uuid;
begin
  if (p_tipo = 'guia' and not public.puede_editar_guias(p_grupo))
     or (p_tipo = 'supervisor' and not public.puede_editar_supervision(p_grupo)) then
    raise exception 'No podés editar este equipo';
  end if;
  select g.red_id into v_red from public.groups g where g.id = p_grupo;
  return query
  select p.id, public.nombre_de_perfil(p.id), p.rol
    from public.profiles p
   where p.red_id = v_red
     and p.estado = 'activo'
     and (case when p_tipo = 'guia' then p.rol in ('guia', 'guia_supervisor') else p.rol = 'guia_supervisor' end)
     and p.id not in (
       select t.x from (
         select g1.guia_id as x from public.groups g1 where g1.id = p_grupo and p_tipo = 'guia' and g1.guia_id is not null
         union all select gg.guia_id from public.grupo_guias gg where gg.grupo_id = p_grupo and p_tipo = 'guia'
         union all select g2.supervisor_id from public.groups g2 where g2.id = p_grupo and p_tipo = 'supervisor' and g2.supervisor_id is not null
         union all select gs.perfil_id from public.grupo_supervisores gs where gs.grupo_id = p_grupo and p_tipo = 'supervisor'
       ) t
     )
   order by 2;
end;
$function$;

CREATE OR REPLACE FUNCTION public.equipo_agregar(p_grupo uuid, p_perfil uuid, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_tipo = 'guia' then
    if not public.puede_editar_guias(p_grupo) then raise exception 'No podés editar los guías de este grupo'; end if;
    -- Si el grupo todavía no tiene guía, el primero que se suma queda como principal
    if (select guia_id from public.groups where id = p_grupo) is null then
      if (select rol from public.profiles where id = p_perfil) not in ('guia', 'guia_supervisor') then
        raise exception 'El guía tiene que tener rol Guía o Guía Supervisor';
      end if;
      update public.groups set guia_id = p_perfil where id = p_grupo;
    else
      insert into public.grupo_guias (grupo_id, guia_id) values (p_grupo, p_perfil) on conflict do nothing;
    end if;
    perform public.sincronizar_guias_con_supervision(p_grupo);
  elsif p_tipo = 'supervisor' then
    if not public.puede_editar_supervision(p_grupo) then raise exception 'No podés editar la supervisión de este grupo'; end if;
    if (select supervisor_id from public.groups where id = p_grupo) is null then
      if (select rol from public.profiles where id = p_perfil) is distinct from 'guia_supervisor' then
        raise exception 'El supervisor tiene que ser un Guía Supervisor';
      end if;
      update public.groups set supervisor_id = p_perfil where id = p_grupo;
    else
      insert into public.grupo_supervisores (grupo_id, perfil_id) values (p_grupo, p_perfil) on conflict do nothing;
    end if;
    perform public.sincronizar_guias_con_supervision(p_grupo);
  else
    raise exception 'Tipo inválido';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.equipo_quitar(p_grupo uuid, p_perfil uuid, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_principal uuid;
  v_sig uuid;
begin
  if p_tipo = 'guia' then
    if not public.puede_editar_guias(p_grupo) then raise exception 'No podés editar los guías de este grupo'; end if;
    select guia_id into v_principal from public.groups where id = p_grupo;
    if v_principal is null or p_perfil <> v_principal then
      delete from public.grupo_guias where grupo_id = p_grupo and guia_id = p_perfil;
      return;
    end if;
    select guia_id into v_sig from public.grupo_guias where grupo_id = p_grupo order by creado_en limit 1;
    if v_sig is null then
      raise exception 'El grupo necesita al menos un guía. Sumá a otro guía antes de quitar a este.';
    end if;
    delete from public.grupo_guias where grupo_id = p_grupo and guia_id = v_sig;
    update public.groups set guia_id = v_sig where id = p_grupo;
  elsif p_tipo = 'supervisor' then
    if not public.puede_editar_supervision(p_grupo) then raise exception 'No podés editar la supervisión de este grupo'; end if;
    select supervisor_id into v_principal from public.groups where id = p_grupo;
    if p_perfil is distinct from v_principal then
      delete from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = p_perfil;
      return;
    end if;
    select perfil_id into v_sig from public.grupo_supervisores where grupo_id = p_grupo order by creado_en limit 1;
    if v_sig is not null then
      delete from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = v_sig;
    end if;
    update public.groups set supervisor_id = v_sig where id = p_grupo;
    perform public.sincronizar_guias_con_supervision(p_grupo);
  else
    raise exception 'Tipo inválido';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crear_grupo_con_guias(p_nombre text, p_guia uuid DEFAULT NULL::uuid, p_coguia uuid DEFAULT NULL::uuid, p_dia smallint DEFAULT NULL::smallint, p_hora text DEFAULT NULL::text, p_red uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_red uuid := coalesce(p_red, public.mi_red());
  v_id uuid;
  v_sup uuid;
  v_nombre text := trim(coalesce(p_nombre, ''));
begin
  if not public.puede_crear_grupo(v_red) then
    raise exception 'No podés crear grupos en esta red';
  end if;
  if v_nombre = '' then
    raise exception 'Poné un nombre para el grupo';
  end if;
  if exists (select 1 from public.groups where red_id = v_red and lower(trim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya existe un grupo con ese nombre en la red';
  end if;
  -- El guía es opcional: si todavía no se registró, se suma al aprobar su cuenta
  if p_guia is not null and not exists (select 1 from public.profiles where id = p_guia and red_id = v_red and estado = 'activo' and rol in ('guia', 'guia_supervisor')) then
    raise exception 'El guía tiene que estar aprobado y ser de la misma red';
  end if;
  if p_coguia is not null and p_coguia = p_guia then
    raise exception 'Elegí dos personas distintas';
  end if;
  if p_hora is not null and p_hora !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'La hora tiene que ser como 21:00';
  end if;

  -- Si lo crea un Guía Supervisor, queda como supervisor del grupo
  v_sup := case when public.mi_rol() = 'guia_supervisor' then auth.uid() else null end;

  insert into public.groups (nombre, red_id, guia_id, supervisor_id, dia_reunion, hora_reunion, dia_horario)
  values (
    v_nombre, v_red, p_guia, v_sup, p_dia, lpad(p_hora, 5, '0'),
    case when p_dia is not null then
      (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[p_dia + 1]
      || coalesce(' ' || lpad(p_hora, 5, '0') || ' hs', '')
    end
  )
  returning id into v_id;

  if p_coguia is not null and p_guia is not null then
    insert into public.grupo_guias (grupo_id, guia_id) values (v_id, p_coguia);
  end if;

  perform public.sincronizar_guias_con_supervision(v_id);
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.aprobar_cuenta(p_perfil uuid, p_rol text, p_grupo uuid DEFAULT NULL::uuid, p_grupo_nuevo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if (select guia_id from public.groups where id = v_gid) is null then
      update public.groups set guia_id = p_perfil where id = v_gid;   -- grupo armado sin guía: queda como principal
    elsif (select guia_id from public.groups where id = v_gid) <> p_perfil then
      insert into public.grupo_guias (grupo_id, guia_id) values (v_gid, p_perfil) on conflict do nothing;
    end if;
  elsif v_nombre is not null then
    -- Si ya existe uno con ese nombre (por ejemplo, lo pidieron dos personas), se suma ahí
    select id into v_gid from public.groups where red_id = v_red and lower(trim(nombre)) = lower(v_nombre) limit 1;
    if v_gid is null then
      insert into public.groups (nombre, red_id, guia_id, supervisor_id)
      values (v_nombre, v_red, p_perfil, case when public.mi_rol() = 'guia_supervisor' then auth.uid() end)
      returning id into v_gid;
    elsif (select guia_id from public.groups where id = v_gid) is null then
      update public.groups set guia_id = p_perfil where id = v_gid;
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
$function$;

revoke execute on function public.crear_grupo_con_guias(text, uuid, uuid, smallint, text, uuid) from public, anon;
grant execute on function public.crear_grupo_con_guias(text, uuid, uuid, smallint, text, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
