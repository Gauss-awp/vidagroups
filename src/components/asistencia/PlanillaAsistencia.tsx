import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as XLSX from 'xlsx-js-style';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { compartirArchivo, leerArchivoElegido } from '@/lib/archivos';
import { colors } from '@/lib/theme';
import { MESES, formatoFecha } from '@/lib/utils';
import {
  FALTAS_ALEJADO,
  MESES_GV,
  leerLibroGV,
  libroGV,
  type EncabezadoMes,
  type FilaGuardada,
  type MiembroGV,
  type PlanillaLeidaGV,
  type RolEquipo,
} from '@/lib/planillaGV';
import { Boton, Card, Chip, HojaModal, s } from '@/components/ui';
import { candidatosParecidos } from '@/lib/parecidos';
import { alerta } from '@/lib/alerta';

const clave = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

interface ChoqueFecha {
  planilla: string;
  app: string;
  appId: string;
  unir: boolean;
}
interface NombreDudoso {
  planilla: string;
  candidatos: { id: string; nombre: string }[];
  eleccion: string; // id del miembro de la app, o 'nuevo'
}
interface Resumen {
  meses: string[];
  reuniones: number;
  asistencias: number;
  actualizan: number;
  nuevasFechas: number;
  choques: ChoqueFecha[];
  coinciden: number;
  nuevos: string[];
  dudosos: NombreDudoso[];
  hojas: string[];
  planilla: PlanillaLeidaGV;
}

const CAMPOS_DATOS = ['telefono', 'direccion', 'bautismo', 'sanidad_interior', 'pilares_dato', 'encuentro_dato', 'reencuentro_dato', 'pos_encuentro_dato', 'escuela_capacitacion'] as const;

/**
 * Planilla del grupo en el formato exacto de la iglesia (ASISTENCIA GV, OFRENDAS y DATOS):
 * exportarla con todo lo cargado en la app, o importar la planilla que ya tienen.
 */
export function PlanillaAsistencia({ grupoId, onImportado }: { grupoId: string; onImportado?: () => void }) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [trabajando, setTrabajando] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  // =====================================================================
  // EXPORTAR
  // =====================================================================
  const exportar = async () => {
    setTrabajando(true);
    try {
      const { data: g, error } = await supabase.from('groups').select('*').eq('id', grupoId).single();
      if (error || !g) throw new Error(error?.message ?? 'No se encontró el grupo');
      const desde = `${anio - 1}-12-01`;
      const hasta = `${anio + 1}-01-31`;
      const [sup, mi, re, ult, pf, pm, seg] = await Promise.all([
        g.supervisor_id ? supabase.from('profiles').select('nombre, apellido').eq('id', g.supervisor_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('miembros_grupo').select('*').eq('grupo_id', grupoId),
        supabase
          .from('reuniones')
          .select('id, fecha, notas, ofrenda, ofrenda_texto, ofrenda_entregada, material, compartio, asistencias(miembro_id, presente, consolidado, motivo)')
          .eq('grupo_id', grupoId)
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha'),
        supabase.from('reuniones').select('fecha, asistencias(miembro_id, presente)').eq('grupo_id', grupoId).order('fecha', { ascending: false }).limit(FALTAS_ALEJADO),
        supabase.from('planilla_filas').select('anio, mes, miembro_id, fila, codigo, marcas').eq('grupo_id', grupoId),
        supabase.from('planilla_meses').select('anio, mes, encabezado').eq('grupo_id', grupoId),
        supabase.from('grupo_supervisores').select('perfil_id').eq('grupo_id', grupoId),
      ]);
      const miembrosRaw = ((mi.data ?? []) as any[]).filter((m) => m.activo || m.baja_en);
      const ultimas = (ult.data ?? []) as { fecha: string; asistencias: { miembro_id: string; presente: boolean }[] }[];
      const alejado = (id: string, desdeM: string) =>
        ultimas.length >= FALTAS_ALEJADO &&
        ultimas.every((r) => r.fecha >= desdeM.slice(0, 10) && !(r.asistencias ?? []).some((a) => a.miembro_id === id && a.presente));
      const ids = miembrosRaw.map((m) => m.id);
      const { data: historialRoles } = ids.length
        ? await supabase.from('miembros_rol_historial').select('miembro_id, rol, desde').in('miembro_id', ids).order('desde')
        : { data: [] };
      const filasGuardadas = (pf.data ?? []) as FilaGuardada[];
      const enPlanilla = new Set(filasGuardadas.map((f) => f.miembro_id));

      // Líder supervisor: el texto cargado en el grupo, o los nombres de su supervisión
      const idsSeg = ((seg.data ?? []) as { perfil_id: string }[]).map((x) => x.perfil_id);
      const { data: perfSeg } = idsSeg.length ? await supabase.from('profiles').select('nombre').in('id', idsSeg) : { data: [] };
      const nombresSup = [
        sup.data ? String((sup.data as any).nombre ?? '').trim() : '',
        ...((perfSeg ?? []) as { nombre: string | null }[]).map((p) => String(p.nombre ?? '').trim()),
      ].filter(Boolean);

      const miembros: MiembroGV[] = miembrosRaw.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        apellido: m.apellido,
        desde: String(m.creado_en).slice(0, 10),
        hasta: m.activo ? null : String(m.baja_en ?? '').slice(0, 10) || null,
        activo: m.activo,
        alejado: m.activo && alejado(m.id, m.creado_en),
        roles: ((historialRoles ?? []) as any[]).filter((h) => h.miembro_id === m.id).map((h) => ({ rol: h.rol as RolEquipo, desde: h.desde })),
        rolActual: m.rol_equipo,
        datos: Object.fromEntries(CAMPOS_DATOS.map((c) => [c, m[c] ?? null])) as any,
        datosFila: m.datos_fila,
        datosNumero: m.datos_numero,
        datosNombre: m.datos_nombre,
        enPlanilla: enPlanilla.has(m.id),
      }));

      const libro = libroGV(XLSX, {
        anio,
        grupo: {
          nombre: g.nombre,
          lider_supervisor: g.lider_supervisor || nombresSup.join(' y ') || null,
          dia_horario: g.dia_horario ?? null,
          barrio: g.barrio ?? null,
          direccion: g.direccion ?? null,
        },
        miembros,
        reuniones: ((re.data ?? []) as any[]).map((r) => ({ ...r, asistencias: r.asistencias ?? [] })),
        filas: filasGuardadas,
        encabezados: ((pm.data ?? []) as any[]).map((x) => ({ anio: x.anio, mes: x.mes, ...x.encabezado })) as EncabezadoMes[],
        datosSueltos: (g.planilla_datos_sueltos ?? []) as any[],
      });
      const base64 = XLSX.write(libro, { type: 'base64', bookType: 'xlsx' });
      setTrabajando(false);
      const numero = (g.nombre.match(/(\d+)\s*$/) ?? [])[1];
      await compartirArchivo(base64, `GV ${numero ? Number(numero) : g.nombre}- ${anio}.xlsx`, `Planilla ${anio}`);
    } catch (e) {
      setTrabajando(false);
      alerta('No se pudo exportar', e instanceof Error ? e.message : String(e));
    }
  };

  // =====================================================================
  // IMPORTAR: leer y mostrar el resumen
  // =====================================================================
  const elegirArchivo = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.length) return;
    setTrabajando(true);
    try {
      const { datos, tipo } = await leerArchivoElegido(r.assets[0]);
      const libro = XLSX.read(datos, { type: tipo });
      const planilla = leerLibroGV(XLSX, libro, anio);
      if (planilla.meses.length === 0) {
        setTrabajando(false);
        alerta('No se encontró la planilla', 'El archivo tiene que tener la hoja de asistencia con los "INFORME MENSUAL" de cada mes.');
        return;
      }
      const fechasPlanilla = planilla.meses.flatMap((m) => m.semanas.filter(Boolean).map((s) => s!.fecha)).sort();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const masMenos = (f: string | undefined, dias: number) => {
        const d = new Date(`${f ?? `${anio}-01-01`}T12:00:00`);
        d.setDate(d.getDate() + dias);
        return iso(d);
      };
      const [ex, reu] = await Promise.all([
        supabase.from('miembros_grupo').select('id, nombre, apellido').eq('grupo_id', grupoId),
        supabase.from('reuniones').select('id, fecha').eq('grupo_id', grupoId).gte('fecha', masMenos(fechasPlanilla[0], -7)).lte('fecha', masMenos(fechasPlanilla[fechasPlanilla.length - 1], 7)),
      ]);
      const existentes = ((ex.data ?? []) as any[]).map((m) => ({ id: m.id as string, nombre: `${m.nombre} ${m.apellido ?? ''}`.trim() }));
      const enApp = (reu.data ?? []) as { id: string; fecha: string }[];
      const setPlanilla = new Set(fechasPlanilla);
      const setApp = new Set(enApp.map((r) => r.fecha));
      const actualizan = fechasPlanilla.filter((f) => setApp.has(f)).length;
      const choques: ChoqueFecha[] = [];
      const usadas = new Set<string>();
      fechasPlanilla
        .filter((f) => !setApp.has(f))
        .forEach((f) => {
          const cerca = enApp.find(
            (r) => !setPlanilla.has(r.fecha) && !usadas.has(r.id) && Math.abs(new Date(`${r.fecha}T12:00:00`).getTime() - new Date(`${f}T12:00:00`).getTime()) <= 3 * 86400000
          );
          if (cerca) {
            usadas.add(cerca.id);
            choques.push({ planilla: f, app: cerca.fecha, appId: cerca.id, unir: true });
          }
        });

      // Todos los nombres de la planilla (también los que todavía no tienen asistencia)
      const exacto = new Set(existentes.map((m) => clave(m.nombre)));
      const nombresPlanilla = new Map<string, string>();
      let reuniones = 0;
      let asistencias = 0;
      planilla.meses.forEach((m) => {
        reuniones += m.semanas.filter(Boolean).length;
        m.miembros.forEach((h) => {
          asistencias += h.valores.filter(Boolean).length;
          nombresPlanilla.set(clave(h.nombre), h.nombre);
        });
      });
      let coinciden = 0;
      const nuevos: string[] = [];
      const dudosos: NombreDudoso[] = [];
      for (const nombre of nombresPlanilla.values()) {
        if (exacto.has(clave(nombre))) {
          coinciden++;
          continue;
        }
        const cand = candidatosParecidos(nombre, existentes);
        if (cand.length) {
          dudosos.push({ planilla: nombre, candidatos: cand.map((c) => ({ id: c.id, nombre: c.nombre })), eleccion: cand[0].puntaje >= 0.75 ? cand[0].id : 'nuevo' });
        } else {
          nuevos.push(nombre);
        }
      }
      const hojas = ['ASISTENCIA GV', Object.keys(planilla.ofrendasCrudas).length ? 'OFRENDAS' : null, planilla.datos.length ? 'DATOS' : null].filter(Boolean) as string[];
      setResumen({
        meses: planilla.meses.filter((m) => m.miembros.length || m.semanas.some(Boolean)).map((m) => `${MESES[m.mes]} ${m.anio}`),
        reuniones,
        asistencias,
        actualizan,
        nuevasFechas: reuniones - actualizan - choques.length,
        choques,
        coinciden,
        nuevos,
        dudosos,
        hojas,
        planilla,
      });
    } catch (e) {
      alerta('No se pudo leer el archivo', e instanceof Error ? e.message : String(e));
    }
    setTrabajando(false);
  };

  const cambiarChoque = (i: number, unir: boolean) => setResumen((r) => (r ? { ...r, choques: r.choques.map((c, k) => (k === i ? { ...c, unir } : c)) } : r));
  const cambiarDudoso = (i: number, eleccion: string) => setResumen((r) => (r ? { ...r, dudosos: r.dudosos.map((d, k) => (k === i ? { ...d, eleccion } : d)) } : r));

  // =====================================================================
  // IMPORTAR: cargar en la base
  // =====================================================================
  const importar = async () => {
    if (!resumen) return;
    setTrabajando(true);
    try {
      const { planilla } = resumen;

      // 0. Reuniones que son la misma con otra fecha
      for (const c of resumen.choques.filter((x) => x.unir)) {
        const { error } = await supabase.from('reuniones').update({ fecha: c.planilla }).eq('id', c.appId);
        if (error) throw new Error(`Al unir la reunión del ${c.app}: ${error.message}`);
      }

      // 1. Miembros: se crean los que faltan (aunque todavía no tengan asistencia)
      const { data: existentes } = await supabase.from('miembros_grupo').select('id, nombre, apellido, rol_equipo').eq('grupo_id', grupoId);
      const porNombre = new Map(((existentes ?? []) as any[]).map((m) => [clave(`${m.nombre} ${m.apellido ?? ''}`), m]));
      const porId = new Map(((existentes ?? []) as any[]).map((m) => [m.id, m]));
      resumen.dudosos.forEach((d) => {
        if (d.eleccion !== 'nuevo' && porId.has(d.eleccion)) porNombre.set(clave(d.planilla), porId.get(d.eleccion));
      });
      const primeraFecha = new Map<string, string>();
      const nombreOriginal = new Map<string, string>();
      const rolActual = new Map<string, RolEquipo>();
      const rolDesde = new Map<string, string>();
      const ordenMeses = [...planilla.meses].sort((a, b) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes));
      ordenMeses.forEach((m) => {
        const inicioMes = `${m.anio}-${String(m.mes + 1).padStart(2, '0')}-01`;
        m.miembros.forEach((h) => {
          const k = clave(h.nombre);
          nombreOriginal.set(k, h.nombre);
          if (!primeraFecha.has(k) || inicioMes < primeraFecha.get(k)!) primeraFecha.set(k, inicioMes);
          h.valores.forEach((v, i) => {
            const f = m.semanas[i]?.fecha;
            if (v && f && f < (primeraFecha.get(k) ?? '9999') ) primeraFecha.set(k, f);
          });
          rolActual.set(k, h.rol); // el último mes manda
          if (h.rol && !rolDesde.has(k)) rolDesde.set(k, inicioMes);
        });
      });
      const aCrear = [...nombreOriginal.keys()].filter((k) => !porNombre.has(k));
      if (aCrear.length) {
        const filas = aCrear.map((k) => {
          const partes = nombreOriginal.get(k)!.trim().split(/\s+/);
          return { grupo_id: grupoId, nombre: partes[0], apellido: partes.slice(1).join(' '), rol_equipo: rolActual.get(k) ?? null, creado_en: `${primeraFecha.get(k)}T12:00:00` };
        });
        const { data: creados, error } = await supabase.from('miembros_grupo').insert(filas).select('id, nombre, apellido, rol_equipo');
        if (error) throw new Error(`Al crear miembros: ${error.message}`);
        (creados ?? []).forEach((m: any) => porNombre.set(clave(`${m.nombre} ${m.apellido ?? ''}`), m));
      }
      for (const [k, rol] of rolActual) {
        const m = porNombre.get(k);
        if (m && !m.rol_equipo && rol) await supabase.from('miembros_grupo').update({ rol_equipo: rol }).eq('id', m.id);
        const desdeRol = rolDesde.get(k);
        if (m && desdeRol) await supabase.from('miembros_rol_historial').update({ desde: `${desdeRol}T12:00:00` }).eq('miembro_id', m.id).gt('desde', `${desdeRol}T12:00:00`);
      }

      // 2. Reuniones (con ofrenda, material, quién compartió y a quién se entregó) y asistencia
      for (const mes of planilla.meses) {
        for (let i = 0; i < mes.semanas.length; i++) {
          const sem = mes.semanas[i];
          if (!sem) continue;
          const fila: Record<string, unknown> = {
            grupo_id: grupoId,
            fecha: sem.fecha,
            notas: sem.notas,
            ofrenda: sem.ofrenda,
            ofrenda_texto: sem.ofrenda_texto,
            material: sem.material,
            compartio: sem.compartio,
            ofrenda_entregada: planilla.ofrendas[`${mes.anio}-${mes.mes}-${i}`] ?? null,
          };
          const { data: r, error } = await supabase.from('reuniones').upsert(fila, { onConflict: 'grupo_id,fecha' }).select('id').single();
          if (error) throw new Error(`Reunión del ${sem.fecha}: ${error.message}`);
          const asist = mes.miembros
            .map((h) => {
              const v = h.valores[i];
              const m = porNombre.get(clave(h.nombre));
              return v && m ? { reunion_id: r.id, miembro_id: m.id, presente: v.asist === 'P', consolidado: v.consolidado } : null;
            })
            .filter(Boolean);
          if (asist.length) {
            const { error: e2 } = await supabase.from('asistencias').upsert(asist as any[], { onConflict: 'reunion_id,miembro_id' });
            if (e2) throw new Error(`Asistencia del ${sem.fecha}: ${e2.message}`);
          }
        }
      }

      // 3. Cómo era cada mes (orden, códigos, encabezado), para exportarla idéntica
      for (const mes of planilla.meses) {
        await supabase.from('planilla_filas').delete().eq('grupo_id', grupoId).eq('anio', mes.anio).eq('mes', mes.mes);
        const filas = mes.miembros
          .map((h) => {
            const m = porNombre.get(clave(h.nombre));
            return m ? { grupo_id: grupoId, anio: mes.anio, mes: mes.mes, miembro_id: m.id, fila: h.fila, codigo: h.codigo, marcas: Object.keys(h.marcas).length ? h.marcas : null } : null;
          })
          .filter(Boolean) as any[];
        // Si un nombre aparece dos veces en el mes, queda el primero
        const unicas = [...new Map(filas.map((f) => [f.miembro_id, f])).values()];
        if (unicas.length) {
          const { error } = await supabase.from('planilla_filas').insert(unicas);
          if (error) throw new Error(`Orden de ${MESES_GV[mes.mes]}: ${error.message}`);
        }
        const { error: e3 } = await supabase.from('planilla_meses').upsert({ grupo_id: grupoId, anio: mes.anio, mes: mes.mes, encabezado: mes.encabezado }, { onConflict: 'grupo_id,anio,mes' });
        if (e3) throw new Error(`Encabezado de ${MESES_GV[mes.mes]}: ${e3.message}`);
      }

      // 4. Datos del grupo (si en la app están vacíos) y renglones sueltos de DATOS
      const { data: g } = await supabase.from('groups').select('dia_horario, barrio, direccion, lider_supervisor').eq('id', grupoId).single();
      const cambios: Record<string, unknown> = { planilla_datos_sueltos: planilla.datosSueltos.length ? planilla.datosSueltos : null };
      (['dia_horario', 'barrio', 'direccion', 'lider_supervisor'] as const).forEach((c) => {
        const v = planilla.grupo[c];
        if (v && !(g as any)?.[c]) cambios[c] = v;
      });
      await supabase.from('groups').update(cambios).eq('id', grupoId);

      // 5. Hoja DATOS: teléfono, dirección, bautismo, encuentro…
      const lista = [...porNombre.values()].map((m: any) => ({ id: m.id, nombre: `${m.nombre} ${m.apellido ?? ''}`.trim() }));
      let conDatos = 0;
      const sinPareja: string[] = [];
      for (const d of planilla.datos) {
        const exactoD = lista.find((x) => clave(x.nombre) === clave(d.nombre));
        const m = exactoD ?? candidatosParecidos(d.nombre, lista, 0.75, 1)[0];
        if (!m) {
          sinPareja.push(d.nombre);
          continue;
        }
        const datosM: Record<string, unknown> = { datos_fila: d.fila, datos_numero: d.numero, datos_nombre: d.nombreOriginal };
        CAMPOS_DATOS.forEach((c) => {
          if ((d as any)[c]) datosM[c] = (d as any)[c];
        });
        const { error } = await supabase.from('miembros_grupo').update(datosM).eq('id', m.id);
        if (!error) conDatos++;
      }

      setTrabajando(false);
      const avisos = planilla.avisos.length ? `\n\nRevisá: ${planilla.avisos.slice(0, 4).join(' · ')}${planilla.avisos.length > 4 ? '…' : ''}` : '';
      alerta(
        'Planilla importada',
        `Se cargaron ${resumen.reuniones} reuniones y ${resumen.asistencias} asistencias${aCrear.length ? `, ${aCrear.length} miembros nuevos` : ''}${conDatos ? ` y los datos de ${conDatos} miembros` : ''}.${sinPareja.length ? `\n\nEn DATOS no se encontró a: ${sinPareja.join(', ')}.` : ''}${avisos}`
      );
      setResumen(null);
      onImportado?.();
    } catch (e) {
      setTrabajando(false);
      alerta('La importación se cortó', `${e instanceof Error ? e.message : String(e)}\n\nLo que ya se cargó queda guardado; si importás de nuevo, se actualiza sin duplicar.`);
    }
  };

  return (
    <Card>
      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>Planilla del grupo</Text>
      <Text style={[s.textoFilaSec, { marginTop: 2, marginBottom: 10 }]}>
        La planilla de la iglesia, idéntica: ASISTENCIA GV (diciembre a enero, un mes debajo del otro), OFRENDAS y DATOS de cada miembro.
      </Text>
      <View style={[s.fila, { justifyContent: 'center', marginBottom: 10 }]}>
        <Pressable onPress={() => setAnio(anio - 1)} hitSlop={10} accessibilityLabel="Año anterior">
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, marginHorizontal: 18 }}>{anio}</Text>
        <Pressable onPress={() => setAnio(anio + 1)} hitSlop={10} accessibilityLabel="Año siguiente">
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={[s.fila, { gap: 8 }]}>
        <Boton titulo="Exportar" icono="download-outline" compacto variante="secundario" onPress={exportar} cargando={trabajando && !resumen} style={{ flex: 1 }} />
        <Boton titulo="Importar" icono="cloud-upload-outline" compacto variante="secundario" onPress={elegirArchivo} style={{ flex: 1 }} />
      </View>

      <HojaModal visible={!!resumen} onClose={() => setResumen(null)} titulo="Importar planilla">
        {resumen ? (
          <>
            <Text style={s.textoFila}>Hojas: {resumen.hojas.join(', ')}</Text>
            <Text style={[s.textoFilaSec, { marginTop: 4 }]}>
              {resumen.meses.length} meses · {resumen.reuniones} reuniones · {resumen.asistencias} asistencias
              {resumen.planilla.datos.length ? ` · datos de ${resumen.planilla.datos.length} miembros` : ''}
            </Text>
            {resumen.planilla.avisos.length ? (
              <View style={{ backgroundColor: colors.warningBg, borderRadius: 10, padding: 10, marginTop: 10 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>Para revisar</Text>
                {resumen.planilla.avisos.map((a) => (
                  <Text key={a} style={{ color: colors.text, fontSize: 12 }}>
                    • {a}
                  </Text>
                ))}
              </View>
            ) : null}

            <Text style={[s.textoFila, { marginTop: 14, fontWeight: '700' }]}>Reuniones</Text>
            <Text style={s.textoFilaSec}>
              {resumen.actualizan ? `${resumen.actualizan} ya estaban en la app y se actualizan con la planilla. ` : ''}
              {resumen.nuevasFechas > 0 ? `${resumen.nuevasFechas} se agregan. ` : ''}
            </Text>
            {resumen.choques.map((c, i) => (
              <View key={c.appId} style={{ backgroundColor: colors.warningBg, borderRadius: 10, padding: 10, marginTop: 8 }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  En la app hay una reunión el <Text style={{ fontWeight: '700' }}>{formatoFecha(c.app)}</Text> y en la planilla el{' '}
                  <Text style={{ fontWeight: '700' }}>{formatoFecha(c.planilla)}</Text>.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                  <Chip texto="Es la misma reunión" activo={c.unir} onPress={() => cambiarChoque(i, true)} />
                  <Chip texto="Son distintas" activo={!c.unir} onPress={() => cambiarChoque(i, false)} />
                </View>
              </View>
            ))}

            <Text style={[s.textoFila, { marginTop: 14, fontWeight: '700' }]}>Miembros</Text>
            <Text style={s.textoFilaSec}>
              {resumen.coinciden} coinciden con la app
              {resumen.nuevos.length ? ` · ${resumen.nuevos.length} nuevos: ${resumen.nuevos.slice(0, 12).join(', ')}${resumen.nuevos.length > 12 ? '…' : ''}` : ''}
            </Text>
            {resumen.dudosos.map((d, i) => (
              <View key={d.planilla} style={{ backgroundColor: colors.cardAlt, borderRadius: 10, padding: 10, marginTop: 8 }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  En la planilla dice <Text style={{ fontWeight: '700' }}>"{d.planilla}"</Text>. ¿Es…?
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                  {d.candidatos.map((c) => (
                    <Chip key={c.id} texto={c.nombre} activo={d.eleccion === c.id} onPress={() => cambiarDudoso(i, c.id)} />
                  ))}
                  <Chip texto="Es un miembro nuevo" activo={d.eleccion === 'nuevo'} onPress={() => cambiarDudoso(i, 'nuevo')} />
                </View>
              </View>
            ))}

            <Text style={[s.textoFilaSec, { marginTop: 14, marginBottom: 14 }]}>
              Se guarda también el orden de cada mes, los códigos (G, A, C1…), las ofrendas y los datos de cada miembro, para que la planilla exportada salga
              igual a esta.
            </Text>
            <Boton titulo="Importar" icono="checkmark" onPress={importar} cargando={trabajando} />
          </>
        ) : null}
      </HojaModal>
    </Card>
  );
}
