-- =====================================================================
-- VidaGroups · PRODUCCIÓN · Esquema completo (desde cero)
--
-- Para un proyecto de Supabase NUEVO y vacío. Crea todas las tablas,
-- funciones, triggers y políticas de seguridad en su versión final
-- (etapas 1 a 8 + endurecimiento de seguridad, preparado para varias iglesias), SIN el modo dev.
--
-- Ejecutar UNA sola vez: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: administra_red(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.administra_red(p_red uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_pastor_de_red(p_red)
      or (p_red is not null and public.estoy_activo() and exists (
            select 1 from public.redes_encargados where red_id = p_red and perfil_id = auth.uid()))
$$;


--
-- Name: asignar_creador_red(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_creador_red() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.es_pastor() then
    insert into public.redes_pastores (red_id, perfil_id) values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;


--
-- Name: asignar_guia(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_guia(p_guia uuid, p_sup uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  update public.profiles set supervisor_id = p_sup where id = p_guia;
$$;


--
-- Name: asignar_supervisor_grupo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_supervisor_grupo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select supervisor_id, coalesce(new.red_id, red_id)
    into new.supervisor_id, new.red_id
    from public.profiles where id = new.guia_id;
  return new;
end;
$$;


--
-- Name: crear_perfil_nuevo_usuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_perfil_nuevo_usuario() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_red uuid;
  v_iglesia uuid;
begin
  select id, iglesia_id into v_red, v_iglesia from public.redes
   where id::text = coalesce(new.raw_user_meta_data ->> 'red_id', '');

  insert into public.profiles (id, email, nombre, apellido, red_id, iglesia_id, estado)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    v_red,
    v_iglesia,
    'pendiente'
  );
  return new;
end;
$$;


--
-- Name: eliminar_mi_cuenta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.eliminar_mi_cuenta() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'Tenés que iniciar sesión para eliminar tu cuenta';
  end if;
  if exists (select 1 from public.groups where guia_id = v_id) then
    raise exception 'Sos guía de un grupo. Antes de eliminar tu cuenta, pedile al encargado de tu red que asigne otro guía.';
  end if;

  -- Operación del sistema: saltea los controles de roles para limpiar referencias
  perform set_config('app.dev_switch', 'on', true);

  delete from public.relaciones_supervision where guia_id = v_id or supervisor_id = v_id;
  update public.profiles set supervisor_id = null where supervisor_id = v_id;
  update public.tarjetas_consolidacion set creado_por = null where creado_por = v_id;

  -- Borra el usuario; el perfil y sus responsabilidades se borran en cascada
  delete from auth.users where id = v_id;
end;
$$;


--
-- Name: es_apostol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_apostol() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select rol = 'apostol' and estado = 'activo' from public.profiles where id = auth.uid()), false)
$$;


--
-- Name: es_coguia(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_coguia(p_grupo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.grupo_guias where grupo_id = p_grupo and guia_id = auth.uid())
$$;


--
-- Name: es_consolidador_de(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_consolidador_de(p_red uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p_red is not null and public.estoy_activo() and (
    exists (select 1 from public.redes_consolidadores where red_id = p_red and perfil_id = auth.uid())
    or (public.mi_rol() = 'consolidacion' and public.mi_red() = p_red)
  )
$$;


--
-- Name: es_guia_de_grupo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_guia_de_grupo(p_grupo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p_grupo is not null and exists (
    select 1 from public.groups g
     where g.id = p_grupo and (g.guia_id = auth.uid() or public.es_coguia(g.id))
  )
$$;


--
-- Name: es_guia_de_tarjeta(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_guia_de_tarjeta(p_gv text, p_red uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.groups g
     where g.nombre = p_gv
       and (p_red is null or g.red_id = p_red)
       and (g.guia_id = auth.uid() or public.es_coguia(g.id))
  )
$$;


--
-- Name: es_pastor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_pastor() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select rol = 'pastor' and estado = 'activo' from public.profiles where id = auth.uid()), false)
$$;


--
-- Name: es_pastor_de_red(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_pastor_de_red(p_red uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p_red is not null
     and public.iglesia_de_red(p_red) = public.mi_iglesia()
     and (
       public.es_apostol()
       or (public.es_pastor() and exists (
             select 1 from public.redes_pastores where red_id = p_red and perfil_id = auth.uid()))
     )
$$;


--
-- Name: es_subordinado(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_subordinado(p_objetivo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.subordinados(auth.uid()) as s(id) where s.id = p_objetivo
  )
$$;


--
-- Name: estoy_activo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estoy_activo() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select estado = 'activo' from public.profiles where id = auth.uid()), false)
$$;


--
-- Name: evento_aplica_a_grupo(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evento_aplica_a_grupo(p_evento uuid, p_grupo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
      from public.eventos e
      join public.groups g on g.id = p_grupo
     where e.id = p_evento
       and (
         e.grupo_id = g.id
         or (e.grupo_id is null and (e.red_id is null or e.red_id = g.red_id))
       )
  )
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: relaciones_supervision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relaciones_supervision (
    guia_id uuid NOT NULL,
    supervisor_id uuid,
    creado_en timestamp with time zone DEFAULT now()
);


--
-- Name: get_relaciones(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_relaciones() RETURNS SETOF public.relaciones_supervision
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select * from public.relaciones_supervision;
$$;


--
-- Name: grupo_de_habito(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grupo_de_habito(p_habito uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select grupo_id from public.habitos where id = p_habito
$$;


--
-- Name: grupo_de_miembro(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grupo_de_miembro(p_miembro uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select grupo_id from public.miembros_grupo where id = p_miembro
$$;


--
-- Name: grupo_de_reunion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grupo_de_reunion(p_reunion uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select grupo_id from public.reuniones where id = p_reunion
$$;


--
-- Name: iglesia_de_evento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iglesia_de_evento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  new.iglesia_id := coalesce(
    public.iglesia_de_grupo(new.grupo_id),
    public.iglesia_de_red(new.red_id),
    new.iglesia_id,
    public.mi_iglesia()
  );
  return new;
end;
$$;


--
-- Name: iglesia_de_grupo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iglesia_de_grupo(p_grupo uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select r.iglesia_id from public.groups g join public.redes r on r.id = g.red_id where g.id = p_grupo
$$;


--
-- Name: iglesia_de_perfil(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iglesia_de_perfil(p_perfil uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select iglesia_id from public.profiles where id = p_perfil
$$;


--
-- Name: iglesia_de_red(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iglesia_de_red(p_red uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select iglesia_id from public.redes where id = p_red
$$;


--
-- Name: iglesia_por_defecto_red(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iglesia_por_defecto_red() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.iglesia_id is null then
    new.iglesia_id := public.mi_iglesia();
  end if;
  return new;
end;
$$;


--
-- Name: limitar_edicion_guia_tarjeta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limitar_edicion_guia_tarjeta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_permitidos text[] := array['fonovisita','visita','pilares','pilar_1','pilar_2','pilar_3','pilar_4','pilar_5',
                               'comenzo_gv','encuentro','observacion','notas'];
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
$$;


--
-- Name: mi_iglesia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_iglesia() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select iglesia_id from public.profiles where id = auth.uid()
$$;


--
-- Name: mi_red(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_red() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select red_id from public.profiles where id = auth.uid()
$$;


--
-- Name: mi_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_rol() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select rol from public.profiles where id = auth.uid()
$$;


--
-- Name: miembros_en_alerta(integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.miembros_en_alerta(p_minimo integer DEFAULT 2, p_incluir_contactados boolean DEFAULT false) RETURNS TABLE(miembro_id uuid, nombre text, apellido text, telefono text, grupo_id uuid, grupo text, red_id uuid, faltas integer, ultima_reunion date, contactado boolean, contactado_por text, contactado_en timestamp with time zone, nota text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: panel_pastoral(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_pastoral() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with
  fechas as (
    select current_date as hoy,
           date_trunc('week', current_date)::date as semana_actual,
           date_trunc('month', current_date)::date as mes_actual
  ),
  grupos as (
    select g.id, g.nombre, g.red_id, g.guia_id, g.creado_en from public.groups g
  ),
  mpg as (
    select grupo_id, count(*) as n,
           count(*) filter (where creado_en >= (select mes_actual from fechas)) as nuevos_mes
      from public.miembros_grupo where activo group by grupo_id
  ),
  reus as (
    select r.id, r.grupo_id, r.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = r.id and a.presente) as presentes
      from public.reuniones r
     where r.fecha >= (select semana_actual from fechas) - 7 * 8
  ),
  -- Asistencia de las últimas 8 semanas (lunes a domingo)
  semanas as (
    select s.semana,
           coalesce(sum(r.presentes), 0) as presentes,
           coalesce(sum(m.n) filter (where r.id is not null), 0) as esperados,
           count(r.id) as reuniones
      from generate_series(0, 7) as i
     cross join lateral (select (select semana_actual from fechas) - 7 * i as semana) s
      left join reus r on r.fecha >= s.semana and r.fecha < s.semana + 7
      left join mpg m on m.grupo_id = r.grupo_id
     group by s.semana
  ),
  -- Grupos con miembros que no registran reunión hace 14 días o más
  sin_reunion as (
    select g.id, g.nombre, g.red_id,
           nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '') as guia,
           (select max(r.fecha) from public.reuniones r where r.grupo_id = g.id) as ultima
      from grupos g
      join mpg on mpg.grupo_id = g.id
      left join public.profiles p on p.id = g.guia_id
     where g.creado_en < now() - interval '14 days'
       and coalesce((select max(r.fecha) from public.reuniones r where r.grupo_id = g.id), '1900-01-01')
           < (select hoy from fechas) - 14
  ),
  -- Asistencia de los últimos 30 días contra los 30 anteriores, por grupo
  asis_grupo as (
    select r.grupo_id,
           sum(r.presentes) filter (where r.fecha >= (select hoy from fechas) - 30)::numeric
             / nullif(count(*) filter (where r.fecha >= (select hoy from fechas) - 30) * max(m.n), 0) as actual,
           sum(r.presentes) filter (where r.fecha < (select hoy from fechas) - 30 and r.fecha >= (select hoy from fechas) - 60)::numeric
             / nullif(count(*) filter (where r.fecha < (select hoy from fechas) - 30 and r.fecha >= (select hoy from fechas) - 60) * max(m.n), 0) as anterior
      from (select rr.id, rr.grupo_id, rr.fecha,
                   (select count(*) from public.asistencias a where a.reunion_id = rr.id and a.presente) as presentes
              from public.reuniones rr
             where rr.fecha >= (select hoy from fechas) - 60) r
      join mpg m on m.grupo_id = r.grupo_id
     group by r.grupo_id
  ),
  en_baja as (
    select g.id, g.nombre, g.red_id,
           round(a.actual * 100)::int as actual, round(a.anterior * 100)::int as anterior
      from asis_grupo a join grupos g on g.id = a.grupo_id
     where a.actual is not null and a.anterior is not null and a.anterior - a.actual >= 0.15
  ),
  -- Resumen por red (mes actual)
  redes_resumen as (
    select rd.id, rd.nombre,
           count(distinct g.id) as grupos,
           coalesce(sum(distinct_m.n), 0) as miembros,
           coalesce(sum(distinct_m.nuevos_mes), 0) as nuevos,
           (select round(100.0 * sum(r.presentes) / nullif(sum(m2.n), 0))
              from reus r join grupos g2 on g2.id = r.grupo_id join mpg m2 on m2.grupo_id = r.grupo_id
             where g2.red_id = rd.id and r.fecha >= (select mes_actual from fechas))::int as asistencia,
           (select count(*) from public.tarjetas_consolidacion t
             where t.red_id = rd.id and t.completada_en >= (select mes_actual from fechas)) as completadas
      from public.redes rd
      join grupos g on g.red_id = rd.id
      left join mpg distinct_m on distinct_m.grupo_id = g.id
     group by rd.id, rd.nombre
  ),
  -- Próximo evento con costo
  proximo as (
    select e.id, e.nombre, e.fecha_evento, e.moneda, e.costo_total, e.grupo_id, e.red_id,
           coalesce((select sum(p.monto_pagado) from public.pagos_evento p where p.evento_id = e.id), 0) as recaudado,
           case
             when e.grupo_id is not null then coalesce((select n from mpg where grupo_id = e.grupo_id), 0)
             when e.red_id is not null then coalesce((select sum(m.n) from mpg m join grupos g on g.id = m.grupo_id where g.red_id = e.red_id), 0)
             else coalesce((select sum(n) from mpg), 0)
           end as personas
      from public.eventos e
     where e.fecha_evento >= (select hoy from fechas) and e.costo_total > 0
     order by e.fecha_evento
     limit 1
  )
  select jsonb_build_object(
    'semanas', (select jsonb_agg(jsonb_build_object(
                  'semana', semana, 'presentes', presentes, 'esperados', esperados, 'reuniones', reuniones,
                  'pct', case when esperados > 0 then round(100.0 * presentes / esperados)::int end)
                  order by semana) from semanas),
    'sin_reunion', coalesce((select jsonb_agg(to_jsonb(x) order by x.ultima nulls first) from sin_reunion x), '[]'::jsonb),
    'en_baja', coalesce((select jsonb_agg(to_jsonb(x) order by x.actual) from en_baja x), '[]'::jsonb),
    'tarjetas_sin_fonovisita', (select count(*) from public.tarjetas_consolidacion t
                                 where not coalesce(t.fonovisita, false)
                                   and coalesce(t.estado, '') <> 'completada'
                                   and t.creado_en < now() - interval '3 days'),
    'pendientes', (select count(*) from public.profiles where estado = 'pendiente'),
    'alertas_faltas', (select count(*) from public.miembros_en_alerta(3)),
    'redes', coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from redes_resumen x), '[]'::jsonb),
    'proximo_evento', (select to_jsonb(x) from proximo x),
    'totales', jsonb_build_object(
      'grupos', (select count(*) from grupos),
      'miembros', (select coalesce(sum(n), 0) from mpg),
      'nuevos_mes', (select coalesce(sum(nuevos_mes), 0) from mpg)
    )
  )
$$;


--
-- Name: panel_supervisor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.panel_supervisor() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with
  f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  g as (
    select gr.id, gr.nombre, gr.guia_id, gr.red_id
      from public.groups gr
     where gr.supervisor_id = auth.uid() or public.es_subordinado(gr.guia_id) or gr.guia_id = auth.uid()
  ),
  m as (
    select grupo_id, count(*) as n,
           count(*) filter (where creado_en >= (select mes from f)) as nuevos
      from public.miembros_grupo where activo group by grupo_id
  ),
  r as (
    select re.grupo_id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes
      from public.reuniones re
     where re.fecha >= (select mes_ant from f)
  ),
  asis as (
    select g.id as grupo_id,
           (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id) as ultima,
           sum(r.presentes) filter (where r.fecha >= (select mes from f)) as pres_mes,
           count(r.fecha) filter (where r.fecha >= (select mes from f)) as reu_mes,
           sum(r.presentes) filter (where r.fecha < (select mes from f)) as pres_ant,
           count(r.fecha) filter (where r.fecha < (select mes from f)) as reu_ant
      from g left join r on r.grupo_id = g.id
     group by g.id
  ),
  alertas as (select grupo_id, count(*) as n from public.miembros_en_alerta(3) group by grupo_id),
  tarj as (
    select t.grupo_id, count(*) filter (where not coalesce(t.comenzo_gv, false)) as sin_empezar
      from public.tarjetas_consolidacion t
     where coalesce(t.estado, '') <> 'completada'
     group by t.grupo_id
  ),
  filas as (
    select g.id, g.nombre,
           nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '') as guia,
           p.telefono as guia_telefono,
           g.guia_id = auth.uid() as es_mio,
           coalesce(m.n, 0) as miembros,
           coalesce(m.nuevos, 0) as nuevos,
           a.ultima as ultima_reunion,
           case when a.reu_mes * coalesce(m.n, 0) > 0 then round(100.0 * a.pres_mes / (a.reu_mes * m.n))::int end as asistencia,
           case when a.reu_ant * coalesce(m.n, 0) > 0 then round(100.0 * a.pres_ant / (a.reu_ant * m.n))::int end as asistencia_anterior,
           coalesce(al.n, 0) as alertas,
           coalesce(tj.sin_empezar, 0) as sin_empezar,
           (select jsonb_build_object(
                     'id', e.id, 'nombre', e.nombre, 'moneda', e.moneda, 'costo', e.costo_total,
                     'recaudado', coalesce((select sum(pe.monto_pagado)
                                              from public.pagos_evento pe
                                              join public.miembros_grupo mm on mm.id = pe.miembro_id
                                             where pe.evento_id = e.id and mm.grupo_id = g.id), 0))
              from public.eventos e
             where e.fecha_evento >= (select hoy from f) and e.costo_total > 0
               and (e.grupo_id = g.id or (e.grupo_id is null and (e.red_id is null or e.red_id = g.red_id)))
             order by e.fecha_evento
             limit 1) as evento
      from g
      left join m on m.grupo_id = g.id
      left join asis a on a.grupo_id = g.id
      left join alertas al on al.grupo_id = g.id
      left join tarj tj on tj.grupo_id = g.id
      left join public.profiles p on p.id = g.guia_id
  )
  select jsonb_build_object(
    'grupos', coalesce((select jsonb_agg(to_jsonb(x) order by x.asistencia nulls first, x.nombre) from filas x), '[]'::jsonb),
    'cumples', coalesce((
      select jsonb_agg(jsonb_build_object('id', mm.id, 'nombre', trim(mm.nombre || ' ' || coalesce(mm.apellido, '')),
                                          'grupo', g.nombre, 'dia', to_char(mm.cumpleanos, 'DD/MM'))
                       order by to_char(mm.cumpleanos, 'MMDD'))
        from public.miembros_grupo mm join g on g.id = mm.grupo_id
       where mm.activo and mm.cumpleanos is not null
         and case
               when to_char((select hoy from f), 'MMDD') <= to_char((select hoy from f) + 6, 'MMDD')
                 then to_char(mm.cumpleanos, 'MMDD') between to_char((select hoy from f), 'MMDD') and to_char((select hoy from f) + 6, 'MMDD')
               else to_char(mm.cumpleanos, 'MMDD') >= to_char((select hoy from f), 'MMDD')
                 or to_char(mm.cumpleanos, 'MMDD') <= to_char((select hoy from f) + 6, 'MMDD')
             end), '[]'::jsonb),
    'tarjetas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.creado_en desc)
        from (select tc.id, tc.nombre, tc.gv_asignado, tc.fonovisita, tc.visita, tc.pilares, tc.comenzo_gv, tc.encuentro, tc.creado_en
                from public.tarjetas_consolidacion tc join g on g.id = tc.grupo_id
               where coalesce(tc.estado, '') <> 'completada'
               order by tc.creado_en desc limit 20) t), '[]'::jsonb)
  )
$$;


--
-- Name: proteger_iglesia_perfil(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_iglesia_perfil() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null and new.iglesia_id is distinct from old.iglesia_id then
    raise exception 'No se puede cambiar la iglesia de una persona desde la app';
  end if;
  if new.red_id is not null and public.iglesia_de_red(new.red_id) is distinct from new.iglesia_id then
    raise exception 'La red elegida no pertenece a tu iglesia';
  end if;
  if new.supervisor_id is not null and public.iglesia_de_perfil(new.supervisor_id) is distinct from new.iglesia_id then
    raise exception 'El superior tiene que ser de la misma iglesia';
  end if;
  return new;
end;
$$;


--
-- Name: proteger_pago(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_pago() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.evento_id is distinct from old.evento_id
     or new.miembro_id is distinct from old.miembro_id
     or new.registrado_por is distinct from old.registrado_por then
    raise exception 'Un pago no puede cambiar de evento, de hermano ni de responsable. Borralo y cargalo de nuevo.';
  end if;
  return new;
end;
$$;


--
-- Name: puede_gestionar_grupo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_gestionar_grupo(p_grupo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         public.administra_red(g.red_id)
         or g.guia_id = auth.uid()
         or g.supervisor_id = auth.uid()
         or public.es_subordinado(g.guia_id)
         or public.es_coguia(g.id)
       )
  )
$$;


--
-- Name: quitar_guia(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quitar_guia(p_guia uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  update public.profiles set supervisor_id = null where id = p_guia;
$$;


--
-- Name: rango_rol(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rango_rol(p_rol text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_rol
    when 'apostol' then 4
    when 'pastor' then 3
    when 'guia_supervisor' then 2
    when 'consolidacion' then 2
    else 1
  end
$$;


--
-- Name: red_de_evento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.red_de_evento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.grupo_id is not null then
    -- Evento de grupo: siempre la red del grupo
    select red_id into new.red_id from public.groups where id = new.grupo_id;
  elsif tg_op = 'INSERT' and new.red_id is null and not (public.es_apostol() or public.es_pastor()) then
    -- Quien no es Pastor ni Apóstol no puede crear eventos de toda la iglesia
    new.red_id := public.mi_red();
  end if;
  return new;
end;
$$;


--
-- Name: red_de_perfil(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.red_de_perfil(p_perfil uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select red_id from public.profiles where id = p_perfil
$$;


--
-- Name: red_evento_por_defecto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.red_evento_por_defecto() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.red_id is null and not (public.es_apostol() or public.es_pastor()) then
    new.red_id := public.mi_red();
  end if;
  return new;
end;
$$;


--
-- Name: red_por_defecto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.red_por_defecto() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.red_id is null then
    new.red_id := public.mi_red();
  end if;
  return new;
end;
$$;


--
-- Name: registrar_auditoria(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_auditoria() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.auditoria (tabla, registro_id, accion, antes, despues, usuario_id)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;


--
-- Name: renombrar_gv_en_tarjetas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.renombrar_gv_en_tarjetas() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.tarjetas_consolidacion set gv_asignado = new.nombre where grupo_id = new.id;
  return new;
end;
$$;


--
-- Name: reporte_mensual(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reporte_mensual(p_anio integer, p_mes integer) RETURNS TABLE(grupo_id uuid, grupo text, red_id uuid, red text, guia text, miembros integer, nuevos integer, reuniones integer, asistencia_pct integer, habitos_pct integer, tarjetas_nuevas integer, completadas integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with rango as (
    select make_date(p_anio, p_mes, 1) as desde,
           (make_date(p_anio, p_mes, 1) + interval '1 month')::date as hasta
  ),
  m as (
    select mg.grupo_id,
           count(*) filter (where mg.activo) as miembros,
           count(*) filter (where mg.creado_en >= r.desde and mg.creado_en < r.hasta) as nuevos
      from public.miembros_grupo mg, rango r
     group by mg.grupo_id
  ),
  re as (
    select reu.grupo_id,
           count(distinct reu.id) as reuniones,
           count(a.miembro_id) filter (where a.presente) as presentes
      from public.reuniones reu
      cross join rango r
      left join public.asistencias a on a.reunion_id = reu.id
     where reu.fecha >= r.desde and reu.fecha < r.hasta
     group by reu.grupo_id
  ),
  hab as (
    select h.grupo_id,
           count(*) filter (where rd.completado) as hechos,
           count(distinct (rd.habito_id, rd.fecha)) as dias
      from public.registros_diarios rd
      join public.habitos h on h.id = rd.habito_id
      cross join rango r
     where rd.fecha >= r.desde and rd.fecha < r.hasta
     group by h.grupo_id
  ),
  t as (
    select tc.grupo_id,
           count(*) filter (where tc.creado_en >= r.desde and tc.creado_en < r.hasta) as nuevas,
           count(*) filter (where tc.completada_en >= r.desde and tc.completada_en < r.hasta) as completadas
      from public.tarjetas_consolidacion tc, rango r
     where tc.grupo_id is not null
     group by tc.grupo_id
  )
  select g.id, g.nombre, g.red_id, rd.nombre,
         nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''),
         coalesce(m.miembros, 0)::int,
         coalesce(m.nuevos, 0)::int,
         coalesce(re.reuniones, 0)::int,
         case when coalesce(re.reuniones, 0) * coalesce(m.miembros, 0) > 0
              then round(100.0 * re.presentes / (re.reuniones * m.miembros))::int end,
         case when coalesce(hab.dias, 0) * coalesce(m.miembros, 0) > 0
              then least(100, round(100.0 * hab.hechos / (hab.dias * m.miembros)))::int end,
         coalesce(t.nuevas, 0)::int,
         coalesce(t.completadas, 0)::int
    from public.groups g
    left join m   on m.grupo_id = g.id
    left join re  on re.grupo_id = g.id
    left join hab on hab.grupo_id = g.id
    left join t   on t.grupo_id = g.id
    left join public.redes rd on rd.id = g.red_id
    left join public.profiles p on p.id = g.guia_id
   order by rd.nombre nulls last, g.nombre
$$;


--
-- Name: resumen_grupos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_grupos() RETURNS TABLE(grupo_id uuid, grupo text, red_id uuid, guia_id uuid, guia text, guia_telefono text, miembros integer, nuevos_mes integer, ultima_reunion date, asistencia_mes integer, asistencia_anterior integer, cumpleanos_semana integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  m as (
    select mg.grupo_id,
           count(*) as n,
           count(*) filter (where mg.creado_en >= (select mes from f)) as nuevos,
           count(*) filter (
             where mg.fecha_nacimiento is not null
               and (mg.fecha_nacimiento + ((date_part('year', age((select hoy from f) - 1, mg.fecha_nacimiento)) + 1) * interval '1 year'))::date
                   between (select hoy from f) and (select hoy from f) + 6
           ) as cumple
      from public.miembros_grupo mg
     where mg.activo
     group by mg.grupo_id
  ),
  r as (
    select reu.grupo_id, reu.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = reu.id and a.presente) as presentes
      from public.reuniones reu
     where reu.fecha >= (select mes_ant from f)
  )
  select g.id, g.nombre, g.red_id, g.guia_id,
         nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''),
         p.telefono,
         coalesce(m.n, 0)::int,
         coalesce(m.nuevos, 0)::int,
         (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id),
         (select round(100.0 * sum(r.presentes) / nullif(count(*) * coalesce(m.n, 0), 0))
            from r where r.grupo_id = g.id and r.fecha >= (select mes from f))::int,
         (select round(100.0 * sum(r.presentes) / nullif(count(*) * coalesce(m.n, 0), 0))
            from r where r.grupo_id = g.id and r.fecha >= (select mes_ant from f) and r.fecha < (select mes from f))::int,
         coalesce(m.cumple, 0)::int
    from public.groups g
    left join m on m.grupo_id = g.id
    left join public.profiles p on p.id = g.guia_id
   order by g.nombre
$$;


--
-- Name: sincronizar_gv_tarjeta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_gv_tarjeta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: sincronizar_supervision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_supervision() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.supervisor_id is null then
    delete from public.relaciones_supervision where guia_id = new.id;
  else
    insert into public.relaciones_supervision (guia_id, supervisor_id)
    values (new.id, new.supervisor_id)
    on conflict (guia_id) do update set supervisor_id = excluded.supervisor_id;
  end if;

  update public.groups
     set supervisor_id = new.supervisor_id
   where guia_id = new.id
     and supervisor_id is distinct from new.supervisor_id;

  return new;
end;
$$;


--
-- Name: subordinados(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subordinados(p_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with recursive arbol as (
    select id from public.profiles where supervisor_id = p_id
    union
    select p.id from public.profiles p join arbol a on p.supervisor_id = a.id
  )
  select id from arbol
   where p_id = auth.uid() or auth.uid() is null or public.es_apostol()
$$;


--
-- Name: superiores(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.superiores(p_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with recursive cadena as (
    select supervisor_id as id from public.profiles where id = p_id and supervisor_id is not null
    union
    select p.supervisor_id from public.profiles p join cadena c on p.id = c.id where p.supervisor_id is not null
  )
  select id from cadena
   where p_id = auth.uid() or auth.uid() is null or public.es_apostol()
$$;


--
-- Name: validar_cambios_perfil(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_cambios_perfil() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_sup_rol text;
  v_sup_red uuid;
begin
  new.id := old.id;
  new.email := old.email;
  new.creado_en := old.creado_en;

  -- Modo dev (solo la cuenta del desarrollador)
  if current_setting('app.dev_switch', true) = 'on' then
    return new;
  end if;

  if new.rol is distinct from old.rol
     or new.supervisor_id is distinct from old.supervisor_id
     or new.red_id is distinct from old.red_id
     or new.estado is distinct from old.estado then

    -- auth.uid() es NULL en el SQL Editor: se permite
    if auth.uid() is not null and not public.es_apostol() then
      if old.id = auth.uid() then
        -- Una persona pendiente solo puede cambiar la red que eligió
        if not (old.estado = 'pendiente'
                and new.rol = old.rol
                and new.estado = old.estado
                and new.supervisor_id is not distinct from old.supervisor_id) then
          raise exception 'No podés cambiar tu propio rol, estado ni superior';
        end if;
      elsif public.administra_red(old.red_id) or (old.red_id is null and public.es_pastor()) then
        if old.rol in ('apostol', 'pastor', 'mision_joven') or new.rol in ('apostol', 'pastor', 'mision_joven') then
          raise exception 'Solo el Apóstol puede asignar o modificar Pastores';
        end if;
        if new.red_id is distinct from old.red_id and not public.administra_red(new.red_id) then
          raise exception 'No administrás la red a la que querés mover a esta persona';
        end if;
      else
        raise exception 'No tenés permiso para cambiar roles, redes ni superiores de esta persona';
      end if;
    end if;

    if new.supervisor_id is not null then
      if new.supervisor_id = new.id then
        raise exception 'Una persona no puede ser su propio superior';
      end if;
      select rol, red_id into v_sup_rol, v_sup_red from public.profiles where id = new.supervisor_id;
      if v_sup_rol is null then
        raise exception 'El superior elegido no existe';
      end if;
      if public.rango_rol(v_sup_rol) <= public.rango_rol(new.rol) then
        raise exception 'El superior tiene que tener un rol mayor al de la persona';
      end if;
      if v_sup_rol in ('guia_supervisor', 'mision_joven') and v_sup_red is distinct from new.red_id then
        raise exception 'El Guía Supervisor tiene que ser de la misma red';
      end if;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: asistencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asistencias (
    reunion_id uuid NOT NULL,
    miembro_id uuid NOT NULL,
    presente boolean DEFAULT false NOT NULL
);


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id bigint NOT NULL,
    tabla text NOT NULL,
    registro_id text,
    accion text NOT NULL,
    antes jsonb,
    despues jsonb,
    usuario_id uuid DEFAULT auth.uid(),
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    iglesia_id uuid DEFAULT public.mi_iglesia()
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auditoria ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid,
    nombre text NOT NULL,
    tipo text DEFAULT 'encuentro'::text NOT NULL,
    costo_total numeric(12,2) DEFAULT 0 NOT NULL,
    fecha_evento date,
    descripcion text,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    red_id uuid,
    moneda text DEFAULT 'ARS'::text NOT NULL,
    iglesia_id uuid NOT NULL,
    CONSTRAINT eventos_costo_total_check CHECK ((costo_total >= (0)::numeric)),
    CONSTRAINT eventos_moneda_check CHECK ((moneda = ANY (ARRAY['ARS'::text, 'USD'::text]))),
    CONSTRAINT eventos_tipo_check CHECK ((tipo = ANY (ARRAY['encuentro'::text, 'campamento'::text, 'otro'::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    guia_id uuid NOT NULL,
    supervisor_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    ministerio text DEFAULT 'General'::text,
    categoria text DEFAULT 'mision_joven'::text,
    red_id uuid
);


--
-- Name: grupo_guias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grupo_guias (
    grupo_id uuid NOT NULL,
    guia_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: habitos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.habitos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    nombre text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: iglesias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iglesias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    slug text NOT NULL,
    codigo_invitacion text DEFAULT upper(substr(md5((random())::text), 1, 8)) NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: miembros_grupo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.miembros_grupo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    usuario_id uuid,
    nombre text NOT NULL,
    apellido text DEFAULT ''::text NOT NULL,
    telefono text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    fecha_nacimiento date,
    cumpleanos date
);


--
-- Name: pagos_evento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos_evento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evento_id uuid NOT NULL,
    miembro_id uuid NOT NULL,
    monto_pagado numeric(12,2) NOT NULL,
    fecha_pago date DEFAULT CURRENT_DATE NOT NULL,
    registrado_por uuid DEFAULT auth.uid(),
    nota text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pagos_evento_monto_pagado_check CHECK ((monto_pagado > (0)::numeric))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    nombre text DEFAULT ''::text NOT NULL,
    apellido text DEFAULT ''::text NOT NULL,
    rol text DEFAULT 'guia'::text NOT NULL,
    supervisor_id uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    red_id uuid,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    telefono text,
    iglesia_id uuid,
    CONSTRAINT profiles_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'activo'::text, 'inactivo'::text]))),
    CONSTRAINT profiles_rol_check CHECK ((rol = ANY (ARRAY['apostol'::text, 'pastor'::text, 'guia_supervisor'::text, 'consolidacion'::text, 'guia'::text])))
);


--
-- Name: redes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    iglesia_id uuid NOT NULL
);


--
-- Name: redes_consolidadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redes_consolidadores (
    red_id uuid NOT NULL,
    perfil_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: redes_encargados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redes_encargados (
    red_id uuid NOT NULL,
    perfil_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: redes_pastores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redes_pastores (
    red_id uuid NOT NULL,
    perfil_id uuid NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registros_diarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_diarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    habito_id uuid NOT NULL,
    miembro_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    completado boolean DEFAULT false NOT NULL
);


--
-- Name: reuniones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reuniones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    notas text,
    creado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seguimientos_faltas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguimientos_faltas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    miembro_id uuid NOT NULL,
    faltas integer DEFAULT 0 NOT NULL,
    nota text,
    contactado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tarjetas_consolidacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarjetas_consolidacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creado_en timestamp with time zone DEFAULT now(),
    creado_por uuid,
    nombre text NOT NULL,
    telefono text,
    edad integer,
    zona text,
    fecha_reu date DEFAULT CURRENT_DATE,
    fonovisita boolean DEFAULT false,
    visita boolean DEFAULT false,
    pilares boolean DEFAULT false,
    comenzo_gv boolean DEFAULT false,
    gv_asignado text,
    encuentro boolean DEFAULT false,
    estado text DEFAULT 'nueva'::text,
    notas text,
    categoria text DEFAULT 'mision_joven'::text,
    pilar_1 boolean DEFAULT false,
    pilar_2 boolean DEFAULT false,
    pilar_3 boolean DEFAULT false,
    pilar_4 boolean DEFAULT false,
    pilar_5 boolean DEFAULT false,
    red_id uuid,
    observacion text,
    grupo_id uuid,
    completada_en timestamp with time zone,
    fecha_fonovisita date,
    fecha_visita date,
    fecha_pilares date,
    fecha_gv date,
    fecha_encuentro date,
    linea_lider text,
    fecha_entrada date,
    asistencia_gv text
);


--
-- Name: asistencias asistencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_pkey PRIMARY KEY (reunion_id, miembro_id);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: grupo_guias grupo_guias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupo_guias
    ADD CONSTRAINT grupo_guias_pkey PRIMARY KEY (grupo_id, guia_id);


--
-- Name: habitos habitos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitos
    ADD CONSTRAINT habitos_pkey PRIMARY KEY (id);


--
-- Name: iglesias iglesias_codigo_invitacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iglesias
    ADD CONSTRAINT iglesias_codigo_invitacion_key UNIQUE (codigo_invitacion);


--
-- Name: iglesias iglesias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iglesias
    ADD CONSTRAINT iglesias_pkey PRIMARY KEY (id);


--
-- Name: iglesias iglesias_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iglesias
    ADD CONSTRAINT iglesias_slug_key UNIQUE (slug);


--
-- Name: miembros_grupo miembros_grupo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_grupo
    ADD CONSTRAINT miembros_grupo_pkey PRIMARY KEY (id);


--
-- Name: pagos_evento pagos_evento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_evento
    ADD CONSTRAINT pagos_evento_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: redes_consolidadores redes_consolidadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_consolidadores
    ADD CONSTRAINT redes_consolidadores_pkey PRIMARY KEY (red_id, perfil_id);


--
-- Name: redes_encargados redes_encargados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_encargados
    ADD CONSTRAINT redes_encargados_pkey PRIMARY KEY (red_id, perfil_id);


--
-- Name: redes redes_iglesia_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes
    ADD CONSTRAINT redes_iglesia_nombre_key UNIQUE (iglesia_id, nombre);


--
-- Name: redes_pastores redes_pastores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_pastores
    ADD CONSTRAINT redes_pastores_pkey PRIMARY KEY (red_id, perfil_id);


--
-- Name: redes redes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes
    ADD CONSTRAINT redes_pkey PRIMARY KEY (id);


--
-- Name: registros_diarios registro_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_diarios
    ADD CONSTRAINT registro_unico UNIQUE (habito_id, miembro_id, fecha);


--
-- Name: registros_diarios registros_diarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_diarios
    ADD CONSTRAINT registros_diarios_pkey PRIMARY KEY (id);


--
-- Name: relaciones_supervision relaciones_supervision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relaciones_supervision
    ADD CONSTRAINT relaciones_supervision_pkey PRIMARY KEY (guia_id);


--
-- Name: reuniones reunion_unica; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reuniones
    ADD CONSTRAINT reunion_unica UNIQUE (grupo_id, fecha);


--
-- Name: reuniones reuniones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reuniones
    ADD CONSTRAINT reuniones_pkey PRIMARY KEY (id);


--
-- Name: seguimientos_faltas seguimientos_faltas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos_faltas
    ADD CONSTRAINT seguimientos_faltas_pkey PRIMARY KEY (id);


--
-- Name: tarjetas_consolidacion tarjetas_consolidacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarjetas_consolidacion
    ADD CONSTRAINT tarjetas_consolidacion_pkey PRIMARY KEY (id);


--
-- Name: auditoria_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auditoria_fecha_idx ON public.auditoria USING btree (fecha DESC);


--
-- Name: eventos_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventos_grupo_idx ON public.eventos USING btree (grupo_id);


--
-- Name: eventos_iglesia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventos_iglesia_idx ON public.eventos USING btree (iglesia_id);


--
-- Name: eventos_red_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventos_red_idx ON public.eventos USING btree (red_id);


--
-- Name: groups_guia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX groups_guia_idx ON public.groups USING btree (guia_id);


--
-- Name: groups_red_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX groups_red_idx ON public.groups USING btree (red_id);


--
-- Name: groups_supervisor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX groups_supervisor_idx ON public.groups USING btree (supervisor_id);


--
-- Name: habitos_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habitos_grupo_idx ON public.habitos USING btree (grupo_id);


--
-- Name: miembros_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miembros_grupo_idx ON public.miembros_grupo USING btree (grupo_id);


--
-- Name: pagos_evento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_evento_idx ON public.pagos_evento USING btree (evento_id);


--
-- Name: pagos_miembro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_miembro_idx ON public.pagos_evento USING btree (miembro_id);


--
-- Name: profiles_iglesia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_iglesia_idx ON public.profiles USING btree (iglesia_id);


--
-- Name: profiles_red_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_red_idx ON public.profiles USING btree (red_id);


--
-- Name: profiles_rol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_rol_idx ON public.profiles USING btree (rol);


--
-- Name: profiles_supervisor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_supervisor_idx ON public.profiles USING btree (supervisor_id);


--
-- Name: redes_iglesia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX redes_iglesia_idx ON public.redes USING btree (iglesia_id);


--
-- Name: registros_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_fecha_idx ON public.registros_diarios USING btree (fecha);


--
-- Name: registros_miembro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registros_miembro_idx ON public.registros_diarios USING btree (miembro_id);


--
-- Name: reuniones_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reuniones_grupo_idx ON public.reuniones USING btree (grupo_id, fecha DESC);


--
-- Name: seguimientos_miembro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seguimientos_miembro_idx ON public.seguimientos_faltas USING btree (miembro_id, creado_en DESC);


--
-- Name: tarjetas_grupo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tarjetas_grupo_idx ON public.tarjetas_consolidacion USING btree (grupo_id);


--
-- Name: tarjetas_red_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tarjetas_red_idx ON public.tarjetas_consolidacion USING btree (red_id);


--
-- Name: redes trg_asignar_creador_red; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asignar_creador_red AFTER INSERT ON public.redes FOR EACH ROW EXECUTE FUNCTION public.asignar_creador_red();


--
-- Name: groups trg_asignar_supervisor_grupo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_asignar_supervisor_grupo BEFORE INSERT OR UPDATE OF guia_id ON public.groups FOR EACH ROW EXECUTE FUNCTION public.asignar_supervisor_grupo();


--
-- Name: eventos trg_auditoria_eventos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_eventos AFTER DELETE OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();


--
-- Name: pagos_evento trg_auditoria_pagos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_pagos AFTER INSERT OR DELETE OR UPDATE ON public.pagos_evento FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();


--
-- Name: profiles trg_auditoria_perfiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_perfiles AFTER UPDATE OF rol, estado, red_id, supervisor_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();


--
-- Name: tarjetas_consolidacion trg_auditoria_tarjetas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auditoria_tarjetas AFTER DELETE OR UPDATE ON public.tarjetas_consolidacion FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();


--
-- Name: eventos trg_evento_iglesia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_evento_iglesia BEFORE INSERT OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.iglesia_de_evento();


--
-- Name: groups trg_grupo_renombrado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_grupo_renombrado AFTER UPDATE OF nombre ON public.groups FOR EACH ROW EXECUTE FUNCTION public.renombrar_gv_en_tarjetas();


--
-- Name: redes trg_iglesia_red; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_iglesia_red BEFORE INSERT ON public.redes FOR EACH ROW EXECUTE FUNCTION public.iglesia_por_defecto_red();


--
-- Name: tarjetas_consolidacion trg_limitar_guia_tarjeta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_limitar_guia_tarjeta BEFORE UPDATE ON public.tarjetas_consolidacion FOR EACH ROW EXECUTE FUNCTION public.limitar_edicion_guia_tarjeta();


--
-- Name: profiles trg_proteger_iglesia_perfil; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_proteger_iglesia_perfil BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.proteger_iglesia_perfil();


--
-- Name: pagos_evento trg_proteger_pago; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_proteger_pago BEFORE UPDATE ON public.pagos_evento FOR EACH ROW EXECUTE FUNCTION public.proteger_pago();


--
-- Name: eventos trg_red_de_evento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_red_de_evento BEFORE INSERT OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION public.red_de_evento();


--
-- Name: profiles trg_sincronizar_supervision; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sincronizar_supervision AFTER INSERT OR UPDATE OF supervisor_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sincronizar_supervision();


--
-- Name: tarjetas_consolidacion trg_tarjeta_red; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tarjeta_red BEFORE INSERT ON public.tarjetas_consolidacion FOR EACH ROW EXECUTE FUNCTION public.red_por_defecto();


--
-- Name: tarjetas_consolidacion trg_tarjeta_sync_gv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tarjeta_sync_gv BEFORE INSERT OR UPDATE ON public.tarjetas_consolidacion FOR EACH ROW EXECUTE FUNCTION public.sincronizar_gv_tarjeta();


--
-- Name: profiles trg_validar_cambios_perfil; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validar_cambios_perfil BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validar_cambios_perfil();


--
-- Name: asistencias asistencias_miembro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_miembro_id_fkey FOREIGN KEY (miembro_id) REFERENCES public.miembros_grupo(id) ON DELETE CASCADE;


--
-- Name: asistencias asistencias_reunion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asistencias
    ADD CONSTRAINT asistencias_reunion_id_fkey FOREIGN KEY (reunion_id) REFERENCES public.reuniones(id) ON DELETE CASCADE;


--
-- Name: auditoria auditoria_iglesia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_iglesia_id_fkey FOREIGN KEY (iglesia_id) REFERENCES public.iglesias(id);


--
-- Name: eventos eventos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: eventos eventos_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: eventos eventos_iglesia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_iglesia_id_fkey FOREIGN KEY (iglesia_id) REFERENCES public.iglesias(id);


--
-- Name: eventos eventos_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE SET NULL;


--
-- Name: groups groups_guia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_guia_id_fkey FOREIGN KEY (guia_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: groups groups_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE SET NULL;


--
-- Name: groups groups_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: grupo_guias grupo_guias_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupo_guias
    ADD CONSTRAINT grupo_guias_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: grupo_guias grupo_guias_guia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupo_guias
    ADD CONSTRAINT grupo_guias_guia_id_fkey FOREIGN KEY (guia_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: habitos habitos_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitos
    ADD CONSTRAINT habitos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: miembros_grupo miembros_grupo_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_grupo
    ADD CONSTRAINT miembros_grupo_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: miembros_grupo miembros_grupo_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miembros_grupo
    ADD CONSTRAINT miembros_grupo_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pagos_evento pagos_evento_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_evento
    ADD CONSTRAINT pagos_evento_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: pagos_evento pagos_evento_miembro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_evento
    ADD CONSTRAINT pagos_evento_miembro_id_fkey FOREIGN KEY (miembro_id) REFERENCES public.miembros_grupo(id) ON DELETE CASCADE;


--
-- Name: pagos_evento pagos_evento_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_evento
    ADD CONSTRAINT pagos_evento_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_iglesia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_iglesia_id_fkey FOREIGN KEY (iglesia_id) REFERENCES public.iglesias(id);


--
-- Name: profiles profiles_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: redes_consolidadores redes_consolidadores_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_consolidadores
    ADD CONSTRAINT redes_consolidadores_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: redes_consolidadores redes_consolidadores_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_consolidadores
    ADD CONSTRAINT redes_consolidadores_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE CASCADE;


--
-- Name: redes_encargados redes_encargados_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_encargados
    ADD CONSTRAINT redes_encargados_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: redes_encargados redes_encargados_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_encargados
    ADD CONSTRAINT redes_encargados_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE CASCADE;


--
-- Name: redes redes_iglesia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes
    ADD CONSTRAINT redes_iglesia_id_fkey FOREIGN KEY (iglesia_id) REFERENCES public.iglesias(id);


--
-- Name: redes_pastores redes_pastores_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_pastores
    ADD CONSTRAINT redes_pastores_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: redes_pastores redes_pastores_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redes_pastores
    ADD CONSTRAINT redes_pastores_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE CASCADE;


--
-- Name: registros_diarios registros_diarios_habito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_diarios
    ADD CONSTRAINT registros_diarios_habito_id_fkey FOREIGN KEY (habito_id) REFERENCES public.habitos(id) ON DELETE CASCADE;


--
-- Name: registros_diarios registros_diarios_miembro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_diarios
    ADD CONSTRAINT registros_diarios_miembro_id_fkey FOREIGN KEY (miembro_id) REFERENCES public.miembros_grupo(id) ON DELETE CASCADE;


--
-- Name: reuniones reuniones_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reuniones
    ADD CONSTRAINT reuniones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reuniones reuniones_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reuniones
    ADD CONSTRAINT reuniones_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: seguimientos_faltas seguimientos_faltas_contactado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos_faltas
    ADD CONSTRAINT seguimientos_faltas_contactado_por_fkey FOREIGN KEY (contactado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: seguimientos_faltas seguimientos_faltas_miembro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos_faltas
    ADD CONSTRAINT seguimientos_faltas_miembro_id_fkey FOREIGN KEY (miembro_id) REFERENCES public.miembros_grupo(id) ON DELETE CASCADE;


--
-- Name: tarjetas_consolidacion tarjetas_consolidacion_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarjetas_consolidacion
    ADD CONSTRAINT tarjetas_consolidacion_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: tarjetas_consolidacion tarjetas_consolidacion_red_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarjetas_consolidacion
    ADD CONSTRAINT tarjetas_consolidacion_red_id_fkey FOREIGN KEY (red_id) REFERENCES public.redes(id) ON DELETE SET NULL;


--
-- Name: asistencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;

--
-- Name: asistencias asistencias_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY asistencias_todo ON public.asistencias TO authenticated USING (public.puede_gestionar_grupo(public.grupo_de_reunion(reunion_id))) WITH CHECK ((public.puede_gestionar_grupo(public.grupo_de_reunion(reunion_id)) AND (public.grupo_de_reunion(reunion_id) = public.grupo_de_miembro(miembro_id))));


--
-- Name: auditoria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

--
-- Name: auditoria auditoria_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auditoria_select ON public.auditoria FOR SELECT TO authenticated USING ((public.es_apostol() OR public.es_pastor()));


--
-- Name: eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos eventos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_delete ON public.eventos FOR DELETE TO authenticated USING ((public.estoy_activo() AND (((grupo_id IS NOT NULL) AND public.puede_gestionar_grupo(grupo_id)) OR ((grupo_id IS NULL) AND (red_id IS NOT NULL) AND public.administra_red(red_id)) OR ((grupo_id IS NULL) AND (red_id IS NULL) AND (public.es_apostol() OR public.es_pastor())))));


--
-- Name: eventos eventos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_insert ON public.eventos FOR INSERT TO authenticated WITH CHECK (((creado_por = auth.uid()) AND public.estoy_activo() AND (((grupo_id IS NOT NULL) AND public.puede_gestionar_grupo(grupo_id)) OR ((grupo_id IS NULL) AND (red_id IS NOT NULL) AND public.administra_red(red_id)) OR ((grupo_id IS NULL) AND (red_id IS NULL) AND (public.es_apostol() OR public.es_pastor())))));


--
-- Name: eventos eventos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_select ON public.eventos FOR SELECT TO authenticated USING ((public.estoy_activo() AND (((grupo_id IS NOT NULL) AND public.puede_gestionar_grupo(grupo_id)) OR ((grupo_id IS NULL) AND ((red_id IS NULL) OR (red_id = public.mi_red()) OR public.administra_red(red_id))))));


--
-- Name: eventos eventos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_update ON public.eventos FOR UPDATE TO authenticated USING ((public.estoy_activo() AND (((grupo_id IS NOT NULL) AND public.puede_gestionar_grupo(grupo_id)) OR ((grupo_id IS NULL) AND (red_id IS NOT NULL) AND public.administra_red(red_id)) OR ((grupo_id IS NULL) AND (red_id IS NULL) AND (public.es_apostol() OR public.es_pastor()))))) WITH CHECK ((public.estoy_activo() AND (((grupo_id IS NOT NULL) AND public.puede_gestionar_grupo(grupo_id)) OR ((grupo_id IS NULL) AND (red_id IS NOT NULL) AND public.administra_red(red_id)) OR ((grupo_id IS NULL) AND (red_id IS NULL) AND (public.es_apostol() OR public.es_pastor())))));


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: grupo_guias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grupo_guias ENABLE ROW LEVEL SECURITY;

--
-- Name: grupo_guias grupo_guias_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupo_guias_todo ON public.grupo_guias TO authenticated USING (public.puede_gestionar_grupo(grupo_id)) WITH CHECK (public.puede_gestionar_grupo(grupo_id));


--
-- Name: groups grupos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupos_delete ON public.groups FOR DELETE TO authenticated USING ((public.administra_red(red_id) OR public.es_subordinado(guia_id)));


--
-- Name: groups grupos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupos_insert ON public.groups FOR INSERT TO authenticated WITH CHECK ((public.estoy_activo() AND (public.administra_red(red_id) OR ((guia_id = auth.uid()) AND (NOT (red_id IS DISTINCT FROM public.mi_red()))) OR public.es_subordinado(guia_id))));


--
-- Name: groups grupos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupos_select ON public.groups FOR SELECT TO authenticated USING ((public.estoy_activo() AND (public.administra_red(red_id) OR (guia_id = auth.uid()) OR (supervisor_id = auth.uid()) OR public.es_subordinado(guia_id) OR public.es_coguia(id) OR public.es_consolidador_de(red_id))));


--
-- Name: groups grupos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grupos_update ON public.groups FOR UPDATE TO authenticated USING ((public.estoy_activo() AND (public.administra_red(red_id) OR (guia_id = auth.uid()) OR (supervisor_id = auth.uid()) OR public.es_subordinado(guia_id) OR public.es_coguia(id)))) WITH CHECK ((public.estoy_activo() AND (public.administra_red(red_id) OR (guia_id = auth.uid()) OR public.es_subordinado(guia_id) OR public.es_coguia(id))));


--
-- Name: habitos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.habitos ENABLE ROW LEVEL SECURITY;

--
-- Name: habitos habitos_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY habitos_todo ON public.habitos TO authenticated USING (public.puede_gestionar_grupo(grupo_id)) WITH CHECK (public.puede_gestionar_grupo(grupo_id));


--
-- Name: iglesias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iglesias ENABLE ROW LEVEL SECURITY;

--
-- Name: iglesias iglesias_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY iglesias_select ON public.iglesias FOR SELECT TO authenticated USING ((id = public.mi_iglesia()));


--
-- Name: miembros_grupo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.miembros_grupo ENABLE ROW LEVEL SECURITY;

--
-- Name: miembros_grupo miembros_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY miembros_todo ON public.miembros_grupo TO authenticated USING (public.puede_gestionar_grupo(grupo_id)) WITH CHECK (public.puede_gestionar_grupo(grupo_id));


--
-- Name: pagos_evento pagos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pagos_delete ON public.pagos_evento FOR DELETE TO authenticated USING (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));


--
-- Name: pagos_evento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos_evento ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos_evento pagos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pagos_insert ON public.pagos_evento FOR INSERT TO authenticated WITH CHECK (((registrado_por = auth.uid()) AND public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)) AND public.evento_aplica_a_grupo(evento_id, public.grupo_de_miembro(miembro_id))));


--
-- Name: pagos_evento pagos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pagos_select ON public.pagos_evento FOR SELECT TO authenticated USING (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));


--
-- Name: pagos_evento pagos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pagos_update ON public.pagos_evento FOR UPDATE TO authenticated USING (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))) WITH CHECK (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));


--
-- Name: profiles perfiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY perfiles_select ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.es_apostol() OR (public.estoy_activo() AND (public.administra_red(red_id) OR public.es_subordinado(id) OR (id IN ( SELECT public.superiores(auth.uid()) AS superiores)) OR public.es_consolidador_de(red_id) OR ((red_id IS NULL) AND public.es_pastor())))));


--
-- Name: profiles perfiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY perfiles_update ON public.profiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR public.es_apostol() OR public.administra_red(red_id) OR ((red_id IS NULL) AND public.es_pastor()))) WITH CHECK (((id = auth.uid()) OR public.es_apostol() OR public.administra_red(red_id)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: redes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redes ENABLE ROW LEVEL SECURITY;

--
-- Name: redes_consolidadores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redes_consolidadores ENABLE ROW LEVEL SECURITY;

--
-- Name: redes_consolidadores redes_consolidadores_escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_consolidadores_escritura ON public.redes_consolidadores TO authenticated USING (public.administra_red(red_id)) WITH CHECK (public.administra_red(red_id));


--
-- Name: redes_consolidadores redes_consolidadores_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_consolidadores_select ON public.redes_consolidadores FOR SELECT TO authenticated USING (public.estoy_activo());


--
-- Name: redes redes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_delete ON public.redes FOR DELETE TO authenticated USING (public.es_apostol());


--
-- Name: redes_encargados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redes_encargados ENABLE ROW LEVEL SECURITY;

--
-- Name: redes_encargados redes_encargados_escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_encargados_escritura ON public.redes_encargados TO authenticated USING (public.es_pastor_de_red(red_id)) WITH CHECK (public.es_pastor_de_red(red_id));


--
-- Name: redes_encargados redes_encargados_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_encargados_select ON public.redes_encargados FOR SELECT TO authenticated USING (public.estoy_activo());


--
-- Name: redes redes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_insert ON public.redes FOR INSERT TO authenticated WITH CHECK ((public.es_apostol() OR public.es_pastor()));


--
-- Name: redes_pastores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redes_pastores ENABLE ROW LEVEL SECURITY;

--
-- Name: redes_pastores redes_pastores_escritura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_pastores_escritura ON public.redes_pastores TO authenticated USING (public.es_apostol()) WITH CHECK (public.es_apostol());


--
-- Name: redes_pastores redes_pastores_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_pastores_select ON public.redes_pastores FOR SELECT TO authenticated USING (public.estoy_activo());


--
-- Name: redes redes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_select ON public.redes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: redes redes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY redes_update ON public.redes FOR UPDATE TO authenticated USING (public.es_pastor_de_red(id)) WITH CHECK (public.es_pastor_de_red(id));


--
-- Name: registros_diarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registros_diarios ENABLE ROW LEVEL SECURITY;

--
-- Name: registros_diarios registros_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY registros_todo ON public.registros_diarios TO authenticated USING (public.puede_gestionar_grupo(public.grupo_de_habito(habito_id))) WITH CHECK ((public.puede_gestionar_grupo(public.grupo_de_habito(habito_id)) AND (public.grupo_de_habito(habito_id) = public.grupo_de_miembro(miembro_id))));


--
-- Name: relaciones_supervision relaciones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY relaciones_select ON public.relaciones_supervision FOR SELECT TO authenticated USING ((public.estoy_activo() AND (public.es_apostol() OR (supervisor_id = auth.uid()) OR (guia_id = auth.uid()) OR public.administra_red(public.red_de_perfil(guia_id)) OR public.es_subordinado(guia_id))));


--
-- Name: reuniones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reuniones ENABLE ROW LEVEL SECURITY;

--
-- Name: reuniones reuniones_todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reuniones_todo ON public.reuniones TO authenticated USING (public.puede_gestionar_grupo(grupo_id)) WITH CHECK (public.puede_gestionar_grupo(grupo_id));


--
-- Name: seguimientos_faltas seguimientos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seguimientos_delete ON public.seguimientos_faltas FOR DELETE TO authenticated USING ((contactado_por = auth.uid()));


--
-- Name: seguimientos_faltas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seguimientos_faltas ENABLE ROW LEVEL SECURITY;

--
-- Name: seguimientos_faltas seguimientos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seguimientos_insert ON public.seguimientos_faltas FOR INSERT TO authenticated WITH CHECK (((contactado_por = auth.uid()) AND public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id))));


--
-- Name: seguimientos_faltas seguimientos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seguimientos_select ON public.seguimientos_faltas FOR SELECT TO authenticated USING (public.puede_gestionar_grupo(public.grupo_de_miembro(miembro_id)));


--
-- Name: asistencias solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.asistencias AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(public.grupo_de_reunion(reunion_id)) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(public.grupo_de_reunion(reunion_id)) = public.mi_iglesia()));


--
-- Name: auditoria solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.auditoria AS RESTRICTIVE TO authenticated USING ((iglesia_id = public.mi_iglesia())) WITH CHECK ((iglesia_id = public.mi_iglesia()));


--
-- Name: eventos solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.eventos AS RESTRICTIVE TO authenticated USING ((iglesia_id = public.mi_iglesia())) WITH CHECK ((iglesia_id = public.mi_iglesia()));


--
-- Name: groups solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.groups AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_red(red_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_red(red_id) = public.mi_iglesia()));


--
-- Name: grupo_guias solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.grupo_guias AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()));


--
-- Name: habitos solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.habitos AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()));


--
-- Name: miembros_grupo solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.miembros_grupo AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()));


--
-- Name: pagos_evento solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.pagos_evento AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia()));


--
-- Name: profiles solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.profiles AS RESTRICTIVE TO authenticated USING (((id = auth.uid()) OR (iglesia_id = public.mi_iglesia()))) WITH CHECK (((id = auth.uid()) OR (iglesia_id = public.mi_iglesia())));


--
-- Name: redes solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.redes AS RESTRICTIVE TO authenticated USING ((iglesia_id = public.mi_iglesia())) WITH CHECK ((iglesia_id = public.mi_iglesia()));


--
-- Name: redes_consolidadores solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.redes_consolidadores AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_red(red_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_red(red_id) = public.mi_iglesia()));


--
-- Name: redes_encargados solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.redes_encargados AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_red(red_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_red(red_id) = public.mi_iglesia()));


--
-- Name: redes_pastores solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.redes_pastores AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_red(red_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_red(red_id) = public.mi_iglesia()));


--
-- Name: registros_diarios solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.registros_diarios AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(public.grupo_de_habito(habito_id)) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(public.grupo_de_habito(habito_id)) = public.mi_iglesia()));


--
-- Name: relaciones_supervision solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.relaciones_supervision AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_perfil(guia_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_perfil(guia_id) = public.mi_iglesia()));


--
-- Name: reuniones solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.reuniones AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(grupo_id) = public.mi_iglesia()));


--
-- Name: seguimientos_faltas solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.seguimientos_faltas AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_grupo(public.grupo_de_miembro(miembro_id)) = public.mi_iglesia()));


--
-- Name: tarjetas_consolidacion solo_mi_iglesia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY solo_mi_iglesia ON public.tarjetas_consolidacion AS RESTRICTIVE TO authenticated USING ((public.iglesia_de_red(red_id) = public.mi_iglesia())) WITH CHECK ((public.iglesia_de_red(red_id) = public.mi_iglesia()));


--
-- Name: tarjetas_consolidacion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tarjetas_consolidacion ENABLE ROW LEVEL SECURITY;

--
-- Name: tarjetas_consolidacion tarjetas_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tarjetas_delete ON public.tarjetas_consolidacion FOR DELETE TO authenticated USING ((public.estoy_activo() AND (public.administra_red(red_id) OR public.es_consolidador_de(red_id))));


--
-- Name: tarjetas_consolidacion tarjetas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tarjetas_insert ON public.tarjetas_consolidacion FOR INSERT TO authenticated WITH CHECK ((public.estoy_activo() AND (public.administra_red(red_id) OR public.es_consolidador_de(red_id))));


--
-- Name: tarjetas_consolidacion tarjetas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tarjetas_select ON public.tarjetas_consolidacion FOR SELECT TO authenticated USING ((public.estoy_activo() AND (public.administra_red(red_id) OR public.es_consolidador_de(red_id) OR public.puede_gestionar_grupo(grupo_id))));


--
-- Name: tarjetas_consolidacion tarjetas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tarjetas_update ON public.tarjetas_consolidacion FOR UPDATE TO authenticated USING ((public.estoy_activo() AND (public.administra_red(red_id) OR public.es_consolidador_de(red_id) OR public.puede_gestionar_grupo(grupo_id)))) WITH CHECK ((public.estoy_activo() AND (public.administra_red(red_id) OR public.es_consolidador_de(red_id) OR public.puede_gestionar_grupo(grupo_id))));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;


--
-- Name: FUNCTION administra_red(p_red uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.administra_red(p_red uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.administra_red(p_red uuid) TO authenticated;


--
-- Name: FUNCTION asignar_creador_red(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.asignar_creador_red() FROM PUBLIC;


--
-- Name: FUNCTION asignar_guia(p_guia uuid, p_sup uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.asignar_guia(p_guia uuid, p_sup uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asignar_guia(p_guia uuid, p_sup uuid) TO authenticated;


--
-- Name: FUNCTION asignar_supervisor_grupo(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.asignar_supervisor_grupo() FROM PUBLIC;


--
-- Name: FUNCTION crear_perfil_nuevo_usuario(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crear_perfil_nuevo_usuario() FROM PUBLIC;


--
-- Name: FUNCTION eliminar_mi_cuenta(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.eliminar_mi_cuenta() FROM PUBLIC;
GRANT ALL ON FUNCTION public.eliminar_mi_cuenta() TO authenticated;


--
-- Name: FUNCTION es_apostol(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_apostol() FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_apostol() TO authenticated;


--
-- Name: FUNCTION es_coguia(p_grupo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_coguia(p_grupo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_coguia(p_grupo uuid) TO authenticated;


--
-- Name: FUNCTION es_consolidador_de(p_red uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_consolidador_de(p_red uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_consolidador_de(p_red uuid) TO authenticated;


--
-- Name: FUNCTION es_guia_de_grupo(p_grupo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_guia_de_grupo(p_grupo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_guia_de_grupo(p_grupo uuid) TO authenticated;


--
-- Name: FUNCTION es_guia_de_tarjeta(p_gv text, p_red uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_guia_de_tarjeta(p_gv text, p_red uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_guia_de_tarjeta(p_gv text, p_red uuid) TO authenticated;


--
-- Name: FUNCTION es_pastor(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_pastor() FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_pastor() TO authenticated;


--
-- Name: FUNCTION es_pastor_de_red(p_red uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_pastor_de_red(p_red uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_pastor_de_red(p_red uuid) TO authenticated;


--
-- Name: FUNCTION es_subordinado(p_objetivo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_subordinado(p_objetivo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_subordinado(p_objetivo uuid) TO authenticated;


--
-- Name: FUNCTION estoy_activo(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.estoy_activo() FROM PUBLIC;
GRANT ALL ON FUNCTION public.estoy_activo() TO authenticated;


--
-- Name: FUNCTION evento_aplica_a_grupo(p_evento uuid, p_grupo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.evento_aplica_a_grupo(p_evento uuid, p_grupo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.evento_aplica_a_grupo(p_evento uuid, p_grupo uuid) TO authenticated;


--
-- Name: TABLE relaciones_supervision; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relaciones_supervision TO authenticated;


--
-- Name: FUNCTION get_relaciones(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_relaciones() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_relaciones() TO authenticated;


--
-- Name: FUNCTION grupo_de_habito(p_habito uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.grupo_de_habito(p_habito uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grupo_de_habito(p_habito uuid) TO authenticated;


--
-- Name: FUNCTION grupo_de_miembro(p_miembro uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.grupo_de_miembro(p_miembro uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grupo_de_miembro(p_miembro uuid) TO authenticated;


--
-- Name: FUNCTION grupo_de_reunion(p_reunion uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.grupo_de_reunion(p_reunion uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grupo_de_reunion(p_reunion uuid) TO authenticated;


--
-- Name: FUNCTION iglesia_de_evento(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.iglesia_de_evento() FROM PUBLIC;


--
-- Name: FUNCTION iglesia_de_grupo(p_grupo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.iglesia_de_grupo(p_grupo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.iglesia_de_grupo(p_grupo uuid) TO authenticated;


--
-- Name: FUNCTION iglesia_de_perfil(p_perfil uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.iglesia_de_perfil(p_perfil uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.iglesia_de_perfil(p_perfil uuid) TO authenticated;


--
-- Name: FUNCTION iglesia_de_red(p_red uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.iglesia_de_red(p_red uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.iglesia_de_red(p_red uuid) TO authenticated;


--
-- Name: FUNCTION iglesia_por_defecto_red(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.iglesia_por_defecto_red() FROM PUBLIC;


--
-- Name: FUNCTION limitar_edicion_guia_tarjeta(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.limitar_edicion_guia_tarjeta() FROM PUBLIC;


--
-- Name: FUNCTION mi_iglesia(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_iglesia() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_iglesia() TO authenticated;


--
-- Name: FUNCTION mi_red(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_red() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_red() TO authenticated;


--
-- Name: FUNCTION mi_rol(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_rol() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_rol() TO authenticated;


--
-- Name: FUNCTION miembros_en_alerta(p_minimo integer, p_incluir_contactados boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.miembros_en_alerta(p_minimo integer, p_incluir_contactados boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.miembros_en_alerta(p_minimo integer, p_incluir_contactados boolean) TO authenticated;


--
-- Name: FUNCTION panel_pastoral(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.panel_pastoral() FROM PUBLIC;
GRANT ALL ON FUNCTION public.panel_pastoral() TO authenticated;


--
-- Name: FUNCTION panel_supervisor(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.panel_supervisor() FROM PUBLIC;
GRANT ALL ON FUNCTION public.panel_supervisor() TO authenticated;


--
-- Name: FUNCTION proteger_iglesia_perfil(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.proteger_iglesia_perfil() FROM PUBLIC;


--
-- Name: FUNCTION proteger_pago(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.proteger_pago() FROM PUBLIC;


--
-- Name: FUNCTION puede_gestionar_grupo(p_grupo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_gestionar_grupo(p_grupo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_gestionar_grupo(p_grupo uuid) TO authenticated;


--
-- Name: FUNCTION quitar_guia(p_guia uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.quitar_guia(p_guia uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.quitar_guia(p_guia uuid) TO authenticated;


--
-- Name: FUNCTION rango_rol(p_rol text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rango_rol(p_rol text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rango_rol(p_rol text) TO authenticated;


--
-- Name: FUNCTION red_de_evento(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.red_de_evento() FROM PUBLIC;


--
-- Name: FUNCTION red_de_perfil(p_perfil uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.red_de_perfil(p_perfil uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.red_de_perfil(p_perfil uuid) TO authenticated;


--
-- Name: FUNCTION red_evento_por_defecto(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.red_evento_por_defecto() FROM PUBLIC;


--
-- Name: FUNCTION red_por_defecto(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.red_por_defecto() FROM PUBLIC;


--
-- Name: FUNCTION registrar_auditoria(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_auditoria() FROM PUBLIC;


--
-- Name: FUNCTION renombrar_gv_en_tarjetas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.renombrar_gv_en_tarjetas() FROM PUBLIC;


--
-- Name: FUNCTION reporte_mensual(p_anio integer, p_mes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reporte_mensual(p_anio integer, p_mes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reporte_mensual(p_anio integer, p_mes integer) TO authenticated;


--
-- Name: FUNCTION resumen_grupos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resumen_grupos() TO authenticated;


--
-- Name: FUNCTION sincronizar_gv_tarjeta(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sincronizar_gv_tarjeta() FROM PUBLIC;


--
-- Name: FUNCTION sincronizar_supervision(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sincronizar_supervision() FROM PUBLIC;


--
-- Name: FUNCTION subordinados(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.subordinados(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.subordinados(p_id uuid) TO authenticated;


--
-- Name: FUNCTION superiores(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.superiores(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.superiores(p_id uuid) TO authenticated;


--
-- Name: FUNCTION validar_cambios_perfil(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validar_cambios_perfil() FROM PUBLIC;


--
-- Name: TABLE asistencias; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.asistencias TO authenticated;


--
-- Name: TABLE auditoria; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.auditoria TO authenticated;


--
-- Name: TABLE eventos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.eventos TO authenticated;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO authenticated;


--
-- Name: TABLE grupo_guias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.grupo_guias TO authenticated;


--
-- Name: TABLE habitos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.habitos TO authenticated;


--
-- Name: TABLE iglesias; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.iglesias TO authenticated;


--
-- Name: TABLE miembros_grupo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.miembros_grupo TO authenticated;


--
-- Name: TABLE pagos_evento; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pagos_evento TO authenticated;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE redes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.redes TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.redes TO authenticated;


--
-- Name: TABLE redes_consolidadores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.redes_consolidadores TO authenticated;


--
-- Name: TABLE redes_encargados; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.redes_encargados TO authenticated;


--
-- Name: TABLE redes_pastores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.redes_pastores TO authenticated;


--
-- Name: TABLE registros_diarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registros_diarios TO authenticated;


--
-- Name: TABLE reuniones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reuniones TO authenticated;


--
-- Name: TABLE seguimientos_faltas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.seguimientos_faltas TO authenticated;


--
-- Name: TABLE tarjetas_consolidacion; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tarjetas_consolidacion TO authenticated;


--
-- PostgreSQL database dump complete
--




-- =====================================================================
-- Registro de usuarios: crear el perfil al registrarse
-- =====================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_nuevo_usuario();

-- =====================================================================
-- Iglesia nº 1 y sus redes iniciales
-- =====================================================================
INSERT INTO public.iglesias (nombre, slug) VALUES ('Vida Nueva', 'vida-nueva')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.redes (nombre, iglesia_id)
SELECT r.nombre, i.id
  FROM (VALUES ('Misión Joven'), ('Red de Hombres'), ('Red de Mujeres'), ('Revolución Kids')) AS r(nombre)
 CROSS JOIN public.iglesias i
 WHERE i.slug = 'vida-nueva'
ON CONFLICT (iglesia_id, nombre) DO NOTHING;

-- =====================================================================
-- Seguridad por filas activada en TODAS las tablas
-- =====================================================================
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END;
$$;

-- =====================================================================
-- Permisos: nada abierto para usuarios sin sesión (salvo la lista de redes)
-- =====================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.redes TO anon;
REVOKE ALL ON public.auditoria FROM authenticated;
GRANT SELECT ON public.auditoria TO authenticated;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma, p.prorettype = 'trigger'::regtype AS es_trigger
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.firma);
    IF f.es_trigger THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.firma);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.firma);
    END IF;
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- PRIMER APÓSTOL: registrate desde la app (elegí cualquier red) y después:
--
--   UPDATE public.profiles SET rol = 'apostol', estado = 'activo', red_id = NULL
--    WHERE email = 'tu-correo@ejemplo.com';
--
-- (Tu perfil queda en la iglesia de la red que elegiste al registrarte.)
-- =====================================================================


-- =====================================================================
-- (incluye Etapa 9: historial de liderazgo y notas pastorales)
-- =====================================================================
-- =====================================================================
-- VidaGroups · Etapa 9: historial de liderazgo y notas pastorales
--   1. Quién guió y supervisó cada grupo, y desde/hasta cuándo
--   2. Notas por hermano y del grupo, que pasan de un guía al siguiente.
--      Las ven SOLO el guía del grupo (y co-guías) y su Guía Supervisor.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Historial de liderazgo
-- ---------------------------------------------------------------------
create table if not exists public.historial_liderazgo (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.groups(id) on delete cascade,
  rol       text not null check (rol in ('guia', 'supervisor')),
  perfil_id uuid references public.profiles(id) on delete set null,
  nombre    text not null default '',   -- se guarda el nombre por si la cuenta se borra
  desde     timestamptz not null default now(),
  hasta     timestamptz
);
create index if not exists historial_grupo_idx on public.historial_liderazgo(grupo_id, desde desc);

create or replace function public.nombre_de_perfil(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email, '')
    from public.profiles where id = p_id
$$;

-- Registra los cambios de guía y de supervisor de cada grupo
create or replace function public.registrar_liderazgo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.guia_id is distinct from old.guia_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'guia' and hasta is null;
    if new.guia_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'guia', new.guia_id, public.nombre_de_perfil(new.guia_id));
    end if;
  end if;

  if tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'supervisor' and hasta is null;
    if new.supervisor_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'supervisor', new.supervisor_id, public.nombre_de_perfil(new.supervisor_id));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_registrar_liderazgo on public.groups;
create trigger trg_registrar_liderazgo
  after insert or update on public.groups
  for each row execute function public.registrar_liderazgo();

-- Punto de partida: el guía y el supervisor actuales de cada grupo, desde que se creó
insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre, desde)
select g.id, 'guia', g.guia_id, public.nombre_de_perfil(g.guia_id), g.creado_en
  from public.groups g
 where not exists (select 1 from public.historial_liderazgo h where h.grupo_id = g.id and h.rol = 'guia');

insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre, desde)
select g.id, 'supervisor', g.supervisor_id, public.nombre_de_perfil(g.supervisor_id), g.creado_en
  from public.groups g
 where g.supervisor_id is not null
   and not exists (select 1 from public.historial_liderazgo h where h.grupo_id = g.id and h.rol = 'supervisor');

alter table public.historial_liderazgo enable row level security;
revoke all on public.historial_liderazgo from anon;
grant select on public.historial_liderazgo to authenticated;

drop policy if exists historial_select on public.historial_liderazgo;
create policy historial_select on public.historial_liderazgo
  for select to authenticated using (public.puede_gestionar_grupo(grupo_id));

drop policy if exists solo_mi_iglesia on public.historial_liderazgo;
create policy solo_mi_iglesia on public.historial_liderazgo as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

-- Historial con la asistencia promedio de cada período (respeta permisos)
create or replace function public.historial_grupo(p_grupo uuid)
returns table (rol text, nombre text, desde timestamptz, hasta timestamptz, reuniones int, asistencia int)
language sql stable security invoker set search_path = public as $$
  select h.rol, h.nombre, h.desde, h.hasta,
         count(distinct r.id)::int,
         case when count(distinct r.id) = 0 then null
              else round(100.0 * count(a.miembro_id) filter (where a.presente)
                         / nullif(count(distinct r.id) * greatest(
                             (select count(*) from public.miembros_grupo m where m.grupo_id = p_grupo and m.activo), 1), 0))::int
         end
    from public.historial_liderazgo h
    left join public.reuniones r
      on r.grupo_id = h.grupo_id
     and r.fecha >= h.desde::date
     and (h.hasta is null or r.fecha < h.hasta::date)
    left join public.asistencias a on a.reunion_id = r.id
   where h.grupo_id = p_grupo
   group by h.id, h.rol, h.nombre, h.desde, h.hasta
   order by h.rol, h.desde desc
$$;

-- ---------------------------------------------------------------------
-- 2. Notas pastorales
-- ---------------------------------------------------------------------
create table if not exists public.notas_pastorales (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references public.groups(id) on delete cascade,
  miembro_id uuid references public.miembros_grupo(id) on delete cascade,  -- vacío = nota del grupo
  autor_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  autor      text not null default '',
  texto      text not null check (length(trim(texto)) > 0),
  creado_en  timestamptz not null default now()
);
create index if not exists notas_grupo_idx on public.notas_pastorales(grupo_id, creado_en desc);
create index if not exists notas_miembro_idx on public.notas_pastorales(miembro_id, creado_en desc);

-- Solo el guía del grupo (o co-guía) y su Guía Supervisor. No Encargados, Pastores ni Apóstol.
create or replace function public.puede_ver_notas(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         g.guia_id = auth.uid()
         or public.es_coguia(g.id)
         or (g.supervisor_id = auth.uid() and public.mi_rol() = 'guia_supervisor')
       )
  )
$$;

-- El nombre del autor queda guardado; el miembro tiene que ser del grupo
create or replace function public.completar_nota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := auth.uid();
  new.autor := coalesce(public.nombre_de_perfil(auth.uid()), '');
  if new.miembro_id is not null and public.grupo_de_miembro(new.miembro_id) is distinct from new.grupo_id then
    raise exception 'El hermano no es de este grupo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_completar_nota on public.notas_pastorales;
create trigger trg_completar_nota
  before insert on public.notas_pastorales
  for each row execute function public.completar_nota();

alter table public.notas_pastorales enable row level security;
revoke all on public.notas_pastorales from anon;
grant select, insert, update, delete on public.notas_pastorales to authenticated;

drop policy if exists notas_select on public.notas_pastorales;
create policy notas_select on public.notas_pastorales
  for select to authenticated using (public.puede_ver_notas(grupo_id));

drop policy if exists notas_insert on public.notas_pastorales;
create policy notas_insert on public.notas_pastorales
  for insert to authenticated with check (public.puede_ver_notas(grupo_id));

-- Cada uno edita o borra solo sus propias notas
drop policy if exists notas_update on public.notas_pastorales;
create policy notas_update on public.notas_pastorales
  for update to authenticated
  using (autor_id = auth.uid() and public.puede_ver_notas(grupo_id))
  with check (autor_id = auth.uid() and public.puede_ver_notas(grupo_id));

drop policy if exists notas_delete on public.notas_pastorales;
create policy notas_delete on public.notas_pastorales
  for delete to authenticated using (autor_id = auth.uid());

drop policy if exists solo_mi_iglesia on public.notas_pastorales;
create policy solo_mi_iglesia on public.notas_pastorales as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

-- ---------------------------------------------------------------------
-- 3. Permisos de las funciones nuevas
-- ---------------------------------------------------------------------
revoke execute on function public.nombre_de_perfil(uuid) from public, anon;
revoke execute on function public.puede_ver_notas(uuid) from public, anon;
revoke execute on function public.historial_grupo(uuid) from public, anon;
revoke execute on function public.registrar_liderazgo() from public, anon, authenticated;
revoke execute on function public.completar_nota() from public, anon, authenticated;
grant execute on function public.nombre_de_perfil(uuid) to authenticated;
grant execute on function public.puede_ver_notas(uuid) to authenticated;
grant execute on function public.historial_grupo(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- (incluye Etapa 11: equipo desde planilla)
-- =====================================================================
-- =====================================================================
-- VidaGroups · Etapa 11: configurar el equipo de la red desde una planilla
--   El encargado carga correo, rol, supervisor, grupo y si consolida.
--   · Quien ya se registró queda aprobado al instante.
--   · Quien todavía no, queda aprobado SOLO apenas se registra con ese correo.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

create table if not exists public.preaprobaciones (
  id                uuid primary key default gen_random_uuid(),
  red_id            uuid not null references public.redes(id) on delete cascade,
  email             text not null,
  nombre            text,
  rol               text not null check (rol in ('guia', 'guia_supervisor', 'consolidacion')),
  supervisor_email  text,
  grupo             text,
  consolidador      boolean not null default false,
  perfil_id         uuid references public.profiles(id) on delete set null,
  aplicado_en       timestamptz,
  creado_por        uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_en         timestamptz not null default now(),
  unique (red_id, email)
);

-- Los correos siempre en minúscula
create or replace function public.normalizar_preaprobacion()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  new.supervisor_email := nullif(lower(trim(coalesce(new.supervisor_email, ''))), '');
  new.grupo := nullif(trim(coalesce(new.grupo, '')), '');
  return new;
end;
$$;
drop trigger if exists trg_normalizar_preaprobacion on public.preaprobaciones;
create trigger trg_normalizar_preaprobacion before insert or update on public.preaprobaciones
  for each row execute function public.normalizar_preaprobacion();

alter table public.preaprobaciones enable row level security;
revoke all on public.preaprobaciones from anon;
grant select, insert, update, delete on public.preaprobaciones to authenticated;

drop policy if exists preaprobaciones_todo on public.preaprobaciones;
create policy preaprobaciones_todo on public.preaprobaciones
  for all to authenticated
  using (public.administra_red(red_id))
  with check (public.administra_red(red_id));

drop policy if exists solo_mi_iglesia on public.preaprobaciones;
create policy solo_mi_iglesia on public.preaprobaciones as restrictive for all to authenticated
  using (public.iglesia_de_red(red_id) = public.mi_iglesia())
  with check (public.iglesia_de_red(red_id) = public.mi_iglesia());

-- ---------------------------------------------------------------------
-- Aplica la configuración de una persona (uso interno)
-- ---------------------------------------------------------------------
create or replace function public.aplicar_preaprobacion_perfil(p_perfil uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_perfil public.profiles%rowtype;
  v_pre    public.preaprobaciones%rowtype;
  v_sup    uuid;
begin
  select * into v_perfil from public.profiles where id = p_perfil;
  if not found then return false; end if;

  select * into v_pre from public.preaprobaciones
   where email = lower(v_perfil.email) and aplicado_en is null
     and public.iglesia_de_red(red_id) = v_perfil.iglesia_id
   order by creado_en desc limit 1;
  if not found then return false; end if;

  -- Operación del sistema: saltea el control de roles
  perform set_config('app.dev_switch', 'on', true);

  -- 1. Aprobado, con su rol y su red
  update public.profiles
     set estado = 'activo', rol = v_pre.rol, red_id = v_pre.red_id,
         nombre = coalesce(nullif(nombre, ''), split_part(coalesce(v_pre.nombre, ''), ' ', 1))
   where id = p_perfil;

  -- 2. Su supervisor, si ya tiene cuenta
  if v_pre.supervisor_email is not null then
    select id into v_sup from public.profiles
     where lower(email) = v_pre.supervisor_email and iglesia_id = v_perfil.iglesia_id and id <> p_perfil;
    if v_sup is not null then
      update public.profiles set supervisor_id = v_sup where id = p_perfil;
    end if;
  end if;

  -- 3. Los que lo esperaban como supervisor
  update public.profiles p
     set supervisor_id = p_perfil
    from public.preaprobaciones x
   where x.red_id = v_pre.red_id and x.supervisor_email = lower(v_perfil.email)
     and x.perfil_id = p.id and p.supervisor_id is null and p.id <> p_perfil;

  -- 4. El grupo que guía (si no existe, se crea)
  if v_pre.grupo is not null then
    update public.groups set guia_id = p_perfil
     where red_id = v_pre.red_id and lower(trim(nombre)) = lower(v_pre.grupo);
    if not found then
      insert into public.groups (nombre, red_id, guia_id) values (v_pre.grupo, v_pre.red_id, p_perfil);
    end if;
  end if;

  -- 5. Consolidador/a de la red
  if v_pre.consolidador then
    insert into public.redes_consolidadores (red_id, perfil_id) values (v_pre.red_id, p_perfil)
    on conflict do nothing;
  end if;

  update public.preaprobaciones set perfil_id = p_perfil, aplicado_en = now() where id = v_pre.id;
  perform set_config('app.dev_switch', 'off', true);
  return true;
end;
$$;
revoke execute on function public.aplicar_preaprobacion_perfil(uuid) from public, anon, authenticated;

-- Cuando alguien se registra, si estaba en la planilla, queda aprobado solo
create or replace function public.preaprobar_al_registrarse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.aplicar_preaprobacion_perfil(new.id);
  return new;
end;
$$;
revoke execute on function public.preaprobar_al_registrarse() from public, anon, authenticated;

drop trigger if exists trg_preaprobar_al_registrarse on public.profiles;
create trigger trg_preaprobar_al_registrarse after insert on public.profiles
  for each row execute function public.preaprobar_al_registrarse();

-- ---------------------------------------------------------------------
-- La llama el encargado al guardar la planilla: aplica a quienes ya se registraron
-- ---------------------------------------------------------------------
create or replace function public.aplicar_preaprobaciones(p_red uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_x record;
  v_aplicados int := 0;
begin
  if not public.administra_red(p_red) then
    raise exception 'Solo el encargado o el pastor de la red puede hacer esto';
  end if;

  -- Primero los supervisores, así sus guías los encuentran
  for v_x in
    select p.id
      from public.preaprobaciones x
      join public.profiles p on lower(p.email) = x.email and p.iglesia_id = public.iglesia_de_red(x.red_id)
     where x.red_id = p_red and x.aplicado_en is null
     order by case x.rol when 'guia_supervisor' then 0 when 'consolidacion' then 1 else 2 end
  loop
    if public.aplicar_preaprobacion_perfil(v_x.id) then
      v_aplicados := v_aplicados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'aplicados', v_aplicados,
    'esperando', (select count(*) from public.preaprobaciones where red_id = p_red and aplicado_en is null)
  );
end;
$$;
revoke execute on function public.aplicar_preaprobaciones(uuid) from public, anon;
grant execute on function public.aplicar_preaprobaciones(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- (incluye Etapa 12: supervisores en el Panel Pastoral)
-- =====================================================================
-- =====================================================================
-- VidaGroups · Etapa 12: sección "Supervisores" del Panel Pastoral
--   Una tarjeta por Guía Supervisor con cómo vienen sus grupos, para que
--   los pastores de la red vean a qué supervisor acompañar.
--   Respeta permisos: cada pastor ve los supervisores de sus redes.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

create or replace function public.panel_supervisores()
returns jsonb
language sql stable security invoker set search_path = public as $$
  with
  f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  sup as (
    select p.id, p.email, p.telefono,
           coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email) as nombre
      from public.profiles p
     where p.rol = 'guia_supervisor' and p.estado = 'activo'
  ),
  g as (
    select gr.id, gr.nombre, gr.supervisor_id, gr.guia_id
      from public.groups gr
     where gr.supervisor_id in (select id from sup)
  ),
  m as (
    select grupo_id, count(*) as n from public.miembros_grupo where activo group by grupo_id
  ),
  r as (
    select re.id, re.grupo_id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.consolidado) as consol
      from public.reuniones re
     where re.grupo_id in (select id from g) and re.fecha >= (select mes_ant from f)
  ),
  alertas as (
    select grupo_id, count(*) as n from public.miembros_en_alerta(3) group by grupo_id
  ),
  por_grupo as (
    select g.id, g.nombre, g.supervisor_id,
           nullif(trim(coalesce(pg.nombre, '') || ' ' || coalesce(pg.apellido, '')), '') as guia,
           coalesce(m.n, 0) as miembros,
           (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id) as ultima,
           coalesce(sum(r.presentes) filter (where r.fecha >= (select mes from f)), 0) as pres_mes,
           count(r.id) filter (where r.fecha >= (select mes from f)) * coalesce(m.n, 0) as esp_mes,
           coalesce(sum(r.presentes) filter (where r.fecha < (select mes from f)), 0) as pres_ant,
           count(r.id) filter (where r.fecha < (select mes from f)) * coalesce(m.n, 0) as esp_ant,
           coalesce(sum(r.consol) filter (where r.fecha >= (select hoy from f) - 7), 0) as c_semana,
           coalesce(max(al.n), 0) as alertas,
           (select count(*) from public.tarjetas_consolidacion t
             where t.grupo_id = g.id and not coalesce(t.comenzo_gv, false)
               and coalesce(t.estado, '') <> 'completada') as sin_empezar
      from g
      left join m on m.grupo_id = g.id
      left join r on r.grupo_id = g.id
      left join alertas al on al.grupo_id = g.id
      left join public.profiles pg on pg.id = g.guia_id
     group by g.id, g.nombre, g.supervisor_id, pg.nombre, pg.apellido, m.n
  ),
  por_sup as (
    select s.id, s.nombre, s.email, s.telefono,
           count(pg.id) as grupos,
           coalesce(sum(pg.miembros), 0) as miembros,
           case when sum(pg.esp_mes) > 0 then round(100.0 * sum(pg.pres_mes) / sum(pg.esp_mes))::int end as asistencia,
           case when sum(pg.esp_ant) > 0 then round(100.0 * sum(pg.pres_ant) / sum(pg.esp_ant))::int end as asistencia_anterior,
           count(pg.id) filter (where pg.miembros > 0 and (pg.ultima is null or pg.ultima < (select hoy from f) - 14)) as sin_reunion,
           coalesce(sum(pg.sin_empezar), 0) as sin_empezar,
           coalesce(sum(pg.c_semana), 0) as c_semana,
           coalesce(sum(pg.alertas), 0) as alertas,
           coalesce(jsonb_agg(jsonb_build_object(
             'id', pg.id, 'nombre', pg.nombre, 'guia', pg.guia, 'miembros', pg.miembros, 'ultima', pg.ultima,
             'asistencia', case when pg.esp_mes > 0 then round(100.0 * pg.pres_mes / pg.esp_mes)::int end,
             'alertas', pg.alertas,
             'sin_reunion', pg.miembros > 0 and (pg.ultima is null or pg.ultima < (select hoy from f) - 14)
           ) order by pg.nombre) filter (where pg.id is not null), '[]'::jsonb) as lista_grupos
      from sup s
      left join por_grupo pg on pg.supervisor_id = s.id
     group by s.id, s.nombre, s.email, s.telefono
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by (x.sin_reunion + x.alertas) desc, x.asistencia nulls first, x.nombre), '[]'::jsonb)
    from por_sup x
   where x.grupos > 0
$$;

revoke execute on function public.panel_supervisores() from public, anon;
grant execute on function public.panel_supervisores() to authenticated;

notify pgrst, 'reload schema';


-- =====================================================================
-- (incluye Etapa 13: dos supervisores por grupo)
-- =====================================================================
-- =====================================================================
-- VidaGroups · Etapa 13: un grupo puede tener dos Guías Supervisores
--   El supervisor principal sigue siendo el supervisor del guía.
--   El segundo se agrega por grupo (por ejemplo, "Flor y Samu").
--   El segundo supervisor ve y acompaña el grupo igual que el principal:
--   su panel, la asistencia, la consolidación y las notas pastorales.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run.
-- =====================================================================

begin;

create table if not exists public.grupo_supervisores (
  grupo_id  uuid not null references public.groups(id) on delete cascade,
  perfil_id uuid not null references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);

-- Solo Guías Supervisores, de la misma red, y distinto del principal
create or replace function public.validar_cosupervisor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text;
  v_red uuid;
  v_grupo_red uuid;
  v_principal uuid;
begin
  select rol, red_id into v_rol, v_red from public.profiles where id = new.perfil_id;
  select red_id, supervisor_id into v_grupo_red, v_principal from public.groups where id = new.grupo_id;
  if v_rol is distinct from 'guia_supervisor' then
    raise exception 'El segundo supervisor tiene que ser un Guía Supervisor';
  end if;
  if v_red is distinct from v_grupo_red then
    raise exception 'El segundo supervisor tiene que ser de la misma red que el grupo';
  end if;
  if new.perfil_id = v_principal then
    raise exception 'Esa persona ya es el supervisor principal del grupo';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validar_cosupervisor on public.grupo_supervisores;
create trigger trg_validar_cosupervisor before insert or update on public.grupo_supervisores
  for each row execute function public.validar_cosupervisor();

-- Historial de liderazgo: el segundo supervisor también queda registrado
create or replace function public.historial_cosupervisor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
    values (new.grupo_id, 'supervisor', new.perfil_id, public.nombre_de_perfil(new.perfil_id));
    return new;
  else
    update public.historial_liderazgo set hasta = now()
     where grupo_id = old.grupo_id and rol = 'supervisor' and perfil_id = old.perfil_id and hasta is null;
    return old;
  end if;
end;
$$;
drop trigger if exists trg_historial_cosupervisor on public.grupo_supervisores;
create trigger trg_historial_cosupervisor after insert or delete on public.grupo_supervisores
  for each row execute function public.historial_cosupervisor();

-- El registro del supervisor principal no cierra el del segundo (y al revés)
create or replace function public.registrar_liderazgo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.guia_id is distinct from old.guia_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'guia' and hasta is null;
    if new.guia_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'guia', new.guia_id, public.nombre_de_perfil(new.guia_id));
    end if;
  end if;

  if tg_op = 'INSERT' or new.supervisor_id is distinct from old.supervisor_id then
    update public.historial_liderazgo set hasta = now()
     where grupo_id = new.id and rol = 'supervisor' and hasta is null
       and perfil_id is not distinct from (case when tg_op = 'INSERT' then null else old.supervisor_id end);
    if new.supervisor_id is not null then
      insert into public.historial_liderazgo (grupo_id, rol, perfil_id, nombre)
      values (new.id, 'supervisor', new.supervisor_id, public.nombre_de_perfil(new.supervisor_id));
    end if;
  end if;
  return new;
end;
$$;

-- ¿Soy el segundo supervisor de este grupo?
create or replace function public.es_cosupervisor(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.grupo_supervisores where grupo_id = p_grupo and perfil_id = auth.uid()
  )
$$;

-- ¿Es guía de algún grupo que superviso como segundo supervisor?
create or replace function public.es_guia_cosupervisado(p_perfil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups g
      join public.grupo_supervisores gs on gs.grupo_id = g.id
     where gs.perfil_id = auth.uid() and g.guia_id = p_perfil
  )
$$;

alter table public.grupo_supervisores enable row level security;
revoke all on public.grupo_supervisores from anon;
grant select, insert, delete on public.grupo_supervisores to authenticated;

drop policy if exists grupo_supervisores_select on public.grupo_supervisores;
create policy grupo_supervisores_select on public.grupo_supervisores
  for select to authenticated using (public.puede_gestionar_grupo(grupo_id));

drop policy if exists grupo_supervisores_escritura on public.grupo_supervisores;
create policy grupo_supervisores_escritura on public.grupo_supervisores
  for all to authenticated
  using (public.administra_red((select red_id from public.groups where id = grupo_id)))
  with check (public.administra_red((select red_id from public.groups where id = grupo_id)));

drop policy if exists solo_mi_iglesia on public.grupo_supervisores;
create policy solo_mi_iglesia on public.grupo_supervisores as restrictive for all to authenticated
  using (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia())
  with check (public.iglesia_de_grupo(grupo_id) = public.mi_iglesia());

-- ---------------------------------------------------------------------
-- Permisos: el segundo supervisor puede lo mismo que el principal
-- ---------------------------------------------------------------------
create or replace function public.puede_gestionar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         public.administra_red(g.red_id)
         or g.guia_id = auth.uid()
         or g.supervisor_id = auth.uid()
         or public.es_subordinado(g.guia_id)
         or public.es_coguia(g.id)
         or public.es_cosupervisor(g.id)
       )
  )
$$;

create or replace function public.puede_ver_notas(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.estoy_activo() and exists (
    select 1 from public.groups g
     where g.id = p_grupo
       and (
         g.guia_id = auth.uid()
         or public.es_coguia(g.id)
         or (g.supervisor_id = auth.uid() and public.mi_rol() = 'guia_supervisor')
         or (public.es_cosupervisor(g.id) and public.mi_rol() = 'guia_supervisor')
       )
  )
$$;

drop policy if exists grupos_select on public.groups;
create policy grupos_select on public.groups
  for select to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id)
      or guia_id = auth.uid()
      or supervisor_id = auth.uid()
      or public.es_subordinado(guia_id)
      or public.es_coguia(id)
      or public.es_cosupervisor(id)
      or public.es_consolidador_de(red_id)
    )
  );

drop policy if exists grupos_update on public.groups;
create policy grupos_update on public.groups
  for update to authenticated
  using (
    public.estoy_activo() and (
      public.administra_red(red_id) or guia_id = auth.uid() or supervisor_id = auth.uid()
      or public.es_subordinado(guia_id) or public.es_coguia(id) or public.es_cosupervisor(id)
    )
  );

drop policy if exists perfiles_select on public.profiles;
create policy perfiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.es_apostol()
    or (public.estoy_activo() and (
          public.administra_red(red_id)
          or public.es_subordinado(id)
          or id in (select public.superiores(auth.uid()))
          or public.es_guia_cosupervisado(id)
          or public.es_consolidador_de(red_id)
          or (red_id is null and public.es_pastor())
    ))
  );

-- ---------------------------------------------------------------------
-- Paneles: el grupo aparece en el panel de los dos supervisores
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.panel_supervisor()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  g as (
    select gr.id, gr.nombre, gr.guia_id, gr.red_id
      from public.groups gr
     where gr.supervisor_id = auth.uid() or public.es_subordinado(gr.guia_id) or gr.guia_id = auth.uid()
        or public.es_cosupervisor(gr.id)
  ),
  m as (
    select grupo_id, count(*) as n,
           count(*) filter (where creado_en >= (select mes from f)) as nuevos
      from public.miembros_grupo where activo group by grupo_id
  ),
  r as (
    select re.grupo_id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes
      from public.reuniones re
     where re.fecha >= (select mes_ant from f)
  ),
  asis as (
    select g.id as grupo_id,
           (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id) as ultima,
           sum(r.presentes) filter (where r.fecha >= (select mes from f)) as pres_mes,
           count(r.fecha) filter (where r.fecha >= (select mes from f)) as reu_mes,
           sum(r.presentes) filter (where r.fecha < (select mes from f)) as pres_ant,
           count(r.fecha) filter (where r.fecha < (select mes from f)) as reu_ant
      from g left join r on r.grupo_id = g.id
     group by g.id
  ),
  alertas as (select grupo_id, count(*) as n from public.miembros_en_alerta(3) group by grupo_id),
  tarj as (
    select t.grupo_id, count(*) filter (where not coalesce(t.comenzo_gv, false)) as sin_empezar
      from public.tarjetas_consolidacion t
     where coalesce(t.estado, '') <> 'completada'
     group by t.grupo_id
  ),
  filas as (
    select g.id, g.nombre,
           nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '') as guia,
           p.telefono as guia_telefono,
           g.guia_id = auth.uid() as es_mio,
           coalesce(m.n, 0) as miembros,
           coalesce(m.nuevos, 0) as nuevos,
           a.ultima as ultima_reunion,
           case when a.reu_mes * coalesce(m.n, 0) > 0 then round(100.0 * a.pres_mes / (a.reu_mes * m.n))::int end as asistencia,
           case when a.reu_ant * coalesce(m.n, 0) > 0 then round(100.0 * a.pres_ant / (a.reu_ant * m.n))::int end as asistencia_anterior,
           coalesce(al.n, 0) as alertas,
           coalesce(tj.sin_empezar, 0) as sin_empezar,
           (select jsonb_build_object(
                     'id', e.id, 'nombre', e.nombre, 'moneda', e.moneda, 'costo', e.costo_total,
                     'recaudado', coalesce((select sum(pe.monto_pagado)
                                              from public.pagos_evento pe
                                              join public.miembros_grupo mm on mm.id = pe.miembro_id
                                             where pe.evento_id = e.id and mm.grupo_id = g.id), 0))
              from public.eventos e
             where e.fecha_evento >= (select hoy from f) and e.costo_total > 0
               and (e.grupo_id = g.id or (e.grupo_id is null and (e.red_id is null or e.red_id = g.red_id)))
             order by e.fecha_evento
             limit 1) as evento
      from g
      left join m on m.grupo_id = g.id
      left join asis a on a.grupo_id = g.id
      left join alertas al on al.grupo_id = g.id
      left join tarj tj on tj.grupo_id = g.id
      left join public.profiles p on p.id = g.guia_id
  )
  select jsonb_build_object(
    'grupos', coalesce((select jsonb_agg(to_jsonb(x) order by x.asistencia nulls first, x.nombre) from filas x), '[]'::jsonb),
    'cumples', coalesce((
      select jsonb_agg(jsonb_build_object('id', mm.id, 'nombre', trim(mm.nombre || ' ' || coalesce(mm.apellido, '')),
                                          'grupo', g.nombre, 'dia', to_char(mm.cumpleanos, 'DD/MM'))
                       order by to_char(mm.cumpleanos, 'MMDD'))
        from public.miembros_grupo mm join g on g.id = mm.grupo_id
       where mm.activo and mm.cumpleanos is not null
         and case
               when to_char((select hoy from f), 'MMDD') <= to_char((select hoy from f) + 6, 'MMDD')
                 then to_char(mm.cumpleanos, 'MMDD') between to_char((select hoy from f), 'MMDD') and to_char((select hoy from f) + 6, 'MMDD')
               else to_char(mm.cumpleanos, 'MMDD') >= to_char((select hoy from f), 'MMDD')
                 or to_char(mm.cumpleanos, 'MMDD') <= to_char((select hoy from f) + 6, 'MMDD')
             end), '[]'::jsonb),
    'tarjetas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.creado_en desc)
        from (select tc.id, tc.nombre, tc.gv_asignado, tc.fonovisita, tc.visita, tc.pilares, tc.pilar_1, tc.pilar_2, tc.pilar_3, tc.pilar_4, tc.pilar_5, tc.comenzo_gv, tc.encuentro, tc.creado_en
                from public.tarjetas_consolidacion tc join g on g.id = tc.grupo_id
               where coalesce(tc.estado, '') <> 'completada'
               order by tc.creado_en desc limit 20) t), '[]'::jsonb)
  )
$function$;

CREATE OR REPLACE FUNCTION public.panel_supervisores()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  f as (
    select current_date as hoy,
           date_trunc('month', current_date)::date as mes,
           (date_trunc('month', current_date) - interval '1 month')::date as mes_ant
  ),
  sup as (
    select p.id, p.email, p.telefono,
           coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email) as nombre
      from public.profiles p
     where p.rol = 'guia_supervisor' and p.estado = 'activo'
  ),
  g as (
    select gr.id, gr.nombre, gr.supervisor_id, gr.guia_id
      from public.groups gr
     where gr.supervisor_id in (select id from sup)
    union
    select gr.id, gr.nombre, gs.perfil_id, gr.guia_id
      from public.grupo_supervisores gs
      join public.groups gr on gr.id = gs.grupo_id
     where gs.perfil_id in (select id from sup)
  ),
  m as (
    select grupo_id, count(*) as n from public.miembros_grupo where activo group by grupo_id
  ),
  r as (
    select re.id, re.grupo_id, re.fecha,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.presente) as presentes,
           (select count(*) from public.asistencias a where a.reunion_id = re.id and a.consolidado) as consol
      from public.reuniones re
     where re.grupo_id in (select id from g) and re.fecha >= (select mes_ant from f)
  ),
  alertas as (
    select grupo_id, count(*) as n from public.miembros_en_alerta(3) group by grupo_id
  ),
  por_grupo as (
    select g.id, g.nombre, g.supervisor_id,
           nullif(trim(coalesce(pg.nombre, '') || ' ' || coalesce(pg.apellido, '')), '') as guia,
           coalesce(m.n, 0) as miembros,
           (select max(x.fecha) from public.reuniones x where x.grupo_id = g.id) as ultima,
           coalesce(sum(r.presentes) filter (where r.fecha >= (select mes from f)), 0) as pres_mes,
           count(r.id) filter (where r.fecha >= (select mes from f)) * coalesce(m.n, 0) as esp_mes,
           coalesce(sum(r.presentes) filter (where r.fecha < (select mes from f)), 0) as pres_ant,
           count(r.id) filter (where r.fecha < (select mes from f)) * coalesce(m.n, 0) as esp_ant,
           coalesce(sum(r.consol) filter (where r.fecha >= (select hoy from f) - 7), 0) as c_semana,
           coalesce(max(al.n), 0) as alertas,
           (select count(*) from public.tarjetas_consolidacion t
             where t.grupo_id = g.id and not coalesce(t.comenzo_gv, false)
               and coalesce(t.estado, '') <> 'completada') as sin_empezar
      from g
      left join m on m.grupo_id = g.id
      left join r on r.grupo_id = g.id
      left join alertas al on al.grupo_id = g.id
      left join public.profiles pg on pg.id = g.guia_id
     group by g.id, g.nombre, g.supervisor_id, pg.nombre, pg.apellido, m.n
  ),
  por_sup as (
    select s.id, s.nombre, s.email, s.telefono,
           count(pg.id) as grupos,
           coalesce(sum(pg.miembros), 0) as miembros,
           case when sum(pg.esp_mes) > 0 then round(100.0 * sum(pg.pres_mes) / sum(pg.esp_mes))::int end as asistencia,
           case when sum(pg.esp_ant) > 0 then round(100.0 * sum(pg.pres_ant) / sum(pg.esp_ant))::int end as asistencia_anterior,
           count(pg.id) filter (where pg.miembros > 0 and (pg.ultima is null or pg.ultima < (select hoy from f) - 14)) as sin_reunion,
           coalesce(sum(pg.sin_empezar), 0) as sin_empezar,
           coalesce(sum(pg.c_semana), 0) as c_semana,
           coalesce(sum(pg.alertas), 0) as alertas,
           coalesce(jsonb_agg(jsonb_build_object(
             'id', pg.id, 'nombre', pg.nombre, 'guia', pg.guia, 'miembros', pg.miembros, 'ultima', pg.ultima,
             'asistencia', case when pg.esp_mes > 0 then round(100.0 * pg.pres_mes / pg.esp_mes)::int end,
             'alertas', pg.alertas,
             'sin_reunion', pg.miembros > 0 and (pg.ultima is null or pg.ultima < (select hoy from f) - 14)
           ) order by pg.nombre) filter (where pg.id is not null), '[]'::jsonb) as lista_grupos
      from sup s
      left join por_grupo pg on pg.supervisor_id = s.id
     group by s.id, s.nombre, s.email, s.telefono
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by (x.sin_reunion + x.alertas) desc, x.asistencia nulls first, x.nombre), '[]'::jsonb)
    from por_sup x
   where x.grupos > 0
$function$;

-- ---------------------------------------------------------------------
-- Planilla de equipo: columna opcional "Correo del 2º supervisor"
-- ---------------------------------------------------------------------
alter table public.preaprobaciones add column if not exists supervisor2_email text;

create or replace function public.normalizar_preaprobacion()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  new.supervisor_email := nullif(lower(trim(coalesce(new.supervisor_email, ''))), '');
  new.supervisor2_email := nullif(lower(trim(coalesce(new.supervisor2_email, ''))), '');
  new.grupo := nullif(trim(coalesce(new.grupo, '')), '');
  return new;
end;
$$;

create or replace function public.aplicar_preaprobacion_perfil(p_perfil uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_perfil public.profiles%rowtype;
  v_pre    public.preaprobaciones%rowtype;
  v_sup    uuid;
begin
  select * into v_perfil from public.profiles where id = p_perfil;
  if not found then return false; end if;

  select * into v_pre from public.preaprobaciones
   where email = lower(v_perfil.email) and aplicado_en is null
     and public.iglesia_de_red(red_id) = v_perfil.iglesia_id
   order by creado_en desc limit 1;
  if not found then return false; end if;

  -- Operación del sistema: saltea el control de roles
  perform set_config('app.dev_switch', 'on', true);

  -- 1. Aprobado, con su rol y su red
  update public.profiles
     set estado = 'activo', rol = v_pre.rol, red_id = v_pre.red_id,
         nombre = coalesce(nullif(nombre, ''), split_part(coalesce(v_pre.nombre, ''), ' ', 1))
   where id = p_perfil;

  -- 2. Su supervisor, si ya tiene cuenta
  if v_pre.supervisor_email is not null then
    select id into v_sup from public.profiles
     where lower(email) = v_pre.supervisor_email and iglesia_id = v_perfil.iglesia_id and id <> p_perfil;
    if v_sup is not null then
      update public.profiles set supervisor_id = v_sup where id = p_perfil;
    end if;
  end if;

  -- 3. Los que lo esperaban como supervisor
  update public.profiles p
     set supervisor_id = p_perfil
    from public.preaprobaciones x
   where x.red_id = v_pre.red_id and x.supervisor_email = lower(v_perfil.email)
     and x.perfil_id = p.id and p.supervisor_id is null and p.id <> p_perfil;

  -- 4. El grupo que guía (si no existe, se crea)
  if v_pre.grupo is not null then
    update public.groups set guia_id = p_perfil
     where red_id = v_pre.red_id and lower(trim(nombre)) = lower(v_pre.grupo);
    if not found then
      insert into public.groups (nombre, red_id, guia_id) values (v_pre.grupo, v_pre.red_id, p_perfil);
    end if;
  end if;

  -- 4b. Segundo supervisor de su(s) grupo(s), si ya tiene cuenta
  if v_pre.supervisor2_email is not null then
    insert into public.grupo_supervisores (grupo_id, perfil_id)
    select g.id, s.id
      from public.groups g
      join public.profiles s on lower(s.email) = v_pre.supervisor2_email and s.iglesia_id = v_perfil.iglesia_id
     where g.guia_id = p_perfil and s.id <> coalesce(g.supervisor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    on conflict do nothing;
  end if;

  -- 4c. Los grupos que lo esperaban como segundo supervisor
  insert into public.grupo_supervisores (grupo_id, perfil_id)
  select g.id, p_perfil
    from public.preaprobaciones x
    join public.groups g on g.guia_id = x.perfil_id
   where x.red_id = v_pre.red_id and x.supervisor2_email = lower(v_perfil.email)
     and x.perfil_id is not null and coalesce(g.supervisor_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_perfil
  on conflict do nothing;

  -- 5. Consolidador/a de la red
  if v_pre.consolidador then
    insert into public.redes_consolidadores (red_id, perfil_id) values (v_pre.red_id, p_perfil)
    on conflict do nothing;
  end if;

  update public.preaprobaciones set perfil_id = p_perfil, aplicado_en = now() where id = v_pre.id;
  perform set_config('app.dev_switch', 'off', true);
  return true;
end;
$$;

-- Permisos de las funciones nuevas
revoke execute on function public.es_cosupervisor(uuid) from public, anon;
revoke execute on function public.es_guia_cosupervisado(uuid) from public, anon;
revoke execute on function public.validar_cosupervisor() from public, anon, authenticated;
revoke execute on function public.historial_cosupervisor() from public, anon, authenticated;
revoke execute on function public.aplicar_preaprobacion_perfil(uuid) from public, anon, authenticated;
grant execute on function public.es_cosupervisor(uuid) to authenticated;
grant execute on function public.es_guia_cosupervisado(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
