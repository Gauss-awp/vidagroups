# Respaldo diario de la base

Todas las noches (03:00 de Argentina) GitHub copia la base de datos completa:
usuarios, tablas, datos, funciones y seguridad. La copia se **cifra** con una
clave que solo vos conocés y se guarda **30 días** en la pestaña **Actions**
del repositorio. Aunque alguien la descargue, sin la clave no puede leerla.

## Configurarlo (una sola vez, ~10 minutos)

1. **Conexión a la base.** En Supabase → botón **Connect** (arriba) →
   **Session pooler** → copiá la URI. Se ve así:

   ```
   postgresql://postgres.ajeeohhhnmpikiowiikf:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:5432/postgres
   ```

   Reemplazá `[YOUR-PASSWORD]` por la contraseña de la base (la que elegiste al
   crear el proyecto; si no la recordás: Project Settings → Database → Reset
   database password). Si la contraseña tiene símbolos raros (`@`, `#`, `/`…),
   conviene generar una nueva solo con letras y números.

   Usá el **Session pooler**, no la conexión directa: GitHub no puede conectarse
   a la directa.

2. **Clave de cifrado.** Inventá una frase larga (por ejemplo, cuatro palabras al
   azar con números) y **guardala en un lugar seguro**: sin ella los respaldos no
   sirven.

3. **Cargar los dos secretos en GitHub.** En el repositorio → **Settings** →
   **Secrets and variables** → **Actions** → **New repository secret**:

   | Nombre | Valor |
   | --- | --- |
   | `SUPABASE_DB_URL` | la URI del paso 1, con la contraseña |
   | `BACKUP_PASSPHRASE` | la frase del paso 2 |

4. **Probarlo.** Pestaña **Actions** → **Respaldo diario de la base** →
   **Run workflow**. En 2–3 minutos tiene que quedar con tilde verde y, abajo, un
   archivo `respaldo-AAAA-MM-DD`.

Mientras pruebes, usá la URI del proyecto de **Pruebas**. Cuando crees
**Producción**, reemplazá `SUPABASE_DB_URL` por la de Producción.

## Para tener en cuenta

- GitHub pausa las tareas programadas de un repositorio **sin cambios durante 60
  días**. Mientras sigas haciendo commits, no pasa.
- Cada respaldo dura 30 días; siempre vas a tener el último mes.
- Si alguna tarea falla, GitHub te avisa por correo.

## Restaurar (si algún día hace falta)

No lo hagas solo la primera vez: pedí ayuda. En resumen:

1. Descargar el archivo desde Actions y descifrarlo:
   `gpg -d respaldo-AAAA-MM-DD.tar.gz.gpg > respaldo.tar.gz` y descomprimirlo.
2. Crear un proyecto de Supabase **vacío**.
3. Restaurar **primero** los usuarios y **después** la app:

   ```
   pg_restore --no-owner -d "URI_DEL_PROYECTO_NUEVO" respaldo/1_usuarios.dump
   pg_restore --no-owner -d "URI_DEL_PROYECTO_NUEVO" respaldo/2_app.dump
   ```

4. Volver a crear el trigger de registro (está al final de
   `supabase/produccion_esquema_completo.sql`) y apuntar la app al proyecto nuevo.
