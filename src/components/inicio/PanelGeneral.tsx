import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import type { Moneda, Perfil } from '@/lib/types';
import { ROL_LABEL, formatoFecha, formatoMoneda } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { BarraProgreso, Boton, Card, Cargando, Pantalla, SeccionTitulo, TituloGrande, Vacio, s } from '@/components/ui';
import { GraficoHabitos, TarjetaGrafico } from '@/components/Graficos';
import { FormEvento } from '@/components/eventos/FormEvento';
import { BotonReporte } from '@/components/reporte/BotonReporte';
import { SupervisoresPastoral } from './SupervisoresPastoral';

interface Semana {
  semana: string;
  presentes: number;
  esperados: number;
  reuniones: number;
  pct: number | null;
}
interface GrupoSinReunion {
  id: string;
  nombre: string;
  guia: string | null;
  ultima: string | null;
}
interface GrupoEnBaja {
  id: string;
  nombre: string;
  actual: number;
  anterior: number;
}
interface RedResumen {
  id: string;
  nombre: string;
  grupos: number;
  miembros: number;
  nuevos: number;
  asistencia: number | null;
  completadas: number;
}
interface Proximo {
  id: string;
  nombre: string;
  fecha_evento: string;
  moneda: Moneda;
  costo_total: number;
  recaudado: number;
  personas: number;
}
interface DatosPanel {
  semanas: Semana[];
  sin_reunion: GrupoSinReunion[];
  en_baja: GrupoEnBaja[];
  tarjetas_sin_fonovisita: number;
  pendientes: number;
  alertas_faltas: number;
  redes: RedResumen[];
  proximo_evento: Proximo | null;
  totales: { grupos: number; miembros: number; nuevos_mes: number };
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Panel del Pastor y del Apóstol: qué atender, cómo viene la iglesia y qué viene. */
export function PanelGeneral({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const { redesAdmin } = useAuth();
  const esApostol = perfil.rol === 'apostol';
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalEvento, setModalEvento] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('panel_pastoral');
    if (error) {
      Alert.alert('No se pudo cargar el panel', error.message);
      return;
    }
    setDatos(data as DatosPanel);
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

  const titulo = esApostol ? 'Panel Apostólico' : 'Panel Pastoral';
  const sinRedes = !esApostol && redesAdmin.length === 0;
  const semanas = datos.semanas ?? [];
  const actual = semanas[semanas.length - 1];
  const anterior = semanas[semanas.length - 2];
  const diferencia = actual?.pct !== null && anterior?.pct !== null && actual && anterior ? (actual.pct ?? 0) - (anterior.pct ?? 0) : null;

  const pendientesTotal =
    datos.sin_reunion.length + datos.en_baja.length + datos.tarjetas_sin_fonovisita + datos.pendientes;

  const compartirResumen = async () => {
    const lineas = [
      `📋 Resumen de la semana · ${perfil.nombre || ROL_LABEL[perfil.rol]}`,
      `Asistencia: ${actual?.pct ?? '—'}%${diferencia !== null ? ` (${diferencia >= 0 ? '+' : ''}${diferencia} vs semana anterior)` : ''}`,
      `Reuniones registradas: ${actual?.reuniones ?? 0} de ${datos.totales.grupos} grupos`,
      `Miembros: ${datos.totales.miembros} · Nuevos este mes: ${datos.totales.nuevos_mes}`,
      '',
      ...datos.sin_reunion.map((g) => `⏸️ ${g.nombre}${g.guia ? ` (${g.guia})` : ''}: sin reunión desde ${g.ultima ? formatoFecha(g.ultima) : 'nunca'}`),
      ...datos.en_baja.map((g) => `📉 ${g.nombre}: asistencia ${g.anterior}% → ${g.actual}%`),
      datos.tarjetas_sin_fonovisita ? `📞 ${datos.tarjetas_sin_fonovisita} personas nuevas sin fonovisita hace +3 días` : '',
    ].filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''));
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
        <TituloGrande titulo={titulo} subtitulo={`Hola, ${perfil.nombre || ROL_LABEL[perfil.rol]}`} />

        {sinRedes ? (
          <Card>
            <Vacio
              icono="git-network-outline"
              titulo="Todavía no tenés redes asignadas"
              texto="Cuando el Apóstol te asigne una o más redes, acá vas a ver todo lo que pasa en ellas."
            />
          </Card>
        ) : null}

        {/* ---------- 1. Qué necesita tu atención ---------- */}
        <SeccionTitulo titulo="Requiere tu atención" />
        {pendientesTotal === 0 ? (
          <Card style={{ backgroundColor: colors.successBg }}>
            <View style={s.fila}>
              <Ionicons name="checkmark-circle" size={26} color={colors.success} style={{ marginRight: 10 }} />
              <Text style={{ color: colors.success, fontSize: 16, fontWeight: '700', flex: 1 }}>Todo en orden esta semana</Text>
            </View>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {datos.sin_reunion.map((g) => (
              <ItemAtencion
                key={`sr-${g.id}`}
                icono="pause-circle"
                color={colors.warning}
                texto={`${g.nombre} no registra reunión ${g.ultima ? `desde el ${formatoFecha(g.ultima)}` : 'nunca'}`}
                detalle={g.guia ? `Guía: ${g.guia}` : undefined}
              />
            ))}

            {datos.en_baja.map((g) => (
              <ItemAtencion
                key={`eb-${g.id}`}
                icono="trending-down"
                color={colors.danger}
                texto={`${g.nombre}: la asistencia bajó de ${g.anterior}% a ${g.actual}%`}
                detalle="Últimos 30 días contra los 30 anteriores"
              />
            ))}

            {datos.tarjetas_sin_fonovisita > 0 ? (
              <ItemAtencion
                icono="call"
                color={colors.warning}
                texto={`${datos.tarjetas_sin_fonovisita} ${datos.tarjetas_sin_fonovisita === 1 ? 'persona nueva' : 'personas nuevas'} sin fonovisita hace más de 3 días`}
                onPress={() => router.push('/red')}
              />
            ) : null}

            {datos.pendientes > 0 ? (
              <ItemAtencion
                icono="person-add"
                color={colors.primary}
                texto={`${datos.pendientes} ${datos.pendientes === 1 ? 'cuenta espera' : 'cuentas esperan'} aprobación`}
                onPress={() => router.push('/red')}
              />
            ) : null}
          </Card>
        )}

        {/* ---------- Supervisores: a quién acompañar ---------- */}
        <SupervisoresPastoral refreshKey={refreshKey} />

        {/* ---------- 2. Cómo viene la iglesia ---------- */}
        <SeccionTitulo titulo="Cómo viene" />
        <Card>
          <Text style={s.textoFilaSec}>Asistencia de esta semana</Text>
          <View style={[s.fila, { marginTop: 4 }]}>
            <Text
              style={{
                fontSize: 34,
                fontWeight: '800',
                color: actual?.pct == null ? colors.textSec : colorPorcentaje(actual.pct),
                marginRight: 12,
              }}
            >
              {actual?.pct == null ? '—' : `${actual.pct}%`}
            </Text>
            {diferencia !== null ? (
              <View style={s.fila}>
                <Ionicons
                  name={diferencia >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={18}
                  color={diferencia >= 0 ? colors.success : colors.danger}
                />
                <Text style={{ color: diferencia >= 0 ? colors.success : colors.danger, fontWeight: '700' }}>
                  {Math.abs(diferencia)} puntos vs semana anterior
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[s.textoFilaSec, { marginTop: 6 }]}>
            {actual?.reuniones ?? 0} de {datos.totales.grupos} grupos registraron reunión · {datos.totales.miembros} miembros ·{' '}
            {datos.totales.nuevos_mes} nuevos este mes
          </Text>
        </Card>

        <TarjetaGrafico titulo="Asistencia por semana" subtitulo="Últimas 8 semanas">
          <GraficoHabitos etiquetas={semanas.map((x) => ddmm(x.semana))} valores={semanas.map((x) => x.pct ?? 0)} />
        </TarjetaGrafico>

        {datos.redes.length > 0 ? (
          <>
            <SeccionTitulo titulo={datos.redes.length > 1 ? 'Redes' : 'Tu red'} />
            {datos.redes.map((r) => (
              <Card key={r.id} onPress={() => router.push('/red')}>
                <View style={[s.fila, { justifyContent: 'space-between' }]}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{r.nombre}</Text>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: '800',
                      color: r.asistencia == null ? colors.textSec : colorPorcentaje(r.asistencia),
                    }}
                  >
                    {r.asistencia == null ? '—' : `${r.asistencia}%`}
                  </Text>
                </View>
                <Text style={s.textoFilaSec}>
                  {r.grupos} grupos · {r.miembros} miembros · {r.nuevos} nuevos · {r.completadas} consolidados este mes
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        {/* ---------- 3. Qué viene ---------- */}
        {datos.proximo_evento ? (
          <>
            <SeccionTitulo titulo="Próximo evento" />
            <Card onPress={() => router.push({ pathname: '/evento/[id]', params: { id: datos.proximo_evento!.id } })}>
              {(() => {
                const ev = datos.proximo_evento!;
                const meta = Number(ev.costo_total) * ev.personas;
                const f = (v: number) => formatoMoneda(v, ev.moneda);
                return (
                  <>
                    <View style={s.fila}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{ev.nombre}</Text>
                        <Text style={s.textoFilaSec}>{formatoFecha(ev.fecha_evento)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textTer} />
                    </View>
                    <View style={[s.fila, { justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }]}>
                      <Text style={{ color: colors.success, fontWeight: '700' }}>Recaudado {f(Number(ev.recaudado))}</Text>
                      <Text style={{ color: colors.warning, fontWeight: '700' }}>Falta {f(Math.max(0, meta - Number(ev.recaudado)))}</Text>
                    </View>
                    <BarraProgreso valor={meta ? Number(ev.recaudado) / meta : 0} color={colors.success} alto={8} />
                  </>
                );
              })()}
            </Card>
          </>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <Boton titulo="Compartir resumen de la semana" icono="logo-whatsapp" onPress={compartirResumen} style={{ marginBottom: 10 }} />
          <BotonReporte />
          <Boton
            titulo="Crear evento para toda la iglesia"
            icono="add-circle-outline"
            variante="secundario"
            onPress={() => setModalEvento(true)}
          />
        </View>
      </ScrollView>

      <FormEvento visible={modalEvento} onClose={() => setModalEvento(false)} onGuardado={cargar} alcances={['iglesia']} />
    </Pantalla>
  );
}

function ItemAtencion({
  icono,
  color,
  texto,
  detalle,
  onPress,
  abierto,
}: {
  icono: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  texto: string;
  detalle?: string;
  onPress?: () => void;
  abierto?: boolean;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.filaLista, pressed && onPress ? { opacity: 0.6 } : null]}>
      <Ionicons name={icono} size={22} color={color} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{texto}</Text>
        {detalle ? <Text style={s.textoFilaSec}>{detalle}</Text> : null}
      </View>
      {onPress ? <Ionicons name={abierto ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.textTer} /> : null}
    </Pressable>
  );
}
