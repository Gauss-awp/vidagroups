import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ROL_COLOR, colors } from '@/lib/theme';
import type { Rol } from '@/lib/types';
import { ROL_LABEL } from '@/lib/utils';
import { alerta } from '@/lib/alerta';
import { candidatosParecidos } from '@/lib/parecidos';
import { useAuth } from '@/context/AuthContext';
import { Avatar, Boton, Card, Chip, HojaModal, SeccionTitulo, s } from '@/components/ui';

interface Solicitud {
  id: string;
  nombre: string;
  email: string;
  red_id: string | null;
  red: string | null;
  creado_en: string;
  grupo_id: string | null;
  grupo: string | null;
  grupo_guias: string | null;
  grupo_nuevo: string | null;
  grupo_nuevo_existe: string | null;
  no_guia: boolean;
  rol_pedido: string | null;
}
interface GrupoRed {
  id: string;
  nombre: string;
  guias: string | null;
}
const PEDIDO_LABEL: Record<string, string> = {
  guia: 'Guía',
  guia_supervisor: 'Guía Supervisor',
  encargado: 'Encargado de red',
  pastor: 'Pastor',
  consolidacion: 'Consolidación',
};

type Destino = { tipo: 'existente'; id: string; nombre: string } | { tipo: 'nuevo'; nombre: string } | { tipo: 'ninguno' };

/**
 * Cuentas que esperan aprobación. Al aprobar se elige el rol y el grupo:
 * se suma a uno que ya existe o se crea el grupo nuevo que pidió.
 */
export function SolicitudesCuentas({ redId, onCambio, ocultarSiVacio = false }: { redId?: string; onCambio?: () => void; ocultarSiVacio?: boolean }) {
  const { perfil, redesAdmin } = useAuth();
  const [lista, setLista] = useState<Solicitud[]>([]);
  const [grupos, setGrupos] = useState<Record<string, GrupoRed[]>>({});
  const [abierta, setAbierta] = useState<Solicitud | null>(null);
  const [rol, setRol] = useState<Rol>('guia');
  const [destino, setDestino] = useState<Destino>({ tipo: 'ninguno' });
  const [eligiendoOtro, setEligiendoOtro] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('solicitudes_pendientes');
    const todas = ((data ?? []) as Solicitud[]).filter((x) => !redId || x.red_id === redId);
    setLista(todas);
    const redes = [...new Set(todas.map((x) => x.red_id).filter(Boolean))] as string[];
    const mapa: Record<string, GrupoRed[]> = {};
    await Promise.all(
      redes.map(async (r) => {
        const { data: g } = await supabase.rpc('grupos_para_registro', { p_red: r });
        mapa[r] = (g ?? []) as GrupoRed[];
      })
    );
    setGrupos(mapa);
  }, [redId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const administra = (red: string | null) => !!red && redesAdmin.some((r) => r.id === red);
  const rolesPara = (x: Solicitud): Rol[] => {
    if (perfil?.rol === 'administrador' || perfil?.rol === 'apostol') return ['guia', 'guia_supervisor', 'consolidacion', 'pastor'];
    if (administra(x.red_id)) return ['guia', 'guia_supervisor', 'consolidacion'];
    return ['guia'];
  };

  const destinoSugerido = (x: Solicitud): Destino => {
    if (x.grupo_id && x.grupo) return { tipo: 'existente', id: x.grupo_id, nombre: x.grupo };
    if (x.grupo_nuevo && x.grupo_nuevo_existe) {
      const g = (grupos[x.red_id ?? ''] ?? []).find((y) => y.id === x.grupo_nuevo_existe);
      return { tipo: 'existente', id: x.grupo_nuevo_existe, nombre: g?.nombre ?? x.grupo_nuevo };
    }
    if (x.grupo_nuevo) return { tipo: 'nuevo', nombre: x.grupo_nuevo };
    return { tipo: 'ninguno' };
  };

  const abrir = (x: Solicitud) => {
    setAbierta(x);
    // Si dijo que no es guía, se propone Guía Supervisor (si quien aprueba puede asignarlo)
    const propuesto: Rol =
      x.rol_pedido === 'pastor' ? 'pastor' : x.rol_pedido === 'consolidacion' ? 'consolidacion' : x.rol_pedido === 'guia_supervisor' || x.rol_pedido === 'encargado' || x.no_guia ? 'guia_supervisor' : 'guia';
    setRol(rolesPara(x).includes(propuesto) ? propuesto : 'guia');
    setDestino(destinoSugerido(x));
    setEligiendoOtro(false);
  };

  const aprobar = async () => {
    if (!abierta) return;
    const guiaGrupo = rol === 'guia' || rol === 'guia_supervisor';
    setGuardando(true);
    const { error } = await supabase.rpc('aprobar_cuenta', {
      p_perfil: abierta.id,
      p_rol: rol,
      p_grupo: guiaGrupo && destino.tipo === 'existente' ? destino.id : null,
      p_grupo_nuevo: guiaGrupo && destino.tipo === 'nuevo' ? destino.nombre : null,
    });
    setGuardando(false);
    if (error) {
      alerta('No se pudo aprobar', error.message);
      return;
    }
    setAbierta(null);
    await cargar();
    onCambio?.();
  };

  const rechazar = (x: Solicitud) =>
    alerta('Rechazar cuenta', `¿Rechazar a ${x.nombre}? No va a poder ver nada en la app.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rechazar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('rechazar_cuenta', { p_perfil: x.id });
          if (error) alerta('No se pudo rechazar', error.message);
          else cargar();
        },
      },
    ]);

  if (ocultarSiVacio && lista.length === 0) return null;

  // Otras personas que pidieron el mismo grupo nuevo (para avisar que van juntas)
  const companeros = (x: Solicitud) =>
    lista.filter((y) => y.id !== x.id && y.grupo_nuevo && x.grupo_nuevo && y.grupo_nuevo.trim().toLowerCase() === x.grupo_nuevo.trim().toLowerCase());

  const pedido = (x: Solicitud) => {
    if (x.grupo) return `Quiere sumarse a ${x.grupo}${x.grupo_guias ? ` (con ${x.grupo_guias})` : ''}`;
    if (x.grupo_nuevo) return `Abre un grupo nuevo: "${x.grupo_nuevo}"${x.grupo_nuevo_existe ? ' (ya existe: se suma ahí)' : ''}`;
    if (x.rol_pedido && x.rol_pedido !== 'guia') return `Se registró como ${PEDIDO_LABEL[x.rol_pedido] ?? x.rol_pedido}`;
    if (x.no_guia) return 'No es guía (Guía Supervisor, pastor, encargado o consolidación)';
    return 'No indicó grupo';
  };

  const opcion = (activo: boolean, texto: string, onPress: () => void, icono: React.ComponentProps<typeof Ionicons>['name']) => (
    <Pressable onPress={onPress} style={s.filaLista}>
      <Ionicons name={activo ? 'radio-button-on' : 'radio-button-off'} size={22} color={activo ? colors.primary : colors.textTer} style={{ marginRight: 10 }} />
      <Ionicons name={icono} size={16} color={colors.textSec} style={{ marginRight: 6 }} />
      <Text style={[s.textoFila, { flex: 1 }]}>{texto}</Text>
    </Pressable>
  );

  const gruposRed = abierta ? grupos[abierta.red_id ?? ''] ?? [] : [];
  const parecido =
    abierta?.grupo_nuevo && !abierta.grupo_nuevo_existe ? candidatosParecidos(abierta.grupo_nuevo, gruposRed, 0.6, 1)[0] : null;

  return (
    <View>
      <SeccionTitulo titulo={`Cuentas para aprobar (${lista.length})`} />
      {lista.length === 0 ? (
        <Card>
          <Text style={s.textoFilaSec}>No hay cuentas nuevas esperando.</Text>
        </Card>
      ) : (
        lista.map((x) => {
          const juntos = companeros(x);
          return (
            <Card key={x.id}>
              <View style={s.fila}>
                <Avatar nombre={x.nombre} color={colors.warning} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.textoFila}>{x.nombre}</Text>
                  <Text style={s.textoFilaSec}>{x.email}</Text>
                  <Text style={{ color: x.grupo || x.grupo_nuevo ? colors.primary : colors.textSec, fontSize: 13, marginTop: 4, fontWeight: '600' }}>{pedido(x)}</Text>
                  {juntos.length ? (
                    <Text style={[s.textoFilaSec, { fontSize: 12 }]}>También lo pidió: {juntos.map((j) => j.nombre).join(', ')}. Van a quedar en el mismo grupo.</Text>
                  ) : null}
                </View>
              </View>
              <View style={[s.fila, { gap: 8, marginTop: 12 }]}>
                <Boton titulo="Aprobar" icono="checkmark" compacto onPress={() => abrir(x)} style={{ flex: 1 }} />
                <Boton titulo="Rechazar" variante="peligro" compacto onPress={() => rechazar(x)} style={{ flex: 1 }} />
              </View>
            </Card>
          );
        })
      )}

      <HojaModal visible={!!abierta} onClose={() => setAbierta(null)} titulo={abierta ? `Aprobar a ${abierta.nombre}` : ''}>
        {abierta ? (
          <>
            <Text style={s.etiqueta}>Rol</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {rolesPara(abierta).map((r) => (
                <Chip key={r} texto={ROL_LABEL[r]} activo={rol === r} color={ROL_COLOR[r]} onPress={() => setRol(r)} />
              ))}
            </View>
            {abierta.rol_pedido === 'encargado' || abierta.rol_pedido === 'pastor' || abierta.rol_pedido === 'consolidacion' ? (
              <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 10 }]}>
                {abierta.rol_pedido === 'encargado'
                  ? 'Después de aprobarlo, el Administrador lo suma en Responsables → Encargados para que vea "Mi Red".'
                  : abierta.rol_pedido === 'pastor'
                    ? 'Después de aprobarlo, el Administrador lo suma en Responsables → Pastores de la red.'
                    : 'Después de aprobarla, el Administrador la suma en Responsables → Consolidadores.'}
              </Text>
            ) : null}
            {rolesPara(abierta).length === 1 ? (
              <Text style={[s.textoFilaSec, { fontSize: 12, marginBottom: 10 }]}>Como Guía Supervisor aprobás guías. Los otros roles los aprueban los encargados.</Text>
            ) : null}

            {rol === 'guia' || rol === 'guia_supervisor' ? (
              <>
                <Text style={s.etiqueta}>Grupo</Text>
                {abierta.grupo_id && abierta.grupo
                  ? opcion(destino.tipo === 'existente' && destino.id === abierta.grupo_id, `Sumarlo a ${abierta.grupo}${abierta.grupo_guias ? ` (con ${abierta.grupo_guias})` : ''}`, () => setDestino({ tipo: 'existente', id: abierta.grupo_id!, nombre: abierta.grupo! }), 'people-outline')
                  : null}
                {abierta.grupo_nuevo && abierta.grupo_nuevo_existe
                  ? opcion(destino.tipo === 'existente' && destino.id === abierta.grupo_nuevo_existe, `Sumarlo a "${abierta.grupo_nuevo}" (ya existe)`, () => setDestino(destinoSugerido(abierta)), 'people-outline')
                  : null}
                {abierta.grupo_nuevo && !abierta.grupo_nuevo_existe
                  ? opcion(destino.tipo === 'nuevo', `Crear el grupo "${abierta.grupo_nuevo}"`, () => setDestino({ tipo: 'nuevo', nombre: abierta.grupo_nuevo! }), 'add-circle-outline')
                  : null}
                {parecido ? (
                  <View style={{ backgroundColor: colors.warningBg, borderRadius: 10, padding: 10, marginVertical: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      ¿No será <Text style={{ fontWeight: '800' }}>{parecido.nombre}</Text>? Ya existe un grupo con un nombre parecido.
                    </Text>
                    <Pressable onPress={() => setDestino({ tipo: 'existente', id: parecido.id, nombre: parecido.nombre })} style={{ marginTop: 6 }}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>Sumarlo a {parecido.nombre}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {destino.tipo === 'existente' && destino.id !== abierta.grupo_id && destino.id !== abierta.grupo_nuevo_existe
                  ? opcion(true, `Sumarlo a ${destino.nombre}`, () => undefined, 'people-outline')
                  : null}
                {opcion(eligiendoOtro, 'Elegir otro grupo…', () => setEligiendoOtro(!eligiendoOtro), 'list-outline')}
                {eligiendoOtro ? (
                  <ScrollView style={{ maxHeight: 220, marginBottom: 6 }}>
                    {gruposRed.map((g) => (
                      <Chip
                        key={g.id}
                        texto={`${g.nombre}${g.guias ? ` · ${g.guias}` : ''}`}
                        activo={destino.tipo === 'existente' && destino.id === g.id}
                        onPress={() => {
                          setDestino({ tipo: 'existente', id: g.id, nombre: g.nombre });
                          setEligiendoOtro(false);
                        }}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                {opcion(destino.tipo === 'ninguno', 'Sin grupo por ahora', () => setDestino({ tipo: 'ninguno' }), 'remove-circle-outline')}
              </>
            ) : null}

            <Boton
              titulo={
                (rol === 'guia' || rol === 'guia_supervisor') && destino.tipo === 'nuevo'
                  ? 'Aprobar y crear el grupo'
                  : (rol === 'guia' || rol === 'guia_supervisor') && destino.tipo === 'existente'
                    ? 'Aprobar y sumarlo al grupo'
                    : 'Aprobar'
              }
              icono="checkmark"
              onPress={aprobar}
              cargando={guardando}
              style={{ marginTop: 14 }}
            />
          </>
        ) : null}
      </HojaModal>
    </View>
  );
}
