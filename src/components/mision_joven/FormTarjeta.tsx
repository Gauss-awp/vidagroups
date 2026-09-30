import React, { useState, useMemo } from 'react';
import { Alert, Text, TextInput, View, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Boton, Card } from '@/components/ui';

const inputStyle = {
  borderWidth: 1,
  borderColor: '#D1D5DB',
  borderRadius: 10,
  padding: 12,
  marginTop: 12,
  backgroundColor: 'white',
  color: 'black',
  fontSize: 16
};

export function FormTarjeta({ grupos = [], onCreada, onClose }: any) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [edad, setEdad] = useState('');
  const [zona, setZona] = useState('');
  const [gv, setGv] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);

  const listaGVs = useMemo(() => {
    if (!grupos || grupos.length === 0) return [];
    // La base ya devuelve solo los grupos de la red de quien carga la tarjeta
    const lista = grupos.map((g: any) => typeof g === 'string'? g : g.nombre || '').filter(Boolean);
    return [...new Set(lista)].sort() as string[];
  }, [grupos]);

  const filtrados = useMemo(() => {
    if (!gv) return listaGVs;
    return listaGVs.filter((g: string) => g.toLowerCase().includes(gv.toLowerCase()));
  }, [gv, listaGVs]);

  const guardar = async () => {
    if (!nombre) return Alert.alert('Falta nombre');
    setCargando(true);
    const { error } = await supabase.from('tarjetas_consolidacion').insert({
      nombre, telefono, edad: edad? Number(edad) : null, zona,
      gv_asignado: gv || null,
      estado: 'nueva',
    });
    setCargando(false);
    if (error) Alert.alert('Error', error.message);
    else { onCreada?.(); onClose?.(); setNombre(''); setTelefono(''); setEdad(''); setZona(''); setGv(''); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios'? 'padding' : 'height'} keyboardVerticalOffset={100} style={{ flex: 1 }}>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 6 }}>Nueva Tarjeta</Text>
        <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{listaGVs.length} GVs de tu red</Text>

        <TextInput placeholder="1. Nombre y Apellido" placeholderTextColor="#9CA3AF" value={nombre} onChangeText={setNombre} style={inputStyle} />
        <TextInput placeholder="2. Tel / Whatsapp" placeholderTextColor="#9CA3AF" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" style={inputStyle} />
        <TextInput placeholder="3. Edad" placeholderTextColor="#9CA3AF" value={edad} onChangeText={setEdad} keyboardType="numeric" style={inputStyle} />
        <TextInput placeholder="4. Zona / Barrio" placeholderTextColor="#9CA3AF" value={zona} onChangeText={setZona} style={inputStyle} />

        <View style={{ zIndex: 20 }}>
          <TextInput
            placeholder="5. GV asignado (tocá para ver lista)"
            placeholderTextColor="#9CA3AF"
            value={gv}
            onChangeText={(t) => { setGv(t); setMostrarLista(true); }}
            onFocus={() => setMostrarLista(true)}
            style={[inputStyle, { borderColor: mostrarLista? '#6366F1' : '#D1D5DB', borderWidth: mostrarLista? 2 : 1 }]}
          />
          {mostrarLista && (
            <View style={{ maxHeight: 180, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, marginTop: 6, backgroundColor: 'white' }}>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 180 }}>
                {filtrados.length === 0 && (
                  <View style={{ padding: 14 }}>
                    <Text style={{ color: '#9CA3AF' }}>No hay resultados para "{gv}"</Text>
                  </View>
                )}
                {filtrados.map((g) => (
                  <Pressable key={g} onPress={() => { setGv(g); setMostrarLista(false); }} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <Text style={{ fontWeight: '700' }}>{g}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={{ marginTop: 24, gap: 10, paddingBottom: 20 }}>
          <Boton titulo={cargando? 'Guardando...' : 'Guardar Tarjeta'} onPress={guardar} />
          <Boton titulo="Cancelar" variante="secundario" onPress={() => { setMostrarLista(false); onClose?.(); }} />
        </View>
      </Card>
    </KeyboardAvoidingView>
  );
}