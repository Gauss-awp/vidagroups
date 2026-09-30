import React, { useState } from 'react';
import { Alert, Text, View, TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Boton, Campo, Card } from '@/components/ui';

const CATEGORIAS = [
  { id: 'mision_joven', label: 'Misión Joven' },
  { id: 'generacion_extrema', label: 'Generación Extrema' },
  { id: 'linea_hombres', label: 'Línea Hombres' },
  { id: 'linea_mujeres', label: 'Línea Mujeres' },
] as const;

export function CrearGrupo({ guiaId, onCreado }: { guiaId: string; onCreado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('mision_joven');
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (!nombre.trim()) {
      Alert.alert('Falta el nombre', 'Escribí el nombre de tu grupo de vida.');
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from('groups').insert({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      guia_id: guiaId,
      categoria: categoria,
    });
    setGuardando(false);
    if (error) {
      Alert.alert('No se pudo crear el grupo', error.message);
      return;
    }
    onCreado();
  };

  return (
    <Card>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 4 }}>Creá tu grupo de vida</Text>
      <Text style={{ color: colors.textSec, fontSize: 15, marginBottom: 16, lineHeight: 21 }}>
        Después vas a poder agregar a los hermanos, sus hábitos y los pagos de encuentros y campamentos.
      </Text>
      <Campo etiqueta="Nombre del grupo" placeholder="Ej: Grupo Barrio Centro" value={nombre} onChangeText={setNombre} />
      
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 4 }}>¿De dónde es este grupo?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {CATEGORIAS.map(c => {
          const activo = categoria === c.id;
          return (
            <TouchableOpacity 
              key={c.id} 
              onPress={() => setCategoria(c.id)}
              style={{ 
                paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20,
                backgroundColor: activo ? colors.text : colors.card,
                borderWidth: 1,
                borderColor: activo ? colors.text : colors.border
              }}
            >
              <Text style={{ color: activo ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
                {c.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <Campo
        etiqueta="Descripción (opcional)"
        placeholder="Día, horario y lugar de reunión"
        value={descripcion}
        onChangeText={setDescripcion}
        multiline
      />
      <Boton titulo="Crear mi grupo" icono="add" onPress={crear} cargando={guardando} />
    </Card>
  );
}