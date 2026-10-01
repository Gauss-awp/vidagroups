import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { traducirError } from '@/lib/utils';
import { Boton, Campo, Pantalla } from '@/components/ui';

/**
 * Recuperar contraseña con un código de 6 dígitos que llega por correo.
 * No necesita links ni configuración de la app: todo pasa en esta pantalla.
 */
export default function Recuperar() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);

  const enviarCodigo = async () => {
    if (!email.trim()) {
      Alert.alert('Falta el correo', 'Escribí el correo con el que te registraste.');
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setCargando(false);
    if (error) {
      Alert.alert('No se pudo enviar el código', traducirError(error.message));
      return;
    }
    setPaso(2);
  };

  const cambiarClave = async () => {
    if (codigo.trim().length < 6) {
      Alert.alert('Código incompleto', 'Escribí el código de 6 dígitos que te llegó por correo.');
      return;
    }
    if (clave.length < 8) {
      Alert.alert('Contraseña corta', 'La contraseña nueva tiene que tener al menos 8 caracteres.');
      return;
    }
    setCargando(true);
    const { error: errCodigo } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codigo.trim(),
      type: 'recovery',
    });
    if (errCodigo) {
      setCargando(false);
      Alert.alert('Código incorrecto o vencido', 'Revisá el código o pedí uno nuevo.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: clave });
    setCargando(false);
    if (error) {
      Alert.alert('No se pudo cambiar la contraseña', traducirError(error.message));
      return;
    }
    // Ya quedó con la sesión iniciada: el layout la lleva al inicio
    Alert.alert('Listo', 'Tu contraseña se cambió.');
  };

  return (
    <Pantalla>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 17 }}>Ingresar</Text>
          </Pressable>

          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>Recuperar contraseña</Text>
          <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 6, marginBottom: 24, lineHeight: 21 }}>
            {paso === 1
              ? 'Te mandamos un código de 6 dígitos a tu correo.'
              : `Escribí el código que te llegó a ${email.trim()} y elegí una contraseña nueva.`}
          </Text>

          {paso === 1 ? (
            <>
              <Campo
                etiqueta="Correo"
                placeholder="tu@correo.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <Boton titulo="Enviar código" onPress={enviarCodigo} cargando={cargando} />
            </>
          ) : (
            <>
              <Campo etiqueta="Código" placeholder="123456" value={codigo} onChangeText={setCodigo} keyboardType="number-pad" maxLength={6} />
              <Campo
                etiqueta="Contraseña nueva"
                placeholder="Mínimo 8 caracteres"
                value={clave}
                onChangeText={setClave}
                secureTextEntry
                textContentType="newPassword"
              />
              <Boton titulo="Cambiar contraseña" onPress={cambiarClave} cargando={cargando} />
              <Boton titulo="Reenviar código" variante="texto" onPress={enviarCodigo} style={{ marginTop: 8 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}
