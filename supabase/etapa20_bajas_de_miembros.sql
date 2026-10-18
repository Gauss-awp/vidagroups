-- =====================================================================
-- VidaGroups · Etapa 20: cuando un hermano se quita del grupo
--   1. Queda registrada la fecha de baja: su historial sigue apareciendo
--      en la planilla de asistencia de los meses en que estuvo.
--   2. Si había llegado por consolidación, su tarjeta sale del grupo
--      (deja de aparecer en la pestaña Consolidación del guía) y vuelve a
--      "sin asignar" para la consolidadora, con una nota.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

alter table public.miembros_grupo add column if not exists baja_en timestamptz;

-- Los que ya estaban quitados: sin fecha conocida, cuentan como baja de hoy
update public.miembros_grupo set baja_en = now() where not activo and baja_en is null;

create or replace function public.registrar_baja_miembro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_grupo text;
begin
  -- Se quita del grupo
  if old.activo and not new.activo then
    new.baja_en := now();

    -- Su tarjeta de consolidación (si llegó por ahí) sale de este grupo
    select nombre into v_grupo from public.groups where id = new.grupo_id;
    perform set_config('app.dev_switch', 'on', true);
    update public.tarjetas_consolidacion t
       set grupo_id = null,
           gv_asignado = null,
           comenzo_gv = false,
           asistencia_gv = 'NO',
           observacion = trim(both ' ·' from coalesce(t.observacion, '') || ' · Salió del ' || coalesce(v_grupo, 'grupo') || ' el ' || to_char(now(), 'DD/MM/YYYY'))
     where t.grupo_id = new.grupo_id
       and coalesce(t.estado, '') <> 'completada'
       and lower(trim(t.nombre)) in (lower(trim(new.nombre || ' ' || coalesce(new.apellido, ''))), lower(trim(new.nombre)));
    perform set_config('app.dev_switch', 'off', true);

  -- Vuelve al grupo
  elsif not old.activo and new.activo then
    new.baja_en := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.registrar_baja_miembro() from public, anon, authenticated;

drop trigger if exists trg_registrar_baja_miembro on public.miembros_grupo;
create trigger trg_registrar_baja_miembro before update of activo on public.miembros_grupo
  for each row execute function public.registrar_baja_miembro();

commit;

notify pgrst, 'reload schema';
