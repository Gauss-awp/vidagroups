import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/lib/theme';
import { esAdmin } from '@/lib/utils';

export default function TabsLayout() {
  const { perfil, redesAdmin } = useAuth();
  const admin = esAdmin(perfil?.rol);
  const administraRed = redesAdmin.length > 0;
  const tituloInicio =
    perfil?.rol === 'guia'
      ? 'Mi Grupo'
      : perfil?.rol === 'guia_supervisor'
        ? 'Mis Guías'
        : perfil?.rol === 'consolidacion'
          ? 'Consolidación'
          : 'Panel';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSec,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tituloInicio,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="red"
        options={{
          title: redesAdmin.length > 1 ? 'Redes' : 'Mi Red',
          href: administraRed ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="git-network" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Administrar',
          href: admin ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
