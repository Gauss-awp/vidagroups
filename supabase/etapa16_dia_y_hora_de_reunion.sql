-- =====================================================================
-- VidaGroups · Etapa 16: día y hora de reunión de cada grupo
--   Los usan los recordatorios del guía ("cargá la asistencia del GV").
--   0 = domingo, 1 = lunes … 6 = sábado. Hora como "21:00".
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

alter table public.groups
  add column if not exists dia_reunion smallint,
  add column if not exists hora_reunion text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_dia_reunion_valido') then
    alter table public.groups add constraint groups_dia_reunion_valido check (dia_reunion is null or dia_reunion between 0 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'groups_hora_reunion_valida') then
    alter table public.groups add constraint groups_hora_reunion_valida check (hora_reunion is null or hora_reunion ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end;
$$;

-- Punto de partida: se intenta leer del texto "Día y horario" que ya cargaron (ej: "Viernes 21:00 hs")
update public.groups
   set dia_reunion = case
         when lower(dia_horario) ~ 'domingo' then 0
         when lower(dia_horario) ~ 'lunes' then 1
         when lower(dia_horario) ~ 'martes' then 2
         when lower(dia_horario) ~ 'mi[eé]rcoles' then 3
         when lower(dia_horario) ~ 'jueves' then 4
         when lower(dia_horario) ~ 'viernes|vienes' then 5
         when lower(dia_horario) ~ 's[aá]bado' then 6
       end
 where dia_reunion is null and dia_horario is not null;

update public.groups
   set hora_reunion = lpad(substring(dia_horario from '([0-9]{1,2})[:.][0-9]{2}'), 2, '0') || ':' || substring(dia_horario from '[0-9]{1,2}[:.]([0-9]{2})')
 where hora_reunion is null and dia_horario ~ '[0-9]{1,2}[:.][0-9]{2}'
   and substring(dia_horario from '([0-9]{1,2})[:.][0-9]{2}')::int between 0 and 23;

commit;

notify pgrst, 'reload schema';
