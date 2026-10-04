import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { TemaProvider, useTema } from '@/context/TemaContext';
import { colors } from '@/lib/theme';
import { Actualizaciones } from '@/components/Actualizaciones';

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
