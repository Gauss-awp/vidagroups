// ---------------------------------------------------------------------
// Recordatorios del guía (notificaciones locales, sin servidor):
//   · Después del GV: "¿Cargaste la reunión de hoy?" (si todavía no la cargó)
//   · El martes 19 h: "Te faltan N consolidaciones del GV del viernes"
// Se reprograman solos al abrir la app y cada vez que se carga algo.
// Funcionan sin señal: quedan agendados en el celular.
// ---------------------------------------------------------------------
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { leerCache } from './sinConexion';
import { formatoFecha } from './utils';

export interface PreferenciasRecordatorios {
  asistencia: boolean;
  consolidaciones: boolean;
}
const CLAVE_PREF = 'vg_recordatorios';
const CANAL = 'recordatorios';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function leerPreferencias(): Promise<PreferenciasRecordatorios> {
  try {
    const v = await AsyncStorage.getItem(CLAVE_PREF);
    return v ? { asistencia: true, consolidaciones: true, ...JSON.parse(v) } : { asistencia: true, consolidaciones: true };
  } catch {
    return { asistencia: true, consolidaciones: true };
  }
}

export async function guardarPreferencias(p: PreferenciasRecordatorios) {
  await AsyncStorage.setItem(CLAVE_PREF, JSON.stringify(p));
}

/** Pide permiso para notificar (una sola vez, o cuando la persona activa un recordatorio) */
export async function pedirPermiso(forzar = false): Promise<boolean> {
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  const yaPedido = await AsyncStorage.getItem('vg_permiso_notif_pedido');
  if (yaPedido && !forzar) return false;
  await AsyncStorage.setItem('vg_permiso_notif_pedido', '1');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Recordatorios',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

interface GrupoAgenda {
  id: string;
  nombre: string;
  dia_reunion: number | null;
  hora_reunion: string | null;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Próximas fechas de reunión de un grupo (con la hora), desde hoy */
function proximasReuniones(g: GrupoAgenda, cuantas: number): Date[] {
  if (g.dia_reunion === null || g.dia_reunion === undefined || !g.hora_reunion) return [];
  const [h, m] = g.hora_reunion.split(':').map(Number);
  const fechas: Date[] = [];
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const diff = (g.dia_reunion - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  for (let i = 0; i < cuantas; i++) {
    fechas.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return fechas;
}

let ultimoPerfil: string | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Reprograma unos segundos después (para no hacerlo en cada toque) */
export function reprogramarPronto() {
  if (!ultimoPerfil) return;
  if (temporizador) clearTimeout(temporizador);
  const id = ultimoPerfil;
  temporizador = setTimeout(() => reprogramar(id), 4000);
}

/** Borra los recordatorios agendados y los vuelve a armar con lo que hay cargado */
export async function reprogramar(perfilId: string) {
  ultimoPerfil = perfilId;
  try {
    const pref = await leerPreferencias();
    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of agendadas) {
      if ((n.content.data as any)?.vg) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    if (!pref.asistencia && !pref.consolidaciones) return;
    if (!(await pedirPermiso())) return;

    // Sus grupos (o los guardados, si no hay señal)
    const { data, error } = await supabase.from('groups').select('id, nombre, dia_reunion, hora_reunion').eq('guia_id', perfilId);
    const grupos = ((error ? await leerCache<GrupoAgenda[]>(`grupos:${perfilId}`) : data) ?? []) as GrupoAgenda[];
    if (!grupos.length) return;
    const ids = grupos.map((g) => g.id);
    const ahora = new Date();
    const hace8 = new Date();
    hace8.setDate(hace8.getDate() - 8);

    const [re, mi] = await Promise.all([
      supabase.from('reuniones').select('grupo_id, fecha, asistencias(miembro_id, presente, consolidado)').in('grupo_id', ids).gte('fecha', iso(hace8)),
      supabase.from('miembros_grupo').select('id, grupo_id, creado_en').in('grupo_id', ids).eq('activo', true),
    ]);
    const reuniones = (re.data ?? []) as { grupo_id: string; fecha: string; asistencias: { miembro_id: string; presente: boolean; consolidado: boolean }[] }[];
    const miembros = (mi.data ?? []) as { id: string; grupo_id: string; creado_en: string }[];
    const sinDatos = !!re.error;

    for (const g of grupos) {
      // 1. Después del GV: si todavía no se cargó la reunión de ese día
      if (pref.asistencia) {
        for (const f of proximasReuniones(g, 4)) {
          const aviso = new Date(f.getTime() + 2 * 3600 * 1000);
          if (aviso <= ahora) continue;
          if (!sinDatos && reuniones.some((r) => r.grupo_id === g.id && r.fecha === iso(f))) continue;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '¿Cargaste la reunión de hoy?',
              body: `Tocá para cargar la asistencia del ${g.nombre}. Lleva un minuto.`,
              data: { vg: true, tipo: 'asistencia', grupoId: g.id },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: aviso, channelId: CANAL },
          });
        }
      }

      // 2. Martes 19 h: ausentes de la última reunión sin consolidar
      if (pref.consolidaciones && !sinDatos) {
        const ultima = reuniones.filter((r) => r.grupo_id === g.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        if (!ultima) continue;
        const delGrupo = miembros.filter((m) => m.grupo_id === g.id && m.creado_en.slice(0, 10) <= ultima.fecha);
        const faltan = delGrupo.filter((m) => {
          const a = (ultima.asistencias ?? []).find((x) => x.miembro_id === m.id);
          return !a?.presente && !a?.consolidado;
        }).length;
        if (faltan === 0) continue;
        const martes = new Date(`${ultima.fecha}T19:00:00`);
        martes.setDate(martes.getDate() + ((2 - martes.getDay() + 7) % 7 || 7));
        if (martes <= ahora) continue;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Consolidaciones de la semana',
            body: `Te ${faltan === 1 ? 'falta 1 consolidación' : `faltan ${faltan} consolidaciones`} del GV del ${formatoFecha(ultima.fecha)} (${g.nombre}).`,
            data: { vg: true, tipo: 'consolidaciones', grupoId: g.id },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: martes, channelId: CANAL },
        });
      }
    }
  } catch {
    // Si algo falla (por ejemplo, sin permiso), no se agenda nada: no es grave
  }
}
