import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, esTemaOscuro, radius, temaVersion, tipo } from '@/lib/theme';
import { diaCorto, formatoFecha, hoyISO, iniciales, sumarDias } from '@/lib/utils';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** false = la pantalla no agrega margen arriba (porque ya lo puso algo encima, como el modo dev) */
export const BordeSuperiorContext = React.createContext(true);

// ---------- Estructura ----------

export function Pantalla({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const conBorde = React.useContext(BordeSuperiorContext);
  return (
    <SafeAreaView edges={conBorde ? ['top'] : []} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function TituloGrande({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <View style={{ marginBottom: 18, marginTop: 4 }}>
      {subtitulo ? <Text style={s.subtituloGrande}>{subtitulo}</Text> : null}
      <Text style={s.tituloGrande}>{titulo}</Text>
    </View>
  );
}

export function SeccionTitulo({
  titulo,
  accion,
}: {
  titulo: string;
  accion?: { texto: string; onPress: () => void; icono?: IconName };
}) {
  return (
    <View style={s.seccion}>
      <Text style={s.seccionTexto}>{titulo}</Text>
      {accion ? (
        <Pressable onPress={accion.onPress} hitSlop={10} style={s.fila}>
          {accion.icono ? <Ionicons name={accion.icono} size={18} color={colors.primary} style={{ marginRight: 4 }} /> : null}
          <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '500' }}>{accion.texto}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [s.card, style, pressed && { opacity: 0.7 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

// ---------- Controles ----------

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  cargando,
  deshabilitado,
  icono,
  compacto,
  style,
}: {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'peligro' | 'texto';
  cargando?: boolean;
  deshabilitado?: boolean;
  icono?: IconName;
  compacto?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // Jerarquía: primario (relleno) > secundario (suave) > texto (sin fondo)
  const fondo =
    variante === 'primario'
      ? colors.primary
      : variante === 'peligro'
        ? colors.dangerBg
        : variante === 'texto'
          ? 'transparent'
          : colors.primaryBg;
  const texto = variante === 'primario' ? '#FFFFFF' : variante === 'peligro' ? colors.danger : colors.primary;
  const inactivo = !!deshabilitado || !!cargando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        s.boton,
        compacto && s.botonCompacto,
        { backgroundColor: fondo, opacity: inactivo ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={texto} />
      ) : (
        <>
          {icono ? <Ionicons name={icono} size={compacto ? 16 : 18} color={texto} style={{ marginRight: 6 }} /> : null}
          <Text style={[s.botonTexto, compacto && { fontSize: tipo.chico + 1 }, { color: texto }]}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Campo({ etiqueta, ayuda, style, ...props }: TextInputProps & { etiqueta?: string; ayuda?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {etiqueta ? <Text style={s.etiqueta}>{etiqueta}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textTer}
        selectionColor={colors.primary}
        keyboardAppearance={esTemaOscuro() ? "dark" : "light"}
        style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }, style]}
        {...props}
      />
      {ayuda ? <Text style={s.ayuda}>{ayuda}</Text> : null}
    </View>
  );
}

export function Segmentado({
  opciones,
  valor,
  onChange,
}: {
  opciones: string[];
  valor: number;
  onChange: (indice: number) => void;
}) {
  return (
    <View style={s.segmentado}>
      {opciones.map((opcion, i) => (
        <Pressable key={opcion} onPress={() => onChange(i)} style={[s.segmento, valor === i && s.segmentoActivo]}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[s.segmentoTexto, valor === i && { color: colors.text, fontWeight: '600' }]}
          >
            {opcion}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Chip({
  texto,
  activo,
  onPress,
  onLongPress,
  icono,
  color = colors.primary,
}: {
  texto: string;
  activo?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  icono?: IconName;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[s.chip, activo && { backgroundColor: color, borderColor: color }]}
    >
      {icono ? <Ionicons name={icono} size={14} color={activo ? '#FFFFFF' : colors.textSec} style={{ marginRight: 5 }} /> : null}
      <Text style={[s.chipTexto, activo && { color: '#FFFFFF' }]}>{texto}</Text>
    </Pressable>
  );
}

export function SelectorFecha({ valor, onChange }: { valor: string; onChange: (iso: string) => void }) {
  const hoy = hoyISO();
  const esHoy = valor === hoy;
  return (
    <View style={s.selectorFecha}>
      <Pressable onPress={() => onChange(sumarDias(valor, -1))} hitSlop={10} style={s.flechaFecha}>
        <Ionicons name="chevron-back" size={22} color={colors.primary} />
      </Pressable>
      <Pressable onPress={() => onChange(hoy)} style={{ alignItems: 'center', flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
          {esHoy ? 'Hoy' : diaCorto(valor)} {formatoFecha(valor)}
        </Text>
        {!esHoy ? <Text style={{ color: colors.primary, fontSize: 12, marginTop: 2 }}>Volver a hoy</Text> : null}
      </Pressable>
      <Pressable onPress={() => onChange(sumarDias(valor, 1))} hitSlop={10} style={s.flechaFecha}>
        <Ionicons name="chevron-forward" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

// ---------- Datos ----------

export function BarraProgreso({ valor, color = colors.primary, alto = 6 }: { valor: number; color?: string; alto?: number }) {
  const p = Math.max(0, Math.min(1, isFinite(valor) ? valor : 0));
  return (
    <View style={{ height: alto, borderRadius: alto / 2, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${p * 100}%`, height: '100%', backgroundColor: color, borderRadius: alto / 2 }} />
    </View>
  );
}

export function Stat({
  etiqueta,
  valor,
  icono,
  color = colors.primary,
  style,
}: {
  etiqueta: string;
  valor: string;
  icono: IconName;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.card, { flex: 1, marginBottom: 0 }, style]}>
      <View style={[s.statIcono, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icono} size={18} color={color} />
      </View>
      <Text style={s.statValor} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={s.statEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

export function Badge({ texto, color = colors.primary }: { texto: string; color?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: `${color}26` }]}>
      <Text style={[s.badgeTexto, { color }]}>{texto}</Text>
    </View>
  );
}

export function Avatar({ nombre, color = colors.primary, tamano = 40 }: { nombre: string; color?: string; tamano?: number }) {
  return (
    <View
      style={{
        width: tamano,
        height: tamano,
        borderRadius: tamano / 2,
        backgroundColor: `${color}2E`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontWeight: '700', fontSize: tamano * 0.38 }}>{iniciales(nombre)}</Text>
    </View>
  );
}

// ---------- Estados ----------

export function Cargando({ texto }: { texto?: string }) {
  return (
    <View style={s.centro}>
      <ActivityIndicator color={colors.textSec} size="large" />
      {texto ? <Text style={[s.textoSec, { marginTop: 12 }]}>{texto}</Text> : null}
    </View>
  );
}

export function Vacio({
  icono = 'file-tray-outline',
  titulo,
  texto,
  children,
}: {
  icono?: IconName;
  titulo: string;
  texto?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={s.vacio}>
      <Ionicons name={icono} size={42} color={colors.textTer} />
      <Text style={s.vacioTitulo}>{titulo}</Text>
      {texto ? <Text style={s.vacioTexto}>{texto}</Text> : null}
      {children ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}

// ---------- Hoja modal (estilo iOS) ----------

export function HojaModal({
  visible,
  onClose,
  titulo,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.card }}>
        <View style={s.hojaHeader}>
          <View style={s.hojaAgarre} />
          <View style={s.hojaFila}>
            <Text style={s.hojaTitulo} numberOfLines={1}>
              {titulo}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.primary, fontSize: 17 }}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function crearEstilos() {
  return StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center' },
  tituloGrande: { color: colors.text, fontSize: tipo.titulo, fontWeight: '800', letterSpacing: -0.6, lineHeight: 34 },
subtituloGrande: { color: colors.textSec, fontSize: 15, fontWeight: '600', marginBottom: 4, letterSpacing: -0.2 },
  seccion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  seccionTexto: { color: colors.text, fontSize: tipo.h2, fontWeight: '700' },
   card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.cardAlt,
  },
  boton: {
    height: 46,
    borderRadius: radius.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  botonCompacto: { height: 36, paddingHorizontal: 14, borderRadius: radius.sm },
  botonTexto: { fontSize: tipo.h3, fontWeight: '600' },
  etiqueta: { color: colors.textSec, fontSize: 13, marginBottom: 6, marginLeft: 4 },
  ayuda: { color: colors.textSec, fontSize: 12, marginTop: 6, marginLeft: 4 },
  input: {
    backgroundColor: colors.cardAlt,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: tipo.h3,
  },
  segmentado: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 3,
    marginVertical: 14,
  },
  segmento: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  segmentoActivo: { backgroundColor: colors.cardAlt },
  segmentoTexto: { color: colors.textSec, fontSize: 14, fontWeight: '500' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipTexto: { color: colors.textSec, fontSize: 14, fontWeight: '500' },
  selectorFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  flechaFecha: { padding: 6 },
  statIcono: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValor: { color: colors.text, fontSize: 21, fontWeight: '700' },
  statEtiqueta: { color: colors.textSec, fontSize: tipo.chico, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: colors.bg },
  textoSec: { color: colors.textSec, fontSize: 15 },
  vacio: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  vacioTitulo: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  vacioTexto: { color: colors.textSec, fontSize: 15, marginTop: 6, textAlign: 'center', lineHeight: 21 },
  hojaHeader: { paddingTop: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  hojaAgarre: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textTer,
    alignSelf: 'center',
    marginBottom: 8,
  },
  hojaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  hojaTitulo: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1, marginRight: 12 },
  filaLista: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  textoFila: { color: colors.text, fontSize: tipo.cuerpo + 1, fontWeight: '500' },
  textoFilaSec: { color: colors.textSec, fontSize: 13, marginTop: 2 },
  });
}

let estilos = crearEstilos();
let versionEstilos = temaVersion();

/** Estilos compartidos; se regeneran solos cuando cambia el tema */
export const s = new Proxy({} as ReturnType<typeof crearEstilos>, {
  get(_, clave: string) {
    if (versionEstilos !== temaVersion()) {
      estilos = crearEstilos();
      versionEstilos = temaVersion();
    }
    return (estilos as Record<string, unknown>)[clave];
  },
});

// ---------- Pasos de consolidación ----------

const PASOS: { clave: string; texto: string }[] = [
  { clave: 'fonovisita', texto: 'Fono' },
  { clave: 'visita', texto: 'Visita' },
  { clave: 'pilares', texto: 'Pilares' },
  { clave: 'comenzo_gv', texto: 'GV' },
  { clave: 'encuentro', texto: 'Encuentro' },
];

/** Barra de avance: cinco puntos conectados, rellenos hasta donde llegó la persona. */
export function PasosConsolidacion({ tarjeta }: { tarjeta: Record<string, any> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
      {PASOS.map((p, i) => {
        const hecho = !!tarjeta[p.clave];
        const siguienteHecho = i < PASOS.length - 1 && !!tarjeta[PASOS[i + 1].clave];
        return (
          <View key={p.clave} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : hecho ? colors.success : colors.border }} />
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hecho ? colors.success : colors.card,
                  borderWidth: 2,
                  borderColor: hecho ? colors.success : colors.border,
                }}
              >
                {hecho ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
              </View>
              <View
                style={{
                  flex: 1,
                  height: 2,
                  backgroundColor: i === PASOS.length - 1 ? 'transparent' : siguienteHecho ? colors.success : colors.border,
                }}
              />
            </View>
            <Text style={{ fontSize: tipo.mini, marginTop: 4, color: hecho ? colors.success : colors.textSec, fontWeight: hecho ? '700' : '500' }}>
              {p.texto}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
