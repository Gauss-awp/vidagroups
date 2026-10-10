import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatoFecha, hoyISO } from '@/lib/utils';
import { encolar, esErrorDeRed, leerCache } from '@/lib/sinConexion';
import { reprogramarPronto } from '@/lib/recordatorios';
import { Boton, Campo, Card, Cargando, SelectorFecha, Vacio, s } from '@/components/ui';

interface Hermano {
  id: string;
  nombre: string;
  apellido: string | null;
}

const MOTIVOS = ['Enfermo', 'Trabajo', 'Estudio', 'Viaje', 'Familia'];

/**
 * Modo reunión: cargar el GV en tres pasos (quién vino, por qué faltaron, datos)
 * y guardar todo junto al final. Si no hay señal, queda en el celular y se envía después.
 */
export default function ModoReunion() {
  const { id: grupoId } = useLocalSearchParams<{ id: string }>();
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [fecha, setFecha] = useState(hoyISO());
  const [grupoNombre, setGrupoNombre] = useState('');
  const [hermanos, setHermanos] = useState<Hermano[]>([]);
  const [vino, setVino] = useState<Record<string, boolean>>({});
  // Motivo por ausente: texto = consolidado con ese motivo; vacío = "lo consolido después"
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [otro, setOtro] = useState<string | null>(null);
  const [datos, setDatos] = useState({ notas: '', ofrenda: '', material: '', compartio: '' });
  const [cargando, setCargando] = useState(true);
  // Días con reunión cargada, para marcarlos en el calendario
  const fechasConReunion = useCallback(
    async (desde: string, hasta: string) => {
      const { data } = await supabase.from('reuniones').select('fecha').eq('grupo_id', grupoId).gte('fecha', desde).lte('fecha', hasta);
      return ((data ?? []) as { fecha: string }[]).map((r) => r.fecha);
    },
    [grupoId]
  );
  const [guardando, setGuardando] = useState(false);
  const [sinRed, setSinRed] = useState(false);

  // Carga los hermanos y, si la reunión de esa fecha ya existe, lo que se había cargado
  useEffect(() => {
    if (!grupoId) return;
    (async () => {
      setCargando(true);
      const [g, m, r] = await Promise.all([
        supabase.from('groups').select('nombre').eq('id', grupoId).maybeSingle(),
        supabase.from('miembros_grupo').select('id, nombre, apellido, creado_en').eq('grupo_id', grupoId).eq('activo', true).order('nombre'),
        supabase
          .from('reuniones')
          .select('notas, ofrenda, material, compartio, asistencias(miembro_id, presente, consolidado, motivo)')
          .eq('grupo_id', grupoId)
          .eq('fecha', fecha)
          .maybeSingle(),
      ]);
      if (m.error && esErrorDeRed(m.error)) {
        setSinRed(true);
        const copia = await leerCache<{ miembros: Hermano[] }>(`asis:${grupoId}`);
        const grupo = await leerCache<{ grupo: { nombre: string } }>(`grupo:${grupoId}`);
        setHermanos(copia?.miembros ?? []);
        setGrupoNombre(grupo?.grupo.nombre ?? '');
        setCargando(false);
        return;
      }
      setSinRed(false);
      setGrupoNombre((g.data as { nombre: string } | null)?.nombre ?? '');
      setHermanos(((m.data ?? []) as (Hermano & { creado_en: string })[]).filter((x) => x.creado_en.slice(0, 10) <= fecha));
      const re = r.data as any;
      const v: Record<string, boolean> = {};
      const mo: Record<string, string> = {};
      (re?.asistencias ?? []).forEach((a: any) => {
        v[a.miembro_id] = a.presente;
        if (a.consolidado) mo[a.miembro_id] = a.motivo ?? 'Consolidado';
      });
      setVino(v);
      setMotivos(mo);
      setDatos({
        notas: re?.notas ?? '',
        ofrenda: re?.ofrenda !== null && re?.ofrenda !== undefined ? String(re.ofrenda) : '',
        material: re?.material ?? '',
        compartio: re?.compartio ?? '',
      });
      setCargando(false);
    })();
  }, [grupoId, fecha]);

  const ausentes = hermanos.filter((h) => !vino[h.id]);
  const presentes = hermanos.length - ausentes.length;
  const consolidados = ausentes.filter((h) => motivos[h.id]).length;
  const nombre = (h: Hermano) => `${h.nombre} ${h.apellido ?? ''}`.trim();

  const terminar = async () => {
    const ofrenda = datos.ofrenda.trim() ? Number(datos.ofrenda.replace(/\./g, '').replace(',', '.')) : null;
    if (ofrenda !== null && isNaN(ofrenda)) {
      Alert.alert('Ofrenda inválida', 'Escribí solo el número, por ejemplo 12000.');
      return;
    }
    const filas = hermanos.map((h) => ({
      miembro_id: h.id,
      presente: !!vino[h.id],
      consolidado: !vino[h.id] && !!motivos[h.id],
      motivo: !vino[h.id] && motivos[h.id] ? motivos[h.id] : null,
    }));
    const cambios = {
      notas: datos.notas.trim() || null,
      ofrenda,
      material: datos.material.trim() || null,
      compartio: datos.compartio.trim() || null,
    };
    setGuardando(true);

    const guardarEnCelular = async () => {
      for (const f of filas) await encolar({ tipo: 'asistencia', grupo_id: grupoId!, fecha, ...f });
      await encolar({ tipo: 'datos_reunion', grupo_id: grupoId!, fecha, datos: cambios });
      setSinRed(true);
    };

    try {
      if (sinRed) {
        await guardarEnCelular();
      } else {
        const { data: r, error } = await supabase
          .from('reuniones')
          .upsert({ grupo_id: grupoId, fecha, ...cambios }, { onConflict: 'grupo_id,fecha' })
          .select('id')
          .single();
        if (error) throw error;
        const { error: e2 } = await supabase
          .from('asistencias')
          .upsert(filas.map((f) => ({ reunion_id: r.id, ...f })), { onConflict: 'reunion_id,miembro_id' });
        if (e2) throw e2;
      }
      setPaso(4);
      reprogramarPronto();
    } catch (e) {
      if (esErrorDeRed(e)) {
        await guardarEnCelular();
        setPaso(4);
      } else {
        Alert.alert('No se pudo guardar', e instanceof Error ? e.message : String((e as any)?.message ?? e));
      }
    }
    setGuardando(false);
  };

  if (!grupoId) return <Vacio icono="alert-circle-outline" titulo="Grupo no encontrado" />;
  if (cargando) return <Cargando texto="Preparando la reunión..." />;

  const encabezado = (n: number, titulo: string) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textSec, fontSize: 13 }}>
        Paso {n} de 3 · {grupoNombre} · {formatoFecha(fecha)}
      </Text>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 }}>{titulo}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        {[1, 2, 3].map((k) => (
          <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= n ? colors.primary : colors.border }} />
        ))}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Cargar reunión' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {sinRed ? (
          <Card style={{ backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>
              Sin señal: la reunión se guarda en el celular y se envía sola cuando vuelva la conexión.
            </Text>
          </Card>
        ) : null}

        {/* ---------- Paso 1: quién vino ---------- */}
        {paso === 1 ? (
          <>
            {encabezado(1, '¿Quién vino?')}
            <SelectorFecha valor={fecha} onChange={setFecha} marcarFechas={fechasConReunion} />
            {hermanos.length === 0 ? (
              <Card>
                <Text style={s.textoFilaSec}>Todavía no hay hermanos en este grupo. Agregalos en la pestaña Miembros.</Text>
              </Card>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {hermanos.map((h) => {
                    const si = !!vino[h.id];
                    return (
                      <Pressable
                        key={h.id}
                        onPress={() => setVino({ ...vino, [h.id]: !si })}
                        style={{
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          minWidth: '47%',
                          flexGrow: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: si ? colors.successBg : colors.card,
                          borderWidth: 1.5,
                          borderColor: si ? colors.success : colors.border,
                        }}
                      >
                        <Ionicons name={si ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={si ? colors.success : colors.textTer} style={{ marginRight: 8 }} />
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: si ? '700' : '500', flexShrink: 1 }}>{nombre(h)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={() => setVino(Object.fromEntries(hermanos.map((h) => [h.id, presentes !== hermanos.length])))}
                  style={{ marginTop: 12, alignSelf: 'center' }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>
                    {presentes === hermanos.length ? 'Desmarcar todos' : 'Vinieron todos'}
                  </Text>
                </Pressable>
              </>
            )}
            <Boton
              titulo={`${presentes} de ${hermanos.length} vinieron · Siguiente`}
              icono="arrow-forward"
              onPress={() => setPaso(ausentes.length ? 2 : 3)}
              deshabilitado={hermanos.length === 0}
              style={{ marginTop: 18 }}
            />
          </>
        ) : null}

        {/* ---------- Paso 2: por qué faltaron ---------- */}
        {paso === 2 ? (
          <>
            {encabezado(2, '¿Por qué faltaron?')}
            <Text style={[s.textoFilaSec, { marginBottom: 12 }]}>
              Elegí un motivo y queda la "C". Si todavía no hablaste con alguien, dejalo en "Lo consolido después".
            </Text>
            {ausentes.map((h) => {
              const actual = motivos[h.id] ?? '';
              const esOtro = !!actual && !MOTIVOS.includes(actual);
              return (
                <Card key={h.id}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{nombre(h)}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {MOTIVOS.map((mo) => (
                      <Pressable
                        key={mo}
                        onPress={() => setMotivos({ ...motivos, [h.id]: actual === mo ? '' : mo })}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: actual === mo ? colors.primary : colors.cardAlt,
                        }}
                      >
                        <Text style={{ color: actual === mo ? '#FFFFFF' : colors.text, fontWeight: '600' }}>{mo}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => setOtro(h.id)}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: esOtro ? colors.primary : colors.cardAlt }}
                    >
                      <Text style={{ color: esOtro ? '#FFFFFF' : colors.text, fontWeight: '600' }}>{esOtro ? actual : 'Otro…'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setMotivos({ ...motivos, [h.id]: '' })}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: !actual ? colors.textSec : colors.border,
                      }}
                    >
                      <Text style={{ color: colors.textSec, fontWeight: !actual ? '700' : '500' }}>Lo consolido después</Text>
                    </Pressable>
                  </View>
                  {otro === h.id ? (
                    <View style={{ marginTop: 10 }}>
                      <Campo
                        placeholder="Escribí el motivo"
                        value={esOtro ? actual : ''}
                        onChangeText={(t) => setMotivos({ ...motivos, [h.id]: t })}
                        autoFocus
                      />
                      <Boton titulo="Listo" compacto variante="secundario" onPress={() => setOtro(null)} />
                    </View>
                  ) : null}
                </Card>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Boton titulo="Atrás" variante="secundario" onPress={() => setPaso(1)} style={{ flex: 1 }} />
              <Boton titulo="Siguiente" icono="arrow-forward" onPress={() => setPaso(3)} style={{ flex: 2 }} />
            </View>
          </>
        ) : null}

        {/* ---------- Paso 3: datos ---------- */}
        {paso === 3 ? (
          <>
            {encabezado(3, 'Datos de la reunión')}
            <Campo etiqueta="Ofrenda ($)" placeholder="Ej: 12000" value={datos.ofrenda} onChangeText={(v) => setDatos({ ...datos, ofrenda: v })} keyboardType="numeric" />
            <Campo etiqueta="Material (prédica)" placeholder="Ej: Prédica del domingo, Pr. Sandra" value={datos.material} onChangeText={(v) => setDatos({ ...datos, material: v })} />
            <Campo etiqueta="Quién compartió" placeholder="Ej: Joaco y Ambar" value={datos.compartio} onChangeText={(v) => setDatos({ ...datos, compartio: v })} />
            <Campo etiqueta="Nota de la semana (opcional)" placeholder="Ej: Evangelismo, GV conjunto" value={datos.notas} onChangeText={(v) => setDatos({ ...datos, notas: v })} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Boton titulo="Atrás" variante="secundario" onPress={() => setPaso(ausentes.length ? 2 : 1)} style={{ flex: 1 }} />
              <Boton
                titulo="Terminar"
                icono="checkmark"
                onPress={terminar}
                cargando={guardando}
                style={{ flex: 2 }}
              />
            </View>
          </>
        ) : null}

        {/* ---------- Listo ---------- */}
        {paso === 4 ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="checkmark-circle" size={72} color={colors.success} />
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 12 }}>¡Reunión cargada!</Text>
            <Text style={{ color: colors.textSec, fontSize: 16, marginTop: 8, textAlign: 'center' }}>
              {presentes} de {hermanos.length} vinieron
              {ausentes.length ? ` · ${consolidados} con C` : ''}
              {ausentes.length - consolidados > 0 ? ` · ${ausentes.length - consolidados} para consolidar después` : ''}
            </Text>
            {sinRed ? (
              <Text style={{ color: colors.warning, fontSize: 14, marginTop: 12, textAlign: 'center' }}>
                Quedó guardada en el celular: se envía sola cuando vuelva la señal.
              </Text>
            ) : null}
            <Boton titulo="Volver al grupo" onPress={() => router.back()} style={{ marginTop: 28, alignSelf: 'stretch' }} />
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
