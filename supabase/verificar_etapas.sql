-- =====================================================================
-- VidaGroups · ¿Qué etapas tiene esta base?
--   Corré esto en el SQL Editor (Pruebas o Producción). Muestra cada etapa
--   con ✅ si ya está aplicada o ❌ si falta. Las que faltan se corren en orden.
-- =====================================================================
select etapa, que_agrega, case when ok then '✅' else '❌ FALTA' end as estado
from (values
  (14, 'Descartar alertas', exists (select 1 from information_schema.columns where table_schema='public' and table_name='seguimientos_faltas' and column_name='tipo')),
  (15, 'Historial del rol de equipo', to_regclass('public.miembros_rol_historial') is not null),
  (16, 'Día y hora de reunión', exists (select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='dia_reunion')),
  (17, 'Rachas, logros y resumen', exists (select 1 from pg_proc where proname='rachas_grupo')),
  (18, 'Rol Administrador', exists (select 1 from pg_proc where proname='admin_resumen')),
  (19, 'Errores y avisos', to_regclass('public.errores_app') is not null and to_regclass('public.avisos') is not null),
  (20, 'Bajas de miembros', exists (select 1 from information_schema.columns where table_schema='public' and table_name='miembros_grupo' and column_name='baja_en')),
  (21, 'Co-guías', exists (select 1 from pg_proc where proname='guias_del_grupo')),
  (22, 'Equipo del grupo', exists (select 1 from pg_proc where proname='equipo_del_grupo')),
  (23, 'Tarjeta sin grupo', exists (select 1 from pg_proc where proname='sincronizar_gv_tarjeta' and prosrc like '%comenzo_gv := false%')),
  (24, 'Pos-encuentro y reencuentro', exists (select 1 from information_schema.columns where table_schema='public' and table_name='tarjetas_consolidacion' and column_name='pos_encuentro')),
  (25, 'Mensajes de ayuda', to_regclass('public.mensajes_ayuda') is not null),
  (26, 'El supervisor crea grupos', exists (select 1 from pg_proc where proname='candidatos_guias_red')),
  (27, 'Aprobar con grupo', exists (select 1 from pg_proc where proname='aprobar_cuenta')),
  (28, 'Centro de Eventos', to_regclass('public.evento_inscriptos') is not null),
  (29, 'Cada supervisor ve sus grupos', exists (select 1 from pg_proc where proname='puede_aprobar_perfil')),
  (30, 'Grupos sin guía todavía', exists (select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='guia_id' and is_nullable='YES')),
  (31, 'Registrarse sin ser guía', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='solicitud_no_guia')),
  (32, 'Registro por servicio', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='solicitud_rol'))
) as e(etapa, que_agrega, ok)
order by etapa;
