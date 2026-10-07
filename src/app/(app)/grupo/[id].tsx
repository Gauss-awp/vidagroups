import React, { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { Grupo } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Cargando, Vacio } from '@/components/ui';
import { GrupoDetalle } from '@/components/grupo/GrupoDetalle';

export default function GrupoPantalla() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { perfil } = useAuth();
  const [titulo, setTitulo] = useState('Grupo');
  // Los pastores acompañan a los supervisores en persona: ven estadísticas, no entran a los grupos
  const [permitido, setPermitido] = useState<boolean | null>(perfil?.rol === 'pastor' ? null : true);

  useEffect(() => {
    if (!id || perfil?.rol !== 'pastor') return;
    supabase
      .from('groups')
      .select('guia_id, supervisor_id')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setPermitido(!!data && (data.guia_id === perfil.id || data.supervisor_id === perfil.id)));
  }, [id, perfil]);

  if (!id) return <Vacio icono="alert-circle-outline" titulo="Grupo no encontrado" />;
  if (permitido === null) return <Cargando />;
  if (!permitido) {
    return (
      <>
        <Stack.Screen options={{ title: 'Grupo' }} />
        <Vacio
          icono="people-outline"
          titulo="Este grupo lo acompaña su Guía Supervisor"
          texto="Desde tu panel ves cómo vienen los grupos. Para lo demás, lo mejor es hablarlo en persona con el supervisor."
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: titulo }} />
      <GrupoDetalle grupoId={id} onCargado={(g: Grupo) => setTitulo(g.nombre)} />
    </>
  );
}
