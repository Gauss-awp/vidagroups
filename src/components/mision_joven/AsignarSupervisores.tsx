import { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { SeccionTitulo, Cargando } from '@/components/ui';
import { colors } from '@/lib/theme';

export function AsignarSupervisores({ redId, redNombre }: { redId: string; redNombre: string }) {
  const [guias, setGuias] = useState<any[]>([]);
  const [sups, setSups] = useState<any[]>([]);
  const [rels, setRels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selGuia, setSelGuia] = useState<string | null>(null);
  const [selSup, setSelSup] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    const { data: perfiles } = await supabase.from('profiles').select('id, nombre, rol').in('rol', ['guia', 'guia_supervisor']).eq('red_id', redId).eq('estado', 'activo');
    setGuias(perfiles?.filter((p:any) => p.rol === 'guia') || []);
    setSups(perfiles?.filter((p:any) => p.rol === 'guia_supervisor') || []);
    
    const { data: rel, error } = await supabase.rpc('get_relaciones');
    if (!error) setRels(rel || []);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [redId]);

  const asignar = async () => {
    if (!selGuia || !selSup) return Alert.alert('Falta', 'Elegí guía y supervisor');
    const { error } = await supabase.rpc('asignar_guia', { p_guia: selGuia, p_sup: selSup });
    if (error) Alert.alert('Error', error.message);
    else { Alert.alert('Listo', 'Guía asignado a supervisor'); setSelGuia(null); setSelSup(null); cargar(); }
  };

  if (loading) return <Cargando texto="Cargando..." />;
  
  return (
    <View style={{ marginTop: 24, paddingBottom: 40 }}>
      <SeccionTitulo titulo={`Supervisores · ${redNombre}`} />

      <Text style={{ color: colors.text,  fontWeight: '800', marginBottom: 8 }}>1. Guía:</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {guias.map((g:any) => (
          <TouchableOpacity key={g.id} onPress={() => setSelGuia(g.id)} style={{ padding: 10, borderRadius: 10, backgroundColor: selGuia===g.id ? colors.text : colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: selGuia===g.id ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{g.nombre} {rels.find(r=>r.guia_id===g.id) ? '→ asignado' : '(libre)'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color: colors.text,  fontWeight: '800', marginBottom: 8 }}>2. Supervisor:</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {sups.map((s:any) => (
          <TouchableOpacity key={s.id} onPress={() => setSelSup(s.id)} style={{ padding: 10, borderRadius: 10, backgroundColor: selSup===s.id ? colors.success : colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: selSup===s.id ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{s.nombre} ({rels.filter((r:any)=>r.supervisor_id===s.id).length})</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={asignar} style={{ backgroundColor: colors.text, padding: 14, borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>Asignar Guía a Supervisor</Text>
      </TouchableOpacity>
    </View>
  );
}