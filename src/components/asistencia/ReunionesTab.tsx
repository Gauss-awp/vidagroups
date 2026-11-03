import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import { MESES, diaCorto, formatoFecha } from '@/lib/utils';
import { esErrorDeRed, escucharPendientes, sincronizar } from '@/lib/sinConexion';
import { medirCarga } from '@/lib/reporteErrores';
import { Card, Cargando, s } from '@/components/ui';
import { PlanillaAsistencia } from './PlanillaAsistencia';

interface FilaReunion {
  id: string;
  fecha: string;
  notas: string | null;
  asistencias: { miembro_id: string; presente: boolean; consolidado: boolean }[];
}
interface Hermano {
  id: string;
  creado_en: string;
  activo: boolean;
  baja_en: string | null;
}

/**
 * Pestaña "Reuniones": el historial de lo cargado, mes por mes.
 * Para cargar o corregir se usa siempre el modo reunión (un solo camino).
 */
export function ReunionesTab({ grupoId, refreshKey = 0 }: { grupoId: string; grupoNombre?: string; refreshKey?: number }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [reuniones, setReuniones] = useState<FilaReunion[]>([]);
  const [hermanos, setHermanos] = useState<Hermano[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinRed, setSinRed] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [masOpciones, setMasOpciones] = useState(false);

  const cargar = useCallback(async () => {
    const inicio = Date.now();
    const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
    const hasta = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(new Date(anio, mes + 1, 0).getDate()).padStart(2, '0')}`;
    const [r, m] = await Promise.all([
      supabase
        .from('reuniones')
        .select('id, fecha, notas, asistencias(miembro_id, presente, consolidado)')
        .eq('grupo_id', grupoId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false }),
      supabase.from('miembros_grupo').select('id, creado_en, activo, baja_en').eq('grupo_id', grupoId),
    ]);
    if (r.error && esErrorDeRed(r.error)) {
      setSinRed(true);
      setCargando(false);
      return;
    }
    setSinRed(false);
    setReuniones((r.data ?? []) as FilaReunion[]);
    setHermanos((m.data ?? []) as Hermano[]);
    setCargando(false);
    medirCarga('Reuniones', inicio);
  }, [grupoId, anio, mes]);

  // Al tirar para actualizar
  useEffect(() => {
    if (refreshKey) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Al abrir, al cambiar de mes y al volver del modo reunión
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  useEffect(() => escucharPendientes(setPendientes), []);

  const mover = (n: number) => {
    const d = new Date(anio, mes + n, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  };
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth();

  const abrir = (fecha: string, paso?: 2) =>
    router.push({ pathname: '/reunion/[id]', params: paso ? { id: grupoId, fecha, paso: '2' } : { id: grupoId, fecha } });

  // Cuántos estaban en el grupo ese día
  const esperados = (fecha: string) =>
    hermanos.filter((h) => h.creado_en.slice(0, 10) <= fecha && (h.activo || (!!h.baja_en && h.baja_en.slice(0, 10) >= fecha))).length;

  return (
    <View>
      {sinRed || pendientes > 0 ? (
        <Card style={{ backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning }}>
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>
            {sinRed
              ? 'Sin señal: la lista se actualiza cuando vuelva la conexión. Podés cargar la reunión igual con el botón de arriba.'
              : 'Hay reuniones guardadas en el celular esperando enviarse.'}
            {pendientes > 0 ? ` (${pendientes} cambios pendientes)` : ''}
          </Text>
          <Pressable
            onPress={async () => {
              await sincronizar();
              cargar();
            }}
            style={{ marginTop: 8 }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Reintentar ahora</Text>
          </Pressable>
        </Card>
      ) : null}

      <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 }]}>
        <Pressable onPress={() => mover(-1)} hitSlop={12} accessibilityLabel="Mes anterior">
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>
          {MESES[mes]} {anio}
        </Text>
        <Pressable onPress={() => mover(1)} hitSlop={12} disabled={esMesActual} accessibilityLabel="Mes siguiente">
          <Ionicons name="chevron-forward" size={24} color={esMesActual ? colors.border : colors.primary} />
        </Pressable>
      </View>

      {cargando ? (
        <Cargando />
      ) : reuniones.length === 0 ? (
        <Card>
          <Text style={s.textoFilaSec}>
            No hay reuniones cargadas en {MESES[mes].toLowerCase()}. Usá el botón "Cargar la reunión" de arriba.
          </Text>
        </Card>
      ) : (
        reuniones.map((r) => {
          const total = esperados(r.fecha);
          const vinieron = r.asistencias.filter((a) => a.presente).length;
          const conC = r.asistencias.filter((a) => !a.presente && a.consolidado).length;
          const faltaron = Math.max(0, total - vinieron);
          const sinC = Math.max(0, faltaron - conC);
          const pct = total ? Math.round((vinieron / total) * 100) : 0;
          return (
            <Card key={r.id} onPress={() => abrir(r.fecha)}>
              <View style={s.fila}>
                <View style={{ width: 52, alignItems: 'center', marginRight: 10 }}>
                  <Text style={{ color: colors.textSec, fontSize: 12, fontWeight: '700' }}>{diaCorto(r.fecha).toUpperCase()}</Text>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{formatoFecha(r.fecha).slice(0, 5)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.textoFila}>
                    {vinieron} de {total} vinieron
                    <Text style={{ color: colorPorcentaje(pct), fontWeight: '700' }}> · {pct}%</Text>
                  </Text>
                  <Text style={s.textoFilaSec}>
                    {faltaron === 0 ? 'Vinieron todos' : `${conC} con C`}
                    {r.notas ? ` · ${r.notas}` : ''}
                  </Text>
                  {sinC > 0 ? (
                    <Pressable onPress={() => abrir(r.fecha, 2)} hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                      <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 13 }}>
                        {sinC} para consolidar · completar ›
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <Ionicons name="create-outline" size={20} color={colors.textTer} />
              </View>
            </Card>
          );
        })
      )}

      <Pressable onPress={() => setMasOpciones(!masOpciones)} style={[s.fila, { marginTop: 10, marginBottom: 8, alignSelf: 'center' }]}>
        <Ionicons name={masOpciones ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSec} />
        <Text style={{ color: colors.textSec, fontWeight: '600', marginLeft: 4 }}>Planilla de asistencia (exportar / importar)</Text>
      </Pressable>
      {masOpciones ? <PlanillaAsistencia grupoId={grupoId} onImportado={cargar} /> : null}
    </View>
  );
}
