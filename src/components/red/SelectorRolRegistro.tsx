import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import { s } from '@/components/ui';
import { SelectorGrupoSolicitud, type SolicitudGrupo } from './SelectorGrupoSolicitud';

export type RolPedido = 'guia' | 'guia_supervisor' | 'pastor' | 'encargado' | 'consolidacion';
export interface PedidoRegistro extends SolicitudGrupo {
  rol: RolPedido | null;
  /** Solo para el Guía Supervisor: si además guía un grupo */
  tambienGuia?: boolean;
}

const OPCIONES: {
  rol: RolPedido;
  titulo: string;
  detalle: string;
  icono: React.ComponentProps<typeof Ionicons>['name'];
  aprueba: string;
}[] = [
  { rol: 'guia', titulo: 'Guía de un grupo', detalle: 'Llevo un grupo de vida', icono: 'people', aprueba: 'Te aprueba el Guía Supervisor de tu grupo (o los encargados, si el grupo es nuevo).' },
  { rol: 'guia_supervisor', titulo: 'Guía Supervisor', detalle: 'Acompaño a varios guías', icono: 'shield-checkmark', aprueba: 'Te aprueban los encargados de tu red. Después vas a poder crear tus grupos.' },
  { rol: 'encargado', titulo: 'Encargado de red', detalle: 'Coordino la red', icono: 'git-network', aprueba: 'Te aprueba el Administrador de la app.' },
  { rol: 'pastor', titulo: 'Pastor', detalle: 'Pastoreo la red', icono: 'star', aprueba: 'Te aprueba el Administrador de la app.' },
  { rol: 'consolidacion', titulo: 'Consolidación', detalle: 'Sigo a las personas nuevas', icono: 'heart', aprueba: 'Te aprueban los encargados de tu red.' },
];

/**
 * "¿Cuál es tu servicio?": tarjetas para elegir el rol. Si es guía (o un
 * Guía Supervisor que también guía) se elige el grupo.
 */
export function SelectorRolRegistro({ redId, valor, onCambio }: { redId: string | null; valor: PedidoRegistro; onCambio: (v: PedidoRegistro) => void }) {
  if (!redId) return null;
  const elegido = OPCIONES.find((o) => o.rol === valor.rol);
  const muestraGrupo = valor.rol === 'guia' || (valor.rol === 'guia_supervisor' && valor.tambienGuia);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textSec, fontSize: 13, marginBottom: 8 }}>¿Cuál es tu servicio?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {OPCIONES.map((o) => {
          const activo = valor.rol === o.rol;
          return (
            <Pressable
              key={o.rol}
              onPress={() => onCambio({ rol: o.rol, grupoId: null, nuevo: null, tambienGuia: false, noGuia: o.rol !== 'guia' })}
              style={{
                flexBasis: '47%',
                flexGrow: 1,
                padding: 12,
                borderRadius: 14,
                backgroundColor: activo ? colors.primaryBg : colors.cardAlt,
                borderWidth: 1.5,
                borderColor: activo ? colors.primary : 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Ionicons name={o.icono} size={22} color={activo ? colors.primary : colors.textSec} />
                {activo ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
              </View>
              <Text style={{ color: colors.text, fontWeight: '800', marginTop: 8 }}>{o.titulo}</Text>
              <Text style={[s.textoFilaSec, { fontSize: 12, marginTop: 2 }]}>{o.detalle}</Text>
            </Pressable>
          );
        })}
      </View>

      {elegido ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, marginTop: 10 }}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 }}>{elegido.aprueba}</Text>
        </View>
      ) : null}

      {valor.rol === 'guia_supervisor' ? (
        <Pressable
          onPress={() => onCambio({ ...valor, tambienGuia: !valor.tambienGuia, grupoId: null, nuevo: null })}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}
        >
          <Ionicons name={valor.tambienGuia ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={{ color: colors.text }}>Además guío un grupo</Text>
        </Pressable>
      ) : null}

      {muestraGrupo ? (
        <View style={{ marginTop: 14 }}>
          <SelectorGrupoSolicitud
            redId={redId}
            valor={{ grupoId: valor.grupoId, nuevo: valor.nuevo }}
            onCambio={(v) => onCambio({ ...valor, grupoId: v.grupoId, nuevo: v.nuevo })}
          />
        </View>
      ) : null}
    </View>
  );
}

/** ¿Está completo lo que eligió? (para validar antes de crear la cuenta) */
export function pedidoCompleto(v: PedidoRegistro): string | null {
  if (!v.rol) return 'Elegí cuál es tu servicio.';
  const necesitaGrupo = v.rol === 'guia' || (v.rol === 'guia_supervisor' && v.tambienGuia);
  if (necesitaGrupo && !v.grupoId && !v.nuevo?.trim()) return 'Elegí tu grupo de la lista, o tocá "Es un grupo nuevo" y escribí su nombre.';
  return null;
}
