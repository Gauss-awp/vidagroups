import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AMBIENTE, supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil } from '@/lib/types';
import { ROL_LABEL, nombreCompleto } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ModoTema, useTema } from '@/context/TemaContext';
import { Avatar, Badge, Boton, Campo, Card, Cargando, Pantalla, SeccionTitulo, TituloGrande, s } from '@/components/ui';

export default function PerfilPantalla() {
  const { perfil, redesAdmin, refrescarPerfil, cerrarSesion } = useAuth();
  const { modo, cambiarModo } = useTema();
  const [miRed, setMiRed] = useState<string | null>(null);
  const [nombre, setNombre] = useState(perfil?.nombre?? '');
  const [apellido, setApellido] = useState(perfil?.apellido?? '');
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '');
  const [eliminando, setEliminando] = useState(false);
  const [superior, setSuperior] = useState<Perfil | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!perfil?.red_id) {
      setMiRed(null);
    } else {
      supabase.from('redes').select('nombre').eq('id', perfil.red_id).maybeSingle().then(({ data }) => setMiRed(data?.nombre ?? null));
    }
  }, [perfil?.red_id]);

  useEffect(() => {
    setNombre(perfil?.nombre?? '');
    setApellido(perfil?.apellido?? '');
    setTelefono(perfil?.telefono ?? '');

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
     .update({ nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono.trim() || null })
     .eq('id', perfil.id);
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    await refrescarPerfil();
    Alert.alert('Cambios guardados');
  };

  const eliminarCuenta = () => {
    Alert.alert(
      'Eliminar mi cuenta',
      'Vas a borrar tu usuario de VidaGroups. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert('¿Seguro?', 'Confirmá que querés eliminar tu cuenta para siempre.', [
              { text: 'No', style: 'cancel' },
              {
                text: 'Sí, eliminar',
                style: 'destructive',
                onPress: async () => {
                  setEliminando(true);
                  const { error } = await supabase.rpc('eliminar_mi_cuenta');
                  setEliminando(false);
                  if (error) {
                    Alert.alert('No se pudo eliminar la cuenta', error.message);
                    return;
                  }
                  await cerrarSesion();
                },
              },
            ]),
        },
      ]
    );
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
          <Text style={s.textoFilaSec}>Red</Text>
          <Text style={[s.textoFila, { marginTop: 4 }]}>{miRed ?? 'Sin red'}</Text>
          {redesAdmin.length > 0 ? (
            <Text style={[s.textoFilaSec, { marginTop: 6 }]}>Administrás: {redesAdmin.map((r) => r.nombre).join(', ')}</Text>
          ) : null}
        </Card>

        <Card>
          <Text style={s.textoFilaSec}>Superior directo</Text>
          <Text style={[s.textoFila, { marginTop: 4 }]}>
            {superior? `${nombreCompleto(superior)} · ${ROL_LABEL[superior.rol]}` : 'Sin asignar'}
          </Text>
        </Card>

        <SeccionTitulo titulo="Apariencia" />
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              { m: 'claro', texto: 'Claro', icono: 'sunny-outline' },
              { m: 'oscuro', texto: 'Oscuro', icono: 'moon-outline' },
              { m: 'sistema', texto: 'Automático', icono: 'phone-portrait-outline' },
            ] as { m: ModoTema; texto: string; icono: 'sunny-outline' | 'moon-outline' | 'phone-portrait-outline' }[]).map((o) => {
              const activo = modo === o.m;
              return (
                <Pressable
                  key={o.m}
                  onPress={() => cambiarModo(o.m)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: activo ? colors.primary : colors.border,
                    backgroundColor: activo ? colors.primaryBg : colors.card,
                  }}
                >
                  <Ionicons name={o.icono} size={22} color={activo ? colors.primary : colors.textSec} />
                  <Text style={{ marginTop: 6, fontSize: 13, fontWeight: '600', color: activo ? colors.primary : colors.textSec }}>{o.texto}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[s.textoFilaSec, { marginTop: 10 }]}>Automático sigue el modo de tu celular. Se guarda solo en este teléfono.</Text>
        </Card>

        <SeccionTitulo titulo="Mis datos" />
        <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} />
        <Campo etiqueta="Apellido" value={apellido} onChangeText={setApellido} />
        <Campo
          etiqueta="Teléfono (WhatsApp)"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
          placeholder="3541 22-1717"
          ayuda="Lo ve tu supervisor para escribirte por WhatsApp."
        />
        <Boton titulo="Guardar cambios" onPress={guardar} cargando={guardando} />

        <Boton titulo="Cerrar sesión" variante="secundario" icono="log-out-outline" onPress={salir} style={{ marginTop: 28 }} />

        <Boton
          titulo="Eliminar mi cuenta"
          variante="peligro"
          icono="trash-outline"
          cargando={eliminando}
          onPress={eliminarCuenta}
          style={{ marginTop: 10 }}
        />
        <Text style={[s.textoFilaSec, { marginTop: 8, textAlign: 'center' }]}>
          Se borran tu usuario y tus datos personales. Los registros de tus grupos quedan para la iglesia.
        </Text>

        {AMBIENTE === 'pruebas' ? (
          <Text style={{ marginTop: 20, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.warning }}>
            Ambiente de PRUEBAS · los datos no son reales
          </Text>
        ) : null}
      </ScrollView>
    </Pantalla>
  );
}