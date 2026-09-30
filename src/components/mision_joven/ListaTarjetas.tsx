import { useEffect, useState } from 'react';
import { Text, View, Pressable, Modal, TextInput, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';

export function ListaTarjetas({ refreshKey }: { refreshKey?: number }) {
  const [tarjetas, setTarjetas] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [modal, setModal] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from('tarjetas_consolidacion').select('*').order('creado_en', { ascending: false });
    setTarjetas(data || []);
  };

  useEffect(() => { cargar(); }, [refreshKey]);

  useEffect(() => {
    const channel = supabase.channel('tarjetas-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarjetas_consolidacion' }, () => cargar())
    .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const abrirEdicion = (t: any) => { setSeleccionada(t); setModal(true); };

  const guardarEdicion = async () => {
    const { error } = await supabase.from('tarjetas_consolidacion').update({
      nombre: seleccionada.nombre,
      telefono: seleccionada.telefono,
      zona: seleccionada.zona,
      gv_asignado: seleccionada.gv_asignado,
    }).eq('id', seleccionada.id);
    if(error) Alert.alert("Error", error.message);
    else { setModal(false); cargar(); }
  };

  const borrar = () => {
    Alert.alert("¿Borrar?", `¿Borrar a ${seleccionada.nombre}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        await supabase.from('tarjetas_consolidacion').delete().eq('id', seleccionada.id);
        setModal(false); cargar();
      }}
    ]);
  };

  const Badge = ({ activo, texto }: { activo: boolean, texto: string }) => (
    <View style={{ backgroundColor: activo? '#DCFCE7' : '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 11, color: activo? '#16A34A' : '#9CA3AF', fontWeight: '700' }}>{activo? '✅' : '⏳'} {texto}</Text>
    </View>
  );

  return (
    <View style={{ gap: 12, marginBottom: 20 }}>
      {tarjetas.map(t => (
        <Pressable key={t.id} onPress={() => abrirEdicion(t)}>
          <Card style={{ borderLeftWidth: 4, borderLeftColor: t.encuentro? '#22c55e' : t.visita? '#f59e0b' : '#e5e7eb' }}>
            <Text style={{ fontSize: 16, fontWeight: '800' }}>{t.nombre} {t.edad? `- ${t.edad} años` : ''}</Text>
            <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }}>{t.zona} | {t.telefono} | GV: {t.gv_asignado}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
              <Badge activo={!!t.fonovisita} texto="Fonovisita" />
              <Badge activo={!!t.visita} texto="Visita" />
              <Badge activo={!!t.pilares} texto="Pilares" />
              <Badge activo={!!t.comenzo_gv} texto="Comenzó GV" />
              <Badge activo={!!t.encuentro} texto="Encuentro" />
            </View>
            {t.observacion? <Text style={{ marginTop: 8, fontSize: 12, color: '#92400E' }}>📝 {t.observacion}</Text> : null}
            <Text style={{ fontSize: 11, color: '#999', marginTop: 8 }}>Tocar para editar ✏️</Text>
          </Card>
        </Pressable>
      ))}

      <Modal visible={modal} animationType="slide" transparent>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:20}}>
          <View style={{backgroundColor:'white', borderRadius:16, padding:20}}>
            <Text style={{fontWeight:'800', fontSize:18, marginBottom:12}}>Editar tarjeta</Text>
            <TextInput value={seleccionada?.nombre} onChangeText={v=>setSeleccionada({...seleccionada, nombre:v})} placeholder="Nombre" style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}} />
            <TextInput value={seleccionada?.telefono} onChangeText={v=>setSeleccionada({...seleccionada, telefono:v})} placeholder="Tel" style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:10}} />
            <TextInput value={seleccionada?.gv_asignado} onChangeText={v=>setSeleccionada({...seleccionada, gv_asignado:v})} placeholder="GV" style={{borderWidth:1, borderColor:'#ddd', borderRadius:8, padding:10, marginBottom:15}} />

            <Pressable onPress={guardarEdicion} style={{backgroundColor: '#111', padding: 14, borderRadius: 10, alignItems: 'center'}}>
              <Text style={{color: 'white', fontWeight: '700'}}>Guardar Cambios</Text>
            </Pressable>
            <Pressable onPress={()=>setModal(false)} style={{marginTop:10, alignItems:'center'}}><Text style={{color:'gray'}}>Cancelar</Text></Pressable>
            <Pressable onPress={borrar} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'red'}}>Borrar tarjeta</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}