import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import { formatoFecha } from '@/lib/utils';
import { HojaModal, SeccionTitulo, s } from '@/components/ui';

interface Periodo {
  rol: 'guia' | 'supervisor';
  nombre: string;
  desde: string;
  hasta: string | null;
  reuniones: number;
  asistencia: number | null;
}

/** Quién guió y supervisó el grupo, desde/hasta cuándo, y cómo fue la asistencia en cada período. */
export function HistorialLiderazgo({ grupoId, visible, onClose }: { grupoId: string; visible: boolean; onClose: () => void }) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  useEffect(() => {
    if (!visible) return;
    supabase.rpc('historial_grupo', { p_grupo: grupoId }).then(({ data }) => setPeriodos((data ?? []) as Periodo[]));
  }, [grupoId, visible]);

  const lista = (rol: 'guia' | 'supervisor') => periodos.filter((p) => p.rol === rol);

  const fila = (p: Periodo, i: number) => (
    <View key={i} style={[s.filaLista, { alignItems: 'flex-start' }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.textoFila}>
          {p.nombre || 'Sin nombre'} {p.hasta === null ? <Text style={{ color: colors.success, fontSize: 13 }}>· actual</Text> : null}
        </Text>
        <Text style={s.textoFilaSec}>
          {formatoFecha(p.desde.slice(0, 10))} – {p.hasta ? formatoFecha(p.hasta.slice(0, 10)) : 'hoy'} · {p.reuniones}{' '}
          {p.reuniones === 1 ? 'reunión' : 'reuniones'}
        </Text>
      </View>
      {p.asistencia !== null ? (
        <Text style={{ fontSize: 17, fontWeight: '800', color: colorPorcentaje(p.asistencia) }}>{p.asistencia}%</Text>
      ) : null}
    </View>
  );

  return (
    <HojaModal visible={visible} onClose={onClose} titulo="Historial del grupo">
      <SeccionTitulo titulo="Guías" />
      {lista('guia').length ? lista('guia').map(fila) : <Text style={s.textoFilaSec}>Sin registros.</Text>}
      <SeccionTitulo titulo="Guías Supervisores" />
      {lista('supervisor').length ? lista('supervisor').map(fila) : <Text style={s.textoFilaSec}>Sin registros.</Text>}
      <Text style={[s.textoFilaSec, { marginTop: 16 }]}>El porcentaje es la asistencia promedio a las reuniones registradas en cada período.</Text>
    </HojaModal>
  );
}
