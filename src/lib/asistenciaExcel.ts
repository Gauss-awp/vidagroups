// ---------------------------------------------------------------------
// Planilla "ASISTENCIA GV" de la iglesia: un informe mensual debajo del otro.
// Se usa para exportar (idéntica a la planilla) y para importar el historial.
// ---------------------------------------------------------------------

export const MESES_MAYUS = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const ETIQUETAS_SEMANA = ['1era', '2 da', '3 era', '4 ta', '5ta'];
const COL_ASIST = ['C', 'E', 'G', 'I', 'K'];
const COL_CONSOL = ['D', 'F', 'H', 'J', 'L'];
const FILAS_MIEMBROS = 30; // como la planilla; si hay más hermanos, se agregan filas
const SEPARACION = 6; // filas vacías entre un mes y el siguiente
export const FALTAS_ALEJADO = 6; // faltas seguidas para pintarlo en rojo

export type RolEquipo = 'guia' | 'equipo' | null;

export interface DatosGrupoPlanilla {
  nombre: string;
  lider_supervisor: string | null;
  dia_horario: string | null;
  barrio: string | null;
  direccion: string | null;
}
export interface MiembroPlanilla {
  id: string;
  nombre: string;
  rol_equipo: RolEquipo;
  desde: string; // fecha en que se sumó (YYYY-MM-DD)
  alejado: boolean;
}
export interface ReunionPlanilla {
  id: string;
  fecha: string; // YYYY-MM-DD
  notas: string | null;
  ofrenda: number | null;
  material: string | null;
  compartio: string | null;
  asistencias: { miembro_id: string; presente: boolean; consolidado: boolean; motivo: string | null }[];
}

// ---------- Estilos (Calibri 11, grises de la planilla) ----------
const FUENTE = { name: 'Calibri', sz: 11 };
const BORDE = { style: 'thin', color: { rgb: '000000' } };
const BORDES = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
const COLOR_NOMBRE: Record<string, string> = { guia: '1155CC', equipo: '4A86E8', alejado: 'FF0000', normal: '000000' };

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** Arma la hoja completa del año: 12 informes mensuales, uno debajo del otro */
export function hojaAsistenciaConFormato(
  XLSX: any,
  anio: number,
  grupo: DatosGrupoPlanilla,
  miembros: MiembroPlanilla[],
  reuniones: ReunionPlanilla[],
  contactos: { miembro_id: string; fecha: string; nota: string | null }[] = []
): any {
  const ws: any = {};
  const merges: any[] = [];
  const set = (dir: string, v: string | number | null, s: any = {}, extra: any = {}) => {
    ws[dir] = {
      v: v ?? '',
      t: typeof v === 'number' ? 'n' : 's',
      s: { font: { ...FUENTE, ...(s.font ?? {}) }, ...s },
      ...extra,
    };
  };
  const merge = (rango: string) => merges.push(XLSX.utils.decode_range(rango));
  const bordes = (fila: number, desde = 'A', hasta = 'L') => {
    const cols = 'ABCDEFGHIJKL';
    for (let i = cols.indexOf(desde); i <= cols.indexOf(hasta); i++) {
      const dir = `${cols[i]}${fila}`;
      if (!ws[dir]) set(dir, '');
      ws[dir].s = { ...ws[dir].s, border: BORDES };
    }
  };

  // Orden de la lista: guías, equipo, miembros, y al final los que hace mucho no van
  const peso = (m: MiembroPlanilla) => (m.rol_equipo === 'guia' ? 0 : m.rol_equipo === 'equipo' ? 1 : m.alejado ? 3 : 2);
  const ordenados = miembros.slice().sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre));

  let s = 2;
  for (let mes = 0; mes < 12; mes++) {
    const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
    const finMes = `${prefijo}-31`;
    const delMes = reuniones.filter((r) => r.fecha.startsWith(prefijo)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 5);
    const lista = ordenados.filter((m) => m.desde <= finMes);
    const filas = Math.max(FILAS_MIEMBROS, lista.length);

    // Encabezado del informe
    set(`A${s}`, 'INFORME MENSUAL', { font: { sz: 18, bold: true } });
    set(`B${s}`, MESES_MAYUS[mes], { font: { sz: 18, bold: true }, alignment: { horizontal: 'center' } });
    set(`B${s + 1}`, anio, { font: { sz: 14, bold: true }, alignment: { horizontal: 'center' } });
    set(`A${s + 2}`, grupo.nombre, { font: { bold: true } });
    set(`B${s + 2}`, `LIDER SUPERVISOR: ${grupo.lider_supervisor ?? ''}`);
    set(`A${s + 3}`, `DIA Y HORARIO: ${grupo.dia_horario ?? ''}`);
    set(`B${s + 3}`, `BARRIO: ${grupo.barrio ?? ''}`);
    set(`A${s + 4}`, `DIRECCION: ${grupo.direccion ?? ''}`);

    // Títulos de la tabla
    set(`C${s + 7}`, 'SEMANAS/ Fechas', { alignment: { horizontal: 'center' } });
    merge(`A${s + 7}:B${s + 7}`);
    merge(`C${s + 7}:L${s + 7}`);
    set(`A${s + 8}`, 'NOMBRE Y APELLIDO', { font: { sz: 12, bold: true }, fill: { fgColor: { rgb: 'A6A6A6' } }, alignment: { horizontal: 'center', vertical: 'center' } });
    set(`B${s + 8}`, '', { fill: { fgColor: { rgb: 'A6A6A6' } } });
    set(`A${s + 9}`, '', { fill: { fgColor: { rgb: 'A6A6A6' } } });
    set(`B${s + 9}`, '', { fill: { fgColor: { rgb: 'A6A6A6' } } });
    merge(`A${s + 8}:B${s + 9}`);
    COL_ASIST.forEach((c, i) => {
      set(`${c}${s + 8}`, ETIQUETAS_SEMANA[i], { font: { bold: true }, fill: { fgColor: { rgb: 'A6A6A6' } }, alignment: { horizontal: 'center' } });
      set(`${COL_CONSOL[i]}${s + 8}`, '', { fill: { fgColor: { rgb: i === 0 ? 'B7B7B7' : 'A6A6A6' } } });
      set(`${c}${s + 9}`, 'Asist', { font: { sz: 12, bold: true }, fill: { fgColor: { rgb: 'CCCCCC' } }, alignment: { horizontal: 'center' } });
      set(`${COL_CONSOL[i]}${s + 9}`, 'Consol', { font: { sz: 12, bold: true }, fill: { fgColor: { rgb: 'CCCCCC' } }, alignment: { horizontal: 'center' } });
    });

    // Fila "Equipo de Trabajo": fecha de cada reunión y la nota de la semana
    set(`B${s + 10}`, 'Equipo de Trabajo', { font: { sz: 14, bold: true } });
    delMes.forEach((r, i) => {
      set(`${COL_ASIST[i]}${s + 10}`, dm(r.fecha), { alignment: { horizontal: 'center' } });
      if (r.notas) set(`${COL_CONSOL[i]}${s + 10}`, r.notas);
    });

    // Un renglón por hermano
    for (let k = 0; k < filas; k++) {
      const fila = s + 11 + k;
      const m = lista[k];
      const codigo = m?.rol_equipo === 'guia' ? 'G' : k + 1;
      set(`A${fila}`, codigo, { font: { bold: true }, alignment: { horizontal: 'center' } });
      if (m) {
        const tipo = m.rol_equipo === 'guia' ? 'guia' : m.rol_equipo === 'equipo' ? 'equipo' : m.alejado ? 'alejado' : 'normal';
        set(`B${fila}`, m.nombre, { font: { bold: true, color: { rgb: COLOR_NOMBRE[tipo] } } });
        delMes.forEach((r, i) => {
          const a = r.asistencias.find((x) => x.miembro_id === m.id);
          const valor = m.desde > r.fecha ? '-' : a?.presente ? 'P' : 'A';
          set(`${COL_ASIST[i]}${fila}`, valor);
          // "C" con el motivo como comentario: consolidación de la semana o "Ya lo contacté"
          const siguiente = delMes[i + 1]?.fecha ?? `${r.fecha.slice(0, 8)}99`;
          const contacto = contactos.find((c) => c.miembro_id === m.id && c.fecha >= r.fecha && c.fecha < siguiente);
          if (valor === 'A' && (a?.consolidado || contacto)) {
            const motivo = a?.motivo || contacto?.nota || 'Consolidado';
            const comentario: any = [{ a: 'VidaGroups', t: motivo }];
            comentario.hidden = true;
            set(`${COL_CONSOL[i]}${fila}`, 'C', {}, { c: comentario });
          }
        });
      }
    }

    // Pie: semanas, ofrenda, material y quién lo compartió
    const pie = s + 11 + filas;
    const filasPie: [string, (r: ReunionPlanilla) => string | number | null][] = [
      ['SEMANAS', () => null],
      ['OFRENDA', (r) => (r.ofrenda !== null && r.ofrenda !== undefined ? Number(r.ofrenda) : '-')],
      ['MATERIAL', (r) => r.material ?? '-'],
      ['QUIEN COMPARTIÓ MATERIAL ', (r) => r.compartio ?? '-'],
    ];
    filasPie.forEach(([titulo, valor], j) => {
      const fila = pie + j;
      set(`A${fila}`, titulo, { font: { bold: true }, alignment: { horizontal: j === 0 ? 'center' : 'left' } });
      merge(`A${fila}:B${fila}`);
      COL_ASIST.forEach((c, i) => {
        const r = delMes[i];
        const v = r ? valor(r) : j === 0 ? null : '';
        const esPlata = typeof v === 'number';
        set(`${c}${fila}`, v, { alignment: { horizontal: esPlata ? 'right' : 'left' } }, esPlata ? { z: '"$"#,##0' } : {});
        merge(`${c}${fila}:${COL_CONSOL[i]}${fila}`);
      });
    });

    // Bordes de toda la tabla
    for (let f = s + 7; f <= pie + 3; f++) bordes(f);
    s = pie + 4 + SEPARACION;
  }

  ws['!ref'] = `A1:L${s}`;
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 31 }, { wch: 29 }, ...Array(10).fill({ wch: 9 })];
  return ws;
}

// ---------------------------------------------------------------------
// Importar: leer la planilla (todos los meses) para cargar el historial
// ---------------------------------------------------------------------
export interface SemanaLeida {
  fecha: string;
  notas: string | null;
  ofrenda: number | null;
  material: string | null;
  compartio: string | null;
}
export interface MiembroLeido {
  nombre: string;
  rol: RolEquipo;
  valores: ({ asist: 'P' | 'A'; consolidado: boolean; motivo: string | null } | null)[];
}
export interface MesLeido {
  anio: number;
  mes: number; // 0 a 11
  semanas: (SemanaLeida | null)[];
  miembros: MiembroLeido[];
}
export interface PlanillaLeida {
  meses: MesLeido[];
  grupo: Partial<DatosGrupoPlanilla>;
}

const texto = (c: any) => (c === undefined || c === null ? '' : String(c.w ?? c.v ?? '').trim());
const sinTilde = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function fechaDeCelda(c: any, anio: number, mes: number): string | null {
  if (!c) return null;
  if (typeof c.v === 'number' && c.v > 20000) {
    // Fecha guardada como número de Excel
    const d = new Date(Math.round((c.v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const m = texto(c).match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mesLeido = Number(m[2]) - 1;
  let a = m[3] ? Number(m[3]) : anio;
  if (a < 100) a += 2000;
  // Si la fecha es de diciembre en el informe de enero (o al revés), ajustar el año
  if (!m[3] && mes === 0 && mesLeido === 11) a -= 1;
  if (!m[3] && mes === 11 && mesLeido === 0) a += 1;
  if (dia < 1 || dia > 31 || mesLeido < 0 || mesLeido > 11) return null;
  return `${a}-${String(mesLeido + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const plata = (c: any): number | null => {
  if (!c) return null;
  if (typeof c.v === 'number') return c.v;
  const t = texto(c).replace(/[^0-9,.-]/g, '');
  if (!t || t === '-') return null;
  // "$12.000" o "$12,000" → 12000; "$30,340.00" → 30340
  const n = Number(t.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

/** Lee la hoja de asistencia (formato de la iglesia) y devuelve cada mes con sus semanas y hermanos */
export function leerPlanillaAsistencia(XLSX: any, ws: any, anioPorDefecto: number): PlanillaLeida {
  const rango = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:L1');
  const cel = (col: string, fila: number) => ws[`${col}${fila}`];
  const meses: MesLeido[] = [];
  const grupo: Partial<DatosGrupoPlanilla> = {};

  for (let f = 1; f <= rango.e.r + 1; f++) {
    if (!/INFORME MENSUAL/i.test(texto(cel('A', f)))) continue;
    const mes = MESES_MAYUS.indexOf(sinTilde(texto(cel('B', f))));
    if (mes < 0) continue;
    const anio = Number(texto(cel('B', f + 1))) || anioPorDefecto;

    // Datos del grupo (los del primer informe que los tenga)
    for (let g = f + 2; g <= f + 6; g++) {
      for (const col of ['A', 'B']) {
        const t = texto(cel(col, g));
        const valor = (clave: RegExp) => t.replace(clave, '').trim() || null;
        if (/^LIDER SUPERVISOR:/i.test(t) && !grupo.lider_supervisor) grupo.lider_supervisor = valor(/^LIDER SUPERVISOR:/i);
        if (/^DIA Y HORARIO:/i.test(t) && !grupo.dia_horario) grupo.dia_horario = valor(/^DIA Y HORARIO:/i);
        if (/^BARRIO:/i.test(t) && !grupo.barrio) grupo.barrio = valor(/^BARRIO:/i);
        if (/^DIRECCI[OÓ]N:/i.test(t) && !grupo.direccion) grupo.direccion = valor(/^DIRECCI[OÓ]N:/i);
      }
    }

    // Fila "Equipo de Trabajo": fechas y notas de cada semana
    let equipo = -1;
    for (let g = f + 5; g <= f + 20; g++) {
      if (/EQUIPO DE TRABAJO/i.test(texto(cel('B', g)))) {
        equipo = g;
        break;
      }
    }
    if (equipo < 0) continue;
    const semanas: (SemanaLeida | null)[] = COL_ASIST.map((c, i) => {
      const fecha = fechaDeCelda(cel(c, equipo), anio, mes);
      return fecha ? { fecha, notas: texto(cel(COL_CONSOL[i], equipo)) || null, ofrenda: null, material: null, compartio: null } : null;
    });

    // Hermanos, hasta la fila "SEMANAS"
    const miembros: MiembroLeido[] = [];
    let g = equipo + 1;
    for (; g <= rango.e.r + 1 && !/^SEMANAS$/i.test(texto(cel('A', g))); g++) {
      const nombre = texto(cel('B', g));
      if (!nombre) continue;
      const codigo = texto(cel('A', g)).toUpperCase();
      const rol: RolEquipo = codigo === 'G' ? 'guia' : ['A', 'C1', 'C2', 'T'].includes(codigo) ? 'equipo' : null;
      const valores = COL_ASIST.map((c, i) => {
        if (!semanas[i]) return null;
        const v = texto(cel(c, g)).toUpperCase();
        if (v !== 'P' && v !== 'A') return null;
        const cc = cel(COL_CONSOL[i], g);
        const consolidado = texto(cc).toUpperCase() === 'C';
        const motivo = cc?.c?.map((x: any) => x.t).join(' ').trim() || null;
        return { asist: v as 'P' | 'A', consolidado, motivo };
      });
      miembros.push({ nombre, rol, valores });
    }

    // Pie: ofrenda, material y quién compartió
    for (let p = g; p <= g + 4; p++) {
      const titulo = sinTilde(texto(cel('A', p)));
      COL_ASIST.forEach((c, i) => {
        const sem = semanas[i];
        if (!sem) return;
        const v = texto(cel(c, p));
        if (titulo.startsWith('OFRENDA')) sem.ofrenda = plata(cel(c, p));
        if (titulo.startsWith('MATERIAL') && v && v !== '-') sem.material = v;
        if (titulo.startsWith('QUIEN') && v && v !== '-') sem.compartio = v;
      });
    }

    if (semanas.some(Boolean)) meses.push({ anio, mes, semanas, miembros });
  }
  return { meses, grupo };
}
