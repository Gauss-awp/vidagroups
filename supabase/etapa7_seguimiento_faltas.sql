-- =====================================================================
-- VidaGroups · Etapa 7: "Ya lo contacté" en las alertas de faltas
-- La alerta se oculta cuando alguien registra el contacto, y vuelve
-- sola si el hermano falta a OTRA reunión después de ese contacto.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

create table if not exists public.seguimientos_faltas (
  id             uuid primary key default gen_random_uuid(),
  miembro_id     uuid not null references public.miembros_grupo(id) on delete cascade,
  faltas         int not null default 0,
  nota           text,
  contactado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now()
);
create index if not exists seguimientos_miembro_idx on public.seguimientos_faltas(miembro_id, creado_en desc);

alter table public.seguimientos_faltas enable row level security;
revoke all on public.seguimientos_faltas from anon;
grant select, insert, delete on public.seguimientos_faltas to authenticated;

drop policy if exists seguimientos_select on public.seguimientos_faltas;
create policy seguimientos_select on public.seguimientos_faltas
  for select to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

drop policy if exists seguimientos_insert on public.seguimientos_faltas;
create policy seguimientos_insert on public.seguimientos_faltas
  for insert to authenticated
  with check (contactado_por = auth.uid() and public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));

drop policy if exists seguimientos_delete on public.seguimientos_faltas;
create policy seguimientos_delete on public.seguimientos_faltas
  for delete to authenticated
  using (contactado_por = auth.uid());

-- La función cambia de forma: se borra y se vuelve a crear
drop function if exists public.miembros_en_alerta(int);

create function public.miembros_en_alerta(p_minimo int default 2, p_incluir_contactados boolean default false)
returns table (
  miembro_id uuid, nombre text, apellido text, telefono text,
  grupo_id uuid, grupo text, red_id uuid, faltas int, ultima_reunion date,
  contactado boolean, contactado_por text, contactado_en timestamptz, nota text
)
language sql stable security invoker set search_path = public as $$
  with r as (
    select m.id as miembro_id, m.nombre, m.apellido, m.telefono,
           g.id as grupo_id, g.nombre as grupo, g.red_id,
           re.fecha,
           coalesce(a.presente, false) as presente,
           row_number() over (partition by m.id order by re.fecha desc) as rn
      from public.miembros_grupo m
      join public.groups g on g.id = m.grupo_id
      join public.reuniones re on re.grupo_id = g.id and re.fecha >= m.creado_en::date
      left join public.asistencias a on a.reunion_id = re.id and a.miembro_id = m.id
     where m.activo
  ),
  resumen as (
    select miembro_id,
           coalesce(min(rn) filter (where presente), count(*) + 1) - 1 as faltas,
           max(fecha) as ultima_reunion
      from r
     group by miembro_id
  ),
  ultimo_contacto as (
    select distinct on (sf.miembro_id) sf.miembro_id, sf.creado_en, sf.nota,
           nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '') as quien
      from public.seguimientos_faltas sf
      left join public.profiles p on p.id = sf.contactado_por
     order by sf.miembro_id, sf.creado_en desc
  ),
  base as (
    select r.miembro_id, r.nombre, r.apellido, r.telefono, r.grupo_id, r.grupo, r.red_id,
           s.faltas::int as faltas, s.ultima_reunion,
           -- Contactado si el contacto es posterior (o del mismo día) a la última reunión
           (uc.creado_en is not null and uc.creado_en::date >= s.ultima_reunion) as contactado,
           uc.quien, uc.creado_en, uc.nota
      from r
      join resumen s using (miembro_id)
      left join ultimo_contacto uc using (miembro_id)
     where r.rn = 1 and s.faltas >= p_minimo
  )
  select miembro_id, nombre, apellido, telefono, grupo_id, grupo, red_id, faltas, ultima_reunion,
         contactado,
         case when contactado then quien end,
         case when contactado then creado_en end,
         case when contactado then nota end
    from base
   where p_incluir_contactados or not contactado
   order by contactado, faltas desc, nombre
$$;

revoke execute on function public.miembros_en_alerta(int, boolean) from public, anon;
grant execute on function public.miembros_en_alerta(int, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
