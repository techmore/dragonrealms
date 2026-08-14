// Live spectator relay: a connected session may subscribe to another online
// player's message stream (room/msg/combat/notice/error/prompt) and watch the
// session unfold in real time. Used by the web spectator page and the bot
// watcher. Spectators never mutate the game — the relay is one-way.
import { weaponOf } from './player.js';
import { roomById, ZONES } from '../data/world.js';

const watchers = new Map(); // charId -> Set<session>

const DIRS = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down',
};

export function subscribe(session, playerName) {
  const n = String(playerName || '').trim();
  if (!n) return { ok: false, msg: 'Spectate whom? Provide a player name.' };
  const target = [...session.game.players.values()].find((p) => p.name.toLowerCase() === n.toLowerCase());
  if (!target) return { ok: false, msg: `No adventurer named "${n}" is online right now.` };
  if (session.player && session.player.charId === target.charId) {
    return { ok: false, msg: 'You cannot spectate yourself.' };
  }
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
  for (const set of watchers.values()) set.delete(session);
  session.spectating = null;
}

// Called by the player's own session.send: mirrors the message to watchers.
export function forward(player, obj) {
  const set = watchers.get(player.charId);
  if (!set || set.size === 0) return;
  const out = JSON.stringify(obj);
  for (const s of set) {
    if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
  }
}

// Called when the player types a command: watchers see it as `> line`,
// exactly as if they were watching over the player's shoulder.
export function forwardCommand(player, line) {
  const set = watchers.get(player.charId);
  if (!set || set.size === 0) return;
  const out = JSON.stringify({ t: 'command', line: String(line || '') });
  for (const s of set) {
    if (s.socket.readyState === s.socket.OPEN) s.socket.send(out);
  }
}

export function watcherCount(player) {
  const set = watchers.get(player.charId);
  return set ? set.size : 0;
}
