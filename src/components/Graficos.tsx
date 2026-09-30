import React from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { colors, radius } from '@/lib/theme';
import { abreviarNumero } from '@/lib/utils';

// Pantalla con padding 16 a cada lado; la tarjeta del gráfico no tiene padding horizontal
const ANCHO_BASE = Dimensions.get('window').width - 32;

function recortar(texto: string, max = 9): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

function configuracion(rgb: string) {
  return {
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    backgroundGradientFromOpacity: 1,
    backgroundGradientToOpacity: 1,
    fillShadowGradientFrom: `rgb(${rgb})`,
    fillShadowGradientFromOpacity: 1,
    fillShadowGradientTo: `rgb(${rgb})`,
    fillShadowGradientToOpacity: 0.55,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(${rgb}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(142, 142, 147, ${opacity})`,
    barPercentage: 0.6,
    propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '4 6' },
    propsForLabels: { fontSize: 10 },
    formatYLabel: (v: string) => abreviarNumero(Number(v)),
  };
}

interface DatosGrafico {
  etiquetas: string[];
  valores: number[];
}

function GraficoBarras({
  etiquetas,
  valores,
  rgb,
  prefijo = '',
  sufijo = '',
  mostrarValores = false,
  textoVacio,
}: DatosGrafico & { rgb: string; prefijo?: string; sufijo?: string; mostrarValores?: boolean; textoVacio: string }) {
  const hayDatos = valores.some((v) => v > 0);
  if (!hayDatos) {
    return (
      <View style={{ paddingVertical: 36, alignItems: 'center' }}>
        <Text style={{ color: colors.textSec, fontSize: 14 }}>{textoVacio}</Text>
      </View>
    );
  }

  const ancho = Math.max(ANCHO_BASE, etiquetas.length * 64);
  const grafico = (
    <BarChart
      data={{ labels: etiquetas.map((e) => recortar(e)), datasets: [{ data: valores }] }}
      width={ancho}
      height={220}
      yAxisLabel={prefijo}
      yAxisSuffix={sufijo}
      fromZero
      showValuesOnTopOfBars={mostrarValores}
      withInnerLines
      chartConfig={configuracion(rgb)}
      style={{ borderRadius: radius.md }}
    />
  );

  if (ancho > ANCHO_BASE) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {grafico}
      </ScrollView>
    );
  }
  return grafico;
}

export function TarjetaGrafico({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.md, paddingTop: 16, marginBottom: 10, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{titulo}</Text>
        {subtitulo ? <Text style={{ color: colors.textSec, fontSize: 13, marginTop: 2 }}>{subtitulo}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function GraficoHabitos(props: DatosGrafico) {
  return (
    <GraficoBarras {...props} rgb="48, 209, 88" sufijo="%" mostrarValores textoVacio="Sin registros de hábitos en este período" />
  );
}

export function GraficoRecaudacion(props: DatosGrafico) {
  return <GraficoBarras {...props} rgb="10, 132, 255" prefijo="$" textoVacio="Todavía no hay pagos registrados" />;
}
