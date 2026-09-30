import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Cargando } from '@/components/ui';
import { InicioGuia } from '@/components/inicio/InicioGuia';
import { InicioSupervisor } from '@/components/inicio/InicioSupervisor';
import { PanelGeneral } from '@/components/inicio/PanelGeneral';
import { PanelGuiaSupervisor } from '@/components/guia_supervisor/PanelGuiaSupervisor';
import { DevRoleSwitcher } from '@/components/DevRoleSwitcher';

export default function Inicio() {
  const { perfil } = useAuth();
  if (!perfil) return <Cargando />;

  const contenido = () => {
    if (perfil.rol === 'guia') return <InicioGuia key={perfil.rol} perfil={perfil} />;
    
    // AISLADO: guia_supervisor tiene su panel propio
    if ((perfil.rol as any) === 'guia_supervisor') {
      return <PanelGuiaSupervisor key={perfil.rol} perfil={perfil} />;
    }

    if (['supervisor', 'consolidacion'].includes(perfil.rol)) {
      return <InicioSupervisor key={perfil.rol} perfil={perfil} />;
    }
    
    return <PanelGeneral key={perfil.rol} perfil={perfil} />;
  };

  return (
    <View style={{ flex: 1 }}>
      <DevRoleSwitcher perfil={perfil} />
      {contenido()}
    </View>
  );
}