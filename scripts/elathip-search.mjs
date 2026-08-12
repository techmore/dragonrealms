// Local Elanthipedia search: node scripts/elathip-search.mjs <query>
// Greps the mirrored corpus in docs/elanthipedia (rg under the hood if present).
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(__dirname, '..', 'docs', 'elanthipedia');
const q = process.argv.slice(2).join(' ');

if (!q) { console.log('Usage: node scripts/elathip-search.mjs <query>'); process.exit(1); }

let out;
try {
  out = execSync(`rg -il --no-messages "${q.replace(/"/g, '\\"')}" "${CORPUS}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
} catch {
  out = '';
}
const files = out.split('\n').filter(Boolean).map((f) => f.replace(CORPUS + '/', '').replace(/\.md$/, ''));
console.log(files.length ? files.join('\n') : 'No matches.');
