// Generates public/ROADMAP.html from data/roadmap.js (the single source of
// truth) plus the live circle band tables from data/guilds.js.
// Run: node scripts/build-roadmap.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { STAGES, FEATURES } from '../data/roadmap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'ROADMAP.html');

// Live band tables from the circle engine.
const guildSrc = readFileSync(new URL('../data/guilds.js', import.meta.url), 'utf8');
const block = guildSrc.match(/const CIRCLE_TABLES = \{[\s\S]*?\n\};/)[0];
const tables = {};
const re = /^  (\w+): \[([\s\S]*?)\n  \],/gm;
let m;
while ((m = re.exec(block))) {
  const rows = [...m[2].matchAll(/\{([^}]*)\}/g)].map((x) => {
    const o = {};
    for (const mm of x[1].matchAll(/(\w+): (?:(\d+)|'([^']+)')/g)) o[mm[1]] = mm[2] !== undefined ? Number(mm[2]) : mm[3];
    return o;
  });
  tables[m[1]] = rows;
}
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const guildNames = {
  barbarian: 'Barbarian', bard: 'Bard', cleric: 'Cleric', empath: 'Empath', moonmage: 'Moon Mage',
  necromancer: 'Necromancer', paladin: 'Paladin', ranger: 'Ranger', thief: 'Thief', trader: 'Trader', warmage: 'Warrior Mage',
};
const bandRows = Object.entries(tables).map(([gid, rows]) => {
  const parts = rows.map((r) => (r.skill ? `${r.skill} ${r.rank}${r.hard ? '*' : ''}` : `${ord(r.nth)} ${r.set} ${r.rank}`));
  return `  ["${guildNames[gid] || gid}", "${parts.join('; ')}"]`;
}).join(',\n');

const featsJson = JSON.stringify(FEATURES);
const stagesJson = JSON.stringify(STAGES);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dragon Realms — Roadmap Tracker</title>
<style>
  :root {
    --bg:#0c0c0a; --panel:#151510; --line:#2c2c1e;
    --text:#ddd8b8; --dim:#7c7660; --amber:#e0b34c; --green:#7ac47a;
    --red:#e05a5a; --blue:#7ab8e0;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--text);
    font-family:ui-monospace, Menlo, Consolas, monospace; font-size:14px;
  }
  header {
    position:sticky; top:0; z-index:5; background:var(--panel);
    border-bottom:1px solid var(--line); padding:14px 20px;
  }
  h1 { margin:0 0 4px; font-size:20px; color:var(--amber); letter-spacing:1px; }
  .sub { color:var(--dim); font-size:12px; margin-bottom:10px; }
  .legend { font-size:11px; color:var(--dim); margin-bottom:8px; }
  .legend .dot { display:inline-block; width:9px; height:9px; border-radius:2px; margin:0 4px 0 10px; vertical-align:middle; }
  .overall { display:flex; align-items:center; gap:12px; margin-top:6px; }
  .bar { flex:1; height:16px; background:#1a1a12; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .bar > i { display:block; height:100%; background:linear-gradient(90deg, var(--amber), var(--green)); width:0%; transition:width .3s; }
  .stats { font-size:12px; color:var(--dim); white-space:nowrap; }
  input[type=search] {
    width:100%; margin-top:10px; background:#1a1a12; color:var(--text);
    border:1px solid var(--line); border-radius:5px; padding:7px 10px; font-family:inherit; font-size:13px;
  }
  .filters { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
  .filters button {
    background:#1a1a12; color:var(--text); border:1px solid var(--line);
    border-radius:5px; padding:5px 10px; cursor:pointer; font-family:inherit; font-size:12px;
  }
  .filters button.active { background:var(--amber); color:#1a1505; border-color:var(--amber); }
  main { padding:20px; max-width:900px; margin:0 auto; }
  .stage {
    background:var(--panel); border:1px solid var(--line); border-radius:8px;
    margin-bottom:16px; overflow:hidden;
  }
  .stage > summary {
    cursor:pointer; padding:12px 16px; list-style:none; display:flex; align-items:center; gap:12px;
  }
  .stage > summary::-webkit-details-marker { display:none; }
  .stage[open] > summary { border-bottom:1px solid var(--line); }
  .stage h2 { margin:0; font-size:15px; }
  .stage .sbar { width:120px; height:10px; background:#1a1a12; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
  .stage .sbar > i { display:block; height:100%; background:var(--green); width:0%; }
  .stage .scount { font-size:11px; color:var(--dim); margin-left:auto; }
  .stage .state-badge { font-size:10px; padding:2px 7px; border-radius:4px; }
  .badge-done { background:#1d2b1d; color:var(--green); }
  .badge-partial { background:#2b251d; color:var(--amber); }
  .badge-todo { background:#2b1d1d; color:var(--red); }
  .stage-desc { color:var(--dim); font-size:12px; padding:8px 16px 0; }
  .features { padding:4px 16px 12px; }
  .feat { padding:8px 4px; border-bottom:1px solid #1f1f14; display:flex; gap:10px; align-items:flex-start; }
  .feat:last-child { border-bottom:none; }
  .feat input[type=checkbox] { margin-top:3px; width:16px; height:16px; accent-color:var(--green); cursor:pointer; flex-shrink:0; }
  .feat .body { flex:1; }
  .feat .label { cursor:pointer; }
  .feat.done .label { color:var(--green); }
  .feat.done .label::after { content:" ✓"; }
  .feat.partial .label { color:var(--amber); }
  .feat.partial .label::after { content:" ~"; }
  .feat .detail { color:var(--dim); font-size:12px; margin-top:2px; }
  .matrix { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:20px; }
  .matrix table { width:100%; border-collapse:collapse; font-size:12px; }
  .matrix th, .matrix td { text-align:left; padding:5px 8px; border-bottom:1px solid #1f1f14; vertical-align:top; }
  .matrix th { color:var(--amber); }
  footer { color:var(--dim); text-align:center; padding:20px; font-size:12px; }
  a { color:var(--amber); }
</style>
</head>
<body>
<header>
  <h1>&#128009; Dragon Realms — Roadmap Tracker</h1>
  <div class="sub">Full feature parity to circle 10 for all guilds. Click features to check them off as work ships. State saves in your browser. Generated from <code>data/roadmap.js</code> — do not edit this file by hand.</div>
  <div class="legend">
    <span class="dot" style="background:var(--green)"></span>done
    <span class="dot" style="background:var(--amber)"></span>partial
    <span class="dot" style="background:var(--red)"></span>planned
  </div>
  <div class="overall">
    <div class="bar" id="overallBar"><i></i></div>
    <span class="stats" id="overallStats"></span>
  </div>
  <input type="search" id="q" placeholder="Search features...">
  <div class="filters" id="filters"></div>
</header>

<main id="main"></main>

<script>
const STAGES = ${stagesJson};
const FEATURES = ${featsJson};
const GUILD_BANDS = [
${bandRows}
];
const LS_KEY = "dr_roadmap_v2";
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } })();
const $ = (id) => document.getElementById(id);

function state(f) { return saved[f.id] !== undefined ? saved[f.id] : f.status === "done"; }
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(saved)); } catch {} }

let filter = "all";
let q = "";

function render() {
  const main = $("main");
  main.innerHTML = "";
  const n = q.toLowerCase();
  for (const stage of STAGES) {
    const feats = FEATURES.filter((f) => f.s === stage.id);
    const done = feats.filter((f) => state(f)).length;
    const total = feats.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const vis = feats.filter((f) => {
      if (filter === "done" && !state(f)) return false;
      if (filter === "partial" && f.status !== "partial") return false;
      if (filter === "todo" && (f.status === "done" || state(f))) return false;
      if (n && !(f.label.toLowerCase().includes(n) || f.detail.toLowerCase().includes(n))) return false;
      return true;
    });
    if (vis.length === 0) continue;

    const details = document.createElement("details");
    details.className = "stage";
    if (pct === 100) details.open = true;
    const badge = { done: "done", partial: "partial", todo: "todo" }[stage.badge];

    details.innerHTML = \`
      <summary>
        <h2>\${stage.title}</h2>
        <span class="state-badge badge-\${badge}">\${stage.badge}</span>
        <span class="sbar"><i style="width:\${pct}%"></i></span>
        <span class="scount">\${done}/\${total}</span>
      </summary>
      <div class="stage-desc">\${stage.desc}</div>
      <div class="features">\${vis.map((f) => \`
        <div class="feat \${state(f) ? "done" : f.status === "partial" ? "partial" : ""}" data-id="\${f.id}">
          <input type="checkbox" \${state(f) ? "checked" : ""}>
          <div class="body">
            <div class="label">\${f.label}</div>
            <div class="detail">\${f.detail}</div>
          </div>
        </div>\`).join("")}
      </div>\`;
    details.querySelectorAll(".feat").forEach((row) => {
      const id = row.dataset.id;
      const cb = row.querySelector("input");
      const toggle = () => { saved[id] = !saved[id]; persist(); render(); };
      cb.addEventListener("change", toggle);
      row.querySelector(".label").addEventListener("click", () => { cb.checked = !cb.checked; toggle(); });
    });
    main.appendChild(details);
  }

  // Guild band matrix (live from the circle engine)
  const matrix = document.createElement("div");
  matrix.className = "matrix";
  matrix.innerHTML = \`
    <h2>Circle-10 Band Requirement Matrix</h2>
    <p class="sub">Each guild\u2019s authentic DR band table as implemented in the live engine (named skills + Nth-of-skillset pools, 1\u201310 bands scaled per circle). * = hard requirement.</p>
    <table>
      <tr><th>Guild</th><th>Circle-10 band requirements</th></tr>
      \${GUILD_BANDS.map(([g, b]) => \`<tr><td><b>\${g}</b></td><td>\${b}</td></tr>\`).join("")}
    </table>\`;
  main.appendChild(matrix);

  // Overall stats
  const doneCount = FEATURES.filter((f) => state(f)).length;
  const partialCount = FEATURES.filter((f) => f.status === "partial").length;
  const overallPct = Math.round(doneCount / FEATURES.length * 100);
  $("overallBar").querySelector("i").style.width = overallPct + "%";
  $("overallStats").textContent = \`\${doneCount}/\${FEATURES.length} done (\${partialCount} partial) · \${overallPct}% to circle-10 parity\`;
}

// Filters
const filterBox = $("filters");
[["all","All"],["done","Done"],["partial","Partial"],["todo","Todo"]].forEach(([key, label]) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => {
    filter = key;
    [...filterBox.children].forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    render();
  });
  filterBox.appendChild(b);
});
const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset saved state";
resetBtn.addEventListener("click", () => { Object.keys(saved).forEach((k) => delete saved[k]); persist(); render(); });
filterBox.appendChild(resetBtn);
$("q").addEventListener("input", (e) => { q = e.target.value; render(); });

render();
</script>
<footer>Dragon Realms · generated from <code>data/roadmap.js</code> · full skills reference at <a href="/SKILLS.html">/SKILLS.html</a> · play at <a href="/">/</a></footer>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${FEATURES.length} features, ${STAGES.length} stages)`);
