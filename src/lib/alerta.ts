// ---------------------------------------------------------------------
// Ventanas de aviso y de confirmación que funcionan igual en el celular y en la web.
// En Android/iPhone usa las de siempre; en el navegador (donde las de React Native
// no aparecen) usa las del navegador.
// ---------------------------------------------------------------------
import { Alert, Platform } from 'react-native';

export interface BotonAlerta {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export function alerta(titulo: string, mensaje?: string, botones?: BotonAlerta[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensaje, botones);
    return;
  }
  const texto = [titulo, mensaje].filter(Boolean).join('\n\n');
  const cancelar = botones?.find((b) => b.style === 'cancel');
  const acciones = (botones ?? []).filter((b) => b.style !== 'cancel');

  // Solo un aviso (o un único botón)
  if (!botones || botones.length <= 1) {
    window.alert(texto);
    botones?.[0]?.onPress?.();
    return;
  }
  // Confirmar o cancelar
  if (acciones.length === 1) {
    if (window.confirm(texto)) acciones[0].onPress?.();
    else cancelar?.onPress?.();
    return;
  }
  // Varias opciones: se pregunta por cada una
  for (const b of acciones) {
    if (window.confirm(`${texto}\n\n¿${b.text}?`)) {
      b.onPress?.();
      return;
    }
  }
  cancelar?.onPress?.();
}
