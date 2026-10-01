import { useRouter } from 'expo-router';
import { Boton } from '@/components/ui';

/** Acceso al reporte mensual desde cualquier panel. */
export function BotonReporte() {
  const router = useRouter();
  return (
    <Boton
      titulo="Reporte mensual"
      icono="document-text-outline"
      variante="secundario"
      onPress={() => router.push('/reporte')}
      style={{ marginBottom: 12 }}
    />
  );
}
