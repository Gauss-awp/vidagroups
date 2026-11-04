-- =====================================================================
-- VidaGroups · Etapa 24: Pos-encuentro y Reencuentro en las tarjetas
--   · Pos-encuentro: las clases (1 a 10) que hizo después del Encuentro.
--   · Reencuentro: si lo hizo (suele ser un año después del Encuentro).
--   · La fecha del Encuentro se guarda sola al marcarlo.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.tarjetas_consolidacion
  add column if not exists pos_encuentro smallint[] not null default '{}',
  add column if not exists reencuentro boolean not null default false,
  add column if not exists encuentro_en date;

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

  -- Fecha del Encuentro (para saber cuándo le corresponde el Reencuentro)
  if new.encuentro and new.encuentro_en is null and (tg_op = 'INSERT' or not coalesce(old.encuentro, false)) then
    new.encuentro_en := current_date;
  end if;
  if not coalesce(new.encuentro, false) then
    new.encuentro_en := null;
  end if;
  -- Clases del Pos-encuentro: solo números del 1 al 10, sin repetir
  new.pos_encuentro := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(new.pos_encuentro, '{}')) x where x between 1 and 10), '{}');

  if new.estado = 'completada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'completada' then
      new.completada_en := now();
    end if;
  else
    new.completada_en := null;
  end if;

  return new;
end;
$$;;

-- El guía también puede marcar el avance del Pos-encuentro y el Reencuentro
CREATE OR REPLACE FUNCTION public.limitar_edicion_guia_tarjeta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_permitidos text[] := array['fonovisita','visita','pilares','pilar_1','pilar_2','pilar_3','pilar_4','pilar_5',
                               'comenzo_gv','encuentro','observacion','notas',
                               'pos_encuentro','reencuentro','encuentro_en'];
begin
  if auth.uid() is null
     or current_setting('app.dev_switch', true) = 'on'
     or public.administra_red(old.red_id)
     or public.es_consolidador_de(old.red_id) then
    return new;
  end if;
  if (to_jsonb(new) - v_permitidos) is distinct from (to_jsonb(old) - v_permitidos) then
    raise exception 'Solo podés marcar el avance de la tarjeta';
  end if;
  return new;
end;
$function$;

commit;

notify pgrst, 'reload schema';
