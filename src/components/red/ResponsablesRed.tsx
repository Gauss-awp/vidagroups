import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil } from '@/lib/types';
import { ROL_LABEL, nombreCompleto } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Badge, Boton, Campo, Card, HojaModal, SeccionTitulo, s } from '@/components/ui';

type Tipo = 'encargados' | 'pastores';

/**
 * Pastores y Encargados de una red.
 * - Pastores: los asigna el Apóstol.
 * - Encargados: los designan el Apóstol y los Pastores de la red.
 */
export function ResponsablesRed({ redId, onCambio }: { redId: string; onCambio?: () => void }) {
  const { perfil } = useAuth();
  const esApostol = perfil?.rol === 'apostol';
  const [pastores, setPastores] = useState<Perfil[]>([]);
  const [encargados, setEncargados] = useState<Perfil[]>([]);
  const [candidatos, setCandidatos] = useState<Perfil[]>([]);
  const [agregando, setAgregando] = useState<Tipo | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    const [p, e] = await Promise.all([
      supabase.from('redes_pastores').select('perfil_id').eq('red_id', redId),
      supabase.from('redes_encargados').select('perfil_id').eq('red_id', redId),
    ]);
    const idsP = (p.data ?? []).map((x: { perfil_id: string }) => x.perfil_id);
    const idsE = (e.data ?? []).map((x: { perfil_id: string }) => x.perfil_id);
    const ids = [...new Set([...idsP, ...idsE])];
    const { data } = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [] };
    const perfiles = (data ?? []) as Perfil[];
    setPastores(perfiles.filter((x) => idsP.includes(x.id)));
    setEncargados(perfiles.filter((x) => idsE.includes(x.id)));
  }, [redId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirAgregar = async (tipo: Tipo) => {
    setBusqueda('');
    setAgregando(tipo);
    const consulta =
      tipo === 'pastores'
        ? supabase.from('profiles').select('*').eq('rol', 'pastor').eq('estado', 'activo').order('nombre')
        : supabase.from('profiles').select('*').eq('red_id', redId).eq('estado', 'activo').order('nombre');
    const { data } = await consulta;
    setCandidatos((data ?? []) as Perfil[]);
  };

  const agregar = async (persona: Perfil) => {
    if (!agregando) return;
    const tabla = agregando === 'pastores' ? 'redes_pastores' : 'redes_encargados';
    const { error } = await supabase.from(tabla).insert({ red_id: redId, perfil_id: persona.id });
    if (error) {
      Alert.alert('No se pudo agregar', error.message);
      return;
    }
    setAgregando(null);
    cargar();
    onCambio?.();
  };

  const quitar = (tipo: Tipo, persona: Perfil) => {
    const tabla = tipo === 'pastores' ? 'redes_pastores' : 'redes_encargados';
    const que = tipo === 'pastores' ? 'Pastor de esta red' : 'Encargado de esta red';
    Alert.alert('Quitar', `¿Quitar a ${nombreCompleto(persona)} como ${que}? Su rol no cambia.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from(tabla).delete().eq('red_id', redId).eq('perfil_id', persona.id);
          if (error) Alert.alert('No se pudo quitar', error.message);
          else {
            cargar();
            onCambio?.();
          }
        },
      },
    ]);
  };

  const fila = (tipo: Tipo, p: Perfil, puedeQuitar: boolean) => (
    <View key={p.id} style={[s.fila, { paddingVertical: 10 }]}>
      <Avatar nombre={nombreCompleto(p)} color={ROL_COLOR[p.rol]} tamano={34} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.textoFila}>{nombreCompleto(p)}</Text>
      </View>
      <Badge texto={ROL_LABEL[p.rol]} color={ROL_COLOR[p.rol]} />
      {puedeQuitar ? (
        <Pressable onPress={() => quitar(tipo, p)} hitSlop={10} style={{ marginLeft: 10 }}>
          <Ionicons name="close-circle" size={22} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );

  const yaEsta = (id: string) => (agregando === 'pastores' ? pastores : encargados).some((x) => x.id === id);
  const q = busqueda.trim().toLowerCase();
  const lista = candidatos.filter((c) => !yaEsta(c.id) && (!q || nombreCompleto(c).toLowerCase().includes(q)));

  return (
    <View>
      <SeccionTitulo
        titulo="Pastores de la red"
        accion={esApostol ? { texto: 'Agregar', icono: 'add', onPress: () => abrirAgregar('pastores') } : undefined}
      />
      <Card>
        {pastores.length === 0 ? <Text style={s.textoFilaSec}>Sin pastores asignados.</Text> : pastores.map((p) => fila('pastores', p, esApostol))}
      </Card>

      <SeccionTitulo titulo="Encargados de la red" accion={{ texto: 'Agregar', icono: 'add', onPress: () => abrirAgregar('encargados') }} />
      <Card>
        {encargados.length === 0 ? (
          <Text style={s.textoFilaSec}>Sin encargados. Designá a alguien de la red para que apruebe cuentas y maneje los grupos.</Text>
        ) : (
          encargados.map((p) => fila('encargados', p, true))
        )}
      </Card>

      <HojaModal
        visible={!!agregando}
        onClose={() => setAgregando(null)}
        titulo={agregando === 'pastores' ? 'Agregar Pastor' : 'Agregar Encargado'}
      >
        <Campo placeholder="Buscar por nombre" value={busqueda} onChangeText={setBusqueda} />
        {lista.length === 0 ? (
          <Text style={s.textoFilaSec}>
            {agregando === 'pastores'
              ? 'No hay más personas con rol Pastor. Asignales ese rol desde Administrar.'
              : 'No hay más personas activas en esta red.'}
          </Text>
        ) : null}
        {lista.map((c) => (
          <Pressable key={c.id} onPress={() => agregar(c)} style={s.filaLista}>
            <Avatar nombre={nombreCompleto(c)} color={ROL_COLOR[c.rol]} tamano={34} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.textoFila}>{nombreCompleto(c)}</Text>
              <Text style={s.textoFilaSec}>{ROL_LABEL[c.rol]}</Text>
            </View>
            <Ionicons name="add-circle" size={24} color={colors.primary} />
          </Pressable>
        ))}
        <Boton titulo="Cerrar" variante="secundario" onPress={() => setAgregando(null)} style={{ marginTop: 16 }} />
      </HojaModal>
    </View>
  );
}
