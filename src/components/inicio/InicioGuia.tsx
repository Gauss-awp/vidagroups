import React, { useCallback, useEffect, useState } from 'react';
import {ScrollView, View, Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Grupo, Perfil } from '@/lib/types';
import { Cargando, Chip, Pantalla, TituloGrande, Card } from '@/components/ui';
import { GrupoDetalle } from '@/components/grupo/GrupoDetalle';
import { BotonReporte } from '@/components/reporte/BotonReporte';
import { esErrorDeRed, guardarCache, leerCache } from '@/lib/sinConexion';
import { alerta } from '@/lib/alerta';

export function InicioGuia({ perfil }: { perfil: Perfil }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data: co } = await supabase.from('grupo_guias').select('grupo_id').eq('guia_id', perfil.id);
    const idsCo = ((co ?? []) as { grupo_id: string }[]).map((x) => x.grupo_id);
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .or(idsCo.length ? `guia_id.eq.${perfil.id},id.in.(${idsCo.join(',')})` : `guia_id.eq.${perfil.id}`)
      .order('creado_en');
    let lista = (data ?? []) as Grupo[];
    if (error) {
      if (esErrorDeRed(error)) lista = (await leerCache<Grupo[]>(`grupos:${perfil.id}`)) ?? [];
      else alerta('Error', error.message);
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
          <Card style={{ backgroundColor: colors.primaryBg }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>Todavía no tenés un grupo asignado</Text>
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
              Tu Guía Supervisor o los encargados de tu red te van a sumar a tu grupo (o lo van a crear, si es nuevo). Cuando lo hagan, tirá hacia abajo para actualizar.
            </Text>
          </Card>
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
