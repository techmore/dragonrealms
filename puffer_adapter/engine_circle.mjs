// Hierarchical RL: network chooses activities; bounded scripts execute real commands.
// No rank, EXP, money, gear or circle grants. Only an owned temporary game database.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { virtualClock } from './virtual_clock.mjs';
import { CIRCLE_REWARD_VERSION } from './circle_reward.mjs';
import { parseArgs } from 'node:util';
import { validateTarget, nextGate, progressionReward, CURRICULUM_VERSION } from './curriculum.mjs';
import {economicObservation, itemCosts, ECONOMIC_SCHEMA} from './economic_observation.mjs';
import {clientFeatureSpec, encodeClientObservation, parseWireExperience, parseWireInventory, CLIENT_FEATURE_SCHEMA} from './client_contract.mjs';

const {values:options} = parseArgs({options:{guild:{type:'string',default:'ranger'},'target-circle':{type:'string',default:'2'},'time-cost-per-hour':{type:'string',default:'0'}}});
const guildId = options.guild;
if (!['ranger', 'barbarian'].includes(guildId)) throw new Error('Unknown curriculum');
const targetCircle = validateTarget(Number(options['target-circle']));
const timeCostPerHour = Number(options['time-cost-per-hour']);
if (!Number.isFinite(timeCostPerHour) || timeCostPerHour < 0 || timeCostPerHour > 1) throw new Error('Invalid time cost');
if (guildId !== 'barbarian' && (targetCircle !== 2 || timeCostPerHour !== 0)) throw new Error('Higher curriculum is Barbarian only');
const barbarian = guildId === 'barbarian';
const raceId = barbarian ? 'gortog' : 'human';
const characterName = barbarian ? 'PufferBarbarian' : 'PufferCircle';
const guildHall = `hall_${guildId}`;

const directory = mkdtempSync(join(tmpdir(), 'dr-puffer-circle-'));
process.env.DR_DB_PATH = join(directory, 'world.db');
process.env.DR_SPAWN_MULT = '1';
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
const { db, migrate, closeDb } = await import('../server/db.js');
const { registerAccount } = await import('../server/auth.js');
const { Game } = await import('../server/game.js');
const { createCharacter, loadPlayer, roundtimeLeft } = await import('../server/player.js');
const { handleCommand } = await import('../server/commands/index.js');
const { ROOMS } = await import('../data/world.js');
const { circleRequirements } = await import('../data/guilds.js');
const { SKILLS, expToNextRank } = await import('../data/skills.js');
const { NPCS } = await import('../data/npcs.js');
const { creatureById } = await import('../data/creatures.js');
const { ITEMS } = await import('../data/items.js');
migrate();
const account = await registerAccount(characterName, 'local-disposable-account');
const clock = virtualClock();
const random = Math.random;
const ids = Object.keys(SKILLS);
const actions = barbarian
  ? ['field_medicine', 'stealth', 'barbarian_arts', 'knife_combat', 'club_combat', 'skin_and_locks', 'rest', 'perform', 'guild', 'sword_combat', 'staff_combat', 'study']
  : ['field_medicine', 'stealth', 'magic', 'knife_combat', 'unarmed_combat', 'skin_and_locks', 'rest', 'perform', 'guild'];
const horizon = 2048;
let game, p, steps = 0, dead = false, ended = true, initialTime, maxCircle = 1, milestones = [];
let lastCommand = null, commandCount = 0;
let messages=[];
let clientFrames=[], clientSpec=null;
const totals = [0];
function absorbed(skill) {
  while (totals.length <= skill.rank) totals.push(totals.at(-1) + expToNextRank(totals.length - 1));
  return totals[skill.rank] + skill.exp;
}
function requirements() { return circleRequirements(p.guild, p.skills, nextGate(p.circle, targetCircle)); }
function command(text, seconds = 6) {
  if (dead) return;
  // Flee queues through the real game's RT gate and suppresses auto-swings.
  if (text !== 'flee') clock.advance(roundtimeLeft(p) * 1000);
  if (p.lastCorpse || p.hp <= 0) dead = true;
  if (dead) return;
  lastCommand = text; commandCount++;
  handleCommand(game, p, text, 0, { applyRT: true });
  clock.advance(seconds * 1000);
  if (p.lastCorpse || p.hp <= 0) dead = true;
}
function travel(destination) {
  if (dead) return false;
  if (p.room === destination) return true;
  if (p.combatId) recovery();
  if (p.combatId || dead) return false;
  const queue = [[p.room, []]], seen = new Set([p.room]);
  let route;
  while (queue.length) {
    const [room, path] = queue.shift();
    if (room === destination) { route = path; break; }
    for (const [dir, exit] of Object.entries(ROOMS[room]?.exits || {})) {
      const target = typeof exit === 'string' ? exit : exit?.to;
      if (!ROOMS[target] || seen.has(target) || (target!==destination && !target.startsWith('sewers_') && ROOMS[target].spawns?.some(id=>creatureById(id)?.circle>1))) continue;
      seen.add(target); queue.push([target, [...path, dir]]);
    }
  }
  if (!route) throw new Error(`No command route to ${destination}`);
  for (const dir of route) { if (dead) break; command(`go ${dir}`, 1); }
  return p.room === destination && !dead;
}
function shop(item) {
  const npc = Object.values(NPCS).find(n => n.stock?.[item]);
  const room = Object.values(ROOMS).find(r => r.npcs?.includes(npc?.id));
  if (!room) throw new Error(`No shop for ${item}`);
  if (!travel(room.id)) return;
  command(`buy ${item}`);
}
function owns(item) { return p.inventory.some(i => i.item.id === item); }
function recovery() {
  if (p.combatId) for (let i=0;i<8 && p.combatId && !dead;i++) command('flee',6);
  if (!p.combatId) {
    for (const wound of [...(p.wounds || [])]) command(`tend ${wound.part}`,6);
    for(let i=0;i<8 && !dead && (i===0 || p.hp<p.maxHp*.95);i++) command('rest',45);
  }
}
function activity(index) {
  const arts = barbarian && index === 2;
  if (arts) index = 3; // Combat-bound abilities use the same earned starter kit.
  // Only disposable gathered clutter in this private world; never player gear.
  for (const item of ['stick','branch']) {
    const entry=p.inventory.find(i=>i.item.id===item);
    if(entry) command(`drop ${item} ${entry.qty}`, 0);
  }
  for(const item of ['rat_pelt','kobold_skin']) if(owns(item)) command(`drop ${item} 100000`,0);
  if (barbarian) {
    const boxes = p.inventory.find(i=>i.item.id==='strongbox');
    if (boxes?.qty > 1) command(`drop strongbox ${boxes.qty-1}`,0);
  }
  if (arts && !(p.abilities || []).includes('everilds_rage')) {
    recovery(); if (!travel(guildHall)) return; command('learn everilds_rage');
  }
  if (index === 0) {
    if (!travel('pine_needle_path')) return;
    for (let i=0;i<24 && !dead;i++) {
      command('forage', 5);
      const herb = p.inventory.find(i => i.item.type === 'consumable');
      if (herb) command(`use ${herb.item.id}`, 30);
      for(const item of ['stick','branch']) if(owns(item)) command(`drop ${item}`,0);
    }
  } else if (index === 1) {
    if (!travel('pine_needle_path')) return;
    for (let i=0;i<24 && !dead;i++) { command('hunt'); command('hide'); if (!barbarian) command('unhide'); }
  } else if (index === 2) {
    if(!owns('cambrinth_band') && p.silver>500) shop('cambrinth_band');
    travel('pine_needle_path');
    for (let i=0;i<24 && !dead;i++) { command('perceive'); if(owns('cambrinth_band')) {command('charge cambrinth_band 5');command('invoke cambrinth_band');} command('prepare camouflage'); command('cast', 12); }
  } else if (index === 3 || index === 4 || (barbarian && (index === 9 || index === 10))) {
    if (!p.equipment.torso) { if (!owns('padded_cloth')) shop('padded_cloth'); command('wear padded_cloth'); }
    if (!p.equipment.shield) { if (!owns('shield_wood')) shop('shield_wood'); command('wear shield_wood'); }
    command('stance guarded');
    if (barbarian) {
      const weapon = ({3:'dagger',4:'club',9:'broadsword',10:'staff'})[index];
      if (!owns(weapon)) shop(weapon);
      // A rejected purchase cannot silently train a different weapon lane.
      if (!owns(weapon)) { recovery(); return; }
      command(`wield ${weapon}`);
    } else if (index === 3) { if (!owns('dagger')) shop('dagger'); command('wield dagger'); }
    else if (p.equipment.hand) command(`remove ${p.equipment.hand.id}`);
    recovery(); if (!travel(p.skills.evasion.rank>=2?'sewers_3':'sewers_2')) return;
    for (let i=0;i<120 && !dead;i++) {
      if (p.hp < p.maxHp*.65) { recovery(); break; }
      if (!p.combatId) {
        for (const corpse of [...p.corpses]) for(let j=0;j<3;j++) command(`skin ${corpse.def.id}`,3);
        const creature = game.creaturesIn(p.room).find(c => c.def.id==='kobold') || game.creaturesIn(p.room).find(c => c.def.circle <= 1);
        if (!creature) { clock.advance(20000); continue; }
        // ATTACK engages without imposing RT. Issue the learned roar before
        // advancing time to the first automatic swing; the real RT gate still applies.
        command(`attack ${creature.def.id}`, arts ? 0 : 1);
        if (arts && p.combatId) command('roar everilds_rage', 1);
      } else { command('advance', 1); }
      if (barbarian && p.combatId) {
        command('analyze'); command('trip');
      }
      for(const item of ['rat_pelt','kobold_skin']) if(owns(item)) command(`drop ${item} 100000`,0);
    }
    if (!p.combatId) {
      for (const corpse of [...p.corpses]) for (let j=0;j<3;j++) command(`skin ${corpse.def.id}`, 3);
    }
    recovery();
  } else if (index === 5) {
    if (p.combatId) recovery();
    for (const corpse of [...p.corpses]) for (let j=0;j<8;j++) command(`skin ${corpse.def.id}`, 3);
    for (let i=0;i<24 && owns('strongbox') && !dead;i++) command('pick strongbox', 5);
  } else if (index === 6) {
    recovery(); travel('pine_needle_path'); command('rest', 45);
    // Real walking practice uses actual exits, never skill grants.
    travel(guildHall); travel('pine_needle_path');
  } else if (index === 7) {
    if (!travel('pine_needle_path')) return;
    for (let i=0;i<24 && !dead;i++) command('perform');
  } else if (barbarian && index === 11) {
    recovery(); if (!travel('academy')) return;
    for (let i=0;i<24 && !dead;i++) command('study');
  } else {
    recovery(); if (!travel(guildHall)) return; command('circle');
  }
}
function snapshot(reward = 0) {
  const req = requirements();
  const economy = barbarian ? economicObservation(p) : null;
  const skills = Object.fromEntries(ids.map(id => [id, { rank:p.skills[id].rank, absorbed:absorbed(p.skills[id]), pooled:p.expPools[id] || 0 }]));
  const privilegedObservation=[steps/horizon,p.hp/p.maxHp,p.stamina/p.maxStamina,p.mana/Math.max(1,p.maxMana),p.circle/20,
      ...ids.flatMap(id=>[p.skills[id].rank/20,p.skills[id].exp/expToNextRank(p.skills[id].rank),Math.min(1,(p.expPools[id]||0)/1000)]),
      ...(economy?.features || []), ...req.rows.map(r=>Math.max(0,1-r.have/r.need))];
  // Build the training vector by exercising the same public game surface a
  // wire client has: room/look, prompt/status, exp and inventory. No p.skills,
  // p.expPools, equipment IDs, or hidden purse data enter this encoder.
  game.look(p); game.status(p); handleCommand(game,p,'exp'); handleCommand(game,p,'inventory');
  const prompt=[...clientFrames].reverse().find(frame=>frame.t==='prompt');
  const room=[...clientFrames].reverse().find(frame=>frame.t==='room');
  const experience=[...clientFrames].reverse().find(frame=>frame.t==='msg'&&String(frame.msg).includes('Experience'));
  const inventory=[...clientFrames].reverse().find(frame=>frame.t==='msg'&&String(frame.msg).includes('You are carrying:'));
  const clientEncoded=encodeClientObservation(clientSpec,{prompt,room,
    experience:parseWireExperience(experience,clientSpec.skillNames),
    inventory:parseWireInventory(inventory),guild:guildId,race:raceId});
  clientFrames=[];
  return { observation:clientEncoded.observation, reward,
    terminated:dead || p.circle>=targetCircle, truncated:steps>=horizon && !dead && p.circle<targetCircle,
    info:{guild:guildId,race:raceId,character_name:characterName,circle:p.circle,max_circle:maxCircle,experience_absorbed:Object.values(skills).reduce((s,k)=>s+k.absorbed,0),
      experience_pooled:Object.values(p.expPools).reduce((s,v)=>s+v,0),skills,requirements:req,
      target_circle:targetCircle, requirement_circle:nextGate(p.circle,targetCircle),
      ...(economy ? {silver:economy.silver, economy_schema:economy.schema} : {}),
      requirement_gap:req.rows.reduce((s,r)=>s+Math.max(0,r.need-r.have),0),
      death:dead,step:steps,room:p.room,last_command:lastCommand,commands:commandCount,inventory:p.inventory.map(i=>i.item.id),equipment:Object.fromEntries(Object.entries(p.equipment).map(([k,v])=>[k,v.id])),last_messages:messages.slice(-8),
      simulated_seconds:(Date.now()-initialTime)/1000,milestones,database_isolated:true,
      observation_schema:CLIENT_FEATURE_SCHEMA,observation_source:clientEncoded.source,
      exact_skill_exp:clientEncoded.exact_skill_exp,experience_pools:clientEncoded.experience_pools,
      legacy_observation_size:privilegedObservation.length} };
}
function reset(seed=42) {
  if (game) { game.stop(); game.players.clear(); }
  clock.reset();
  if (p) { db.prepare('DELETE FROM skills WHERE character_id=?').run(p.charId); db.prepare('DELETE FROM inventory WHERE character_id=?').run(p.charId); db.prepare('DELETE FROM characters WHERE id=?').run(p.charId); }
  // Durable world loot is part of the disposable world, not character state.
  // Clear it on every deterministic reset or prior activity clutter changes
  // the next episode's room/observation baseline.
  db.prepare('DELETE FROM world_loot').run();
  let state = seed >>> 0;
  Math.random=()=> { state=(Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
  game=new Game(); game.init();
  p=loadPlayer(createCharacter(account.accountId,{name:characterName,race:raceId,guild:guildId}));
  game.addPlayer(p); steps=0;dead=false;ended=false;maxCircle=1;milestones=[];commandCount=0;initialTime=Date.now();messages=[];
  clientFrames=[];
  p.ws={readyState:1,send(value){const message=typeof value==='string'?JSON.parse(value):value;clientFrames.push(message);if(message.msg) {messages.push(message.msg);messages=messages.slice(-30);}}};
  command('alloc con 10');command('alloc str 10');command('alloc ref 10');
  const labels=[...new Set(Array.from({length:targetCircle-1},(_,i)=>circleRequirements(p.guild,{},i+2).rows.map(r=>r.label)).flat())];
  clientSpec=clientFeatureSpec({guild:guildId,race:raceId,actions,requirementLabels:labels,
    skillNames:Object.values(SKILLS).map(s=>s.name),
    gearNames:['padded_cloth','shield_wood','dagger','club','broadsword','staff'].map(id=>({id,name:ITEMS[id].name})),
    roomIds:Object.keys(ROOMS)});
  return snapshot();
}
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
function cleanup() { game?.stop();clock.close();Math.random=random;closeDb();rmSync(directory,{recursive:true,force:true}); }
process.once('SIGTERM',()=>{cleanup();process.exit(0);});
try {
  for await (const line of input) {
    try {
      const request=JSON.parse(line);
      if ('command' in request) throw new Error('No arbitrary commands');
      let result;
      if(request.op==='spec') {
        if(!p) reset();
        result={actions,observation_size:snapshot().observation.length,horizon,scenario_name:`${guildId}_circle${targetCircle}_client_wire_v1`,
          guild:guildId,race:raceId,character_name:characterName,
          requirement_labels:requirements().rows.map(row=>row.label),
          scenario:`Fresh ${raceId} ${guildId} → circle ${targetCircle}; learned activity selection, scripted command execution`,target_circle:targetCircle,
          curriculum_version:CURRICULUM_VERSION,time_cost_per_hour:timeCostPerHour,
          ...(barbarian ? {economy_schema:ECONOMIC_SCHEMA,item_costs:itemCosts(),economic_feature_labels:economicObservation(p).labels} : {}),
          observation_schema:CLIENT_FEATURE_SCHEMA,observation_features:clientSpec.features,
          observation_provenance:'prompt + room + exp + inventory ordinary player frames; exact EXP and pools unknown',
          requirements_by_circle:Object.fromEntries(Array.from({length:targetCircle-1},(_,i)=>[String(i+2),circleRequirements(p.guild,{},i+2).rows])),
          mode:'accelerated_real_timer_engine_client_observation',baseline_actions:actions.map((_,i)=>i),
          reward_version:targetCircle===2 && timeCostPerHour===0 ? CIRCLE_REWARD_VERSION : CURRICULUM_VERSION,
          reward_definition:'0.25 × increase in capped required-rank fractions against the pre-action gate; +1 earned circle, -1 death, minus configured simulated-hour cost; clipped [-1,1]; no pooled or excess-rank reward',
          limits:['Network selects bounded scripted activities, not individual commands.','Real game timers, commands, prices and requirements; no boost or skill grants.','Test-only temporary database; no live server connection.']};
      } else if(request.op==='reset') result=reset(request.seed);
      else if(request.op==='step') {
        if(ended || !Number.isInteger(request.action) || request.action<0 || request.action>=actions.length) throw new Error('Reset required or invalid action');
        const circle=p.circle,beforeSkills=structuredClone(p.skills),beforeTime=Date.now();
        activity(request.action);clock.advance(200000);steps++;
        if(p.lastCorpse || p.hp<=0) dead=true;
        if(p.circle>circle) {maxCircle=p.circle;milestones.push({circle:p.circle,step:steps,simulated_seconds:(Date.now()-initialTime)/1000,
          commands:commandCount,requirements:circleRequirements(p.guild,p.skills,p.circle)});}
        const rewardParts=progressionReward({guild:p.guild,beforeSkills,afterSkills:p.skills,beforeCircle:circle,
          afterCircle:p.circle,target:targetCircle,dead,elapsedSeconds:(Date.now()-beforeTime)/1000,timeCostPerHour});
        result=snapshot(rewardParts.reward);
        result.info.reward_components=rewardParts;
        ended=result.terminated || result.truncated;
      } else if(request.op==='close') break; else throw new Error('Unknown operation');
      process.stdout.write(JSON.stringify(result)+'\n');
    } catch(error) {process.stdout.write(JSON.stringify({error:error.message})+'\n');}
  }
} finally {cleanup();}
