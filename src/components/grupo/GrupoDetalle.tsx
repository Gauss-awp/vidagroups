import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Grupo, Perfil } from '@/lib/types';
import { nombreCompleto } from '@/lib/utils';
import { Card, Cargando, Vacio, s, HojaModal, Campo, Boton } from '@/components/ui';
import { HabitosTab } from './HabitosTab';
import { EventosTab } from './EventosTab';
import { MiembrosTab } from './MiembrosTab';
import { ConsolidacionGuia } from '../mision_joven/ConsolidacionGuia';
import { AsistenciaTab } from '../asistencia/AsistenciaTab';
import { AlertasFaltas } from '../asistencia/AlertasFaltas';
import { CumplesSemana } from '../asistencia/CumplesSemana';
import { Notas } from '../notas/Notas';
import { HistorialLiderazgo } from '../notas/HistorialLiderazgo';
import { useAuth } from '@/context/AuthContext';
import { formatoFecha } from '@/lib/utils';

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
  const { perfil } = useAuth();
  const [puedeNotas, setPuedeNotas] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [datosGrupo, setDatosGrupo] = useState({ dia_horario: '', barrio: '', direccion: '', lider_supervisor: '' });
  const [guardandoGrupo, setGuardandoGrupo] = useState(false);
  const [traspaso, setTraspaso] = useState<{ anterior: string; fecha: string } | null>(null);
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

    // Notas: solo guía y Guía Supervisor del grupo
    const { data: permiso } = await supabase.rpc('puede_ver_notas', { p_grupo: g.id });
    setPuedeNotas(!!permiso);

    // Aviso de traspaso: si recibiste el grupo en los últimos 60 días
    if (perfil && g.guia_id === perfil.id) {
      const { data: hist } = await supabase
        .from('historial_liderazgo')
        .select('nombre, desde, hasta, perfil_id')
        .eq('grupo_id', g.id)
        .eq('rol', 'guia')
        .order('desde', { ascending: false })
        .limit(2);
      const [actual, previo] = (hist ?? []) as { nombre: string; desde: string; hasta: string | null; perfil_id: string | null }[];
      const reciente = actual && Date.now() - new Date(actual.desde).getTime() < 60 * 86400000;
      setTraspaso(reciente && previo && previo.perfil_id !== perfil.id ? { anterior: previo.nombre, fecha: actual.desde.slice(0, 10) } : null);
    } else {
      setTraspaso(null);
    }
  }, [grupoId, perfil]);

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
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <Pressable onPress={() => setVerHistorial(true)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Historial de guías</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const g = grupo as any;
                  setDatosGrupo({
                    dia_horario: g.dia_horario ?? '',
                    barrio: g.barrio ?? '',
                    direccion: g.direccion ?? '',
                    lider_supervisor: g.lider_supervisor ?? '',
                  });
                  setEditandoDatos(true);
                }}
                hitSlop={8}
              >
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Datos del grupo</Text>
              </Pressable>
            </View>
          </View>
        </View>
        {(grupo as any).dia_horario || (grupo as any).barrio || (grupo as any).direccion ? (
          <Text style={{ color: colors.textSec, fontSize: 14, marginTop: 12, lineHeight: 20 }}>
            {[(grupo as any).dia_horario, (grupo as any).barrio, (grupo as any).direccion].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {grupo.descripcion? (
          <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 12, lineHeight: 21 }}>{grupo.descripcion}</Text>
        ) : null}
      </Card>

      {traspaso ? (
        <Card onPress={puedeNotas ? () => setTab(5) : undefined} style={{ backgroundColor: colors.primaryBg, marginTop: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>Recibiste este grupo el {formatoFecha(traspaso.fecha)}</Text>
          <Text style={{ color: colors.text, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
            Antes lo guiaba {traspaso.anterior}. Tocá acá para leer las notas que dejó sobre el grupo y cada hermano.
          </Text>
        </Card>
      ) : null}

      <View style={{ marginTop: 12 }}>
        <AlertasFaltas grupoId={grupo.id} refreshKey={refreshKey} />
        <CumplesSemana grupoId={grupo.id} refreshKey={refreshKey} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
        {(puedeNotas ? [...TABS, { id: 5, label: 'Notas' }] : TABS).map(t => {
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
                backgroundColor: activo? colors.primary : colors.cardAlt,
              }}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{
                paddingHorizontal: 4,
                fontSize: 12,
                fontWeight: activo? '700' : '600',
                color: activo? 'white' : colors.textSec,
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
      {tab === 5 && puedeNotas ? <Notas grupoId={grupo.id} refreshKey={refreshKey} /> : null}

      <HistorialLiderazgo grupoId={grupo.id} visible={verHistorial} onClose={() => setVerHistorial(false)} />

      <HojaModal visible={editandoDatos} onClose={() => setEditandoDatos(false)} titulo="Datos del grupo">
        <Text style={[s.textoFilaSec, { marginBottom: 12 }]}>Aparecen en el encabezado de la planilla mensual de asistencia.</Text>
        <Campo etiqueta="Día y horario" placeholder="Viernes 21:00 hs" value={datosGrupo.dia_horario} onChangeText={(v) => setDatosGrupo({ ...datosGrupo, dia_horario: v })} />
        <Campo etiqueta="Barrio" placeholder="Villa del Río" value={datosGrupo.barrio} onChangeText={(v) => setDatosGrupo({ ...datosGrupo, barrio: v })} />
        <Campo etiqueta="Dirección" placeholder="Cruz Palacios 109" value={datosGrupo.direccion} onChangeText={(v) => setDatosGrupo({ ...datosGrupo, direccion: v })} />
        <Campo
          etiqueta="Líder supervisor (como figura en la planilla)"
          placeholder="Flor y Samu"
          value={datosGrupo.lider_supervisor}
          onChangeText={(v) => setDatosGrupo({ ...datosGrupo, lider_supervisor: v })}
          ayuda="Si lo dejás vacío, se usa el nombre del Guía Supervisor asignado."
        />
        <Boton
          titulo="Guardar"
          cargando={guardandoGrupo}
          onPress={async () => {
            setGuardandoGrupo(true);
            const cambios = Object.fromEntries(Object.entries(datosGrupo).map(([k, v]) => [k, v.trim() || null]));
            const { error } = await supabase.from('groups').update(cambios).eq('id', grupo.id);
            setGuardandoGrupo(false);
            if (error) {
              Alert.alert('No se pudo guardar', error.message);
              return;
            }
            setEditandoDatos(false);
            cargar();
          }}
        />
      </HojaModal>
    </ScrollView>
  );
}