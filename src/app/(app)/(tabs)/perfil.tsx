import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil } from '@/lib/types';
import { ROL_LABEL, nombreCompleto } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Badge, Boton, Campo, Card, Cargando, Pantalla, SeccionTitulo, TituloGrande, s } from '@/components/ui';

export default function PerfilPantalla() {
  const { perfil, refrescarPerfil, cerrarSesion } = useAuth();
  const [nombre, setNombre] = useState(perfil?.nombre?? '');
  const [apellido, setApellido] = useState(perfil?.apellido?? '');
  const [superior, setSuperior] = useState<Perfil | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setNombre(perfil?.nombre?? '');
    setApellido(perfil?.apellido?? '');

    const cargarSuperior = async () => {
      if (!perfil) return;

      // 1. Primero intenta por la tabla nueva con RPC (sin problema de cache)
      const { data: rels } = await supabase.rpc('get_relaciones');
      const miRel = (rels as any[])?.find((r:any) => r.guia_id === perfil.id);

      if (miRel) {
        const { data } = await supabase.from('profiles').select('*').eq('id', miRel.supervisor_id).maybeSingle();
        if (data) {
          setSuperior(data as Perfil);
          return;
        }
      }

      // 2. Fallback viejo por si usaste profiles.supervisor_id
      if ((perfil as any).supervisor_id) {
        const { data } = await supabase.from('profiles').select('*').eq('id', (perfil as any).supervisor_id).maybeSingle();
        setSuperior((data as Perfil | null)?? null);
      } else {
        setSuperior(null);
      }
    };

    cargarSuperior();
  }, [perfil]);

  if (!perfil) return <Cargando />;

  const guardar = async () => {
    if (!nombre.trim()) {
      Alert.alert('Falta el nombre', 'El nombre no puede quedar vacío.');
      return;
    }
    setGuardando(true);
    const { error } = await supabase
     .from('profiles')
     .update({ nombre: nombre.trim(), apellido: apellido.trim() })
     .eq('id', perfil.id);
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    await refrescarPerfil();
    Alert.alert('Cambios guardados');
  };

  const salir = () => {
    Alert.alert('Cerrar sesión', '¿Querés salir de VidaGroups?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: cerrarSesion },
    ]);
  };

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <TituloGrande titulo="Perfil" />

        <Card>
          <View style={[s.fila, { marginBottom: 4 }]}>
            <Avatar nombre={nombreCompleto(perfil)} color={ROL_COLOR[perfil.rol]} tamano={60} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{nombreCompleto(perfil)}</Text>
              <Text style={s.textoFilaSec}>{perfil.email}</Text>
              <View style={{ marginTop: 8 }}>
                <Badge texto={ROL_LABEL[perfil.rol]} color={ROL_COLOR[perfil.rol]} />
              </View>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={s.textoFilaSec}>Superior directo</Text>
          <Text style={[s.textoFila, { marginTop: 4 }]}>
            {superior? `${nombreCompleto(superior)} · ${ROL_LABEL[superior.rol]}` : 'Sin asignar'}
          </Text>
        </Card>

        <SeccionTitulo titulo="Mis datos" />
        <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} />
        <Campo etiqueta="Apellido" value={apellido} onChangeText={setApellido} />
        <Boton titulo="Guardar cambios" onPress={guardar} cargando={guardando} />

        <Boton titulo="Cerrar sesión" variante="peligro" icono="log-out-outline" onPress={salir} style={{ marginTop: 28 }} />
      </ScrollView>
    </Pantalla>
  );
}