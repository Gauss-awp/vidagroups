import type { Rol } from './types';

// ---------------------------------------------------------------------
// Sistema de diseño de VidaGroups: usar SIEMPRE estos valores,
// nunca colores ni tamaños escritos a mano en las pantallas.
// ---------------------------------------------------------------------

const CLARO = {
  // Superficies
  bg: '#F8FAFC',         // fondo general
  card: '#FFFFFF',       // tarjetas
  cardAlt: '#F1F5F9',    // inputs, chips inactivos, fondos suaves
  border: '#E2E8F0',     // bordes y separadores
  // Texto
  text: '#0F172A',
  textSec: '#64748B',
  textTer: '#7B8798',
  // Marca y estados
  primary: '#4F46E5',
  primaryBg: '#EEF2FF',
  success: '#059669',
  successBg: '#ECFDF5',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorde: '#FECACA',
  purple: '#7C3AED',
  teal: '#0891B2',
};

// Oscuro con vida: azul noche profundo (no gris) y acentos brillantes
const OSCURO: typeof CLARO = {
  bg: '#0B1020',
  card: '#151B2E',
  cardAlt: '#1E2640',
  border: '#2A3350',
  text: '#F1F5F9',
  textSec: '#A3B0C8',
  textTer: '#8390AA',
  primary: '#818CF8',
  primaryBg: '#1E1B4B',
  success: '#34D399',
  successBg: '#06281F',
  warning: '#FBBF24',
  warningBg: '#2B1E06',
  danger: '#F87171',
  dangerBg: '#3A1114',
  dangerBorde: '#7F1D1D',
  purple: '#A78BFA',
  teal: '#22D3EE',
};

/** Colores del tema activo. Se actualizan en el lugar al cambiar de tema. */
export const colors = { ...CLARO };

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

/** Escala tipográfica */
export const tipo = {
  titulo: 28,
  h2: 19,
  h3: 16,
  cuerpo: 15,
  chico: 13,
  mini: 11,
};

/** Espaciados */
export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

const coloresRol = (): Record<Rol, string> => ({
  apostol: colors.purple,
  pastor: colors.warning,
  guia_supervisor: colors.teal,
  consolidacion: colors.primary,
  guia: colors.success,
});

export const ROL_COLOR: Record<Rol, string> = coloresRol();

let version = 0;
let oscuro = false;

/** Cambia todos los colores de la app. Después hay que volver a dibujar (lo hace TemaProvider). */
export function aplicarTema(esOscuro: boolean) {
  if (esOscuro === oscuro && version > 0) return;
  Object.assign(colors, esOscuro ? OSCURO : CLARO);
  Object.assign(ROL_COLOR, coloresRol());
  oscuro = esOscuro;
  version++;
}

export const temaVersion = () => version;
export const esTemaOscuro = () => oscuro;

export function colorPorcentaje(porcentaje: number): string {
  if (porcentaje >= 75) return colors.success;
  if (porcentaje >= 50) return colors.warning;
  return colors.danger;
}
