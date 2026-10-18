// ---------------------------------------------------------------------
// Publica la versión web (para iPhone) en EAS Hosting.
//   npm run publicar-web:pruebas
//   npm run publicar-web:produccion
// La web toma el ambiente de acá (no del .env), así nunca se mezcla.
// ---------------------------------------------------------------------
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const canal = process.argv[2];
if (!['pruebas', 'produccion'].includes(canal)) {
  console.error('Usá: npm run publicar-web:pruebas  o  npm run publicar-web:produccion');
  process.exit(1);
}

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
if (!url || !key || /PEGAR|PROYECTO-/.test(url + key)) {
  console.error(`\n✋ En el .env faltan EXPO_PUBLIC_SUPABASE_URL_${sufijo} y/o EXPO_PUBLIC_SUPABASE_KEY_${sufijo}.\n`);
  process.exit(1);
}
if (key.startsWith('sb_secret_')) {
  console.error('\n✋ La key del .env es una SECRET key. Usá la publishable (sb_publishable_...).\n');
  process.exit(1);
}

if (canal === 'produccion') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ok = (await rl.question('\nVas a publicar la web de PRODUCCIÓN (la que usa la iglesia). ¿Seguro? (s/n) ')).trim().toLowerCase();
  rl.close();
  if (!['s', 'si', 'sí'].includes(ok)) process.exit(0);
}

const entorno = {
  ...process.env,
  EXPO_PUBLIC_AMBIENTE: canal,
  [`EXPO_PUBLIC_SUPABASE_URL_${sufijo}`]: url,
  [`EXPO_PUBLIC_SUPABASE_KEY_${sufijo}`]: key,
};

if (existsSync('dist')) rmSync('dist', { recursive: true, force: true });
console.log(`\nArmando la web (${canal})...\n`);
execSync('npx expo export --platform web --clear', { stdio: 'inherit', env: entorno });
console.log('\nSubiéndola a EAS Hosting...\n');
execSync(`npx eas-cli@latest deploy${canal === 'produccion' ? ' --prod' : ''}`, { stdio: 'inherit', env: entorno });
console.log('\n✅ Listo. Abrí el link que figura arriba desde Safari en el iPhone.\n');
