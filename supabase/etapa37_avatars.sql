-- =====================================================================
-- VidaGroups · Etapa 37: avatars de personajes bíblicos
--   · Cada persona con cuenta elige un personaje (se dibuja dentro de la
--     app; acá solo se guarda su nombre, por ejemplo 'david').
--   · avatares(): devuelve el personaje de una lista de cuentas de la
--     misma iglesia, para mostrarlo al lado de los nombres.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.profiles add column if not exists avatar text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_valido') then
    alter table public.profiles add constraint profiles_avatar_valido
      check (avatar is null or avatar ~ '^[a-z_]{2,20}$');
  end if;
end;
$$;

-- Elegir (o sacar) el propio personaje
create or replace function public.elegir_avatar(p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Tenés que ingresar';
  end if;
  if p_avatar is not null and p_avatar !~ '^[a-z_]{2,20}$' then
    raise exception 'Personaje inválido';
  end if;
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles set avatar = p_avatar where id = auth.uid();
  perform set_config('app.dev_switch', 'off', true);
end;
$$;
revoke execute on function public.elegir_avatar(text) from public, anon;
grant execute on function public.elegir_avatar(text) to authenticated;

-- El personaje de varias cuentas (solo de la misma iglesia; no expone otros datos)
create or replace function public.avatares(p_ids uuid[])
returns table (id uuid, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.avatar
    from public.profiles p
   where p.id = any(p_ids)
     and p.avatar is not null
     and public.estoy_activo()
     and p.iglesia_id is not distinct from public.mi_iglesia()
$$;
revoke execute on function public.avatares(uuid[]) from public, anon;
grant execute on function public.avatares(uuid[]) to authenticated;

commit;

notify pgrst, 'reload schema';
