import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Perfil } from '@/lib/types';
import { ROL_LABEL, nombreCompleto } from '@/lib/utils';
import { Avatar, Badge, Card, Cargando, Vacio, s } from '@/components/ui';

interface GrupoResumen {
  id: string;
  nombre: string;
  guia_id: string;
  miembros: number;
}

/** Lista las personas que dependen directamente de `liderId`, con sus grupos. */
export function EquipoLista({
  liderId,
  refreshKey = 0,
  textoVacio = 'Todavía no hay personas asignadas',
}: {
  liderId: string;
  refreshKey?: number;
  textoVacio?: string;
}) {
  const router = useRouter();
  const [personas, setPersonas] = useState<Perfil[]>([]);
  const [grupos, setGrupos] = useState<GrupoResumen[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      const { data, error } = await supabase.from('profiles').select('*').eq('supervisor_id', liderId).order('nombre');
      if (error) Alert.alert('Error', error.message);
      const lista = (data ?? []) as Perfil[];
      let gs: GrupoResumen[] = [];
      if (lista.length) {
        const r = await supabase
          .from('groups')
          .select('id, nombre, guia_id, miembros_grupo(id, activo)')
          .in('guia_id', lista.map((p) => p.id))
          .order('nombre');
        if (r.error) Alert.alert('Error', r.error.message);
        gs = (r.data ?? []).map((g: { id: string; nombre: string; guia_id: string; miembros_grupo: { activo: boolean }[] | null }) => ({
          id: g.id,
          nombre: g.nombre,
          guia_id: g.guia_id,
          miembros: (g.miembros_grupo ?? []).filter((m) => m.activo).length,
        }));
      }
      if (activo) {
        setPersonas(lista);
        setGrupos(gs);
        setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [liderId, refreshKey]);

  if (cargando) return <Cargando />;
  if (personas.length === 0) {
    return (
      <Card>
        <Vacio
          icono="people-circle-outline"
          titulo={textoVacio}
          texto="Un Pastor o el Apóstol las asigna desde Administrar Iglesia."
        />
      </Card>
    );
  }

  return (
    <View>
      {personas.map((p) => {
        const suyos = grupos.filter((g) => g.guia_id === p.id);
        return (
          <Card key={p.id}>
            <View style={s.fila}>
              <Avatar nombre={nombreCompleto(p)} color={ROL_COLOR[p.rol]} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.textoFila}>{nombreCompleto(p)}</Text>
                <Text style={s.textoFilaSec}>{p.email}</Text>
              </View>
              <Badge texto={ROL_LABEL[p.rol]} color={ROL_COLOR[p.rol]} />
            </View>

            {suyos.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => router.push({ pathname: '/grupo/[id]', params: { id: g.id } })}
                style={({ pressed }) => [s.fila, estilos.subfila, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="people" size={18} color={colors.success} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{g.nombre}</Text>
                  <Text style={s.textoFilaSec}>
                    {g.miembros} {g.miembros === 1 ? 'miembro' : 'miembros'} · hábitos y finanzas
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTer} />
              </Pressable>
            ))}

            {suyos.length === 0 && p.rol === 'guia' ? (
              <Text style={[s.textoFilaSec, { marginTop: 10 }]}>Todavía no creó su grupo.</Text>
            ) : null}

            {p.rol !== 'guia' ? (
              <Pressable
                onPress={() => router.push({ pathname: '/equipo/[id]', params: { id: p.id } })}
                style={({ pressed }) => [s.fila, estilos.subfila, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="git-network-outline" size={18} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={{ color: colors.primary, fontSize: 15, flex: 1 }}>Ver su equipo</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTer} />
              </Pressable>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const estilos = {
  subfila: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
} as const;
