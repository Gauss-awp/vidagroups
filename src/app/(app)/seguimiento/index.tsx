import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { formatoFecha } from '@/lib/utils';
import { BarrasH, Kpi, PALETA } from '@/components/eventos/Graficos';
import { Avatar, Boton, Card, Cargando, HojaModal, SeccionTitulo, Vacio, s } from '@/components/ui';
import { useAvatares } from '@/lib/avatares';

type Estado = 'rojo' | 'amarillo' | 'verde';
interface GrupoSeg {
  id: string;
  nombre: string;
  guia: string | null;
  ultima_reunion: string | null;
  asist_mes: number | null;
  asist_ant: number | null;
  estado: Estado;
  motivos: string[];
  ultima_charla: string | null;
}
interface Hablar {
  guia_id: string;
  guia: string;
  grupo_id: string;
  grupo: string;
  motivos: string[];
  tipos: string[];
  ultima_charla: string | null;
}
interface Persona {
  id: string;
  nombre: string;
  grupo: string | null;
  guia: string | null;
  dias: number;
  clases?: number;
}
type ClaveTrabado = 'sin_pos' | 'pos_trabado' | 'sin_contacto';
interface Panel {
  hablar: Hablar[];
  grupos: GrupoSeg[];
  charlas_recientes: { guia: string; hablo: string; nota: string | null; fecha: string }[];
  trabados: Record<ClaveTrabado, Persona[]>;
  embudo: Record<'total' | 'fonovisita' | 'visita' | 'pilares' | 'gv' | 'encuentro' | 'pos' | 'reencuentro', number>;
  tendencias: { asist_mes: number | null; asist_ant: number | null; nuevos_mes: number; nuevos_ant: number; completadas_mes: number; completadas_ant: number };
}

const COLOR: Record<Estado, string> = { rojo: PALETA.sinPagar, amarillo: PALETA.cuotas, verde: PALETA.pagado };
const ETIQUETA: Record<Estado, string> = { rojo: 'Necesita ayuda', amarillo: 'Para mirar', verde: 'Bien' };
const TRABADOS: { clave: ClaveTrabado; titulo: string; detalle: (p: Persona) => string }[] = [
  { clave: 'sin_pos', titulo: 'Hicieron el Encuentro y no empezaron el Pos-encuentro', detalle: (p) => `Encuentro hace ${p.dias} días` },
  { clave: 'pos_trabado', titulo: 'Pos-encuentro sin avanzar hace más de un mes', detalle: (p) => `${p.clases}/10 clases · sin avanzar hace ${p.dias} días` },
  { clave: 'sin_contacto', titulo: 'Personas nuevas sin ningún contacto (2 semanas)', detalle: (p) => `se registró hace ${p.dias} días` },
];

const flecha = (actual: number | null, antes: number | null) =>
  actual === null || antes === null ? '' : actual > antes ? ` ▲ ${actual - antes}` : actual < antes ? ` ▼ ${antes - actual}` : ' =';

/**
 * Seguimiento de una red (pastores y encargados): con quién hablar, qué grupo
 * necesita ayuda, quién se trabó en la consolidación y cómo viene la red.
 */
export default function Seguimiento() {
  const { red, nombre } = useLocalSearchParams<{ red?: string; nombre?: string }>();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [charla, setCharla] = useState<Hablar | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<ClaveTrabado | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const avatares = useAvatares((panel?.hablar ?? []).map((h) => h.guia_id));

  const cargar = useCallback(async () => {
    if (!red) {
      setError('Entrá al Seguimiento desde "Mi Red".');
      return;
    }
    const { data, error: e } = await supabase.rpc('panel_seguimiento', { p_red: red });
    if (e) setError(e.message);
    else {
      setPanel(data as Panel);
      setError(null);
    }
  }, [red]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const registrarCharla = async () => {
    if (!charla) return;
    setGuardando(true);
    const { error: e } = await supabase
      .from('seguimiento_charlas')
      .insert({ guia_id: charla.guia_id, grupo_id: charla.grupo_id, nota: nota.trim() || null, tipos: charla.tipos });
    setGuardando(false);
    if (e) return alerta('No se pudo guardar', e.message);
    setCharla(null);
    setNota('');
    cargar();
  };

  if (error)
    return (
      <Vacio
        icono="alert-circle-outline"
        titulo="No se pudo cargar el seguimiento"
        texto={/function|schema cache|column/i.test(error) ? 'Falta actualizar la base de datos (etapa 36).' : error}
      />
    );
  if (!panel) return <Cargando texto="Armando el seguimiento..." />;

  const conteo = (e: Estado) => panel.grupos.filter((g) => g.estado === e).length;
  const t = panel.tendencias;
  const emb = panel.embudo;
  const gruposVisibles = verTodos ? panel.grupos : panel.grupos.filter((g) => g.estado !== 'verde');
  const totalTrabados = TRABADOS.reduce((a, tr) => a + panel.trabados[tr.clave].length, 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Seguimiento' }} />
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
        {/* Resumen del día en una línea */}
        <View style={{ backgroundColor: '#14532D', borderRadius: 18, padding: 18, marginBottom: 4 }}>
          <Text style={{ color: '#BBF7D0', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>SEGUIMIENTO{nombre ? ` · ${String(nombre).toUpperCase()}` : ''}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 6 }}>
            {panel.hablar.length} {panel.hablar.length === 1 ? 'guía para hablar' : 'guías para hablar'} · {conteo('rojo')} en rojo · {totalTrabados} trabados
          </Text>
        </View>

        {/* ---------------- 1. Con quién hablar ---------------- */}
        <SeccionTitulo titulo="1. Con quién hablar" />
        {panel.hablar.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>Nadie pendiente. 🙌</Text>
          </Card>
        ) : (
          panel.hablar.map((h) => (
            <Card key={`${h.guia_id}-${h.grupo_id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Avatar nombre={h.guia} tamano={44} avatar={avatares[h.guia_id]} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{h.guia}</Text>
                  <Text style={s.textoFilaSec}>
                    {h.grupo}
                    {h.ultima_charla ? ` · hablaron el ${formatoFecha(h.ultima_charla.slice(0, 10))}, hay algo nuevo` : ''}
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 8 }}>
                {h.motivos.map((m) => (
                  <Text key={m} style={{ color: colors.text, fontSize: 14, marginBottom: 3 }}>
                    • {m}
                  </Text>
                ))}
              </View>
              <Boton titulo="Ya hablé" icono="checkmark" compacto onPress={() => setCharla(h)} style={{ marginTop: 10 }} />
            </Card>
          ))
        )}

        {/* ---------------- 2. Grupos ---------------- */}
        <SeccionTitulo titulo="2. Grupos que necesitan ayuda" />
        {gruposVisibles.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>Todos los grupos están bien. 🙌</Text>
          </Card>
        ) : (
          gruposVisibles.map((g) => (
            <Card key={g.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLOR[g.estado], marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{g.nombre}</Text>
                  <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
                    {[
                      g.guia ? `Guía: ${g.guia}` : 'Sin guía',
                      g.ultima_reunion ? `última reunión ${formatoFecha(g.ultima_reunion)}` : 'sin reuniones',
                      g.asist_mes !== null ? `asistencia ${g.asist_mes}%` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={{ color: COLOR[g.estado], fontSize: 11, fontWeight: '800' }}>{ETIQUETA[g.estado].toUpperCase()}</Text>
              </View>
              {g.motivos.length ? (
                <View style={{ marginTop: 8 }}>
                  {g.motivos.map((m) => (
                    <Text key={m} style={{ color: colors.text, fontSize: 13, marginBottom: 2 }}>
                      • {m}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Card>
          ))
        )}
        {conteo('verde') ? (
          <Pressable onPress={() => setVerTodos(!verTodos)} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{verTodos ? 'Ocultar los que están bien' : `Ver también los ${conteo('verde')} que están bien`}</Text>
          </Pressable>
        ) : null}

        {/* ---------------- 3. Consolidación trabada ---------------- */}
        <SeccionTitulo titulo="3. Consolidación trabada" />
        {TRABADOS.map((tr) => {
          const lista = panel.trabados[tr.clave];
          return (
            <Card key={tr.clave} onPress={lista.length ? () => setAbierto(abierto === tr.clave ? null : tr.clave) : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: lista.length ? COLOR.amarillo : COLOR.verde, fontSize: 26, fontWeight: '800', width: 46 }}>{lista.length}</Text>
                <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{tr.titulo}</Text>
                {lista.length ? <Ionicons name={abierto === tr.clave ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSec} /> : null}
              </View>
              {abierto === tr.clave
                ? lista.map((p) => (
                    <View key={p.id} style={{ paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 6 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{p.nombre}</Text>
                      <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
                        {[p.guia ? `Guía: ${p.guia}` : null, p.grupo ?? 'Sin grupo', tr.detalle(p)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ))
                : null}
            </Card>
          );
        })}

        {/* ---------------- 4. Crecimiento ---------------- */}
        <SeccionTitulo titulo="4. Crecimiento de la red" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Kpi
            titulo="Asistencia del mes"
            valor={t.asist_mes !== null ? `${t.asist_mes}%` : '—'}
            detalle={t.asist_ant !== null ? `mes pasado ${t.asist_ant}%${flecha(t.asist_mes, t.asist_ant)}` : undefined}
            icono="people-outline"
            color={PALETA.azul}
          />
          <Kpi titulo="Personas nuevas" valor={String(t.nuevos_mes)} detalle={`mes pasado ${t.nuevos_ant}${flecha(t.nuevos_mes, t.nuevos_ant)}`} icono="heart-outline" color={PALETA.violeta} />
          <Kpi
            titulo="Consolidaciones"
            valor={String(t.completadas_mes)}
            detalle={`completas · mes pasado ${t.completadas_ant}`}
            icono="checkmark-done-outline"
            color={PALETA.pagado}
          />
          <Kpi titulo="Grupos" valor={String(panel.grupos.length)} detalle={`${conteo('verde')} bien · ${conteo('rojo')} en rojo`} icono="home-outline" color={PALETA.cuotas} />
        </View>
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>El camino de las personas nuevas</Text>
          <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 12 }]}>Cuántas llegaron a cada paso (de las que están en consolidación).</Text>
          <BarrasH
            filas={(
              [
                ['En consolidación', emb.total],
                ['Fonovisita', emb.fonovisita],
                ['Visita', emb.visita],
                ['Pilares', emb.pilares],
                ['Va al GV', emb.gv],
                ['Encuentro', emb.encuentro],
                ['Pos-encuentro completo', emb.pos],
                ['Reencuentro', emb.reencuentro],
              ] as [string, number][]
            ).map(([etiqueta, valor]) => ({ etiqueta, valor }))}
            formato={(n) => String(n)}
            colorFijo={PALETA.azul}
          />
        </Card>

        {panel.charlas_recientes.length ? (
          <>
            <SeccionTitulo titulo="Charlas del último mes" />
            <Card>
              {panel.charlas_recientes.map((c, i) => (
                <View key={i} style={{ paddingVertical: 6, borderTopWidth: i ? 0.5 : 0, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {c.guia} <Text style={{ color: colors.textSec, fontWeight: '400' }}>· {formatoFecha(c.fecha.slice(0, 10))} · {c.hablo}</Text>
                  </Text>
                  {c.nota ? <Text style={[s.textoFilaSec, { fontSize: 13 }]}>{c.nota}</Text> : null}
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>

      <HojaModal visible={!!charla} onClose={() => setCharla(null)} titulo={charla ? `Hablé con ${charla.guia}` : ''}>
        {charla ? (
          <>
            <Text style={[s.textoFilaSec, { marginBottom: 10 }]}>Sale de la lista. Vuelve solo si aparece un problema distinto a los de hoy.</Text>
            <Text style={s.etiqueta}>¿Qué acordaron? (opcional)</Text>
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder="Ej: Está con mucho trabajo; el jueves lo acompaño al grupo"
              placeholderTextColor={colors.textTer}
              multiline
              style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: 12, color: colors.text, minHeight: 80, marginBottom: 12 }}
            />
            <Boton titulo="Guardar" icono="checkmark" onPress={registrarCharla} cargando={guardando} />
          </>
        ) : null}
      </HojaModal>
    </>
  );
}
