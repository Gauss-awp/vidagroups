import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import { MESES } from '@/lib/utils';
import { Boton, Card, Cargando, Chip, Stat, Vacio, s } from '@/components/ui';

interface FilaReporte {
  grupo_id: string;
  grupo: string;
  red_id: string | null;
  red: string | null;
  guia: string | null;
  miembros: number;
  nuevos: number;
  reuniones: number;
  asistencia_pct: number | null;
  habitos_pct: number | null;
  tarjetas_nuevas: number;
  completadas: number;
}

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

function promedio(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** Reporte mensual: cada rol ve los grupos que tiene a cargo. */
export default function Reporte() {
  const hoy = new Date();
  const [mes, setMes] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [red, setRed] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('reporte_mensual', { p_anio: mes.anio, p_mes: mes.mes + 1 });
    if (error) Alert.alert('No se pudo cargar el reporte', error.message);
    setFilas((data ?? []) as FilaReporte[]);
    setCargando(false);
  }, [mes]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [cargar]);

  const redes = useMemo(() => {
    const mapa = new Map<string, string>();
    filas.forEach((f) => f.red_id && mapa.set(f.red_id, f.red ?? 'Sin nombre'));
    return [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [filas]);

  const visibles = red ? filas.filter((f) => f.red_id === red) : filas;
  const nombreMes = `${MESES[mes.mes]} ${mes.anio}`;

  const total = {
    grupos: visibles.length,
    miembros: visibles.reduce((a, f) => a + f.miembros, 0),
    nuevos: visibles.reduce((a, f) => a + f.nuevos, 0),
    reuniones: visibles.reduce((a, f) => a + f.reuniones, 0),
    asistencia: promedio(visibles.map((f) => f.asistencia_pct)),
    habitos: promedio(visibles.map((f) => f.habitos_pct)),
    tarjetas: visibles.reduce((a, f) => a + f.tarjetas_nuevas, 0),
    completadas: visibles.reduce((a, f) => a + f.completadas, 0),
  };

  const moverMes = (delta: number) =>
    setMes((p) => {
      const d = new Date(p.anio, p.mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });

  const compartir = async () => {
    const titulo = red ? redes.find((r) => r.id === red)?.nombre : null;
    const lineas = [
      `📊 Reporte de ${nombreMes}${titulo ? ` · ${titulo}` : ''}`,
      `Grupos: ${total.grupos} · Miembros: ${total.miembros} (${total.nuevos} nuevos)`,
      `Reuniones: ${total.reuniones} · Asistencia promedio: ${pct(total.asistencia)}`,
      `Hábitos: ${pct(total.habitos)}`,
      `Consolidación: ${total.tarjetas} tarjetas nuevas · ${total.completadas} completadas`,
      '',
      ...visibles.map(
        (f) =>
          `• ${f.grupo}${f.guia ? ` (${f.guia})` : ''}: ${f.miembros} miembros, ${f.reuniones} reuniones, asistencia ${pct(f.asistencia_pct)}, hábitos ${pct(f.habitos_pct)}`
      ),
    ];
    try {
      await Share.share({ message: lineas.join('\n') });
    } catch {
      // el usuario canceló
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Reporte mensual' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await cargar();
              setRefrescando(false);
            }}
            tintColor={colors.textSec}
          />
        }
      >
        <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 12 }]}>
          <Pressable onPress={() => moverMes(-1)} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{nombreMes}</Text>
          <Pressable onPress={() => moverMes(1)} hitSlop={10}>
            <Ionicons name="chevron-forward" size={24} color={colors.primary} />
          </Pressable>
        </View>

        {redes.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <Chip texto="Todas" activo={red === null} onPress={() => setRed(null)} />
            {redes.map((r) => (
              <Chip key={r.id} texto={r.nombre} activo={red === r.id} onPress={() => setRed(r.id)} />
            ))}
          </ScrollView>
        ) : null}

        {cargando ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Card>
            <Vacio icono="document-text-outline" titulo="Sin grupos para mostrar" texto="El reporte muestra los grupos que tenés a cargo." />
          </Card>
        ) : (
          <>
            <View style={[s.fila, { gap: 10, marginBottom: 10 }]}>
              <Stat etiqueta="Miembros" valor={String(total.miembros)} icono="people" color={colors.primary} />
              <Stat etiqueta="Nuevos" valor={String(total.nuevos)} icono="person-add" color={colors.success} />
            </View>
            <View style={[s.fila, { gap: 10, marginBottom: 10 }]}>
              <Stat
                etiqueta="Asistencia"
                valor={pct(total.asistencia)}
                icono="calendar"
                color={total.asistencia === null ? colors.textSec : colorPorcentaje(total.asistencia)}
              />
              <Stat
                etiqueta="Hábitos"
                valor={pct(total.habitos)}
                icono="checkmark-done"
                color={total.habitos === null ? colors.textSec : colorPorcentaje(total.habitos)}
              />
            </View>
            <Card>
              <Text style={s.textoFilaSec}>Consolidación del mes</Text>
              <Text style={[s.textoFila, { marginTop: 4 }]}>
                {total.tarjetas} tarjetas nuevas · {total.completadas} completadas
              </Text>
              <Text style={[s.textoFilaSec, { marginTop: 4 }]}>
                {total.reuniones} reuniones en {total.grupos} {total.grupos === 1 ? 'grupo' : 'grupos'}
              </Text>
            </Card>

            <Boton titulo="Compartir reporte" icono="share-outline" onPress={compartir} style={{ marginVertical: 8 }} />

            {visibles.map((f) => (
              <Card key={f.grupo_id}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{f.grupo}</Text>
                <Text style={s.textoFilaSec}>
                  {f.guia ? `Guía: ${f.guia}` : 'Sin guía'}
                  {!red && redes.length > 1 && f.red ? ` · ${f.red}` : ''}
                </Text>
                <View style={[s.fila, { justifyContent: 'space-between', marginTop: 12 }]}>
                  <Dato etiqueta="Miembros" valor={`${f.miembros}${f.nuevos ? ` (+${f.nuevos})` : ''}`} />
                  <Dato etiqueta="Reuniones" valor={String(f.reuniones)} />
                  <Dato etiqueta="Asistencia" valor={pct(f.asistencia_pct)} color={f.asistencia_pct === null ? undefined : colorPorcentaje(f.asistencia_pct)} />
                  <Dato etiqueta="Hábitos" valor={pct(f.habitos_pct)} color={f.habitos_pct === null ? undefined : colorPorcentaje(f.habitos_pct)} />
                </View>
                {f.tarjetas_nuevas || f.completadas ? (
                  <Text style={[s.textoFilaSec, { marginTop: 10 }]}>
                    Consolidación: {f.tarjetas_nuevas} nuevas · {f.completadas} completadas
                  </Text>
                ) : null}
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: color ?? colors.text, fontSize: 17, fontWeight: '800' }}>{valor}</Text>
      <Text style={{ color: colors.textSec, fontSize: 11, marginTop: 2 }}>{etiqueta}</Text>
    </View>
  );
}
