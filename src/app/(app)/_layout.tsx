import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/lib/theme';
import { Boton, Cargando, Pantalla, Vacio } from '@/components/ui';

export default function AppLayout() {
  const { session, perfil, cargando, errorPerfil, refrescarPerfil, cerrarSesion } = useAuth();

  if (cargando) return <Cargando />;
  if (!session) return <Redirect href="/login" />;

  if (errorPerfil) {
    return (
      <Pantalla>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Vacio icono="alert-circle-outline" titulo="No pudimos cargar tu perfil" texto={errorPerfil}>
            <Boton titulo="Reintentar" onPress={refrescarPerfil} />
            <Boton titulo="Cerrar sesión" variante="peligro" onPress={cerrarSesion} style={{ marginTop: 10 }} />
          </Vacio>
        </View>
      </Pantalla>
    );
  }

  if (!perfil) return <Cargando texto="Cargando tu perfil..." />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerBackTitle: 'Atrás',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="grupo/[id]" options={{ title: 'Grupo' }} />
      <Stack.Screen name="equipo/[id]" options={{ title: 'Equipo' }} />
      <Stack.Screen name="evento/[id]" options={{ title: 'Evento' }} />
    </Stack>
  );
}
