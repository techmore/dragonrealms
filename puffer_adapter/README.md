# Dragon Realms × PufferLib

Real PuffeRL policy optimization against the real DR engine, with an independent
vanilla web monitor at **http://127.0.0.1:3000/puffer.html** (also linked in Admin).
The game server serves the monitor; the training engine does not require it.

## Current focus: Barbarian Circle 2

The ultimate objective is a learned Barbarian policy reliably reaching Circle 20.
Circle 2 remains the default experiment target, not completion of that goal.
`--target-circle 2..20` now selects the episode objective. Requirements advance
with earned circles; each intermediate milestone stores its real engine requirement
rows, commands and simulated time. Higher-target acceptance requires all intermediate
gates in order and the correct target-specific requirements. Source and target/reward
parameters must match before resuming or comparing a parent checkpoint.
`--time-cost-per-hour 0..1` is a separately configurable experiment (default zero).
Both skill snapshots are scored against the pre-action requirement gate, so opening
the next gate does not create an artificial reward penalty. The 2048-activity horizon
still applies; supporting a target does not prove that the existing activity scripts
or the learned policy can reach it within that budget.
The next stages require successful-script demonstrations, independently evaluated
RL refinement, progressively higher actual engine gates, and a matched production
script comparison. The present rotation control is not that production baseline.

The launcher and trainer now default to `--scenario barbarian`: a fresh
Gor'Tog Barbarian named **PufferBarbarian**, in the isolated real-engine world.
This is a new curriculum, not a relabeling or continuation of the historical
human Ranger runs (`--scenario circling`). No Barbarian result is inferred from
those runs, and “easier” remains a hypothesis rather than a measured conclusion.

The 12 typed activities are field medicine, stealth, Barbarian arts, dagger,
club, broadsword and staff combat, skinning/locks, rest/walking, performance,
study at the Academy, and visiting the Barbarian guild. There are no Ranger spell actions. Combat
scripts use analyze and trip; the arts activity additionally uses the actual
Barbarian roar (learned at the guild and issued on engagement before the first
automatic swing, without bypassing roundtime). Study supplies eligible lore;
the hard Tactics requirement cannot double-count as an Nth lore skill.
Equipment must be bought with earned silver at real shop prices;
an unaffordable weapon activity does not silently train a different lane.
Four distinct weapon skills and two armor categories (light armor/shield) are
available. Production `circleRequirements()` supplies all 19 current gate rows;
the adapter neither changes gates nor grants training resources.
Surplus disposable loot is dropped in the owned test world to prevent overload
(one strongbox is retained for lock practice); travel must reach the requested
location before location-specific activities execute.

The capped requirement-fraction reward, 2048-activity horizon and frozen
five-seed evaluation gate remain. A new policy is required; Ranger weights are
not compatible. The built-in rotation is only a curriculum control, **not** the
production Barbarian leveling script or a matched crowded-world Kaizen cohort.
Run training only when approved; changing this default does not start a process.

```sh
# After approval: one bounded candidate, never an automatic deployment
.puffer-venv/bin/python -m puffer_adapter.run --scenario barbarian --steps 4096 --seconds 600
node --test test/puffer-barbarian.test.mjs
```

## What this milestone proves

### Demonstrations before reinforcement learning (opt-in)

`--demonstration-teacher requirements` selects the requirement-aware curriculum
teacher instead of the default rotation. It funds missing gear using actual engine
item prices, trains supported deficient lanes, and requests a circle only when
the engine reports every gate satisfied. Unknown economic or requirement state
fails closed. This teacher is still distinct from the production leveling scripts.

Barbarian observations now include 13 bounded economic features: silver up to
1000, ownership of six kit items, and affordability of those items. Structured
telemetry exposes exact silver and prices. Equipment ownership includes worn and
wielded items. This changes the observation contract and requires fresh weights;
old checkpoints cannot be resumed as if the inputs were unchanged.

`--demonstration-episodes 8` on the launcher or trainer collects eight fresh
Barbarian training episodes (seeds 0..7), keeps only engine-verified successful
trajectories, and trains the policy with supervised cross-entropy before PuffeRL
updates. The teacher is explicitly **curriculum rotation with a guild visit when
requirements are satisfied**, not the production leveling script. This first
teacher establishes the demonstration-to-network path; it is not the final
Circle-20 teacher or evidence of superiority over scripts.

Demonstrations and imitation share the training wall-clock budget. Stop or budget
expiry aborts the phase without granting evaluation approval. Failed/dead/truncated
teacher episodes are not training examples; zero successful examples fails closed.
Training seeds are below 1000 and disjoint from the held-out evaluation seed range.
The private run directory stores `demonstrations.npz`; the public manifest records
its checksum, teacher source checksum, per-episode requirement/milestone evidence,
imitation update count, training-set accuracy and before/after weight fingerprints.
Training accuracy is not an evaluation success rate. Subsequent evaluation uses
the learned policy alone, with no teacher intervention.
New imitation runs also save a private `imitation.pt` checkpoint before PPO, with
checksum and weight fingerprint. Frozen evaluation tests this pre-RL checkpoint
in both greedy and sampled modes on the same seeds as the final PPO policy.
This adds ten diagnostic episodes and reveals whether RL improves or degrades
imitation performance. Older runs without this checkpoint cannot reconstruct it.
Neither pre-RL nor sampled results replace the final greedy promotion gate.

`--imitation-balanced` optionally uses inverse-frequency class weights for
demonstrated actions, so rare guild/weapon decisions do not disappear inside a
high average training accuracy. `--imitation-epochs 1..100` controls the bounded
supervised pass (default 30). Manifests report per-action example counts, training
accuracy and loss weights; missing action classes are explicitly unknown rather
than reported as perfect. These controls change supervised fitting, not game
rewards, and require a separately labeled experiment. Evaluation remains unweighted
real game performance, with no teacher intervention.

```sh
.puffer-venv/bin/python -m puffer_adapter.run --scenario barbarian --steps 4096 --seconds 600 --demonstration-episodes 8
.puffer-venv/bin/python -m unittest puffer_adapter.test_imitation
```

PufferLib collects observations/actions/rewards, computes advantages and PPO-style
losses, and updates a 64-unit PyTorch policy using Adam. Checkpoint SHA-256 values
and `weights_changed` verify parameter changes. Frozen-checkpoint evaluation runs
without optimizer updates. Neither changing weights nor increasing cumulative
reward proves an improvement: use the matched evaluation results.

The first scenario is **stationary human-ranger noncombat skill acquisition**.
It imports the actual Game, command dispatcher, skill pools and EXP conversion;
it is not a mock transcript or a rewritten game. Each subprocess owns a temporary
SQLite DB and every episode rolls back its character. It never connects to the
main server or touches existing accounts. Actions are fixed integer IDs:
look, forage, track, hunt, perform. No arbitrary command text is accepted.

One action advances ten real EXP pulse phases (200 simulated EXP seconds).
World timers are stopped. Combat, regeneration, weather, travel, buying armor,
circle requirements and live-wire latency are **not** modeled by this scenario.
Episodes truncate at 128 steps; truncation is not success. Do not compare this
throughput or reward directly to live-server leveling runs or existing Barbarian
scripts. Those require a separate matched broader environment experiment.

Reward v1 is **newly absorbed EXP / 10**, reconstructing completed-rank EXP so
rank rollover cannot erase progress. Pooled EXP is shown separately, never counted
twice. Rewards may be delayed from earlier actions. PufferLib clips rollout rewards
to [-1,1]; this scenario's expected per-step reward fits that range. There is no
reward for money, even leveling or circles yet. Keep those objectives versioned
when expanding the action/scenario coverage.

## Circling scenario (separate from the initial skilling scenario)

`--scenario circling` starts a fresh human ranger targeting **Circle 2** in
an owned temporary database. A deterministic clock executes the real game's
timer callbacks, including combat, roundtime, regeneration, EXP absorption and
rest. No ranks, EXP, silver, equipment or circle levels are granted by the adapter.
Initial stat points are spent using actual `alloc` commands (10 CON/STR/REF each).

The network chooses among nine bounded activities: field medicine, stealth,
magic, knife combat, unarmed combat, skinning/locks, rest/walking, performance,
and visiting the guild to request a circle. **Navigation and individual commands
are scripted**, not neural outputs. This is hierarchical reinforcement learning,
not an end-to-end command policy or evidence of beating the existing leveling scripts.
Equipment is purchased at normal prices, flee respects the game's pending-flee
roundtime mechanism, and only disposable gathered branches/sticks/pelts are dropped
in this private world. Nothing connects to a live character.

Reward version `circle2-absorbed-fraction/2` is 0.25 times newly completed
fractions of the actual Circle-2 requirements, counting integer rank plus
absorbed EXP divided by the next-rank EXP cost, plus 1 for an earned circle
(clipped to 1 per activity); death is -1. Nth-skill rows use the Nth highest
fractional rank among the engine's eligible skills. Pooled EXP is excluded.
This replaces the original integer-rank-only signal; real circling still
requires the production integer-rank gates. This reward-only experiment keeps
the observations, nine activities, starting character and PPO settings unchanged.
Old reward-version checkpoints cannot be resumed under the new source contract;
use a fresh policy and judge new matched evaluations, not historical raw rewards.
Each requirement's contribution stops at its target, so excess ranks cannot farm
that reward. Total EXP is telemetry, not an additional reward. Episodes stop on
death, earned Circle 2, or 2048 activities. Activities take variable simulated time;
compare both activity count and simulated seconds, not wall-clock speed alone.

`max_circle` and timestamped `circle_milestones` survive episode resets in the run
manifest. They are training-rollout evidence; only held-out frozen-policy evaluation
establishes checkpoint performance. A scripted feasibility probe is labelled as
such and is never a learned-policy milestone. Circling evaluation never authorizes
deployment automatically, even when every test reaches Circle 2.

```sh
.puffer-venv/bin/python -m puffer_adapter.run --scenario circling --steps 4096 --seconds 300
node --test test/puffer-circle.test.mjs
```

The skilling scenario's five-skill EXP promotion gate and 128-step horizon do not
apply to circling. The two scenarios have different observation/action contracts;
do not resume a skilling checkpoint into circling.

## Install (Mac CPU)

Requires Node 22+, Python 3.11, `uv`, Git and Xcode command-line C++ tools.
From the repository root:

```sh
sh puffer_adapter/setup.sh
```

This creates `.puffer-venv/`; no Node dependencies are added. PufferLib is pinned
to upstream `3b5c6046bb8b46685d62d151720025507e3418c2` (3.0 branch), the PyTorch
trainer compatible with CPU. The newer 5.0 native CUDA trainer is not used.
`pufferlib-no-ocean.patch` fixes one uninitialized build variable when skipping
bundled Ocean environments; it does not change training code. Puffer's import-time
resources symlink is contained in `.puffer-runtime/`.

No W&B/Neptune logger is enabled and no metrics, credentials, chat or transcripts
are uploaded. Public metrics contain only synthetic-character training data.
Checkpoints and optimizer state stay in `.puffer-runtime/<run-id>/`.

## Run, inspect, stop

```sh
.puffer-venv/bin/python -m puffer_adapter.run --steps 16384 --seconds 300
# Continue learned policy weights with the SAME game/reward contract:
.puffer-venv/bin/python -m puffer_adapter.run --resume RUN_ID --steps 16384 --seconds 300
# Use the emitted run ID:
.puffer-venv/bin/python -m puffer_adapter.run --stop RUN_ID
.puffer-venv/bin/python -m puffer_adapter.evaluate RUN_ID --episodes 5
```

Runs are detached, bounded by both steps and elapsed time, with durable logs in
`public/live/puffer/<run-id>/`. The time bound is checked between 128-step batches;
`--seconds` bounds training. Frozen evaluation receives a separate
`--evaluation-seconds` budget (default 3600, allowed 1..3600), starting only when
evaluation begins. Thus a 600-second training cap plus the default evaluation
cap permits up to roughly 70 minutes overall, with bounded action/batch overrun.
The manifest records both budgets. This fixes the former shared deadline that
could interrupt evaluation before candidate/parent comparisons finished.
an individual pipe operation has a 15-second heartbeat timeout. SIGTERM requests a
graceful stop after the current batch, saves a checkpoint, and closes all engines.
No automatic restart or unlimited training is installed.

### Guarded improvement

The launcher now automatically evaluates each normally completed candidate on
five fresh reproducible seeds, against the simple rotation baseline and (when
continuing) its parent checkpoint. The character still resets between episodes.
`--resume` is a policy warm-start: optimizer moments, rollout state and learning-rate
schedule start fresh. It does not claim bit-for-bit continuation. Parent and child
remain separate immutable model files with their lineage recorded in manifests.

Compatibility hashes cover the actual engine, server/data sources and observation
wrapper. Checkpoint checksums and path containment are verified before loading.
Old runs without those records are deliberately ineligible for continuation; start
a new verified run. Only one monitored training process may run at a time.

The promotion gate requires strictly better mean EXP than every reference, no
per-seed total-EXP or weakest-skill regression, matched horizons, finite metrics,
and no deaths. Missing evidence, interrupted evaluation, a changed engine, or a
plateau fails closed. These are conservative small-sample checks, not statistical
proof. The weakest skill is the minimum absorbed EXP across the scenario's five
observed skills, not a claim about full circle requirements. Repeating `track`
while neglecting other skills is therefore rejected even if total EXP rises.

Passing produces **approval_required**, not deployment. Failing produces **rejected**.
No preferred model pointer, live deployment, reward rewriting, action expansion,
automatic retries, schedule or next run is enabled. One launch means one bounded
candidate and its evaluation, then stop. Evaluation checks the same wall-clock
deadline and stop request between actions. The dashboard shows parent, continuation
mode, evaluation state and promotion reasons. This is the safe foundation for a
future multi-candidate curriculum—not an unrestricted self-modifying agent.

`manifest.json` describes status, configuration, environment limits, checksums,
and metrics; `metrics.jsonl` preserves timestamped updates. `latest.json` feeds the
web monitor. The UI is read-only; stop via the command above. Completed results
remain visible when no training process is running. EXP/circle describe the current
episode character, not a single permanent character; cumulative reward spans episodes.

Evaluation compares frozen greedy and seeded categorical-sampled checkpoints,
a simple scripted activity rotation, and uniform random actions on identical held-out seeds.
When a parent exists, both its greedy and sampled decisions are tested too.
Each sampled episode uses a separate CPU Torch generator seeded with that episode's
environment seed; sampling does not alter global RNG state. Candidate and parent
weights are fingerprinted before and after evaluation. Sampled results are diagnostic
and cannot substitute for the greedy evidence required by the existing promotion gate.
There are 20 evaluation episodes without a parent and 30 with one (five per mode).
This
is an integration baseline, **not your existing full leveling-script benchmark**.
Results are written to `evaluation.json` and summarized on the monitor.
New evaluations also save `evaluation-progress.json` after each completed episode
and approximately every five seconds between actions. It includes the current
policy/seed, action counts, requirement gap, command attempts and simulated time;
completed rows retain requirement evidence. Interrupted comparisons keep partial
evidence but never become a passing evaluation. These heartbeats refresh the
trainer's monitor timestamp without changing any model weights or reward rules.

## Activity and records banner

### Production-script comparison work

`python -m puffer_adapter.probe_progression --target-circle 20 --seconds 300`
launches a separate bounded requirement-teacher feasibility probe (no optimizer).
It has its own temporary world, exclusive probe lock, durable manifest/logs and
SCRIPTED PROBE entry in the dashboard run selector. It never replaces the trainer's
`latest.json`. Command counts, simulated seconds, all requirement rows and earned
intermediate milestones are preserved. A probe's success is not learned performance
or a production-script comparison. SIGTERM to the identity-verified probe process
stops after its current bounded activity; the configured time/activity caps also stop it.

`script_baseline.mjs` generates hunt/circle/mega using the same production
`scripts/lib/script-gen.mjs` used by the wire sweeps. It preserves per-script
SHA-256 hashes, fixed-arena geography and an explicit scope: it does not reproduce
the sweep supervisor's adaptive arena selection or candidate variants.
`script_controller.mjs` hosts the actual client interpreter, queues synchronous
game replies to avoid re-entry, and enforces command/simulated-time/unsafe-state
stops in an isolated world. These components are tested but are not yet wired
into matched frozen-policy evaluation. The current evaluation's `scripted_rotation`
must not be relabeled as a production-script comparison.
The real-engine bridge regression covers town navigation and purchases with the
starter purse. It exposed and fixed the production generator's bazaar-arrival
fallthrough into `BUY_SKIP`; generated scripts now explicitly enter `BUY_HERE`
after a successful arrival. Historical script hashes/results remain historical,
and any new comparison must record the regenerated scripts rather than infer a
performance improvement from the bug fix alone.

`script_benchmark.evaluate_script()` now executes the generated library with the
real game timers and interpreter in an owned temporary database. Inputs explicitly
bound seed, target, commands, simulated seconds and wall time. The worker uses the
same fresh Gor'Tog, 150-silver start and actual 10 CON/STR/REF allocation commands
as the learned curriculum. It fingerprints the generator, interpreter and game
sources, preserves script hashes and real milestone evidence, and supports process
cancellation. It is still a fixed low-level arena baseline, not a reproduction of
the adaptive crowded wire-sweep supervisor. This boundary has real-engine cap tests;
`--script-comparison` now attaches a five-seed report after the neural evaluation.
It reuses each greedy candidate episode's seed, target and consumed command/simulated
time budgets, with a separate maximum 120 wall seconds per script seed inside the
overall evaluation deadline. This is explicitly a retrospective budget comparison,
not a preregistered fixed horizon or full adaptive wire-sweep comparison.
`production-comparison.json` preserves partial rows on interruption. Wall-time
exhaustion is incomplete evidence, not proof that the baseline cannot progress.
The neural evaluation is saved before running this optional comparison, so its
results survive a later script timeout. No comparison automatically deploys a model.

The page's **Watch run** panel accepts a saved run ID (or `?run=RUN_ID`) and
lets you inspect the training snapshot or each recorded evaluation policy/seed.
It uses only local read-only artifact requests, never the main-world spectator
socket. Historical runs without text capture show labelled state summaries.
Future approved runs publish the last eight isolated game messages (up to 2000
characters each), room and last command at training-update/evaluation-heartbeat
boundaries. This is sampled text, not a full replay or a continuous screen feed.
Completed/stale runs never receive a live indicator. No learning settings or
game commands are changed by watching. No past transcripts are reconstructed.

The activity indicator distinguishes fresh training/evaluation, idle saved results,
failure and stale/unknown telemetry. It is telemetry-based, not an OS process probe.
`records.json` is regenerated after evaluation and monitored-run completion; rebuild
existing artifacts with `.puffer-venv/bin/python -m puffer_adapter.records`.
Records exclude integration-test runs and incomplete evidence, and group by engine
contract, starting scenario, episode horizon and exact evaluation seeds. The banner
selects the latest run's matching group. Raw EXP records may be rejected; only
balance-passing candidates populate the separate balance-checked record. Neither
record constitutes deployment approval. Circle milestones and leveling efficiency
remain untested in this scenario.

## Tests

```sh
node --test test/puffer-engine.test.mjs
.puffer-venv/bin/python -m unittest puffer_adapter.test_environment
.puffer-venv/bin/python -m unittest puffer_adapter.test_training
.puffer-venv/bin/python -m unittest puffer_adapter.test_guardrails
npm test
```

Engine tests cover real EXP, seeded replay, private database isolation, invalid
action rejection, reset and horizon boundaries. Gymnasium checks the Python API.
A short actual training run should show finite losses, positive update count,
changed hashes and a loadable checkpoint; this is not satisfied by mocks.

## Removal

### Dashboard controls

Native PufferLib 3.0 terminal rendering is now enabled automatically when
`puffer_adapter.train` runs in an interactive terminal. Override with
`--terminal-dashboard native` or `--terminal-dashboard quiet`. The web
telemetry/checkpoints are still saved in either mode. Detached dashboard
launches remain quiet. This flag starts no viewer for an existing process;
it applies when launching a **new** foreground training run, which must wait
for the active monitored trainer/evaluator to exit. Ctrl-C on that foreground
trainer stops training; Ctrl-C on the separate monitor below only closes the viewer.

See `PUFFER5-MIGRATION.md` for the 5.0 CUDA/Constellation migration gates.

For a read-only **terminal telemetry viewer** (not the native PufferLib Rich
dashboard), run `.puffer-venv/bin/python -m puffer_adapter.monitor` from the
repository. It follows latest every two seconds. Add `--run RUN_ID` to pin a
saved run or `--once` for a single snapshot. Ctrl-C exits only the viewer;
it does not signal the trainer. Missing/stale telemetry is shown explicitly.

Run `node puffer_adapter/control.mjs` alongside the game, then open
`http://127.0.0.1:3000/puffer.html`. This separate controller binds only to
127.0.0.1:8788, accepts only the local dashboard origins and validates fixed
JSON budgets. It does not require restarting the game. Stop the controller
with Ctrl-C (or its recorded process PID if launched detached).

Start creates one **fresh** Barbarian Circle 20 candidate: eight requirement-aware
demonstrations, 100 class-balanced imitation epochs, then the selected PPO budget.
50/100/500 updates correspond to 6,400/12,800/64,000 environment samples at
128 samples per update—not 50/500 complete training runs. The 10/30/60 minute
training cap includes demonstration preparation; reaching every requested update
is not guaranteed. Frozen evaluation has its own 60-minute cap. No deployment
occurs. Existing training/evaluation blocks Start, and the trainer's exclusive
lock is the final concurrency guard. Stop targets only the verified active trainer;
it does not disable external automation schedules. Control failures disable buttons
and never automatically retry mutations. The page continues monitoring without
the controller. Historical run selection does not change the active process target.

Stop any run first. Remove `puffer_adapter/`, `test/puffer-engine.test.mjs`,
`public/puffer.html`, `public/js/puffer-monitor.js`, the Puffer link in Admin,
and (optionally, after archiving) `.puffer-venv/`, `.puffer-runtime/`, and
`public/live/puffer/`. Existing Fly results and the original game are preserved.

Upstream: https://github.com/PufferAI/PufferLib/tree/3.0
