import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colorPorcentaje, colors } from '@/lib/theme';
import { formatoFecha } from '@/lib/utils';
import { Card, SeccionTitulo, s } from '@/components/ui';

interface GrupoSup {
  id: string;
  nombre: string;
  guia: string | null;
  miembros: number;
  ultima: string | null;
  asistencia: number | null;
  alertas: number;
  sin_reunion: boolean;
}
interface Supervisor {
  id: string;
  nombre: string;
  telefono: string | null;
  grupos: number;
  miembros: number;
  asistencia: number | null;
  asistencia_anterior: number | null;
  sin_reunion: number;
  sin_empezar: number;
  c_semana: number;
  alertas: number;
  lista_grupos: GrupoSup[];
}

const abrirWhatsApp = (tel: string, texto: string) => {
  let n = tel.replace(/[^0-9]/g, '');
  if (!n.startsWith('54')) n = `549${n.replace(/^0/, '')}`;
  Linking.openURL(`https://wa.me/${n}?text=${encodeURIComponent(texto)}`);
};

/** Una tarjeta por Guía Supervisor: para que el pastor vea a qué supervisor acompañar. */
export function SupervisoresPastoral({ refreshKey = 0 }: { refreshKey?: number }) {
  const router = useRouter();
  const [lista, setLista] = useState<Supervisor[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('panel_supervisores');
    setLista((data ?? []) as Supervisor[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  if (lista.length === 0) return null;

  return (
    <>
      <SeccionTitulo titulo={`Supervisores (${lista.length})`} />
      {lista.map((sp) => {
        const dif = sp.asistencia !== null && sp.asistencia_anterior !== null ? sp.asistencia - sp.asistencia_anterior : null;
        const avisos: { texto: string; color: string; icono: React.ComponentProps<typeof Ionicons>['name'] }[] = [];
        if (sp.sin_reunion) avisos.push({ texto: `${sp.sin_reunion} ${sp.sin_reunion === 1 ? 'grupo' : 'grupos'} sin reunión hace 2 semanas`, color: colors.warning, icono: 'pause-circle' });
        if (sp.alertas) avisos.push({ texto: `${sp.alertas} ${sp.alertas === 1 ? 'hermano' : 'hermanos'} con 3 faltas seguidas`, color: colors.danger, icono: 'alert-circle' });
        if (sp.sin_empezar) avisos.push({ texto: `${sp.sin_empezar} ${sp.sin_empezar === 1 ? 'persona nueva' : 'personas nuevas'} sin empezar el grupo`, color: colors.primary, icono: 'person-add' });
        const estaAbierto = abierto === sp.id;
        return (
          <Card key={sp.id}>
            <Pressable onPress={() => setAbierto(estaAbierto ? null : sp.id)}>
              <View style={s.fila}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{sp.nombre}</Text>
                  <Text style={s.textoFilaSec}>
                    {sp.grupos} {sp.grupos === 1 ? 'grupo' : 'grupos'} · {sp.miembros} miembros
                    {sp.c_semana ? ` · ${sp.c_semana} C esta semana` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: sp.asistencia === null ? colors.textTer : colorPorcentaje(sp.asistencia) }}>
                    {sp.asistencia === null ? '—' : `${sp.asistencia}%`}
                  </Text>
                  {dif !== null ? (
                    <View style={s.fila}>
                      <Ionicons name={dif >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={dif >= 0 ? colors.success : colors.danger} />
                      <Text style={{ fontSize: 11, color: dif >= 0 ? colors.success : colors.danger }}>{Math.abs(dif)} vs mes ant.</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.textSec }}>asistencia del mes</Text>
                  )}
                </View>
              </View>

              {avisos.length ? (
                <View style={{ marginTop: 10, gap: 4 }}>
                  {avisos.map((a) => (
                    <View key={a.texto} style={s.fila}>
                      <Ionicons name={a.icono} size={16} color={a.color} style={{ marginRight: 6 }} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>{a.texto}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[s.fila, { marginTop: 10 }]}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginRight: 6 }} />
                  <Text style={{ color: colors.success, fontSize: 13, fontWeight: '600' }}>Sus grupos vienen en orden</Text>
                </View>
              )}

              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', marginTop: 10 }}>
                {estaAbierto ? 'Ocultar grupos' : 'Ver sus grupos'}
              </Text>
            </Pressable>

            {estaAbierto ? (
              <View style={{ marginTop: 6 }}>
                {sp.lista_grupos.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push({ pathname: '/grupo/[id]', params: { id: g.id } })}
                    style={s.filaLista}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.textoFila}>{g.nombre}</Text>
                      <Text style={s.textoFilaSec}>
                        {g.guia ? `Guía: ${g.guia} · ` : ''}
                        {g.miembros} miembros · {g.ultima ? `última reunión ${formatoFecha(g.ultima)}` : 'sin reuniones'}
                        {g.alertas ? ` · ${g.alertas} con faltas` : ''}
                      </Text>
                    </View>
                    {g.sin_reunion ? <Ionicons name="pause-circle" size={18} color={colors.warning} style={{ marginRight: 8 }} /> : null}
                    <Text style={{ fontWeight: '800', color: g.asistencia === null ? colors.textTer : colorPorcentaje(g.asistencia) }}>
                      {g.asistencia === null ? '—' : `${g.asistencia}%`}
                    </Text>
                  </Pressable>
                ))}
                {sp.telefono ? (
                  <Pressable
                    onPress={() => abrirWhatsApp(sp.telefono!, `Hola ${sp.nombre.split(' ')[0]}! ¿Cómo vienen tus grupos esta semana?`)}
                    style={[s.fila, { marginTop: 10 }]}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color={colors.success} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.success, fontWeight: '700' }}>Escribirle por WhatsApp</Text>
                  </Pressable>
                ) : (
                  <Text style={[s.textoFilaSec, { marginTop: 10 }]}>Si carga su teléfono en Perfil, le vas a poder escribir desde acá.</Text>
                )}
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}
