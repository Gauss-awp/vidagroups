import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import type { Grupo, Perfil } from '@/lib/types';
import { Cargando, Chip, Pantalla, TituloGrande } from '@/components/ui';
import { GrupoDetalle } from '@/components/grupo/GrupoDetalle';
import { CrearGrupo } from '@/components/grupo/CrearGrupo';
import { BotonReporte } from '@/components/reporte/BotonReporte';
import { esErrorDeRed, guardarCache, leerCache } from '@/lib/sinConexion';

export function InicioGuia({ perfil }: { perfil: Perfil }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('groups').select('*').eq('guia_id', perfil.id).order('creado_en');
    let lista = (data ?? []) as Grupo[];
    if (error) {
      if (esErrorDeRed(error)) lista = (await leerCache<Grupo[]>(`grupos:${perfil.id}`)) ?? [];
      else Alert.alert('Error', error.message);
    } else {
      guardarCache(`grupos:${perfil.id}`, lista);
    }
    setGrupos(lista);
    setSeleccionado((prev) => (prev && lista.some((g) => g.id === prev) ? prev : lista[0]?.id ?? null));
    setCargando(false);
  }, [perfil.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const saludo = `Hola, ${perfil.nombre || 'Guía'}`;

  if (cargando) return <Cargando />;

  if (grupos.length === 0) {
    return (
      <Pantalla>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <TituloGrande titulo="Mi Grupo" subtitulo={saludo} />
          <CrearGrupo guiaId={perfil.id} onCreado={cargar} />
        </ScrollView>
      </Pantalla>
    );
  }

  const encabezado = (
    <View>
      <TituloGrande titulo={grupos.length > 1 ? 'Mis Grupos' : 'Mi Grupo'} subtitulo={saludo} />
      <BotonReporte />
      {grupos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {grupos.map((g) => (
            <Chip key={g.id} texto={g.nombre} activo={g.id === seleccionado} onPress={() => setSeleccionado(g.id)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Pantalla>
      {seleccionado ? <GrupoDetalle key={seleccionado} grupoId={seleccionado} encabezado={encabezado} /> : null}
    </Pantalla>
  );
}
