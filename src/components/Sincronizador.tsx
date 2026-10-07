import { useEffect } from 'react';
import { AppState } from 'react-native';
import { cantidadPendientes, sincronizar } from '@/lib/sinConexion';

/** Envía los cambios hechos sin señal: al abrir la app, al volver a ella y cada 30 segundos si hay pendientes. */
export function Sincronizador() {
  useEffect(() => {
    const intentar = async () => {
      if ((await cantidadPendientes()) > 0) await sincronizar();
    };
    intentar();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') intentar();
    });
    const reloj = setInterval(intentar, 30000);
    return () => {
      sub.remove();
      clearInterval(reloj);
    };
  }, []);
  return null;
}
