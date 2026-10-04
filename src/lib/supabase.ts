import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// ---------------------------------------------------------------------
// Ambientes: "pruebas" (datos inventados, modo dev) y "produccion" (la iglesia).
// Se elige con EXPO_PUBLIC_AMBIENTE en el archivo .env.
// Las variables EXPO_PUBLIC_* se tienen que leer escritas completas (sin armar el nombre).
// ---------------------------------------------------------------------
export type Ambiente = 'pruebas' | 'produccion';

// En la app instalada (APK, TestFlight) manda el canal con el que se generó: así una
// actualización publicada en "produccion" nunca apunta a la base de pruebas.
// En Expo Go no hay canal y se usa el .env.
const canal = Updates.channel;
export const AMBIENTE: Ambiente =
  canal === 'produccion' || canal === 'pruebas'
    ? canal
    : process.env.EXPO_PUBLIC_AMBIENTE === 'produccion'
      ? 'produccion'
      : 'pruebas';

const config = {
  pruebas: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL_PRUEBAS ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.EXPO_PUBLIC_SUPABASE_KEY_PRUEBAS ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  produccion: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL_PRODUCCION,
    key: process.env.EXPO_PUBLIC_SUPABASE_KEY_PRODUCCION,
  },
}[AMBIENTE];

if (!config.url || !config.key) {
  throw new Error(
    `Faltan la URL o la key de Supabase para el ambiente "${AMBIENTE}". Revisá el archivo .env (copiá .env.example) y reiniciá con "npx expo start -c".`
  );
}

export const supabase = createClient(config.url, config.key, {
  auth: {
    storage: AsyncStorage,
    // Cada ambiente guarda su propia sesión: cambiar de uno a otro no mezcla usuarios
    storageKey: `vidagroups-${AMBIENTE}`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renueva el token solo mientras la app está en primer plano
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
