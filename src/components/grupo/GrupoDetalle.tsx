import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Grupo, Perfil } from '@/lib/types';
import { nombreCompleto } from '@/lib/utils';
import { Card, Cargando, Vacio, s } from '@/components/ui';
import { HabitosTab } from './HabitosTab';
import { EventosTab } from './EventosTab';
import { MiembrosTab } from './MiembrosTab';
import { ConsolidacionGuia } from '../mision_joven/ConsolidacionGuia';
import { AsistenciaTab } from '../asistencia/AsistenciaTab';
import { AlertasFaltas } from '../asistencia/AlertasFaltas';

// Acortamos el label largo para que entre bien
const TABS = [
  { id: 4, label: 'Asistencia' },
  { id: 0, label: 'Hábitos' },
  { id: 1, label: 'Eventos' },
  { id: 2, label: 'Miembros' },
  { id: 3, label: 'Consolidación' },
];

export function GrupoDetalle({
  grupoId,
  encabezado,
  onCargado,
}: {
  grupoId: string;
  encabezado?: React.ReactNode;
  onCargado?: (grupo: Grupo) => void;
}) {
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [guia, setGuia] = useState<Perfil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(4);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const onCargadoRef = useRef(onCargado);
  onCargadoRef.current = onCargado;

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('groups').select('*').eq('id', grupoId).maybeSingle();
    if (err ||!data) {
      setError(err?.message?? 'No tenés acceso a este grupo o ya no existe.');
      return;
    }
    const g = data as Grupo;
    setError(null);
    setGrupo(g);
    onCargadoRef.current?.(g);
    const { data: p } = await supabase.from('profiles').select('*').eq('id', g.guia_id).maybeSingle();
    setGuia((p as Perfil | null)?? null);
  }, [grupoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefreshKey((k) => k + 1);
    setRefrescando(false);
  };

  if (error) {
    return <Vacio icono="lock-closed-outline" titulo="No se pudo abrir el grupo" texto={error} />;
  }
  if (!grupo) return <Cargando />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.textSec} />}
    >
      {encabezado}
      <Card>
        <View style={s.fila}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: 'rgba(48,209,88,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="people" size={24} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{grupo.nombre}</Text>
            <Text style={s.textoFilaSec}>Guía: {guia? nombreCompleto(guia) : '—'}</Text>
          </View>
        </View>
        {grupo.descripcion? (
          <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 12, lineHeight: 21 }}>{grupo.descripcion}</Text>
        ) : null}
      </Card>

      <View style={{ marginTop: 12 }}>
        <AlertasFaltas grupoId={grupo.id} refreshKey={refreshKey} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
        {TABS.map(t => {
          const activo = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                height: 38,
                paddingHorizontal: 14,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: activo? '#111827' : '#E5E7EB',
              }}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{
                paddingHorizontal: 4,
                fontSize: 12,
                fontWeight: activo? '700' : '600',
                color: activo? 'white' : '#6B7280',
              }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 4 ? <AsistenciaTab grupoId={grupo.id} refreshKey={refreshKey} /> : null}
      {tab === 0? <HabitosTab grupoId={grupo.id} refreshKey={refreshKey} /> : null}
      {tab === 1? <EventosTab grupoId={grupo.id} refreshKey={refreshKey} /> : null}
      {tab === 2? <MiembrosTab grupoId={grupo.id} grupoNombre={grupo.nombre} refreshKey={refreshKey} /> : null}
      {tab === 3? <ConsolidacionGuia miGV={grupo.nombre} grupoId={grupo.id} /> : null}
    </ScrollView>
  );
}