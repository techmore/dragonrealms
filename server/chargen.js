// Character creation and world entry flow (chargen menu, alloc, enter).
import { createCharacter, loadPlayer, STAT_NAMES, MAX_STAT } from './player.js';
import { RACES, raceById } from '../data/races.js';
import { GUILDS, guildById } from '../data/guilds.js';
import { db } from './db.js';

function sendChargenMenu(session) {
  const races = Object.values(RACES).map((r) => `${r.id} - ${r.name}: ${r.desc}`).join('\n');
  const guilds = Object.values(GUILDS).map((g) => `${g.id} - ${g.name}: ${g.desc}`).join('\n');
  session.send({
    t: 'charcreate',
    msg: `\nYou are a new soul in the Crossing.\n\n\x1b[1mChoose a race:\x1b[0m\n${races}\n\n\x1b[1mChoose a guild:\x1b[0m\n${guilds}\n\nName, race, and guild can be sent as: charcreate {name, race, guild}.`,
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

function doCharCreate(session, name, race, guild) {
  if (session.state !== 'charcreate') return;
  const g = guildById(guild);
  const r = raceById(race);
  if (!r) return session.send({ t: 'error', msg: 'Unknown race. Try: human, dwarf, elf, elothean, gnome, gortog, giantman, halfling, kaldar, prydaen, rakash, skra.' });
  if (!g) return session.send({ t: 'error', msg: `Unknown guild. Try: ${Object.keys(GUILDS).join(', ')}` });

  let charId;
  try {
    charId = createCharacter(session.accountId, { name, race, guild });
  } catch (e) {
    return session.send({ t: 'error', msg: e.message });
  }

  const p = loadPlayer(charId);
  p.online = true;
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
  session.state = 'playing';
  enterWorld(session, p.charId);
}

function enterWorld(session, charId) {
  const p = loadPlayer(charId);
  p.online = true;
  p.ws = session.socket;
  p.corpses = [];
  session.player = p;
  session.state = 'playing';
  session.game.addPlayer(p);

  const r = raceById(p.race.id);
  session.send({
    t: 'enter',
    msg: `\nYou are ${p.name}, a ${r.name} of the ${p.guild.name} guild.\nThe Crossing stretches before you. Type "help" for commands.`,
  });
  session.game.look(p);
  session.game.status(p);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export {
  sendChargenMenu, doCharSelect, doCharCreate, doAlloc, doEnter, enterWorld,
};
