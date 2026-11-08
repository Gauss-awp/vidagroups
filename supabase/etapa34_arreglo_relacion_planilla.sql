-- =====================================================================
-- VidaGroups · Etapa 34: arreglo del error "more than one relationship was
-- found for 'groups' and 'miembros_grupo'"
--   La tabla planilla_filas (etapa 33) tenía como clave el grupo + el miembro,
--   y por eso Supabase la tomaba como un segundo camino entre grupos y
--   miembros. Pasa a tener su propio id, y el error desaparece.
--   No se pierde ningún dato.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.planilla_filas drop constraint if exists planilla_filas_pkey;
alter table public.planilla_filas add column if not exists id bigint generated always as identity;
alter table public.planilla_filas add primary key (id);
create index if not exists planilla_filas_mes_idx on public.planilla_filas (grupo_id, anio, mes);

commit;

notify pgrst, 'reload schema';
