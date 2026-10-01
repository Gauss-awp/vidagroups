import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Evento, Moneda, TipoEvento } from '@/lib/types';
import { MONEDA_LABEL, TIPO_EVENTO_LABEL, hoyISO, parseMonto } from '@/lib/utils';
import { Boton, Campo, Chip, HojaModal, SelectorFecha, s } from '@/components/ui';

export const ICONO_EVENTO: Record<TipoEvento, 'flame' | 'bonfire' | 'calendar'> = {
  encuentro: 'flame',
  campamento: 'bonfire',
  otro: 'calendar',
};

export type Alcance = 'grupo' | 'red' | 'iglesia';

const ALCANCE_LABEL: Record<Alcance, string> = {
  grupo: 'Solo este grupo',
  red: 'Toda la red',
  iglesia: 'Toda la iglesia',
};

/**
 * Crear o editar un evento.
 * `alcances` define dónde puede crearlo quien lo usa (el primero es el valor por defecto).
 */
export function FormEvento({
  visible,
  onClose,
  onGuardado,
  alcances,
  grupoId = null,
  redId = null,
  evento = null,
}: {
  visible: boolean;
  onClose: () => void;
  onGuardado: () => void;
  alcances: Alcance[];
  grupoId?: string | null;
  redId?: string | null;
  evento?: Evento | null;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('encuentro');
  const [moneda, setMoneda] = useState<Moneda>('ARS');
  const [costo, setCosto] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState('');
  const [alcance, setAlcance] = useState<Alcance>(alcances[0] ?? 'grupo');
  const [guardando, setGuardando] = useState(false);

  // Al abrir: cargar el evento a editar o limpiar el formulario
  useEffect(() => {
    if (!visible) return;
    if (evento) {
      setNombre(evento.nombre);
      setTipo(evento.tipo);
      setMoneda(evento.moneda ?? 'ARS');
      setCosto(Number(evento.costo_total) ? String(Number(evento.costo_total)) : '');
      setFecha(evento.fecha_evento ?? hoyISO());
      setDescripcion(evento.descripcion ?? '');
    } else {
      setNombre('');
      setTipo('encuentro');
      setMoneda('ARS');
      setCosto('');
      setFecha(hoyISO());
      setDescripcion('');
      setAlcance(alcances[0] ?? 'grupo');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, evento]);

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
    const datos = {
      nombre: nombre.trim(),
      tipo,
      moneda,
      costo_total: monto,
      fecha_evento: fecha,
      descripcion: descripcion.trim() || null,
    };

    setGuardando(true);
    let error;
    if (evento) {
      ({ error } = await supabase.from('eventos').update(datos).eq('id', evento.id));
    } else {
      const { data: usuario } = await supabase.auth.getUser();
      ({ error } = await supabase.from('eventos').insert({
        ...datos,
        grupo_id: alcance === 'grupo' ? grupoId : null,
        red_id: alcance === 'red' ? redId : null,
        creado_por: usuario.user?.id,
      }));
    }
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar el evento', error.message);
      return;
    }
    onClose();
    onGuardado();
  };

  return (
    <HojaModal visible={visible} onClose={onClose} titulo={evento ? 'Editar evento' : 'Crear Evento'}>
      <Campo etiqueta="Nombre" placeholder="Ej: Campamento de verano" value={nombre} onChangeText={setNombre} />

      <Text style={s.etiqueta}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {(Object.keys(TIPO_EVENTO_LABEL) as TipoEvento[]).map((t) => (
          <Chip key={t} texto={TIPO_EVENTO_LABEL[t]} icono={ICONO_EVENTO[t]} activo={tipo === t} onPress={() => setTipo(t)} />
        ))}
      </View>

      <Text style={s.etiqueta}>Moneda</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {(['ARS', 'USD'] as Moneda[]).map((m) => (
          <Chip key={m} texto={MONEDA_LABEL[m]} activo={moneda === m} color={colors.success} onPress={() => setMoneda(m)} />
        ))}
      </View>

      <Campo
        etiqueta={`Costo por persona (${moneda === 'USD' ? 'US$' : '$'})`}
        placeholder={moneda === 'USD' ? 'Ej: 150' : 'Ej: 45000'}
        keyboardType="decimal-pad"
        value={costo}
        onChangeText={setCosto}
        ayuda="Lo que paga cada hermano. Dejalo vacío si el evento es gratis."
      />

      <Text style={s.etiqueta}>Fecha del evento</Text>
      <SelectorFecha valor={fecha} onChange={setFecha} />

      {!evento && alcances.length > 1 ? (
        <>
          <Text style={s.etiqueta}>¿Para quién es?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {alcances.map((a) => (
              <Chip key={a} texto={ALCANCE_LABEL[a]} activo={alcance === a} color={colors.purple} onPress={() => setAlcance(a)} />
            ))}
          </View>
        </>
      ) : null}

      <Campo etiqueta="Descripción (opcional)" value={descripcion} onChangeText={setDescripcion} multiline />

      <Boton titulo={evento ? 'Guardar cambios' : 'Crear Evento'} onPress={guardar} cargando={guardando} />
    </HojaModal>
  );
}
