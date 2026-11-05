// ---------------------------------------------------------------------
// Gráficos del Centro de Eventos (estilo tablero): indicadores, dona,
// barras por grupo y curva de recaudación. Dibujados con SVG, así se ven
// igual en Android, iPhone y la web.
// ---------------------------------------------------------------------
import React, { useState } from 'react';
import { LayoutChangeEvent, Platform, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

// Misma letra que el resto de la app (en la web el SVG usaría una letra con serifa)
const LETRA = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' : undefined;

export const PALETA = {
  pagado: '#16A34A',
  cuotas: '#F59E0B',
  sinPagar: '#DC2626',
  meta: '#94A3B8',
  azul: '#2563EB',
  violeta: '#7C3AED',
  celeste: '#0EA5E9',
};

/** Tarjeta de indicador (KPI) */
export function Kpi({
  titulo,
  valor,
  detalle,
  icono,
  color = colors.primary,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  icono: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '46%',
        backgroundColor: colors.card,
        borderRadius: 14,
        padding: 14,
        borderWidth: 0.5,
        borderColor: colors.border,
        borderTopWidth: 3,
        borderTopColor: color,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Ionicons name={icono} size={15} color={color} />
        <Text style={{ color: colors.textSec, fontSize: 11, fontWeight: '700', marginLeft: 6, letterSpacing: 0.4 }}>{titulo.toUpperCase()}</Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      {detalle ? <Text style={{ color: colors.textSec, fontSize: 12, marginTop: 2 }}>{detalle}</Text> : null}
    </View>
  );
}

/** Dona con segmentos y un texto en el centro */
export function Dona({
  segmentos,
  centro,
  subcentro,
  tamano = 170,
}: {
  segmentos: { valor: number; color: string; etiqueta: string }[];
  centro: string;
  subcentro?: string;
  tamano?: number;
}) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  const r = tamano / 2 - 14;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
      <Svg width={tamano} height={tamano}>
        <G rotation={-90} origin={`${tamano / 2}, ${tamano / 2}`}>
          <Circle cx={tamano / 2} cy={tamano / 2} r={r} stroke={colors.cardAlt} strokeWidth={22} fill="none" />
          {total > 0
            ? segmentos.map((s, i) => {
                const largo = (s.valor / total) * c;
                const el = (
                  <Circle
                    key={i}
                    cx={tamano / 2}
                    cy={tamano / 2}
                    r={r}
                    stroke={s.color}
                    strokeWidth={22}
                    fill="none"
                    strokeDasharray={`${Math.max(0, largo - 2)} ${c}`}
                    strokeDashoffset={-acumulado}
                  />
                );
                acumulado += largo;
                return el;
              })
            : null}
        </G>
        <SvgText fontFamily={LETRA} x={tamano / 2} y={tamano / 2 + 2} fontSize={26} fontWeight="800" fill={colors.text} textAnchor="middle">
          {centro}
        </SvgText>
        {subcentro ? (
          <SvgText fontFamily={LETRA} x={tamano / 2} y={tamano / 2 + 22} fontSize={11} fill={colors.textSec} textAnchor="middle">
            {subcentro}
          </SvgText>
        ) : null}
      </Svg>
      <View style={{ gap: 8, flexShrink: 1 }}>
        {segmentos.map((s) => (
          <View key={s.etiqueta} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: s.color, marginRight: 8 }} />
            <Text style={{ color: colors.text, fontSize: 13 }}>
              {s.etiqueta}{' '}
              <Text style={{ color: colors.textSec }}>
                · {s.valor}
                {total ? ` (${Math.round((s.valor / total) * 100)}%)` : ''}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Barras horizontales: lo recaudado contra lo esperado de cada fila (por ejemplo, por grupo) */
export function BarrasH({
  filas,
  formato,
  colorFijo,
}: {
  filas: { etiqueta: string; valor: number; meta?: number; detalle?: string }[];
  formato: (n: number) => string;
  /** Un solo color para todas las barras (si no, verde/amarillo/rojo según el avance) */
  colorFijo?: string;
}) {
  const max = Math.max(1, ...filas.map((f) => Math.max(f.valor, f.meta ?? 0)));
  return (
    <View style={{ gap: 12 }}>
      {filas.map((f) => {
        const pct = f.meta ? Math.min(1, f.valor / f.meta) : 0;
        const color = colorFijo ? colorFijo : !f.meta ? PALETA.azul : pct >= 1 ? PALETA.pagado : pct >= 0.5 ? PALETA.cuotas : PALETA.sinPagar;
        return (
          <View key={f.etiqueta}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {f.etiqueta}
              </Text>
              <Text style={{ color: colors.textSec, fontSize: 12 }}>
                {formato(f.valor)}
                {f.meta ? ` / ${formato(f.meta)}` : ''}
              </Text>
            </View>
            <View style={{ height: 14, borderRadius: 7, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
              {f.meta ? (
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(f.meta / max) * 100}%`, backgroundColor: colors.border, borderRadius: 7 }} />
              ) : null}
              <View style={{ width: `${(f.valor / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 7 }} />
            </View>
            {f.detalle ? <Text style={{ color: colors.textTer, fontSize: 11, marginTop: 3 }}>{f.detalle}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Curva de recaudación acumulada en el tiempo, con la línea de la meta */
export function CurvaRecaudacion({
  puntos,
  meta,
  formato,
  alto = 190,
}: {
  puntos: { fecha: string; total: number }[];
  meta?: number;
  formato: (n: number) => string;
  alto?: number;
}) {
  const [ancho, setAncho] = useState(320);
  const onLayout = (e: LayoutChangeEvent) => setAncho(Math.max(200, e.nativeEvent.layout.width));
  if (puntos.length === 0) {
    return (
      <View onLayout={onLayout} style={{ height: 80, justifyContent: 'center' }}>
        <Text style={{ color: colors.textSec, fontSize: 13 }}>Todavía no hay pagos registrados.</Text>
      </View>
    );
  }
  const izq = 8;
  const der = 8;
  const arriba = 18;
  const abajo = 22;
  const w = ancho - izq - der;
  const h = alto - arriba - abajo;
  const tiempos = puntos.map((p) => new Date(`${p.fecha}T12:00:00`).getTime());
  const t0 = Math.min(...tiempos);
  const t1 = Math.max(...tiempos);
  const max = Math.max(1, meta ?? 0, ...puntos.map((p) => p.total)) * 1.08;
  const x = (t: number) => izq + (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w);
  const y = (v: number) => arriba + h - (v / max) * h;
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(tiempos[i]).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(tiempos[tiempos.length - 1]).toFixed(1)},${(arriba + h).toFixed(1)} L${x(tiempos[0]).toFixed(1)},${(arriba + h).toFixed(1)} Z`;
  const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const ultimo = puntos[puntos.length - 1];

  return (
    <View onLayout={onLayout}>
      <Svg width={ancho} height={alto}>
        <Defs>
          <LinearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PALETA.azul} stopOpacity={0.35} />
            <Stop offset="1" stopColor={PALETA.azul} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Line key={f} x1={izq} x2={izq + w} y1={arriba + h - f * h} y2={arriba + h - f * h} stroke={colors.border} strokeWidth={0.5} />
        ))}
        {meta ? (
          <>
            <Line x1={izq} x2={izq + w} y1={y(meta)} y2={y(meta)} stroke={PALETA.meta} strokeWidth={1.5} strokeDasharray="5 4" />
            <SvgText fontFamily={LETRA} x={izq + w} y={y(meta) - 5} fontSize={10} fill={colors.textSec} textAnchor="end">
              Meta {formato(meta)}
            </SvgText>
          </>
        ) : null}
        <Path d={area} fill="url(#relleno)" />
        <Path d={linea} stroke={PALETA.azul} strokeWidth={2.5} fill="none" />
        <Circle cx={x(tiempos[tiempos.length - 1])} cy={y(ultimo.total)} r={4.5} fill={PALETA.azul} stroke={colors.card} strokeWidth={2} />
        <SvgText fontFamily={LETRA} x={izq} y={alto - 6} fontSize={10} fill={colors.textSec}>
          {fmt(puntos[0].fecha)}
        </SvgText>
        <SvgText fontFamily={LETRA} x={izq + w} y={alto - 6} fontSize={10} fill={colors.textSec} textAnchor="end">
          {fmt(ultimo.fecha)}
        </SvgText>
      </Svg>
    </View>
  );
}

/** Barra de progreso fina, con color según el avance */
export function Progreso({ pct, alto = 6 }: { pct: number; alto?: number }) {
  const color = pct >= 1 ? PALETA.pagado : pct > 0 ? PALETA.cuotas : PALETA.sinPagar;
  return (
    <View style={{ height: alto, borderRadius: alto / 2, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(pct > 0 ? 3 : 0, pct * 100))}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

// Para que Rect no quede sin usar en algunos entornos
export const _RectSvg = Rect;
