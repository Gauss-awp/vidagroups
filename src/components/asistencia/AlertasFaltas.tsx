import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatoFecha } from '@/lib/utils';
import { Card } from '@/components/ui';

interface Alerta {
  miembro_id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  grupo_id: string;
  grupo: string;
  red_id: string | null;
  faltas: number;
  ultima_reunion: string;
}

/**
 * "Miembros que necesitan atención": 2 faltas seguidas = amarillo, 3 o más = rojo.
 * Filtra por grupo o por red si se indica. No muestra nada si no hay alertas.
 */
export function AlertasFaltas({
  minimo = 2,
  grupoId,
  redId,
  refreshKey = 0,
}: {
  minimo?: number;
  grupoId?: string;
  redId?: string;
  refreshKey?: number;
}) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [abierto, setAbierto] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('miembros_en_alerta', { p_minimo: minimo });
    if (error) return;
    let lista = (data ?? []) as Alerta[];
    if (grupoId) lista = lista.filter((a) => a.grupo_id === grupoId);
    if (redId) lista = lista.filter((a) => a.red_id === redId);
    setAlertas(lista);
  }, [minimo, grupoId, redId]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  if (alertas.length === 0) return null;

  const llamar = (tel: string) => Linking.openURL(`tel:${tel.replace(/[^0-9+]/g, '')}`);
  const whatsapp = (tel: string) => {
    // Números argentinos sin código de país: se agrega 549
    let n = tel.replace(/[^0-9]/g, '');
    if (!n.startsWith('54')) n = `549${n.replace(/^0/, '')}`;
    Linking.openURL(`https://wa.me/${n}`);
  };

  return (
    <Card style={{ borderWidth: 1.5, borderColor: colors.dangerBorde, backgroundColor: colors.dangerBg }}>
      <Pressable onPress={() => setAbierto(!abierto)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="alert-circle" size={22} color={colors.danger} style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontWeight: '800', fontSize: 15, color: colors.text }}>
          Miembros que necesitan atención ({alertas.length})
        </Text>
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSec} />
      </Pressable>

      {abierto
        ? alertas.map((a) => {
            const rojo = a.faltas >= 3;
            return (
              <View key={a.miembro_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.dangerBorde, marginTop: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rojo ? colors.danger : colors.warning, marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{`${a.nombre} ${a.apellido ?? ''}`.trim()}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSec }}>
                    {a.faltas} faltas seguidas · {a.grupo} · última reunión {formatoFecha(a.ultima_reunion)}
                  </Text>
                </View>
                {a.telefono ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={() => whatsapp(a.telefono!)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="logo-whatsapp" size={22} color="#16A34A" />
                    </Pressable>
                    <Pressable onPress={() => llamar(a.telefono!)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="call" size={20} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        : null}
    </Card>
  );
}
