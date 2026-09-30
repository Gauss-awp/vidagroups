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
    switch (perfil.rol) {
      case 'guia':
        return <InicioGuia key={perfil.rol} perfil={perfil} />;
      case 'guia_supervisor':
        return <PanelGuiaSupervisor key={perfil.rol} perfil={perfil} />;
      case 'consolidacion':
        return <InicioSupervisor key={perfil.rol} perfil={perfil} />;
      default:
        return <PanelGeneral key={perfil.rol} perfil={perfil} />;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <DevRoleSwitcher perfil={perfil} />
      {contenido()}
    </View>
  );
}
