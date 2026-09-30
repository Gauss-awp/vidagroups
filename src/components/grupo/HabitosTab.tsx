import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Habito, Miembro, RegistroDiario } from '@/lib/types';
import { diaCorto, formatoFecha, hoyISO, nombreCompleto, porcentaje, semanaHasta } from '@/lib/utils';
import { Boton, Campo, Card, Cargando, Chip, HojaModal, SelectorFecha, SeccionTitulo, Vacio, s } from '@/components/ui';
import { GraficoHabitos, TarjetaGrafico } from '@/components/Graficos';

const SUGERENCIAS = ['Asistencia al grupo', 'Lectura bíblica', 'Oración', 'Ayuno', 'Asistencia al culto'];

export function HabitosTab({ grupoId, refreshKey }: { grupoId: string; refreshKey: number }) {
  const [fecha, setFecha] = useState(hoyISO());
  const fechaRef = useRef(fecha);
  const [habitos, setHabitos] = useState<Habito[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [habitoSel, setHabitoSel] = useState<string | null>(null);
  const [registros, setRegistros] = useState<RegistroDiario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalHabito, setModalHabito] = useState(false);
  const [nuevoHabito, setNuevoHabito] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargarRegistros = useCallback(async (hs: Habito[], dia: string) => {
    if (hs.length === 0) {
      setRegistros([]);
      return;
    }
    const dias = semanaHasta(dia);
    const { data, error } = await supabase
      .from('registros_diarios')
      .select('habito_id, miembro_id, fecha, completado')
      .in('habito_id', hs.map((h) => h.id))
      .gte('fecha', dias[0])
      .lte('fecha', dias[6]);
    if (error) {
      Alert.alert('Error al cargar registros', error.message);
      return;
    }
    setRegistros((data ?? []) as RegistroDiario[]);
  }, []);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    const [h, m] = await Promise.all([
      supabase.from('habitos').select('*').eq('grupo_id', grupoId).order('creado_en'),
      supabase.from('miembros_grupo').select('*').eq('grupo_id', grupoId).eq('activo', true).order('nombre'),
    ]);
    if (h.error || m.error) Alert.alert('Error', (h.error ?? m.error)?.message ?? '');
    const hs = (h.data ?? []) as Habito[];
    setHabitos(hs);
    setMiembros((m.data ?? []) as Miembro[]);
    setHabitoSel((prev) => (prev && hs.some((x) => x.id === prev) ? prev : hs[0]?.id ?? null));
    await cargarRegistros(hs, fechaRef.current);
    setCargando(false);
  }, [grupoId, cargarRegistros]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo, refreshKey]);

  const cambiarFecha = (nueva: string) => {
    fechaRef.current = nueva;
    setFecha(nueva);
    cargarRegistros(habitos, nueva);
  };

  // Marcas del día seleccionado: "habito|miembro" → completado
  const marcas = useMemo(() => {
    const mapa: Record<string, boolean> = {};
    registros.filter((r) => r.fecha === fecha).forEach((r) => {
      mapa[`${r.habito_id}|${r.miembro_id}`] = r.completado;
    });
    return mapa;
  }, [registros, fecha]);

  // % de cumplimiento por día (sobre los hábitos que se registraron ese día)
  const semana = useMemo(() => {
    const dias = semanaHasta(fecha);
    const activos = new Set(miembros.map((m) => m.id));
    const valores = dias.map((d) => {
      const delDia = registros.filter((r) => r.fecha === d && activos.has(r.miembro_id));
      const habitosDelDia = new Set(delDia.map((r) => r.habito_id)).size;
      return porcentaje(delDia.filter((r) => r.completado).length, habitosDelDia * miembros.length);
    });
    return { etiquetas: dias.map(diaCorto), valores };
  }, [registros, fecha, miembros]);

  const guardarMarca = (habitoId: string, miembroId: string, completado: boolean) => {
    setRegistros((prev) => {
      const i = prev.findIndex((r) => r.habito_id === habitoId && r.miembro_id === miembroId && r.fecha === fecha);
      if (i >= 0) {
        const copia = [...prev];
        copia[i] = { ...copia[i], completado };
        return copia;
      }
      return [...prev, { habito_id: habitoId, miembro_id: miembroId, fecha, completado }];
    });
  };

  const alternar = async (miembroId: string) => {
    if (!habitoSel) return;
    const nuevo = !marcas[`${habitoSel}|${miembroId}`];
    guardarMarca(habitoSel, miembroId, nuevo);
    const { error } = await supabase
      .from('registros_diarios')
      .upsert({ habito_id: habitoSel, miembro_id: miembroId, fecha, completado: nuevo }, { onConflict: 'habito_id,miembro_id,fecha' });
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      cargarRegistros(habitos, fecha);
    }
  };

  const marcarTodos = async () => {
    if (!habitoSel || miembros.length === 0) return;
    const todosMarcados = miembros.every((m) => marcas[`${habitoSel}|${m.id}`]);
    const valor = !todosMarcados;
    miembros.forEach((m) => guardarMarca(habitoSel, m.id, valor));
    const { error } = await supabase.from('registros_diarios').upsert(
      miembros.map((m) => ({ habito_id: habitoSel, miembro_id: m.id, fecha, completado: valor })),
      { onConflict: 'habito_id,miembro_id,fecha' }
    );
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      cargarRegistros(habitos, fecha);
    }
  };

  const crearHabito = async (nombre: string) => {
    const limpio = nombre.trim();
    if (!limpio) {
      Alert.alert('Falta el nombre', 'Escribí el nombre del hábito.');
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase.from('habitos').insert({ grupo_id: grupoId, nombre: limpio }).select().single();
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo crear el hábito', error.message);
      return;
    }
    setNuevoHabito('');
    setModalHabito(false);
    const lista = [...habitos, data as Habito];
    setHabitos(lista);
    setHabitoSel((data as Habito).id);
  };

  const eliminarHabito = (h: Habito) => {
    Alert.alert('Eliminar hábito', `¿Eliminar "${h.nombre}" y todos sus registros?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('habitos').delete().eq('id', h.id);
          if (error) Alert.alert('No se pudo eliminar', error.message);
          else cargarTodo();
        },
      },
    ]);
  };

  if (cargando) return <Cargando />;

  const habitoActual = habitos.find((h) => h.id === habitoSel);
  const cumplidos = habitoSel ? miembros.filter((m) => marcas[`${habitoSel}|${m.id}`]).length : 0;

  return (
    <View>
      {habitos.length === 0 ? (
        <Card>
          <Vacio
            icono="checkmark-done-circle-outline"
            titulo="Tu grupo todavía no sigue hábitos"
            texto="Creá hábitos como la asistencia al grupo o la lectura bíblica y marcá cada día quién los cumplió."
          >
            <Boton titulo="Agregar hábito" icono="add" onPress={() => setModalHabito(true)} />
          </Vacio>
        </Card>
      ) : (
        <>
          <SelectorFecha valor={fecha} onChange={cambiarFecha} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {habitos.map((h) => (
              <Chip
                key={h.id}
                texto={h.nombre}
                activo={h.id === habitoSel}
                onPress={() => setHabitoSel(h.id)}
                onLongPress={() => eliminarHabito(h)}
              />
            ))}
            <Chip texto="Nuevo" icono="add" onPress={() => setModalHabito(true)} />
          </ScrollView>

          {miembros.length === 0 ? (
            <Card>
              <Vacio icono="people-outline" titulo="Sin miembros" texto="Agregá miembros en la pestaña Miembros para empezar a registrar." />
            </Card>
          ) : (
            <Card>
              <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{habitoActual?.nombre}</Text>
                  <Text style={s.textoFilaSec}>
                    {cumplidos} de {miembros.length} cumplieron · {formatoFecha(fecha)}
                  </Text>
                </View>
                <Boton
                  compacto
                  variante="secundario"
                  titulo={miembros.every((m) => marcas[`${habitoSel}|${m.id}`]) ? 'Desmarcar' : 'Marcar todos'}
                  onPress={marcarTodos}
                />
              </View>
              {miembros.map((m, i) => {
                const hecho = !!(habitoSel && marcas[`${habitoSel}|${m.id}`]);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => alternar(m.id)}
                    style={[s.filaLista, i === miembros.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <Text style={[s.textoFila, { flex: 1 }]}>{nombreCompleto(m)}</Text>
                    <Ionicons
                      name={hecho ? 'checkmark-circle' : 'ellipse-outline'}
                      size={28}
                      color={hecho ? colors.success : colors.textTer}
                    />
                  </Pressable>
                );
              })}
            </Card>
          )}

          <Text style={[s.textoFilaSec, { marginBottom: 6, marginLeft: 4 }]}>
            Mantené apretado un hábito para eliminarlo.
          </Text>

          <SeccionTitulo titulo="Semana" />
          <TarjetaGrafico titulo="Cumplimiento de hábitos" subtitulo={`7 días hasta el ${formatoFecha(fecha)}`}>
            <GraficoHabitos etiquetas={semana.etiquetas} valores={semana.valores} />
          </TarjetaGrafico>
        </>
      )}

      <HojaModal visible={modalHabito} onClose={() => setModalHabito(false)} titulo="Nuevo hábito">
        <Campo
          etiqueta="Nombre del hábito"
          placeholder="Ej: Lectura bíblica"
          value={nuevoHabito}
          onChangeText={setNuevoHabito}
          autoFocus
        />
        <Text style={[s.etiqueta, { marginTop: 4 }]}>Sugerencias</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
          {SUGERENCIAS.filter((sug) => !habitos.some((h) => h.nombre.toLowerCase() === sug.toLowerCase())).map((sug) => (
            <Chip key={sug} texto={sug} onPress={() => setNuevoHabito(sug)} />
          ))}
        </View>
        <Boton titulo="Crear hábito" onPress={() => crearHabito(nuevoHabito)} cargando={guardando} />
      </HojaModal>
    </View>
  );
}
