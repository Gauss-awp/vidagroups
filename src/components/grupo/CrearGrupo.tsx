import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Boton, Campo, Card } from '@/components/ui';

export function CrearGrupo({ guiaId, onCreado }: { guiaId: string; onCreado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
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
        El grupo queda en tu red. Después vas a poder agregar a los hermanos, sus hábitos y los pagos de encuentros y campamentos.
      </Text>
      <Campo etiqueta="Nombre del grupo" placeholder="Ej: Grupo Barrio Centro" value={nombre} onChangeText={setNombre} />
      
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