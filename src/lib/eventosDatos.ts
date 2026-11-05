// ---------------------------------------------------------------------
// Datos del Centro de Eventos: carga un evento con sus anotados y pagos,
// y calcula el estado de cada persona y los totales.
// ---------------------------------------------------------------------
import { supabase } from './supabase';
import type { Evento, Pago } from './types';
import type { EstadoPago } from './eventosExcel';

export interface Persona {
  id: string;
  nombre: string;
  apellido: string | null;
  grupo_id: string;
  grupo: string;
}
export interface FilaPersona {
  persona: Persona;
  anotado: boolean;
  pagado: number;
  saldo: number;
  pct: number;
  estado: EstadoPago;
  pagos: Pago[];
  ultimoPago: string | null;
}
export interface DatosEvento {
  evento: Evento;
  personas: Persona[];
  inscriptos: Set<string>;
  pagos: Pago[];
  registradores: Record<string, string>;
}

export const nombreDe = (p: Pick<Persona, 'nombre' | 'apellido'>) => `${p.nombre} ${p.apellido ?? ''}`.trim();

/** Carga el evento, las personas que pueden ir (según el alcance), los anotados y los pagos */
export async function cargarEvento(id: string, grupoContexto?: string | null): Promise<DatosEvento> {
  const { data: ev, error } = await supabase.from('eventos').select('*').eq('id', id).maybeSingle();
  if (error || !ev) throw new Error(error?.message ?? 'El evento no existe o no tenés acceso.');
  const evento = ev as Evento;
  const grupo = evento.grupo_id ?? grupoContexto ?? null;

  let consulta = supabase.from('miembros_grupo').select('id, nombre, apellido, grupo_id, grupo:groups(nombre)').eq('activo', true).order('nombre');
  if (grupo) consulta = consulta.eq('grupo_id', grupo);
  else if (evento.red_id) {
    const { data: gr } = await supabase.from('groups').select('id').eq('red_id', evento.red_id);
    const ids = (gr ?? []).map((g: { id: string }) => g.id);
    consulta = consulta.in('grupo_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  const [m, ins, pg] = await Promise.all([
    consulta,
    supabase.from('evento_inscriptos').select('miembro_id').eq('evento_id', id),
    supabase.from('pagos_evento').select('*').eq('evento_id', id).order('fecha_pago', { ascending: true }),
  ]);
  const personas = ((m.data ?? []) as any[]).map((x) => ({
    id: x.id,
    nombre: x.nombre,
    apellido: x.apellido,
    grupo_id: x.grupo_id,
    grupo: x.grupo?.nombre ?? 'Sin grupo',
  })) as Persona[];
  const visibles = new Set(personas.map((p) => p.id));
  const pagos = ((pg.data ?? []) as Pago[]).filter((p) => visibles.has(p.miembro_id));
  const inscriptos = new Set(((ins.data ?? []) as { miembro_id: string }[]).map((x) => x.miembro_id).filter((x) => visibles.has(x)));
  pagos.forEach((p) => inscriptos.add(p.miembro_id));

  // Nombres de quienes registraron los pagos (si se pueden ver)
  const ids = [...new Set(pagos.map((p) => p.registrado_por).filter(Boolean))] as string[];
  const registradores: Record<string, string> = {};
  if (ids.length) {
    const { data: pr } = await supabase.from('profiles').select('id, nombre, apellido, email').in('id', ids);
    ((pr ?? []) as any[]).forEach((x) => (registradores[x.id] = `${x.nombre ?? ''} ${x.apellido ?? ''}`.trim() || x.email));
  }
  return { evento, personas, inscriptos, pagos, registradores };
}

/** Estado de cada persona en el evento */
export function calcularFilas(d: DatosEvento): FilaPersona[] {
  const costo = Number(d.evento.costo_total ?? 0);
  return d.personas.map((persona) => {
    const pagos = d.pagos.filter((p) => p.miembro_id === persona.id);
    const pagado = pagos.reduce((a, p) => a + Number(p.monto_pagado), 0);
    const saldo = Math.max(0, costo - pagado);
    const estado: EstadoPago = pagado <= 0 ? 'sin_pagar' : costo > 0 && saldo <= 0 ? 'pagado' : costo === 0 ? 'pagado' : 'cuotas';
    return {
      persona,
      anotado: d.inscriptos.has(persona.id),
      pagado,
      saldo,
      pct: costo > 0 ? Math.min(1, pagado / costo) : pagado > 0 ? 1 : 0,
      estado,
      pagos,
      ultimoPago: pagos.length ? pagos[pagos.length - 1].fecha_pago : null,
    };
  });
}

/** Totales del evento (solo los anotados) */
export function totales(filas: FilaPersona[], costo: number) {
  const anotados = filas.filter((f) => f.anotado);
  const recaudado = anotados.reduce((a, f) => a + f.pagado, 0);
  const esperado = anotados.length * costo;
  return {
    anotados: anotados.length,
    recaudado,
    esperado,
    porCobrar: Math.max(0, esperado - recaudado),
    avance: esperado ? recaudado / esperado : 0,
    pagaron: anotados.filter((f) => f.estado === 'pagado').length,
    cuotas: anotados.filter((f) => f.estado === 'cuotas').length,
    sinPagar: anotados.filter((f) => f.estado === 'sin_pagar').length,
  };
}

/** Recaudación acumulada día por día */
export function curvaAcumulada(pagos: Pago[]) {
  const porDia = new Map<string, number>();
  pagos.forEach((p) => porDia.set(p.fecha_pago, (porDia.get(p.fecha_pago) ?? 0) + Number(p.monto_pagado)));
  let acumulado = 0;
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, monto]) => {
      acumulado += monto;
      return { fecha, total: acumulado };
    });
}

/** Totales por grupo */
export function porGrupo(filas: FilaPersona[], costo: number) {
  const mapa = new Map<string, { grupo: string; anotados: number; pagado: number; esperado: number; sinPagar: number }>();
  filas
    .filter((f) => f.anotado)
    .forEach((f) => {
      const g = mapa.get(f.persona.grupo) ?? { grupo: f.persona.grupo, anotados: 0, pagado: 0, esperado: 0, sinPagar: 0 };
      g.anotados += 1;
      g.pagado += f.pagado;
      g.esperado += costo;
      if (f.estado === 'sin_pagar') g.sinPagar += 1;
      mapa.set(f.persona.grupo, g);
    });
  return [...mapa.values()].sort((a, b) => b.pagado - a.pagado);
}

export function diasHasta(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${iso}T12:00:00`).getTime() - hoy.getTime()) / 86400000);
}
