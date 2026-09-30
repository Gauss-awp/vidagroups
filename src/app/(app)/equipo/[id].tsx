import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil } from '@/lib/types';
import { ROL_LABEL, nombreCompleto } from '@/lib/utils';
import { Avatar, Badge, Card, Cargando, SeccionTitulo, Vacio, s } from '@/components/ui';
import { EquipoLista } from '@/components/EquipoLista';

export default function EquipoPantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lider, setLider] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refrescando, setRefrescando] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) setError(err?.message ?? 'No tenés acceso a esta persona.');
        else setLider(data as Perfil);
      });
  }, [id, refreshKey]);

  if (!id || error) return <Vacio icono="lock-closed-outline" titulo="No se pudo abrir el equipo" texto={error ?? ''} />;
  if (!lider) return <Cargando />;

  const tituloLista =
    lider.rol === 'supervisor' ? 'Guías a cargo' : lider.rol === 'pastor' ? 'Supervisores a cargo' : 'Personas a cargo';

  return (
    <>
      <Stack.Screen options={{ title: nombreCompleto(lider) }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => {
              setRefrescando(true);
              setRefreshKey((k) => k + 1);
              setTimeout(() => setRefrescando(false), 700);
            }}
            tintColor={colors.textSec}
          />
        }
      >
        <Card>
          <View style={s.fila}>
            <Avatar nombre={nombreCompleto(lider)} color={ROL_COLOR[lider.rol]} tamano={52} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>{nombreCompleto(lider)}</Text>
              <Text style={s.textoFilaSec}>{lider.email}</Text>
            </View>
            <Badge texto={ROL_LABEL[lider.rol]} color={ROL_COLOR[lider.rol]} />
          </View>
        </Card>

        <SeccionTitulo titulo={tituloLista} />
        <EquipoLista liderId={lider.id} refreshKey={refreshKey} textoVacio="Todavía no tiene personas a cargo" />
      </ScrollView>
    </>
  );
}
