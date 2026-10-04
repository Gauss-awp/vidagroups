import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import type { Moneda, Perfil } from '@/lib/types';
import { formatoFecha, formatoMoneda, hoyISO, sumarDias } from '@/lib/utils';
import { BarraProgreso, Boton, Card, Cargando, Pantalla, PasosConsolidacion, SeccionTitulo, TituloGrande, Vacio, s } from '@/components/ui';
import { GraficoHabitos, TarjetaGrafico } from '@/components/Graficos';
import { AlertasFaltas } from '@/components/asistencia/AlertasFaltas';
import { BotonReporte } from '@/components/reporte/BotonReporte';

interface GrupoPanel {
  id: string;
  nombre: string;
  guia: string | null;
  guia_telefono: string | null;
  es_mio: boolean;
  miembros: number;
  nuevos: number;
  ultima_reunion: string | null;
  asistencia: number | null;
  asistencia_anterior: number | null;
  alertas: number;
  sin_empezar: number;
  evento: { id: string; nombre: string; moneda: Moneda; costo: number; recaudado: number } | null;
}
interface DatosSupervisor {
  grupos: GrupoPanel[];
  cumples: { id: string; nombre: string; grupo: string; dia: string }[];
  tarjetas: Record<string, any>[];
}

const abrirWhatsApp = (tel: string, texto?: string) => {
  let n = tel.replace(/[^0-9]/g, '');
  if (!n.startsWith('54')) n = `549${n.replace(/^0/, '')}`;
  Linking.openURL(`https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`);
};

/** Panel del Guía Supervisor: a qué guía acompañar esta semana. */
export function PanelGuiaSupervisor({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosSupervisor | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('panel_supervisor');
    if (error) {
      Alert.alert('No se pudo cargar el panel', error.message);
      return;
    }
    setDatos(data as DatosSupervisor);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefreshKey((k) => k + 1);
    setRefrescando(false);
  };

  if (!datos) return <Cargando texto="Preparando tu panel..." />;

  const limite = sumarDias(hoyISO(), -14);
  const sinReunion = datos.grupos.filter((g) => g.miembros > 0 && (!g.ultima_reunion || g.ultima_reunion < limite));
  const sinEmpezar = datos.grupos.reduce((a, g) => a + g.sin_empezar, 0);
  const miembros = datos.grupos.reduce((a, g) => a + g.miembros, 0);

  const compartir = async () => {
    const lineas = [
      `📋 Resumen de la semana · ${perfil.nombre || 'Supervisión'}`,
      '',
      ...datos.grupos.map(
        (g) =>
          `• ${g.nombre}${g.guia ? ` (${g.guia})` : ''}: asistencia ${g.asistencia ?? '—'}%` +
          (g.ultima_reunion ? ` · última reunión ${formatoFecha(g.ultima_reunion)}` : ' · sin reuniones registradas')
      ),
      '',
      datos.cumples.length ? `🎂 Cumpleaños: ${datos.cumples.map((c) => `${c.nombre} (${c.dia})`).join(', ')}` : '',
    ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== ''));
    try {
      await Share.share({ message: lineas.join('\n') });
    } catch {
      // cancelado
    }
  };

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.textSec} />}
      >
        <TituloGrande titulo="Mis Guías ✓" subtitulo={`Hola, ${perfil.nombre || 'Supervisor'}`} />

        {datos.grupos.length === 0 ? (
          <Card>
            <Vacio
              icono="people-circle-outline"
              titulo="Todavía no tenés guías a cargo"
              texto="El encargado de tu red te los asigna desde Mi Red."
            />
          </Card>
        ) : (
          <>
            {/* ---------- Atención ---------- */}
            <AlertasFaltas refreshKey={refreshKey} />

            {sinReunion.length > 0 || sinEmpezar > 0 ? (
              <Card style={{ paddingVertical: 4 }}>
                {sinReunion.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push({ pathname: '/grupo/[id]', params: { id: g.id } })}
                    style={s.filaLista}
                  >
                    <Ionicons name="pause-circle" size={22} color={colors.warning} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                        {g.nombre} no registra reunión {g.ultima_reunion ? `desde el ${formatoFecha(g.ultima_reunion)}` : 'todavía'}
                      </Text>
                      {g.guia ? <Text style={s.textoFilaSec}>Guía: {g.guia}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTer} />
                  </Pressable>
                ))}
                {sinEmpezar > 0 ? (
                  <View style={[s.filaLista, { borderBottomWidth: 0 }]}>
                    <Ionicons name="person-add" size={22} color={colors.primary} style={{ marginRight: 10 }} />
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>
                      {sinEmpezar} {sinEmpezar === 1 ? 'persona nueva derivada todavía no empezó' : 'personas nuevas derivadas todavía no empezaron'} el grupo
                    </Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {datos.cumples.length > 0 ? (
              <Card style={{ backgroundColor: colors.primaryBg }}>
                <View style={[s.fila, { marginBottom: 6 }]}>
                  <Ionicons name="gift-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>Cumplen esta semana</Text>
                </View>
                {datos.cumples.map((c) => (
                  <Text key={c.id} style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>
                    {c.dia} · {c.nombre} <Text style={{ color: colors.textSec }}>({c.grupo})</Text>
                  </Text>
                ))}
              </Card>
            ) : null}

            {/* ---------- Grupos ---------- */}
            <SeccionTitulo titulo={`Tus grupos (${datos.grupos.length}) · ${miembros} miembros`} />
            {datos.grupos.map((g) => {
              const dif = g.asistencia !== null && g.asistencia_anterior !== null ? g.asistencia - g.asistencia_anterior : null;
              const meta = g.evento ? Number(g.evento.costo) * g.miembros : 0;
              return (
                <Card key={g.id}>
                  <View style={s.fila}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{g.nombre}</Text>
                      <Text style={s.textoFilaSec}>{g.es_mio ? 'Tu grupo' : g.guia ? `Guía: ${g.guia}` : 'Sin guía'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 22, fontWeight: '800', color: g.asistencia === null ? colors.textTer : colorPorcentaje(g.asistencia) }}>
                        {g.asistencia === null ? '—' : `${g.asistencia}%`}
                      </Text>
                      {dif !== null ? (
                        <View style={s.fila}>
                          <Ionicons name={dif >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={dif >= 0 ? colors.success : colors.danger} />
                          <Text style={{ fontSize: 11, color: dif >= 0 ? colors.success : colors.danger }}>{Math.abs(dif)} vs mes ant.</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, color: colors.textSec }}>asistencia del mes</Text>
                      )}
                    </View>
                  </View>

                  <Text style={[s.textoFilaSec, { marginTop: 8 }]}>
                    {g.miembros} miembros{g.nuevos ? ` · ${g.nuevos} nuevos` : ''} · última reunión{' '}
                    {g.ultima_reunion ? formatoFecha(g.ultima_reunion) : 'sin registrar'}
                    {g.alertas ? ` · ${g.alertas} con faltas` : ''}
                  </Text>

                  {g.evento ? (
                    <View style={{ marginTop: 10 }}>
                      <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 4 }]}>
                        <Text style={{ fontSize: 12, color: colors.textSec }}>{g.evento.nombre}</Text>
                        <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700' }}>
                          {formatoMoneda(Number(g.evento.recaudado), g.evento.moneda)} de {formatoMoneda(meta, g.evento.moneda)}
                        </Text>
                      </View>
                      <BarraProgreso valor={meta ? Number(g.evento.recaudado) / meta : 0} color={colors.success} />
                    </View>
                  ) : null}

                  <View style={[s.fila, { gap: 8, marginTop: 12 }]}>
                    <Boton
                      compacto
                      variante="secundario"
                      titulo="Abrir grupo"
                      icono="open-outline"
                      onPress={() => router.push({ pathname: '/grupo/[id]', params: { id: g.id } })}
                      style={{ flex: 1 }}
                    />
                    {!g.es_mio && g.guia_telefono ? (
                      <Boton
                        compacto
                        variante="secundario"
                        titulo="WhatsApp"
                        icono="logo-whatsapp"
                        onPress={() => abrirWhatsApp(g.guia_telefono!, `Hola ${g.guia?.split(' ')[0] ?? ''}! ¿Cómo viene el grupo esta semana?`)}
                        style={{ flex: 1 }}
                      />
                    ) : null}
                  </View>
                </Card>
              );
            })}

            {datos.grupos.length > 1 ? (
              <TarjetaGrafico titulo="Asistencia del mes por grupo">
                <GraficoHabitos etiquetas={datos.grupos.map((g) => g.nombre)} valores={datos.grupos.map((g) => g.asistencia ?? 0)} />
              </TarjetaGrafico>
            ) : null}

            {/* ---------- Consolidación ---------- */}
            {datos.tarjetas.length > 0 ? (
              <>
                <SeccionTitulo titulo="Personas nuevas en tus grupos" />
                {datos.tarjetas.map((t) => (
                  <Card key={t.id}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{t.nombre}</Text>
                    <Text style={s.textoFilaSec}>{t.gv_asignado}</Text>
                    <PasosConsolidacion tarjeta={t} />
                  </Card>
                ))}
              </>
            ) : null}

            <View style={{ marginTop: 16 }}>
              <Boton titulo="Compartir resumen de la semana" icono="logo-whatsapp" onPress={compartir} style={{ marginBottom: 10 }} />
              <BotonReporte />
            </View>
          </>
        )}
      </ScrollView>
    </Pantalla>
  );
}
