-- =====================================================================
-- VidaGroups · Etapa 31: registrarse sin ser guía
--   Para Guías Supervisores, pastores, encargados o consolidación: al
--   registrarse tocan "¿No sos guía?". Su pedido lo ven y aprueban los
--   encargados de la red o el Administrador (no los Guías Supervisores).
-- Ejecutar UNA vez en Supabase → SQL Editor → Run (en Pruebas y en Producción).
-- =====================================================================

begin;

alter table public.profiles add column if not exists solicitud_no_guia boolean not null default false;

CREATE OR REPLACE FUNCTION public.copiar_solicitud_grupo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta jsonb;
  v_id text;
begin
  select raw_user_meta_data into v_meta from auth.users where id = new.id;
  v_id := v_meta ->> 'grupo_id';
  if v_id ~ '^[0-9a-fA-F-]{36}$' and exists (select 1 from public.groups where id = v_id::uuid and red_id is not distinct from new.red_id) then
    new.solicitud_grupo_id := v_id::uuid;
  end if;
  new.solicitud_grupo_nuevo := nullif(left(trim(coalesce(v_meta ->> 'grupo_nuevo', '')), 80), '');
  new.solicitud_no_guia := coalesce((v_meta ->> 'no_guia')::boolean, false);
  return new;
end;
$function$;

drop function if exists public.elegir_solicitud_grupo(uuid, text);
CREATE OR REPLACE FUNCTION public.elegir_solicitud_grupo(p_grupo uuid, p_nuevo text, p_no_guia boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('app.dev_switch', 'on', true);
  update public.profiles
     set solicitud_grupo_id = case when p_grupo is not null and exists (select 1 from public.groups g where g.id = p_grupo and g.red_id = profiles.red_id) then p_grupo end,
         solicitud_grupo_nuevo = case when p_grupo is null then nullif(left(trim(coalesce(p_nuevo, '')), 80), '') end,
         solicitud_no_guia = coalesce(p_no_guia, false)
   where id = auth.uid() and estado = 'pendiente';
  perform set_config('app.dev_switch', 'off', true);
end;
$function$;
revoke execute on function public.elegir_solicitud_grupo(uuid, text, boolean) from public, anon;
grant execute on function public.elegir_solicitud_grupo(uuid, text, boolean) to authenticated;

drop function if exists public.solicitudes_pendientes();
CREATE OR REPLACE FUNCTION public.solicitudes_pendientes()
 RETURNS TABLE(id uuid, nombre text, email text, red_id uuid, red text, creado_en timestamp with time zone, grupo_id uuid, grupo text, grupo_guias text, grupo_nuevo text, grupo_nuevo_existe uuid, no_guia boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select p.id, public.nombre_de_perfil(p.id), p.email, p.red_id, r.nombre, p.creado_en,
         p.solicitud_grupo_id, g.nombre,
         (select x.guias from public.grupos_para_registro(p.red_id) x where x.id = p.solicitud_grupo_id),
         p.solicitud_grupo_nuevo,
         (select g2.id from public.groups g2
           where g2.red_id = p.red_id and lower(trim(g2.nombre)) = lower(trim(p.solicitud_grupo_nuevo)) limit 1),
         p.solicitud_no_guia
    from public.profiles p
    left join public.redes r on r.id = p.red_id
    left join public.groups g on g.id = p.solicitud_grupo_id
   where p.estado = 'pendiente'
     and p.iglesia_id is not distinct from public.mi_iglesia()
     and (public.puede_aprobar_perfil(p.id) or (p.red_id is null and (public.es_administrador() or public.es_apostol())))
   order by lower(coalesce(g.nombre, p.solicitud_grupo_nuevo, 'zzz')), p.creado_en;
end;
$function$;
revoke execute on function public.solicitudes_pendientes() from public, anon;
grant execute on function public.solicitudes_pendientes() to authenticated;

commit;

notify pgrst, 'reload schema';
