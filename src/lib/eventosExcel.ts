// ---------------------------------------------------------------------
// Planillas del Centro de Eventos
//   · Exportar: libro con tres hojas (Resumen, Anotados, Pagos), con formato.
//   · Importar: lee una planilla de anotados o de pagos (detecta las columnas).
//   · Plantilla: un Excel vacío con las columnas para completar.
// ---------------------------------------------------------------------
import type { Moneda } from './types';

export type EstadoPago = 'pagado' | 'cuotas' | 'sin_pagar';
export const ESTADO_LABEL: Record<EstadoPago, string> = { pagado: 'Pagó todo', cuotas: 'En cuotas', sin_pagar: 'Sin pagar' };

export interface FilaAnotado {
  nombre: string;
  grupo: string;
  pagado: number;
  saldo: number;
  estado: EstadoPago;
  ultimoPago: string | null;
  cantidadPagos: number;
}
export interface FilaPago {
  fecha: string;
  nombre: string;
  grupo: string;
  monto: number;
  nota: string | null;
  registro: string | null;
}
export interface DatosEventoExcel {
  nombre: string;
  tipo: string;
  fecha: string | null;
  lugar: string | null;
  costo: number;
  moneda: Moneda;
  cupo: number | null;
  cierre: string | null;
  anotados: FilaAnotado[];
  pagos: FilaPago[];
  porGrupo: { grupo: string; anotados: number; pagado: number; esperado: number }[];
}

// Colores de la planilla
const AZUL = '1F3A5F';
const AZUL_CLARO = 'DBE7F5';
const GRIS = 'F3F5F8';
const VERDE = 'DCFCE7';
const VERDE_TXT = '166534';
const AMARILLO = 'FEF3C7';
const AMARILLO_TXT = '92400E';
const ROJO = 'FEE2E2';
const ROJO_TXT = '991B1B';
const borde = { style: 'thin', color: { rgb: 'D0D7E2' } };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

const fmtFecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const formatoNum = (moneda: Moneda) => (moneda === 'USD' ? '"US$" #,##0' : '"$" #,##0');

/** Arma el libro de Excel del evento (formato profesional, tres hojas) */
export function libroEvento(XLSX: any, d: DatosEventoExcel) {
  const wb = XLSX.utils.book_new();
  const num = formatoNum(d.moneda);
  const titulo = { font: { name: 'Arial', bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: AZUL } }, alignment: { vertical: 'center' } };
  const encabezado = {
    font: { name: 'Arial', bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: AZUL } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: bordes,
  };
  const celda = (extra: object = {}) => ({ font: { name: 'Arial', sz: 10 }, border: bordes, alignment: { vertical: 'center' }, ...extra });
  const estadoEstilo = (e: EstadoPago) => {
    const [fondo, texto] = e === 'pagado' ? [VERDE, VERDE_TXT] : e === 'cuotas' ? [AMARILLO, AMARILLO_TXT] : [ROJO, ROJO_TXT];
    return celda({ fill: { fgColor: { rgb: fondo } }, font: { name: 'Arial', sz: 10, bold: true, color: { rgb: texto } }, alignment: { horizontal: 'center' } });
  };

  const totalPagado = d.anotados.reduce((a, x) => a + x.pagado, 0);
  const totalEsperado = d.anotados.length * d.costo;
  const pagaron = d.anotados.filter((x) => x.estado === 'pagado').length;
  const cuotas = d.anotados.filter((x) => x.estado === 'cuotas').length;
  const sinPagar = d.anotados.filter((x) => x.estado === 'sin_pagar').length;

  // ---------------- Hoja 1: Resumen ----------------
  const r: Record<string, any> = {};
  const poner = (ref: string, v: any, s: object, t?: string) => {
    r[ref] = { v, t: t ?? (typeof v === 'number' ? 'n' : 's'), s };
  };
  poner('A1', d.nombre, titulo);
  ['B1', 'C1', 'D1'].forEach((c) => poner(c, '', titulo));
  poner('A2', `${d.tipo}${d.fecha ? ` · ${fmtFecha(d.fecha)}` : ''}${d.lugar ? ` · ${d.lugar}` : ''}`, { font: { name: 'Arial', sz: 10, italic: true, color: { rgb: '57606A' } } });
  const kpis: [string, any, string?][] = [
    ['Costo por persona', d.costo, num],
    ['Anotados', d.cupo ? `${d.anotados.length} de ${d.cupo}` : d.anotados.length],
    ['Recaudado', totalPagado, num],
    ['Esperado (anotados × costo)', totalEsperado, num],
    ['Por cobrar', Math.max(0, totalEsperado - totalPagado), num],
    ['Avance', totalEsperado ? totalPagado / totalEsperado : 0, '0%'],
    ['Pagaron todo', pagaron],
    ['En cuotas', cuotas],
    ['Sin pagar', sinPagar],
    ['Cierre de inscripción', fmtFecha(d.cierre) || '—'],
  ];
  poner('A4', 'INDICADOR', encabezado);
  poner('B4', 'VALOR', encabezado);
  kpis.forEach(([k, v, z], i) => {
    const fila = 5 + i;
    poner(`A${fila}`, k, celda({ fill: { fgColor: { rgb: i % 2 ? 'FFFFFF' : GRIS } }, font: { name: 'Arial', sz: 10, bold: true } }));
    poner(`B${fila}`, v, celda({ fill: { fgColor: { rgb: i % 2 ? 'FFFFFF' : GRIS } }, alignment: { horizontal: 'right' }, ...(z ? { numFmt: z } : {}) }));
  });
  const g0 = 5 + kpis.length + 2;
  poner(`A${g0}`, 'POR GRUPO', encabezado);
  poner(`B${g0}`, 'ANOTADOS', encabezado);
  poner(`C${g0}`, 'RECAUDADO', encabezado);
  poner(`D${g0}`, 'ESPERADO', encabezado);
  poner(`E${g0}`, 'AVANCE', encabezado);
  d.porGrupo.forEach((g, i) => {
    const f = g0 + 1 + i;
    const fondo = { fill: { fgColor: { rgb: i % 2 ? 'FFFFFF' : GRIS } } };
    poner(`A${f}`, g.grupo, celda(fondo));
    poner(`B${f}`, g.anotados, celda({ ...fondo, alignment: { horizontal: 'center' } }));
    poner(`C${f}`, g.pagado, celda({ ...fondo, numFmt: num }));
    poner(`D${f}`, g.esperado, celda({ ...fondo, numFmt: num }));
    poner(`E${f}`, g.esperado ? g.pagado / g.esperado : 0, celda({ ...fondo, numFmt: '0%', alignment: { horizontal: 'center' } }));
  });
  const fin = g0 + d.porGrupo.length;
  r['!ref'] = `A1:E${Math.max(fin, 15)}`;
  r['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  r['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  r['!rows'] = [{ hpt: 30 }];
  XLSX.utils.book_append_sheet(wb, r, 'Resumen');

  // ---------------- Hoja 2: Anotados ----------------
  const a: Record<string, any> = {};
  const cabA = ['GRUPO', 'NOMBRE', 'COSTO', 'PAGADO', 'SALDO', 'AVANCE', 'ESTADO', 'CUOTAS', 'ÚLTIMO PAGO'];
  cabA.forEach((c, i) => (a[XLSX.utils.encode_cell({ r: 0, c: i })] = { v: c, t: 's', s: encabezado }));
  const ordenados = d.anotados.slice().sort((x, y) => x.grupo.localeCompare(y.grupo) || x.nombre.localeCompare(y.nombre));
  ordenados.forEach((x, i) => {
    const fila = i + 1;
    const fondo = { fill: { fgColor: { rgb: i % 2 ? 'FFFFFF' : GRIS } } };
    const vals: [any, object][] = [
      [x.grupo, celda(fondo)],
      [x.nombre, celda({ ...fondo, font: { name: 'Arial', sz: 10, bold: true } })],
      [d.costo, celda({ ...fondo, numFmt: num })],
      [x.pagado, celda({ ...fondo, numFmt: num })],
      [x.saldo, celda({ ...fondo, numFmt: num, font: { name: 'Arial', sz: 10, color: { rgb: x.saldo > 0 ? ROJO_TXT : VERDE_TXT } } })],
      [d.costo ? Math.min(1, x.pagado / d.costo) : 0, celda({ ...fondo, numFmt: '0%', alignment: { horizontal: 'center' } })],
      [ESTADO_LABEL[x.estado], estadoEstilo(x.estado)],
      [x.cantidadPagos, celda({ ...fondo, alignment: { horizontal: 'center' } })],
      [fmtFecha(x.ultimoPago), celda({ ...fondo, alignment: { horizontal: 'center' } })],
    ];
    vals.forEach(([v, s], c) => (a[XLSX.utils.encode_cell({ r: fila, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s }));
  });
  const tf = ordenados.length + 1;
  const totalEst = { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: AZUL } }, fill: { fgColor: { rgb: AZUL_CLARO } }, border: bordes };
  a[XLSX.utils.encode_cell({ r: tf, c: 0 })] = { v: 'TOTAL', t: 's', s: totalEst };
  a[XLSX.utils.encode_cell({ r: tf, c: 1 })] = { v: `${ordenados.length} anotados`, t: 's', s: totalEst };
  a[XLSX.utils.encode_cell({ r: tf, c: 2 })] = { v: '', t: 's', s: totalEst };
  a[XLSX.utils.encode_cell({ r: tf, c: 3 })] = { v: totalPagado, t: 'n', s: { ...totalEst, numFmt: num } };
  a[XLSX.utils.encode_cell({ r: tf, c: 4 })] = { v: Math.max(0, totalEsperado - totalPagado), t: 'n', s: { ...totalEst, numFmt: num } };
  a[XLSX.utils.encode_cell({ r: tf, c: 5 })] = { v: totalEsperado ? totalPagado / totalEsperado : 0, t: 'n', s: { ...totalEst, numFmt: '0%' } };
  [6, 7, 8].forEach((c) => (a[XLSX.utils.encode_cell({ r: tf, c })] = { v: '', t: 's', s: totalEst }));
  a['!ref'] = `A1:I${tf + 1}`;
  a['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 13 }, { wch: 8 }, { wch: 13 }];
  a['!autofilter'] = { ref: `A1:I${tf}` };
  a['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, a, 'Anotados');

  // ---------------- Hoja 3: Pagos ----------------
  const p: Record<string, any> = {};
  const cabP = ['FECHA', 'NOMBRE', 'GRUPO', 'MONTO', 'NOTA', 'REGISTRÓ'];
  cabP.forEach((c, i) => (p[XLSX.utils.encode_cell({ r: 0, c: i })] = { v: c, t: 's', s: encabezado }));
  const pagosOrd = d.pagos.slice().sort((x, y) => y.fecha.localeCompare(x.fecha));
  pagosOrd.forEach((x, i) => {
    const fondo = { fill: { fgColor: { rgb: i % 2 ? 'FFFFFF' : GRIS } } };
    const vals: [any, object][] = [
      [fmtFecha(x.fecha), celda({ ...fondo, alignment: { horizontal: 'center' } })],
      [x.nombre, celda(fondo)],
      [x.grupo, celda(fondo)],
      [x.monto, celda({ ...fondo, numFmt: num })],
      [x.nota ?? '', celda(fondo)],
      [x.registro ?? '', celda(fondo)],
    ];
    vals.forEach(([v, s], c) => (p[XLSX.utils.encode_cell({ r: i + 1, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s }));
  });
  const tp = pagosOrd.length + 1;
  p[XLSX.utils.encode_cell({ r: tp, c: 0 })] = { v: 'TOTAL', t: 's', s: totalEst };
  p[XLSX.utils.encode_cell({ r: tp, c: 1 })] = { v: `${pagosOrd.length} pagos`, t: 's', s: totalEst };
  p[XLSX.utils.encode_cell({ r: tp, c: 2 })] = { v: '', t: 's', s: totalEst };
  p[XLSX.utils.encode_cell({ r: tp, c: 3 })] = { v: totalPagado, t: 'n', s: { ...totalEst, numFmt: num } };
  [4, 5].forEach((c) => (p[XLSX.utils.encode_cell({ r: tp, c })] = { v: '', t: 's', s: totalEst }));
  p['!ref'] = `A1:F${tp + 1}`;
  p['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 13 }, { wch: 30 }, { wch: 20 }];
  p['!autofilter'] = { ref: `A1:F${tp}` };
  XLSX.utils.book_append_sheet(wb, p, 'Pagos');

  return wb;
}

/** Plantilla vacía para cargar anotados y pagos desde Excel */
export function libroPlantilla(XLSX: any) {
  const wb = XLSX.utils.book_new();
  const encabezado = {
    font: { name: 'Arial', bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: AZUL } },
    alignment: { horizontal: 'center' },
    border: bordes,
  };
  const ws: Record<string, any> = {};
  const cab = ['NOMBRE', 'APELLIDO', 'GRUPO', 'MONTO', 'FECHA', 'NOTA'];
  cab.forEach((c, i) => (ws[XLSX.utils.encode_cell({ r: 0, c: i })] = { v: c, t: 's', s: encabezado }));
  const ejemplo = [
    ['Ambar', 'Oviedo', 'Grupo de vida 04', 15000, '05/11/2026', 'Primera cuota'],
    ['Ambar', 'Oviedo', 'Grupo de vida 04', 15000, '20/11/2026', 'Segunda cuota'],
    ['Juan', 'Pérez', 'Grupo de vida 07', '', '', 'Anotado, todavía no pagó'],
  ];
  ejemplo.forEach((f, r) => f.forEach((v, c) => (ws[XLSX.utils.encode_cell({ r: r + 1, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s: { font: { name: 'Arial', sz: 10, color: { rgb: '6A737D' } }, border: bordes } })));
  ws['!ref'] = 'A1:F4';
  ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
  const ins: Record<string, any> = {};
  [
    'Cómo completar la planilla',
    '',
    '• Una fila por cada pago (si alguien pagó en 3 cuotas, son 3 filas).',
    '• Si alguien está anotado pero todavía no pagó, dejá MONTO vacío.',
    '• GRUPO ayuda a encontrar a la persona si hay nombres repetidos.',
    '• FECHA como 05/11/2026. Si está vacía, se usa la fecha de hoy.',
    '• También sirve una planilla con una sola fila por persona y el total pagado en MONTO.',
    '• Borrá las filas de ejemplo antes de importar.',
  ].forEach((t, i) => (ins[`A${i + 1}`] = { v: t, t: 's', s: { font: { name: 'Arial', sz: i === 0 ? 13 : 10, bold: i === 0 } } }));
  ins['!ref'] = 'A1:A8';
  ins['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ins, 'Instrucciones');
  return wb;
}

export interface FilaImportada {
  nombre: string;
  grupo: string | null;
  monto: number | null;
  fecha: string | null;
  nota: string | null;
}

const normal = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function aFecha(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    // Número de serie de Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const iso = String(v).trim().match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}

function aMonto(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const t = String(v).replace(/\s|\$|US/gi, '');
  if (!t) return null;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t);
  return isNaN(n) ? null : n;
}

/** Lee una planilla de anotados o pagos: busca la fila de títulos y reconoce las columnas */
export function leerPlanillaEvento(XLSX: any, libro: any): { filas: FilaImportada[]; hoja: string; columnas: string[] } {
  for (const nombreHoja of libro.SheetNames) {
    const filas: unknown[][] = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { header: 1, raw: true, defval: '' });
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const cab = (filas[i] ?? []).map(normal);
      const col = (...claves: string[]) => cab.findIndex((c) => claves.some((k) => c === k || c.startsWith(k)));
      const cNombre = col('nombre y apellido', 'apellido y nombre', 'nombre', 'miembro', 'hermano', 'participante');
      if (cNombre < 0) continue;
      const cApellido = cab.findIndex((c, k) => k !== cNombre && c.startsWith('apellido'));
      const cGrupo = col('grupo', 'gv', 'grupo de vida');
      const cMonto = col('monto', 'pagado', 'pago', 'importe', 'cuota', 'abono', 'total pagado');
      const cFecha = col('fecha');
      const cNota = col('nota', 'observacion', 'detalle', 'comentario');
      const resultado: FilaImportada[] = [];
      for (const f of filas.slice(i + 1)) {
        const nombre = [f[cNombre], cApellido >= 0 ? f[cApellido] : ''].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
        // Se saltean las filas de totales
        if (!nombre || /^total/i.test(nombre) || f.some((c) => /^total$/i.test(String(c ?? '').trim()))) continue;
        resultado.push({
          nombre,
          grupo: cGrupo >= 0 ? String(f[cGrupo] ?? '').trim() || null : null,
          monto: cMonto >= 0 ? aMonto(f[cMonto]) : null,
          fecha: cFecha >= 0 ? aFecha(f[cFecha]) : null,
          nota: cNota >= 0 ? String(f[cNota] ?? '').trim() || null : null,
        });
      }
      const columnas = ['nombre', cApellido >= 0 && 'apellido', cGrupo >= 0 && 'grupo', cMonto >= 0 && 'monto', cFecha >= 0 && 'fecha', cNota >= 0 && 'nota'].filter(Boolean) as string[];
      return { filas: resultado, hoja: nombreHoja, columnas };
    }
  }
  return { filas: [], hoja: '', columnas: [] };
}
