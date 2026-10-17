import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import { MESES, formatoFecha } from '@/lib/utils';
import { Boton, Card, Cargando, SeccionTitulo, Vacio, s } from '@/components/ui';

interface Resumen {
  anio: number;
  reuniones: number;
  asistencia: number | null;
  mejor_mes: { mes: number; asistencia: number } | null;
  record: { presentes: number; fecha: string } | null;
  meses: { mes: number; reuniones: number; asistencia: number | null }[];
  nuevos: number;
  consolidados: number;
  c_cargadas: number;
  miembros: number;
  constantes: { nombre: string; vino: number; total: number }[];
}

/** Resumen del año de un grupo: para cerrar el año con los guías y compartirlo. */
export default function ResumenAnual() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [nombre, setNombre] = useState('');
  const [r, setR] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) return;
    setCargando(true);
    Promise.all([
      supabase.from('groups').select('nombre').eq('id', id).maybeSingle(),
      supabase.rpc('resumen_anual_grupo', { p_grupo: id, p_anio: anio }),
    ]).then(([g, res]) => {
      setNombre((g.data as { nombre: string } | null)?.nombre ?? '');
      setR((res.data as Resumen) ?? null);
      setCargando(false);
    });
  }, [id, anio]);

  if (!id) return <Vacio icono="alert-circle-outline" titulo="Grupo no encontrado" />;

  const dato = (icono: React.ComponentProps<typeof Ionicons>['name'], valor: string, texto: string, color: string = colors.primary) => (
    <View style={{ width: '48%', backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: colors.border, marginBottom: 10 }}>
      <Ionicons name={icono} size={20} color={color} />
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 6 }}>{valor}</Text>
      <Text style={s.textoFilaSec}>{texto}</Text>
    </View>
  );

  const compartir = async () => {
    if (!r) return;
    const lineas = [
      `🎉 ${nombre} · Resumen ${r.anio}`,
      '',
      `📅 ${r.reuniones} reuniones`,
      r.asistencia !== null ? `⭐ ${r.asistencia}% de asistencia promedio` : null,
      r.mejor_mes ? `📈 Mejor mes: ${MESES[r.mejor_mes.mes - 1]} (${r.mejor_mes.asistencia}%)` : null,
      r.record ? `🏆 Récord: ${r.record.presentes} personas el ${formatoFecha(r.record.fecha)}` : null,
      r.nuevos ? `🌱 ${r.nuevos} hermanos nuevos` : null,
      r.consolidados ? `✅ ${r.consolidados} consolidaciones completadas` : null,
      r.constantes.length ? `💪 Los más constantes: ${r.constantes.slice(0, 3).map((c) => c.nombre.split(' ')[0]).join(', ')}` : null,
      '',
      '¡Gracias a todos por este año! 🙌',
    ].filter((x) => x !== null);
    try {
      await Share.share({ message: lineas.join('\n') });
    } catch {
      // cancelado
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Resumen del año' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={[s.fila, { justifyContent: 'center', marginBottom: 6 }]}>
          <Pressable onPress={() => setAnio(anio - 1)} hitSlop={12} accessibilityLabel="Año anterior">
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', marginHorizontal: 20 }}>{anio}</Text>
          <Pressable onPress={() => setAnio(anio + 1)} hitSlop={12} accessibilityLabel="Año siguiente">
            <Ionicons name="chevron-forward" size={24} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={{ color: colors.textSec, textAlign: 'center', marginBottom: 16 }}>{nombre}</Text>

        {cargando ? (
          <Cargando />
        ) : !r || r.reuniones === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>No hay reuniones cargadas en {anio}.</Text>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {dato('calendar', String(r.reuniones), 'reuniones')}
              {dato('stats-chart', r.asistencia !== null ? `${r.asistencia}%` : '—', 'asistencia promedio', r.asistencia !== null ? colorPorcentaje(r.asistencia) : colors.textSec)}
              {dato('leaf', String(r.nuevos), 'hermanos nuevos', colors.success)}
              {dato('checkmark-done-circle', String(r.consolidados), 'consolidaciones completadas', colors.success)}
              {dato('chatbubbles', String(r.c_cargadas), 'ausentes consolidados (C)', colors.teal)}
            </View>

            {r.record || r.mejor_mes ? (
              <Card>
                {r.record ? (
                  <View style={[s.fila, { marginBottom: r.mejor_mes ? 8 : 0 }]}>
                    <Ionicons name="trophy" size={18} color={colors.warning} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.text, flex: 1 }}>
                      Récord: <Text style={{ fontWeight: '800' }}>{r.record.presentes} personas</Text> el {formatoFecha(r.record.fecha)}
                    </Text>
                  </View>
                ) : null}
                {r.mejor_mes ? (
                  <View style={s.fila}>
                    <Ionicons name="trending-up" size={18} color={colors.success} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.text, flex: 1 }}>
                      Mejor mes: <Text style={{ fontWeight: '800' }}>{MESES[r.mejor_mes.mes - 1]}</Text>, con {r.mejor_mes.asistencia}% de asistencia
                    </Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            <SeccionTitulo titulo="Mes a mes" />
            <Card>
              {r.meses.map((m) => (
                <View key={m.mes} style={[s.fila, { marginBottom: 8 }]}>
                  <Text style={{ color: colors.text, width: 42, fontSize: 13 }}>{MESES[m.mes - 1].slice(0, 3)}</Text>
                  <View style={{ flex: 1, height: 10, backgroundColor: colors.cardAlt, borderRadius: 5, overflow: 'hidden', marginHorizontal: 8 }}>
                    <View
                      style={{
                        width: `${m.asistencia ?? 0}%`,
                        height: '100%',
                        borderRadius: 5,
                        backgroundColor: m.asistencia !== null ? colorPorcentaje(m.asistencia) : colors.border,
                      }}
                    />
                  </View>
                  <Text style={{ color: colors.textSec, width: 74, textAlign: 'right', fontSize: 12 }}>
                    {m.asistencia !== null ? `${m.asistencia}%` : '—'} · {m.reuniones} reun.
                  </Text>
                </View>
              ))}
            </Card>

            {r.constantes.length ? (
              <>
                <SeccionTitulo titulo="Los más constantes" />
                <Card>
                  {r.constantes.map((c, i) => (
                    <View key={c.nombre} style={[s.fila, { marginBottom: 6 }]}>
                      <Text style={{ color: colors.warning, fontWeight: '800', width: 22 }}>{i + 1}</Text>
                      <Text style={{ color: colors.text, flex: 1 }}>{c.nombre}</Text>
                      <Text style={{ color: colors.textSec, fontSize: 13 }}>
                        vino a {c.vino} de {c.total}
                      </Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            <Boton titulo="Compartir el resumen" icono="share-social-outline" onPress={compartir} style={{ marginTop: 16 }} />
          </>
        )}
      </ScrollView>
    </>
  );
}
