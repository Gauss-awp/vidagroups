import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatoFecha } from '@/lib/utils';
import { Boton, Campo, Card, HojaModal } from '@/components/ui';
import { Deslizable } from '@/components/Deslizable';

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
  contactado: boolean;
  contactado_por: string | null;
  contactado_en: string | null;
  nota: string | null;
  descartada: boolean;
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
  const [verContactados, setVerContactados] = useState(false);
  const [contactando, setContactando] = useState<Alerta | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Última alerta descartada, para poder deshacer
  const [deshacer, setDeshacer] = useState<{ id: string; nombre: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('miembros_en_alerta', { p_minimo: minimo, p_incluir_contactados: true });
    if (error) return;
    let lista = (data ?? []) as Alerta[];
    if (grupoId) lista = lista.filter((a) => a.grupo_id === grupoId);
    if (redId) lista = lista.filter((a) => a.red_id === redId);
    setAlertas(lista);
  }, [minimo, grupoId, redId]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const pendientes = alertas.filter((a) => !a.contactado);

  // Ocultar la alerta sin anotar contacto: vuelve sola si falta a otra reunión
  const descartar = async (a: Alerta) => {
    setAlertas((prev) => prev.map((x) => (x.miembro_id === a.miembro_id ? { ...x, contactado: true, descartada: true } : x)));
    const { data: usuario } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('seguimientos_faltas')
      .insert({ miembro_id: a.miembro_id, faltas: a.faltas, tipo: 'descartada', contactado_por: usuario.user?.id })
      .select('id')
      .single();
    if (error) {
      Alert.alert('No se pudo ocultar', error.message);
      cargar();
      return;
    }
    setDeshacer({ id: data.id, nombre: `${a.nombre} ${a.apellido ?? ''}`.trim() });
  };

  const deshacerDescarte = async () => {
    if (!deshacer) return;
    await supabase.from('seguimientos_faltas').delete().eq('id', deshacer.id);
    setDeshacer(null);
    cargar();
  };
  const contactados = alertas.filter((a) => a.contactado && !a.descartada);

  const registrarContacto = async () => {
    if (!contactando) return;
    setGuardando(true);
    const { data: usuario } = await supabase.auth.getUser();
    const { error } = await supabase.from('seguimientos_faltas').insert({
      miembro_id: contactando.miembro_id,
      faltas: contactando.faltas,
      nota: nota.trim() || null,
      contactado_por: usuario.user?.id,
    });
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    setContactando(null);
    setNota('');
    cargar();
  };

  // Si no queda ninguna alerta pendiente, la tarjeta se va de la pantalla
  if (pendientes.length === 0 && !deshacer) return null;

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
          {pendientes.length ? `Miembros que necesitan atención (${pendientes.length})` : 'Alertas ocultas'}
        </Text>
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSec} />
      </Pressable>

      {abierto
        ? pendientes.map((a) => {
            const rojo = a.faltas >= 3;
            return (
              <Deslizable key={a.miembro_id} onDescartar={() => descartar(a)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: colors.dangerBorde, marginTop: 8, backgroundColor: colors.dangerBg }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rojo ? colors.danger : colors.warning, marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{`${a.nombre} ${a.apellido ?? ''}`.trim()}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSec }}>
                    {a.faltas} faltas seguidas · {a.grupo} · última reunión {formatoFecha(a.ultima_reunion)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setNota('');
                    setContactando(a);
                  }}
                  hitSlop={8}
                  style={{ padding: 6 }}
                  accessibilityLabel="Ya lo contacté"
                >
                  <Ionicons name="checkmark-done-circle-outline" size={24} color={colors.success} />
                </Pressable>
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
                <Pressable onPress={() => descartar(a)} hitSlop={8} style={{ padding: 6 }} accessibilityLabel="Ocultar esta alerta">
                  <Ionicons name="close" size={20} color={colors.textSec} />
                </Pressable>
              </View>
              </Deslizable>
            );
          })
        : null}

      {deshacer ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: colors.textSec, fontSize: 13, flex: 1 }}>Se ocultó la alerta de {deshacer.nombre}.</Text>
          <Pressable onPress={deshacerDescarte} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}

      {abierto && pendientes.length > 0 ? (
        <Text style={{ color: colors.textSec, fontSize: 11, marginTop: 8 }}>
          Deslizá una alerta hacia la izquierda o tocá ✕ para ocultarla. Vuelve sola si falta a otra reunión.
        </Text>
      ) : null}

      {abierto && contactados.length > 0 ? (
        <Pressable onPress={() => setVerContactados(!verContactados)} style={{ marginTop: 10, paddingVertical: 4 }}>
          <Text style={{ color: colors.textSec, fontSize: 13, fontWeight: '600' }}>
            {verContactados ? 'Ocultar' : 'Ver'} ya contactados ({contactados.length})
          </Text>
        </Pressable>
      ) : null}
      {abierto && verContactados
        ? contactados.map((a) => (
            <View key={a.miembro_id} style={{ paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: colors.border, opacity: 0.8 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>
                {`${a.nombre} ${a.apellido ?? ''}`.trim()} · {a.faltas} faltas
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSec }}>
                Contactado{a.contactado_por ? ` por ${a.contactado_por}` : ''}{a.contactado_en ? ` el ${formatoFecha(a.contactado_en.slice(0, 10))}` : ''}
                {a.nota ? ` · ${a.nota}` : ''}
              </Text>
            </View>
          ))
        : null}

      <HojaModal visible={!!contactando} onClose={() => setContactando(null)} titulo="Ya lo contacté">
        <Text style={{ color: colors.textSec, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
          La alerta de {contactando ? `${contactando.nombre} ${contactando.apellido ?? ''}`.trim() : ''} se oculta. Si vuelve a faltar a la próxima reunión, aparece de nuevo.
        </Text>
        <Campo etiqueta="Nota (opcional)" placeholder="Ej: está de viaje hasta el 20" value={nota} onChangeText={setNota} multiline />
        <Boton titulo="Guardar contacto" onPress={registrarContacto} cargando={guardando} />
      </HojaModal>
    </Card>
  );
}
