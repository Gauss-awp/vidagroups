-- =====================================================================
-- VidaGroups · Etapa 25: "Reportar un problema o sugerencia"
--   Cada persona puede escribir desde Perfil → Ayuda. Le llega al
--   Administrador, que responde desde su panel. La persona ve la respuesta
--   en "Mis mensajes". Nadie más ve estos mensajes.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

create table if not exists public.mensajes_ayuda (
  id           uuid primary key default gen_random_uuid(),
  perfil_id    uuid references public.profiles(id) on delete cascade,
  iglesia_id   uuid references public.iglesias(id) on delete cascade,
  tipo         text not null default 'problema' check (tipo in ('problema', 'sugerencia', 'pregunta')),
  mensaje      text not null check (length(trim(mensaje)) > 0),
  pantalla     text,
  version      text,
  plataforma   text,
  estado       text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'resuelto')),
  respuesta    text,
  respondido_en timestamptz,
  creado_en    timestamptz not null default now()
);
create index if not exists mensajes_ayuda_fecha_idx on public.mensajes_ayuda(creado_en desc);

-- Quién y de qué iglesia lo pone la base (no se puede falsear desde la app)
create or replace function public.preparar_mensaje_ayuda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.perfil_id := auth.uid();
    new.iglesia_id := public.mi_iglesia();
    new.estado := 'nuevo';
    new.respuesta := null;
    new.respondido_en := null;
    new.mensaje := left(new.mensaje, 2000);
    new.pantalla := left(new.pantalla, 200);
    new.version := left(new.version, 60);
    new.plataforma := left(new.plataforma, 20);
  else
    -- Al responder, se guarda cuándo
    if new.respuesta is distinct from old.respuesta and new.respuesta is not null then
      new.respondido_en := now();
      if new.estado = 'nuevo' then new.estado := 'visto'; end if;
    end if;
    -- Nadie cambia el texto ni el autor una vez enviado
    new.mensaje := old.mensaje;
    new.perfil_id := old.perfil_id;
    new.iglesia_id := old.iglesia_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.preparar_mensaje_ayuda() from public, anon, authenticated;
drop trigger if exists trg_preparar_mensaje_ayuda on public.mensajes_ayuda;
create trigger trg_preparar_mensaje_ayuda before insert or update on public.mensajes_ayuda
  for each row execute function public.preparar_mensaje_ayuda();

alter table public.mensajes_ayuda enable row level security;
revoke all on public.mensajes_ayuda from anon;
grant select, insert, update, delete on public.mensajes_ayuda to authenticated;

-- Cada uno escribe y ve los suyos
drop policy if exists mensajes_propios_insert on public.mensajes_ayuda;
create policy mensajes_propios_insert on public.mensajes_ayuda for insert to authenticated
  with check (auth.uid() is not null);
drop policy if exists mensajes_propios_select on public.mensajes_ayuda;
create policy mensajes_propios_select on public.mensajes_ayuda for select to authenticated
  using (perfil_id = auth.uid());

-- El Administrador ve todos los de su iglesia, responde y borra
drop policy if exists mensajes_admin on public.mensajes_ayuda;
create policy mensajes_admin on public.mensajes_ayuda for all to authenticated
  using (public.es_administrador() and (iglesia_id is null or iglesia_id = public.mi_iglesia()))
  with check (public.es_administrador());

-- Nombre de quien escribió (el Administrador no ve los perfiles completos)
create or replace function public.admin_mensajes()
returns table (id uuid, nombre text, email text, rol text, tipo text, mensaje text, pantalla text, version text,
               plataforma text, estado text, respuesta text, respondido_en timestamptz, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_administrador();
  return query
  select m.id, public.nombre_de_perfil(m.perfil_id), p.email, p.rol, m.tipo, m.mensaje, m.pantalla, m.version,
         m.plataforma, m.estado, m.respuesta, m.respondido_en, m.creado_en
    from public.mensajes_ayuda m
    left join public.profiles p on p.id = m.perfil_id
   where m.iglesia_id is null or m.iglesia_id = public.mi_iglesia()
   order by (m.estado = 'resuelto'), m.creado_en desc
   limit 200;
end;
$$;
revoke execute on function public.admin_mensajes() from public, anon;
grant execute on function public.admin_mensajes() to authenticated;

commit;

notify pgrst, 'reload schema';
