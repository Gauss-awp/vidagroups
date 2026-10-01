import { useAuth } from '@/context/AuthContext';
import { Cargando } from '@/components/ui';
import { InicioSupervisor } from '@/components/inicio/InicioSupervisor';

/** Panel de consolidación para quien es Consolidador/a además de su rol (por ejemplo, Guía Supervisor). */
export default function ConsolidacionTab() {
  const { perfil } = useAuth();
  if (!perfil) return <Cargando />;
  return <InicioSupervisor perfil={perfil} />;
}
