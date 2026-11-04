-- =====================================================================
-- VidaGroups · Etapa 23: una tarjeta sin grupo no puede figurar "en GV"
--   Si a una tarjeta se le saca el grupo (o la persona sale del grupo),
--   el paso "Comenzó GV" vuelve a quedar sin marcar.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

create or replace function public.sincronizar_gv_tarjeta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nombre_anterior text := case when tg_op = 'UPDATE' then old.gv_asignado end;
  v_grupo_anterior uuid := case when tg_op = 'UPDATE' then old.grupo_id end;
begin
  if new.grupo_id is distinct from v_grupo_anterior and new.grupo_id is not null then
    select nombre into new.gv_asignado from public.groups where id = new.grupo_id;
  elsif new.gv_asignado is distinct from v_nombre_anterior then
    if coalesce(trim(new.gv_asignado), '') = '' then
      new.gv_asignado := null;
      new.grupo_id := null;
    elsif not exists (select 1 from public.groups where id = new.grupo_id and lower(trim(nombre)) = lower(trim(new.gv_asignado))) then
      select id into new.grupo_id
        from public.groups
       where lower(trim(nombre)) = lower(trim(new.gv_asignado))
         and (new.red_id is null or red_id = new.red_id)
       order by creado_en
       limit 1;
    end if;
  elsif new.grupo_id is null and v_grupo_anterior is not null then
    new.gv_asignado := null;
  end if;

  -- Sin grupo no puede estar "yendo al GV" (salvo las ya completadas, que quedan como historia)
  if new.grupo_id is null and coalesce(new.estado, '') <> 'completada' then
    new.comenzo_gv := false;
  end if;

  if new.estado = 'completada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'completada' then
      new.completada_en := now();
    end if;
  else
    new.completada_en := null;
  end if;

  return new;
end;
$$;

-- Corrige las que ya estaban así
update public.tarjetas_consolidacion
   set comenzo_gv = false
 where grupo_id is null and comenzo_gv and coalesce(estado, '') <> 'completada';

commit;
