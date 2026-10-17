-- =====================================================================
-- VidaGroups · Etapa 18: rol "Administrador" (administración técnica)
--   Para quien administra la app sin ser parte del liderazgo pastoral.
--   Puede: cuentas y roles, estructura (grupos, guías, supervisores,
--   responsables de red), equipo desde planilla y la salud del sistema.
--   NO puede ver: miembros, asistencia, consolidación, notas, ofrendas ni
--   pagos. Todo lo hace a través de funciones que devuelven solo lo necesario.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol = any (array['apostol', 'pastor', 'guia_supervisor', 'consolidacion', 'guia', 'administrador']));

-- Para soporte: cuándo entró cada uno por última vez y con qué versión de la app
alter table public.profiles
  add column if not exists ultimo_acceso timestamptz,
  add column if not exists app_version text;

create or replace function public.es_administrador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'administrador' and estado = 'activo')
$$;

CREATE OR REPLACE FUNCTION public.validar_cambios_perfil()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if auth.uid() is not null and not public.es_apostol() and not public.es_administrador() then
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
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_preaprobaciones(p_red uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_x record;
  v_aplicados int := 0;
begin
  if not (public.administra_red(p_red) or public.es_administrador()) then
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
$function$;

drop policy if exists preaprobaciones_admin on public.preaprobaciones;
create policy preaprobaciones_admin on public.preaprobaciones
  for all to authenticated using (public.es_administrador()) with check (public.es_administrador());

-- La app avisa cada vez que se abre (último acceso y versión)
create or replace function public.registrar_acceso(p_version text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set ultimo_acceso = now(), app_version = left(p_version, 60) where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Funciones del panel del Administrador (todas verifican el rol)
-- ---------------------------------------------------------------------
create or replace function public.solo_administrador()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo el Administrador puede hacer esto';
  end if;
end;
$$;

-- Salud del sistema: solo números, ningún dato de personas
create or replace function public.admin_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_igl uuid := public.mi_iglesia();
  v jsonb;
begin
  perform public.solo_administrador();
  with
  pf as (select * from public.profiles where iglesia_id = v_igl),
  gr as (select g.* from public.groups g join public.redes r on r.id = g.red_id where r.iglesia_id = v_igl),
  re as (select x.* from public.reuniones x where x.grupo_id in (select id from gr))
  select jsonb_build_object(
    'cuentas', (select count(*) from pf),
    'pendientes', (select count(*) from pf where estado = 'pendiente'),
    'inactivas', (select count(*) from pf where estado = 'inactivo'),
    'activos_7_dias', (select count(*) from pf where ultimo_acceso > now() - interval '7 days'),
    'nunca_entraron', (select count(*) from pf where estado = 'activo' and ultimo_acceso is null),
    'por_rol', (select coalesce(jsonb_object_agg(rol, n), '{}'::jsonb) from (select rol, count(*) n from pf where estado = 'activo' group by rol) t),
    'versiones', (select coalesce(jsonb_object_agg(coalesce(app_version, 'sin datos'), n), '{}'::jsonb)
                    from (select app_version, count(*) n from pf where estado = 'activo' group by app_version) t),
    'grupos', (select count(*) from gr),
    'grupos_con_reunion_semana', (select count(distinct grupo_id) from re where fecha >= date_trunc('week', current_date)::date),
    'grupos_sin_reunion_14', (select count(*) from gr where not exists (select 1 from re where re.grupo_id = gr.id and re.fecha >= current_date - 14)),
    'semanas', (select coalesce(jsonb_agg(jsonb_build_object('semana', s, 'grupos', n) order by s), '[]'::jsonb)
                  from (select date_trunc('week', fecha)::date s, count(distinct grupo_id) n
                          from re where fecha >= current_date - 56 and fecha <= current_date group by 1) t),
    'preaprobaciones_pendientes', (select count(*) from public.preaprobaciones x join public.redes r on r.id = x.red_id
                                    where r.iglesia_id = v_igl and x.aplicado_en is null),
    'registros', jsonb_build_object(
      'miembros', (select count(*) from public.miembros_grupo where grupo_id in (select id from gr)),
      'reuniones', (select count(*) from re),
      'asistencias', (select count(*) from public.asistencias where reunion_id in (select id from re)),
      'tarjetas', (select count(*) from public.tarjetas_consolidacion t join public.redes r on r.id = t.red_id where r.iglesia_id = v_igl)
    ),
    'base_bytes', pg_database_size(current_database()),
    'tablas_sin_seguridad', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity)
  ) into v;
  return v;
end;
$$;

-- Cuentas (sin teléfono ni datos personales más allá de nombre y correo)
create or replace function public.admin_cuentas()
returns table (
  id uuid, nombre text, apellido text, email text, rol text, estado text,
  red_id uuid, red text, supervisor_id uuid, supervisor text,
  creado_en timestamptz, ultimo_acceso timestamptz, app_version text,
  grupos_que_guia int, responsabilidades text[]
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  return query
  select p.id, p.nombre, p.apellido, p.email, p.rol, p.estado,
         p.red_id, r.nombre, p.supervisor_id,
         coalesce(nullif(trim(coalesce(s.nombre, '') || ' ' || coalesce(s.apellido, '')), ''), s.email),
         p.creado_en, p.ultimo_acceso, p.app_version,
         (select count(*)::int from public.groups g where g.guia_id = p.id),
         array_remove(array[
           case when exists (select 1 from public.redes_pastores x where x.perfil_id = p.id) then 'Pastor de red' end,
           case when exists (select 1 from public.redes_encargados x where x.perfil_id = p.id) then 'Encargado de red' end,
           case when exists (select 1 from public.redes_consolidadores x where x.perfil_id = p.id) then 'Consolidador/a' end
         ], null)
    from public.profiles p
    left join public.redes r on r.id = p.red_id
    left join public.profiles s on s.id = p.supervisor_id
   where p.iglesia_id = public.mi_iglesia()
   order by (p.estado = 'pendiente') desc, p.nombre, p.email;
end;
$$;

-- Grupos: estructura y uso (si cargan reuniones). Sin miembros ni asistencia por persona.
create or replace function public.admin_grupos()
returns table (
  id uuid, nombre text, red_id uuid, red text, guia_id uuid, guia text,
  supervisor text, segundos text[], miembros int, ultima_reunion date, reuniones_4_semanas int
)
language plpgsql stable security definer set search_path = public as $$
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
         (select count(*)::int from public.reuniones re where re.grupo_id = g.id and re.fecha between current_date - 28 and current_date)
    from public.groups g
    join public.redes r on r.id = g.red_id
    left join public.profiles pg on pg.id = g.guia_id
    left join public.profiles ps on ps.id = g.supervisor_id
   where r.iglesia_id = public.mi_iglesia()
   order by r.nombre, g.nombre;
end;
$$;

-- Cambiar rol, estado, red o supervisor de una cuenta (con los controles de siempre)
create or replace function public.admin_actualizar_cuenta(p_id uuid, p_rol text, p_estado text, p_red uuid, p_supervisor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  if p_id = auth.uid() then
    raise exception 'No podés cambiar tu propia cuenta desde acá';
  end if;
  if not exists (select 1 from public.profiles where id = p_id and iglesia_id = public.mi_iglesia()) then
    raise exception 'Esa cuenta no es de tu iglesia';
  end if;
  update public.profiles
     set rol = p_rol, estado = p_estado, red_id = p_red, supervisor_id = p_supervisor
   where id = p_id;
end;
$$;

create or replace function public.admin_cambiar_guia(p_grupo uuid, p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  if not exists (select 1 from public.groups g join public.redes r on r.id = g.red_id
                  where g.id = p_grupo and r.iglesia_id = public.mi_iglesia()) then
    raise exception 'Ese grupo no es de tu iglesia';
  end if;
  update public.groups set guia_id = p_perfil where id = p_grupo;
end;
$$;

create or replace function public.admin_segundo_supervisor(p_grupo uuid, p_perfil uuid, p_agregar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  if p_agregar then
    insert into public.grupo_supervisores (grupo_id, perfil_id) values (p_grupo, p_perfil) on conflict do nothing;
  else
    delete from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = p_perfil;
  end if;
end;
$$;

create or replace function public.admin_responsable(p_red uuid, p_perfil uuid, p_tipo text, p_agregar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  if not exists (select 1 from public.redes where id = p_red and iglesia_id = public.mi_iglesia()) then
    raise exception 'Esa red no es de tu iglesia';
  end if;
  if p_tipo = 'pastor' then
    if p_agregar then insert into public.redes_pastores (red_id, perfil_id) values (p_red, p_perfil) on conflict do nothing;
    else delete from public.redes_pastores where red_id = p_red and perfil_id = p_perfil; end if;
  elsif p_tipo = 'encargado' then
    if p_agregar then insert into public.redes_encargados (red_id, perfil_id) values (p_red, p_perfil) on conflict do nothing;
    else delete from public.redes_encargados where red_id = p_red and perfil_id = p_perfil; end if;
  elsif p_tipo = 'consolidador' then
    if p_agregar then insert into public.redes_consolidadores (red_id, perfil_id) values (p_red, p_perfil) on conflict do nothing;
    else delete from public.redes_consolidadores where red_id = p_red and perfil_id = p_perfil; end if;
  else
    raise exception 'Tipo de responsabilidad inválido';
  end if;
end;
$$;

-- Responsables de cada red (solo nombres)
create or replace function public.admin_responsables()
returns table (red_id uuid, red text, tipo text, perfil_id uuid, nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  return query
  select r.id, r.nombre, t.tipo, p.id, coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email)
    from public.redes r
    join (
      select x1.red_id as rid, x1.perfil_id as pid, 'pastor'::text as tipo from public.redes_pastores x1
      union all select x2.red_id, x2.perfil_id, 'encargado' from public.redes_encargados x2
      union all select x3.red_id, x3.perfil_id, 'consolidador' from public.redes_consolidadores x3
    ) t on t.rid = r.id
    join public.profiles p on p.id = t.pid
   where r.iglesia_id = public.mi_iglesia()
   order by r.nombre, t.tipo, 5;
end;
$$;

-- Borrar una cuenta (no puede ser guía de un grupo)
create or replace function public.admin_eliminar_cuenta(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  if p_id = auth.uid() then
    raise exception 'Para borrar tu propia cuenta usá Perfil';
  end if;
  if not exists (select 1 from public.profiles where id = p_id and iglesia_id = public.mi_iglesia()) then
    raise exception 'Esa cuenta no es de tu iglesia';
  end if;
  if exists (select 1 from public.groups where guia_id = p_id) then
    raise exception 'Es guía de un grupo: primero asigná otro guía';
  end if;
  perform set_config('app.dev_switch', 'on', true);
  delete from public.relaciones_supervision where guia_id = p_id or supervisor_id = p_id;
  update public.profiles set supervisor_id = null where supervisor_id = p_id;
  update public.tarjetas_consolidacion set creado_por = null where creado_por = p_id;
  delete from auth.users where id = p_id;
end;
$$;

-- Cambios de rol y estado (de la auditoría), sin otros datos
create or replace function public.admin_cambios_roles()
returns table (fecha timestamptz, persona text, rol_antes text, rol_despues text, estado_antes text, estado_despues text, quien text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  return query
  select a.fecha, coalesce(a.despues ->> 'email', a.antes ->> 'email'),
         a.antes ->> 'rol', a.despues ->> 'rol', a.antes ->> 'estado', a.despues ->> 'estado',
         q.email
    from public.auditoria a
    left join public.profiles q on q.id = a.usuario_id
   where a.tabla = 'profiles'
     and ((a.antes ->> 'rol') is distinct from (a.despues ->> 'rol') or (a.antes ->> 'estado') is distinct from (a.despues ->> 'estado'))
     and coalesce(a.despues ->> 'iglesia_id', a.antes ->> 'iglesia_id') = public.mi_iglesia()::text
   order by a.fecha desc
   limit 50;
end;
$$;

-- Permisos
do $$
declare f text;
begin
  foreach f in array array[
    'public.es_administrador()', 'public.registrar_acceso(text)', 'public.solo_administrador()',
    'public.admin_resumen()', 'public.admin_cuentas()', 'public.admin_grupos()',
    'public.admin_actualizar_cuenta(uuid, text, text, uuid, uuid)', 'public.admin_cambiar_guia(uuid, uuid)',
    'public.admin_segundo_supervisor(uuid, uuid, boolean)', 'public.admin_responsable(uuid, uuid, text, boolean)',
    'public.admin_responsables()', 'public.admin_eliminar_cuenta(uuid)', 'public.admin_cambios_roles()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
