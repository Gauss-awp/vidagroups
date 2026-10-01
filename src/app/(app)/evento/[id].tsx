import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Evento, Miembro, Pago } from '@/lib/types';
import { TIPO_EVENTO_LABEL, formatoFecha, formatoMoneda, hoyISO, nombreCompleto, parseMonto } from '@/lib/utils';
import {
  Badge,
  BarraProgreso,
  Boton,
  Campo,
  Card,
  Cargando,
  HojaModal,
  SeccionTitulo,
  SelectorFecha,
  Stat,
  Vacio,
  s,
} from '@/components/ui';
import { FormEvento, ICONO_EVENTO } from '@/components/eventos/FormEvento';

type MiembroConGrupo = Miembro & { grupo: { nombre: string } | null };

interface Fila {
  miembro: MiembroConGrupo;
  pagado: number;
  falta: number;
  pct: number;
}

export default function EventoPantalla() {
  const { id, grupo } = useLocalSearchParams<{ id: string; grupo?: string }>();
  const [evento, setEvento] = useState<Evento | null>(null);
  const [miembros, setMiembros] = useState<MiembroConGrupo[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  // Registrar pago
  const [modalPago, setModalPago] = useState(false);
  const [miembroPago, setMiembroPago] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [monto, setMonto] = useState('');
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Editar evento
  const [modalEditar, setModalEditar] = useState(false);

  // Historial
  const [historialDe, setHistorialDe] = useState<MiembroConGrupo | null>(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data: ev, error: errEv } = await supabase.from('eventos').select('*').eq('id', id).maybeSingle();
    if (errEv || !ev) {
      setError(errEv?.message ?? 'El evento no existe o no tenés acceso.');
      setCargando(false);
      return;
    }
    const e = ev as Evento;
    const grupoContexto = e.grupo_id ?? grupo ?? null;

    let consultaMiembros = supabase
      .from('miembros_grupo')
      .select('*, grupo:groups(nombre)')
      .eq('activo', true)
      .order('nombre');
    if (grupoContexto) {
      consultaMiembros = consultaMiembros.eq('grupo_id', grupoContexto);
    } else if (e.red_id) {
      // Evento de red: solo los miembros de los grupos de esa red
      const { data: gruposRed } = await supabase.from('groups').select('id').eq('red_id', e.red_id);
      const ids = (gruposRed ?? []).map((g: { id: string }) => g.id);
      consultaMiembros = consultaMiembros.in('grupo_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    }

    const [m, p] = await Promise.all([
      consultaMiembros,
      supabase.from('pagos_evento').select('*').eq('evento_id', id).order('fecha_pago', { ascending: false }),
    ]);
    if (m.error || p.error) Alert.alert('Error', (m.error ?? p.error)?.message ?? '');

    const lista = (m.data ?? []) as MiembroConGrupo[];
    const ids = new Set(lista.map((x) => x.id));
    setEvento(e);
    setMiembros(lista);
    setPagos(((p.data ?? []) as Pago[]).filter((x) => ids.has(x.miembro_id)));
    setError(null);
    setCargando(false);
  }, [id, grupo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const costo = Number(evento?.costo_total ?? 0);
  const moneda = evento?.moneda ?? 'ARS';

  const filas = useMemo<Fila[]>(
    () =>
      miembros.map((m) => {
        const pagado = pagos.filter((p) => p.miembro_id === m.id).reduce((a, p) => a + Number(p.monto_pagado), 0);
        return {
          miembro: m,
          pagado,
          falta: Math.max(0, costo - pagado),
          pct: costo > 0 ? Math.min(1, pagado / costo) : 0,
        };
      }),
    [miembros, pagos, costo]
  );

  const recaudado = filas.reduce((a, f) => a + f.pagado, 0);
  const faltaTotal = filas.reduce((a, f) => a + f.falta, 0);
  const alDia = filas.filter((f) => costo > 0 && f.falta === 0).length;
  const variosGrupos = new Set(miembros.map((m) => m.grupo_id)).size > 1;

  const abrirPago = (miembroId: string | null) => {
    setMiembroPago(miembroId);
    setBusqueda('');
    setMonto('');
    setFechaPago(hoyISO());
    setNota('');
    setModalPago(true);
  };

  const registrarPago = async () => {
    const valor = parseMonto(monto);
    if (!miembroPago) {
      Alert.alert('Falta el miembro', 'Elegí a quién corresponde el pago.');
      return;
    }
    if (isNaN(valor) || valor <= 0) {
      Alert.alert('Monto inválido', 'Escribí un monto mayor a cero, por ejemplo 15000.');
      return;
    }
    setGuardando(true);
    const { data: usuario } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('pagos_evento').insert({
      evento_id: id,
      miembro_id: miembroPago,
      monto_pagado: valor,
      fecha_pago: fechaPago,
      nota: nota.trim() || null,
      registrado_por: usuario.user?.id,
    });
    setGuardando(false);
    if (err) {
      Alert.alert('No se pudo registrar el pago', err.message);
      return;
    }
    setModalPago(false);
    cargar();
  };

  const eliminarPago = (p: Pago) => {
    Alert.alert('Eliminar pago', `¿Eliminar el pago de ${formatoMoneda(Number(p.monto_pagado), moneda)} del ${formatoFecha(p.fecha_pago)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('pagos_evento').delete().eq('id', p.id);
          if (err) Alert.alert('No se pudo eliminar', err.message);
          else cargar();
        },
      },
    ]);
  };

  if (cargando) return <Cargando />;
  if (error || !evento) return <Vacio icono="alert-circle-outline" titulo="No se pudo abrir el evento" texto={error ?? ''} />;

  const miembroElegido = miembros.find((m) => m.id === miembroPago) ?? null;
  const filaElegida = filas.find((f) => f.miembro.id === miembroPago);
  const q = busqueda.trim().toLowerCase();
  const opciones = miembros.filter((m) => !q || nombreCompleto(m).toLowerCase().includes(q)).slice(0, 8);
  const historial = historialDe ? pagos.filter((p) => p.miembro_id === historialDe.id) : [];
  const filaHistorial = historialDe ? filas.find((f) => f.miembro.id === historialDe.id) : undefined;

  return (
    <>
      <Stack.Screen options={{ title: evento.nombre }} />
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
        <Card>
          <View style={s.fila}>
            <Ionicons name={ICONO_EVENTO[evento.tipo]} size={26} color={colors.warning} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{evento.nombre}</Text>
              <Text style={s.textoFilaSec}>
                {formatoFecha(evento.fecha_evento)} · {formatoMoneda(costo, moneda)} por persona
              </Text>
            </View>
          </View>
          <View style={[s.fila, { gap: 6, marginTop: 10 }]}>
            <Badge texto={TIPO_EVENTO_LABEL[evento.tipo]} color={colors.warning} />
            <Badge texto={evento.grupo_id ? 'De un grupo' : evento.red_id ? 'De la red' : 'Toda la iglesia'} color={colors.purple} />
            <Badge texto={moneda === 'USD' ? 'Dólares' : 'Pesos'} color={colors.success} />
          </View>
          {evento.descripcion ? (
            <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 12, lineHeight: 21 }}>{evento.descripcion}</Text>
          ) : null}
        </Card>

        <View style={[s.fila, { gap: 10, marginBottom: 10 }]}>
          <Stat etiqueta="Recaudado" valor={formatoMoneda(recaudado, moneda)} icono="cash" color={colors.success} />
          <Stat etiqueta="Falta Pagar" valor={formatoMoneda(faltaTotal, moneda)} icono="hourglass" color={colors.warning} />
        </View>
        <Card>
          <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 8 }]}>
            <Text style={s.textoFilaSec}>
              {alDia} de {filas.length} al día
            </Text>
            <Text style={s.textoFilaSec}>Meta {formatoMoneda(costo * filas.length, moneda)}</Text>
          </View>
          <BarraProgreso valor={costo * filas.length ? recaudado / (costo * filas.length) : 0} color={colors.success} alto={8} />
        </Card>

        <Boton titulo="Registrar Pago" icono="add-circle" onPress={() => abrirPago(null)} style={{ marginTop: 6 }} />
        <Boton titulo="Editar evento" icono="pencil" variante="secundario" onPress={() => setModalEditar(true)} style={{ marginTop: 8 }} />

        <SeccionTitulo titulo="Hermanos" />
        {filas.length === 0 ? (
          <Card>
            <Vacio icono="people-outline" titulo="No hay miembros" texto="Agregá miembros al grupo para registrar sus pagos." />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {filas.map((f, i) => {
              const completo = costo > 0 && f.falta === 0;
              return (
                <Pressable
                  key={f.miembro.id}
                  onPress={() => setHistorialDe(f.miembro)}
                  style={({ pressed }) => [
                    { paddingVertical: 12 },
                    i < filas.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={[s.fila, { marginBottom: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.textoFila}>{nombreCompleto(f.miembro)}</Text>
                      {variosGrupos && f.miembro.grupo ? <Text style={s.textoFilaSec}>{f.miembro.grupo.nombre}</Text> : null}
                    </View>
                    {completo ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.textTer} style={{ marginLeft: 6 }} />
                  </View>
                  <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 6 }]}>
                    <Text style={{ color: colors.success, fontSize: 14, fontWeight: '600' }}>Pagado {formatoMoneda(f.pagado, moneda)}</Text>
                    <Text style={{ color: f.falta > 0 ? colors.warning : colors.textSec, fontSize: 14, fontWeight: '600' }}>
                      Falta {formatoMoneda(f.falta, moneda)}
                    </Text>
                  </View>
                  <BarraProgreso valor={f.pct} color={completo ? colors.success : colors.primary} />
                </Pressable>
              );
            })}
          </Card>
        )}
        <Text style={[s.textoFilaSec, { marginLeft: 4 }]}>Tocá un nombre para ver su historial de pagos.</Text>
      </ScrollView>

      <FormEvento visible={modalEditar} onClose={() => setModalEditar(false)} onGuardado={cargar} alcances={['grupo']} evento={evento} />

      {/* ---------- Registrar pago ---------- */}
      <HojaModal visible={modalPago} onClose={() => setModalPago(false)} titulo="Registrar Pago">
        <Text style={s.etiqueta}>Miembro</Text>
        {miembroElegido ? (
          <Card style={{ backgroundColor: colors.cardAlt }}>
            <View style={s.fila}>
              <View style={{ flex: 1 }}>
                <Text style={s.textoFila}>{nombreCompleto(miembroElegido)}</Text>
                {filaElegida ? (
                  <Text style={s.textoFilaSec}>
                    Pagado {formatoMoneda(filaElegida.pagado, moneda)} · Falta {formatoMoneda(filaElegida.falta, moneda)}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setMiembroPago(null)} hitSlop={10}>
                <Text style={{ color: colors.primary, fontSize: 15 }}>Cambiar</Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          <View style={{ marginBottom: 12 }}>
            <Campo placeholder="Buscar hermano" value={busqueda} onChangeText={setBusqueda} />
            {opciones.map((m) => (
              <Pressable key={m.id} onPress={() => setMiembroPago(m.id)} style={s.filaLista}>
                <Ionicons name="person-circle-outline" size={24} color={colors.textSec} style={{ marginRight: 10 }} />
                <Text style={[s.textoFila, { flex: 1 }]}>{nombreCompleto(m)}</Text>
                {variosGrupos && m.grupo ? <Text style={s.textoFilaSec}>{m.grupo.nombre}</Text> : null}
              </Pressable>
            ))}
            {opciones.length === 0 ? <Text style={s.textoFilaSec}>No hay coincidencias.</Text> : null}
          </View>
        )}

        <Campo
          etiqueta="Monto"
          placeholder="Ej: 15000"
          keyboardType="decimal-pad"
          value={monto}
          onChangeText={setMonto}
          ayuda={filaElegida && filaElegida.falta > 0 ? `Le falta pagar ${formatoMoneda(filaElegida.falta, moneda)}` : undefined}
        />
        {filaElegida && filaElegida.falta > 0 ? (
          <Pressable onPress={() => setMonto(String(filaElegida.falta))} style={{ marginTop: -6, marginBottom: 14, marginLeft: 4 }}>
            <Text style={{ color: colors.primary, fontSize: 14 }}>Pagar el total que falta</Text>
          </Pressable>
        ) : null}

        <Text style={s.etiqueta}>Fecha del pago</Text>
        <SelectorFecha valor={fechaPago} onChange={setFechaPago} />

        <Campo etiqueta="Nota" placeholder='Ej: "Cuota 1"' value={nota} onChangeText={setNota} />

        <Boton titulo="Registrar Pago" onPress={registrarPago} cargando={guardando} />
      </HojaModal>

      {/* ---------- Historial ---------- */}
      <HojaModal
        visible={!!historialDe}
        onClose={() => setHistorialDe(null)}
        titulo={historialDe ? nombreCompleto(historialDe) : ''}
      >
        {filaHistorial ? (
          <View style={[s.fila, { gap: 10, marginBottom: 14 }]}>
            <Stat etiqueta="Pagado" valor={formatoMoneda(filaHistorial.pagado, moneda)} icono="checkmark-circle" color={colors.success} />
            <Stat etiqueta="Falta Pagar" valor={formatoMoneda(filaHistorial.falta, moneda)} icono="hourglass" color={colors.warning} />
          </View>
        ) : null}

        <Boton
          titulo="Registrar pago"
          icono="add"
          variante="secundario"
          onPress={() => {
            const m = historialDe;
            setHistorialDe(null);
            // Esperamos a que se cierre esta hoja antes de abrir la otra (necesario en iOS)
            setTimeout(() => abrirPago(m?.id ?? null), 450);
          }}
        />

        <SeccionTitulo titulo="Historial de pagos" />
        {historial.length === 0 ? (
          <Text style={s.textoFilaSec}>Todavía no registró pagos para este evento.</Text>
        ) : (
          historial.map((p) => (
            <View key={p.id} style={s.filaLista}>
              <View style={{ flex: 1 }}>
                <Text style={s.textoFila}>{formatoMoneda(Number(p.monto_pagado), moneda)}</Text>
                <Text style={s.textoFilaSec}>
                  {formatoFecha(p.fecha_pago)}
                  {p.nota ? ` · ${p.nota}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => eliminarPago(p)} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </HojaModal>
    </>
  );
}
