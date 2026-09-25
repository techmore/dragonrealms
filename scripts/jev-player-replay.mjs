// Three fixed regression cases, including the original stuck observation.
// Calls Jev but never opens a game session or sends game commands.
import fs from 'node:fs';
import path from 'node:path';
import { askJev } from './lib/jev.mjs';
import { playerOptions, playerQuestions, resolvePlayerDecision, restCeiling, PLAYER_POLICY_VERSION } from './lib/jev-player-policy.mjs';
import { CombatEvidence } from './lib/jev-combat-evidence.mjs';

const source='public/live/jev-player/jev-player-2026-09-17T16-39-27-821Z-738849/events.jsonl';
const stuck=fs.readFileSync(source,'utf8').trim().split('\n').map(JSON.parse)
  .filter(e=>e.type==='jev' && e.usedFallback && !e.state.inCombat).at(-1).state;
const cases=[
  {id:'recorded-rest-loop',state:stuck,expected:'engage'},
  {id:'injured-before-fight',state:{...stuck,hp:70,recent:['You rest... hp 70/145, stamina 110/110']},expected:'rest'},
  {id:'critical-combat',state:{...stuck,hp:20,inCombat:true,roundtime:3,recent:['A marsh hog clips your shoulder for 12 damage.']},expected:'flee'},
];
const combatSource='public/live/jev-player/jev-player-2026-09-17T16-50-35-321Z-fbf2eb/events.jsonl';
const combatEvents=fs.readFileSync(combatSource,'utf8').trim().split('\n').map(JSON.parse);
const evidence=new CombatEvidence();let lastCombatCase;
for (const e of combatEvents) {
  const now=Date.parse(e.ts);
  if (e.type==='prompt') evidence.prompt(e,now);
  if (e.type==='text') evidence.text(e.text,now);
  if (e.type==='jev' && e.state.inCombat) lastCombatCase={...e.state,combatEvidence:evidence.snapshot(now)};
}
cases.push({id:'historical-uncertain-combat',state:lastCombatCase,expected:null});
const records=[];
for (const fixture of cases) {
  const v={...fixture.state,maxhp:fixture.state.maxHp,rt:fixture.state.roundtime};
  const state={...fixture.state,restCeilingHp:restCeiling(v),recoveredForCombat:v.hp>=restCeiling(v)};
  const options=playerOptions(v,state.creatures), questions=playerQuestions(options,state.creatures);
  const response=await askJev(state,questions);
  const decision=resolvePlayerDecision(v,state.creatures,options,response.answers);
  records.push({...fixture,state,questions,response,decision,matched:fixture.expected===null?null:decision.choice===fixture.expected});
}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const file=path.resolve(`public/live/jev-player/replay-${stamp}.json`);
fs.writeFileSync(file,JSON.stringify({policyVersion:PLAYER_POLICY_VERSION,source,combatSource,createdAt:new Date().toISOString(),
  scope:'Development regression: historical rest loop and two synthetic cases. Historical combat is unlabeled diagnostic only, not an accuracy claim.',records},null,2)+'\n');
console.log(JSON.stringify({file,cases:records.map(r=>({id:r.id,expected:r.expected,choice:r.decision.choice,
  proposed:r.response.answers.next_action.choice,confidence:r.response.answers.next_action.confidence,
  targetConfidence:r.response.answers.target?.confidence,targetSource:r.decision.targetSource,matched:r.matched}))},null,2));
if(records.some(r=>r.matched===false))process.exitCode=1;
