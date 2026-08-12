// Progression simulator: grinds a fresh character to circle 10 using the real
// combat/exp/training systems, then reports pacing. Run: node scripts/simulate-progression.mjs [guild]
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-sim-'));
process.env.DR_DB_PATH = join(tmp, 'sim.db');

const { migrate, closeDb } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const { createCharacter, loadPlayer, gainSkillExp, tdpTrainCost, skillRank } = await import('../server/player.js');
const { Game } = await import('../server/game.js');
const { handleCommand } = await import('../server/commands/index.js');
const { circleRequirements, circleRequirementNeeds } = await import('../data/guilds.js');
const { CREATURES } = await import('../data/creatures.js');

const GUILD = process.argv[2] || 'warmage';
migrate();
const game = new Game();
game.init();
game.combat.stopTicker();
clearInterval(game.respawnTicker);
clearInterval(game.autosaveTicker);

// Hunt table by circle: [creatureId, room]
const HUNTS = [
  { min: 1, room: 'sewers_2', ids: ['rat', 'kobold'] },
  { min: 3, room: 'woods_1', ids: ['goblin', 'wolf'] },
  { min: 5, room: 'marsh_2', ids: ['wisp'] },
  { min: 6, room: 'cinder_1', ids: ['cinder_lizard', 'fire_drake'] },
  { min: 7, room: 'camp_den', ids: ['bandit_captain'] },
  { min: 8, room: 'black_1', ids: ['wraith', 'revenant'] },
  { min: 9, room: 'black_2', ids: ['dread_knight'] },
];

const GEAR = [
  { min: 1, weapon: 'short_sword', armor: 'padded_cloth', shield: 'shield_wood' },
  { min: 3, weapon: 'steel_sword', armor: 'studded', shield: null },
  { min: 4, weapon: null, armor: 'chainmail', shield: 'shield_wood' },
  { min: 6, weapon: null, armor: 'ring_mail', shield: null },
  { min: 7, weapon: 'mithril_blade', armor: null, shield: 'shield_steel' },
  { min: 10, weapon: 'dragonsteel_greatsword', armor: null, shield: null },
];

function huntFor(circle) {
  return [...HUNTS].reverse().find((h) => circle >= h.min);
}

const acc = await auth.registerAccount('simrunner', 'simpass1');
const charId = createCharacter(acc.accountId, { name: 'Simmy', race: 'human', guild: GUILD });
const p = loadPlayer(charId);
const sink = { send() {} };
p.ws = sink;
p.online = true;
game.addPlayer(p);

const equip = (id) => {
  if (!id) return;
  const { addItem } = p.inventory.length ? {} : {};
};
const { addItem } = await import('../server/player.js');
const give = (itemId, cmd) => { addItem(p, itemId, 1); handleCommand(game, p, cmd); };

give('short_sword', 'wield short_sword');
give('padded_cloth', 'wear padded_cloth');

let ticks = 0;
let hunts = 0;
let deaths = 0;
let kills = 0;
let silverEarned = 0;
let totalExp = 0;
const startReal = Date.now();
const circleTimes = { 1: 0 };

const report = (msg) => console.log(msg);

function restToFull() {
  // Rest = 2s per tick until full.
  let t = 0;
  while ((p.hp < p.maxHp || (p.guild.magic && p.mana < p.maxMana)) && t < 40) { p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.025)); if (p.guild.magic) p.mana = Math.min(p.maxMana, p.mana + Math.max(2, Math.floor(p.maxMana * 0.04))); t++; gainSkillExp(p, "athletics", 2); }
  ticks += t * 2;
}

function sellLoot() {
  // Walk to the markets, sell everything the vendors will take, come back.
  const backRoom = p.room;
  if (p.guild.id === 'thief') {
    p.room = 'market_way';
    handleCommand(game, p, 'steal shopkeeper');
  }
  for (const room of ['market_way', 'market_end']) {
    p.room = room;
    for (const inv of [...p.inventory]) {
      if (['padded_cloth', 'short_sword', 'strongbox'].includes(inv.item.id)) continue;
      if (inv.item.type === 'consumable' && inv.item.restore) continue;
      const before = p.silver;
      handleCommand(game, p, `sell ${inv.item.id}`);
      silverEarned += p.silver - before;
    }
  }
  p.room = backRoom;
}

function trainPrimaries() {
  const guild = p.guild;
  const need = p.circle + 1;
  for (const skillId of guild.primary) {
    const rank = (p.skills[skillId] || {}).rank || 0;
    if (rank >= need + 1) continue;
    const cost = 40 + rank * 20;
    if (p.silver >= cost) {
      handleCommand(game, p, `train ${skillId}`);
    }
  }
  for (const skillId of guild.secondary) {
    const rank = (p.skills[skillId] || {}).rank || 0;
    if (rank >= Math.max(1, need - 1)) continue;
    const cost = 40 + rank * 20;
    if (p.silver >= cost) {
      handleCommand(game, p, `train ${skillId}`);
    }
  }
}

function tryCast(combat, tickInFight) {
  const guild = p.guild;
  if (!guild.magic || !guild.spells || !guild.spells.length) return;
  // Only offensive/self-buff spells; fleeing spells would abort the fight.
  const spell = guild.spells.find((s) => s.minCircle <= p.circle && s.kind !== 'flee' && s.kind !== 'teleport');
  if (!spell) return;
  if (p.mana < spell.mana) return;
  if (tickInFight % 5 !== 0) return;
  handleCommand(game, p, `cast ${spell.name.toLowerCase()}`);
}

function tdpBoost() {
  // Spend TDPs on the weakest skill each requirement row names.
  const needs = circleRequirementNeeds(p.guild, p.skills, p.circle + 1);
  for (const { skill, need } of needs) {
    let rank = (p.skills[skill] || {}).rank || 0;
    let guard = 0;
    while (rank < need && p.tdp >= tdpTrainCost(rank) && guard++ < 12) {
      handleCommand(game, p, `tdptrain ${skill}`);
      rank = (p.skills[skill] || {}).rank || 0;
    }
  }
}

function tryCircle() {
  if (p.circle >= 10) return true;
  p.room = `hall_${GUILD}`;
  handleCommand(game, p, "circle");
  if (p.circle > 1 && !circleTimes[p.circle]) circleTimes[p.circle] = ticks;
  return p.circle >= 10;
}

let safety = 0;
report(`=== Progression sim: ${p.guild.name} (${p.race.name}) -> circle 10 ===`);
while (p.circle < 10 && safety++ < 30000) {
  const hunt = huntFor(p.circle);
  if (hunts % 1000 === 0) report(`  ...hunt ${hunts}: circle ${p.circle}, hp ${p.hp}/${p.maxHp}, ticks ${Math.floor(ticks / 60)}m`);
  // Gear up
  for (const g of GEAR) {
    if (p.circle >= g.min) {
      if (g.weapon && (!p.equipment.hand || p.equipment.hand.id !== g.weapon)) give(g.weapon, `wield ${g.weapon}`);
      if (g.armor && (!p.equipment.torso || p.equipment.torso.id !== g.armor)) give(g.armor, `wear ${g.armor}`);
      if (g.shield && (!p.equipment.shield || p.equipment.shield.id !== g.shield)) give(g.shield, `wear ${g.shield}`);
    }
  }
  // Breadth activities a real player does between fights.
  if (hunts % 3 === 0) handleCommand(game, p, 'hunt');
  if (hunts % 4 === 0) handleCommand(game, p, 'forage');
  if (hunts % 7 === 0) handleCommand(game, p, 'hide');
  if (hunts % 9 === 0 && p.guild.magic) handleCommand(game, p, 'perform');

  p.room = hunt.room;
  const def = CREATURES[hunt.ids[Math.floor(Math.random() * hunt.ids.length)]];
  const res = game.combat.start(p, [def]);
  if (!res.ok) { console.error('combat start failed'); break; }
  let combat = res.combat;
  let guard = 0;
  let usedManeuver = false;
  while (game.combat.getFor(p) && guard++ < 2000) {
    combat.tick();
    ticks += 1;
    tryCast(combat, guard);
    if (!usedManeuver && guard % 12 === 0) { handleCommand(game, p, 'disarm'); usedManeuver = true; }
    if (p.guild.id === 'barbarian' && guard === 3 && !combat.berserk) handleCommand(game, p, 'berserk');
  }
  hunts += 1;
  if (p.hp <= 0) {
    deaths += 1;
    p.hp = Math.floor(p.maxHp * 0.5);
    p.room = 'temple';
    // Death exp penalty already applied by engine.
    restToFull();
    continue;
  }
  kills += 1;
  // Skin + sell
  const corpse = (p.corpses || []).slice();
  for (const c of corpse) handleCommand(game, p, `skin ${c.def.id}`);
  const box = p.inventory.find((i) => i.item.id === 'strongbox');
  if (box) handleCommand(game, p, 'pick strongbox');
  sellLoot();
  // Drink a potion when hurt to train first aid.
  if (p.hp < p.maxHp * 0.85) {
    const pot = p.inventory.find((i) => i.item.type === 'consumable' && i.item.restore);
    if (pot) handleCommand(game, p, `use ${pot.item.name}`);
  }
  restToFull();
  // Study at the temple on the way to the guild hall (scholarship).
  if (hunts % 5 === 0) {
    p.room = 'temple';
    handleCommand(game, p, 'study');
  }
  // Return to the guild hall to train and circle, like a real player.
  p.room = `hall_${GUILD}`;
  trainPrimaries();
  tdpBoost();
  if (tryCircle()) break;
  p.room = hunt.room;
}

report(`\n=== Results (${p.guild.name}) ===`);
report(`Circle reached: ${p.circle}`);
const hours = Math.floor((ticks / 3600) * 10) / 10;
report(`Simulated time: ${Math.floor(ticks / 60)} minutes (${hours} hours)`);
report(`Real time: ${Math.round((Date.now() - startReal) / 1000)}s`);
report(`Hunts: ${hunts}, kills: ${kills}, deaths: ${deaths}`);
report(`Silver earned: ${silverEarned}, on hand: ${p.silver}`);
report(`TDPs: ${p.tdp}`);
report(`Circle milestones (sim minutes):`);
for (const [c, t] of Object.entries(circleTimes)) report(`  circle ${c}: ${Math.floor(t / 60)}m`);
report(`Final primary ranks: ${p.guild.primary.map((s) => `${s}=${(p.skills[s] || {}).rank || 0}`).join(', ')}`);

game.combat.stopTicker();
closeDb();
rmSync(tmp, { recursive: true, force: true });
