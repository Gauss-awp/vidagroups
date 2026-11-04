import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { alerta } from '@/lib/alerta';
import { ROL_LABEL } from '@/lib/utils';
import type { Rol } from '@/lib/types';
import { Boton, Campo, Chip, HojaModal, s } from '@/components/ui';

interface Candidato {
  id: string;
  nombre: string;
  rol: Rol;
  grupos: string | null;
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Crear un grupo nuevo y asignarle sus guías (uno o dos).
 * Lo usan los Guías Supervisores (en su red) y los encargados.
 */
export function CrearGrupoConGuias({
  visible,
  onClose,
  onCreado,
  redId,
}: {
  visible: boolean;
  onClose: () => void;
  onCreado: (grupoId: string) => void;
  redId?: string;
}) {
  const [nombre, setNombre] = useState('');
  const [guia, setGuia] = useState<Candidato | null>(null);
  const [coguia, setCoguia] = useState<Candidato | null>(null);
  const [dia, setDia] = useState<number | null>(null);
  const [hora, setHora] = useState('');
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [eligiendo, setEligiendo] = useState<'guia' | 'coguia' | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNombre('');
    setGuia(null);
    setCoguia(null);
    setDia(null);
    setHora('');
    supabase.rpc('candidatos_guias_red', { p_red: redId ?? null }).then(({ data, error }) => {
      if (error) alerta('No se pudo cargar la lista de guías', error.message);
      setCandidatos((data ?? []) as Candidato[]);
    });
  }, [visible, redId]);

  const crear = async () => {
    const h = hora.trim().replace('.', ':');
    if (!nombre.trim()) return alerta('Falta el nombre', 'Poné un nombre para el grupo, por ejemplo "Grupo de vida 12".');
    if (!guia) return alerta('Falta el guía', 'Elegí quién guía el grupo.');
    if (h && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(h)) return alerta('Hora inválida', 'Escribila como 21:00.');
    setGuardando(true);
    const { data, error } = await supabase.rpc('crear_grupo_con_guias', {
      p_nombre: nombre.trim(),
      p_guia: guia.id,
      p_coguia: coguia?.id ?? null,
      p_dia: dia,
      p_hora: h || null,
      p_red: redId ?? null,
    });
    setGuardando(false);
    if (error) return alerta('No se pudo crear el grupo', error.message);
    onClose();
    onCreado(data as string);
  };

  const filtrados = candidatos.filter(
    (c) =>
      (!busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) &&
      c.id !== (eligiendo === 'guia' ? coguia?.id : guia?.id)
  );

  const persona = (titulo: string, valor: Candidato | null, tipo: 'guia' | 'coguia', opcional = false) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>{titulo}</Text>
      <Pressable
        onPress={() => {
          setBusqueda('');
          setEligiendo(tipo);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 12, padding: 12 }}
      >
        <Ionicons name={valor ? 'person' : 'person-add-outline'} size={18} color={valor ? colors.primary : colors.textSec} style={{ marginRight: 8 }} />
        <Text style={{ color: valor ? colors.text : colors.textSec, flex: 1, fontWeight: valor ? '700' : '400' }}>
          {valor ? valor.nombre : opcional ? 'Sin segundo guía (opcional)' : 'Elegir'}
        </Text>
        {valor && opcional ? (
          <Pressable onPress={() => setCoguia(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTer} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textTer} />
        )}
      </Pressable>
    </View>
  );

  return (
    <HojaModal visible={visible} onClose={onClose} titulo={eligiendo ? (eligiendo === 'guia' ? 'Guía principal' : 'Segundo guía') : 'Crear un grupo'}>
      {eligiendo ? (
        <>
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar por nombre"
            placeholderTextColor={colors.textTer}
            style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: 12, color: colors.text, marginBottom: 10 }}
          />
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {filtrados.length === 0 ? (
              <Text style={s.textoFilaSec}>No hay guías aprobados en la red con ese nombre. La persona tiene que registrarse y ser aprobada primero.</Text>
            ) : (
              filtrados.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    if (eligiendo === 'guia') setGuia(c);
                    else setCoguia(c);
                    setEligiendo(null);
                  }}
                  style={s.filaLista}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.textoFila}>{c.nombre}</Text>
                    <Text style={s.textoFilaSec}>
                      {ROL_LABEL[c.rol] ?? c.rol}
                      {c.grupos ? ` · ya guía: ${c.grupos}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                </Pressable>
              ))
            )}
          </ScrollView>
          <Boton titulo="Volver" variante="secundario" onPress={() => setEligiendo(null)} style={{ marginTop: 10 }} />
        </>
      ) : (
        <>
          <Campo etiqueta="Nombre del grupo" placeholder="Ej: Grupo de vida 12" value={nombre} onChangeText={setNombre} />
          {persona('Guía principal', guia, 'guia')}
          {persona('Segundo guía', coguia, 'coguia', true)}
          <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Día de reunión (opcional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            {DIAS.map((d, i) => (
              <Chip key={d} texto={d} activo={dia === i} onPress={() => setDia(dia === i ? null : i)} />
            ))}
          </View>
          <Campo etiqueta="Hora (opcional)" placeholder="21:00" value={hora} onChangeText={setHora} keyboardType="numbers-and-punctuation" />
          <Boton titulo="Crear grupo" icono="add-circle" onPress={crear} cargando={guardando} style={{ marginTop: 6 }} />
        </>
      )}
    </HojaModal>
  );
}
