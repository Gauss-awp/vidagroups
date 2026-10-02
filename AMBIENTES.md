# Ambientes: Pruebas y Producción

| | Pruebas | Producción |
| --- | --- | --- |
| Proyecto de Supabase | El que usás hoy (datos inventados) | Uno nuevo, vacío |
| Quién lo usa | Vos, para probar | La iglesia |
| Modo dev (switcher) | Sí, solo con tu correo | No existe |
| Cambios nuevos | Se prueban acá primero | Recién cuando funcionan en Pruebas |

## Cambiar de ambiente

En el archivo `.env`, cambiá **solo** esta línea y reiniciá con `npx expo start -c`:

```
EXPO_PUBLIC_AMBIENTE=pruebas      # o produccion
```

Cada ambiente guarda su propia sesión: al cambiar, vas a tener que iniciar sesión con tu cuenta de ese proyecto.

## Cómo llevar un cambio a Producción

1. Escribí o recibí el cambio (código y, si hay, un archivo SQL nuevo en `supabase/`).
2. Corré el SQL en el proyecto de **Pruebas** y probá la app con `EXPO_PUBLIC_AMBIENTE=pruebas`.
3. Si todo anda: commit y sync.
4. Corré el **mismo** SQL en el proyecto de **Producción**.
5. Para la app instalada en los celulares: generar una versión nueva o publicar una actualización con EAS Update.

## Crear Producción (una sola vez)

1. Supabase → New project → "VidaGroups Producción".
2. SQL Editor → pegar `supabase/produccion_esquema_completo.sql` → Run.
3. Authentication → activar Confirm email, contraseña mínima 8 y SMTP propio.
4. Copiar la URL y la key al `.env` (variables `_PRODUCCION`).
5. Registrarte desde la app con `EXPO_PUBLIC_AMBIENTE=produccion` y hacerte Apóstol con el UPDATE que figura al final del archivo SQL.
