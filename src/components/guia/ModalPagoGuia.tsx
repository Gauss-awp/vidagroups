import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onGuardar: (monto: number) => void;
  miembro: { nombre: string; yaPagado: number; historial?: { monto: number; fecha: string }[] };
  evento: { titulo: string; precio: number };
  cargando?: boolean;
};

export default function ModalPagoGuia({ visible, onClose, onGuardar, miembro, evento, cargando }: Props) {
  const [monto, setMonto] = useState('');

  const yaPagado = miembro.yaPagado || 0;
  const precio = evento.precio;
  const debe = Math.max(0, precio - yaPagado);
  const montoNum = Number(monto) || 0;
  const nuevoTotal = yaPagado + montoNum;
  const faltaDespues = Math.max(0, precio - nuevoTotal);
  const esTotal = nuevoTotal >= precio;
  const sePasa = nuevoTotal > precio;
  const montoValido = montoNum > 0 &&!sePasa;

  useEffect(()=>{ if(visible) setMonto('') },[visible]);

  const atajos = [
    { label: '$50', valor: 50 },
    { label: '$100', valor: 100 },
    { label: `Total $${debe}`, valor: debe },
  ].filter(b => b.valor > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}>
          <View style={{ backgroundColor:'white', borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:34 }}>

            {/* Header */}
            <View style={{ alignItems:'center', marginBottom:12 }}>
              <View style={{ width:40, height:4, backgroundColor:'#E5E7EB', borderRadius:2, marginBottom:16 }} />
              <Text style={{ fontSize:22, fontWeight:'900' }}>{miembro.nombre}</Text>
              <Text style={{ fontSize:13, color:'#6B7280', marginTop:2 }}>{evento.titulo} · ${precio}</Text>

              <View style={{ flexDirection:'row', gap:8, marginTop:12 }}>
                <View style={{ backgroundColor: debe===0? '#DCFCE7' : '#FEF3C7', paddingHorizontal:10, paddingVertical:6, borderRadius:20 }}>
                  <Text style={{ fontSize:12, fontWeight:'800', color: debe===0? '#15803D' : '#92400E' }}>
                    {debe===0? '✓ Saldado' : `Debe $${debe} · Pagó $${yaPagado}`}
                  </Text>
                </View>
              </View>

              {miembro.historial && miembro.historial.length>0 && (
                <Text style={{ fontSize:11, color:'#9CA3AF', marginTop:8 }}>
                  Último: ${miembro.historial[0].monto} el {miembro.historial[0].fecha}
                </Text>
              )}
            </View>

            {/* Atajos */}
            <View style={{ flexDirection:'row', gap:8, marginVertical:16 }}>
              {atajos.map(b=>(
                <TouchableOpacity key={b.label} onPress={()=>setMonto(String(b.valor))}
                  style={{ flex:1, backgroundColor: monto===String(b.valor)? '#111827' : '#F3F4F6', paddingVertical:12, borderRadius:12, alignItems:'center', borderWidth: monto===String(b.valor)? 2 : 0, borderColor:'#111827' }}>
                  <Text style={{ fontWeight:'800', fontSize:13, color: monto===String(b.valor)? 'white' : '#111827' }}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input grande */}
            <View style={{ backgroundColor:'#F9FAFB', borderRadius:16, borderWidth:2, borderColor: sePasa? '#FCA5A5' : montoValido? '#6EE7B7' : '#E5E7EB', flexDirection:'row', alignItems:'center', paddingHorizontal:16 }}>
              <Text style={{ fontSize:28, fontWeight:'900', color:'#111827' }}>$</Text>
              <TextInput
                value={monto}
                onChangeText={t=>setMonto(t.replace(/[^0-9]/g,''))}
                placeholder="0"
                keyboardType="number-pad"
                autoFocus
                style={{ flex:1, fontSize:32, fontWeight:'900', paddingVertical:14, textAlign:'center', color:'#111827' }}
              />
              {monto!=='' && (
                <TouchableOpacity onPress={()=>setMonto('')}><Ionicons name="close-circle" size={22} color="#9CA3AF" /></TouchableOpacity>
              )}
            </View>

            {/* Feedback */}
            {monto!=='' && (
              <View style={{ marginTop:12, alignItems:'center' }}>
                {sePasa? (
                  <Text style={{ color:'#DC2626', fontSize:12, fontWeight:'700' }}>⚠️ Se pasa por ${nuevoTotal-precio}</Text>
                ) : (
                  <Text style={{ color: esTotal? '#059669' : '#D97706', fontSize:12, fontWeight:'700' }}>
                    {esTotal? `✓ Queda saldado con $${montoNum}` : `Paga $${montoNum} → faltarán $${faltaDespues}`}
                  </Text>
                )}
              </View>
            )}

            {/* Botones */}
            <View style={{ flexDirection:'row', gap:10, marginTop:20 }}>
              <TouchableOpacity onPress={onClose} style={{ flex:1, backgroundColor:'#F3F4F6', paddingVertical:16, borderRadius:14, alignItems:'center' }}>
                <Text style={{ fontWeight:'700', color:'#374151' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>montoValido && onGuardar(montoNum)} disabled={!montoValido || cargando}
                style={{ flex:1, backgroundColor: montoValido? '#111827' : '#E5E7EB', paddingVertical:16, borderRadius:14, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6 }}>
                {cargando? <Text style={{color:'white', fontWeight:'800'}}>Guardando...</Text> : (
                  <>
                    <Ionicons name="checkmark" size={18} color={montoValido? 'white' : '#9CA3AF'} />
                    <Text style={{ color: montoValido? 'white' : '#9CA3AF', fontWeight:'800' }}>{esTotal? 'Saldar' : 'Guardar'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}