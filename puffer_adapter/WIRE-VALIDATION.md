# Remaining logged-in validation gate

The isolated-engine Circle 20 result is not evidence of live login/session
performance. Do not label it live play or silently replace this gate with
another accelerated direct-engine run.

## September 17 continuation after Jev investigation

Jev findings and the handoff are recorded in `documentation/JEV-RETROSPECTIVE.md`.
The next integration prerequisite is now reproducible:

```sh
node puffer_adapter/wire_smoke.mjs
```

This creates a temporary SQLite world bound to loopback on an ephemeral port,
using production HTTP/WebSocket handlers. It performs ordinary registration,
login, chargen, entry, prompt/requirement parsing, one `look` command and
disconnect. The observer is armed only after the received enter frame, and
disconnect must remain latched even if a cached prompt is presented afterward.
There is no bot URL flag, boost, debug endpoint, policy inference or optimizer.
The script uses game internals only to host/close its owned test world; observer
inputs come exclusively from the actual socket. Exact EXP remains null.

Receipt `public/live/puffer/puffer-wire-smoke-2026-09-17T17-27-11-685Z.json`
passed all seven checks. Initial fixture registration failed its username
length constraint; that failed receipt is preserved separately. Temporary DBs
were removed after shutdown. Receipts contain no auth frames or credentials.
They are directly served diagnostic artifacts, not training catalog entries or
Sims EXP-blip benchmarks. HTTP calls have three-second timeouts, the socket
phase has an eight-second deadline, and shutdown uses its bounded cleanup.

The input-side implementation has advanced to `CLIENT-OBSERVATION.md` and
`client_contract.mjs`: the isolated environment emits the new vector from the
same prompt/room/exp/inventory frames as the socket observer. The policy is
renamed `*_client_wire_v1`, so existing weights are incompatible by design.
This is not full transfer readiness: macro bodies still use private route,
equipment, and target state, and no new training or ordinary-session policy
run has been made. Exact within-rank EXP remains unknown.

## Existing seam and limitations

`scripts/lib/wire-session.mjs` registers/logs in over HTTP, selects/creates
characters over WebSocket, serializes inputs and tracks received vitals.
Its header says no bot flag, but its actual URL currently includes `?bot=1`.
Audit actual server behavior, not that stale comment, before reusing it.
Do not enable boosts. Use an explicitly isolated test server/database, never
the user's existing accounts or primary world DB.

The trained observation vector includes exact skill EXP fractions and pools,
all requirement deficits, economic features and episode progress. Establish
which can be reconstructed faithfully from ordinary wire messages. Missing
features are unknown, not zero. No GM endpoints or direct player reads may
fill gaps. If the normal client cannot observe required features, use an
explicit new observation contract and retrain; do not claim checkpoint parity.

The engine adapter's activity scripts also use global map knowledge, direct
player state and accelerated timers. Replace those dependencies with observed
exits, received vitals/roundtime and real waits, retaining typed activities.

## Evidence required

Implemented prerequisite: `wire_observation.mjs` parses ordinary prompts and
requirement rows into a separate versioned client-observation schema. Exact
skill EXP remains null. Its observer latches stops on stale prompts, disconnect,
invalid state, login/chargen, errors and manual stop. It has no send path and
is not yet connected to a model, socket, or dashboard. Real engine-generated
prompt contract tests cover circles 1–20 using temporary fixtures; these are
not earned milestones or live-play validation. Existing checkpoints are not
compatible with this new observation contract.

- Frozen checksum-verified model; no optimizer updates during validation.
- Genuine registration, chargen, entry and command dispatch on the wire.
- No skill, EXP, money, equipment, circle or timer boosts.
- Bounded duration/commands, disconnect/death/stale-observation stop behavior.
- Dashboard-visible manifest and structured, timestamped command/outcome data;
  credentials never enter public artifacts.
- Per-gate circle advancement confirmed by game output; no inferred leveling.
- Matched script control with the same observation access and resource caps.

## Known comparison problem to resolve first

Run `puffer-20260917-001646-917589` has five direct-engine PPO Circle 20
successes and a final frozen-weight audit. Its production-generated script
comparison stayed at Circle 1 in every seed, issuing exactly 38 commands
before exhausting simulated time. That suspicious uniform stall needs root
cause analysis and a functioning control before claiming script superiority.
The report's `all_resource_tests_complete` only means budgets were exhausted;
it does not establish a faithful or healthy baseline.

Follow-up diagnostic (2026-09-17 01:12 UTC): the received-prompt heartbeat
fix advances the same seed 7740620 beyond 38 to 61 commands, but is not a
complete repair. With caps of 500 commands, 10,000 simulated seconds and
5 wall seconds, the worker still ends at Circle 1 on simulated-time cap.
Interpreter state is `mode: room`, `depth: 1`, `pc: 188`, no pending matches
or retry; last command is `hunt`. The final output says no prey was found,
followed by an RT-5 prompt. Thus more prompt heartbeats do not repair this
room-wait stall. Next diagnostic must trace the generated script/interpreter
transition into room mode and its expected arrival event; do not treat the
heartbeat patch as a validated production control or rerun PPO to address it.
Receipt: `public/live/puffer/baseline-diagnostic-20260917-0112.jsonl`.
This bounded diagnostic is not a new matched performance cohort.

01:18 follow-up: found and repaired a client-interpreter retry defect:
every retried verb entered `room` wait, including non-movement `put hunt`.
Retries now restore the original wait (or advance a parked put), and the
outgoing-command tracker works with a supplied send callback. Focused tests
35/35 and full npm suite 565/565 passed. However, the identical diagnostic
caps now end at 51 commands in `match` wait, still Circle 1, gap 83, no death.
This proves the previous room-wait defect is fixed, NOT that the production
control is healthy. Investigate match timeout/event pumping next; do not
promote or claim script superiority. Receipt:
`public/live/puffer/baseline-diagnostic-20260917-0118.jsonl`.

01:25 follow-up: additional interpreter diagnostics identify the empty match
wait precisely: previous line `pause 5`, next line `put forage`, no matches
or match deadline, with saved retry mode `match`. A successful prose match
had jumped to a new branch without canceling the previous verb's retry; the
new branch's pause then resent the obsolete verb and restored a dead match
wait. A regression reproduces this event ordering. Matching a new branch
now cancels that superseded retry/pending verb. All 36 focused script and
production-engine tests pass; full-suite verification passed 566/566
(log `/tmp/dr-puffer-match-full.log`). No new performance cohort was launched and
baseline health after this repair remains unproven. Diagnostic receipt:
`public/live/puffer/baseline-diagnostic-20260917-0125.jsonl`.

01:33 verification: same seed and diagnostic caps now reach the 500-command
cap after 1,259.5 simulated seconds, rather than stalling for 10,000 seconds
at 38/61/51 commands. No death; still Circle 1 and gap 83. A real-engine
regression now guards this continued execution. Receipt:
`public/live/puffer/baseline-diagnostic-20260917-0133.jsonl`.
The two interpreter stalls are resolved on this fixture. This short test
does not establish a successful leveling control: next compare at the full
matched candidate command/time budgets, in a new artifact directory so the
historical invalid comparison remains intact. Do not modify rewards or
retrain merely to repair a script-control measurement problem.

01:53 source audit establishes the remaining structural limitation: generated
`hunt` has no exit instruction and loops to SCAN; `mega` calls it before
`circle`. In actual Sims, `race-guild-sweep.mjs` interrupts this hunting leg
for requirement-, purse-, and fallback-timer-triggered hall visits, refreshes
the training list, and starts the circle script explicitly. The isolated
wrapper omits these handoffs, so its single-cycle result is expected, not
evidence that PPO outperforms the complete script system. Generator metadata
and new comparison receipts now explicitly flag missing supervisor features
and `control_equivalent_to_sims: false`; regression tests pin the distinction.
Next implementation must reproduce observed-state handoff semantics, with
fresh test evidence of entering and leaving the training phase, before any
further full script-comparison run.

02:00 implementation: `hall_handoff.mjs` isolates the default Sims supervisor's
TDP probe/floor, requirement-ready, purse/helm-hold, and four-minute fallback
decision ordering behind explicit observation inputs. Tests cover missing
facts, combat exclusion, fresh-kill gating, exact timing boundaries, and low
TDP versus ready requirements. This is not wired into the worker yet; claim-due,
adaptive arena, rank-training-list refresh, and other supervisor branches are
not implemented. Next connect ordinary prompt/EXP/kill/hands observations to
this seam, route from the actual observed room, and prove hall entry/return
before launching any new full comparison. Existing behavior is unchanged.

02:06: `control_observer.mjs` now supplies that seam from ordinary room,
prompt, hands, kill prose, TDP balance and requirement prose frames. It
rejects stale/invalid/disconnected observations, consumes acknowledged kill
triggers, and retains parsed training targets rather than raw private text.
Six observer/decision tests pass. The observer is still opt-in groundwork,
not attached to the production worker; next add a separately labeled worker
mode that uses its handoff, regenerates hall routes from the observed room,
and validates entering/returning from guild training. No new run was launched.

02:13: opt-in `engine_script.mjs --hall-supervisor` now connects the observer
to an explicit hunt/hall phase switch, regenerates the hall route from the
observed room and filters received training targets against known skill IDs.
Baseline mode remains unchanged. Real-engine regression verifies a hall room
event and return to sewers_3, with no death or resource grants. However the
bounded diagnostic then stops at 204 commands in a fresh hunt prompt wait;
new interpreter instances do not inherit the last received prompt for the
supervisor heartbeat. Preserve that observed prompt across phase switches
before expanding any benchmark. This is still only a subset of the Sims
supervisor and receipts explicitly deny full equivalence.
Diagnostic: `public/live/puffer/hall-diagnostic-20260917-0213-fixed.jsonl`;
five focused integration/observer tests pass. Full-suite verification log:
`/tmp/dr-hall-full-tests.log` (575/575 pass).

02:23: phase restarts now inherit the last actually received prompt as a
cached, non-RT heartbeat only. It is not injected as a new command response.
Regression verifies no release before the one-second heartbeat and no stale
RT activation. The bounded isolated diagnostic now reaches 2,000 commands
after 3,869.8 simulated seconds, completing nine hall returns rather than
stalling at command 204. Circle 1, gap 75, no death: this proves continued
execution, not successful leveling or script superiority. Default baseline
mode is unchanged. Eight focused tests pass; full-suite log is
`/tmp/dr-hall-restart-tests.log` (576/576 pass).
Receipt: `public/live/puffer/hall-diagnostic-20260917-0223.jsonl`.
Next inspect why hall visits leave required ranks untrained before expanding
the matched comparison. The opt-in supervisor remains a limited subset of
Sims; no training, rewards, model deployment, or live characters were changed.

02:30: added explicit `engine_script.mjs --trace-commands` diagnostics for
the disposable isolated world only. Each command records at most 32 actual
reply frames; tracing is off by default. A deterministic regression compares
traced/untraced final state, command counts and simulated time.
Receipt: `public/live/puffer/hall-trace-20260917-0230.jsonl` (500-command cap).
The hall is executing training commands, not silently losing them: first
visit expertise and large_edged each cost 40 silver and make partial rank
progress; melee_mastery, inner_fire and parry are explicitly refused as
not teachable. Later requests are refused for insufficient silver (12/38/32
versus the 40-silver price). Thus zero whole ranks does not mean no command
execution. Repeated hall visits alone cannot close these field-skill gates.
Do not change game rules or rewards to hide this limitation. Next audit the
actual production variant's field/ability/gear coverage and match that named
variant, rather than silently calling this fixed-arena baseline the best Sims
script. No full comparison or trainer launched. Verification log:
`/tmp/dr-hall-trace-tests.log` (577/577 pass).

02:37 pass: exposed the tested hall supervisor as an explicit opt-in mode
through `recompare --hall-supervisor --launch`. Worker receipts must match
the requested mode. Default comparisons remain unchanged; the opt-in report
is labeled `limited_fixed_arena_hall_control`, never full Sims equivalence
or promotion eligible. Five Python boundary tests pass, including real-engine
hall return, flag propagation, invalid mode and cancellation.
Launched one detached bounded comparison:
`puffer-comparison-20260917-023918-537538`, parent
`puffer-20260917-001646-917589`, PID 89480. Five sequential workers, 120 wall
seconds each, target Circle 20, each seed's command/simulated-time budgets
matched to the frozen candidate. Parent contract/checksum verified; training
and watch locks held by the comparison. Manifest, log and records discovery
verified after launch. Results under `public/live/puffer/<run-id>/`, visible
from `/sims.html#puffer-runs`. This tests the repaired baseline's complete
bounded behavior, not an updated PPO model. Review saved results next wakeup;
do not overlap or modify its active contract.

02:44 review: comparison completed, all worker processes exited. Four
survivors hit command caps, with gaps 34/35/35/36 (previous limited control
43/44/44/44); fifth seed died at command 82 before any hall visit. No circle
milestones or promotion. Saved `review.md` in the comparison directory
records all requirement blockers and scope limitations. Parent checksum and
engine contract still match. No repeat launched. Next model-specific work:
diagnose the existing sampled seed 7740620 failure (Circle1, gap7, parry and
weapon diversity), with a bounded frozen trace before deciding any training
change; use new evaluation seeds after changes, not this diagnostic seed.

02:51 pass: frozen watch runner now supports explicit `--sampled` with the
same per-seed CPU generator as evaluation. Per-step records include the
pre-action observation, action probabilities from the same forward pass/draw,
and resulting requirement rows. Three policy-selection tests pass, including
exact 100-draw equivalence to the previous sampling expression. No optimizer
or reward change. Play now also holds the training lock to exclude trainers.
Launched diagnostic `puffer-play-20260917-025300-465658`, PID 90233, parent
`puffer-20260917-001646-917589`, known failure seed 7740620, sampled mode,
2048 activity cap, 300 wall-second cap, pace 0.1 seconds. Process, manifest,
log, first trace and live-play discovery verified. Visible at Sims/native
Watch but remains an isolated accelerated engine, not a server login or new
held-out result. Review completion next wakeup; do not modify active code.

02:58: sampled replay completed and exactly reproduced prior failure totals:
Circle1, gap7, 2048 activities, 23570 commands, 1186447 simulated seconds,
no death; frozen weights/checkpoint unchanged. Saved review in play directory.
1986 sword selections repeatedly attempt an unaffordable broadsword (572
silver versus 650) and return through recovery. Model probability stays above
0.93 in the stalled tail despite encoded affordability 0.88 and no sword.
Recovery separately wastes time pursuing 95% HP through 80%-capped rest.
Next model experiment should learn economy recovery from reachable off-policy
roll-in states using disjoint training seeds, keeping this engine/reward
contract unchanged. Do not hide the failure with a scripted action override.
No new experiment launched this review pass.

03:05 implementation groundwork: demonstration collection accepts an explicit
bounded sampled learner roll-in (0..256 activities), followed by the existing
requirement teacher. Only successful teacher suffixes are labeled; learner
actions are never relabeled as expert actions, the total episode horizon is
unchanged, and held-out seeds remain forbidden. Receipt fields separate
roll-in and teacher steps. Five focused roll-in/policy tests pass, covering
label provenance, bounds, cancellation, no teacher samples and held-out seed
rejection. This is not wired to the training CLI yet, so no production run or
checkpoint has changed. Next integrate opt-in warm-start collection with both
canonical and recovery demonstrations, and verify real-engine recovery before
launching a separately identified candidate. Existing imitation regression
log: `/tmp/dr-rollin-imitation-tests.log`.

03:12: trainer CLI now exposes opt-in `--demonstration-rollin-steps 0..256`,
requiring a compatible parent and the requirement teacher. It combines
canonical teacher trajectories on seeds 0..N-1 with successful recovery
suffixes on training seeds 100..100+N-1, checks unchanged roll-in weights,
and records separate sample counts/roll-in receipts. No held-out diagnostic
seed is used for training. Missing successful recovery data fails closed,
not silently back to the unchanged dataset. Default training is unchanged.
Verification: roll-in/policy/imitation tests at `/tmp/dr-rollin-cli-tests.log`;
new real-engine warm-start CLI integration at `/tmp/dr-rollin-integration.log`.
Ten focused/regression tests and the new real-engine warm-start integration
pass. The integration confirms canonical seed0 plus recovery seed100, retained
teacher suffixes and unchanged roll-in weights before updating a disposable
test checkpoint. No production candidate launched. Next expose this flag on
the detached `run.py` launcher (currently trainer CLI only), then use a bounded
Circle20 continuation with automatic fresh-seed frozen evaluation.

03:19: detached launcher now validates and forwards the recovery flag. Seven
launcher/roll-in/policy tests pass (including no-spawn invalid arguments).
Launched one bounded warm-start candidate `puffer-20260917-032035-329684`,
PID 92141, parent `puffer-20260917-001646-917589`: target20, eight canonical
teacher seeds 0..7 plus eight recovery seeds 100..107 after 64 sampled learner
activities, 100 class-balanced imitation epochs, at most 4096 PPO samples,
600 training wall seconds and 900 evaluation wall seconds. Reward, engine,
action space and parent checkpoint unchanged. Hypothesis: reachable recovery
examples reduce unaffordable-weapon selection without losing canonical
progression. Automatic evaluation uses new run-derived seeds >=1000, with
greedy/sampled candidate and parent plus scripted/random references; no
teacher intervenes in evaluation and no automatic deployment is authorized.
Process identity, manifest/log and discovery verified after launch. Results:
`public/live/puffer/puffer-20260917-032035-329684/`; `/puffer.html` dashboard.
Leave the active contract untouched and review durable results next wakeup.

03:42: candidate evaluation completed, trainer exited. Both greedy and sampled
candidate reached Circle20 5/5 with no deaths; all 190 intermediate candidate
milestones checked, weights unchanged during evaluation. Parent greedy 4/5;
parent sampled 5/5 on the same fresh five seeds. Imitation-only also 5/5 in
both modes and faster by median commands/simulated time than post-PPO.
Saved detailed `review.md` under the candidate. No automatic promotion or
production-script superiority claim. Next freeze candidate and imitation-only
for another disjoint five-seed comparison; known old failure remains a separate
regression test, not held-out validation. No new run launched this review pass.

03:49 groundwork: evaluator accepts a separate validation output ID and an
explicit held-out seed list. Original candidate manifest/evaluation are not
overwritten. Reservation rejects historical evaluation seeds, previously
reserved validation seeds, training-range seeds and existing output folders.
Unit test and Python syntax checks pass. Independent outputs record source
run, seeds and frozen-validation kind; interrupted/failed progress is labeled.
No validation launched yet. Next add the bounded lock-owning detached launcher
and a real-engine integration regression proving source artifacts remain
unchanged before using this API for the fresh Circle20 comparison.

03:56: fixed independent validation's imitation-checkpoint lookup to validate
against the original source directory, not the new output ID. Real-engine
warm-start plus cancelled-validation integration passes, proving source
manifest bytes unchanged and separate interruption status. Two focused tests
pass (`/tmp/dr-independent-validation-tests.log`). Added `validate.py` bounded
detached launcher with both worker locks, explicit five-seed range, signal/
deadline cancellation and separate logs/discovery. Syntax checked; launcher
tests remain before a production validation launch. No experiment launched.

04:03: three launcher/reservation tests pass: explicit cap/seed forwarding,
detached process, truthful unverified startup state, invalid bounds and busy
lock rejection. Launched `puffer-validation-20260917-040356-952218`, PID95491,
source `puffer-20260917-032035-329684`, five globally unused evaluation seeds
15000000..15000004, target20, existing 2048-activity horizon, 1200 wall-second
cap. Both worker locks held. Six modes (candidate greedy/sampled,
imitation-only greedy/sampled, rotation and random) share these seeds; no
training or teacher intervention. Process, manifest, process record, root-level
`.log` and records discovery verified. Output under
`public/live/puffer/puffer-validation-20260917-040356-952218/`, visible through
Sims/Puffer run discovery. Prior candidate evidence and checkpoints preserved.
Review saved completion next wakeup; do not overlap or change active code.

04:15: independent validation completed all30 episodes, process exited.
Candidate and imitation-only each reached20 on5/5 new seeds in both greedy
and sampled modes; no deaths/gaps, all intermediate requirement rows checked,
weights unchanged and zero updates. Across two disjoint five-seed sets each
mode now has10/10 completion. Imitation-only remains more efficient by median
commands/time; no evidence PPO adds value here. Saved validation review; no
deployment or production-script superiority claim. Next the known failure
seed7740620 is a separate regression replay, not another held-out result.

04:21: launched frozen sampled regression replay
`puffer-play-20260917-042200-703155`, PID96617, using the new candidate
`puffer-20260917-032035-329684` on known failure seed7740620. Same sampled
generator protocol, 2048-activity/300-wall-second caps, 0.1s pacing. Prior
failed replay remains intact for comparison. Process, manifest, log, trace
and live-play discovery verified; watchable through Sims/native Watch in the
isolated engine. No training, rewards or deployed characters changed. Review
saved outcome next wakeup; passing this seed adds regression evidence only.

04:27: regression replay completed Circle20 in385 activities,60741 commands,
541898 simulated seconds, gap0/no death; all19 rows at each intermediate
milestone verified and frozen integrity checks passed. Prior same-seed parent
stalled Circle1 after2048 activities. New trace uses19 sword selections versus
1986 previously, with earned-income and weapon-diversity activities. Saved
review; this known failure is not counted as another held-out seed. No new
run or deployment. Isolated reliability milestone is supported; next prioritize
dashboard provenance and remaining wire/production-supervisor compatibility,
not repeated training of the unchanged successful configuration.

04:33: dashboard provenance now distinguishes independent frozen validation
from training and labels known-seed replay as diagnostic rather than fresh
held-out evidence. Sims summary includes source/seeds; interrupted validations
are idle. Puffer rendering suppresses copied source optimizer counts/history
and training milestones for validation artifacts. Future validation manifests
record source updates separately and zero their own training counters; archived
evidence files remain untouched. Focused UI tests and syntax checks pass
(`/tmp/dr-provenance-tests.log`). No new training or deployment.

04:41 consolidation: full Node suite578/578 passes;16 Python guardrail,
roll-in and validation tests pass. Fixed a file-handle leak when validation
lock acquisition fails; rerun with ResourceWarning treated as error passes.
Validation test fixtures are excluded from dashboard discovery, with a
regression test; records republished without changing historical artifacts.
No active experiment, new training, rewards or deployment. Remaining work is
integration/provenance, not another unchanged Circle20 training repetition.

## Client-vector implementation, 2026-09-19

`client_contract.mjs` now parses ordinary `exp` and `inventory` command replies
and combines them with the prompt and room frames. `engine_circle.mjs` now emits
the policy vector from those same public frames. The vector covers vitals,
displayed skill ranks/learning/held pools, active requirement rows, visible kit
ownership/equipment and current room. Exact within-rank EXP remains null.
Scenario identity changed to `*_client_wire_v1`, so old privileged-feature
weights cannot be resumed accidentally. Details and limitations:
`puffer_adapter/CLIENT-OBSERVATION.md`.

Changed-module syntax checks and whitespace checks pass. No tests or training
were run in this continuation. The next substantial implementation is replacing
the macro wrappers' direct room/equipment/creature reads with decisions from
observed room, hands, prompt and command replies, then adding a wire runner for
the new action contract. Do not call this checkpoint transfer or begin a
Circle20 comparison yet.
