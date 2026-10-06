import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Chip, s } from '@/components/ui';

interface PerfilLite {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
}

const nombreDe = (p?: PerfilLite | null) => (p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || p.email : '');

/**
 * Supervisores de un grupo: el principal (el supervisor del guía) y un segundo opcional,
 * para cuando el grupo lo acompañan dos Guías Supervisores (por ejemplo "Flor y Samu").
 */
export function SupervisoresDelGrupo({ grupoId, redId, principalId }: { grupoId: string; redId: string; principalId: string | null }) {
  const [principal, setPrincipal] = useState<PerfilLite | null>(null);
  const [segundos, setSegundos] = useState<PerfilLite[]>([]);
  const [candidatos, setCandidatos] = useState<PerfilLite[]>([]);
  const [eligiendo, setEligiendo] = useState(false);

  const cargar = useCallback(async () => {
    const [p, seg, cand] = await Promise.all([
      principalId ? supabase.from('profiles').select('id, nombre, apellido, email').eq('id', principalId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('grupo_supervisores').select('perfil_id').eq('grupo_id', grupoId),
      supabase.from('profiles').select('id, nombre, apellido, email').eq('red_id', redId).eq('rol', 'guia_supervisor').eq('estado', 'activo').order('nombre'),
    ]);
    const lista = (cand.data ?? []) as PerfilLite[];
    const ids = ((seg.data ?? []) as { perfil_id: string }[]).map((x) => x.perfil_id);
    setPrincipal((p.data as PerfilLite | null) ?? null);
    setSegundos(lista.filter((x) => ids.includes(x.id)));
    setCandidatos(lista.filter((x) => x.id !== principalId && !ids.includes(x.id)));
  }, [grupoId, redId, principalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregar = async (p: PerfilLite) => {
    const { error } = await supabase.from('grupo_supervisores').insert({ grupo_id: grupoId, perfil_id: p.id });
    if (error) {
      Alert.alert('No se pudo agregar', error.message);
      return;
    }
    setEligiendo(false);
    cargar();
  };

  const quitar = (p: PerfilLite) =>
    Alert.alert('Quitar supervisor', `¿Quitar a ${nombreDe(p)} como segundo supervisor de este grupo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('grupo_supervisores').delete().eq('grupo_id', grupoId).eq('perfil_id', p.id);
          if (error) Alert.alert('No se pudo quitar', error.message);
          else cargar();
        },
      },
    ]);

  return (
    <View style={{ backgroundColor: colors.cardAlt, borderRadius: 10, padding: 10 }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>Supervisión</Text>
      <Text style={{ color: colors.text, fontSize: 13 }}>
        {principal ? nombreDe(principal) : 'Sin supervisor principal'}
        <Text style={{ color: colors.textSec }}> · principal (es el supervisor del guía)</Text>
      </Text>
      {segundos.map((p) => (
        <View key={p.id} style={[s.fila, { marginTop: 4 }]}>
          <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
            {nombreDe(p)}
            <Text style={{ color: colors.textSec }}> · segundo supervisor</Text>
          </Text>
          <Pressable onPress={() => quitar(p)} hitSlop={10}>
            <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ))}
      {eligiendo ? (
        candidatos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {candidatos.map((p) => (
              <Chip key={p.id} texto={nombreDe(p)} activo={false} onPress={() => agregar(p)} />
            ))}
          </ScrollView>
        ) : (
          <Text style={[s.textoFilaSec, { marginTop: 6 }]}>No hay otros Guías Supervisores activos en la red.</Text>
        )
      ) : (
        <Pressable onPress={() => setEligiendo(true)} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>+ Agregar segundo supervisor</Text>
        </Pressable>
      )}
    </View>
  );
}
