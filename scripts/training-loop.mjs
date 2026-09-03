// Traditional training loop: run sweep passes back-to-back and evaluate the
// gate ledger with fixed rules — no LLM in the cycle. Each pass spawns
// race-guild-sweep, then reads the per-agent final [gaps] / verdict /
// circle-up milestones straight from the fidelity logs (last sweep segment).
// Stops on: any circle_up, shortfall plateau (two consecutive passes
// improving < 3), or --passes exhausted.
//
// Usage:
//   node scripts/training-loop.mjs --guilds barbarian --races human,gortog,halfling \
//        --minutes 15 --boost 20 --passes 3

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_DIR = join(HERE, '..', 'public', 'live');
const LEDGER = join(LIVE_DIR, 'training-ledger.jsonl');

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const passes = Number(arg('passes', 3));
const guilds = arg('guilds', 'barbarian');
const races = arg('races', 'human,gortog,halfling');
const minutes = arg('minutes', '15');
const boost = arg('boost', '20');
const base = ['--guilds', guilds, '--races', races, '--minutes', minutes, '--boost', boost];

// Read the LAST [gaps] sample, trailing live-verdict, and circle-up count per
// guild/race from each agent's last sweep-run segment. Fidelity logs are
// append-only; .exec() would grab the FIRST (1-minute fresh-char) sample and
// report every pass as shortfall:84 — always take the final matches.
function readPass() {
  const out = [];
  for (const g of guilds.split(',')) {
    for (const r of races.split(',')) {
      const p = join(LIVE_DIR, `fidelity-${g}-${r}.log`);
      let seg = '';
      try {
        const text = readFileSync(p, 'utf8');
        seg = text.slice(text.lastIndexOf('=== sweep run '));
      } catch { continue; }
      const gaps = [...seg.matchAll(/blocked:(\d+) shortfall:(\d+)/g)].pop();
      // trailing live verdict rides the last [progress] line ("healthy — …")
      const prog = [...seg.matchAll(/\[progress\][^\n]*\[room [^\]]+\] ([^\n]+)/g)].pop()?.[1] || 'unknown';
      const kills = Number(/\b(\d+) kills/.exec(prog)?.[1]) || 0;
      out.push({
        guild: g, race: r,
        blocked: gaps ? Number(gaps[1]) : null,
        shortfall: gaps ? Number(gaps[2]) : null,
        kills,
        circleUps: (seg.match(/circle_up/g) || []).length,
        verdict: prog.slice(0, 44),
      });
    }
  }
  return out;
}

const record = { started: new Date().toISOString(), passes: [] };
let prevShortfall = null;
let plateaus = 0;
let stopReason = null;

for (let pass = 1; pass <= passes && !stopReason; pass++) {
  console.log(`[training-loop] pass ${pass}/${passes}: sweep (${guilds} × ${races}, ${minutes}m, boost ${boost})`);
  const res = spawnSync('node', ['scripts/race-guild-sweep.mjs', ...base],
    { cwd: join(HERE, '..'), stdio: 'inherit' });
  if (res.status !== 0) { stopReason = 'sweep exited nonzero'; break; }

  const agents = readPass();
  const shortfall = agents.reduce((s, a) => s + (a.shortfall || 0), 0);
  const healthy = agents.filter((a) => a.verdict.startsWith('healthy')).length;
  const kills = agents.reduce((s, a) => s + a.kills, 0);
  const circleUps = agents.reduce((s, a) => s + a.circleUps, 0);
  const improved = prevShortfall == null ? null : prevShortfall - shortfall;
  if (improved != null && improved < 3) plateaus++; else plateaus = 0;
  if (circleUps > 0) stopReason = 'circle-up achieved';
  else if (plateaus >= 2) stopReason = 'shortfall plateau — cadence rules exhausted';
  record.passes.push({ pass, agents, totals: { shortfall, healthy, kills, circleUps }, improved });
  appendFileSync(LEDGER, JSON.stringify({ pass, agents, totals: { shortfall, healthy, kills, circleUps }, improved, at: new Date().toISOString() }) + '\n');
  console.log(`[training-loop] pass ${pass}: shortfall ${prevShortfall ?? '—'}→${shortfall} · healthy ${healthy}/${agents.length} · kills ${kills} · circle-ups ${circleUps}${improved != null ? ` · Δ ${improved >= 0 ? '+' : ''}${improved}` : ''}`);
  prevShortfall = shortfall;
}

writeFileSync(join(LIVE_DIR, 'training-state.json'),
  JSON.stringify({ ...record, stopReason: stopReason || 'passes exhausted' }, null, 2));
console.log(`[training-loop] done — ${stopReason || 'passes exhausted'} · ledger: ${LEDGER}`);
