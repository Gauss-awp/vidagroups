import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { hoyISO, parseCumple } from '@/lib/utils';
import { Boton, Campo, Card, Chip, HojaModal, s } from '@/components/ui';

type Modo = 'miembros' | 'tarjetas';

interface FilaMiembro {
  fila: number;
  grupo: string;
  correoGuia: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  cumpleanos: string | null;
}
interface FilaTarjeta {
  fila: number;
  nombre: string;
  telefono: string | null;
  edad: number | null;
  zona: string | null;
  grupo: string | null;
  fecha: string | null;
  fonovisita: boolean;
  visita: boolean;
  pilares: boolean;
  comenzo_gv: boolean;
  encuentro: boolean;
}
interface Plan {
  gruposNuevos: string[];
  miembros: FilaMiembro[];
  tarjetas: FilaTarjeta[];
  omitidos: number;
  errores: string[];
}

const clave = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
const siNo = (t?: string) => /^(s|si|sí|x|1|true|ok)$/i.test((t ?? '').trim());

/** Convierte lo pegado desde Excel o Google Sheets (tabulado), o un CSV con ; o , */
function leerFilas(texto: string): string[][] {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lineas.length === 0) return [];
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : ',';
  const filas = lineas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  // Si la primera fila es el encabezado, se saltea
  const primera = filas[0].join(' ').toLowerCase();
  return /grupo|nombre/.test(primera) ? filas.slice(1) : filas;
}

/** Importa grupos y miembros, o tarjetas de consolidación, a una red desde una planilla. */
export function Importador({ redId, redNombre, onImportado }: { redId: string; redNombre: string; onImportado?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>('miembros');
  const [texto, setTexto] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cerrar = () => {
    setAbierto(false);
    setPlan(null);
    setTexto('');
  };

  const revisar = async () => {
    const filas = leerFilas(texto);
    if (pareceOtraHoja) {
      Alert.alert(
        'Parece la hoja equivocada',
        modo === 'tarjetas'
          ? 'Lo que pegaste tiene correos en la segunda columna: parece la hoja Miembros. Elegí "Grupos y miembros" arriba.'
          : 'Lo que pegaste parece la hoja Tarjetas. Elegí "Tarjetas de consolidación" arriba.'
      );
      return;
    }
    if (filas.length === 0) {
      Alert.alert('No hay datos', 'Pegá las filas copiadas de la planilla.');
      return;
    }
    setTrabajando(true);
    const errores: string[] = [];
    const { data: grupos } = await supabase.from('groups').select('id, nombre').eq('red_id', redId);
    const gruposPorNombre = new Map((grupos ?? []).map((g: { id: string; nombre: string }) => [clave(g.nombre), g.id]));

    if (modo === 'miembros') {
      const idsGrupos = [...gruposPorNombre.values()];
      const { data: existentes } = idsGrupos.length
        ? await supabase.from('miembros_grupo').select('grupo_id, nombre, apellido').in('grupo_id', idsGrupos).eq('activo', true)
        : { data: [] };
      const yaEstan = new Set(
        ((existentes ?? []) as { grupo_id: string; nombre: string; apellido: string | null }[]).map(
          (m) => `${m.grupo_id}|${clave(m.nombre)}|${clave(m.apellido ?? '')}`
        )
      );
      const vistos = new Set<string>();
      const miembros: FilaMiembro[] = [];
      const nuevos = new Set<string>();
      let omitidos = 0;
      filas.forEach((c, i) => {
        const n = i + 2;
        const [grupo = '', correoGuia = '', nombre = '', apellido = '', telefono = '', cumple = ''] = c;
        if (!grupo || !nombre) {
          errores.push(`Fila ${n}: falta el grupo o el nombre`);
          return;
        }
        const cumpleanos = cumple ? parseCumple(cumple) : null;
        if (cumple && !cumpleanos) errores.push(`Fila ${n}: cumpleaños "${cumple}" no se entiende (se carga sin cumpleaños)`);
        const idGrupo = gruposPorNombre.get(clave(grupo));
        const k = `${idGrupo ?? clave(grupo)}|${clave(nombre)}|${clave(apellido)}`;
        if (vistos.has(k) || (idGrupo && yaEstan.has(k))) {
          omitidos++;
          return;
        }
        vistos.add(k);
        if (!idGrupo) nuevos.add(grupo.trim());
        miembros.push({ fila: n, grupo: grupo.trim(), correoGuia: correoGuia.trim().toLowerCase(), nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono || null, cumpleanos });
      });
      // Un grupo nuevo puede aparecer con distinta mayúscula: quedarse con un nombre por grupo
      const unicos = new Map<string, string>();
      nuevos.forEach((g) => unicos.set(clave(g), unicos.get(clave(g)) ?? g));
      setPlan({ gruposNuevos: [...unicos.values()], miembros, tarjetas: [], omitidos, errores });
    } else {
      const { data: existentes } = await supabase.from('tarjetas_consolidacion').select('nombre, telefono').eq('red_id', redId);
      const yaEstan = new Set(
        ((existentes ?? []) as { nombre: string; telefono: string | null }[]).map((t) => `${clave(t.nombre)}|${(t.telefono ?? '').replace(/\D/g, '')}`)
      );
      const tarjetas: FilaTarjeta[] = [];
      let omitidos = 0;
      filas.forEach((c, i) => {
        const n = i + 2;
        const [nombre = '', telefono = '', edad = '', zona = '', grupo = '', fecha = '', fono, visita, pilares, gv, encuentro] = c;
        if (!nombre) {
          errores.push(`Fila ${n}: falta el nombre`);
          return;
        }
        if (telefono.includes('@')) {
          errores.push(`Fila ${n}: en Teléfono hay un correo; revisá que sea la hoja Tarjetas`);
          return;
        }
        if (edad && isNaN(Number(edad))) errores.push(`Fila ${n}: la edad "${edad}" no es un número (se carga sin edad)`);
        const k = `${clave(nombre)}|${telefono.replace(/\D/g, '')}`;
        if (yaEstan.has(k)) {
          omitidos++;
          return;
        }
        yaEstan.add(k);
        if (grupo && !gruposPorNombre.has(clave(grupo))) errores.push(`Fila ${n}: el grupo "${grupo}" no existe en ${redNombre} (la tarjeta se carga sin grupo)`);
        tarjetas.push({
          fila: n,
          nombre: nombre.trim(),
          telefono: telefono || null,
          edad: Number(edad) || null,
          zona: zona || null,
          grupo: grupo && gruposPorNombre.has(clave(grupo)) ? grupo.trim() : null,
          fecha: fecha ? parseCumple(fecha) : null,
          fonovisita: siNo(fono),
          visita: siNo(visita),
          pilares: siNo(pilares),
          comenzo_gv: siNo(gv),
          encuentro: siNo(encuentro),
        });
      });
      setPlan({ gruposNuevos: [], miembros: [], tarjetas, omitidos, errores });
    }
    setTrabajando(false);
  };

  const importar = async () => {
    if (!plan) return;
    setTrabajando(true);
    const { data: usuario } = await supabase.auth.getUser();
    const yo = usuario.user?.id;

    try {
      if (modo === 'miembros') {
        // 1. Guías de la red, por correo
        const { data: perfiles } = await supabase.from('profiles').select('id, email').eq('red_id', redId).eq('estado', 'activo');
        const guiaPorCorreo = new Map((perfiles ?? []).map((p: { id: string; email: string }) => [p.email.toLowerCase(), p.id]));

        // 2. Grupos nuevos (si el guía no tiene cuenta, queda a tu nombre y lo cambiás después)
        for (const nombre of plan.gruposNuevos) {
          const correo = plan.miembros.find((m) => clave(m.grupo) === clave(nombre))?.correoGuia ?? '';
          const { error } = await supabase
            .from('groups')
            .insert({ nombre, red_id: redId, guia_id: guiaPorCorreo.get(correo) ?? yo });
          if (error) throw new Error(`No se pudo crear el grupo "${nombre}": ${error.message}`);
        }

        // 3. Miembros, en tandas
        const { data: grupos } = await supabase.from('groups').select('id, nombre').eq('red_id', redId);
        const idPorNombre = new Map((grupos ?? []).map((g: { id: string; nombre: string }) => [clave(g.nombre), g.id]));
        const filas = plan.miembros.map((m) => ({
          grupo_id: idPorNombre.get(clave(m.grupo)),
          nombre: m.nombre,
          apellido: m.apellido,
          telefono: m.telefono,
          cumpleanos: m.cumpleanos,
        }));
        for (let i = 0; i < filas.length; i += 200) {
          const { error } = await supabase.from('miembros_grupo').insert(filas.slice(i, i + 200));
          if (error) throw new Error(`Error al cargar miembros: ${error.message}`);
        }
      } else {
        const filas = plan.tarjetas.map((t) => ({
          nombre: t.nombre,
          telefono: t.telefono,
          edad: t.edad,
          zona: t.zona,
          gv_asignado: t.grupo,
          fecha_reu: t.fecha ?? hoyISO(),
          red_id: redId,
          fonovisita: t.fonovisita,
          visita: t.visita,
          pilares: t.pilares,
          comenzo_gv: t.comenzo_gv,
          encuentro: t.encuentro,
          creado_por: yo,
        }));
        for (let i = 0; i < filas.length; i += 200) {
          const { error } = await supabase.from('tarjetas_consolidacion').insert(filas.slice(i, i + 200));
          if (error) throw new Error(`Error al cargar tarjetas: ${error.message}`);
        }
      }
      setTrabajando(false);
      const resumen =
        modo === 'miembros'
          ? `Se cargaron ${plan.gruposNuevos.length} grupos nuevos y ${plan.miembros.length} miembros.`
          : `Se cargaron ${plan.tarjetas.length} tarjetas.`;
      Alert.alert('Importación lista', resumen);
      cerrar();
      onImportado?.();
    } catch (e) {
      setTrabajando(false);
      Alert.alert('La importación se cortó', `${e instanceof Error ? e.message : String(e)}\n\nLo que ya se cargó queda guardado; si volvés a importar, lo repetido se saltea.`);
    }
  };

  // Vista previa: cada fila pegada, con sus datos ordenados y con nombre
  const filasPegadas = texto.trim() ? leerFilas(texto) : [];
  const etiquetas =
    modo === 'miembros'
      ? ['Grupo', 'Guía', 'Nombre', 'Apellido', 'Teléfono', 'Cumpleaños']
      : ['Nombre', 'Teléfono', 'Edad', 'Zona', 'Grupo', 'Fecha', 'Fono', 'Visita', 'Pilares', 'GV', 'Encuentro'];
  const pareceOtraHoja =
    filasPegadas.length > 0 &&
    (modo === 'tarjetas'
      ? filasPegadas.some((c) => (c[1] ?? '').includes('@'))
      : filasPegadas.every((c) => !(c[1] ?? '').includes('@') && c.length >= 7));

  const columnas =
    modo === 'miembros'
      ? 'Grupo · Correo del guía · Nombre · Apellido · Teléfono · Cumpleaños'
      : 'Nombre · Teléfono · Edad · Zona · Grupo · Fecha · Fonovisita · Visita · Pilares · Comenzó GV · Encuentro';

  return (
    <View>
      <Boton titulo="Importar desde planilla" icono="cloud-upload-outline" variante="secundario" onPress={() => setAbierto(true)} style={{ marginTop: 16 }} />

      <HojaModal visible={abierto} onClose={cerrar} titulo={`Importar a ${redNombre}`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          <Chip texto="Grupos y miembros" activo={modo === 'miembros'} onPress={() => { setModo('miembros'); setPlan(null); }} />
          <Chip texto="Tarjetas de consolidación" activo={modo === 'tarjetas'} onPress={() => { setModo('tarjetas'); setPlan(null); }} />
        </View>

        <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>Columnas, en este orden:</Text>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>{columnas}</Text>
        <Text style={[s.textoFilaSec, { marginBottom: 12 }]}>
          Seleccioná las filas en Excel o Google Sheets (con o sin el encabezado), copialas y pegalas acá.
          {modo === 'miembros' ? ' Si el guía todavía no tiene cuenta, el grupo queda a tu nombre y después lo cambiás en Gestionar GVs.' : ''}
        </Text>

        <Campo
          placeholder="Pegá acá las filas de la planilla"
          value={texto}
          onChangeText={(v) => { setTexto(v); setPlan(null); }}
          multiline
          numberOfLines={3}
          style={{ minHeight: 70, maxHeight: 90, fontSize: 12 }}
        />

        {filasPegadas.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={[s.textoFilaSec, { marginBottom: 6 }]}>
              {filasPegadas.length} {filasPegadas.length === 1 ? 'fila detectada' : 'filas detectadas'}. Así se va a leer:
            </Text>
            {pareceOtraHoja ? (
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>
                {modo === 'tarjetas' ? 'Parece la hoja Miembros: elegí "Grupos y miembros".' : 'Parece la hoja Tarjetas: elegí "Tarjetas de consolidación".'}
              </Text>
            ) : null}
            {filasPegadas.slice(0, 5).map((c, i) => (
              <View key={i} style={{ backgroundColor: colors.cardAlt, borderRadius: 10, padding: 10, marginBottom: 6 }}>
                {etiquetas.map((et, j) =>
                  (c[j] ?? '').trim() ? (
                    <Text key={et} style={{ fontSize: 13, color: colors.text }}>
                      <Text style={{ color: colors.textSec }}>{et}: </Text>
                      {c[j]}
                    </Text>
                  ) : null
                )}
              </View>
            ))}
            {filasPegadas.length > 5 ? <Text style={s.textoFilaSec}>y {filasPegadas.length - 5} filas más</Text> : null}
          </View>
        ) : null}

        {!plan ? (
          <Boton titulo="Revisar antes de importar" onPress={revisar} cargando={trabajando} />
        ) : (
          <>
            <Card style={{ backgroundColor: colors.cardAlt }}>
              {modo === 'miembros' ? (
                <>
                  <Text style={s.textoFila}>{plan.gruposNuevos.length} grupos nuevos</Text>
                  {plan.gruposNuevos.length ? <Text style={s.textoFilaSec}>{plan.gruposNuevos.join(', ')}</Text> : null}
                  <Text style={[s.textoFila, { marginTop: 8 }]}>{plan.miembros.length} miembros para cargar</Text>
                </>
              ) : (
                <Text style={s.textoFila}>{plan.tarjetas.length} tarjetas para cargar</Text>
              )}
              {plan.omitidos ? <Text style={[s.textoFilaSec, { marginTop: 8 }]}>{plan.omitidos} repetidos se saltean</Text> : null}
              {plan.errores.length ? (
                <View style={{ marginTop: 8 }}>
                  {plan.errores.slice(0, 15).map((e) => (
                    <Text key={e} style={{ color: colors.warning, fontSize: 12, marginTop: 2 }}>
                      {e}
                    </Text>
                  ))}
                  {plan.errores.length > 15 ? <Text style={s.textoFilaSec}>y {plan.errores.length - 15} avisos más</Text> : null}
                </View>
              ) : null}
            </Card>
            <Boton
              titulo="Importar"
              icono="checkmark"
              onPress={importar}
              cargando={trabajando}
              deshabilitado={(modo === 'miembros' ? plan.miembros.length : plan.tarjetas.length) === 0}
            />
            <Boton titulo="Corregir lo pegado" variante="texto" onPress={() => setPlan(null)} style={{ marginTop: 6 }} />
          </>
        )}
      </HojaModal>
    </View>
  );
}
