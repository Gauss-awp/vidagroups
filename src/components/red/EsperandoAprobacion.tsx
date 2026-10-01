import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Perfil, Red } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { Boton, Card, Chip, Pantalla, s } from '@/components/ui';

/** Pantalla para cuentas pendientes de aprobación (o dadas de baja). */
export function EsperandoAprobacion({ perfil }: { perfil: Perfil }) {
  const { refrescarPerfil, cerrarSesion } = useAuth();
  const [redes, setRedes] = useState<Red[]>([]);
  const [actualizando, setActualizando] = useState(false);
  const [cambiandoRed, setCambiandoRed] = useState(false);

  useEffect(() => {
    supabase.from('redes').select('id, nombre').order('nombre').then(({ data }) => setRedes((data ?? []) as Red[]));
  }, []);

  const miRed = redes.find((r) => r.id === perfil.red_id);
  const dadoDeBaja = perfil.estado === 'inactivo';

  const actualizar = async () => {
    setActualizando(true);
    await refrescarPerfil();
    setActualizando(false);
  };

  const elegirRed = async (redId: string) => {
    setCambiandoRed(true);
    const { error } = await supabase.from('profiles').update({ red_id: redId }).eq('id', perfil.id);
    setCambiandoRed(false);
    if (!error) await refrescarPerfil();
  };

  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              backgroundColor: dadoDeBaja ? colors.dangerBg : colors.primaryBg,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Ionicons name={dadoDeBaja ? 'close-circle' : 'hourglass'} size={38} color={dadoDeBaja ? colors.danger : colors.primary} />
          </View>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' }}>
            {dadoDeBaja ? 'Tu cuenta está dada de baja' : 'Esperando aprobación'}
          </Text>
          <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>
            {dadoDeBaja
              ? 'Si creés que es un error, hablá con el encargado de tu red.'
              : 'El encargado de tu red tiene que aprobar tu cuenta y asignarte un rol. Cuando lo haga, tocá "Actualizar".'}
          </Text>
        </View>

        {!dadoDeBaja ? (
          <Card>
            <Text style={s.textoFilaSec}>Tu red</Text>
            <Text style={[s.textoFila, { marginTop: 4, marginBottom: 10 }]}>{miRed ? miRed.nombre : 'Sin elegir'}</Text>
            <Text style={[s.textoFilaSec, { marginBottom: 8 }]}>
              {miRed ? '¿Te equivocaste de red? Podés cambiarla mientras esperás:' : 'Elegí tu red para que el encargado te vea:'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {redes.map((r) => (
                <Chip key={r.id} texto={r.nombre} activo={r.id === perfil.red_id} onPress={() => !cambiandoRed && elegirRed(r.id)} />
              ))}
            </View>
          </Card>
        ) : null}

        <Boton titulo="Actualizar" icono="refresh" onPress={actualizar} cargando={actualizando} style={{ marginTop: 8 }} />
        <Boton titulo="Cerrar sesión" variante="secundario" onPress={cerrarSesion} style={{ marginTop: 10 }} />
      </ScrollView>
    </Pantalla>
  );
}
