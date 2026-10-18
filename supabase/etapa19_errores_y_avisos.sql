-- =====================================================================
-- VidaGroups · Etapa 19: registro de errores de la app y avisos generales
--   · errores_app: la app guarda sola cada error (quién, pantalla, versión).
--     Solo lo ve el Administrador. No guarda datos de miembros.
--   · avisos: mensajes que el Administrador publica arriba en la app,
--     para todos o para un rol / una red, con fecha de vencimiento.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Errores de la app
-- ---------------------------------------------------------------------
create table if not exists public.errores_app (
  id          bigint generated always as identity primary key,
  perfil_id   uuid references public.profiles(id) on delete set null,
  iglesia_id  uuid references public.iglesias(id) on delete cascade,
  version     text,
  plataforma  text,
  pantalla    text,
  mensaje     text not null,
  detalle     text,
  fatal       boolean not null default false,
  creado_en   timestamptz not null default now()
);
create index if not exists errores_app_fecha_idx on public.errores_app(creado_en desc);

-- Textos acotados (que un error gigante no llene la base)
create or replace function public.acotar_error()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.perfil_id := auth.uid();
  new.iglesia_id := public.mi_iglesia();
  new.mensaje := left(coalesce(new.mensaje, ''), 500);
  new.detalle := left(new.detalle, 2000);
  new.pantalla := left(new.pantalla, 200);
  new.version := left(new.version, 60);
  new.plataforma := left(new.plataforma, 20);
  return new;
end;
$$;
revoke execute on function public.acotar_error() from public, anon, authenticated;
drop trigger if exists trg_acotar_error on public.errores_app;
create trigger trg_acotar_error before insert on public.errores_app
  for each row execute function public.acotar_error();

alter table public.errores_app enable row level security;
revoke all on public.errores_app from anon;
grant insert on public.errores_app to anon, authenticated;
grant select, delete on public.errores_app to authenticated;

-- Cualquiera puede reportar (también en la pantalla de ingreso, sin sesión)
drop policy if exists errores_insert on public.errores_app;
create policy errores_insert on public.errores_app for insert to anon, authenticated with check (true);

-- Solo el Administrador los ve y los borra
drop policy if exists errores_admin on public.errores_app;
create policy errores_admin on public.errores_app for select to authenticated
  using (public.es_administrador() and (iglesia_id is null or iglesia_id = public.mi_iglesia()));
drop policy if exists errores_admin_borrar on public.errores_app;
create policy errores_admin_borrar on public.errores_app for delete to authenticated
  using (public.es_administrador());

-- ---------------------------------------------------------------------
-- Avisos generales
-- ---------------------------------------------------------------------
create table if not exists public.avisos (
  id          uuid primary key default gen_random_uuid(),
  iglesia_id  uuid not null references public.iglesias(id) on delete cascade default public.mi_iglesia(),
  titulo      text not null check (length(trim(titulo)) > 0),
  mensaje     text,
  rol         text,           -- vacío = todos los roles
  red_id      uuid references public.redes(id) on delete cascade,  -- vacío = todas las redes
  desde       timestamptz not null default now(),
  hasta       timestamptz not null,
  creado_por  uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en   timestamptz not null default now()
);

alter table public.avisos enable row level security;
revoke all on public.avisos from anon;
grant select, insert, update, delete on public.avisos to authenticated;

-- Cada persona ve los avisos vigentes que son para su rol y su red
drop policy if exists avisos_ver on public.avisos;
create policy avisos_ver on public.avisos for select to authenticated
  using (
    iglesia_id = public.mi_iglesia()
    and (
      public.es_administrador()
      or (
        public.estoy_activo()
        and now() between desde and hasta
        and (rol is null or rol = public.mi_rol())
        and (red_id is null or red_id = public.mi_red())
      )
    )
  );

drop policy if exists avisos_admin on public.avisos;
create policy avisos_admin on public.avisos for all to authenticated
  using (public.es_administrador() and iglesia_id = public.mi_iglesia())
  with check (public.es_administrador() and iglesia_id = public.mi_iglesia());

commit;

notify pgrst, 'reload schema';
