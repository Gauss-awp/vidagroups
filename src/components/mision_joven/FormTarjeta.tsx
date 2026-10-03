import React, { useState, useMemo } from 'react';
import { Alert, Text, TextInput, View, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Boton, Card } from '@/components/ui';
import { colors } from '@/lib/theme';

const estiloInput = () => ({
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  padding: 12,
  marginTop: 12,
  backgroundColor: colors.card,
  color: colors.text,
  fontSize: 16
});

export function FormTarjeta({ grupos = [], onCreada, onClose }: any) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [edad, setEdad] = useState('');
  const [zona, setZona] = useState('');
  const [gv, setGv] = useState('');
  const [linea, setLinea] = useState('');
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
      linea_lider: linea.trim() || null,
      estado: 'nueva',
    });
    setCargando(false);
    if (error) Alert.alert('Error', error.message);
    else { onCreada?.(); onClose?.(); setNombre(''); setTelefono(''); setEdad(''); setZona(''); setGv(''); setLinea(''); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios'? 'padding' : 'height'} keyboardVerticalOffset={100} style={{ flex: 1 }}>
      <Card>
        <Text style={{ color: colors.text,  fontSize: 18, fontWeight: '800', marginBottom: 6 }}>Nueva Tarjeta</Text>
        <Text style={{ fontSize: 11, color: colors.textSec, marginBottom: 4 }}>{listaGVs.length} GVs de tu red</Text>

        <TextInput placeholder="1. Nombre y Apellido" placeholderTextColor="#9CA3AF" value={nombre} onChangeText={setNombre} style={estiloInput()} />
        <TextInput placeholder="2. Tel / Whatsapp" placeholderTextColor="#9CA3AF" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" style={estiloInput()} />
        <TextInput placeholder="3. Edad" placeholderTextColor="#9CA3AF" value={edad} onChangeText={setEdad} keyboardType="numeric" style={estiloInput()} />
        <TextInput placeholder="4. Zona / Barrio" placeholderTextColor="#9CA3AF" value={zona} onChangeText={setZona} style={estiloInput()} />
        <TextInput placeholder="Línea - Líder (ej: MICA Y SANTI)" placeholderTextColor="#9CA3AF" value={linea} onChangeText={setLinea} autoCapitalize="characters" style={estiloInput()} />

        <View style={{ zIndex: 20 }}>
          <TextInput
            placeholder="5. GV asignado (tocá para ver lista)"
            placeholderTextColor="#9CA3AF"
            value={gv}
            onChangeText={(t) => { setGv(t); setMostrarLista(true); }}
            onFocus={() => setMostrarLista(true)}
            style={[estiloInput(), { borderColor: mostrarLista? colors.primary : colors.border, borderWidth: mostrarLista? 2 : 1 }]}
          />
          {mostrarLista && (
            <View style={{ maxHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginTop: 6, backgroundColor: colors.card }}>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 180 }}>
                {filtrados.length === 0 && (
                  <View style={{ padding: 14 }}>
                    <Text style={{ color: colors.textTer }}>No hay resultados para "{gv}"</Text>
                  </View>
                )}
                {filtrados.map((g) => (
                  <Pressable key={g} onPress={() => { setGv(g); setMostrarLista(false); }} style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.cardAlt }}>
                    <Text style={{ color: colors.text,  fontWeight: '700' }}>{g}</Text>
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