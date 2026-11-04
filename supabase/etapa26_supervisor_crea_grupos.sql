-- =====================================================================
-- VidaGroups · Etapa 26: los Guías Supervisores crean grupos y asignan guías
--   · Un Guía Supervisor puede crear un grupo en su red y elegir uno o dos
--     guías (aunque ya guíen otro grupo). Queda como su supervisor.
--   · Los guías de un grupo los asignan su Guía Supervisor, los encargados,
--     el pastor de la red o el Administrador. El guía ya no puede sumarse
--     compañeros por su cuenta (así nadie queda en un grupo que no es el suyo).
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

-- Quién puede cambiar los guías de un grupo
create or replace function public.puede_editar_guias(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         public.administra_red(g.red_id)
         or public.es_administrador()
         or (public.mi_rol() = 'guia_supervisor' and (g.supervisor_id = auth.uid() or public.es_cosupervisor(g.id)))
       )
  )
$$;

-- ¿Puedo crear grupos en esta red?
create or replace function public.puede_crear_grupo(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and (
    public.administra_red(p_red)
    or public.es_administrador()
    or (public.mi_rol() = 'guia_supervisor' and public.mi_red() = p_red)
  )
$$;

-- Guías que se pueden asignar (de la red, aprobados), con los grupos que ya guían
create or replace function public.candidatos_guias_red(p_red uuid default null)
returns table (id uuid, nombre text, rol text, grupos text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_red uuid := coalesce(p_red, public.mi_red());
begin
  if not public.puede_crear_grupo(v_red) then
    raise exception 'No podés armar grupos en esta red';
  end if;
  return query
  select p.id, public.nombre_de_perfil(p.id), p.rol,
         (select string_agg(x.nombre, ', ' order by x.nombre) from (
            select g.nombre from public.groups g where g.guia_id = p.id
            union select g2.nombre from public.grupo_guias gg join public.groups g2 on g2.id = gg.grupo_id where gg.guia_id = p.id
          ) x)
    from public.profiles p
   where p.red_id = v_red and p.estado = 'activo' and p.rol in ('guia', 'guia_supervisor')
   order by 2;
end;
$$;

-- Crear un grupo con su guía principal (y opcionalmente un segundo guía)
create or replace function public.crear_grupo_con_guias(
  p_nombre text, p_guia uuid, p_coguia uuid default null,
  p_dia smallint default null, p_hora text default null, p_red uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
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
  if not exists (select 1 from public.profiles where id = p_guia and red_id = v_red and estado = 'activo' and rol in ('guia', 'guia_supervisor')) then
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

  if p_coguia is not null then
    insert into public.grupo_guias (grupo_id, guia_id) values (v_id, p_coguia);
  end if;

  perform public.sincronizar_guias_con_supervision(v_id);
  return v_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.puede_editar_guias(uuid)', 'public.puede_crear_grupo(uuid)', 'public.candidatos_guias_red(uuid)',
    'public.crear_grupo_con_guias(text, uuid, uuid, smallint, text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
