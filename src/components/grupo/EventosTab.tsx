import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Evento, Pago } from '@/lib/types';
import { TIPO_EVENTO_LABEL, formatoFecha, formatoMoneda, hoyISO } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Badge, Boton, Card, Cargando, Vacio } from '@/components/ui';
import { Alcance, FormEvento, ICONO_EVENTO } from '@/components/eventos/FormEvento';
import ModalPagoGuia from '../guia/ModalPagoGuia';

interface MiembroLite {
  id: string;
  nombre: string;
  apellido: string | null;
}

export function EventosTab({ grupoId, refreshKey }: { grupoId: string; refreshKey: number }) {
  const router = useRouter();
  const { perfil, redesAdmin } = useAuth();
  const [redGrupo, setRedGrupo] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [miembros, setMiembros] = useState<MiembroLite[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eventoActivo, setEventoActivo] = useState<string | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalPago, setModalPago] = useState(false);
  const [miembroSel, setMiembroSel] = useState<MiembroLite | null>(null);
  const [eventoSel, setEventoSel] = useState<Evento | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [confetiId, setConfetiId] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: g } = await supabase.from('groups').select('red_id').eq('id', grupoId).maybeSingle();
    const red = (g?.red_id as string | null) ?? null;
    setRedGrupo(red);

    // Eventos que le corresponden al grupo: del grupo, de su red o de toda la iglesia
    const filtro = red
      ? `grupo_id.eq.${grupoId},and(grupo_id.is.null,red_id.eq.${red}),and(grupo_id.is.null,red_id.is.null)`
      : `grupo_id.eq.${grupoId},and(grupo_id.is.null,red_id.is.null)`;
    const [ev, mi] = await Promise.all([
      supabase.from('eventos').select('*').or(filtro).order('fecha_evento', { ascending: true, nullsFirst: false }),
      supabase.from('miembros_grupo').select('id, nombre, apellido').eq('grupo_id', grupoId).eq('activo', true).order('nombre'),
    ]);
    if (ev.error) Alert.alert('Error al cargar eventos', ev.error.message);
    const listaEventos = (ev.data ?? []) as Evento[];
    const listaMiembros = (mi.data ?? []) as MiembroLite[];

    let listaPagos: Pago[] = [];
    if (listaEventos.length && listaMiembros.length) {
      const p = await supabase
        .from('pagos_evento')
        .select('*')
        .in('evento_id', listaEventos.map((e) => e.id))
        .in('miembro_id', listaMiembros.map((m) => m.id))
        .order('fecha_pago', { ascending: false });
      listaPagos = (p.data ?? []) as Pago[];
    }
    setEventos(listaEventos);
    setMiembros(listaMiembros);
    setPagos(listaPagos);
    setCargando(false);
  }, [grupoId]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const lanzarConfeti = (id: string) => {
    setConfetiId(id);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }).start(() =>
      setTimeout(() => setConfetiId(null), 500)
    );
  };

  const pagadoPor = (eventoId: string, miembroId: string) =>
    pagos.filter((p) => p.evento_id === eventoId && p.miembro_id === miembroId).reduce((a, p) => a + Number(p.monto_pagado), 0);

  // Registra una cuota nueva (cada pago queda en el historial)
  const guardarPago = async (monto: number, nota: string) => {
    if (!miembroSel || !eventoSel) return;
    setGuardandoPago(true);
    const { data: usuario } = await supabase.auth.getUser();
    const { error } = await supabase.from('pagos_evento').insert({
      evento_id: eventoSel.id,
      miembro_id: miembroSel.id,
      monto_pagado: monto,
      fecha_pago: hoyISO(),
      nota: nota || null,
      registrado_por: usuario.user?.id,
    });
    setGuardandoPago(false);
    if (error) {
      Alert.alert('No se pudo registrar el pago', error.message);
      return;
    }
    const costo = Number(eventoSel.costo_total) || 0;
    const totalAntes = pagos.filter((p) => p.evento_id === eventoSel.id).reduce((a, p) => a + Number(p.monto_pagado), 0);
    const meta = costo * miembros.length;
    if (meta > 0 && totalAntes + monto >= meta) lanzarConfeti(eventoSel.id);
    setModalPago(false);
    cargar();
  };

  if (cargando) return <Cargando />;

  // Dónde puede crear eventos quien está mirando
  const alcances: Alcance[] = ['grupo'];
  if (redGrupo && redesAdmin.some((r) => r.id === redGrupo)) alcances.push('red');
  if (perfil?.rol === 'pastor' || perfil?.rol === 'apostol') alcances.push('iglesia');

  const historialSel =
    miembroSel && eventoSel
      ? pagos
          .filter((p) => p.evento_id === eventoSel.id && p.miembro_id === miembroSel.id)
          .map((p) => ({ monto: Number(p.monto_pagado), fecha: formatoFecha(p.fecha_pago) }))
      : [];

  return (
    <View style={{ gap: 14 }}>
      <Boton titulo="Crear Evento" icono="add-circle" onPress={() => setModalCrear(true)} />

      {eventos.length === 0 ? (
        <Card>
          <Vacio icono="calendar-outline" titulo="No hay eventos" texto="Cuando tu red o tu grupo creen un encuentro o campamento, aparece acá." />
        </Card>
      ) : null}

      {eventos.map((ev) => {
        const costo = Number(ev.costo_total) || 0;
        const moneda = ev.moneda ?? 'ARS';
        const f = (v: number) => formatoMoneda(v, moneda);
        const recaudado = miembros.reduce((a, m) => a + pagadoPor(ev.id, m.id), 0);
        const pagaron = miembros.filter((m) => costo > 0 && pagadoPor(ev.id, m.id) >= costo).length;
        const meta = costo * miembros.length;
        const progreso = meta ? Math.min(100, (recaudado / meta) * 100) : 0;
        const esMeta = progreso >= 100 && meta > 0;
        const esActivo = eventoActivo === ev.id;
        const alcance = ev.grupo_id ? 'De este grupo' : ev.red_id ? 'De la red' : 'Toda la iglesia';

        return (
          <Card
            key={ev.id}
            style={{
              padding: 16,
              borderRadius: 20,
              borderWidth: esMeta ? 2 : 0,
              borderColor: esMeta ? '#10B981' : 'transparent',
              backgroundColor: esMeta ? '#F0FDF4' : 'white',
              overflow: 'hidden',
            }}
          >
            {confetiId === ev.id && (
              <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center', opacity: anim }}>
                <Text style={{ fontSize: 50 }}>🎉 🎊 ✨ 🎉</Text>
                <Text style={{ fontWeight: '900', fontSize: 18, color: '#065F46', marginTop: 6 }}>¡META COMPLETADA!</Text>
              </Animated.View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name={ICONO_EVENTO[ev.tipo]} size={22} color={colors.warning} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', fontSize: 17 }}>{ev.nombre}</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  {formatoFecha(ev.fecha_evento)} · {costo ? `${f(costo)} por persona` : 'Gratis'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <Badge texto={TIPO_EVENTO_LABEL[ev.tipo]} color={colors.warning} />
              <Badge texto={alcance} color={colors.purple} />
            </View>

            {costo > 0 ? (
              <>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>
                  <Text style={{ fontWeight: '800', color: '#6366F1' }}>
                    {pagaron}/{miembros.length} pagaron
                  </Text>
                  {' · '}
                  <Text style={{ fontWeight: '800', color: esMeta ? '#10B981' : '#6366F1' }}>{f(recaudado)} recaudado</Text>
                </Text>
                <View style={{ height: 12, backgroundColor: '#F3F4F6', borderRadius: 10, marginTop: 8, overflow: 'hidden' }}>
                  <View style={{ height: 12, width: `${progreso}%`, backgroundColor: esMeta ? '#10B981' : progreso >= 70 ? '#6366F1' : '#F59E0B' }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{Math.round(progreso)}% de la meta</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#6B7280' }}>Meta {f(meta)}</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setEventoActivo(esActivo ? null : ev.id)}
                  style={{ marginTop: 14, backgroundColor: esMeta ? '#10B981' : '#111827', padding: 12, borderRadius: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: 'white' }}>{esActivo ? '▲ Ocultar' : '▼ Ver pagos'}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {esActivo &&
              miembros.map((m) => {
                const monto = pagadoPor(ev.id, m.id);
                const completo = monto >= costo && costo > 0;
                const parcial = monto > 0 && !completo;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => {
                      setEventoSel(ev);
                      setMiembroSel(m);
                      setModalPago(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: completo ? '#D1FAE5' : parcial ? '#FEF3C7' : 'white',
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: completo ? '#10B981' : parcial ? '#FBBF24' : '#F3F4F6',
                      marginTop: 8,
                    }}
                  >
                    <Text style={{ fontWeight: '700' }}>{`${m.nombre} ${m.apellido ?? ''}`.trim()}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: completo ? '#065F46' : parcial ? '#92400E' : '#9CA3AF' }}>
                      {completo ? `Pagó ${f(monto)}` : parcial ? `Puso ${f(monto)} · Falta ${f(costo - monto)}` : 'Pendiente'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

            {esActivo ? (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/evento/[id]', params: { id: ev.id, grupo: grupoId } })}
                style={{ marginTop: 12, alignItems: 'center', padding: 8 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Ver historial de cuotas →</Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        );
      })}

      {miembroSel && eventoSel ? (
        <ModalPagoGuia
          visible={modalPago}
          onClose={() => setModalPago(false)}
          onGuardar={guardarPago}
          cargando={guardandoPago}
          miembro={{
            nombre: `${miembroSel.nombre} ${miembroSel.apellido ?? ''}`.trim(),
            yaPagado: pagadoPor(eventoSel.id, miembroSel.id),
            historial: historialSel,
          }}
          evento={{ titulo: eventoSel.nombre, precio: Number(eventoSel.costo_total) || 0, moneda: eventoSel.moneda }}
        />
      ) : null}

      <FormEvento
        visible={modalCrear}
        onClose={() => setModalCrear(false)}
        onGuardado={cargar}
        alcances={alcances}
        grupoId={grupoId}
        redId={redGrupo}
      />
    </View>
  );
}
