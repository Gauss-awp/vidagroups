import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { aplicarTema, colors } from '@/lib/theme';

export type ModoTema = 'claro' | 'oscuro' | 'sistema';

const CLAVE = 'vidagroups_tema';

interface TemaValue {
  modo: ModoTema;
  oscuro: boolean;
  cambiarModo: (m: ModoTema) => void;
}

const TemaContext = createContext<TemaValue>({ modo: 'claro', oscuro: false, cambiarModo: () => {} });

/**
 * Guarda la preferencia de tema en el teléfono (cada persona elige el suyo)
 * y vuelve a dibujar toda la app con los colores nuevos.
 */
export function TemaProvider({ children }: { children: React.ReactNode }) {
  const sistema = useColorScheme();
  const [modo, setModo] = useState<ModoTema>('claro');
  const [listo, setListo] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((v) => {
        if (v === 'claro' || v === 'oscuro' || v === 'sistema') setModo(v);
      })
      .finally(() => setListo(true));
  }, []);

  const oscuro = modo === 'oscuro' || (modo === 'sistema' && sistema === 'dark');

  // Los colores se actualizan antes de dibujar a los hijos
  aplicarTema(oscuro);

  const value = useMemo(
    () => ({
      modo,
      oscuro,
      cambiarModo: (m: ModoTema) => {
        setModo(m);
        AsyncStorage.setItem(CLAVE, m).catch(() => {});
      },
    }),
    [modo, oscuro]
  );

  if (!listo) return null;

  return (
    <TemaContext.Provider value={value}>
      {/* La key obliga a redibujar todo con los colores nuevos */}
      <View key={oscuro ? 'oscuro' : 'claro'} style={{ flex: 1, backgroundColor: colors.bg }}>
        {children}
      </View>
    </TemaContext.Provider>
  );
}

export const useTema = () => useContext(TemaContext);
