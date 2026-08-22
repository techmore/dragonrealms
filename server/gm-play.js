// GM quick-play: jump straight into a boosted character with zero signup or
// chargen screens. The wire verb is {t:'gm_play', gmToken, guild, race?,
// name?, boost?} — authorized by the same constant-time GM credential as the
// spectate paths. Behind it:
//   1. A single hidden 'gm' account is provisioned on first use (random
//      unusable password — nobody can log into it through the normal flow).
//   2. A deterministic character per (account, guild, race) is created or
//      reused, then enterWorld() runs directly: look/status/scripts/enter all
//      fire exactly like a normal login, skipping charselect/alloc.
//   3. The requested boost multiplier (session-level {t:'boost'} semantics)
//      is applied immediately and announced in the prompt as [BOOST xN].
// Every gm_play writes an audit line to console (timestamp, char, boost).
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { raceById } from '../data/races.js';
import { guildById } from '../data/guilds.js';
import { createCharacter, loadPlayer } from './player.js';
import { enterWorld } from './chargen.js';
import { isGmToken } from './gm.js';

const GM_ACCOUNT = 'gm';
const GM_PASS_PREFIX = 'dr-gm-unusable-'; // never satisfies the >=8 login path meaningfully — random per provision

function provisionGmAccount() {
  const row = db.prepare('SELECT id FROM accounts WHERE username = ?').get(GM_ACCOUNT);
  if (row) return row.id;
  const salt = randomBytes(16).toString('hex');
  // scrypt here would need the auth queue; a random throwaway hash is fine —
  // this account must never authenticate. Store a hash-shaped value that no
  // password derives: 64 hex chars of fresh randomness.
  const passHash = randomBytes(32).toString('hex');
  const info = db.prepare(
    'INSERT INTO accounts (username, pass_hash, salt, created_at) VALUES (?,?,?,?)'
  ).run(GM_ACCOUNT, passHash, salt, Date.now());
  return Number(info.lastInsertRowid);
}

export function handleGmPlayMessage(session, msg) {
  if (!isGmToken(msg.gmToken, session.gmToken)) {
    session.send({ t: 'error', msg: 'GM authorization is required for quick-play.' });
    return;
  }
  const guild = guildById(msg.guild);
  if (!guild) {
    session.send({ t: 'error', msg: 'gm_play needs a guild (barbarian, empath, warmage, ...).' });
    return;
  }
  const race = raceById(msg.race || 'human');
  if (!race) {
    session.send({ t: 'error', msg: 'Unknown race for gm_play.' });
    return;
  }

  const accountId = provisionGmAccount();
  const requested = String(msg.name || '').trim();
  let charRow;
  if (requested) {
    // Explicit name: reuse only if it belongs to the gm account.
    charRow = db.prepare('SELECT * FROM characters WHERE lower(name)=lower(?) AND account_id=?')
      .get(requested, accountId);
    if (!charRow) {
      try {
        const charId = createCharacter(accountId, {
          name: requested, race: race.id, guild: guild.id, city: msg.city || 'crossing',
        });
        charRow = db.prepare('SELECT * FROM characters WHERE id=?').get(charId);
      } catch (e) {
        session.send({ t: 'error', msg: `gm_play could not create "${requested}": ${e.message}` });
        return;
      }
    }
  } else {
    // Deterministic per guild+race: one persistent boosted toon per combo.
    charRow = db.prepare(
      'SELECT * FROM characters WHERE account_id=? AND guild=? AND race=? ORDER BY id LIMIT 1'
    ).get(accountId, guild.id, race.id);
    if (!charRow) {
      const name = `Gm${cap(guild.id)}${cap(race.id)}`.replace(/[^A-Za-z]/g, '').slice(0, 16);
      try {
        const charId = createCharacter(accountId, {
          name, race: race.id, guild: guild.id, city: msg.city || 'crossing',
        });
        charRow = db.prepare('SELECT * FROM characters WHERE id=?').get(charId);
      } catch (e) {
        session.send({ t: 'error', msg: `gm_play could not create "${name}": ${e.message}` });
        return;
      }
    }
  }

  const ok = enterWorld(session, charRow.id);
  if (!ok) return;

  let mult = Math.floor(Number(msg.boost));
  if (!Number.isFinite(mult) || mult <= 1) mult = 1;
  mult = Math.min(100, mult);
  session.player.boostMult = mult;
  session.player.isBot = true; // status surfaces flag GM-driven toons like bots
  session.player.gmToon = true; // distinct from sweep-agent bots in rosters

  console.log(`[gm-play] ${new Date().toISOString()} GM quick-play entered ${charRow.name} ` +
    `(${race.id} ${guild.id}) boost x${mult}`);
  // Refresh the prompt so [BOOST xN] shows immediately (enterWorld's first
  // status ran before the multiplier landed).
  if (mult > 1) session.game.status(session.player);
  session.send({
    t: 'notice',
    msg: `\x1b[35m[GM quick-play]\x1b[0m You are ${charRow.name}, ${race.id} ${guild.id}` +
      (mult > 1 ? `, boost x${mult} engaged.` : '.'),
  });
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
