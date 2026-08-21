// Live spectator relay for authenticated game masters. Player streams include
// typed commands, so ordinary accounts cannot subscribe without a future,
// explicit player-consent model. The session router validates the configured
// GM credential and marks the session; these guards keep direct callers safe.
import { weaponOf } from './player.js';
import { roomById, ZONES } from '../data/world.js';

const watchers = new Map(); // charId -> Set<session>
const worldWatchers = new Set(); // sessions watching the entire world feed

const DIRS = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down',
};

// GM world feed: every online player's messages, tagged with the source.
export function subscribeWorld(session) {
  if (!session.gmAuthorized) return { ok: false, msg: 'GM authorization is required to watch the world feed.' };
  unsubscribe(session);
  worldWatchers.add(session);
  session.spectating = '*world*';
  return { ok: true, msg: 'You are now watching the entire world feed.' };
}

function mirror(obj) {
  const out = JSON.stringify(obj);
  for (const s of worldWatchers) {
    if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
  }
}

export function subscribe(session, playerName) {
  if (!session.gmAuthorized) return { ok: false, msg: 'GM authorization is required to watch a live player stream.' };
  const n = String(playerName || '').trim();
  if (!n) return { ok: false, msg: 'Spectate whom? Provide a player name.' };
  const target = [...session.game.players.values()].find((p) => p.name.toLowerCase() === n.toLowerCase());
  if (!target) return { ok: false, msg: `No adventurer named "${n}" is online right now.` };
  if (session.player && session.player.charId === target.charId) {
    return { ok: false, msg: 'You cannot spectate yourself.' };
  }
  unsubscribe(session);
  let set = watchers.get(target.charId);
  if (!set) {
    set = new Set();
    watchers.set(target.charId, set);
  }
  set.add(session);
  session.spectating = target.name;
  // Push a current snapshot so the watcher's panels aren't empty until the
  // next room/prompt/hands message arrives.
  const w = weaponOf(target);
  const worn = Object.entries(target.equipment)
    .filter(([slot]) => slot !== 'hand')
    .map(([, i]) => i.name);
  session.send({ t: 'hands', hand: w ? w.name : null, worn, carried: target.inventory.reduce((s, e) => s + e.qty, 0) });
  const room = roomById(target.room);
  if (room) {
    const zone = ZONES[room.zone] || { name: room.zone };
    const exits = Object.entries(room.exits).map(([d]) => DIRS[d]).filter(Boolean);
    const indoor = room.zone === 'town' || room.zone === 'riverhaven';
    const msg = `\n[[${room.name}, ${zone.name}]]\n${room.desc}${exits.length ? `\n${indoor ? 'Obvious exits' : 'Obvious paths'}: ${exits.join(', ')}.` : ''}`;
    session.send({ t: 'room', msg, exits, roomId: target.room });
  }
  session.send({ t: 'notice', msg: `You are now watching ${target.name} — a ${target.race.name} ${target.guild.name}, circle ${target.circle}.` });
  return { ok: true, msg: `You are now watching ${target.name} — a ${target.race.name} ${target.guild.name}, circle ${target.circle}.` };
}

export function unsubscribe(session) {
  for (const [charId, set] of watchers) {
    set.delete(session);
    if (set.size === 0) watchers.delete(charId);
  }
  worldWatchers.delete(session);
  session.spectating = null;
}

// Called by the player's own session.send: mirrors the message to watchers.
export function forward(player, obj) {
  const set = watchers.get(player.charId);
  if (set && set.size > 0) {
    const out = JSON.stringify(obj);
    for (const s of set) {
      if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
    }
  }
  if (worldWatchers.size > 0) {
    const out = JSON.stringify({ ...obj, _player: player.name });
    for (const s of worldWatchers) {
      if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
    }
  }
}

// Called when the player types a command: watchers see it as `> line`,
// exactly as if they were watching over the player's shoulder.
export function forwardCommand(player, line) {
  const set = watchers.get(player.charId);
  if (set && set.size > 0) {
    const out = JSON.stringify({ t: 'command', line: String(line || '') });
    for (const s of set) {
      if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
    }
  }
  if (worldWatchers.size > 0) {
    const out = JSON.stringify({ t: 'command', line: String(line || ''), _player: player.name });
    for (const s of worldWatchers) {
      if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
    }
  }
}

export function watcherCount(player) {
  const set = watchers.get(player.charId);
  return set ? set.size : 0;
}
