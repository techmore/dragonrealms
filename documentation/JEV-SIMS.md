# Jev in DR Sims — atomic checks v2

The atomic review remains read-only. The separate live-player extension is
under active progression benchmarking; see [Jev retrospective](JEV-RETROSPECTIVE.md)
for measured runs and known failures. Review receipts and player sims remain
separate artifacts.

Open [Jev reviews](http://localhost:3000/jev.html) from Sims navigation.
The live player is visible at [Jev player](http://localhost:3000/jev-player.html).

The atomic-review default is **Jev-only**. The separate live-player harness can
also use an explicitly selected local model for action choices, or `hybrid` to
prefer Jev and fail over to a local model when the provider is unavailable.
Local decisions are labeled separately and never counted as Jev evidence.

## Responsibility split

Code computes completion and gaps and checks supplied numeric claims and cohort
settings. Jev answers five independent questions in one API call:

- Noul: does the proposal recommend changing a fixed cohort setting?
- Noul: does it assert an unsupported causal explanation as fact?
- Noul: does it reverse its own hypothesis-test logic?
- Score: how specifically does it describe an experiment?
- Choice: does it request inspection, experimentation, or neither clearly?

Code returns `reject`, `abstain`, or `reviewable`. All carry
`executable: false`. Reviewable means suitable for human inspection, not proven
correct or approved to execute. No game sessions, script changes, or promotions
are performed. Free-text arithmetic is not exhaustively verified: supply
structured requirement and cohort fields for deterministic checking.

Risk probabilities ≥0.80 reject; values above 0.20 and below 0.80 abstain.
Choice confidence must reach 0.75. Experiments also require specificity score
≥1.75/2 and confidence ≥0.75. Missing evidence, errors, and truncated drafts
cannot be cleared. These thresholds remain provisional.

## Usage

```sh
# Code-authored inspection + Jev; no companion required
node scripts/jev-review.mjs

# Select a unique saved summary
node scripts/jev-review.mjs --run wkpo --variant ai-baseline --race halfling

# Check a supplied proposal
node scripts/jev-review.mjs --proposal proposal.json

# Generate locally, then check with Jev
node scripts/jev-review.mjs --local

# Local draft only; explicitly unverified / abstained
node scripts/jev-review.mjs --offline

# Inspect sanitized evidence without calling either provider
node scripts/jev-review.mjs --dry-run

# Fixed, bounded evaluation: 12 requests, four in parallel
node scripts/jev-evaluate.mjs

# Run an ordinary player in an isolated disposable world (1–360 minutes)
node scripts/jev-player-world.mjs 240

# Select another supported guild; default remains Barbarian
JEV_PLAYER_GUILD=trader node scripts/jev-player-world.mjs 45

# Explicit accelerated diagnostic; never evidence of natural-speed progression
node scripts/jev-player-world.mjs 30 --boost 20

# Compare the learning-oriented chargen allocation in a separate run
JEV_PLAYER_STAT_POLICY=mental-learning-v1 node scripts/jev-player-world.mjs 45

# Offline live player; an Ollama-compatible local server must be running
JEV_PLAYER_PROVIDER=local JEV_PLAYER_LOCAL_MODEL=qwen3:8b \
  node scripts/jev-player-world.mjs 45

# Jev-first live player with local fallback; permanent Jev errors (including
# HTTP 402) open the Jev circuit so repeated provider requests are not made.
JEV_PLAYER_PROVIDER=hybrid JEV_PLAYER_LOCAL_MODEL=qwen3:4b \
  node scripts/jev-player-world.mjs 45

# LM Studio (OpenAI-compatible API)
JEV_PLAYER_PROVIDER=local JEV_PLAYER_LOCAL_PROTOCOL=openai-compatible \
JEV_PLAYER_LOCAL_URL=http://127.0.0.1:1234/v1 \
JEV_PLAYER_LOCAL_MODEL=<loaded-model-id> node scripts/jev-player-world.mjs 45

# Replay the latest saved menu that offered a specified action through the
# current local adapter. This sends no game commands (maximum ten calls).
node scripts/jev-player-local-replay.mjs \
  --run jev-player-2026-09-21T10-58-17-308Z-bcc5aa \
  --requires-action wield_club --limit 3

node --test test/jev.test.mjs test/jev-checks.test.mjs
```

Proposal files are JSON, at most 16 KB:

```json
{
  "text": "Inspect script coverage of the missing survival lanes. The cause is unknown.",
  "cohort": { "boost": 20, "concurrency": 3 },
  "requirements": [{ "label": "2nd survival", "have": 0, "need": 4 }]
}
```

Only text is required. Numeric fields are checked against the selected run by
code. The text and selected evidence go to TypeSafe. Do not include private chat,
credentials or unrelated information. Receipts inherit existing public Sims
visibility. Explicit row selectors must identify one row. `--jev-only` remains
a compatibility alias for the default.

## Initial measured evidence

The frozen v2 challenge set has six development and six validation cases, with
labels authored before API calls. All 60 semantic labels matched: three binary
labels, a category and a rounded score per case. Dispositions matched 6/6
development and 4/6 validation expectations. No false clears or API errors.

Two validation cases abstained instead of their expected disposition: a harmless
negated instruction had reversal probability 0.21, and changing three-player
concurrency to solo had cohort-change probability 0.71. Thresholds were not tuned
after seeing these outcomes. Median request latency was 423 ms for development
and 233 ms for validation. This small agent-authored set is not independent
labeling, production calibration, or a gameplay benchmark. Future tuning needs
new untouched examples.

The earlier Liquid draft was replayed with its incorrect numerical claims
represented as structured fields. Code rejected both incorrect survival
requirements; Jev independently assigned reversal probability 0.80.
Replay it with the exact wkpo selectors above and
`--proposal documentation/jev-rejected-example.json`.

Reports preserve inputs, question wording/version, model identity and timing.
Evaluations additionally preserve labels, fixture/question hashes, distributions,
mismatches, Brier scores, abstentions and false clears.
Review receipts live at `public/live/jev/jev-*.json`; evaluation receipts use
`jev-eval-*.json`. Separate `latest.json` and `evaluation-latest.json` discovery
files feed the dashboard. These are analysis receipts, not sweep EXP cards.
Live-player runs write `public/live/jev-player/<run-id>/manifest.json` and
`events.jsonl`, with `public/live/jev-player/latest.json` as the dashboard
pointer. The player uses the normal authenticated websocket without `?bot=1`;
code owns login, chargen, movement, rate limiting, and safety bounds, while Jev
chooses only among the current legal actions. A low-confidence or unavailable
Jev response takes a recorded bounded fallback. This is realtime play, but it is
not yet an autonomous progression benchmark or a claim that Jev can safely
operate without the code-owned guardrails.

The optional live-player local backend is restricted to an HTTP loopback URL
(`JEV_PLAYER_LOCAL_URL`, default `http://127.0.0.1:11434`) and accepts one
action ID from the exact current legal set. It does not send credentials,
fabricate System One probability distributions, or silently merge results with
Jev. Manifests identify `provider: local`, the local model ID, and a separate
`localDecisions` count. Jev remains the default (`JEV_PLAYER_PROVIDER=jev`).
The default Ollama protocol uses `/api/chat` with thinking disabled and a
JSON Schema enum constraining output to offered action IDs; use
`JEV_PLAYER_LOCAL_PROTOCOL=openai-compatible` with an explicit
loopback `/v1` endpoint for LM Studio. This is an offline companion/control
condition, not an open-source Jev implementation.

`scripts/jev-player-local-replay.mjs` re-asks up to ten recorded decision menus
to the current local adapter. It can select exact event timestamps or menus
that contained a given action ID. Reports store the old and replayed choice,
offered IDs, compact gear-priority guidance, model and latency. Replays are
read-only: they never connect to the game or execute a selected action.

To inspect a saved run against the current code-owned choice supervisor without
calling a model or starting a game, run
`node scripts/jev-player-supervisor-replay.mjs --run RUN_ID`. The report lists
every replayable saved menu, the original provider choice, the supervisor's
current legal selection, and the override reason. This is a counterfactual
policy diagnostic, not evidence that the changed action would improve live
progression; it is useful for choosing which bounded natural-speed cohort to
run next. It also audits duplicate action IDs in recorded menus, which can
inflate identical options and undermine choice calibration.

The optional `JEV_PLAYER_REPEAT_OVERRIDE_RELEASE_AFTER=N` (1–8) setting
releases a provider's same legal choice after N consecutive same-room
supervisor overrides. It defaults to off, is recorded in the run manifest, and
does not bypass the runner's emergency-health escape or roundtime checks. Test
the fixed-menu counterfactual first with
`node scripts/jev-player-supervisor-replay.mjs --run RUN_ID --repeat-override-release-after 4`;
replay does not call a provider or execute commands. Treat reduced override
counts as an autonomy measurement only—the live candidate still needs a
matched natural-speed run to establish whether progression improves.

For long repeated-action streaks, use
`node scripts/jev-player-loop-audit.mjs --run RUN_ID`. This offline audit
separates the selected action from Jev's original choice and the supervisor's
override. It reports both same-action streaks and repeated override streaks,
so a wrapper that alternates between multiple practice actions while replacing
the same Jev choice remains visible. It requires at least ten decisions over
two minutes by default and ignores traces without requirement snapshots. A flat
gate is a review signal, not proof of failure: skill EXP and ranks can update on
delayed pulses. Gate movement is only co-observed; automatic combat and other
concurrent actions mean it does not prove the repeated choice caused progress.
The audit never connects to a world, executes actions, or changes policy.
It also reports `offeredChoiceCoverage`: for each open requirement row, how
often a saved decision menu included a known action mapped to one of that row's
eligible skills. This is menu construction evidence, not evidence of execution
or success; passive training and unmapped/compound routes are explicitly
unknown. Use it to find candidate menu blind spots before spending time on a
live run, then verify a proposed wrapper change with regression tests and a
matched run.

The Barbarian runtime can also prepare a learned supernatural ability while
combat roundtime is active, then recheck room, health, gate, Inner Fire, and
player-visible RT before sending it. This targets a measured race in the
previous runner: provider decisions took 4–9 seconds, while 95/95 Dragon Form
attempts in one saved V12 trace arrived at the server with 1–3 seconds of RT
remaining and were refused. Prefetch is limited to an actually open supernatural
gate, a learned/affordable ability, and safe combat; the manifest distinguishes
prefetch requests, pending actions, executions, cancellations, and server RT
deferrals. It does not change game rules, and success still requires a live
matched run.

Natural speed is the default for isolated Jev player runs. An opt-in
`--boost N` flag (1–20) uses the existing test-only experience/recovery
multiplier solely inside the disposable world. The runner rejects boosts on
non-loopback origins; manifests and the player dashboard label boosted runs as
accelerated diagnostics. Use this to distinguish agent-choice bottlenecks from
wall-clock XP throughput, not as a substitute for successful natural-speed
runs.

The opt-in lane coach (`JEV_PLAYER_LANE_COACH=advisory`) is still Jev-led:
it adds a gate-to-action map and may preserve a gate-mapped Jev choice against
one known field-practice override. Its v2 stall signal uses both skill-rank
and observed per-skill mindstate movement; it only asks Jev to reconsider
after neither has advanced for two expected EXP pulses. The server's mindstate
feed contains only the top ten learning skills, so an omitted skill is treated
as unknown and never as evidence that learning stopped. This is harness-only
decision context, not a game-mechanics change. The queued coaching-off/on
natural-speed pair remains the evidence needed before promotion.

The `combat-evidence-3` player reassesses roughly every three seconds, including
during combat roundtime. Jev classifies the situation (engage, recover, observe;
or continue/flee in combat). A separate target question runs in the same request.
Low target confidence uses an explicitly logged first-visible-target tie-break
only after the engage decision clears its confidence gate. No species strength
is inferred from names. Rest is excluded at the outdoor healing ceiling
(`floor(maxHp * 0.8)`). The action gate remains 0.55; it has not been calibrated.

Choice confidence describes the distribution shape, not the probability that
an action is safe. The previous flat menu mixed target preference with strategy:
the saved run repeatedly replaced attacks with rest at the healing ceiling.
The regression replay of that same observation now returns engage with 0.98
confidence while target preference remains 0.18. Two synthetic recovery/escape
cases also matched. This is development evidence, not held-out calibration.
Run `node scripts/jev-player-replay.mjs` to repeat those three provider calls
plus an unlabeled diagnostic replay of the historical uncertain combat state;
the script depends on the preserved September 17 historical event traces.

Room observations are refreshed between fights. Recent prose accompanies
decisions. Stale responses are discarded after room, combat, health-band, or
target changes; out of combat, a newly appearing roundtime also invalidates a
choice, while roundtime expiring during the request does not. Uncertain mode decisions refresh or wait; critical
health forces escape. In combat, uncertainty first sends `assess`; three
consecutive uncertain decisions attempt `flee`. Escape is retried at most
every three seconds for 15 seconds and requires an observed non-combat state;
failure ends as `needs-attention` / `escape-unconfirmed`. Out of combat, three
uncertain decisions still stop. Fleeing holds navigation
until health recovers. Full questions, distributions and target selection source
are retained in events. Both fallback decisions and actual fallback commands
are counted. Kills use explicit corpse-loot messages. These counters demonstrate
activity, not leveling quality.

Saved decision streams can be summarized without changing the run using
`node scripts/jev-player-outcome-audit.mjs --run RUN_ID`. The report pairs each
selected action with the next observed skill/gate snapshot and aggregates the
adjacent-window changes by action and supervisor reason. It is descriptive only:
ongoing combat and delayed EXP mean an adjacent rank gain is not proof that the
preceding command caused it. Use matched runs and final gate completion for
policy conclusions.

Combat evidence is a rolling 30-second history from ordinary prompts and text:
observed HP change, recognized incoming/outgoing damage, observation duration,
and a recent `assess` response (refreshed every 10 seconds). Enemy HP remains
unknown. Parsed damage totals are partial observations, not authoritative totals.
Combat history resets between fights. No private engine state is queried.

Design references: [Choice](https://docs.typesafe.ai/primitives/choice),
[Confidence](https://docs.typesafe.ai/confidence), and
[How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one).

## Credentials and optional local runtime

The supplied TypeSafe key is in macOS Keychain, service
`dragonrealms.typesafe.ai`, account `dr-sims`. `TYPESAFE_API_KEY` overrides it.
No key enters browser code, public reports or local-model requests.
Jev is pinned to `jev-1.13.0`, requires internet, and has a 20-second request
timeout without automatic retries.

This M1 Pro / 32 GB Mac ran the installed LFM2.5-8B-A1B MLX 8-bit model in about
8.4 GiB. Loading took 12.34 s; initial answers took 15–25 s and contained factual
and reasoning errors. Hardware feasibility passed; autonomous engineering
quality did not. No replacement model was downloaded for v2.

```sh
lms load lfm2.5-8b-a1b-mlx --context-length 8192 --parallel 1 --ttl 900 --identifier dr-sims-local -y
lms server start --port 1234 --bind 127.0.0.1
```

`DR_LOCAL_BASE_URL` defaults to `http://127.0.0.1:1234/v1` and must use HTTP
loopback; redirects are refused. `DR_LOCAL_MODEL` defaults to `dr-sims-local`.
Generation is capped at 1,800 tokens and 90 seconds. The model unloads after
15 minutes idle; `lms unload dr-sims-local` releases it sooner.

Sources:
[Building with System One](https://docs.typesafe.ai/concepts/how-to-build-with-system-one),
[Choice](https://docs.typesafe.ai/primitives/choice),
[Noul](https://docs.typesafe.ai/primitives/noul),
[Score](https://docs.typesafe.ai/primitives/score),
[Jev limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
