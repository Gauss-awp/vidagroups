// ---------------------------------------------------------------------
// Avatars de personajes bíblicos: caras ilustradas, dibujadas con SVG
// dentro de la app (no se suben imágenes). En la base solo se guarda la
// clave del personaje, por ejemplo 'david'.
// ---------------------------------------------------------------------
import React, { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

type Peinado = 'corto' | 'rulos' | 'calvo' | 'largo' | 'velo' | 'turbante';
type Objeto =
  | 'arca' | 'estrellas' | 'vara' | 'trompeta' | 'antorcha' | 'lampara' | 'arpa' | 'fuego' | 'leon' | 'pez'
  | 'agua' | 'llave' | 'pergamino' | 'libro' | 'ladrillos' | 'flor' | 'espigas' | 'palmera' | 'corazon' | 'cetro'
  | 'frasco' | 'tela' | 'jarra' | 'pandero' | 'carpa' | 'tunica';

export interface Personaje {
  nombre: string;
  detalle: string;
  cita: string;
  mujer?: boolean;
  fondo: string;
  piel: string;
  pelo: string;
  peinado: Peinado;
  tela?: string; // velo o turbante
  barba?: 'corta' | 'larga';
  barbaColor?: string;
  ropa: string;
  tocado?: 'corona' | 'vincha';
  aros?: boolean;
  objeto: Objeto;
}

const P1 = '#F1C29A';
const P2 = '#E2A97E';
const P3 = '#C68A5E';
const P4 = '#9C6B47';
const NEGRO = '#2B2420';
const CASTANO = '#5B3A24';
const CANOSO = '#D6D3D1';
const BLANCO = '#F5F5F4';

export const PERSONAJES: Record<string, Personaje> = {
  noe: { nombre: 'Noé', detalle: 'Construyó el arca', cita: 'Génesis 6:14', fondo: '#DBEAFE', piel: P2, pelo: BLANCO, peinado: 'calvo', barba: 'larga', barbaColor: BLANCO, ropa: '#7C5A3A', objeto: 'arca' },
  abraham: { nombre: 'Abraham', detalle: 'Contó las estrellas: así sería su descendencia', cita: 'Génesis 15:5', fondo: '#E0E7FF', piel: P3, pelo: CANOSO, peinado: 'turbante', tela: '#E7E5E4', barba: 'larga', barbaColor: CANOSO, ropa: '#57534E', objeto: 'estrellas' },
  sara: { nombre: 'Sara', detalle: 'Rió de alegría con Isaac', cita: 'Génesis 21:6', mujer: true, fondo: '#FFEDD5', piel: P2, pelo: CANOSO, peinado: 'velo', tela: '#FDBA74', ropa: '#C2410C', aros: true, objeto: 'flor' },
  jose: { nombre: 'José', detalle: 'La túnica especial que le regaló su padre', cita: 'Génesis 37:3', fondo: '#FEF3C7', piel: P2, pelo: NEGRO, peinado: 'corto', ropa: '#92400E', objeto: 'tunica' },
  moises: { nombre: 'Moisés', detalle: 'La vara que abrió el mar', cita: 'Éxodo 14:16', fondo: '#FEF3C7', piel: P3, pelo: '#9CA3AF', peinado: 'largo', barba: 'larga', barbaColor: '#D1D5DB', ropa: '#B45309', objeto: 'vara' },
  miriam: { nombre: 'Miriam', detalle: 'Cantó con el pandero', cita: 'Éxodo 15:20', mujer: true, fondo: '#FAE8FF', piel: P3, pelo: NEGRO, peinado: 'largo', ropa: '#A21CAF', tocado: 'vincha', aros: true, objeto: 'pandero' },
  josue: { nombre: 'Josué', detalle: 'Las trompetas de Jericó', cita: 'Josué 6:20', fondo: '#FEF9C3', piel: P3, pelo: CASTANO, peinado: 'corto', barba: 'corta', barbaColor: CASTANO, ropa: '#4D7C0F', objeto: 'trompeta' },
  debora: { nombre: 'Débora', detalle: 'Juzgaba bajo la palmera', cita: 'Jueces 4:5', mujer: true, fondo: '#DCFCE7', piel: P4, pelo: NEGRO, peinado: 'largo', ropa: '#15803D', tocado: 'vincha', aros: true, objeto: 'palmera' },
  gedeon: { nombre: 'Gedeón', detalle: 'Cántaros y antorchas', cita: 'Jueces 7:20', fondo: '#FFEDD5', piel: P2, pelo: CASTANO, peinado: 'rulos', barba: 'corta', barbaColor: CASTANO, ropa: '#9A3412', objeto: 'antorcha' },
  rut: { nombre: 'Rut', detalle: 'Recogía espigas en el campo', cita: 'Rut 2:2', mujer: true, fondo: '#FEF9C3', piel: P1, pelo: '#7C2D12', peinado: 'velo', tela: '#D97706', ropa: '#65A30D', objeto: 'espigas' },
  ana: { nombre: 'Ana', detalle: 'Oró con todo el corazón', cita: '1 Samuel 1:27', mujer: true, fondo: '#FCE7F3', piel: P2, pelo: CASTANO, peinado: 'velo', tela: '#F9A8D4', ropa: '#BE185D', objeto: 'corazon' },
  samuel: { nombre: 'Samuel', detalle: '"Habla, que tu siervo oye"', cita: '1 Samuel 3:10', fondo: '#EDE9FE', piel: P1, pelo: CASTANO, peinado: 'corto', ropa: '#6D28D9', objeto: 'lampara' },
  david: { nombre: 'David', detalle: 'Pastor, músico y rey', cita: 'Salmo 23:1', fondo: '#E0E7FF', piel: P2, pelo: '#3F2A1D', peinado: 'rulos', ropa: '#2563EB', tocado: 'corona', objeto: 'arpa' },
  elias: { nombre: 'Elías', detalle: 'El fuego del cielo', cita: '1 Reyes 18:38', fondo: '#FEE2E2', piel: P3, pelo: CASTANO, peinado: 'largo', barba: 'larga', barbaColor: CASTANO, ropa: '#78350F', objeto: 'fuego' },
  ester: { nombre: 'Ester', detalle: 'Reina "para un momento como este"', cita: 'Ester 4:14', mujer: true, fondo: '#FCE7F3', piel: P3, pelo: NEGRO, peinado: 'largo', ropa: '#9D174D', tocado: 'corona', aros: true, objeto: 'cetro' },
  nehemias: { nombre: 'Nehemías', detalle: 'Reconstruyó el muro', cita: 'Nehemías 6:15', fondo: '#F1F5F9', piel: P3, pelo: NEGRO, peinado: 'turbante', tela: '#0F766E', barba: 'corta', barbaColor: NEGRO, ropa: '#334155', objeto: 'ladrillos' },
  daniel: { nombre: 'Daniel', detalle: 'Fiel en el foso de los leones', cita: 'Daniel 6:22', fondo: '#FFEDD5', piel: P4, pelo: NEGRO, peinado: 'corto', ropa: '#7E22CE', objeto: 'leon' },
  jonas: { nombre: 'Jonás', detalle: 'Tres días en el gran pez', cita: 'Jonás 2:10', fondo: '#CFFAFE', piel: P2, pelo: CASTANO, peinado: 'rulos', barba: 'corta', barbaColor: CASTANO, ropa: '#0E7490', objeto: 'pez' },
  maria: { nombre: 'María', detalle: 'El perfume de nardo', cita: 'Juan 12:3', mujer: true, fondo: '#F3E8FF', piel: P1, pelo: CASTANO, peinado: 'velo', tela: '#C4B5FD', ropa: '#6D28D9', objeto: 'frasco' },
  marta: { nombre: 'Marta', detalle: 'Servía con alegría', cita: 'Lucas 10:38', mujer: true, fondo: '#FFE4E6', piel: P2, pelo: NEGRO, peinado: 'velo', tela: '#FDA4AF', ropa: '#B91C1C', objeto: 'jarra' },
  juan: { nombre: 'Juan', detalle: 'Bautizaba en el Jordán', cita: 'Mateo 3:11', fondo: '#E0F2FE', piel: P3, pelo: '#3F2A1D', peinado: 'largo', barba: 'corta', barbaColor: '#3F2A1D', ropa: '#A16207', objeto: 'agua' },
  pedro: { nombre: 'Pedro', detalle: 'Pescador de personas', cita: 'Mateo 16:19', fondo: '#CFFAFE', piel: P3, pelo: '#6B4F3A', peinado: 'rulos', barba: 'corta', barbaColor: '#6B4F3A', ropa: '#475569', objeto: 'llave' },
  pablo: { nombre: 'Pablo', detalle: 'Escribió cartas a las iglesias', cita: '2 Timoteo 4:7', fondo: '#EDE9FE', piel: P2, pelo: '#57534E', peinado: 'calvo', barba: 'corta', barbaColor: '#57534E', ropa: '#4C1D95', objeto: 'pergamino' },
  lidia: { nombre: 'Lidia', detalle: 'Vendedora de púrpura', cita: 'Hechos 16:14', mujer: true, fondo: '#F5D0FE', piel: P2, pelo: CASTANO, peinado: 'largo', ropa: '#7E22CE', aros: true, objeto: 'tela' },
  priscila: { nombre: 'Priscila', detalle: 'Fabricaba carpas y enseñaba', cita: 'Hechos 18:3', mujer: true, fondo: '#ECFCCB', piel: P3, pelo: NEGRO, peinado: 'velo', tela: '#A3E635', ropa: '#3F6212', objeto: 'carpa' },
  timoteo: { nombre: 'Timoteo', detalle: '"Que nadie te menosprecie por ser joven"', cita: '1 Timoteo 4:12', fondo: '#DBEAFE', piel: P1, pelo: '#A16207', peinado: 'corto', ropa: '#1D4ED8', objeto: 'libro' },
};

/** Orden para elegir: por la historia bíblica */
export const ORDEN_PERSONAJES = Object.keys(PERSONAJES);

export const esPersonaje = (clave: string | null | undefined): clave is string => !!clave && clave in PERSONAJES;

const ORO = '#F59E0B';

function ObjetoDibujo({ objeto }: { objeto: Objeto }) {
  switch (objeto) {
    case 'arca':
      return (
        <G>
          {/* Agua */}
          <Path d="M60 44 Q66 40 72 44 Q78 48 84 44 Q90 40 96 44 L100 50 L58 50Z" fill="#60A5FA" />
          {/* Casco */}
          <Path d="M60 32 L100 32 L93 44 L66 44Z" fill="#92400E" />
          <Line x1={62} y1={37} x2={97} y2={37} stroke="#78350F" strokeWidth={1} />
          {/* Casa con techo */}
          <Rect x={70} y={22} width={20} height={10} fill="#B45309" />
          <Path d="M67 23 L80 14 L93 23Z" fill="#78350F" />
          <Rect x={78} y={25} width={4} height={4} fill="#FDE68A" />
        </G>
      );
    case 'estrellas':
      return (
        <G fill="#FBBF24">
          {[[16, 22, 4], [84, 18, 5], [90, 38, 3], [10, 40, 3], [76, 8, 3]].map(([x, y, r], i) => (
            <Path key={i} d={`M${x} ${y - r * 2} L${x + r * 0.6} ${y - r * 0.6} L${x + r * 2} ${y} L${x + r * 0.6} ${y + r * 0.6} L${x} ${y + r * 2} L${x - r * 0.6} ${y + r * 0.6} L${x - r * 2} ${y} L${x - r * 0.6} ${y - r * 0.6}Z`} />
          ))}
        </G>
      );
    case 'vara':
      return <Path d="M82 98 L82 26 Q82 14 91 17" fill="none" stroke="#78350F" strokeWidth={4} strokeLinecap="round" />;
    case 'trompeta':
      return (
        <G>
          <Path d="M70 34 L92 20 L94 40Z" fill={ORO} />
          <Line x1={60} y1={40} x2={72} y2={33} stroke={ORO} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case 'antorcha':
      return (
        <G>
          <Path d="M84 14 Q93 26 86 34 Q88 27 84 24 Q80 29 82 34 Q75 26 84 14Z" fill="#F97316" />
          <Path d="M76 34 L92 34 L90 50 Q84 54 78 50Z" fill="#B45309" />
        </G>
      );
    case 'lampara':
      return (
        <G>
          <Ellipse cx={84} cy={34} rx={11} ry={5} fill={ORO} />
          <Path d="M93 31 Q97 22 93 18 Q91 25 89 29Z" fill="#F97316" />
        </G>
      );
    case 'arpa':
      return (
        <G fill="none" stroke={ORO} strokeWidth={2.5} strokeLinecap="round">
          <Path d="M74 14 Q92 12 92 22 L78 54 Z" />
          <Line x1={80} y1={18} x2={78} y2={46} strokeWidth={1} />
          <Line x1={85} y1={18} x2={81} y2={40} strokeWidth={1} />
          <Line x1={89} y1={20} x2={84} y2={32} strokeWidth={1} />
        </G>
      );
    case 'fuego':
      return (
        <G>
          <Path d="M84 8 Q98 26 89 40 Q92 30 85 26 Q79 34 81 42 Q70 30 84 8Z" fill="#EF4444" />
          <Path d="M84 22 Q91 32 86 40 Q84 34 82 40 Q78 32 84 22Z" fill="#FBBF24" />
        </G>
      );
    case 'leon':
      return (
        <G>
          <Circle cx={84} cy={28} r={12} fill="#EA580C" />
          <Circle cx={84} cy={29} r={7.5} fill="#FBBF24" />
          <Circle cx={81.5} cy={27.5} r={1.2} fill={NEGRO} />
          <Circle cx={86.5} cy={27.5} r={1.2} fill={NEGRO} />
          <Path d="M82.5 31.5 L85.5 31.5 L84 33Z" fill={NEGRO} />
        </G>
      );
    case 'pez':
      return (
        <G fill="#0891B2">
          <Ellipse cx={82} cy={28} rx={11} ry={6} />
          <Path d="M71 28 L63 21 L63 35Z" />
          <Circle cx={87} cy={27} r={1.3} fill={BLANCO} />
        </G>
      );
    case 'agua':
      return (
        <G fill="#38BDF8">
          <Path d="M84 12 Q91 22 84 26 Q77 22 84 12Z" />
          <Path d="M16 22 Q22 30 16 33 Q10 30 16 22Z" />
          <Path d="M90 32 Q94 38 90 40 Q86 38 90 32Z" />
        </G>
      );
    case 'llave':
      return (
        <G stroke={ORO} strokeWidth={3} fill="none" strokeLinecap="round">
          <Circle cx={84} cy={18} r={5} />
          <Line x1={84} y1={23} x2={84} y2={44} />
          <Line x1={84} y1={38} x2={89} y2={38} />
          <Line x1={84} y1={43} x2={88} y2={43} />
        </G>
      );
    case 'pergamino':
      return (
        <G>
          <Rect x={75} y={16} width={16} height={26} fill="#FEF3C7" />
          <Rect x={72} y={13} width={22} height={5} rx={2.5} fill="#D97706" />
          <Rect x={72} y={40} width={22} height={5} rx={2.5} fill="#D97706" />
          <Line x1={78} y1={24} x2={88} y2={24} stroke="#A16207" strokeWidth={1} />
          <Line x1={78} y1={29} x2={88} y2={29} stroke="#A16207" strokeWidth={1} />
          <Line x1={78} y1={34} x2={86} y2={34} stroke="#A16207" strokeWidth={1} />
        </G>
      );
    case 'libro':
      return (
        <G>
          <Rect x={72} y={20} width={22} height={17} rx={2} fill="#92400E" />
          <Line x1={83} y1={20} x2={83} y2={37} stroke="#FEF3C7" strokeWidth={1.5} />
        </G>
      );
    case 'ladrillos':
      return (
        <G fill="#B45309" stroke="#FEF3C7" strokeWidth={1}>
          <Rect x={70} y={14} width={12} height={7} />
          <Rect x={82} y={14} width={12} height={7} />
          <Rect x={76} y={21} width={12} height={7} />
          <Rect x={70} y={28} width={12} height={7} />
          <Rect x={82} y={28} width={12} height={7} />
        </G>
      );
    case 'flor':
      return (
        <G>
          {[[84, 16], [91, 23], [84, 30], [77, 23]].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={5} fill="#FB923C" />
          ))}
          <Circle cx={84} cy={23} r={3.5} fill="#FDE047" />
        </G>
      );
    case 'espigas':
      return (
        <G>
          <Line x1={84} y1={20} x2={80} y2={70} stroke="#A16207" strokeWidth={2} />
          {[[84, 14], [80, 21], [88, 21], [80, 29], [88, 29]].map(([x, y], i) => (
            <Ellipse key={i} cx={x} cy={y} rx={3} ry={5.5} fill="#EAB308" />
          ))}
        </G>
      );
    case 'palmera':
      return (
        <G>
          <Path d="M84 26 Q80 50 84 80" fill="none" stroke="#92400E" strokeWidth={4} />
          <Path d="M84 26 Q70 18 62 26 Q74 22 84 26 Q78 12 70 10 Q82 12 84 26 Q90 10 98 12 Q88 16 84 26 Q96 20 100 30 Q92 22 84 26Z" fill="#16A34A" />
        </G>
      );
    case 'corazon':
      return <Path d="M84 38 Q70 28 74 20 Q78 14 84 21 Q90 14 94 20 Q98 28 84 38Z" fill="#F43F5E" />;
    case 'cetro':
      return (
        <G>
          <Line x1={84} y1={24} x2={80} y2={74} stroke={ORO} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={84} cy={20} r={5} fill={ORO} />
        </G>
      );
    case 'frasco':
      return (
        <G>
          <Path d="M80 22 L88 22 L88 27 Q95 31 93 42 Q84 48 75 42 Q73 31 80 27Z" fill="#C4B5FD" />
          <Rect x={79} y={16} width={10} height={6} rx={1.5} fill="#7C3AED" />
        </G>
      );
    case 'tela':
      return <Path d="M6 22 Q24 14 40 22 L34 40 Q22 34 10 40Z" fill="#A855F7" />;
    case 'jarra':
      return (
        <G>
          <Path d="M77 18 L91 18 L90 22 Q96 30 92 40 Q84 46 76 40 Q72 30 78 22Z" fill="#C2410C" />
          <Path d="M92 24 Q99 26 95 34" fill="none" stroke="#C2410C" strokeWidth={2.5} />
        </G>
      );
    case 'pandero':
      return (
        <G>
          <Circle cx={84} cy={26} r={11} fill="#FDE68A" stroke="#B45309" strokeWidth={3} />
          {[[84, 15], [95, 26], [84, 37], [73, 26]].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={2} fill={ORO} />
          ))}
        </G>
      );
    case 'carpa':
      return (
        <G>
          <Path d="M84 12 L98 40 L70 40Z" fill="#65A30D" />
          <Path d="M84 22 L90 40 L78 40Z" fill="#365314" />
        </G>
      );
    case 'tunica':
      return null; // la túnica de colores va en la ropa
  }
}

function Cara({ p }: { p: Personaje }) {
  const largo = p.peinado === 'largo' || p.peinado === 'velo';
  const colorAtras = p.peinado === 'velo' ? p.tela ?? p.pelo : p.pelo;
  const oscuro = p.barbaColor ?? p.pelo;
  return (
    <G>
      {/* Pelo largo o velo, detrás de la cara */}
      {largo ? <Path d="M29 52 Q27 24 50 23 Q73 24 71 52 L74 88 L26 88Z" fill={colorAtras} /> : null}

      {/* Ropa y cuello */}
      <Ellipse cx={50} cy={100} rx={36} ry={24} fill={p.ropa} />
      {p.objeto === 'tunica' ? (
        <G>
          {/* Túnica a rayas en tonos tierra */}
          <Rect x={36} y={80} width={5} height={22} fill="#D97706" />
          <Rect x={44} y={78} width={3} height={24} fill="#FDE68A" />
          <Rect x={53} y={78} width={3} height={24} fill="#FDE68A" />
          <Rect x={59} y={80} width={5} height={22} fill="#D97706" />
        </G>
      ) : null}
      <Rect x={44} y={66} width={12} height={12} fill={p.piel} />
      <Rect x={44} y={72} width={12} height={4} fill="#000" opacity={0.08} />

      {/* Cara */}
      <Ellipse cx={50} cy={50} rx={18} ry={21} fill={p.piel} />

      {/* Pelo de arriba */}
      {p.peinado === 'corto' ? <Path d="M32 47 Q32 27 50 27 Q68 27 68 47 Q60 35 50 35 Q40 35 32 47Z" fill={p.pelo} /> : null}
      {p.peinado === 'rulos' ? (
        <G fill={p.pelo}>
          <Circle cx={36} cy={39} r={7} />
          <Circle cx={43} cy={31} r={7} />
          <Circle cx={52} cy={29} r={7} />
          <Circle cx={61} cy={32} r={7} />
          <Circle cx={66} cy={40} r={6} />
        </G>
      ) : null}
      {p.peinado === 'calvo' ? (
        <G fill={p.pelo}>
          <Ellipse cx={32.5} cy={48} rx={3.5} ry={7} />
          <Ellipse cx={67.5} cy={48} rx={3.5} ry={7} />
        </G>
      ) : null}
      {p.peinado === 'largo' ? <Path d="M33 45 Q37 30 50 30 Q63 30 67 45 Q59 37 50 37 Q41 37 33 45Z" fill={p.pelo} /> : null}
      {p.peinado === 'velo' ? (
        <G>
          <Path d="M34 46 Q38 34 50 34 Q62 34 66 46 Q58 39 50 40 Q42 39 34 46Z" fill={p.pelo} />
          <Path d="M31 54 Q30 28 50 27 Q70 28 69 54 Q64 34 50 33 Q36 34 31 54Z" fill={p.tela} />
          {/* Pliegues para que se lea como tela y no como pelo */}
          <Path d="M31 54 Q36 34 50 33 Q64 34 69 54" fill="none" stroke="#000" strokeOpacity={0.18} strokeWidth={1.5} />
          <Path d="M27 70 Q29 80 27 88 M73 70 Q71 80 73 88" fill="none" stroke="#000" strokeOpacity={0.15} strokeWidth={1.5} />
        </G>
      ) : null}
      {p.peinado === 'turbante' ? (
        <G>
          <Path d="M31 45 Q29 21 50 21 Q71 21 69 45 Q61 33 50 33 Q39 33 31 45Z" fill={p.tela} />
          <Path d="M33 37 Q50 29 67 37" fill="none" stroke="#000" strokeOpacity={0.15} strokeWidth={2} />
        </G>
      ) : null}

      {/* Barba */}
      {p.barba === 'corta' ? <Path d="M32 52 Q33 74 50 76 Q67 74 68 52 Q61 62 50 62 Q39 62 32 52Z" fill={p.barbaColor} /> : null}
      {p.barba === 'larga' ? <Path d="M32 52 Q31 86 50 92 Q69 86 68 52 Q61 63 50 63 Q39 63 32 52Z" fill={p.barbaColor} /> : null}

      {/* Ojos y boca */}
      <Circle cx={43} cy={49} r={2} fill={NEGRO} />
      <Circle cx={57} cy={49} r={2} fill={NEGRO} />
      {p.barba ? (
        <Path d="M43 60 Q50 56 57 60" fill="none" stroke={oscuro} strokeWidth={2.5} strokeLinecap="round" />
      ) : (
        <G>
          <Path d="M44 58 Q50 64 56 58" fill="none" stroke="#9A3412" strokeWidth={2} strokeLinecap="round" />
          <Circle cx={39} cy={56} r={2.5} fill="#F87171" opacity={0.25} />
          <Circle cx={61} cy={56} r={2.5} fill="#F87171" opacity={0.25} />
        </G>
      )}

      {/* Corona, vincha y aros */}
      {p.tocado === 'corona' ? <Path d="M38 32 L41 18 L46 26 L50 15 L54 26 L59 18 L62 32Z" fill={ORO} /> : null}
      {p.tocado === 'vincha' ? <Rect x={33} y={34} width={34} height={4} rx={2} fill={ORO} /> : null}
      {p.aros ? (
        <G fill={ORO}>
          <Circle cx={32} cy={58} r={2.5} />
          <Circle cx={68} cy={58} r={2.5} />
        </G>
      ) : null}
    </G>
  );
}

/** La cara del personaje en un círculo */
export function AvatarBiblico({ personaje, tamano = 40 }: { personaje: string; tamano?: number }) {
  const id = `av${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const p = PERSONAJES[personaje];
  if (!p) return null;
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={id}>
          <Circle cx={50} cy={50} r={50} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        <Circle cx={50} cy={50} r={50} fill={p.fondo} />
        <ObjetoDibujo objeto={p.objeto} />
        <Cara p={p} />
      </G>
    </Svg>
  );
}
