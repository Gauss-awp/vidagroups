import React, { useEffect, useState } from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Red } from '@/lib/types';
import { traducirError } from '@/lib/utils';
import { Boton, Campo, Chip, Pantalla, s } from '@/components/ui';
import { alerta } from '@/lib/alerta';

export default function Registro() {
  const router = useRouter();
  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', password: '', repetir: '' });
  const [cargando, setCargando] = useState(false);
  const [redes, setRedes] = useState<Red[]>([]);
  const [redId, setRedId] = useState<string | null>(null);
  // Paso 2: confirmar el correo con el código que llega por mail (sin links que vencen)
  const params = useLocalSearchParams<{ confirmar?: string }>();
  const [confirmando, setConfirmando] = useState<string | null>(params.confirmar ? String(params.confirmar) : null);
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    supabase.from('redes').select('id, nombre').order('nombre').then(({ data }) => setRedes((data ?? []) as Red[]));
  }, []);

  const cambiar = (campo: keyof typeof form) => (valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const registrar = async () => {
    if (!form.nombre.trim() || !form.email.trim() || !form.password) {
      alerta('Faltan datos', 'Completá nombre, correo y contraseña.');
      return;
    }
    if (!redId) {
      alerta('Falta tu red', 'Elegí la red a la que pertenecés.');
      return;
    }
    if (form.password.length < 8) {
      alerta('Contraseña corta', 'La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    if (form.password !== form.repetir) {
      alerta('Las contraseñas no coinciden', 'Escribí la misma contraseña en los dos campos.');
      return;
    }
    setCargando(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: { nombre: form.nombre.trim(), apellido: form.apellido.trim(), red_id: redId } },
    });
    setCargando(false);
    if (error) {
      alerta('No se pudo crear la cuenta', traducirError(error.message));
      return;
    }
    if (!data.session) {
      setCodigo('');
      setConfirmando(form.email.trim().toLowerCase());
    }
    // Si hay sesión, el layout redirige solo al inicio
  };

  const confirmar = async () => {
    if (!confirmando) return;
    const token = codigo.replace(/\D/g, '');
    if (token.length < 6) {
      alerta('Código incompleto', 'Escribí el código de 6 dígitos que te llegó por correo.');
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.verifyOtp({ email: confirmando, token, type: 'signup' });
    setCargando(false);
    if (error) {
      alerta('Código incorrecto o vencido', 'Revisá el código o pedí uno nuevo con "Reenviar código".');
      return;
    }
    // Con la cuenta confirmada queda la sesión iniciada: el layout la lleva sola a "Esperando aprobación"
  };

  const reenviar = async () => {
    if (!confirmando) return;
    setCargando(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: confirmando });
    setCargando(false);
    if (error) alerta('No se pudo reenviar', traducirError(error.message));
    else alerta('Código enviado', `Te mandamos un código nuevo a ${confirmando}. Si no lo ves, revisá en spam.`);
  };

  if (confirmando) {
    return (
      <Pantalla>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Pressable onPress={() => router.replace('/login')} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 17 }}>Ingresar</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '700' }}>Confirmá tu correo</Text>
            <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 6, marginBottom: 24, lineHeight: 21 }}>
              Te mandamos un código de 6 dígitos a <Text style={{ fontWeight: '700', color: colors.text }}>{confirmando}</Text>. Escribilo acá. Si no lo ves, revisá en spam.
            </Text>
            <Campo
              etiqueta="Código"
              placeholder="123456"
              value={codigo}
              onChangeText={setCodigo}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={10}
            />
            <Boton titulo="Confirmar" onPress={confirmar} cargando={cargando} style={{ marginTop: 8 }} />
            <Pressable onPress={reenviar} disabled={cargando} style={{ marginTop: 18, alignSelf: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Reenviar código</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 17 }}>Ingresar</Text>
          </Pressable>

          <Text style={{ color: colors.text, fontSize: 34, fontWeight: '700' }}>Crear cuenta</Text>
          <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 6, marginBottom: 24, lineHeight: 21 }}>
            Elegí tu red. El encargado de esa red aprueba tu cuenta y te asigna el rol.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Nombre" value={form.nombre} onChangeText={cambiar('nombre')} textContentType="givenName" />
            </View>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Apellido" value={form.apellido} onChangeText={cambiar('apellido')} textContentType="familyName" />
            </View>
          </View>
          <Text style={s.etiqueta}>Tu red</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {redes.map((r) => (
              <Chip key={r.id} texto={r.nombre} activo={redId === r.id} onPress={() => setRedId(r.id)} />
            ))}
          </View>
          <Campo
            etiqueta="Correo"
            placeholder="tu@correo.com"
            value={form.email}
            onChangeText={cambiar('email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Campo
            etiqueta="Contraseña"
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChangeText={cambiar('password')}
            secureTextEntry
            textContentType="newPassword"
          />
          <Campo etiqueta="Repetir contraseña" value={form.repetir} onChangeText={cambiar('repetir')} secureTextEntry />

          <Boton titulo="Crear cuenta" onPress={registrar} cargando={cargando} style={{ marginTop: 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}
