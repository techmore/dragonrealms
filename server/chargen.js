// Character creation and world entry flow (chargen menu, alloc, enter).
import { createCharacter, loadPlayer, STAT_NAMES, MAX_STAT } from './player.js';
import { RACES, raceById } from '../data/races.js';
import { GUILDS, guildById } from '../data/guilds.js';
import { manaTypeFor } from '../data/mana.js';
import { db } from './db.js';
import { pad } from './util.js';

function sendChargenMenu(session) {
  const races = Object.values(RACES).map((r) => `${r.id} - ${r.name}: ${r.desc}`).join('\n');
  const guilds = Object.values(GUILDS).map((g) => `${g.id} - ${g.name}: ${g.desc}`).join('\n');
  // Structured twins of the prose lists: the client renders selection cards
  // with stat modifiers and mana type; the prose stays for terminal purists.
  const raceData = Object.values(RACES).map((r) => ({ id: r.id, name: r.name, desc: r.desc, stats: r.stats }));
  const guildData = Object.values(GUILDS).map((g) => ({
    id: g.id, name: g.name, desc: g.desc,
    magic: Boolean(g.magic),
    mana: manaTypeFor(g).type,
    manaName: manaTypeFor(g).def.name,
  }));
  session.send({
    t: 'charcreate',
    msg: `\nYou are a new soul in the Crossing.\n\n\x1b[1mChoose a race:\x1b[0m\n${races}\n\n\x1b[1mChoose a guild:\x1b[0m\n${guilds}\n\nName, race, and guild can be sent as: charcreate {name, race, guild}.`,
    races: raceData,
    guilds: guildData,
  });
}

function doCharSelect(session, id) {
  if (session.state !== 'charselect') return;
  if (String(id).toLowerCase() === 'new') {
    session.state = 'charcreate';
    return sendChargenMenu(session);
  }
  const idNum = parseInt(id, 10);
  const row = db.prepare('SELECT id FROM characters WHERE id=? AND account_id=?').get(idNum, session.accountId);
  if (!row) return session.send({ t: 'error', msg: 'Not a valid character.' });
  enterWorld(session, row.id);
}

function doCharCreate(session, name, race, guild, city = 'crossing') {
  if (session.state !== 'charcreate') return;
  const g = guildById(guild);
  const r = raceById(race);
  if (!r) return session.send({ t: 'error', msg: 'Unknown race. Try: human, dwarf, elf, elothean, gnome, gortog, giantman, halfling, kaldar, prydaen, rakash, skra.' });
  if (!g) return session.send({ t: 'error', msg: `Unknown guild. Try: ${Object.keys(GUILDS).join(', ')}` });

  let charId;
  try {
    charId = createCharacter(session.accountId, { name, race, guild, city });
  } catch (e) {
    return session.send({ t: 'error', msg: e.message });
  }

  const p = loadPlayer(charId);
  // Character creation owns only the allocation draft. Runtime ownership is
  // claimed when the player actually enters the world.
  p.online = false;
  p.ws = session.socket;
  session.player = p;
  session.state = 'charcreate_playing';
  session.send({ t: 'notice', msg: `\nCharacter "${p.name}" created. You have ${p.unspentStat} unspent attribute points (base 35 per stat + racial bonuses). Allocate them now with "alloc <stat> <amount>", or type "enter" to begin with what you have.` });
  session.send({ t: 'charalloc', msg: allocPanel(p) });
}

function doAlloc(session, stat, amt) {
  if (session.state !== 'playing' && session.state !== 'charcreate_playing') return;
  const p = session.player;
  if (!p) return;
  const s = String(stat || '').toLowerCase();
  if (!STAT_NAMES.includes(s)) return session.send({ t: 'error', msg: `Unknown stat. Choose: ${STAT_NAMES.join(', ')}` });
  let n = parseInt(amt, 10);
  if (!n || n < 1) return session.send({ t: 'error', msg: 'Amount must be a positive number.' });
  if (p.unspentStat < n) return session.send({ t: 'error', msg: `You only have ${p.unspentStat} unspent points.` });
  const space = MAX_STAT - p.stats[s];
  const spend = Math.min(n, space);
  p.unspentStat -= spend;
  p.stats[s] += spend;
  if (session.state === 'charcreate_playing') session.send({ t: 'charalloc', msg: allocPanel(p) });
}

function allocPanel(p) {
  return `\n${p.name} — ${p.race.name} ${p.guild.name}\n` +
    STAT_NAMES.map((s) => `  ${pad(s.toUpperCase(), 3)} ${p.stats[s]}`).join('\n') +
    `\nUnspent points: ${p.unspentStat}\nSend "alloc <stat> <amount>" to spend, or "enter" to begin.`;
}

function doEnter(session) {
  if (session.state !== 'charcreate_playing') return;
  const p = session.player;
  if (p.unspentStat > 0) {
    session.send({ t: 'notice', msg: `Note: ${p.unspentStat} unspent point(s) remain. You can allocate them later with "alloc".` });
  }
  // Keep the allocation draft object: reloading here would discard stat
  // points assigned between character creation and entry.
  enterWorld(session, p.charId, p);
}

function enterWorld(session, charId, candidate = null) {
  const active = session.game.players.get(charId);
  if (active && active !== candidate && active !== session.player) {
    session.send({
      t: 'error',
      msg: 'That character is already active in another session. Log it out before trying again.',
    });
    return false;
  }

  const p = active === session.player ? active : (candidate || loadPlayer(charId));
  const previous = session.player;
  if (previous && previous !== p && session.game.players.get(previous.charId) === previous) {
    session.game.removePlayer(previous);
  }

  p.ws = session.socket;
  p.corpses = [];
  if (!session.game.addPlayer(p)) {
    session.send({
      t: 'error',
      msg: 'That character is already active in another session. Log it out before trying again.',
    });
    return false;
  }
  session.player = p;
  session.state = 'playing';

  const r = raceById(p.race.id);
  session.send({
    t: 'enter',
    msg: `\nYou are ${p.name}, a ${r.name} of the ${p.guild.name} guild.\nThe Crossing stretches before you. Type "help" for commands.`,
  });
  session.game.look(p);
  session.game.status(p);
  // Journal seed: the client's quest window opens with current state (or stays
  // hidden when there is no active task).
  import('./quests.js').then(({ quests }) => quests.pushQuest(p)).catch(() => {});
  // Script library: the client's saved DR scripts follow the character.
  session.send({ t: 'scripts', scripts: p.scripts || {} });
  return true;
}

export {
  sendChargenMenu, doCharSelect, doCharCreate, doAlloc, doEnter, enterWorld,
};
