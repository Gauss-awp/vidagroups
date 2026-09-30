import { View, Text, Pressable } from 'react-native'
import { supabase } from '../lib/supabase'

export function DevRoleSwitcher({ perfil }: any) {
  
  const cambiarRol = async (nuevoRol: string) => {
    const { error } = await supabase.rpc('dev_cambiar_mi_rol', { nuevo_rol: nuevoRol })
    if (error) {
      alert('Error RPC: ' + error.message)
    } else {
      alert(`Listo! Ahora sos: ${nuevoRol}. Cerrá la app y abrila de nuevo`)
    }
  }

  return (
    <View style={{ padding: 10, backgroundColor: '#ffdbdb', borderRadius: 10, margin: 10 }}>
      <Text style={{ fontWeight: 'bold' }}>MODO DEV - Sos: {perfil?.rol}</Text>
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
        <Pressable onPress={() => cambiarRol('guia')} style={{ backgroundColor: '#555', padding: 8, borderRadius: 5 }}><Text style={{ color: 'white' }}>Guía</Text></Pressable>
        <Pressable onPress={() => cambiarRol('guia_supervisor')} style={{ backgroundColor: '#555555', padding: 8, borderRadius: 5 }}><Text style={{ color: 'white' }}>Guía Sup</Text></Pressable>
        <Pressable onPress={() => cambiarRol('consolidacion')} style={{ backgroundColor: '#2563eb', padding: 8, borderRadius: 5 }}><Text style={{ color: 'white' }}>Consolidación</Text></Pressable>
        <Pressable onPress={() => cambiarRol('mision_joven')} style={{ backgroundColor: '#1d68e1', padding: 8, borderRadius: 5 }}><Text style={{ color: 'white' }}>Misión Joven</Text></Pressable>
        <Pressable onPress={() => cambiarRol('pastor')} style={{ backgroundColor: '#555', padding: 8, borderRadius: 5 }}><Text style={{ color: 'white' }}>Pastor</Text></Pressable>
        <Pressable onPress={() => cambiarRol('apostol')} style={{ backgroundColor: 'black', padding: 8, borderRadius: 5 }}><Text style={{ color: 'white' }}>Admin</Text></Pressable>
      </View>
    </View>
  )
}