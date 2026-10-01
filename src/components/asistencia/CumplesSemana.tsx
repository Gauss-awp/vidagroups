import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { cumpleProximo, formatoCumple } from '@/lib/utils';
import { Card } from '@/components/ui';

/** "Cumplen esta semana" de un grupo. No muestra nada si nadie cumple. */
export function CumplesSemana({ grupoId, refreshKey = 0 }: { grupoId: string; refreshKey?: number }) {
  const [lista, setLista] = useState<{ id: string; nombre: string; dia: string }[]>([]);

  useEffect(() => {
    supabase
      .from('miembros_grupo')
      .select('id, nombre, apellido, cumpleanos')
      .eq('grupo_id', grupoId)
      .eq('activo', true)
      .not('cumpleanos', 'is', null)
      .then(({ data }) => {
        setLista(
          ((data ?? []) as { id: string; nombre: string; apellido: string | null; cumpleanos: string }[])
            .filter((m) => cumpleProximo(m.cumpleanos))
            .map((m) => ({ id: m.id, nombre: `${m.nombre} ${m.apellido ?? ''}`.trim(), dia: formatoCumple(m.cumpleanos).slice(0, 5) }))
        );
      });
  }, [grupoId, refreshKey]);

  if (lista.length === 0) return null;

  return (
    <Card style={{ backgroundColor: colors.primaryBg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Ionicons name="gift-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>Cumplen esta semana</Text>
      </View>
      {lista.map((c) => (
        <Text key={c.id} style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>
          {c.dia} · {c.nombre}
        </Text>
      ))}
    </Card>
  );
}
