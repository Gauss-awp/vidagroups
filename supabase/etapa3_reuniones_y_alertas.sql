-- =====================================================================
-- VidaGroups · Etapa 3: reuniones con asistencia y alertas de faltas
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- Una reunión por grupo y por día
create table if not exists public.reuniones (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.groups(id) on delete cascade,
  fecha      date not null default current_date,
  notas      text,
  creado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en  timestamptz not null default now(),
  constraint reunion_unica unique (grupo_id, fecha)
);
create index if not exists reuniones_grupo_idx on public.reuniones(grupo_id, fecha desc);

-- Quién vino a cada reunión
create table if not exists public.asistencias (
  reunion_id uuid not null references public.reuniones(id) on delete cascade,
  miembro_id uuid not null references public.miembros_grupo(id) on delete cascade,
  presente   boolean not null default false,
  primary key (reunion_id, miembro_id)
);

create or replace function public.grupo_de_reunion(p_reunion uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select grupo_id from public.reuniones where id = p_reunion
$$;

alter table public.reuniones enable row level security;
alter table public.asistencias enable row level security;

drop policy if exists reuniones_todo on public.reuniones;
create policy reuniones_todo on public.reuniones
  for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id))
  with check (public.puede_gestionar_grupo(grupo_id));

drop policy if exists asistencias_todo on public.asistencias;
create policy asistencias_todo on public.asistencias
  for all to authenticated
  using (public.puede_gestionar_grupo(public.grupo_de_reunion(reunion_id)))
  with check (
    public.puede_gestionar_grupo(public.grupo_de_reunion(reunion_id))
    and public.grupo_de_reunion(reunion_id) = public.grupo_de_miembro(miembro_id)
  );

revoke all on public.reuniones, public.asistencias from anon;
grant select, insert, update, delete on public.reuniones, public.asistencias to authenticated;

-- Miembros con faltas seguidas (desde la última reunión hacia atrás).
-- Respeta los permisos: cada uno ve solo los grupos que puede ver.
create or replace function public.miembros_en_alerta(p_minimo int default 2)
returns table (
  miembro_id uuid, nombre text, apellido text, telefono text,
  grupo_id uuid, grupo text, red_id uuid, faltas int, ultima_reunion date
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
  )
  select r.miembro_id, r.nombre, r.apellido, r.telefono, r.grupo_id, r.grupo, r.red_id,
         s.faltas::int, s.ultima_reunion
    from r join resumen s using (miembro_id)
   where r.rn = 1 and s.faltas >= p_minimo
   order by s.faltas desc, r.nombre
$$;

grant execute on function public.miembros_en_alerta(int) to authenticated;

commit;

notify pgrst, 'reload schema';
