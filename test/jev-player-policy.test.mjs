import test from 'node:test';
import assert from 'node:assert/strict';
import { playerOptions, playerGoalOptions, playerPolicyVitals, pendingCommandActionAfterPrompt,
  fallbackAction, responseStillApplicable, playerQuestions, playerGoalQuestions, resolvePlayerDecision, deferTendCooldown,
  insufficientTrainingFunds, blockUnaffordableTrainingAction, shouldHoldBrawlingLane,
  skinningRetryActive, needsJevChoice, ownedGearPriorityGuidance, superviseGoalAction,
  shouldYieldRepeatedFieldPracticeOverride, shouldReleaseRepeatedProviderChoice,
  targetCircleReached, playerRunStatus, releaseDragonFormLock, actionStaleDuringRoundtime } from '../scripts/lib/jev-player-policy.mjs';
import { isStalledChoicePassThrough } from '../scripts/lib/jev-player-policy.mjs';
import { playerObjective } from '../scripts/lib/jev-player-policy.mjs';
import { ITEMS } from '../data/items.js';
import { ROOMS } from '../data/world.js';
import { MASTERY_SETS } from '../server/player.js';
import { GUILD_SCRIPTS } from '../data/guild-scripts.js';

test('automatic combat can be supervised and escaped during roundtime', () => {
  const v = { inCombat: true, rt: 3, hp: 20, maxhp: 100 };
  assert.deepEqual(playerOptions(v).map(o => o.id), ['wait', 'flee']);
  assert.equal(fallbackAction(v), 'flee');
});
test('Jev offers RT-free Barbarian analysis but not an RT-gated form during roundtime', () => {
  const v={guild:'barbarian',circle:1,hp:145,maxhp:145,rt:2,inCombat:true,
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]}};
  const options=playerGoalOptions(v,{},[]);
  assert.deepEqual(options.map(option=>option.id),['wait','flee','analyze_flame']);
  assert.ok(options.some(option=>option.command==='analyze flame'));
  assert.ok(!options.some(option=>option.command==='form dragon'));
});
test('prefetch menu may include a future Dragon Form while execution still waits for RT zero',()=>{
  const v={guild:'barbarian',circle:1,hp:145,maxhp:145,rt:2,inCombat:true,
    innerFire:100,learnedAbilities:['dragon'],
    requirements:{rows:[{label:'1st supernatural',have:0,need:2,eligible:['augmentation']}]}};
  const options=playerGoalOptions(v,{},[],[],{allowPrefetchedAbilities:true});
  const dragon=options.find(option=>option.id==='ability_dragon');
  assert.match(dragon.description,/hold it.*execute it only after an observed RT-free prompt/i);
  assert.equal(dragon.command,'form dragon');
});
test('stale combat choices defer RT-gated abilities while preserving RT-free analysis and emergency flight', () => {
  assert.equal(actionStaleDuringRoundtime({id:'ability_dragon',command:'form dragon'},2),true);
  assert.equal(actionStaleDuringRoundtime({id:'attack_0',command:'attack marsh hog'},1),true);
  assert.equal(actionStaleDuringRoundtime({id:'analyze_flame',command:'analyze flame'},1),false);
  assert.equal(actionStaleDuringRoundtime({id:'flee',command:'flee'},1),true);
  assert.equal(actionStaleDuringRoundtime({id:'emergency_flee',command:'flee'},1,true),false);
  assert.equal(actionStaleDuringRoundtime({id:'ability_dragon',command:'form dragon'},0),false);
});
test('active combat exposes Jev-selected focus actions when multiple foes are visible', () => {
  const v={guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:true,room:'fields_furrow',
    requirements:{rows:[]},skills:{}};
  const room={roomId:'fields_furrow',exits:[],contents:{creatures:[]}};
  const foes=[{name:'A reed stalker',state:'solidly balanced'},
    {name:'A grey wolf',state:'solidly balanced'}];
  const options=playerGoalOptions(v,room,foes);
  assert.equal(options.find(option=>option.id==='focus_0')?.command,'attack reed stalker');
  assert.equal(options.find(option=>option.id==='focus_1')?.command,'attack grey wolf');
  assert.match(options.find(option=>option.id==='focus_0').description,/other opponents from attacking/);
  assert.ok(!playerGoalOptions(v,room,foes.slice(0,1)).some(option=>option.id.startsWith('focus_')),
    'single-opponent fights do not gain a redundant target-switch choice');
});
test('provider is skipped only when waiting is the sole legal action', () => {
  assert.equal(needsJevChoice([{id:'wait',kind:'wait'}]),false);
  assert.equal(needsJevChoice([{id:'wait',kind:'wait'},{id:'flee',kind:'command'}]),true);
  assert.equal(needsJevChoice([{id:'unlock_strongbox',kind:'command'}]),true);
  assert.equal(needsJevChoice([]),false);
});
test('objective escalates after measured stagnation without changing the legal action set', () => {
  const base={guild:'trader',circle:1,requirements:{rows:[{label:'1st lore',have:0,need:2,eligible:['performance']}]},
    trainingProgress:{rankPointsGained:0,rowsClosedSinceStart:0,unmetRows:1,secondsSinceProgress:60,secondsSinceGateProgress:60,secondsSinceLearningProgress:0}};
  const early=playerObjective(base);
  assert.doesNotMatch(early,/Progress has stalled/);
  const stalled=playerObjective({...base,trainingProgress:{...base.trainingProgress,secondsSinceProgress:180,secondsSinceGateProgress:180}});
  assert.match(stalled,/change methods now/);
  assert.match(stalled,/do not repeat an action/);
  assert.doesNotMatch(stalled,/This is a prolonged stall/);
  const prolonged=playerObjective({...base,trainingProgress:{...base.trainingProgress,secondsSinceProgress:600,secondsSinceGateProgress:600}});
  assert.match(prolonged,/prioritize a concrete recovery/);
});
test('objective distinguishes an overridden provider recommendation from the executed action', () => {
  const recentActions=[{room:'fields_furrow',id:'wait',providerChoice:'flee',
    overrideReason:'defer-voluntary-flee-while-healthy'}];
  const objective=playerObjective({guild:'barbarian',circle:1,room:'fields_furrow',recentActions,
    requirements:{rows:[]}});
  assert.match(objective,/recommendation flee was not executed/);
  assert.match(objective,/harness executed wait instead/);
  assert.match(objective,/Do not repeat the same recommendation under unchanged conditions/);
  assert.doesNotMatch(playerObjective({guild:'barbarian',circle:1,room:'hall_barbarian',recentActions,
    requirements:{rows:[]}}),/recommendation flee was not executed/,
    'do not carry an old override across a room change');
  assert.doesNotMatch(playerObjective({guild:'barbarian',circle:1,room:'fields_furrow',
    recentActions:[{room:'fields_furrow',id:'flee',providerChoice:'flee',
      overrideReason:'defer-voluntary-flee-while-healthy'}],requirements:{rows:[]}}),
    /recommendation flee was not executed/,
    'identical chosen and executed actions are not an override');
});

test('stall pass-through telemetry counts only unchanged provider choices after the gate threshold',()=>{
  const result={action:{id:'practice_brawling'},overrideReason:null};
  assert.equal(isStalledChoicePassThrough('practice_brawling',result,
    {secondsSinceGateProgress:180}),true);
  assert.equal(isStalledChoicePassThrough('practice_brawling',result,
    {secondsSinceGateProgress:179}),false);
  assert.equal(isStalledChoicePassThrough('practice_brawling',
    {action:{id:'perform'},overrideReason:'practice-least-developed-open-survival-or-lore-lane'},
    {secondsSinceGateProgress:600}),false);
  assert.equal(isStalledChoicePassThrough(null,result,{secondsSinceGateProgress:600}),false);
});
test('run objective is explicit about reaching Circle 3 and completion is target-gated', () => {
  const objective=playerObjective({guild:'barbarian',circle:1,goalCircle:3,requirements:{rows:[]}});
  assert.match(objective,/campaign target is Circle 3/);
  assert.match(objective,/do not treat Circle 2 as completion/);
  assert.equal(targetCircleReached(2,3),false);
  assert.equal(targetCircleReached(3,3),true);
  assert.equal(targetCircleReached(4,3),true);
  assert.equal(playerRunStatus('time-cap',false),'incomplete');
  assert.equal(playerRunStatus('death',false),'incomplete');
  assert.equal(playerRunStatus('target-circle-reached',true),'complete');
  assert.equal(playerRunStatus('failed',false),'failed');
  assert.equal(playerRunStatus('escape-unconfirmed',false),'needs-attention');
});
test('objective calls out owned weapon and armor lanes that are still unequipped', () => {
  const objective=playerObjective({guild:'barbarian',circle:1,wsp:'brawling',purchasedItems:['club','leather_boots'],
    equipment:{hand:[],feet:[]},requirements:{rows:[
      {label:'1st weapon',have:0,need:8,eligible:['blunt','brawling']},
      {label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
    ]}});
  assert.match(objective,/wield_club/);
  assert.match(objective,/wear_leather_boots/);
  assert.match(objective,/Before starting another fight/);
});
test('compact local guidance names only offered owned gear matching an unmet lane', () => {
  const requirements={rows:[
    {label:'1st weapon',have:0,need:8,eligible:['blunt','brawling']},
    {label:'1st armor',have:0,need:6,eligible:['light_armor']},
  ]};
  const options=[{id:'wield_club'},{id:'wear_leather_boots'},{id:'buy_leather_boots'},
    {id:'buy_dagger'},{id:'wear_helm'}];
  const guidance=ownedGearPriorityGuidance(options,requirements,false);
  assert.match(guidance,/wield_club \(blunt, switch weapon lane\)/);
  assert.match(guidance,/wear_leather_boots \(light_armor, equip this armor lane\)/);
  assert.match(guidance,/buy_leather_boots \(light_armor, 30 silvers; then wear before fighting\)/);
  assert.match(guidance,/before leaving for combat/);
  assert.doesNotMatch(guidance,/buy_dagger|wear_helm/);
  assert.equal(ownedGearPriorityGuidance(options,requirements,true),null,
    'gear advice must not distract from a live fight');
  assert.equal(ownedGearPriorityGuidance(options,{rows:[]},false),null);
});
test('supervisor learns an offered Barbarian ability before allowing the model to leave the supernatural gate', () => {
  const options=[{id:'travel_fields_furrow'},{id:'learn_ability_dragon'}];
  const answers={next_action:{choice:'travel_fields_furrow',probabilities:{travel_fields_furrow:.9}}};
  const state={guild:'barbarian',inCombat:false,learnedAbilities:[],requirements:{rows:[
    {label:'inner_fire',have:0,need:2,eligible:['inner_fire']},
    {label:'1st supernatural',have:0,need:2,eligible:['augmentation','targeted_magic']},
  ]}};
  const result=superviseGoalAction(options,answers,state);
  assert.equal(result.action.id,'learn_ability_dragon');
  assert.equal(result.overrideReason,'offered-supernatural-gate-unlock');
  assert.equal(superviseGoalAction(options,answers,{...state,inCombat:true}).action.id,'travel_fields_furrow',
    'combat decisions must remain with the model/safety supervisor');
  assert.equal(superviseGoalAction(options,answers,{...state,requirements:{rows:[]}}).action.id,'travel_fields_furrow',
    'closed supernatural requirements should not trigger a stale override');
  assert.equal(superviseGoalAction([options[0]],answers,state).action.id,'travel_fields_furrow',
    'the supervisor must never synthesize a command absent from legal choices');
});
test('supervisor equips offered gear for an unmet lane and chooses safe visible prey for open combat gates', () => {
  const answers={next_action:{choice:'guild_hall',probabilities:{guild_hall:1}}};
  const gearState={guild:'barbarian',inCombat:false,hp:145,maxHp:145,silver:38,
    requirements:{rows:[{label:'1st weapon',have:0,need:8,eligible:['blunt']},
      {label:'1st armor',have:0,need:6,eligible:['light_armor']}]}};
  const boots=superviseGoalAction([{id:'guild_hall'},{id:'buy_leather_boots'}],answers,gearState);
  assert.equal(boots.action.id,'buy_leather_boots');
  assert.equal(boots.overrideReason,'offered-unmet-gear-lane');
  const weapon=superviseGoalAction([{id:'wield_club'},{id:'travel_fields_furrow'}],
    {next_action:{choice:'travel_fields_furrow'}},gearState);
  assert.equal(weapon.action.id,'wield_club');
  const ownedArmor=superviseGoalAction([{id:'buy_leather_boots'},{id:'wear_padded_cloth'}],
    {next_action:{choice:'buy_leather_boots'}},{...gearState,purchasedItems:['padded_cloth']});
  assert.equal(ownedArmor.action.id,'wear_padded_cloth',
    'use an owned progression item before spending again');
  const duplicateArmor=superviseGoalAction([{id:'buy_leather_boots'},{id:'travel_fields_furrow'}],
    {next_action:{choice:'buy_leather_boots'}},{...gearState,purchasedItems:['padded_cloth']});
  assert.equal(duplicateArmor.action.id,'travel_fields_furrow');
  assert.equal(duplicateArmor.overrideReason,'route-to-fields-for-open-combat-gates',
    'do not buy duplicate armor or let town performance delay a useful hunt route');
  const distinctArmor=superviseGoalAction([{id:'buy_leather_boots'},{id:'buy_shield_wood'}],
    {next_action:{choice:'buy_leather_boots'}},{...gearState,purchasedItems:['padded_cloth'],
      silver:100,
      requirements:{rows:[{label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
        {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']}]}});
  assert.equal(distinctArmor.action.id,'buy_shield_wood',
    'do not buy another item for a skill already represented in the owned kit');

  const weaponGate={...gearState,requirements:{rows:[
    {label:'1st weapon',have:0,need:8,eligible:['small_edged','blunt']},
    {label:'2nd weapon',have:0,need:8,eligible:['small_edged','blunt']},
  ]}};
  const firstWeapon=superviseGoalAction([{id:'buy_dagger'},{id:'buy_padded_cloth'}],
    {next_action:{choice:'buy_padded_cloth'}},weaponGate);
  assert.equal(firstWeapon.action.id,'buy_dagger',
    'open a weapon lane before armor shopping when no eligible weapon is owned');
  const holdLane=superviseGoalAction([{id:'buy_club'},{id:'travel_fields_furrow'}],
    {next_action:{choice:'buy_club'}},{...weaponGate,silver:200,purchasedItems:['dagger'],
      wieldedWeaponSkill:'small_edged',skills:{small_edged:0}});
  assert.equal(holdLane.action.id,'travel_fields_furrow',
    'do not divert money into another weapon until the current lane reaches its gate');
  assert.equal(holdLane.overrideReason,'route-to-fields-for-open-combat-gates',
    'keep hunting toward the open lane instead of making an premature second-weapon purchase');
  const openNextLane=superviseGoalAction([{id:'buy_club'},{id:'travel_fields_furrow'}],
    {next_action:{choice:'travel_fields_furrow'}},{...weaponGate,purchasedItems:['dagger'],
      wieldedWeaponSkill:'small_edged',skills:{small_edged:8},silver:200});
  assert.equal(openNextLane.action.id,'buy_club',
    'after the first weapon lane closes, prepare the next distinct lane');
  const preserveWeapon=superviseGoalAction([{id:'quest_crier',kind:'navigate'},{id:'practice_brawling'},
      {id:'travel_fields_furrow',kind:'navigate'}],
    {next_action:{choice:'practice_brawling'}},{...weaponGate,purchasedItems:['dagger'],
      wieldedWeaponSkill:'small_edged',skills:{small_edged:0}});
  assert.equal(preserveWeapon.action.id,'travel_fields_furrow',
    'preserve the equipped lane by choosing the offered safe hunt, not the first unrelated navigation');
  assert.equal(preserveWeapon.overrideReason,'route-to-fields-for-open-combat-gates');
  const noUsefulAlternative=superviseGoalAction([{id:'quest_crier',kind:'navigate'},{id:'practice_brawling'}],
    {next_action:{choice:'practice_brawling'}},{...weaponGate,purchasedItems:['dagger'],
      wieldedWeaponSkill:'small_edged',skills:{small_edged:0}});
  assert.equal(noUsefulAlternative.action.id,'practice_brawling',
    'do not replace a legal model choice with unrelated navigation when no hunt route is offered');
  assert.equal(noUsefulAlternative.overrideReason,null);
  const brawlingOverHunt=superviseGoalAction([
    {id:'practice_brawling',kind:'command',command:'remove dagger'},
    {id:'attack_0',kind:'command',command:'attack marsh hog'},
  ],{next_action:{choice:'practice_brawling'}},{...weaponGate,room:'fields_furrow',
    hp:145,maxHp:145,inCombat:false,purchasedItems:['dagger'],wieldedWeaponSkill:'small_edged',
    skills:{small_edged:0,brawling:0}});
  assert.equal(brawlingOverHunt.action.id,'practice_brawling',
    'respect the model’s safe, legal distinct weapon-lane choice instead of forcing another hunt');
  assert.equal(brawlingOverHunt.overrideReason,null);

  const combatState={...gearState,requirements:{rows:[
    {label:'melee_mastery',have:0,need:8,eligible:['melee_mastery']},
    {label:'evasion',have:0,need:6,eligible:['evasion']},
  ]}};
  const prey=superviseGoalAction([{id:'practice_stealth'},{id:'attack_0'},{id:'attack_1'}],
    {next_action:{choice:'practice_stealth'}},combatState);
  assert.equal(prey.action.id,'attack_0');
  assert.equal(prey.overrideReason,'safe-visible-prey-for-open-combat-gate');
  const questPrey=superviseGoalAction([
    {id:'attack_0',description:'This visible prey does not match the active quest target (kobolds); another target is needed.'},
    {id:'attack_1',description:'This visible prey matches the active kill quest and advances it: Slay 4 more kobolds.'},
  ],{next_action:{choice:'attack_0'}},{...combatState,quest:{kind:'kill',desc:'Slay 4 more kobolds.'}});
  assert.equal(questPrey.action.id,'attack_1',
    'prefer a currently visible legal quest target to an unrelated fight when combat gates are open');
  assert.equal(questPrey.overrideReason,'active-quest-target-for-progression-and-funding');
  assert.equal(superviseGoalAction([
    {id:'attack_0',description:'This visible prey matches the active kill quest and advances it.'},
    {id:'attack_1',description:'An unrelated visible creature.'},
  ],{next_action:{choice:'attack_1'}},{...combatState,quest:{kind:'deliver',desc:'Deliver a parcel.'}}).overrideReason,
    'safe-visible-prey-for-open-combat-gate',
    'quest targeting must not generalize to unrelated quest kinds');
  assert.equal(superviseGoalAction([{id:'practice_stealth'},{id:'attack_0'}],
    {next_action:{choice:'practice_stealth'}},{...combatState,hp:90}).action.id,'practice_stealth',
    'low health should leave the model free to recover rather than force a new fight');
  assert.equal(superviseGoalAction([{id:'practice_stealth'},{id:'attack_0'}],
    {next_action:{choice:'practice_stealth'}},{...combatState,requirements:{rows:[]}}).action.id,'practice_stealth');
});
test('weapon-lane supervisor does not switch back to a rank-saturated weapon',()=>{
  const options=[{id:'wield_dagger',kind:'command'},{id:'wield_club',kind:'command'}];
  const state={guild:'barbarian',inCombat:false,hp:145,maxHp:145,silver:0,
    purchasedItems:['dagger','club'],wieldedWeaponSkill:'small_edged',
    skills:{small_edged:14,blunt:0},requirements:{rows:[
      {label:'1st weapon',have:14,need:8,eligible:['small_edged','blunt']},
      {label:'2nd weapon',have:3,need:8,eligible:['small_edged','blunt']},
      {label:'3rd weapon',have:1,need:4,eligible:['small_edged','blunt']},
      {label:'4th weapon',have:0,need:2,eligible:['small_edged','blunt']},
    ]}};
  const result=superviseGoalAction(options,{next_action:{choice:'wield_dagger'}},state);
  assert.equal(result.action.id,'wield_club',
    '14 ranks already exceed every open threshold; choose the offered blunt lane at rank 0');
  assert.equal(result.overrideReason,'offered-unmet-gear-lane');
});
test('supervisor waits out a healthy fight instead of scheduling a premature flee', () => {
  const options=[{id:'wait'},{id:'flee'}];
  const answers={next_action:{choice:'flee',probabilities:{flee:1}}};
  const state={inCombat:true,hp:145,maxHp:145,sustainedDamage:false};
  const result=superviseGoalAction(options,answers,state);
  assert.equal(result.action.id,'wait');
  assert.equal(result.overrideReason,'defer-voluntary-flee-while-healthy');
  assert.equal(superviseGoalAction(options,answers,{...state,hp:80}).action.id,'flee',
    'allow escape when health falls below the healthy threshold');
  assert.equal(superviseGoalAction(options,answers,{...state,sustainedDamage:true}).action.id,'flee',
    'sustained damage must override the healthy-fight rule');
  assert.equal(superviseGoalAction([{id:'flee'}],answers,state).action.id,'flee',
    'do not synthesize wait when the game did not offer it');
});
test('supervisor uses legal RT-free Barbarian analysis for open Expertise or Tactics gates', () => {
  const options=[{id:'wait'},{id:'flee'},{id:'analyze_flame',command:'analyze flame'}];
  const answer={next_action:{choice:'flee',probabilities:{flee:1}}};
  const state={guild:'barbarian',inCombat:true,hp:130,maxHp:145,sustainedDamage:false,
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']},
      {label:'tactics',have:0,need:2,eligible:['tactics']}]}};
  const result=superviseGoalAction(options,answer,state);
  assert.equal(result.action.id,'analyze_flame');
  assert.equal(result.overrideReason,'use-offered-analysis-for-open-expertise-or-tactics-gate');
  const midBand=superviseGoalAction(options,answer,{...state,hp:90});
  assert.equal(midBand.action.id,'analyze_flame',
    'close the 60–75% health gap with RT-free gate practice when the fight is not showing sustained loss');
  assert.equal(superviseGoalAction(options,answer,{...state,hp:86}).action.id,'flee',
    'do not force analysis below 60% health');
  assert.equal(superviseGoalAction(options,answer,{...state,hp:85}).action.id,'flee',
    'leave the model free to escape below the analysis safety threshold');
  assert.equal(superviseGoalAction(options,answer,{...state,sustainedDamage:true}).action.id,'flee',
    'never divert from an active sustained-damage signal');
  assert.equal(superviseGoalAction(options,answer,{...state,guild:'trader'}).action.id,'wait',
    'do not inject Barbarian-only actions for another guild');
  assert.equal(superviseGoalAction(options,answer,{...state,requirements:{rows:[]}}).action.id,'wait',
    'without an eligible gate, retain the healthy-fight flee guard');
  assert.equal(superviseGoalAction([{id:'wait'},{id:'flee'}],answer,state).action.id,'wait',
    'never invent an action missing from the legal menu');
});
test('supervisor uses an offered safe Barbarian ability when a supernatural gate is open', () => {
  const options=[{id:'focus_0'},{id:'ability_dragon',kind:'command',command:'form dragon'}];
  const answer={next_action:{choice:'focus_0'}};
  const state={guild:'barbarian',inCombat:true,hp:120,maxHp:145,sustainedDamage:false,
    requirements:{rows:[{label:'1st supernatural',have:0,need:2,eligible:['augmentation','targeted_magic']}]}};
  const result=superviseGoalAction(options,answer,state);
  assert.equal(result.action.id,'ability_dragon');
  assert.equal(result.overrideReason,'use-offered-barbarian-ability-for-supernatural-gate');
  assert.equal(superviseGoalAction(options,answer,{...state,hp:100}).action.id,'focus_0',
    'preserve the ability for a healthier window below the configured 75% threshold');
  assert.equal(superviseGoalAction(options,answer,{...state,sustainedDamage:true}).action.id,'focus_0',
    'do not override combat decisions when the damage safety signal is active');
  assert.equal(superviseGoalAction(options,answer,{...state,requirements:{rows:[]}}).action.id,'focus_0',
    'do not spend ability resources when no supernatural requirement is open');
  assert.equal(superviseGoalAction([{id:'focus_0'}],answer,state).action.id,'focus_0',
    'never synthesize an ability absent from the legal menu');
  const wardingOnly={...state,requirements:{rows:[{label:'1st supernatural',have:0,need:2,eligible:['warding_magic']}]}};
  assert.equal(superviseGoalAction(options,answer,wardingOnly).action.id,'focus_0',
    'do not force Dragon Form for a Warding-only row it cannot train');
});
test('supervisor prioritizes a safe offered supernatural ability over analysis when both gates are open', () => {
  const options=[{id:'analyze_flame',command:'analyze flame'},
    {id:'ability_dragon',command:'form dragon'}];
  const answer={next_action:{choice:'analyze_flame'}};
  const state={guild:'barbarian',inCombat:true,hp:120,maxHp:145,sustainedDamage:false,
    requirements:{rows:[{label:'inner_fire',have:0,need:2,eligible:['inner_fire'],hard:true},
      {label:'1st supernatural',have:0,need:2,eligible:['augmentation']},
      {label:'expertise',have:0,need:8,eligible:['expertise']}]}};
  const result=superviseGoalAction(options,answer,state);
  assert.equal(result.action.id,'ability_dragon');
  assert.equal(result.overrideReason,'use-offered-barbarian-ability-for-supernatural-gate');
  const analysisFallback=superviseGoalAction(options,answer,{...state,hp:90});
  assert.equal(analysisFallback.action.id,'analyze_flame',
    'analysis can use the mid-health band when the ability safety threshold is not met');
});
test('an offered Barbarian ability is available when Inner Fire is the sole supernatural lane open', () => {
  const v={guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:true,innerFire:100,
    learnedAbilities:['dragon'],requirements:{rows:[{label:'inner_fire',have:0,need:2,eligible:['inner_fire'],hard:true}]}};
  assert.ok(playerGoalOptions(v,{},[]).some(option=>option.id==='ability_dragon'));
});
test('Barbarian ability options match their actual supernatural skill lane',()=>{
  const warding={guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:true,innerFire:100,
    requirements:{rows:[{label:'1st supernatural',have:0,need:2,eligible:['warding_magic']}]}};
  assert.ok(!playerGoalOptions({...warding,learnedAbilities:['dragon']},{},[])
    .some(option=>option.id==='ability_dragon'));
  const tenacity=playerGoalOptions({...warding,learnedAbilities:['tenacity']},{},[])
    .find(option=>option.id==='ability_tenacity');
  assert.ok(tenacity);
  assert.match(tenacity.description,/Warding/);
});
test('supervisor skins an offered corpse before starting another safe fight', () => {
  const options=[{id:'attack_0'},{id:'skin_sewer_rat'}];
  const answers={next_action:{choice:'attack_0'}};
  const state={guild:'barbarian',inCombat:false,hp:131,maxHp:145,
    requirements:{rows:[{label:'1st survival',have:0,need:4,eligible:['skinning','stealth']}]}};
  const result=superviseGoalAction(options,answers,state);
  assert.equal(result.action.id,'skin_sewer_rat');
  assert.equal(result.overrideReason,'skin-visible-corpse-before-new-fight');
  assert.equal(superviseGoalAction(options,answers,{...state,inCombat:true}).action.id,'attack_0',
    'never interrupt an active fight to skin');
  assert.equal(superviseGoalAction([{id:'attack_0'}],answers,state).action.id,'attack_0',
    'only select the corpse when the game actually offers it');
  assert.equal(superviseGoalAction(options,answers,{...state,hp:100}).action.id,'attack_0',
    'at low health the survival choice should not override the model');
});
test('supervisor claims completed quests and follows only offered known quest-spawn routes', () => {
  const answer={next_action:{choice:'attack_0'}};
  const claim=superviseGoalAction([{id:'attack_0'},{id:'claim_quest',kind:'command'}],answer,
    {inCombat:false,quest:{kind:'kill',done:true},requirements:{rows:[]}});
  assert.equal(claim.action.id,'claim_quest');
  assert.equal(claim.overrideReason,'claim-completed-quest-for-progression-funding');

  const route={id:'travel_fields_kobolds',kind:'navigate',targetRoom:'fields_kobolds',
    description:'This area also spawns kobolds, the target of the active kill quest (Slay 4 more kobolds).'};
  const options=[{id:'attack_0',kind:'command'},route];
  const state={inCombat:false,hp:145,maxHp:145,quest:{kind:'kill',done:false},
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]}};
  const result=superviseGoalAction(options,answer,state);
  assert.equal(result.action.id,'travel_fields_kobolds');
  assert.equal(result.overrideReason,'route-to-known-active-quest-spawn');
  assert.equal(superviseGoalAction(options,answer,{...state,quest:{kind:'deliver',done:false}}).action.id,'attack_0',
    'non-hunt quests must not trigger a route selected only for kill/recovery prey');
  assert.equal(superviseGoalAction(options,answer,{...state,inCombat:true}).action.id,'attack_0',
    'never route away during an active fight');
});
test('supervisor prioritizes a nearby crier when a safe, quest-free character lacks lesson funds', () => {
  const crier={id:'quest_crier',kind:'navigate',targetRoom:'square',pathLength:3};
  const options=[{id:'practice_brawling',kind:'command'},crier];
  const answer={next_action:{choice:'practice_brawling'}};
  const state={guild:'barbarian',inCombat:false,hp:145,maxHp:145,silver:1,quest:null,
    requirements:{rows:[{label:'1st weapon',have:1,need:8,eligible:['small_edged','brawling']} ]}};
  const result=superviseGoalAction(options,answer,state);
  assert.equal(result.action.id,'quest_crier');
  assert.equal(result.overrideReason,'visit-nearby-crier-when-training-funds-low');
  assert.equal(superviseGoalAction([{...crier,pathLength:4},options[0]],answer,state).action.id,
    'practice_brawling','do not force a longer economy trip');
  assert.equal(superviseGoalAction(options,answer,{...state,quest:{kind:'recover',done:false}}).action.id,
    'practice_brawling','do not replace an active quest with another one');
  assert.equal(superviseGoalAction(options,answer,{...state,hp:100}).action.id,'practice_brawling',
    'do not route across town when recovering below the healthy threshold');
  assert.equal(superviseGoalAction(options,answer,{...state,inCombat:true}).action.id,'practice_brawling',
    'never abandon an active fight for a crier');
});
test('supervisor sends a stagnant, funded character to the trainer instead of endless hunting', () => {
  const fieldOptions=[{id:'attack_0'},{id:'guild_hall'}];
  const fieldAnswer={next_action:{choice:'attack_0'}};
  const state={guild:'barbarian',inCombat:false,hp:120,maxHp:145,silver:104,
    requirements:{rows:[{label:'expertise',have:0,need:8,hard:true,eligible:['expertise']}]},
    trainingProgress:{secondsSinceGateProgress:240}};
  const route=superviseGoalAction(fieldOptions,fieldAnswer,state);
  assert.equal(route.action.id,'guild_hall');
  assert.equal(route.overrideReason,'visit-affordable-trainer-after-gate-stall');
  const train=superviseGoalAction([{id:'train_expertise'},{id:'perform'}],
    {next_action:{choice:'perform'}},{...state,room:'hall_barbarian'});
  assert.equal(train.action.id,'train_expertise');
  assert.equal(train.overrideReason,'convert-experience-at-affordable-trainer-after-gate-stall');
  assert.equal(superviseGoalAction(fieldOptions,fieldAnswer,{...state,
    trainingProgress:{secondsSinceGateProgress:120}}).action.id,'attack_0',
    'do not detour before the measured stall threshold');
  assert.equal(superviseGoalAction(fieldOptions,fieldAnswer,{...state,silver:39}).action.id,'attack_0',
    'do not route to a trainer when no eligible lesson is affordable');
  assert.equal(superviseGoalAction(fieldOptions,fieldAnswer,{...state,inCombat:true}).action.id,'attack_0',
    'do not interrupt combat for training');
  const hallOptions=[{id:'skin_marsh_hog'},{id:'train_expertise'}];
  const hallState={...state,hp:145,maxHp:145,silver:59,
    requirements:{rows:[
      {label:'expertise',have:0,need:8,eligible:['expertise']},
      {label:'1st survival',have:0,need:4,eligible:['skinning','stealth']},
    ]}};
  const choose={next_action:{choice:'skin_marsh_hog'}};
  const stall=superviseGoalAction(hallOptions,choose,hallState);
  assert.equal(stall.action.id,'train_expertise',
    'funded trainer lessons must outrank optional skinning once the gate-stall threshold is met');
  assert.equal(stall.overrideReason,'convert-experience-at-affordable-trainer-after-gate-stall');
  assert.equal(superviseGoalAction(hallOptions,choose,{...hallState,
    trainingProgress:{secondsSinceGateProgress:120}}).action.id,'skin_marsh_hog',
    'before the stall threshold, preserve the ordinary safe field-skill choice');
});
test('recovery excludes new fights and uncertainty does not start combat', () => {
  const v = { inCombat: false, rt: 0, hp: 50, maxhp: 100 };
  assert.ok(playerOptions(v, [{name: 'A marsh hog'}]).every(o => o.id !== 'engage'));
  assert.equal(fallbackAction({...v, hp: 100}), 'look');
  assert.equal(playerOptions({...v, hp: 100}, [{name: 'A marsh hog'}]).at(-1).id, 'engage');
});

test('starter-kit route distinguishes alternative items that train the same lane', () => {
  const rows=[{label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
    {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']},
    {label:'1st lore',have:0,need:2,eligible:['performance','appraisal']},
    {label:'2nd lore',have:0,need:2,eligible:['performance','appraisal']}];
  const options=playerGoalOptions({room:'hall_barbarian',guild:'barbarian',circle:1,hp:145,maxhp:145,
    silver:100,requirements:{rows},skills:{},purchasedItems:[],equipment:{},rt:0,inCombat:false},{exits:['north','south','west','east']});
  const route=options.find(option=>option.id==='starter_kit');
  assert.ok(route);
  assert.match(route.description,/one of several affordable items training light_armor/);
  assert.match(route.description,/choosing another of these does not add a distinct skill lane/);
  const perform=options.find(option=>option.id==='perform');
  assert.match(perform.description,/relevant gaps 1st lore 0\/2, 2nd lore 0\/2/);
  assert.match(perform.description,/cannot fill multiple Nth-skill rows/);
  assert.equal(ITEMS.padded_cloth.skill,'light_armor');
});

test('Trader harness offers its affordable dagger lane without changing shared guild data', () => {
  const v={room:'hall_trader',guild:'trader',circle:1,hp:145,maxhp:145,silver:30,
    requirements:{rows:[{label:'1st weapon',have:0,need:2,eligible:['small_edged','blunt','brawling']}]},
    skills:{small_edged:0,blunt:0,brawling:0},purchasedItems:[],equipment:{},rt:0,inCombat:false};
  const options=playerGoalOptions(v,{exits:Object.keys(ROOMS.hall_trader.exits)});
  const route=options.find(option=>option.id==='starter_kit');
  assert.ok(route,'the 25-silver dagger should be an affordable kit option with 30 silvers');
  assert.match(route.description,/plain dagger.*trains small_edged/);
  assert.match(route.description,/currently unarmed.*held weapon for the next fight/);
  const atBazaar=playerGoalOptions({...v,room:'bazaar',silver:5,purchasedItems:['dagger'],wsp:'brawling'},
    {exits:Object.keys(ROOMS.bazaar.exits)});
  assert.equal(atBazaar.find(option=>option.id==='wield_dagger')?.command,'wield dagger');
  assert.equal(GUILD_SCRIPTS.trader.weaponPlan,undefined,'the plan is Jev-only, not shared with native script sweeps');
  assert.equal(ITEMS.dagger.value,25);
});

test('Trader Jev kit exposes padded cloth as a separate affordable armor lane', () => {
  const v={room:'hall_trader',guild:'trader',circle:1,hp:145,maxhp:145,silver:65,
    requirements:{rows:[
      {label:'1st armor',have:0,need:4,eligible:['light_armor','shield_usage']},
      {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']},
    ]},skills:{light_armor:0,shield_usage:0},purchasedItems:[],equipment:{},rt:0,inCombat:false};
  const route=playerGoalOptions(v,{exits:Object.keys(ROOMS.hall_trader.exits)})
    .find(option=>option.id==='starter_kit');
  assert.ok(route);
  assert.match(route.description,/padded cloth.*trains light_armor/);
  const bazaar=playerGoalOptions({...v,room:'bazaar',silver:40,purchasedItems:['dagger']},
    {exits:Object.keys(ROOMS.bazaar.exits)});
  assert.equal(bazaar.find(option=>option.id==='buy_padded_cloth')?.command,'buy padded_cloth');
  assert.equal(ITEMS.padded_cloth.value,40);
});

test('Trader Jev kit exposes a distinct, price-gated shield lane for 2nd armor', () => {
  const rows=[
    {label:'1st armor',have:0,need:4,eligible:['light_armor','shield_usage']},
    {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']},
  ];
  const starting={room:'hall_trader',guild:'trader',circle:1,hp:145,maxhp:145,silver:85,
    requirements:{rows},skills:{light_armor:0,shield_usage:0},
    purchasedItems:['dagger','padded_cloth'],equipment:{},rt:0,inCombat:false};
  const objective=playerObjective(starting);
  assert.match(objective,/needs distinct armor skill lanes/);
  assert.match(objective,/one armor skill cannot fill multiple Nth-Armor slots/);
  assert.match(objective,/Shield Usage for the second slot when affordable/);

  const route=playerGoalOptions(starting,{exits:Object.keys(ROOMS.hall_trader.exits)})
    .find(option=>option.id==='starter_kit');
  assert.ok(route);
  assert.match(route.description,/round wooden shield.*trains shield_usage/);
  const bazaar=playerGoalOptions({...starting,room:'bazaar',silver:70},
    {exits:Object.keys(ROOMS.bazaar.exits)});
  assert.equal(bazaar.find(option=>option.id==='buy_shield_wood')?.command,'buy shield_wood');
  assert.equal(ITEMS.shield_wood.value,70);
  assert.equal(ITEMS.shield_wood.skill,'shield_usage');

  const worn=playerGoalOptions({...starting,room:'fields_furrow',silver:0,
    purchasedItems:['dagger','padded_cloth','shield_wood'],
    equipment:{hand:[{name:ITEMS.dagger.name}],torso:[{name:ITEMS.padded_cloth.name}]}},
  {exits:Object.keys(ROOMS.fields_furrow.exits)});
  assert.equal(worn.find(option=>option.id==='wear_shield_wood')?.command,'wear shield_wood');
  assert.equal(GUILD_SCRIPTS.trader.gearLedger,undefined,
    'the shield recommendation belongs only to the Jev harness');
});

test('Jev Barbarian kit keeps all four weapon lanes melee-capable for Melee Mastery', () => {
  const rows=[
    {label:'melee_mastery',have:0,need:8,eligible:['melee_mastery'],hard:true},
    {label:'1st weapon',have:0,need:8,eligible:['small_edged','blunt','large_edged','staff','slings','brawling']},
    {label:'2nd weapon',have:0,need:8,eligible:['small_edged','blunt','large_edged','staff','slings','brawling']},
    {label:'3rd weapon',have:0,need:4,eligible:['small_edged','blunt','large_edged','staff','slings','brawling']},
    {label:'4th weapon',have:0,need:2,eligible:['small_edged','blunt','large_edged','staff','slings','brawling']},
  ];
  const v={room:'hall_barbarian',guild:'barbarian',circle:1,hp:145,maxhp:145,silver:2000,
    requirements:{rows},skills:{},purchasedItems:[],equipment:{},rt:0,inCombat:false};
  const route=playerGoalOptions(v,{exits:Object.keys(ROOMS.hall_barbarian.exits)})
    .find(option=>option.id==='starter_kit');
  assert.ok(route);
  for (const item of ['dagger','club','broadsword','staff']) assert.match(route.description,new RegExp(`\\b${item}\\b`));
  assert.doesNotMatch(route.description,/sling/i,
    'ranged sling is omitted while every melee weapon lane can also progress the hard mastery gate');
  assert.match(playerObjective(v),/Melee Mastery is a hard Circle 2 gate/);
  assert.equal(ITEMS.staff.skill,'staff');
  assert.ok(GUILD_SCRIPTS.barbarian.weaponPlan.weapons.includes('sling'),
    'the native script-sweep kit remains unchanged');
});

test('Dragon Form becomes selectable again after its observed expiry or a failed attempt', () => {
  const locked = new Set(['ability_dragon','berserk']);
  assert.equal(releaseDragonFormLock(locked,'The Dragon Form fades.'),true);
  assert.equal(locked.has('ability_dragon'),false);
  assert.equal(locked.has('berserk'),true);

  locked.add('ability_dragon');
  assert.equal(releaseDragonFormLock(locked,'Not enough inner fire (20).','ability_dragon'),true);
  assert.equal(locked.has('ability_dragon'),false);
  locked.add('ability_dragon');
  assert.equal(releaseDragonFormLock(locked,'You study the flow of battle.','ability_dragon'),false);
  assert.equal(locked.has('ability_dragon'),true);
});

test('RT-free combat choice explains Dragon Form urgency, cost, buff, and two gate gains', () => {
  const options=playerGoalOptions({guild:'barbarian',circle:1,room:'fields_furrow',inCombat:true,rt:0,
    innerFire:100,learnedAbilities:['dragon'],requirements:{rows:[
      {label:'inner_fire',have:0,need:2,eligible:['inner_fire']},
      {label:'1st supernatural',have:0,need:2,eligible:['augmentation']},
    ]},skills:{}},{roomId:'fields_furrow',exits:[],contents:{creatures:[]}});
  const dragon=options.find(option=>option.id==='ability_dragon');
  assert.ok(dragon);
  assert.equal(dragon.command,'form dragon');
  assert.match(dragon.description,/RT-free combat window/);
  assert.match(dragon.description,/costs 20 Inner Fire/);
  assert.match(dragon.description,/30 ticks/);
  assert.match(dragon.description,/Inner Fire plus Augmentation/);
});

test('Jev shop options disclose when armor spending removes affordable distinct weapon lanes', () => {
  const rows=[
    {label:'melee_mastery',have:0,need:8,eligible:['melee_mastery'],hard:true},
    ...['1st','2nd','3rd','4th'].map((label,index)=>({label:`${label} weapon`,have:0,
      need:[8,8,4,2][index],eligible:['small_edged','blunt','large_edged','staff','brawling']})),
    {label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
  ];
  const options=playerGoalOptions({room:'bazaar',guild:'barbarian',circle:1,hp:145,maxhp:145,
    silver:150,requirements:{rows},skills:{},purchasedItems:['dagger'],equipment:{},wsp:'small_edged'},
    {exits:Object.keys(ROOMS.bazaar.exits)});
  const shield=options.find(option=>option.id==='buy_shield_wood');
  assert.ok(shield);
  assert.match(shield.description,/Weapon-lane budget warning: this leaves 80 silvers/);
  assert.match(shield.description,/sturdy oaken club 112/);
  assert.match(shield.description,/ironwood quarterstaff 112/);
});

test('guild training options use displayed requirement ranks to avoid unaffordable lessons', () => {
  const requirements={rows:[
    {label:'expertise',have:4,need:8,eligible:['expertise']},
    {label:'1st weapon',have:4,need:8,eligible:['small_edged','blunt']},
    {label:'2nd weapon',have:0,need:8,eligible:['small_edged','blunt']},
    {label:'1st armor',have:5,need:6,eligible:['light_armor','shield_usage']},
    {label:'2nd armor',have:4,need:2,eligible:['light_armor','shield_usage']},
    {label:'1st survival',have:0,need:4,eligible:['athletics','perception','foraging']},
    {label:'2nd survival',have:0,need:4,eligible:['athletics','perception','foraging']},
  ]};
  const optionsForSilver=silver=>playerGoalOptions({room:'hall_barbarian',guild:'barbarian',circle:1,
    hp:145,maxhp:145,rt:0,inCombat:false,silver,requirements,skills:{expertise:0,small_edged:0,
      blunt:0,light_armor:0,shield_usage:0},purchasedItems:[],equipment:{}},{});
  assert.ok(!optionsForSilver(75).some(option=>option.id==='train_expertise'||option.id==='train_light_armor'));
  assert.ok(optionsForSilver(75).some(option=>option.id==='train_foraging'),
    'an actually affordable low-rank lane remains available');
  assert.ok(optionsForSilver(120).some(option=>option.id==='train_expertise'));
  assert.ok(!optionsForSilver(120).some(option=>option.id==='train_light_armor'));
  assert.ok(optionsForSilver(140).some(option=>option.id==='train_light_armor'));
});

test('non-Barbarian guild policy uses its own circle gates, trainer, and objective identity', () => {
  const v={room:'hall_trader',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,silver:100,
    requirements:{rows:[{label:'trading',have:0,need:8,eligible:['trading'],hard:true}]},skills:{trading:0}};
  const options=playerGoalOptions(v,{exits:['north','south']});
  assert.equal(options.find(option=>option.id==='train_trading')?.command,'train trading');
  assert.match(playerObjective(v),/Play this trader character/);
  assert.match(options.find(option=>option.id==='train_trading').description,/relevant gaps trading 0\/8/);
});

test('one-weapon guild gates favor finishing one category, while multi-lane gates still rotate', () => {
  const oneRow=[{label:'1st weapon',have:0,need:2,eligible:['small_edged','blunt']}];
  const v={room:'bazaar',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,silver:0,
    requirements:{rows:oneRow},skills:{small_edged:0,blunt:0},purchasedItems:['dagger','club'],
    equipment:{},wsp:'small_edged'};
  const club=playerGoalOptions(v,{exits:['north','south']}).find(option=>option.id==='wield_club');
  assert.match(club.description,/only one weapon lane in this circle gate/);
  assert.match(playerObjective(v),/needs only one distinct weapon lane/);
  const multiRows=[...oneRow,{label:'2nd weapon',have:0,need:2,eligible:['small_edged','blunt']}];
  const multi={...v,requirements:{rows:multiRows}};
  const multiClub=playerGoalOptions(multi,{exits:['north','south']}).find(option=>option.id==='wield_club');
  assert.doesNotMatch(multiClub.description,/only one weapon lane in this circle gate/);
  assert.doesNotMatch(playerObjective(multi),/needs only one distinct weapon lane/);
  const partiallyClosed={...v,requirements:{rows:[oneRow[0],
    {label:'2nd weapon',have:2,need:2,eligible:['small_edged','blunt']}]}};
  assert.doesNotMatch(playerObjective(partiallyClosed),/needs only one distinct weapon lane/,
    'a closed 2nd weapon row still proves this guild needed two categories');
});

test('player choices expose unarmed brawling as a distinct unmet weapon lane', () => {
  const requirements={rows:[
    {label:'melee_mastery',have:0,need:8,eligible:['melee_mastery'],hard:true},
    {label:'1st weapon',have:0,need:8,eligible:['small_edged','slings','blunt','brawling']},
    {label:'2nd weapon',have:0,need:8,eligible:['small_edged','slings','blunt','brawling']},
    {label:'3rd weapon',have:0,need:4,eligible:['small_edged','slings','blunt','brawling']},
    {label:'4th weapon',have:0,need:2,eligible:['small_edged','slings','blunt','brawling']},
  ]};
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements,skills:{brawling:0},wsp:'small_edged',equipment:{hand:[{name:'a plain dagger'}]}};
  const room={exits:['south','north','northeast']};
  assert.ok(MASTERY_SETS.MELEE_WEAPONS.has('brawling'),
    'the native mastery set treats Brawling as a melee skill');
  const masteryOpen=playerGoalOptions(v,room);
  assert.equal(masteryOpen.find(option=>option.id==='practice_brawling')?.command,'remove dagger',
    'offer unarmed practice when the weapon lane and Melee Mastery are both open');
  assert.match(masteryOpen.find(option=>option.id==='practice_brawling').description,
    /also advance an open Melee Mastery requirement/);
  assert.match(playerObjective({...v,guild:'barbarian'}),/including Brawling/);
  const masteryMet={...v,requirements:{rows:requirements.rows.map(row=>row.label==='melee_mastery'?{...row,have:8}:row)}};
  const options=playerGoalOptions(masteryMet,room);
  assert.equal(options.find(option=>option.id==='practice_brawling')?.command,'remove dagger',
    'use the single-token catalog ID because the remove command reads arg1 only');
  assert.match(options.find(option=>option.id==='practice_brawling').description,/train the unmet Brawling weapon lane/);
  assert.ok(!playerGoalOptions({...v,inCombat:true},{exits:['south']}).some(option=>option.id==='practice_brawling'),
    'never change equipment in the middle of a fight');
  assert.ok(!playerGoalOptions({...masteryMet,skills:{brawling:1}},{exits:['south']}).some(option=>option.id==='practice_brawling'),
    'do not offer the lane again once brawling has started');
});

test('unarmed lane supervisor holds the weapon until rank 2 or its bounded timeout', () => {
  assert.equal(shouldHoldBrawlingLane(0,20_000,10_000),true);
  assert.equal(shouldHoldBrawlingLane(1,20_000,10_000),true,
    'a first rank does not yet satisfy the two-rank lane');
  assert.equal(shouldHoldBrawlingLane(2,20_000,10_000),false);
  assert.equal(shouldHoldBrawlingLane(0,10_000,10_000),false,
    'the supervisor releases the lane at the deadline');
});

test('field routes return to the guild hall only when a lesson is affordable', () => {
  const requirements={rows:[
    {label:'expertise',have:4,need:8,eligible:['expertise']},
    {label:'1st weapon',have:4,need:8,eligible:['small_edged','blunt']},
    {label:'2nd weapon',have:0,need:8,eligible:['small_edged','blunt']},
    {label:'1st armor',have:5,need:6,eligible:['light_armor','shield_usage']},
    {label:'2nd armor',have:4,need:2,eligible:['light_armor','shield_usage']},
    {label:'1st survival',have:3,need:4,eligible:['athletics','perception','foraging']},
    {label:'2nd survival',have:3,need:4,eligible:['athletics','perception','foraging']},
  ]};
  const optionsForSilver=silver=>playerGoalOptions({room:'fields_furrow',guild:'barbarian',circle:1,
    hp:145,maxhp:145,rt:0,inCombat:false,silver,requirements,skills:{}},{exits:['south','north','northeast']});
  const shortOnFunds=optionsForSilver(51);
  assert.ok(!shortOnFunds.some(option=>option.id==='guild_hall'),
    'do not send the player back to the hall when no lesson is affordable');
  assert.ok(shortOnFunds.some(option=>option.id==='forage'||option.id==='hunt_signs'),
    'field training remains available while earning more silver');
  assert.ok(optionsForSilver(100).some(option=>option.id==='guild_hall'),
    'offer the hall route once a rank-3 survival lesson costing 100 is affordable');
});

test('safe idle supervisor advances the least-developed offered Survival or Lore lane',()=>{
  const requirements={rows:[
    {label:'1st survival',have:0,need:4,eligible:['stealth','foraging','perception','skinning']},
    {label:'2nd survival',have:0,need:4,eligible:['stealth','foraging','perception','skinning']},
    {label:'1st lore',have:0,need:2,eligible:['performance','scholarship','appraisal']},
    {label:'2nd lore',have:0,need:2,eligible:['performance','scholarship','appraisal']},
  ]};
  const options=[{id:'practice_stealth',kind:'command'},{id:'forage',kind:'command'},
    {id:'hunt_signs',kind:'command'},{id:'perform',kind:'command'},
    {id:'appraise_dagger',kind:'command'},{id:'travel_fields_furrow',kind:'navigate'}];
  const state={guild:'barbarian',hp:145,maxHp:145,inCombat:false,bleeding:[],silver:0,
    skills:{},requirements,trainingProgress:{secondsSinceGateProgress:0}};
  const first=superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},state);
  assert.equal(first.action.id,'practice_stealth');
  assert.equal(first.overrideReason,'practice-least-developed-open-survival-or-lore-lane');
  const stalledChoice=superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,trainingProgress:{secondsSinceGateProgress:180}});
  assert.equal(stalledChoice.action.id,'travel_fields_furrow',
    'after three minutes without gate movement, release the model\'s legal choice instead of forcing field practice');
  assert.equal(stalledChoice.overrideReason,null);
  const stillLearning=superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,trainingProgress:{secondsSinceGateProgress:179}});
  assert.equal(stillLearning.action.id,'practice_stealth',
    'retain the field-practice nudge just below the gate-stall threshold');
  const overrideStreak=Array.from({length:4},()=>({room:'fields_furrow',
    id:'perform',providerChoice:'practice_brawling',
    overrideReason:'practice-least-developed-open-survival-or-lore-lane'}));
  const interstitialWaits=overrideStreak.flatMap(action=>[action,{room:'fields_furrow',id:'wait'}]);
  assert.equal(shouldYieldRepeatedFieldPracticeOverride(interstitialWaits,'fields_furrow'),true,
    'controller waits between provider calls do not hide a repeated override streak');
  assert.equal(shouldYieldRepeatedFieldPracticeOverride(overrideStreak,'fields_furrow'),true);
  assert.equal(shouldYieldRepeatedFieldPracticeOverride(overrideStreak,'hall_barbarian'),false,
    'a room change resets the repeated-override escape hatch');
  assert.equal(shouldYieldRepeatedFieldPracticeOverride([...overrideStreak,
    {room:'fields_furrow',id:'forage',providerChoice:'forage',overrideReason:null}],
    'fields_furrow'),false,'a provider choice that passes through resets the streak');
  const providerChoice=superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,room:'fields_furrow',recentActions:overrideStreak});
  assert.equal(providerChoice.action.id,'travel_fields_furrow',
    'release a repeated wrapper choice even when concurrent combat keeps closing unrelated gate rows');
  assert.equal(providerChoice.overrideReason,null);
  const next=superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,skills:{stealth:1}});
  assert.equal(next.action.id,'forage','prefer a still-unranked distinct lane before extending the top lane');
  const atStudyHall=superviseGoalAction([...options,{id:'study_lore',kind:'command'}],
    {next_action:{choice:'travel_fields_furrow'}},{...state,
      skills:{stealth:1,foraging:1,perception:1,performance:1,appraisal:1}});
  assert.equal(atStudyHall.action.id,'study_lore',
    'one legal study action contributes to both Scholarship and Appraisal');
  assert.equal(superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,inCombat:true}).action.id,'travel_fields_furrow',
    'never field-practice over an active fight');
  assert.equal(superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,bleeding:['head']}).action.id,'travel_fields_furrow',
    'do not force practice while bleeding');
  assert.equal(superviseGoalAction(options,{next_action:{choice:'travel_fields_furrow'}},
    {...state,quest:{kind:'deliver',done:false}}).action.id,'travel_fields_furrow',
    'do not interrupt an active delivery quest that can fund training');
  const combatOptions=[...options,{id:'attack_0',kind:'command'}];
  const combatGate=superviseGoalAction(combatOptions,{next_action:{choice:'practice_stealth'}},
    {...state,requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']},
      ...requirements.rows]}});
  assert.equal(combatGate.action.id,'attack_0',
    'visible safe prey for open combat gates remains higher priority than idle practice');
});

test('stalled field-practice override releases Jev\'s legal Brawling gate choice',()=>{
  const options=[{id:'practice_brawling',kind:'command',command:'remove dagger'},
    {id:'perform',kind:'command',command:'perform'},
    {id:'attack_0',kind:'command',command:'attack marsh hog'}];
  const state={guild:'barbarian',hp:145,maxHp:145,inCombat:false,bleeding:[],silver:0,
    wieldedWeaponSkill:'small_edged',skills:{small_edged:5,brawling:0},
    requirements:{rows:[
      {label:'1st weapon',have:5,need:8,eligible:['small_edged','blunt','brawling']},
      {label:'2nd weapon',have:0,need:8,eligible:['small_edged','blunt','brawling']},
      {label:'4th weapon',have:0,need:2,eligible:['small_edged','blunt','brawling']},
      {label:'1st survival',have:0,need:4,eligible:['stealth','foraging']},
      {label:'1st lore',have:0,need:2,eligible:['performance']},
    ]},trainingProgress:{secondsSinceGateProgress:180}};
  const result=superviseGoalAction(options,{next_action:{choice:'practice_brawling'}},state);
  assert.equal(result.action.id,'practice_brawling');
  assert.equal(result.overrideReason,null,
    'after the stall threshold, do not turn Jev\'s offered distinct weapon-lane choice back into Performance');
});

test('opt-in repeat override budget releases a repeatedly suppressed legal choice',()=>{
  const options=[{id:'flee',kind:'command',command:'flee'},
    {id:'analyze_flame',kind:'command',command:'analyze flame'}];
  const recentActions=Array.from({length:4},(_,i)=>({room:'fields_furrow',
    id:'analyze_flame',providerChoice:'flee',overrideReason:i%2?'defer-voluntary-flee-while-healthy'
      :'use-offered-analysis-for-open-expertise-or-tactics-gate'}));
  const state={guild:'barbarian',room:'fields_furrow',inCombat:true,hp:130,maxHp:145,
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]},
    recentActions,repeatedOverrideReleaseAfter:4};
  assert.equal(shouldReleaseRepeatedProviderChoice(recentActions,state.room,'flee',4),true);
  const released=superviseGoalAction(options,{next_action:{choice:'flee'}},state);
  assert.equal(released.action.id,'flee');
  assert.equal(released.overrideReason,null);
  assert.equal(released.supervisorReleaseReason,
    'repeated-provider-choice-after-supervisor-overrides');

  assert.equal(shouldReleaseRepeatedProviderChoice(recentActions,state.room,'flee',5),false);
  assert.equal(shouldReleaseRepeatedProviderChoice(recentActions,'hall_barbarian','flee',4),false);
  assert.equal(shouldReleaseRepeatedProviderChoice([...recentActions,
    {room:state.room,providerChoice:'flee',overrideReason:null}],state.room,'flee',4),false,
    'a provider choice that passed through breaks the consecutive override streak');
  const belowLimit=superviseGoalAction(options,{next_action:{choice:'flee'}},
    {...state,recentActions:recentActions.slice(1)});
  assert.equal(belowLimit.action.id,'analyze_flame',
    'the release remains opt-in and does not activate before the configured count');
});

test('near-complete equipped weapon lane gets a bounded visible-combat closeout',()=>{
  const options=[{id:'practice_brawling',kind:'command',command:'remove dagger'},
    {id:'attack_0',kind:'command',command:'attack marsh hog'}];
  const state={guild:'barbarian',room:'fields_furrow',hp:145,maxHp:145,inCombat:false,
    bleeding:[],wieldedWeaponSkill:'small_edged',skills:{small_edged:7,brawling:0},
    requirements:{rows:[
      {label:'1st weapon',have:7,need:8,eligible:['small_edged','blunt','brawling']},
      {label:'2nd weapon',have:0,need:8,eligible:['small_edged','blunt','brawling']},
      {label:'4th weapon',have:0,need:2,eligible:['small_edged','blunt','brawling']},
    ]},trainingProgress:{secondsSinceGateProgress:20}};
  const choose=(overrides={})=>superviseGoalAction(options,
    {next_action:{choice:'practice_brawling'}},{...state,...overrides});
  const closeout=choose({recentActions:Array.from({length:4},()=>({room:state.room,
    id:'practice_stealth',overrideReason:'practice-least-developed-open-survival-or-lore-lane'}))});
  assert.equal(closeout.action.id,'attack_0');
  assert.equal(closeout.overrideReason,'close-near-complete-first-weapon-lane');
  assert.equal(choose({skills:{small_edged:6,brawling:0}}).action.id,'practice_brawling',
    'do not redirect while the lane is more than one rank short');
  const stalledCloseout=choose({trainingProgress:{secondsSinceGateProgress:180}});
  assert.equal(stalledCloseout.action.id,'attack_0',
    'a bounded attack that closes a one-rank weapon gap remains useful after gate progress stalls');
  assert.equal(choose({skills:{small_edged:5,brawling:0},
    trainingProgress:{secondsSinceGateProgress:180}}).action.id,'practice_brawling',
    'the stall escape hatch still passes through when the equipped lane is not near completion');
  assert.equal(choose({hp:100}).action.id,'practice_brawling',
    'do not force combat below the health threshold');
  assert.equal(choose({recentActions:Array.from({length:4},()=>({room:state.room,
    overrideReason:'close-near-complete-first-weapon-lane'}))}).action.id,'practice_brawling',
    'yield after four closeout attempts in the same room');
  assert.equal(choose({quest:{kind:'deliver',done:false}}).action.id,'practice_brawling',
    'do not interrupt a delivery quest');
});

test('town performance cannot block starter gear or the first safe combat route',()=>{
  const requirements={rows:[
    {label:'expertise',have:0,need:8,hard:true,eligible:['expertise']},
    {label:'1st weapon',have:0,need:8,eligible:['small_edged','blunt']},
    {label:'1st survival',have:0,need:4,eligible:['foraging','perception']},
    {label:'1st lore',have:0,need:2,eligible:['performance','appraisal']},
  ]};
  const state={guild:'barbarian',hp:145,maxHp:145,inCombat:false,bleeding:[],silver:150,
    requirements,skills:{},purchasedItems:[],trainingProgress:{secondsSinceGateProgress:0}};
  const setupOptions=[{id:'perform',kind:'command'},{id:'starter_kit',kind:'navigate',targetRoom:'bazaar'},
    {id:'travel_fields_furrow',kind:'navigate',targetRoom:'fields_furrow'}];
  const setup=superviseGoalAction(setupOptions,{next_action:{choice:'perform'}},state);
  assert.equal(setup.action.id,'starter_kit');
  assert.equal(setup.overrideReason,'prepare-offered-starter-kit-before-optional-practice');
  const fieldRoute=superviseGoalAction([setupOptions[0],setupOptions[2]],
    {next_action:{choice:'perform'}},{...state,purchasedItems:['dagger']});
  assert.equal(fieldRoute.action.id,'travel_fields_furrow');
  assert.equal(fieldRoute.overrideReason,'route-to-fields-for-open-combat-gates');
});

test('server trainer refusal exposes exact cost for runtime action suppression', () => {
  const refusal='Training Expertise costs 120 silvers, and you have 75. Go hunt!';
  assert.deepEqual(insufficientTrainingFunds(refusal),
    {skillName:'Expertise',requiredSilver:120,availableSilver:75});
  const blocked=new Set();
  assert.deepEqual(blockUnaffordableTrainingAction(blocked,'train_expertise',refusal),
    {skillName:'Expertise',requiredSilver:120,availableSilver:75});
  assert.ok(blocked.has('train_expertise'));
  const expensiveOptions=playerGoalOptions({room:'hall_barbarian',guild:'barbarian',circle:1,
    hp:145,maxhp:145,rt:0,inCombat:false,silver:200,
    requirements:{rows:[{label:'expertise',have:0,need:8,eligible:['expertise']}]},skills:{}},{},[],[...blocked]);
  assert.ok(!expensiveOptions.some(option=>option.id==='train_expertise'),
    'a server-refused training action stays suppressed while blocked');
  assert.equal(blockUnaffordableTrainingAction(blocked,'perform',refusal),null);
  assert.equal(blockUnaffordableTrainingAction(blocked,'train_expertise',
    'Warchief Ulfgar drills you in Expertise.'),null);
});

test('expensive weapon purchases are blocked when they consume the last affordable armor reserve', () => {
  const v={room:'bazaar',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,silver:125,
    requirements:{rows:[{label:'1st weapon',have:0,need:8,eligible:['small_edged','blunt']},
      {label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
      {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']}]},
    skills:{},purchasedItems:['dagger'],equipment:{},wsp:'small_edged'};
  const options=playerGoalOptions(v,{exits:['north','south','east','west']});
  assert.ok(!options.some(option=>option.id==='buy_club'||option.id==='buy_staff'),
    'the extra weapon would leave 13 silvers, below the 30-silver missing armor-lane reserve');
  assert.ok(options.some(option=>option.id==='buy_leather_boots'),
    'the affordable light-armor lane remains available');
  assert.equal(options.some(option=>option.id==='buy_sling'),false,
    'the Jev-specific kit does not trade away Melee Mastery progress for the cheaper ranged lane');
});

test('after buying a costly first weapon, the kit guard preserves silver for one missing armor skill lane', () => {
  const requirements={rows:[
    ...['1st','2nd','3rd','4th'].map((label,index)=>({label:`${label} weapon`,have:0,
      need:[8,8,4,2][index],eligible:['small_edged','blunt','staff','brawling']})),
    {label:'1st armor',have:0,need:6,eligible:['light_armor','shield_usage']},
    {label:'2nd armor',have:0,need:2,eligible:['light_armor','shield_usage']},
  ]};
  const options=playerGoalOptions({room:'bazaar',guild:'barbarian',circle:1,hp:145,maxhp:145,
    silver:38,requirements,skills:{},purchasedItems:['club'],equipment:{hand:[{id:'club'}]},wsp:'blunt'},
    {exits:Object.keys(ROOMS.bazaar.exits)});
  assert.ok(!options.some(option=>option.id==='buy_dagger'),
    'buying a 25-silver dagger would consume the 30-silver reserve for a second armor skill');
  assert.ok(options.some(option=>option.id==='buy_leather_boots'));
});

test('catalogued harvested hides create a tanner trip and sale choices', () => {
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},saleItems:['hog_hide','strongbox'],saleCounts:{hog_hide:7,strongbox:2}};
  const options=playerGoalOptions(v,{exits:['south','north','northeast']});
  assert.ok(options.some(option=>option.id==='sell_field_loot'&&option.targetRoom==='west_road'));
  const atTanner=playerGoalOptions({...v,room:'west_road',saleItems:['hog_hide','strongbox']},
    {exits:['east','west','north'],contents:{npcs:['Aldric, the tanner']}});
  assert.ok(atTanner.some(option=>option.id==='sell_hog_hide'&&option.command==='sell hog_hide 7'));
  assert.match(atTanner.find(option=>option.id==='sell_hog_hide').description,/all 7 tracked/);
  assert.ok(!atTanner.some(option=>option.id==='sell_strongbox'),
    'the sales menu only offers items the tanner buys');
});

test('field tanner trip batches loot until it can fund at least one guild training action', () => {
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},silver:10,saleItems:['hog_hide'],saleCounts:{hog_hide:1}};
  const field={exits:['south','north','northeast']};
  assert.ok(!playerGoalOptions(v,field).some(option=>option.id==='sell_field_loot'),
    'one hide plus 10 silvers cannot yet afford the 40-silver minimum training action');
  assert.ok(playerGoalOptions({...v,saleCounts:{hog_hide:3}},field).some(option=>option.id==='sell_field_loot'),
    'three hides plus purse cover the minimum training action');
  assert.ok(playerGoalOptions({...v,room:'west_road'},
    {exits:['east'],contents:{npcs:['Aldric, the tanner']}}).some(option=>option.id==='sell_hog_hide'),
    'sell immediately when already at the tanner');
});

test('quest actions expose crier, completed reward, and matching courier turn-in to Jev', () => {
  const base={room:'square',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},silver:10};
  const crier={exits:['east','west'],contents:{npcs:['the town crier']}};
  assert.ok(playerGoalOptions(base,crier).some(option=>option.id==='take_quest'&&option.command==='quest'));
  const completed=playerGoalOptions({...base,quest:{kind:'kill',done:true,desc:'Slay 4 more kobolds.'}},crier);
  assert.ok(completed.some(option=>option.id==='claim_quest'&&option.command==='claim'));
  const delivery={kind:'deliver',done:false,desc:'Carry a bundle of clean bandages to Sister Cora at Temple. Say "deliver" when you arrive.'};
  const atTarget=playerGoalOptions({...base,room:'temple',quest:delivery},
    {exits:['north'],contents:{npcs:['Sister Cora, the healer']}});
  assert.ok(atTarget.some(option=>option.id==='deliver_quest'&&option.command==='deliver'));
  const courierRoute=playerGoalOptions({...base,quest:{kind:'deliver',done:false,
    desc:'Carry a training ledger to Grandmaster Odal at Fane of Training. Say "deliver" when you arrive.'}},
  {exits:Object.keys(ROOMS.square.exits)}).find(option=>option.id==='quest_delivery_fane');
  assert.equal(courierRoute?.targetRoom,'fane',
    'a carried delivery quest must expose a route to its named NPC instead of only offering abandon');
  assert.match(courierRoute.description,/then use the offered deliver action/);
  assert.match(playerObjective({...base,quest:delivery}),/Active quest journal: in progress/);
  assert.ok(!playerGoalOptions({...base,hp:100,quest:{kind:'kill',done:true}},crier)
    .some(option=>option.id==='claim_quest'),'quest work waits until active recovery is complete');
});

test('active kill quests annotate matching prey and matching field routes', () => {
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},quest:{kind:'kill',done:false,desc:'Slay 4 more kobolds.'}};
  const options=playerGoalOptions(v,{exits:['north','south','east']},[
    {name:'a marsh hog',state:'in good shape'},{name:'a kobold',state:'in good shape'},
  ]);
  assert.match(options.find(option=>option.id==='attack_0').description,/does not match the active quest target \(kobolds\)/);
  assert.match(options.find(option=>option.id==='attack_1').description,/matches the active kill quest and advances it/);
  const routes=playerGoalOptions({...v,room:'square'},{});
  assert.match(routes.find(option=>option.id==='travel_fields_furrow').description,
    /spawns kobolds, the target of the active kill quest/);
  const hogQuest=playerGoalOptions({...v,room:'square',quest:{kind:'kill',done:false,desc:'Slay 4 more marsh hogs.'}},
    {});
  assert.match(hogQuest.find(option=>option.id==='travel_fields_furrow').description,
    /spawns marsh hogs, the target of the active kill quest/);
});

test('visible combat choices disclose creature-circle gaps and caution on much higher prey', () => {
  const v={room:'fields_orchard',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{}};
  const options=playerGoalOptions(v,{exits:['north','south']},[
    {name:'A kobold',state:'in good shape'},{name:'A reed stalker',state:'in good shape'},
  ]);
  assert.match(options.find(option=>option.id==='attack_0').description,/Known creature circle 2; your circle is 1/);
  assert.match(options.find(option=>option.id==='attack_1').description,/Known creature circle 3; your circle is 1/);
  assert.match(options.find(option=>option.id==='attack_1').description,/2 circles above you; prefer safer visible prey/);
});

test('field routes do not offer destinations with prey more than one circle above the player', () => {
  const base={room:'square',guild:'barbarian',hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{}};
  const circle1=playerGoalOptions({...base,circle:1},{});
  assert.ok(circle1.some(option=>option.id==='travel_fields_furrow'),
    'circle-1 players retain the circle-2 marsh hog/kobold route');
  assert.ok(!circle1.some(option=>option.id==='travel_fields_orchard'),
    'orchard also spawns circle-3 reed stalkers');
  assert.ok(!circle1.some(option=>option.id==='travel_fields_stonebridge'),
    'stonebridge spawns circle-3 reed stalkers and circle-4 wolves');
  assert.match(circle1.find(option=>option.id==='travel_fields_furrow').description,
    /marsh hogs, kobolds \(a marsh hog circle 2, a kobold circle 2\).*at most 1 circle above/);
  const circle2=playerGoalOptions({...base,circle:2},{});
  assert.ok(circle2.some(option=>option.id==='travel_fields_orchard'),
    'circle-2 players may consider the circle-3 reed stalker route');
  assert.ok(!circle2.some(option=>option.id==='travel_fields_stonebridge'),
    'circle-4 wolves remain too far above circle 2');
  const circle3=playerGoalOptions({...base,circle:3},{});
  assert.ok(circle3.some(option=>option.id==='travel_fields_stonebridge'),
    'the route becomes available when all its known spawns are within one circle');
});

test('combat exposes disarm to non-Barbarians when an open Lore lane accepts Tactics', () => {
  const row={label:'3rd lore',have:0,need:4,eligible:['scholarship','tactics','performance','forging']};
  const v={room:'fields_furrow',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:true,
    requirements:{rows:[row]},skills:{tactics:0,small_edged:2}};
  const options=playerGoalOptions(v,{exits:['south']},[{name:'A marsh hog',state:'in good shape'}]);
  assert.equal(options.find(option=>option.id==='disarm')?.command,'disarm');
  assert.match(options.find(option=>option.id==='disarm').description,/practices Tactics for an open eligible circle requirement/);
  assert.ok(!playerGoalOptions({...v,inCombat:false},{exits:['south']},[{name:'A marsh hog'}])
    .some(option=>option.id==='disarm'),'maneuvers are only offered during a real fight');
  assert.ok(!playerGoalOptions({...v,requirements:{rows:[{...row,have:4}]}},{exits:['south']},[{name:'A marsh hog'}])
    .some(option=>option.id==='disarm'),'do not offer extra maneuver risk after its eligible requirement closes');
  assert.ok(!playerGoalOptions({...v,rt:2},{exits:['south']},[{name:'A marsh hog'}])
    .some(option=>option.id==='disarm'),'do not issue maneuvers during roundtime');
});

test('Lore guidance names Tactics when it can fill a missing Nth-Lore slot', () => {
  const objective=playerObjective({circle:1,requirements:{rows:[
    {label:'3rd lore',have:0,need:4,eligible:['scholarship','tactics','performance']},
  ]}});
  assert.match(objective,/offered disarm maneuver to train Tactics as another distinct Lore lane/);
  const withoutTactics=playerObjective({circle:1,requirements:{rows:[
    {label:'1st lore',have:0,need:2,eligible:['scholarship','performance']},
  ]}});
  assert.doesNotMatch(withoutTactics,/disarm maneuver/);
});

test('non-field kill quests parse crier wording and offer a real target spawn route', () => {
  const v={room:'market_way',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},quest:{kind:'kill',done:false,
      desc:"Slay 4 sewer rats and I'll see you paid."}};
  const room={exits:Object.keys(ROOMS.market_way.exits).map(dir=>({n:'north',ne:'northeast',e:'east',
    se:'southeast',s:'south',sw:'southwest',w:'west',nw:'northwest'})[dir])};
  const options=playerGoalOptions(v,room);
  const route=options.find(option=>option.id.startsWith('quest_hunt_'));
  assert.ok(route,'a non-field target gets a destination Jev can choose');
  assert.ok(['sewers_1','sewers_2','sewers_3'].includes(route.targetRoom));
  assert.match(route.description,/active kill quest: travel/);
  assert.match(route.description,/known spawn for sewer rats/);
  const atTarget=playerGoalOptions({...v,room:'sewers_1'},
    {exits:Object.keys(ROOMS.sewers_1.exits).map(dir=>({n:'north',ne:'northeast',e:'east',
      se:'southeast',s:'south',sw:'southwest',w:'west',nw:'northwest'})[dir])},
    [{name:'a sewer rat',state:'in good shape'}]);
  assert.match(atTarget.find(option=>option.id==='attack_0').description,/matches the active kill quest/);
  assert.ok(!atTarget.some(option=>option.id.startsWith('quest_hunt_')),
    'visible quest prey takes precedence over travelling to another spawn');
});

test('quest routes do not bypass an existing field spawn for the same target', () => {
  const v={room:'market_way',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},quest:{kind:'kill',done:false,desc:'Slay 4 more marsh hogs.'}};
  const room={exits:Object.keys(ROOMS.market_way.exits).map(dir=>({n:'north',ne:'northeast',e:'east',
    se:'southeast',s:'south',sw:'southwest',w:'west',nw:'northwest'})[dir])};
  const options=playerGoalOptions(v,room);
  assert.ok(options.some(option=>option.id==='travel_fields_furrow'),
    'keep the known North Fields route to quest prey available');
  assert.match(options.find(option=>option.id==='travel_fields_furrow').description,
    /spawns marsh hogs, the target of the active kill quest/);
  assert.ok(!options.some(option=>option.id.startsWith('quest_hunt_')),
    'do not distract Jev with a farther non-field spawn of the same creature');
});

test('the nearest town crier is offered as an optional, Jev-selected route', () => {
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},silver:10};
  const fieldOptions=playerGoalOptions(v,{exits:['south','north']});
  assert.ok(fieldOptions.some(option=>option.id==='quest_crier'&&option.kind==='navigate'&&option.targetRoom));
  assert.match(fieldOptions.find(option=>option.id==='quest_crier').description,/optional quest/);
  assert.doesNotMatch(fieldOptions.find(option=>option.id==='quest_crier').description,/Visit the crier before another field trip/,
    'low funds do not over-prioritize a distant town trip');
  const nearCrier=playerGoalOptions({...v,room:'bazaar',silver:3},{exits:['north','east','west','south']});
  assert.match(nearCrier.find(option=>option.id==='quest_crier').description,/only \d+ rooms away; every first-circle quest pays at least 49 silvers/);
  const atCrier=playerGoalOptions({...v,room:'square',silver:3},{exits:['north','east'],contents:{npcs:['the town crier']}});
  assert.match(atCrier.find(option=>option.id==='take_quest').description,/below the 40-silver minimum trainer lesson/);
});

test('successfully skinned visible corpses are not offered repeatedly', () => {
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},skinnedCorpseCounts:{kobold:1}};
  const oneCorpse={msg:'the corpse of a kobold lie on the ground.',exits:['south']};
  assert.ok(!playerGoalOptions(v,oneCorpse).some(option=>option.id==='skin_kobold'));
  const twoCorpses={...oneCorpse,msg:'the corpse of a kobold, the corpse of a kobold lie on the ground.'};
  const twoCorpseOptions=playerGoalOptions(v,twoCorpses);
  assert.ok(twoCorpseOptions.some(option=>option.id==='skin_kobold'),
    'a newly visible second body remains harvestable');
  assert.equal(twoCorpseOptions.filter(option=>option.id==='skin_kobold').length,1,
    'identical skin commands are offered once even when several same-species corpses are visible');
  assert.ok(playerGoalOptions({...v,skinnedCorpseCounts:{}},oneCorpse).some(option=>option.id==='skin_kobold'));
});

test('failed skinning gets a temporary corpse-specific backoff without losing later retry', () => {
  const now=Date.now();
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},skinningRetryUntil:{'marsh hog':now+20_000}};
  const room={msg:'the corpse of a marsh hog lie on the ground.',exits:['south']};
  assert.equal(skinningRetryActive(v,'Marsh Hog',now),true);
  assert.ok(!playerGoalOptions(v,room).some(option=>option.id==='skin_marsh_hog'));
  assert.ok(playerGoalOptions({...v,skinningRetryUntil:{'marsh hog':now-1}},room).some(option=>option.id==='skin_marsh_hog'),
    'expired backoff allows another attempt');
  assert.equal(skinningRetryActive(v,'marsh hog',now+20_000),false);
});

test('overload observation restricts choices to bundling hides or selling at tanner', () => {
  const v={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[]},skills:{},saleItems:['hog_hide','kobold_skin'],
    saleCounts:{hog_hide:7,kobold_skin:2},overloaded:true};
  const options=playerGoalOptions(v,{exits:['south','north']});
  assert.deepEqual(options.map(option=>option.id),['bundle_hog_hide','bundle_kobold_skin']);
  assert.equal(options[0].command,'bundle hog_hide 7');
  const tanner=playerGoalOptions({...v,room:'west_road'},
    {exits:['east','west'],contents:{npcs:['Aldric, the tanner']}});
  assert.deepEqual(tanner.map(option=>option.id),['sell_hog_hide','sell_kobold_skin']);
  assert.equal(tanner[0].command,'sell hog_hide 7');
  const afterOneBundle=playerGoalOptions({...v,bundledItems:['hog_hide']},{exits:['south','north']});
  assert.deepEqual(afterOneBundle.map(option=>option.id),['bundle_kobold_skin']);
  const injured=playerGoalOptions({...v,hp:80,bleeding:['left arm (slight)']},{exits:['south','north']});
  assert.deepEqual(injured.map(option=>option.id),['tend_wounds','rest'],
    'healing remains higher priority than burden recovery');
});

test('tracked strongboxes expose picking to recover from overload and train Lockpicking', () => {
  const survival={label:'5th survival',have:0,need:2,eligible:['evasion','lockpicking','foraging']};
  const v={room:'west_gate',guild:'trader',circle:1,hp:116,maxhp:145,rt:0,inCombat:false,
    requirements:{rows:[survival]},skills:{lockpicking:0},saleItems:['strongbox'],
    saleCounts:{strongbox:2},overloaded:true};
  const overloaded=playerGoalOptions(v,{exits:['west']});
  assert.deepEqual(overloaded.map(option=>option.id),['unlock_strongbox']);
  assert.equal(overloaded[0].command,'pick strongbox');
  assert.match(overloaded[0].description,/practice Lockpicking for an open Survival lane/);
  const progression=playerGoalOptions({...v,overloaded:false},{exits:['west']});
  assert.ok(progression.some(option=>option.id==='unlock_strongbox'),
    'when it is not needed for burden relief, picking remains available for an open Survival lane');
  assert.ok(!playerGoalOptions({...v,overloaded:false,requirements:{rows:[{...survival,have:2}]}},
    {exits:['west']}).some(option=>option.id==='unlock_strongbox'),
  'do not add optional lockpicking once no requirement needs it');
});

test('controller runtime loot and burden state reaches the legal-action builder', () => {
  const base={room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    silver:10,requirements:{rows:[]},skills:{}};
  const lootState=playerPolicyVitals(base,{saleCounts:{hog_hide:4},overloaded:false});
  const lootOptions=playerGoalOptions(lootState,{exits:['south','north']});
  assert.ok(lootOptions.some(option=>option.id==='sell_field_loot'),
    'tracked loot must create an available tanner route, not just model context');
  const burdenState=playerPolicyVitals(base,{saleCounts:{hog_hide:4,kobold_skin:2},overloaded:true});
  assert.deepEqual(playerGoalOptions(burdenState,{exits:['south','north']}).map(option=>option.id),
    ['bundle_hog_hide','bundle_kobold_skin']);
  const retryUntil=Date.now()+20_000;
  const retryState=playerPolicyVitals(base,{skinningRetryUntil:{'marsh hog':retryUntil}});
  const hogCorpse={msg:'the corpse of a marsh hog lie on the ground.',exits:['south']};
  assert.ok(!playerGoalOptions(retryState,hogCorpse).some(option=>option.id==='skin_marsh_hog'),
    'the live controller must forward fumble backoff into the action builder');
  const expiredRetryState=playerPolicyVitals(base,{skinningRetryUntil:{'marsh hog':Date.now()-1}});
  assert.ok(playerGoalOptions(expiredRetryState,hogCorpse).some(option=>option.id==='skin_marsh_hog'),
    'expired controller backoff must restore the skinning choice');
});

test('prompt-before-text ordering preserves only a fresh command correlation', () => {
  const sentAt=10_000;
  assert.equal(pendingCommandActionAfterPrompt('tend_wounds',sentAt,sentAt+1),'tend_wounds');
  assert.equal(pendingCommandActionAfterPrompt('tend_wounds',sentAt,sentAt+3001),null);
  assert.equal(pendingCommandActionAfterPrompt(null,sentAt,sentAt+1),null);
});

test('healthy out-of-combat wound cooldown sleeps until tend is legal again', () => {
  const now=10_000, until=190_000;
  const v={hp:116,maxhp:145,inCombat:false,bleeding:['left arm (slight)']};
  assert.equal(deferTendCooldown(v,'left arm',until,now),true);
  assert.equal(deferTendCooldown(v,'left arm',now,now),false,'expired cooldown permits another decision');
  assert.equal(deferTendCooldown({...v,hp:100},'left arm',until,now),false,'injury below rest ceiling needs active recovery');
  assert.equal(deferTendCooldown({...v,inCombat:true},'left arm',until,now),false,'combat always remains supervised');
  assert.equal(deferTendCooldown({...v,bleeding:[]},'left arm',until,now),false,'a closed wound cancels the defer');
  assert.equal(deferTendCooldown({inCombat:false,bleeding:v.bleeding},'left arm',until,now),false,'unknown health does not suppress supervision');
});

test('field actions expose distinct survival lanes and live learning stage', () => {
  const rows=[{label:'1st survival',have:0,need:4,eligible:['foraging','perception','skinning']}];
  const options=playerGoalOptions({room:'fields_furrow',guild:'barbarian',circle:1,hp:145,maxhp:145,
    rt:0,inCombat:false,requirements:{rows},skills:{foraging:0,perception:0},
    skillLearning:[{name:'Outdoorsmanship',rank:0,mindstate:'fascinated'},
      {name:'Perception',rank:0,mindstate:'perusing'}]},
  {exits:['south','north','northeast']});
  assert.match(options.find(option=>option.id==='forage').description,/Outdoorsmanship\/Foraging/);
  assert.match(options.find(option=>option.id==='forage').description,/learning stage fascinated/);
  assert.match(options.find(option=>option.id==='hunt_signs').description,/distinct survival lane from Foraging/);
  assert.match(options.find(option=>option.id==='hunt_signs').description,/learning stage perusing/);
  const objective=playerObjective({guild:'barbarian',circle:1,requirements:{rows},trainingProgress:null});
  assert.match(objective,/prefer offered forage \(Foraging\), hunt \(Perception\), hide \(Stealth\)/);
  assert.match(objective,/wilderness travel also practices Athletics/);
});

test('safe wilderness choices expose Stealth when it can fill a missing Survival lane', () => {
  const requirements={rows:[
    {label:'1st survival',have:4,need:6,eligible:['evasion','perception','foraging','skinning','stealth']},
    {label:'2nd survival',have:3,need:4,eligible:['evasion','perception','foraging','skinning','stealth']},
    {label:'3rd survival',have:3,need:4,eligible:['evasion','perception','foraging','skinning','stealth']},
    {label:'4th survival',have:2,need:2,eligible:['evasion','perception','foraging','skinning','stealth']},
    {label:'5th survival',have:0,need:2,eligible:['evasion','perception','foraging','skinning','stealth']},
    {label:'6th survival',have:0,need:1,eligible:['evasion','perception','foraging','skinning','stealth']},
  ]};
  const v={room:'fields_furrow',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements,skills:{evasion:4,perception:3,foraging:3,skinning:2,stealth:0}};
  const field={exits:['south','north','northeast']};
  const options=playerGoalOptions(v,field);
  assert.equal(options.find(option=>option.id==='practice_stealth')?.command,'hide');
  assert.match(options.find(option=>option.id==='practice_stealth').description,/distinct eligible Survival lane/);
  assert.ok(!playerGoalOptions({...v,inCombat:true},field).some(option=>option.id==='practice_stealth'),
    'do not spend the active combat turn hiding');
  assert.ok(!playerGoalOptions({...v,requirements:{rows:[]}},field).some(option=>option.id==='practice_stealth'),
    'do not expose stealth practice after its circle lane is no longer required');
});

test('Jev is told not to keep postponing safe distinct Survival practice', () => {
  const guidance=playerGoalQuestions([{id:'practice_stealth',kind:'command',
    description:'Hide to advance the unmet Stealth Survival lane.'}]).next_action.instructions;
  assert.match(guidance,/safe field-practice action can advance an open Survival slot/);
  assert.match(guidance,/instead of repeatedly postponing it for optional hunting, travel, or economy/);
});

test('lore gaps expose safe Scholarship and Appraisal practice without acting during roundtime', () => {
  const rows=[
    {label:'1st lore',have:0,need:2,eligible:['performance','scholarship','appraisal']},
    {label:'2nd lore',have:0,need:2,eligible:['performance','scholarship','appraisal']},
  ];
  const v={room:'temple',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows},skills:{},purchasedItems:['dagger']};
  const options=playerGoalOptions(v,{exits:['south']});
  assert.equal(options.find(option=>option.id==='study_lore')?.command,'study');
  assert.equal(options.find(option=>option.id==='appraise_dagger')?.command,'appraise dagger');
  assert.match(playerObjective(v),/library study for Scholarship\/Appraisal/);
  const duringRoundtime=playerGoalOptions({...v,rt:4},{exits:['south']});
  assert.ok(!duringRoundtime.some(option=>option.id==='study_lore'||option.id==='appraise_dagger'));
});

test('Scholarship and Appraisal Lore gaps expose a Jev-selected route to the nearest study location', () => {
  const rows=[
    {label:'appraisal',have:0,need:6,eligible:['appraisal'],hard:true},
    {label:'1st lore',have:0,need:6,eligible:['scholarship','performance','appraisal']},
    {label:'2nd lore',have:0,need:4,eligible:['scholarship','performance','appraisal']},
  ];
  const v={room:'fields_furrow',guild:'trader',circle:1,hp:145,maxhp:145,rt:0,inCombat:false,
    requirements:{rows},skills:{},purchasedItems:['dagger']};
  const options=playerGoalOptions(v,{exits:['south','north']});
  const route=options.find(option=>option.id==='lore_library');
  assert.equal(route?.kind,'navigate');
  assert.equal(route?.targetRoom,'temple_row', 'Temple Row is nearer from the field than the Academy');
  assert.match(route.description,/Scholarship and Appraisal/);
  const nearTraderHall=playerGoalOptions({...v,room:'hall_trader'},{exits:['south','north']})
    .find(option=>option.id==='lore_library');
  assert.equal(nearTraderHall?.targetRoom,'academy', 'the Academy is nearer from the Trader hall');
  assert.ok(!playerGoalOptions({...v,inCombat:true},{exits:['south']}).some(option=>option.id==='lore_library'),
    'do not route away from an active fight');
  const performanceOnly={...v,requirements:{rows:[
    {label:'1st lore',have:0,need:2,eligible:['performance']},
  ]}};
  assert.ok(!playerGoalOptions(performanceOnly,{exits:['south']}).some(option=>option.id==='lore_library'),
    'do not send Jev to the Academy when its study skills cannot close a displayed Lore gap');
});

test('the recorded 116/145 HP rest ceiling cannot produce another rest command', () => {
  const v={hp:116,maxhp:145,rt:0,inCombat:false};
  const cs=[{name:'A marsh hog',state:'in good shape'},{name:'A kobold',state:'in good shape'}];
  const opts=playerOptions(v,cs), q=playerQuestions(opts,cs);
  assert.deepEqual(Object.keys(q.next_action.criteria),['look','engage']);
  assert.deepEqual(Object.keys(q.target.criteria),['target_0','target_1']);
  const answers={next_action:{choice:'engage',confidence:0.9},target:{choice:'target_1',confidence:0.23}};
  const decision=resolvePlayerDecision(v,cs,opts,answers);
  assert.equal(decision.command,'attack marsh hog');
  assert.equal(decision.usedFallback,false);
  assert.equal(decision.targetSource,'code-visible-order-tiebreak');
  answers.next_action.confidence=0.23;
  assert.equal(resolvePlayerDecision(v,cs,opts,answers).command,'look');
});

test('clear target preference is respected and emergency health overrides waiting', () => {
  const cs=[{name:'A marsh hog'},{name:'A kobold'}], v={hp:145,maxhp:145,rt:0,inCombat:false};
  const answers={next_action:{choice:'engage',confidence:0.9},target:{choice:'target_1',confidence:0.9}};
  assert.equal(resolvePlayerDecision(v,cs,playerOptions(v,cs),answers).command,'attack kobold');
  const injured={...v,hp:20,inCombat:true,rt:3};
  assert.equal(resolvePlayerDecision(injured,cs,playerOptions(injured),{next_action:{choice:'wait',confidence:1}}).command,'flee');
});
test('provider response is discarded after relocation, combat change or dangerous health loss', () => {
  const before = {room:'field', inCombat:true, hp:80, maxHp:100};
  const after = {room:'field', inCombat:true, hp:70, maxhp:100};
  assert.equal(responseStillApplicable(before, after), true);
  for (const delta of [{room:'gate'}, {inCombat:false}, {hp:20}]) {
    assert.equal(responseStillApplicable(before, {...after,...delta}), false);
  }
});

test('out-of-combat choice survives roundtime expiring but not new roundtime starting', () => {
  const before = {room:'hall', inCombat:false, hp:100, maxHp:100, roundtime:1};
  assert.equal(responseStillApplicable(before, {room:'hall', inCombat:false, hp:100, maxhp:100, rt:0}), true);
  assert.equal(responseStillApplicable({...before,roundtime:0}, {room:'hall', inCombat:false, hp:100, maxhp:100, rt:1}), false);
});
