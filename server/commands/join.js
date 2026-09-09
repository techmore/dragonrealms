// Guild joining — the DR-authentic ceremony. Characters wake guildless; a
// `join <guild>` spoken before a guild's own leader in its hall binds you to
// that guild (Circle 1 initiate). Aliases let "join barbarian",
// "join barbarian guild", or "join barbarians" all resolve. The leader
// refuses anyone who already swore elsewhere — in DR you do not simply
// switch guilds.
import { GUILDS, guildById } from '../../data/guilds.js';
import { npcById } from '../../data/npcs.js';
import { roomById } from '../../data/world.js';
import { db } from '../db.js';
import { broadcastRoom } from './util.js';

// Which guild's hall (if any) is the player standing in? Returns the guild id
// when the room is a guild hall of exactly one guild with its leader present
// (Riverhaven's rh_guilds houses all leaders, so it resolves by who was
// addressed instead). Shared with train/circle for their guildless hints.
export function hallGuildAt(roomId) {
  const room = roomById(roomId);
  if (!room) return null;
  const m = /^(?:rh_)?hall_([a-z]+)$/.exec(room.id);
  if (m && GUILDS[m[1]]) return m[1];
  return null;
}

// Every guild whose leader stands in this room (rh_guilds lists all of them).
function leadersHere(roomId) {
  const room = roomById(roomId);
  if (!room || !room.npcs) return [];
  return room.npcs
    .map(npcById)
    .filter((n) => n && n.role === 'guild' && n.guild);
}

export const commands = {
  join: joinGuild,
};

function joinProse(guild, leader, p) {
  const openers = [
    `You kneel. ${leader.name} studies you for a long moment, then speaks the words that bind: "Rise, and walk with us."`,
    `${leader.name} looks you over — the calluses, the eyes, the hunger. "You will do. Rise, initiate."`,
    `You state your intent. ${leader.name} nods once, slowly, and the hall answers with a quiet settle of weight — you are claimed.`,
  ];
  const pick = openers[(p.name.length + p.circle) % openers.length];
  return `${pick}\n\n\x1b[1mYou have joined the ${guild.name} guild.\x1b[0m ${guild.desc}\nYour guild trainer now drills you in: ${[...guild.primary, ...guild.secondary].join(', ')}${guild.guildSkill ? `, ${guild.guildSkill}` : ''}. Type "circle" in this hall when your skills prove you.`;
}

export function joinGuild(ctx) {
  const { game, p, arg1, rest, emit } = ctx;
  if (p.guild) {
    return emit(`You already walk with the ${p.guild.name}. A soul swears to one guild in this life.`);
  }
  const room = roomById(p.room);
  const leaders = leadersHere(p.room);
  const singleHall = hallGuildAt(p.room);
  if (!leaders.length) {
    // Riverhaven's smaller halls keep their leaders in the shared Guilds
    // hall — route the player there instead of a dead end.
    if (room && room.id.startsWith('rh_hall_')) {
      return emit('The leader of this hall sits with the others in the Riverhaven Guilds hall next door ("dir guilds").');
    }
    return emit(singleHall
      ? 'No guild leader holds this hall — find another of its order.'
      : 'There is no guild leader here. Halls live in the Guild District ("dir list guilds").');
  }
  // Query: everything after the verb ("join <guild>"; multi-word supported,
  // e.g. "join warrior mage"). `rest` already contains arg1 — do not append
  // it again (that doubled "barbarian" into "barbarian barbarian").
  const query = String(rest || '').trim().toLowerCase();
  if (!query) {
    const names = leaders.map((l) => l.guild).join(', ');
    return emit(`Whose banner? The leaders here serve: ${names}. "join <guild>".`);
  }
  // Resolve the addressed guild: exact id, spoken aliases ("warrior mage",
  // "moon mage"), guild-suffixed/plural forms, prefix, then a leader's own
  // name ("join ulfgar" — DR players address the person, not the title).
  const SPOKEN = { 'warrior mage': 'warmage', 'moon mage': 'moonmage', thieves: 'thief', thief: 'thief' };
  const candidates = [...new Set(leaders.map((l) => l.guild))];
  const strip = (q) => q.replace(/^(?:the\s+)/, '').replace(/(?:\s+guild|\s+guildhall|\s+hall)+$/, '').replace(/s$/, '');
  const stripped = strip(query);
  let target = candidates.find((g) => g === query || g === stripped)
    || candidates.find((g) => SPOKEN[stripped] === g);
  if (!target) {
    target = candidates.find((g) => strip(g) === stripped)
      || candidates.find((g) => g.startsWith(stripped) && stripped.length >= 3)
      || leaders.find((l) => l.name.toLowerCase().includes(query))?.guild;
  }
  if (!target) {
    return emit(`No leader here answers to "${query}". Present: ${leaders.map((l) => `${l.name} (${l.guild})`).join(', ')}.`);
  }
  // In a multi-leader room (rh_guilds) you must stand before the leader of
  // the guild you name — but every leader here IS present, so joining any
  // named guild is legitimate.
  const guild = guildById(target);
  const leader = leaders.find((l) => l.guild === target);
  const atOwnHall = singleHall ? singleHall === target : true;
  if (!atOwnHall) {
    return emit(`${leader.name} is not here. The ${guild.name} hall stands elsewhere ("dir ${target}").`);
  }

  // Bind: set guild, refresh derived state, persist. savePlayer never writes
  // the guild column (it is set only here and at chargen), so persist the
  // guild + derived magic fields in this one statement.
  p.guild = guild;
  p.maxMana = guild.magic ? 20 + p.stats.wis * 2 + p.stats.int + p.stats.dis : 0;
  p.mana = p.maxMana;
  p.spellsKnown = guild.magic ? (guild.spells || []).filter((s) => s.minCircle <= p.circle).map((s) => s.id) : [];
  db.prepare('UPDATE characters SET guild = ?, mana = ? WHERE id = ?').run(guild.id, p.mana, p.charId);
  game.persistPlayer(p);
  broadcastRoom(game, p, joinProse(guild, leader, p), `${p.name} swears before ${leader.name} — a new ${guild.name} walks among us.`);

  // One-time achievement: first oath sworn.
  if (!p.achievements?.includes('guild_sworn')) {
    p.achievements = [...(p.achievements || []), 'guild_sworn'];
    db.prepare('UPDATE characters SET achievements = ? WHERE id = ?').run(JSON.stringify(p.achievements), p.charId);
  }
  game.status(p);
}
