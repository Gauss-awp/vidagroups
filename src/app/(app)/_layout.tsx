import { Redirect, Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/lib/theme';
import { Boton, Cargando, Pantalla, Vacio } from '@/components/ui';
import { EsperandoAprobacion } from '@/components/red/EsperandoAprobacion';
import { Recordatorios } from '@/components/Recordatorios';
import { RegistroAcceso } from '@/components/RegistroAcceso';

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

  // Cuenta nueva o dada de baja: no ve nada hasta que la aprueben
  if (perfil.estado !== 'activo') return <EsperandoAprobacion perfil={perfil} />;

  return (
    <>
    <Recordatorios perfilId={perfil.id} rol={perfil.rol} />
    <RegistroAcceso perfilId={perfil.id} />
    <Stack
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerBackTitle: 'Atrás',
        contentStyle: { backgroundColor: colors.bg },
        // Si se abrió una pantalla directo (por ejemplo, al recargar la web o desde una notificación)
        // no hay "atrás": se muestra un botón para volver al inicio, donde están las pestañas
        headerLeft: navigation.canGoBack()
          ? undefined
          : () => (
              <Pressable onPress={() => router.replace('/')} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 12 }} accessibilityLabel="Ir al inicio">
                <Ionicons name="home-outline" size={22} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 16, marginLeft: 6 }}>Inicio</Text>
              </Pressable>
            ),
      })}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="grupo/[id]" options={{ title: 'Grupo' }} />
      <Stack.Screen name="equipo/[id]" options={{ title: 'Equipo' }} />
      <Stack.Screen name="evento/[id]" options={{ title: 'Evento' }} />
      <Stack.Screen name="eventos/index" options={{ title: 'Centro de Eventos' }} />
      <Stack.Screen name="reporte" options={{ title: 'Reporte mensual' }} />
      <Stack.Screen name="miembro/[id]" options={{ title: 'Hermano' }} />
      <Stack.Screen name="reunion/[id]" options={{ title: 'Cargar reunión' }} />
      <Stack.Screen name="resumen/[id]" options={{ title: 'Resumen del año' }} />
      <Stack.Screen name="ayuda" options={{ title: 'Ayuda' }} />
    </Stack>
    </>
  );
}
