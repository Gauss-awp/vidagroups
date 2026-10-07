-- =====================================================================
-- VidaGroups · Etapa 15: desde cuándo cada hermano es guía o equipo
--   Así la planilla de asistencia lo pinta de azul/celeste solo desde el
--   mes en que pasó a ser parte del equipo, y no en los meses anteriores.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

create table if not exists public.miembros_rol_historial (
  id         uuid primary key default gen_random_uuid(),
  miembro_id uuid not null references public.miembros_grupo(id) on delete cascade,
  rol        text check (rol is null or rol in ('guia', 'equipo')),  -- vacío = volvió a ser miembro
  desde      timestamptz not null default now()
);
create index if not exists miembros_rol_historial_idx on public.miembros_rol_historial(miembro_id, desde);

-- Cada cambio de rol queda registrado con su fecha
create or replace function public.registrar_rol_equipo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.rol_equipo is not null)
     or (tg_op = 'UPDATE' and new.rol_equipo is distinct from old.rol_equipo) then
    insert into public.miembros_rol_historial (miembro_id, rol) values (new.id, new.rol_equipo);
  end if;
  return new;
end;
$$;
revoke execute on function public.registrar_rol_equipo() from public, anon, authenticated;

drop trigger if exists trg_registrar_rol_equipo on public.miembros_grupo;
create trigger trg_registrar_rol_equipo after insert or update of rol_equipo on public.miembros_grupo
  for each row execute function public.registrar_rol_equipo();

-- Punto de partida: quienes ya son guía o equipo, desde hoy
insert into public.miembros_rol_historial (miembro_id, rol)
select m.id, m.rol_equipo from public.miembros_grupo m
 where m.rol_equipo is not null
   and not exists (select 1 from public.miembros_rol_historial h where h.miembro_id = m.id);

alter table public.miembros_rol_historial enable row level security;
revoke all on public.miembros_rol_historial from anon;
grant select, update on public.miembros_rol_historial to authenticated;

drop policy if exists rol_historial_select on public.miembros_rol_historial;
create policy rol_historial_select on public.miembros_rol_historial
  for select to authenticated using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

-- El importador ajusta la fecha "desde" al mes de la planilla en que aparece como G o equipo
drop policy if exists rol_historial_update on public.miembros_rol_historial;
create policy rol_historial_update on public.miembros_rol_historial
  for update to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)))
  with check (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

drop policy if exists solo_mi_iglesia on public.miembros_rol_historial;
create policy solo_mi_iglesia on public.miembros_rol_historial as restrictive for all to authenticated
  using (public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia());

commit;

notify pgrst, 'reload schema';
