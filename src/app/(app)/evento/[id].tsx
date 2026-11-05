import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as XLSX from 'xlsx-js-style';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { compartirArchivo, leerArchivoElegido } from '@/lib/archivos';
import { candidatosParecidos } from '@/lib/parecidos';
import { TIPO_EVENTO_LABEL, formatoFecha, formatoMoneda, hoyISO, parseMonto } from '@/lib/utils';
import { cargarEvento, calcularFilas, curvaAcumulada, diasHasta, nombreDe, porGrupo, totales, type DatosEvento, type FilaPersona } from '@/lib/eventosDatos';
import { ESTADO_LABEL, leerPlanillaEvento, libroEvento, libroPlantilla, type EstadoPago, type FilaImportada } from '@/lib/eventosExcel';
import { BarrasH, CurvaRecaudacion, Dona, Kpi, PALETA, Progreso } from '@/components/eventos/Graficos';
import { FormEvento, ICONO_EVENTO } from '@/components/eventos/FormEvento';
import { Boton, Campo, Card, Cargando, Chip, HojaModal, SeccionTitulo, SelectorFecha, Vacio, s } from '@/components/ui';

type Pestana = 'resumen' | 'anotados' | 'pagos' | 'planillas';
type Filtro = 'todos' | EstadoPago | 'no_anotados';

const COLOR_ESTADO: Record<EstadoPago, string> = { pagado: PALETA.pagado, cuotas: PALETA.cuotas, sin_pagar: PALETA.sinPagar };

/** Detalle de un evento, estilo tablero: resumen con gráficos, anotados, pagos y planillas */
export default function EventoDetalle() {
  const { id, grupo } = useLocalSearchParams<{ id: string; grupo?: string }>();
  const [datos, setDatos] = useState<DatosEvento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [persona, setPersona] = useState<FilaPersona | null>(null);
  const [monto, setMonto] = useState('');
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [importacion, setImportacion] = useState<{ filas: (FilaImportada & { miembroId: string | null; sugerido: string | null })[]; hoja: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      setDatos(await cargarEvento(id, grupo ?? null));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, grupo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = useMemo(() => (datos ? calcularFilas(datos) : []), [datos]);
  const costo = Number(datos?.evento.costo_total ?? 0);
  const moneda = datos?.evento.moneda ?? 'ARS';
  const fmt = (n: number) => formatoMoneda(n, moneda);
  const t = useMemo(() => totales(filas, costo), [filas, costo]);
  const grupos = useMemo(() => porGrupo(filas, costo), [filas, costo]);
  const curva = useMemo(() => curvaAcumulada(datos?.pagos ?? []), [datos]);

  if (error) return <Vacio icono="alert-circle-outline" titulo="No se pudo abrir el evento" texto={error} />;
  if (!datos) return <Cargando texto="Cargando el evento..." />;
  const ev = datos.evento;
  const dias = diasHasta(ev.fecha_evento);
  const diasCierre = diasHasta(ev.cierre_inscripcion);

  // ---------------- Acciones ----------------
  const abrirPersona = (f: FilaPersona) => {
    setPersona(f);
    setMonto(f.saldo > 0 ? String(f.saldo) : '');
    setFechaPago(hoyISO());
    setNota('');
  };

  const anotar = async (f: FilaPersona, si: boolean) => {
    const { error: e } = si
      ? await supabase.from('evento_inscriptos').insert({ evento_id: ev.id, miembro_id: f.persona.id })
      : await supabase.from('evento_inscriptos').delete().eq('evento_id', ev.id).eq('miembro_id', f.persona.id);
    if (e) return alerta('No se pudo guardar', e.message);
    setPersona(null);
    cargar();
  };

  const registrarPago = async () => {
    if (!persona) return;
    const m = parseMonto(monto);
    if (isNaN(m) || m <= 0) return alerta('Monto inválido', 'Escribí un número, por ejemplo 15000.');
    setGuardando(true);
    const { error: e } = await supabase.from('pagos_evento').insert({
      evento_id: ev.id,
      miembro_id: persona.persona.id,
      monto_pagado: m,
      fecha_pago: fechaPago,
      nota: nota.trim() || null,
    });
    setGuardando(false);
    if (e) return alerta('No se pudo registrar el pago', e.message);
    setPersona(null);
    cargar();
  };

  const borrarPago = (pagoId: string, texto: string) =>
    alerta('Borrar pago', `¿Borrar el pago de ${texto}? Queda registrado en la auditoría.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.from('pagos_evento').delete().eq('id', pagoId);
          if (e) alerta('No se pudo borrar', e.message);
          else {
            setPersona(null);
            cargar();
          }
        },
      },
    ]);

  // ---------------- Planillas ----------------
  const exportar = async () => {
    setTrabajando(true);
    try {
      const anotados = filas.filter((f) => f.anotado);
      const libro = libroEvento(XLSX, {
        nombre: ev.nombre,
        tipo: TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo,
        fecha: ev.fecha_evento,
        lugar: ev.lugar ?? null,
        costo,
        moneda,
        cupo: ev.cupo ?? null,
        cierre: ev.cierre_inscripcion ?? null,
        anotados: anotados.map((f) => ({
          nombre: nombreDe(f.persona),
          grupo: f.persona.grupo,
          pagado: f.pagado,
          saldo: f.saldo,
          estado: f.estado,
          ultimoPago: f.ultimoPago,
          cantidadPagos: f.pagos.length,
        })),
        pagos: datos.pagos.map((p) => {
          const per = datos.personas.find((x) => x.id === p.miembro_id);
          return {
            fecha: p.fecha_pago,
            nombre: per ? nombreDe(per) : '—',
            grupo: per?.grupo ?? '',
            monto: Number(p.monto_pagado),
            nota: p.nota,
            registro: p.registrado_por ? datos.registradores[p.registrado_por] ?? null : null,
          };
        }),
        porGrupo: grupos,
      });
      const base64 = XLSX.write(libro, { type: 'base64', bookType: 'xlsx' });
      await compartirArchivo(base64, `Evento_${ev.nombre.replace(/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}_${hoyISO()}.xlsx`, `Planilla de ${ev.nombre}`);
    } catch (e) {
      alerta('No se pudo exportar', e instanceof Error ? e.message : String(e));
    }
    setTrabajando(false);
  };

  const descargarPlantilla = async () => {
    try {
      const base64 = XLSX.write(libroPlantilla(XLSX), { type: 'base64', bookType: 'xlsx' });
      await compartirArchivo(base64, 'Plantilla_pagos_evento.xlsx', 'Plantilla para importar pagos');
    } catch (e) {
      alerta('No se pudo generar la plantilla', e instanceof Error ? e.message : String(e));
    }
  };

  const elegirArchivo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    setTrabajando(true);
    try {
      const { datos: contenido, tipo } = await leerArchivoElegido(r.assets[0]);
      const libro = XLSX.read(contenido, { type: tipo });
      const leida = leerPlanillaEvento(XLSX, libro);
      if (!leida.filas.length) {
        alerta('No encontramos datos', 'La planilla tiene que tener una columna "Nombre" (y, si querés cargar pagos, una columna "Monto").');
      } else {
        const lista = datos.personas.map((p) => ({ id: p.id, nombre: nombreDe(p), grupo: p.grupo }));
        const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        setImportacion({
          hoja: leida.hoja,
          filas: leida.filas.map((f) => {
            const exacto = lista.filter((p) => norm(p.nombre) === norm(f.nombre));
            const delGrupo = f.grupo ? exacto.filter((p) => norm(p.grupo) === norm(f.grupo!)) : exacto;
            const elegido = (delGrupo.length === 1 ? delGrupo : exacto.length === 1 ? exacto : [])[0];
            const sug = elegido ? null : candidatosParecidos(f.nombre, lista, 0.7, 1)[0];
            return { ...f, miembroId: elegido?.id ?? sug?.id ?? null, sugerido: sug ? sug.nombre : null };
          }),
        });
      }
    } catch (e) {
      alerta('No se pudo leer el archivo', e instanceof Error ? e.message : String(e));
    }
    setTrabajando(false);
  };

  const confirmarImportacion = async () => {
    if (!importacion) return;
    setTrabajando(true);
    const validas = importacion.filas.filter((f) => f.miembroId);
    // Una fila por persona y sin fecha = total pagado: se carga solo la diferencia con lo ya registrado
    const porPersona = new Map<string, typeof validas>();
    validas.forEach((f) => porPersona.set(f.miembroId!, [...(porPersona.get(f.miembroId!) ?? []), f]));
    let anotados = 0;
    let pagos = 0;
    const errores: string[] = [];
    for (const [miembroId, lista] of porPersona) {
      const { error: e1 } = await supabase.from('evento_inscriptos').upsert({ evento_id: ev.id, miembro_id: miembroId }, { onConflict: 'evento_id,miembro_id', ignoreDuplicates: true });
      if (e1) errores.push(e1.message);
      else anotados++;
      const conMonto = lista.filter((f) => f.monto && f.monto > 0);
      const esTotal = conMonto.length === 1 && !conMonto[0].fecha;
      if (esTotal) {
        const ya = filas.find((f) => f.persona.id === miembroId)?.pagado ?? 0;
        const diferencia = conMonto[0].monto! - ya;
        if (diferencia > 0) {
          const { error: e2 } = await supabase.from('pagos_evento').insert({ evento_id: ev.id, miembro_id: miembroId, monto_pagado: diferencia, fecha_pago: hoyISO(), nota: conMonto[0].nota ?? 'Importado de planilla' });
          if (e2) errores.push(e2.message);
          else pagos++;
        }
      } else {
        for (const f of conMonto) {
          const fecha = f.fecha ?? hoyISO();
          const repetido = datos.pagos.some((p) => p.miembro_id === miembroId && p.fecha_pago === fecha && Number(p.monto_pagado) === f.monto);
          if (repetido) continue;
          const { error: e2 } = await supabase.from('pagos_evento').insert({ evento_id: ev.id, miembro_id: miembroId, monto_pagado: f.monto, fecha_pago: fecha, nota: f.nota ?? 'Importado de planilla' });
          if (e2) errores.push(e2.message);
          else pagos++;
        }
      }
    }
    setTrabajando(false);
    setImportacion(null);
    await cargar();
    alerta(
      'Importación terminada',
      `${anotados} anotados · ${pagos} pagos nuevos${importacion.filas.length - validas.length ? ` · ${importacion.filas.length - validas.length} filas sin persona (no se cargaron)` : ''}${errores.length ? `\n\nAlgunos errores: ${[...new Set(errores)].slice(0, 2).join(' / ')}` : ''}`
    );
  };

  const mensajeDeudores = async () => {
    const deben = filas.filter((f) => f.anotado && f.saldo > 0);
    if (!deben.length) return alerta('¡Nadie debe!', 'Todos los anotados tienen el evento pagado.');
    const porG = new Map<string, FilaPersona[]>();
    deben.forEach((f) => porG.set(f.persona.grupo, [...(porG.get(f.persona.grupo) ?? []), f]));
    const lineas = [
      `📌 *${ev.nombre}*${ev.fecha_evento ? ` · ${formatoFecha(ev.fecha_evento)}` : ''}`,
      `Saldos pendientes (costo ${fmt(costo)}):`,
      '',
      ...[...porG.entries()].flatMap(([g, l]) => [`*${g}*`, ...l.map((f) => `• ${nombreDe(f.persona)}: debe ${fmt(f.saldo)}`), '']),
      diasCierre !== null && diasCierre >= 0 ? `⏳ La inscripción cierra en ${diasCierre} días.` : '',
    ].filter((x, i, a) => !(x === '' && a[i - 1] === ''));
    try {
      await Share.share({ message: lineas.join('\n') });
    } catch {
      // cancelado
    }
  };

  // ---------------- Lista filtrada ----------------
  const q = busqueda.trim().toLowerCase();
  const visibles = filas
    .filter((f) => (filtro === 'no_anotados' ? !f.anotado : f.anotado && (filtro === 'todos' || f.estado === filtro)))
    .filter((f) => !q || `${nombreDe(f.persona)} ${f.persona.grupo}`.toLowerCase().includes(q));
  const secciones = [...new Set(visibles.map((f) => f.persona.grupo))].sort().map((g) => ({ grupo: g, filas: visibles.filter((f) => f.persona.grupo === g) }));

  return (
    <>
      <Stack.Screen options={{ title: ev.nombre }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }} tintColor={colors.textSec} />}
      >
        {/* Encabezado */}
        <View style={{ backgroundColor: '#1F3A5F', borderRadius: 18, padding: 18, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={ICONO_EVENTO[ev.tipo] ?? 'calendar'} size={22} color="#FFFFFF" />
            <Text style={{ color: '#C7D7EE', fontSize: 12, fontWeight: '700', marginLeft: 8, letterSpacing: 0.6 }}>
              {(TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo).toUpperCase()}
              {ev.estado && ev.estado !== 'activo' ? ` · ${ev.estado.toUpperCase()}` : ''}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setEditando(true)} hitSlop={10} accessibilityLabel="Editar evento">
              <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 8 }}>{ev.nombre}</Text>
          <Text style={{ color: '#C7D7EE', fontSize: 14, marginTop: 4 }}>
            {[ev.fecha_evento ? formatoFecha(ev.fecha_evento) : null, ev.lugar, costo ? `${fmt(costo)} por persona` : 'Sin costo'].filter(Boolean).join(' · ')}
          </Text>
          {dias !== null ? (
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 8 }}>
              {dias > 0 ? `Faltan ${dias} días` : dias === 0 ? 'Es hoy' : `Fue hace ${-dias} días`}
              {diasCierre !== null && diasCierre >= 0 ? ` · inscripción hasta el ${formatoFecha(ev.cierre_inscripcion!)}` : ''}
            </Text>
          ) : null}
        </View>

        {/* Pestañas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(
            [
              ['resumen', 'Resumen'],
              ['anotados', `Anotados (${t.anotados})`],
              ['pagos', `Pagos (${datos.pagos.length})`],
              ['planillas', 'Planillas'],
            ] as [Pestana, string][]
          ).map(([k, txt]) => (
            <Chip key={k} texto={txt} activo={pestana === k} onPress={() => setPestana(k)} />
          ))}
        </ScrollView>

        {/* ---------------- Resumen ---------------- */}
        {pestana === 'resumen' ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Kpi titulo="Recaudado" valor={fmt(t.recaudado)} detalle={t.esperado ? `${Math.round(t.avance * 100)}% de ${fmt(t.esperado)}` : undefined} icono="cash-outline" color={PALETA.pagado} />
              <Kpi titulo="Por cobrar" valor={fmt(t.porCobrar)} detalle={`${t.cuotas + t.sinPagar} personas con saldo`} icono="hourglass-outline" color={PALETA.cuotas} />
              <Kpi
                titulo="Anotados"
                valor={ev.cupo ? `${t.anotados}/${ev.cupo}` : String(t.anotados)}
                detalle={ev.cupo ? `${Math.max(0, ev.cupo - t.anotados)} lugares libres` : 'sin cupo máximo'}
                icono="people-outline"
                color={PALETA.azul}
              />
              <Kpi titulo="Pagaron todo" valor={String(t.pagaron)} detalle={t.anotados ? `${Math.round((t.pagaron / t.anotados) * 100)}% de los anotados` : undefined} icono="checkmark-done-outline" color={PALETA.violeta} />
            </View>

            {t.esperado ? (
              <Card style={{ marginTop: 14 }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 8 }}>Avance de la recaudación</Text>
                <Progreso pct={t.avance} alto={12} />
                <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 6 }}>
                  {fmt(t.recaudado)} de {fmt(t.esperado)} · {Math.round(t.avance * 100)}%
                </Text>
              </Card>
            ) : null}

            <Card>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>Estado de los pagos</Text>
              <Dona
                segmentos={[
                  { valor: t.pagaron, color: PALETA.pagado, etiqueta: 'Pagó todo' },
                  { valor: t.cuotas, color: PALETA.cuotas, etiqueta: 'En cuotas' },
                  { valor: t.sinPagar, color: PALETA.sinPagar, etiqueta: 'Sin pagar' },
                ]}
                centro={String(t.anotados)}
                subcentro="anotados"
              />
            </Card>

            <Card>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 6 }}>Recaudación en el tiempo</Text>
              <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 8 }]}>Lo juntado, acumulado día por día, contra la meta.</Text>
              <CurvaRecaudacion puntos={curva} meta={t.esperado || undefined} formato={fmt} />
            </Card>

            {grupos.length > 1 ? (
              <Card>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>Por grupo</Text>
                <BarrasH
                  filas={grupos.map((g) => ({
                    etiqueta: g.grupo,
                    valor: g.pagado,
                    meta: g.esperado || undefined,
                    detalle: `${g.anotados} anotados${g.sinPagar ? ` · ${g.sinPagar} sin pagar` : ''}`,
                  }))}
                  formato={fmt}
                />
              </Card>
            ) : null}

            {/* Lo que conviene hacer */}
            {t.sinPagar || (diasCierre !== null && diasCierre >= 0 && diasCierre <= 7) || (ev.cupo && t.anotados >= ev.cupo) ? (
              <Card style={{ backgroundColor: colors.primaryBg }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 6 }}>Para tener en cuenta</Text>
                {t.sinPagar ? <Text style={{ color: colors.text, marginBottom: 4 }}>• {t.sinPagar} anotados todavía no pagaron nada.</Text> : null}
                {diasCierre !== null && diasCierre >= 0 && diasCierre <= 7 ? <Text style={{ color: colors.text, marginBottom: 4 }}>• La inscripción cierra en {diasCierre} días.</Text> : null}
                {ev.cupo && t.anotados >= ev.cupo ? <Text style={{ color: colors.text, marginBottom: 4 }}>• Se completó el cupo.</Text> : null}
                {t.porCobrar ? (
                  <Pressable onPress={mensajeDeudores} style={{ marginTop: 6 }}>
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>Armar mensaje con los saldos para los guías ›</Text>
                  </Pressable>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}

        {/* ---------------- Anotados ---------------- */}
        {pestana === 'anotados' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, borderWidth: 0.5, borderColor: colors.border, marginBottom: 8 }}>
              <Ionicons name="search" size={18} color={colors.textTer} />
              <TextInput value={busqueda} onChangeText={setBusqueda} placeholder="Buscar por nombre o grupo" placeholderTextColor={colors.textTer} style={{ flex: 1, padding: 12, color: colors.text }} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {(
                [
                  ['todos', `Todos (${t.anotados})`],
                  ['pagado', `Pagó todo (${t.pagaron})`],
                  ['cuotas', `En cuotas (${t.cuotas})`],
                  ['sin_pagar', `Sin pagar (${t.sinPagar})`],
                  ['no_anotados', `No anotados (${filas.length - t.anotados})`],
                ] as [Filtro, string][]
              ).map(([k, txt]) => (
                <Chip key={k} texto={txt} activo={filtro === k} onPress={() => setFiltro(k)} />
              ))}
            </ScrollView>
            {filtro === 'no_anotados' ? (
              <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 8 }]}>Hermanos que pueden ir y todavía no están anotados. Tocá uno para anotarlo.</Text>
            ) : null}
            {secciones.length === 0 ? (
              <Card>
                <Text style={s.textoFilaSec}>{filtro === 'todos' ? 'Todavía no hay anotados. Andá a "No anotados" o importá una planilla.' : 'Nadie en esta lista.'}</Text>
              </Card>
            ) : (
              secciones.map((sec) => (
                <Card key={sec.grupo}>
                  <Text style={{ color: colors.textSec, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>
                    {sec.grupo.toUpperCase()} · {sec.filas.length}
                  </Text>
                  {sec.filas.map((f) => (
                    <Pressable key={f.persona.id} onPress={() => abrirPersona(f)} style={{ paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{nombreDe(f.persona)}</Text>
                        {f.anotado ? (
                          <View style={{ backgroundColor: `${COLOR_ESTADO[f.estado]}22`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                            <Text style={{ color: COLOR_ESTADO[f.estado], fontSize: 11, fontWeight: '800' }}>{ESTADO_LABEL[f.estado]}</Text>
                          </View>
                        ) : (
                          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>+ Anotar</Text>
                        )}
                      </View>
                      {f.anotado && costo ? (
                        <>
                          <Progreso pct={f.pct} />
                          <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 4 }}>
                            Pagó {fmt(f.pagado)}
                            {f.saldo ? ` · debe ${fmt(f.saldo)}` : ''}
                            {f.pagos.length ? ` · ${f.pagos.length} ${f.pagos.length === 1 ? 'pago' : 'pagos'}` : ''}
                          </Text>
                        </>
                      ) : null}
                    </Pressable>
                  ))}
                </Card>
              ))
            )}
          </>
        ) : null}

        {/* ---------------- Pagos ---------------- */}
        {pestana === 'pagos' ? (
          datos.pagos.length === 0 ? (
            <Card>
              <Text style={s.textoFilaSec}>Todavía no hay pagos. Se registran desde "Anotados", tocando a una persona.</Text>
            </Card>
          ) : (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{datos.pagos.length} pagos</Text>
                <Text style={{ color: PALETA.pagado, fontWeight: '800' }}>{fmt(t.recaudado)}</Text>
              </View>
              {datos.pagos
                .slice()
                .reverse()
                .map((p) => {
                  const per = datos.personas.find((x) => x.id === p.miembro_id);
                  return (
                    <Pressable
                      key={p.id}
                      onLongPress={() => borrarPago(p.id, `${per ? nombreDe(per) : ''} (${fmt(Number(p.monto_pagado))})`)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.border }}
                    >
                      <View style={{ width: 46 }}>
                        <Text style={{ color: colors.textSec, fontSize: 12, fontWeight: '700' }}>{formatoFecha(p.fecha_pago).slice(0, 5)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600' }}>{per ? nombreDe(per) : '—'}</Text>
                        <Text style={[s.textoFilaSec, { fontSize: 12 }]}>
                          {[per?.grupo, p.nota, p.registrado_por && datos.registradores[p.registrado_por] ? `registró ${datos.registradores[p.registrado_por]}` : null].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={{ color: colors.text, fontWeight: '800' }}>{fmt(Number(p.monto_pagado))}</Text>
                    </Pressable>
                  );
                })}
              <Text style={[s.textoFilaSec, { fontSize: 11, marginTop: 8 }]}>Mantené apretado un pago para borrarlo.</Text>
            </Card>
          )
        ) : null}

        {/* ---------------- Planillas ---------------- */}
        {pestana === 'planillas' ? (
          <>
            <Card>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Exportar a Excel</Text>
              <Text style={[s.textoFilaSec, { marginTop: 4, marginBottom: 10 }]}>Tres hojas: Resumen (indicadores y totales por grupo), Anotados (con su estado en colores) y Pagos.</Text>
              <Boton titulo="Exportar planilla del evento" icono="download-outline" onPress={exportar} cargando={trabajando} />
            </Card>
            <Card>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Importar desde Excel</Text>
              <Text style={[s.textoFilaSec, { marginTop: 4, marginBottom: 10 }]}>
                Carga anotados y pagos de una planilla. Necesita una columna "Nombre"; si tiene "Monto" carga los pagos, y "Grupo" y "Fecha" ayudan.
                Antes de guardar vas a ver qué encontró.
              </Text>
              <Boton titulo="Elegir planilla" icono="cloud-upload-outline" onPress={elegirArchivo} cargando={trabajando} />
              <Boton titulo="Descargar plantilla de ejemplo" variante="texto" onPress={descargarPlantilla} style={{ marginTop: 6 }} />
            </Card>
            <Card>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Mensaje con los saldos</Text>
              <Text style={[s.textoFilaSec, { marginTop: 4, marginBottom: 10 }]}>Arma el texto para WhatsApp con quién debe cuánto, ordenado por grupo.</Text>
              <Boton titulo="Armar mensaje" icono="logo-whatsapp" variante="secundario" onPress={mensajeDeudores} />
            </Card>
          </>
        ) : null}
      </ScrollView>

      {/* Persona: anotar, pagos y registrar un pago */}
      <HojaModal visible={!!persona} onClose={() => setPersona(null)} titulo={persona ? nombreDe(persona.persona) : ''}>
        {persona ? (
          <>
            <Text style={[s.textoFilaSec, { marginBottom: 10 }]}>
              {persona.persona.grupo}
              {persona.anotado ? ` · ${ESTADO_LABEL[persona.estado]}` : ' · No anotado'}
            </Text>
            {!persona.anotado ? (
              <Boton titulo="Anotarlo al evento" icono="person-add-outline" onPress={() => anotar(persona, true)} />
            ) : (
              <>
                {costo ? (
                  <View style={{ marginBottom: 12 }}>
                    <Progreso pct={persona.pct} alto={10} />
                    <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 4 }}>
                      Pagó {fmt(persona.pagado)} de {fmt(costo)}
                      {persona.saldo ? ` · debe ${fmt(persona.saldo)}` : ' · ¡completo!'}
                    </Text>
                  </View>
                ) : null}
                {persona.pagos.length ? (
                  <>
                    <SeccionTitulo titulo="Pagos" />
                    {persona.pagos.map((p) => (
                      <View key={p.id} style={[s.fila, { paddingVertical: 6 }]}>
                        <Text style={{ color: colors.text, flex: 1 }}>
                          {formatoFecha(p.fecha_pago)}
                          {p.nota ? <Text style={{ color: colors.textSec }}> · {p.nota}</Text> : null}
                        </Text>
                        <Text style={{ color: colors.text, fontWeight: '700', marginRight: 10 }}>{fmt(Number(p.monto_pagado))}</Text>
                        <Pressable onPress={() => borrarPago(p.id, fmt(Number(p.monto_pagado)))} hitSlop={8}>
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
                <SeccionTitulo titulo="Registrar un pago" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
                  {persona.saldo > 0 ? <Chip texto={`Todo (${fmt(persona.saldo)})`} activo={monto === String(persona.saldo)} onPress={() => setMonto(String(persona.saldo))} /> : null}
                  {persona.saldo > 1 ? <Chip texto={`La mitad (${fmt(Math.round(persona.saldo / 2))})`} activo={monto === String(Math.round(persona.saldo / 2))} onPress={() => setMonto(String(Math.round(persona.saldo / 2)))} /> : null}
                </View>
                <Campo etiqueta={`Monto (${moneda === 'USD' ? 'US$' : '$'})`} placeholder="Ej: 15000" value={monto} onChangeText={setMonto} keyboardType="numeric" />
                <SelectorFecha valor={fechaPago} onChange={setFechaPago} />
                <Campo etiqueta="Nota (opcional)" placeholder="Ej: Segunda cuota, transferencia" value={nota} onChangeText={setNota} />
                <Boton titulo="Registrar pago" icono="checkmark" onPress={registrarPago} cargando={guardando} />
                {persona.pagos.length === 0 ? <Boton titulo="Quitar de los anotados" variante="texto" onPress={() => anotar(persona, false)} style={{ marginTop: 6 }} /> : null}
              </>
            )}
          </>
        ) : null}
      </HojaModal>

      {/* Vista previa de la importación */}
      <HojaModal visible={!!importacion} onClose={() => setImportacion(null)} titulo="Revisar la planilla">
        {importacion ? (
          <>
            <Text style={[s.textoFilaSec, { marginBottom: 8 }]}>
              Hoja "{importacion.hoja}" · {importacion.filas.length} filas · {importacion.filas.filter((f) => f.miembroId).length} con persona encontrada
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {importacion.filas.map((f, i) => {
                const per = datos.personas.find((p) => p.id === f.miembroId);
                return (
                  <View key={i} style={{ paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>
                      {f.nombre}
                      {f.monto ? <Text style={{ color: colors.textSec, fontWeight: '400' }}> · {fmt(f.monto)}{f.fecha ? ` · ${formatoFecha(f.fecha)}` : ''}</Text> : null}
                    </Text>
                    {per ? (
                      <Text style={{ color: f.sugerido ? PALETA.cuotas : PALETA.pagado, fontSize: 12 }}>
                        {f.sugerido ? `¿Es ${nombreDe(per)}? (${per.grupo})` : `✓ ${nombreDe(per)} · ${per.grupo}`}
                      </Text>
                    ) : (
                      <Text style={{ color: PALETA.sinPagar, fontSize: 12 }}>No se encontró en los grupos del evento: no se carga</Text>
                    )}
                    {f.sugerido ? (
                      <Pressable
                        onPress={() => setImportacion({ ...importacion, filas: importacion.filas.map((x, k) => (k === i ? { ...x, miembroId: null, sugerido: null } : x)) })}
                        style={{ marginTop: 2 }}
                      >
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>No es esa persona</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            <Boton titulo="Importar" icono="checkmark" onPress={confirmarImportacion} cargando={trabajando} style={{ marginTop: 12 }} />
          </>
        ) : null}
      </HojaModal>

      <FormEvento
        visible={editando}
        onClose={() => setEditando(false)}
        onGuardado={cargar}
        alcances={[ev.grupo_id ? 'grupo' : ev.red_id ? 'red' : 'iglesia']}
        grupoId={ev.grupo_id}
        redId={ev.red_id}
        evento={ev}
      />
    </>
  );
}
