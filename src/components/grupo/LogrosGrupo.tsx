import React, { useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { MESES, formatoFecha } from '@/lib/utils';
import { Card, s } from '@/components/ui';

interface Logros {
  miembros: number;
  nuevos_mes: number;
  reuniones_mes: number;
  asistencia_mes: number | null;
  record: { presentes: number; fecha: string } | null;
  record_es_del_mes: boolean;
  completadas_mes: number;
  semanas_seguidas: number;
  c_mes: number;
}
export interface Racha {
  miembro_id: string;
  racha_actual: number;
  mejor_racha: number;
}
type Icono = React.ComponentProps<typeof Ionicons>['name'];

/** Logros del mes y los más constantes del grupo, para reconocer y compartir. */
export function LogrosGrupo({
  grupoId,
  grupoNombre,
  rachas,
  nombres,
  refreshKey = 0,
}: {
  grupoId: string;
  grupoNombre: string;
  rachas: Racha[];
  nombres: Record<string, string>;
  refreshKey?: number;
}) {
  const [l, setL] = useState<Logros | null>(null);

  useEffect(() => {
    supabase.rpc('logros_grupo', { p_grupo: grupoId }).then(({ data }) => setL((data as Logros) ?? null));
  }, [grupoId, refreshKey]);

  const mes = MESES[new Date().getMonth()];
  const items: { icono: Icono; color: string; texto: string; emoji: string }[] = [];
  if (l) {
    if (l.semanas_seguidas >= 4) items.push({ icono: 'flame', color: colors.warning, emoji: '🔥', texto: `${l.semanas_seguidas} semanas seguidas con reunión` });
    if (l.asistencia_mes !== null && l.asistencia_mes >= 75) items.push({ icono: 'star', color: colors.warning, emoji: '⭐', texto: `${l.asistencia_mes}% de asistencia en ${mes.toLowerCase()}` });
    if (l.record && l.record_es_del_mes) items.push({ icono: 'trophy', color: colors.warning, emoji: '🏆', texto: `Récord del grupo: ${l.record.presentes} personas el ${formatoFecha(l.record.fecha)}` });
    if (l.nuevos_mes > 0) items.push({ icono: 'leaf', color: colors.success, emoji: '🌱', texto: `${l.nuevos_mes} ${l.nuevos_mes === 1 ? 'hermano nuevo' : 'hermanos nuevos'} este mes` });
    if (l.completadas_mes > 0) items.push({ icono: 'checkmark-done-circle', color: colors.success, emoji: '✅', texto: `${l.completadas_mes} ${l.completadas_mes === 1 ? 'consolidación completada' : 'consolidaciones completadas'}` });
    if (l.miembros >= 10) items.push({ icono: 'people', color: colors.primary, emoji: '👥', texto: `${l.miembros} miembros en el grupo` });
  }
  const constantes = rachas
    .filter((r) => r.racha_actual >= 3 && nombres[r.miembro_id])
    .sort((a, b) => b.racha_actual - a.racha_actual)
    .slice(0, 3);

  const compartir = async () => {
    const lineas = [
      `🙌 ${grupoNombre} · ${mes}`,
      '',
      ...items.map((i) => `${i.emoji} ${i.texto}`),
      constantes.length ? '' : null,
      constantes.length ? `💪 Los más constantes: ${constantes.map((c) => `${nombres[c.miembro_id]} (${c.racha_actual} seguidas)`).join(', ')}` : null,
    ].filter((x) => x !== null);
    try {
      await Share.share({ message: lineas.join('\n') });
    } catch {
      // cancelado
    }
  };

  return (
    <Card style={{ backgroundColor: colors.primaryBg }}>
      <View style={[s.fila, { justifyContent: 'space-between', marginBottom: items.length || constantes.length ? 8 : 0 }]}>
        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>Logros de {mes.toLowerCase()}</Text>
        {items.length || constantes.length ? (
          <Pressable onPress={compartir} hitSlop={10} accessibilityLabel="Compartir logros">
            <Ionicons name="share-social-outline" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
      {items.map((i) => (
        <View key={i.texto} style={[s.fila, { marginBottom: 4 }]}>
          <Ionicons name={i.icono} size={16} color={i.color} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{i.texto}</Text>
        </View>
      ))}
      {constantes.length ? (
        <View style={{ marginTop: items.length ? 8 : 0 }}>
          <Text style={{ color: colors.textSec, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>LOS MÁS CONSTANTES</Text>
          {constantes.map((c) => (
            <View key={c.miembro_id} style={[s.fila, { marginBottom: 3 }]}>
              <Ionicons name="flame" size={15} color={colors.warning} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{nombres[c.miembro_id]}</Text>
              <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 13 }}>{c.racha_actual} seguidas</Text>
            </View>
          ))}
        </View>
      ) : null}
      {!items.length && !constantes.length ? (
        <Text style={s.textoFilaSec}>Cuando el grupo vaya sumando reuniones, acá aparecen sus logros.</Text>
      ) : null}
      <Pressable onPress={() => router.push({ pathname: '/resumen/[id]', params: { id: grupoId } })} style={{ marginTop: 10 }}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Ver el resumen del año ›</Text>
      </Pressable>
    </Card>
  );
}
