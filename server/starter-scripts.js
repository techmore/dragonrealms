// Starter circling library generation for simulated players: from disk
// geography, build hunt/circle/mega scripts, save them on the character, and
// tell the client to auto-run mega. Shared by gm quick-play and the
// gen_starter wire verb (browser-launched sims).
import { ROOMS } from '../data/world.js';
import { buildHuntScript, buildCircleScript, buildMegaScript } from '../scripts/lib/script-gen.mjs';

// ---- immediate circling-on-launch ---------------------------------------
// Generate a starter hunt/circle/mega library from disk geography, push it to
// the character's saved scripts, and tell the client to auto-run mega. Sims
// start circling the moment they enter the world — no manual scripting.

const diskAdj = (id) => Object.entries(ROOMS[id]?.exits || {}).map(([dir, to]) => ({ dir, to }));

function genBfsPath(from, to) {
  if (from === to) return [];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const e of diskAdj(cur)) {
      if (!ROOMS[e.to] || prev.has(e.to)) continue;
      prev.set(e.to, { via: cur, dir: e.dir });
      if (e.to === to) {
        const path = [];
        let at = to;
        while (prev.get(at)) { path.unshift({ dir: prev.get(at).dir }); at = prev.get(at).via; }
        return path;
      }
      q.push(e.to);
    }
  }
  return null;
}

function nearestSpawnRoomFrom(from) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur !== from && ROOMS[cur]?.spawns?.length) return cur;
    for (const e of diskAdj(cur)) {
      if (!ROOMS[e.to] || seen.has(e.to)) continue;
      seen.add(e.to);
      q.push(e.to);
    }
  }
  return null;
}

function pushStarterScripts(session, player) {
  try {
    const guildId = player.guild?.id;
    const raceId = player.race?.id;
    const room = player.room;
    const arena = nearestSpawnRoomFrom(room);
    if (!arena) return false;
    const hall = 'hall_' + guildId;
    const cap = {
      guild: guildId, race: raceId,
      char: player.name.replace(/[^A-Za-z]/g, '').slice(0, 16),
      scriptBase: 'auto',
      bazaarPath: null, trainList: null, trainOffset: 0,
    };
    const scripts = {
      autohunt: buildHuntScript({
        cap,
        arena: { id: arena, fromArmed: [], fromHere: genBfsPath(room, arena) },
      }),
      autocircle: buildCircleScript({
        cap,
        fromArena: { hall: genBfsPath(arena, hall), back: genBfsPath(hall, arena) },
      }),
      automega: null,
    };
    if (!scripts.autohunt || !scripts.autocircle) return false;
    scripts.automega = buildMegaScript(cap);
    player.scripts = { ...(player.scripts || {}), ...scripts };
    session.send({ t: 'scripts', scripts: player.scripts });
    session.send({ t: 'autorun', name: 'automega' });
    console.log(`[gm-play] starter circling library pushed for ${player.name} (${guildId}/${raceId}) arena=${arena}`);
    return true;
  } catch (e) {
    console.error(`[gm-play] starter script generation failed: ${e.message}`);
    return false;
  }
}
export { pushStarterScripts };
