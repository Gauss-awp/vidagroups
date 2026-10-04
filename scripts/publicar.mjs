// ---------------------------------------------------------------------
// Publica una actualización (EAS Update) para las apps ya instaladas.
//   npm run publicar:pruebas -- "qué cambió"
//   npm run publicar:produccion -- "qué cambió"
// Antes de publicar revisa que el .env tenga la URL y la key del ambiente,
// para no mandarle a toda la iglesia una app que no se puede conectar.
// ---------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const canal = process.argv[2];
let mensaje = process.argv.slice(3).join(' ').trim();

if (!['pruebas', 'produccion'].includes(canal)) {
  console.error('Usá: npm run publicar:pruebas -- "mensaje"  o  npm run publicar:produccion -- "mensaje"');
  process.exit(1);
}

// Leer el .env
const env = {};
if (existsSync('.env')) {
  for (const linea of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const sufijo = canal === 'produccion' ? 'PRODUCCION' : 'PRUEBAS';
const url = env[`EXPO_PUBLIC_SUPABASE_URL_${sufijo}`] ?? (canal === 'pruebas' ? env.EXPO_PUBLIC_SUPABASE_URL : undefined);
const key = env[`EXPO_PUBLIC_SUPABASE_KEY_${sufijo}`] ?? (canal === 'pruebas' ? env.EXPO_PUBLIC_SUPABASE_ANON_KEY : undefined);

const malo = (v) => !v || /PEGAR|PROYECTO-|\.\.\.$/.test(v);
if (malo(url) || malo(key)) {
  console.error(`\n✋ En el .env faltan EXPO_PUBLIC_SUPABASE_URL_${sufijo} y/o EXPO_PUBLIC_SUPABASE_KEY_${sufijo}.`);
  console.error('   Completalos antes de publicar: la app instalada los necesita para conectarse.\n');
  process.exit(1);
}
if (key.startsWith('sb_secret_')) {
  console.error('\n✋ La key del .env es una SECRET key. Usá la publishable (sb_publishable_...).\n');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
if (!mensaje) mensaje = (await rl.question('¿Qué cambió en esta actualización? ')).trim() || 'Actualización';
if (canal === 'produccion') {
  const ok = (await rl.question(`\nVas a publicar en PRODUCCIÓN (la app de toda la iglesia):\n  "${mensaje}"\n¿Seguro? (s/n) `)).trim().toLowerCase();
  if (ok !== 's' && ok !== 'si' && ok !== 'sí') {
    console.log('Cancelado.');
    process.exit(0);
  }
}
rl.close();

console.log(`\nPublicando en el canal "${canal}"...\n`);
execSync(`npx eas-cli@latest update --channel ${canal} --message "${mensaje.replace(/"/g, "'")}"`, { stdio: 'inherit' });
console.log('\n✅ Listo. Los celulares la descargan la próxima vez que abren la app.\n');
