// ---------------------------------------------------------------------
// Formato de la planilla "TARJETAS DE CONSOLIDACION" que usa hoy la iglesia.
// Se usa igual para importar y para exportar, así el Excel queda idéntico.
// ---------------------------------------------------------------------
import { formatoFecha, parseCumple } from './utils';

export const COLUMNAS_TARJETAS = [
  'CANT.',
  'TARJETA DE CONSOLIDACIÓN',
  'LÍNEA - LÍDER',
  'FECHA DE ENTREGA',
  'FONOVISITA',
  'VISITA',
  'PILAR 1',
  'PILAR 2',
  'PILAR 3',
  'PILAR 4',
  'PILAR 5',
  'GRUPO DE VIDA - ASISTENCIA',
  'ENCUENTRO',
  'OBSERVACIÓN',
] as const;

export const ANCHOS_TARJETAS = [6, 30, 18, 14, 12, 10, 8, 8, 8, 8, 8, 22, 12, 45];

const esSi = (v?: string) => /^(s|si|sí|x|ok|1|true|asistiendo)$/i.test((v ?? '').trim());

/** Una tarjeta de la base → una fila del Excel, con el mismo formato de la planilla */
export function tarjetaAFila(t: Record<string, any>, numero: number): Record<string, string | number> {
  const pilar = (k: number) => (t[`pilar_${k}`] || t.pilares ? 'SI' : '');
  const fecha = t.fecha_entrada ?? t.fecha_reu ?? null;
  return {
    'CANT.': numero,
    'TARJETA DE CONSOLIDACIÓN': t.nombre ?? '',
    'LÍNEA - LÍDER': t.linea_lider ?? '',
    'FECHA DE ENTREGA': fecha ? formatoFecha(String(fecha).slice(0, 10)) : '—',
    FONOVISITA: t.fonovisita ? 'SI' : '',
    VISITA: t.visita ? 'SI' : '',
    'PILAR 1': pilar(1),
    'PILAR 2': pilar(2),
    'PILAR 3': pilar(3),
    'PILAR 4': pilar(4),
    'PILAR 5': pilar(5),
    'GRUPO DE VIDA - ASISTENCIA': t.asistencia_gv ? String(t.asistencia_gv).toUpperCase() : t.comenzo_gv ? 'ASISTIENDO' : '',
    ENCUENTRO: t.encuentro ? 'SI' : '',
    OBSERVACIÓN: t.observacion ?? '',
  };
}

export interface TarjetaImportada {
  nombre: string;
  linea_lider: string | null;
  fecha: string | null;
  fonovisita: boolean;
  visita: boolean;
  pilares: boolean[];
  asistencia_gv: string | null;
  comenzo_gv: boolean;
  encuentro: boolean;
  observacion: string | null;
}

/** ¿Es una fila de encabezado de la planilla (CANT., PILARES, 1 2 3 4 5…)? */
export function esEncabezadoTarjetas(celdas: string[]): boolean {
  const texto = celdas.join(' ').toUpperCase();
  return /TARJETA DE CONSOLIDACI|LINEA|LÍNEA|PILARES|FONOVISITA|ASISTENCIA|OBSERVACI/.test(texto) || !celdas[1]?.trim();
}

/** Una fila pegada de la planilla → los datos de una tarjeta */
export function filaATarjeta(celdas: string[]): TarjetaImportada {
  // Si se copió desde la columna A (vacía), la fila empieza con una celda de más
  const c = celdas[0] === '' && /^\d+$/.test(celdas[1] ?? '') ? celdas.slice(1) : celdas;
  const [, nombre = '', linea = '', fecha = '', fono, visita, p1, p2, p3, p4, p5, gv = '', encuentro, observacion = ''] = c;
  const pilares = [p1, p2, p3, p4, p5].map(esSi);
  const asistencia = gv.trim().toUpperCase();
  return {
    nombre: nombre.trim(),
    linea_lider: linea.trim() || null,
    fecha: fecha.trim() && fecha.trim() !== '—' && fecha.trim() !== '-' ? parseCumple(fecha.trim()) : null,
    fonovisita: esSi(fono),
    visita: esSi(visita),
    pilares,
    asistencia_gv: asistencia || null,
    comenzo_gv: asistencia === 'ASISTIENDO',
    encuentro: esSi(encuentro),
    observacion: observacion.trim() || null,
  };
}

/** Normaliza la fila: quita la celda vacía inicial si se copió desde la columna A */
export function normalizarFilaTarjeta(celdas: string[]): string[] {
  return celdas[0] === '' && /^\d+$/.test(celdas[1] ?? '') ? celdas.slice(1) : celdas;
}

// ---------------------------------------------------------------------
// Hoja con el MISMO diseño que la planilla de la iglesia (colores, celdas
// combinadas, anchos). Usa xlsx-js-style, que permite escribir estilos.
// ---------------------------------------------------------------------
const FONDO = '090A0C';
const BORDE = { style: 'thin', color: { rgb: '24272B' } };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
const AZUL = { fill: { fgColor: { rgb: '62A8E8' } }, font: { name: 'Arial', sz: 9, bold: true, color: { rgb: '14202A' } } };
const OSCURO_TITULO = { fill: { fgColor: { rgb: FONDO } }, font: { name: 'Arial', sz: 8, bold: true, color: { rgb: 'EDEDED' } } };
const SI = { fill: { fgColor: { rgb: 'A9F0D2' } }, font: { name: 'Arial', sz: 8, bold: true, color: { rgb: '10251D' } } };
const NO = { fill: { fgColor: { rgb: 'FF5157' } }, font: { name: 'Arial', sz: 8, bold: true, color: { rgb: '210B0D' } } };
const VACIO = { fill: { fgColor: { rgb: '34383B' } }, font: { name: 'Arial', sz: 8, color: { rgb: 'EDEDED' } } };
const TEXTO = { fill: { fgColor: { rgb: FONDO } }, font: { name: 'Arial', sz: 9, color: { rgb: 'EDEDED' } } };

// Colores de cada línea, como en la planilla; las líneas nuevas toman uno de la paleta
const COLOR_LINEA: Record<string, string> = {
  'MICA Y SANTI': '8A421D',
  'INES Y CRIS': '8E1518',
  'FLOR Y SAMU': '4A176D',
  'NATI Y EXE': '166B31',
  'MATI Y ABI': '15586B',
  'PAO Y EXE': '777A0A',
};
const PALETA = ['8A421D', '8E1518', '4A176D', '166B31', '15586B', '777A0A', '6B1550', '1D4E8A'];
function colorLinea(linea: string): string {
  const k = linea.trim().toUpperCase();
  if (COLOR_LINEA[k]) return COLOR_LINEA[k];
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['AA', 'AB', 'AC', 'AD']);

/** Arma la hoja "TARJETAS DE CONSOLIDACION" idéntica a la planilla de la iglesia */
export function hojaTarjetasConFormato(XLSX: any, tarjetas: Record<string, any>[]): any {
  const ws: any = {};
  const ultima = Math.max(10 + tarjetas.length, 42) + 3;
  const celda = (dir: string, v: string | number, s: any, centrado = true) => {
    ws[dir] = {
      v,
      t: typeof v === 'number' ? 'n' : 's',
      s: { ...s, border: BORDES, alignment: { horizontal: centrado ? 'center' : 'left', vertical: 'center', wrapText: true } },
    };
  };

  // Fondo oscuro en toda la hoja, como el original
  for (let r = 1; r <= ultima; r++) {
    for (const c of COLS) ws[`${c}${r}`] = { v: '', t: 's', s: { fill: { fgColor: { rgb: FONDO } } } };
  }

  // Encabezados (filas 8 a 10)
  celda('H8', 'CONSOLIDACION', AZUL);
  for (const c of ['I', 'J', 'K', 'L', 'M', 'N']) celda(`${c}8`, '', AZUL);
  const titulos: [string, string][] = [
    ['B', 'CANT.'], ['C', 'TARJETA DE CONSOLIDACION'], ['D', 'LINEA - LIDER'],
    ['E', 'FECHA DE\nENTREGA'], ['F', 'FONOVISITA'], ['G', 'VISITA'],
  ];
  for (const [c, v] of titulos) {
    celda(`${c}9`, v, OSCURO_TITULO);
    celda(`${c}10`, '', OSCURO_TITULO);
  }
  celda('H9', 'PILARES', AZUL);
  for (const c of ['I', 'J', 'K', 'L']) celda(`${c}9`, '', AZUL);
  celda('M9', 'GRUPO DE VIDA', AZUL);
  celda('N9', 'ENCUENTRO', AZUL);
  celda('O9', 'OBSERVACION', AZUL);
  ['H', 'I', 'J', 'K', 'L'].forEach((c, i) => celda(`${c}10`, i + 1, OSCURO_TITULO));
  celda('M10', 'ASISTENCIA', OSCURO_TITULO);
  celda('N10', '', OSCURO_TITULO);
  celda('O10', '', AZUL);

  // Una fila por tarjeta, desde la 11
  tarjetas.forEach((t, i) => {
    const r = 11 + i;
    const fecha = t.fecha_entrada ?? t.fecha_reu ?? null;
    const opcion = (dir: string, valor: 'SI' | 'NO' | '' | 'ASISTIENDO') =>
      celda(dir, valor, valor === 'SI' || valor === 'ASISTIENDO' ? SI : valor === 'NO' ? NO : VACIO);
    celda(`B${r}`, i + 1, TEXTO);
    celda(`C${r}`, String(t.nombre ?? '').toUpperCase(), TEXTO, false);
    const linea = String(t.linea_lider ?? '').toUpperCase();
    celda(`D${r}`, linea, linea ? { fill: { fgColor: { rgb: colorLinea(linea) } }, font: { name: 'Arial', sz: 8, bold: true, color: { rgb: 'EDEDED' } } } : VACIO);
    celda(`E${r}`, fecha ? formatoFecha(String(fecha).slice(0, 10)) : '—', TEXTO);
    opcion(`F${r}`, t.fonovisita ? 'SI' : '');
    opcion(`G${r}`, t.visita ? 'SI' : '');
    ['H', 'I', 'J', 'K', 'L'].forEach((c, k) => opcion(`${c}${r}`, t[`pilar_${k + 1}`] || t.pilares ? 'SI' : ''));
    const gv = t.asistencia_gv ? String(t.asistencia_gv).toUpperCase() : t.comenzo_gv ? 'ASISTIENDO' : '';
    opcion(`M${r}`, gv === 'ASISTIENDO' ? 'ASISTIENDO' : gv === 'NO' ? 'NO' : '');
    opcion(`N${r}`, t.encuentro ? 'SI' : '');
    celda(`O${r}`, t.observacion ?? '', TEXTO);
  });

  ws['!ref'] = `A1:AD${ultima}`;
  ws['!merges'] = [
    XLSX.utils.decode_range('H8:N8'),
    ...['B', 'C', 'D', 'E', 'F', 'G'].map((c) => XLSX.utils.decode_range(`${c}9:${c}10`)),
    XLSX.utils.decode_range('H9:L9'),
  ];
  ws['!cols'] = [3, 7, 29, 20, 14, 12, 12, 6, 6, 6, 6, 6, 16, 20, 43, ...Array(15).fill(3)].map((w) => ({ wch: w }));
  ws['!rows'] = Array.from({ length: ultima }, (_, i) => ({ hpt: i === 7 ? 18 : i === 8 ? 25 : i === 9 ? 20 : i >= 10 ? 21 : 15 }));
  return ws;
}
