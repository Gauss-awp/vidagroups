import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { reprogramar } from '@/lib/recordatorios';

/** Arma los recordatorios del guía al abrir la app y al volver a ella; al tocar uno, abre lo que corresponde. */
export function Recordatorios({ perfilId }: { perfilId: string }) {
  useEffect(() => {
    reprogramar(perfilId);
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') reprogramar(perfilId);
    });
    const toque = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { vg?: boolean; tipo?: string; grupoId?: string };
      if (!d?.vg || !d.grupoId) return;
      if (d.tipo === 'asistencia') router.push({ pathname: '/reunion/[id]', params: { id: d.grupoId } });
      else router.push({ pathname: '/grupo/[id]', params: { id: d.grupoId } });
    });
    return () => {
      sub.remove();
      toque.remove();
    };
  }, [perfilId]);
  return null;
}
