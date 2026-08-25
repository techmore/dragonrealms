// Progression simulator: grinds a fresh character to circle 10 using the real
// combat/exp/training systems, then reports pacing. Run: node scripts/simulate-progression.mjs [guild]
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'dr-sim-'));
process.env.DR_DB_PATH = join(tmp, 'sim.db');

const { migrate, closeDb } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const { createCharacter, loadPlayer, gainSkillExp, tdpTrainCost, skillRank, pulseExp } = await import('../server/player.js');
const { Game } = await import('../server/game.js');
const { handleCommand } = await import('../server/commands/index.js');
const { circleRequirements, circleRequirementNeeds, trainableSkills } = await import('../data/guilds.js');
const { CREATURES } = await import('../data/creatures.js');

const GUILD = process.argv[2] || 'warmage';

// Mirror all output to the /jobs.html live viewer (public/live/sim-<guild>.log).
const { liveJob } = await import('./live-log.mjs');
const jobLog = liveJob('sim-' + GUILD);
const baseLog = console.log.bind(console);
console.log = (...a) => { baseLog(...a); try { jobLog(a.join(' ')); } catch {} };

migrate();
const game = new Game();
game.init();
// The simulation advances combat and experience explicitly, so all real-time
// background systems stay stopped.
game.stop();

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

const { addItem } = await import('../server/player.js');
const give = (itemId, cmd) => { addItem(p, itemId, 1); handleCommand(game, p, cmd); };

give('short_sword', 'wield short_sword');
give('padded_cloth', 'wear padded_cloth');

let ticks = 0;
let hunts = 0;
let deaths = 0;
let kills = 0;
let silverEarned = 0;
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
    p.room = 'bazaar';
    handleCommand(game, p, 'steal shopkeeper');
  }
  for (const room of ['bazaar', 'market_end']) {
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

function requirementNeeds() {
  const bySkill = new Map();
  const taught = new Set(trainableSkills(p.guild));
  const raw = circleRequirementNeeds(p.guild, p.skills, p.circle + 1);

  for (const { skill, need, candidates } of raw) {
    if (candidates) continue;
    bySkill.set(skill, Math.max(need, bySkill.get(skill) || 0));
  }

  // Reserve a distinct concrete target for every Nth row. Without this, all
  // rows can collapse onto one strong trainer-taught skill and breadth never
  // increases (for example a Barbarian's four weapon requirements).
  const nthRows = new Map();
  for (const req of raw.filter((entry) => entry.candidates)) {
    const key = `${req.set}:${req.nth}`;
    const prior = nthRows.get(key);
    if (!prior || req.need > prior.need) nthRows.set(key, req);
  }
  const usedBySet = new Map();
  const ordered = [...nthRows.values()].sort((a, b) => a.set.localeCompare(b.set) || a.nth - b.nth);
  for (const req of ordered) {
    const used = usedBySet.get(req.set) || new Set();
    const ranked = req.candidates
      .filter((id) => !used.has(id))
      .sort((a, b) => ((p.skills[b] || {}).rank || 0) - ((p.skills[a] || {}).rank || 0));
    const belowNeed = ranked.filter((id) => ((p.skills[id] || {}).rank || 0) < req.need);
    const skill = belowNeed.find((id) => taught.has(id)) || belowNeed[0] || req.skill;
    used.add(skill);
    usedBySet.set(req.set, used);
    bySkill.set(skill, Math.max(req.need, bySkill.get(skill) || 0));
  }
  return bySkill;
}

function trainAtGuild() {
  const needs = requirementNeeds();
  // Multiple passes: one train session gives ~40% of a rank, so a single
  // call per hunt left binding requirements (parry/defending) crawling.
  for (let pass = 0; pass < 4; pass++) {
    let trained = false;
    for (const skillId of trainableSkills(p.guild)) {
      const need = needs.get(skillId) || 0;
      const rank = (p.skills[skillId] || {}).rank || 0;
      if (rank >= need) continue;
      const cost = 40 + rank * 20;
      if (p.silver >= cost) { handleCommand(game, p, `train ${skillId}`); trained = true; }
    }
    if (!trained) break;
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

// These skills receive dependable practice from the simulator's combat and
// between-hunt actions. Save finite TDPs for gaps such as First Aid,
// Locksmithing, extra weapons, and otherwise unavailable breadth skills.
const ORGANIC_SKILLS = new Set([
  'performance', 'scholarship', 'appraisal',
  'evasion', 'athletics', 'perception', 'stealth', 'foraging', 'skinning',
  'parry', 'defending', 'fitness', 'hunting', 'tracking',
  'inner_fire', 'expertise', 'trading', 'thievery',
  'attunement', 'arcana', 'augmentation', 'debilitation', 'targeted_magic',
  'utility_magic', 'warding_magic', 'primary_magic',
  'light_armor', 'chain_armor', 'medium_edged',
]);

function tdpBoost() {
  // Preserve TDPs for requirements the guild trainer cannot teach; normal
  // guild skills use the silver sink above. EXCEPTION: defensive skills
  // (parry/defending) rise organically only while under attack — caster
  // guilds kill too fast to feed them, and the trainer's 40%-per-session
  // rate makes pure silver-training glacial at high ranks. When a taught
  // defensive requirement lags, spend TDPs on it rather than stalling.
  const taught = new Set(trainableSkills(p.guild));
  const DEFENSIVE = new Set(['parry', 'defending']);
  // Spell-school skills grow only by casting: organic for magic guilds,
  // dead weight for martials (barbarian 1st Supernatural, thief Inner
  // Magic-adjacent breadth). Those must fall through to TDP training.
  const CAST_ONLY = new Set(['augmentation', 'debilitation', 'targeted_magic', 'utility_magic', 'warding_magic', 'primary_magic']);
  for (const [skill, need] of requirementNeeds()) {
    if (ORGANIC_SKILLS.has(skill) && !DEFENSIVE.has(skill) && !(CAST_ONLY.has(skill) && !p.guild.magic)) continue;
    if (!DEFENSIVE.has(skill) && taught.has(skill)) continue;
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
  if (hunts % 1000 === 0) {
    const missing = circleRequirements(p.guild, p.skills, p.circle + 1).missing.slice(0, 3).join('; ');
    const targets = [...requirementNeeds()].map(([id, need]) => `${id} ${(p.skills[id] || {}).rank || 0}/${need}`).slice(0, 4).join(', ');
    report(`  ...hunt ${hunts}: circle ${p.circle}, hp ${p.hp}/${p.maxHp}, TDP ${p.tdp}, silver ${p.silver}, ticks ${Math.floor(ticks / 60)}m${missing ? `; next: ${missing}` : ''}${targets ? `; train: ${targets}` : ''}`);
  }
  // Gear up
  for (const g of GEAR) {
    if (p.circle >= g.min) {
      if (g.weapon && (!p.equipment.hand || p.equipment.hand.id !== g.weapon)) give(g.weapon, `wield ${g.weapon}`);
      if (g.armor && (!p.equipment.torso || p.equipment.torso.id !== g.armor)) give(g.armor, `wear ${g.armor}`);
      if (g.shield && (!p.equipment.shield || p.equipment.shield.id !== g.shield)) give(g.shield, `wear ${g.shield}`);
    }
  }
  // Breadth activities a real player does between fights.
  // Some high-circle combat zones are barren/urban rather than forageable.
  // Practice fieldcraft in the nearest true wilds before walking to the hunt.
  p.room = game.isWild(hunt.room) ? hunt.room : 'woods_1';
  handleCommand(game, p, 'hunt');
  handleCommand(game, p, 'forage');
  handleCommand(game, p, 'hide');
  handleCommand(game, p, 'perform');
  ticks += 18; // hunt 5 + forage 5 + hide 3 + performance 5 RT

  p.room = hunt.room;
  const def = CREATURES[hunt.ids[Math.floor(Math.random() * hunt.ids.length)]];
  const res = game.combat.start(p, [def]);
  if (!res.ok) { console.error('combat start failed'); break; }
  let combat = res.combat;
  let guard = 0;
  while (game.combat.getFor(p) && guard++ < 2000) {
    combat.tick();
    ticks += 1;
    tryCast(combat, guard);
    // Maneuvers train Tactics (and the weapon skill) — a real adventurer
    // uses them; fire early so short fights still get one in.
    if (guard === 2 || guard % 8 === 0) handleCommand(game, p, 'disarm');
    if (p.guild.id === 'barbarian' && guard % 6 === 0) handleCommand(game, p, 'analyze flame');
    if (p.guild.id === 'barbarian' && guard === 3 && !combat.berserk) handleCommand(game, p, 'berserk');
    // Thieves weave khri every fight (concentration arts): feeds Stealth,
    // Inner Magic (primary_magic), and the khri's supernatural school —
    // the wiki-documented way thieves raise those circle requirements.
    if (p.guild.id === 'thief' && guard % 6 === 0) {
      handleCommand(game, p, ['khri elusion', 'khri focus', 'khri sight'][guard % 3 === 0 ? 0 : guard % 3 - 1]);
    }
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
  pulseExp(p); // field pools pulse between hunts
  // Skin + sell
  const corpse = (p.corpses || []).slice();
  for (const c of corpse) {
    // Skill check can fumble; retry until the corpse is dressed or gone.
    let tries = 0;
    while (p.corpses.some((x) => x === c) && tries++ < 20) handleCommand(game, p, `skin ${c.def.id}`);
  }
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
  p.room = 'temple';
  handleCommand(game, p, 'study');
  ticks += 4;
  // Return to the guild hall to train and circle, like a real player.
  p.room = `hall_${GUILD}`;
  trainAtGuild();
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

game.stop();
closeDb();
rmSync(tmp, { recursive: true, force: true });
