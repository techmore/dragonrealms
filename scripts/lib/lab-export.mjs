// Export leveling-lab data to public/live/lab.json for the /sims.html
// "Leveling Lab" tab. Merges:
//   - sweeps.db rows (per-run: variant, grade, kills, circles, firstEXP,
//     rankSplits, circleTimes, stall verdict)
//   - public/live/sims-history.jsonl (per-run char snapshots: circle,
//     totalRanks, topSkills) into per-char time series
// Run manually or invoked by race-guild-sweep.mjs at run finish.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const LIVE = join(ROOT, 'public', 'live');

export function buildLabData() {
  const runs = [];
  if (existsSync(join(LIVE, 'sweeps.db'))) {
    const db = new DatabaseSync(join(LIVE, 'sweeps.db'), { readOnly: true });
    const cols = db.prepare('PRAGMA table_info(sweeps)').all().map((c) => c.name);
    const pick = (...names) => names.find((n) => cols.includes(n));
    const rows = db.prepare('SELECT * FROM sweeps ORDER BY id').all();
    for (const r of rows) {
      const parse = (col) => {
        const c = pick(col);
        if (!c || r[c] == null) return null;
        try { return JSON.parse(r[c]); } catch { return r[c]; }
      };
      runs.push({
        ts: r.ts,
        runId: r.run_id,
        guild: r.guild,
        race: r.race,
        variant: r.variant || null,
        grade: r.grade || null,
        circle: r.circle ?? null,
        kills: r.kills ?? 0,
        trains: r.trains ?? 0,
        circlesUp: r.circles_up ?? 0,
        deaths: r.deaths ?? 0,
        refusals: r.refusals ?? 0,
        durationMin: r.durationMs ? Math.round(r.durationMs / 60000 * 10) / 10 : null,
        timeToCircleMin: (pick('timeToCircleMs') && r[pick('timeToCircleMs')])
          ? Math.round(r.timeToCircleMs / 60000 * 10) / 10 : null,
        firstExpSec: (pick('firstExpMs') && r[pick('firstExpMs')])
          ? Math.round(r.firstExpMs / 1000) : null,
        rankSplits: parse('rankSplits'),
        circleTimes: parse('circleTimes'),
        stallVerdict: r.stallVerdict || null,
        stallReason: r.stallReason || null,
        char: r.char || null,
        totalRanks: r.totalRanks ?? null,
      });
    }
  }

  // Per-character time series from sims-history.jsonl
  const chars = {};
  const histPath = join(LIVE, 'sims-history.jsonl');
  if (existsSync(histPath)) {
    for (const line of readFileSync(histPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let row; try { row = JSON.parse(line); } catch { continue; }
      const c = (chars[row.char] ||= { char: row.char, guild: row.guild, race: row.race, points: [] });
      c.points.push({
        ts: row.ts,
        circle: row.circle,
        totalRanks: row.totalRanks,
        kills: row.kills,
        trains: row.trains,
        topSkills: row.topSkills || {},
      });
    }
  }

  return { generatedAt: new Date().toISOString(), runs, chars: Object.values(chars) };
}

export function writeLabData() {
  writeFileSync(join(LIVE, 'lab.json'), JSON.stringify(buildLabData()));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeLabData();
  console.log('wrote public/live/lab.json');
}
