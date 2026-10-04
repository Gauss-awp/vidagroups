import { View, Text, Pressable, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AMBIENTE, supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CORREO_DEV = 'benjamin_trece@hotmail.com'

// El modo dev existe solo en el ambiente de pruebas
export const esCuentaDev = (email?: string | null) =>
  AMBIENTE === 'pruebas' && email?.toLowerCase() === CORREO_DEV.toLowerCase()

const ROLES_DEV = [
  { rol: 'guia', texto: 'Guía', color: '#555' },
  { rol: 'guia_supervisor', texto: 'Guía Sup', color: '#555' },
  { rol: 'consolidacion', texto: 'Consolidador', color: '#777777' },
  { rol: 'pastor', texto: 'Pastor', color: '#555' },
  { rol: 'apostol', texto: 'Apóstol', color: 'black' },
]

export function DevRoleSwitcher({ perfil }: any) {
  const { refrescarPerfil } = useAuth()
  const insets = useSafeAreaInsets()

  // Solo se muestra en tu cuenta
  if (!esCuentaDev(perfil?.email)) return null

  const cambiarRol = async (nuevoRol: string) => {
    const { error } = await supabase.rpc('dev_cambiar_mi_rol', { nuevo_rol: nuevoRol })
    if (error) {
      alert('Error RPC: ' + error.message)
    } else {
      await refrescarPerfil()
    }
  }

  return (
    <View style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#ffdbdb', borderRadius: 10, marginHorizontal: 10, marginBottom: 4, marginTop: insets.top + 2 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 5 }}>
        <Text style={{ fontWeight: 'bold', fontSize: 11, marginRight: 4 }}>DEV · {perfil?.rol}</Text>
        {ROLES_DEV.map((r) => (
          <Pressable key={r.rol} onPress={() => cambiarRol(r.rol)} style={{ backgroundColor: perfil?.rol === r.rol ? '#4F46E5' : r.color, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 }}>
            <Text style={{ color: 'white', fontSize: 12 }}>{r.texto}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}
