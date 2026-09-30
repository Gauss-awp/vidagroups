import React, { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { TipoEvento } from '@/lib/types';
import { TIPO_EVENTO_LABEL, hoyISO, parseMonto } from '@/lib/utils';
import { Boton, Campo, Chip, HojaModal, SelectorFecha, s } from '@/components/ui';

export const ICONO_EVENTO: Record<TipoEvento, 'flame' | 'bonfire' | 'calendar'> = {
  encuentro: 'flame',
  campamento: 'bonfire',
  otro: 'calendar',
};

/**
 * Formulario para crear un evento.
 * - grupoId: si se pasa, el evento puede ser del grupo.
 * - permitirGeneral: Supervisor/Pastor/Apóstol pueden crear eventos generales de la iglesia.
 */
export function FormEvento({
  visible,
  onClose,
  grupoId,
  permitirGeneral,
  onCreado,
}: {
  visible: boolean;
  onClose: () => void;
  grupoId: string | null;
  permitirGeneral: boolean;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('encuentro');
  const [costo, setCosto] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState('');
  const [general, setGeneral] = useState(!grupoId);
  const [guardando, setGuardando] = useState(false);

  const esGeneral = !grupoId || (permitirGeneral && general);

  const limpiar = () => {
    setNombre('');
    setTipo('encuentro');
    setCosto('');
    setFecha(hoyISO());
    setDescripcion('');
    setGeneral(!grupoId);
  };

  const guardar = async () => {
    const monto = costo.trim() === '' ? 0 : parseMonto(costo);
    if (!nombre.trim()) {
      Alert.alert('Falta el nombre', 'Escribí el nombre del evento.');
      return;
    }
    if (isNaN(monto) || monto < 0) {
      Alert.alert('Costo inválido', 'Escribí un número, por ejemplo 45000.');
      return;
    }
    if (esGeneral && !permitirGeneral) {
      Alert.alert('Sin permiso', 'Solo Supervisores, Pastores y el Apóstol pueden crear eventos generales.');
      return;
    }
    setGuardando(true);
    const { data: sesion } = await supabase.auth.getUser();
    const { error } = await supabase.from('eventos').insert({
      nombre: nombre.trim(),
      tipo,
      costo_total: monto,
      fecha_evento: fecha,
      descripcion: descripcion.trim() || null,
      grupo_id: esGeneral ? null : grupoId,
      creado_por: sesion.user?.id,
    });
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo crear el evento', error.message);
      return;
    }
    limpiar();
    onClose();
    onCreado();
  };

  return (
    <HojaModal visible={visible} onClose={onClose} titulo="Crear Evento">
      <Campo etiqueta="Nombre" placeholder="Ej: Campamento de verano" value={nombre} onChangeText={setNombre} />

      <Text style={s.etiqueta}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {(Object.keys(TIPO_EVENTO_LABEL) as TipoEvento[]).map((t) => (
          <Chip key={t} texto={TIPO_EVENTO_LABEL[t]} icono={ICONO_EVENTO[t]} activo={tipo === t} onPress={() => setTipo(t)} />
        ))}
      </View>

      <Campo
        etiqueta="Costo por persona"
        placeholder="Ej: 45000"
        keyboardType="decimal-pad"
        value={costo}
        onChangeText={setCosto}
        ayuda="Es lo que tiene que pagar cada hermano. Dejalo vacío si es gratis."
      />

      <Text style={s.etiqueta}>Fecha del evento</Text>
      <SelectorFecha valor={fecha} onChange={setFecha} />

      <Campo etiqueta="Descripción (opcional)" value={descripcion} onChangeText={setDescripcion} multiline />

      {grupoId && permitirGeneral ? (
        <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 18 }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={s.textoFila}>Evento general de la iglesia</Text>
            <Text style={s.textoFilaSec}>Lo ven todos los grupos, no solo este.</Text>
          </View>
          <Switch value={general} onValueChange={setGeneral} trackColor={{ true: colors.success, false: colors.cardAlt }} />
        </View>
      ) : null}

      <Boton titulo="Crear Evento" onPress={guardar} cargando={guardando} />
    </HojaModal>
  );
}
