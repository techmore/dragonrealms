#!/usr/bin/env node
// Offline, read-only counterfactual for the independent curriculum bridge.
// It never sends commands or changes a live run.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { bridgeCurriculumAction } from './lib/jev-curriculum-bridge.mjs';

const { values } = parseArgs({ options: {
  run: { type:'string' }, output: { type:'string' }, limit: { type:'string' },
} });
if (!values.run) throw new Error('--run RUN_ID is required');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const eventsPath=path.join(root,'public/live/jev-player',values.run,'events.jsonl');
if (!fs.existsSync(eventsPath)) throw new Error(`Run events not found: ${eventsPath}`);
const maxExamples=Math.max(1,Math.min(50,Number(values.limit)||12));
let totalDecisions=0,bridgeDecisions=0;
const phases={},examples=[];
for (const line of fs.readFileSync(eventsPath,'utf8').trim().split('\n')) {
  let event; try { event=JSON.parse(line); } catch { continue; }
  if (event.type!=='local-decision') continue;
  totalDecisions++;
  const state=event.state||{};
  const result=bridgeCurriculumAction(event.options||[],{
    guild:state.character?.guild||'barbarian', inCombat:state.inCombat,
    hp:state.hp, maxHp:state.maxHp, silver:state.silver, quest:state.quest,
    bleeding:state.bleeding||[], purchasedItems:state.purchasedItems||[],
    equipment:state.equipment||{}, requirements:state.requirements, skills:state.skills||{},
  });
  if (!result) continue;
  bridgeDecisions++; phases[result.phase]=(phases[result.phase]||0)+1;
  if (examples.length<maxExamples) examples.push({ts:event.ts,room:state.room,silver:state.silver,
    kit:state.purchasedItems||[],providerChoice:event.providerChoice||event.choice||null,
    bridgeChoice:result.action.id,phase:result.phase,reason:result.reason});
}
const report={schema:'dragonrealms.jev-curriculum-replay/1',runId:values.run,
  source:'saved local-decision events; no commands executed',totalDecisions,bridgeDecisions,
  phases,examples,generatedAt:new Date().toISOString()};
const output=values.output
  ? path.resolve(values.output)
  : path.join(root,'public/live/jev-player',`curriculum-replay-${values.run}.json`);
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,output},null,2));
