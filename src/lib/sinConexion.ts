// ---------------------------------------------------------------------
// Funcionar sin señal
//   · Guarda en el celular lo último que se cargó (perfil, grupos, miembros)
//     para poder abrir la app sin internet.
//   · Los cambios de asistencia hechos sin señal quedan en una cola y se
//     envían solos cuando vuelve la conexión.
// ---------------------------------------------------------------------
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/** ¿El error es por falta de conexión (y no por permisos o datos)? */
export function esErrorDeRed(e: unknown): boolean {
  if (!e) return false;
  const texto = String((e as any)?.message ?? e);
  return /network|fetch|timed? ?out|timeout|abort|connection|internet|offline|failed to fetch|socket/i.test(texto);
}

// ---------------- Caché ----------------

export async function guardarCache(clave: string, valor: unknown) {
  try {
    await AsyncStorage.setItem(`vg_cache:${clave}`, JSON.stringify(valor));
  } catch {
    // sin espacio: no es grave
  }
}

export async function leerCache<T>(clave: string): Promise<T | null> {
  try {
    const v = await AsyncStorage.getItem(`vg_cache:${clave}`);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

// ---------------- Cola de cambios pendientes ----------------

export type CambioPendiente =
  | { id: string; tipo: 'asistencia'; grupo_id: string; fecha: string; miembro_id: string; presente: boolean; consolidado?: boolean; motivo?: string | null }
  | { id: string; tipo: 'datos_reunion'; grupo_id: string; fecha: string; datos: Record<string, unknown> };

const CLAVE_COLA = 'vg_pendientes';
type Oyente = (cantidad: number) => void;
const oyentes = new Set<Oyente>();

async function leerCola(): Promise<CambioPendiente[]> {
  try {
    const v = await AsyncStorage.getItem(CLAVE_COLA);
    return v ? (JSON.parse(v) as CambioPendiente[]) : [];
  } catch {
    return [];
  }
}

async function escribirCola(cola: CambioPendiente[]) {
  await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  oyentes.forEach((o) => o(cola.length));
}

type NuevoCambio =
  | Omit<Extract<CambioPendiente, { tipo: 'asistencia' }>, 'id'>
  | Omit<Extract<CambioPendiente, { tipo: 'datos_reunion' }>, 'id'>;

/** Guarda un cambio para enviarlo después */
export async function encolar(cambio: NuevoCambio) {
  const cola = await leerCola();
  cola.push({ ...(cambio as any), id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  await escribirCola(cola);
}

/** Cambios pendientes de un grupo y una fecha (para mostrarlos en pantalla) */
export async function pendientesDe(grupoId: string, fecha: string): Promise<CambioPendiente[]> {
  return (await leerCola()).filter((c) => c.grupo_id === grupoId && c.fecha === fecha);
}

export async function cantidadPendientes(): Promise<number> {
  return (await leerCola()).length;
}

/** Avisa cuando cambia la cantidad de cambios pendientes */
export function escucharPendientes(oyente: Oyente): () => void {
  oyentes.add(oyente);
  cantidadPendientes().then(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

let sincronizando = false;

/** Envía los cambios pendientes, en orden. Si no hay señal, los deja para la próxima. */
export async function sincronizar(): Promise<{ enviados: number; quedan: number }> {
  if (sincronizando) return { enviados: 0, quedan: await cantidadPendientes() };
  sincronizando = true;
  let enviados = 0;
  try {
    const cola = await leerCola();
    const reuniones = new Map<string, string>();
    const restantes: CambioPendiente[] = [];
    let sinRed = false;

    for (const c of cola) {
      if (sinRed) {
        restantes.push(c);
        continue;
      }
      try {
        const clave = `${c.grupo_id}|${c.fecha}`;
        let reunionId = reuniones.get(clave);
        if (!reunionId) {
          const { data, error } = await supabase
            .from('reuniones')
            .upsert({ grupo_id: c.grupo_id, fecha: c.fecha }, { onConflict: 'grupo_id,fecha' })
            .select('id')
            .single();
          if (error) throw error;
          reunionId = data.id as string;
          reuniones.set(clave, reunionId);
        }
        if (c.tipo === 'asistencia') {
          const fila: Record<string, unknown> = { reunion_id: reunionId, miembro_id: c.miembro_id, presente: c.presente };
          if (c.consolidado !== undefined) fila.consolidado = c.consolidado;
          if (c.motivo !== undefined) fila.motivo = c.motivo;
          const { error } = await supabase.from('asistencias').upsert(fila, { onConflict: 'reunion_id,miembro_id' });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('reuniones').update(c.datos).eq('id', reunionId);
          if (error) throw error;
        }
        enviados++;
      } catch (e) {
        if (esErrorDeRed(e)) {
          sinRed = true;
          restantes.push(c);
        }
        // Si es otro error (por ejemplo, ya no tiene permiso sobre ese grupo), el cambio se descarta
      }
    }
    await escribirCola(restantes);
    return { enviados, quedan: restantes.length };
  } finally {
    sincronizando = false;
  }
}
