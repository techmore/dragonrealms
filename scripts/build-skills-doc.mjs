// Builds public/SKILLS.html — the full skills reference — from data/skills.js
// and data/guilds.js, so the documentation can never drift from the game.
// Run: node scripts/build-skills-doc.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS, CATEGORIES } from '../data/skills.js';
import { GUILDS } from '../data/guilds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'SKILLS.html');

// Which guilds train each skill (primary / secondary / guild skill).
const guildMap = {};
for (const g of Object.values(GUILDS)) {
  for (const s of g.primary) (guildMap[s] ||= { primary: [], secondary: [], guildSkill: [] }).primary.push(g.name);
  for (const s of g.secondary) (guildMap[s] ||= { primary: [], secondary: [], guildSkill: [] }).secondary.push(g.name);
  if (g.guildSkill) (guildMap[g.guildSkill] ||= { primary: [], secondary: [], guildSkill: [] }).guildSkill.push(g.name);
}

const skillsData = Object.values(SKILLS).map((s) => ({
  id: s.id,
  name: s.name,
  cat: s.cat,
  range: s.range || '',
  governing: s.governing || '',
  subskills: s.subskills || [],
  training: s.training || '',
  guilds: guildMap[s.id] || { primary: [], secondary: [], guildSkill: [] },
}));

const cats = Object.values(CATEGORIES);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dragon Realms — Skills Reference</title>
<style>
  :root {
    --bg:#0c0c0a; --panel:#151510; --line:#2c2c1e;
    --text:#ddd8b8; --dim:#7c7660; --amber:#e0b34c; --green:#7ac47a; --blue:#7ab8e0;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family:ui-monospace, Menlo, Consolas, monospace; font-size:14px; }
  header { position:sticky; top:0; z-index:5; background:var(--panel);
    border-bottom:1px solid var(--line); padding:14px 20px; }
  h1 { margin:0 0 4px; font-size:20px; color:var(--amber); letter-spacing:1px; }
  .sub { color:var(--dim); font-size:12px; margin-bottom:10px; }
  .filters { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .filters button { background:#1a1a12; color:var(--text); border:1px solid var(--line);
    border-radius:5px; padding:5px 10px; cursor:pointer; font-family:inherit; font-size:12px; }
  .filters button.active { background:var(--amber); color:#1a1505; border-color:var(--amber); }
  input[type=search] { width:100%; margin-top:10px; background:#1a1a12; color:var(--text);
    border:1px solid var(--line); border-radius:5px; padding:8px 10px; font-family:inherit; }
  main { padding:20px; max-width:960px; margin:0 auto; }
  .stats { color:var(--dim); font-size:12px; margin-bottom:14px; }
  .skill { background:var(--panel); border:1px solid var(--line); border-radius:8px;
    padding:12px 16px; margin-bottom:10px; }
  .skill h3 { margin:0 0 6px; font-size:15px; }
  .skill h3 .cat { color:var(--dim); font-size:12px; font-weight:normal; margin-left:8px; }
  .skill .meta { color:var(--dim); font-size:12px; margin:2px 0; }
  .skill .training { font-size:13px; margin:6px 0; }
  .skill .tags { margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; }
  .skill .tag { font-size:11px; padding:2px 8px; border-radius:4px; background:#1d2b1d; color:var(--green); }
  .skill .tag.sec { background:#2b251d; color:var(--amber); }
  .skill .tag.guild { background:#2b1d2b; color:var(--blue); }
  footer { color:var(--dim); text-align:center; padding:20px; font-size:12px; }
  a { color:var(--amber); }
</style>
</head>
<body>
<header>
  <h1>&#128009; Dragon Realms — Skills Reference</h1>
  <div class="sub">The complete clean-room skill taxonomy (${skillsData.length} skills across ${cats.length} skillsets), generated from the live game data. Sub-skills and governing stats follow the source game's documentation.</div>
  <input type="search" id="q" placeholder="Search skills, sub-skills, guilds...">
  <div class="filters" id="filters"></div>
</header>
<main>
  <div class="stats" id="stats"></div>
  <div id="list"></div>
</main>
<footer>Dragon Realms · <a href="/ROADMAP.html">roadmap</a> · play at <a href="/">/</a></footer>
<script>
const CATS = ${JSON.stringify(cats)};
const SKILLS = ${JSON.stringify(skillsData)};
let catFilter = 'all';
let q = '';
const $ = (id) => document.getElementById(id);

function render() {
  const n = q.toLowerCase();
  const list = SKILLS.filter((s) => {
    if (catFilter !== 'all' && s.cat !== catFilter) return false;
    if (!n) return true;
    const hay = [s.name, s.cat, s.training, s.range, s.governing, s.subskills.join(' '),
      s.guilds.primary.join(' '), s.guilds.secondary.join(' '), s.guilds.guildSkill.join(' ')].join(' ').toLowerCase();
    return hay.includes(n);
  });
  const primaryCount = list.filter((s) => s.guilds.primary.length).length;
  const guildCount = list.filter((s) => s.guilds.guildSkill.length).length;
  $('stats').textContent = \`Showing \${list.length} skills · \${primaryCount} guild-primary · \${guildCount} guild skills\`;
  $('list').innerHTML = list.map((s) => {
    const tags = [];
    s.guilds.primary.forEach((g) => tags.push(\`<span class="tag" title="Primary">\${g} P</span>\`));
    s.guilds.secondary.forEach((g) => tags.push(\`<span class="tag sec" title="Secondary">\${g} S</span>\`));
    s.guilds.guildSkill.forEach((g) => tags.push(\`<span class="tag guild" title="Guild skill">\${g} \u2694\</span>\`));
    return \`<div class="skill">
      <h3>\${s.name}<span class="cat">\${s.cat}\${s.range ? ' · ' + s.range : ''}</span></h3>
      \${s.governing ? \`<div class="meta">Governing stats: \${s.governing}</div>\` : ''}
      \${s.subskills.length ? \`<div class="meta">Sub-skills: \${s.subskills.join(', ')}</div>\` : ''}
      \${s.training ? \`<div class="training">\${s.training}</div>\` : ''}
      \${tags.length ? \`<div class="tags">\${tags.join('')}</div>\` : ''}
    </div>\`;
  }).join('') || '<p>No skills match.</p>';
}

const filterBox = $('filters');
[['all', 'All skillsets'], ...CATS.map((c) => [c, c])].forEach(([key, label]) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => {
    catFilter = key;
    [...filterBox.children].forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    render();
  });
  filterBox.appendChild(b);
});
$('q').addEventListener('input', (e) => { q = e.target.value; render(); });
render();
</script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${skillsData.length} skills)`);
