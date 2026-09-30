-- =====================================================================
-- VidaGroups · Etapa 1 (parte B): roles finales
-- El rol "Misión Joven" pasa a ser Guía Supervisor + Encargado de su red.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run, ANTES de probar la app nueva.
-- =====================================================================

begin;

-- 1. Quien tenía el rol "mision_joven" pasa a ser Encargado de su red
insert into public.redes_encargados (red_id, perfil_id)
select red_id, id from public.profiles
 where rol = 'mision_joven' and red_id is not null
on conflict do nothing;

-- 2. ...y Guía Supervisor
update public.profiles set rol = 'guia_supervisor' where rol in ('mision_joven', 'supervisor');

-- 3. Roles válidos definitivos
alter table public.profiles drop constraint if exists profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol in ('apostol', 'pastor', 'guia_supervisor', 'consolidacion', 'guia'));

-- 4. Rangos definitivos
create or replace function public.rango_rol(p_rol text)
returns int language sql immutable as $$
  select case p_rol
    when 'apostol' then 4
    when 'pastor' then 3
    when 'guia_supervisor' then 2
    when 'consolidacion' then 2
    else 1
  end
$$;

-- 5. Encargado de red: solo por la tabla redes_encargados (se quita la transición)
create or replace function public.administra_red(p_red uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_pastor_de_red(p_red)
      or (p_red is not null and public.estoy_activo() and exists (
            select 1 from public.redes_encargados where red_id = p_red and perfil_id = auth.uid()))
$$;

commit;

notify pgrst, 'reload schema';
