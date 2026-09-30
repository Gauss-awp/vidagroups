import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/lib/theme';
import { Cargando } from '@/components/ui';

export default function AuthLayout() {
  const { session, cargando } = useAuth();
  if (cargando) return <Cargando />;
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
