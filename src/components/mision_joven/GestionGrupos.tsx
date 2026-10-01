import React, { useEffect, useState } from 'react';
import { Alert, Text, View, ScrollView, Modal, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Card, Boton, s } from '@/components/ui';

export function GestionGrupos({ redId, redNombre }: { redId: string; redNombre: string }) {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [miembros, setMiembros] = useState<any[]>([]);
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [guias, setGuias] = useState<any[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [grupoSel, setGrupoSel] = useState<any>(null);
  const [modalGuia, setModalGuia] = useState(false);
  const [modalMover, setModalMover] = useState<any>(null);

  const cargar = async () => {
    const { data: g } = await supabase.from('groups').select('*').eq('red_id', redId).order('nombre');
    const idsGrupos = (g ?? []).map((x: any) => x.id);
    const { data: m } = idsGrupos.length
      ? await supabase.from('miembros_grupo').select('*').eq('activo', true).in('grupo_id', idsGrupos)
      : { data: [] };
    const { data: p } = await supabase.from('profiles').select('id, nombre, apellido');

    // Guías posibles: personas activas de la red
    const { data: gui } = await supabase.from('profiles').select('id, nombre, apellido').eq('red_id', redId).eq('estado', 'activo').order('nombre');

    setGrupos(g || []); 
    setMiembros(m || []); 
    setPerfiles(p || []); 
    setGuias(gui || []);
};
  useEffect(()=>{cargar()},[redId]);

  const getNombre = (m:any) => `${m.nombre || ''} ${m.apellido || ''}`.trim() || 'Sin nombre';

  const cambiarGuia = async (grupoId:string, nuevoGuiaId:string|null) => {
    const { error } = await supabase.from('groups').update({ guia_id: nuevoGuiaId }).eq('id', grupoId);
    if(error) return Alert.alert('Error', error.message);
    setModalGuia(false); cargar();
  };

  const eliminarMiembro = (m:any) => {
    Alert.alert('¿Sacar?', `¿Sacar a ${getNombre(m)} del GV?`,[
      {text:'Cancelar', style:'cancel'},
      {text:'Sacar', style:'destructive', onPress: async ()=>{
        const {error} = await supabase.from('miembros_grupo').update({activo:false}).eq('id', m.id);
        if(error) return Alert.alert('Error', error.message);
        cargar();
      }}
    ]);
  };

  const moverMiembro = async (m:any, nuevoGrupoId:string) => {
    const {error} = await supabase.from('miembros_grupo').update({grupo_id: nuevoGrupoId}).eq('id', m.id);
    if(error) return Alert.alert('Error', error.message);
    setModalMover(null); cargar();
  };

  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <Text style={{ color: colors.text,  fontSize: 16, fontWeight: '800' }}>Gestionar GVs - {redNombre}</Text>
      {grupos.map(g=>{
        const miembrosDelGrupo = miembros.filter(x=>x.grupo_id===g.id);
        const isOpen = abierto===g.id;
        const guiaActual = perfiles.find((p:any)=>p.id===g.guia_id);
        return (
          <Card key={g.id} style={{ padding:0, overflow:'hidden' }}>
            <Pressable onPress={()=>setAbierto(isOpen? null : g.id)} style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, backgroundColor: isOpen? colors.primaryBg:colors.card }}>
              <View style={{flex:1}}>
                <Text style={{ color: colors.text, fontWeight:'700', fontSize:14}}>{g.nombre}</Text>
                <Text style={{fontSize:11, color:colors.textSec, marginTop:2}} numberOfLines={1}>
                  {guiaActual? `Guía: ${guiaActual.nombre}` : 'Sin guía'} • {miembrosDelGrupo.length} miembros
                </Text>
              </View>
              <Text style={{fontSize:14, color: colors.primary}}>{isOpen?'▲':'▼'}</Text>
            </Pressable>
            {isOpen && (
              <View style={{ padding:12, gap:8 }}>
                <Boton titulo="Cambiar Guía" variante="secundario" onPress={()=>{setGrupoSel(g); setModalGuia(true)}} />
                <View style={{ maxHeight: 320 }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {miembrosDelGrupo.map((m:any)=>(
                      <View key={m.id} style={[s.fila, { justifyContent:'space-between', paddingVertical:10, borderTopWidth:1, borderTopColor:colors.cardAlt }]}>
                        <View style={{flex:1}}>
                          <Text style={{ color: colors.text, fontSize:13, fontWeight:'500'}}>{getNombre(m)}</Text>
                          {m.telefono? <Text style={{fontSize:11, color:colors.textSec}}>{m.telefono}</Text> : null}
                        </View>
                        <Pressable onPress={()=>setModalMover(m)} style={{paddingHorizontal:8}}><Text style={{color: colors.primary, fontSize:12, fontWeight:'700'}}>Mover</Text></Pressable>
                        <Pressable onPress={()=>eliminarMiembro(m)} style={{paddingHorizontal:4}}><Text style={{color:colors.danger, fontSize:12}}>Sacar</Text></Pressable>
                      </View>
                    ))}
                    {miembrosDelGrupo.length===0 && <Text style={{fontSize:12, color:colors.textTer, textAlign:'center', padding:10}}>Este GV está vacío</Text>}
                  </ScrollView>
                </View>
              </View>
            )}
          </Card>
        )
      })}
      <Modal visible={modalGuia} transparent animationType="slide">
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor:colors.card, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16, maxHeight:'70%' }}>
            <Text style={{ color: colors.text, fontWeight:'800', fontSize:16, marginBottom:12}}>Guía para {grupoSel?.nombre}</Text>
            <ScrollView>
              <Pressable onPress={()=>cambiarGuia(grupoSel?.id, null)} style={{padding:14, borderBottomWidth:1, borderColor:colors.cardAlt}}><Text style={{color:colors.danger}}>Sin guía</Text></Pressable>
              {guias.map((gu:any)=>(
                <Pressable key={gu.id} onPress={()=>cambiarGuia(grupoSel?.id, gu.id)} style={{padding:14, borderBottomWidth:1, borderColor:colors.cardAlt}}>
                  <Text style={{ color: colors.text }}>{gu.nombre} {gu.apellido}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{marginTop:12}}><Boton titulo="Cerrar" onPress={()=>setModalGuia(false)} variante="secundario"/></View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!modalMover} transparent animationType="slide">
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor:colors.card, padding:16, borderTopLeftRadius:16, borderTopRightRadius:16 }}>
            <Text style={{ color: colors.text, fontWeight:'800', marginBottom:12}}>Mover a:</Text>
            {grupos.map((gr:any)=>(
              <Pressable key={gr.id} onPress={()=>moverMiembro(modalMover, gr.id)} style={{padding:14, borderBottomWidth:1, borderColor:colors.cardAlt}}>
                <Text style={{ color: colors.text }}>{gr.nombre}</Text>
              </Pressable>
            ))}
            <View style={{marginTop:12}}><Boton titulo="Cancelar" onPress={()=>setModalMover(null)}/></View>
          </View>
        </View>
      </Modal>
    </View>
  )
}