import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text, View, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { formatoMoneda, formatoFecha } from '@/lib/utils';
import { colors } from '@/lib/theme';
import { Card, Cargando, s } from '@/components/ui';

export default function EventosMisionJoven({ redId, puedeGeneral = false }: { redId: string; puedeGeneral?: boolean }) {
  const [eventos, setEventos] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any[]>([]);
  const [eventoActivo, setEventoActivo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [precio, setPrecio] = useState('');
  const [fecha, setFecha] = useState('');
  const [paraTodaLaIglesia, setParaTodaLaIglesia] = useState(false);
  const [cargando, setCargando] = useState(true);

  const load = async () => {
    setCargando(true);
    const { data } = await supabase.from('eventos_globales').select('*').or(`red_id.eq.${redId},red_id.is.null`).order('fecha', { ascending: true });
    setEventos(data || []);
    setCargando(false);
  };
  useEffect(()=>{ load() },[redId]);

  const guardar = async () => {
    if(!titulo.trim()) return Alert.alert('Falta el nombre');
    if(editandoId){
      const { error } = await supabase.from('eventos_globales').update({ titulo: titulo.trim(), precio: Number(precio)||0, fecha: fecha||null }).eq('id', editandoId);
      if(error) return Alert.alert('Error', error.message);
    } else {
      const { error } = await supabase.from('eventos_globales').insert({ titulo: titulo.trim(), precio: Number(precio)||0, fecha: fecha||null, red_id: puedeGeneral && paraTodaLaIglesia ? null : redId });
      if(error) return Alert.alert('Error', error.message);
    }
    setTitulo(''); setPrecio(''); setFecha(''); setParaTodaLaIglesia(false); setShowForm(false); setEditandoId(null); load();
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

    const { data } = await supabase
      .from('evento_pagos')
      .select('grupo_id, miembro_nombre, monto, pago')
      .eq('evento_id', eventoId);
    const idsGrupos = [...new Set((data || []).map((r: any) => r.grupo_id).filter(Boolean))];
    const { data: gvs } = idsGrupos.length
      ? await supabase.from('groups').select('id, nombre').in('id', idsGrupos)
      : { data: [] };
    const nombres: Record<string, string> = {};
    (gvs || []).forEach((g: any) => { nombres[g.id] = g.nombre; });

    const agrupado: any = {};
    (data || []).forEach((r: any) => {
      const gid = r.grupo_id || 'sin_grupo';
      if (!agrupado[gid]) agrupado[gid] = { grupo_id: gid, grupo: nombres[r.grupo_id] || 'Grupo sin nombre', cantidad: 0, total: 0, lista: [] };
      agrupado[gid].cantidad++;
      agrupado[gid].total += Number(r.monto || 0);
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
            {puedeGeneral && !editandoId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>Para toda la iglesia</Text>
                <Switch value={paraTodaLaIglesia} onValueChange={setParaTodaLaIglesia} />
              </View>
            ) : null}
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
                {ev.red_id === null ? <Text style={{ fontSize: 11, color: colors.purple, fontWeight: '700' }}>Toda la iglesia</Text> : null}
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