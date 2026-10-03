import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, TouchableOpacity, KeyboardAvoidingView, Platform, Pressable, Modal, TextInput, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Grupo, Perfil } from '@/lib/types';
import { Card, Pantalla, SeccionTitulo, TituloGrande, PasosConsolidacion, SelectorPilares } from '@/components/ui';
import { EquipoLista } from '@/components/EquipoLista';
import { FormTarjeta } from '@/components/mision_joven/FormTarjeta';
import { useAuth } from '@/context/AuthContext';
import { Exportador } from '@/components/red/Exportador';

export function InicioSupervisor({ perfil }: { perfil: Perfil }) {
  const { redesConsolida } = useAuth();
  // Red de la que se exportan las tarjetas: la que consolida (o la suya)
  const redExport = redesConsolida[0] ?? (perfil.red_id ? { id: perfil.red_id, nombre: 'mi red' } : null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const [misGrupos, setMisGrupos] = useState<Grupo[]>([]);
  const [todosLosGrupos, setTodosLosGrupos] = useState<Grupo[]>([]);
  const [tarjetas, setTarjetas] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<'sin_asignar' | 'asignadas' | 'en_gv' | 'completadas' | 'todas'>('todas');
  const [showForm, setShowForm] = useState(false);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [modal, setModal] = useState(false);

   const cargarTodo = useCallback(async () => {
    const { data: tarjetasData, error: errT } = await supabase.from('tarjetas_consolidacion').select('*').order('creado_en', { ascending: false });
    
    // FIX: Pedimos 1000 grupos sin filtrar por guia_id
    const { data: todosData, error: errG } = await supabase.from('groups').select('*').limit(1000).order('nombre');
    
    console.log('DEBUG GROUPS:', todosData?.length, 'error:', errG);
    console.log('DEBUG TARJETAS:', tarjetasData?.length);

    setTarjetas(tarjetasData || []);
    setMisGrupos((todosData ?? []) as Grupo[]); // para consolidación misGrupos = todos
    setTodosLosGrupos((todosData ?? []) as Grupo[]);
  }, [perfil.id]);
  useEffect(() => { cargarTodo(); }, [cargarTodo, refreshKey]);

  useEffect(() => {
    const channel = supabase.channel('tarjetas-panel-consolidacion')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tarjetas_consolidacion' }, () => cargarTodo())
  .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cargarTodo]);

  const asignarGV = async (tarjetaId: string, grupoId: string) => {
    const { error } = await supabase.from('tarjetas_consolidacion').update({ grupo_id: grupoId }).eq('id', tarjetaId);
    if (error) Alert.alert('Error', error.message);
    else cargarTodo();
  };

  const cambiarEstado = async (completada: boolean) => {
    const { error } = await supabase.from('tarjetas_consolidacion')
      .update({ estado: completada ? 'completada' : 'nueva' }).eq('id', seleccionada.id);
    if (error) Alert.alert('Error', error.message);
    else { setModal(false); cargarTodo(); }
  };

  const abrirEdicion = (t: any) => { setSeleccionada(t); setModal(true); };

  const guardarEdicion = async () => {
    const { error } = await supabase.from('tarjetas_consolidacion').update({
      nombre: seleccionada.nombre,
      telefono: seleccionada.telefono,
      zona: seleccionada.zona,
      edad: seleccionada.edad? Number(seleccionada.edad) : null,
      gv_asignado: seleccionada.gv_asignado,
      linea_lider: seleccionada.linea_lider || null,
      fonovisita: seleccionada.fonovisita,
      visita: seleccionada.visita,
      pilares: seleccionada.pilares,
      pilar_1: !!seleccionada.pilar_1,
      pilar_2: !!seleccionada.pilar_2,
      pilar_3: !!seleccionada.pilar_3,
      pilar_4: !!seleccionada.pilar_4,
      pilar_5: !!seleccionada.pilar_5,
      comenzo_gv: seleccionada.comenzo_gv,
      encuentro: seleccionada.encuentro,
      observacion: seleccionada.observacion,
    }).eq('id', seleccionada.id);
    if(error) Alert.alert("Error", error.message);
    else { setModal(false); cargarTodo(); }
  };

  const borrar = () => {
    Alert.alert("¿Borrar?", `¿Borrar a ${seleccionada.nombre}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        await supabase.from('tarjetas_consolidacion').delete().eq('id', seleccionada.id);
        setModal(false); cargarTodo();
      }}
    ]);
  };

  const filtradas = tarjetas.filter(t => {
    if (filtro === 'sin_asignar') return!t.gv_asignado;
    if (filtro === 'asignadas') return t.gv_asignado &&!t.comenzo_gv;
    if (filtro === 'en_gv') return!!t.comenzo_gv && t.estado !== 'completada';
    if (filtro === 'completadas') return t.estado === 'completada';
    return true;
  });

  const counts = {
    sin: tarjetas.filter(t =>!t.gv_asignado).length,
    asig: tarjetas.filter(t => t.gv_asignado &&!t.comenzo_gv).length,
    en_gv: tarjetas.filter(t =>!!t.comenzo_gv && t.estado !== 'completada').length,
    completadas: tarjetas.filter(t => t.estado === 'completada').length,
  };

  const Badge = ({ activo, texto }: { activo: boolean, texto: string }) => (
    <View style={{ backgroundColor: activo? colors.successBg : colors.cardAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6, marginTop: 4 }}>
      <Text style={{ fontSize: 11, color: activo? colors.success : colors.textTer, fontWeight: '700' }}>{activo? '✅' : '⏳'} {texto}</Text>
    </View>
  );

  return (
    <Pantalla>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios'? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 400 }}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefreshKey(k=>k+1); }} tintColor={colors.textSec} />}>

          <TituloGrande titulo="Panel de Consolidación" subtitulo={`Admin: ${perfil.nombre || perfil.email}`} />

          <TouchableOpacity onPress={() => setShowForm(!showForm)}
            style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 12, marginVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Ionicons name={showForm? "close" : "add"} size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>{showForm? 'Cerrar' : 'Registrar persona nueva'}</Text>
          </TouchableOpacity>

          {redExport ? <Exportador redId={redExport.id} redNombre={redExport.nombre} soloTarjetas /> : null}

          {showForm && (
            <View style={{ marginBottom: 16 }}>
              {/* FIX: Ahora le pasamos TODOS los grupos para que aparezca el 04.1 */}
              <FormTarjeta grupos={todosLosGrupos} onCreada={() => { setShowForm(false); cargarTodo(); }} onClose={() => setShowForm(false)} />
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                { k: 'sin_asignar', label: `Sin Asignar (${counts.sin})` },
                { k: 'asignadas', label: `Asignadas (${counts.asig})` },
                { k: 'en_gv', label: `En GV (${counts.en_gv})` },
                { k: 'completadas', label: `Completadas (${counts.completadas})` },
                { k: 'todas', label: `Todas (${tarjetas.length})` },
              ].map(f => (
                <TouchableOpacity key={f.k} onPress={() => setFiltro(f.k as any)}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: filtro === f.k? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: filtro === f.k? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <SeccionTitulo titulo={`Tarjetas - ${filtro}`} />
          {filtradas.map(t => (
            <Pressable key={t.id} onPress={() => abrirEdicion(t)}>
              <Card style={{ borderLeftWidth: 4, borderLeftColor: t.encuentro? colors.success : t.visita? colors.warning : colors.border }}>
                <Text style={{ color: colors.text,  fontSize: 16, fontWeight: '800' }}>{t.nombre} {t.edad? `- ${t.edad} años` : ''}</Text>
                {t.estado === 'completada' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={{ color: colors.success, fontWeight: '800', fontSize: 12 }}>Consolidación completada</Text></View> : null}
                <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 2 }}>{[t.linea_lider ? `Línea: ${t.linea_lider}` : null, t.zona, t.telefono, `GV: ${t.gv_asignado || 'Sin asignar'}`].filter(Boolean).join(' · ')}</Text>
                <PasosConsolidacion tarjeta={t} />
                {t.observacion? <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, backgroundColor: colors.warningBg, padding: 8, borderRadius: 8 }}><Ionicons name="document-text-outline" size={14} color={colors.warning} /><Text style={{ fontSize: 12, color: colors.warning, flex: 1 }}>{t.observacion}</Text></View> : null}
                <Text style={{ fontSize: 11, color: colors.textTer, marginTop: 8 }}>Tocá para editar</Text>
                {!t.gv_asignado && todosLosGrupos.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {todosLosGrupos.slice(0,4).map(g => (
                      <TouchableOpacity key={g.id} onPress={() => asignarGV(t.id, g.id)} style={{ backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>→ {g.nombre}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </Card>
            </Pressable>
          ))}
          <View style={{ height: 24 }} />
          <EquipoLista liderId={perfil.id} refreshKey={refreshKey} textoVacio="Todavía no tenés guías a cargo" />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={modal} animationType="slide" transparent>
        <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end'}}>
          <View style={{backgroundColor:colors.card, borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, maxHeight: '90%'}}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={{ color: colors.text, fontWeight:'800', fontSize:18, marginBottom:12}}>Editar tarjeta</Text>
              <TextInput value={seleccionada?.nombre} onChangeText={v=>setSeleccionada({...seleccionada, nombre:v})} placeholder="Nombre" style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10}} />
              <TextInput value={seleccionada?.telefono} onChangeText={v=>setSeleccionada({...seleccionada, telefono:v})} placeholder="Tel" style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10}} />
              <TextInput value={seleccionada?.zona} onChangeText={v=>setSeleccionada({...seleccionada, zona:v})} placeholder="Zona" style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10}} />
              <TextInput value={seleccionada?.linea_lider ?? ''} onChangeText={v=>setSeleccionada({...seleccionada, linea_lider:v})} placeholder="Línea - Líder (ej: MICA Y SANTI)" placeholderTextColor={colors.textTer} style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:10, color: colors.text}} />
              <TextInput value={seleccionada?.gv_asignado} onChangeText={v=>setSeleccionada({...seleccionada, gv_asignado:v})} placeholder="GV asignado" style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:15}} />
              <TextInput value={seleccionada?.observacion} onChangeText={v=>setSeleccionada({...seleccionada, observacion:v})} placeholder="Observación" style={{borderWidth:1, borderColor:colors.border, borderRadius:10, padding:12, marginBottom:15}} />

              {[
                {k:'fonovisita', l:'Fonovisita'},
                {k:'visita', l:'Visita'},
                {k:'pilares', l:'Pilares'},
                {k:'comenzo_gv', l:'Comenzó GV'},
                {k:'encuentro', l:'Encuentro'},
              ].map(item => item.k === 'pilares' ? (
                <View key="pilares" style={{ borderBottomWidth:1, borderBottomColor:colors.cardAlt }}>
                  <SelectorPilares tarjeta={seleccionada ?? {}} onCambio={(c) => setSeleccionada({ ...seleccionada, ...c })} />
                </View>
              ) : (
                <View key={item.k} style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:colors.cardAlt}}>
                  <Text style={{ color: colors.text, fontWeight:'600'}}>{item.l}</Text>
                  <Switch value={!!seleccionada?.[item.k]} onValueChange={v=>setSeleccionada({...seleccionada, [item.k]:v})} />
                </View>
              ))}

              {seleccionada?.estado === 'completada' ? (
                <Pressable onPress={() => cambiarEstado(false)} style={{backgroundColor: colors.warningBg, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 20}}>
                  <Text style={{color: colors.warning, fontWeight: '800'}}>Reabrir seguimiento</Text>
                </Pressable>
              ) : seleccionada?.encuentro && seleccionada?.comenzo_gv ? (
                <Pressable onPress={() => cambiarEstado(true)} style={{backgroundColor: colors.success, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 20}}>
                  <Text style={{color: 'white', fontWeight: '800'}}>Marcar como completada</Text>
                </Pressable>
              ) : (
                <Text style={{marginTop: 16, color: colors.textSec, fontSize: 12, textAlign: 'center'}}>Para completar la consolidación tiene que haber hecho el Encuentro y estar yendo al GV.</Text>
              )}

              <Pressable onPress={guardarEdicion} style={{backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12}}>
                <Text style={{color: 'white', fontWeight: '800'}}>Guardar Cambios</Text>
              </Pressable>
              <Pressable onPress={()=>setModal(false)} style={{marginTop:12, alignItems:'center', padding:10}}><Text style={{color:'gray', fontWeight:'600'}}>Cancelar</Text></Pressable>
              <Pressable onPress={borrar} style={{marginTop:10, alignItems:'center', padding:10}}><Text style={{color: colors.danger, fontWeight:'700'}}>Borrar tarjeta</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Pantalla>
  );
}