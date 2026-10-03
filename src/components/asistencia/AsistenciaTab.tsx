import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatoFecha, hoyISO } from '@/lib/utils';
import { Boton, Campo, Card, Cargando, HojaModal, SelectorFecha, Vacio, s } from '@/components/ui';
import { PlanillaAsistencia } from './PlanillaAsistencia';

interface MiembroLite {
  id: string;
  nombre: string;
  apellido: string | null;
}

/** Registro de la reunión del día: quién vino y quién faltó. */
export function AsistenciaTab({ grupoId, refreshKey }: { grupoId: string; refreshKey: number }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [miembros, setMiembros] = useState<MiembroLite[]>([]);
  const [reunionId, setReunionId] = useState<string | null>(null);
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  const [ultimas, setUltimas] = useState<{ fecha: string; presentes: number }[]>([]);
  const [cargando, setCargando] = useState(true);
  // Consolidación de la semana de cada ausente ("C" + motivo)
  const [consol, setConsol] = useState<Record<string, { consolidado: boolean; motivo: string | null }>>({});
  const [consolidando, setConsolidando] = useState<MiembroLite | null>(null);
  const [motivo, setMotivo] = useState('');
  // Datos de la reunión para la planilla
  const [datos, setDatos] = useState({ notas: '', ofrenda: '', material: '', compartio: '' });
  const [guardandoDatos, setGuardandoDatos] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [m, r, hist] = await Promise.all([
      supabase.from('miembros_grupo').select('id, nombre, apellido').eq('grupo_id', grupoId).eq('activo', true).order('nombre'),
      supabase.from('reuniones').select('id, notas, ofrenda, material, compartio').eq('grupo_id', grupoId).eq('fecha', fecha).maybeSingle(),
      supabase.from('reuniones').select('fecha, asistencias(presente)').eq('grupo_id', grupoId).order('fecha', { ascending: false }).limit(6),
    ]);
    if (m.error) Alert.alert('Error', m.error.message);
    setMiembros((m.data ?? []) as MiembroLite[]);
    const id = (r.data?.id as string | undefined) ?? null;
    setReunionId(id);
    const re = r.data as { notas: string | null; ofrenda: number | null; material: string | null; compartio: string | null } | null;
    setDatos({
      notas: re?.notas ?? '',
      ofrenda: re?.ofrenda !== null && re?.ofrenda !== undefined ? String(re.ofrenda) : '',
      material: re?.material ?? '',
      compartio: re?.compartio ?? '',
    });
    if (id) {
      const { data } = await supabase.from('asistencias').select('miembro_id, presente, consolidado, motivo').eq('reunion_id', id);
      const mapa: Record<string, boolean> = {};
      const mapaConsol: Record<string, { consolidado: boolean; motivo: string | null }> = {};
      (data ?? []).forEach((a: { miembro_id: string; presente: boolean; consolidado: boolean; motivo: string | null }) => {
        mapa[a.miembro_id] = a.presente;
        mapaConsol[a.miembro_id] = { consolidado: a.consolidado, motivo: a.motivo };
      });
      setPresentes(mapa);
      setConsol(mapaConsol);
    } else {
      setPresentes({});
      setConsol({});
    }
    setUltimas(
      (hist.data ?? []).map((x: { fecha: string; asistencias: { presente: boolean }[] | null }) => ({
        fecha: x.fecha,
        presentes: (x.asistencias ?? []).filter((a) => a.presente).length,
      }))
    );
    setCargando(false);
  }, [grupoId, fecha]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  // Crea la reunión del día la primera vez que se marca algo
  const asegurarReunion = async (): Promise<string | null> => {
    if (reunionId) return reunionId;
    const { data, error } = await supabase
      .from('reuniones')
      .upsert({ grupo_id: grupoId, fecha }, { onConflict: 'grupo_id,fecha' })
      .select('id')
      .single();
    if (error) {
      Alert.alert('No se pudo crear la reunión', error.message);
      return null;
    }
    setReunionId(data.id);
    return data.id as string;
  };

  const guardar = async (cambios: { miembro_id: string; presente: boolean }[]) => {
    const id = await asegurarReunion();
    if (!id) return;
    setPresentes((prev) => {
      const nuevo = { ...prev };
      cambios.forEach((c) => (nuevo[c.miembro_id] = c.presente));
      return nuevo;
    });
    const { error } = await supabase
      .from('asistencias')
      .upsert(cambios.map((c) => ({ reunion_id: id, ...c })), { onConflict: 'reunion_id,miembro_id' });
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      cargar();
    }
  };

  const guardarConsolidacion = async (quitar = false) => {
    if (!consolidando) return;
    const id = await asegurarReunion();
    if (!id) return;
    const valor = { consolidado: !quitar, motivo: quitar ? null : motivo.trim() || null };
    const { error } = await supabase
      .from('asistencias')
      .upsert({ reunion_id: id, miembro_id: consolidando.id, presente: false, ...valor }, { onConflict: 'reunion_id,miembro_id' });
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    setConsol((prev) => ({ ...prev, [consolidando.id]: valor }));
    setConsolidando(null);
  };

  const guardarDatos = async () => {
    const id = await asegurarReunion();
    if (!id) return;
    const ofrenda = datos.ofrenda.trim() ? Number(datos.ofrenda.replace(/\./g, '').replace(',', '.')) : null;
    if (ofrenda !== null && isNaN(ofrenda)) {
      Alert.alert('Ofrenda inválida', 'Escribí solo el número, por ejemplo 12000.');
      return;
    }
    setGuardandoDatos(true);
    const { error } = await supabase
      .from('reuniones')
      .update({
        notas: datos.notas.trim() || null,
        ofrenda,
        material: datos.material.trim() || null,
        compartio: datos.compartio.trim() || null,
      })
      .eq('id', id);
    setGuardandoDatos(false);
    if (error) Alert.alert('No se pudo guardar', error.message);
    else Alert.alert('Listo', 'Datos de la reunión guardados.');
  };

  const borrarReunion = () => {
    if (!reunionId) return;
    Alert.alert('Borrar reunión', `¿Borrar la reunión del ${formatoFecha(fecha)}? Se pierde la asistencia de ese día.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('reuniones').delete().eq('id', reunionId);
          if (error) Alert.alert('No se pudo borrar', error.message);
          else cargar();
        },
      },
    ]);
  };

  if (cargando) return <Cargando />;

  const cantPresentes = miembros.filter((m) => presentes[m.id]).length;
  const todos = miembros.length > 0 && cantPresentes === miembros.length;

  return (
    <View>
      <SelectorFecha valor={fecha} onChange={setFecha} />

      {miembros.length === 0 ? (
        <Card>
          <Vacio icono="people-outline" titulo="Sin miembros" texto="Agregá miembros en la pestaña Miembros para tomar asistencia." />
        </Card>
      ) : (
        <Card>
          <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Reunión del {formatoFecha(fecha)}</Text>
              <Text style={s.textoFilaSec}>
                {reunionId ? `${cantPresentes} de ${miembros.length} presentes` : 'Tocá a los que vinieron'}
              </Text>
            </View>
            <Boton
              compacto
              variante="secundario"
              titulo={todos ? 'Desmarcar' : 'Todos vinieron'}
              onPress={() => guardar(miembros.map((m) => ({ miembro_id: m.id, presente: !todos })))}
            />
          </View>
          {miembros.map((m, i) => {
            const vino = !!presentes[m.id];
            return (
              <Pressable
                key={m.id}
                onPress={() => guardar([{ miembro_id: m.id, presente: !vino }])}
                style={[s.filaLista, i === miembros.length - 1 && { borderBottomWidth: 0 }]}
              >
                <Text style={[s.textoFila, { flex: 1 }]}>{`${m.nombre} ${m.apellido ?? ''}`.trim()}</Text>
                <Text style={{ color: vino ? colors.success : colors.textTer, fontSize: 13, marginRight: 8 }}>
                  {reunionId ? (vino ? 'Vino' : 'Faltó') : ''}
                </Text>
                {reunionId && !vino ? (
                  <Pressable
                    onPress={() => {
                      setMotivo(consol[m.id]?.motivo ?? '');
                      setConsolidando(m);
                    }}
                    hitSlop={8}
                    accessibilityLabel="Consolidación"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      marginRight: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: consol[m.id]?.consolidado ? colors.primary : colors.border,
                      backgroundColor: consol[m.id]?.consolidado ? colors.primary : 'transparent',
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: consol[m.id]?.consolidado ? '#FFFFFF' : colors.textSec }}>C</Text>
                  </Pressable>
                ) : null}
                <Ionicons name={vino ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={vino ? colors.success : colors.textTer} />
              </Pressable>
            );
          })}
        </Card>
      )}

      {reunionId ? (
        <Pressable onPress={borrarReunion} style={{ alignItems: 'center', padding: 8 }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>No hubo reunión este día (borrar)</Text>
        </Pressable>
      ) : null}

      {reunionId ? (
        <Card>
          <Text style={{ fontWeight: '700', marginBottom: 2, color: colors.text, fontSize: 16 }}>Datos de la reunión</Text>
          <Text style={[s.textoFilaSec, { marginBottom: 10 }]}>Van a la planilla mensual de asistencia.</Text>
          <Campo etiqueta="Nota de la semana" placeholder="Ej: Evangelismo, GV conjunto" value={datos.notas} onChangeText={(v) => setDatos({ ...datos, notas: v })} />
          <Campo etiqueta="Ofrenda ($)" placeholder="Ej: 12000" value={datos.ofrenda} onChangeText={(v) => setDatos({ ...datos, ofrenda: v })} keyboardType="numeric" />
          <Campo etiqueta="Material (prédica)" placeholder="Ej: Prédica domingo 30/8 Pr. Sandra" value={datos.material} onChangeText={(v) => setDatos({ ...datos, material: v })} />
          <Campo etiqueta="Quién compartió el material" placeholder="Ej: Joaco y Ambar" value={datos.compartio} onChangeText={(v) => setDatos({ ...datos, compartio: v })} />
          <Boton titulo="Guardar datos" icono="save-outline" compacto onPress={guardarDatos} cargando={guardandoDatos} />
        </Card>
      ) : null}

      <PlanillaAsistencia grupoId={grupoId} onImportado={cargar} />

      {ultimas.length > 0 ? (
        <Card style={{ marginTop: 8 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8, color: colors.text }}>Últimas reuniones</Text>
          {ultimas.map((u) => (
            <Pressable key={u.fecha} onPress={() => setFecha(u.fecha)} style={[s.fila, { justifyContent: 'space-between', paddingVertical: 6 }]}>
              <Text style={{ color: colors.text }}>{formatoFecha(u.fecha)}</Text>
              <Text style={{ color: colors.textSec }}>
                {u.presentes}/{miembros.length} presentes
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <HojaModal visible={!!consolidando} onClose={() => setConsolidando(null)} titulo="Consolidación">
        <Text style={{ color: colors.textSec, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
          {consolidando ? `${consolidando.nombre} ${consolidando.apellido ?? ''}`.trim() : ''} faltó el {formatoFecha(fecha)}. Anotá por qué faltó: en la planilla aparece la "C" con este motivo como nota.
        </Text>
        <Campo etiqueta="Motivo" placeholder="Ej: estaba enfermo, viajó, rinde un examen" value={motivo} onChangeText={setMotivo} multiline />
        <Boton titulo="Guardar consolidación" icono="checkmark" onPress={() => guardarConsolidacion(false)} />
        {consolidando && consol[consolidando.id]?.consolidado ? (
          <Boton titulo="Quitar la C" variante="texto" onPress={() => guardarConsolidacion(true)} style={{ marginTop: 6 }} />
        ) : null}
      </HojaModal>
    </View>
  );
}
