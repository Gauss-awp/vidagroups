# VidaGroups

App de grupos de vida para la iglesia. Expo (SDK 57) + expo-router + Supabase.

## 1. Supabase

1. Creá un proyecto en https://supabase.com
2. Andá a **SQL Editor → New query**, pegá todo `supabase/schema.sql` y tocá **Run**.
3. Para probar rápido: **Authentication → Sign In / Providers → Email** y desactivá **Confirm email**
   (si lo dejás activo, cada persona tiene que confirmar su correo antes de entrar).
4. Copiá la **Project URL** y la **anon / publishable key** desde **Project Settings → API**.

## 2. La app

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
```

Completá `.env` con tu URL y tu key, y después:

```bash
npx expo start -c
```

Escaneá el QR con Expo Go (el celu y la PC en la misma red Wi-Fi).

## 3. Primer Apóstol

Registrate desde la app y después ejecutá en el SQL Editor (con tu correo):

```sql
update public.profiles set rol = 'apostol' where email = 'tu-correo@ejemplo.com';
```

Cerrá sesión y volvé a entrar. Desde **Administrar** asignás Pastores, Supervisores y a quién responde cada uno.

## Estructura

```
supabase/schema.sql          Tablas, triggers y seguridad (RLS) por jerarquía
src/lib/                     Cliente de Supabase, tipos, tema y utilidades
src/context/AuthContext.tsx  Sesión y perfil del usuario
src/components/              UI, gráficos, pestañas del grupo y paneles de inicio
src/app/(auth)/              Ingresar y Crear cuenta
src/app/(app)/(tabs)/        Inicio según rol, Administrar Iglesia y Perfil
src/app/(app)/grupo/[id]     Grupo: Hábitos / Encuentros y Pagos / Miembros
src/app/(app)/equipo/[id]    Personas a cargo de un líder
src/app/(app)/evento/[id]    Pagos por hermano, Registrar Pago e historial
```
