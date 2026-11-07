-- =====================================================================
-- VidaGroups · Etapa 33: planilla de asistencia idéntica a la de la iglesia
--   · Reuniones: la ofrenda tal cual está escrita (por ejemplo "$13200 -$14500")
--     y a quién se entregó (hoja OFRENDAS).
--   · Miembros: los datos de la hoja DATOS (dirección, bautismo, sanidad
--     interior, pilares, encuentro, reencuentro, pos encuentro y escuela de
--     capacitación).
--   · planilla_filas y planilla_meses: el orden, los códigos (G, A, C1, 6…)
--     y cómo era cada mes de la planilla importada, para exportarla idéntica.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.reuniones
  add column if not exists ofrenda_texto text,
  add column if not exists ofrenda_entregada text;

alter table public.miembros_grupo
  add column if not exists direccion text,
  add column if not exists bautismo text,
  add column if not exists sanidad_interior text,
  add column if not exists pilares_dato text,
  add column if not exists encuentro_dato text,
  add column if not exists reencuentro_dato text,
  add column if not exists pos_encuentro_dato text,
  add column if not exists escuela_capacitacion text,
  add column if not exists datos_fila int,
  add column if not exists datos_numero int,
  add column if not exists datos_nombre text;

-- Renglones de la hoja DATOS sin nombre (se respetan tal cual al exportar)
alter table public.groups add column if not exists planilla_datos_sueltos jsonb;

create table if not exists public.planilla_filas (
  grupo_id   uuid not null references public.groups(id) on delete cascade,
  anio       int not null,
  mes        int not null check (mes between 0 and 11),
  miembro_id uuid not null references public.miembros_grupo(id) on delete cascade,
  fila       int not null,
  codigo     text,
  marcas     jsonb,           -- marcas que no son P/A (por ejemplo "-"), por semana
  primary key (grupo_id, anio, mes, miembro_id)
);
alter table public.planilla_filas add column if not exists marcas jsonb;

-- Cómo era cada mes en la planilla importada: encabezado, renglones, fechas escritas a mano,
-- códigos de los renglones vacíos y las filas de la hoja OFRENDAS
create table if not exists public.planilla_meses (
  grupo_id   uuid not null references public.groups(id) on delete cascade,
  anio       int not null,
  mes        int not null check (mes between 0 and 11),
  encabezado jsonb not null,
  primary key (grupo_id, anio, mes)
);

alter table public.planilla_filas enable row level security;
revoke all on public.planilla_filas from anon;
grant select, insert, update, delete on public.planilla_filas to authenticated;

drop policy if exists planilla_filas_todo on public.planilla_filas;
create policy planilla_filas_todo on public.planilla_filas for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

drop policy if exists solo_mi_iglesia on public.planilla_filas;
create policy solo_mi_iglesia on public.planilla_filas as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

alter table public.planilla_meses enable row level security;
revoke all on public.planilla_meses from anon;
grant select, insert, update, delete on public.planilla_meses to authenticated;

drop policy if exists planilla_meses_todo on public.planilla_meses;
create policy planilla_meses_todo on public.planilla_meses for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

drop policy if exists solo_mi_iglesia on public.planilla_meses;
create policy solo_mi_iglesia on public.planilla_meses as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

commit;

notify pgrst, 'reload schema';
