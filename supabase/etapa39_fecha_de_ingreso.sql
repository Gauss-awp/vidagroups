-- =====================================================================
-- VidaGroups · Etapa 39: la primera reunión de una persona nueva cuenta
--   La app toma la fecha de alta del miembro (creado_en) como "desde
--   cuándo viene": desde ahí cuentan su porcentaje, su racha, los logros
--   y el resumen del año. Si alguien vino el sábado y lo cargaron el
--   domingo, esa primera reunión quedaba afuera aunque se lo marcara.
--
--   Ahora, cuando se marca a alguien presente en una reunión anterior a
--   su fecha de alta, la fecha se corre sola hasta esa reunión.
--   Además se corrigen los miembros que ya estaban en esa situación.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- Se puede correr dos veces sin problema.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Presente antes de su fecha de alta → la fecha se corre a esa reunión
-- ---------------------------------------------------------------------
create or replace function public.ajustar_ingreso_por_asistencia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.presente then
    return null;
  end if;
  update public.miembros_grupo m
     set creado_en = (r.fecha + time '12:00')::timestamptz
    from public.reuniones r
   where r.id = new.reunion_id
     and m.id = new.miembro_id
     and r.fecha < m.creado_en::date;
  return null;
end;
$$;
revoke execute on function public.ajustar_ingreso_por_asistencia() from public, anon, authenticated;

drop trigger if exists trg_ajustar_ingreso_por_asistencia on public.asistencias;
create trigger trg_ajustar_ingreso_por_asistencia
  after insert or update of presente on public.asistencias
  for each row execute function public.ajustar_ingreso_por_asistencia();

-- ---------------------------------------------------------------------
-- 2. Los que ya estaban marcados presentes antes de su fecha de alta
-- ---------------------------------------------------------------------
update public.miembros_grupo m
   set creado_en = (p.primera + time '12:00')::timestamptz
  from (
    select a.miembro_id, min(r.fecha) as primera
      from public.asistencias a
      join public.reuniones r on r.id = a.reunion_id
     where a.presente
     group by a.miembro_id
  ) p
 where p.miembro_id = m.id
   and p.primera < m.creado_en::date;

commit;
