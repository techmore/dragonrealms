// Mirrors a scoped slice of Elanthipedia into docs/elanthipedia/ as local
// markdown so the audit and fidelity passes can be searched offline.
// Usage: node scripts/fetch-elanthipedia.mjs [Category ...] [Page ...]
// Default categories: Skills Guilds Spells Combat Statistics
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'elanthipedia');
const API = 'https://elanthipedia.play.net/api.php';
const DELAY_MS = 150;
const BATCH = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const qs = new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(`${API}?${qs}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().slice(0, 200)}`);
  return res.json();
}

async function categoryMembers(cat) {
  const titles = [];
  let cont = {};
  do {
    const params = {
      action: 'query', list: 'categorymembers', cmtitle: `Category:${cat}`,
      cmlimit: '500', cmtype: 'page',
    };
    if (cont.cmcontinue) params.cmcontinue = cont.cmcontinue;
    const d = await api(params);
    for (const m of d.query.categorymembers) titles.push(m.title);
    cont = d.continue || {};
    await sleep(DELAY_MS);
  } while (cont.cmcontinue);
  return titles;
}

async function fetchContent(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const d = await api({
      action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
      redirects: '1', titles: chunk.join('|'),
    });
    for (const page of Object.values(d.query.pages || {})) {
      const title = page.title;
      const slot = page.revisions?.[0]?.slots?.main;
      const content = slot?.['*'] ?? slot?.content ?? '';
      out[title] = content;
    }
    await sleep(DELAY_MS);
  }
  return out;
}

const safeName = (title) => title.replace(/[/\\?%*:|"<>]/g, '_');

const args = process.argv.slice(2);
const categories = args.filter((a) => !a.includes(':'));
const extraPages = args.filter((a) => a.includes(':') || a.includes(' '));
const DEFAULT_CATEGORIES = ['Skills', 'Guilds', 'Spells', 'Combat', 'Statistics'];
const wantedCats = categories.length ? categories : DEFAULT_CATEGORIES;
const EXTRA_PAGES = extraPages.length ? extraPages : ['Experience', 'Time Development Points', 'Circle', 'Training', 'Races'];

mkdirSync(OUT, { recursive: true });

const index = { fetched: [], skipped: [] };
const seen = new Set();

for (const cat of wantedCats) {
  console.log(`category: ${cat} ...`);
  const members = await categoryMembers(cat);
  for (const t of members) seen.add(t);
  index.fetched.push(`Category:${cat} (${members.length})`);
}

for (const p of EXTRA_PAGES) seen.add(p);

const titles = [...seen];
console.log(`fetching ${titles.length} pages in batches of ${BATCH}...`);
const contents = await fetchContent(titles);

let saved = 0;
for (const [title, text] of Object.entries(contents)) {
  const file = join(OUT, `${safeName(title)}.md`);
  writeFileSync(file, `# ${title}\n\n_Automatically mirrored from Elanthipedia (${new Date().toISOString().slice(0, 10)})._\n\n${text}`);
  saved += 1;
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify({
  generated: new Date().toISOString(),
  categories: wantedCats,
  extraPages,
  files: Object.keys(contents).map((t) => safeName(t)),
}, null, 2));

console.log(`done: ${saved} pages -> ${OUT}`);
