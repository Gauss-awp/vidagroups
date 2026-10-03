-- =====================================================================
-- VidaGroups · Etapa 9: historial de liderazgo y notas pastorales
--   1. Quién guió y supervisó cada grupo, y desde/hasta cuándo
--   2. Notas por hermano y del grupo, que pasan de un guía al siguiente.
--      Las ven SOLO el guía del grupo (y co-guías) y su Guía Supervisor.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Historial de liderazgo
-- ---------------------------------------------------------------------
create table if not exists public.historial_liderazgo (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.groups(id) on delete cascade,
  rol       text not null check (rol in ('guia', 'supervisor')),
  perfil_id uuid references public.profiles(id) on delete set null,
  nombre    text not null default '',   -- se guarda el nombre por si la cuenta se borra
  desde     timestamptz not null default now(),
  hasta     timestamptz
);
create index if not exists historial_grupo_idx on public.historial_liderazgo(grupo_id, desde desc);

create or replace function public.nombre_de_perfil(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email, '')
    from public.profiles where id = p_id
$$;

-- Registra los cambios de guía y de supervisor de cada grupo
create or replace function public.registrar_liderazgo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.guia_id is distinct from old.guia_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'guia' and hasta is null;
    if new.guia_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'guia', new.guia_id, public.nombre_de_perfil(new.guia_id));
    end if;
  end if;

  if tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'supervisor' and hasta is null;
    if new.supervisor_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'supervisor', new.supervisor_id, public.nombre_de_perfil(new.supervisor_id));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registrar_liderazgo on public.groups;
create trigger trg_registrar_liderazgo
  after insert or update on public.groups
  for each row execute function public.registrar_liderazgo();

-- Punto de partida: el guía y el supervisor actuales de cada grupo, desde que se creó
insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre, desde)
select g.id, 'guia', g.guia_id, public.nombre_de_perfil(g.guia_id), g.creado_en
  from public.groups g
 where not exists (select 1 from public.historial_liderazgo h where h.grupo_id = g.id and h.rol = 'guia');

insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre, desde)
select g.id, 'supervisor', g.supervisor_id, public.nombre_de_perfil(g.supervisor_id), g.creado_en
  from public.groups g
 where g.supervisor_id is not null
   and not exists (select 1 from public.historial_liderazgo h where h.grupo_id = g.id and h.rol = 'supervisor');

alter table public.historial_liderazgo enable row level security;
revoke all on public.historial_liderazgo from anon;
grant select on public.historial_liderazgo to authenticated;

drop policy if exists historial_select on public.historial_liderazgo;
create policy historial_select on public.historial_liderazgo
  for select to authenticated using (public.puede_gestionar_grupo(grupo_id));

drop policy if exists solo_mi_iglesia on public.historial_liderazgo;
create policy solo_mi_iglesia on public.historial_liderazgo as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

-- Historial con la asistencia promedio de cada período (respeta permisos)
create or replace function public.historial_grupo(p_grupo uuid)
returns table (rol text, nombre text, desde timestamptz, hasta timestamptz, reuniones int, asistencia int)
language sql stable security invoker set search_path = public as $$
  select h.rol, h.nombre, h.desde, h.hasta,
         count(distinct r.id)::int,
         case when count(distinct r.id) = 0 then null
              else round(100.0 * count(a.miembro_id) filter (where a.presente)
                         / nullif(count(distinct r.id) * greatest(
                             (select count(*) from public.miembros_grupo m where m.grupo_id = p_grupo and m.activo), 1), 0))::int
         end
    from public.historial_liderazgo h
    left join public.reuniones r
      on r.grupo_id = h.grupo_id
     and r.fecha >= h.desde::date
     and (h.hasta is null or r.fecha < h.hasta::date)
    left join public.asistencias a on a.reunion_id = r.id
   where h.grupo_id = p_grupo
   group by h.id, h.rol, h.nombre, h.desde, h.hasta
   order by h.rol, h.desde desc
$$;

-- ---------------------------------------------------------------------
-- 2. Notas pastorales
-- ---------------------------------------------------------------------
create table if not exists public.notas_pastorales (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.groups(id) on delete cascade,
  miembro_id uuid references public.miembros_grupo(id) on delete cascade,  -- vacío = nota del grupo
  autor_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  autor      text not null default '',
  texto      text not null check (length(trim(texto)) > 0),
  creado_en  timestamptz not null default now()
);
create index if not exists notas_grupo_idx on public.notas_pastorales(grupo_id, creado_en desc);
create index if not exists notas_miembro_idx on public.notas_pastorales(miembro_id, creado_en desc);

-- Solo el guía del grupo (o co-guía) y su Guía Supervisor. No Encargados, Pastores ni Apóstol.
create or replace function public.puede_ver_notas(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         g.guia_id = auth.uid()
         or public.es_coguia(g.id)
         or (g.supervisor_id = auth.uid() and public.mi_rol() = 'guia_supervisor')
       )
  )
$$;

-- El nombre del autor queda guardado; el miembro tiene que ser del grupo
create or replace function public.completar_nota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := auth.uid();
  new.autor := coalesce(public.nombre_de_perfil(auth.uid()), '');
  if new.miembro_id is not null and public.grupo_de_miembro(new.miembro_id) is distinct from new.grupo_id then
    raise exception 'El hermano no es de este grupo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_completar_nota on public.notas_pastorales;
create trigger trg_completar_nota
  before insert on public.notas_pastorales
  for each row execute function public.completar_nota();

alter table public.notas_pastorales enable row level security;
revoke all on public.notas_pastorales from anon;
grant select, insert, update, delete on public.notas_pastorales to authenticated;

drop policy if exists notas_select on public.notas_pastorales;
create policy notas_select on public.notas_pastorales
  for select to authenticated using (public.puede_ver_notas(grupo_id));

drop policy if exists notas_insert on public.notas_pastorales;
create policy notas_insert on public.notas_pastorales
  for insert to authenticated with check (public.puede_ver_notas(grupo_id));

-- Cada uno edita o borra solo sus propias notas
drop policy if exists notas_update on public.notas_pastorales;
create policy notas_update on public.notas_pastorales
  for update to authenticated
  using (autor_id = auth.uid() and public.puede_ver_notas(grupo_id))
  with check (autor_id = auth.uid() and public.puede_ver_notas(grupo_id));

drop policy if exists notas_delete on public.notas_pastorales;
create policy notas_delete on public.notas_pastorales
  for delete to authenticated using (autor_id = auth.uid());

drop policy if exists solo_mi_iglesia on public.notas_pastorales;
create policy solo_mi_iglesia on public.notas_pastorales as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

-- ---------------------------------------------------------------------
-- 3. Permisos de las funciones nuevas
-- ---------------------------------------------------------------------
revoke execute on function public.nombre_de_perfil(uuid) from public, anon;
revoke execute on function public.puede_ver_notas(uuid) from public, anon;
revoke execute on function public.historial_grupo(uuid) from public, anon;
revoke execute on function public.registrar_liderazgo() from public, anon, authenticated;
revoke execute on function public.completar_nota() from public, anon, authenticated;
grant execute on function public.nombre_de_perfil(uuid) to authenticated;
grant execute on function public.puede_ver_notas(uuid) to authenticated;
grant execute on function public.historial_grupo(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
