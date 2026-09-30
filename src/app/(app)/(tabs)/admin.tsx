import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil, Rol } from '@/lib/types';
import { ROL_LABEL, ROL_RANGO, esAdmin, nombreCompleto } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  Avatar,
  Badge,
  Boton,
  Campo,
  Card,
  Cargando,
  Chip,
  HojaModal,
  Pantalla,
  SeccionTitulo,
  TituloGrande,
  Vacio,
  s,
} from '@/components/ui';

const ROLES: Rol[] = ['apostol', 'pastor', 'supervisor', 'guia'];

export default function AdministrarIglesia() {
  const { perfil, refrescarPerfil } = useAuth();
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Rol | 'todos'>('todos');

  const [editando, setEditando] = useState<Perfil | null>(null);
  const [rolNuevo, setRolNuevo] = useState<Rol>('guia');
  const [superiorNuevo, setSuperiorNuevo] = useState<string | null>(null);
  const [busquedaSuperior, setBusquedaSuperior] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('nombre');
    if (error) Alert.alert('Error', error.message);
    setUsuarios((data ?? []) as Perfil[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const porId = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter(
      (u) =>
        (filtro === 'todos' || u.rol === filtro) &&
        (!q || nombreCompleto(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [usuarios, busqueda, filtro]);

  const candidatos = useMemo(() => {
    if (!editando) return [];
    const q = busquedaSuperior.trim().toLowerCase();
    return usuarios
      .filter((u) => u.id !== editando.id && ROL_RANGO[u.rol] > ROL_RANGO[rolNuevo])
      .filter((u) => !q || nombreCompleto(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => ROL_RANGO[a.rol] - ROL_RANGO[b.rol]);
  }, [usuarios, editando, rolNuevo, busquedaSuperior]);

  if (!perfil) return <Cargando />;

  if (!esAdmin(perfil.rol)) {
    return (
      <Pantalla>
        <Vacio icono="lock-closed-outline" titulo="Acceso restringido" texto="Solo el Apóstol y los Pastores pueden administrar la iglesia." />
      </Pantalla>
    );
  }

  const rolesPermitidos = perfil.rol === 'apostol' ? ROLES : ROLES.filter((r) => r !== 'apostol');

  const abrir = (u: Perfil) => {
    if (perfil.rol === 'pastor' && u.rol === 'apostol') {
      Alert.alert('Sin permiso', 'Solo el Apóstol puede modificar a otro Apóstol.');
      return;
    }
    if (perfil.rol === 'pastor' && u.id === perfil.id) {
      Alert.alert('Sin permiso', 'No podés cambiar tu propio rol ni tu superior.');
      return;
    }
    setEditando(u);
    setRolNuevo(u.rol);
    setSuperiorNuevo(u.supervisor_id);
    setBusquedaSuperior('');
  };

  const elegirRol = (r: Rol) => {
    setRolNuevo(r);
    // Si el superior actual ya no tiene un rol mayor, se quita
    const sup = superiorNuevo ? porId.get(superiorNuevo) : null;
    if (r === 'apostol' || (sup && ROL_RANGO[sup.rol] <= ROL_RANGO[r])) setSuperiorNuevo(null);
  };

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    const { error } = await supabase
      .from('profiles')
      .update({ rol: rolNuevo, supervisor_id: rolNuevo === 'apostol' ? null : superiorNuevo })
      .eq('id', editando.id);
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    if (editando.id === perfil.id) await refrescarPerfil();
    setEditando(null);
    cargar();
  };

  const conteo = (r: Rol) => usuarios.filter((u) => u.rol === r).length;
  const superiorSeleccionado = superiorNuevo ? porId.get(superiorNuevo) : null;

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await cargar();
              setRefrescando(false);
            }}
            tintColor={colors.textSec}
          />
        }
      >
        <TituloGrande titulo="Administrar Iglesia" subtitulo={`${usuarios.length} personas registradas`} />

        <Campo placeholder="Buscar por nombre o correo" value={busqueda} onChangeText={setBusqueda} autoCapitalize="none" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          <Chip texto={`Todos ${usuarios.length}`} activo={filtro === 'todos'} onPress={() => setFiltro('todos')} />
          {ROLES.map((r) => (
            <Chip
              key={r}
              texto={`${ROL_LABEL[r]} ${conteo(r)}`}
              activo={filtro === r}
              color={ROL_COLOR[r]}
              onPress={() => setFiltro(r)}
            />
          ))}
        </ScrollView>

        {cargando ? (
          <Cargando />
        ) : filtrados.length === 0 ? (
          <Vacio icono="search" titulo="No hay resultados" texto="Probá con otro nombre o filtro." />
        ) : (
          filtrados.map((u) => {
            const sup = u.supervisor_id ? porId.get(u.supervisor_id) : null;
            return (
              <Card key={u.id} onPress={() => abrir(u)}>
                <View style={s.fila}>
                  <Avatar nombre={nombreCompleto(u)} color={ROL_COLOR[u.rol]} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.textoFila}>
                      {nombreCompleto(u)}
                      {u.id === perfil.id ? <Text style={{ color: colors.textSec }}> (vos)</Text> : null}
                    </Text>
                    <Text style={s.textoFilaSec}>{u.email}</Text>
                    <Text style={[s.textoFilaSec, { color: sup ? colors.textSec : colors.warning }]}>
                      {u.rol === 'apostol' ? 'Máxima autoridad' : sup ? `Superior: ${nombreCompleto(sup)}` : 'Sin superior asignado'}
                    </Text>
                  </View>
                  <Badge texto={ROL_LABEL[u.rol]} color={ROL_COLOR[u.rol]} />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      <HojaModal visible={!!editando} onClose={() => setEditando(null)} titulo={editando ? nombreCompleto(editando) : ''}>
        <Text style={s.etiqueta}>Rol</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {rolesPermitidos.map((r) => (
            <Chip key={r} texto={ROL_LABEL[r]} activo={rolNuevo === r} color={ROL_COLOR[r]} onPress={() => elegirRol(r)} />
          ))}
        </View>

        {rolNuevo !== 'apostol' ? (
          <>
            <SeccionTitulo titulo="Superior directo" />
            <Text style={[s.textoFilaSec, { marginBottom: 10 }]}>
              {rolNuevo === 'guia'
                ? 'Elegí el Líder Supervisor que acompaña a este Guía.'
                : rolNuevo === 'supervisor'
                  ? 'Elegí el Pastor a cargo de este Supervisor.'
                  : 'Elegí el Apóstol a cargo de este Pastor.'}
            </Text>

            <Card style={{ backgroundColor: colors.cardAlt }}>
              <Text style={s.textoFilaSec}>Seleccionado</Text>
              <Text style={[s.textoFila, { marginTop: 2 }]}>
                {superiorSeleccionado
                  ? `${nombreCompleto(superiorSeleccionado)} · ${ROL_LABEL[superiorSeleccionado.rol]}`
                  : 'Sin superior'}
              </Text>
            </Card>

            <Campo placeholder="Buscar superior" value={busquedaSuperior} onChangeText={setBusquedaSuperior} autoCapitalize="none" />

            <Pressable onPress={() => setSuperiorNuevo(null)} style={s.filaLista}>
              <Ionicons
                name={superiorNuevo === null ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={superiorNuevo === null ? colors.primary : colors.textTer}
                style={{ marginRight: 12 }}
              />
              <Text style={s.textoFila}>Sin superior</Text>
            </Pressable>
            {candidatos.slice(0, 30).map((c) => (
              <Pressable key={c.id} onPress={() => setSuperiorNuevo(c.id)} style={s.filaLista}>
                <Ionicons
                  name={superiorNuevo === c.id ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={superiorNuevo === c.id ? colors.primary : colors.textTer}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.textoFila}>{nombreCompleto(c)}</Text>
                  <Text style={s.textoFilaSec}>{c.email}</Text>
                </View>
                <Badge texto={ROL_LABEL[c.rol]} color={ROL_COLOR[c.rol]} />
              </Pressable>
            ))}
            {candidatos.length === 0 ? (
              <Text style={[s.textoFilaSec, { marginTop: 10 }]}>
                No hay personas con un rol mayor para asignar como superior.
              </Text>
            ) : null}
          </>
        ) : null}

        <Boton titulo="Guardar cambios" onPress={guardar} cargando={guardando} style={{ marginTop: 20 }} />
      </HojaModal>
    </Pantalla>
  );
}
