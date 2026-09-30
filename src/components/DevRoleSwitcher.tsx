import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CORREO_DEV = 'benjamin_trece@hotmail.com'

const ROLES_DEV = [
  { rol: 'guia', texto: 'Guía', color: '#555' },
  { rol: 'guia_supervisor', texto: 'Guía Sup', color: '#555' },
  { rol: 'consolidacion', texto: 'Consolidador', color: '#2563eb' },
  { rol: 'pastor', texto: 'Pastor', color: '#555' },
  { rol: 'apostol', texto: 'Apóstol', color: 'black' },
]

export function DevRoleSwitcher({ perfil }: any) {
  const { refrescarPerfil } = useAuth()
  const insets = useSafeAreaInsets()

  // Solo se muestra en tu cuenta
  if (perfil?.email?.toLowerCase() !== CORREO_DEV.toLowerCase()) return null

  const cambiarRol = async (nuevoRol: string) => {
    const { error } = await supabase.rpc('dev_cambiar_mi_rol', { nuevo_rol: nuevoRol })
    if (error) {
      alert('Error RPC: ' + error.message)
    } else {
      await refrescarPerfil()
    }
  }

  return (
    <View style={{ padding: 10, backgroundColor: '#ffdbdb', borderRadius: 10, marginHorizontal: 10, marginBottom: 4, marginTop: insets.top + 4 }}>
      <Text style={{ fontWeight: 'bold' }}>MODO DEV - Sos: {perfil?.rol}</Text>
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
        {ROLES_DEV.map((r) => (
          <Pressable key={r.rol} onPress={() => cambiarRol(r.rol)} style={{ backgroundColor: r.color, padding: 8, borderRadius: 5 }}>
            <Text style={{ color: 'white' }}>{r.texto}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
