import { useEffect, useState } from 'react';
import { Text, View, Pressable, Modal, TextInput, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, PasosConsolidacion } from '@/components/ui';
import { colors } from '@/lib/theme';

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
    <View style={{ backgroundColor: activo? colors.successBg : colors.cardAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 11, color: activo? colors.success : colors.textTer, fontWeight: '700' }}>{activo? '✅' : '⏳'} {texto}</Text>
    </View>
  );

  return (
    <View style={{ gap: 12, marginBottom: 20 }}>
      {tarjetas.map(t => (
        <Pressable key={t.id} onPress={() => abrirEdicion(t)}>
          <Card style={{ borderLeftWidth: 4, borderLeftColor: t.encuentro? colors.success : t.visita? colors.warning : colors.border }}>
            <Text style={{ color: colors.text,  fontSize: 16, fontWeight: '800' }}>{t.nombre} {t.edad? `- ${t.edad} años` : ''}</Text>
            <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 2 }}>{t.zona} | {t.telefono} | GV: {t.gv_asignado}</Text>
            <PasosConsolidacion tarjeta={t} />
            {t.observacion? <Text style={{ marginTop: 8, fontSize: 12, color: colors.warning }}>Nota: {t.observacion}</Text> : null}
            <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 8 }}>Tocá para editar</Text>
          </Card>
        </Pressable>
      ))}

      <Modal visible={modal} animationType="slide" transparent>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:20}}>
          <View style={{backgroundColor:colors.card, borderRadius:16, padding:20}}>
            <Text style={{ color: colors.text, fontWeight:'800', fontSize:18, marginBottom:12}}>Editar tarjeta</Text>
            <TextInput value={seleccionada?.nombre} onChangeText={v=>setSeleccionada({...seleccionada, nombre:v})} placeholder="Nombre" style={{borderWidth:1, borderColor:colors.border, borderRadius:8, padding:10, marginBottom:10}} />
            <TextInput value={seleccionada?.telefono} onChangeText={v=>setSeleccionada({...seleccionada, telefono:v})} placeholder="Tel" style={{borderWidth:1, borderColor:colors.border, borderRadius:8, padding:10, marginBottom:10}} />
            <TextInput value={seleccionada?.gv_asignado} onChangeText={v=>setSeleccionada({...seleccionada, gv_asignado:v})} placeholder="GV" style={{borderWidth:1, borderColor:colors.border, borderRadius:8, padding:10, marginBottom:15}} />

            <Pressable onPress={guardarEdicion} style={{backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center'}}>
              <Text style={{color: 'white', fontWeight: '700'}}>Guardar Cambios</Text>
            </Pressable>
            <Pressable onPress={()=>setModal(false)} style={{marginTop:10, alignItems:'center'}}><Text style={{color:'gray'}}>Cancelar</Text></Pressable>
            <Pressable onPress={borrar} style={{marginTop:15, alignItems:'center'}}><Text style={{color: colors.danger}}>Borrar tarjeta</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}