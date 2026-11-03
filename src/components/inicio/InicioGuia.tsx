import React, { useCallback, useEffect, useState } from 'react';
import {ScrollView, View, Text } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Grupo, Perfil } from '@/lib/types';
import { Cargando, Chip, Pantalla, TituloGrande, Card } from '@/components/ui';
import { GrupoDetalle } from '@/components/grupo/GrupoDetalle';
import { CrearGrupo } from '@/components/grupo/CrearGrupo';
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
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }}>Todavía no tenés un grupo</Text>
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
              Si tu grupo ya existe y lo guiás junto con otra persona, no lo crees de nuevo: pedile a ella (o a los encargados) que te sume desde
              "Equipo" en el grupo. Cuando te sumen, cerrá y abrí la app.
            </Text>
            <Text style={{ color: colors.textSec, fontSize: 14, lineHeight: 20, marginTop: 8 }}>Si sos quien abre el grupo, crealo acá abajo.</Text>
          </Card>
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
