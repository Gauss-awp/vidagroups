import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Card } from '../ui';
import EventosMisionJoven from './EventosMisionJoven';
import { colors } from '@/lib/theme';
type Props = {
  tarjetas: any[];
  redId: string;
  puedeGeneral?: boolean;
}

export function PanelBalance({ tarjetas = [], redId, puedeGeneral = false }: Props) {
  const stats = useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const delMes = tarjetas.filter((t: any) => t.creado_en && new Date(t.creado_en) >= inicioMes);
    const base = delMes.length > 0? delMes : tarjetas;

    const nuevas = delMes.length;
    const fonovisita = base.filter((t: any) => t.fonovisita === true || t.fono_visita === true).length;
    const visita = base.filter((t: any) => t.visita === true).length;
    const pilares = base.filter((t: any) => t.pilares === true).length;
    const comenzoGV = base.filter((t: any) => t.comenzo_gv === true || t.comenzó_gv === true || t.comenzoGV === true).length;
    const encuentro = base.filter((t: any) => t.encuentro === true).length;
    const completadasMes = tarjetas.filter((t: any) => t.completada_en && new Date(t.completada_en) >= inicioMes).length;
    const vaIglesia = base.filter((t: any) => t.va_a_la_iglesia === true || t.va_iglesia === true).length;

    const sinFonovisita3d = tarjetas.filter((t: any) => {
      const tieneFono = t.fonovisita === true || t.fono_visita === true;
      if (tieneFono) return false;
      if (!t.creado_en) return false;
      const diff = (Date.now() - new Date(t.creado_en).getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 3;
    }).length;

    const porGV: Record<string, number> = {};
    base.forEach((t: any) => {
      const gv = t.gv_asignado_nombre || t.gv_asignado || t.grupo_nombre || 'Sin asignar';
      porGV[gv] = (porGV[gv] || 0) + 1;
    });

    return { nuevas, completadasMes, fonovisita, visita, pilares, comenzoGV, encuentro, vaIglesia, sinFonovisita3d, porGV, total: base.length };
  }, [tarjetas]);

  if (tarjetas.length === 0) {
    return (
      <View style={{ gap: 10, marginTop: 16 }}>
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: colors.text,  fontWeight: '700' }}>Balance Consolidación - Este mes</Text>
          <Text style={{ marginTop: 6, color: colors.textSec }}>Aún no hay tarjetas este mes</Text>
        </Card>
        <EventosMisionJoven redId={redId} puedeGeneral={puedeGeneral} />
      </View>
    );
  }

  const pct = (valor: number) => stats.total > 0? Math.round((valor / stats.total) * 100) : 0;

  return (
    <View style={{ gap: 10, marginTop: 16 }}>
      <Text style={{ color: colors.text,  fontSize: 16, fontWeight: '800' }}>Balance Consolidación - Este mes</Text>
      <Text style={{ fontSize: 12, color: colors.textSec }}>{stats.nuevas} nuevas este mes · {stats.total} en seguimiento · <Text style={{ color: colors.success, fontWeight: '800' }}>{stats.completadasMes} completadas este mes</Text></Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.text,  fontSize: 22, fontWeight: '800' }}>{stats.fonovisita}</Text>
          <Text style={{ fontSize: 11, color: colors.textSec }}>Fonovisita {pct(stats.fonovisita)}%</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.text,  fontSize: 22, fontWeight: '800' }}>{stats.visita}</Text>
          <Text style={{ fontSize: 11, color: colors.textSec }}>Visita {pct(stats.visita)}%</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: colors.text,  fontSize: 22, fontWeight: '800' }}>{stats.pilares}</Text>
          <Text style={{ fontSize: 11, color: colors.textSec }}>Pilares</Text>
        </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, alignItems: 'center', backgroundColor: colors.successBg }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.success }}>{stats.comenzoGV}</Text>
          <Text style={{ fontSize: 11, color: colors.success }}>Comenzó GV {pct(stats.comenzoGV)}%</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', backgroundColor: colors.primaryBg }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>{stats.encuentro}</Text>
          <Text style={{ fontSize: 11, color: colors.primary }}>Encuentro</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', backgroundColor: stats.sinFonovisita3d > 0? colors.dangerBg : colors.card }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: stats.sinFonovisita3d > 0? colors.danger : colors.text }}>{stats.sinFonovisita3d}</Text>
          <Text style={{ fontSize: 11, color: stats.sinFonovisita3d > 0? colors.danger : colors.textSec }}>Alerta +3d</Text>
        </Card>
      </View>

      <Card>
        <Text style={{ color: colors.text,  fontWeight: '700', marginBottom: 8 }}>Por GV este mes</Text>
        {Object.entries(stats.porGV).map(([gv, cant]) => (
          <View key={gv} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.cardAlt }}>
            <Text style={{ color: colors.text,  flex: 1, fontSize: 13 }}>{gv}</Text>
            <Text style={{ color: colors.text,  fontWeight: '700' }}>{cant}</Text>
          </View>
        ))}
      </Card>

      {/* AQUI VA - ABAJO DE TODO */}
      <EventosMisionJoven redId={redId} puedeGeneral={puedeGeneral} />

    </View>
  );
}