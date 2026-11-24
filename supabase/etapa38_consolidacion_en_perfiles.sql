-- =====================================================================
-- VidaGroups · Etapa 38: Consolidación en el perfil de cada miembro
--   · Todos los miembros (vengan o no de una tarjeta) tienen su avance:
--     Pilares (1 a 5), Encuentro, Pos-encuentro (1 a 10), Reencuentro,
--     Bautismo, Sanidad interior y Escuela de capacitación (Nivel 1, 2 o 3).
--   · La hoja DATOS de la planilla se llena sola con esos botones
--     ("SI", "NO", "SI- JUNIO", "CURSANDO (3/5)", "NIVEL 2"...).
--   · Si se importa una planilla, se lee lo escrito y se marcan los botones.
--   · Si el miembro vino por una tarjeta, quedan unidos: lo que se marca
--     en la tarjeta aparece en el perfil y al revés.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.miembros_grupo
  add column if not exists tarjeta_id uuid references public.tarjetas_consolidacion(id) on delete set null,
  add column if not exists pilar_1 boolean not null default false,
  add column if not exists pilar_2 boolean not null default false,
  add column if not exists pilar_3 boolean not null default false,
  add column if not exists pilar_4 boolean not null default false,
  add column if not exists pilar_5 boolean not null default false,
  add column if not exists encuentro boolean not null default false,
  add column if not exists encuentro_en date,
  add column if not exists pos_encuentro smallint[] not null default '{}',
  add column if not exists reencuentro boolean not null default false,
  add column if not exists reencuentro_en date,
  add column if not exists bautizado boolean,
  add column if not exists hizo_sanidad boolean,
  add column if not exists escuela_nivel smallint check (escuela_nivel between 0 and 3);

-- (una versión anterior de esta etapa la guardaba como SI / NO)
alter table public.miembros_grupo drop column if exists en_escuela;

create index if not exists miembros_grupo_tarjeta_idx on public.miembros_grupo (tarjeta_id);

-- ---------------------------------------------------------------------
-- 2. Ayudantes para leer y escribir lo de la planilla
-- ---------------------------------------------------------------------
create or replace function public.dp_mes_texto(p date)
returns text language sql immutable as $$
  select (array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO',
                'SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])[extract(month from p)::int]
$$;

-- "SI…" → true · "NO…" → false · otra cosa → null
create or replace function public.dp_si_no(p text)
returns boolean language sql immutable as $$
  select case
    when upper(trim(coalesce(p, ''))) ~ '^(SI|SÍ)([^A-ZÁÉÍÓÚÑ]|$)|^(OK|X)$' then true
    when upper(trim(coalesce(p, ''))) ~ '^NO([^A-ZÁÉÍÓÚÑ]|$)' then false
  end
$$;

-- Mes escrito ("SI- JUNIO", "si junio 2025") → fecha (día 1). Sin año: el último junio que pasó.
create or replace function public.dp_fecha_de(p text, p_hoy date default current_date)
returns date language plpgsql stable as $$
declare
  v text := upper(coalesce(p, ''));
  v_meses text[] := array['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  v_mes int;
  v_anio int;
begin
  v := translate(v, 'ÁÉÍÓÚ', 'AEIOU');
  for i in 1..12 loop
    if v ~ ('\m' || v_meses[i]) or (i = 9 and v ~ '\mSET') then v_mes := i; exit; end if;
  end loop;
  if v_mes is null then return null; end if;
  v_anio := nullif(substring(v from '(20[0-9]{2})'), '')::int;
  if v_anio is null then
    v_anio := extract(year from p_hoy)::int;
    if v_mes > extract(month from p_hoy)::int then v_anio := v_anio - 1; end if;
  end if;
  return make_date(v_anio, v_mes, 1);
end;
$$;

-- Clases o pilares hechos a partir del texto: "SI" → todos · "CURSANDO (3/5)" → 1 a 3 · "1, 2, 4" → esos
create or replace function public.dp_lista(p text, p_max int)
returns smallint[] language plpgsql immutable as $$
declare
  v text := upper(trim(coalesce(p, '')));
  n int;
begin
  if v = '' or public.dp_si_no(v) is false then return '{}'; end if;
  n := nullif(substring(v from '([0-9]+)\s*/\s*' || p_max), '')::int;
  if n is not null then
    return coalesce((select array_agg(x::smallint order by x) from generate_series(1, least(n, p_max)) x), '{}');
  end if;
  if public.dp_si_no(v) or v ~ '^COMPLET' then
    return (select array_agg(x::smallint order by x) from generate_series(1, p_max) x);
  end if;
  return coalesce((select array_agg(distinct m[1]::smallint order by m[1]::smallint)
                     from regexp_matches(v, '([0-9]+)', 'g') m
                    where m[1]::int between 1 and p_max), '{}');
end;
$$;

-- Escuela de capacitación: "NIVEL 2" → 2 · "NO" → 0 · "SI" → 1 · otra cosa → null
create or replace function public.dp_nivel(p text)
returns smallint language sql immutable as $$
  select case
    when public.dp_si_no(p) is false then 0
    when substring(upper(coalesce(p, '')) from '([1-3])') is not null then substring(upper(p) from '([1-3])')::smallint
    when public.dp_si_no(p) then 1
  end::smallint
$$;

create or replace function public.dp_texto_avance(n int, p_max int)
returns text language sql immutable as $$
  select case when n >= p_max then 'SI' when n <= 0 then 'NO' else 'CURSANDO (' || n || '/' || p_max || ')' end
$$;

-- ---------------------------------------------------------------------
-- 3. Unir con la tarjeta y armar la hoja DATOS (antes de guardar)
-- ---------------------------------------------------------------------
create or replace function public.datos_planilla_miembro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ins boolean := tg_op = 'INSERT';
  t record;
  v_tel text;
  v_pil boolean[];
  v_pos smallint[];
  v boolean;
begin
  if current_setting('app.solo_parsear', true) = 'on' then
    return new;
  end if;

  -- 3a. Si viene de una tarjeta del mismo grupo (por teléfono), se unen
  if new.tarjeta_id is null and ins then
    v_tel := right(regexp_replace(coalesce(new.telefono, ''), '\D', '', 'g'), 7);
    if length(v_tel) = 7 then
      select tc.id into new.tarjeta_id
        from public.tarjetas_consolidacion tc
       where tc.grupo_id = new.grupo_id
         and right(regexp_replace(coalesce(tc.telefono, ''), '\D', '', 'g'), 7) = v_tel
         and not exists (select 1 from public.miembros_grupo m where m.tarjeta_id = tc.id and m.activo)
       order by tc.creado_en desc
       limit 1;
    end if;
  end if;

  -- 3b. Recién unido a la tarjeta: se suma lo que ya estaba marcado allá
  if new.tarjeta_id is not null and (ins or old.tarjeta_id is distinct from new.tarjeta_id) then
    select * into t from public.tarjetas_consolidacion where id = new.tarjeta_id;
    if found then
      new.pilar_1 := new.pilar_1 or coalesce(t.pilar_1, false) or coalesce(t.pilares, false);
      new.pilar_2 := new.pilar_2 or coalesce(t.pilar_2, false) or coalesce(t.pilares, false);
      new.pilar_3 := new.pilar_3 or coalesce(t.pilar_3, false) or coalesce(t.pilares, false);
      new.pilar_4 := new.pilar_4 or coalesce(t.pilar_4, false) or coalesce(t.pilares, false);
      new.pilar_5 := new.pilar_5 or coalesce(t.pilar_5, false) or coalesce(t.pilares, false);
      if coalesce(t.encuentro, false) then
        new.encuentro := true;
        new.encuentro_en := coalesce(new.encuentro_en, t.encuentro_en, t.fecha_encuentro);
      end if;
      new.pos_encuentro := array(select distinct x from unnest(coalesce(new.pos_encuentro, '{}') || coalesce(t.pos_encuentro, '{}')) x order by x);
      if coalesce(t.reencuentro, false) then new.reencuentro := true; end if;
    end if;
  end if;

  -- Normalizar clases del Pos-encuentro: 1 a 10, sin repetir
  new.pos_encuentro := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(new.pos_encuentro, '{}')) x where x between 1 and 10), '{}');

  -- 3c. Pilares
  if (ins and (new.pilar_1 or new.pilar_2 or new.pilar_3 or new.pilar_4 or new.pilar_5))
     or (not ins and (new.pilar_1, new.pilar_2, new.pilar_3, new.pilar_4, new.pilar_5)
                     is distinct from (old.pilar_1, old.pilar_2, old.pilar_3, old.pilar_4, old.pilar_5)) then
    new.pilares_dato := public.dp_texto_avance(
      new.pilar_1::int + new.pilar_2::int + new.pilar_3::int + new.pilar_4::int + new.pilar_5::int, 5);
  elsif (ins and nullif(trim(new.pilares_dato), '') is not null) or (not ins and new.pilares_dato is distinct from old.pilares_dato) then
    v_pos := public.dp_lista(new.pilares_dato, 5);
    new.pilar_1 := 1 = any(v_pos); new.pilar_2 := 2 = any(v_pos); new.pilar_3 := 3 = any(v_pos);
    new.pilar_4 := 4 = any(v_pos); new.pilar_5 := 5 = any(v_pos);
  end if;

  -- 3d. Encuentro
  if (ins and new.encuentro) or (not ins and (new.encuentro, new.encuentro_en) is distinct from (old.encuentro, old.encuentro_en)) then
    if new.encuentro and new.encuentro_en is null then new.encuentro_en := current_date; end if;
    if not new.encuentro then new.encuentro_en := null; end if;
    new.encuentro_dato := case when new.encuentro then 'SI- ' || public.dp_mes_texto(new.encuentro_en) else 'NO' end;
  elsif (ins and nullif(trim(new.encuentro_dato), '') is not null) or (not ins and new.encuentro_dato is distinct from old.encuentro_dato) then
    new.encuentro := coalesce(public.dp_si_no(new.encuentro_dato), false);
    new.encuentro_en := case when new.encuentro then public.dp_fecha_de(new.encuentro_dato) end;
  end if;

  -- 3e. Pos-encuentro
  if (ins and cardinality(new.pos_encuentro) > 0) or (not ins and new.pos_encuentro is distinct from old.pos_encuentro) then
    new.pos_encuentro_dato := public.dp_texto_avance(cardinality(new.pos_encuentro), 10);
  elsif (ins and nullif(trim(new.pos_encuentro_dato), '') is not null) or (not ins and new.pos_encuentro_dato is distinct from old.pos_encuentro_dato) then
    new.pos_encuentro := public.dp_lista(new.pos_encuentro_dato, 10);
  end if;

  -- 3f. Reencuentro
  if (ins and new.reencuentro) or (not ins and (new.reencuentro, new.reencuentro_en) is distinct from (old.reencuentro, old.reencuentro_en)) then
    if new.reencuentro and new.reencuentro_en is null then new.reencuentro_en := current_date; end if;
    if not new.reencuentro then new.reencuentro_en := null; end if;
    new.reencuentro_dato := case when new.reencuentro then 'SI- ' || public.dp_mes_texto(new.reencuentro_en) else 'NO' end;
  elsif (ins and nullif(trim(new.reencuentro_dato), '') is not null) or (not ins and new.reencuentro_dato is distinct from old.reencuentro_dato) then
    new.reencuentro := coalesce(public.dp_si_no(new.reencuentro_dato), false);
    new.reencuentro_en := case when new.reencuentro then public.dp_fecha_de(new.reencuentro_dato) end;
  end if;

  -- 3g. Bautismo, Sanidad interior y Escuela (SI / NO / sin dato)
  if (ins and new.bautizado is not null) or (not ins and new.bautizado is distinct from old.bautizado) then
    new.bautismo := case new.bautizado when true then 'SI' when false then 'NO' end;
  elsif (ins and nullif(trim(new.bautismo), '') is not null) or (not ins and new.bautismo is distinct from old.bautismo) then
    new.bautizado := public.dp_si_no(new.bautismo);
  end if;

  if (ins and new.hizo_sanidad is not null) or (not ins and new.hizo_sanidad is distinct from old.hizo_sanidad) then
    new.sanidad_interior := case new.hizo_sanidad when true then 'SI' when false then 'NO' end;
  elsif (ins and nullif(trim(new.sanidad_interior), '') is not null) or (not ins and new.sanidad_interior is distinct from old.sanidad_interior) then
    new.hizo_sanidad := public.dp_si_no(new.sanidad_interior);
  end if;

  if (ins and new.escuela_nivel is not null) or (not ins and new.escuela_nivel is distinct from old.escuela_nivel) then
    new.escuela_capacitacion := case when new.escuela_nivel is null then null
                                     when new.escuela_nivel = 0 then 'NO'
                                     else 'NIVEL ' || new.escuela_nivel end;
  elsif (ins and nullif(trim(new.escuela_capacitacion), '') is not null) or (not ins and new.escuela_capacitacion is distinct from old.escuela_capacitacion) then
    new.escuela_nivel := public.dp_nivel(new.escuela_capacitacion);
  end if;

  return new;
end;
$$;
revoke execute on function public.datos_planilla_miembro() from public, anon, authenticated;

drop trigger if exists trg_datos_planilla_miembro on public.miembros_grupo;
create trigger trg_datos_planilla_miembro before insert or update on public.miembros_grupo
  for each row execute function public.datos_planilla_miembro();

-- ---------------------------------------------------------------------
-- 4. Tarjeta ↔ perfil: lo que se marca en un lado aparece en el otro
-- ---------------------------------------------------------------------
create or replace function public.avance_miembro_a_tarjeta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or new.tarjeta_id is null or current_setting('app.solo_parsear', true) = 'on' then return null; end if;
  if tg_op = 'UPDATE'
     and (new.pilar_1, new.pilar_2, new.pilar_3, new.pilar_4, new.pilar_5, new.encuentro, new.pos_encuentro, new.reencuentro, new.tarjeta_id)
         is not distinct from
         (old.pilar_1, old.pilar_2, old.pilar_3, old.pilar_4, old.pilar_5, old.encuentro, old.pos_encuentro, old.reencuentro, old.tarjeta_id) then
    return null;
  end if;
  update public.tarjetas_consolidacion t
     set pilar_1 = new.pilar_1, pilar_2 = new.pilar_2, pilar_3 = new.pilar_3,
         pilar_4 = new.pilar_4, pilar_5 = new.pilar_5,
         pilares = new.pilar_1 and new.pilar_2 and new.pilar_3 and new.pilar_4 and new.pilar_5,
         encuentro = new.encuentro,
         encuentro_en = case when new.encuentro then coalesce(t.encuentro_en, new.encuentro_en) end,
         pos_encuentro = new.pos_encuentro,
         reencuentro = new.reencuentro
   where t.id = new.tarjeta_id
     and (t.pilar_1, t.pilar_2, t.pilar_3, t.pilar_4, t.pilar_5, t.pilares, t.encuentro, t.pos_encuentro, t.reencuentro)
         is distinct from
         (new.pilar_1, new.pilar_2, new.pilar_3, new.pilar_4, new.pilar_5,
          new.pilar_1 and new.pilar_2 and new.pilar_3 and new.pilar_4 and new.pilar_5,
          new.encuentro, new.pos_encuentro, new.reencuentro);
  return null;
end;
$$;
revoke execute on function public.avance_miembro_a_tarjeta() from public, anon, authenticated;

drop trigger if exists trg_avance_miembro_a_tarjeta on public.miembros_grupo;
create trigger trg_avance_miembro_a_tarjeta after insert or update on public.miembros_grupo
  for each row execute function public.avance_miembro_a_tarjeta();

create or replace function public.avance_tarjeta_a_miembro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_todos boolean := coalesce(new.pilares, false) and not coalesce(old.pilares, false);
begin
  if pg_trigger_depth() > 1 or current_setting('app.solo_parsear', true) = 'on' then return null; end if;
  if (new.pilar_1, new.pilar_2, new.pilar_3, new.pilar_4, new.pilar_5, new.pilares, new.encuentro, new.pos_encuentro, new.reencuentro)
     is not distinct from
     (old.pilar_1, old.pilar_2, old.pilar_3, old.pilar_4, old.pilar_5, old.pilares, old.encuentro, old.pos_encuentro, old.reencuentro) then
    return null;
  end if;
  update public.miembros_grupo m
     set pilar_1 = coalesce(new.pilar_1, false) or v_todos,
         pilar_2 = coalesce(new.pilar_2, false) or v_todos,
         pilar_3 = coalesce(new.pilar_3, false) or v_todos,
         pilar_4 = coalesce(new.pilar_4, false) or v_todos,
         pilar_5 = coalesce(new.pilar_5, false) or v_todos,
         encuentro = coalesce(new.encuentro, false),
         encuentro_en = case when new.encuentro then coalesce(m.encuentro_en, new.encuentro_en, new.fecha_encuentro) end,
         pos_encuentro = coalesce(new.pos_encuentro, '{}'),
         reencuentro = coalesce(new.reencuentro, false)
   where m.tarjeta_id = new.id;
  return null;
end;
$$;
revoke execute on function public.avance_tarjeta_a_miembro() from public, anon, authenticated;

drop trigger if exists trg_avance_tarjeta_a_miembro on public.tarjetas_consolidacion;
create trigger trg_avance_tarjeta_a_miembro after update on public.tarjetas_consolidacion
  for each row execute function public.avance_tarjeta_a_miembro();

-- ---------------------------------------------------------------------
-- 5. Los miembros que ya existen
-- ---------------------------------------------------------------------
-- 5a. Leer lo que ya está escrito en la hoja DATOS (sin reescribir el texto)
select set_config('app.solo_parsear', 'on', true);

update public.miembros_grupo m
   set pilar_1 = 1 = any(l.pil), pilar_2 = 2 = any(l.pil), pilar_3 = 3 = any(l.pil),
       pilar_4 = 4 = any(l.pil), pilar_5 = 5 = any(l.pil),
       encuentro = coalesce(public.dp_si_no(m.encuentro_dato), false),
       encuentro_en = case when public.dp_si_no(m.encuentro_dato) then public.dp_fecha_de(m.encuentro_dato) end,
       pos_encuentro = public.dp_lista(m.pos_encuentro_dato, 10),
       reencuentro = coalesce(public.dp_si_no(m.reencuentro_dato), false),
       reencuentro_en = case when public.dp_si_no(m.reencuentro_dato) then public.dp_fecha_de(m.reencuentro_dato) end,
       bautizado = public.dp_si_no(m.bautismo),
       hizo_sanidad = public.dp_si_no(m.sanidad_interior)
  from (select id, public.dp_lista(pilares_dato, 5) as pil from public.miembros_grupo) l
 where l.id = m.id
   -- solo los que todavía no tienen nada marcado (así se puede correr dos veces)
   and not (m.pilar_1 or m.pilar_2 or m.pilar_3 or m.pilar_4 or m.pilar_5 or m.encuentro or m.reencuentro
            or cardinality(m.pos_encuentro) > 0
            or m.bautizado is not null or m.hizo_sanidad is not null)
   and coalesce(m.pilares_dato, m.encuentro_dato, m.pos_encuentro_dato, m.reencuentro_dato,
                m.bautismo, m.sanidad_interior, m.escuela_capacitacion) is not null;

-- Escuela de capacitación (aparte, por si la etapa ya se había corrido antes)
update public.miembros_grupo
   set escuela_nivel = public.dp_nivel(escuela_capacitacion)
 where escuela_nivel is null and nullif(trim(escuela_capacitacion), '') is not null;

-- 5b. Unir con su tarjeta: primero por teléfono, después por nombre (solo si no hay dudas)
with por_tel as (
  select distinct on (m.id) m.id as miembro, t.id as tarjeta
    from public.miembros_grupo m
    join public.tarjetas_consolidacion t
      on t.grupo_id = m.grupo_id
     and length(right(regexp_replace(coalesce(m.telefono, ''), '\D', '', 'g'), 7)) = 7
     and right(regexp_replace(coalesce(m.telefono, ''), '\D', '', 'g'), 7)
       = right(regexp_replace(coalesce(t.telefono, ''), '\D', '', 'g'), 7)
   where m.tarjeta_id is null
   order by m.id, t.creado_en desc
)
update public.miembros_grupo m set tarjeta_id = p.tarjeta
  from por_tel p
 where p.miembro = m.id
   and not exists (select 1 from public.miembros_grupo x where x.tarjeta_id = p.tarjeta);

with candidatos as (
  select m.id as miembro, t.id as tarjeta
    from public.miembros_grupo m
    join public.tarjetas_consolidacion t
      on t.grupo_id = m.grupo_id
     and lower(trim(t.nombre)) in (lower(trim(m.nombre || ' ' || coalesce(m.apellido, ''))), lower(trim(m.nombre)))
   where m.tarjeta_id is null
     and not exists (select 1 from public.miembros_grupo x where x.tarjeta_id = t.id)
),
unicos as (
  select c.* from candidatos c
   where (select count(*) from candidatos c2 where c2.miembro = c.miembro) = 1
     and (select count(*) from candidatos c3 where c3.tarjeta = c.tarjeta) = 1
)
update public.miembros_grupo m set tarjeta_id = u.tarjeta
  from unicos u
 where u.miembro = m.id;

-- 5c. Sumar lo marcado en la tarjeta (esto sí reescribe la hoja DATOS y
--     devuelve a la tarjeta lo que solo estaba en la planilla)
select set_config('app.solo_parsear', 'off', true);

update public.miembros_grupo m
   set pilar_1 = m.pilar_1 or coalesce(t.pilar_1, false) or coalesce(t.pilares, false),
       pilar_2 = m.pilar_2 or coalesce(t.pilar_2, false) or coalesce(t.pilares, false),
       pilar_3 = m.pilar_3 or coalesce(t.pilar_3, false) or coalesce(t.pilares, false),
       pilar_4 = m.pilar_4 or coalesce(t.pilar_4, false) or coalesce(t.pilares, false),
       pilar_5 = m.pilar_5 or coalesce(t.pilar_5, false) or coalesce(t.pilares, false),
       encuentro = m.encuentro or coalesce(t.encuentro, false),
       encuentro_en = case when m.encuentro or coalesce(t.encuentro, false)
                           then coalesce(m.encuentro_en, t.encuentro_en, t.fecha_encuentro) end,
       pos_encuentro = array(select distinct x from unnest(m.pos_encuentro || coalesce(t.pos_encuentro, '{}')) x order by x),
       reencuentro = m.reencuentro or coalesce(t.reencuentro, false)
  from public.tarjetas_consolidacion t
 where t.id = m.tarjeta_id;

commit;

notify pgrst, 'reload schema';
