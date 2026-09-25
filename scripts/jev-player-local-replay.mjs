#!/usr/bin/env node
// Replay saved Jev-player menus through the local choice model. This opens no
// game session and sends no game commands; it only records proposed decisions.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { askLocalChoice } from './lib/jev.mjs';
import { ownedGearPriorityGuidance, playerGoalQuestions, PLAYER_POLICY_VERSION } from './lib/jev-player-policy.mjs';
import { selectLocalReplayEvents } from './lib/jev-local-replay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  run: { type:'string' }, event: { type:'string' }, limit: { type:'string', default:'1' },
  'requires-action': { type:'string' }, model: { type:'string' }, protocol: { type:'string' },
  'base-url': { type:'string' }, help: { type:'boolean', default:false },
} });
if (values.help) {
  console.log('node scripts/jev-player-local-replay.mjs --run RUN_ID [--event ISO_TIMESTAMP | --limit N] [--requires-action ACTION_ID] [--model MODEL] [--protocol ollama|openai-compatible] [--base-url LOOPBACK_URL]');
  process.exit(0);
}
if (!values.run || !/^jev-player-[A-Za-z0-9T._-]+$/.test(values.run))
  throw new Error('Provide a valid Jev-player run ID.');
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 10)
  throw new Error('--limit must be an integer from 1 to 10.');
const source = path.join(root, 'public/live/jev-player', values.run, 'events.jsonl');
const events = fs.readFileSync(source, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const selected = selectLocalReplayEvents(events,{eventTimestamp:values.event || null,limit,
  requiredAction:values['requires-action'] || null});
if (!selected.length) throw new Error('No recorded decision menus matched the requested run/filter.');
if (values.event && selected.length !== 1) throw new Error('The requested event timestamp did not identify exactly one local decision.');

const protocol = values.protocol || process.env.JEV_PLAYER_LOCAL_PROTOCOL || 'ollama';
const model = values.model || process.env.JEV_PLAYER_LOCAL_MODEL || 'qwen3:8b';
const baseUrl = values['base-url'] || process.env.JEV_PLAYER_LOCAL_URL
  || (protocol === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1');
const report = { schema:'dragonrealms.jev-player-local-replay/1', createdAt:new Date().toISOString(),
  sourceRun:values.run, sourceFile:`/live/jev-player/${values.run}/events.jsonl`,
  policyVersion:PLAYER_POLICY_VERSION, provider:'local', model, protocol,
  scope:'Read-only menu replay; proposed choices are never sent to the game.',
  records:[], errors:[] };
for (const event of selected) {
  const priorityGuidance = ownedGearPriorityGuidance(event.options,event.state.requirements,event.state.inCombat);
  const questions = playerGoalQuestions(event.options);
  try {
    const result = await askLocalChoice({...event.state,priorityGuidance},questions,
      {baseUrl,model,protocol});
    const proposedChoice = result.answers.next_action.choice;
    report.records.push({sourceTimestamp:event.ts,recordedChoice:event.choice,
      offeredActionIds:event.options.map(option=>option.id),priorityGuidance,
      proposedChoice,matchedRecording:proposedChoice===event.choice,
      model:result.model,elapsedMs:result.elapsedMs,usage:result.usage || null});
  } catch (error) {
    report.errors.push({sourceTimestamp:event.ts,message:error.message,status:error.status || null});
  }
}
report.status = report.errors.length ? (report.records.length ? 'partial' : 'failed') : 'complete';
const outputDir = path.join(root,'public/live/jev-player');
const output = path.join(outputDir,`local-replay-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}.json`);
const temporary = `${output}.tmp`;
fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');
fs.renameSync(temporary,output);
console.log(JSON.stringify({status:report.status,sourceRun:report.sourceRun,
  replayed:report.records.length,errors:report.errors.length,report:output,
  dashboard:`http://localhost:${process.env.DR_PORT || 3000}/jev-player.html?replay=${path.basename(output)}`},null,2));
if (report.status !== 'complete') process.exitCode = 1;
