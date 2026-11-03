-- =====================================================================
-- VidaGroups · Etapa 22: "Equipo del grupo" (supervisión por grupo)
--   Cada grupo tiene sus guías y sus supervisores, y se arman en un solo
--   lugar. El primero de cada uno es el principal (⭐).
--   · La supervisión ahora es DEL GRUPO: cambiar el guía no cambia quién
--     supervisa el grupo.
--   · El guía principal puede sumar o quitar a su segundo guía.
--   · Los supervisores los definen los encargados, el pastor de la red
--     o el Administrador.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- La supervisión queda en el grupo
-- ---------------------------------------------------------------------
-- Al crear un grupo, si no se eligió supervisión, toma la del guía.
-- Al cambiar el guía, la supervisión del grupo NO cambia.
create or replace function public.asignar_supervisor_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sup uuid;
  v_red uuid;
begin
  select supervisor_id, red_id into v_sup, v_red from public.profiles where id = new.guia_id;
  new.red_id := coalesce(new.red_id, v_red);
  if tg_op = 'INSERT' and new.supervisor_id is null then
    new.supervisor_id := v_sup;
  end if;
  return new;
end;
$$;

-- Si a un guía le asignan supervisor, solo completa los grupos que no tienen supervisión
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
     and supervisor_id is null
     and new.supervisor_id is not null;

  return new;
end;
$$;

-- Los guías del grupo quedan "a cargo" del supervisor principal del grupo
-- (así el supervisor ve sus datos de contacto y su panel funciona igual que antes)
create or replace function public.sincronizar_guias_con_supervision(p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sup uuid;
begin
  select supervisor_id into v_sup from public.groups where id = p_grupo;
  if v_sup is null then
    return;
  end if;
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles p
     set supervisor_id = v_sup
   where p.rol = 'guia'
     and p.supervisor_id is distinct from v_sup
     and (p.id = (select guia_id from public.groups where id = p_grupo)
          or p.id in (select guia_id from public.grupo_guias where grupo_id = p_grupo));
  perform set_config('app.dev_switch', 'off', true);
end;
$$;
revoke execute on function public.sincronizar_guias_con_supervision(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Quién puede editar qué
-- ---------------------------------------------------------------------
create or replace function public.puede_editar_guias(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (public.administra_red(g.red_id) or public.es_administrador() or g.guia_id = auth.uid())
  )
$$;

create or replace function public.puede_editar_supervision(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (public.administra_red(g.red_id) or public.es_administrador())
  )
$$;

-- ---------------------------------------------------------------------
-- El equipo de un grupo (todo junto, en una sola consulta)
-- ---------------------------------------------------------------------
create or replace function public.equipo_del_grupo(p_grupo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        select g.guia_id as id, public.nombre_de_perfil(g.guia_id) as nombre, true as principal
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
$$;

-- Personas que se pueden sumar (de la misma red, aprobadas, que no estén ya)
create or replace function public.equipo_candidatos(p_grupo uuid, p_tipo text)
returns table (id uuid, nombre text, rol text)
language plpgsql stable security definer set search_path = public as $$
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
         select g1.guia_id as x from public.groups g1 where g1.id = p_grupo and p_tipo = 'guia'
         union all select gg.guia_id from public.grupo_guias gg where gg.grupo_id = p_grupo and p_tipo = 'guia'
         union all select g2.supervisor_id from public.groups g2 where g2.id = p_grupo and p_tipo = 'supervisor' and g2.supervisor_id is not null
         union all select gs.perfil_id from public.grupo_supervisores gs where gs.grupo_id = p_grupo and p_tipo = 'supervisor'
       ) t
     )
   order by 2;
end;
$$;

-- Sumar a alguien al equipo
create or replace function public.equipo_agregar(p_grupo uuid, p_perfil uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo = 'guia' then
    if not public.puede_editar_guias(p_grupo) then raise exception 'No podés editar los guías de este grupo'; end if;
    insert into public.grupo_guias (grupo_id, guia_id) values (p_grupo, p_perfil) on conflict do nothing;
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
$$;

-- Marcar a alguien como principal (⭐)
create or replace function public.equipo_principal(p_grupo uuid, p_perfil uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ant uuid;
begin
  if p_tipo = 'guia' then
    if not public.puede_editar_guias(p_grupo) then raise exception 'No podés editar los guías de este grupo'; end if;
    select guia_id into v_ant from public.groups where id = p_grupo;
    if v_ant = p_perfil then return; end if;
    if not exists (select 1 from public.grupo_guias where grupo_id = p_grupo and guia_id = p_perfil) then
      raise exception 'Primero sumalo como guía del grupo';
    end if;
    delete from public.grupo_guias where grupo_id = p_grupo and guia_id = p_perfil;
    update public.groups set guia_id = p_perfil where id = p_grupo;
    insert into public.grupo_guias (grupo_id, guia_id) values (p_grupo, v_ant) on conflict do nothing;
  elsif p_tipo = 'supervisor' then
    if not public.puede_editar_supervision(p_grupo) then raise exception 'No podés editar la supervisión de este grupo'; end if;
    select supervisor_id into v_ant from public.groups where id = p_grupo;
    if v_ant = p_perfil then return; end if;
    if not exists (select 1 from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = p_perfil) then
      raise exception 'Primero sumalo a la supervisión del grupo';
    end if;
    delete from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = p_perfil;
    update public.groups set supervisor_id = p_perfil where id = p_grupo;
    if v_ant is not null then
      insert into public.grupo_supervisores (grupo_id, perfil_id) values (p_grupo, v_ant) on conflict do nothing;
    end if;
    perform public.sincronizar_guias_con_supervision(p_grupo);
  else
    raise exception 'Tipo inválido';
  end if;
end;
$$;

-- Quitar a alguien del equipo (si era el principal, pasa el siguiente)
create or replace function public.equipo_quitar(p_grupo uuid, p_perfil uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_principal uuid;
  v_sig uuid;
begin
  if p_tipo = 'guia' then
    if not public.puede_editar_guias(p_grupo) then raise exception 'No podés editar los guías de este grupo'; end if;
    select guia_id into v_principal from public.groups where id = p_grupo;
    if p_perfil <> v_principal then
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
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.puede_editar_guias(uuid)', 'public.puede_editar_supervision(uuid)', 'public.equipo_del_grupo(uuid)',
    'public.equipo_candidatos(uuid, text)', 'public.equipo_agregar(uuid, uuid, text)',
    'public.equipo_principal(uuid, uuid, text)', 'public.equipo_quitar(uuid, uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
