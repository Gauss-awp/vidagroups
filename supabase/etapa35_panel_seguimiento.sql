-- =====================================================================
-- VidaGroups · Etapa 35: panel de Seguimiento para pastores, encargados
-- y Guías Supervisores
--   · Semáforo de grupos (verde / amarillo / rojo) con el motivo.
--   · "Con quién hablar esta semana": los guías que más necesitan una charla,
--     con "Ya hablé" para sacarlos de la lista.
--   · Embudo de consolidación y personas trabadas (Encuentro sin
--     Pos-encuentro, Pos-encuentro sin avanzar).
--   · Tendencias: este mes contra el anterior.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

-- Zona horaria de cada iglesia (para las iglesias hijas en otras provincias o en Europa)
alter table public.iglesias add column if not exists zona_horaria text not null default 'America/Argentina/Cordoba';

-- Desde cuándo no avanza el Pos-encuentro de cada persona
alter table public.tarjetas_consolidacion add column if not exists pos_actualizado_en timestamptz;
update public.tarjetas_consolidacion
   set pos_actualizado_en = now()
 where pos_actualizado_en is null and coalesce(array_length(pos_encuentro, 1), 0) > 0;

create or replace function public.marcar_avance_pos()
returns trigger language plpgsql as $$
begin
  if new.pos_encuentro is distinct from old.pos_encuentro then
    new.pos_actualizado_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_marcar_avance_pos on public.tarjetas_consolidacion;
create trigger trg_marcar_avance_pos before update on public.tarjetas_consolidacion
  for each row execute function public.marcar_avance_pos();

-- "Ya hablé con este guía"
create table if not exists public.seguimiento_charlas (
  id          uuid primary key default gen_random_uuid(),
  guia_id     uuid not null references public.profiles(id) on delete cascade,
  grupo_id    uuid references public.groups(id) on delete set null,
  nota        text,
  hablo       uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists seguimiento_charlas_guia_idx on public.seguimiento_charlas (guia_id, creado_en desc);
alter table public.seguimiento_charlas enable row level security;
revoke all on public.seguimiento_charlas from anon;
grant select, insert on public.seguimiento_charlas to authenticated;

-- Quién puede seguir a un guía: los responsables de su red, el apóstol o quien supervisa alguno de sus grupos
create or replace function public.puedo_seguir_guia(p_guia uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.profiles p
     where p.id = p_guia
       and p.iglesia_id is not distinct from public.mi_iglesia()
       and (
         public.administra_red(p.red_id)
         or public.es_apostol()
         or exists (
           select 1 from public.groups g
            where (g.guia_id = p_guia or exists (select 1 from public.grupo_guias gg where gg.grupo_id = g.id and gg.guia_id = p_guia))
              and (g.supervisor_id = auth.uid() or public.es_cosupervisor(g.id))
         )
       )
  )
$$;
revoke execute on function public.puedo_seguir_guia(uuid) from public, anon;
grant execute on function public.puedo_seguir_guia(uuid) to authenticated;

drop policy if exists charlas_select on public.seguimiento_charlas;
create policy charlas_select on public.seguimiento_charlas for select to authenticated using (public.puedo_seguir_guia(guia_id));
drop policy if exists charlas_insert on public.seguimiento_charlas;
create policy charlas_insert on public.seguimiento_charlas for insert to authenticated
  with check (public.puedo_seguir_guia(guia_id) and hablo = auth.uid());

-- ---------------------------------------------------------------------
-- El panel: todo en una sola llamada
--   p_red con valor → los grupos de esa red (pastores, encargados, apóstol)
--   p_red vacío     → los grupos que supervisa quien pregunta (Guía Supervisor)
-- ---------------------------------------------------------------------
create or replace function public.panel_seguimiento(p_red uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := (now() at time zone coalesce((select zona_horaria from public.iglesias where id = public.mi_iglesia()), 'America/Argentina/Cordoba'))::date;
  v_ini_mes date := date_trunc('month', v_hoy)::date;
  v_ini_ant date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  v_res jsonb;
begin
  if not public.estoy_activo() then
    raise exception 'Cuenta no activa';
  end if;
  if p_red is not null and not (public.administra_red(p_red) or (public.es_apostol() and exists (select 1 from public.redes r where r.id = p_red and r.iglesia_id is not distinct from public.mi_iglesia()))) then
    raise exception 'No tenés acceso al seguimiento de esta red';
  end if;

  with
  g as (
    select gr.* from public.groups gr
     where (p_red is not null and gr.red_id = p_red)
        or (p_red is null and (gr.supervisor_id = auth.uid() or public.es_cosupervisor(gr.id)))
  ),
  -- Reuniones de cada grupo
  ult as (
    select g.id, max(r.fecha) as ultima
      from g left join public.reuniones r on r.grupo_id = g.id and r.fecha <= v_hoy
     group by g.id
  ),
  asis as (
    select g.id,
           count(a.*) filter (where r.fecha >= v_ini_mes) as total_mes,
           count(a.*) filter (where r.fecha >= v_ini_mes and a.presente) as vinieron_mes,
           count(a.*) filter (where r.fecha >= v_ini_ant and r.fecha < v_ini_mes) as total_ant,
           count(a.*) filter (where r.fecha >= v_ini_ant and r.fecha < v_ini_mes and a.presente) as vinieron_ant,
           count(distinct r.id) filter (where r.fecha >= v_ini_mes) as reuniones_mes
      from g
      left join public.reuniones r on r.grupo_id = g.id and r.fecha >= v_ini_ant and r.fecha <= v_hoy
      left join public.asistencias a on a.reunion_id = r.id
     group by g.id
  ),
  -- Miembros que faltaron a las últimas 3 reuniones y nadie los contactó después
  tres as (
    select r.grupo_id, r.id, r.fecha,
           row_number() over (partition by r.grupo_id order by r.fecha desc) as n
      from public.reuniones r join g on g.id = r.grupo_id
     where r.fecha <= v_hoy
  ),
  faltas as (
    select m.grupo_id, count(*) as cantidad
      from public.miembros_grupo m
      join g on g.id = m.grupo_id
     where m.activo
       and (select count(*) from tres t join public.asistencias a on a.reunion_id = t.id and a.miembro_id = m.id and not a.presente
             where t.grupo_id = m.grupo_id and t.n <= 3) = 3
       and not exists (
         select 1 from public.seguimientos_faltas sf
          where sf.miembro_id = m.id
            and sf.creado_en >= (select t.fecha from tres t where t.grupo_id = m.grupo_id and t.n = 3)
       )
     group by m.grupo_id
  ),
  -- Consolidación de cada grupo
  tar as (
    select tc.*,
           coalesce(array_length(tc.pos_encuentro, 1), 0) as n_pos
      from public.tarjetas_consolidacion tc
     where coalesce(tc.estado, '') <> 'completada'
       and ((p_red is not null and (tc.red_id = p_red or tc.grupo_id in (select id from g)))
         or (p_red is null and tc.grupo_id in (select id from g)))
  ),
  tar_g as (
    select grupo_id,
           count(*) filter (where not coalesce(fonovisita, false) and not coalesce(visita, false) and not coalesce(comenzo_gv, false) and not coalesce(encuentro, false) and creado_en < now() - interval '7 days') as sin_fono,
           count(*) filter (where encuentro and n_pos = 0 and coalesce(encuentro_en, fecha_encuentro, creado_en::date) < v_hoy - 21) as sin_pos,
           count(*) filter (where n_pos between 1 and 9 and coalesce(pos_actualizado_en, creado_en) < now() - interval '30 days') as pos_trabado
      from tar where grupo_id is not null group by grupo_id
  ),
  charla as (
    select guia_id, max(creado_en) as ultima from public.seguimiento_charlas group by guia_id
  ),
  filas as (
    select g.id, g.nombre, g.guia_id,
           public.nombre_de_perfil(g.guia_id) as guia,
           (select telefono from public.profiles where id = g.guia_id) as telefono,
           u.ultima,
           case when u.ultima is null then null else (v_hoy - u.ultima) / 7 end as semanas,
           case when a.total_mes > 0 then round(100.0 * a.vinieron_mes / a.total_mes) end as asist_mes,
           case when a.total_ant > 0 then round(100.0 * a.vinieron_ant / a.total_ant) end as asist_ant,
           a.reuniones_mes,
           coalesce(f.cantidad, 0) as faltas3,
           coalesce(tg.sin_fono, 0) as sin_fono,
           coalesce(tg.sin_pos, 0) as sin_pos,
           coalesce(tg.pos_trabado, 0) as pos_trabado,
           ch.ultima as ultima_charla
      from g
      join ult u on u.id = g.id
      join asis a on a.id = g.id
      left join faltas f on f.grupo_id = g.id
      left join tar_g tg on tg.grupo_id = g.id
      left join charla ch on ch.guia_id = g.guia_id
  ),
  evaluadas as (
    select f.*,
           array_remove(array[
             case when f.ultima is null then 'Todavía no cargó ninguna reunión'
                  when f.semanas >= 2 then format('%s semanas sin cargar reunión', f.semanas) end,
             case when f.asist_mes is not null and f.reuniones_mes >= 2 and f.asist_mes < 50 then format('Asistencia del mes: %s%%', f.asist_mes)
                  when f.asist_mes is not null and f.asist_ant is not null and f.asist_ant - f.asist_mes >= 15 then format('La asistencia bajó del %s%% al %s%%', f.asist_ant, f.asist_mes) end,
             case when f.faltas3 > 0 then format('%s %s 3 faltas seguidas sin contactar', f.faltas3, case when f.faltas3 = 1 then 'miembro con' else 'miembros con' end) end,
             case when f.sin_fono > 0 then format('%s %s sin fonovisita hace más de una semana', f.sin_fono, case when f.sin_fono = 1 then 'persona nueva' else 'personas nuevas' end) end,
             case when f.sin_pos > 0 then format('%s %s el Encuentro y no empezó el Pos-encuentro', f.sin_pos, case when f.sin_pos = 1 then 'hizo' else 'hicieron' end) end,
             case when f.pos_trabado > 0 then format('%s con el Pos-encuentro sin avanzar hace un mes', f.pos_trabado) end
           ], null) as motivos,
           -- Gravedad: cuánto necesita atención el grupo
           (case when f.ultima is null then 3 when f.semanas >= 3 then 4 when f.semanas = 2 then 2 else 0 end)
           + (case when f.asist_mes is not null and f.reuniones_mes >= 2 and f.asist_mes < 50 then 3
                   when f.asist_mes is not null and f.asist_ant is not null and f.asist_ant - f.asist_mes >= 15 then 2 else 0 end)
           + least(f.faltas3, 4)
           + least(f.sin_fono, 2) + least(f.sin_pos, 2) + least(f.pos_trabado, 2) as gravedad
      from filas f
  )
  select jsonb_build_object(
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nombre', e.nombre, 'guia_id', e.guia_id, 'guia', e.guia, 'telefono', e.telefono,
               'ultima_reunion', e.ultima, 'asist_mes', e.asist_mes, 'asist_ant', e.asist_ant,
               'estado', case when e.gravedad >= 4 then 'rojo' when e.gravedad >= 1 then 'amarillo' else 'verde' end,
               'gravedad', e.gravedad, 'motivos', to_jsonb(e.motivos), 'ultima_charla', e.ultima_charla)
             order by e.gravedad desc, e.nombre)
        from evaluadas e), '[]'::jsonb),
    'hablar', coalesce((
      select jsonb_agg(x order by (x ->> 'gravedad')::int desc)
        from (select jsonb_build_object(
                       'guia_id', e.guia_id, 'guia', e.guia, 'telefono', e.telefono, 'grupo_id', e.id, 'grupo', e.nombre,
                       'gravedad', e.gravedad, 'motivos', to_jsonb(e.motivos)) as x
                from evaluadas e
               where e.guia_id is not null and e.gravedad >= 2
                 and (e.ultima_charla is null or e.ultima_charla < now() - interval '7 days')
               order by e.gravedad desc limit 5) s), '[]'::jsonb),
    'charlas_recientes', coalesce((
      select jsonb_agg(jsonb_build_object('guia', public.nombre_de_perfil(c.guia_id), 'hablo', public.nombre_de_perfil(c.hablo), 'nota', c.nota, 'fecha', c.creado_en) order by c.creado_en desc)
        from (select * from public.seguimiento_charlas sc
               where sc.guia_id in (select guia_id from g) and sc.creado_en > now() - interval '30 days'
               order by sc.creado_en desc limit 10) c), '[]'::jsonb),
    'embudo', jsonb_build_object(
      'total', (select count(*) from tar),
      'fonovisita', (select count(*) from tar where fonovisita),
      'visita', (select count(*) from tar where visita),
      'pilares', (select count(*) from tar where coalesce(pilar_1 and pilar_2 and pilar_3 and pilar_4 and pilar_5, pilares, false)),
      'gv', (select count(*) from tar where comenzo_gv),
      'encuentro', (select count(*) from tar where encuentro),
      'pos', (select count(*) from tar where n_pos >= 10),
      'reencuentro', (select count(*) from tar where reencuentro)
    ),
    'trabados', jsonb_build_object(
      'sin_fono', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'grupo', (select nombre from public.groups where id = tar.grupo_id), 'dias', (v_hoy - creado_en::date)) order by creado_en)
                             from tar where not coalesce(fonovisita, false) and not coalesce(visita, false) and not coalesce(comenzo_gv, false) and not coalesce(encuentro, false) and creado_en < now() - interval '7 days'), '[]'::jsonb),
      'sin_pos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'grupo', (select nombre from public.groups where id = tar.grupo_id), 'dias', (v_hoy - coalesce(encuentro_en, fecha_encuentro, creado_en::date))) order by coalesce(encuentro_en, fecha_encuentro, creado_en::date))
                            from tar where encuentro and n_pos = 0 and coalesce(encuentro_en, fecha_encuentro, creado_en::date) < v_hoy - 21), '[]'::jsonb),
      'pos_trabado', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'grupo', (select nombre from public.groups where id = tar.grupo_id), 'clases', n_pos, 'dias', (v_hoy - coalesce(pos_actualizado_en, creado_en)::date)) order by coalesce(pos_actualizado_en, creado_en))
                                from tar where n_pos between 1 and 9 and coalesce(pos_actualizado_en, creado_en) < now() - interval '30 days'), '[]'::jsonb)
    ),
    'tendencias', jsonb_build_object(
      'asist_mes', (select case when sum(total_mes) > 0 then round(100.0 * sum(vinieron_mes) / sum(total_mes)) end from asis),
      'asist_ant', (select case when sum(total_ant) > 0 then round(100.0 * sum(vinieron_ant) / sum(total_ant)) end from asis),
      'nuevos_mes', (select count(*) from public.tarjetas_consolidacion tc
                      where tc.creado_en >= v_ini_mes and ((p_red is not null and (tc.red_id = p_red or tc.grupo_id in (select id from g))) or (p_red is null and tc.grupo_id in (select id from g)))),
      'nuevos_ant', (select count(*) from public.tarjetas_consolidacion tc
                      where tc.creado_en >= v_ini_ant and tc.creado_en < v_ini_mes and ((p_red is not null and (tc.red_id = p_red or tc.grupo_id in (select id from g))) or (p_red is null and tc.grupo_id in (select id from g)))),
      'completadas_mes', (select count(*) from public.tarjetas_consolidacion tc
                      where tc.completada_en >= v_ini_mes and ((p_red is not null and (tc.red_id = p_red or tc.grupo_id in (select id from g))) or (p_red is null and tc.grupo_id in (select id from g)))),
      'completadas_ant', (select count(*) from public.tarjetas_consolidacion tc
                      where tc.completada_en >= v_ini_ant and tc.completada_en < v_ini_mes and ((p_red is not null and (tc.red_id = p_red or tc.grupo_id in (select id from g))) or (p_red is null and tc.grupo_id in (select id from g))))
    )
  ) into v_res;
  return v_res;
end;
$$;
revoke execute on function public.panel_seguimiento(uuid) from public, anon;
grant execute on function public.panel_seguimiento(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
