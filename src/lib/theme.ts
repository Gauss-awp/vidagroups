import type { Rol } from './types';

// Paleta clara moderna - estilo iOS 26 / Linear
export const colors = {
  bg: '#F8FAFC',        // fondo general
  card: '#FFFFFF',      // tarjetas
  cardAlt: '#F1F5F9',    // inputs / chips inactivos
  border: '#E2E8F0',     // bordes suaves
  text: '#0F172A',       // texto principal casi negro
  textSec: '#64748B',    // texto secundario
  textTer: '#94A3B8',    // placeholders
  primary: '#6366F1',    // violeta moderno
  success: '#10B981',    // verde
  warning: '#F59E0B',    // amarillo
  danger: '#EF4444',     // rojo
  purple: '#8B5CF6',
  teal: '#06B6D4',
};

export const radius = { sm: 12, md: 20, lg: 28 };

export const ROL_COLOR: Record<Rol, string> = {
  apostol: colors.purple,
  pastor: colors.warning,
  supervisor: colors.teal,
  guia: colors.success,
};

export function colorPorcentaje(porcentaje: number): string {
  if (porcentaje >= 75) return colors.success;
  if (porcentaje >= 50) return colors.warning;
  return colors.danger;
}