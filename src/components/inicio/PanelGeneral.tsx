import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colorPorcentaje, colors } from '@/lib/theme';
import type { Evento, Perfil, RegistroDiario } from '@/lib/types';
import { ROL_LABEL, formatoFecha, formatoMoneda, hoyISO, nombreCompleto, porcentaje, semanaHasta } from '@/lib/utils';
import {
  Avatar, Badge, BarraProgreso, Boton, Card, Cargando, Chip, Pantalla, SeccionTitulo, Stat, TituloGrande, Vacio, s,
} from '@/components/ui';
import { GraficoHabitos, GraficoRecaudacion, TarjetaGrafico } from '@/components/Graficos';
import { FormEvento, ICONO_EVENTO } from '@/components/eventos/FormEvento';

interface GrupoLite { id: string; nombre: string; }
interface MiembroLite { id: string; grupo_id: string; }
interface HabitoLite { id: string; grupo_id: string; }
interface PagoLite { evento_id: string; monto_pagado: number; }

export function PanelGeneral({ perfil }: { perfil: Perfil }) {
  const router = useRouter()
  const esApostol = perfil.rol === 'apostol';
  const esPastor = perfil.rol === 'pastor';
  const titulo = esApostol ? 'Panel Apostólico' : esPastor ? 'Panel Pastoral' : 'Panel';

  const [grupos, setGrupos] = useState<GrupoLite[]>([]);
  const [miembros, setMiembros] = useState<MiembroLite[]>([]);
  const [habitos, setHabitos] = useState<HabitoLite[]>([]);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [pagos, setPagos] = useState<PagoLite[]>([]);
  const [lideres, setLideres] = useState<Perfil[]>([]);
  const [eventoSel, setEventoSel] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [modalEvento, setModalEvento] = useState(false);

  const cargar = useCallback(async () => {
    const dias = semanaHasta(hoyISO());
    const consultaLideres = esApostol
   ? supabase.from('profiles').select('*').in('rol', ['pastor', 'guia_supervisor', 'consolidacion']).order('nombre')
      : supabase.from('profiles').select('*').eq('supervisor_id', perfil.id).order('nombre');

    const gruposQuery = supabase.from('groups').select('id, nombre').order('nombre');

    const [g, m, h, r, e, p, l] = await Promise.all([
      gruposQuery,
      supabase.from('miembros_grupo').select('id, grupo_id').eq('activo', true),
      supabase.from('habitos').select('id, grupo_id'),
      supabase.from('registros_diarios').select('habito_id, miembro_id, fecha, completado').gte('fecha', dias[0]).lte('fecha', dias[6]),
      supabase.from('eventos').select('*').order('fecha_evento', { ascending: false, nullsFirst: false }),
      supabase.from('pagos_evento').select('evento_id, monto_pagado'),
      consultaLideres,
    ]);

    const listaEventos = (e.data?? []) as Evento[];
    setGrupos((g.data?? []) as GrupoLite[]);
    setMiembros((m.data?? []) as MiembroLite[]);
    setHabitos((h.data?? []) as HabitoLite[]);
    setRegistros((r.data?? []) as RegistroDiario[]);
    setEventos(listaEventos);
    setPagos((p.data?? []) as PagoLite[]);
    setLideres((l.data?? []) as Perfil[]);
    setEventoSel((prev) => {
      if (prev && listaEventos.some((x) => x.id === prev)) return prev;
      const hoy = hoyISO();
      const campamentos = listaEventos.filter((x) => x.tipo === 'campamento');
      const proximo = [...campamentos].filter((x) => x.fecha_evento && x.fecha_evento >= hoy).sort((a, b) => (a.fecha_evento?? '').localeCompare(b.fecha_evento?? ''))[0];
      return proximo?.id?? campamentos[0]?.id?? listaEventos[0]?.id?? null;
    });
    setCargando(false);
  }, [esApostol, perfil.id]);

  useEffect(() => { cargar(); }, [cargar]);
  const refrescar = async () => { setRefrescando(true); await cargar(); setRefrescando(false); };

  const miembrosPorGrupo = useMemo(() => { const mapa = new Map<string, number>(); miembros.forEach((m) => mapa.set(m.grupo_id, (mapa.get(m.grupo_id)?? 0) + 1)); return mapa; }, [miembros]);
  const grupoDeHabito = useMemo(() => new Map(habitos.map((h) => [h.id, h.grupo_id])), [habitos]);
  const miembrosActivos = useMemo(() => new Set(miembros.map((m) => m.id)), [miembros]);
  const cumplimiento = useMemo(() => {
    const esperadoPorGrupo = new Map<string, number>(); const hechosPorGrupo = new Map<string, number>(); const vistos = new Set<string>();
    registros.forEach((r) => { const grupo = grupoDeHabito.get(r.habito_id); if (!grupo ||!miembrosActivos.has(r.miembro_id)) return; const clave = `${r.habito_id}|${r.fecha}`; if (!vistos.has(clave)) { vistos.add(clave); esperadoPorGrupo.set(grupo, (esperadoPorGrupo.get(grupo)?? 0) + (miembrosPorGrupo.get(grupo)?? 0)); } if (r.completado) hechosPorGrupo.set(grupo, (hechosPorGrupo.get(grupo)?? 0) + 1); });
    let esperado = 0; let hechos = 0; esperadoPorGrupo.forEach((v) => (esperado += v)); hechosPorGrupo.forEach((v) => (hechos += v));
    const porGrupo = grupos.map((g) => ({ grupo: g, pct: porcentaje(hechosPorGrupo.get(g.id)?? 0, esperadoPorGrupo.get(g.id)?? 0), }));
    return { global: porcentaje(hechos, esperado), porGrupo };
  }, [registros, grupoDeHabito, miembrosActivos, miembrosPorGrupo, grupos]);

  const recaudacion = useMemo(() => eventos.map((ev) => { const recaudado = pagos.filter((p) => p.evento_id === ev.id).reduce((a, p) => a + Number(p.monto_pagado), 0); const personas = ev.grupo_id? miembrosPorGrupo.get(ev.grupo_id)?? 0 : miembros.length; const meta = Number(ev.costo_total) * personas; return { evento: ev, recaudado, meta, falta: Math.max(0, meta - recaudado) }; }), [eventos, pagos, miembrosPorGrupo, miembros.length]);

  const seleccion = recaudacion.find((x) => x.evento.id === eventoSel);
  const pastores = lideres.filter((l) => l.rol === 'pastor');
  const supervisores = esApostol? lideres.filter((l) => l.rol!== 'pastor') : lideres;
  if (cargando) return <Cargando texto="Cargando panel..." />;

  const tarjetaLider = (l: Perfil) => (
    <Card key={l.id} onPress={() => router.push({ pathname: '/equipo/[id]', params: { id: l.id } })}>
      <View style={s.fila}><Avatar nombre={nombreCompleto(l)} color={ROL_COLOR[l.rol]} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={s.textoFila}>{nombreCompleto(l)}</Text><Text style={s.textoFilaSec}>{l.email}</Text></View><Badge texto={ROL_LABEL[l.rol]} color={ROL_COLOR[l.rol]} /><Ionicons name="chevron-forward" size={18} color={colors.textTer} style={{ marginLeft: 6 }} /></View>
    </Card>
  );

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.textSec} />}>
        <TituloGrande titulo={titulo} subtitulo={`${ROL_LABEL[perfil.rol]} · ${perfil.nombre || perfil.email}`} />

        {/* STATS */}
          <>
            <View style={[s.fila, { gap: 10, marginBottom: 10, marginTop: 16 }]}>
              <Stat etiqueta="Grupos" valor={String(grupos.length)} icono="people" color={colors.success} />
              <Stat etiqueta="Miembros" valor={String(miembros.length)} icono="person" color={colors.primary} />
            </View>
            <View style={[s.fila, { gap: 10, marginBottom: 10 }]}>
              <Stat etiqueta="Hábitos (7 días)" valor={`${cumplimiento.global}%`} icono="checkmark-done" color={colorPorcentaje(cumplimiento.global)} />
              <Stat etiqueta={seleccion? `Recaudado · ${seleccion.evento.nombre}` : 'Recaudado'} valor={formatoMoneda(seleccion?.recaudado?? 0)} icono="cash" color={colors.warning} />
            </View>

            <SeccionTitulo titulo="Encuentros y Campamentos" accion={{ texto: 'Crear', icono: 'add', onPress: () => setModalEvento(true) }} />
            {eventos.length === 0? (<Card><Vacio icono="bonfire-outline" titulo="No hay eventos" texto="Creá un campamento o encuentro general de la iglesia." /></Card>) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>{eventos.map((ev) => (<Chip key={ev.id} texto={ev.nombre} icono={ICONO_EVENTO[ev.tipo]} activo={ev.id === eventoSel} color={colors.warning} onPress={() => setEventoSel(ev.id)} />))}</ScrollView>
                {seleccion? (<Card onPress={() => router.push({ pathname: '/evento/[id]', params: { id: seleccion.evento.id } })}><View style={s.fila}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{seleccion.evento.nombre}</Text><Text style={s.textoFilaSec}>{formatoFecha(seleccion.evento.fecha_evento)} · {seleccion.evento.grupo_id? 'De un grupo' : 'General de la iglesia'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textTer} /></View><View style={[s.fila, { justifyContent: 'space-between', marginTop: 14 }]}><View><Text style={s.textoFilaSec}>Recaudado</Text><Text style={{ color: colors.success, fontSize: 20, fontWeight: '700' }}>{formatoMoneda(seleccion.recaudado)}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={s.textoFilaSec}>Falta Pagar</Text><Text style={{ color: colors.warning, fontSize: 20, fontWeight: '700' }}>{formatoMoneda(seleccion.falta)}</Text></View></View><View style={{ marginTop: 12 }}><BarraProgreso valor={seleccion.meta? seleccion.recaudado / seleccion.meta : 0} color={colors.success} alto={8} /></View><Text style={[s.textoFilaSec, { marginTop: 8 }]}>Meta {formatoMoneda(seleccion.meta)} ({formatoMoneda(Number(seleccion.evento.costo_total))} por persona)</Text></Card>) : null}
                <TarjetaGrafico titulo="Recaudación por evento"><GraficoRecaudacion etiquetas={recaudacion.map((x) => x.evento.nombre)} valores={recaudacion.map((x) => x.recaudado)} /></TarjetaGrafico>
              </>
            )}
          </>

        <SeccionTitulo titulo="Hábitos por grupo" />
        <TarjetaGrafico titulo="Cumplimiento semanal" subtitulo="Últimos 7 días, por grupo"><GraficoHabitos etiquetas={cumplimiento.porGrupo.map((x) => x.grupo.nombre)} valores={cumplimiento.porGrupo.map((x) => x.pct)} /></TarjetaGrafico>

        {esApostol && pastores.length > 0? (<><SeccionTitulo titulo="Pastores" />{pastores.map(tarjetaLider)}</>) : null}
        <SeccionTitulo titulo={esApostol? 'Supervisores / Consolidación' : 'Mi equipo'} />
        {supervisores.length === 0? (<Card><Vacio icono="people-circle-outline" titulo="Sin equipo asignado" texto="Asigná roles y superiores desde la pestaña Administrar."><Boton titulo="Administrar Iglesia" variante="secundario" onPress={() => router.push('/admin')} /></Vacio></Card>) : (supervisores.map(tarjetaLider))}
      </ScrollView>

      <FormEvento visible={modalEvento} onClose={() => setModalEvento(false)} grupoId={null} permitirGeneral onCreado={cargar} />
    </Pantalla>
  );
}