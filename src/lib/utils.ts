import type { Moneda, Perfil, Rol, TipoEvento } from './types';

export const ROL_LABEL: Record<Rol, string> = {
  guia: 'Guía',
  guia_supervisor: 'Guía Supervisor',
  consolidacion: 'Consolidador',
  pastor: 'Pastor',
  apostol: 'Apóstol',
};

export const ROL_RANGO: Record<Rol, number> = {
  guia: 1,
  guia_supervisor: 2,
  consolidacion: 2,
  pastor: 3,
  apostol: 4,
};

export const TIPO_EVENTO_LABEL: Record<TipoEvento, string> = {
  encuentro: 'Encuentro',
  campamento: 'Campamento',
  otro: 'Otro',
};

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function esAdmin(rol?: Rol | null): boolean {
  return rol === 'apostol' || rol === 'pastor';
}

export function nombreCompleto(p: { nombre: string; apellido: string; email?: string } | null | undefined): string {
  if (!p) return '';
  const n = `${p.nombre?? ''} ${p.apellido?? ''}`.trim();
  return n || p.email || 'Sin nombre';
}

export function iniciales(texto: string): string {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const a = partes[0][0]?? '';
  const b = partes.length > 1? partes[partes.length - 1][0]?? '' : '';
  return (a + b).toUpperCase();
}

// ---------- Fechas (siempre en hora local, formato AAAA-MM-DD) ----------

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function desdeISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function hoyISO(): string {
  return toISO(new Date());
}

export function sumarDias(iso: string, dias: number): string {
  const d = desdeISO(iso);
  d.setDate(d.getDate() + dias);
  return toISO(d);
}

/** Los 7 días que terminan en `hasta` (incluido), del más viejo al más nuevo */
export function semanaHasta(hasta: string = hoyISO()): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(hasta, i - 6));
}

export function diaCorto(iso: string): string {
  return DIAS_CORTOS[desdeISO(iso).getDay()];
}

export function formatoFecha(iso: string | null | undefined): string {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function rangoMes(anio: number, mes: number): { inicio: string; fin: string } {
  return { inicio: toISO(new Date(anio, mes, 1)), fin: toISO(new Date(anio, mes + 1, 0)) };
}

// ---------- Números y dinero ----------

export function formatoMoneda(valor: number, moneda: Moneda = 'ARS'): string {
  const negativo = valor < 0;
  const [entero, decimales] = Math.abs(valor).toFixed(2).split('.');
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const simbolo = moneda === 'USD' ? 'US$ ' : '$ ';
  return `${negativo ? '-' : ''}${simbolo}${conPuntos}${decimales !== '00' ? `,${decimales}` : ''}`;
}

export const MONEDA_LABEL: Record<Moneda, string> = { ARS: 'Pesos', USD: 'Dólares' };

/** Suma montos separados por moneda: "US$ 1.200 · $ 850.000" */
export function totalesPorMoneda(items: { monto: number; moneda: Moneda }[]): string {
  const ars = items.filter((i) => i.moneda === 'ARS').reduce((a, i) => a + i.monto, 0);
  const usd = items.filter((i) => i.moneda === 'USD').reduce((a, i) => a + i.monto, 0);
  const partes: string[] = [];
  if (usd) partes.push(formatoMoneda(usd, 'USD'));
  if (ars || partes.length === 0) partes.push(formatoMoneda(ars, 'ARS'));
  return partes.join(' · ');
}

export function abreviarNumero(valor: number): string {
  if (!isFinite(valor)) return '0';
  if (Math.abs(valor) >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (Math.abs(valor) >= 1_000) return `${Math.round(valor / 1_000)}k`;
  return String(Math.round(valor));
}

/** Acepta "1500", "1.500", "1500,50" o "1.500,50" */
export function parseMonto(texto: string): number {
  const limpio = texto.replace(/\s|\$/g, '');
  if (!limpio) return NaN;
  if (limpio.includes(',')) return Number(limpio.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) return Number(limpio.replace(/\./g, ''));
  return Number(limpio);
}

export function porcentaje(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte * 100) / total);
}

// ---------- Errores ----------

export function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Tenés que confirmar tu correo antes de ingresar.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password should be at least')) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid format')) return 'El correo no es válido.';
  if (m.includes('network request failed')) return 'Sin conexión. Revisá tu internet e intentá de nuevo.';
  if (m.includes('row-level security')) return 'No tenés permiso para hacer esto.';
  return mensaje;
}

export type PerfilLite = Pick<Perfil, 'id' | 'nombre' | 'apellido' | 'email' | 'rol'>;
// ---------- Cumpleaños ----------

/** "25/12" o "25/12/1990" → fecha ISO. Sin año se guarda como 1904 (año bisiesto, para el 29/02). */
export function parseCumple(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3] ? Number(m[3]) : 1904;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(anio, mes - 1, dia);
  if (d.getMonth() !== mes - 1) return null;
  return toISO(d);
}

/** Fecha ISO → "25/12" (o "25/12/1990" si tiene año real) */
export function formatoCumple(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y === '1904' ? `${d}/${m}` : `${d}/${m}/${y}`;
}

/** ¿Cumple dentro de los próximos `dias` días (hoy incluido)? */
export function cumpleProximo(iso: string | null | undefined, dias = 7): boolean {
  if (!iso) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  let prox = new Date(hoy.getFullYear(), m - 1, d);
  if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, m - 1, d);
  return (prox.getTime() - hoy.getTime()) / 86400000 < dias;
}
