#!/usr/bin/env node
// Jev-controlled ordinary player. Jev chooses among bounded legal actions;
// WireSession owns auth, rate limiting, and the normal websocket protocol.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WireSession, trackMove } from './lib/wire-session.mjs';
import { ITEMS } from '../data/items.js';
import { GUILDS } from '../data/guilds.js';
import { askJev, askLocalChoice } from './lib/jev.mjs';
import { playerGoalOptions, playerGoalQuestions, chooseGoalAction, playerObjective, playerPolicyVitals, shortestRoomPath,
  pendingCommandActionAfterPrompt, responseStillApplicable, deferTendCooldown, blockUnaffordableTrainingAction,
  shouldHoldBrawlingLane, needsJevChoice, ownedGearPriorityGuidance, superviseGoalAction, targetCircleReached, playerRunStatus, releaseDragonFormLock,
  actionStaleDuringRoundtime,
  isStalledChoicePassThrough,
  PLAYER_POLICY_VERSION, PLAYER_SUPERVISOR_VERSION } from './lib/jev-player-policy.mjs';
import { CombatEvidence, sustainedCombatLoss } from './lib/jev-combat-evidence.mjs';
import { JevProgressObserver } from './lib/jev-progress.mjs';
import { JEV_MAX_CONSECUTIVE_FAILURES, jevBackoffSeconds, isPermanentJevClientError,
  createJevLocalFallback } from './lib/jev-provider-policy.mjs';
import { jevStatPolicy } from './lib/jev-stat-policy.mjs';
import { combatEntryDecision, consumeCombatEntryFollowup, isDecisionDue, shouldAssessCombat, shouldRefreshRoom } from './lib/jev-observation-policy.mjs';
import { skinnedItemIds, skinnedCreatureName, soldQuantityFromText, visibleCorpseCounts,
  consumedStrongboxFromText } from './lib/jev-loot.mjs';
import { advanceLaneCommitment, buildLaneCoachContext, preserveMappedChoice,
  recordLaneChoice } from './lib/jev-lane-coach.mjs';
import { abilityAdvancesOpenRequirement, canPrefetchBarbarianAbility,
  prefetchedCombatActionStatus } from './lib/jev-rt-prefetch.mjs';
import { captureJevPlayerCodeHashes } from './lib/jev-player-code-hashes.mjs';

const minutes = Math.max(1, Math.min(360, Number(process.env.JEV_PLAYER_MINUTES || process.argv[2] || 3)));
if (!Number.isFinite(minutes)) throw new Error('Duration must be a finite number of minutes');
const guildId = String(process.env.JEV_PLAYER_GUILD || 'barbarian').trim().toLowerCase();
if (!GUILDS[guildId]) throw new Error(`Unknown Jev player guild: ${guildId}`);
const targetCircle = Number(process.env.JEV_PLAYER_TARGET_CIRCLE || 3);
if (!Number.isInteger(targetCircle) || targetCircle < 3 || targetCircle > 1750)
  throw new Error('Campaign target circle must be an integer between 3 and 1750');
const decisionProvider = String(process.env.JEV_PLAYER_PROVIDER || 'jev').trim().toLowerCase();
if (!['jev', 'local', 'hybrid'].includes(decisionProvider))
  throw new Error('JEV_PLAYER_PROVIDER must be jev, local, or hybrid');
const localModel = String(process.env.JEV_PLAYER_LOCAL_MODEL || 'qwen3:8b').trim();
const localProtocol = String(process.env.JEV_PLAYER_LOCAL_PROTOCOL || 'ollama').trim().toLowerCase();
const localBaseUrl = String(process.env.JEV_PLAYER_LOCAL_URL ||
  (localProtocol === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1')).trim();
const laneCoachMode = String(process.env.JEV_PLAYER_LANE_COACH || 'off').trim().toLowerCase();
if (!['off','advisory'].includes(laneCoachMode))
  throw new Error('JEV_PLAYER_LANE_COACH must be off or advisory');
const laneCoachEnabled = laneCoachMode === 'advisory';
const rtAbilityPrefetchMinHpFraction=Number(process.env.JEV_PLAYER_RT_ABILITY_MIN_HP_FRACTION || 0);
if (!Number.isFinite(rtAbilityPrefetchMinHpFraction)
    ||rtAbilityPrefetchMinHpFraction<0||rtAbilityPrefetchMinHpFraction>0.95)
  throw new Error('JEV_PLAYER_RT_ABILITY_MIN_HP_FRACTION must be between 0 and 0.95');
const repeatedOverrideReleaseAfter = Number(process.env.JEV_PLAYER_REPEAT_OVERRIDE_RELEASE_AFTER || 0);
if (!Number.isInteger(repeatedOverrideReleaseAfter) || repeatedOverrideReleaseAfter < 0
    || repeatedOverrideReleaseAfter > 8)
  throw new Error('JEV_PLAYER_REPEAT_OVERRIDE_RELEASE_AFTER must be an integer from 0 to 8');
const supervisorVersion = [
  PLAYER_SUPERVISOR_VERSION,
  repeatedOverrideReleaseAfter ? `repeat-choice-release-${repeatedOverrideReleaseAfter}` : null,
].filter(Boolean).join('-');
const hybridProvider = decisionProvider === 'hybrid' ? createJevLocalFallback({
  askJev, askLocal:askLocalChoice,
}) : null;
const runId = `jev-player-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`;
const root = path.resolve(new URL('..', import.meta.url).pathname);
const codeHashes = captureJevPlayerCodeHashes(root);
const dir = path.join(root, 'public/live/jev-player', runId);
fs.mkdirSync(dir, { recursive: true });
const logPath = path.join(dir, 'events.jsonl');
const manifestPath = path.join(dir, 'manifest.json');
const started = Date.now();
const progressObserver = new JevProgressObserver({ startedAt:started });
let latestProgress = null;
const letters = randomUUID().replace(/[^a-f]/g, '').replaceAll('a', 'm').replaceAll('b', 'n').replaceAll('c', 'o').replaceAll('d', 'p').replaceAll('e', 'q').replaceAll('f', 'r');
const name = `Jev${letters.slice(0, 10)}`;
const user = `jev_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
const pass = `JevPlayer-${randomUUID().slice(0, 12)}!`;
const session = new WireSession({ user, pass, char: name, race: 'human', guild: guildId, bot: false });
const selectedStatPolicy = jevStatPolicy(process.env.JEV_PLAYER_STAT_POLICY || 'physical-combat-v1');
const statAllocation = selectedStatPolicy.allocation;
const testBoost = Math.max(1, Math.min(20, Math.floor(Number(process.env.JEV_PLAYER_TEST_BOOST) || 1)));
const isolatedOrigin = /^http:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i
  .test(String(process.env.DR_HTTP_ORIGIN || ''));
if (testBoost > 1 && !isolatedOrigin)
  throw new Error('Jev test boost is allowed only against a loopback isolated world');
const comparisonId = process.env.JEV_PLAYER_COMPARISON_ID || null;
const saleItemCounts = new Map();
const purchasedItems = new Set();
const learnedAbilities = new Set();
const bundledItems = new Set();
const skinnedCorpseCounts = new Map();
const log = event => fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
const manifest = { schema: 'dragonrealms.jev-realtime-player/2', runId, status: 'starting',
  policyVersion: PLAYER_POLICY_VERSION,
  supervisorVersion,
  repeatedOverrideReleaseAfter,rtAbilityPrefetchMinHpFraction,
  startedAt: new Date(started).toISOString(), durationMinutes: minutes, identity: { char: name },
  targetCircle,
  connection: 'ordinary websocket player', provider:decisionProvider,
  model:decisionProvider === 'local' ? localModel
    : decisionProvider === 'hybrid' ? `jev-1.13.0 + ${localModel}` : 'jev-1.13.0',
  localBackend:decisionProvider !== 'jev' ? {protocol:localProtocol,model:localModel,baseUrl:localBaseUrl} : null,
  primaryProvider:decisionProvider === 'hybrid' ? 'jev-1.13.0' : null,
  localFallbackDecisions:0, jevPrimaryDisabled:false,
  decisions: 0, jevDecisions:0, localDecisions:0, commands: 0, kills: 0,
  race:'human', guild:guildId, codeHashes,
  roundtimeDecisionSkips: 0, combatActionWindows: 0, rtLegalChoiceCalls: 0,
  supervisorOverrides: 0, staleRoundtimeActionSkips:0,
  stalledChoicePassThroughs:0,
  repeatedOverridePassThroughs:0,
  rtAbilityPrefetchRequests:0,rtAbilityPrefetches:0,rtAbilityPrefetchExecutions:0,
  rtAbilityPrefetchCancellations:0,rtAbilityRoundtimeDeferrals:0,
  laneCoach:{mode:laneCoachMode,version:'jev-lane-coach-v2-rank-and-mindstate-progress',decisions:0,
    gateMappedChoices:0,switchesAwayFromOpenCommitment:0,
    observedRankAdvances:0,observedLearningMindstateAdvances:0,
    stalledDecisionPrompts:0,preservedProviderChoices:0},
  fallbackCommands: 0, fallbackDecisions: 0, discardedDecisions: 0,
  jevServiceRetries: 0, jevFailureStreak:0, jevBackoffCount:0,
  jevLastBackoffSeconds:0, jevCircuitBreaks:0, noAlternativeWaits: 0, errors: [], pid: process.pid,
  progression: { startingCircle:1, highestCircle:1, circleMilestones:[], targetReached:false },
  comparisonId, statPolicy:selectedStatPolicy.name, statAllocation,
  experienceBoost:testBoost,
  progressionMode:testBoost > 1 ? 'accelerated disposable-world diagnostic; not natural progression' : 'natural speed',
  dashboard: `/jev-player.html?run=${runId}` };
const save = () => {
  manifest.updatedAt = new Date().toISOString();
  manifest.vitals = {...session.vitals, rt:session.roundtimeLeftNow()};
  manifest.progression.currentCircle = session.vitals.circle || 1;
  manifest.progression.unmetRequirements = (session.vitals.requirements?.rows || [])
    .filter(row => Number(row.have) < Number(row.need)).length;
  manifest.tradeLedger = [...saleItemCounts].map(([item,count])=>({item,count}));
  manifest.bundledItems = [...bundledItems];
  manifest.purchasedItems = [...purchasedItems];
  manifest.learnedAbilities = [...learnedAbilities];
  manifest.quest = session.vitals.quest || null;
  if (latestProgress) manifest.progression.evidence = latestProgress;
  fs.writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + '\n');
  fs.renameSync(`${manifestPath}.tmp`, manifestPath);
};
save();
const latestPath = path.join(root, 'public/live/jev-player/latest.json');
const latestTempPath = `${latestPath}.${runId}.tmp`;
try {
  fs.writeFileSync(latestTempPath, JSON.stringify({ runId, manifest: `/live/jev-player/${runId}/manifest.json` }) + '\n');
  fs.renameSync(latestTempPath, latestPath);
} catch (error) {
  try { fs.unlinkSync(latestTempPath); } catch {}
  manifest.status = 'failed';
  manifest.finishReason = 'startup-artifact-error';
  manifest.errors.push({provider:'runner-startup',message:error.message});
  save();
  throw error;
}

let entered = false, decisionBusy = false, done = false, overloadedFlag = false;
let nextDecisionAt = 0, tickTimer, stopTimer, lastRoomAt = 0, roomWaiter = null;
let jevFailureStreak = 0, jevBackoffUntil = 0;
let lastAssessmentAt = 0, escapeStartedAt = null, lastEscapeAttemptAt = 0;
let tendRetryAfter = 0, tendRetryPart = '';
const skinningRetryUntil = new Map();
let weaponSwitchBlockedUntil = 0, brawlingLaneFocusUntil = 0;
let previousInCombat = false;
let combatStartDecisionPending = false;
const oncePerFightActions = new Set();
const combatActionCooldowns = new Map();
let blockedActionIds = new Set(), lastCommandActionId = null, lastCommandActionAt = 0;
let lastCommandLine=null,lastCommandProviderChoice=null,pendingCombatAction=null;
let laneCommitment = null;
const combatEvidence = new CombatEvidence();
const recent = [];
const actionMemory = [];
async function send(line, reason = 'jev') { if (done) return; lastCommandLine=line; manifest.commands++; log({ type: 'command', line, reason }); save(); trackMove(session, line); await session.cmd(line); }

function rememberAction(entry) {
  actionMemory.push({ at:new Date().toISOString(), ...entry });
  if (actionMemory.length > 12) actionMemory.shift();
}

async function walkTo(targetRoom, goalId) {
  for (let hop = 0; hop < 32; hop++) {
    if (done || session.vitals.inCombat) return { ok:false, reason:'combat-or-run-ended' };
    const from = session.vitals.room;
    if (from === targetRoom) return { ok:true, hops:hop };
    const route = shortestRoomPath(from, targetRoom);
    if (!route?.length) return { ok:false, reason:'no-known-route' };
    const next = route[0];
    const exitNames = new Set((session.lastRoom?.exits || []).map(x => String(x).toLowerCase()));
    const longDir = ({n:'north',ne:'northeast',e:'east',se:'southeast',s:'south',sw:'southwest',w:'west',nw:'northwest',d:'down',up:'up',out:'out'})[next.dir] || next.dir;
    if (exitNames.size && !exitNames.has(longDir)) return { ok:false, reason:`route-exit-not-observed:${longDir}` };
    const changed = new Promise(resolve => {
      const timer = setTimeout(() => {
        if (roomWaiter?.from === from) roomWaiter = null;
        resolve(false);
      }, 2500);
      roomWaiter = { from, resolve(value) { clearTimeout(timer); roomWaiter = null; resolve(value); } };
    });
    await send(next.dir, `jev-goal:${goalId}`);
    const arrived = await changed;
    if (!arrived || session.vitals.room === from) return { ok:false, reason:`movement-unconfirmed:${longDir}` };
    log({ type:'navigation-step', goal:goalId, from, to:session.vitals.room, direction:longDir, remaining:route.length-1 });
    if (session.vitals.inCombat) return { ok:false, reason:'combat-started' };
  }
  return { ok:false, reason:'navigation-hop-cap' };
}

const action = async ({ state, options }) => {
  if (decisionBusy || done || !options.length) return;
  decisionBusy = true;
  try {
    const laneCoach=laneCoachEnabled
      ? buildLaneCoachContext(state,options,laneCommitment,Date.now()) : null;
    if (laneCoach) state.laneCoach=laneCoach;
    const questions = playerGoalQuestions(options);
    let answers = null, elapsedMs = null, providerError = null, activeProvider = decisionProvider;
    try {
      let result, primaryError = null;
      if (decisionProvider === 'hybrid') {
        const skipPrimary = Date.now() < jevBackoffUntil || hybridProvider.isPrimaryCircuitOpen();
        activeProvider = skipPrimary ? 'local' : 'jev';
        const decision = await hybridProvider.choose(state, questions, {
          skipPrimary,
          jevOptions:{maxServiceRetries:1},
          localOptions:{baseUrl:localBaseUrl,model:localModel,protocol:localProtocol},
        });
        activeProvider = decision.provider;
        result = decision.result;
        primaryError = decision.primaryError || null;
      } else {
        result = decisionProvider === 'jev'
          ? await askJev(state, questions, {maxServiceRetries:1})
          : await askLocalChoice(state, questions, {baseUrl:localBaseUrl,model:localModel,protocol:localProtocol});
      }
      if (primaryError) {
        manifest.jevServiceRetries += Math.max(0,Number(primaryError.attempts || 1)-1);
        manifest.errors.push({provider:'jev',message:primaryError.message,status:primaryError.status});
        log({type:'jev-error',message:primaryError.message,attempts:primaryError.attempts || 1,
          status:primaryError.status,fallbackProvider:'local'});
        jevFailureStreak++;
        manifest.jevFailureStreak = jevFailureStreak;
        if (isPermanentJevClientError(primaryError.status)
            || jevFailureStreak >= JEV_MAX_CONSECUTIVE_FAILURES) {
          hybridProvider.openPrimaryCircuit();
          manifest.jevCircuitBreaks++;
          manifest.jevPrimaryDisabled = true;
          log({type:'jev-circuit-open',reason:isPermanentJevClientError(primaryError.status)
            ? 'permanent-client-error' : 'consecutive-failure-limit',status:primaryError.status,
          consecutiveFailures:jevFailureStreak,fallbackProvider:'local'});
        } else {
          const backoffSeconds = jevBackoffSeconds(jevFailureStreak);
          manifest.jevBackoffCount++;
          manifest.jevLastBackoffSeconds = backoffSeconds;
          jevBackoffUntil = Date.now() + backoffSeconds * 1000;
          log({type:'jev-provider-backoff',consecutiveFailures:jevFailureStreak,
            retryInSeconds:backoffSeconds,fallbackProvider:'local'});
        }
      }
      answers = result.answers; elapsedMs = result.elapsedMs;
      if (laneCoach) {
        manifest.laneCoach.decisions++;
        const providerChoice=answers?.next_action?.choice;
        const picked=recordLaneChoice(laneCoach,providerChoice);
        if (picked) {
          manifest.laneCoach.gateMappedChoices++;
          if (laneCoach.commitment && laneCoach.commitment.skill!==picked.skill)
            manifest.laneCoach.switchesAwayFromOpenCommitment++;
        }
        if (laneCoach.commitment?.rankAdvancedSinceLastDecision)
          manifest.laneCoach.observedRankAdvances++;
        if (laneCoach.commitment?.learningAdvancedSinceLastDecision)
          manifest.laneCoach.observedLearningMindstateAdvances++;
        if ((laneCoach.commitment?.secondsWithoutRankProgress || 0)>=400
            && (laneCoach.commitment?.secondsWithoutLearningProgress || 0)>=400)
          manifest.laneCoach.stalledDecisionPrompts++;
        laneCommitment=advanceLaneCommitment(laneCoach,laneCommitment,providerChoice,Date.now());
      }
      manifest.decisions++;
      if (activeProvider === 'jev') {
        manifest.jevDecisions++;
        jevFailureStreak = 0;
        jevBackoffUntil = 0;
        manifest.jevFailureStreak = 0;
        manifest.jevLastBackoffSeconds = 0;
      } else {
        manifest.localDecisions++;
        if (decisionProvider === 'hybrid') manifest.localFallbackDecisions++;
      }
      const retries = Math.max(0,Number(result.attempts || 1)-1);
      if (activeProvider === 'jev') manifest.jevServiceRetries += retries;
      log({type:`${activeProvider}-response`,state,questions,answers,model:result.model,
        elapsedMs,usage:result.usage || null,attempts:result.attempts || 1,retries,
        provider:activeProvider,providerMode:decisionProvider,
        fallbackFrom:primaryError ? 'jev' : null,primaryErrorStatus:primaryError?.status ?? null});
    } catch (error) {
      if (decisionProvider === 'hybrid'
          && (error.primaryError || hybridProvider.isPrimaryCircuitOpen() || Date.now() < jevBackoffUntil))
        activeProvider = 'local';
      providerError = error.message;
      if (error.primaryError && decisionProvider === 'hybrid') {
        const primaryError = error.primaryError;
        manifest.jevServiceRetries += Math.max(0,Number(primaryError.attempts || 1)-1);
        manifest.errors.push({provider:'jev',message:primaryError.message,status:primaryError.status});
        jevFailureStreak++;
        manifest.jevFailureStreak = jevFailureStreak;
        if (error.primaryCircuitOpen) {
          manifest.jevCircuitBreaks++;
          manifest.jevPrimaryDisabled = true;
        } else {
          const backoffSeconds = jevBackoffSeconds(jevFailureStreak);
          manifest.jevBackoffCount++;
          manifest.jevLastBackoffSeconds = backoffSeconds;
          jevBackoffUntil = Date.now() + backoffSeconds * 1000;
        }
      }
      manifest.errors.push({provider:activeProvider,message:error.message,status:error.status});
      log({type:`${activeProvider}-error`,message:error.message,attempts:error.attempts || 1,
        status:error.status,providerMode:decisionProvider});
      if (activeProvider === 'jev') {
        manifest.jevServiceRetries += Math.max(0,Number(error.attempts || 1)-1);
        jevFailureStreak++;
        manifest.jevFailureStreak = jevFailureStreak;
        if (isPermanentJevClientError(error.status)) {
          log({type:'jev-circuit-open',reason:'permanent-client-error',status:error.status,
            consecutiveFailures:jevFailureStreak});
          manifest.jevCircuitBreaks++;
          finish('failed');
          return;
        }
        if (jevFailureStreak >= JEV_MAX_CONSECUTIVE_FAILURES) {
          log({type:'jev-circuit-open',reason:'consecutive-failure-limit',
            consecutiveFailures:jevFailureStreak});
          manifest.jevCircuitBreaks++;
          finish('failed');
          return;
        }
        const backoffSeconds = jevBackoffSeconds(jevFailureStreak);
        manifest.jevBackoffCount++;
        manifest.jevLastBackoffSeconds = backoffSeconds;
        jevBackoffUntil = Date.now() + backoffSeconds * 1000;
        log({type:'jev-provider-backoff',consecutiveFailures:jevFailureStreak,
          retryInSeconds:backoffSeconds});
      }
    }
    const currentVitals = {...session.vitals, rt:session.roundtimeLeftNow()};
    if (done || !responseStillApplicable(state, currentVitals)) {
      manifest.discardedDecisions++; log({type:'discarded', reason:'state changed or run ended'}); return;
    }
    const combatNow = combatEvidence.snapshot();
    const recentLossOverride = sustainedCombatLoss(combatNow, session.vitals.maxhp);
    let selectedResult = superviseGoalAction(options, answers, {
      guild:guildId, inCombat:session.vitals.inCombat,
      hp:session.vitals.hp, maxHp:session.vitals.maxhp, silver:session.vitals.silver,
      quest:state.quest,
      skills:session.vitals.skills, wieldedWeaponSkill:session.vitals.wsp || 'brawling',
      requirements:session.vitals.requirements, learnedAbilities:[...learnedAbilities],
      purchasedItems:[...purchasedItems], sustainedDamage:recentLossOverride,
      trainingProgress:latestProgress, bleeding:session.vitals.bleeding || [],
      room:session.vitals.room,recentActions:actionMemory.slice(-8),
      repeatedOverrideReleaseAfter,
    });
    const emergency = session.vitals.inCombat && (session.vitals.hp / session.vitals.maxhp < 0.4 || recentLossOverride);
    const coachPreservation=preserveMappedChoice({context:laneCoach,options,
      choice:answers?.next_action?.choice,supervised:selectedResult,
      enabled:laneCoachEnabled,safetyOverride:emergency});
    selectedResult=coachPreservation.result;
    if (coachPreservation.preserved) manifest.laneCoach.preservedProviderChoices++;
    if (selectedResult?.overrideReason) manifest.supervisorOverrides++;
    if (selectedResult?.supervisorReleaseReason) manifest.repeatedOverridePassThroughs++;
    const stalledChoicePassThrough=isStalledChoicePassThrough(
      answers?.next_action?.choice,selectedResult,latestProgress);
    if (stalledChoicePassThrough) manifest.stalledChoicePassThroughs++;
    const selectedAction = selectedResult?.action;
    if (!providerError && !emergency && !selectedAction) {
      manifest.discardedDecisions++; log({type:'discarded',reason:'creature observation changed'}); return;
    }
    const selected = emergency
        ? { id:'emergency_flee', kind:'command', choice: 'emergency_flee', command: 'flee',
            risk: 'safety-override', emergencyReason:recentLossOverride?'sustained-net-damage':'critical-health', usedFallback: true }
      : providerError
        ? { id:'provider_error', kind:'wait', choice: 'provider_error', command:null, risk: 'low', usedFallback: true }
      : { ...selectedAction, choice: selectedAction.id, probability:selectedResult.probability, usedFallback: false };
    if (actionStaleDuringRoundtime(selected,currentVitals.rt,emergency)) {
      const retryAt=Date.now()+Math.max(100,Number(currentVitals.rt)*1000);
      if (selected.id?.startsWith('ability_') && currentVitals.inCombat && !emergency) {
        pendingCombatAction={id:selected.id,command:selected.command,room:state.room,
          providerChoice:answers?.next_action?.choice || null,retryAt:0,minHpFraction:0.75,
          createdAt:new Date().toISOString(),attempts:0};
        manifest.rtAbilityPrefetches++;
        nextDecisionAt=Date.now()+Math.max(100,Math.min(300,Number(currentVitals.rt||0)*1000));
        log({type:'rt-action-prefetched',id:selected.id,command:selected.command,
          room:state.room,roundtime:currentVitals.rt,
          providerChoice:answers?.next_action?.choice || null,
          reason:'provider-response-arrived-during-roundtime'});
        return;
      }
      nextDecisionAt=Math.max(nextDecisionAt,retryAt);
      manifest.staleRoundtimeActionSkips++;
      log({type:'stale-roundtime-choice',id:selected.id,command:selected.command,
        roundtime:currentVitals.rt,retryAfter:new Date(retryAt).toISOString(),
        providerChoice:answers?.next_action?.choice || null});
      return;
    }
    const actionScores = selectedResult?.probabilities || {};
    log({type:`${activeProvider}-decision`,provider:activeProvider,providerMode:decisionProvider,state,options,actionScores,selectedProbability:selected.probability,
      choiceConfidence:selected.confidence,
      providerChoice:answers?.next_action?.choice || null,
      supervisorOverride:selectedResult?.overrideReason || null,
      supervisorReleaseReason:selectedResult?.supervisorReleaseReason || null,
      stalledChoicePassThrough,
      laneCoachPreservedProviderChoice:coachPreservation.preserved,
      elapsedMs,providerError,...selected});
    if (selected.usedFallback) manifest.fallbackDecisions++;
    if (selected.usedFallback && selected.command) manifest.fallbackCommands++;
    if (selected.id?.startsWith('attack_') && JSON.stringify(state.creatures)!==JSON.stringify(session.lastContents?.creatures || [])) {
      manifest.discardedDecisions++; log({type:'discarded',reason:'visible creature set changed before attack'}); return;
    }
    log({type:'execution',command:selected.command,kind:selected.kind,
      source:selected.usedFallback?'bounded-safety-fallback':activeProvider});
    if (selected.kind === 'navigate') {
      const result = await walkTo(selected.targetRoom, selected.id);
      rememberAction({ id:selected.id, kind:'navigate', outcome:result.ok?'arrived':result.reason,
        from:state.room, to:session.vitals.room,
        providerChoice:answers?.next_action?.choice || null,
        overrideReason:selectedResult?.overrideReason || null });
      if (!result.ok) { blockedActionIds.add(selected.id); log({type:'navigation-ended',goal:selected.id,...result,room:session.vitals.room}); }
    } else if (selected.command) {
      lastCommandActionId = selected.id;
      lastCommandActionAt = Date.now();
      lastCommandProviderChoice=answers?.next_action?.choice || null;
      if (selected.id === 'berserk' || selected.id?.startsWith('ability_')) oncePerFightActions.add(selected.id);
      if (selected.id === 'analyze_flame') combatActionCooldowns.set(selected.id, Date.now()+5000);
      if (selected.id === 'disarm') combatActionCooldowns.set(selected.id, Date.now()+8000);
      if (selected.command === 'flee') {
        escapeStartedAt ??= Date.now();
        lastEscapeAttemptAt = Date.now();
      }
      await send(selected.command, selected.usedFallback ? 'bounded-safety-fallback' : `${activeProvider}:${selected.id}`);
      rememberAction({ id:selected.id, kind:selected.kind, command:selected.command, room:state.room,
        providerChoice:answers?.next_action?.choice || null,
        overrideReason:selectedResult?.overrideReason || null });
    } else {
      rememberAction({ id:selected.id, kind:selected.kind, outcome:'no-command', room:state.room,
        providerChoice:answers?.next_action?.choice || null,
        overrideReason:selectedResult?.overrideReason || null });
      log({type:'wait', reason: selected.usedFallback ? 'bounded-safety-fallback' : `${activeProvider}:${selected.choice}`});
    }
  } finally {
    decisionBusy = false;
    const combatFollowup = consumeCombatEntryFollowup(combatStartDecisionPending,session.vitals.inCombat);
    combatStartDecisionPending = combatFollowup.pending;
    if (combatFollowup.run) {
      nextDecisionAt = decisionProvider === 'hybrid' ? 0 : jevBackoffUntil;
      log({type:'combat-start-window-followup',roundtime:session.roundtimeLeftNow()});
      queueMicrotask(() => consider('immediate combat-start decision'));
    } else {
      const providerReadyAt = decisionProvider === 'hybrid' ? 0 : jevBackoffUntil;
      nextDecisionAt = Math.max(Date.now() + (session.vitals.inCombat ? 2000 : 3000),providerReadyAt);
    }
    save();
  }
};

const consider = plain => {
  if (!entered || done || !session.vitals.maxhp) return;
  if (Date.now() - started > minutes * 60000) return finish('time-cap');
  const v = {...session.vitals, rt:session.roundtimeLeftNow()};
  latestProgress = progressObserver.observe(v);
  if (targetCircleReached(v.circle,targetCircle)) {
    manifest.progression.targetReached = true;
    log({type:'campaign-target-reached',targetCircle,currentCircle:v.circle});
    save();
    return finish('target-circle-reached');
  }
  const combatEntry = combatEntryDecision({inCombat:v.inCombat,previousInCombat,decisionBusy});
  if (combatEntry.enteredCombat) {
    oncePerFightActions.clear(); combatActionCooldowns.clear();
    nextDecisionAt = 0;
  }
  if (!v.inCombat) { oncePerFightActions.clear(); combatActionCooldowns.clear(); }
  previousInCombat = v.inCombat;
  if (decisionBusy) { if (combatEntry.deferFollowup) combatStartDecisionPending = true; return; }
  if (v.restingFlag && !v.inCombat) { nextDecisionAt = Date.now()+3000; return; }
  if (escapeStartedAt !== null) {
    if (!v.inCombat) { escapeStartedAt = null; lastEscapeAttemptAt = 0; log({type:'escape-confirmed',room:v.room}); }
    else {
      const escapeDeadline = Math.max(30000, (v.rt + 10) * 1000);
      if (Date.now()-escapeStartedAt > escapeDeadline) return finish('escape-unconfirmed');
      // RT can be refreshed by every enemy hit. Never let a blocked flee
      // become permanently queued behind RT; retry at a bounded cadence.
      if (Date.now()-lastEscapeAttemptAt < 2500) { nextDecisionAt = Date.now()+500; return; }
      lastEscapeAttemptAt = Date.now();
      nextDecisionAt = Date.now()+2500;
      void send('flee','escape-retry'); return;
    }
  }
  const combatNow = v.inCombat ? combatEvidence.snapshot() : null;
  const recentLossOverride = sustainedCombatLoss(combatNow, v.maxhp);
  const emergency = v.inCombat && (v.hp / v.maxhp < 0.4 || recentLossOverride);
  const analyzeReady = v.inCombat && v.guild === 'barbarian'
    && Date.now() >= (combatActionCooldowns.get('analyze_flame') || 0);
  const prefetchableAbilities=[...learnedAbilities].filter(abilityId=>canPrefetchBarbarianAbility({
    guild:guildId,inCombat:v.inCombat,rt:v.rt,abilityId,
    learnedAbilities:[...learnedAbilities],oncePerFightActions:[...oncePerFightActions],
    innerFire:v.innerFire,requirements:v.requirements?.rows || [],
    hp:v.hp,maxHp:v.maxhp,minHpFraction:rtAbilityPrefetchMinHpFraction,
  }));
  const prefetchableAbility=prefetchableAbilities.length>0;
  if (pendingCombatAction) {
    const abilityId=pendingCombatAction.id.slice('ability_'.length);
    const cost=({dragon:20,tenacity:25,serenity:20})[abilityId] || 0;
    const actionStillRelevant=guildId==='barbarian'&&learnedAbilities.has(abilityId)
      &&abilityAdvancesOpenRequirement(abilityId,v.requirements?.rows || [])
      &&Number(v.innerFire || 0)>=cost;
    const pendingStatus=prefetchedCombatActionStatus(pendingCombatAction,{
      inCombat:v.inCombat,room:v.room,hp:v.hp,maxHp:v.maxhp,rt:v.rt,actionStillRelevant,
    });
    if (pendingStatus==='cancel') {
      log({type:'rt-action-prefetch-cancelled',id:pendingCombatAction.id,
        reason:!v.inCombat?'combat-ended':pendingCombatAction.room!==v.room?'room-changed'
          :!actionStillRelevant?'gate-or-resource-no-longer-open':'health-safety-bound'});
      pendingCombatAction=null; manifest.rtAbilityPrefetchCancellations++;
    } else if (pendingStatus==='wait') {
      nextDecisionAt=Date.now()+Math.max(100,Math.min(300,Number(v.rt||0)*1000));
      return;
    } else if (pendingStatus==='execute' && emergency) {
      log({type:'rt-action-prefetch-cancelled',id:pendingCombatAction.id,reason:'combat-safety-override'});
      pendingCombatAction=null; manifest.rtAbilityPrefetchCancellations++;
    } else if (pendingStatus==='execute' && !emergency) {
      const pending=pendingCombatAction; pendingCombatAction=null;
      oncePerFightActions.add(pending.id);
      lastCommandActionId=pending.id; lastCommandActionAt=Date.now();
      lastCommandProviderChoice=pending.providerChoice || null;
      rememberAction({id:pending.id,kind:'command',command:pending.command,room:v.room,
        outcome:'prefetched-during-roundtime'});
      manifest.rtAbilityPrefetchExecutions++;
      log({type:'rt-action-prefetch-executed',id:pending.id,command:pending.command,
        room:v.room,providerChoice:pending.providerChoice||null});
      nextDecisionAt=Date.now()+1000;
      void send(pending.command,`jev-rt-prefetch:${pending.id}`);
      save();
      return;
    }
  }
  if (deferTendCooldown(v, tendRetryPart, tendRetryAfter)) {
    nextDecisionAt = Math.max(nextDecisionAt, tendRetryAfter);
    return;
  }
  if (v.inCombat && v.rt > 0 && !emergency && !analyzeReady && !prefetchableAbility) {
    // During RT, wait/flee may be the only useful decisions; resume early
    // enough to catch an RT-free action or a ready RT-legal combat choice.
    manifest.roundtimeDecisionSkips++;
    nextDecisionAt = Date.now() + Math.max(100, Math.min(750, v.rt * 1000));
    return;
  }
  if (emergency) nextDecisionAt = 0;
  if (!emergency && decisionProvider !== 'hybrid' && Date.now() < jevBackoffUntil) {
    nextDecisionAt = jevBackoffUntil;
    return;
  }
  if (!isDecisionDue({now:Date.now(),nextDecisionAt,enteredCombat:combatEntry.enteredCombat})) return;
  if (v.inCombat && v.rt <= 0) manifest.combatActionWindows++;
  if (analyzeReady && v.rt > 0) manifest.rtLegalChoiceCalls++;
  if (prefetchableAbility && v.rt > 0) manifest.rtAbilityPrefetchRequests++;
  if (brawlingLaneFocusUntil && !shouldHoldBrawlingLane(v.skills?.brawling,brawlingLaneFocusUntil)) {
    const reachedRank = (Number(v.skills?.brawling) || 0) >= 2;
    log({type:'brawling-lane-focus-ended',reason:reachedRank?'rank-target':'timeout',
      brawlingRank:Number(v.skills?.brawling) || 0});
    brawlingLaneFocusUntil = 0;
  }
  const room = session.lastRoom || { roomId: v.room, exits: [], contents: {} };
  const creatures = session.lastContents?.creatures || [];
  const lastAction = actionMemory.at(-1);
  const cooledActions = new Set([...blockedActionIds, ...oncePerFightActions]);
  if (tendRetryAfter > Date.now()) {
    const sameWoundOpen = (v.bleeding || []).some(wound =>
      String(wound).toLowerCase().startsWith(`${tendRetryPart} (`));
    if (sameWoundOpen) cooledActions.add('tend_wounds');
    else { tendRetryAfter = 0; tendRetryPart = ''; }
  } else if (tendRetryAfter) { tendRetryAfter = 0; tendRetryPart = ''; }
  for (const [id, until] of combatActionCooldowns) {
    if (Date.now() < until) cooledActions.add(id); else combatActionCooldowns.delete(id);
  }
  // Weapon skill lanes need time to teach. Without a dwell window Jev can
  // alternate wield commands every decision and spend the session switching
  // instead of landing useful training swings on either lane.
  if (Date.now() < weaponSwitchBlockedUntil
      || shouldHoldBrawlingLane(v.skills?.brawling,brawlingLaneFocusUntil))
    for (const id of purchasedItems) cooledActions.add(`wield_${id}`);
  if (lastAction?.id !== 'wait' && lastAction?.room === v.room && Date.now() - Date.parse(lastAction.at) < 6000)
    cooledActions.add(lastAction.id);
  const policyVitals = playerPolicyVitals(v, {purchasedItems,learnedAbilities,
    skinnedCorpseCounts:Object.fromEntries(skinnedCorpseCounts),
    skinningRetryUntil:Object.fromEntries(skinningRetryUntil),
    saleCounts:Object.fromEntries(saleItemCounts),bundledItems,overloaded:overloadedFlag,
    trainingProgress:latestProgress,
    brawlingLaneFocus:shouldHoldBrawlingLane(v.skills?.brawling,brawlingLaneFocusUntil)});
  const options = playerGoalOptions(policyVitals, room, creatures, [...cooledActions],
    {allowPrefetchedAbilities:prefetchableAbility});
  const priorityGuidance = ownedGearPriorityGuidance(options,v.requirements,v.inCombat);
  if (!needsJevChoice(options)) {
    nextDecisionAt = Date.now() + 10_000;
    manifest.noAlternativeWaits++;
    rememberAction({id:'wait',kind:'wait',outcome:'no-alternative-action',room:v.room});
    log({type:'wait',reason:'only-legal-action',retryInSeconds:10,room:v.room});
    return;
  }
  const state = { objective:playerObjective({...policyVitals,guild:guildId,goalCircle:targetCircle,
    recentActions:actionMemory.slice(-8)}), character:{guild:guildId,circle:v.circle}, room: v.room, hp: v.hp, maxHp: v.maxhp, stamina: v.stamina,
    restCeilingHp: Math.floor(v.maxhp*.8), recoveredForCombat: v.hp >= Math.floor(v.maxhp*.8),
    roundtime: v.rt, circle: v.circle, silver: v.silver, innerFire:v.innerFire,
    maxInnerFire:v.maxInnerFire, inCombat: v.inCombat,
    trainingProgress:latestProgress,
    quest:policyVitals.quest || null,
    skills: {...(v.skills || {})}, skillLearning:[...(v.skillLearning || [])], saleItems:[...saleItemCounts.keys()],
    saleCounts:Object.fromEntries(saleItemCounts),
    purchasedItems:[...purchasedItems], learnedAbilities:[...learnedAbilities], bundledItems:[...bundledItems],
    overloaded:overloadedFlag, wieldedWeaponSkill:v.wsp || 'brawling',
    equipment:Object.fromEntries(Object.entries(v.equipment || {}).map(([slot,items])=>[slot,items.map(item=>({...item}))])),
    armorWorn:Boolean(v.armorWorn), helmWorn:Boolean(v.helmWorn),
    priorityGuidance,
    requirements:v.requirements ? {circle:v.requirements.circle,rows:(v.requirements.rows || []).map(({label,have,need,eligible,hard})=>({label,have,need,eligible,hard}))} : null,
    bleeding: v.bleeding, skinningRetryUntil:Object.fromEntries(skinningRetryUntil), creatures, roomObservation: { id: room.roomId, exits: room.exits || [],
      npcs: room.contents?.npcs || [], items: room.contents?.items || [],
      players: room.contents?.players || [], description:room.msg || '' }, availableActions:options.map(({id,kind,description,targetRoom})=>({id,kind,description,targetRoom})),
    recent: recent.slice(-8), recentActions:actionMemory.slice(-8), prompt: String(plain || '').slice(-500) };
  state.combatEvidence = combatEvidence.snapshot();
  state.roomObservationAgeMs = Date.now()-lastRoomAt;
  if (v.inCombat && shouldAssessCombat({now:Date.now(),assessedAt:lastAssessmentAt})) {
    lastAssessmentAt = Date.now(); nextDecisionAt = Date.now()+500;
    void send('assess','refresh-combat-observation'); return;
  }
  if (!v.inCombat && shouldRefreshRoom({now:Date.now(),observedAt:lastRoomAt})) {
    nextDecisionAt = Date.now() + 1000;
    void send('look', 'refresh-observation'); return;
  }
  void action({ state, options }).catch(error => {
    manifest.errors.push({provider:'controller',message:error.message}); finish('failed');
  });
};

stopTimer = setTimeout(() => finish('time-cap'), minutes * 60000);
try { await session.httpLogin(); } catch (error) { manifest.errors.push({provider:'login',message:error.message}); finish('failed'); }
if (!done) {
session.connect({
  async onCharAlloc() {
    for (const [stat, amount] of Object.entries(statAllocation)) await session.cmd(`alloc ${stat} ${amount}`);
    await session.cmd('enter');
    log({type:'chargen-allocation',allocation:statAllocation});
  },
  onEnter() {
    entered = true;
    manifest.status = 'playing';
    log({ type: 'enter' });
    if (testBoost > 1) {
      session.sendObj({t:'boost',mult:testBoost});
      log({type:'isolated-world-experience-boost-requested',mult:testBoost});
    }
    save();
  },
  onError(message) { log({ type: 'server-error', message }); manifest.errors.push({ provider: 'server', message }); save(); },
  onFatal(message) { log({ type: 'fatal', message }); manifest.errors.push({ provider: 'session', message }); finish('failed'); },
  onReconnect(n) { log({ type: 'reconnect', count: n }); },
  onQuest(quest) { log({type:'quest-journal',quest}); save(); },
  onRoom(m, changed) {
    const v = session.vitals;
    session.lastContents = m.contents;
    session.lastRoom = m;
    lastRoomAt = Date.now();
    if (changed) { blockedActionIds.clear(); skinnedCorpseCounts.clear(); }
    const visibleCorpses = visibleCorpseCounts(m.msg || '');
    for (const [name, harvested] of skinnedCorpseCounts) {
      if (!visibleCorpses[name]) skinnedCorpseCounts.delete(name);
      else if (harvested > visibleCorpses[name]) skinnedCorpseCounts.set(name, visibleCorpses[name]);
    }
    if (changed && roomWaiter && roomWaiter.from !== m.roomId) roomWaiter.resolve(true);
    log({ type: 'room', room: m.roomId, exits: m.exits || [], creatures: m.contents?.creatures || [] });
    if (!entered || !v.room) return;
    if (escapeStartedAt !== null && !v.inCombat) { escapeStartedAt = null; lastEscapeAttemptAt = 0; log({type:'escape-confirmed',room:v.room}); }
    consider('Room observation updated.');
  },
  onPrompt(_m, plain) {
    lastCommandActionId = pendingCommandActionAfterPrompt(lastCommandActionId,lastCommandActionAt,Date.now());
    if (!lastCommandActionId) lastCommandActionAt = 0;
    combatEvidence.prompt(session.vitals);
    if (session.vitals.circle > manifest.progression.highestCircle) {
      manifest.progression.highestCircle = session.vitals.circle;
      manifest.progression.circleMilestones.push({circle:session.vitals.circle,at:new Date().toISOString()});
      log({type:'circle-advanced',circle:session.vitals.circle});
      save();
    }
    log({ type: 'prompt', room: session.vitals.room, hp: session.vitals.hp, maxHp: session.vitals.maxhp, rt: session.vitals.rt, inCombat: session.vitals.inCombat });
    consider(plain);
  },
  onText(text) {
    combatEvidence.text(text);
    const action = lastCommandActionId;
    if (releaseDragonFormLock(oncePerFightActions, text, action)) {
      log({type:'timed-ability-ready',ability:'dragon',reason:/fades\./i.test(text)?'form-expired':'form-attempt-refused'});
    }
    const unaffordableLesson = blockUnaffordableTrainingAction(blockedActionIds, action, text);
    if (unaffordableLesson) {
      rememberAction({id:action,outcome:'unaffordable-training',room:session.vitals.room,
        requiredSilver:unaffordableLesson.requiredSilver,availableSilver:unaffordableLesson.availableSilver});
      log({type:'training-action-blocked',action,...unaffordableLesson,room:session.vitals.room,
        reason:'server-refused-insufficient-silver'});
      lastCommandActionId = null;
      lastCommandActionAt = 0;
    }
    if (/^You are overloaded! Drop, bundle, or sell something before you can walk\./i.test(text)) {
      overloadedFlag = true;
      log({type:'burden-warning',room:session.vitals.room,action:lastCommandActionId});
    }
    if (/^You fold and tie\b/i.test(text) && lastCommandActionId?.startsWith('bundle_')) {
      const item = lastCommandActionId.slice('bundle_'.length);
      bundledItems.add(item);
      overloadedFlag = false;
      log({type:'loot-bundled',item,quantity:saleItemCounts.get(item)||1});
      save();
    }
    if (/^You equip\b/i.test(text) && lastCommandActionId?.startsWith('wield_')) {
      weaponSwitchBlockedUntil = Date.now() + 120_000;
      log({type:'weapon-lane-dwell',item:lastCommandActionId.slice('wield_'.length),
        seconds:120,until:new Date(weaponSwitchBlockedUntil).toISOString()});
    }
    if (/^You remove\b/i.test(text) && lastCommandActionId === 'practice_brawling') {
      weaponSwitchBlockedUntil = Date.now() + 120_000;
      log({type:'weapon-lane-dwell',item:'brawling',seconds:120,
        until:new Date(weaponSwitchBlockedUntil).toISOString()});
      brawlingLaneFocusUntil = Date.now() + 12 * 60_000;
      log({type:'brawling-lane-focus',targetRank:2,seconds:720,
        until:new Date(brawlingLaneFocusUntil).toISOString()});
    }
    const botchedTend = /Your bandaging slips — the (.+?) wound bleeds worse now!/i.exec(text);
    if (botchedTend && lastCommandActionId === 'tend_wounds') {
      tendRetryPart = botchedTend[1].toLowerCase();
      tendRetryAfter = Date.now() + 180000;
      log({type:'tend-failed',part:tendRetryPart,retryAfter:new Date(tendRetryAfter).toISOString()});
      lastCommandActionId = null;
      lastCommandActionAt = 0;
    }
    const botchedSkin = /You fumble the cut and ruin your work on (?:a|an|the) (.+?) — it will take another careful attempt\./i.exec(text);
    if (botchedSkin && lastCommandActionId?.startsWith('skin_')) {
      const corpse = botchedSkin[1].trim().toLowerCase();
      const retryAfter = Date.now() + 20_000;
      skinningRetryUntil.set(corpse, retryAfter);
      log({type:'skinning-deferred',corpse,seconds:20,retryAfter:new Date(retryAfter).toISOString()});
    }
    if (/You focus on the rage within and master/i.test(text) && lastCommandActionId?.startsWith('learn_ability_')) {
      const id = lastCommandActionId.slice('learn_ability_'.length);
      learnedAbilities.add(id); log({type:'ability-learned',ability:id}); save();
    }
    if (/You settle down to rest|You settle into a bench by the hearth/i.test(text)) session.vitals.restingFlag = true;
    if (/You rise, feeling more yourself\./i.test(text)) session.vitals.restingFlag = false;
    recent.push(text.slice(0, 600)); if (recent.length > 12) recent.shift();
    log({ type: 'text', text: text.slice(0, 600) });
    const skinnedItems = skinnedItemIds(text, ITEMS);
    if (skinnedItems.length) {
      const creature = skinnedCreatureName(text);
      if (creature) skinnedCorpseCounts.set(creature, (skinnedCorpseCounts.get(creature) || 0) + 1);
      for (const itemId of skinnedItems)
        saleItemCounts.set(itemId,(saleItemCounts.get(itemId) || 0)+1);
      log({type:'loot-harvested',items:skinnedItems});
      save();
    }
    const soldQuantity = soldQuantityFromText(text);
    if (soldQuantity && lastCommandActionId?.startsWith('sell_')) {
      const item = lastCommandActionId.slice(5), quantity = soldQuantity;
      const left = (saleItemCounts.get(item) || 0)-quantity;
      if (left > 0) saleItemCounts.set(item,left); else saleItemCounts.delete(item);
      bundledItems.delete(item);
      overloadedFlag = false;
      log({type:'loot-sold',item,quantity,remaining:Math.max(0,left)}); lastCommandActionId = null; lastCommandActionAt = 0; save();
    }
    const openedBoxes = lastCommandActionId === 'unlock_strongbox' ? consumedStrongboxFromText(text) : 0;
    if (openedBoxes) {
      const left = Math.max(0,(saleItemCounts.get('strongbox') || 0)-openedBoxes);
      if (left) saleItemCounts.set('strongbox',left); else saleItemCounts.delete('strongbox');
      if (!left) overloadedFlag = false; // A move will re-confirm burden if other carried goods still block travel.
      log({type:'strongbox-consumed',count:openedBoxes,remaining:left,outcome:/springs open/i.test(text)?'opened':'jammed'});
      lastCommandActionId = null; lastCommandActionAt = 0; save();
    }
    if (/^You buy\b/i.test(text) && lastCommandActionId?.startsWith('buy_')) {
      const item = lastCommandActionId.slice(4); purchasedItems.add(item);
      log({type:'kit-purchased',item}); lastCommandActionId = null; lastCommandActionAt = 0; save();
    }
    if (/(?:falls to the ground and lies still|curls in on itself and lies still|crumples to the ground with a last gasp|unravels into wisps of cold mist|fades to nothing with a fading sigh|shudders, gears winding down, and lies still)/i.test(text)) {
      manifest.kills++; log({type:'creature-defeated',text:text.slice(0,300),room:session.vitals.room}); lastRoomAt = 0; save();
    }
    if (/You try to flee, but your foes block your path/i.test(text)) {
      log({type:'escape-blocked', room:session.vitals.room, hp:session.vitals.hp, rt:session.roundtimeLeftNow()});
      nextDecisionAt = Math.min(nextDecisionAt, Date.now()+500);
    }
    const roundtimeWait = /^You must wait (\d+) seconds? before you can do that/i.exec(text);
    if (roundtimeWait && lastCommandActionId) {
      const id = lastCommandActionId;
      const seconds = Number(roundtimeWait[1]);
      const retryAfter = Date.now() + seconds * 1000;
      // RT refusal is temporary, unlike an invalid exit or unavailable item.
      // Keep the action eligible after the server-reported delay instead of
      // blacklisting it until the character changes rooms.
      nextDecisionAt = Math.max(nextDecisionAt, retryAfter);
      if (id.startsWith('ability_') && lastCommandLine) {
        const priorAttempts=pendingCombatAction?.id===id?(pendingCombatAction.attempts||0):0;
        oncePerFightActions.delete(id);
        pendingCombatAction={id,command:lastCommandLine,room:session.vitals.room,
          providerChoice:pendingCombatAction?.providerChoice || lastCommandProviderChoice || null,
          retryAt:retryAfter,minHpFraction:0.75,
          createdAt:new Date().toISOString(),attempts:priorAttempts+1};
        manifest.rtAbilityRoundtimeDeferrals++;
        log({type:'rt-action-prefetch-deferred',id,command:lastCommandLine,
          seconds,retryAfter:new Date(retryAfter).toISOString(),attempts:priorAttempts+1});
      }
      rememberAction({id:'wait',outcome:'roundtime-wait',room:session.vitals.room});
      log({type:'action-deferred',id,reason:'roundtime',seconds,retryAfter:new Date(retryAfter).toISOString()});
      lastCommandActionId = null; lastCommandActionAt = 0;
    } else if (/^(You cannot go that way|Creatures block your path|You are overloaded|Go where)/i.test(text) && lastCommandActionId) {
      blockedActionIds.add(lastCommandActionId); rememberAction({id:lastCommandActionId,outcome:'refused',room:session.vitals.room});
      lastCommandActionId = null; lastCommandActionAt = 0;
    }
    if (/You awaken in the Temple|You have died/i.test(text)) finish('death');
  },
});
log({ type: 'start', char: name, user, origin: session.origin });
tickTimer = setInterval(() => { save(); consider('Periodic reassessment'); }, 1000);
}
function finish(reason) { if (done) return; done = true; clearTimeout(stopTimer); clearInterval(tickTimer); manifest.status = playerRunStatus(reason,manifest.progression.targetReached); manifest.finishedAt = new Date().toISOString(); manifest.finishReason = reason; save(); session.close(); console.log(JSON.stringify({ runId, status: manifest.status, reason, char: name, manifest: manifestPath, events: logPath, dashboard: `http://localhost:${process.env.DR_PORT || 3000}${manifest.dashboard}` })); }
process.on('SIGINT', () => finish('interrupted'));
process.on('SIGTERM', () => finish('terminated'));
