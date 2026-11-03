import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { ROL_LABEL } from '@/lib/utils';
import type { Rol } from '@/lib/types';
import { Cargando, HojaModal, s } from '@/components/ui';

type Tipo = 'guia' | 'supervisor';
interface Persona {
  id: string;
  nombre: string;
  principal: boolean;
}
interface Equipo {
  guias: Persona[];
  supervisores: Persona[];
  puede_guias: boolean;
  puede_supervision: boolean;
}

/**
 * Equipo del grupo: quiénes lo guían y quiénes lo supervisan, en un solo lugar.
 * El primero de cada fila es el principal (⭐). Se suma con "+" y se quita con la ✕.
 */
export function EquipoDelGrupo({ grupoId, onCambio }: { grupoId: string; onCambio?: () => void }) {
  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [eligiendo, setEligiendo] = useState<Tipo | null>(null);
  const [candidatos, setCandidatos] = useState<{ id: string; nombre: string; rol: Rol }[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('equipo_del_grupo', { p_grupo: grupoId });
    if (error) {
      alerta('No se pudo cargar el equipo', error.message);
      return;
    }
    setEquipo(data as Equipo);
  }, [grupoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirAgregar = async (tipo: Tipo) => {
    setBusqueda('');
    setCandidatos([]);
    setEligiendo(tipo);
    const { data, error } = await supabase.rpc('equipo_candidatos', { p_grupo: grupoId, p_tipo: tipo });
    if (error) alerta('No se pudo cargar la lista', error.message);
    setCandidatos((data ?? []) as { id: string; nombre: string; rol: Rol }[]);
  };

  const ejecutar = async (fn: string, perfil: string, tipo: Tipo) => {
    setTrabajando(true);
    const { error } = await supabase.rpc(fn, { p_grupo: grupoId, p_perfil: perfil, p_tipo: tipo });
    setTrabajando(false);
    if (error) {
      alerta('No se pudo guardar', error.message);
      return false;
    }
    await cargar();
    onCambio?.();
    return true;
  };

  const agregar = async (id: string) => {
    if (!eligiendo) return;
    if (await ejecutar('equipo_agregar', id, eligiendo)) setEligiendo(null);
  };

  const quitar = (p: Persona, tipo: Tipo) =>
    alerta(
      'Quitar del equipo',
      `¿Quitar a ${p.nombre} ${tipo === 'guia' ? 'como guía' : 'de la supervisión'} de este grupo?${p.principal ? ' Va a quedar como principal la siguiente persona de la lista.' : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => ejecutar('equipo_quitar', p.id, tipo) },
      ]
    );

  const hacerPrincipal = (p: Persona, tipo: Tipo) =>
    alerta('Cambiar principal', `¿${p.nombre} pasa a ser ${tipo === 'guia' ? 'el guía principal' : 'el supervisor principal'} del grupo?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí', onPress: () => ejecutar('equipo_principal', p.id, tipo) },
    ]);

  if (!equipo) return <Cargando />;

  const fila = (titulo: string, tipo: Tipo, personas: Persona[], puede: boolean, vacio: string) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textSec, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>{titulo.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {personas.length === 0 ? <Text style={[s.textoFilaSec, { paddingVertical: 8 }]}>{vacio}</Text> : null}
        {personas.map((p) => (
          <View
            key={p.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: p.principal ? colors.primaryBg : colors.cardAlt,
              borderRadius: 20,
              paddingVertical: 8,
              paddingLeft: 10,
              paddingRight: puede ? 6 : 12,
            }}
          >
            <Pressable
              onPress={() => (puede && !p.principal ? hacerPrincipal(p, tipo) : undefined)}
              hitSlop={6}
              accessibilityLabel={p.principal ? 'Principal' : 'Hacer principal'}
            >
              <Ionicons name={p.principal ? 'star' : 'star-outline'} size={16} color={p.principal ? colors.warning : colors.textTer} />
            </Pressable>
            <Text style={{ color: colors.text, fontWeight: p.principal ? '700' : '500', marginLeft: 6 }}>{p.nombre}</Text>
            {puede ? (
              <Pressable onPress={() => quitar(p, tipo)} hitSlop={8} style={{ marginLeft: 6 }} accessibilityLabel={`Quitar a ${p.nombre}`}>
                <Ionicons name="close-circle" size={18} color={colors.textTer} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {puede ? (
          <Pressable
            onPress={() => abrirAgregar(tipo)}
            style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary }}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 2 }}>Agregar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const filtrados = candidatos.filter((c) => !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <View>
      {fila('Guías', 'guia', equipo.guias, equipo.puede_guias, 'Sin guía')}
      {fila('Supervisión', 'supervisor', equipo.supervisores, equipo.puede_supervision, 'Sin supervisión todavía')}
      {equipo.puede_guias || equipo.puede_supervision ? (
        <Text style={[s.textoFilaSec, { fontSize: 12 }]}>⭐ = principal. Tocá la estrella de otra persona para que pase a ser la principal.</Text>
      ) : null}

      <HojaModal visible={!!eligiendo} onClose={() => setEligiendo(null)} titulo={eligiendo === 'guia' ? 'Sumar un guía' : 'Sumar a la supervisión'}>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre"
          placeholderTextColor={colors.textTer}
          style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: 12, color: colors.text, marginBottom: 10 }}
        />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {filtrados.length === 0 ? (
            <Text style={s.textoFilaSec}>
              {candidatos.length === 0
                ? eligiendo === 'guia'
                  ? 'No hay otros guías aprobados en la red. La persona tiene que registrarse y ser aprobada primero.'
                  : 'No hay otros Guías Supervisores aprobados en la red.'
                : 'Nadie coincide con la búsqueda.'}
            </Text>
          ) : (
            filtrados.map((c) => (
              <Pressable key={c.id} onPress={() => !trabajando && agregar(c.id)} style={s.filaLista}>
                <View style={{ flex: 1 }}>
                  <Text style={s.textoFila}>{c.nombre}</Text>
                  <Text style={s.textoFilaSec}>{ROL_LABEL[c.rol] ?? c.rol}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </HojaModal>
    </View>
  );
}
