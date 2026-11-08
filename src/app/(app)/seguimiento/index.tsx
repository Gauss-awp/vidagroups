import React, { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { formatoFecha } from '@/lib/utils';
import { BarrasH, Kpi, PALETA } from '@/components/eventos/Graficos';
import { Boton, Card, Cargando, HojaModal, SeccionTitulo, Vacio, s } from '@/components/ui';

type Estado = 'rojo' | 'amarillo' | 'verde';
interface GrupoSeg {
  id: string;
  nombre: string;
  guia_id: string | null;
  guia: string | null;
  telefono: string | null;
  ultima_reunion: string | null;
  asist_mes: number | null;
  asist_ant: number | null;
  estado: Estado;
  gravedad: number;
  motivos: string[];
  ultima_charla: string | null;
}
interface Hablar {
  guia_id: string;
  guia: string;
  telefono: string | null;
  grupo_id: string;
  grupo: string;
  gravedad: number;
  motivos: string[];
}
interface Persona {
  id: string;
  nombre: string;
  grupo: string | null;
  dias: number;
  clases?: number;
}
interface Panel {
  grupos: GrupoSeg[];
  hablar: Hablar[];
  charlas_recientes: { guia: string; hablo: string; nota: string | null; fecha: string }[];
  embudo: Record<'total' | 'fonovisita' | 'visita' | 'pilares' | 'gv' | 'encuentro' | 'pos' | 'reencuentro', number>;
  trabados: { sin_fono: Persona[]; sin_pos: Persona[]; pos_trabado: Persona[] };
  tendencias: { asist_mes: number | null; asist_ant: number | null; nuevos_mes: number; nuevos_ant: number; completadas_mes: number; completadas_ant: number };
}

const COLOR: Record<Estado, string> = { rojo: PALETA.sinPagar, amarillo: PALETA.cuotas, verde: PALETA.pagado };
const ETIQUETA: Record<Estado, string> = { rojo: 'Necesita ayuda', amarillo: 'Para mirar', verde: 'Bien' };

/** WhatsApp con el número del guía (si es un celular argentino sin código, se le agrega) */
function abrirWhatsApp(telefono: string | null, texto: string) {
  const d = (telefono ?? '').replace(/\D/g, '');
  if (!d) {
    alerta('Sin teléfono', 'Este guía no cargó su teléfono en el perfil.');
    return;
  }
  const numero = d.length === 10 ? `549${d}` : d.startsWith('0') ? `549${d.slice(1)}` : d;
  Linking.openURL(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`);
}

const flecha = (actual: number | null, antes: number | null) =>
  actual === null || antes === null ? '' : actual > antes ? ` ▲ ${actual - antes}` : actual < antes ? ` ▼ ${antes - actual}` : ' =';

/**
 * Seguimiento: dónde poner la atención esta semana.
 * Con ?red= muestra toda la red (pastores, encargados); sin red, los grupos que supervisa quien entra.
 */
export default function Seguimiento() {
  const { red, nombre } = useLocalSearchParams<{ red?: string; nombre?: string }>();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [charla, setCharla] = useState<Hablar | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<'sin_fono' | 'sin_pos' | 'pos_trabado' | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('panel_seguimiento', { p_red: red ?? null });
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
    const { error: e } = await supabase.from('seguimiento_charlas').insert({ guia_id: charla.guia_id, grupo_id: charla.grupo_id, nota: nota.trim() || null });
    setGuardando(false);
    if (e) return alerta('No se pudo guardar', e.message);
    setCharla(null);
    setNota('');
    cargar();
  };

  if (error) return <Vacio icono="alert-circle-outline" titulo="No se pudo cargar el seguimiento" texto={/function|schema cache/i.test(error) ? 'Falta actualizar la base de datos (etapa 35).' : error} />;
  if (!panel) return <Cargando texto="Armando el seguimiento..." />;

  const conteo = (e: Estado) => panel.grupos.filter((g) => g.estado === e).length;
  const t = panel.tendencias;
  const emb = panel.embudo;
  const pasos: [string, number][] = [
    ['Personas en consolidación', emb.total],
    ['Fonovisita', emb.fonovisita],
    ['Visita', emb.visita],
    ['Pilares', emb.pilares],
    ['Va al GV', emb.gv],
    ['Encuentro', emb.encuentro],
    ['Pos-encuentro completo', emb.pos],
    ['Reencuentro', emb.reencuentro],
  ];
  const trabados: { clave: 'sin_fono' | 'sin_pos' | 'pos_trabado'; titulo: string; detalle: (p: Persona) => string }[] = [
    { clave: 'sin_pos', titulo: 'Hicieron el Encuentro y no empezaron el Pos-encuentro', detalle: (p) => `hace ${p.dias} días` },
    { clave: 'pos_trabado', titulo: 'Pos-encuentro sin avanzar hace más de un mes', detalle: (p) => `${p.clases}/10 clases · hace ${p.dias} días` },
    { clave: 'sin_fono', titulo: 'Personas nuevas sin ningún contacto todavía', detalle: (p) => `se registró hace ${p.dias} días` },
  ];
  const gruposVisibles = verTodos ? panel.grupos : panel.grupos.filter((g) => g.estado !== 'verde');

  return (
    <>
      <Stack.Screen options={{ title: 'Seguimiento' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }} tintColor={colors.textSec} />}
      >
        <View style={{ backgroundColor: '#1F3A5F', borderRadius: 18, padding: 18, marginBottom: 14 }}>
          <Text style={{ color: '#C7D7EE', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>SEGUIMIENTO{nombre ? ` · ${String(nombre).toUpperCase()}` : ''}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 6 }}>
            {conteo('rojo') ? `${conteo('rojo')} ${conteo('rojo') === 1 ? 'grupo necesita' : 'grupos necesitan'} ayuda` : 'Ningún grupo en rojo'}
          </Text>
          <Text style={{ color: '#C7D7EE', fontSize: 13, marginTop: 4 }}>Dónde poner la atención esta semana: con quién hablar, qué grupo acompañar y quién se trabó en la consolidación.</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Kpi titulo="Necesitan ayuda" valor={String(conteo('rojo'))} detalle={`de ${panel.grupos.length} grupos`} icono="alert-circle-outline" color={COLOR.rojo} />
          <Kpi titulo="Para mirar" valor={String(conteo('amarillo'))} detalle={`${conteo('verde')} están bien`} icono="eye-outline" color={COLOR.amarillo} />
          <Kpi titulo="Asistencia del mes" valor={t.asist_mes !== null ? `${t.asist_mes}%` : '—'} detalle={t.asist_ant !== null ? `mes pasado ${t.asist_ant}%${flecha(t.asist_mes, t.asist_ant)}` : undefined} icono="people-outline" color={PALETA.azul} />
          <Kpi titulo="Personas nuevas" valor={String(t.nuevos_mes)} detalle={`mes pasado ${t.nuevos_ant} · ${t.completadas_mes} completaron`} icono="heart-outline" color={PALETA.violeta} />
        </View>

        {/* ---------------- Con quién hablar ---------------- */}
        <SeccionTitulo titulo="Con quién hablar esta semana" />
        {panel.hablar.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>Nadie urgente esta semana. 🙌</Text>
          </Card>
        ) : (
          panel.hablar.map((h) => (
            <Card key={`${h.guia_id}-${h.grupo_id}`}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{h.guia}</Text>
              <Text style={[s.textoFilaSec, { marginBottom: 8 }]}>{h.grupo}</Text>
              {h.motivos.map((m) => (
                <Text key={m} style={{ color: colors.text, fontSize: 14, marginBottom: 3 }}>
                  • {m}
                </Text>
              ))}
              <View style={[s.fila, { gap: 8, marginTop: 10 }]}>
                <Boton
                  titulo="Escribirle"
                  icono="logo-whatsapp"
                  compacto
                  variante="secundario"
                  onPress={() => abrirWhatsApp(h.telefono, `Hola ${h.guia.split(' ')[0]}! ¿Cómo estás? Quería saber cómo viene el grupo 🙂`)}
                  style={{ flex: 1 }}
                />
                <Boton titulo="Ya hablé" icono="checkmark" compacto onPress={() => setCharla(h)} style={{ flex: 1 }} />
              </View>
            </Card>
          ))
        )}

        {/* ---------------- Semáforo ---------------- */}
        <SeccionTitulo titulo="Cómo están los grupos" />
        {gruposVisibles.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>Todos los grupos están bien. 🙌</Text>
          </Card>
        ) : (
          gruposVisibles.map((g) => (
            <Card key={g.id} onPress={() => router.push({ pathname: '/grupo/[id]', params: { id: g.id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: COLOR[g.estado], marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{g.nombre}</Text>
                  <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
                    {[g.guia ? `Guía: ${g.guia}` : 'Sin guía', g.asist_mes !== null ? `asistencia ${g.asist_mes}%` : null, g.ultima_charla ? `hablaron el ${formatoFecha(g.ultima_charla.slice(0, 10))}` : null]
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
        {panel.grupos.some((g) => g.estado === 'verde') ? (
          <Pressable onPress={() => setVerTodos(!verTodos)} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{verTodos ? 'Ocultar los que están bien' : `Ver también los ${conteo('verde')} que están bien`}</Text>
          </Pressable>
        ) : null}

        {/* ---------------- Consolidación ---------------- */}
        <SeccionTitulo titulo="Consolidación: dónde se traban" />
        {trabados.map((tr) => {
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
                      <Text style={[s.textoFilaSec, { fontSize: 12 }]}>{[p.grupo ?? 'Sin grupo', tr.detalle(p)].join(' · ')}</Text>
                    </View>
                  ))
                : null}
            </Card>
          );
        })}

        <Card>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 4 }}>El camino de las personas nuevas</Text>
          <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 12 }]}>Cuántas llegaron a cada paso (de las que están en consolidación).</Text>
          <BarrasH filas={pasos.map(([etiqueta, valor]) => ({ etiqueta, valor }))} formato={(n) => String(n)} colorFijo={PALETA.azul} />
        </Card>

        {/* ---------------- Charlas recientes ---------------- */}
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
            <Text style={[s.textoFilaSec, { marginBottom: 10 }]}>Sale de "Con quién hablar" por una semana. Si algo sigue igual, vuelve a aparecer.</Text>
            <Text style={s.etiqueta}>Nota (opcional)</Text>
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
