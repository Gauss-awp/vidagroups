import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as XLSX from 'xlsx-js-style';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { MESES } from '@/lib/utils';
import { FALTAS_ALEJADO, hojaAsistenciaConFormato, leerPlanillaAsistencia, type PlanillaLeida, type RolEquipo } from '@/lib/asistenciaExcel';
import { Boton, Card, Chip, HojaModal, s } from '@/components/ui';
import { candidatosParecidos } from '@/lib/parecidos';
import { formatoFecha } from '@/lib/utils';

const clave = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

interface ChoqueFecha {
  planilla: string; // fecha en la planilla
  app: string; // fecha de la reunión cargada en la app
  appId: string;
  unir: boolean; // true = es la misma reunión, pasa a la fecha de la planilla
}
interface NombreDudoso {
  planilla: string; // como está escrito en la planilla
  candidatos: { id: string; nombre: string }[];
  eleccion: string; // id del hermano de la app, o 'nuevo'
}
interface Resumen {
  meses: string[];
  reuniones: number;
  asistencias: number;
  actualizan: number; // reuniones que ya estaban (misma fecha)
  nuevasFechas: number;
  choques: ChoqueFecha[];
  coinciden: number; // hermanos con el mismo nombre
  nuevos: string[]; // hermanos sin ningún parecido
  dudosos: NombreDudoso[];
  planilla: PlanillaLeida;
}

/**
 * Planilla mensual de asistencia del grupo (formato de la iglesia):
 * exportarla con todo lo cargado en la app, o importar una planilla existente.
 */
export function PlanillaAsistencia({ grupoId, onImportado }: { grupoId: string; onImportado?: () => void }) {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [trabajando, setTrabajando] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  // ---------------- Exportar ----------------
  const exportar = async () => {
    setTrabajando(true);
    try {
      const { data: g, error } = await supabase.from('groups').select('*').eq('id', grupoId).single();
      if (error || !g) throw new Error(error?.message ?? 'No se encontró el grupo');
      const [sup, mi, re, ult] = await Promise.all([
        g.supervisor_id ? supabase.from('profiles').select('nombre, apellido').eq('id', g.supervisor_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('miembros_grupo').select('id, nombre, apellido, rol_equipo, creado_en').eq('grupo_id', grupoId).eq('activo', true),
        supabase
          .from('reuniones')
          .select('id, fecha, notas, ofrenda, material, compartio, asistencias(miembro_id, presente, consolidado, motivo)')
          .eq('grupo_id', grupoId)
          .gte('fecha', `${anio}-01-01`)
          .lte('fecha', `${anio}-12-31`)
          .order('fecha'),
        supabase.from('reuniones').select('fecha, asistencias(miembro_id, presente)').eq('grupo_id', grupoId).order('fecha', { ascending: false }).limit(FALTAS_ALEJADO),
      ]);
      const miembrosRaw = (mi.data ?? []) as { id: string; nombre: string; apellido: string | null; rol_equipo: RolEquipo; creado_en: string }[];

      // En rojo: los que faltaron a todas las últimas reuniones (siguen en la lista)
      const ultimas = (ult.data ?? []) as { fecha: string; asistencias: { miembro_id: string; presente: boolean }[] }[];
      const alejado = (id: string, desde: string) =>
        ultimas.length >= FALTAS_ALEJADO &&
        ultimas.every((r) => r.fecha >= desde.slice(0, 10) && !(r.asistencias ?? []).some((a) => a.miembro_id === id && a.presente));

      const ids = miembrosRaw.map((m) => m.id);
      const { data: contactos } = ids.length
        ? await supabase.from('seguimientos_faltas').select('miembro_id, creado_en, nota').in('miembro_id', ids).gte('creado_en', `${anio}-01-01`)
        : { data: [] };

      const { data: segundos } = await supabase.from('grupo_supervisores').select('perfil_id').eq('grupo_id', grupoId);
      const idsSeg = ((segundos ?? []) as { perfil_id: string }[]).map((x) => x.perfil_id);
      const { data: perfSeg } = idsSeg.length ? await supabase.from('profiles').select('nombre').in('id', idsSeg) : { data: [] };
      const nombresSup = [
        sup.data ? String((sup.data as any).nombre ?? '').trim() : '',
        ...((perfSeg ?? []) as { nombre: string | null }[]).map((p) => String(p.nombre ?? '').trim()),
      ].filter(Boolean);
      const lider = g.lider_supervisor || nombresSup.join(' y ');

      const hoja = hojaAsistenciaConFormato(
        XLSX,
        anio,
        { nombre: g.nombre, lider_supervisor: lider || null, dia_horario: g.dia_horario ?? null, barrio: g.barrio ?? null, direccion: g.direccion ?? null },
        miembrosRaw.map((m) => ({
          id: m.id,
          nombre: `${m.nombre} ${m.apellido ?? ''}`.trim(),
          rol_equipo: m.rol_equipo,
          desde: m.creado_en.slice(0, 10),
          alejado: alejado(m.id, m.creado_en),
        })),
        ((re.data ?? []) as any[]).map((r) => ({ ...r, asistencias: r.asistencias ?? [] })),
        ((contactos ?? []) as any[]).map((c) => ({ miembro_id: c.miembro_id, fecha: String(c.creado_en).slice(0, 10), nota: c.nota }))
      );
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'ASITENCIA GV');
      const base64 = XLSX.write(libro, { type: 'base64', bookType: 'xlsx' });

      const archivo = new File(Paths.cache, `Asistencia_${g.nombre.replace(/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}_${anio}.xlsx`);
      if (archivo.exists) archivo.delete();
      archivo.create();
      archivo.write(base64, { encoding: 'base64' });
      setTrabajando(false);
      await Sharing.shareAsync(archivo.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
        dialogTitle: `Planilla de asistencia ${anio}`,
      });
    } catch (e) {
      setTrabajando(false);
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : String(e));
    }
  };

  // ---------------- Importar: leer y mostrar el resumen ----------------
  const elegirArchivo = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.length) return;
    setTrabajando(true);
    try {
      const base64 = await new File(r.assets[0].uri).base64();
      const libro = XLSX.read(base64, { type: 'base64' });
      const nombreHoja =
        libro.SheetNames.find((n: string) => {
          const ws = libro.Sheets[n];
          return Object.keys(ws).some((k) => !k.startsWith('!') && /INFORME MENSUAL/i.test(String(ws[k]?.v ?? '')));
        }) ?? libro.SheetNames[0];
      const planilla = leerPlanillaAsistencia(XLSX, libro.Sheets[nombreHoja], anio);
      if (planilla.meses.length === 0) {
        setTrabajando(false);
        Alert.alert('No se encontraron reuniones', 'La planilla no tiene meses con fechas cargadas en la fila "Equipo de Trabajo".');
        return;
      }
      // Lo que ya hay en la app, para avisar los choques
      const fechasPlanilla = planilla.meses.flatMap((m) => m.semanas.filter(Boolean).map((s) => s!.fecha)).sort();
      const desde = new Date(`${fechasPlanilla[0]}T12:00:00`);
      desde.setDate(desde.getDate() - 7);
      const hasta = new Date(`${fechasPlanilla[fechasPlanilla.length - 1]}T12:00:00`);
      hasta.setDate(hasta.getDate() + 7);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const [ex, reu] = await Promise.all([
        supabase.from('miembros_grupo').select('id, nombre, apellido').eq('grupo_id', grupoId),
        supabase.from('reuniones').select('id, fecha').eq('grupo_id', grupoId).gte('fecha', iso(desde)).lte('fecha', iso(hasta)),
      ]);
      const existentes = ((ex.data ?? []) as any[]).map((m) => ({ id: m.id as string, nombre: `${m.nombre} ${m.apellido ?? ''}`.trim() }));
      const enApp = ((reu.data ?? []) as { id: string; fecha: string }[]);
      const setPlanilla = new Set(fechasPlanilla);
      const setApp = new Set(enApp.map((r) => r.fecha));

      // Reuniones: misma fecha = se actualiza; fecha parecida (±3 días) = posible choque
      const actualizan = fechasPlanilla.filter((f) => setApp.has(f)).length;
      const choques: ChoqueFecha[] = [];
      const usadas = new Set<string>();
      fechasPlanilla
        .filter((f) => !setApp.has(f))
        .forEach((f) => {
          const cerca = enApp.find(
            (r) => !setPlanilla.has(r.fecha) && !usadas.has(r.id) &&
              Math.abs(new Date(`${r.fecha}T12:00:00`).getTime() - new Date(`${f}T12:00:00`).getTime()) <= 3 * 86400000
          );
          if (cerca) {
            usadas.add(cerca.id);
            choques.push({ planilla: f, app: cerca.fecha, appId: cerca.id, unir: true });
          }
        });

      // Hermanos: igual nombre, parecido (a elegir) o nuevo
      const exacto = new Set(existentes.map((m) => clave(m.nombre)));
      const nombresPlanilla = new Map<string, string>();
      let reuniones = 0;
      let asistencias = 0;
      planilla.meses.forEach((m) => {
        reuniones += m.semanas.filter(Boolean).length;
        m.miembros.forEach((h) => {
          const n = h.valores.filter(Boolean).length;
          asistencias += n;
          if (n > 0) nombresPlanilla.set(clave(h.nombre), h.nombre);
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
          dudosos.push({
            planilla: nombre,
            candidatos: cand.map((c) => ({ id: c.id, nombre: c.nombre })),
            eleccion: cand[0].puntaje >= 0.75 ? cand[0].id : 'nuevo',
          });
        } else {
          nuevos.push(nombre);
        }
      }

      setResumen({
        meses: planilla.meses.map((m) => `${MESES[m.mes]} ${m.anio}`),
        reuniones,
        asistencias,
        actualizan,
        nuevasFechas: reuniones - actualizan - choques.length,
        choques,
        coinciden,
        nuevos,
        dudosos,
        planilla,
      });
    } catch (e) {
      Alert.alert('No se pudo leer el archivo', e instanceof Error ? e.message : String(e));
    }
    setTrabajando(false);
  };

  const cambiarChoque = (i: number, unir: boolean) =>
    setResumen((r) => (r ? { ...r, choques: r.choques.map((c, k) => (k === i ? { ...c, unir } : c)) } : r));
  const cambiarDudoso = (i: number, eleccion: string) =>
    setResumen((r) => (r ? { ...r, dudosos: r.dudosos.map((d, k) => (k === i ? { ...d, eleccion } : d)) } : r));

  // ---------------- Importar: cargar en la base ----------------
  const importar = async () => {
    if (!resumen) return;
    setTrabajando(true);
    try {
      const { planilla } = resumen;

      // 0. Reuniones que son la misma con otra fecha: pasan a la fecha de la planilla
      for (const c of resumen.choques.filter((x) => x.unir)) {
        const { error } = await supabase.from('reuniones').update({ fecha: c.planilla }).eq('id', c.appId);
        if (error) throw new Error(`Al unir la reunión del ${c.app}: ${error.message}`);
      }

      // 1. Hermanos: los que no existen se crean, con la fecha de su primera reunión
      const { data: existentes } = await supabase.from('miembros_grupo').select('id, nombre, apellido, rol_equipo').eq('grupo_id', grupoId);
      const porNombre = new Map(((existentes ?? []) as any[]).map((m) => [clave(`${m.nombre} ${m.apellido ?? ''}`), m]));
      const primeraFecha = new Map<string, string>();
      const rolDe = new Map<string, RolEquipo>();
      planilla.meses.forEach((m) =>
        m.miembros.forEach((h) => {
          const k = clave(h.nombre);
          if (h.rol && !rolDe.get(k)) rolDe.set(k, h.rol);
          h.valores.forEach((v, i) => {
            const f = m.semanas[i]?.fecha;
            if (v && f && (!primeraFecha.has(k) || f < primeraFecha.get(k)!)) primeraFecha.set(k, f);
          });
        })
      );
      const nombreOriginal = new Map<string, string>();
      planilla.meses.forEach((m) => m.miembros.forEach((h) => nombreOriginal.set(clave(h.nombre), h.nombre)));
      // Los nombres parecidos que se eligieron como "el mismo hermano"
      const porId = new Map(((existentes ?? []) as any[]).map((m) => [m.id, m]));
      resumen.dudosos.forEach((d) => {
        if (d.eleccion !== 'nuevo' && porId.has(d.eleccion)) porNombre.set(clave(d.planilla), porId.get(d.eleccion));
      });
      const aCrear = [...primeraFecha.keys()].filter((k) => !porNombre.has(k));
      if (aCrear.length) {
        const filas = aCrear.map((k) => {
          const partes = nombreOriginal.get(k)!.trim().split(/\s+/);
          return {
            grupo_id: grupoId,
            nombre: partes[0],
            apellido: partes.slice(1).join(' '),
            rol_equipo: rolDe.get(k) ?? null,
            creado_en: `${primeraFecha.get(k)}T12:00:00`,
          };
        });
        const { data: creados, error } = await supabase.from('miembros_grupo').insert(filas).select('id, nombre, apellido, rol_equipo');
        if (error) throw new Error(`Al crear hermanos: ${error.message}`);
        (creados ?? []).forEach((m: any) => porNombre.set(clave(`${m.nombre} ${m.apellido ?? ''}`), m));
      }
      // Rol de los que ya estaban, si no tenían
      for (const [k, rol] of rolDe) {
        const m = porNombre.get(k);
        if (m && !m.rol_equipo && rol) await supabase.from('miembros_grupo').update({ rol_equipo: rol }).eq('id', m.id);
      }

      // 2. Reuniones y asistencia
      for (const mes of planilla.meses) {
        for (let i = 0; i < mes.semanas.length; i++) {
          const sem = mes.semanas[i];
          if (!sem) continue;
          const fila: Record<string, unknown> = { grupo_id: grupoId, fecha: sem.fecha };
          if (sem.notas) fila.notas = sem.notas;
          if (sem.ofrenda !== null) fila.ofrenda = sem.ofrenda;
          if (sem.material) fila.material = sem.material;
          if (sem.compartio) fila.compartio = sem.compartio;
          const { data: r, error } = await supabase.from('reuniones').upsert(fila, { onConflict: 'grupo_id,fecha' }).select('id').single();
          if (error) throw new Error(`Reunión del ${sem.fecha}: ${error.message}`);
          const asist = mes.miembros
            .map((h) => {
              const v = h.valores[i];
              const m = porNombre.get(clave(h.nombre));
              return v && m ? { reunion_id: r.id, miembro_id: m.id, presente: v.asist === 'P', consolidado: v.consolidado, motivo: v.motivo } : null;
            })
            .filter(Boolean);
          if (asist.length) {
            const { error: e2 } = await supabase.from('asistencias').upsert(asist as any[], { onConflict: 'reunion_id,miembro_id' });
            if (e2) throw new Error(`Asistencia del ${sem.fecha}: ${e2.message}`);
          }
        }
      }

      // 3. Datos del grupo, solo si en la app están vacíos
      const { data: g } = await supabase.from('groups').select('dia_horario, barrio, direccion, lider_supervisor').eq('id', grupoId).single();
      const cambios: Record<string, string> = {};
      (['dia_horario', 'barrio', 'direccion', 'lider_supervisor'] as const).forEach((c) => {
        const v = planilla.grupo[c];
        if (v && !(g as any)?.[c]) cambios[c] = v;
      });
      if (Object.keys(cambios).length) await supabase.from('groups').update(cambios).eq('id', grupoId);

      setTrabajando(false);
      Alert.alert('Planilla importada', `Se cargaron ${resumen.reuniones} reuniones y ${resumen.asistencias} asistencias${aCrear.length ? `, y ${aCrear.length} hermanos nuevos` : ''}.`);
      setResumen(null);
      onImportado?.();
    } catch (e) {
      setTrabajando(false);
      Alert.alert('La importación se cortó', `${e instanceof Error ? e.message : String(e)}\n\nLo que ya se cargó queda guardado; si importás de nuevo, se actualiza sin duplicar.`);
    }
  };

  return (
    <Card>
      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>Planilla de asistencia</Text>
      <Text style={[s.textoFilaSec, { marginTop: 2, marginBottom: 10 }]}>
        El informe mensual de la iglesia, un mes debajo del otro, con asistencia, consolidaciones, ofrenda y material.
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
            <Text style={s.textoFila}>{resumen.meses.length} meses: {resumen.meses.join(', ')}</Text>
            <Text style={[s.textoFilaSec, { marginTop: 4 }]}>{resumen.reuniones} reuniones · {resumen.asistencias} asistencias</Text>

            <Text style={[s.textoFila, { marginTop: 14, fontWeight: '700' }]}>Reuniones</Text>
            <Text style={s.textoFilaSec}>
              {resumen.actualizan ? `${resumen.actualizan} ya estaban en la app y se actualizan con la planilla. ` : ''}
              {resumen.nuevasFechas > 0 ? `${resumen.nuevasFechas} se agregan. ` : ''}
              {resumen.actualizan ? 'En esas reuniones, el P/A y la C de la planilla reemplazan lo cargado en la app.' : ''}
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

            <Text style={[s.textoFila, { marginTop: 14, fontWeight: '700' }]}>Hermanos</Text>
            <Text style={s.textoFilaSec}>
              {resumen.coinciden} coinciden con la app
              {resumen.nuevos.length ? ` · ${resumen.nuevos.length} nuevos: ${resumen.nuevos.slice(0, 10).join(', ')}${resumen.nuevos.length > 10 ? '…' : ''}` : ''}
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
                  <Chip texto="Es un hermano nuevo" activo={d.eleccion === 'nuevo'} onPress={() => cambiarDudoso(i, 'nuevo')} />
                </View>
              </View>
            ))}

            <Text style={[s.textoFilaSec, { marginTop: 14, marginBottom: 14 }]}>
              Los "G" quedan como guías y los "A", "C1" y "C2" como equipo. Lo que no está en la planilla no se toca.
            </Text>
            <Boton titulo="Importar" icono="checkmark" onPress={importar} cargando={trabajando} />
          </>
        ) : null}
      </HojaModal>
    </Card>
  );
}

