import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { alerta } from '@/lib/alerta';
import { olvidarAvatar } from '@/lib/avatares';
import { Boton, HojaModal, s } from '@/components/ui';
import { AvatarBiblico, ORDEN_PERSONAJES, PERSONAJES } from './AvatarBiblico';

/** Elegir el personaje bíblico de la propia cuenta */
export function ElegirAvatar({
  visible,
  onClose,
  actual,
  perfilId,
  onGuardado,
}: {
  visible: boolean;
  onClose: () => void;
  actual: string | null | undefined;
  perfilId: string;
  onGuardado: () => void;
}) {
  const [elegido, setElegido] = useState<string | null>(actual ?? null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (visible) setElegido(actual ?? null);
  }, [visible, actual]);

  const guardar = async () => {
    setGuardando(true);
    const { error } = await supabase.rpc('elegir_avatar', { p_avatar: elegido });
    setGuardando(false);
    if (error) {
      alerta('No se pudo guardar', /function|schema cache/i.test(error.message) ? 'Falta actualizar la base de datos (etapa 37).' : error.message);
      return;
    }
    olvidarAvatar(perfilId);
    onGuardado();
    onClose();
  };

  const p = elegido ? PERSONAJES[elegido] : null;

  return (
    <HojaModal visible={visible} onClose={onClose} titulo="Elegí tu personaje">
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        {p && elegido ? (
          <>
            <AvatarBiblico personaje={elegido} tamano={96} />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, marginTop: 8 }}>{p.nombre}</Text>
            <Text style={[s.textoFilaSec, { textAlign: 'center' }]}>{p.detalle}</Text>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{p.cita}</Text>
          </>
        ) : (
          <Text style={[s.textoFilaSec, { textAlign: 'center' }]}>Elegí un personaje de la Biblia. Se va a ver al lado de tu nombre en toda la app.</Text>
        )}
      </View>
      <ScrollView style={{ maxHeight: 320 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {ORDEN_PERSONAJES.map((clave) => (
            <Pressable
              key={clave}
              onPress={() => setElegido(clave)}
              accessibilityLabel={PERSONAJES[clave].nombre}
              style={{ alignItems: 'center', width: 70, padding: 4, borderRadius: 12, borderWidth: 2, borderColor: elegido === clave ? colors.primary : 'transparent' }}
            >
              <AvatarBiblico personaje={clave} tamano={54} />
              <Text style={{ color: colors.text, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                {PERSONAJES[clave].nombre}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Boton titulo="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} style={{ marginTop: 14 }} />
      {actual ? <Boton titulo="Volver a mis iniciales" variante="texto" onPress={() => setElegido(null)} style={{ marginTop: 4 }} /> : null}
    </HojaModal>
  );
}
