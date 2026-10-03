import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import type { Miembro, Moneda } from '@/lib/types';
import { MESES, formatoCumple, formatoFecha, formatoMoneda, nombreCompleto, parseCumple, porcentaje, sumarDias, hoyISO } from '@/lib/utils';
import { Avatar, Boton, Campo, Card, Cargando, HojaModal, PasosConsolidacion, SeccionTitulo, Vacio, s } from '@/components/ui';
import { Notas } from '@/components/notas/Notas';

interface Reunion {
  id: string;
  fecha: string;
  vino: boolean;
}
interface PagoEvento {
  evento: string;
  moneda: Moneda;
  costo: number;
  pagos: { monto: number; fecha: string; nota: string | null }[];
}

/** Historial de un hermano: asistencia, pagos y consolidación, con sus datos editables. */
export default function MiembroPantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [miembro, setMiembro] = useState<(Miembro & { grupo: { nombre: string } | null }) | null>(null);
  const [reuniones, setReuniones] = useState<Reunion[]>([]);
  const [pagos, setPagos] = useState<PagoEvento[]>([]);
  const [tarjeta, setTarjeta] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', cumple: '' });
  const [guardando, setGuardando] = useState(false);
  const [puedeNotas, setPuedeNotas] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data: m, error: err } = await supabase.from('miembros_grupo').select('*, grupo:groups(nombre)').eq('id', id).maybeSingle();
    if (err || !m) {
      setError(err?.message ?? 'No tenés acceso a este hermano.');
      return;
    }
    const mm = m as Miembro & { grupo: { nombre: string } | null };
    setMiembro(mm);

    const desde = sumarDias(hoyISO(), -180);
    const [re, pg, tj] = await Promise.all([
      supabase
        .from('reuniones')
        .select('id, fecha, asistencias(miembro_id, presente)')
        .eq('grupo_id', mm.grupo_id)
        .gte('fecha', desde)
        .order('fecha', { ascending: false }),
      supabase
        .from('pagos_evento')
        .select('monto_pagado, fecha_pago, nota, evento:eventos(nombre, moneda, costo_total)')
        .eq('miembro_id', id)
        .order('fecha_pago', { ascending: false }),
      supabase
        .from('tarjetas_consolidacion')
        .select('*')
        .eq('grupo_id', mm.grupo_id)
        .ilike('nombre', `${mm.nombre.trim()}%`)
        .limit(1),
    ]);

    setReuniones(
      ((re.data ?? []) as { id: string; fecha: string; asistencias: { miembro_id: string; presente: boolean }[] }[])
        .filter((r) => r.fecha >= mm.creado_en.slice(0, 10))
        .map((r) => ({ id: r.id, fecha: r.fecha, vino: (r.asistencias ?? []).some((a) => a.miembro_id === id && a.presente) }))
    );

    const porEvento = new Map<string, PagoEvento>();
    ((pg.data ?? []) as any[]).forEach((p) => {
      const nombre = p.evento?.nombre ?? 'Evento';
      if (!porEvento.has(nombre)) {
        porEvento.set(nombre, { evento: nombre, moneda: p.evento?.moneda ?? 'ARS', costo: Number(p.evento?.costo_total ?? 0), pagos: [] });
      }
      porEvento.get(nombre)!.pagos.push({ monto: Number(p.monto_pagado), fecha: p.fecha_pago, nota: p.nota });
    });
    setPagos([...porEvento.values()]);
    setTarjeta(((tj.data ?? []) as Record<string, any>[])[0] ?? null);
    const { data: permiso } = await supabase.rpc('puede_ver_notas', { p_grupo: mm.grupo_id });
    setPuedeNotas(!!permiso);
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) return <Vacio icono="lock-closed-outline" titulo="No se pudo abrir" texto={error} />;
  if (!miembro) return <Cargando />;

  const nombre = nombreCompleto(miembro);
  const vino = reuniones.filter((r) => r.vino).length;
  const pct = porcentaje(vino, reuniones.length);

  // Asistencia por mes (últimos 6)
  const porMes = new Map<string, { vino: number; total: number }>();
  reuniones.forEach((r) => {
    const k = r.fecha.slice(0, 7);
    const x = porMes.get(k) ?? { vino: 0, total: 0 };
    x.total++;
    if (r.vino) x.vino++;
    porMes.set(k, x);
  });

  const abrirEdicion = () => {
    setForm({
      nombre: miembro.nombre,
      apellido: miembro.apellido ?? '',
      telefono: miembro.telefono ?? '',
      cumple: formatoCumple(miembro.cumpleanos),
    });
    setEditando(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      Alert.alert('Falta el nombre', 'El nombre no puede quedar vacío.');
      return;
    }
    const cumple = form.cumple.trim() ? parseCumple(form.cumple) : null;
    if (form.cumple.trim() && !cumple) {
      Alert.alert('Cumpleaños inválido', 'Escribilo como día/mes, por ejemplo 25/12, o con el año: 25/12/1998.');
      return;
    }
    setGuardando(true);
    const { error: err } = await supabase
      .from('miembros_grupo')
      .update({ nombre: form.nombre.trim(), apellido: form.apellido.trim(), telefono: form.telefono.trim() || null, cumpleanos: cumple })
      .eq('id', miembro.id);
    setGuardando(false);
    if (err) {
      Alert.alert('No se pudo guardar', err.message);
      return;
    }
    setEditando(false);
    cargar();
  };

  const tel = miembro.telefono?.replace(/[^0-9]/g, '') ?? '';
  const wa = tel ? (tel.startsWith('54') ? tel : `549${tel.replace(/^0/, '')}`) : '';

  return (
    <>
      <Stack.Screen options={{ title: nombre }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Card>
          <View style={s.fila}>
            <Avatar nombre={nombre} color={reuniones.length ? colorPorcentaje(pct) : colors.textTer} tamano={52} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>{nombre}</Text>
              <Text style={s.textoFilaSec}>{miembro.grupo?.nombre ?? ''}</Text>
              {miembro.cumpleanos ? <Text style={s.textoFilaSec}>Cumpleaños: {formatoCumple(miembro.cumpleanos)}</Text> : null}
            </View>
            <Pressable onPress={abrirEdicion} hitSlop={10} accessibilityLabel="Editar datos">
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          </View>
          {tel ? (
            <View style={[s.fila, { gap: 8, marginTop: 12 }]}>
              <Boton compacto variante="secundario" titulo="WhatsApp" icono="logo-whatsapp" onPress={() => Linking.openURL(`https://wa.me/${wa}`)} style={{ flex: 1 }} />
              <Boton compacto variante="secundario" titulo="Llamar" icono="call-outline" onPress={() => Linking.openURL(`tel:${tel}`)} style={{ flex: 1 }} />
            </View>
          ) : null}
        </Card>

        <SeccionTitulo titulo="Asistencia" />
        {reuniones.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>Todavía no hay reuniones registradas desde que se sumó.</Text>
          </Card>
        ) : (
          <Card>
            <Text style={{ fontSize: 28, fontWeight: '800', color: colorPorcentaje(pct) }}>{pct}%</Text>
            <Text style={s.textoFilaSec}>
              Vino a {vino} de {reuniones.length} reuniones en los últimos 6 meses
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {reuniones.slice(0, 12).map((r) => (
                <View
                  key={r.id}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: r.vino ? colors.successBg : colors.dangerBg,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: r.vino ? colors.success : colors.danger }}>
                    {formatoFecha(r.fecha).slice(0, 5)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 12 }}>
              {[...porMes.entries()].map(([k, v]) => (
                <View key={k} style={[s.fila, { justifyContent: 'space-between', paddingVertical: 3 }]}>
                  <Text style={{ color: colors.text }}>{MESES[Number(k.slice(5, 7)) - 1]}</Text>
                  <Text style={{ color: colorPorcentaje(porcentaje(v.vino, v.total)), fontWeight: '700' }}>
                    {v.vino}/{v.total}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <SeccionTitulo titulo="Pagos" />
        {pagos.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>Sin pagos registrados.</Text>
          </Card>
        ) : (
          pagos.map((p) => {
            const total = p.pagos.reduce((a, x) => a + x.monto, 0);
            const f = (v: number) => formatoMoneda(v, p.moneda);
            return (
              <Card key={p.evento}>
                <View style={[s.fila, { justifyContent: 'space-between' }]}>
                  <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{p.evento}</Text>
                  <Text style={{ color: total >= p.costo ? colors.success : colors.warning, fontWeight: '700' }}>
                    {f(total)}
                    {p.costo ? ` de ${f(p.costo)}` : ''}
                  </Text>
                </View>
                {p.pagos.map((x, i) => (
                  <Text key={i} style={[s.textoFilaSec, { marginTop: 4 }]}>
                    {formatoFecha(x.fecha)} · {f(x.monto)}
                    {x.nota ? ` · ${x.nota}` : ''}
                  </Text>
                ))}
              </Card>
            );
          })
        )}

        {puedeNotas ? (
          <>
            <SeccionTitulo titulo="Notas" />
            <Notas grupoId={miembro.grupo_id} miembroId={miembro.id} />
          </>
        ) : null}

        {tarjeta ? (
          <>
            <SeccionTitulo titulo="Consolidación" />
            <Card>
              <Text style={s.textoFilaSec}>Llegó por consolidación el {formatoFecha(String(tarjeta.creado_en).slice(0, 10))}</Text>
              <PasosConsolidacion tarjeta={tarjeta} />
            </Card>
          </>
        ) : null}
      </ScrollView>

      <HojaModal visible={editando} onClose={() => setEditando(false)} titulo="Editar datos">
        <Campo etiqueta="Nombre" value={form.nombre} onChangeText={(v) => setForm({ ...form, nombre: v })} />
        <Campo etiqueta="Apellido" value={form.apellido} onChangeText={(v) => setForm({ ...form, apellido: v })} />
        <Campo etiqueta="Teléfono" value={form.telefono} onChangeText={(v) => setForm({ ...form, telefono: v })} keyboardType="phone-pad" />
        <Campo
          etiqueta="Cumpleaños"
          placeholder="25/12 o 25/12/1998"
          value={form.cumple}
          onChangeText={(v) => setForm({ ...form, cumple: v })}
          keyboardType="numbers-and-punctuation"
        />
        <Boton titulo="Guardar" onPress={guardar} cargando={guardando} />
      </HojaModal>
    </>
  );
}
