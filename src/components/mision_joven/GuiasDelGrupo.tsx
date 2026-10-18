import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { Chip, s } from '@/components/ui';

interface PerfilLite {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string;
}
const nombreDe = (p: PerfilLite) => `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || p.email;

/** Guías de un grupo: el principal y los que lo acompañan (co-guías). */
export function GuiasDelGrupo({ grupoId, redId, principalId }: { grupoId: string; redId: string; principalId: string }) {
  const [coguias, setCoguias] = useState<PerfilLite[]>([]);
  const [candidatos, setCandidatos] = useState<PerfilLite[]>([]);
  const [eligiendo, setEligiendo] = useState(false);

  const cargar = useCallback(async () => {
    const [cg, cand] = await Promise.all([
      supabase.from('grupo_guias').select('guia_id').eq('grupo_id', grupoId),
      supabase
        .from('profiles')
        .select('id, nombre, apellido, email')
        .eq('red_id', redId)
        .eq('estado', 'activo')
        .in('rol', ['guia', 'guia_supervisor'])
        .order('nombre'),
    ]);
    const ids = ((cg.data ?? []) as { guia_id: string }[]).map((x) => x.guia_id);
    const lista = (cand.data ?? []) as PerfilLite[];
    setCoguias(lista.filter((p) => ids.includes(p.id)));
    setCandidatos(lista.filter((p) => p.id !== principalId && !ids.includes(p.id)));
  }, [grupoId, redId, principalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregar = async (p: PerfilLite) => {
    const { error } = await supabase.from('grupo_guias').insert({ grupo_id: grupoId, guia_id: p.id });
    if (error) {
      alerta('No se pudo agregar', error.message);
      return;
    }
    setEligiendo(false);
    cargar();
  };

  const quitar = (p: PerfilLite) =>
    alerta('Quitar guía', `¿Quitar a ${nombreDe(p)} como segundo guía de este grupo?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('grupo_guias').delete().eq('grupo_id', grupoId).eq('guia_id', p.id);
          if (error) alerta('No se pudo quitar', error.message);
          else cargar();
        },
      },
    ]);

  return (
    <View style={{ backgroundColor: colors.cardAlt, borderRadius: 10, padding: 10 }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>Segundo guía</Text>
      {coguias.length === 0 ? <Text style={[s.textoFilaSec, { fontSize: 13 }]}>Este grupo tiene un solo guía.</Text> : null}
      {coguias.map((p) => (
        <View key={p.id} style={[s.fila, { marginTop: 4 }]}>
          <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{nombreDe(p)}</Text>
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
          <Text style={[s.textoFilaSec, { marginTop: 6 }]}>No hay otros guías activos en la red. Primero tiene que registrarse y ser aprobado.</Text>
        )
      ) : (
        <Pressable onPress={() => setEligiendo(true)} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>+ Agregar segundo guía</Text>
        </Pressable>
      )}
    </View>
  );
}
