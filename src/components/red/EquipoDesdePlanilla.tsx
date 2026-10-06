import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Boton, Campo, Card, HojaModal, SeccionTitulo, s } from '@/components/ui';

type RolEquipo = 'guia' | 'guia_supervisor' | 'consolidacion';

interface FilaEquipo {
  email: string;
  nombre: string | null;
  rol: RolEquipo;
  supervisor_email: string | null;
  supervisor2_email: string | null;
  grupo: string | null;
  consolidador: boolean;
}
interface Preaprobacion extends FilaEquipo {
  id: string;
  aplicado_en: string | null;
}

const ROL_TEXTO: Record<RolEquipo, string> = { guia: 'Guía', guia_supervisor: 'Guía Supervisor', consolidacion: 'Consolidador' };

function leerRol(t: string): RolEquipo | null {
  const v = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/supervisor|^gs$/.test(v)) return 'guia_supervisor';
  if (/consolid/.test(v)) return 'consolidacion';
  if (/^guia$|^g$/.test(v)) return 'guia';
  return null;
}
const siNo = (t?: string) => /^(s|si|sí|x|1|true)$/i.test((t ?? '').trim());

/** Lee lo pegado: Correo · Nombre · Rol · Correo del supervisor · Grupo que guía · Consolidador */
function leerEquipo(texto: string): { filas: FilaEquipo[]; errores: string[] } {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lineas.length) return { filas: [], errores: [] };
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : ',';
  const filas: FilaEquipo[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  lineas.forEach((l, i) => {
    const [email = '', nombre = '', rol = '', sup = '', grupo = '', consolida = '', sup2 = ''] = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (/correo|email/i.test(email) && i === 0) return; // encabezado
    if (!email.includes('@')) {
      errores.push(`Fila ${i + 1}: "${email || '(vacío)'}" no es un correo`);
      return;
    }
    const r = leerRol(rol);
    if (!r) {
      errores.push(`Fila ${i + 1}: el rol "${rol}" no se entiende (Guía, Guía Supervisor o Consolidador)`);
      return;
    }
    if (sup && !sup.includes('@')) errores.push(`Fila ${i + 1}: el supervisor tiene que ser un correo (se carga sin supervisor)`);
    const e = email.toLowerCase();
    if (vistos.has(e)) {
      errores.push(`Fila ${i + 1}: ${e} está repetido`);
      return;
    }
    vistos.add(e);
    filas.push({
      email: e,
      nombre: nombre || null,
      rol: r,
      supervisor_email: sup.includes('@') ? sup.toLowerCase() : null,
      supervisor2_email: sup2.includes('@') ? sup2.toLowerCase() : null,
      grupo: grupo || null,
      consolidador: siNo(consolida),
    });
  });
  return { filas, errores };
}

/**
 * Configura de una vez a todo el equipo de la red desde una planilla.
 * Quien ya se registró queda aprobado al instante; el resto, apenas se registre con ese correo.
 */
export function EquipoDesdePlanilla({ redId, redNombre, onCambio }: { redId: string; redNombre: string; onCambio?: () => void }) {
  const [lista, setLista] = useState<Preaprobacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [verLista, setVerLista] = useState(false);
  const [texto, setTexto] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('preaprobaciones').select('*').eq('red_id', redId).order('creado_en');
    setLista((data ?? []) as Preaprobacion[]);
  }, [redId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const { filas, errores } = leerEquipo(texto);

  const guardar = async () => {
    if (!filas.length) return;
    setTrabajando(true);
    const { error } = await supabase
      .from('preaprobaciones')
      .upsert(filas.map((f) => ({ ...f, red_id: redId, aplicado_en: null, perfil_id: null })), { onConflict: 'red_id,email' });
    if (error) {
      setTrabajando(false);
      Alert.alert('No se pudo guardar', error.message);
      return;
    }
    const { data, error: e2 } = await supabase.rpc('aplicar_preaprobaciones', { p_red: redId });
    setTrabajando(false);
    if (e2) {
      Alert.alert('Se guardó la planilla, pero no se pudo aprobar', e2.message);
    } else {
      const r = data as { aplicados: number; esperando: number };
      Alert.alert(
        'Equipo cargado',
        `${r.aplicados} ${r.aplicados === 1 ? 'persona quedó aprobada' : 'personas quedaron aprobadas'} ahora.` +
          (r.esperando ? ` ${r.esperando} ${r.esperando === 1 ? 'queda aprobada sola' : 'quedan aprobadas solas'} apenas se registren con ese correo.` : '')
      );
    }
    setTexto('');
    setAbierto(false);
    cargar();
    onCambio?.();
  };

  const borrar = (p: Preaprobacion) =>
    Alert.alert('Quitar de la planilla', `¿Quitar a ${p.email}? Si todavía no se registró, ya no va a quedar aprobado solo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('preaprobaciones').delete().eq('id', p.id);
          cargar();
        },
      },
    ]);

  const aplicados = lista.filter((p) => p.aplicado_en).length;

  return (
    <View>
      <SeccionTitulo titulo="Equipo de la red" />
      <Card>
        <Text style={s.textoFilaSec}>
          Cargá de una vez a guías, supervisores y consolidadores. Quien ya se registró queda aprobado al instante; el resto, apenas se registre con ese correo.
        </Text>
        {lista.length ? (
          <Pressable onPress={() => setVerLista(!verLista)} style={{ marginTop: 10 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              {aplicados} de {lista.length} ya registrados · {verLista ? 'ocultar' : 'ver lista'}
            </Text>
          </Pressable>
        ) : null}
        {verLista
          ? lista.map((p) => (
              <View key={p.id} style={[s.filaLista, { alignItems: 'flex-start' }]}>
                <Ionicons
                  name={p.aplicado_en ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color={p.aplicado_en ? colors.success : colors.warning}
                  style={{ marginRight: 8, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.textoFila}>{p.nombre || p.email}</Text>
                  <Text style={s.textoFilaSec}>
                    {ROL_TEXTO[p.rol]}
                    {p.grupo ? ` · ${p.grupo}` : ''}
                    {p.consolidador ? ' · Consolida' : ''}
                    {p.aplicado_en ? '' : ' · esperando registro'}
                  </Text>
                </View>
                <Pressable onPress={() => borrar(p)} hitSlop={10}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.textTer} />
                </Pressable>
              </View>
            ))
          : null}
        <Boton titulo="Cargar equipo desde planilla" icono="people-outline" variante="secundario" onPress={() => setAbierto(true)} style={{ marginTop: 12 }} />
      </Card>

      <HojaModal visible={abierto} onClose={() => setAbierto(false)} titulo={`Equipo de ${redNombre}`}>
        <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Columnas, en este orden:</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>
          Correo · Nombre · Rol · Correo del supervisor · Grupo que guía · Consolidador (SI/NO) · Correo del 2º supervisor (opcional)
        </Text>
        <Text style={[s.textoFilaSec, { marginBottom: 12 }]}>
          Rol: Guía, Guía Supervisor o Consolidador. Si el grupo no existe, se crea. Si ya existe con otro guía, pasa a esta persona.
        </Text>
        <Campo placeholder="Pegá acá las filas de la planilla" value={texto} onChangeText={setTexto} multiline style={{ minHeight: 70, maxHeight: 90, fontSize: 12 }} />
        {filas.length ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>{filas.length} personas:</Text>
            {filas.slice(0, 8).map((f) => (
              <Text key={f.email} style={{ color: colors.text, fontSize: 13, marginBottom: 3 }}>
                {f.nombre || f.email} · {ROL_TEXTO[f.rol]}
                {f.supervisor_email ? ` · sup: ${f.supervisor_email}` : ''}
                {f.supervisor2_email ? ` y ${f.supervisor2_email}` : ''}
                {f.grupo ? ` · ${f.grupo}` : ''}
                {f.consolidador ? ' · Consolida' : ''}
              </Text>
            ))}
            {filas.length > 8 ? <Text style={s.textoFilaSec}>y {filas.length - 8} más</Text> : null}
          </View>
        ) : null}
        {errores.slice(0, 8).map((e) => (
          <Text key={e} style={{ color: colors.warning, fontSize: 12, marginBottom: 2 }}>
            {e}
          </Text>
        ))}
        <Boton titulo="Guardar y aprobar" icono="checkmark" onPress={guardar} cargando={trabajando} deshabilitado={!filas.length} style={{ marginTop: 8 }} />
      </HojaModal>
    </View>
  );
}
