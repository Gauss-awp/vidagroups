-- =====================================================================
-- VidaGroups · Etapa 2: un solo sistema de eventos y pagos
--
-- Queda:
--   eventos       → de un grupo (grupo_id), de una red (red_id) o de toda la iglesia (ambos vacíos)
--                   con moneda ARS o USD y costo por persona (costo_total)
--   pagos_evento  → un registro por cada pago o cuota, con fecha y nota
--
-- Los eventos globales y sus pagos se copian a estas tablas.
-- Las tablas viejas NO se borran: quedan renombradas como respaldo.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en eventos
-- ---------------------------------------------------------------------

alter table public.eventos add column if not exists red_id uuid references public.redes(id) on delete set null;
alter table public.eventos add column if not exists moneda text not null default 'ARS';
alter table public.eventos drop constraint if exists eventos_moneda_check;
alter table public.eventos add constraint eventos_moneda_check check (moneda in ('ARS', 'USD'));
create index if not exists eventos_red_idx on public.eventos(red_id);

-- Los eventos de grupo que ya existían toman la red de su grupo
update public.eventos e
   set red_id = g.red_id
  from public.groups g
 where e.grupo_id = g.id and e.red_id is null;

-- ---------------------------------------------------------------------
-- 2. Copiar eventos globales (mismo id, así los pagos siguen enganchados)
-- ---------------------------------------------------------------------

insert into public.eventos (id, grupo_id, red_id, nombre, tipo, costo_total, moneda, fecha_evento, descripcion, creado_por)
select eg.id,
       null,
       eg.red_id,
       eg.titulo,
       'encuentro',
       coalesce(eg.precio, 0),
       'ARS',
       eg.fecha,
       eg.descripcion,
       (select p.id from public.profiles p where p.id = eg.creado_por)
  from public.eventos_globales eg
on conflict (id) do nothing;

-- "Fuego y Revolución" se cobra en dólares
update public.eventos set moneda = 'USD' where nombre ilike 'Fuego y Revoluci%';

-- ---------------------------------------------------------------------
-- 3. Copiar pagos: cada total acumulado pasa a ser un pago registrado
-- ---------------------------------------------------------------------

insert into public.pagos_evento (evento_id, miembro_id, monto_pagado, fecha_pago, nota, registrado_por)
select ep.evento_id,
       ep.miembro_id,
       ep.monto,
       coalesce((to_jsonb(ep) ->> 'created_at')::date, current_date),
       'Pago anterior (migrado)',
       null
  from public.evento_pagos ep
 where coalesce(ep.monto, 0) > 0
   and exists (select 1 from public.eventos e where e.id = ep.evento_id)
   and exists (select 1 from public.miembros_grupo m where m.id = ep.miembro_id);

-- ---------------------------------------------------------------------
-- 4. Respaldo de las tablas viejas (sin acceso desde la app)
-- ---------------------------------------------------------------------

alter table public.eventos_globales rename to eventos_globales_respaldo;
alter table public.evento_pagos rename to evento_pagos_respaldo;
revoke all on public.eventos_globales_respaldo, public.evento_pagos_respaldo from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Red por defecto al crear o editar un evento
-- ---------------------------------------------------------------------

create or replace function public.red_de_evento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grupo_id is not null then
    -- Evento de grupo: siempre la red del grupo
    select red_id into new.red_id from public.groups where id = new.grupo_id;
  elsif tg_op = 'INSERT' and new.red_id is null and not (public.es_apostol() or public.es_pastor()) then
    -- Quien no es Pastor ni Apóstol no puede crear eventos de toda la iglesia
    new.red_id := public.mi_red();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_red_de_evento on public.eventos;
create trigger trg_red_de_evento
  before insert or update on public.eventos
  for each row execute function public.red_de_evento();

-- ¿Este evento le corresponde a este grupo?
create or replace function public.evento_aplica_a_grupo(p_evento uuid, p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.eventos e
      join public.groups g on g.id = p_grupo
     where e.id = p_evento
       and (
         e.grupo_id = g.id
         or (e.grupo_id is null and (e.red_id is null or e.red_id = g.red_id))
       )
  )
$$;

-- ---------------------------------------------------------------------
-- 6. Políticas de eventos y pagos
-- ---------------------------------------------------------------------

drop policy if exists eventos_select on public.eventos;
drop policy if exists eventos_insert on public.eventos;
drop policy if exists eventos_update on public.eventos;
drop policy if exists eventos_delete on public.eventos;
drop policy if exists eventos_escritura on public.eventos;

create policy eventos_select on public.eventos
  for select to authenticated
  using (
    public.estoy_activo() and (
      (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
      or (grupo_id is null and (red_id is null or red_id = public.mi_red() or public.administra_red(red_id)))
    )
  );

-- Grupo: su guía y superiores. Red: su Encargado/Pastor. Iglesia: Pastores y Apóstol.
create policy eventos_insert on public.eventos
  for insert to authenticated
  with check (
    creado_por = auth.uid() and public.estoy_activo() and (
      (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
      or (grupo_id is null and red_id is not null and public.administra_red(red_id))
      or (grupo_id is null and red_id is null and (public.es_apostol() or public.es_pastor()))
    )
  );

create policy eventos_update on public.eventos
  for update to authenticated
  using (
    public.estoy_activo() and (
      (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
      or (grupo_id is null and red_id is not null and public.administra_red(red_id))
      or (grupo_id is null and red_id is null and (public.es_apostol() or public.es_pastor()))
    )
  )
  with check (
    public.estoy_activo() and (
      (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
      or (grupo_id is null and red_id is not null and public.administra_red(red_id))
      or (grupo_id is null and red_id is null and (public.es_apostol() or public.es_pastor()))
    )
  );

create policy eventos_delete on public.eventos
  for delete to authenticated
  using (
    public.estoy_activo() and (
      (grupo_id is not null and public.puede_gestionar_grupo(grupo_id))
      or (grupo_id is null and red_id is not null and public.administra_red(red_id))
      or (grupo_id is null and red_id is null and (public.es_apostol() or public.es_pastor()))
    )
  );

drop policy if exists pagos_select on public.pagos_evento;
drop policy if exists pagos_insert on public.pagos_evento;
drop policy if exists pagos_update on public.pagos_evento;
drop policy if exists pagos_delete on public.pagos_evento;

-- Ven y registran pagos el guía del miembro y sus superiores
create policy pagos_select on public.pagos_evento
  for select to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

create policy pagos_insert on public.pagos_evento
  for insert to authenticated
  with check (
    registrado_por = auth.uid()
    and public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))
    and public.evento_aplica_a_grupo(evento_id, public.grupo_de_miembro(miembro_id))
  );

create policy pagos_update on public.pagos_evento
  for update to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)))
  with check (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

create policy pagos_delete on public.pagos_evento
  for delete to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

commit;

notify pgrst, 'reload schema';
