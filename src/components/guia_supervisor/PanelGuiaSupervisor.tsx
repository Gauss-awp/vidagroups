import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Perfil } from '@/lib/types';
import { Cargando, Pantalla, TituloGrande, Stat, SeccionTitulo, Card, s } from '@/components/ui';
import { colors } from '@/lib/theme';
import { AlertasFaltas } from '@/components/asistencia/AlertasFaltas';

export function PanelGuiaSupervisor({ perfil }: { perfil: Perfil }) {
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [misGuias, setMisGuias] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [miembros, setMiembros] = useState<any[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // 1. Traer guías a cargo usando la RPC sin cache
      const { data: relSup } = await supabase.rpc('get_relaciones');
      let idsGuias: string[] = (relSup as any[])?.filter((r: any) => r.supervisor_id === perfil.id).map((r: any) => r.guia_id) || [];

      // Fallback por si usaste profiles.supervisor_id
      if (idsGuias.length === 0) {
        const { data: porPerfil } = await supabase.from('profiles').select('id').eq('supervisor_id', perfil.id).eq('rol', 'guia');
        idsGuias = (porPerfil || []).map((g: any) => g.id);
      }

      if (idsGuias.length === 0) {
        setMisGuias([]);
        setGrupos([]);
        setMiembros([]);
        setCargando(false);
        return;
      }

      // 2. Datos de guías y grupos
      const { data: guiasData } = await supabase.from('profiles').select('id, nombre, apellido').in('id', idsGuias);
      const { data: gruposData } = await supabase.from('groups').select('id, nombre, guia_id').in('guia_id', idsGuias);

      // 3. Miembros usando la RPC que salta RLS
      const { data: miembrosData, error: errMiembros } = await supabase.rpc('get_miembros_de_mis_guias', {
        p_supervisor_id: perfil.id,
      });

      if (errMiembros) {
        console.log('Error miembros RPC, probando directo:', errMiembros);
        const idsGrupos = (gruposData || []).map((g: any) => g.id);
        if (idsGrupos.length > 0) {
          const { data: mDirect } = await supabase.from('miembros_grupo').select('*').in('grupo_id', idsGrupos);
          setMiembros(mDirect || []);
        } else {
          setMiembros([]);
        }
      } else {
        setMiembros(miembrosData || []);
      }

      setMisGuias(guiasData || []);
      setGrupos(gruposData || []);
    } catch (e) {
      console.log('Error cargar panel supervisor:', e);
    }
    setCargando(false);
  }, [perfil.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  const stats = useMemo(() => {
    return {
      totalGuias: misGuias.length,
      totalGVs: grupos.length,
      totalMiembros: miembros.length,
    };
  }, [misGuias, grupos, miembros]);

  if (cargando) return <Cargando texto="Cargando mi equipo..." />;

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      >
        <TituloGrande titulo="Panel Supervisor" />
        <AlertasFaltas minimo={2} />
        <Text style={s.textoFilaSec}>
          {perfil.nombre} · {stats.totalGuias} guías a cargo · {stats.totalMiembros} miembros totales
        </Text>

        <View style={[s.fila, { gap: 10, marginTop: 16 }]}>
          <Stat etiqueta="Guías" valor={String(stats.totalGuias)} icono="people" color={colors.primary} />
          <Stat etiqueta="GVs" valor={String(stats.totalGVs)} icono="home" color={colors.success} />
        </View>
        <View style={[s.fila, { gap: 10, marginTop: 10 }]}>
          <Stat etiqueta="Miembros" valor={String(stats.totalMiembros)} icono="person" color={colors.primary} />
          <Stat etiqueta="Activos" valor={String(miembros.filter((m:any)=> m.activo).length)} icono="checkmark" color={colors.success} />
        </View>

        {misGuias.map((guia) => {
          const gvs = grupos.filter((g) => g.guia_id === guia.id);
          return (
            <View key={guia.id} style={{ marginTop: 20 }}>
              <SeccionTitulo titulo={`${guia.nombre} ${guia.apellido || ''}`} />
              <Text style={s.textoFilaSec}>{gvs.length} GVs</Text>
              {gvs.map((gv) => {
                const mGV = miembros.filter((m) => m.grupo_id === gv.id);
                return (
                  <Card key={gv.id} style={{ marginTop: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{gv.nombre}</Text>
                    <Text style={s.textoFilaSec}>{mGV.length} miembros</Text>
                    {mGV.length > 0 && (
                      <Text style={[s.textoFilaSec, { marginTop: 4, fontSize: 12 }]}>
                        {mGV.map((m:any)=> m.nombre).join(', ')}
                      </Text>
                    )}
                  </Card>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </Pantalla>
  );
}