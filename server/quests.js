// Quest assignment and completion. The crier hands out four kinds of work
// (DR-flavored): kill (pest control), deliver (courier runs), recover
// (fetch a lost trinket from a marked creature), and skin (harvest hides).
// Guild leaders still assign kill tasks.
import { roomById } from '../data/world.js';
import { creatureById } from '../data/creatures.js';
import { SKILLS } from '../data/skills.js';
import { gainSkillExp } from './player.js';

const TRINKETS = {
  locket: { name: 'a silver locket', item: 'locket', desc: 'a silver locket' },
  signet: { name: 'a merchant\'s signet ring', item: 'signet', desc: 'a merchant\'s signet ring' },
  ledger: { name: 'a wax-sealed ledger', item: 'ledger', desc: 'a wax-sealed ledger' },
  charm: { name: 'a bone good-luck charm', item: 'charm', desc: 'a bone good-luck charm' },
};

// Courier runs: deliver a parcel to a named NPC in another Crossing room.
const DELIVERY = [
  { room: 'temple', npc: 'healer', name: 'Sister Cora', parcel: 'a bundle of clean bandages', topic: 'the wounded' },
  { room: 'market_end', npc: 'quartermaster', name: 'Sergeant Voss', parcel: 'a manifest scroll', topic: 'the quartermaster' },
  { room: 'fane', npc: 'fane_keeper', name: 'Grandmaster Odal', parcel: 'a training ledger', topic: 'the fane keeper' },
  { room: 'forge', npc: 'forge_master', name: 'Bram the Ironhand', parcel: 'a sack of forge flux', topic: 'the forge master' },
  { room: 'tailor_shop', npc: 'tailor', name: 'Mara', parcel: 'a bolt of canvas', topic: 'the tailor' },
  { room: 'brewery', npc: 'alchemist', name: 'Fennel', parcel: 'a crate of roots', topic: 'the alchemist' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const quests = {
  hasCrier(p) {
    const room = roomById(p.room);
    return Boolean(room && room.npcs && room.npcs.includes('towncrier'));
  },

  questCreatureFor(p) {
    const tiers = [
      { upTo: 2, pool: ['rat', 'kobold'] },
      { upTo: 4, pool: ['goblin', 'wolf'] },
      { upTo: 6, pool: ['wisp', 'bandit', 'great_rat'] },
      { upTo: 99, pool: ['wisp', 'bandit', 'troll', 'sewer_viper'] },
    ];
    const tier = tiers.find((t) => p.circle <= t.upTo);
    const pool = tier ? tier.pool : ['rat'];
    return pool[Math.floor(Math.random() * pool.length)];
  },

  assignQuest(game, p, source = 'crier') {
    let kind = 'kill';
    if (source !== 'leader') {
      const roll = Math.random();
      kind = roll < 0.45 ? 'kill' : roll < 0.65 ? 'deliver' : roll < 0.85 ? 'recover' : 'skin';
    }
    const q = { kind, source, done: false };
    if (kind === 'kill') {
      q.creatureId = this.questCreatureFor(p);
      q.count = Math.min(3 + p.circle, 8);
    } else if (kind === 'deliver') {
      const target = pick(DELIVERY);
      q.target = target;
    } else if (kind === 'recover') {
      const trinket = pick(Object.values(TRINKETS));
      q.trinket = trinket;
      q.creatureId = this.questCreatureFor(p);
      q.found = false;
    } else {
      q.count = Math.min(2 + Math.floor(p.circle / 2), 6);
      q.skinned = 0;
    }
    p.quest = q;
    game.persistPlayer(p);
    return q;
  },

  questDescription(p) {
    const q = p.quest;
    if (!q) return '';
    if (q.kind === 'kill') {
      const def = creatureById(q.creatureId);
      return `Slay ${q.count} more ${def.plural}.`;
    }
    if (q.kind === 'deliver') {
      return `Carry ${q.target.parcel} to ${q.target.name} at ${roomById(q.target.room).name}. Say "deliver" when you arrive.`;
    }
    if (q.kind === 'recover') {
      return q.found
        ? `Recover ${q.trinket.name} — it is yours, bring it to the crier.`
        : `Find ${q.trinket.name}; it was lost to the ${creatureById(q.creatureId || 'great_rat').plural} of the wilds.`;
    }
    return `Skin ${q.count} more creatures and bring the hides to the crier.`;
  },

  // A kill advances kill quests and may surface recover quest trinkets.
  questKill(game, p, creatureId) {
    if (!p.quest || p.quest.done) return;
    const q = p.quest;
    if (q.kind === 'kill' && q.creatureId === creatureId) {
      q.count -= 1;
      if (q.count <= 0) {
        q.count = 0;
        q.done = true;
        gainSkillExp(p, 'perception', 10);
        gainSkillExp(p, 'fitness', 10);
        p.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1mQuest complete!\x1b[0m Return to the town crier and say "claim" to collect your reward.` }));
      }
      game.persistPlayer(p);
      return;
    }
    if (q.kind === 'recover' && !q.found && creatureId === q.creatureId) {
      if (Math.random() < 0.5) {
        q.found = true;
        q.done = true;
        gainSkillExp(p, 'perception', 8);
        p.ws.send(JSON.stringify({ t: 'msg', msg: `\nYou pry the filth from the remains — there it is: ${q.trinket.name}! (Return to the crier and say "claim".)` }));
        game.persistPlayer(p);
      }
    }
  },

  // A successful skinning harvest advances skin quests.
  questSkin(game, p) {
    const q = p.quest;
    if (!q || q.done || q.kind !== 'skin') return;
    q.skinned = (q.skinned || 0) + 1;
    if (q.skinned >= q.count) {
      q.done = true;
      gainSkillExp(p, 'skinning', 10);
      p.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1mQuest complete!\x1b[0m Return to the town crier and say "claim" to collect your reward.` }));
    } else {
      p.ws.send(JSON.stringify({ t: 'msg', msg: `The crier's work is underway — ${q.count - q.skinned} more creature(s) to skin.` }));
    }
    game.persistPlayer(p);
  },

  // A delivery completes when the runner stands in the target room.
  questDeliver(game, p) {
    const q = p.quest;
    if (!q || q.done || q.kind !== 'deliver') return { ok: false, msg: 'You are not carrying anything to deliver.' };
    if (q.target.room !== p.room) {
      return { ok: false, msg: `You still carry ${q.target.parcel}. It belongs to ${q.target.name} at ${roomById(q.target.room).name}.` };
    }
    q.done = true;
    gainSkillExp(p, 'appraisal', 10);
    gainSkillExp(p, 'athletics', 8);
    game.persistPlayer(p);
    return { ok: true, msg: `\n${q.target.name} takes ${q.target.parcel} with a nod of thanks. "The crier will settle your pay." Return to the town square and say "claim".` };
  },

  questClaim(game, p) {
    if (!p.quest) return { ok: false, msg: 'You have no quest. Ask the crier or your guild leader for work.' };
    if (!p.quest.done) {
      return { ok: false, msg: `Your quest is not finished. ${this.questDescription(p)}` };
    }
    const q = p.quest;
    const def = q.creatureId ? creatureById(q.creatureId) : null;
    let silver = 40 + (def ? def.circle * 35 : 30);
    let skillExp = '';
    if (q.kind === 'deliver') { silver = Math.floor(silver * 0.7); if (gainSkillExp(p, 'appraisal', 8)) skillExp = ' Your Appraisal improved!'; }
    if (q.kind === 'recover') { if (gainSkillExp(p, 'appraisal', 8)) skillExp = ' Your Appraisal improved!'; }
    if (q.kind === 'skin') { if (gainSkillExp(p, 'skinning', 10)) skillExp = ' Your Skinning improved!'; }
    p.silver += silver;
    const fromLeader = q.source === 'leader';
    if (fromLeader && p.guild.guildSkill && SKILLS[p.guild.guildSkill]) gainSkillExp(p, p.guild.guildSkill, 20);
    p.quest = null;
    game.persistPlayer(p);
    if (fromLeader) {
      return { ok: true, msg: `Your guild leader nods. "Work well done." You pocket ${silver} silvers and your ${SKILLS[p.guild.guildSkill].name} sharpens.${skillExp}` };
    }
    const kindLine = q.kind === 'deliver' ? 'The parcel is delivered, the town runs a little smoother.' : q.kind === 'recover' ? 'The trinket is returned to its owner.' : q.kind === 'skin' ? 'The hides are stacked and salted.' : 'Good hunting.';
    return { ok: true, msg: `The crier hands you ${silver} silvers. "${kindLine}"${skillExp}` };
  },
};
