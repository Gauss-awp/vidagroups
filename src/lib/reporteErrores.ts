// ---------------------------------------------------------------------
// Registro de errores de la app: cada error queda guardado en la base
// (quién, en qué pantalla, con qué versión) para que el Administrador
// pueda ayudar sin depender de que la persona sepa explicarlo.
// Solo datos técnicos; nunca datos de miembros.
// ---------------------------------------------------------------------
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { supabase } from './supabase';

const CLAVE = 'vg_errores_pendientes';
let pantallaActual = '';
const recientes = new Map<string, number>();

export function fijarPantalla(ruta: string) {
  pantallaActual = ruta;
}

function version(): string {
  return [Constants.expoConfig?.version ?? '', Updates.updateId ? Updates.updateId.slice(0, 8) : null].filter(Boolean).join(' · ');
}

interface ErrorGuardado {
  mensaje: string;
  detalle: string | null;
  pantalla: string;
  fatal: boolean;
  version: string;
  plataforma: string;
}

async function enviar(e: ErrorGuardado): Promise<boolean> {
  try {
    const { error } = await supabase.from('errores_app').insert(e);
    return !error;
  } catch {
    return false;
  }
}

/** Guarda un error. Si no hay señal, queda en el celular y se manda después. */
export async function reportarError(error: unknown, opciones: { fatal?: boolean; contexto?: string } = {}) {
  try {
    const err = error instanceof Error ? error : new Error(String((error as any)?.message ?? error));
    const mensaje = `${opciones.contexto ? `[${opciones.contexto}] ` : ''}${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`;
    // El mismo error repetido en menos de un minuto se manda una sola vez
    const ahora = Date.now();
    if ((recientes.get(mensaje) ?? 0) > ahora - 60000) return;
    recientes.set(mensaje, ahora);

    const datos: ErrorGuardado = {
      mensaje,
      detalle: err.stack ? err.stack.split('\n').slice(0, 12).join('\n') : null,
      pantalla: pantallaActual,
      fatal: !!opciones.fatal,
      version: version(),
      plataforma: Platform.OS,
    };
    if (!(await enviar(datos))) {
      const lista = JSON.parse((await AsyncStorage.getItem(CLAVE)) ?? '[]') as ErrorGuardado[];
      lista.push(datos);
      await AsyncStorage.setItem(CLAVE, JSON.stringify(lista.slice(-20)));
    }
  } catch {
    // Reportar un error nunca puede romper la app
  }
}

/** Manda los errores que quedaron guardados sin señal */
export async function enviarErroresPendientes() {
  try {
    const lista = JSON.parse((await AsyncStorage.getItem(CLAVE)) ?? '[]') as ErrorGuardado[];
    if (!lista.length) return;
    const quedan: ErrorGuardado[] = [];
    for (const e of lista) if (!(await enviar(e))) quedan.push(e);
    await AsyncStorage.setItem(CLAVE, JSON.stringify(quedan));
  } catch {
    // nada
  }
}

let instalado = false;

/** Captura los errores que no maneja ninguna pantalla */
export function instalarCapturaErrores() {
  if (instalado) return;
  instalado = true;
  if (Platform.OS === 'web') {
    const w = globalThis as any;
    w.addEventListener?.('error', (ev: any) => reportarError(ev?.error ?? ev?.message, { fatal: false }));
    w.addEventListener?.('unhandledrejection', (ev: any) => reportarError(ev?.reason, { contexto: 'promesa' }));
    return;
  }
  const EU = (globalThis as any).ErrorUtils;
  if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
    const anterior = EU.getGlobalHandler();
    EU.setGlobalHandler((error: unknown, esFatal?: boolean) => {
      reportarError(error, { fatal: !!esFatal });
      anterior?.(error, esFatal);
    });
  }
}
