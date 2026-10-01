import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import type { Habito, Miembro, RegistroDiario } from '@/lib/types';
import { MESES, cumpleProximo, formatoCumple, nombreCompleto, parseCumple, porcentaje, rangoMes } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton, Campo, Card, Cargando, HojaModal, SeccionTitulo, Stat, Vacio, s } from '@/components/ui';

interface AnalisisHabito {
  habito: Habito;
  hechos: number;
  total: number;
}

interface AnalisisMiembro {
  miembro: Miembro;
  porHabito: AnalisisHabito[];
  hechos: number;
  total: number;
  pct: number;
}

export function MiembrosTab({
  grupoId,
  grupoNombre,
  refreshKey,
}: {
  grupoId: string;
  grupoNombre: string;
  refreshKey: number;
}) {
  const hoy = new Date();
  const [mes, setMes] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [habitos, setHabitos] = useState<Habito[]>([]);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [reuniones, setReuniones] = useState<{ id: string; fecha: string; asistencias: { miembro_id: string; presente: boolean }[] }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const router = useRouter();
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', cumple: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { inicio, fin } = rangoMes(mes.anio, mes.mes);
    const [m, h, re] = await Promise.all([
      supabase.from('miembros_grupo').select('*').eq('grupo_id', grupoId).eq('activo', true).order('nombre'),
      supabase.from('habitos').select('*').eq('grupo_id', grupoId).order('creado_en'),
      supabase
        .from('reuniones')
        .select('id, fecha, asistencias(miembro_id, presente)')
        .eq('grupo_id', grupoId)
        .gte('fecha', inicio)
        .lte('fecha', fin),
    ]);
    setReuniones((re.data ?? []) as any);
    if (m.error || h.error) Alert.alert('Error', (m.error ?? h.error)?.message ?? '');
    const hs = (h.data ?? []) as Habito[];
    let regs: RegistroDiario[] = [];
    if (hs.length > 0) {
      const r = await supabase
        .from('registros_diarios')
        .select('habito_id, miembro_id, fecha, completado')
        .in('habito_id', hs.map((x) => x.id))
        .gte('fecha', inicio)
        .lte('fecha', fin);
      if (r.error) Alert.alert('Error', r.error.message);
      regs = (r.data ?? []) as RegistroDiario[];
    }
    setMiembros((m.data ?? []) as Miembro[]);
    setHabitos(hs);
    setRegistros(regs);
    setCargando(false);
  }, [grupoId, mes]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  // Un día "cuenta" para un hábito si el guía registró algo ese día.
  // Así sirve tanto para hábitos diarios (lectura) como semanales (asistencia al grupo).
  const analisis = useMemo<AnalisisMiembro[]>(() => {
    const diasPorHabito = new Map<string, Set<string>>();
    registros.forEach((r) => {
      if (!diasPorHabito.has(r.habito_id)) diasPorHabito.set(r.habito_id, new Set());
      diasPorHabito.get(r.habito_id)!.add(r.fecha);
    });
    return miembros.map((miembro) => {
      const porHabito = habitos.map((habito) => ({
        habito,
        hechos: registros.filter((r) => r.habito_id === habito.id && r.miembro_id === miembro.id && r.completado).length,
        total: diasPorHabito.get(habito.id)?.size ?? 0,
      }));
      // La asistencia a las reuniones es el dato principal; los hábitos, el complemento
      if (reuniones.length > 0) {
        const vino = reuniones.filter((r) => (r.asistencias ?? []).some((a) => a.miembro_id === miembro.id && a.presente)).length;
        const asistencia = {
          habito: { id: 'asistencia', grupo_id: grupoId, nombre: 'Asistencia a reuniones', creado_en: '' },
          hechos: vino,
          total: reuniones.length,
        };
        return {
          miembro,
          porHabito: [asistencia, ...porHabito],
          hechos: vino,
          total: reuniones.length,
          pct: porcentaje(vino, reuniones.length),
        };
      }
      const hechos = porHabito.reduce((a, x) => a + x.hechos, 0);
      const total = porHabito.reduce((a, x) => a + x.total, 0);
      return { miembro, porHabito, hechos, total, pct: porcentaje(hechos, total) };
    });
  }, [miembros, habitos, registros, reuniones, grupoId]);

  const conDatos = analisis.filter((a) => a.total > 0);
  const promedio = conDatos.length ? Math.round(conDatos.reduce((a, x) => a + x.pct, 0) / conDatos.length) : 0;
  const enRiesgo = conDatos.filter((a) => a.pct < 50).length;
  const nombreMes = `${MESES[mes.mes]} ${mes.anio}`;

  const moverMes = (delta: number) => {
    setMes((prev) => {
      const d = new Date(prev.anio, prev.mes + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  };

  const compartir = async () => {
    const lineas = [`📊 Análisis de ${nombreMes}`, `Grupo: ${grupoNombre}`, `Promedio del grupo: ${promedio}%`, ''];
    analisis.forEach((a) => {
      lineas.push(`• ${nombreCompleto(a.miembro)}: ${a.total ? `${a.pct}%` : 'sin registros'}`);
      a.porHabito
        .filter((h) => h.total > 0)
        .forEach((h) => {
          const faltas = h.total - h.hechos;
          lineas.push(`   ${h.habito.nombre}: ${h.hechos}/${h.total}${faltas > 0 ? ` (faltó ${faltas})` : ''}`);
        });
    });
    try {
      await Share.share({ message: lineas.join('\n') });
    } catch (e) {
      Alert.alert('No se pudo compartir', e instanceof Error ? e.message : String(e));
    }
  };

  const agregar = async () => {
    if (!form.nombre.trim()) {
      Alert.alert('Falta el nombre', 'Escribí al menos el nombre del miembro.');
      return;
    }
    const cumple = form.cumple.trim() ? parseCumple(form.cumple) : null;
    if (form.cumple.trim() && !cumple) {
      Alert.alert('Cumpleaños inválido', 'Escribilo como día/mes, por ejemplo 25/12, o con el año: 25/12/1998.');
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from('miembros_grupo').insert({
      cumpleanos: cumple,
      grupo_id: grupoId,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      telefono: form.telefono.trim() || null,
    });
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo agregar', error.message);
      return;
    }
    setForm({ nombre: '', apellido: '', telefono: '', cumple: '' });
    setModal(false);
    cargar();
  };

  const quitar = (m: Miembro) => {
    Alert.alert('Quitar del grupo', `¿Quitar a ${nombreCompleto(m)} del grupo? Su historial se conserva.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('miembros_grupo').update({ activo: false }).eq('id', m.id);
          if (error) Alert.alert('No se pudo quitar', error.message);
          else cargar();
        },
      },
    ]);
  };

  return (
    <View>
      <View style={[s.fila, { gap: 10, marginBottom: 12 }]}>
        <Boton titulo="Agregar miembro" icono="person-add" onPress={() => setModal(true)} style={{ flex: 1 }} />
        {analisis.length > 0 ? (
          <Boton titulo="Compartir" icono="share-outline" variante="secundario" onPress={compartir} />
        ) : null}
      </View>

      <View style={[s.fila, { justifyContent: 'space-between', marginTop: 8, marginBottom: 10 }]}>
        <Pressable onPress={() => moverMes(-1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Análisis de {nombreMes}</Text>
        <Pressable onPress={() => moverMes(1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {cargando ? (
        <Cargando />
      ) : miembros.length === 0 ? (
        <Card>
          <Vacio icono="people-outline" titulo="Todavía no hay miembros" texto="Agregá a los hermanos de tu grupo de vida para empezar." />
        </Card>
      ) : (
        <>
          <View style={[s.fila, { gap: 10, marginBottom: 10 }]}>
            <Stat etiqueta={reuniones.length ? "Asistencia" : "Promedio"} valor={`${promedio}%`} icono="stats-chart" color={colorPorcentaje(promedio)} />
            <Stat etiqueta="Miembros" valor={String(miembros.length)} icono="people" color={colors.primary} />
            <Stat etiqueta="Bajo 50%" valor={String(enRiesgo)} icono="alert-circle" color={colors.danger} />
          </View>

          <SeccionTitulo titulo="Hermanos" />
          {analisis.map((a) => {
            const abierto = expandido === a.miembro.id;
            const color = a.total ? colorPorcentaje(a.pct) : colors.textTer;
            return (
              <Card
                key={a.miembro.id}
                onPress={() => router.push({ pathname: '/miembro/[id]', params: { id: a.miembro.id } })}
                onLongPress={() => quitar(a.miembro)}
              >
                <View style={s.fila}>
                  <Avatar nombre={nombreCompleto(a.miembro)} color={color} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.textoFila}>{nombreCompleto(a.miembro)}</Text>
                    {a.miembro.telefono ? <Text style={s.textoFilaSec}>{a.miembro.telefono}</Text> : null}
                    {cumpleProximo(a.miembro.cumpleanos) ? (
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                        Cumple el {formatoCumple(a.miembro.cumpleanos).slice(0, 5)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color, fontSize: 20, fontWeight: '700' }}>{a.total ? `${a.pct}%` : '—'}</Text>
                </View>
                <View style={{ marginTop: 12 }}>
                  <BarraProgreso valor={a.pct / 100} color={color} />
                </View>
                {abierto ? (
                  <View style={{ marginTop: 12 }}>
                    {a.porHabito.length === 0 ? (
                      <Text style={s.textoFilaSec}>El grupo no tiene hábitos cargados.</Text>
                    ) : (
                      a.porHabito.map((h) => {
                        const faltas = h.total - h.hechos;
                        return (
                          <View key={h.habito.id} style={[s.fila, { justifyContent: 'space-between', paddingVertical: 6 }]}>
                            <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{h.habito.nombre}</Text>
                            <Text style={{ color: colors.textSec, fontSize: 14 }}>
                              {h.total ? `${h.hechos}/${h.total}` : 'Sin registros'}
                              {faltas > 0 ? <Text style={{ color: colors.danger }}>{`  · faltó ${faltas}`}</Text> : null}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : null}
              </Card>
            );
          })}
          <Text style={[s.textoFilaSec, { marginLeft: 4 }]}>
            Tocá un hermano para ver su historial y editar sus datos. Mantenelo apretado para quitarlo del grupo.
          </Text>
        </>
      )}

      <HojaModal visible={modal} onClose={() => setModal(false)} titulo="Agregar miembro">
        <Campo etiqueta="Nombre" value={form.nombre} onChangeText={(v) => setForm({ ...form, nombre: v })} autoFocus />
        <Campo etiqueta="Apellido" value={form.apellido} onChangeText={(v) => setForm({ ...form, apellido: v })} />
        <Campo
          etiqueta="Teléfono (opcional)"
          value={form.telefono}
          onChangeText={(v) => setForm({ ...form, telefono: v })}
          keyboardType="phone-pad"
        />
        <Campo
          etiqueta="Cumpleaños (opcional)"
          placeholder="25/12"
          value={form.cumple}
          onChangeText={(v) => setForm({ ...form, cumple: v })}
          keyboardType="numbers-and-punctuation"
        />
        <Boton titulo="Agregar miembro" onPress={agregar} cargando={guardando} />
      </HojaModal>
    </View>
  );
}
