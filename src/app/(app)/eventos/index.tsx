import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Evento, Moneda, Pago } from '@/lib/types';
import { TIPO_EVENTO_LABEL, formatoFecha, formatoMoneda } from '@/lib/utils';
import { diasHasta } from '@/lib/eventosDatos';
import { BarrasH, Kpi, PALETA, Progreso } from '@/components/eventos/Graficos';
import { FormEvento, ICONO_EVENTO } from '@/components/eventos/FormEvento';
import { Boton, Card, Cargando, Chip, SeccionTitulo, s } from '@/components/ui';

interface Resumen {
  evento: Evento;
  grupo: string | null;
  anotados: number;
  recaudado: number;
  esperado: number;
  pagaron: number;
  cuotas: number;
  sinPagar: number;
}
type Vista = 'proximos' | 'pasados' | 'todos';

/** Centro de Eventos de una red: todos los eventos, con su recaudación de un vistazo */
export default function CentroEventos() {
  const { red, nombre } = useLocalSearchParams<{ red: string; nombre?: string }>();
  const [lista, setLista] = useState<Resumen[] | null>(null);
  const [vista, setVista] = useState<Vista>('proximos');
  const [refrescando, setRefrescando] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    if (!red) return;
    const { data: gr } = await supabase.from('groups').select('id, nombre').eq('red_id', red);
    const grupos = (gr ?? []) as { id: string; nombre: string }[];
    const ids = grupos.map((g) => g.id);
    const filtro = ids.length ? `red_id.eq.${red},grupo_id.in.(${ids.join(',')})` : `red_id.eq.${red}`;
    const { data: evs } = await supabase.from('eventos').select('*').or(filtro).order('fecha_evento', { ascending: true });
    const eventos = (evs ?? []) as Evento[];
    const idsEv = eventos.map((e) => e.id);
    const [pg, ins] = idsEv.length
      ? await Promise.all([
          supabase.from('pagos_evento').select('evento_id, miembro_id, monto_pagado').in('evento_id', idsEv),
          supabase.from('evento_inscriptos').select('evento_id, miembro_id').in('evento_id', idsEv),
        ])
      : [{ data: [] }, { data: [] }];
    const pagos = (pg.data ?? []) as Pick<Pago, 'evento_id' | 'miembro_id' | 'monto_pagado'>[];
    const inscriptos = (ins.data ?? []) as { evento_id: string; miembro_id: string }[];
    setLista(
      eventos.map((e) => {
        const costo = Number(e.costo_total ?? 0);
        const personas = new Set([...inscriptos.filter((i) => i.evento_id === e.id).map((i) => i.miembro_id), ...pagos.filter((p) => p.evento_id === e.id).map((p) => p.miembro_id)]);
        const pagadoDe = (m: string) => pagos.filter((p) => p.evento_id === e.id && p.miembro_id === m).reduce((a, p) => a + Number(p.monto_pagado), 0);
        let pagaron = 0;
        let cuotas = 0;
        let sinPagar = 0;
        let recaudado = 0;
        personas.forEach((m) => {
          const v = pagadoDe(m);
          recaudado += v;
          if (v <= 0) sinPagar++;
          else if (costo === 0 || v >= costo) pagaron++;
          else cuotas++;
        });
        return {
          evento: e,
          grupo: e.grupo_id ? grupos.find((g) => g.id === e.grupo_id)?.nombre ?? 'Grupo' : null,
          anotados: personas.size,
          recaudado,
          esperado: personas.size * costo,
          pagaron,
          cuotas,
          sinPagar,
        };
      })
    );
  }, [red]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const r = lista.filter((x) => {
      const d = diasHasta(x.evento.fecha_evento);
      if (vista === 'todos') return true;
      if (vista === 'proximos') return d === null || d >= 0;
      return d !== null && d < 0;
    });
    return vista === 'pasados' ? r.slice().reverse() : r;
  }, [lista, vista]);

  if (!lista) return <Cargando texto="Cargando los eventos..." />;

  // Totales por moneda (no se mezclan pesos con dólares)
  const activos = lista.filter((x) => (x.evento.estado ?? 'activo') === 'activo' && (diasHasta(x.evento.fecha_evento) ?? 0) >= 0);
  const porMoneda = (m: Moneda) => activos.filter((x) => (x.evento.moneda ?? 'ARS') === m);
  const suma = (l: Resumen[], k: 'recaudado' | 'esperado') => l.reduce((a, x) => a + x[k], 0);
  const ars = porMoneda('ARS');
  const usd = porMoneda('USD');

  return (
    <>
      <Stack.Screen options={{ title: 'Centro de Eventos' }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }} tintColor={colors.textSec} />}
      >
        <View style={{ backgroundColor: '#1F3A5F', borderRadius: 18, padding: 18, marginBottom: 14 }}>
          <Text style={{ color: '#C7D7EE', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>CENTRO DE EVENTOS{nombre ? ` · ${String(nombre).toUpperCase()}` : ''}</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 6 }}>
            {activos.length} {activos.length === 1 ? 'evento en curso' : 'eventos en curso'}
          </Text>
          <Text style={{ color: '#C7D7EE', fontSize: 13, marginTop: 4 }}>Inscripciones, pagos y planillas de todos los eventos de la red.</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Kpi titulo="Recaudado" valor={formatoMoneda(suma(ars, 'recaudado'), 'ARS')} detalle={usd.length ? `+ ${formatoMoneda(suma(usd, 'recaudado'), 'USD')}` : 'en eventos en curso'} icono="cash-outline" color={PALETA.pagado} />
          <Kpi
            titulo="Por cobrar"
            valor={formatoMoneda(Math.max(0, suma(ars, 'esperado') - suma(ars, 'recaudado')), 'ARS')}
            detalle={usd.length ? `+ ${formatoMoneda(Math.max(0, suma(usd, 'esperado') - suma(usd, 'recaudado')), 'USD')}` : undefined}
            icono="hourglass-outline"
            color={PALETA.cuotas}
          />
          <Kpi titulo="Anotados" valor={String(activos.reduce((a, x) => a + x.anotados, 0))} detalle="en eventos en curso" icono="people-outline" color={PALETA.azul} />
          <Kpi titulo="Sin pagar" valor={String(activos.reduce((a, x) => a + x.sinPagar, 0))} detalle="anotados que no pagaron nada" icono="alert-circle-outline" color={PALETA.sinPagar} />
        </View>

        {activos.length > 1 ? (
          <Card style={{ marginTop: 14 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>Recaudación por evento</Text>
            <BarrasH
              filas={activos
                .filter((x) => (x.evento.moneda ?? 'ARS') === 'ARS')
                .map((x) => ({ etiqueta: x.evento.nombre, valor: x.recaudado, meta: x.esperado || undefined, detalle: `${x.anotados} anotados` }))}
              formato={(n) => formatoMoneda(n, 'ARS')}
              colorFijo={PALETA.azul}
            />
          </Card>
        ) : null}

        <Boton titulo="Nuevo evento" icono="add-circle-outline" onPress={() => setCreando(true)} style={{ marginTop: 14 }} />

        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <Chip texto="Próximos" activo={vista === 'proximos'} onPress={() => setVista('proximos')} />
          <Chip texto="Pasados" activo={vista === 'pasados'} onPress={() => setVista('pasados')} />
          <Chip texto="Todos" activo={vista === 'todos'} onPress={() => setVista('todos')} />
        </View>

        <SeccionTitulo titulo={vista === 'proximos' ? 'Próximos eventos' : vista === 'pasados' ? 'Eventos pasados' : 'Todos los eventos'} />
        {filtrados.length === 0 ? (
          <Card>
            <Text style={s.textoFilaSec}>{vista === 'proximos' ? 'No hay eventos próximos. Creá uno con "Nuevo evento".' : 'No hay eventos en esta lista.'}</Text>
          </Card>
        ) : (
          filtrados.map((x) => {
            const e = x.evento;
            const fmt = (n: number) => formatoMoneda(n, e.moneda ?? 'ARS');
            const d = diasHasta(e.fecha_evento);
            const avance = x.esperado ? x.recaudado / x.esperado : 0;
            return (
              <Card key={e.id} onPress={() => router.push({ pathname: '/evento/[id]', params: { id: e.id } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Ionicons name={ICONO_EVENTO[e.tipo] ?? 'calendar'} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{e.nombre}</Text>
                    <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
                      {[TIPO_EVENTO_LABEL[e.tipo], e.fecha_evento ? formatoFecha(e.fecha_evento) : null, e.lugar, x.grupo ? `solo ${x.grupo}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {d !== null && d >= 0 ? (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 18 }}>{d}</Text>
                      <Text style={{ color: colors.textSec, fontSize: 10 }}>{d === 1 ? 'día' : 'días'}</Text>
                    </View>
                  ) : e.estado && e.estado !== 'activo' ? (
                    <Text style={{ color: colors.textSec, fontSize: 11, fontWeight: '700' }}>{e.estado.toUpperCase()}</Text>
                  ) : null}
                </View>
                {Number(e.costo_total) > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                        {fmt(x.recaudado)} <Text style={{ color: colors.textSec, fontWeight: '400' }}>de {fmt(x.esperado)}</Text>
                      </Text>
                      <Text style={{ color: colors.textSec, fontSize: 12 }}>{Math.round(avance * 100)}%</Text>
                    </View>
                    <Progreso pct={avance} alto={8} />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <Text style={{ color: colors.textSec, fontSize: 12 }}>
                    <Ionicons name="people" size={12} /> {x.anotados}
                    {e.cupo ? `/${e.cupo}` : ''} anotados
                  </Text>
                  <Text style={{ color: PALETA.pagado, fontSize: 12, fontWeight: '700' }}>● {x.pagaron} pagaron</Text>
                  <Text style={{ color: PALETA.cuotas, fontSize: 12, fontWeight: '700' }}>● {x.cuotas} en cuotas</Text>
                  <Text style={{ color: PALETA.sinPagar, fontSize: 12, fontWeight: '700' }}>● {x.sinPagar} sin pagar</Text>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      <FormEvento visible={creando} onClose={() => setCreando(false)} onGuardado={cargar} alcances={['red']} redId={red ?? null} />
    </>
  );
}
