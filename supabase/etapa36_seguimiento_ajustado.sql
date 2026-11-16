-- =====================================================================
-- VidaGroups · Etapa 36: Seguimiento ajustado a lo que pidieron
--   · Solo lo ven los pastores y los encargados de la red.
--   · Reglas:
--       - Sin cargar reunión: 2 semanas → amarillo · 3 semanas → rojo
--       - Asistencia: baja de 15 puntos o más contra el mes anterior
--       - 3 faltas seguidas sin contactar: desde 4 miembros
--       - Encuentro sin empezar el Pos-encuentro: 3 semanas
--       - Pos-encuentro sin avanzar: 1 mes
--       - Persona nueva sin ningún contacto: 2 semanas
--   · "Ya hablé": el guía sale de la lista y vuelve solo si aparece un
--     problema de OTRO tipo (si el mismo empeora, no vuelve).
--   · Los trabados muestran de qué guía son.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción),
-- después de la etapa 35.
-- =====================================================================

begin;

-- Qué problemas tenía el grupo cuando se habló con el guía
alter table public.seguimiento_charlas add column if not exists tipos text[] not null default '{}';

-- Seguir a un guía: solo los pastores y encargados de su red
create or replace function public.puedo_seguir_guia(p_guia uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.profiles p
     where p.id = p_guia
       and p.iglesia_id is not distinct from public.mi_iglesia()
       and (
         public.administra_red(p.red_id)
         or exists (select 1 from public.groups g
                     where (g.guia_id = p_guia or exists (select 1 from public.grupo_guias gg where gg.grupo_id = g.id and gg.guia_id = p_guia))
                       and public.administra_red(g.red_id))
       )
  )
$$;

drop function if exists public.panel_seguimiento(uuid);

create or replace function public.panel_seguimiento(p_red uuid)
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
  if p_red is null or not public.administra_red(p_red) then
    raise exception 'El seguimiento lo ven los pastores y encargados de la red';
  end if;

  with
  g as (select gr.* from public.groups gr where gr.red_id = p_red),
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
  tar as (
    select tc.*,
           coalesce(array_length(tc.pos_encuentro, 1), 0) as n_pos,
           coalesce(tc.encuentro_en, tc.fecha_encuentro, tc.creado_en::date) as dia_encuentro,
           gr.nombre as grupo_nombre,
           public.nombre_de_perfil(gr.guia_id) as guia_nombre
      from public.tarjetas_consolidacion tc
      left join public.groups gr on gr.id = tc.grupo_id
     where coalesce(tc.estado, '') <> 'completada'
       and (tc.red_id = p_red or tc.grupo_id in (select id from g))
  ),
  marcas as (
    select tar.*,
           (not coalesce(fonovisita, false) and not coalesce(visita, false) and not coalesce(comenzo_gv, false)
              and not coalesce(encuentro, false) and creado_en < now() - interval '14 days') as es_sin_contacto,
           (encuentro and n_pos = 0 and dia_encuentro < v_hoy - 21) as es_sin_pos,
           (n_pos between 1 and 9 and coalesce(pos_actualizado_en, creado_en) < now() - interval '30 days') as es_pos_trabado
      from tar
  ),
  tar_g as (
    select grupo_id,
           count(*) filter (where es_sin_contacto) as sin_contacto,
           count(*) filter (where es_sin_pos) as sin_pos,
           count(*) filter (where es_pos_trabado) as pos_trabado
      from marcas where grupo_id is not null group by grupo_id
  ),
  filas as (
    select g.id, g.nombre, g.guia_id, g.creado_en,
           public.nombre_de_perfil(g.guia_id) as guia,
           u.ultima,
           case when u.ultima is null then null else (v_hoy - u.ultima) / 7 end as semanas,
           case when a.total_mes > 0 then round(100.0 * a.vinieron_mes / a.total_mes) end as asist_mes,
           case when a.total_ant > 0 then round(100.0 * a.vinieron_ant / a.total_ant) end as asist_ant,
           a.reuniones_mes,
           coalesce(f.cantidad, 0) as faltas3,
           coalesce(tg.sin_contacto, 0) as sin_contacto,
           coalesce(tg.sin_pos, 0) as sin_pos,
           coalesce(tg.pos_trabado, 0) as pos_trabado
      from g
      join ult u on u.id = g.id
      join asis a on a.id = g.id
      left join faltas f on f.grupo_id = g.id
      left join tar_g tg on tg.grupo_id = g.id
  ),
  -- Cada problema con su tipo (para "Ya hablé") y su texto
  problemas as (
    select f.id, x.tipo, x.texto, x.peso
      from filas f
      cross join lateral (values
        ('sin_reunion',
         case when f.ultima is null and f.creado_en < now() - interval '14 days' then 'Todavía no cargó ninguna reunión'
              when f.semanas >= 2 then format('%s semanas sin cargar reunión', f.semanas) end,
         case when f.ultima is null and f.creado_en < now() - interval '21 days' then 4
              when f.semanas >= 3 then 4 else 2 end),
        ('asistencia',
         case when f.asist_mes is not null and f.asist_ant is not null and f.reuniones_mes >= 2 and f.asist_ant - f.asist_mes >= 15
              then format('La asistencia bajó del %s%% al %s%%', f.asist_ant, f.asist_mes) end, 2),
        ('faltas',
         case when f.faltas3 >= 4 then format('%s miembros con 3 faltas seguidas sin contactar', f.faltas3) end, 2),
        ('sin_pos',
         case when f.sin_pos > 0 then format('%s %s el Encuentro hace más de 3 semanas y no empezó el Pos-encuentro', f.sin_pos, case when f.sin_pos = 1 then 'hizo' else 'hicieron' end) end, 1),
        ('pos_trabado',
         case when f.pos_trabado > 0 then format('%s con el Pos-encuentro sin avanzar hace más de un mes', f.pos_trabado) end, 1),
        ('sin_contacto',
         case when f.sin_contacto > 0 then format('%s %s sin ningún contacto hace más de 2 semanas', f.sin_contacto, case when f.sin_contacto = 1 then 'persona nueva' else 'personas nuevas' end) end, 1)
      ) as x(tipo, texto, peso)
     where x.texto is not null
  ),
  charla as (
    select distinct on (guia_id) guia_id, creado_en as ultima, tipos
      from public.seguimiento_charlas
     where guia_id in (select guia_id from g where guia_id is not null)
     order by guia_id, creado_en desc
  ),
  evaluadas as (
    select f.*,
           coalesce((select array_agg(p.texto order by p.peso desc) from problemas p where p.id = f.id), '{}') as motivos,
           coalesce((select array_agg(p.tipo) from problemas p where p.id = f.id), '{}') as tipos,
           coalesce((select sum(p.peso) from problemas p where p.id = f.id), 0) as gravedad,
           coalesce((select max(p.peso) from problemas p where p.id = f.id), 0) as peor,
           ch.ultima as ultima_charla,
           coalesce(ch.tipos, '{}') as tipos_charla
      from filas f
      left join charla ch on ch.guia_id = f.guia_id
  )
  select jsonb_build_object(
    'hablar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'guia_id', e.guia_id, 'guia', e.guia, 'grupo_id', e.id, 'grupo', e.nombre,
               'gravedad', e.gravedad, 'motivos', to_jsonb(e.motivos), 'tipos', to_jsonb(e.tipos),
               'ultima_charla', e.ultima_charla)
             order by e.gravedad desc, e.nombre)
        from evaluadas e
       where e.guia_id is not null and cardinality(e.motivos) > 0
         -- Si ya habló, vuelve solo si hay un problema de otro tipo
         and not (e.tipos <@ e.tipos_charla and e.ultima_charla is not null)), '[]'::jsonb),
    'grupos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nombre', e.nombre, 'guia', e.guia,
               'ultima_reunion', e.ultima, 'asist_mes', e.asist_mes, 'asist_ant', e.asist_ant,
               'estado', case when e.peor >= 4 then 'rojo' when cardinality(e.motivos) > 0 then 'amarillo' else 'verde' end,
               'motivos', to_jsonb(e.motivos), 'ultima_charla', e.ultima_charla)
             order by e.peor desc, e.gravedad desc, e.nombre)
        from evaluadas e), '[]'::jsonb),
    'charlas_recientes', coalesce((
      select jsonb_agg(jsonb_build_object('guia', public.nombre_de_perfil(c.guia_id), 'hablo', public.nombre_de_perfil(c.hablo), 'nota', c.nota, 'fecha', c.creado_en) order by c.creado_en desc)
        from (select * from public.seguimiento_charlas sc
               where sc.guia_id in (select guia_id from g) and sc.creado_en > now() - interval '30 days'
               order by sc.creado_en desc limit 10) c), '[]'::jsonb),
    'trabados', jsonb_build_object(
      'sin_pos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'grupo', grupo_nombre, 'guia', guia_nombre, 'dias', v_hoy - dia_encuentro) order by dia_encuentro)
                            from marcas where es_sin_pos), '[]'::jsonb),
      'pos_trabado', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'grupo', grupo_nombre, 'guia', guia_nombre, 'clases', n_pos, 'dias', v_hoy - coalesce(pos_actualizado_en, creado_en)::date) order by coalesce(pos_actualizado_en, creado_en))
                                from marcas where es_pos_trabado), '[]'::jsonb),
      'sin_contacto', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'grupo', grupo_nombre, 'guia', guia_nombre, 'dias', v_hoy - creado_en::date) order by creado_en)
                                 from marcas where es_sin_contacto), '[]'::jsonb)
    ),
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
    'tendencias', jsonb_build_object(
      'asist_mes', (select case when sum(total_mes) > 0 then round(100.0 * sum(vinieron_mes) / sum(total_mes)) end from asis),
      'asist_ant', (select case when sum(total_ant) > 0 then round(100.0 * sum(vinieron_ant) / sum(total_ant)) end from asis),
      'nuevos_mes', (select count(*) from public.tarjetas_consolidacion tc where tc.creado_en >= v_ini_mes and (tc.red_id = p_red or tc.grupo_id in (select id from g))),
      'nuevos_ant', (select count(*) from public.tarjetas_consolidacion tc where tc.creado_en >= v_ini_ant and tc.creado_en < v_ini_mes and (tc.red_id = p_red or tc.grupo_id in (select id from g))),
      'completadas_mes', (select count(*) from public.tarjetas_consolidacion tc where tc.completada_en >= v_ini_mes and (tc.red_id = p_red or tc.grupo_id in (select id from g))),
      'completadas_ant', (select count(*) from public.tarjetas_consolidacion tc where tc.completada_en >= v_ini_ant and tc.completada_en < v_ini_mes and (tc.red_id = p_red or tc.grupo_id in (select id from g)))
    )
  ) into v_res;
  return v_res;
end;
$$;
revoke execute on function public.panel_seguimiento(uuid) from public, anon;
grant execute on function public.panel_seguimiento(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
