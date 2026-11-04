import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { formatoFecha } from '@/lib/utils';
import { AYUDA, normalizar, type ItemAyuda } from '@/lib/ayuda';
import { pantallaDeOrigen, versionApp } from '@/lib/reporteErrores';
import { useAuth } from '@/context/AuthContext';
import { Boton, Card, HojaModal, SeccionTitulo, s } from '@/components/ui';

type Tipo = 'problema' | 'sugerencia' | 'pregunta';
interface Mensaje {
  id: string;
  tipo: Tipo;
  mensaje: string;
  estado: 'nuevo' | 'visto' | 'resuelto';
  respuesta: string | null;
  creado_en: string;
}
const TIPOS: { tipo: Tipo; texto: string; icono: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { tipo: 'problema', texto: 'Algo no anda', icono: 'bug-outline' },
  { tipo: 'pregunta', texto: 'Tengo una duda', icono: 'help-circle-outline' },
  { tipo: 'sugerencia', texto: 'Tengo una idea', icono: 'bulb-outline' },
];

/** Ayuda: preguntas frecuentes según el rol y un canal para escribir al Administrador. */
export default function Ayuda() {
  const { perfil } = useAuth();
  const params = useLocalSearchParams<{ escribir?: string }>();
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [escribiendo, setEscribiendo] = useState(params.escribir === '1');
  const [tipo, setTipo] = useState<Tipo>('problema');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);

  const cargarMensajes = useCallback(async () => {
    const { data } = await supabase
      .from('mensajes_ayuda')
      .select('id, tipo, mensaje, estado, respuesta, creado_en')
      .order('creado_en', { ascending: false })
      .limit(20);
    setMensajes((data ?? []) as Mensaje[]);
  }, []);

  useEffect(() => {
    cargarMensajes();
  }, [cargarMensajes]);

  const enviar = async () => {
    if (texto.trim().length < 5) {
      alerta('Falta el mensaje', 'Contanos qué pasó o qué querés proponer.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.from('mensajes_ayuda').insert({
      tipo,
      mensaje: texto.trim(),
      pantalla: pantallaDeOrigen(),
      version: versionApp(),
      plataforma: Platform.OS,
    });
    setEnviando(false);
    if (error) {
      alerta('No se pudo enviar', error.message);
      return;
    }
    setTexto('');
    setEscribiendo(false);
    cargarMensajes();
    alerta('¡Gracias!', 'Tu mensaje llegó. La respuesta te aparece acá, en "Mis mensajes".');
  };

  const rol = perfil?.rol;
  const q = normalizar(busqueda.trim());
  const filtrar = (lista: ItemAyuda[]) => (q ? lista.filter((i) => normalizar(`${i.titulo} ${i.texto}`).includes(q)) : lista);
  const paraVos = filtrar(AYUDA.filter((i) => i.roles?.length && rol && i.roles.includes(rol)));
  const paraTodos = filtrar(AYUDA.filter((i) => !i.roles?.length));
  const otros = q ? filtrar(AYUDA.filter((i) => i.roles?.length && !(rol && i.roles.includes(rol)))) : [];

  const item = (i: ItemAyuda) => {
    const abiertoEste = abierto === i.titulo;
    return (
      <Card key={i.titulo} onPress={() => setAbierto(abiertoEste ? null : i.titulo)}>
        <View style={s.fila}>
          <Text style={[s.textoFila, { flex: 1, fontWeight: '700' }]}>{i.titulo}</Text>
          <Ionicons name={abiertoEste ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSec} />
        </View>
        {abiertoEste ? <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 10 }}>{i.texto}</Text> : null}
      </Card>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Ayuda' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, borderWidth: 0.5, borderColor: colors.border }}>
          <Ionicons name="search" size={18} color={colors.textTer} />
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar: reunión, código, planilla…"
            placeholderTextColor={colors.textTer}
            style={{ flex: 1, padding: 12, color: colors.text }}
          />
        </View>

        {paraVos.length ? (
          <>
            <SeccionTitulo titulo="Para vos" />
            {paraVos.map(item)}
          </>
        ) : null}
        {paraTodos.length ? (
          <>
            <SeccionTitulo titulo="Para todos" />
            {paraTodos.map(item)}
          </>
        ) : null}
        {otros.length ? (
          <>
            <SeccionTitulo titulo="Otros roles" />
            {otros.map(item)}
          </>
        ) : null}
        {q && !paraVos.length && !paraTodos.length && !otros.length ? (
          <Card>
            <Text style={s.textoFilaSec}>No encontramos nada con "{busqueda}". Escribinos abajo y te ayudamos.</Text>
          </Card>
        ) : null}

        <Card style={{ marginTop: 16, backgroundColor: colors.primaryBg }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>¿No encontraste lo que buscabas?</Text>
          <Text style={[s.textoFilaSec, { marginTop: 4, marginBottom: 10 }]}>Contanos un problema, una duda o una idea. Te respondemos por acá.</Text>
          <Boton titulo="Escribir un mensaje" icono="chatbubble-ellipses-outline" onPress={() => setEscribiendo(true)} />
        </Card>

        {mensajes.length ? (
          <>
            <SeccionTitulo titulo="Mis mensajes" />
            {mensajes.map((m) => (
              <Card key={m.id}>
                <Text style={{ color: colors.textSec, fontSize: 12 }}>
                  {formatoFecha(m.creado_en.slice(0, 10))} · {TIPOS.find((t) => t.tipo === m.tipo)?.texto} ·{' '}
                  <Text style={{ color: m.estado === 'resuelto' ? colors.success : m.respuesta ? colors.primary : colors.textSec, fontWeight: '700' }}>
                    {m.estado === 'resuelto' ? 'Resuelto' : m.respuesta ? 'Respondido' : 'Enviado'}
                  </Text>
                </Text>
                <Text style={{ color: colors.text, marginTop: 4 }}>{m.mensaje}</Text>
                {m.respuesta ? (
                  <View style={{ backgroundColor: colors.cardAlt, borderRadius: 10, padding: 10, marginTop: 8 }}>
                    <Text style={{ color: colors.textSec, fontSize: 12, fontWeight: '700', marginBottom: 2 }}>Respuesta</Text>
                    <Text style={{ color: colors.text }}>{m.respuesta}</Text>
                  </View>
                ) : null}
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>

      <HojaModal visible={escribiendo} onClose={() => setEscribiendo(false)} titulo="Escribir un mensaje">
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {TIPOS.map((t) => (
            <Pressable
              key={t.tipo}
              onPress={() => setTipo(t.tipo)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: tipo === t.tipo ? colors.primary : colors.cardAlt,
              }}
            >
              <Ionicons name={t.icono} size={20} color={tipo === t.tipo ? '#FFFFFF' : colors.text} />
              <Text style={{ color: tipo === t.tipo ? '#FFFFFF' : colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 }}>{t.texto}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={texto}
          onChangeText={setTexto}
          multiline
          placeholder={
            tipo === 'problema'
              ? 'Ej: Cuando quiero borrar una reunión me sale un error…'
              : tipo === 'pregunta'
                ? 'Ej: ¿Cómo cambio el día de mi grupo?'
                : 'Ej: Estaría bueno poder…'
          }
          placeholderTextColor={colors.textTer}
          style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: 12, color: colors.text, minHeight: 110, textAlignVertical: 'top' }}
        />
        <Text style={[s.textoFilaSec, { fontSize: 12, marginTop: 8, marginBottom: 12 }]}>
          Se envía con la versión de la app y la pantalla donde estabas, para entender mejor qué pasó. No incluye datos de tu grupo.
        </Text>
        <Boton titulo="Enviar" icono="send" onPress={enviar} cargando={enviando} />
      </HojaModal>
    </>
  );
}
