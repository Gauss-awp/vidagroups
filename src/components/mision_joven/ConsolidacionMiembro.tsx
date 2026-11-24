import React from 'react';
import { Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SelectorPilares, SelectorPosEncuentro, s } from '@/components/ui';
import { colors } from '@/lib/theme';
import { MESES, formatoFecha } from '@/lib/utils';

/**
 * Avance de consolidación de un miembro (venga o no de una tarjeta).
 * Lo que se marca acá llena solo la hoja DATOS de la planilla y, si vino
 * por una tarjeta, también se ve en la tarjeta (y al revés).
 */
export function ConsolidacionMiembro({
  miembro,
  tarjeta,
  onCambio,
}: {
  miembro: Record<string, any>;
  tarjeta: Record<string, any> | null;
  onCambio: (cambios: Record<string, unknown>) => void;
}) {
  const mesDe = (f: string | null | undefined) => {
    if (!f) return '';
    const [a, m] = f.split('-');
    return `${MESES[Number(m) - 1]?.toLowerCase() ?? ''} ${a}`;
  };

  const fila = (texto: string, valor: boolean, campo: string, detalle?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{texto}</Text>
        {detalle ? <Text style={s.textoFilaSec}>{detalle}</Text> : null}
      </View>
      <Switch value={valor} onValueChange={(v) => onCambio({ [campo]: v })} accessibilityLabel={texto} />
    </View>
  );

  return (
    <Card>
      {tarjeta ? (
        <View style={{ marginBottom: 6 }}>
          <Text style={s.textoFilaSec}>Llegó por consolidación el {formatoFecha(String(tarjeta.creado_en).slice(0, 10))}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            {[
              { k: 'fonovisita', t: 'Fonovisita' },
              { k: 'visita', t: 'Visita' },
            ].map((p) => (
              <View
                key={p.k}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: tarjeta[p.k] ? colors.successBg : colors.cardAlt,
                }}
              >
                <Ionicons name={tarjeta[p.k] ? 'checkmark' : 'close'} size={12} color={tarjeta[p.k] ? colors.success : colors.textSec} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: tarjeta[p.k] ? colors.success : colors.textSec }}>{p.t}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <SelectorPilares
        tarjeta={miembro}
        onCambio={(c) => {
          // "pilares" es solo de la tarjeta: en el miembro van los cinco por separado
          const { pilares: _todos, ...cambios } = c;
          onCambio(cambios);
        }}
      />

      {fila('Encuentro', !!miembro.encuentro, 'encuentro', miembro.encuentro ? mesDe(miembro.encuentro_en) : undefined)}

      {miembro.encuentro ? (
        <View style={{ marginTop: 2, paddingTop: 2, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          <SelectorPosEncuentro hechas={miembro.pos_encuentro ?? []} onCambio={(h) => onCambio({ pos_encuentro: h })} />
          {fila('Reencuentro', !!miembro.reencuentro, 'reencuentro', miembro.reencuentro ? mesDe(miembro.reencuentro_en) : undefined)}
        </View>
      ) : null}

      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border }}>
        {fila('Bautismo', !!miembro.bautizado, 'bautizado')}
        {fila('Sanidad interior', !!miembro.hizo_sanidad, 'hizo_sanidad')}
        {fila('Escuela de capacitación', !!miembro.en_escuela, 'en_escuela')}
      </View>

      <Text style={[s.textoFilaSec, { marginTop: 8 }]}>Esto se pasa solo a la hoja DATOS de la planilla.</Text>
    </Card>
  );
}
