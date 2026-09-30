import React, { useEffect, useState } from 'react';
import { Alert, Text, View, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { formatoMoneda, formatoFecha } from '@/lib/utils';
import { colors } from '@/lib/theme';
import { Card, Cargando, s } from '@/components/ui';

export default function EventosMisionJoven() {
  const [eventos, setEventos] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any[]>([]);
  const [eventoActivo, setEventoActivo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [precio, setPrecio] = useState('');
  const [fecha, setFecha] = useState('');
  const [cargando, setCargando] = useState(true);

  const load = async () => {
    setCargando(true);
    const { data } = await supabase.from('eventos_globales').select('*').order('fecha', { ascending: true });
    setEventos(data || []);
    setCargando(false);
  };
  useEffect(()=>{ load() },[]);

  const guardar = async () => {
    if(!titulo.trim()) return Alert.alert('Falta el nombre');
    if(editandoId){
      const { error } = await supabase.from('eventos_globales').update({ titulo: titulo.trim(), precio: Number(precio)||0, fecha: fecha||null }).eq('id', editandoId);
      if(error) return Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase.from('eventos_globales').insert({ titulo: titulo.trim(), precio: Number(precio)||0, fecha: fecha||null });
      if(error) return Alert.alert('Error', error.message);
    }
    setTitulo(''); setPrecio(''); setFecha(''); setShowForm(false); setEditandoId(null); load();
  };

  const editar = (ev:any) => {
    setEditandoId(ev.id); setTitulo(ev.titulo); setPrecio(String(ev.precio||'')); setFecha(ev.fecha||''); setShowForm(true);
  };

  const borrar = (ev:any) => {
    Alert.alert('Borrar evento', `¿Borrar "${ev.titulo}"? Se borrará para todos los GV`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async ()=>{
        const { error } = await supabase.from('eventos_globales').delete().eq('id', ev.id);
        if(error) Alert.alert('Error', error.message); else load();
      }}
    ]);
  };

  const verResumen = async (eventoId: string) => {
    if(eventoActivo === eventoId){ setEventoActivo(null); return; }
    setEventoActivo(eventoId);

    // TRAE NOMBRE DIRECTO CON JOIN - ESTO ES LO QUE FALTABA
    const { data, error } = await supabase
    .from('evento_pagos')
    .select('grupo_id, miembro_nombre, monto, pago, grupos_vida(nombre)')
    .eq('evento_id', eventoId);

    if(error){
      console.log('Error join:', error);
      // Fallback si el join falla por nombre de FK
      const { data: data2 } = await supabase.from('evento_pagos').select('grupo_id, miembro_nombre, monto, pago').eq('evento_id', eventoId);
      const { data: gvs } = await supabase.from('grupos_vida').select('id, nombre');
      const map: Record<string,string> = {};
      (gvs||[]).forEach((g:any)=> map[g.id]=g.nombre);
      const agrupado2: any = {};
      (data2||[]).forEach((r:any)=>{
        const nombreReal = map[r.grupo_id] || `GV ${r.grupo_id?.slice(0,6)}`;
        if(!agrupado2[r.grupo_id]) agrupado2[r.grupo_id] = { grupo: nombreReal, cantidad:0, total:0, lista:[] };
        agrupado2[r.grupo_id].cantidad++; agrupado2[r.grupo_id].total+=Number(r.monto||0); agrupado2[r.grupo_id].lista.push(r);
      });
      setResumen(Object.values(agrupado2));
      return;
    }

    const agrupado: any = {};
    (data||[]).forEach((r:any)=>{
      const gid = r.grupo_id;
      const nombreReal = r.grupos_vida?.nombre || 'GV sin nombre';
      if(!agrupado[gid]) agrupado[gid] = { grupo_id: gid, grupo: nombreReal, cantidad:0, total:0, lista:[] };
      agrupado[gid].cantidad++;
      agrupado[gid].total+=Number(r.monto||0);
      agrupado[gid].lista.push(r);
    });
    setResumen(Object.values(agrupado));
  };

  if(cargando) return <Cargando />;

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.fila, { justifyContent: 'space-between', marginTop: 8 }]}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '800' }}>Eventos Globales</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>{eventos.length} activos</Text>
        </View>
        <TouchableOpacity onPress={()=>{ setEditandoId(null); setTitulo(''); setPrecio(''); setFecha(''); setShowForm(!showForm); }} style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={showForm? "close" : "add"} size={18} color="white" />
          <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{showForm? 'Cerrar' : 'Nuevo'}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <Card style={{ backgroundColor: '#F8FAFF', borderWidth: 1, borderColor: '#E0E7FF' }}>
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280' }}>{editandoId? 'EDITAR EVENTO' : 'NOMBRE DEL EVENTO'}</Text>
            <TextInput placeholder="Ej: Fuego y Revolución" placeholderTextColor="#9CA3AF" value={titulo} onChangeText={setTitulo} style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 10, color: '#111827', fontWeight: '600' }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput placeholder="Monto" placeholderTextColor="#9CA3AF" value={precio} onChangeText={setPrecio} keyboardType="numeric" style={{ flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 10, color: '#111827' }} />
              <TextInput placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" value={fecha} onChangeText={setFecha} style={{ flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 10, color: '#111827' }} />
            </View>
            <TouchableOpacity onPress={guardar} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name={editandoId? "save" : "megaphone"} size={18} color="white" />
              <Text style={{ color: 'white', fontWeight: '800' }}>{editandoId? 'Guardar cambios' : 'Crear y derivar'}</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {eventos.map(ev => (
        <Card key={ev.id} style={{ paddingVertical: 14 }}>
          <View style={[s.fila, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flame" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 14, color: '#111827' }}>{ev.titulo}</Text>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>{formatoFecha(ev.fecha)} · {formatoMoneda(Number(ev.precio))}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={()=>editar(ev)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="pencil" size={16} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>borrar(ev)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash" size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity onPress={()=>verResumen(ev.id)} style={{ marginTop: 10, backgroundColor: eventoActivo===ev.id? '#111827' : '#6366F1', padding: 12, borderRadius: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: 'white' }}>{eventoActivo===ev.id? 'Ocultar pagos' : 'Ver pagos por GV'}</Text>
          </TouchableOpacity>
          {eventoActivo === ev.id && (
            <View style={{ marginTop: 12, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, gap:8 }}>
              {resumen.length===0? <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Nadie pagó todavía</Text> : resumen.map((r:any,i)=>(
                <View key={i} style={{ backgroundColor:'white', padding:10, borderRadius:10, borderWidth:1, borderColor:'#F3F4F6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight:'800' }}>{r.grupo}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#059669' }}>${r.total} - {r.cantidad} pagos</Text>
                  </View>
                  <View style={{marginTop:6, gap:3}}>
                    {r.lista.map((p:any, idx:number)=>(
                      <View key={idx} style={{flexDirection:'row', justifyContent:'space-between'}}>
                        <Text style={{fontSize:11, color:'#6B7280'}}>{p.miembro_nombre}</Text>
                        <Text style={{fontSize:11, fontWeight:'700', color: p.pago? '#059669' : '#F59E0B'}}>${p.monto} {p.pago? '✓' : ` (falta $${Number(ev.precio)-Number(p.monto)})`}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}