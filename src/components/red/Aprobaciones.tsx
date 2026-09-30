import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil, Rol } from '@/lib/types';
import { ROL_LABEL, nombreCompleto } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Boton, Card, Chip, HojaModal, SeccionTitulo, s } from '@/components/ui';

/** Personas registradas en la red que esperan que les asignen un rol. */
export function Aprobaciones({ redId, onCambio }: { redId: string; onCambio?: () => void }) {
  const { perfil } = useAuth();
  const [pendientes, setPendientes] = useState<Perfil[]>([]);
  const [supervisores, setSupervisores] = useState<Perfil[]>([]);
  const [elegido, setElegido] = useState<Perfil | null>(null);
  const [rol, setRol] = useState<Rol>('guia');
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const esApostol = perfil?.rol === 'apostol';
  const rolesPosibles: Rol[] = esApostol
    ? ['guia', 'guia_supervisor', 'consolidacion', 'pastor']
    : ['guia', 'guia_supervisor', 'consolidacion'];

  const cargar = useCallback(async () => {
    // El Apóstol también ve a quienes todavía no eligieron red
    let consulta = supabase.from('profiles').select('*').eq('estado', 'pendiente').order('creado_en');
    consulta = esApostol ? consulta.or(`red_id.eq.${redId},red_id.is.null`) : consulta.eq('red_id', redId);
    const [p, sup] = await Promise.all([
      consulta,
      supabase.from('profiles').select('*').eq('red_id', redId).eq('rol', 'guia_supervisor').eq('estado', 'activo').order('nombre'),
    ]);
    setPendientes((p.data ?? []) as Perfil[]);
    setSupervisores((sup.data ?? []) as Perfil[]);
  }, [redId, esApostol]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = (p: Perfil) => {
    setElegido(p);
    setRol('guia');
    setSupervisorId(null);
  };

  const aprobar = async () => {
    if (!elegido) return;
    setGuardando(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        estado: 'activo',
        rol,
        red_id: rol === 'pastor' ? elegido.red_id : elegido.red_id ?? redId,
        supervisor_id: rol === 'guia' ? supervisorId : null,
      })
      .eq('id', elegido.id);
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo aprobar', error.message);
      return;
    }
    setElegido(null);
    cargar();
    onCambio?.();
  };

  const rechazar = (p: Perfil) => {
    Alert.alert('Rechazar cuenta', `¿Rechazar a ${nombreCompleto(p)}? No va a poder ver nada en la app.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('profiles').update({ estado: 'inactivo' }).eq('id', p.id);
          if (error) Alert.alert('No se pudo rechazar', error.message);
          else cargar();
        },
      },
    ]);
  };

  return (
    <View>
      <SeccionTitulo titulo={`Pendientes de aprobación (${pendientes.length})`} />
      {pendientes.length === 0 ? (
        <Card>
          <Text style={s.textoFilaSec}>No hay cuentas nuevas esperando.</Text>
        </Card>
      ) : (
        pendientes.map((p) => (
          <Card key={p.id}>
            <View style={s.fila}>
              <Avatar nombre={nombreCompleto(p)} color={colors.warning} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.textoFila}>{nombreCompleto(p)}</Text>
                <Text style={s.textoFilaSec}>{p.email}</Text>
                {!p.red_id ? <Text style={[s.textoFilaSec, { color: colors.warning }]}>Todavía no eligió red</Text> : null}
              </View>
            </View>
            <View style={[s.fila, { gap: 8, marginTop: 12 }]}>
              <Boton titulo="Aprobar" icono="checkmark" compacto onPress={() => abrir(p)} style={{ flex: 1 }} />
              <Boton titulo="Rechazar" variante="peligro" compacto onPress={() => rechazar(p)} style={{ flex: 1 }} />
            </View>
          </Card>
        ))
      )}

      <HojaModal visible={!!elegido} onClose={() => setElegido(null)} titulo={elegido ? `Aprobar a ${nombreCompleto(elegido)}` : ''}>
        <Text style={s.etiqueta}>Rol</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {rolesPosibles.map((r) => (
            <Chip key={r} texto={ROL_LABEL[r]} activo={rol === r} color={ROL_COLOR[r]} onPress={() => setRol(r)} />
          ))}
        </View>

        {rol === 'guia' ? (
          <>
            <SeccionTitulo titulo="Guía Supervisor" />
            {supervisores.length === 0 ? (
              <Text style={[s.textoFilaSec, { marginBottom: 12 }]}>
                Esta red todavía no tiene Guías Supervisores. Podés asignarlo después.
              </Text>
            ) : null}
            <Pressable onPress={() => setSupervisorId(null)} style={s.filaLista}>
              <Ionicons
                name={supervisorId === null ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={supervisorId === null ? colors.primary : colors.textTer}
                style={{ marginRight: 12 }}
              />
              <Text style={s.textoFila}>Asignar después</Text>
            </Pressable>
            {supervisores.map((sup) => (
              <Pressable key={sup.id} onPress={() => setSupervisorId(sup.id)} style={s.filaLista}>
                <Ionicons
                  name={supervisorId === sup.id ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={supervisorId === sup.id ? colors.primary : colors.textTer}
                  style={{ marginRight: 12 }}
                />
                <Text style={s.textoFila}>{nombreCompleto(sup)}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        <Boton titulo="Aprobar" onPress={aprobar} cargando={guardando} style={{ marginTop: 20 }} />
      </HojaModal>
    </View>
  );
}
