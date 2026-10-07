// ---------------------------------------------------------------------
// Para el importador: encontrar hermanos que probablemente sean el mismo
// aunque estén escritos distinto ("Catalina Cordi" / "Catt Cordi").
// ---------------------------------------------------------------------

export const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** Qué tan parecidos son dos nombres, de 0 (nada) a 1 (iguales) */
export function parecido(a: string, b: string): number {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tx = x.split(' ');
  const ty = y.split(' ');
  let puntaje = 1 - distancia(x, y) / Math.max(x.length, y.length);
  // Uno contiene al otro: "Esteban" / "Esteban Gómez"
  if (x.includes(y) || y.includes(x)) puntaje = Math.max(puntaje, 0.85);
  // Mismo apellido y el nombre empieza igual: "Catalina Cordi" / "Catt Cordi"
  if (tx.length > 1 && ty.length > 1 && tx[tx.length - 1] === ty[ty.length - 1] && tx[0].slice(0, 3) === ty[0].slice(0, 3)) {
    puntaje = Math.max(puntaje, 0.8);
  }
  // Mismo nombre, uno sin apellido
  if ((tx.length === 1 || ty.length === 1) && tx[0] === ty[0]) puntaje = Math.max(puntaje, 0.75);
  return puntaje;
}

/** Candidatos parecidos (de más a menos), con un mínimo de parecido */
export function candidatosParecidos<T extends { nombre: string }>(nombre: string, lista: T[], minimo = 0.55, maximo = 3): (T & { puntaje: number })[] {
  return lista
    .map((x) => ({ ...x, puntaje: parecido(nombre, x.nombre) }))
    .filter((x) => x.puntaje >= minimo)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, maximo);
}
