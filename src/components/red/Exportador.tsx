import React, { useState } from 'react';
import { Alert } from 'react-native';
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { formatoCumple, formatoFecha, hoyISO, porcentaje, sumarDias } from '@/lib/utils';
import { Boton } from '@/components/ui';

const siNo = (v: unknown) => (v ? 'sí' : 'no');

/**
 * Exporta a Excel los miembros y las tarjetas de consolidación de una red.
 * Las primeras columnas tienen el mismo orden que la planilla de importación.
 */
export function Exportador({ redId, redNombre }: { redId: string; redNombre: string }) {
  const [trabajando, setTrabajando] = useState(false);

  const exportar = async () => {
    setTrabajando(true);
    try {
      // Grupos de la red y sus guías
      const { data: grupos } = await supabase.from('groups').select('id, nombre, guia_id').eq('red_id', redId).order('nombre');
      const listaGrupos = (grupos ?? []) as { id: string; nombre: string; guia_id: string }[];
      const idsGrupos = listaGrupos.map((g) => g.id);
      const idsGuias = [...new Set(listaGrupos.map((g) => g.guia_id))];
      const { data: guias } = idsGuias.length
        ? await supabase.from('profiles').select('id, email, nombre, apellido').in('id', idsGuias)
        : { data: [] };
      const guiaPorId = new Map((guias ?? []).map((p: any) => [p.id, p]));
      const grupoPorId = new Map(listaGrupos.map((g) => [g.id, g]));

      // Miembros y asistencia de los últimos 90 días
      const [m, re, tj] = await Promise.all([
        idsGrupos.length
          ? supabase.from('miembros_grupo').select('*').in('grupo_id', idsGrupos).eq('activo', true).order('nombre')
          : Promise.resolve({ data: [] as any[] }),
        idsGrupos.length
          ? supabase
              .from('reuniones')
              .select('grupo_id, fecha, asistencias(miembro_id, presente)')
              .in('grupo_id', idsGrupos)
              .gte('fecha', sumarDias(hoyISO(), -90))
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('tarjetas_consolidacion').select('*').eq('red_id', redId).order('creado_en', { ascending: false }),
      ]);

      const reuniones = (re.data ?? []) as { grupo_id: string; fecha: string; asistencias: { miembro_id: string; presente: boolean }[] }[];

      const filasMiembros = ((m.data ?? []) as any[]).map((mi) => {
        const grupo = grupoPorId.get(mi.grupo_id);
        const guia = grupo ? guiaPorId.get(grupo.guia_id) : null;
        const delGrupo = reuniones.filter((r) => r.grupo_id === mi.grupo_id && r.fecha >= String(mi.creado_en).slice(0, 10));
        const vino = delGrupo.filter((r) => (r.asistencias ?? []).some((a) => a.miembro_id === mi.id && a.presente)).length;
        return {
          Grupo: grupo?.nombre ?? '',
          'Correo del guía': guia?.email ?? '',
          Nombre: mi.nombre,
          Apellido: mi.apellido ?? '',
          Teléfono: mi.telefono ?? '',
          Cumpleaños: formatoCumple(mi.cumpleanos),
          Guía: guia ? `${guia.nombre ?? ''} ${guia.apellido ?? ''}`.trim() : '',
          'Reuniones (90 días)': delGrupo.length,
          'Asistió (90 días)': vino,
          'Asistencia %': delGrupo.length ? porcentaje(vino, delGrupo.length) : '',
          'Se sumó el': formatoFecha(String(mi.creado_en).slice(0, 10)),
        };
      });

      const filasTarjetas = ((tj.data ?? []) as any[]).map((t) => ({
        Nombre: t.nombre,
        Teléfono: t.telefono ?? '',
        Edad: t.edad ?? '',
        Zona: t.zona ?? '',
        Grupo: t.gv_asignado ?? '',
        Fecha: t.fecha_reu ? formatoFecha(t.fecha_reu) : '',
        Fonovisita: siNo(t.fonovisita),
        Visita: siNo(t.visita),
        Pilares: siNo(t.pilares),
        'Comenzó GV': siNo(t.comenzo_gv),
        Encuentro: siNo(t.encuentro),
        Estado: t.estado === 'completada' ? 'Completada' : 'En seguimiento',
        'Completada el': t.completada_en ? formatoFecha(String(t.completada_en).slice(0, 10)) : '',
        Observación: t.observacion ?? '',
      }));

      if (filasMiembros.length === 0 && filasTarjetas.length === 0) {
        setTrabajando(false);
        Alert.alert('No hay datos', `Todavía no hay miembros ni tarjetas en ${redNombre}.`);
        return;
      }

      // Armar el Excel con una hoja por tipo de dato
      const libro = XLSX.utils.book_new();
      const hojaMiembros = XLSX.utils.json_to_sheet(filasMiembros.length ? filasMiembros : [{ Grupo: 'Sin miembros' }]);
      const hojaTarjetas = XLSX.utils.json_to_sheet(filasTarjetas.length ? filasTarjetas : [{ Nombre: 'Sin tarjetas' }]);
      hojaMiembros['!cols'] = [22, 28, 16, 16, 16, 12, 22, 12, 12, 12, 12].map((w) => ({ wch: w }));
      hojaTarjetas['!cols'] = [22, 16, 6, 16, 20, 12, 10, 8, 8, 10, 10, 14, 14, 30].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(libro, hojaMiembros, 'Miembros');
      XLSX.utils.book_append_sheet(libro, hojaTarjetas, 'Tarjetas');
      const base64 = XLSX.write(libro, { type: 'base64', bookType: 'xlsx' });

      const nombreArchivo = `VidaGroups_${redNombre.replace(/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}_${hoyISO()}.xlsx`;
      const archivo = new File(Paths.cache, nombreArchivo);
      if (archivo.exists) archivo.delete();
      archivo.create();
      archivo.write(base64, { encoding: 'base64' });

      setTrabajando(false);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No se puede compartir', 'Este dispositivo no permite compartir archivos.');
        return;
      }
      await Sharing.shareAsync(archivo.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
        dialogTitle: `Exportar ${redNombre}`,
      });
    } catch (e) {
      setTrabajando(false);
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmar = () =>
    Alert.alert(
      'Exportar a Excel',
      `Se genera un Excel con los miembros y las tarjetas de ${redNombre}. Tiene datos personales (teléfonos, cumpleaños): compartilo solo con quien corresponda.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Exportar', onPress: exportar },
      ]
    );

  return (
    <Boton titulo="Exportar a Excel" icono="download-outline" variante="secundario" onPress={confirmar} cargando={trabajando} style={{ marginTop: 10 }} />
  );
}
