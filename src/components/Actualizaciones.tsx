import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Busca actualizaciones (EAS Update) al abrir la app y al volver a ella.
 * Si hay una, la descarga y ofrece reiniciar; si no, se aplica sola la próxima vez.
 * En Expo Go no hace nada.
 */
export function Actualizaciones() {
  const buscando = useRef(false);
  const avisada = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;

    const buscar = async () => {
      if (buscando.current || avisada.current) return;
      buscando.current = true;
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) {
          await Updates.fetchUpdateAsync();
          avisada.current = true;
          Alert.alert('Hay una versión nueva', 'VidaGroups se actualizó con mejoras y arreglos. ¿Reiniciar ahora?', [
            { text: 'Más tarde', style: 'cancel' },
            { text: 'Reiniciar', onPress: () => Updates.reloadAsync() },
          ]);
        }
      } catch {
        // Sin conexión o servicio caído: se reintenta la próxima vez
      } finally {
        buscando.current = false;
      }
    };

    buscar();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') buscar();
    });
    return () => sub.remove();
  }, []);

  return null;
}
