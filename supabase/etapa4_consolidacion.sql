-- =====================================================================
-- VidaGroups · Etapa 4: consolidación conectada por identificador
--   - La tarjeta guarda el grupo por su id (grupo_id), no solo por el nombre
--   - gv_asignado (el nombre) se mantiene sincronizado solo
--   - Estado "completada" con su fecha, para el balance del mes
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

alter table public.tarjetas_consolidacion add column if not exists grupo_id uuid references public.groups(id) on delete set null;
alter table public.tarjetas_consolidacion add column if not exists completada_en timestamptz;
create index if not exists tarjetas_grupo_idx on public.tarjetas_consolidacion(grupo_id);

-- 1. Conectar las tarjetas existentes buscando el grupo por nombre dentro de su red
update public.tarjetas_consolidacion t
   set grupo_id = g.id
  from public.groups g
 where t.grupo_id is null
   and t.gv_asignado is not null
   and g.nombre = t.gv_asignado
   and (t.red_id is null or g.red_id = t.red_id);

-- 2. Mantener nombre e id sincronizados, y la fecha de "completada"
create or replace function public.sincronizar_gv_tarjeta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nombre_anterior text := case when tg_op = 'UPDATE' then old.gv_asignado end;
  v_grupo_anterior uuid := case when tg_op = 'UPDATE' then old.grupo_id end;
begin
  if new.grupo_id is distinct from v_grupo_anterior and new.grupo_id is not null then
    -- Se eligió el grupo por id: el nombre sale del grupo
    select nombre into new.gv_asignado from public.groups where id = new.grupo_id;
  elsif new.gv_asignado is distinct from v_nombre_anterior then
    if coalesce(trim(new.gv_asignado), '') = '' then
      new.gv_asignado := null;
      new.grupo_id := null;
    elsif not exists (select 1 from public.groups where id = new.grupo_id and nombre = new.gv_asignado) then
      -- Se escribió un nombre: buscar el grupo en la misma red
      select id into new.grupo_id
        from public.groups
       where nombre = new.gv_asignado
         and (new.red_id is null or red_id = new.red_id)
       order by creado_en
       limit 1;
    end if;
  elsif new.grupo_id is null and v_grupo_anterior is not null then
    new.gv_asignado := null;
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

-- El nombre empieza por "s" para correr después de trg_tarjeta_red (que pone la red)
drop trigger if exists trg_tarjeta_sync_gv on public.tarjetas_consolidacion;
create trigger trg_tarjeta_sync_gv
  before insert or update on public.tarjetas_consolidacion
  for each row execute function public.sincronizar_gv_tarjeta();

-- 3. Si un grupo cambia de nombre, sus tarjetas se actualizan
create or replace function public.renombrar_gv_en_tarjetas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tarjetas_consolidacion set gv_asignado = new.nombre where grupo_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_grupo_renombrado on public.groups;
create trigger trg_grupo_renombrado
  after update of nombre on public.groups
  for each row execute function public.renombrar_gv_en_tarjetas();

-- 4. El guía ve las tarjetas de su grupo por id
create or replace function public.es_guia_de_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_grupo is not null and exists (
    select 1 from public.groups g
     where g.id = p_grupo and (g.guia_id = auth.uid() or public.es_coguia(g.id))
  )
$$;

drop policy if exists tarjetas_select on public.tarjetas_consolidacion;
create policy tarjetas_select on public.tarjetas_consolidacion
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
      or public.es_guia_de_grupo(grupo_id)
    )
  );

drop policy if exists tarjetas_update on public.tarjetas_consolidacion;
create policy tarjetas_update on public.tarjetas_consolidacion
  for update to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
      or public.es_guia_de_grupo(grupo_id)
    )
  )
  with check (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or (public.mi_rol() = 'consolidacion' and red_id = public.mi_red())
      or public.es_guia_de_grupo(grupo_id)
    )
  );

commit;

notify pgrst, 'reload schema';
