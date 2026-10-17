import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { supabase } from '@/lib/supabase';

/** Avisa a la base cuándo entró cada uno y con qué versión: lo ve el Administrador para dar soporte. */
export function RegistroAcceso({ perfilId }: { perfilId: string }) {
  useEffect(() => {
    const version = [
      Constants.expoConfig?.version ?? '',
      Updates.updateId ? Updates.updateId.slice(0, 8) : null,
      Platform.OS === 'web' ? 'web' : Platform.OS,
    ]
      .filter(Boolean)
      .join(' · ');
    supabase.rpc('registrar_acceso', { p_version: version }).then(() => undefined);
  }, [perfilId]);
  return null;
}
