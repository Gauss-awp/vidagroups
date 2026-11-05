-- =====================================================================
-- VidaGroups · Etapa 28: Centro de Eventos
--   · Anotados: quiénes van a cada evento (se anota a mano, desde una
--     planilla, o solo al registrar su primer pago).
--   · Datos nuevos del evento: lugar, cupo, cierre de inscripción y estado.
--   · Los permisos son los mismos que los pagos: cada guía ve a los de su
--     grupo; los encargados, a los de toda su red.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.eventos
  add column if not exists lugar text,
  add column if not exists cupo int check (cupo is null or cupo > 0),
  add column if not exists cierre_inscripcion date,
  add column if not exists estado text not null default 'activo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_estado_valido') then
    alter table public.eventos add constraint eventos_estado_valido check (estado in ('activo', 'cerrado', 'cancelado'));
  end if;
end;
$$;

create table if not exists public.evento_inscriptos (
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  miembro_id uuid not null references public.miembros_grupo(id) on delete cascade,
  nota       text,
  creado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en  timestamptz not null default now(),
  primary key (evento_id, miembro_id)
);
create index if not exists evento_inscriptos_miembro_idx on public.evento_inscriptos(miembro_id);

alter table public.evento_inscriptos enable row level security;
revoke all on public.evento_inscriptos from anon;
grant select, insert, update, delete on public.evento_inscriptos to authenticated;

drop policy if exists inscriptos_select on public.evento_inscriptos;
create policy inscriptos_select on public.evento_inscriptos for select to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

drop policy if exists inscriptos_insert on public.evento_inscriptos;
create policy inscriptos_insert on public.evento_inscriptos for insert to authenticated
  with check (
    public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))
    and public.evento_aplica_a_grupo(evento_id, public.grupo_de_miembro(miembro_id))
  );

drop policy if exists inscriptos_update on public.evento_inscriptos;
create policy inscriptos_update on public.evento_inscriptos for update to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)))
  with check (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

drop policy if exists inscriptos_delete on public.evento_inscriptos;
create policy inscriptos_delete on public.evento_inscriptos for delete to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

drop policy if exists solo_mi_iglesia on public.evento_inscriptos;
create policy solo_mi_iglesia on public.evento_inscriptos as restrictive for all to authenticated
  using (public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia());

-- Al registrar un pago, la persona queda anotada sola
create or replace function public.anotar_al_pagar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.evento_inscriptos (evento_id, miembro_id, creado_por)
  values (new.evento_id, new.miembro_id, new.registrado_por)
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.anotar_al_pagar() from public, anon, authenticated;
drop trigger if exists trg_anotar_al_pagar on public.pagos_evento;
create trigger trg_anotar_al_pagar after insert on public.pagos_evento
  for each row execute function public.anotar_al_pagar();

-- Los que ya pagaron quedan anotados
insert into public.evento_inscriptos (evento_id, miembro_id, creado_por, creado_en)
select distinct on (p.evento_id, p.miembro_id) p.evento_id, p.miembro_id, p.registrado_por, p.creado_en
  from public.pagos_evento p
 order by p.evento_id, p.miembro_id, p.creado_en
on conflict do nothing;

commit;

notify pgrst, 'reload schema';
