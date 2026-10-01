import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Evento } from '@/lib/types';
import { formatoFecha, formatoMoneda } from '@/lib/utils';
import { BarraProgreso, Card, Cargando, s } from '@/components/ui';
import { Alcance, FormEvento, ICONO_EVENTO } from '@/components/eventos/FormEvento';

interface ResumenGrupo {
  grupoId: string;
  grupo: string;
  total: number;
  pagaron: number;
  miembros: { nombre: string; pagado: number }[];
}

/** Eventos de una red (y los de toda la iglesia), con el resumen de pagos por grupo. */
export default function EventosMisionJoven({ redId, puedeGeneral = false }: { redId: string; puedeGeneral?: boolean }) {
  const router = useRouter();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [resumen, setResumen] = useState<ResumenGrupo[]>([]);
  const [eventoActivo, setEventoActivo] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [cargando, setCargando] = useState(true);

  const load = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('eventos')
      .select('*')
      .is('grupo_id', null)
      .or(`red_id.eq.${redId},red_id.is.null`)
      .order('fecha_evento', { ascending: true, nullsFirst: false });
    if (error) Alert.alert('Error al cargar eventos', error.message);
    setEventos((data ?? []) as Evento[]);
    setCargando(false);
  }, [redId]);

  useEffect(() => {
    load();
    setEventoActivo(null);
  }, [load]);

  const borrar = (ev: Evento) => {
    Alert.alert('Borrar evento', `¿Borrar "${ev.nombre}"? Se borran también todos sus pagos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('eventos').delete().eq('id', ev.id);
          if (error) Alert.alert('No se pudo borrar', error.message);
          else load();
        },
      },
    ]);
  };

  const verResumen = async (ev: Evento) => {
    if (eventoActivo === ev.id) {
      setEventoActivo(null);
      return;
    }
    setEventoActivo(ev.id);
    setResumen([]);

    const { data: grupos } = await supabase.from('groups').select('id, nombre').eq('red_id', redId).order('nombre');
    const idsGrupos = (grupos ?? []).map((g: { id: string }) => g.id);
    if (idsGrupos.length === 0) return;
    const { data: miembros } = await supabase
      .from('miembros_grupo')
      .select('id, grupo_id, nombre, apellido')
      .eq('activo', true)
      .in('grupo_id', idsGrupos);
    const listaMiembros = (miembros ?? []) as { id: string; grupo_id: string; nombre: string; apellido: string | null }[];
    const { data: pagos } = listaMiembros.length
      ? await supabase.from('pagos_evento').select('miembro_id, monto_pagado').eq('evento_id', ev.id).in('miembro_id', listaMiembros.map((m) => m.id))
      : { data: [] };

    const pagadoPor = new Map<string, number>();
    (pagos ?? []).forEach((p: { miembro_id: string; monto_pagado: number }) =>
      pagadoPor.set(p.miembro_id, (pagadoPor.get(p.miembro_id) ?? 0) + Number(p.monto_pagado))
    );
    const costo = Number(ev.costo_total) || 0;

    setResumen(
      (grupos ?? []).map((g: { id: string; nombre: string }) => {
        const delGrupo = listaMiembros.filter((m) => m.grupo_id === g.id);
        const lista = delGrupo.map((m) => ({ nombre: `${m.nombre} ${m.apellido ?? ''}`.trim(), pagado: pagadoPor.get(m.id) ?? 0 }));
        return {
          grupoId: g.id,
          grupo: g.nombre,
          total: lista.reduce((a, x) => a + x.pagado, 0),
          pagaron: lista.filter((x) => costo > 0 && x.pagado >= costo).length,
          miembros: lista,
        };
      })
    );
  };

  if (cargando) return <Cargando />;

  const alcances: Alcance[] = puedeGeneral ? ['red', 'iglesia'] : ['red'];

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.fila, { justifyContent: 'space-between', marginTop: 8 }]}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '800' }}>Eventos de la red</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>{eventos.length} eventos</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setEditando(null);
            setModal(true);
          }}
          style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {eventos.map((ev) => {
        const costo = Number(ev.costo_total) || 0;
        const f = (v: number) => formatoMoneda(v, ev.moneda ?? 'ARS');
        const totalRed = resumen.reduce((a, r) => a + r.total, 0);
        const personas = resumen.reduce((a, r) => a + r.miembros.length, 0);
        return (
          <Card key={ev.id} style={{ paddingVertical: 14 }}>
            <View style={[s.fila, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICONO_EVENTO[ev.tipo]} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: '#111827' }}>{ev.nombre}</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>
                    {formatoFecha(ev.fecha_evento)} · {costo ? f(costo) : 'Gratis'}
                  </Text>
                  {ev.red_id === null ? <Text style={{ fontSize: 11, color: colors.purple, fontWeight: '700' }}>Toda la iglesia</Text> : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => {
                    setEditando(ev);
                    setModal(true);
                  }}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="pencil" size={16} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => borrar(ev)}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="trash" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </View>

            {costo > 0 ? (
              <TouchableOpacity
                onPress={() => verResumen(ev)}
                style={{ marginTop: 10, backgroundColor: eventoActivo === ev.id ? '#111827' : '#6366F1', padding: 12, borderRadius: 20, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: 'white' }}>{eventoActivo === ev.id ? 'Ocultar pagos' : 'Ver pagos por GV'}</Text>
              </TouchableOpacity>
            ) : null}

            {eventoActivo === ev.id && (
              <View style={{ marginTop: 12, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, gap: 8 }}>
                {resumen.length === 0 ? (
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Cargando o sin grupos en la red...</Text>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '800' }}>
                      Red: {f(totalRed)} de {f(costo * personas)}
                    </Text>
                    <BarraProgreso valor={costo * personas ? totalRed / (costo * personas) : 0} color={colors.success} />
                    {resumen.map((r) => (
                      <View key={r.grupoId} style={{ backgroundColor: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#F3F4F6' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', flex: 1 }}>{r.grupo}</Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#059669' }}>
                            {f(r.total)} · {r.pagaron}/{r.miembros.length}
                          </Text>
                        </View>
                        <View style={{ marginTop: 6, gap: 3 }}>
                          {r.miembros
                            .filter((m) => m.pagado > 0)
                            .map((m, idx) => (
                              <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 11, color: '#6B7280' }}>{m.nombre}</Text>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: m.pagado >= costo ? '#059669' : '#F59E0B' }}>
                                  {f(m.pagado)} {m.pagado >= costo ? '✓' : `(falta ${f(costo - m.pagado)})`}
                                </Text>
                              </View>
                            ))}
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => router.push({ pathname: '/evento/[id]', params: { id: ev.id } })} style={{ alignItems: 'center', padding: 6 }}>
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Ver detalle y cuotas →</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </Card>
        );
      })}

      <FormEvento visible={modal} onClose={() => setModal(false)} onGuardado={load} alcances={alcances} redId={redId} evento={editando} />
    </View>
  );
}
