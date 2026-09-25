#!/usr/bin/env node
// Deterministically replay saved Jev menus through the current supervisor.
// No provider call, game session, or command execution occurs.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PLAYER_POLICY_VERSION, PLAYER_SUPERVISOR_VERSION } from './lib/jev-player-policy.mjs';
import { summarizeSupervisorReplay } from './lib/jev-supervisor-replay.mjs';
import { attachRecentSkillCensus } from './lib/jev-skill-census.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options:{
  run:{type:'string'}, limit:{type:'string'}, 'lane-coach':{type:'boolean',default:false},
  'repeat-override-release-after':{type:'string'},
  'stalled-field-practice-release-after':{type:'string'},
  'training-funds-quest-min-silver':{type:'string'},
  'distinct-weapon-training':{type:'boolean',default:false},
  help:{type:'boolean',default:false},
} });
if (values.help) {
  console.log('node scripts/jev-player-supervisor-replay.mjs --run RUN_ID [--limit N] [--lane-coach] [--repeat-override-release-after N] [--stalled-field-practice-release-after SECONDS] [--training-funds-quest-min-silver N] [--distinct-weapon-training]');
  process.exit(0);
}
if (!values.run || !/^jev-player-[A-Za-z0-9T._-]+$/.test(values.run))
  throw new Error('Provide a valid Jev-player run ID.');
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 1 && limit <= 10000)))
  throw new Error('--limit must be an integer from 1 to 10000.');
const repeatedOverrideReleaseAfter=Number(values['repeat-override-release-after'] || 0);
if (!Number.isInteger(repeatedOverrideReleaseAfter) || repeatedOverrideReleaseAfter < 0
    || repeatedOverrideReleaseAfter > 8)
  throw new Error('--repeat-override-release-after must be an integer from 0 to 8.');
const stalledFieldPracticeReleaseAfter=Number(values['stalled-field-practice-release-after']||0);
if (!Number.isInteger(stalledFieldPracticeReleaseAfter)||stalledFieldPracticeReleaseAfter<0
    ||stalledFieldPracticeReleaseAfter>86400)
  throw new Error('--stalled-field-practice-release-after must be an integer from 0 to 86400.');
const trainingFundsQuestMinimumSilver=Number(values['training-funds-quest-min-silver']||0);
if(!Number.isInteger(trainingFundsQuestMinimumSilver)||trainingFundsQuestMinimumSilver<0
    ||trainingFundsQuestMinimumSilver>10000)
  throw new Error('--training-funds-quest-min-silver must be an integer from 0 to 10000.');

const source = path.join(root,'public/live/jev-player',values.run,'events.jsonl');
const events = attachRecentSkillCensus(fs.readFileSync(source,'utf8').split('\n')
  .filter(Boolean).map(line=>JSON.parse(line)))
  .filter(event => ['local-decision','jev-decision'].includes(event.type)
    && Array.isArray(event.options) && event.state).slice(-limit);
if (!events.length) throw new Error('The selected run contains no replayable decision menus.');
const result = summarizeSupervisorReplay(events,{laneCoach:values['lane-coach'],
  repeatedOverrideReleaseAfter,stalledFieldPracticeReleaseAfter,
  trainingFundsQuestMinimumSilver,distinctWeaponTraining:values['distinct-weapon-training']});
const replayVersion=PLAYER_SUPERVISOR_VERSION+(repeatedOverrideReleaseAfter
  ? `-repeat-choice-release-${repeatedOverrideReleaseAfter}` : '');
const treatments=[
  stalledFieldPracticeReleaseAfter?`field-release-${stalledFieldPracticeReleaseAfter}s-counterfactual`:null,
  trainingFundsQuestMinimumSilver?`training-funds-quest-${trainingFundsQuestMinimumSilver}-counterfactual`:null,
  values['distinct-weapon-training']?'distinct-weapon-training-counterfactual':null,
].filter(Boolean);
const effectiveVersion=replayVersion+(treatments.length?`-${treatments.join('-')}`:'');
const report = {
  schema:'dragonrealms.jev-player-supervisor-replay/1',
  createdAt:new Date().toISOString(),sourceRun:values.run,
  sourceFile:`/live/jev-player/${values.run}/events.jsonl`,
  policyVersion:PLAYER_POLICY_VERSION,supervisorVersion:effectiveVersion,
  repeatedOverrideReleaseAfter,
  stalledFieldPracticeReleaseAfter,
  scope:'Offline replay of saved provider choices against legal menus; records missing providerChoice are skipped and no commands are sent.',
  laneCoachMode:values['lane-coach']?'advisory-counterfactual':'off',
  ...result,
};
const outputDir=path.join(root,'public/live/jev-player');
const output=path.join(outputDir,`supervisor-replay-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}.json`);
const temporary=`${output}.tmp`;
fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');
fs.renameSync(temporary,output);
console.log(JSON.stringify({sourceRun:values.run,supervisorVersion:report.supervisorVersion,
  decisions:report.decisions,replayed:report.replayed,changed:report.changed,
  uncoachedChanges:report.uncoachedChanges,
  menusWithDuplicateActionIds:report.menusWithDuplicateActionIds,
  duplicateActionIdOccurrences:report.duplicateActionIdOccurrences,
  missingProviderChoice:report.missingProviderChoice,
  repeatedOverridePassThroughs:report.repeatedOverridePassThroughs,
  stalledFieldPracticeReleases:report.stalledFieldPracticeReleases,
  stalledFieldPracticeByAction:report.stalledFieldPracticeByAction,
  stalledFieldPracticeBySkill:report.stalledFieldPracticeBySkill,
  stalledFieldPracticeBaselines:report.stalledFieldPracticeBaselines,
  stalledFieldPracticeDisplacedHuntDecisions:report.stalledFieldPracticeDisplacedHuntDecisions,
  stalledFieldPracticeDisplacedTravelDecisions:report.stalledFieldPracticeDisplacedTravelDecisions,
  stalledFieldPracticeDisplacedTravelSteps:report.stalledFieldPracticeDisplacedTravelSteps,
  trainingFundsQuestMinimumSilver,
  trainingFundsQuestOpportunities:report.trainingFundsQuestOpportunities,
  trainingFundsQuestBaselines:report.trainingFundsQuestBaselines,
  distinctWeaponTraining:values['distinct-weapon-training'],
  distinctWeaponTrainingOpportunities:report.distinctWeaponTrainingOpportunities,
  distinctWeaponTrainingBaselines:report.distinctWeaponTrainingBaselines,
  distinctWeaponTrainingBudgetCounts:report.distinctWeaponTrainingBudgetCounts,
  distinctWeaponTrainingReadinessReasons:report.distinctWeaponTrainingReadinessReasons,
  laneCoachPreserved:report.laneCoachPreserved,laneCoachMode:report.laneCoachMode,
  byReason:report.byReason,uncoachedByReason:report.uncoachedByReason,report:output},null,2));
