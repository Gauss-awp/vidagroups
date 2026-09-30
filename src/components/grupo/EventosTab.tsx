import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Alert, Text, View, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Animated } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Boton, Card, Cargando } from '@/components/ui';
import ModalPagoGuia from '../guia/ModalPagoGuia';

export function EventosTab({ grupoId, refreshKey }: { grupoId: string; refreshKey: number }) {
  const { perfil } = useAuth();
  const [eventos, setEventos] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [miembros, setMiembros] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eventoActivo, setEventoActivo] = useState<string | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [precio, setPrecio] = useState('');
  const [fecha, setFecha] = useState('');
  const [editandoId, setEditandoId] = useState<string|null>(null);
  const [modalPago, setModalPago] = useState(false);
  const [miembroSel, setMiembroSel] = useState<any>(null);
  const [eventoSel, setEventoSel] = useState<any>(null);
  const [confetiId, setConfetiId] = useState<string|null>(null);
  const [statsGlobales, setStatsGlobales] = useState<Record<string, {total:number, pagaron:number}>>({});
  const anim = useRef(new Animated.Value(0)).current;
  
  const esMisionJoven = perfil?.rol !== 'guia';

  const cargar = useCallback(async () => {
    setCargando(true);
    const ev = await supabase.from('eventos_globales').select('*').order('fecha', { ascending: true });
    const mi = await supabase.from('miembros_grupo').select('id, nombre').eq('grupo_id', grupoId).eq('activo', true);
    const listaEventos = ev.data?? [];
    let listaPagos: any[] = [];
    let globales: Record<string, {total:number, pagaron:number}> = {};

    if (listaEventos.length) {
      if (esMisionJoven) {
        const p = await supabase.from('evento_pagos').select('*').in('evento_id', listaEventos.map((e:any)=>e.id));
        listaPagos = p.data?? [];
        listaEventos.forEach(ev=>{
          const pagosEv = listaPagos.filter(p=>p.evento_id===ev.id);
          const total = pagosEv.reduce((s,p)=>s+Number(p.monto||0),0);
          const pagaron = pagosEv.filter(p=>Number(p.monto)>=Number(ev.precio)).length;
          globales[ev.id] = { total, pagaron };
        });
      } else {
        const p = await supabase.from('evento_pagos').select('*').eq('grupo_id', grupoId).in('evento_id', listaEventos.map((e:any)=>e.id));
        listaPagos = p.data?? [];
      }
    }
    setEventos(listaEventos);
    setMiembros(mi.data?? []);
    setPagos(listaPagos);
    setStatsGlobales(globales);
    setCargando(false);
  }, [grupoId, esMisionJoven]);

  useEffect(()=>{ cargar() }, [cargar, refreshKey]);

  const lanzarConfeti = (id:string)=>{
    setConfetiId(id);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }).start(()=>setTimeout(()=>setConfetiId(null), 500));
  };

  const guardarEvento = async () => {
    if(!titulo.trim()) return Alert.alert('Falta título');
    if(editandoId){
      await supabase.from('eventos_globales').update({ titulo: titulo.trim(), precio: Number(precio)||0, fecha: fecha||null }).eq('id', editandoId);
    } else {
      await supabase.from('eventos_globales').insert({ titulo: titulo.trim(), precio: Number(precio)||0, fecha: fecha||null });
    }
    setModalCrear(false); setTitulo(''); setPrecio(''); setFecha(''); setEditandoId(null); cargar();
  };

  // FIX: ahora SUMA, no reemplaza
  const guardarPago = async (montoNuevo: number) => {
    if(!miembroSel ||!eventoSel) return;
    const existente = pagos.find(p=>p.evento_id===eventoSel.id && p.miembro_id===miembroSel.id && p.grupo_id===grupoId);
    const yaPagado = Number(existente?.monto||0);
    const montoFinal = yaPagado + Number(montoNuevo||0);
    const precioEv = Number(eventoSel.precio)||0;
    
    let error;
    if(montoFinal===0){
      if(existente){ const r = await supabase.from('evento_pagos').delete().eq('id', existente.id); error=r.error; }
    } else {
      if(existente){ const r = await supabase.from('evento_pagos').update({ monto: montoFinal, pago: montoFinal>=precioEv }).eq('id', existente.id); error=r.error; }
      else { const r = await supabase.from('evento_pagos').insert({ evento_id: eventoSel.id, grupo_id: grupoId, miembro_id: miembroSel.id, miembro_nombre: miembroSel.nombre, monto: montoFinal, pago: montoFinal>=precioEv }); error=r.error; }
    }
    if(error){ Alert.alert('Error', error.message); return; }
    const pagosEv = pagos.filter(p=>p.evento_id===eventoSel.id && p.miembro_id!==miembroSel.id);
    const totalNuevo = pagosEv.reduce((s,p)=>s+Number(p.monto||0),0) + montoFinal;
    const meta = precioEv*miembros.length;
    if(totalNuevo>=meta && meta>0) lanzarConfeti(eventoSel.id);
    setModalPago(false);
    cargar();
  };

  if(cargando) return <Cargando />;

  const pagoActual = miembroSel && eventoSel ? pagos.find(p=>p.evento_id===eventoSel.id && p.miembro_id===miembroSel.id) : null;

  return (
    <View style={{ gap: 14 }}>
      {esMisionJoven && <Boton titulo="Crear Evento Global" icono="add-circle" onPress={()=>{ setEditandoId(null); setTitulo(''); setPrecio(''); setFecha(''); setModalCrear(true); }} />}

      <Modal visible={modalCrear} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', padding:20}}>
            <View style={{backgroundColor:'white', padding:20, borderRadius:16}}>
              <Text style={{fontWeight:'800', fontSize:16, marginBottom:12}}>{editandoId? 'Editar' : 'Nuevo Evento'}</Text>
              <TextInput placeholder="Nombre" value={titulo} onChangeText={setTitulo} style={{borderWidth:1, borderColor:'#E5E7EB', padding:12, borderRadius:10, marginBottom:10}}/>
              <TextInput placeholder="Precio" value={precio} onChangeText={setPrecio} keyboardType="numeric" style={{borderWidth:1, borderColor:'#E5E7EB', padding:12, borderRadius:10, marginBottom:10}}/>
              <TextInput placeholder="YYYY-MM-DD" value={fecha} onChangeText={setFecha} style={{borderWidth:1, borderColor:'#E5E7EB', padding:12, borderRadius:10, marginBottom:10}}/>
              <Boton titulo="Guardar" onPress={guardarEvento}/>
              <Boton titulo="Cancelar" onPress={()=>setModalCrear(false)} style={{marginTop:10, backgroundColor:'#6B7280'}}/>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {miembroSel && eventoSel && (
        <ModalPagoGuia
          visible={modalPago}
          onClose={()=>setModalPago(false)}
          onGuardar={guardarPago}
          miembro={{ 
            nombre: miembroSel.nombre, 
            yaPagado: Number(pagoActual?.monto||0),
            historial: pagoActual ? [{ monto: Number(pagoActual.monto), fecha: pagoActual.created_at?.slice(0,10)||'' }] : []
          }}
          evento={{ titulo: eventoSel.titulo, precio: Number(eventoSel.precio) }}
        />
      )}

      {eventos.map(ev=>{
        const pagosFiltrados = esMisionJoven ? pagos.filter(p=>p.evento_id===ev.id) : pagos.filter(p=>p.evento_id===ev.id && p.grupo_id===grupoId);
        const totalRecaudado = esMisionJoven ? (statsGlobales[ev.id]?.total||0) : pagosFiltrados.reduce((s,p)=>s+Number(p.monto||0),0);
        const pagaronCompleto = esMisionJoven ? (statsGlobales[ev.id]?.pagaron||0) : pagosFiltrados.filter(p=>Number(p.monto)>=Number(ev.precio)).length;
        const precio = Number(ev.precio)||0;
        const meta = esMisionJoven ? 0 : precio*miembros.length;
        const progreso = meta? Math.min(100, (totalRecaudado/meta)*100) : 0;
        const esMeta = progreso>=100 && meta>0;
        const esActivo = eventoActivo===ev.id;
        const mostrarConfeti = confetiId===ev.id;

        return (
          <Card key={ev.id} style={{ padding: 16, borderRadius: 20, borderWidth: esMeta?2:0, borderColor: esMeta? '#10B981' : 'transparent', backgroundColor: esMeta? '#F0FDF4' : 'white', overflow: 'hidden' }}>
            {mostrarConfeti && (
              <Animated.View style={{ position: 'absolute', top:0, left:0, right:0, bottom:0, zIndex:10, alignItems:'center', justifyContent:'center', opacity: anim }}>
                <Text style={{ fontSize: 50 }}>🎉 🎊 ✨ 🎉</Text>
                <Text style={{ fontWeight:'900', fontSize:18, color:'#065F46', marginTop:6 }}>¡META COMPLETADA!</Text>
              </Animated.View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '900', fontSize: 17 }}>{ev.titulo} {esMisionJoven && '🌍'}</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                  {ev.fecha} · ${ev.precio} · 
                  <Text style={{ fontWeight:'800', color: '#6366F1' }}> {esMisionJoven ? `${pagaronCompleto} pagos en total` : `${pagaronCompleto}/${miembros.length} pagaron`}</Text> · 
                  <Text style={{ fontWeight:'800', color: esMeta? '#10B981' : '#6366F1' }}> ${totalRecaudado} recaudado{esMisionJoven?' (global)':''}</Text>
                </Text>
                {!esMisionJoven && (
                  <>
                    <View style={{ height: 12, backgroundColor: '#F3F4F6', borderRadius: 10, marginTop: 10, overflow: 'hidden' }}>
                      <View style={{ height: 12, width: `${progreso}%`, backgroundColor: esMeta? '#10B981' : progreso>=70? '#6366F1' : '#F59E0B' }} />
                    </View>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4 }}>
                      <Text style={{ fontSize:10, color:'#9CA3AF' }}>{Math.round(progreso)}% de la meta</Text>
                      <Text style={{ fontSize:10, fontWeight:'700', color:'#6B7280' }}>Meta ${meta}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            <TouchableOpacity onPress={()=>setEventoActivo(esActivo? null : ev.id)} style={{ marginTop: 14, backgroundColor: esMeta? '#10B981' : esMisionJoven? '#6366F1' : '#111827', padding: 12, borderRadius: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color:'white' }}>{esActivo? '▲ Ocultar' : esMisionJoven? '🌍 Ver detalle global' : '▼ Ver pagos'}</Text>
            </TouchableOpacity>

            {esActivo && !esMisionJoven && miembros.map(m=>{
              const pago = pagos.find(p=>p.evento_id===ev.id && p.miembro_id===m.id && p.grupo_id===grupoId);
              const monto = Number(pago?.monto||0);
              const completo = monto>=precio && precio>0;
              const parcial = monto>0 &&!completo;
              return (
                <TouchableOpacity key={m.id} onPress={()=>{ setEventoSel(ev); setMiembroSel(m); setModalPago(true); }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: completo? '#D1FAE5' : parcial? '#FEF3C7' : 'white', padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: completo? '#10B981' : parcial? '#FBBF24' : '#F3F4F6', marginTop:8 }}>
                  <Text style={{ fontWeight: '700' }}>{m.nombre}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: completo? '#065F46' : parcial? '#92400E' : '#9CA3AF' }}>{completo? `Pagó $${monto}` : parcial? `Puso $${monto} - Falta $${precio-monto}` : 'Pendiente'}</Text>
                </TouchableOpacity>
              );
            })}

            {esActivo && esMisionJoven && (
              <View style={{ marginTop:12, gap:8 }}>
                {pagosFiltrados.length===0? <Text style={{ textAlign:'center', color:'#9CA3AF', marginTop:10 }}>Aún no hay pagos registrados</Text> : pagosFiltrados.map(p=>(
                  <View key={p.id} style={{ flexDirection:'row', justifyContent:'space-between', backgroundColor:'#F9FAFB', padding:12, borderRadius:10 }}>
                    <Text style={{ fontWeight:'600', fontSize:12 }}>{p.miembro_nombre} <Text style={{ color:'#9CA3AF', fontSize:10 }}>({p.grupo_id?.slice(0,4)})</Text></Text>
                    <Text style={{ fontWeight:'800', fontSize:12, color: Number(p.monto)>=precio? '#10B981' : '#F59E0B' }}>${p.monto}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        );
      })}
    </View>
  );
}