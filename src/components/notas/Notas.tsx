import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatoFecha } from '@/lib/utils';
import { Boton, Campo, Card, Chip, Vacio, s } from '@/components/ui';

interface Nota {
  id: string;
  grupo_id: string;
  miembro_id: string | null;
  autor_id: string | null;
  autor: string;
  texto: string;
  creado_en: string;
}

/**
 * Notas pastorales de un grupo o de un hermano.
 * Las ven solo el guía del grupo y su Guía Supervisor: quedan para el próximo guía.
 */
export function Notas({ grupoId, miembroId, refreshKey = 0 }: { grupoId: string; miembroId?: string; refreshKey?: number }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [miembros, setMiembros] = useState<{ id: string; nombre: string }[]>([]);
  const [texto, setTexto] = useState('');
  const [sobre, setSobre] = useState<string | null>(miembroId ?? null);
  const [yo, setYo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    let q = supabase.from('notas_pastorales').select('*').eq('grupo_id', grupoId).order('creado_en', { ascending: false });
    if (miembroId) q = q.eq('miembro_id', miembroId);
    const [n, m, u] = await Promise.all([
      q,
      miembroId
        ? Promise.resolve({ data: [] as { id: string; nombre: string; apellido: string | null }[] })
        : supabase.from('miembros_grupo').select('id, nombre, apellido').eq('grupo_id', grupoId).eq('activo', true).order('nombre'),
      supabase.auth.getUser(),
    ]);
    setNotas((n.data ?? []) as Nota[]);
    setMiembros(((m.data ?? []) as { id: string; nombre: string; apellido: string | null }[]).map((x) => ({ id: x.id, nombre: `${x.nombre} ${x.apellido ?? ''}`.trim() })));
    setYo(u.data.user?.id ?? null);
  }, [grupoId, miembroId]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const guardar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    const { error } = await supabase.from('notas_pastorales').insert({ grupo_id: grupoId, miembro_id: sobre, texto: texto.trim() });
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar la nota', error.message);
      return;
    }
    setTexto('');
    if (!miembroId) setSobre(null);
    cargar();
  };

  const borrar = (n: Nota) =>
    Alert.alert('Borrar nota', '¿Borrar esta nota?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('notas_pastorales').delete().eq('id', n.id);
          if (error) Alert.alert('No se pudo borrar', error.message);
          else cargar();
        },
      },
    ]);

  const nombreMiembro = (id: string | null) => miembros.find((m) => m.id === id)?.nombre;

  return (
    <View>
      <Card style={{ backgroundColor: colors.cardAlt }}>
        <View style={[s.fila, { gap: 6, marginBottom: 8 }]}>
          <Ionicons name="lock-closed" size={14} color={colors.textSec} />
          <Text style={{ color: colors.textSec, fontSize: 12, flex: 1 }}>
            Solo las ven el guía de este grupo y su Guía Supervisor. Quedan para quien guíe el grupo después.
          </Text>
        </View>
        {!miembroId && miembros.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
            <Chip texto="Sobre el grupo" activo={sobre === null} onPress={() => setSobre(null)} />
            {miembros.map((m) => (
              <Chip key={m.id} texto={m.nombre} activo={sobre === m.id} onPress={() => setSobre(m.id)} />
            ))}
          </ScrollView>
        ) : null}
        <Campo
          placeholder={sobre ? 'Ej: está sin trabajo, necesita acompañamiento' : 'Ej: nos reunimos en lo de Marta, los viernes 21 h'}
          value={texto}
          onChangeText={setTexto}
          multiline
        />
        <Boton titulo="Guardar nota" icono="create-outline" compacto onPress={guardar} cargando={guardando} deshabilitado={!texto.trim()} />
      </Card>

      {notas.length === 0 ? (
        <Card>
          <Vacio icono="document-text-outline" titulo="Todavía no hay notas" texto="Anotá lo que el próximo guía debería saber de este grupo o de cada hermano." />
        </Card>
      ) : (
        notas.map((n) => (
          <Card key={n.id}>
            {!miembroId ? (
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>
                {n.miembro_id ? `Sobre ${nombreMiembro(n.miembro_id) ?? 'un hermano que ya no está'}` : 'Sobre el grupo'}
              </Text>
            ) : null}
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{n.texto}</Text>
            <View style={[s.fila, { justifyContent: 'space-between', marginTop: 8 }]}>
              <Text style={s.textoFilaSec}>
                {n.autor || 'Sin autor'} · {formatoFecha(n.creado_en.slice(0, 10))}
              </Text>
              {n.autor_id === yo ? (
                <Pressable onPress={() => borrar(n)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))
      )}
    </View>
  );
}
