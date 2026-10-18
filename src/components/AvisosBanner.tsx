import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

interface Aviso {
  id: string;
  titulo: string;
  mensaje: string | null;
}
const CLAVE = 'vg_avisos_cerrados';

/** Avisos del Administrador: una tarjeta flotante abajo, que cada uno puede cerrar. */
export function AvisosBanner() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [cerrados, setCerrados] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const guardados = JSON.parse((await AsyncStorage.getItem(CLAVE)) ?? '[]') as string[];
      setCerrados(guardados);
      const { data } = await supabase.from('avisos').select('id, titulo, mensaje').order('desde', { ascending: false });
      setAvisos((data ?? []) as Aviso[]);
    })().catch(() => undefined);
  }, []);

  const visibles = avisos.filter((a) => !cerrados.includes(a.id));
  if (!visibles.length) return null;
  const a = visibles[0];

  const cerrar = async () => {
    const nuevos = [...cerrados, a.id].slice(-100);
    setCerrados(nuevos);
    await AsyncStorage.setItem(CLAVE, JSON.stringify(nuevos));
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.primary,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
        flexDirection: 'row',
      }}
    >
      <Ionicons name="megaphone-outline" size={22} color={colors.primary} style={{ marginRight: 10, marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{a.titulo}</Text>
        {a.mensaje ? <Text style={{ color: colors.textSec, fontSize: 14, marginTop: 3, lineHeight: 19 }}>{a.mensaje}</Text> : null}
        {visibles.length > 1 ? <Text style={{ color: colors.textTer, fontSize: 12, marginTop: 6 }}>1 de {visibles.length} avisos</Text> : null}
      </View>
      <Pressable onPress={cerrar} hitSlop={10} accessibilityLabel="Cerrar aviso">
        <Ionicons name="close" size={22} color={colors.textSec} />
      </Pressable>
    </View>
  );
}
