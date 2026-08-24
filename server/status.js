// Player status presentation: guild trainer lookup, the prompt line, who list.
import { roomById } from '../data/world.js';
import { npcById } from '../data/npcs.js';
import { guildTitle } from '../data/guilds.js';
import { SKILLS, mindstate } from '../data/skills.js';
import { roundtimeLeft, weaponOf, poolCap, sayRaw } from './player.js';
import { BLEED_LEVELS } from './wounds.js';
const BLEED_NAMES = Object.fromEntries(BLEED_LEVELS.map((b) => [b.level, b.name]));

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
    const hidden = p.hidden ? '  \x1b[1m[Hidden]\x1b[0m' : '';
    const resting = p.resting ? '  [Resting]' : '';
    // Agent boost tag: boosted test runs are always visible in the prompt.
    const bm = Number(p.boostMult) || 1;
    const boost = bm > 1 ? `  [BOOST x${bm}]` : '';
    // Hands (DR client window): push a structured inventory snapshot whenever
    // gear changed — the client keeps a persistent "hands" bar.
    if (p.handsDirty) {
      p.handsDirty = false;
      const w = weaponOf(p);
      const worn = Object.entries(p.equipment)
        .filter(([slot]) => slot !== 'hand')
        .map(([, i]) => i.name);
      const carried = p.inventory.reduce((s, e) => s + e.qty, 0);
      // Per-slot map for the client's paper doll (head/torso/shield/feet/...).
      // Each entry carries the display name plus condition so the doll can
      // tint damaged gear red (DR shows wear on appraise; we surface it live).
      // 'chest' is normalized into 'torso' — some legacy items use it and the
      // doll has no chest region (a stained vest never used to light up).
      const SLOT_ALIAS = { chest: 'torso' };
      const slots = {};
      for (const [slot, i] of Object.entries(p.equipment)) {
        const key = SLOT_ALIAS[slot] || slot;
        if (!slots[key]) slots[key] = [];
        slots[key].push({ name: i.name, cond: Math.round(i.condition ?? 100) });
      }
      sayRaw(p, {
        t: 'hands',
        hand: w ? w.name : null,
        worn,
        carried,
        slots,
      });
    }
    // Bleeding wounds show in the prompt (DR shows bleeders in health).
    // Tended wounds carry ", tended" so the client's paper doll can hold
    // them steady instead of pulsing (pd-tended). Entries are joined with
    // '; ' — commas inside parens belong to the entry, not the separator.
    const openWounds = (p.wounds || []).filter((w) => !w.resolved);
    const bleedTxt = openWounds.length
      ? `  \x1b[31m[bleeding: ${openWounds.map((w) => `${w.part} (${BLEED_NAMES[w.level] || w.level}${w.tended ? ', tended' : ''})`).join('; ')}]\x1b[0m`
      : '';
    // Structured buff list for the client's BUFFS window: every active effect
    // with remaining ticks, plus the agent boost (a test-only "buff") when on.
    // Names mirror the `effects` command in commands/character.js.
    const BUFF_NAMES = {
      frenzy: 'Frenzy', ironhide: 'Ironhide', shadow: 'Shadow Veil',
      omen: "Omen's Edge", wind: 'Windborne', warpaint: 'Warpaint',
      glyph_ward: 'Glyph of Warding', glyph_valor: 'Glyph of Valor',
      glyph_shield: 'Glyph of Shielding', keen: 'Keen Mind',
      vigor: 'Vigor', sun: 'Sun Blessing',
    };
    const buffs = Object.entries(p.buffs || {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: BUFF_NAMES[k] || k, ticks: v }));
    if (bm > 1) buffs.push({ key: '_boost', name: `Agent Boost x${bm}`, ticks: null, permanent: true });
    sayRaw(p, {
      t: 'prompt',
      msg: `\n\x1b[36mHP: ${hp}/${p.maxHp}\x1b[0m  ${res}  ${stam}${rtTxt}  \x1b[35mCircle ${p.circle}\x1b[0m  ${p.silver} silvers ${inCombat}${hidden}${resting}${boost}${prep}${bleedTxt}\n> `,
      buffs,
    });
    // FE tracker (DR field-experience pane): push skills currently learning,
    // throttled to ~10s.
    if (!p.feAt || Date.now() - p.feAt > 10000) {
      p.feAt = Date.now();
      const rows = [];
      for (const [skillId, pool] of Object.entries(p.expPools || {})) {
        const def = SKILLS[skillId];
        if (!def || pool <= 0) continue;
        const rank = (p.skills[skillId] || {}).rank || 0;
        const pct = Math.min(100, (pool / Math.max(1, poolCap(p, skillId))) * 100);
        rows.push({ name: def.name, rank, mindstate: mindstate(pct) });
      }
      rows.sort((a, b) => {
        const order = ['clear', 'dabbling', 'perusing', 'learning', 'thoughtful', 'thinking',
          'considering', 'pondering', 'ruminating', 'concentrating', 'attentive',
          'deliberative', 'interested', 'examining', 'understanding', 'absorbing',
          'intrigued', 'scrutinizing', 'analyzing', 'studious', 'focused',
          'very focused', 'engaged', 'very engaged', 'cogitating', 'fascinated',
          'captivated', 'engrossed', 'riveted', 'very riveted', 'rapt', 'very rapt',
          'enthralled', 'nearly locked', 'mind lock'];
        return order.indexOf(b.mindstate) - order.indexOf(a.mindstate);
      });
      sayRaw(p, { t: 'mindstate', skills: rows.slice(0, 10) });
    }
  },

  who(game) {
    return [...game.players.values()].map((p) => `${p.name} (${p.race.name} ${guildTitle(p.guild, p.circle)}, circle ${p.circle})`);
  },
};
