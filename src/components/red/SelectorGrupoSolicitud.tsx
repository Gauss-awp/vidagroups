import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { s } from '@/components/ui';

export interface SolicitudGrupo {
  grupoId: string | null;
  nuevo: string | null;
  /** Supervisores, pastores, encargados o consolidación: no guían un grupo */
  noGuia?: boolean;
}
interface GrupoRed {
  id: string;
  nombre: string;
  guias: string | null;
}

/**
 * "¿En qué grupo servís?": un grupo que ya existe, uno nuevo, o ninguno.
 * Se usa al registrarse y mientras se espera la aprobación.
 */
export function SelectorGrupoSolicitud({ redId, valor, onCambio }: { redId: string | null; valor: SolicitudGrupo; onCambio: (v: SolicitudGrupo) => void }) {
  const [grupos, setGrupos] = useState<GrupoRed[]>([]);
  const [modoNuevo, setModoNuevo] = useState(!!valor.nuevo);

  useEffect(() => {
    if (!redId) {
      setGrupos([]);
      return;
    }
    supabase.rpc('grupos_para_registro', { p_red: redId }).then(({ data }) => setGrupos((data ?? []) as GrupoRed[]));
  }, [redId]);

  if (!redId) return null;

  const opcion = (activo: boolean, texto: string, sub: string | null, onPress: () => void, icono: React.ComponentProps<typeof Ionicons>['name']) => (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 6,
        backgroundColor: activo ? colors.primaryBg : colors.cardAlt,
        borderWidth: 1.5,
        borderColor: activo ? colors.primary : 'transparent',
      }}
    >
      <Ionicons name={icono} size={18} color={activo ? colors.primary : colors.textSec} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: activo ? '700' : '500' }}>{texto}</Text>
        {sub ? <Text style={[s.textoFilaSec, { fontSize: 12 }]}>{sub}</Text> : null}
      </View>
      {activo ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
    </Pressable>
  );

  return (
    <View style={{ marginBottom: 14 }}>
      {valor.noGuia ? (
        <>
          {opcion(true, 'No soy guía', 'Guía Supervisor, pastor, encargado o consolidación', () => undefined, 'person-outline')}
          <Pressable onPress={() => onCambio({ grupoId: null, nuevo: null, noGuia: false })} hitSlop={8}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Soy guía de un grupo</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ color: colors.textSec, fontSize: 13, marginBottom: 4 }}>¿En qué grupo servís?</Text>
          <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 8 }]}>
            Así quien te aprueba ya sabe dónde sumarte. Si tu grupo ya está en la lista, elegilo; no lo pidas como nuevo.
          </Text>
          {grupos.map((g) =>
            opcion(
              valor.grupoId === g.id,
              g.nombre,
              g.guias ? `Guía: ${g.guias}` : 'Todavía sin guía',
              () => {
                setModoNuevo(false);
                onCambio({ grupoId: g.id, nuevo: null, noGuia: false });
              },
              'people-outline'
            )
          )}
          {opcion(modoNuevo, 'Es un grupo nuevo', 'Todavía no está en la lista', () => {
            setModoNuevo(true);
            onCambio({ grupoId: null, nuevo: valor.nuevo ?? '', noGuia: false });
          }, 'add-circle-outline')}
          {modoNuevo ? (
            <TextInput
              value={valor.nuevo ?? ''}
              onChangeText={(t) => onCambio({ grupoId: null, nuevo: t, noGuia: false })}
              placeholder="Nombre del grupo, por ejemplo: Grupo de vida 12"
              placeholderTextColor={colors.textTer}
              style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: 12, color: colors.text, marginBottom: 6 }}
            />
          ) : null}
          <Pressable
            onPress={() => {
              setModoNuevo(false);
              onCambio({ grupoId: null, nuevo: null, noGuia: true });
            }}
            hitSlop={8}
            style={{ marginTop: 4 }}
          >
            <Text style={{ color: colors.textSec, fontSize: 13 }}>
              ¿No sos guía? <Text style={{ color: colors.primary, fontWeight: '600' }}>Tocá acá</Text>
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
