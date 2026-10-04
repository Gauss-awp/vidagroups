import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { Boton, Campo, Card, Chip, HojaModal, Pantalla, TituloGrande, Vacio, s } from '@/components/ui';
import { Aprobaciones } from '@/components/red/Aprobaciones';
import { BotonReporte } from '@/components/reporte/BotonReporte';
import { ResponsablesRed } from '@/components/red/ResponsablesRed';
import { Importador } from '@/components/red/Importador';
import { Exportador } from '@/components/red/Exportador';
import { EquipoDesdePlanilla } from '@/components/red/EquipoDesdePlanilla';
import { PanelBalance } from '@/components/mision_joven/PanelBalance';
import { GestionGrupos } from '@/components/mision_joven/GestionGrupos';
import { AsignarSupervisores } from '@/components/mision_joven/AsignarSupervisores';

/** Panel del Encargado de Red (también lo usan Pastores y el Apóstol). */
export default function PanelRed() {
  const { perfil, redesAdmin, refrescarPerfil } = useAuth();
  const [redSel, setRedSel] = useState<string | null>(redesAdmin[0]?.id ?? null);
  const [tarjetas, setTarjetas] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const [modalRed, setModalRed] = useState(false);
  const [nombreRed, setNombreRed] = useState('');
  const [creando, setCreando] = useState(false);

  const esPastorOApostol = perfil?.rol === 'pastor' || perfil?.rol === 'apostol';
  const red = redesAdmin.find((r) => r.id === redSel) ?? redesAdmin[0] ?? null;

  useEffect(() => {
    if (!redSel || !redesAdmin.some((r) => r.id === redSel)) setRedSel(redesAdmin[0]?.id ?? null);
  }, [redesAdmin, redSel]);

  const cargarTarjetas = useCallback(async () => {
    if (!red) return;
    const { data } = await supabase
      .from('tarjetas_consolidacion')
      .select('*')
      .eq('red_id', red.id)
      .order('creado_en', { ascending: false })
      .limit(500);
    setTarjetas(data ?? []);
  }, [red]);

  useEffect(() => {
    cargarTarjetas();
  }, [cargarTarjetas, refreshKey]);

  const refrescar = async () => {
    setRefrescando(true);
    await refrescarPerfil();
    setRefreshKey((k) => k + 1);
    setRefrescando(false);
  };

  const crearRed = async () => {
    if (!nombreRed.trim()) {
      Alert.alert('Falta el nombre', 'Escribí el nombre de la red.');
      return;
    }
    setCreando(true);
    const { error } = await supabase.from('redes').insert({ nombre: nombreRed.trim() });
    setCreando(false);
    if (error) {
      Alert.alert('No se pudo crear la red', error.message.includes('duplicate') ? 'Ya existe una red con ese nombre.' : error.message);
      return;
    }
    setNombreRed('');
    setModalRed(false);
    await refrescarPerfil();
  };

  if (!red) {
    return (
      <Pantalla>
        <Vacio icono="git-network-outline" titulo="No administrás ninguna red" texto="Un Pastor te tiene que designar como encargado de una red." />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <ScrollView
        key={red.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={colors.textSec} />}
      >
        <TituloGrande titulo={red.nombre} subtitulo={redesAdmin.length > 1 ? 'Redes que administrás' : 'Tu red'} />
        <BotonReporte />

        {redesAdmin.length > 1 || esPastorOApostol ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {redesAdmin.map((r) => (
              <Chip key={r.id} texto={r.nombre} activo={r.id === red.id} onPress={() => setRedSel(r.id)} />
            ))}
            {esPastorOApostol ? <Chip texto="Nueva red" icono="add" onPress={() => setModalRed(true)} /> : null}
          </ScrollView>
        ) : null}

        <Aprobaciones key={`ap-${refreshKey}`} redId={red.id} />

        <PanelBalance tarjetas={tarjetas} redId={red.id} puedeGeneral={esPastorOApostol} />

        <GestionGrupos key={`gg-${refreshKey}`} redId={red.id} redNombre={red.nombre} />

        <AsignarSupervisores key={`as-${refreshKey}`} redId={red.id} redNombre={red.nombre} />

        <EquipoDesdePlanilla key={`eq-${refreshKey}`} redId={red.id} redNombre={red.nombre} onCambio={() => setRefreshKey((k) => k + 1)} />

        <ResponsablesRed key={`rr-${refreshKey}`} redId={red.id} onCambio={refrescarPerfil} />

        <Importador redId={red.id} redNombre={red.nombre} onImportado={() => setRefreshKey((k) => k + 1)} />
        <Exportador redId={red.id} redNombre={red.nombre} />

        <View style={{ height: 24 }} />
        <Card style={{ backgroundColor: colors.cardAlt }}>
          <Text style={s.textoFilaSec}>
            Deslizá hacia abajo para actualizar. Los cambios de rol y de encargados se aplican cuando la otra persona actualiza su app.
          </Text>
        </Card>
      </ScrollView>

      <HojaModal visible={modalRed} onClose={() => setModalRed(false)} titulo="Nueva red">
        <Campo etiqueta="Nombre de la red" placeholder="Ej: Red de Matrimonios" value={nombreRed} onChangeText={setNombreRed} autoFocus />
        <Boton titulo="Crear red" onPress={crearRed} cargando={creando} />
      </HojaModal>
    </Pantalla>
  );
}
