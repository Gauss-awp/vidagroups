import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import type { Moneda } from '@/lib/types';
import { formatoMoneda } from '@/lib/utils';

type Props = {
  visible: boolean;
  onClose: () => void;
  onGuardar: (monto: number, nota: string) => void;
  miembro: { nombre: string; yaPagado: number; historial?: { monto: number; fecha: string }[] };
  evento: { titulo: string; precio: number; moneda?: Moneda };
  cargando?: boolean;
};

export default function ModalPagoGuia({ visible, onClose, onGuardar, miembro, evento, cargando }: Props) {
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const moneda: Moneda = evento.moneda ?? 'ARS';
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  const f = (v: number) => formatoMoneda(v, moneda);

  const yaPagado = miembro.yaPagado || 0;
  const precio = evento.precio;
  const debe = Math.max(0, precio - yaPagado);
  const montoNum = Number(monto) || 0;
  const nuevoTotal = yaPagado + montoNum;
  const faltaDespues = Math.max(0, precio - nuevoTotal);
  const esTotal = nuevoTotal >= precio;
  const sePasa = nuevoTotal > precio;
  const montoValido = montoNum > 0 &&!sePasa;

  useEffect(()=>{ if(visible){ setMonto(''); setNota(`Cuota ${(miembro.historial?.length || 0) + 1}`); } },[visible]);

  const atajos = [
    ...(moneda === 'USD'
      ? [{ label: 'US$ 50', valor: 50 }, { label: 'US$ 100', valor: 100 }]
      : [{ label: '$ 10.000', valor: 10000 }, { label: '$ 20.000', valor: 20000 }]),
    { label: `Total ${f(debe)}`, valor: debe },
  ].filter(b => b.valor > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}>
          <View style={{ backgroundColor:colors.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:34 }}>

            {/* Header */}
            <View style={{ alignItems:'center', marginBottom:12 }}>
              <View style={{ width:40, height:4, backgroundColor:colors.border, borderRadius:2, marginBottom:16 }} />
              <Text style={{ color: colors.text,  fontSize:22, fontWeight:'900' }}>{miembro.nombre}</Text>
              <Text style={{ fontSize:13, color:colors.textSec, marginTop:2 }}>{evento.titulo} · {f(precio)}</Text>

              <View style={{ flexDirection:'row', gap:8, marginTop:12 }}>
                <View style={{ backgroundColor: debe===0? colors.successBg : colors.warningBg, paddingHorizontal:10, paddingVertical:6, borderRadius:20 }}>
                  <Text style={{ fontSize:12, fontWeight:'800', color: debe===0? '#15803D' : colors.warning }}>
                    {debe===0? '✓ Saldado' : `Debe ${f(debe)} · Pagó ${f(yaPagado)}`}
                  </Text>
                </View>
              </View>

              {miembro.historial && miembro.historial.length>0 && (
                <Text style={{ fontSize:11, color:colors.textTer, marginTop:8 }}>
                  Último: {f(miembro.historial[0].monto)} el {miembro.historial[0].fecha}
                </Text>
              )}
            </View>

            {/* Atajos */}
            <View style={{ flexDirection:'row', gap:8, marginVertical:16 }}>
              {atajos.map(b=>(
                <TouchableOpacity key={b.label} onPress={()=>setMonto(String(b.valor))}
                  style={{ flex:1, backgroundColor: monto===String(b.valor)? colors.primary : colors.cardAlt, paddingVertical:12, borderRadius:12, alignItems:'center', borderWidth: monto===String(b.valor)? 2 : 0, borderColor:colors.text }}>
                  <Text style={{ fontWeight:'800', fontSize:13, color: monto===String(b.valor)? 'white' : colors.text }}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input grande */}
            <View style={{ backgroundColor:colors.cardAlt, borderRadius:16, borderWidth:2, borderColor: sePasa? colors.dangerBorde : montoValido? '#6EE7B7' : colors.border, flexDirection:'row', alignItems:'center', paddingHorizontal:16 }}>
              <Text style={{ fontSize:24, fontWeight:'900', color:colors.text }}>{simbolo}</Text>
              <TextInput
                value={monto}
                onChangeText={t=>setMonto(t.replace(/[^0-9]/g,''))}
                placeholder="0"
                keyboardType="number-pad"
                autoFocus
                style={{ flex:1, fontSize:32, fontWeight:'900', paddingVertical:14, textAlign:'center', color:colors.text }}
              />
              {monto!=='' && (
                <TouchableOpacity onPress={()=>setMonto('')}><Ionicons name="close-circle" size={22} color="#9CA3AF" /></TouchableOpacity>
              )}
            </View>

            {/* Feedback */}
            {monto!=='' && (
              <View style={{ marginTop:12, alignItems:'center' }}>
                {sePasa? (
                  <Text style={{ color:colors.danger, fontSize:12, fontWeight:'700' }}>Se pasa por {f(nuevoTotal-precio)}</Text>
                ) : (
                  <Text style={{ color: esTotal? colors.success : colors.warning, fontSize:12, fontWeight:'700' }}>
                    {esTotal? `✓ Queda saldado con ${f(montoNum)}` : `Paga ${f(montoNum)} → faltarán ${f(faltaDespues)}`}
                  </Text>
                )}
              </View>
            )}

            {/* Nota */}
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder='Nota (ej: "Cuota 1")'
              placeholderTextColor="#9CA3AF"
              style={{ marginTop:14, borderWidth:1, borderColor:colors.border, borderRadius:12, padding:12, color:colors.text }}
            />

            {/* Botones */}
            <View style={{ flexDirection:'row', gap:10, marginTop:20 }}>
              <TouchableOpacity onPress={onClose} style={{ flex:1, backgroundColor:colors.cardAlt, paddingVertical:16, borderRadius:14, alignItems:'center' }}>
                <Text style={{ fontWeight:'700', color:colors.textSec }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>montoValido && onGuardar(montoNum, nota.trim())} disabled={!montoValido || cargando}
                style={{ flex:1, backgroundColor: montoValido? colors.primary : colors.border, paddingVertical:16, borderRadius:14, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6 }}>
                {cargando? <Text style={{color:'white', fontWeight:'800'}}>Guardando...</Text> : (
                  <>
                    <Ionicons name="checkmark" size={18} color={montoValido? 'white' : colors.textTer} />
                    <Text style={{ color: montoValido? 'white' : colors.textTer, fontWeight:'800' }}>{esTotal? 'Saldar' : 'Guardar'}</Text>
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