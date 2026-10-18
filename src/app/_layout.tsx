import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { TemaProvider, useTema } from '@/context/TemaContext';
import { colors } from '@/lib/theme';
import { Actualizaciones } from '@/components/Actualizaciones';
import { Sincronizador } from '@/components/Sincronizador';
import { WebHead } from '@/components/WebHead';
import { enviarErroresPendientes, fijarPantalla, instalarCapturaErrores, reportarError } from '@/lib/reporteErrores';
import { usePathname, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

instalarCapturaErrores();

/** Pantalla amable si algo se rompe al dibujar, y el error queda registrado */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportarError(error, { fatal: true, contexto: 'pantalla' });
  }, [error]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg }}>
      <Ionicons name="alert-circle-outline" size={56} color={colors.warning} />
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>Algo salió mal</Text>
      <Text style={{ color: colors.textSec, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>
        Ya quedó registrado para revisarlo. Probá de nuevo; si sigue pasando, avisá en el grupo de soporte.
      </Text>
      <Pressable onPress={retry} style={{ marginTop: 20, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}>
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

/** Lleva la cuenta de en qué pantalla está la persona, para el registro de errores */
function RutaActual() {
  const ruta = usePathname();
  useEffect(() => {
    fijarPantalla(ruta);
  }, [ruta]);
  useEffect(() => {
    enviarErroresPendientes();
  }, []);
  return null;
}

function Navegacion() {
  const { oscuro } = useTema();
  const base = oscuro ? DarkTheme : DefaultTheme;
  const tema = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
    },
  };
  return (
    <ThemeProvider value={tema}>
      <StatusBar style={oscuro ? 'light' : 'dark'} />
      <Actualizaciones />
      <Sincronizador />
      <WebHead />
      <RutaActual />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <TemaProvider>
      <AuthProvider>
        <Navegacion />
      </AuthProvider>
    </TemaProvider>
  );
}
