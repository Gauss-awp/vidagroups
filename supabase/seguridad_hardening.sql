-- =====================================================================
-- VidaGroups · Endurecimiento de seguridad (auditoría)
-- Ejecutar UNA vez en Supabase → SQL Editor → Run. Corre en una transacción.
-- No cambia lo que ve cada rol en la app: cierra accesos que la app no usa
-- y agrega registro de auditoría.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- V-03 · Funciones auxiliares: nadie sin sesión puede ejecutarlas.
-- Las de trigger no se pueden llamar desde la API.
-- ---------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma, p.prorettype = 'trigger'::regtype as es_trigger
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    if f.es_trigger then
      execute format('revoke execute on function %s from authenticated', f.firma);
    else
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end;
$$;

-- Lo que se cree en el futuro tampoco queda abierto para usuarios sin sesión
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- V-04 · El organigrama solo se consulta desde uno mismo (o el Apóstol)
-- ---------------------------------------------------------------------
create or replace function public.subordinados(p_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive arbol as (
    select id from public.profiles where supervisor_id = p_id
    union
    select p.id from public.profiles p join arbol a on p.supervisor_id = a.id
  )
  select id from arbol
   where p_id = auth.uid() or auth.uid() is null or public.es_apostol()
$$;

create or replace function public.superiores(p_id uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive cadena as (
    select supervisor_id as id from public.profiles where id = p_id and supervisor_id is not null
    union
    select p.supervisor_id from public.profiles p join cadena c on p.id = c.id where p.supervisor_id is not null
  )
  select id from cadena
   where p_id = auth.uid() or auth.uid() is null or public.es_apostol()
$$;

-- ---------------------------------------------------------------------
-- V-06 · Registro de auditoría (pagos, tarjetas, roles)
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  registro_id text,
  accion      text not null,
  antes       jsonb,
  despues     jsonb,
  usuario_id  uuid default auth.uid(),
  fecha       timestamptz not null default now()
);
create index if not exists auditoria_fecha_idx on public.auditoria(fecha desc);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated using (public.es_apostol() or public.es_pastor());

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria (tabla, registro_id, accion, antes, despues, usuario_id)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

drop trigger if exists trg_auditoria_pagos on public.pagos_evento;
create trigger trg_auditoria_pagos after insert or update or delete on public.pagos_evento
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria_eventos on public.eventos;
create trigger trg_auditoria_eventos after update or delete on public.eventos
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria_tarjetas on public.tarjetas_consolidacion;
create trigger trg_auditoria_tarjetas after update or delete on public.tarjetas_consolidacion
  for each row execute function public.registrar_auditoria();

drop trigger if exists trg_auditoria_perfiles on public.profiles;
create trigger trg_auditoria_perfiles after update of rol, estado, red_id, supervisor_id on public.profiles
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- V-07 · Un pago no cambia de evento, de hermano ni de quién lo registró
-- ---------------------------------------------------------------------
create or replace function public.proteger_pago()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.evento_id is distinct from old.evento_id
     or new.miembro_id is distinct from old.miembro_id
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Un pago no puede cambiar de evento, de hermano ni de responsable. Borralo y cargalo de nuevo.';
  end if;
  return new;
end;
$$;
revoke execute on function public.proteger_pago() from public, anon, authenticated;

drop trigger if exists trg_proteger_pago on public.pagos_evento;
create trigger trg_proteger_pago before update on public.pagos_evento
  for each row execute function public.proteger_pago();

-- ---------------------------------------------------------------------
-- V-08 · El guía solo puede marcar el avance de la tarjeta, no reasignarla
-- ---------------------------------------------------------------------
create or replace function public.limitar_edicion_guia_tarjeta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_permitidos text[] := array['fonovisita','visita','pilares','pilar_1','pilar_2','pilar_3','pilar_4','pilar_5',
                               'comenzo_gv','encuentro','observacion','notas'];
begin
  if auth.uid() is null
     or public.administra_red(old.red_id)
     or (public.mi_rol() = 'consolidacion' and old.red_id = public.mi_red()) then
    return new;
  end if;
  if (to_jsonb(new) - v_permitidos) is distinct from (to_jsonb(old) - v_permitidos) then
    raise exception 'Como guía solo podés marcar el avance de la tarjeta';
  end if;
  return new;
end;
$$;
revoke execute on function public.limitar_edicion_guia_tarjeta() from public, anon, authenticated;

drop trigger if exists trg_limitar_guia_tarjeta on public.tarjetas_consolidacion;
create trigger trg_limitar_guia_tarjeta before update on public.tarjetas_consolidacion
  for each row execute function public.limitar_edicion_guia_tarjeta();

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- V-01 · ANTES DE PUBLICAR: borrar el modo dev (descomentar y ejecutar)
-- ---------------------------------------------------------------------
-- drop function if exists public.dev_cambiar_mi_rol(text);
