import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, TextInput, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';

export function ConsolidacionGuia({ miGV }: { miGV: string }) {
  const [tarjetas, setTarjetas] = useState<any[]>([]);
  const [grupoId, setGrupoId] = useState<string | null>(null);

  const cargar = async () => {
    const { data, error } = await supabase
     .from('tarjetas_consolidacion')
     .select('*')
     .eq('gv_asignado', miGV)
     .order('creado_en', { ascending: false });
    if(error) console.log("ERROR:", error);
    setTarjetas(data || []);

    // Buscamos el ID real del grupo por su nombre (04, 04.1, etc)
    const { data: g } = await supabase.from('groups').select('id').eq('nombre', miGV).single();
    if(g) setGrupoId(g.id);
  };

  useEffect(() => { cargar(); }, [miGV]);

  const toggle = async (t: any, campo: string, valorActual: boolean) => {
    const nuevoValor =!valorActual;
    // Update visual rápido
    setTarjetas(prev => prev.map(x => x.id === t.id? {...x, [campo]: nuevoValor} : x));

    const { error } = await supabase.from('tarjetas_consolidacion').update({ [campo]: nuevoValor }).eq('id', t.id);
    if(error) return Alert.alert('Error', error.message);

    // LÓGICA NUEVA: Si es Comenzó GV
    if(campo === 'comenzo_gv' && grupoId){
      if(nuevoValor){
        // Lo agregamos a miembros_grupo
        const { error: eIns } = await supabase.from('miembros_grupo').insert({
          grupo_id: grupoId,
          nombre: t.nombre,
          apellido: t.apellido || '',
          telefono: t.telefono,
          activo: true,
          // si tenés profile_id o tarjeta_id, agregalo acá también
        });
        if(eIns) console.log('Error insertando en miembros_grupo', eIns);
      } else {
        // Si lo desmarca, lo sacamos del GV (soft delete)
        await supabase.from('miembros_grupo').update({ activo: false })
         .eq('grupo_id', grupoId)
         .eq('telefono', t.telefono); // usamos teléfono para matchear, más seguro que nombre
      }
    }
  };

  const guardarObs = async (id: string, obs: string) => {
    await supabase.from('tarjetas_consolidacion').update({ observacion: obs }).eq('id', id);
  };

  if (tarjetas.length === 0) return <Text style={{margin:20, color:'gray'}}>No tenés tarjetas para {miGV}. Pedile a Misión Joven que te asigne una con GV: {miGV}</Text>

  return (
    <ScrollView contentContainerStyle={{paddingBottom:20}}>
      {tarjetas.map(t => (
        <Card key={t.id} style={{marginBottom: 15}}>
          <Text style={{fontWeight: '700', fontSize: 16}}>{t.nombre}</Text>
          <Text style={{color: 'gray'}}>Tel: {t.telefono} - Zona: {t.zona}</Text>

          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 10}}>
            <Text>Fonovisita</Text>
            <Switch value={!!t.fonovisita} onValueChange={() => toggle(t, 'fonovisita',!!t.fonovisita)} />
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop:8}}>
            <Text>Visita</Text>
            <Switch value={!!t.visita} onValueChange={() => toggle(t, 'visita',!!t.visita)} />
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop:8}}>
            <Text>Pilares (los 5 completos)</Text>
            <Switch value={!!t.pilares} onValueChange={() => toggle(t, 'pilares',!!t.pilares)} />
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop:8}}>
            <Text>Comenzó GV</Text>
            <Switch value={!!t.comenzo_gv} onValueChange={() => toggle(t, 'comenzo_gv',!!t.comenzo_gv)} />
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop:8}}>
            <Text>Encuentro</Text>
            <Switch value={!!t.encuentro} onValueChange={() => toggle(t, 'encuentro',!!t.encuentro)} />
          </View>

          <TextInput
            placeholder="Observación..."
            defaultValue={t.observacion}
            onEndEditing={(e) => guardarObs(t.id, e.nativeEvent.text)}
            style={{borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginTop: 12, color: 'black'}}
            placeholderTextColor="#9CA3AF"
          />
        </Card>
      ))}
    </ScrollView>
  );
}