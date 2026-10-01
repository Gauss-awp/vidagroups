import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { traducirError } from '@/lib/utils';
import { Boton, Campo, Pantalla } from '@/components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState(false);

  const ingresar = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Faltan datos', 'Escribí tu correo y tu contraseña.');
      return;
    }
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setCargando(false);
    if (error) Alert.alert('No pudiste ingresar', traducirError(error.message));
  };

  return (
    <Pantalla>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 24,
                backgroundColor: colors.success,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Ionicons name="leaf" size={44} color="#FFFFFF" />
            </View>
            <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>VidaGroups</Text>
            <Text style={{ color: colors.textSec, fontSize: 16, marginTop: 6 }}>Grupos de vida de tu iglesia</Text>
          </View>

          <Campo
            etiqueta="Correo"
            placeholder="tu@correo.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <View>
            <Campo
              etiqueta="Contraseña"
              placeholder="Tu contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!verClave}
              textContentType="password"
              onSubmitEditing={ingresar}
              style={{ paddingRight: 48 }}
            />
            <Pressable onPress={() => setVerClave(!verClave)} hitSlop={10} style={{ position: 'absolute', right: 14, top: 36 }}>
              <Ionicons name={verClave ? 'eye-off' : 'eye'} size={22} color={colors.textSec} />
            </Pressable>
          </View>

          <Link href="/recuperar" asChild>
            <Pressable style={{ alignSelf: 'flex-end', marginTop: -4, marginBottom: 12 }} hitSlop={8}>
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          </Link>

          <Boton titulo="Ingresar" onPress={ingresar} cargando={cargando} style={{ marginTop: 8 }} />

          <Link href="/registro" asChild>
            <Pressable style={{ marginTop: 24, alignItems: 'center' }} hitSlop={10}>
              <Text style={{ color: colors.textSec, fontSize: 15 }}>
                ¿No tenés cuenta? <Text style={{ color: colors.primary, fontWeight: '600' }}>Registrate</Text>
              </Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}
