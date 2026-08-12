// Quest assignment and completion (crier pest control + guild-leader tasks).
import { roomById } from '../data/world.js';
import { creatureById } from '../data/creatures.js';
import { SKILLS } from '../data/skills.js';
import { gainSkillExp } from './player.js';

export const quests = {
  hasCrier(p) {
    const room = roomById(p.room);
    return Boolean(room && room.npcs && room.npcs.includes('towncrier'));
  },

  questCreatureFor(p) {
    const tiers = [
      { upTo: 2, pool: ['rat', 'kobold'] },
      { upTo: 4, pool: ['goblin', 'wolf'] },
      { upTo: 99, pool: ['wisp', 'bandit', 'troll'] },
    ];
    const tier = tiers.find((t) => p.circle <= t.upTo);
    const pool = tier ? tier.pool : ['rat'];
    return pool[Math.floor(Math.random() * pool.length)];
  },

  assignQuest(game, p, source = 'crier') {
    const id = this.questCreatureFor(p);
    p.quest = { creatureId: id, count: Math.min(3 + p.circle, 8), done: false, source };
    game.persistPlayer(p);
    return p.quest;
  },

  questKill(game, p, creatureId) {
    if (!p.quest || p.quest.done || p.quest.creatureId !== creatureId) return;
    p.quest.count -= 1;
    if (p.quest.count <= 0) {
      p.quest.count = 0;
      p.quest.done = true;
      gainSkillExp(p, 'perception', 10);
      gainSkillExp(p, 'fitness', 10);
      game.persistPlayer(p);
      p.ws.send(JSON.stringify({ t: 'msg', msg: `\n\x1b[1mQuest complete!\x1b[0m Return to the town crier and say "claim" to collect your reward.` }));
    } else {
      game.persistPlayer(p);
    }
  },

  questClaim(game, p) {
    if (!p.quest) return { ok: false, msg: 'You have no quest. Ask the crier or your guild leader for work.' };
    if (!p.quest.done) {
      return { ok: false, msg: `Your quest is not finished. Slay ${p.quest.count} more to complete it.` };
    }
    const def = creatureById(p.quest.creatureId);
    const silver = 40 + (def ? def.circle * 35 : 40);
    p.silver += silver;
    const fromLeader = p.quest.source === 'leader';
    if (fromLeader && p.guild.guildSkill && SKILLS[p.guild.guildSkill]) gainSkillExp(p, p.guild.guildSkill, 20);
    p.quest = null;
    game.persistPlayer(p);
    return fromLeader
      ? { ok: true, msg: `Your guild leader nods. "Work well done." You pocket ${silver} silvers and your ${SKILLS[p.guild.guildSkill].name} sharpens.` }
      : { ok: true, msg: `The crier hands you ${silver} silvers. "Good hunting," he says with a grin.` };
  },
};
