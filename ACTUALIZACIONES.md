# Actualizaciones sin reinstalar (EAS Update)

Con EAS Update, los cambios de **código de la app** (pantallas, textos, arreglos) llegan solos
a los celulares que ya tienen la app instalada. No hace falta generar ni reinstalar el APK.

## Publicar una actualización

1. Probá el cambio con `npx expo start` (Expo Go) contra **Pruebas**.
2. Commit.
3. Publicalo primero en el APK de Pruebas:
   ```bash
   npm run publicar:pruebas -- "qué cambió"
   ```
4. Si en el APK de Pruebas anda bien, publicalo para la iglesia:
   ```bash
   npm run publicar:produccion -- "qué cambió"
   ```
   Pide confirmación y revisa que el `.env` tenga la URL y la key de Producción.

Los celulares bajan la actualización al abrir la app (o al volver a ella) y ofrecen
**Reiniciar**. Si eligen "Más tarde", se aplica sola la próxima vez que la abren.
En **Perfil**, abajo, se ve qué actualización tiene cada celular.

## Cuándo NO alcanza con una actualización

Hay que **generar un APK nuevo** (y subir `version` en `app.json`, por ejemplo de 1.0.0 a 1.1.0) cuando:

- se instala un paquete nuevo con `npx expo install` (por ejemplo `expo-document-picker`);
- se cambia `app.json` (nombre, ícono, permisos);
- se actualiza el SDK de Expo.

Las actualizaciones solo llegan a los APK con la **misma `version`** con la que se publicaron.
Por eso, al subir la versión, los celulares viejos siguen andando con lo que tenían hasta que
instalen el APK nuevo.

## Los SQL no son actualizaciones

Un cambio en la base (un archivo `etapaX.sql`) se corre en Supabase, como siempre: primero en
Pruebas y después en Producción. Si la actualización de la app necesita ese SQL, **corré el SQL
en Producción antes de publicar**.
