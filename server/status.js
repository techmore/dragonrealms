// Player status presentation: guild trainer lookup, the prompt line, who list.
import { roomById } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { guildTitle } from '../data/guilds.js';
import { roundtimeLeft, weaponOf } from './player.js';

export const status = {
  guildTrainer(p) {
    const room = roomById(p.room);
    if (!room) return null;
    for (const npcId of room.npcs || []) {
      const npc = npcById(npcId);
      if (npc && npc.role === 'guild' && npc.guild === p.guild.id) return npc;
    }
    return null;
  },

  status(game, p) {
    const hp = p.hp > 0 ? p.hp : 0;
    const inCombat = game.combat.getFor(p) ? '[COMBAT]' : '';
    const prep = p.prepared ? `  [prepared: ${p.prepared.spellId} @ ${p.prepared.pct}%]` : '';
    const res = p.guild.magic
      ? `\x1b[33mMana: ${p.mana}/${p.maxMana}\x1b[0m`
      : p.guild.id === 'barbarian'
        ? `\x1b[31mFire: ${p.innerFire}/${p.maxInnerFire}\x1b[0m`
        : '';
    const stam = `\x1b[32mStamina: ${p.stamina}/${p.maxStaminaEff}\x1b[0m`;
    const rt = roundtimeLeft(p);
    const rtTxt = rt > 0 ? `  \x1b[31mRT: ${rt}\x1b[0m` : '';
    // Hands (DR client window): push a structured inventory snapshot whenever
    // gear changed — the client keeps a persistent "hands" bar.
    if (p.handsDirty) {
      p.handsDirty = false;
      const w = weaponOf(p);
      const worn = Object.entries(p.equipment)
        .filter(([slot]) => slot !== 'hand')
        .map(([, i]) => i.name);
      const carried = p.inventory.reduce((s, e) => s + e.qty, 0);
      p.ws.send(JSON.stringify({
        t: 'hands',
        hand: w ? w.name : null,
        worn,
        carried,
      }));
    }
    p.ws.send(JSON.stringify({
      t: 'prompt',
      msg: `\n\x1b[36mHP: ${hp}/${p.maxHp}\x1b[0m  ${res}  ${stam}${rtTxt}  \x1b[35mCircle ${p.circle}\x1b[0m  ${p.silver} silvers ${inCombat}${prep}\n> `,
    }));
  },

  who(game) {
    return [...game.players.values()].map((p) => `${p.name} (${p.race.name} ${guildTitle(p.guild, p.circle)}, circle ${p.circle})`);
  },
};
