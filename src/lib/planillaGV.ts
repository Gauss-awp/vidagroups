// ---------------------------------------------------------------------
// Planilla del grupo en el formato EXACTO de la iglesia (archivo "GV"):
//   · ASISTENCIA GV: un informe por mes (diciembre del año anterior,
//     los 12 meses y enero del siguiente), con el mismo formato celda por celda.
//   · OFRENDAS: las ofrendas de cada semana y a quién se entregaron.
//   · DATOS: los datos de cada miembro (teléfono, dirección, bautismo…).
// La misma lógica lee la planilla original para importarla.
// ---------------------------------------------------------------------
import { ASIS_ANCHOS, ASIS_FILAS, DAT_ANCHOS, DAT_FILAS, ESTILOS, OFR_ANCHOS, OFR_FILAS } from './plantillaGV';

export const MESES_GV = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const FALTAS_ALEJADO = 6;
const FILAS_MIN = 30;
const LARGO_BLOQUE = 50; // 45 filas del informe + 5 en blanco, como la original

// Columnas de cada semana (0 = A): asistencia, consolidación y la celda de cierre (ofrenda/material)
const COL_ASIST = [2, 4, 6, 8, 11];
const COL_CONSOL = [3, 5, 7, 9, 12];
const COL_CIERRE = [2, 4, 6, 8, 10];

export type RolEquipo = 'guia' | 'equipo' | null;

export interface GrupoGV {
  nombre: string;
  lider_supervisor: string | null;
  dia_horario: string | null;
  barrio: string | null;
  direccion: string | null;
}
export interface DatosMiembroGV {
  telefono: string | null;
  direccion: string | null;
  bautismo: string | null;
  sanidad_interior: string | null;
  pilares_dato: string | null;
  encuentro_dato: string | null;
  reencuentro_dato: string | null;
  pos_encuentro_dato: string | null;
  escuela_capacitacion: string | null;
}
export interface MiembroGV {
  id: string;
  nombre: string;
  apellido: string | null;
  desde: string; // YYYY-MM-DD
  hasta: string | null; // si se quitó del grupo
  activo: boolean;
  alejado: boolean;
  roles: { rol: RolEquipo; desde: string }[];
  rolActual: RolEquipo;
  datos: DatosMiembroGV;
  /** renglón en la hoja DATOS (1 = primero) y su número, si vino de la planilla */
  datosFila?: number | null;
  datosNumero?: number | null;
  datosNombre?: string | null;
  /** si aparece en alguna planilla importada (para no sumar a DATOS a quien no estaba) */
  enPlanilla?: boolean;
}
export interface ReunionGV {
  fecha: string;
  notas: string | null;
  ofrenda: number | null;
  ofrenda_texto: string | null;
  ofrenda_entregada: string | null;
  material: string | null;
  compartio: string | null;
  asistencias: { miembro_id: string; presente: boolean; consolidado: boolean; motivo: string | null }[];
}
export interface EncabezadoMes {
  anio: number;
  mes: number;
  titulo: string | null;
  lider: string | null;
  dia_horario: string | null;
  barrio: string | null;
  direccion: string | null;
  /** cantidad de renglones de miembros que tenía ese mes (mínimo 30) */
  filas?: number | null;
  /** si en la planilla la fecha de una semana estaba escrita como texto, ese texto (para respetarlo) */
  fechas?: (string | null)[] | null;
  /** cuántas filas ocupaba el mes en la planilla, hasta el mes siguiente */
  largo?: number | null;
  /** códigos de los renglones vacíos (sin nombre), tal cual estaban */
  codigosVacios?: (string | null)[] | null;
  /** las 5 filas de ese mes en la hoja OFRENDAS, tal cual estaban */
  ofrendas?: ({ fecha: any; monto: any; entregada: any } | null)[] | null;
}
export interface FilaGuardada {
  anio: number;
  mes: number;
  miembro_id: string;
  fila: number;
  codigo: string | null;
  /** marcas que no son P/A (por ejemplo "-") por número de semana, como estaban en la planilla */
  marcas?: Record<string, string> | null;
}

// ---------------- utilidades ----------------
const est = (i: number | undefined) => (i === undefined ? undefined : JSON.parse(JSON.stringify(ESTILOS[i] ?? {})));
const ref = (XLSX: any, r: number, c: number) => XLSX.utils.encode_cell({ r, c });
const nombreCompleto = (m: { nombre: string; apellido: string | null }) => `${m.nombre} ${m.apellido ?? ''}`.trim();
const finDeMes = (anio: number, mes: number) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(new Date(anio, mes + 1, 0).getDate()).padStart(2, '0')}`;
const inicioDeMes = (anio: number, mes: number) => `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
function serialExcel(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function rolEn(m: MiembroGV, fecha: string): RolEquipo {
  if (!m.roles.length) return m.rolActual;
  const previos = m.roles.filter((r) => r.desde.slice(0, 10) <= fecha).sort((a, b) => a.desde.localeCompare(b.desde));
  return previos.length ? previos[previos.length - 1].rol : null;
}
/** "Grupo de vida 04" → "GRUPO DE VIDA n° 4", como en la original */
export function tituloGrupo(nombre: string): string {
  const m = nombre.match(/(\d+)\s*$/);
  return m ? `GRUPO DE VIDA n° ${Number(m[1])}` : nombre.toUpperCase();
}

// =====================================================================
// EXPORTAR
// =====================================================================
export function libroGV(
  XLSX: any,
  d: {
    anio: number;
    grupo: GrupoGV;
    miembros: MiembroGV[];
    reuniones: ReunionGV[];
    filas: FilaGuardada[];
    encabezados?: EncabezadoMes[];
    datosSueltos?: { fila: number; valores: Record<string, any> }[];
  }
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaAsistencia(XLSX, d), 'ASISTENCIA GV');
  XLSX.utils.book_append_sheet(wb, hojaOfrendas(XLSX, d.anio, d.reuniones, d.encabezados ?? []), 'OFRENDAS');
  XLSX.utils.book_append_sheet(wb, hojaDatos(XLSX, d.miembros, d.filas, d.datosSueltos ?? []), 'DATOS');
  return wb;
}

function valorCierre(r: ReunionGV | undefined, campo: 'ofrenda' | 'material' | 'compartio') {
  if (!r) return null;
  if (campo === 'ofrenda') return r.ofrenda_texto ?? (r.ofrenda !== null && r.ofrenda !== undefined ? Number(r.ofrenda) : null);
  return r[campo] ?? null;
}

function hojaAsistencia(XLSX: any, d: { anio: number; grupo: GrupoGV; miembros: MiembroGV[]; reuniones: ReunionGV[]; filas: FilaGuardada[]; encabezados?: EncabezadoMes[] }) {
  const ws: Record<string, any> = {};
  const merges: any[] = [];
  const poner = (r: number, c: number, v: any, estilo: number | undefined, extra: object = {}) => {
    const s = est(estilo);
    const celda: any = { t: v === null || v === undefined || v === '' ? 's' : typeof v === 'number' ? 'n' : 's', v: v ?? '', s };
    Object.assign(celda, extra);
    ws[ref(XLSX, r, c)] = celda;
  };
  const meses: [number, number][] = [[d.anio - 1, 11], ...Array.from({ length: 12 }, (_, i) => [d.anio, i] as [number, number]), [d.anio + 1, 0]];
  const ultimoCodigo = new Map<string, string | null>();
  const ultimaFila = new Map<string, number>();
  [...d.filas]
    .sort((a, b) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes))
    .forEach((f) => {
      ultimoCodigo.set(f.miembro_id, f.codigo);
      ultimaFila.set(f.miembro_id, f.fila);
    });

  const enc0Previo = (anio: number, mes: number) => d.encabezados?.find((e) => e.anio === anio && e.mes === mes && e.filas !== null && e.filas !== undefined);
  let base = 0; // fila (0-based) donde empieza cada mes
  for (const [anio, mes] of meses) {
    const ini = inicioDeMes(anio, mes);
    const fin = finDeMes(anio, mes);
    const reuniones = d.reuniones.filter((r) => r.fecha >= ini && r.fecha <= fin).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 5);
    const guardadas = d.filas.filter((f) => f.anio === anio && f.mes === mes);
    // Quiénes figuran ese mes y en qué orden
    let lista = d.miembros.filter((m) => m.desde <= fin && (!m.hasta || m.hasta >= ini));
    if (!guardadas.length && enc0Previo(anio, mes) && !reuniones.length) {
      lista = []; // en la planilla ese mes estaba sin completar
    } else if (guardadas.length) {
      // Mes importado: exactamente los de la planilla (más los que se cargaron después en la app)
      const enMes = new Set(guardadas.map((f) => f.miembro_id));
      lista = lista.filter((m) => enMes.has(m.id) || reuniones.some((r) => r.asistencias.some((a) => a.miembro_id === m.id)));
      const orden = new Map(guardadas.map((f) => [f.miembro_id, f.fila]));
      lista = lista.sort((a, b) => (orden.get(a.id) ?? 999) - (orden.get(b.id) ?? 999) || nombreCompleto(a).localeCompare(nombreCompleto(b)));
    } else {
      const peso = (m: MiembroGV) => (rolEn(m, fin) === 'guia' ? 0 : rolEn(m, fin) === 'equipo' ? 1 : 2);
      lista = lista.sort((a, b) => peso(a) - peso(b) || (ultimaFila.get(a.id) ?? 999) - (ultimaFila.get(b.id) ?? 999) || nombreCompleto(a).localeCompare(nombreCompleto(b)));
    }
    const enc0 = d.encabezados?.find((e) => e.anio === anio && e.mes === mes);
    const nFilas = Math.max(enc0?.filas ?? FILAS_MIN, lista.length);
    const filaRel = (rel: number) => base + rel - 1; // rel 1..45 → absoluta
    const estFila = (rel: number) => ASIS_FILAS[String(rel)];

    // ---- Encabezado (filas 1 a 11) ----
    for (let rel = 1; rel <= 11; rel++) for (let c = 0; c < 13; c++) poner(filaRel(rel), c, '', estFila(rel)[c]);
    poner(filaRel(1), 0, 'INFORME MENSUAL', estFila(1)[0]);
    poner(filaRel(1), 1, MESES_GV[mes], estFila(1)[1]);
    poner(filaRel(2), 1, anio, estFila(2)[1]);
    // Encabezado: el del mes tal como venía en la planilla importada, o los datos actuales del grupo
    const enc = d.encabezados?.find((e) => e.anio === anio && e.mes === mes);
    poner(filaRel(3), 0, enc?.titulo ?? tituloGrupo(d.grupo.nombre), estFila(3)[0]);
    const conValor = (prefijo: string, v: string) => (v ? `${prefijo} ${v}` : prefijo);
    poner(filaRel(3), 1, conValor('LIDER SUPERVISOR:', enc?.lider ?? d.grupo.lider_supervisor ?? ''), estFila(3)[1]);
    poner(filaRel(4), 0, conValor('DIA Y HORARIO:', enc?.dia_horario ?? (d.grupo.dia_horario ?? '').toUpperCase().replace(/\s*HS$/, 'HS')), estFila(4)[0]);
    poner(filaRel(4), 1, conValor('BARRIO:', enc?.barrio ?? d.grupo.barrio ?? ''), estFila(4)[1]);
    poner(filaRel(5), 0, conValor('DIRECCION:', enc?.direccion ?? d.grupo.direccion ?? ''), estFila(5)[0]);
    poner(filaRel(8), 2, 'SEMANAS/ Fechas', estFila(8)[2]);
    poner(filaRel(9), 0, 'NOMBRE Y APELLIDO', estFila(9)[0]);
    ['1era', '2 da', '3 era', '4 ta'].forEach((t, i) => poner(filaRel(9), COL_ASIST[i], t, estFila(9)[COL_ASIST[i]]));
    poner(filaRel(9), 11, '5ta', estFila(9)[11]);
    COL_ASIST.forEach((c, i) => {
      poner(filaRel(10), c, 'Asist', estFila(10)[c]);
      poner(filaRel(10), COL_CONSOL[i], 'Consol', estFila(10)[COL_CONSOL[i]]);
    });
    poner(filaRel(11), 1, 'Equipo de Trabajo', estFila(11)[1]);
    reuniones.forEach((r, i) => {
      const comoTexto = enc0?.fechas?.[i];
      if (comoTexto === '') {
        // en la planilla esa fecha estaba vacía
      } else if (comoTexto) poner(filaRel(11), COL_ASIST[i], comoTexto, estFila(11)[COL_ASIST[i]]);
      else poner(filaRel(11), COL_ASIST[i], serialExcel(r.fecha), estFila(11)[COL_ASIST[i]], { z: 'dd/mm' });
      if (r.notas) poner(filaRel(11), COL_CONSOL[i], r.notas, estFila(11)[COL_CONSOL[i]]);
    });
    merges.push(
      { s: { r: filaRel(8), c: 0 }, e: { r: filaRel(8), c: 1 } },
      { s: { r: filaRel(8), c: 2 }, e: { r: filaRel(8), c: 12 } },
      { s: { r: filaRel(9), c: 0 }, e: { r: filaRel(10), c: 1 } }
    );
    for (let rel = 9; rel <= 11; rel++) merges.push({ s: { r: filaRel(rel), c: 9 }, e: { r: filaRel(rel), c: 10 } });

    // ---- Miembros ----
    const primera = filaRel(12);
    for (let i = 0; i < nFilas; i++) {
      const r = primera + i;
      const plantilla = i === 0 ? estFila(12) : i === nFilas - 1 ? estFila(41) : estFila(14);
      const m = lista[i];
      for (let c = 0; c < 13; c++) poner(r, c, '', plantilla[c]);
      merges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
      if (!m) {
        const vacios = enc0?.codigosVacios;
        const cod = vacios ? vacios[i - lista.length] : undefined;
        poner(r, 0, cod === undefined ? i + 1 : cod === null ? '' : /^\d+$/.test(cod) ? Number(cod) : cod, plantilla[0]);
        continue;
      }
      const rol = rolEn(m, fin);
      const guardada = guardadas.find((f) => f.miembro_id === m.id);
      const codigo = guardada ? guardada.codigo : rol === 'guia' ? 'G' : rol === 'equipo' ? ultimoCodigo.get(m.id) ?? 'A' : null;
      poner(r, 0, codigo === null ? i + 1 : /^\d+$/.test(codigo) ? Number(codigo) : codigo, plantilla[0]);
      const sNombre = est(plantilla[1]);
      sNombre.font = { ...(sNombre.font ?? {}), bold: true, color: { rgb: m.alejado ? 'FF0000' : rol ? '4A86E8' : '000000' } };
      ws[ref(XLSX, r, 1)] = { t: 's', v: nombreCompleto(m), s: sNombre };
      reuniones.forEach((reu, k) => {
        const a = reu.asistencias.find((x) => x.miembro_id === m.id);
        // Sin registro → vacío, o "-" si todavía no se había sumado al grupo (como en la original)
        if (!a) {
          const marca = guardada?.marcas?.[String(k)];
          if (marca) poner(r, COL_ASIST[k], marca, plantilla[COL_ASIST[k]]);
          else if (!guardada && reu.fecha < m.desde) poner(r, COL_ASIST[k], '-', plantilla[COL_ASIST[k]]);
          return;
        }
        poner(r, COL_ASIST[k], a.presente ? 'P' : 'A', plantilla[COL_ASIST[k]]);
        if (!a.presente && a.consolidado) {
          const celda: any = { t: 's', v: 'C', s: est(plantilla[COL_CONSOL[k]]) };
          if (a.motivo) celda.c = [{ a: 'VidaGroups', t: a.motivo }];
          ws[ref(XLSX, r, COL_CONSOL[k])] = celda;
        }
      });
    }

    // ---- Cierre: SEMANAS, OFRENDA, MATERIAL, QUIÉN COMPARTIÓ ----
    const cierre = primera + nFilas;
    const titulos = ['SEMANAS', 'OFRENDA', 'MATERIAL', 'QUIEN COMPARTIÓ MATERIAL '];
    titulos.forEach((t, k) => {
      const r = cierre + k;
      const plantilla = estFila(42 + k);
      for (let c = 0; c < 13; c++) poner(r, c, '', plantilla[c]);
      poner(r, 0, t, plantilla[0]);
      merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
      [[2, 3], [4, 5], [6, 7], [8, 9], [10, 12]].forEach(([a, b]) => merges.push({ s: { r, c: a }, e: { r, c: b } }));
      if (k === 0) return;
      const campo = k === 1 ? 'ofrenda' : k === 2 ? 'material' : 'compartio';
      reuniones.forEach((reu, i) => {
        const v = valorCierre(reu, campo);
        if (v === null) return;
        poner(r, COL_CIERRE[i], v, plantilla[COL_CIERRE[i]], typeof v === 'number' ? { z: '"$"#,##0' } : {});
      });
    });

    const inicioMes = filaRel(1);
    base = Math.max(cierre + titulos.length + 1, inicioMes + (enc0?.largo ?? LARGO_BLOQUE));
  }

  ws['!ref'] = `A1:M${base}`;
  ws['!merges'] = merges;
  ws['!cols'] = ASIS_ANCHOS.map((w: number) => ({ wch: w }));
  return ws;
}

function hojaOfrendas(XLSX: any, anio: number, reunionesTodas: ReunionGV[], encabezados: EncabezadoMes[] = []) {
  const ws: Record<string, any> = {};
  // Formato de todas las celdas, como la original
  for (let r = 1; r <= 44; r++) {
    const fila = OFR_FILAS[String(r)] ?? [];
    for (let c = 0; c < 9; c++) ws[ref(XLSX, r - 1, c)] = { t: 's', v: '', s: est(fila[c]) };
  }
  const poner = (r1: number, c: number, v: any, extra: object = {}) => {
    const cel = ws[ref(XLSX, r1 - 1, c)] ?? { s: {} };
    ws[ref(XLSX, r1 - 1, c)] = { ...cel, t: typeof v === 'number' ? 'n' : 's', v: v ?? '', ...extra };
  };
  poner(1, 0, `OFRENDAS ${anio}`);
  const semanas = ['1 SEMANA', '2 SEMANA', '3 SEMANA', '4 SEMANA ', '5 SEMANA'];
  for (let mes = 0; mes < 12; mes++) {
    const fila0 = 2 + (mes % 6) * 7; // 2, 9, 16, 23, 30, 37
    const col0 = mes < 6 ? 0 : 5;
    poner(fila0, col0, MESES_GV[mes]);
    poner(fila0, col0 + 1, 'FECHA');
    poner(fila0, col0 + 2, 'MONTO');
    poner(fila0, col0 + 3, 'ENTREGADA A... con fecha');
    const reuniones = reunionesTodas
      .filter((r) => r.fecha >= inicioDeMes(anio, mes) && r.fecha <= finDeMes(anio, mes))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(0, 5);
    const crudas = encabezados.find((e) => e.anio === anio && e.mes === mes)?.ofrendas;
    semanas.forEach((t, i) => {
      poner(fila0 + 1 + i, col0, t);
      if (crudas) {
        // Mes importado: las filas tal como estaban en la planilla
        const c = crudas[i];
        if (c?.fecha !== null && c?.fecha !== undefined && c.fecha !== '') poner(fila0 + 1 + i, col0 + 1, c.fecha);
        if (c?.monto !== null && c?.monto !== undefined && c.monto !== '') poner(fila0 + 1 + i, col0 + 2, c.monto, typeof c.monto === 'number' ? { z: '#,##0' } : {});
        if (c?.entregada !== null && c?.entregada !== undefined && c.entregada !== '') poner(fila0 + 1 + i, col0 + 3, c.entregada);
        return;
      }
      const r = reuniones[i];
      if (!r) return;
      const f = new Date(`${r.fecha}T12:00:00`);
      poner(fila0 + 1 + i, col0 + 1, `${DIAS_SEMANA[f.getDay()]} ${f.getDate()}`);
      const monto = valorCierre(r, 'ofrenda');
      if (monto !== null) poner(fila0 + 1 + i, col0 + 2, monto, typeof monto === 'number' ? { z: '#,##0' } : {});
      if (r.ofrenda_entregada) poner(fila0 + 1 + i, col0 + 3, r.ofrenda_entregada);
    });
  }
  poner(44, 0, 'SI NO SE LEVANTA OFRENDA, SE CARGA UNA NOTA INDICANDO EL MOTIVO');
  ws['!ref'] = 'A1:I44';
  ws['!cols'] = OFR_ANCHOS.map((w: number) => ({ wch: w }));
  return ws;
}

function hojaDatos(XLSX: any, miembros: MiembroGV[], filas: FilaGuardada[], sueltos: { fila: number; valores: Record<string, any> }[] = []) {
  const ws: Record<string, any> = {};
  const merges: any[] = [];
  for (let r = 1; r <= 4; r++) {
    const fila = DAT_FILAS[String(r)] ?? [];
    for (let c = 0; c < 13; c++) ws[ref(XLSX, r - 1, c)] = { t: 's', v: '', s: est(fila[c]) };
  }
  const poner = (r1: number, c: number, v: any) => {
    const cel = ws[ref(XLSX, r1 - 1, c)] ?? { s: est(DAT_FILAS['5']?.[c]) };
    ws[ref(XLSX, r1 - 1, c)] = { ...cel, t: typeof v === 'number' ? 'n' : 's', v: v ?? '' };
  };
  poner(2, 0, 'NOMBRE Y APELLIDO');
  [
    [3, 'TELEFONO'],
    [4, 'DIRECCION'],
    [6, 'BAUTISMO'],
    [7, 'SANIDAD INTERIOR'],
    [8, 'PILARES'],
    [9, 'ENCUENTRO '],
    [10, 'RE ENCUENTRO '],
    [11, 'POS ENCUENTRO'],
    [12, 'ESC. CAPACITACIÓN '],
  ].forEach(([c, t]) => poner(3, c as number, t));
  ['A1:C1', 'A2:C3', 'D1:N1', 'E2:F2', 'E3:F3', 'B4:C4', 'E4:F4'].forEach((m) => merges.push(XLSX.utils.decode_range(m)));

  // Los activos, en el orden de la última planilla
  const orden = new Map<string, number>();
  [...filas].sort((a, b) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes)).forEach((f) => orden.set(f.miembro_id, f.fila));
  // Primero los que tienen renglón guardado (en su renglón exacto); después el resto de los activos
  const conFila = miembros.filter((m) => m.datosFila).sort((a, b) => (a.datosFila ?? 0) - (b.datosFila ?? 0));
  const ocupadas = new Set<number | null | undefined>([...conFila.map((m) => m.datosFila), ...sueltos.map((x) => x.fila)]);
  const hayDatosImportados = conFila.length > 0;
  const resto = miembros
    .filter((m) => m.activo && !m.datosFila && !(hayDatosImportados && m.enPlanilla))
    .sort((a, b) => (orden.get(a.id) ?? 999) - (orden.get(b.id) ?? 999) || nombreCompleto(a).localeCompare(nombreCompleto(b)));
  const ubicados: { m: MiembroGV; fila: number }[] = conFila.map((m) => ({ m, fila: m.datosFila! }));
  let libre = 1;
  resto.forEach((m) => {
    while (ocupadas.has(libre)) libre++;
    ubicados.push({ m, fila: libre });
    ocupadas.add(libre);
  });
  const lista = ubicados.sort((a, b) => a.fila - b.fila).map((x) => x.m);
  let numero = 0;
  ubicados.forEach(({ m, fila }, i) => {
    const r1 = 4 + fila;
    numero++;
    const plantilla = DAT_FILAS[i === 0 ? '5' : '6'] ?? [];
    for (let c = 0; c < 13; c++) ws[ref(XLSX, r1 - 1, c)] = { t: 's', v: '', s: est(plantilla[c]) };
    poner(r1, 0, m.datosNumero ?? numero);
    poner(r1, 1, m.datosNombre ?? (m.apellido ? `${m.nombre}, ${m.apellido}` : m.nombre));
    poner(r1, 3, m.datos.telefono ?? '');
    poner(r1, 4, m.datos.direccion ?? '');
    poner(r1, 6, m.datos.bautismo ?? '');
    poner(r1, 7, m.datos.sanidad_interior ?? '');
    poner(r1, 8, m.datos.pilares_dato ?? '');
    poner(r1, 9, m.datos.encuentro_dato ?? '');
    poner(r1, 10, m.datos.reencuentro_dato ?? '');
    poner(r1, 11, m.datos.pos_encuentro_dato ?? '');
    poner(r1, 12, m.datos.escuela_capacitacion ?? '');
    merges.push({ s: { r: r1 - 1, c: 1 }, e: { r: r1 - 1, c: 2 } }, { s: { r: r1 - 1, c: 4 }, e: { r: r1 - 1, c: 5 } });
  });
  sueltos.forEach(({ fila, valores }) => {
    const r1 = 4 + fila;
    const plantilla = DAT_FILAS['6'] ?? [];
    for (let c = 0; c < 13; c++) ws[ref(XLSX, r1 - 1, c)] = { t: 's', v: '', s: est(plantilla[c]) };
    Object.entries(valores).forEach(([c, v]) => poner(r1, Number(c), v));
    merges.push({ s: { r: r1 - 1, c: 1 }, e: { r: r1 - 1, c: 2 } }, { s: { r: r1 - 1, c: 4 }, e: { r: r1 - 1, c: 5 } });
  });
  ws['!ref'] = `A1:M${Math.max(6, 4 + Math.max(0, ...ubicados.map((u) => u.fila), ...sueltos.map((x) => x.fila)))}`;
  void lista;
  ws['!merges'] = merges;
  ws['!cols'] = DAT_ANCHOS.map((w: number) => ({ wch: w }));
  return ws;
}

// =====================================================================
// IMPORTAR
// =====================================================================
export interface SemanaLeidaGV {
  fecha: string;
  notas: string | null;
  ofrenda: number | null;
  ofrenda_texto: string | null;
  material: string | null;
  compartio: string | null;
  corregida: string | null; // si la fecha tenía un error de tipeo, la original
}
export interface MiembroLeidoGV {
  nombre: string;
  codigo: string | null;
  fila: number;
  rol: RolEquipo;
  valores: ({ asist: 'P' | 'A'; consolidado: boolean } | null)[];
  marcas: Record<string, string>;
}
export interface MesLeidoGV {
  anio: number;
  mes: number;
  encabezado: Omit<EncabezadoMes, 'anio' | 'mes'>;
  semanas: (SemanaLeidaGV | null)[];
  miembros: MiembroLeidoGV[];
}
export interface PlanillaLeidaGV {
  meses: MesLeidoGV[];
  grupo: { dia_horario: string | null; barrio: string | null; direccion: string | null; lider_supervisor: string | null };
  ofrendas: Record<string, string>; // "año-mes-semana" (mes 0-11, semana 0-4) → a quién se entregó
  ofrendasCrudas: Record<string, ({ fecha: any; monto: any; entregada: any } | null)[]>; // "año-mes" → las 5 filas de la hoja OFRENDAS
  datos: ({ nombre: string; nombreOriginal: string; fila: number; numero: number | null } & DatosMiembroGV)[];
  /** renglones de DATOS sin nombre pero con algo escrito (se respetan tal cual) */
  datosSueltos: { fila: number; valores: Record<string, any> }[];
  avisos: string[];
}

const limpio = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const vacioOGuion = (v: unknown) => {
  const t = limpio(v);
  return t === '' || t === '-' ? null : t;
};
const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

/** Fecha de la fila "Equipo de Trabajo": número de Excel, fecha o texto ("5/6", "mier 7/10") */
function leerFecha(v: unknown, anio: number, mes: number): { fecha: string; corregida: string | null } | null {
  let dia: number | null = null;
  let mesLeido: number | null = null;
  let anioLeido: number | null = null;
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    dia = d.getUTCDate();
    mesLeido = d.getUTCMonth();
    anioLeido = d.getUTCFullYear();
  } else if (v instanceof Date) {
    dia = v.getDate();
    mesLeido = v.getMonth();
    anioLeido = v.getFullYear();
  } else {
    const m = limpio(v).match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/);
    if (!m) return null;
    dia = Number(m[1]);
    mesLeido = Number(m[2]) - 1;
    anioLeido = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
  }
  if (!dia) return null;
  // Error de tipeo frecuente: el mes no coincide con el del informe (ej. "15/07" en mayo) → se usa el mes del informe
  const original = mesLeido !== null && mesLeido !== mes ? `${String(dia).padStart(2, '0')}/${String((mesLeido ?? 0) + 1).padStart(2, '0')}` : null;
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  if (dia > ultimo) return null;
  void anioLeido;
  return { fecha: `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, corregida: original };
}

function rolDeCodigo(codigo: string | null): RolEquipo {
  if (!codigo || /^\d+$/.test(codigo)) return null;
  if (/^G/i.test(codigo)) return 'guia';
  if (/^[A-Z]/i.test(codigo)) return 'equipo';
  return null;
}

export function leerLibroGV(XLSX: any, libro: any, anioPorDefecto: number): PlanillaLeidaGV {
  const res: PlanillaLeidaGV = { meses: [], grupo: { dia_horario: null, barrio: null, direccion: null, lider_supervisor: null }, ofrendas: {}, ofrendasCrudas: {}, datos: [], datosSueltos: [], avisos: [] };
  const hojaCon = (texto: RegExp) =>
    libro.SheetNames.find((n: string) => {
      const ws = libro.Sheets[n];
      return Object.keys(ws).some((k) => !k.startsWith('!') && texto.test(String(ws[k]?.v ?? '')));
    });

  // ---------------- ASISTENCIA ----------------
  const nAsis = hojaCon(/INFORME MENSUAL/i);
  if (nAsis) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(libro.Sheets[nAsis], { header: 1, raw: true, defval: '' });
    const inicios = filas.map((f, i) => (sinTildes(limpio(f[0])) === 'INFORME MENSUAL' ? i : -1)).filter((i) => i >= 0);
    inicios.forEach((s, k) => {
      const finBloque = k + 1 < inicios.length ? inicios[k + 1] : filas.length;
      const mes = MESES_GV.indexOf(sinTildes(limpio(filas[s][1])));
      if (mes < 0) return;
      const anioCelda = Number(limpio(filas[s + 1]?.[1]).replace(/\D/g, ''));
      const anio = anioCelda > 1900 ? anioCelda : anioPorDefecto;
      // Datos del grupo (encabezado)
      const encabezado: Omit<EncabezadoMes, 'anio' | 'mes'> = { titulo: null, lider: null, dia_horario: null, barrio: null, direccion: null, filas: null, fechas: null, codigosVacios: null, largo: k + 1 < inicios.length ? inicios[k + 1] - s : null };
      for (let r = s; r < Math.min(s + 7, finBloque); r++) {
        const t0 = limpio(filas[r]?.[0]);
        if (/^GRUPO DE VIDA/i.test(t0)) encabezado.titulo = t0;
        for (const c of [0, 1]) {
          const t = limpio(filas[r]?.[c]);
          const m = t.match(/^(LIDER SUPERVISOR|DIA Y HORARIO|BARRIO|DIRECCION)\s*:\s*(.*)$/i);
          if (!m) continue;
          const clave = sinTildes(m[1]);
          // Tal cual (también vacío, si así estaba ese mes)
          if (clave === 'LIDER SUPERVISOR') encabezado.lider = m[2].trim();
          if (clave === 'DIA Y HORARIO') encabezado.dia_horario = m[2].trim();
          if (clave === 'BARRIO') encabezado.barrio = m[2].trim();
          if (clave === 'DIRECCION') encabezado.direccion = m[2].trim();
          if (!m[2].trim()) continue;
          if (clave === 'LIDER SUPERVISOR') res.grupo.lider_supervisor ??= m[2].trim();
          if (clave === 'DIA Y HORARIO') res.grupo.dia_horario ??= m[2].trim();
          if (clave === 'BARRIO') res.grupo.barrio ??= m[2].trim();
          if (clave === 'DIRECCION') res.grupo.direccion ??= m[2].trim();
        }
      }
      const eq = filas.slice(s, finBloque).findIndex((f) => /^equipo de trabajo/i.test(limpio(f[1])));
      if (eq < 0) return;
      const fEq = s + eq;
      const semanas: (SemanaLeidaGV | null)[] = COL_ASIST.map((c, i) => {
        const crudo = filas[fEq][c];
        const f = leerFecha(crudo, anio, mes);
        if (!f) return null;
        // Se respeta cómo estaba escrita (texto, o la fecha con el error de tipeo)
        if (typeof crudo === 'string' && crudo.trim()) (encabezado.fechas ??= [null, null, null, null, null])[i] = crudo.trim();
        else if (f.corregida) (encabezado.fechas ??= [null, null, null, null, null])[i] = f.corregida;
        if (f.corregida) res.avisos.push(`${MESES_GV[mes]} ${anio}: la fecha "${f.corregida}" se tomó como ${f.fecha.slice(8, 10)}/${f.fecha.slice(5, 7)}`);
        return { fecha: f.fecha, notas: vacioOGuion(filas[fEq][COL_CONSOL[i]]), ofrenda: null, ofrenda_texto: null, material: null, compartio: null, corregida: f.corregida };
      });
      // Semanas sin fecha pero con asistencia marcada: se deduce la fecha (una semana después de la anterior)
      const conMarcas = (i: number) => {
        for (let k = fEq + 1; k < finBloque; k++) {
          if (sinTildes(limpio(filas[k][0])) === 'SEMANAS') break;
          const v = sinTildes(limpio(filas[k][COL_ASIST[i]]));
          if (v === 'P' || v === 'A') return true;
        }
        return false;
      };
      semanas.forEach((sem, i) => {
        if (sem || !conMarcas(i)) return;
        const anterior = semanas.slice(0, i).reverse().find(Boolean);
        if (!anterior) return;
        const d = new Date(`${anterior.fecha}T12:00:00`);
        d.setDate(d.getDate() + 7 * (i - semanas.indexOf(anterior)));
        if (d.getMonth() !== mes) return;
        const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        semanas[i] = { fecha, notas: vacioOGuion(filas[fEq][COL_CONSOL[i]]), ofrenda: null, ofrenda_texto: null, material: null, compartio: null, corregida: null };
        (encabezado.fechas ??= [null, null, null, null, null])[i] = '';
        res.avisos.push(`${MESES_GV[mes]} ${anio}: la semana ${i + 1} no tenía fecha; se tomó el ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`);
      });
      // Miembros hasta "SEMANAS"
      const miembros: MiembroLeidoGV[] = [];
      let r = fEq + 1;
      for (; r < finBloque; r++) {
        const a = sinTildes(limpio(filas[r][0]));
        if (a === 'SEMANAS') break;
        const nombre = limpio(filas[r][1]).replace(/\s+/g, ' ');
        if (!nombre) {
          const cv = limpio(filas[r][0]).replace(/\.0$/, '');
          (encabezado.codigosVacios ??= []).push(cv ? cv.toUpperCase() : null);
          continue;
        }
        const codigoTexto = limpio(filas[r][0]).replace(/\.0$/, '');
        const codigo = codigoTexto ? codigoTexto.toUpperCase() : null;
        miembros.push({
          nombre,
          codigo,
          fila: miembros.length + 1,
          rol: rolDeCodigo(codigo),
          marcas: Object.fromEntries(
            COL_ASIST.map((c, i) => [String(i), limpio(filas[r][c])] as [string, string]).filter(([, v]) => v && !['P', 'A'].includes(sinTildes(v)))
          ),
          valores: COL_ASIST.map((c, i) => {
            const v = sinTildes(limpio(filas[r][c]));
            if (!semanas[i] || (v !== 'P' && v !== 'A')) return null;
            return { asist: v as 'P' | 'A', consolidado: sinTildes(limpio(filas[r][COL_CONSOL[i]])) === 'C' };
          }),
        });
      }
      encabezado.filas = r - fEq - 1;
      // Cierre: ofrenda, material y quién compartió
      for (let c = r; c < Math.min(r + 8, finBloque); c++) {
        const t = sinTildes(limpio(filas[c][0]));
        const campo = t.startsWith('OFRENDA') ? 'ofrenda' : t.startsWith('MATERIAL') ? 'material' : t.startsWith('QUIEN COMPART') ? 'compartio' : null;
        if (!campo) continue;
        COL_CIERRE.forEach((col, i) => {
          const sem = semanas[i];
          if (!sem) return;
          const v = filas[c][col];
          if (campo === 'ofrenda') {
            if (typeof v === 'number') sem.ofrenda = v;
            else if (limpio(v) === '-') sem.ofrenda_texto = '-';
            else if (vacioOGuion(v)) {
              const n = Number(limpio(v).replace(/[$\s.]/g, '').replace(',', '.'));
              if (!isNaN(n) && /^\$?\s*[\d.,\s]+$/.test(limpio(v))) sem.ofrenda = n;
              else sem.ofrenda_texto = limpio(v);
            }
          } else {
            sem[campo] = limpio(v) || null; // el "-" se guarda tal cual, para que la planilla salga igual
          }
        });
      }
      res.meses.push({ anio, mes, encabezado, semanas, miembros });
    });
  }

  // ---------------- OFRENDAS (a quién se entregó) ----------------
  const nOfr = hojaCon(/ENTREGADA A/i);
  if (nOfr) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(libro.Sheets[nOfr], { header: 1, raw: true, defval: '' });
    const titulo = limpio(filas[0]?.[0]).match(/(\d{4})/);
    const anio = titulo ? Number(titulo[1]) : anioPorDefecto;
    filas.forEach((f, r) => {
      [0, 5].forEach((c0) => {
        const mes = MESES_GV.indexOf(sinTildes(limpio(f[c0])));
        if (mes < 0 || sinTildes(limpio(f[c0 + 1])) !== 'FECHA') return;
        for (let i = 1; i <= 5; i++) {
          const fila = filas[r + i] ?? [];
          (res.ofrendasCrudas[`${anio}-${mes}`] ??= [null, null, null, null, null])[i - 1] = {
            fecha: typeof fila[c0 + 1] === 'string' ? (fila[c0 + 1] as string).trim() : fila[c0 + 1],
            monto: typeof fila[c0 + 2] === 'string' ? (fila[c0 + 2] as string).trim() : fila[c0 + 2],
            entregada: typeof fila[c0 + 3] === 'string' ? (fila[c0 + 3] as string).trim() : fila[c0 + 3],
          };
          const entregada = vacioOGuion(fila[c0 + 3]);
          if (!entregada) continue;
          // Por mes y número de semana (las fechas de esta hoja a veces no coinciden con las de asistencia)
          res.ofrendas[`${anio}-${mes}-${i - 1}`] = typeof fila[c0 + 3] === 'number' ? String(fila[c0 + 3]) : entregada;
        }
      });
    });
  }

  res.meses.forEach((m) => {
    const c = res.ofrendasCrudas[`${m.anio}-${m.mes}`];
    if (c) m.encabezado.ofrendas = c;
  });

  // ---------------- DATOS de cada miembro ----------------
  const nDat = hojaCon(/TELEFONO/i);
  if (nDat) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(libro.Sheets[nDat], { header: 1, raw: true, defval: '' });
    const fCab = filas.findIndex((f) => f.some((v) => sinTildes(limpio(v)) === 'TELEFONO'));
    if (fCab >= 0) {
      const cab = filas[fCab].map((v) => sinTildes(limpio(v)));
      const col = (t: string) => cab.findIndex((c) => c.startsWith(t));
      const cols = {
        telefono: col('TELEFONO'),
        direccion: col('DIRECCION'),
        bautismo: col('BAUTISMO'),
        sanidad_interior: col('SANIDAD'),
        pilares_dato: col('PILARES'),
        encuentro_dato: col('ENCUENTRO'),
        reencuentro_dato: col('RE ENCUENTRO'),
        pos_encuentro_dato: col('POS ENCUENTRO'),
        escuela_capacitacion: col('ESC'),
      };
      filas.slice(fCab + 1).forEach((f, k) => {
        const crudo = limpio(f[1]);
        const fila = fCab + 1 + k - 3; // renglón 1 = fila 5 de la hoja (después de los títulos)
        if (!crudo) {
          const valores: Record<string, any> = {};
          f.forEach((v, c) => {
            if (limpio(v)) valores[String(c)] = typeof v === 'string' ? v.trim() : v;
          });
          if (Object.keys(valores).length && fila > 0) res.datosSueltos.push({ fila, valores });
          return;
        }
        const nombre = crudo.includes(',') ? crudo.split(',').map((x) => x.trim()).filter(Boolean).join(' ') : crudo;
        const v = (k: keyof typeof cols) => (cols[k] >= 0 ? vacioOGuion(f[cols[k]]) : null);
        res.datos.push({
          nombre: nombre.replace(/\s+/g, ' '),
          nombreOriginal: crudo,
          fila,
          numero: typeof f[0] === 'number' ? f[0] : null,
          telefono: v('telefono'),
          direccion: v('direccion'),
          bautismo: v('bautismo'),
          sanidad_interior: v('sanidad_interior'),
          pilares_dato: v('pilares_dato'),
          encuentro_dato: v('encuentro_dato'),
          reencuentro_dato: v('reencuentro_dato'),
          pos_encuentro_dato: v('pos_encuentro_dato'),
          escuela_capacitacion: v('escuela_capacitacion'),
        });
      });
    }
  }
  return res;
}
