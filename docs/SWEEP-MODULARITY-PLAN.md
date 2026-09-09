> Archived planning note from the earlier sweep review. Timing and freeze references below describe that session, not an active restriction.

# SweepAgent god-class split plan — scripts/race-guild-sweep.mjs (2690 lines, read-only analysis)

Source of line numbers: `grep -n "^  \(async \)\?[name](" scripts/race-guild-sweep.mjs`
on branch muse/review-baseline. Each range runs to (next method start − 1).
DO NOT edit the source file while the 25-min benchmark A/B is live (~19:20 EDT);
same freeze covers scripts/lib/script-gen.mjs, data/guild-scripts.js, server/, data/.

## Ordering contract (applies to ALL seams)

test/no-send-breaker.test.mjs pins heartbeat() order by SOURCE SCAN:
`heartbeatBody()` slices from `  heartbeat() {` to the next `\n  name(` line and asserts
(1) the "no-send breaker" comment precedes `updateStallVerdict`, `'[rt-stall] `, `"[watchdog] parked"`
markers, (2) the exact condition
`if (this.runner && Date.now() - (this.lastSendAt || 0) > 90000 && !this.restarting)`,
(3) exactly ONE "no-send breaker" occurrence in the whole file.
Consequence: any extraction that moves breaker blocks into imported functions MUST keep
verbatim marker strings/comments in heartbeat() (thin delegating wrappers, one call site each),
or the test must be rewritten to import the new module — prefer wrappers so the test keeps passing
unchanged. Same hazard for early returns: dead-runner guard, hall trips, RT-stall, parked-watchdog
each `return` out of heartbeat(); reordering extracted calls re-creates the 2026-08-26 dfix wedge
(20+ min silence, "wedged" verdict, no recovery).

## Seam 1 — telemetry / progress / gap exports → scripts/lib/sweep-telemetry.mjs

Pure-ish formatters over vitals + counters. Safest seam; extract first.

| Method | Lines | this.* touched |
|---|---|---|
| progressLine | 1612–1620 | session.vitals, kills, circles, trains, deaths, fidelity, liveVerdict, startedAt |
| sampleLine | 1621–1630 | session.vitals, expRanks?, kills, liveVerdict (verify body) |
| captureStateChanges | 1631–1645 | stateChanges, lastTrackedState, session.vitals |
| requirementSnapshot | 1646–1676 | expRanks, session.vitals (skills/circle), requirementSplits |
| gapsLine | 1677–1754 | session.vitals.circleGaps/skills, expRanks, shortfallFirst, gapsSamples |
| expRateLine | 1755–1794 | expRateSamples, expRatePrevious, totalRanksAtFinish? |
| sampleGaps | 1795–1809 | gapsSamples, shortfallFirst/Last, appendLog |

Shape: `export function progressLine(agent) {...}` (take agent, not this) OR a
Telemetry mixin object. Callers: heartbeat/run-tick (30s sampler), finish() (1810–2039).
Ordering risk: NONE for heartbeat interlock — but sampleGaps/progressLine run on the 30s
interval in run(); keep them synchronous (they are) so extraction can't interleave with
finish()'s final flush. recordMilestone (459–470) + appendLog (452–458) STAY in core —
everything calls them.

## Seam 2 — script-upload / cycle management → scripts/lib/sweep-cycle.mjs

| Method | Lines | this.* touched |
|---|---|---|
| startCycle | 882–947 | runner, library, scriptBase, curName, lastSendAt (mega arm), session, getScript |
| walkBazaarEscape | 1098–1141 | escapePath, session (bfsPath/liveExits), runner, appendLog |
| restartCycle | 1142–1162 | restarting, runner, escapePath, regenerateFromHere |
| regenerateFromHere | 1163–1195 | session.vitals.room, escapePath, library, scriptBase, arena/arenaBand, killsAtVisit |
| regenerateScripts | 1196–1251 | library, scriptBase, trainList, trainOffset, variant, expRanks, session.vitals, guild |

State shared with Seam 3/4: `restarting` flag, `lastSendAt`, `escapePath`, `library`.
Ordering risks:
- startCycle arms `lastSendAt = Date.now()` for mega scripts (line ~887) and wires the
  runner's `send:` hook (line ~927 refreshes lastSendAt per send). If startCycle moves,
  the no-send breaker's 90s-silence signal depends on the moved code — keep the arming
  lines adjacent to runner creation, covered by breaker test assertion (2).
- restartCycle is called BY every breaker; it must remain re-entrancy-guarded via
  `restarting`. Extract as `requestRestart(agent)` with the guard inside, never split
  guard from body.
- onText (948–1097) STAYS in core for now: it touches kills/deaths/fidelity/expRanks/
  rtRefusalStreak/refusals/trainList/lastCircleBlockText/killsAtVisit/enteredAt/startedAt
  and calls restartCycle/regenerateScripts/finish — highest fan-out in the class, wrong
  first move.

## Seam 3 — rescue breakers / supervision → scripts/lib/sweep-rescue.mjs (LAST, riskiest)

| Method / block | Lines | this.* touched |
|---|---|---|
| supervise | 1252–1312 | session.vitals, lowHpSince, lastTendAt, lastRestCmdAt, lastFleeAt, restPct, restAnnounced, done, appendLog |
| updateStallVerdict | 1313–1348 | liveVerdict, lastLoggedVerdict, refusalTimes, swingTimes, roomChangedAt, lastProgressAt, lowHpSince, startedAt, kills, session.vitals |
| HB-1 no-send breaker | ~1351–1367 | runner, lastSendAt, restarting |
| HB-2 pending-escape exec | ~1369–1382 | runner, restarting, escapePath, session.vitals.room |
| HB-3 town-strand breaker | ~1384–1402 | runner, restarting, session.vitals (room/inCombat), lastRoomChangeAt |
| HB-4 flat-progress breaker | ~1404–1418 | runner, restarting, flatSince, lastProgressKey |
| HB-5 dead-runner restart guard | ~1432–1442 | runner, restarting, lastSendAt, library, scriptBase |
| HB-6 RT-stall breaker | ~1560–1580 | rtRefusalStreak, lastKillAt, enteredAt |
| HB-7 parked-90s watchdog + bazaar escape | ~1582–1611 | session.vitals.room, lastRoomChangeAt, stuckCount, escapePath, diskAdj |

Proposed shape: predicate/action pairs `export function checkNoSend(a) → 'fired'|null`
called IN ORDER from a heartbeat() that keeps its comments + early returns, e.g.
`// NO-SEND BREAKER — must run before every other branch…; if (checkNoSend(this)) return;`
so the source-scan test still finds exactly one "no-send breaker" string before the markers.
Ordering risks (load-bearing):
- HB-1 MUST stay first, unconditional on inCombat/refusals (test assertion 2). Any
  extraction that routes it behind updateStallVerdict or the dead-runner guard
  re-creates the measured wedge.
- HB-4 flat-progress must sit ABOVE the dead-runner early return: starving loops that
  keep sending (exp/look polling refreshes lastSendAt) never trip HB-1 — documented in
  run()'s 30s sampler (~2121) which keys on kills/ranks/room, not sends.
- HB-2 pending-escape must precede HB-3/HB-7: regenerateFromHere arms escapePath but
  only restartCycle walks it; without HB-2 the walk stays armed forever (champ run lszo).
- HB-6 nulling the runner raced the restart guard — fixed by routing through
  restartCycle() alone; keep that: extracted breakers call requestRestart(), never
  `this.runner = null` directly.
- supervise()'s lowHpSince tracking sits FIRST and unconditionally (latch fix, 2026-08
  audit); preserve position if moved.

## Seam 4 — hall-circle orchestration → scripts/lib/sweep-hall.mjs (with Seam 3)

No standalone methods — blocks inside heartbeat (~1443–1558) + trainList refresh.
Blocks: hall-at-hall shortcut, circle-readiness gate (gaps vs expRanks merge), TDP floor
skip + tdp-probe, readiness-gated hall trip (circleRequirements), fallback-timer trip
(regenerateScripts + startCycle circle). Touches: library, scriptBase, curName,
kills/killsAtVisit, lastHallAt, hallFallbackMs, hallEvery, skipCircle, trainList,
trainOffset, lastCircleBlockText, lastReadinessLogKey, variant.{tdpFloor,closeNth},
expRanks, session.vitals (room/circleGaps/skills/tdp/inCombat/circle).
Ordering risks: every hall block `return`s and sits ABOVE HB-6/HB-7 — a ready-gated
early return can starve RT-stall/parked watchdogs (dead-trigger audit: old 12-kill
threshold wedged runs). Extract as `checkHallTrip(a)` returning a tri-state
(fired/skipped/skip-silently-hunting) with the fallbackDue yield preserved, called
after HB-1..HB-4 and before HB-6/HB-7, same position as today. Navigation helpers
diskAdj (471), pureDiskPath (480–502), nearestSpawnRoom (518–565), candidateRooms
(598–620), topWeaponRank (566–580), roomTeachHeadroom (581–597) can follow into
scripts/lib/sweep-nav.mjs later — they only touch session/arena/variant and are
order-free; not counted in this split.

## Suggested order + verification

1. Seam 1 (telemetry, 7 methods) → 2. Seam 2 (cycle, 5 methods) →
   3. Seam 4 hall blocks → 4. Seam 3 breakers (2 methods + 7 blocks, last).
After each: `node --check` on touched files, `npx tap test/no-send-breaker.test.mjs`,
then full `npm test`. Never touch the 4 frozen paths while the A/B runs.
