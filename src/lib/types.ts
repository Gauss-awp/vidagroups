export type Rol = 'guia' | 'guia_supervisor' | 'consolidacion' | 'pastor' | 'apostol';
export type EstadoPerfil = 'pendiente' | 'activo' | 'inactivo';

export interface Red {
  id: string;
  nombre: string;
}
export type TipoEvento = 'encuentro' | 'campamento' | 'otro';
export type Moneda = 'ARS' | 'USD';

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  supervisor_id: string | null;
  red_id: string | null;
  estado: EstadoPerfil;
  telefono?: string | null;
  creado_en: string;
}

export interface Grupo {
  id: string;
  nombre: string;
  descripcion: string | null;
  guia_id: string;
  supervisor_id: string | null;
  creado_en: string;
}

export interface Miembro {
  id: string;
  grupo_id: string;
  usuario_id: string | null;
  nombre: string;
  apellido: string;
  telefono: string | null;
  cumpleanos?: string | null;
  activo: boolean;
  creado_en: string;
}

export interface Habito {
  id: string;
  grupo_id: string;
  nombre: string;
  creado_en: string;
}

export interface RegistroDiario {
  habito_id: string;
  miembro_id: string;
  fecha: string;
  completado: boolean;
}

export interface Evento {
  id: string;
  grupo_id: string | null;
  /** Red del evento. Si grupo_id y red_id son null, es de toda la iglesia */
  red_id: string | null;
  moneda: Moneda;
  nombre: string;
  tipo: TipoEvento;
  costo_total: number;
  fecha_evento: string | null;
  descripcion: string | null;
  creado_por: string | null;
  creado_en: string;
}

export interface Pago {
  id: string;
  evento_id: string;
  miembro_id: string;
  monto_pagado: number;
  fecha_pago: string;
  registrado_por: string | null;
  nota: string | null;
  creado_en: string;
}
