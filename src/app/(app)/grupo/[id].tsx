import React, { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Grupo } from '@/lib/types';
import { Vacio } from '@/components/ui';
import { GrupoDetalle } from '@/components/grupo/GrupoDetalle';

export default function GrupoPantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [titulo, setTitulo] = useState('Grupo');

  if (!id) return <Vacio icono="alert-circle-outline" titulo="Grupo no encontrado" />;

  return (
    <>
      <Stack.Screen options={{ title: titulo }} />
      <GrupoDetalle grupoId={id} onCargado={(g: Grupo) => setTitulo(g.nombre)} />
    </>
  );
}
