# Jev implementation retrospective — 2026-09-17

## Outcome and handoff

Jev's API worked, but our implementation did not establish a reliable autonomous
leveling player. Work now returns to Puffer's ordinary-connection integration.
Keep Jev code and receipts for future comparison; no additional Jev run is queued.
No credential is included in this document.

## Mistakes, evidence, and disposition

1. **We built the wrong first workflow.** The initial integration reviewed sim
   proposals, while the user wanted a character that plays. Those review scores
   and evaluation labels were not evidence of gameplay ability. Review tooling
   remains useful separately; its success must never stand in for progression.

2. **We overclaimed early success.** Authentication, a few decisions, no API
   errors, and passing adapter tests were repeatedly described as “working.”
   None demonstrated a complete fight/recover/reengage cycle or circle progress.
   Future updates must distinguish connection, actual action execution, observed
   outcomes, and earned requirement completion. Launch checks are not run reviews.

3. **We recommended switching to Puffer too early.** Controller defects and a
   tiny action menu confounded model capability. Puffer had broader scripted
   activities, training, and accelerated isolated episodes. Jev had short live
   sessions. These are not matched benchmarks or grounds for ranking the models.

4. **The initial player lifecycle was under-tested.** HTTP authentication setup
   was missing initially, and a generated character name contained digits despite
   a letters-only rule. Navigation also relied on a prompt arriving at the right
   moment. Movement/look emit room frames without guaranteeing another prompt;
   explicit handoff and periodic reassessment repaired that stall. Navigation
   still uses static map data and does not await acknowledgement for each step.

5. **We misunderstood automatic combat timing.** Waiting for roundtime zero
   prevented supervision while automatic swings kept resetting roundtime.
   Reassessment now continues during combat, with wait/flee choices. Automatic
   swings are engine behavior, not repeated model actions.

6. **One broad Choice mixed strategy and target preference.** The flat menu put
   attack-hog, attack-kobold, rest and look in competition. A confidence gate of
   0.55 then turned ambiguous target choices into rest. We did not preserve the
   original full distributions, so the exact cause of every low-confidence
   response cannot be reconstructed. Narrowing the decision on the historical
   stuck observation produced engage confidence 0.98 and separate target
   confidence 0.18. That supports the decomposition, not universal calibration.

7. **We treated uncertainty as a reason to repeat an ineffective action.** Rest
   was still available at 116/145 HP, the ordinary outdoor healing ceiling.
   Sixteen responses in the first completed minute-three run were overridden
   into fallback actions. Rest is now excluded at the integer healing ceiling;
   low-confidence target preference is separated from mode uncertainty. A
   first-visible target tie-break is explicitly code-owned, not a Jev preference.
   The 0.55 mode threshold remains provisional and uncalibrated.

8. **Combat questions lacked current evidence.** Short recent prose and a room
   snapshot were inadequate to judge a deteriorating fight. Added a rolling
   30-second history of observed HP, recognized damage messages, and ordinary
   `assess` output. Enemy HP remains unknown; parsed totals are incomplete.
   Higher confidence after this change is not proof of a better combat decision.

9. **Uncertainty handling abandoned combat.** The first three-strike mechanism
   simply closed the connection while fighting. Version 3 instead refreshes
   assessment and attempts escape, with bounded retries and observed confirmation.
   The latest run did escape and rest, but then hit the out-of-combat uncertainty
   limit. Recovery decisions remain incomplete, including treatment of bleeding.

10. **Telemetry was initially misleading.** Kill matching expected prose the
    game does not use. It now counts the explicit corpse-loot message. Low-
    confidence fallbacks were initially undercounted/mislabeled. Full questions,
    probabilities, proposed choices, executed commands, and tie-break sources
    are now recorded. Dashboard latest-run following and stale-state handling
    were also repaired. Kills and decision totals still do not measure leveling.

11. **The action/state coverage was far too small.** Characters fought with fists
    and no armor; the controller lacks purchasing, equipment selection, deliberate
    stat allocation, a skill curriculum, guild advancement, and persistent
    learning. Repeated fresh accounts make this a smoke-test harness rather than
    a persistent player. Neither Jev nor Puffer should receive credit for skills
    or decisions supplied entirely by surrounding code.

12. **Our tests were narrower than our claims.** Unit tests validate local
    contracts. Three provider regression cases include a historical failure and
    synthetic cases; they are development data, not untouched calibration or
    gameplay benchmarks. The historical combat replay has no known correct label.
    No completed Jev run demonstrated circle advancement or a matched advantage.

## Preserved gameplay receipts

All paths below are under `public/live/jev-player/`, each with manifest and events.

| Run suffix (2026-09-17) | Outcome |
|---|---|
| `12-45-18-081Z-8e37e8` | 1-minute cap; 5 decisions, 0 counted kills; supervision gated by roundtime |
| `16-39-27-821Z-738849` | 3-minute cap; 42 decisions, 1 kill, 16 fallbacks; repeated rest at healing ceiling |
| `16-50-35-321Z-fbf2eb` | Stopped after about 96 seconds; 28 decisions, 0 kills; uncertainty during combat, 81/145 HP |
| `17-03-03-316Z-db56ab` | Stopped after about 116 seconds; 28 decisions, 0 kills; escaped to west_gate, resting at 105/145 HP, slight chest bleeding; decision-uncertain |

All remained Circle 1. These runs differ in controller version and random game
outcomes; they are a development history, not a controlled performance ranking.

## Puffer continuation

The frozen candidate `puffer-20260917-032035-329684` and imitation-only checkpoint
have Circle20 evidence across two disjoint five-seed isolated evaluations. The
known failure seed 7740620 also passed its separate diagnostic replay. Random
and rotation controls reached the target too: macro scaffolding contributes
substantially. Imitation-only was more efficient by measured medians than PPO.

Ordinary transport passed an isolated socket smoke check. The input-side policy
contract now exists in `puffer_adapter/CLIENT-OBSERVATION.md`; existing
checkpoints remain incompatible and exact within-rank EXP stays null. The next
step is making activity macros use observed route, equipment and target facts,
then training a fresh policy on the new contract. A socket smoke test is an
integration milestone, not frozen-policy transfer or leveling proof.

References: [TypeSafe design guidance](https://docs.typesafe.ai/concepts/how-to-build-with-system-one),
[Choice](https://docs.typesafe.ai/primitives/choice),
[Confidence](https://docs.typesafe.ai/confidence), and `puffer_adapter/WIRE-VALIDATION.md`.

## Deep dive — 2026-09-20

The three-minute run `jev-player-2026-09-20T02-34-11-268Z-c5907c` completed
cleanly but stayed in `square` for all 37 decisions, selecting `look` each time.
The endpoint and structured choice contract worked; the agent had no persistent
task objective or outcome memory, and the action surface rewarded an observation
loop. A code audit also found that the visible-creature attack loop was attached
to the no-exits `else` branch, so rooms with ordinary exits omitted attacks.

The next run showed a distinct control bug: an anti-repeat cooldown removed
`wait` during roundtime, leaving only `flee` in the candidate set. Jev then chose
that available action during an otherwise healthy fight. The run was stopped;
the next revision keeps wait available and applies cooldown only to redundant
non-wait actions. This is why telemetry must preserve the offered options, not
only the chosen command.

The following five-minute run (`jev-player-2026-09-20T21-06-51-221Z-a10995`)
validated the goal/navigation/fight loop: Jev chose the North Fields destination,
reached it through 10 confirmed room transitions, attacked a visible marsh hog,
and the character earned one kill. It avoided death, automatically fled below
40% health, and recovered to 86/145 HP. It did not gain a circle. The trace then
showed repeated one-option waits because WireSession retained a stale `RT: 1`
from an old prompt; rest's end message also did not clear the local resting flag.
Roundtime is now aged against wall-clock time and rest start/end prose updates the
flag. These are controller defects exposed by the real session, not Jev failures.

The current policy uses a persistent North Fields training objective, includes
recent actions/outcomes and the full candidate set in every state, and lets Jev
select a destination/creature. The wrapper executes multi-room navigation by
shortest path, confirming each room transition before moving again. This follows
the pattern in public Jev game integrations: structured state + explicit goal +
harness-owned memory/path mechanics; it is not evidence that Jev itself sees the
game or executes arbitrary commands. The prior implementation incorrectly asked
one yes/no Noul per legal action and ranked the yes-probabilities. TypeSafe's
primitive guidance distinguishes binary Noul judgments from mutually exclusive
Choice selection. Policy v6 now sends one Choice containing the complete legal
menu and consumes its selected option/distribution directly; see
`https://docs.typesafe.ai/primitives/choice` and
`https://docs.typesafe.ai/primitives/noul`.

The five-minute run (`jev-player-2026-09-20T21-13-01-196Z-fe813f`) reached the
fields, killed one marsh hog, then died to a kobold at 10/145 HP. At 41/145 HP
the safety override sent an emergency flee; the game blocked it. Incoming hits
kept refreshing RT, and the old controller never retried. Escape retries now
run at a bounded 2.5-second cadence regardless of RT, with an explicit
`escape-blocked` event. The three-minute validation
(`jev-player-2026-09-20T21-29-58-015Z-abb2b9`) confirms the retry worked: its
first flee was blocked, the next succeeded, and the character survived at
78/145 HP. It earned one kill, but finished resting in town and remained circle
1; it was a safety/control improvement, not a progression result.

The subsequent 45-minute v2 run `jev-player-2026-09-20T21-40-25-466Z-3197b5` was
stopped after its 10-minute checkpoint (`finishReason: interrupted`) to replace
its limited policy. By then the harness had allocated ordinary chargen points
(10 STR, 10 CON,
5 AGI, 5 REF), carries the server's circle-requirement rows and learning feed
into the decision state, exposed guild-hall training/circle actions, avoided
repeated `look` while resting, and records circle milestones/gap counts in its
manifest/dashboard. The run reached `hall_barbarian` and the initial server
snapshot showed 19 unmet circle-2 rows. It finished that checkpoint at 3 kills,
0 deaths, three trainer sessions, 50 silvers, and still 19 unmet rows. This
confirms training is reachable but insufficient by itself. The harness changes
are confined to `scripts/jev-player.mjs`, `scripts/lib/jev-player-policy.mjs`,
`scripts/lib/wire-session.mjs`, and its dashboard; no native game command or
combat logic was changed. A follow-up policy version adds legal Barbarian
`analyze flame`, `disarm`, and once-per-fight `berserk` actions to practice
expertise, tactics, and weapon skills; the active run was launched before that
menu revision and does not test it.

At the 10-minute v2 check, the run had three kills, zero deaths, three
trainer sessions, 50 silvers, and still 19 unmet circle-2 rows (all current
skill ranks were 0, with Brawling's learning pool at mind lock). This is useful
evidence that hall training is available but not sufficient: the build needs
more organic skill lanes and an income loop. The next policy revision offers
visible corpse skinning, sells harvested creature loot at the tanner, and adds
Forage/Hunt/Performance choices when those skills are actual circle gaps.

The replacement 45-minute run `jev-player-2026-09-20T21-55-14-382Z-ab2755` ran
policy v4 for about 6m38s before being stopped as wedged. It ended at one kill,
circle 1, and 19 unmet circle-2 rows. It chose a bazaar equipment trip, trained
three skills at the guild hall, returned to the bazaar, and bought a dagger, but
did not wield it. After taking a wound it fled to town; the wound prompt showed
`abdomen (slight, tended)`. `WireSession` split bleeding entries on commas even
though the server separates wounds with semicolons, so the already-tended wound
was interpreted as two active wounds. Jev then repeatedly received only the
`rest` action at the full outdoor HP ceiling. The run was stopped after repeated
identical rest loops. Harness policy v6 fixes the parser, removes tended wounds
from the active-bleeding list, and offers `tend` for genuine open wounds. The
run result is not evidence of a Jev model failure; it exposes a harness state
interpretation defect. The v4 run could not exercise the Choice correction or
wound fix because it started before those changes.

Policy v6 was launched as `jev-player-2026-09-20T22-03-27-108Z-f8ba54` with a
45-minute cap after v4 stopped. At launch validation it was alive, connected as
an ordinary websocket player, and writing its per-run manifest/event log. Its
first Jev request was one `choice` over 16 legal options, and the response
returned a normalized probability distribution; Jev selected `train_expertise`
at 0.55. This validates the request/response shape and executable choice path,
not circle progress. Continue judging against circle milestones, actual skill
requirements, deaths/stalls, and durable final trace data.

At the next checkpoint (~1m13s), v6 had completed two trainer sessions
(Expertise and Large Edged, each reporting progress toward rank 1), bought and
wielded a dagger, bought and wielded a sling, and reached the North Fields. It
then began a visible marsh-hog fight with the sling equipped. The character was
at full health with no recorded kills yet; all 19 circle-2 requirement rows
still showed unmet because neither training session had completed a rank. This
is early evidence the Choice correction improves action selection (including
equipment follow-through), not proof of sustained skill growth or progression.

At the next live checkpoint (~2m06s), the first marsh hog kill was recorded;
the character remained at full health, earned 10 silvers from the corpse, and
had 35 silvers total. Slings was at the `ruminating` learning state, but the
server still reported 19 unmet requirements and circle 1. This confirms the
fight/income loop is functioning and the Choice agent is leaving automatic
combat to run; it has not yet demonstrated gate closure. The run remains active
and the open-wound parser fix remains unexercised because no wound has occurred.

At ~2m27s, v6 had one kill and was engaging a second visible creature; the first
fight required several automatic sling swings but caused no player damage. It
had alternated between purchased weapons between fights. The next policy v7
change (not loaded into this active process) enriches Jev's state with the
current weapon skill and observed equipment, preserves each requirement row's
eligible skill lanes, and compares armor by observed item name because the
ordinary hands snapshot does not provide inventory IDs. Weapon choices now
explain the current lane and observed rank, and the objective explicitly asks
for distinct unmet weapon lanes rather than repeated use of one lane. This is a
single observation/action-selection improvement; v6 remains the live control.

At ~4m38s of v6, the manifest showed three kills, 49 silvers, full health at the
checkpoint, and no circle-2 gate changes. Jev had skinned a kobold and the
ledger showed a kobold skin plus a strongbox, but no completed sale yet. The
learning feed had advanced Slings to `very engaged`, while its displayed rank
remained 0; Small Edged had begun learning. This is broader skill exposure and
economy evidence, but the 19-row requirement count is still the authoritative
progress measure and has not moved. The next review should examine whether loot
is sold and whether v7's richer equipment/requirement state helps diversify
practice; do not infer circle readiness from mindstate labels.
The current source reuses the existing Barbarian
weapon/gear plan as a data-only harness guide, offers only currently affordable
shop purchases, tracks confirmed purchases, and offers wield/wear actions from
the ordinary `hands` snapshot. It also tracks loot from successful skinning,
offers sale at the visible tanner, and makes Forage/Hunt/Performance choices
when they address displayed skill gaps. The v4 run is the first to exercise
these changes. No `server/` command or combat implementation was edited.

SemIf's downloaded Qwen3.5-4B 4-bit MLX model completed one offline structured
choice in 7.1 seconds on this M1 Pro. It selected the same North Fields
destination as hosted Jev on that recorded single state. This is a feasibility
smoke check only, not a policy benchmark; its probabilities are uncalibrated
and latency is currently too high for replacing Jev in a fast real-time loop.
Judge it in separate stages: reached-hunt-area, selected-visible-target,
observed-fight-result, recovery, and actual EXP/requirement progress. A kill
counter or successful route alone is not a leveling result. We have not run the
full test suite during this dive.

The user's Mac is Apple Silicon M1 Pro with 32 GB unified memory; MLX and
`mlx-lm` are already installed. SemIf (formerly OpenJev) is an independent
open-model implementation, not TypeSafe's Jev weights. Its published Apple
Silicon path uses Qwen3.5-4B and MLX, so a local comparison is feasible; its
reported option probabilities are explicitly uncalibrated and must not inherit
Jev confidence/safety thresholds without their own validation.

At ~9m45s the v6 run was alive with four kills, 59 silvers previously observed,
and still 19 unmet circle-2 rows; its latest manifest placed it at West Gate at
44/145 HP after leaving the field. The learning feed showed Small Edged
`enthralled`, Slings `very focused`, and First Aid `intrigued`, all still rank 0.
The circle-2 table specifically requires a supernatural rank. The local
Barbarian reference says forms train Inner Fire and Augmentation or Warding,
and `Combat.useAbility` implements that training, but the Jev harness exposed
neither ability learning nor ability use. Policy v8 adds a Jev choice to learn
the first-circle Dragon Form at the guild hall when that gate is unmet, then
offers `form dragon` during a safe combat when Inner Fire is sufficient. The
ordinary prompt's Fire value is parsed into harness vitals. This changes only
the harness observation/action menu; no native circle or combat code changed.
The live v6 process predates v8 and remains the control; v8 still needs its own
run to validate the supernatural lane and wound parser.

At ~10m47s, v6 had four kills, remained circle 1 with all 19 rows unmet, and
had reached Small Edged rank 1; it was back in town recovering at 116/145 HP
with no active bleed in the latest snapshot. The wound parser did distinguish
the open `back (slight)` wound correctly. But with First Aid rank 0, Jev chose
`tend_wounds` repeatedly: the trace shows failed attempts worsening severity
through severe/profuse, interspersed with successful reductions, before the
wound was finally resolved. The local wound rule gives rank-0 tending only a
30% success chance and raises severity on failure. This is not the old parser
loop; it is an action-policy feedback loop. Policy v9 applies a three-minute
retry cooldown to the same wound after a botched tend, preferring recovery and
natural clotting before retry. v9 is harness-only and has not yet been run.

At the ~13m14s check, v6 remained live with five kills and was in another
Kobold fight after returning to the fields. The previous back wound had cleared,
Small Edged remained rank 1 (mind lock), and the server still reported all 19
circle-2 rows unmet. HP was 63/145 during combat and Jev attempted to flee after
sustained incoming damage; the first attempt was blocked, so the existing
bounded flee retry logic is being exercised again. No circle milestone has
been observed. Preserve this as the v6 control until it reaches its cap or
becomes genuinely wedged; do not infer success from kill count alone.

To isolate the next harness variant from the user's active world, added
`scripts/jev-player-world.mjs`: it starts the real DR server on an ephemeral
loopback port with a fresh temporary SQLite DB, then launches the same ordinary
WebSocket Jev runner and shuts down only that disposable world after the run.
This exposed two harness-boundary bugs before a clean run: wire-session HTTP
account setup used `localhost` rather than the disposable server's IPv4
address, and the disposable server had the test auth API disabled. Both were
fixed in the harness plumbing; the auth API is enabled only for this explicit
disposable Jev world, and the debug API remains disabled. Failed boot attempts
are retained as `jev-player-2026-09-20T22-18-21-966Z-f73a06` and
`jev-player-2026-09-20T22-19-17-786Z-6c32fc`; neither reached game decisions.

The first successful v9 isolated run is
`jev-player-2026-09-20T22-19-32-479Z-91e2d7` (45-minute cap), using policy
`progression-aware-skill-and-kit-9`. At launch verification it was status
`playing`, had issued 16 commands over the ordinary player connection, had no
provider errors, was at full HP in `ne_road`, and its observed circle-2 state
showed 19 unmet rows. This is only startup evidence; the run has not yet
demonstrated kills, skill gains, ability learning, or circle progression. The
main-world v6 process remains the control and is not managed by the disposable
world launcher.

The isolated v9 run did not progress: its trace confirmed that Jev repeatedly
selected `starter_kit` at the guild hall, then `guild_hall` at the bazaar, and
walked back and forth with the original 150 silvers. It was safely terminated
after 12 decisions, 151 commands, zero kills, and all 19 requirements unmet;
the disposable world shut down with it. This is a genuine wrapper-choice-set
wedge, not a model outage. Policy v10 removes the `guild_hall` navigation option
while Jev is in the bazaar and any affordable kit remains. It preserves Jev's
choice among purchases and other valid options, while eliminating the known
two-destination loop.

The next isolated run, `jev-player-2026-09-20T22-21-17-464Z-959726`, is active
on policy v10 with a 45-minute cap. In its first verified decisions Jev chose
`buy dagger`, the trace confirmed the purchase, then Jev chose `wield dagger`;
the loop has not recurred in this initial sample. At the 22:22:10 UTC
checkpoint, it had also bought a sling, traveled to North Fields, chosen the
sling before attacking a visible marsh hog, and entered active combat. This
shows the purchase/equipment phase can transition to a real fight instead of
repeating the hall↔bazaar route. There were still zero recorded kills and all
19 circle-2 rows were unmet, so kill resolution, requirement closure, and
reaching circle 2 remain unproven. Leave the isolated run to its cap and review
its durable results on the next check-in.

At 22:23:12 UTC, v10 had resolved its first kill (at 22:22:54) and started a
second visible-target fight, still at full health and without provider errors.
Its skills remained below rank 1 and all 19 circle-2 rows were unmet. The v6
control was still alive at 7 kills after about 20 minutes, with Small Edged
rank 2, Evasion rank 2, and Physical Fitness rank 1; it too remained circle 1
with all 19 rows unmet. This is early evidence of improved encounter cadence
in v10, not evidence of reaching the gate. The native trainer implementation
confirms each `train <skill>` session adds 40% of the experience needed for the
next rank, so the path depends on sustained field learning plus enough loot
income for repeated training, not a single training command. Keep both bounded
runs isolated and judge final requirement rows, not combat activity alone.

At 22:27:22 UTC, v10 was still active at minute 6.1 with four kills, 102/145
HP, 133 silvers, and no provider errors; it remained circle 1 with all 19
requirement rows below their thresholds. The v6 control was active at minute
23.9 with nine kills, 84/145 HP, 25 silvers, and also all 19 rows below
threshold. Reviewing the v10 action trace found the wrapper treated the
server's transient `You must wait N seconds` roundtime refusal as a permanent
action block until room change. Policy v11 changes that boundary behavior:
record the refusal, defer reconsideration for the exact server-reported
seconds, and leave the target/action eligible afterward. Other invalid or
blocked actions remain room-scoped. v10 is still running the prior code as its
control; v11 has syntax/diff verification only and needs a fresh isolated run
after this control completes. No DR-native files or timing rules were changed.

At 22:27:47 UTC, both controls were still alive. v10 had run 6.5 minutes,
scored four kills, held 133 silvers, and still had all 19 circle-2 rows below
threshold; its two recorded skin commands had both been rejected by the native
roundtime gate (`You must wait 2 seconds` / `1 second`). v6 had run 24.3
minutes and scored ten kills; its current gap rows were Expertise 1/8, first
weapon 2/8, second weapon 1/8, and Evasion 3/6, with the other 15 rows still
at zero. It had 29 silvers and had recorded ten kills, but the latest skin
attempts also showed repeated fumbles and at least one transient RT refusal.
These traces substantiate the v11 retry change and show the remaining
progression bottleneck: surviving combat alone is not closing most lanes, and
missed skin actions reduce the training budget. Both processes were alive at
the check; keep v10/v6 as pre-v11 evidence and run v11 separately once these
bounded controls are finished or intentionally stopped for a verified wedge.

At 22:28:57 UTC, v10 remained live at 7.7 minutes with five kills, 77/145 HP,
137 silvers, and no gear-derived skill rank yet; all 19 rows were still 0/have
against their circle-2 needs. It had not learned Dragon Form and its carried
sale ledger remained empty. v6 was live at 25.5 minutes with ten kills,
109/145 HP, and 29 silvers; its best rows were Expertise 1/8, first weapon
2/8, second weapon 1/8, Evasion 3/6, and first survival 1/4, with the other
15 rows at zero. It held unsold skins/strongboxes in the ledger. This
reinforces that the next variant must validate more than combat uptime: it
needs successful retry of corpses after RT, eventual sale/training, and
explicit closure of several different requirement lanes.

The first v11 candidate was launched at 22:30:24 UTC as
`jev-player-2026-09-20T22-30-24-116Z-afc709`, on policy
`progression-aware-skill-and-kit-11`, with a 45-minute cap. It has its own
ephemeral loopback DR server and fresh SQLite database; the v6 main-world and
v10 disposable-world controls were left untouched. Launch verification found
the manifest `playing`, one decision, six commands, full health, no provider
errors, and 19 unmet circle-2 rows. This confirms startup only; the transient
roundtime retry change still needs to encounter and recover from a real refusal
in the trace.

At 22:31:04 UTC, the older v10 control had advanced to 9.8 minutes, five kills,
97 silvers, and 116/145 HP. Jev had learned Dragon Form and bought padded cloth;
its best circle-2 row was first weapon 1/8, while the other 18 rows remained at
zero, so all 19 were still unmet. The v6 control was at 27.6 minutes and 11
kills, with Expertise 1/8, first weapon 3/8, second weapon 2/8, Evasion 3/6,
and first survival 1/4; its other 14 rows were zero. The v11 candidate was
healthy at 0.67 minutes, at bazaar/setup, with 0 kills and 19 rows unmet; it
has not yet encountered a roundtime refusal. These observations show the
older policy eventually does reach supernatural training and better gear, but
none has closed a circle gate yet. Keep the v11 run untouched until its retry
path and later requirement gains can be judged from its own trace.

At 22:31:40 UTC, the v11 candidate had reached its first marsh-hog fight at
1.27 minutes, with 0 kills, 127/145 HP, and 19 unmet rows; it had not yet seen
a `You must wait N seconds` response, so the deferred-retry behavior remains
untested. v10 was at 10.4 minutes / five kills, with Dragon Form learned,
padded cloth purchased, first weapon 1/8, and 19 rows still unmet. v6 was at
28.2 minutes / 12 kills, with Expertise 1/8, first weapon 3/8, second weapon
2/8, Evasion 3/6, and first survival 1/4; all 19 rows remained unmet. All
three process handles were live and their event streams were advancing. Do
not equate these kill/skill signals with a circle milestone.

At 22:33:37 UTC, the v11 candidate was 3.2 minutes in with two kills, 100/145
HP, 121 silvers, no provider errors, and all 19 circle-2 rows still at zero.
Its event trace confirms the roundtime behavior end-to-end: Jev selected
`skin marsh hog`, the server refused it for 2 seconds of roundtime, the wrapper
recorded `action-deferred` without permanently blocking the action, and the
next Jev choice still had the corpse/skin action available; Jev chose to attack
a kobold. A later marsh-hog skin attempt was available but the game text says
the cut was fumbled and ruined, so this validates retry eligibility, not
successful skinning, forced retry, or skill gain. The v10 control was 12.3 minutes in with six
kills but only first weapon 1/8 and 22/145 HP, a concrete safety weakness. The
v6 control was 30.2 minutes in with 13 kills and its best rows at Expertise
1/8, first weapon 3/8, second weapon 2/8, Evasion 3/6, and first survival 1/4;
all three runs still reported 19 unmet circle-2 requirements. This makes the
next harness improvement clear: treat training coverage and sustainable
health as primary telemetry and policy concerns; kill count alone is not
progress toward circle 2.

At 22:36:10 UTC, candidate v12 was launched against a fresh disposable DR
world with a 30-minute cap. Its sole policy change is a stronger Jev-choice
priority rubric: preserve safety first, then select an available action that
closes an unmet circle requirement or opens a missing training lane before
repeating already-covered training. No server/game files were changed. Run
`jev-player-2026-09-20T22-35-53-665Z-1ac2e2` is live with policy
`progression-first-choice-12`; its durable manifest and event trace are under
`public/live/jev-player/jev-player-2026-09-20T22-35-53-665Z-1ac2e2/` and the
watch page is `http://localhost:3000/jev-player.html?run=jev-player-2026-09-20T22-35-53-665Z-1ac2e2`.
The startup check found an advancing heartbeat and event log (updated 17
seconds after start), ordinary-player status, full initial HP, and no provider
errors; as expected at this early point, it has 0 kills and all 19 circle-2
rows unmet. Policy SHA-256 is
`352700e296212a48bb5e6b65f979b13c78a572cf9761096cb95e5d93b5ff171f`; player
runner SHA-256 is
`f40859c2467e7d005b5c548f051c860f58bbd125726e7bfeb756bf8385e38265`.
This is a single candidate run, not evidence of consistency or promotion; judge
it by requirement-gap closure and survival at the cap.

At 22:36:43 UTC, v12 had completed setup and its first gear choices: Jev chose
the Barbarian hall, learned Dragon Form, went to the bazaar, bought a dagger
and sling, and had wielded the dagger. During setup one Jev request failed with
`fetch failed`; the next decision succeeded and selected the sling, so the run
continued without a player command being fabricated. It was still too early to
judge progression (0 kills, circle 1, all 19 requirements unmet, full HP). The
early action sequence is consistent with the new progression-first rubric, but
is not yet evidence of skill-gap closure; keep the run unchanged to observe
whether Jev equips/uses multiple lanes, then trains at the hall, and survives
long enough to advance.

The v12 run was deliberately ended at 22:38:41 UTC after its 31 decisions
showed rapid back-and-forth wielding (`dagger`/`sling`) every ~4–10 seconds;
it had 0 kills, 0 ranks, and all 19 requirements unmet. This is an early-stop
failure observation, not a completed benchmark. V13 adds one harness-only
mechanic: after the server confirms a `wield_*` command, suppress other weapon
switch choices for 120 seconds so a selected lane gets time to teach. The
progression-first rubric is unchanged. Candidate
`jev-player-2026-09-20T22-38-48-471Z-05082b` is now live on a fresh disposable
world for 30 minutes; its startup manifest is `public/live/jev-player/jev-player-2026-09-20T22-38-48-471Z-05082b/manifest.json` and the event stream is beside it.
The startup check confirmed `playing`, policy
`progression-first-choice-and-weapon-dwell-13`, advancing heartbeat, and no
provider errors yet. It has only just started (0 kills, circle 1, 19 unmet),
so no progression result is claimed. Current SHA-256: policy
`6b8847b4f6d5cbaf14e70e61c4c2c8381b1d82c0a3dc00caee3f66ea6c33837e`, runner
`7507025f6604bc8df8e09270147579c857450f9fb1151b0c29e68dabc4b8c8dd`.

At 22:39:30 UTC, it had made nine choices,
bought/wielded the dagger, bought a sling and padded cloth, and worn the armor.
The confirmed dagger wield set the 120-second lock through 22:41:11; subsequent
choices no longer included `wield_sling`, and Jev selected `perform` instead.
That is initial evidence the anti-thrash gate is working. The run remained in
setup (0 kills, no ranks, 19 unmet, 145/145 HP, no provider errors), so the
weapon-learning and circle-progression hypothesis remains untested.

At 22:40:55 UTC, v13 had left the bazaar, reached `fields_furrow`, selected
Forage, then started its first marsh-hog fight. The dagger dwell remained in
force through 22:41:11, and there were no repeated wield decisions. The run
was just over two minutes old: 0 kills, 0 ranked requirements, 19 unmet, and
141/145 HP while the first fight continued. This shows the wrapper gate
prevented the observed switch loop and Jev eventually chose the field objective;
it does not yet show weapon-rank growth or circle-gate closure. Leave v13
running to its planned cap and inspect the saved end-state before proposing a
new progression lever.

The later v13 checkpoint at 22:45:04 UTC was 6.3 minutes in, with two kills,
119/145 HP, no provider errors, and still 19 unmet rows / 84 total ranks of
shortfall. Its dwell prevented switching thrash but has not yet closed a rank
gap. For context, v10 was at 23.8 minutes / 11 kills / shortfall 79, v11 at
14.7 minutes / 4 kills / shortfall 82 and 57 HP, and v6 at 41.6 minutes / 17
kills / shortfall 65. All remain circle 1. These measured rates show the
original 30-minute cap is unlikely to be enough with current action cadence.

Candidate v14 tests combat-window timing rather than another objective change:
the wrapper suppresses Jev calls during safe roundtime, polls until actions
become legal, keeps emergency escape eligible, and records suppressed checks
plus RT-free combat decision windows. It launched at 22:44:47 UTC on a fresh
isolated world with a 30-minute cap as
`jev-player-2026-09-20T22-44-47-653Z-a8cbd7`. Initial checks found it `playing`,
with full HP, no provider errors, and event/manifest heartbeats advancing. It
has not reached combat yet, so the timing hypothesis is untested. Current code
SHA-256: runner
`7fe55edf4e57b3643529936c84eb873e8a2a7ff01553f01ed94b9f41ad85eb16`, policy
`c232c081d0d200feeba04964ff89c0529844729e5f9e62d7e3cccd7fb81ca365`.

At 22:45:50 UTC, v14 was 1.1 minutes in and still in bazaar setup after
learning Dragon Form and buying its first kit. It had one transient Jev
`fetch failed`, then continued; 0 kills, 0 ranks, 84 shortfall, full HP.
Neither RT counter had incremented yet because it had not entered combat, so
this is not evidence for or against combat-window scheduling. v13 at 7 minutes
still had 2 kills but no ranks or shortfall closure. The most mature v6 control
at 42.4 minutes had closed 21 of 84 rank points (shortfall 63), remained at
circle 1, and had 18/19 requirement rows unmet. Keep both candidates and
controls intact until their planned caps; no successful circle-2 run exists.

Candidate v15 isolates a kit-information lever: buy options now state the exact
skill trained, whether owned gear already represents that skill lane, which
circle rows it can improve, and the silver remaining after purchase. This
keeps the choice with Jev; the wrapper does not filter duplicate purchases.
The option-level smoke check confirmed `leather_sleeves` was described as a
duplicate `light_armor` lane while `shield_wood` was identified as distinct
`shield_usage`, with the actual 1st/2nd armor gaps. Run
`jev-player-2026-09-20T22-48-56-700Z-b5df44` started on a fresh isolated world
at 22:48:56 UTC, 30-minute cap, policy
`progression-first-choice-weapon-dwell-rt-windows-lane-aware-kit-15`; its
manifest and event stream are in `public/live/jev-player/jev-player-2026-09-20T22-48-56-700Z-b5df44/`.
The launch check found it `playing` with heartbeat and events advancing, no
provider errors, and 19 unmet requirements. It is too early to judge whether
Jev changes the gear purchase sequence or closes a rank. Current code SHA-256:
runner `7fe55edf4e57b3643529936c84eb873e8a2a7ff01553f01ed94b9f41ad85eb16`,
policy `421f5263d366947e783dd2e614f445da497df88005b3ac7409baff7ed244afca`.

The combat-timing hypothesis was then checked against server mechanics rather
than guessed at: `analyze flame` is not in the RT-blocked command set and
trains Expertise/Tactics without adding RT. v16 therefore offered it as a
Jev choice during RT and retained escape; it did not fabricate an RT-free
attack window. At the later snapshot the v16 player had 61 decisions, 138
commands, zero kills, 84 rank points short, and was still shopping with no
ranked skill progress. RT counters were still zero, so it had not reached the
test condition. This is a stalled setup signal, not a combat result.

v17 improved the bazaar route explanation, but its latest live trace exposes a
more important harness issue: Jev chose Performance repeatedly at the guild
hall while a 19-room North Fields route was also available. After 36 decisions
it remained circle 1 with zero kills, 84 short, and Performance rank 0. The
wrapper is successfully presenting alternatives and recording Jev's choices;
however, a raw eligible-action menu lets an easy repeat dominate an actionable
progression route. That is evidence to improve the decision context and detect
no-progress repetition—not evidence that Jev cannot choose or that combat is
failing. Existing runs remain untouched.

v18 corrects one remaining factual mistake in the v17 route text: before any
armor is owned, multiple affordable light-armor items were each described as
opening a distinct lane. The route now says they are alternatives for the same
`light_armor` lane, and buying more than one does not add a distinct skill
lane. Added a focused policy test for the generated route choice. Verification:
`node --test test/jev-player-policy.test.mjs` passed (6/6), policy syntax check
and `git diff --check` passed. Current policy SHA-256:
`28a694e977062e36bd17736d24109c176890db3e22a3060b3f836020043647bb`; player
runner SHA-256 remains
`5d63c0d9987f567ca5bb60b3d6f0b505e4a93d86a901f86783b2267b15cca0e7`.
Already-running v17 has loaded its earlier policy and is not retroactively
changed. No v18 run was started while multiple capped disposable runs remain
active.

v19 adds a read-only `JevProgressObserver` to the standalone player extension.
It records authoritative circle-rank points, rows closed/unmet, highest
observed skill mindstate, and time since the last measured gain in each run's
manifest, then includes that trend in Jev's decision context. It explicitly
distinguishes a rising mindstate (experience-pool progress) from a rank point
that actually closes the circle gate. Choice descriptions for Performance,
training, and weapon changes now name their eligible rows and explain that one
skill lane cannot fill multiple Nth-skill rows. This changes the information
Jev receives, not DR mechanics or which action the wrapper executes. Focused
tests pass (policy/progress/provider suites 13/13), edited module syntax checks
and `git diff --check` pass. Hashes at launch: player runner
`12c9067b18181cd0ede7dc06a89c0614054023e2bd26188b3c9498297c9eccf6`, policy
`7b705af87995b5172205850b5affd87cf93a6899bdb05c689ef565932a33a4bc`, progress
observer `cdd25b45165bfbf199bfa60ad1464df6bbd42e9ae4151c9ae98d4d2772794b9e`.

The v19 candidate launched in a fresh disposable world (not the native DR
server) at 23:01:26 UTC for 30 minutes as
`jev-player-2026-09-20T23-01-26-403Z-c5047f`. Launch check: ordinary websocket
player, status `playing`, two Jev choices recorded, no errors, manifest/event
heartbeats present. Initial gate is circle 1, 19 unmet rows / 84 rank points.
The dashboard is
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-20T23-01-26-403Z-c5047f`;
durable evidence lives under
`public/live/jev-player/jev-player-2026-09-20T23-01-26-403Z-c5047f/`.
The startup snapshot has no ranks closed yet (too early to judge); it selected
the dagger then wielded it, with field travel still among Jev's options. Do not
count a selection as learning until the observer records a rank/mindstate gain,
and do not count progress as success until the server confirms circle 2.

Follow-up live snapshot (23:04:19 UTC): v19 remains `playing`, with 35
decisions, one kill, 0/84 circle-rank points and all 19 requirement rows still
open. The new observer has seen 49 learning-stage advances in 173 seconds;
Expertise is `learning`, and several defensive/combat skills are also learning
or perusing. That is promising breadth of learning, but not yet a rank closure.
The Jev player page was browser-checked and now surfaces rank points, rows
closed, learning-stage advances, time since measured gain, and the exact unmet
requirement table. Existing older v10/v11 controls are still live at their
45-minute caps: at this snapshot v10 had 27 kills and 68 rank points remaining
with no requirement row complete; v11 had 11 kills, 71 points remaining, and
one row complete. They remain circle 1, so combat volume alone is insufficient
evidence and neither is called a pass.

At 23:05:12 UTC v19 was still live at 44 decisions / 2 kills and unchanged
0/84 gate points, with 66 learning-stage advances since baseline. The dashboard
now displays that count separately from rank closure; the HTML module parses
and the live page's rank/gate cards and data binding were browser-verified.
This is early process evidence only—the 30-minute cap remains the evaluation
window.

Follow-up command inspection confirms the v19 `analyze flame` choices are
accepted by the server: the event stream shows flame combo 1/3, 2/3, and
successful completion, with no cooldown rejection. Leave its five-second
wrapper cooldown unchanged; the next choice is based on the real RT-legal
action window.

Added an independent chargen experiment seam: `physical-combat-v1` preserves
the existing 10 STR / 10 CON / 5 AGI / 5 REF control, while
`mental-learning-v1` allocates the same 30 points as 10 INT / 10 DISC / 10 WIS.
Set `JEV_PLAYER_STAT_POLICY=mental-learning-v1` when launching
`scripts/jev-player-world.mjs`; every manifest records both policy name and
allocation. On a human's base-35 stats, the modeled change is about 3.4% more
skill-pool capacity and 2.6% higher Wisdom pulse factor; it may also reduce
combat survivability, so the hypothesis is improved rank closure per minute,
not assumed success. Focused unit coverage checks equal point budgets, modeled
modifier direction/size, and rejects unknown policies.

The previously live v10 control then reached its 45-minute cap and finished:
status `complete` / `time-cap`, circle 1, 27 kills, 66 rank points short, 18
unmet rows, and only Evasion's row complete (rank 6). Ranks include Small
Edged 4, Slings 4, Evasion 6, Physical Fitness 4, Melee Mastery 1, Parry 1,
Defending 2, Light Armor 1, Athletics 1. This is the strongest completed
unboosted 45-minute receipt so far, but far from circle 2. v11 remains live,
also with Evasion complete; do not count it until its cap and final manifest.

Matched chargen experiment `jev-stat-allocation-2026-09-20-23-10-10` is now
running two 45-minute, ordinary-WebSocket Barbarian/Human players under the
same v19 decision policy and separate disposable databases. Physical control:
`jev-player-2026-09-20T23-10-24-325Z-262a29` (`physical-combat-v1`, 10 STR / 10
CON / 5 AGI / 5 REF). Mental candidate:
`jev-player-2026-09-20T23-11-18-442Z-499e0b` (`mental-learning-v1`, 10 INT / 10
DISC / 10 WIS). Both passed the startup check with their own manifest and event
file present, status `playing`, and zero errors at launch. Each manifest carries
the same `comparisonId`; they started 54 seconds apart. The accidental first
mental startup, `jev-player-2026-09-20T23-10-24-325Z-836f0f`, failed before any
decisions because concurrent runners shared `latest.json.tmp`. Its manifest is
marked failed; the shared discovery pointer now uses a run-specific temp file
and records startup errors. The failed attempt is excluded from the pair.
Current source hashes: player runner
`2553b7661bf66abe2b80a4d20e3e109fb459af74f78ad3642171be7db330d958`, stat
policy `f68574ffe640769ddce28175a84a66be85dd659bfd7b1fc2707277b07a6a0db4`,
progress observer `cdd25b45165bfbf199bfa60ad1464df6bbd42e9ae4151c9ae98d4d2772794b9e`,
and decision policy
`7b705af87995b5172205850b5affd87cf93a6899bdb05c689ef565932a33a4bc`.

Both matched stat-allocation runs completed their 45-minute caps. Physical
control `...262a29` finished at 15/84 points, 0 rows closed, and 21 kills;
mental candidate `...499e0b` finished at 14/84, 0 rows closed, and 16 kills.
Both remained circle 1 with 19 requirements unmet and no errors. The physical
run led by one rank point and five kills, while the mental run closed the first
survival lane (1/4) and physical did not. This single pair weakly favors
retaining physical-combat as the default; it does not establish statistical
superiority or explain the larger progression-rate deficit.

## 2026-09-21: loot-accounting defect and observation cadence

Reviewing completed v19 traces showed zero `sell` commands across the reviewed
runs. Skin results use prose such as `add  a marsh hog hide, to your pack`;
the harness item matcher retained the trailing comma, so harvested hides never
entered its sale ledger. Replaying the historical event text with the corrected
normalizer found 5 hog hides + 8 kobold hides in the 30-minute c5047f run, and
7 hog hides + 12 kobold hides in the 45-minute physical control. These have
nominal catalog values of 280 and 408 silvers (vendor payout is half: 140 and
204), respectively. This is meaningful funding the trainer loop previously
lost, not a claim that selling alone closes the circle gate.

The independent Jev harness now strips trailing list punctuation before item
matching, records harvest quantities, offers one batched `sell <item> <qty>`
choice at the tanner, and reconciles quantity from the server's sale response.
Regression tests cover actual skin prose, multi-item harvests, sellable-item
filtering, batched commands, and sale quantity reconciliation. No native game
code changed for this fix.

The same historical trace also contains a real movement refusal for overload:
`You are overloaded! Drop, bundle, or sell something before you can walk.` The
Jev policy now treats that observed server text as a temporary constraint:
while safe and away from the tanner, it presents bundling for tracked hog/kobold
hides; at the tanner, it presents sale; wounds and recovery still take priority.
Successful bundle/sale messages update harness state and are logged. Tests
verify the overload-only action menu and safety priority.

The previous 30-minute observation-cadence candidate is
`jev-player-2026-09-21T02-35-42-765Z-d9f287` (started with the 12.5-second room
refresh / 20-second combat assessment policy, before the loot fix). Its result
must not be mixed with a loot-fix run. Historical `look`/`assess` command counts
were partly controller-issued stale-state refreshes, not Jev's selected
decisions; the controller cadence is now explicit and separately testable.
At the 02:52:57 UTC control checkpoint, d9f287 was still `playing`: 10 kills,
1/84 circle-rank points, 0 rows closed, and all 19 requirements unmet. It has
no harvest/sale events because it predates the loot-accounting code.

The next exploratory candidate, policy v21, launched at 02:54:40 UTC as
`jev-player-2026-09-21T02-54-40-822Z-1a8999`, with a 30-minute cap,
Human/Barbarian, `physical-combat-v1`, a fresh disposable world, and no
comparison ID. It includes punctuation-safe harvest tracking, batched tanner
sales, overload-triggered hide bundling, refreshed observation cadence, and
lane-specific forage/hunt descriptions. It is not a matched pair: its start is
staggered and policy includes multiple linked harness improvements. Its
manifest/event trace and component code hashes are the receipt; judge Circle 2
and requirement-row closure, not loot proceeds or activity counts.

At the 03:02 UTC checkpoint, the v19 cadence control had 5/84 rank points,
zero closed rows, 19 unmet rows, and 12 kills after 26.6 minutes. The v21
candidate had 0/84, zero closed rows, 19 unmet rows, and 5 kills after 7.9
minutes. Both were still healthy (`playing`, advancing manifest heartbeat, no
errors), so these are interim observations, not final run outcomes. Across the
34 retained run manifests, none had reached circle 2; the strongest completed
unboosted run remains 15/84 after 45 minutes. This points to a structural
progression-rate problem, not merely the latest parser defect.

The v19 cadence control subsequently reached its 30-minute cap at
`2026-09-21T03:05:42Z`: circle 1, 6/84 rank points, zero requirement rows
closed, 19 unmet, 12 kills, no errors. Final rows were Expertise 1/8, first
weapon 2/8, second weapon 1/8, Evasion 2/6; all remaining rows were 0. Its
trade ledger retained 6 hog hides, 5 kobold skins, and 5 strongboxes. This
control predates sale/bundle integration and cannot evaluate those changes.
At the `03:06:46Z` v21 checkpoint, the candidate was still live at 12.1
minutes, circle 1, 0/84, 19 unmet, 8 kills, and 11 tracked hide/trophy items.
It is the run whose action payload omitted sale and overload state from the
option builder; exclude it from evaluating v23.

The v21 trace has many repeated skin commands, but most were legitimate retries
after the server explicitly said the cut fumbled. One `skin kobold` after a
successful harvest returned `There is no such corpse here`, so there is a
smaller stale-room retry defect, not seven duplicate successful harvests as an
earlier reading suggested. The independent wrapper now counts visible corpses
and successful skins per species, suppressing skin choices once all visible
bodies of that species have been harvested while preserving retries after a
fumble and allowing additional visible bodies. Focused tests cover one
harvested body, multiple bodies, and a newly unharvested body. This is policy
v23; the already-running v21 process does not load the fix, so live validation
requires a later run. No native DR game logic was changed.

## 2026-09-21: runtime loot state was not reaching legal actions

An audit of the live v21 choice payload found a more consequential integration
defect: the model's context included `saleItems`, `saleCounts`, and overload
state, but `playerGoalOptions` was called with a different `policyVitals`
object that omitted all three (and bundled-item state). As a result, despite
the policy helpers and their isolated tests supporting tanner routes and
bundling, the actual controller never offered those actions. The candidate
could not make an informed tanner choice; overload recovery was likewise
unavailable. Previous notes describing those features as live behavior were
premature.

Policy v23 now builds action-selection vitals through a shared, unit-tested
adapter that carries harvested quantities, bundled state, and the observed
overload flag into the legal-action builder. A controller-level regression
confirms tracked loot creates a tanner route and overload exposes only valid
bundle choices. The adapter also carries v22 corpse-deduplication state.
Validation is unit-level for now; the existing v19/v21 processes have old code
loaded, so this fix needs a fresh run before claiming runtime effectiveness.

## 2026-09-21: prompt-before-text broke wound retry cooldown

The first v23 live trace exposed another event-ordering mismatch. The server
emitted a prompt immediately before the corresponding bandage-failure text.
The runner cleared `lastCommandActionId` on every prompt, so it failed to
recognize five consecutive failed `tend` actions and never activated its
three-minute wound retry cooldown. At one point HP was 73/145 with worsening
back bleeding; a fresh safety check later showed the character had recovered
to 116/145 with no active bleeding, so the isolated run was left intact.

Policy v24 now preserves a pending command/action correlation briefly across a
prompt, then expires it; a recognized failed bandage logs the wound and starts
the existing cooldown. Regression coverage checks immediate prompt-before-text
correlation and expiration. The running v23 worker cannot validate this fix;
it requires a v24 run. The failure and recovery both remain in its saved trace.

At the `03:14:40Z` v23 checkpoint, the 30-minute worker was healthy at 7.1
minutes, 0/84 rank points, 0 rows closed, 19 unmet, 3 kills, and no errors. It
had executed three separate `sell_field_loot` trips and sold three individual
hides (one per transaction), demonstrating that v23 repaired action wiring
but that Jev may spend substantial time traveling to sell small batches.
Policy v25 adds a narrow economic rule: outside overload recovery and when
already at the tanner, only offer a field sale trip once purse plus estimated
proceeds can fund at least the cheapest 40-silver guild training action. A
focused test covers deferral, threshold crossing, and immediate sale at the
vendor. This policy still needs live evaluation; the v23/v24 workers retain
their loaded versions.

At the `03:18:43Z` checkpoint, v23 had reached 11.2 minutes with 5 kills and
1/84 points (still 0 rows closed, 19 unmet); its three single-hide sales are
confirmed in the event ledger. The v24 run was at 4.8 minutes, 2 kills, and
0/84. Its trace confirms the prompt-order fix: after a `tend` failure at
`03:16:08Z`, the runner logged `tend-failed` for the left arm and set
`retryAfter=03:19:08Z`. No further tend was issued by the `03:18:43Z` sample,
while HP was 116/145 and the wound remained slight. This is positive live
validation of v24's wound cooldown, not circle-progression success. At this
sample, v25 still needed a live test; the next step was to validate the tanner
threshold after the existing workers finished.

At `2026-09-21T03:20:21Z`, v21/v23/v24 remained active and v25 was launched as
a fourth independent disposable-world worker to test the one-lever tanner
threshold. Run
`jev-player-2026-09-21T03-20-11-115Z-2ca72f`, Human Barbarian,
`physical-combat-v1`, 30-minute cap, no comparison ID. Startup check confirmed
`playing`, manifest and growing event file, and zero errors. Manifest:
`public/live/jev-player/jev-player-2026-09-21T03-20-11-115Z-2ca72f/manifest.json`;
dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T03-20-11-115Z-2ca72f`.
The decision-policy SHA-256 is
`41cef8d261f357b4999a61e8d6faf6f218867e24a8516aa32bd7bd14d41afaa1`; at the
9-second launch sample it had 0 rank points, which is not a progression result.

At the `03:21:12Z` checkpoint, the older v21 worker was at 26.5 minutes,
6/84 points, 0 rows closed, 19 unmet, and 18 kills; v23 was at 13.7 minutes,
1/84, 0 rows closed, and 7 kills. v24 was at 7.25 minutes, 0/84, 2 kills,
with two failed-tend events logged about three minutes apart and the latest
retry deferred until `03:22:18Z`. The v25 worker was at one minute, 0/84,
zero errors, and had not yet produced loot; it is too early to judge its
batching policy. All four remained `playing` with advancing manifests.

At `03:24:40Z`, v21 completed its full 30-minute cap at Circle 1 with 7/84
rank points, no closed rows, 19 unmet rows, and 19 kills. Its final requirement
snapshot had Expertise 2/8, Small Edged 2/8, Slings 1/8, Evasion 1/6, and
Tactics 1/2; all other requirements remained empty. This confirms that kills
and high learning states do not by themselves satisfy the trainer-ranked
circle gate. At the `03:25:11Z` live receipt, v23 was healthy at 17.7 minutes,
3/84, 0 rows closed, 19 unmet, and 8 kills; v24 was healthy at 11.3 minutes,
0/84, 0 rows closed, 19 unmet, and 3 kills; v25 was healthy at 5 minutes,
0/84, 0 rows closed, 19 unmet, and 2 kills. Each had an advancing manifest
and no recorded errors. They remain separate disposable worlds; none has yet
validated Circle 2.

The v24 trace also identifies a harness-efficiency issue: while a botched
bandage is on its three-minute retry cooldown and HP is already at the outdoor
rest ceiling, the only offered action is `wait_for_clotting`. Jev was asked to
reselect that same no-op 40 times in the 11-minute sample. Policy v26 now
defers the next choice request until the known retry deadline in this narrow
healthy, out-of-combat case; it does not defer during combat, below the rest
ceiling, after the wound closes, or after cooldown expiry. Focused regression
tests pass. Already-running v23/v24/v25 processes have the old module loaded,
so v26 still requires a fresh isolated live run. This saves no-op calls but is
not progression evidence or a claimed improvement to Circle-2 results.

At `03:33:13Z`, the three prior workers were still live and healthy: v23 at
25.7 minutes, 5/84 points, 0 rows closed, 19 unmet, 13 kills; v24 at 19.3
minutes, 1/84, 0 rows closed, 19 unmet, 8 kills; v25 at 13 minutes, 0/84, 0
rows closed, 19 unmet, 7 kills. No deaths or provider errors were recorded.

The gate remains broad: a 30-minute run still has no completed Circle-2
requirement row. An audit found that the optional crier quests are absent from
the Jev action menu even though their documented in-game rewards provide
silver and skill experience in requirement-eligible skills. Policy v27 now
mirrors the ordinary quest-journal frame (including its null/cleared state),
offers Jev the nearest town-crier route and visible town-crier acceptance as optional
choices, exposes a completion claim, permits courier delivery only at the
matching visible NPC, and lets Jev abandon an impractical optional task. Quest
actions are hidden during overload, bleeding, or below-ceiling recovery. This
is an independent wrapper change; native DR mechanics remain untouched.

Focused Jev/wire tests pass 43/43, including quest-journal lifecycle, action
eligibility, recovery/overload exclusions, syntax checks, and `git diff
--check`. A fresh 30-minute isolated v27 worker was launched at
`2026-09-21T03:33:50Z`: run
`jev-player-2026-09-21T03-33-50-402Z-ba5117`, Human Barbarian,
`physical-combat-v1`, no comparison ID. The launch receipt showed `playing`,
1 second elapsed, 0 rank points, and no errors (not yet an outcome). Manifest:
`public/live/jev-player/jev-player-2026-09-21T03-33-50-402Z-ba5117/manifest.json`;
dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T03-33-50-402Z-ba5117`;
launcher log:
`/tmp/jev-policy27-20260921T033350Z.log`. The prior three processes were
left running unchanged. This experiment adds quest options and incorporates
the already-unit-tested tend-cooldown scheduler; its comparison with v23-v25
is directional, not a controlled one-variable cohort, and it must not be
reported as a promotion until the full run is evaluated against the circle
gate.

Launch integrity correction: the detached first attempt
`jev-player-2026-09-21T03-33-50-402Z-ba5117` stopped updating at 1 second and
its process was absent at the next check; its manifest remains stale as
`playing` and is not a live or completed result. The external shell did not
write a termination receipt. A replacement was started in a managed process
session (session 54062), run
`jev-player-2026-09-21T03-35-50-926Z-0c7f41`. At `03:37:04Z`, both its
launcher and Jev child were present, its manifest heartbeat was current at 73
seconds, and it had zero errors. It had not yet earned rank points or taken a
quest; at initial choice, Jev assigned `take_quest` probability 0.01 and
selected the guild-hall route at 0.64. This is useful choice telemetry but too
early to evaluate the quest option's effect on progression.

At `03:38:16Z`, v23 had completed its full 30-minute cap at Circle 1 with
5/84 points, 0 rows closed, 19 unmet, and 13 kills; this remains below the
earlier v21 result of 7/84 and is not a policy promotion. v24 was at 24.3
minutes with 2/84 and 10 kills; v25 was at 18.1 minutes with 2/84 and 9
kills. The managed v27 retry was healthy at 2.4 minutes, 1 kill, 0/84, no
errors. Its early action trace shows a guild-hall route, then starter-kit
shopping and a field hunt; no quest was accepted yet. Do not infer a quest
effect from this early sample. The orphaned first v27 receipt remains stale
and must be excluded from run counts.

At `03:39:34Z`, v24 was still active at 25.6 minutes, 2/84 points, 0 rows
closed, 19 unmet, 11 kills; v25 was active at 19.4 minutes, 3/84, 0 rows
closed, 19 unmet, 9 kills. v27 was healthy in its managed session at 3.7
minutes, 0/84, 2 kills, no errors. Its choice trace shows Jev selected the
guild-hall route over `take_quest` at the initial square (0.55 vs 0.01), then
selected starter-kit shopping over training while at the hall. Later in the
bazaar, the crier route received 0.08–0.12 probability while Jev preferred
Performance and field hunting. This is not a completed outcome, but it
suggests the generic “optional quest” framing understates the coin value when
the player has less than the 40-silver minimum training lesson. Next tuning
candidate: make that funding consequence explicit only when purse is below
40 and the nearest crier is close, then measure whether Jev chooses it and
whether the resulting claim funds eligible training. Do not auto-select or
force the quest; preserve Jev's choice and compare its score/action/result.

Policy v28 implements that falsifiable low-funds lever: only when the purse is
below 40 and the nearest crier is at most three rooms away does the route
description state that a first-circle claim pays at least 49 silvers, enough
to fund a trainer lesson; otherwise the generic optional-quest wording remains.
At the crier itself, acceptance has the same conditional funding context.
This changes Jev's presented evidence and framing, not the selected action or
the world. Focused policy/wire tests pass, including a check that low funds do
not prioritize a distant crier.

A separate 30-minute v28 worker was started in managed session 57733 at
`2026-09-21T03:43:03Z`: run
`jev-player-2026-09-21T03-43-03-013Z-bff206`, Human Barbarian,
`physical-combat-v1`, no comparison ID. At `03:43:17Z`, its launcher and Jev
child were present, the manifest was `playing` with a current heartbeat, 13
seconds elapsed, and zero errors. Manifest:
`public/live/jev-player/jev-player-2026-09-21T03-43-03-013Z-bff206/manifest.json`;
dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T03-43-03-013Z-bff206`.
This is a directional comparison with v27, not a promotion or a matched
cohort. The v27 session remains live; earlier v24/v25 runs were also still
active at launch. No native DR files were edited.

At `03:45:22Z`, v24 had completed its cap at Circle 1 with 6/84 points, no
rows closed, 19 unmet, and 13 kills. v25 remained active at 25.2 minutes,
4/84, 0 rows closed, 19 unmet, 11 kills. v27 was at 9.5 minutes, 0/84, 0
rows closed, 19 unmet, 4 kills. v28 was healthy at 2.3 minutes, 0/84, 1
kill, and no errors; Jev had accepted the crier kill task “Slay 4 more
kobolds” and the journal had advanced to “Slay 3 more kobolds.” This is live
evidence the conditional low-funds framing can get Jev to choose the crier and
make objective-matching progress. It has not yet yielded requirement-rank
points, a quest completion, or a Circle 2 milestone; the effect remains
unproven until the capped run finishes.

The v28 injury trace adds a concrete kit-survival hypothesis. At its
`03:46:22Z` sample, the character was using an oaken club against a kobold;
after sustained damage it escaped at 66 HP with a moderate chest wound and
only 5 silvers. At `03:49:08Z`, it had recovered to 116/145 but still had the
moderate wound and an incomplete “3 more kobolds” quest. This is not enough to
attribute the wound to missing armor, but the run confirms that v28 chose a
dagger + 112-silver club + sling and entered the field without armor.

Policy v29 adds an opportunity-cost explanation to each purchase: if an
expensive weapon would leave no currently affordable distinct armor lane,
Jev sees the resulting purse and the Circle-2 armor/protection tradeoff.
Focused Jev tests now pass 44/44, with syntax and diff checks clean. The
separate 30-minute v29 worker was launched in managed session 49056 at
`2026-09-21T03:48:35Z`: run
`jev-player-2026-09-21T03-48-35-348Z-b2dcd4`, Human Barbarian,
`physical-combat-v1`, no comparison ID. At `03:49:21Z`, its processes and
heartbeat were healthy. Jev selected dagger, sling, wooden shield, and leather
boots (145 silvers total) instead of the 112-silver club, then chose the
nearby crier and accepted a kobold task. This early action sequence supports
the kit-budget hypothesis behaviorally, but 0 kills/0 rank points at that
snapshot is too early to establish survival or progression improvement. The
v28 and v29 runs are not controlled twins, so treat the contrast as
directional only.

At `03:50:31Z`, v25 had completed its 30-minute cap at Circle 1 with 4/84
points, no rows closed, 19 unmet, and 14 kills. v27 remained active at 14.7
minutes, 1/84, no rows closed, 19 unmet, 5 kills, 116/145 HP, and a light
left-arm wound. v28 was active at 7.5 minutes, 0/84, 2 kills, 81/145 HP, no
bleeding, with two kobolds remaining on its quest. v29 was active at 1.9
minutes, 0/84, 1 kill, 115/145 HP, no bleeding, and a new marsh-hog quest
with three remaining. Both v28 and v29 remained error-free. The armor-budget
warning changed the observed choice sequence as intended (sling + shield +
boots instead of the club), and v29 accepted a quest; whether that combination
improves survival, requirement closure, or Circle-2 completion remains open.

At `03:51:40Z`, v28 was active at 8.6 minutes, 0/84, 0 rows closed, 19
unmet, 2 kills, 76/145 HP, slight right-arm bleeding, and its kobold quest
had two remaining. v29 was active at 3.1 minutes, 0/84, 0 rows closed, 19
unmet, 2 kills, 92/145 HP, no bleeding, and its marsh-hog quest had three
remaining. The opening v29 run has two kills with less observed injury than
v28 at this checkpoint, but timing, targets, and combat exposure differ; this
is only an early directional survival signal. Neither run has earned a Circle
2 rank point or completed a requirement row yet. v27 was active at 15.8
minutes, 1/84 and 5 kills; v25 completed at 4/84. All active manifests had
fresh heartbeats and zero errors at the checkpoint.

The historical ceiling remains discouraging: the best completed natural-speed
run is 45 minutes, 15/84 rank points, zero requirement rows closed, and still
Circle 1. This turn added an explicitly opt-in x20 experience/recovery
diagnostic to the disposable-world launcher only; normal runs remain unboosted,
and both the manifest and dashboard identify accelerated runs. At its first
74-second checkpoint, run `jev-player-2026-09-21T03-59-42-882Z-767473` had
received the server's `[BOOST x20]` confirmation, was error-free, and remained
at 0/84. That checkpoint is too early to assess leveling efficacy; it is a
diagnostic separation of agent choices from natural XP throughput, not a
natural-progression result.

At the next live checkpoint (`04:03:50Z`), that boosted run had advanced to
26/84 points and closed 2 rows in 245 elapsed seconds (2 kills, no errors),
with 17 requirements still unmet. The contemporaneous natural v30 run was at
390 seconds, 0/84, 0 rows closed and 2 kills; v27 was at 1,678 seconds, 9/84,
0 rows closed and 8 kills. The accelerated-vs-natural difference is now large
enough to identify raw XP throughput as a major bottleneck in short runs. The
boosted run is still only diagnostic: it has not reached Circle 2, and no
natural run has done so. The rate must not be extrapolated linearly because
rank thresholds and requirement distribution change as skills rise.

To test a natural-speed duration long enough to plausibly clear the 84-point
gate, the isolated launcher/player cap was extended from 60 to 360 minutes. A
240-minute unboosted run, `jev-player-2026-09-21T04-05-12-634Z-07154a`, was
started with a fresh manifest and no errors. Its dashboard is the authoritative
live receipt; early startup progress is not counted as leveling evidence.

The active x20 trace exposed a wrapper defect at the guild hall: with 75
silvers, Jev repeatedly selected lessons whose true server prices were 120 and
140. The wrapper had estimated from stale rank-0 entries in the top-10
mindstate feed rather than current requirement rows. The trace logged 89
insufficient-funds training refusals by `04:10:20Z`, wasting decisions while
the character stayed at the hall. Policy v31 now uses the displayed rank for
fixed requirements and the highest displayed lane rank as a conservative
price ceiling for Nth-skill alternatives. A regression verifies options stay
hidden until the corresponding ceiling is affordable; Jev policy and wire
tests pass 46/46. A 10-minute x20 verification run,
`jev-player-2026-09-21T04-09-52-286Z-0efaf1`, started under v31; its initial
28-second snapshot was still in the bazaar, before any trainer action, so the
runtime fix is not yet behaviorally confirmed.

Policy v32 adds a fallback for contradictory/stale menus: an actual server
response that a training lesson is unaffordable blocks that exact train action
until the player changes rooms, and writes a structured receipt with the exact
price and purse. The v32 event-correlation helper is unit-tested. At the latest
checkpoint, the v31 diagnostic had advanced to 12/84, closed one row, and logged
no trainer refusal in 203 seconds (but had not revisited the guild hall after
the v31 pricing change); this is encouraging but not yet a hall-return test.
The long natural run was at 482 seconds, five kills, 0/84 and zero rows closed.

At `04:14:50Z`, the 10-minute v31 x20 verification had 297 elapsed seconds,
23/84 points, one row closed, two kills, and zero trainer refusals; it had not
yet returned to the guild hall or attempted training, so only the static menu
gate is indirectly exercised so far. The 240-minute natural run had 576
seconds, five kills, 0/84, and zero rows closed. It completed two affordable
guild lessons without refusal and returned to the fields with 117 silvers.
Neither is close to proving Circle 2 yet; both manifests continue to heartbeat.

The v31 pricing gate has now been behaviorally exercised on a guild return:
at `04:15:26Z`, the boosted candidate chose `guild_hall` from West Road with
51 silvers; on arrival, its action set contained no trainer actions at that
purse. Jev performed, waited, and selected a field route instead of repeating
the unaffordable lessons seen in the old x20 run. It left without a trainer
refusal. This confirms the static pricing fix changes live decisions; v32's
refusal-triggered suppression remains a fallback and has not yet been observed
after a live refusal.

The 10-minute v31 x20 run completed at `04:19:52Z` with 40/84 points, five
rows closed, 14 unmet, three kills, and zero trainer refusals, but it remained
Circle 1. Its final trace disproved an early interpretation of the route fix:
with 51 silvers and zero trainer actions, it repeatedly oscillated between
Fields Furrow and the Barbarian hall (at least eight trips in the final 100
seconds). v33 therefore gates the hall route on an actually affordable lesson
(or circle-up / learnable Dragon Form), not the old generic silver threshold.
The fresh natural-speed v33 run `jev-player-2026-09-21T04-19-37-526Z-2d70e1`
has started; the 22-second opening snapshot is too early to evaluate the route
change.

At `04:21:37Z`, v33 had 110 elapsed seconds, one kill, 0/84 points, and 15
silvers in Fields Furrow on a courier quest. Its legal-action list included
field skills and alternate hunt areas but no `guild_hall` route; the process
was error-free. This exercises the low-silver route gate from the field, but
the run has not yet demonstrated an away-and-return cycle or Circle-2 gain.

The latest natural receipts clarify a separate progression bottleneck: the
45-minute physical and mental chargen comparisons ended at 15/84 and 14/84,
respectively, with zero rows closed, while the 240-minute natural run was at
5/84 after about 20 minutes. The displayed Circle-2 gate requires four
distinct weapon lanes. Jev's harness offered wield choices only for weapons it
had purchased, despite brawling being an eligible lane that can be trained by
fighting unarmed. Policy v34 adds a Jev-selected `remove <equipped weapon>`
choice only while safely out of combat and only while brawling is still an
unmet weapon lane; after a confirmed removal, a two-minute dwell prevents
immediate re-equipping. This is an independent harness option using the
existing player command, not a native game change. Its unit test passes; a
natural live run is still needed to establish whether Jev selects it and the
server awards brawling progress.

At `04:31:25Z`, the v33 natural run had reached 707 seconds, seven kills, and
still 0/84 circle-rank points with no requirement row closed; this reinforces
that mindstate activity and kills alone are not enough evidence of leveling.
The concurrent v34 run had only 92 seconds, no kills, and no rank points; it
had accepted a crier task to slay four sewer rats. Inspection exposed that the
v34 candidate builder only offered North Fields destinations, and its kill
target parser expected “slay N more …” while this real task said “Slay 4 sewer
rats and I'll see you paid.” Policy v35 accepts both forms, maps the named
target against creature data, and offers the nearest non-field room whose game
spawn table includes that target. A regression verifies the exact live quest
wording routes to a sewer room and that visible target prey is offered as the
attack instead of a redundant trip. The policy tests pass 23/23; this routing
change still needs natural-run evidence that Jev accepts and completes the
quest.

The next live-event review found two v35 regressions before treating that
version as validated. First, the action builder expected equipment `type` or
`slot`, but wire-session hand snapshots contain only the equipped item name;
the brawling choice was therefore absent from real decisions. Its test now uses
that exact wire shape and resolves the name through the item catalog. Second,
v35 offered a non-field Riverhaven spawn route for marsh hogs even though the
North Fields hunt already supported the target. v36 only adds a non-field
quest route if no North Fields destination spawns that target. Targeted Jev,
policy, and wire tests pass 32/32 after these corrections. The live v35 run had
not yet reached a quest-route decision at the latest review; the earlier v34
run was at four kills and 0/84 after about seven minutes, so natural
progression remains unproven.

At `04:38:19Z`, natural v33 had 13 kills and 3/84 points at 18.7 minutes; the
old-policy 240-minute run had 9/84 at 33 minutes, both with zero requirement
rows closed. These are small, early checkpoints and do not justify extrapolating
to a final circle result. The v35 event trace did contain `quest_hunt_rh_wilds_1`
for marsh hogs even though Jev ultimately chose the North Fields route; v36
removes that competing option whenever the target is already present in a
North Fields hunt. The live v36 candidate `jev-player-2026-09-21T04-37-45-755Z-b2202b`
was confirmed natural-speed and error-free. At 53 seconds, Jev selected
`remove a plain dagger`; the server confirmed removal, the wrapper logged the
120-second weapon dwell, and the ordinary player later fought a marsh hog with
fists. At 107 seconds, the server's learning feed showed Brawling at
`attentive`, while its rank remained 0 and the Circle-2 total remained 0/84.
This verifies the brawling action end-to-end through real Jev choice and game
response, but not a closed requirement. Policy v37 therefore extends the
bounded weapon hold: it remains focused on Brawling until rank 2 or a
12-minute timeout, and includes that focus in Jev's objective. The targeted
Jev/policy/wire suite passes 33/33; v37 still needs a live natural run. No
current run has closed a Circle-2 requirement row.

An event-level command audit found why v36 never matured Brawling: the native
`remove` handler reads only its first argument, so the generated multiword
command `remove a plain dagger` was parsed as `remove a` and actually removed
the shield, then boots. The player repeatedly re-equipped the dagger and
re-entered the same loop; at 484 seconds it had three kills, zero rank points,
and zero closed rows. This was a harness command-construction error, not a
reason to alter native commands. Policy v38 resolves the wire-visible equipment
name through the item catalog and sends the one-token item ID (`remove
dagger`). The v37 candidate was gracefully stopped after 94 seconds before it
reached this action. Syntax and 33 targeted Jev/policy/wire tests pass with the
v38 correction; a fresh natural run is required to confirm the item removed,
the 12-minute focus, and any Brawling rank gain.

At `04:47:06Z`, the natural-speed v38 run `jev-player-2026-09-21T04-46-10-794Z-1acd00`
selected `remove dagger`; the server replied `You remove a plain dagger.` and
the current equipment snapshot still showed the wooden shield and leather
boots. The wrapper logged the Brawling focus through `04:59:06Z`, then the
player reached Fields Furrow. At 72 elapsed seconds it had no Brawling rank or
Circle-2 point yet, so this validates the corrected verb and focus wiring but
not Brawling progression. Concurrent natural snapshots were v33 7/84 at 27.6
minutes and the older long run 11/84 with one row closed at 42 minutes; neither
had reached Circle 2.

At `04:48:04Z`, v38 had 123 elapsed seconds, one kill, and no rank point yet.
The learning feed had Brawling at `absorbing` (rank 0); equipment still showed
the shield and boots, with no dagger re-equipping after the ID-based removal.
The 12-minute focus was still active, so this is early positive skill-pool
evidence, not yet requirement progress.

At `04:49:33Z`, v38 had 210 elapsed seconds and two kills; its Brawling feed
had advanced to `nearly locked` (still rank 0), while the dagger remained out
and the shield/boots remained equipped. It still had 0/84 Circle-2 points and
no closed rows. This shows the corrected focus is concentrating combat
experience into the missing Brawling lane; rank conversion remains to be
verified.

At `04:49:02Z`, v38 had reached 171 elapsed seconds and one kill; Brawling was
`riveted` at rank 0. The dagger had remained out since the confirmed
`remove dagger`, the shield and boots were still equipped, and the 12-minute
focus had not expired. No Circle-2 points or rows were closed at this
checkpoint.

## 2026-09-21 — progression gates and failed-skin churn

Fresh natural-run manifests exposed a policy-level mismatch: the harness
offered a 12-minute unarmed Brawling focus while Barbarian Circle 2 still had
an unmet hard Melee Mastery requirement. In the game implementation, Melee
Mastery receives field experience only alongside melee-weapon swings
(`server/combat.js`); unarmed Brawling swings do not train it. The long natural
run `jev-player-2026-09-21T04-05-12-634Z-07154a` was at 13/84 displayed Circle-2
rank points after about 49 minutes, with Tactics 2, Expertise 4, Slings 3,
Small Edged 2, Evasion 1 and Fitness 1, but Melee Mastery and Parry still 0.
This is evidence that prioritizing an additional weapon lane before this hard
gate can delay the overall path. Policy v40 now withholds the unarmed option
until the displayed Melee Mastery requirement is satisfied; a fresh natural
run must validate whether this improves progression.

The same run's event history showed repeated failed skinning attempts on
visible corpses only seconds apart. Policy v39 added a 20-second, corpse-name
retry backoff in the Jev runner so repeated fumbles don't dominate its
decisions. Both changes are harness-only. The focused policy/Jev/wire suite
passes 34/34. Before the new v40 candidate, neither change had been measured
live. The natural v38 candidate is an unmodified control and had 0/84 rank
points after roughly 7.5 minutes; no natural run has yet reached Circle 2.

At 505 seconds the Trader v40 run had four kills and 1/56 rank points, with
zero closed rows and no errors. It had returned to the guild district with 21
silvers and was still cycling Performance and guild training. This is the
first observed rank conversion for the Trader cohort, but it predates v41's
field/lore menu changes and is far too early to infer Circle-2 pacing.

The v40 natural-speed validation is now live in a disposable isolated world:
`jev-player-2026-09-21T04-58-58-958Z-af684d` (45-minute cap, 1x experience,
physical-combat-v1 stats). Dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T04-58-58-958Z-af684d`.
At startup it was playing without errors; its initial menu correctly omitted
`practice_brawling` while Melee Mastery was 0/8, and Jev chose to buy and wield
a dagger. This verifies the new legal-action gate and first choice, not yet any
rank gain or Circle-2 improvement. Existing natural runs were left running as
controls; they are not matched-seed comparisons.

To test whether guild requirements are a structural part of the stall, the
isolated runner now accepts `JEV_PLAYER_GUILD` (default `barbarian`) and records
the selected guild in the manifest. This does not change native chargen or
world behavior. Circle 2 requirements currently sum to 56 rank points for
Trader versus 84 for Barbarian, though their skill mixes differ and this is not
a direct policy-quality comparison. The natural-speed Trader candidate
`jev-player-2026-09-21T05-05-22-524Z-dd5cc0` is live with v40, Human race,
physical-combat-v1 stats, 1x experience and a 45-minute cap. Its initial gate
reported 14 unmet rows / 56 points; Jev went to the Trader hall and selected
Light Armor, Small Edged and Small Blunt lessons. The server confirmed each
40-silver lesson made progress toward its first rank; Jev then took a sewer-rat
quest and used Performance in town. At the 47-second checkpoint it had 0/56
requirement points and zero kills, as expected before field-rank conversion.
This confirms guild-specific chargen, trainer integration, and quest selection;
no leveling claim is supported yet. Dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T05-05-22-524Z-dd5cc0`.

## 2026-09-21 — prioritize missing field lanes

An event audit of the 240-minute-cap Barbarian run found Forage and
Perception-hunt practice had each been offered 32 times and selected zero
times. A second 45-minute candidate selected Perception only 6 of 65
opportunities and Foraging zero times. The same traces showed Performance was
being chosen, but no alternate Lore practice was available. This helps explain
why skill feeds could advance while entire Nth-Survival/Nth-Lore rows remained
untouched.

Policy v41 adds explicit, live requirement-row guidance for distinct Survival
and Lore lanes; when the matching Lore gate is open and Jev is safely at the
Temple/Temple Row/Academy, it offers `study`, and it offers Appraisal on a
carried catalogued item when eligible. Both are runner/policy-layer changes;
native game code is unchanged. Syntax and focused Jev/policy/wire tests pass
36/36. Existing runs were already loaded with older code, so v41 still needs a
fresh natural-speed run before its choice or progression effect can be judged.

The Trader v40 event log also showed Jev spending early guild lessons on both
Small Edged and Small Blunt even though that guild's Circle-2 table has only a
single `1st weapon` row (rank 2); investing in two distinct weapon categories
does not help that gate. Policy v42 now tells Jev to finish one practical
weapon lane when only one is required, while preserving rotation when higher
Nth-weapon rows actually exist. A regression covers both shapes. This is
prompt/action-context guidance, not a native rule change; v42 still needs a
fresh natural run for live validation.

## 2026-09-21 — expose the missing Academy route

The current live receipts confirm the progression problem is not merely a lack
of XP: after 74 minutes, the 1x Barbarian long run had 20/84 requirement points
and only one closed row. Its latest player-visible gate showed all four
Survival rows and both Lore rows still at 0; it had gained ranks in weapons,
Expertise, Tactics and Evasion instead. The earlier 45-minute Trader v40
receipt likewise showed every Lore row at 0 and Appraisal at 0, while the
agent had selected `perform` 28 times. In the menu implementation, `study`
was offered only after Jev was already at the Temple/Temple Row/Academy, with
no corresponding navigation goal from the field. So the prompt described a
useful gate-closing activity that the action menu could not reach.

Policy v44 adds an optional Jev-selected route to Asemath Academy only when a
displayed Lore row is open and Scholarship or Appraisal is eligible; it does
not force the trip or alter native game logic. A regression verifies the route
is offered from the field, omitted during combat, and omitted when those study
skills cannot close a Lore row. Focused Jev/policy/wire tests pass 38/38 and
`git diff --check` is clean.

Fresh natural-speed validation is running in a disposable Trader world:
`jev-player-2026-09-21T05-22-49-419Z-9b43ad` (45-minute cap, 1x experience,
physical-combat-v1). It started without errors and its manifest records policy
v44. Dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T05-22-49-419Z-9b43ad`.
At launch, the pre-existing runs and this candidate occupied six isolated
worlds total; no native database was used. The route's choice and rank outcome
were not yet known at startup.

At the first 2-minute trace review, v44 had offered the study route repeatedly
but Jev selected Performance, guild training, Forage, Hunt, and visible combat
instead; no rank points had converted yet. In Fields Furrow the Academy was
20 rooms away and Jev assigned its route probability 0.01, while Forage and
Hunt received 0.36 and 0.70 in their respective decisions. This is an early
choice observation, not a progression verdict, but confirms that route cost
was making the study option unattractive from the field. By 3:49 elapsed,
however, Jev selected `lore_library` from the guild district, reached the
Academy, then chose `study` with probability 0.87. The game replied that the
Academy appraisal/trade scrolls were studied. This validates route execution
and the command, but at that checkpoint Circle-2 rank points were still 0/56;
experience-to-rank conversion and closing Lore/Appraisal rows remain to be
verified.

Near five minutes, the same v44 character was still at the Academy. Jev had
chosen `study_lore` twice and `perform` several times; Scholarship had advanced
to `perusing`, Appraisal to `dabbling`, and Performance to `perusing`, all at
rank 0. The live receipt still showed 0/56 points and no closed rows, with no
errors. That is learning-pool progress after the route fix, not yet confirmed
rank progress; the next checkpoint should establish whether those pools
convert and whether Jev leaves the Academy to fill other gates.

Policy v45 therefore picks the nearest of Temple, Temple Row, and Academy
(the Academy wins ties), all of which accept `study`; the target remains an
explicit Jev choice. Unit coverage checks Temple Row from the fields and
Academy from the Trader hall. The v44 run is an unchanged in-flight control;
v45 needs a fresh run after a slot opens.

## 2026-09-21 — correction: Brawling advances Melee Mastery

A cross-check against the native mastery set (`server/player.js`)
contradicted the earlier v40 conclusion above: `brawling` is explicitly in
`MELEE_WEAPONS`. Its unarmed swings therefore do train Melee Mastery; the v40
policy's `!meleeMasteryGap` condition incorrectly hid Brawling exactly while
that prerequisite was unmet. This was a harness defect, not a native-game
mechanic. Policy v46 removes that condition, describes the dual weapon/mastery
progress accurately, and tells Jev that Barbarian mastery grows from melee
swings including Brawling, but not from ranged slings/bows. A regression now
asserts both the native set membership and that `practice_brawling` is offered
with an open mastery gap. Focused Jev/policy/wire tests pass 38/38; syntax and
diff checks pass. Fresh natural-speed validation is now
running in a disposable Barbarian world:
`jev-player-2026-09-21T05-34-37-247Z-195a95` (45-minute cap, 1x experience,
physical-combat-v1). At startup it had not yet reached the field; Jev learned
Dragon and selected guild training, with the Melee Mastery requirement visibly
open. At the 99-second checkpoint Jev was in Fields Furrow with no hand weapon,
`wsp=brawling`, and had chosen to attack visible prey; thus the wrapper's
ordinary attack action is now exercising the corrected unarmed path without a
special remove command. No kill or mastery rank had converted at that early
checkpoint. Whether those swings build Melee Mastery and close Circle-2 rows
remains to be observed. Dashboard:
`http://localhost:3000/jev-player.html?run=jev-player-2026-09-21T05-34-37-247Z-195a95`.
At 2:37, Jev had selected `practice_brawling`; the runner sent `remove dagger`,
and the server then reported fist swings followed by one marsh-hog defeat. The
manifest still showed Brawling 0, Melee Mastery 0, and 0/84 circle points. This
validates that the formerly hidden action now executes in the intended
unarmed-combat state, but rank conversion remains unproven.
At about 3:29 elapsed, Brawling's learning stage had reached `engaged` and
Melee Mastery `perusing`, both still rank 0; Jev remained in the active
unarmed fight. At 4:16, those pools had risen to `enthralled` and `learning`,
still rank 0, after one kill. Jev had fled to recover at West Gate. At 6:40,
Brawling had reached `mind lock` while Melee Mastery was `thoughtful`; both
were still rank 0 after two kills, with the player back in Fields Furrow after
resting. This is strong pool-level evidence that the corrected Brawling route
is working, but rank conversion and requirement closure are still pending.

## 2026-09-21 — v47: keep choices when roundtime expires

Reviewing the active 45-minute runs found that Trader sessions had discarded
23 and 21 Jev responses respectively. The runner uses a stale-state guard
before executing a choice. The guard treated any change in the boolean
`roundtime > 0` state as stale, including the benign transition from one
second of roundtime to zero while Jev was deciding. That transition makes an
out-of-combat command more executable, not less. The guard now permits that
expiry but still rejects a newly appearing roundtime, room/combat changes, or
dangerous health-band changes. Added a focused regression test; policy/wire
suite passes 39/39. Existing processes loaded their prior policy, so v47's
actual run-level effect is not yet measured. Circle 2 remains unproven.

## 2026-09-21 — v48: put a Trader weapon in reach

The live v47 Trader traces showed the character reaching the North Fields with
30 silvers and no purchased weapon after three 40-silver training actions. It
fought kobolds unarmed and safety-fled twice without a kill. The policy offered
no Trader kit trip because the shared guild-script data has no Trader
`weaponPlan`/`gearLedger`; modifying that shared sweep data would unnecessarily
couple this extension to native script cohorts. Instead, the Jev-only policy
now carries a minimal Trader kit plan for a 25-silver dagger (Small Edged),
which Trader can train. If the character is unarmed, the route description also
states that it supplies a held weapon for the next fight. With 30 silvers, it
should offer the bazaar route, then `wield dagger` after purchase. A test
covers both choices and asserts the shared Trader guild-script remains
unchanged. Focused Jev/wire tests pass
40/40. The two already-running v47 Trader sessions loaded old code, so this
fix still needs a natural-speed live validation. An offline replay of an
actual v47 observation at the Academy (36 silvers, no weapon purchased,
1st-weapon row 1/2) now emits a Trader `starter_kit` route describing the
25-silver dagger and its remaining 11-silver balance. This verifies the
observation-to-choice path, not that a live Jev will select or execute it.
Circle 2 remains unproven.

At the next checkpoint the physical v47 Trader remained at 1/56 points, zero
kills, and no discarded Jev choices after roughly 13 minutes, despite repeated
study/perform actions. The learning-stat v47 Trader had one kill and one
rank-point after about 8 minutes, but was resting at West Gate at 29/145 HP
after a second unsafe unarmed encounter. Both had 30–40 silvers and no weapon
purchased. These live controls strengthen the case for the missing affordable
weapon route; they do not yet validate v48.

## 2026-09-21 — v50: include the first Trader armor lane

The live v49 Trader bought and wielded a dagger, trained Small Edged and Light
Armor at the hall, then entered the North Fields with no armor worn. Circle 2
requires separate 1st- and 2nd-armor progress; training Light Armor while
unarmored does not earn field experience for that lane. The Jev-only kit now
also lists padded cloth (40 silvers) as the Trader's first armor lane. It is
offered only when affordable, and the ordinary purchased-item path exposes
`wear padded_cloth`. This does not modify shared guild scripts or game
mechanics. Tests verify the bazaar trip and subsequent purchase; Jev/wire suite
passes 42/42. v50 needs a natural-speed run to prove selection, wearing, and
survival/progression effects. The live matched run
`jev-player-2026-09-21T06-08-20-676Z-42df43` has already selected the kit,
bought and wielded the dagger, and bought padded cloth; after roughly 22
seconds its manifest lists both items and no errors. Wearing armor, gaining
its skill ranks, and Circle 2 remain unverified.

## 2026-09-21 — v49: expose relative creature threat

The low-health v47 Trader trace showed a Circle-1 character engaging a Circle-3
reed stalker while unarmed, then fleeing at critical health. Visible target
choices previously carried only the creature's condition and quest-match note,
not its known circle. The Jev-only policy now adds creature/player circle
context and a caution when prey is at least two circles above the character,
while leaving the final legal target choice to Jev. A focused test verifies
Circle-2 kobolds are labeled as one circle above and Circle-3 reed stalkers as
two above. The Jev/wire suite passes 41/41. Live validation run
`jev-player-2026-09-21T06-02-42-155Z-5a9bcb` is now active (Trader,
45-minute cap, natural speed, physical-combat stats). By about 35 seconds Jev
selected `starter_kit`, bought the 25-silver dagger at the bazaar, wielded it,
and then trained Small Edged. This confirms the previously missing gear path
was selected and executed on the ordinary player wire; it is not yet evidence
of a kill, requirement closure, or Circle 2. At about 75 seconds Jev accepted a
marsh-hog kill quest, chose a Circle-2 hog over a Circle-2 kobold because it
matched that quest, and fought with the dagger: observed hits were 11 and 8
damage while the hog missed twice. The fight was still active at that
checkpoint, so increased combat efficacy is promising but no kill has yet
been recorded. By about 120 seconds the hog was defeated; the manifest showed
one kill, 115/145 HP, 11 silvers, no errors, and still 0 circle points. This
validates a complete safer combat/economy loop, but rank conversion and
requirement closure remain outstanding.

## 2026-09-21 — long-run gate audit and timed Dragon Form reuse

The all-run manifest audit corrected the earlier short-run baseline: the
strongest completed Jev run is `jev-player-2026-09-21T04-05-12-634Z-07154a`,
policy v30, natural speed, four-hour cap. It finished at Circle 1 with 48/84
Circle-2 gate points, six rows closed, 13 unmet, and 41 kills. Its remaining
shortfall was distributed across Melee Mastery, Inner Fire/Supernatural, Parry,
later weapon lanes, first and later Survival lanes, and both Lore lanes. This is
the best measured Jev run so far, not a Circle-2 success.

The event trace shows why kills and command totals overstated progress: Jev
selected `train_large_edged` 441 times and `train_light_armor` 224 times, while
the server repeatedly refused those lessons because the purse had 61 silvers
against costs of 80 and 100. The later Jev-only runtime now parses the server's
exact refusal, suppresses that unaffordable choice, and routes back to earning
silver. The newer one-hour v54 control had 31/84 points, two rows closed, 17
unmet, 26 kills, and no provider or server errors at the latest check; this is
not a matched comparison with v30. The current v64 run had only about 16
minutes of evidence (2/84, five kills), too early for a verdict.

A policy audit found another narrow action-surface defect: once selected,
`ability_dragon` was suppressed for the rest of a fight. The game explicitly
reports `The Dragon Form fades.` after its 30-tick effect; a later successful
use also trains both Inner Fire and Augmentation. Policy v67 now unlocks the
choice on that observed expiry, or after the server rejects a use because the
form is already active / Inner Fire is insufficient. Jev still chooses whether
to use it; the wrapper only restores an action after observed state permits a
retry. Focused policy/progress/dashboard tests pass 48/48. The live physical vs
mental stat pair was launched under v66 and cannot validate v67; a future run
must do so before claiming that this lever improves progression.

## 2026-09-21 — v68: preserve the first combat action window

Trace review corrected the previous Dragon Form diagnosis. The ability's
once-per-fight lock is real, but it was not the primary reason for zero uses:
the latest Barbarian traces contained 262, 96, 18, and 29 Jev decisions during
combat, respectively, and every recorded decision had RT 1–4. The in-combat
builder returns early during RT, so Dragon Form was never offered in those
decisions. The combat ticker starts the first automatic swing after the
out-of-combat `attack` choice; the runner then imposed a two-second combat
decision dwell, skipping the initial RT-free window. The RT-window metrics also
showed thousands of skips and near-zero actual combat action windows.

Policy v68 resets that dwell on the transition into combat. If the transition
arrives while Jev's initiating attack is still awaiting its response, the
wrapper schedules one immediate follow-up Choice after the command completes.
The server still validates RT and the ability remains Jev-selected; no native
combat or RT behavior changed. A focused helper test and the 51-case Jev
policy/progress/dashboard suite pass. This only repairs the opportunity to
choose a form at fight start; it does not establish that Jev will choose it or
that rank progress will improve. A fresh natural-speed Barbarian run is needed
to verify offer frequency, selection, successful use, and subsequent gate
points against the v66 physical control.

That verification run is `jev-player-2026-09-21T10-13-41-415Z-dd8db1`
(45-minute cap, Circle-3 target, natural speed, physical-combat stats). At
124 seconds it had reached its first in-combat RT-0 choice and offered Dragon
Form alongside nine other legal actions. Jev assigned Dragon Form 0.25 and
selected `advance` at 0.61 because the visible foe was beyond reach. This
confirms v68 restored the choice, but not a successful form use. Policy v69
clarifies that this is an RT-free opportunity, that Dragon Form costs 20 Inner
Fire, boosts attacks for 30 ticks, and trains both open gate skills. A focused
test verifies the description. The v69 follow-up is now running as
`jev-player-2026-09-21T10-18-40-101Z-7f96b1` (same 45-minute cap, target,
guild, race, and physical-stat policy; separate fresh world). It is too early
to compare; at the launch check it had 7 seconds of runtime and zero decisions.

## 2026-09-21 — provider outage and offline controller lane

Follow-up manifest inspection changed the provider conclusion: three active
workers were all stopped by Jev HTTP 402 (payment/credit required), not by DR
combat or a bad action response. The v68 worker `...10-13-41-415Z-dd8db1`
reached one kill, 0/84 points, and 19 unmet rows before stopping at 6m42s. The
v69 worker `...10-18-40-101Z-7f96b1` stopped before a combat window or kill at
1m40s. The paired stat workers also stopped at 19 minutes: physical reached
5/84, mental 4/84, neither closed a row. These short unequal samples do not
support a stat-policy conclusion.

An older, still-running four-hour v54 process was also discovered. It had
received 97 HTTP 402 responses and was issuing only recorded fallback waits;
its last gate movement had been over eight minutes earlier. It was gracefully
terminated along with its disposable world at 1h28m. Its partial evidence was
Circle 1, 38/84, three rows closed, 16 unmet, 32 kills. This is not a Jev
success and must not be confused with the strongest completed four-hour v30
run (48/84, six closed rows).

To keep harness experiments possible without spending Jev credits, the live
player now supports an explicit `JEV_PLAYER_PROVIDER=local` lane using an
OpenAI-compatible loopback endpoint. It receives exactly the same legal action
set and can choose only one supplied action ID; it does not claim to emit Jev
probability distributions. Manifests, event types, and dashboard counts label
local actions separately from Jev. The default remains Jev, and no DR-native
server/combat code is changed by this adapter. Focused Jev suites pass 71/71;
the full `npm test` run has 646 passes and seven failures in two Puffer
subprocess suites (`test/puffer-barbarian.test.mjs` and
`test/puffer-circle.test.mjs`), outside this Jev change.

The host is an M1 Pro MacBook Pro with 32 GB RAM. Ollama now has Qwen3 8B
(5.2 GB) and Qwen3 4B (2.5 GB) installed. The 4B model echoed the request JSON
instead of selecting a valid action in the full 13-choice observation; the 8B
model returned valid in-menu choices, so the live test uses 8B.

The first natural-speed local run `...10-33-36-831Z-d7a9cf` was gracefully
terminated at 2m03s after four decisions, zero kills, and 0/84 rank points.
Its uncompressed full-menu calls took 17–29 seconds. Local requests now omit
duplicate objective/action data, compact requirement rows and action prose,
and keep only the fields that affect the choice while preserving the exact
action IDs, unmet gate/rank values, affordability, and safety facts. On the
same captured 13-action state, the compact request was 1,150 prompt tokens;
after warming the local model it chose valid actions in 517 ms and 463 ms.
Cold first-call latency remains higher (about 4–7 seconds including model
switch/loading), so the new run must still establish whether changing live
states stay responsive enough for real-time combat.

The compact natural-speed run `jev-player-2026-09-21T10-46-33-863Z-60b539`
ended in death after 95 seconds: ten local decisions, zero kills, 0/84 gate
points, 19 unmet rows. The controller spent 137 of its 150 starting silvers on
a club and dagger, then chose Field Stone Bridge while still Circle 1. That
room's known spawns are Circle-3 reed stalkers and Circle-4 wolves; both
auto-engaged, and the character died despite the safety override eventually
choosing flee. The player-visible combat menu correctly described visible
creature circles, but the travel menu exposed dangerous destinations without
any circle-risk annotation or eligibility guard. A budget warning also failed
to prevent the model from buying the dagger with only 13 silvers left, below
the 30-silver price of the cheapest missing armor lane.

Policy 71 adds two harness-only corrections: field/quest hunt routes are offered
only when every known spawn is at most one circle above the player, and weapon
purchases preserve enough silver for the cheapest affordable, unrepresented
armor lane while an armor requirement remains open. For this Circle-1
Barbarian, Plowed Furrows (Circle-2 marsh hogs/kobolds) remains a valid route;
Roadside Orchard (Circle-3 reed stalker) and Stone Bridge (Circle-3/4) do not.
After the observed club purchase left 38 silvers, the 25-silver dagger is now
withheld because it would consume the 30-silver armor reserve. Focused Jev
tests pass 73/73. This moves protection into the wrapper/action surface; no
native server or combat mechanics changed. A fresh natural-speed run is now
needed to test whether those gates prevent early death and allow actual gate
progress.

The same death trace shows one more safety gap within a fight: after auto-
engaging the reed stalker and grey wolf together, the Barbarian had lost 37/145
HP over 13 seconds (recognized incoming damage 37, outgoing 8), yet the old
override waited for at least 30% HP loss over 12 seconds. It only forced flee
after 52 HP had been lost. The combat supervisor now treats at least 20% HP
loss over an eight-second observed window as unsafe, independently of damage-
text parsing, and attempts escape while more health remains. This is a
harness-only rule; the focused combat/policy tests and complete Jev test set
pass 74/74. The full repository suite's latest recorded result remains 649
passes and seven Puffer-only failures; no full-suite rerun was done for this
isolated Jev guard change.

The 10:46 trace also showed two opponents being present simultaneously, but
the old combat action set offered no `attack <visible creature>` choice while
already in combat. The server supports that command to retarget the player's
automatic swings. Policy 73 therefore adds a Jev-selected focus action for
each visible foe only when multiple opponents are present; its description is
explicit that retargeting does not stop the other foes' incoming attacks.
A focused test verifies both targets map to the exact supplied names and that
the redundant action is omitted in a one-foe fight. The current four-hour run
was launched on policy 72 before this addition and remains a clean evaluation
of the safer route, armor reserve, and HP-loss escape threshold; target-focus
behavior will require a later run.

Early telemetry from the policy-72 run shows another concrete progression
failure: it purchased the 112-silver club but, over multiple field visits,
continued attacking with Brawling (`wieldedWeaponSkill=brawling`,
`purchasedItems=[club]`, empty equipment) despite `wield_club` being offered.
That leaves the purchased blunt lane unused while the Circle-2 gate needs four
distinct weapon lanes. Policy 74 adds state-specific guidance to the player
objective whenever owned weapons or armor map to unmet requirements but are
not equipped: prefer the supplied `wield_*`/`wear_*` action while safe and
before another fight. This changes only the harness prompt, not the legal
action set or native game rules. A regression test covers both the weapon and
armor cases. The policy-72 run remains active and is not modified by this
prompt-only follow-up; policy 74 still needs its own benchmark.

An adapter audit caught that `askLocalChoice()` intentionally omits the full
objective to keep its prompt compact, so the policy-74 objective-only gear
hint was not actually reaching Qwen3. That made the policy test too indirect.
Policy 75 now derives the hint from the exact offered `wield_*`/`wear_*`
actions and open requirement rows, adds it as a compact `priorityGuidance`
field to the local request, and tells the local adapter to follow it. Tests
cover both the guidance derivation and survival through Ollama request
compaction. The active policy-72 run is unaffected; policy 75 requires a fresh
run before its progression impact can be claimed.

At 56 decisions, the live policy-72 local run had four invalid out-of-menu
choices, each producing a provider fallback instead of an agent action. The
Ollama backend previously requested generic JSON, which guaranteed syntax but
did not constrain the returned ID. The local Ollama request now uses the
documented JSON Schema structured-output mode with `choice` enumerated from
the current legal action IDs and rejects/logs any remaining invalid ID in a
bounded form. Policy 76 labels this adapter change. Tests verify the exact
schema and that invalid IDs are observable; the running policy-72 process
cannot benefit from the change, so the next run must verify the invalid-choice
rate actually drops.

A non-mutating local integration smoke test against the installed Ollama
0.34.1/Qwen3 8B endpoint accepted the enum-constrained request and returned
`wield_club` from the supplied three-action menu when the compact priority hint
identified that it advanced an unmet weapon lane (393 prompt tokens, 2.06s).
This validates schema compatibility and the hint reaching the model on one
representative state; it does not prove a full run's action quality or gate
completion.

The reusable `jev-player-local-replay.mjs` command was then exercised on the
newest saved policy-72 menu that offered `wield_club`. The recorded choice was
`attack_0`; the policy-76 local replay instead chose `wield_club` from the same
ten-action menu, with no API error (1,372 prompt tokens, 8.24s). Its durable
receipt is `public/live/jev-player/local-replay-2026-09-21T11-20-51-841Z-d374e4.json`.
This is a concrete changed proposal on a saved state, but it did not execute
in-world, so gate progression impact remains unverified.

At the 2026-09-21 11:21:10 UTC checkpoint, policy 72 was still active at 114
decisions and five provider errors. Rank points had reached three: the 1st
weapon row advanced to 2/8 and Evasion to 1/6, with zero rows closed and 19
unmet. The character still had only the club purchased, was wielding Brawling,
and had no equipped armor. Thus the run is making slow rank progress while
confirming the underused-kit issue that the replayed policy-76 menu addresses.

For a higher-fidelity replay, the latest actual policy-72 field decision
(Circle 1, club owned but not wielded) was submitted to Qwen3 8B using the new
priority hint and enum schema. From its recorded ten-action menu, the local
model selected `wield_club` (1,365 prompt tokens, 5.77s). This is a read-only
decision replay, not an executed command or a policy-76 world run; it confirms
the new adapter context influences the exact failure-state choice while also
showing that larger menus cost several seconds per choice.

At the 2026-09-21 11:16:42 UTC checkpoint, the policy-72 run was still
playing after 92 local decisions. It had two circle-rank points (the 1st
weapon lane at 1/8 and Evasion at 1/6), no requirement rows closed, and 19
rows still unmet. The manifest still showed five provider errors, unchanged
from the prior checkpoint. This is slow, measurable early learning—not a
Circle-2 result and not yet grounds to call the four-hour run terminal.

The policy-72 run was deliberately stopped at 25m10s (127 local decisions),
well before its four-hour cap, after the trace confirmed a progression loop:
zero kills, zero requirement rows closed, three rank points total (1st Weapon
2/8, Evasion 1/6), 19 unmet rows and five invalid-choice/provider errors. It
repeated field travel, Stealth, attacks with Brawling despite the owned club,
flee and recovery. Its saved manifest marks it `incomplete` with
`finishReason=terminated`; this is a documented non-success baseline, not a
completed cohort. The exact recorded menu replay then showed the policy-76
adapter selects `wield_club`, motivating a fresh natural-speed policy-76 run.

At the 2026-09-21 11:29 UTC checkpoint, that policy-76 local run had spent
about 5m40s in a repeat loop: 40 local decisions, zero kills, zero Circle-2
rank points, zero closed rows, and no provider errors. The repeated choices
were `travel_fields_furrow`, `practice_stealth`, and `guild_hall`; at the hall,
`learn_ability_dragon` was available but repeatedly deferred. This exposes a
wrapper control gap: legal choices and accurate coaching were not enough to
reliably execute a one-time prerequisite.

The Jev-only decision supervisor now promotes an offered Barbarian ability
unlock ahead of travel when a supernatural/Inner Fire gate is still unmet. It
also prioritizes currently offered, affordable gear for an unmet skill lane,
and starts an already-offered safe prey encounter when combat gates remain
open and HP is at least 75%. All overrides require an exact current legal
choice; the supervisor cannot invent a command, and combat itself is never
overridden. The event trace records each `supervisorOverride` reason and the
manifest totals `supervisorOverrides`. Focused tests cover the ability, gear,
safe-prey, low-health, closed-gate, and unavailable-action cases. These are
Jev-wrapper controls, not changes to DR mechanics. The policy-76 process was
terminated after the loop was confirmed; its disposable-world manifest and
events remain the baseline. The new policy still needs live validation.

The first live check of supervisor v2 confirmed it was active: in the bazaar,
it overrode three model choices in favor of `buy_padded_cloth`,
`buy_shield_wood`, and `buy_leather_boots`. That trace exposed a spend loop:
the gear selector reacted to an unmet skill rank without recognizing that the
kit already contained gear for that skill. The disposable run's final
manifest had nine decisions over 76 seconds: it bought padded cloth, a wooden
shield, and leather boots, wore them, then selected a visible attack. It had
zero kills and no rank gain at termination. Supervisor v3 now prefers offered
`wield`/`wear` actions over purchases and suppresses an armor purchase
when the owned kit already represents that skill; tests cover wearing the
owned piece and choosing Shield Usage over duplicate Light Armor. This
calibration run is not a progression result. The v3 cohort later ended
incomplete after 284 seconds: 28 decisions, nine overrides, zero kills,
zero gate points, and 19 unmet rows. Its combat trace showed Jev landed two
unarmed hits, then selected `flee` at full HP when `wait` was the only other
legal action; a later encounter fell to 109/145 HP without a kill. This
motivates two further wrapper controls: use the cheapest offered melee weapon
lane when none is owned, and defer a voluntary flee to `wait` while healthy
unless sustained damage is measured. Weapon purchases are staged: don't buy a
second lane until the currently wielded weapon reaches its first-row target.
The v5 natural-speed Qwen3 8B cohort ended incomplete after 152 seconds: 17
decisions, nine overrides, 20 learning-stage advances, but zero kills, zero
gate points, and no closed rows. Its trace showed the model selected
`practice_brawling` in town, which issued `remove dagger`; it then fought with
fists. The healthy-fight override changed two premature flee choices to
`wait`, but did not produce a kill before the run was stopped. Supervisor v6
now preserves the wielded weapon until its first weapon gate closes. This
addresses the observed strip-the-weapon action. The v6 natural-speed local
Qwen3 8B cohort was launched for four hours with target Circle 3:
`jev-player-2026-09-21T11-53-14-827Z-7abc84`. The manifest and event trace
are the authority for whether weapon preservation converts into kills and
gate progress; startup overrides alone are not progression evidence.

At the 2m10s checkpoint the v6 run had its first kill, a sewer rat, while
Small Edged was wielded; HP was 131/145 and the run remained active. It had
14 learning-stage advances but zero gate points. Immediately after that kill,
`skin_sewer_rat` was offered alongside another attack, and the controller
reinforced the attack. The v6 cohort ended incomplete after 308 seconds: 39
decisions, 23 overrides, five kills, 64 learning-stage advances, zero gate
points, zero closed rows, and 19 unmet rows. It had earned 104 silvers, and its
final trace still showed four offered corpse-skinning choices plus `guild_hall`
but the combat override kept selecting attacks. V7 prioritizes an offered,
safe corpse-skinning action before starting a fresh fight while a Survival
lane is open. V8 adds measured stall recovery: after 180 seconds without gate
movement and with at least 40 silvers, visit an offered guild hall, then select
an offered trainer lesson. This gives the next cohort an explicit path from
learning pools and hunt/quest income to actual skill ranks. The 83 Jev unit
tests pass. The natural-speed four-hour v8 Qwen3 8B cohort is now live:
`jev-player-2026-09-21T12-00-57-523Z-43b3a9`; its manifest/events will decide
whether these new actions close any requirement ranks.

At 6m13s, v8 showed 78 learning-stage advances and one additional kill, but
still zero gate-rank points and zero closed rows; Small Edged had reached mind
lock while the character remained at 25 silvers. The active journal was
`Slay 4 more kobolds`, but a later decision started a marsh-hog fight instead
of pursuing the already-offered quest target. This is a specific missed
progression/funding opportunity, not evidence that the quest would certainly
have completed. Supervisor v9 now prefers a currently offered legal attack
whose option explicitly says it advances an active kill/recovery quest, when
combat gates are open and health is safe. It does not synthesize prey or
override combat; focused coverage checks both matching and unrelated quest
kinds. Syntax checks, all Jev tests, and `git diff --check` pass. The running
v8 process predates this change, so v9 remains unvalidated in live play.

Follow-up inspection confirms the active-quest loop has two more harness
handoffs worth making explicit: the policy already exposes known-spawn travel
choices and a `claim_quest` action, but the supervisor did not ensure either
step was taken. V10 now selects an offered route whose description identifies
it as a known spawn for the active kill/recovery quest when the target is not
visible, and claims an offered completed quest before optional activity. Both
are bounded to current legal options; the route inherits the existing
safe-circle and live-exit checks. Focused tests cover completion claims,
matching routes, unrelated quest kinds, and active-combat non-interference.
All Jev tests and syntax checks pass. V10 has not been exercised in a live
cohort yet.

The new offline supervisor replay was run against v8's saved menus: 64
decisions, 62 replayable, and four changed by v10. All four changes selected
the visible kobold over the unrelated first-listed prey while the kobold kill
quest was active; the recorded report is
`public/live/jev-player/supervisor-replay-2026-09-21T12-12-16-425Z-257ea3.json`.
This verifies the intended counterfactual at real historical decision menus,
not its live outcome. At about 11m25s, v8 itself had advanced one requirement
rank point, earned 41 silvers, and reached the Barbarian hall; it remains
active. This is its first gate-rank progress, not a Circle 2 completion or a
validation of v10.

A fresh read-only replay at 12:13 UTC covered 71 saved menus (69 replayable)
and v10 would have changed five choices, each selecting the visible kobold
over the hog for the active quest; report:
`public/live/jev-player/supervisor-replay-2026-09-21T12-13-23-631Z-5ce466.json`.
The v8 live trace now shows the first rank is specifically Evasion rank 1,
with Small Edged still mind-locked at rank 0; its decision menu included both
a marsh hog and a kobold, and the active quest-target rule selects the kobold.
The rank had just advanced 25 seconds before that choice, so the 180-second
funded hall detour correctly did not supersede active gate progress. The
cohort remains live and is still far from Circle 2.

The next offline replay covered 80 of 82 recorded menus and found duplicate
action IDs in six menus (eight redundant entries), all duplicate
`skin_marsh_hog` choices caused by multiple visible same-species corpses. The
menu builder now deduplicates by action ID while retaining one legal skin
command; a regression test keeps the action available for an additional
corpse but limits its menu occurrence to one. Report:
`public/live/jev-player/supervisor-replay-2026-09-21T12-15-26-141Z-e10595.json`.
The active v8 cohort now has six kills, one Evasion rank point, 59 silvers,
and an updated quest journal (“Slay 3 more kobolds”) at 14m35s. It remains
Circle 1 with no closed requirement rows. These duplicate-menu fixes will only
take effect in a subsequent run.

At 12:16:19 the v8 trace exposed a priority inversion: with 59 silvers, 236
seconds since gate progress, and `train_expertise` offered at the guild hall,
the supervisor still selected `skin_marsh_hog`; the cut failed. A later
decision trained Expertise after the skin cooldown. V11 moves the existing
funded-stall training rule ahead of optional skinning and quest travel while
preserving combat safety, and adds a regression test for this exact legal
menu. Replaying 89 historical decisions with V11 would change ten choices;
in particular, it selects `train_expertise` on the 12:16:19 menu. Report:
`public/live/jev-player/supervisor-replay-2026-09-21T12-17-10-422Z-90d150.json`.
The actual v8 cohort subsequently reached two requirement-rank points and
spent down to 19 silvers by 12:17:19; it remains Circle 1, so V11 has not had
live validation.

V8 was gracefully ended as an incomplete disposable-world run at 17m35s so it
would not occupy the local model while testing the corrected supervisor. Its
final manifest records 2 requirement-rank points, 0 closed rows, 7 kills, and
19 unmet rows. V11 natural-speed cohort `jev-player-2026-09-21T12-19-00-401Z-d391f3`
is now live with the same local Qwen3 8B model, Barbarian guild, physical stat
policy, and four-hour cap. Its manifest and events are under
`public/live/jev-player/jev-player-2026-09-21T12-19-00-401Z-d391f3/`; the
launch log is `public/live/jev-player/launch-local-qwen3-8b-policy-supervisor-v11-240m-20260921.log`.
The startup check confirmed `status: playing`, natural speed, and supervisor
`barbarian-gate-quest-funded-progression-v11`. Its early zero-rank snapshot is
not a progression result.

At 4m23s, v11 has exercised the full early funding/training handoff: it
completed and claimed the courier quest (+49 silvers), learned Dragon Form,
then paid 40 silvers for a guild lesson in Expertise. It returned to the field
for its active recover quest. This confirms those individual actions work in
live play, but the character still has only one kill, zero rank points, and
zero closed rows; the run is too early to assess Circle 2 progression.

At 6m18s, the v11 live trace confirmed the corrected trainer priority: with
44 silvers, 367 seconds since gate-rank movement, and both `train_expertise`
and corpse-skinning offered at the hall, the supervisor selected the trainer
and paid 40 silvers. This is the second Expertise lesson in the run. The rank
has not yet advanced; this validates the action ordering and game response,
not Circle 2 progress.

The v11 combat trace then offered `ability_dragon` three times in safe
RT-free windows while a supernatural requirement was open; the local model
chose focus twice and Berserk once. V12 adds a safety-gated preference for an
already-offered Barbarian ability in that state (HP at least 75%, no sustained
damage signal, open supernatural requirement); it never invents a command.
Focused tests cover healthy use and low-health, damage, closed-gate, and
unoffered-action cases. Offline replay of 53 v11 menus changes exactly those
three choices to `ability_dragon`; report:
`public/live/jev-player/supervisor-replay-2026-09-21T12-27-43-357Z-e62e7c.json`.
The full Jev tests pass. V11 remains live; V12 awaits the next natural-speed
cohort and has not yet been validated in play.

V11 was ended as an incomplete disposable-world run at 11m14s: 4 kills, 0
requirement-rank points, 0 closed rows, 19 unmet rows, and the recover quest
still active. V12 is now live at natural speed with the same local Qwen3 8B,
Barbarian, physical-stat policy, and four-hour cap; run
`jev-player-2026-09-21T12-30-20-797Z-a0984e`, manifest/events under
`public/live/jev-player/jev-player-2026-09-21T12-30-20-797Z-a0984e/`, and
launch log `public/live/jev-player/launch-local-qwen3-8b-policy-supervisor-v12-240m-20260921.log`.
Startup verified `status: playing` and supervisor V12. Its initial zero-rank
snapshot is not a result.

At 7m12s, V12 is still live in the North Fields: 2 kills, 63 observed
mindstate advances, 0/84 Circle 2 rank points, 0 rows closed, and 19 unmet.
The run is producing learning activity without yet converting it into a
requirement rank; this is the metric to watch, not the mindstate count.

A 30-minute natural-speed V13 hosted-Jev launch was attempted in its own
disposable world (`jev-player-2026-09-21T12-36-39-916Z-2cb7f1`). The keychain
credential was present, but the first API decision returned HTTP 402. The
provider circuit breaker stopped the run with zero Jev decisions and the
world was shut down; no retry was attempted. This does not test Jev's playing
quality, and further hosted-Jev runs need the TypeSafe account/API billing
state resolved. The failed attempt is recorded in its manifest and launch
log; local Qwen V12 remains independent and active.

At four minutes, V12 has one kill, completed and claimed a recover quest (+110
silvers), and returned to the Barbarian hall with 178 silvers; the supervisor
then learned Dragon Form. It has 23 skill-mindstate advances but still 0/84
Circle 2 rank points and 19 unmet rows. This is learning activity, not gate
progress; the trainer decision after learning is the next important live
check. The cohort is still running and must not be treated as a completed
comparison.

Reviewing V12 exposed two harness quality issues. First, the open-first-weapon
guard replaced `practice_brawling` with the first unrelated menu action (a
crier trip) instead of an action that would train the equipped lane. V13 now
overrides only when a safe-field hunt route is actually offered; otherwise it
leaves the provider's legal choice intact. Second, decision records stored the
supervisor's executed choice but omitted the original provider choice, making
offline replay unable to reconstruct counterfactuals. New records now retain
`providerChoice`, and replay prioritizes that field. Regression tests cover
both defects. This fix applies to future processes; V12 was launched before
the edit and is unaffected. A replay of old V12 records remains limited by the
missing original choice, so its zero-change replay is not evidence that V12's
supervisor never intervened.

To avoid ending a live player whenever hosted Jev is unavailable, the isolated
player now supports `JEV_PLAYER_PROVIDER=hybrid`: Jev is primary, the configured
loopback model handles the same bounded choice menu on provider failure, and
permanent 4xx responses open Jev's circuit before local fallback (no repeated
402 request). Transient failures fall back locally for that decision and honor
the existing Jev backoff without pausing local play. A 3-minute natural-speed
Qwen3 4B integration smoke (`jev-player-2026-09-21T12-43-59-894Z-f040f0`)
received HTTP 402, recorded one Jev circuit break, then completed one local
decision; its manifest remained `playing`, with `jevDecisions: 0`,
`localDecisions: 1`, and `localFallbackDecisions: 1` at that sample. It was an
integration smoke, not a progression benchmark. Provider-policy tests cover healthy Jev,
402 circuiting, transient fallback, and local-backend failure. This remains
harness-only; DragonRealms native code was not changed.

At V12's 15-minute live heartbeat, the local Qwen3 8B Barbarian has 5 kills
and 2/84 Circle 2 rank points, with 0 requirement rows closed and all 19 still
unmet. This is the first observed gate-rank movement in V12, but it is still
far from the circle and too early to judge its four-hour cap. The v13 hybrid
smoke had 8 local fallback choices at 79 seconds after exactly one Jev 402/
circuit break; its rank telemetry was not yet meaningful. It reached its
three-minute cap as `incomplete` (26 local choices, 1 kill, 0/84 rank points,
19 unmet); this verifies failover continuity, not Jev quality or progression.

A new 30-minute, natural-speed exploratory cohort is now live with the V14
safe-idle gate-practice selector and local Qwen3 4B: run
`jev-player-2026-09-21T12-54-44-693Z-1bc10b`. It uses a separate disposable
world, Barbarian, `physical-combat-v1`, target Circle 3, and no boost; manifest
and events are under `public/live/jev-player/jev-player-2026-09-21T12-54-44-693Z-1bc10b/`,
with launcher log `public/live/jev-player/launch-local-qwen3-4b-supervisor-v14-30m-20260921.log`.
Startup verification found it `playing`, with zero decisions at five seconds
(setup only). It is exploratory, not a matched comparison with the still-live
Qwen3 8B V12 control.

At V12's 16m54s heartbeat, rank points reached 3/84 (Expertise and the first
weapon lanes), with 5 kills, no closed requirement rows, and 19 still unmet.
The trace shows the structural coverage gap: despite 95 mindstate advances,
the learning list does not show Perception, Foraging, Stealth, Skinning,
Performance, or Scholarship as active learning skills; all Survival and Lore
requirement rows remain 0. The
supervisor had repeatedly steered toward combat, quests, skinning, and funded
training but had no hard priority for direct safe practice of the remaining
gate groups.

V14 adds a legal-action-bound safe-idle practice selector: when healthy,
unwounded, out of combat, not interrupting an active delivery quest, and no
higher-priority combat/gear/trainer/loot/quest action applies, it chooses an
offered Survival or Lore practice for the least-developed eligible skill
lane. Distinct under-ranked lanes are preferred; Scholarship/Appraisal study
is treated as one legal action that trains both. Tests cover skill-lane
rotation, study, active-combat priority, low health, bleeding, and delivery
quest protection. This is an offline-verified hypothesis; it has not yet had
a live V14 progression cohort.

V14's live 30-minute cohort exposed a priority inversion and was stopped as
policy-wedged at 5m59s. It had 22 decisions (all 22 supervisor-overridden), 0
kills, 0/84 rank points, no rows closed, 19 unmet, and Performance at
`learning`; its early trace repeated `perform` in town instead of buying the
offered starter kit or reaching the fields. V15 now gives the starter kit
priority before optional practice and routes to safe fields for open combat
gates before town Performance/Lore practice. Tests cover both observed cases.

V15's replacement 30-minute natural-speed exploratory cohort is live with
local Qwen3 4B, Barbarian, `physical-combat-v1`, Circle 3 campaign target, and
no boost: run `jev-player-2026-09-21T13-00-56-564Z-27d3de`. Isolated manifest
and events: `public/live/jev-player/jev-player-2026-09-21T13-00-56-564Z-27d3de/`;
launch log: `public/live/jev-player/launch-local-qwen3-4b-supervisor-v15-30m-20260921.log`.
Startup verified `playing`; the five-second zero-rank sample was setup only.
This is exploratory, not a matched comparison against the still-running V12
Qwen3 8B cohort.

The V15 trace then exposed a high-value legal action the model repeatedly
declined: during active combat/roundtime, `analyze flame` is offered and is
explicitly RT-free, and the server's Barbarian analysis mechanic grants
Expertise and Tactics experience. When the model selected `flee` despite a
healthy fight, the supervisor deferred it to `wait`, missing that open-gate
action. V16 now selects the offered analysis action instead when either gate
is unmet and the player is at least 75% HP with no sustained-damage signal.
This stays within the legal menu and is covered by offline safety/gate tests;
it does not alter the already-running V15 process or any DR-native code. Live
progression impact remains unverified.

An offline supervisor replay against the still-running V15 choices found 23
eligible analyzer-menu decisions that V16 would redirect to `analyze_flame`;
the recorded model selected `flee` on most of those menus and V15 converted it
to `wait`. The replay is deterministic and sent no commands, so this confirms
that the new rule applies to real recorded menus, not that the action would
have landed or closed a rank. At the same six-minute sample, V15 had 3 kills,
0/84 gate-rank points, 0 rows closed, and 19 unmet; mindstates were advancing
but no rank had yet registered. It remains a live exploratory run on V15, so
it cannot validate V16's progression effect.

At V15's 7m26s sample, the local model had recommended `flee` 31 times across
54 decisions; the V15 supervisor deferred 29 of those and executed `wait`.
The player's action memory retained only that executed wait, so the next prompt
did not tell the model its prior recommendation had been overridden. V17 now
records both provider recommendation and executed action/override reason in
recent action memory, then explicitly distinguishes them in the next objective
when the character remains in the same room. This is intended to prevent
unchanged-condition recommendation loops, without hiding the legal menu or
changing the safety gate. Offline tests pass; live impact is unverified, and
the active V15 process does not load V17.

Latest saved cohort snapshots at 13:11 UTC: V12 (Qwen3 8B, 41m36s) is at
15/84 rank points, 0 rows closed, 19 unmet, with its largest early combat gaps
still Expertise 2/8, Melee Mastery 1/8, and Evasion 5/6; all four weapon rows
and every Survival/Lore row remain open. V15 (Qwen3 4B, 11m01s) is at 0/84,
0 rows closed, 19 unmet after five kills. Both are still running and neither
validates V17. V12's rank movement is positive versus its earlier 8/84 sample,
but far from a Circle 2 milestone; no row-level close or circle completion has
been observed.

At the next snapshot (13:15 UTC), V12 was still active at about 42m with
17/84 points and no closed rows. V15 was active at about 14m26s with 3/84,
no closed rows, 19 unmet, five kills, and one silver; its first requirement
movement was 1st weapon 1/8 and Evasion 2/6. A V18 deterministic replay of
87 recorded V15 menus found 33 eligible `analyze_flame` choices, eight safe
Survival/Lore practice overrides, and seven corpse-skinning overrides. The
model's repeated Brawling recommendations were generally redirected to other
offered progression actions, not all to combat; V18 merely lets an offered
Brawling choice pass when no higher-priority safe gate action applies. These
are menu-level counterfactuals, not evidence that those actions would register
rank points. Both live processes still run pre-V18 code, so a clean V18 cohort
is still needed to assess progression impact.

V15's 13:17 UTC sample advanced to 5/84 points (still 0 rows closed, 19
unmet) after 16m47s, six kills, and only 7 silvers; the character had no active
quest. Its saved 13:01:58 decision is a concrete funding gap: while safe at
the bazaar with 15 silvers, it chose Brawling practice despite an offered
three-room crier route. V19 adds a bounded supervisor rule for that exact case
(healthy, out of combat, no active quest, under 40 silvers, crier at most three
rooms away). Replaying 105 V15 menus applies it once; this is a counterfactual
navigation decision, not proof the assigned quest is safe or completed. The
crier is only a quest offer; the character still inspects the task and retains
choice about whether to pursue it. V12 remains the best live run at 18/84 with
Evasion closed 6/6, still Circle 1; both cohorts predate V19.

At the 13:18 UTC check both runs were still active. V12 had reached 19/84
points and closed Evasion (1 row, 18 unmet) after about 48m34s, with 19 kills;
V15 was at 5/84 with no closed rows after about 17m58s, six kills, and 7
silvers. These confirm slow, nonzero progress but no Circle 2 completion. The
V19 replay's one crier override came from an actual menu at the bazaar: 15
silvers, no active quest, full HP, and a three-room route. We should validate
that economy change in a future isolated run after the current Qwen cohorts
finish; neither live process includes V19.

At the 13:24 UTC check, V12 was at 24/84 with two rows closed after 53m45s;
V15 was at 8/84 with no rows closed after 23m10s. V19's replay over the latest
148 V15 decisions still finds the same one nearby-crier opportunity and 55
eligible `analyze_flame` menus. Neither run has reached Circle 2. A bounded
handoff now waits for V15's 30-minute cap (up to 15 additional minutes), then
starts one 240-minute V19 local Qwen3 4B candidate if V15 did not reach its
campaign target; V12 remains the concurrent comparison. The initial 60-minute
handoff was replaced before launch because it was too short to test the target.
The active handoff shell is session 49951. V19 is not live until its process,
manifest, and launch log are verified.

At the 13:26 UTC snapshot, V12 had 24/84 points, closing Evasion (7/6) and
2nd Armor (2/2), with 17 rows still open; it remains Circle 1. V15 had 8/84,
no rows closed and 19 open at 25m11s, with 33 silvers and no active quest.
Both were still active, so the V19 handoff remained queued and its launch log
did not yet exist.

At the 13:30 UTC decision-trace replay, V12 had moved to 25/84 points while
remaining Circle 1 (two requirement rows closed); V15 was still active at its
30-minute cap boundary, at 8/84 with no rows closed. V15's 185 saved decisions
include 111 provider flee recommendations and 118 menus offering the legal
RT-free `analyze_flame` action. In the 60–75% HP band, 49 recorded flee
recommendations were converted to `wait`; these are repeated decisions across
fights, not 49 distinct encounters. The current supervisor only forces
analysis at >=75% HP but defers healthy-fight fleeing down to >=60%, leaving a
band where no gate practice occurs. Most samples did not meet the separate
20%-of-max-HP/30-second sustained-loss emergency threshold, so this is a real
policy gap rather than a mismatch in the emergency detector.

Next isolated hypothesis (after V19's manifest captures its own code hash):
extend the existing offered-analysis override from >=75% to >=60% HP, retaining
the sustained-damage exclusion and the >=60% lower boundary. This should
replace otherwise-deferred flee/wait cycles with Expertise/Tactics practice
while preserving escape below 60% or under the existing sustained-loss signal.
Replay saved V15 menus first and measure analysis opportunities / waits
replaced; then validate in a new run. Do not fold this change into V19, whose
single tested lever is the low-funds nearby-crier route.

V19 is now live as `jev-player-2026-09-21T13-30-57-871Z-78828f`, local Qwen3
4B, 240-minute natural speed, `physical-combat-v1`; its manifest captured
supervisor V19 and decision-policy hash
`3e054b8d7dd2673d8ad93c7419b3c538801c490aebabcd6a65a778cff0b34660` before
the next edit. V15 ended at its 30-minute cap with 10/84 points, no rows
closed, Circle 1, and 19 unmet. V12 was still live at 25/84 with two rows
closed and 17 unmet.

V20 applies the next falsifiable harness hypothesis: while Barbarian
Expertise/Tactics is still open, use the already offered RT-free `analyze
flame` from >=60% HP (rather than >=75%) when the sustained-damage safeguard
is clear. At <60%, the override does not fire, so Jev's flee choice remains
available; the existing immediate sustained-loss escape rule is unchanged.
This specifically closes the empirically observed 60–75% band where V15
repeatedly recommended flee, was overridden to wait, and made no gate progress.
Unit tests cover 60–75%, below 60%, and sustained loss. Offline replay of 190
V15 choices selects analysis 119 times under V20 versus 66 under V19; this
estimates legal-menu substitutions, not rank gains. All `test/jev-*.test.mjs`
passed, as did syntax and diff checks. V20 is not yet live; its 240-minute
natural-speed run is queued behind V12's terminal manifest to avoid running
three local model workers at once. Compare it against the captured V19 cohort
and retain the original result even if neither clears Circle 2.

At V19's 3m52s sample it had 20 decisions, 53 commands, no kills or rank
points yet, and all 19 Circle 2 rows remained open; Hiding, Stealth, and
Outdoorsmanship had reached `dabbling`, so the field actions were producing
learning evidence but not yet ranks. The replay is still too early to judge
progression. It does reveal a crier-flow issue to watch: the supervisor
redirected Jev to a nearby crier once, but on the next decision routed back to
the fields instead of taking the visible crier's quest offer. No `quest`
command was sent in the first 20 decisions. The low-funds route lever alone
may therefore fail to produce quest income unless Jev elects to accept; if
this persists in the longer run, a separate candidate should test a safe,
visible-crier `quest` offer before returning to the field. Do not bundle that
with V20's combat-health-band trial.

At the next 13:36 UTC sample, V12 remained Circle 1 at 27/84 points, two rows
closed, 17 unmet, after 65m44s; it had 29 kills and no error, but no gate-rank
movement for 144 seconds. V19 was 5m07s in at 0/84, 0 rows closed, 19 unmet,
with Hiding/Stealth/Outdoorsmanship at `dabbling`. It had made 26 choices and
63 commands. The log confirms the crier-flow concern: the forced nearby-crier
route was followed by a forced fields route, and the run still had no active
quest or `quest` command. This early observation does not invalidate V19's
longer trial, but the route-only intervention did not immediately produce a
quest or reward. V20 remains queued behind V12; its waiter process is alive.

At 13:36:51 UTC, V12 reached 29/84 points after 66m29s (up two points since
the prior check), still Circle 1 with 17 rows open. The current shortfall
includes Melee Mastery 2/8, Expertise 4/8, Parry 2/8, four weapon rows at
6/8, 1/8, 0/4, 0/2, and four Survival rows at 1/4, 0/4, 0/4, 0/2; only
Evasion and 2nd Armor are closed. It has 139 silvers but only the starter
dagger among weapons, while Small Edged is rank 6 and nearly locked. That
supports holding the first weapon lane until it closes before buying the next,
but weapon diversity remains a substantial downstream gate. V12's 240-minute
cap is not close yet. V19 remains too early to compare: at 5m53s its field
skills are learning but still rank 0, no kill or quest has been recorded, and
the crier route has not become an accepted quest.

The 13:38:18 UTC heartbeat shows V12 at 30/84 (still 2 rows closed, 17
unmet) and V19 still at 0/84 (0 closed, 19 unmet); both manifests continue to
advance. This confirms V12 has resumed rank-point movement, but not yet closed
another gate or reached Circle 2.

At V19's 13:39:25 UTC replay, 43 model decisions had been recorded; the
supervisor changed 38, including 30 `practice-least-developed-open-survival-
or-lore-lane` overrides. The model repeatedly chose `practice_brawling`
while the harness alternated `practice_stealth` and `forage`; at 7m57s the
three associated skills had reached learning/dabbling, but no rank. This
indicates meaningful policy/model disagreement and a potentially overly
scripted harness. Do not simply remove progression supervision: instead,
test a bounded lane-commitment policy that explains the gate value to Jev,
lets Jev choose among high-value legal lanes, and only intervenes after a
measured stall or failed/no-learning outcome. Keep that behavioral change
separate from V20's health-band experiment and evaluate actual requirement
closure, not override count alone.

At 13:40:27 UTC, V12 was at 30/84 (2 closed, 17 unmet) and 70m06s elapsed;
its active learning still includes Small Edged 6, Evasion 9, Melee Mastery 3,
Light Armor 4, and Expertise 4. It remains actively progressing but far from
the Circle 2 gate. V19 was at 0/84 (0 closed, 19 unmet) after 9m28s, with one
kill, 21 silvers, no active quest, and learning states for weapon, defense,
armor, and survival skills. Thus the initial field-practice phase has begun
to broaden skill learning, but has not yet converted it into any displayed
rank requirement; its long-run rate remains unknown. V20's waiter remains
alive, blocked on V12's still-`playing` manifest.

Interpretation guard: the game's field EXP banks into pools and ranks advance
only as those pools drain on staggered pulses in a 200-second cycle; rank 1
requires 200 EXP. Thus V19's 10-minute `learning-only-no-gate-rank` sample is
not by itself evidence that hide/forage fail to train. Keep judging their
effectiveness by later rank/gate movement, while separately tracking the
supervisor override rate as an autonomy concern. At 13:41 UTC, V12 was at
30/84 with two rows closed and V19 at 0/84 with one kill and learning states
across combat, armor, and field skills. These are live, natural-speed
observations; do not infer rank velocity from the early V19 window or change
game-native pulse mechanics to accelerate it.

The 13:42:49 UTC manifests show V12 advancing again to 31/84 (still two rows
closed, 17 open) and V19 at 0/84 after 11m51s, still learning-only with 19
open. V12's latest point shows rank movement is not fully stalled; V19 remains
too early to judge conversion of its newly accumulated field pools.

At the 13:43:19 UTC replay, V19 had 64 captured decisions with no duplicate
action IDs; 53 were changed by the supervisor, including 35 field-practice
choices, nine legal analyzer overrides, and three visible-prey overrides. The
model/supervisor disagreement remains high, although some forced combat
progress now occurs (two kills by the preceding manifest sample). V12 is at
31/84 with open requirements Expertise 4/8, Melee Mastery 3/8, Parry 2/8,
weapon rows 6/8, 1/8, 0/4, 0/2, armor 1st 4/6, Survival 1st 2/4 plus three
empty rows, and two Lore rows at 0/2; only Evasion and 2nd Armor are closed.
This breakdown should shape later intervention: the four weapon lanes and
several hard combat gates are still material, so a later autonomy candidate
must not simply suppress combat in favor of survival practice.

The 13:44:21 UTC manifests show V12 at 32/84 (up one point; still 2 closed,
17 open) after 73m59s. V19 remains 0/84 (0 closed, 19 open) at 13m22s, now
with a wider set of skills learning; this reinforces using rank/gate movement
as the success signal rather than the number of actions or learning labels.
The V20 waiter is still alive behind V12.

I launched one natural-speed 240-minute run with the real Jev 1.13 provider
using the configured Typesafe Keychain credential. The manifest was created,
but the first decision failed with HTTP 402 and the run closed as `failed`;
there is no successful Jev decision and no live Jev cohort. The response body
was not captured and the request was not retried. This is an external account
or billing/access blocker, not evidence about Jev's play quality. Resume real
Jev testing only after the user resolves the provider-side 402; local Qwen
cohorts and V20 remain independent.

At 13:47:44 UTC, V19's 87-decision offline replay found 74 supervisor changes
(44 field practice, 15 analyzer, four visible-prey, six corpse-skinning among
the recorded reasons), with no duplicate offered action IDs. The live V19
manifest at 13:47:35 had just registered its first rank point: Small Edged 1,
after 16m36s, three kills, still 0 rows closed and 19 unmet. This validates
that the learning phase can become rank progress, but the high override rate
remains a distinct autonomy concern. V12 was at 33/84 with two rows closed and
17 unmet. V20 remains queued behind V12 and has not started.

At 13:48:26 UTC, both local manifests were still advancing: V12 at 33/84,
two rows closed and 17 open after 78m05s; V19 at 1/84, no rows closed and 19
open after 17m28s. V19's Small Edged rank is real gate progress, but it has not
yet produced a row closure or Circle 2. The 240-minute V20 waiter remains
active behind V12; the failed Typesafe attempt has no active process.

To improve the wrapper without perturbing the active cohorts, I added an
independent advisory lane-coach and offline replay tool
(`scripts/lib/jev-lane-coach.mjs`, `scripts/jev-lane-coach-replay.mjs`). It
maps only currently offered actions to unmet skill rows, reports when one
skill can satisfy multiple differently labeled requirements versus distinct
skill lanes, and can carry a provider-chosen lane while any of its rows remain
open. It never selects, overrides, or executes an action. Five offline unit
tests pass. Replaying V19's saved menus through this mapper initially found
99 of 120 model choices mapped to an open gate (82.5%), 21 not gate-mapped,
and eight switches away from a still-open prior lane. The 13:57:08 replay
advanced to 110/131 mapped choices (84.0%), 21 unmapped, with eight switches.
This is a retrospective menu audit, not a treatment result: Jev did not see
the added coaching, and the report must not be read as predicted progression
improvement.

At 13:54:58 UTC V12 was still playing at 84m36s with 35/84 gate rank points,
two closed rows and 17 unmet; V19 was at 23m59s with 1/84, zero closed rows
and 19 unmet. Both remain Circle 1. V20's existing waiter is still alive
behind V12. The coach is now integrated as an explicit
`JEV_PLAYER_LANE_COACH=advisory` opt-in; default `off` leaves choices unchanged,
and the runner records gate-mapped choices and switches away from open
commitments in the manifest. V20's launch does not set the opt-in, so it
remains the uncoached comparison. After V20 starts and captures its code hash,
run a separately labeled coached candidate with all other settings matched;
judge row closure and Circle 2, not action counts or offline mapping rate.

At 13:58:11 UTC the active manifests still show Circle 1: V12 is at 37/84,
two rows closed and 17 unmet after 87m50s; V19 is at 2/84, no rows closed
and 19 unmet after 27m12s. The V20 waiter process remains alive and is still
waiting on V12. The opt-in integration passed all 113 `test/jev*.test.mjs`
tests plus syntax checks; no new live cohort was launched.

At 14:00:58 UTC V12 closed its 1st Weapon row (Small Edged reached rank 8),
reaching 38/84 points and three closed rows, with 16 still unmet at Circle 1
after 90m37s. This is the strongest current live gate milestone, but remains
far from Circle 2. V19 is still 2/84 with no closed rows after 29m59s. The
14:00:48 offline V19 replay covered 147 decisions: 126 (85.7%) map to an open
gate and 21 do not; 15 transitions left a still-open previous lane. The
coach now preserves a commitment when its action is temporarily absent,
recognizes observed rank advancement as progress, and asks Jev to reconsider
only after 400 seconds without a rank increase (two EXP pulses). Eight
additional focused tests cover these cases; all 18 lane-coach and provider
tests passed. This remains code-level verification until a coached live
cohort is run.

I found that advice alone was insufficient: the default supervisor had
replaced V19's provider-selected Brawling with Stealth/Foraging 112 times in
the current replay. The opt-in lane coach now preserves a provider choice
when it maps to an open gate, but only against that field-practice override;
the default-off path, all other supervisor rules, and emergency safety remain
unchanged. The supervisor replay gained `--lane-coach` for offline
counterfactuals. Replaying V19 at 14:05:16 (168 decisions) preserved 125
gate-mapped choices and reduced changed choices from 155/168 to 30/168; 13
choices were already unchanged. This isolates the model-autonomy issue well,
but is not evidence of Circle progression because none of the counterfactual
actions was executed.

At 14:05:03 UTC V12 reached 39/84 with three requirement rows closed and 16
unmet after 94m41s; V19 reached 3/84 but still has zero closed rows after
34m04s. Both remain Circle 1. The V20 waiter remains alive behind V12. The
updated targeted suite passes 24 tests covering lane coaching, safety
preservation, replay, and provider contracts; syntax and diff checks pass.

I also queued the first natural-speed coached comparison as a strictly
sequential job (`jev-player-lane-coach-v21-after-v20-20260921`). It will wait
for V12, V19, and the matching uncoached V20 control to be terminal before
starting, then run the same local Qwen3 4B / Barbarian / physical-combat-v1 /
Circle-3 / 240-minute / no-boost cohort with only `JEV_PLAYER_LANE_COACH`
enabled. The queue worker is live (PID 50665), its durable queue manifest is
`public/live/jev-player/jev-player-lane-coach-v21-after-v20-20260921.json`,
and its state is `waiting`; it has not launched a player run.

At 14:10:10 UTC V12 reached 41/84 rank points and closed its 1st Armor row
(Light Armor rank 6), giving four closed rows and 15 unmet at Circle 1 after
99m48s. V19 remains at 3/84, zero rows closed, after 39m11s. An offline V19
lane-coach replay at 14:09:58 covered 189 decisions: 146 mapped Jev choices
were preserved against the targeted field-practice override; 30 remained
changed by other existing supervisor rules and 13 were unchanged. This
counterfactual confirms the specific override is bypassed as intended, but
only the queued live comparison can tell us whether that yields Circle 2.

Replay correctness audit: V12's older 478 decision records do not contain a
`providerChoice` field, so its latest strict replay correctly skips all 478
instead of pretending the already-supervised executed action was Jev's raw
selection. V12 replay override counts are therefore not valid autonomy
evidence. V19's current schema has the original provider choice on all 202
records; its 14:12:40 advisory counterfactual preserved 159 mapped choices,
left 30 changed under other supervision rules, and found no duplicate menu
IDs. The replay tool now reports missing provider choices explicitly.

At 14:12:58 UTC V12 remains Circle 1 at 41/84, four rows closed and 15 unmet
after 102m38s; V19 is 3/84, zero rows closed and 19 unmet after 41m59s. The
V21 lane-coach queue is still `waiting` behind both runs and the V20 control;
its worker is live. The full Jev suite now passes 121 tests, including the
queue gating and counterfactual preservation tests.

The Jev dashboard now polls and displays the queue manifest, baseline and
blocker states, candidate link, lane-coach mode/counters, and provider choice
separately from the action actually executed (including legacy records where
the raw provider choice is missing). Its dashboard contract test passes.
Browser QA against the running local Sims page confirmed the queue panel
renders its waiting state, V12/V19 blockers, V20-not-started state, and queue
manifest link. At 14:17:06 UTC V12 is at 45/84, five rows closed and 14 unmet
(Tactics just closed); V19 remains 3/84 with no closed rows. Both are still
Circle 1. The V21 queue remains waiting, last checked at 14:16:56, with no
V20 manifest yet.

At 14:18:43 UTC V12 continued to 47/84 (five rows closed, 14 unmet); V19
remains 3/84 after 47m45s, with 922s since gate-rank movement but learning
movement within 64s. Its latest 235 recorded raw choices include 179
`practice_brawling` selections. The default supervisor executed Stealth 86
times, Forage 83 times, plus Skin/route/economy actions for most of those
Brawling choices. V19 still has Brawling 0, Melee Mastery 0, and 2nd Weapon
0/8, while Small Edged is rank 2; it also has only 7 silvers and no purchased
second weapon. The advisory counterfactual preserves 169 of the 235 model
choices overall; the 169 Brawling-to-field-practice redirects are among
them. This supports the coached comparison as a focused test of whether
Jev's already-selected unarmed lane can resolve the weapon/mastery stall.
No causality claim until the queued cohort executes and closes requirements.

The replay now retains both outcomes. On V19's 14:20:52 249-decision sample,
the uncoached supervisor would change 226 provider choices, including 170
field-practice overrides; the lane-coach counterfactual changes 56 and
preserves those 170 mapped choices. There were no missing raw choices or
duplicate menu IDs. This confirms the opt-in acts on exactly the dominant
observed override, without hiding the 56 other supervisor changes.

At 14:21:01 UTC V12 is 47/84 with five closed rows and 14 unmet after 110m39s;
V19 has just gained one point to 4/84, still zero rows closed, after 50m03s.
Both remain Circle 1. The V21 queue and V20 waiter are still live; no V20
manifest has appeared yet. The complete Jev suite passes 121 tests after the
strict raw-choice and dual-outcome replay changes.

The queue card also links directly to V12/V19 and will link to V20 once its
manifest exists, avoiding the default latest-run pointer getting stuck on the
failed Typesafe 402 attempt. Dashboard contract tests pass. I could not repeat
browser QA for these added links: the ego-browser skill's single TaskSpace
used for the previous QA had already been closed, and I did not create a
second space for the same goal.

At 14:22:20, V19's replay expanded to 257 raw-choice events (none missing):
the uncoached supervisor would change 230, including the same 170 field-
practice substitutions; the coach counterfactual changes 60 and retains the
170 gate-mapped choices. At 14:21:01 the live run was still 4/84 with no row
closures, while V12 was 47/84 with five closed rows. The V20 and V21 processes
remain queued/active as expected; the one other `playing` manifest found in
the directory is stale (last update 03:33, PID absent), so it is not treated
as a live process or queue blocker.

At 14:24:37 UTC V12 advanced to 48/84 points, still five rows closed and 14
unmet. V19 reached 5/84, with zero rows closed and 19 unmet. Both manifests
are current and their recorded Node PIDs (34413 and 44190) are live. The V20
waiter and V21 queue worker also remain alive; the queue is waiting on both
cohorts, with no V20 baseline manifest yet.

At the 14:28 UTC inspection, V12 reached 49/84 (6 rows closed, 13 unmet) and
V19 8/84 (0 closed, 19 unmet); both remained healthy and live. An initial
interpretation of the trace incorrectly attributed RT refusals to
`analyze flame`; that command is intentionally RT-free. The follow-up trace
classified all 58 `form dragon` attempts as rejected because combat had
started a fresh roundtime while the provider was deciding. The important
harness gap is stale-action validation: combat state and HP are rechecked,
but legal action timing was not.

The Jev wrapper now offers RT-free Barbarian analysis during RT and, at the
final pre-send boundary, defers a previously selected RT-gated combat command
if automatic combat has started RT since the menu was built. It logs a
`stale-roundtime-choice`, increments a manifest counter, and waits for the
observed RT window; emergency actions bypass that guard. Regression tests
cover the legal analysis menu, stale form/attack actions, and RT-free analysis.
The prior mistaken menu change has been reversed. This correction is confined
to Jev harness files; V12/V19 retain their already-loaded policy. Queued V20
and V21 will use the corrected code, provided the same policy remains in
place for both launch receipts. This targets a measured source of wasted
actions but does not yet prove faster Circle-2 progression.

At 14:30:38 UTC, V12 stood at 50/84 after 120.3 minutes (6 rows closed,
13 unmet); V19 was at 9/84 after 59.6 minutes (no rows closed). A fresh
event-level correlation found 58/58 V12 `form dragon` commands followed by the
server's RT refusal. This distinguishes the actual defect from ordinary RT
decision skips and gives the new `staleRoundtimeActionSkips` counter a
specific outcome to monitor. The counter is now visible on the Jev run
dashboard. The full Jev test set passes (123/123), including the restored
RT-legal analysis menu and stale-action guard. No new cohort has been started;
the existing V20 baseline waiter and V21 queue remain the planned matched
evaluation, and Circle 2 remains unproven.

At 14:35:45 UTC, V12 was still live at 52/84 (6 rows closed, 13 unmet) after
125.4 minutes; V19 was at 12/84 (0 rows closed, 19 unmet) after 64.8 minutes.
Both processes heartbeated with no manifest errors. V20's waiter and the V21
queue worker are still live, with the queue correctly waiting on V12, V19, and
the not-yet-created baseline. These older manifests predate the stale-RT
counter, so the dashboard reports that measure as unavailable rather than
misleadingly showing zero. This confirms only that the old runs continue to
gain points; neither is near the campaign target yet.

Decision-level review of V19 found a second policy-ordering trap: in the six
observed RT-free windows where `ability_dragon` was offered, the supervisor
always chose `analyze_flame` first because Expertise/Tactics guidance ran
before supernatural-gate guidance. V12's 63 ability offers were mostly from
later windows after its Expertise/Tactics gates had closed, so it did not
expose this overlap. The Jev-only supervisor now prioritizes a safe offered
Barbarian form/roar/meditation when either Inner Fire or a supernatural gate
is open; it falls back to RT-free analysis when the ability is unavailable or
the character is below the ability safety threshold. Tests cover overlapping
gates, the mid-health analysis fallback, and an Inner-Fire-only gate. The full
Jev suite passes (125/125). Runtime policy is now frozen for the queued V20 /
V21 matched comparison so both cohorts can measure the same corrected code;
the already-running V12/V19 processes retain their loaded versions.

Added a no-model, offline pair audit for the queued control/coached runs:
`node scripts/jev-player-compare.mjs`. It checks that provider/model, guild,
race, cap, target, stat policy/allocation, boost, progression mode, policy
versions, and every source hash match; verifies the intended `off` versus
`advisory` treatment; refuses a ready verdict while either run is active; and
reports target/circle/rank-point/closed-row deltas without causal or promotion
claims. Completed reports are saved under `public/live/jev-player/`. Its four
tests cover matched outcomes, configuration/hash mismatch, in-flight runs,
and missing manifests. Full Jev suite: 130/130 passing after adding the
resource-contention queue guard.

The full repository `npm test` run then reported 691/698 passing. All seven
failures are in the separately untracked Puffer test set, not Jev: the
Barbarian subprocess expects variant `barbarian_circle2_activities_v2` but
receives `barbarian_circle2_client_wire_v1`; five Puffer circle subprocess
assertions disagree with their reported environment/timer values. Jev's own
130-test suite passes. These Puffer artifacts were already present as
untracked worktree content and were left untouched.

At 14:46:07 UTC, V12 had reached 56/84 with seven requirement rows closed and
12 unmet after 135.8 minutes; V19 was at 15/84 with zero rows closed and 19
unmet after 75.1 minutes. Both were still live, error-free, and on their old
loaded policies. V20's original waiter would have launched when V12 ended,
while V19's Qwen 4B run could still be using the same local model. Since V21
waited for both old runs, that would expose the control to contention absent
from the candidate. I stopped only the verified waiter process (PID 44511;
no V20 manifest existed) and replaced it with
`jev-player-control-v20-after-v12-v19-20260921`, which gates V20 on both
blockers reaching terminal status. Its worker is PID 57336, status `waiting`,
with a durable queue manifest and launch-log path under `public/live/jev-player/`.
The existing V21 queue remains live and unchanged. No sim was stopped; no new
sim has launched. Queue regression tests pass, and the full Jev suite passes
130/130. At the 14:50:41 UTC verification, V12 was still live at 57/84 with
seven rows closed and 12 unmet after 140.3 minutes; V19 was 17/84 with zero
closed and 19 unmet after 79.7 minutes. Both retained healthy manifest
heartbeats. The replacement V20 queue (PID 57336) and existing V21 queue were
waiting on both live blockers; no V20 manifest existed. The corrected matched
run remains pending.

The Jev Sims page now shows both the V20 control queue and the V21 coached
queue, including the V20 manifest link, so users can see the wait-for-both
gate rather than only the later candidate queue. Dashboard tests pass and an
HTTP fetch from localhost:3000 confirmed the served HTML contains the new
control-queue status/link; the served control manifest reports `waiting`, both
blockers `playing`, and no run ID yet. Visual browser QA could not resume
because the one Ego TaskSpace used earlier for this goal (space 7) no longer
exists; no replacement space was created. Ego Lite displayed an available
update, which was not installed without user approval.

Added average rank-points/hour and requirement-row closures/hour to the
dashboard's run facts. These rates use the run's elapsed-seconds and progress
observer counters; missing or zero-duration evidence renders as unknown.
Dashboard contract test and served-HTML check pass; full Jev suite passes
130/130. This improves pacing visibility without changing the frozen runtime
policy.

At 15:02 UTC, gate inspection showed why rank-point totals alone were not
enough: V12 (local Qwen3:8B) had 59/84 rank points and 9 rows closed, but its
remaining gaps included 2nd–4th weapon, 2nd–4th Survival, both Lore rows, and
Inner Fire/supernatural. V19 (local Qwen3:4B) had 17/84 and no rows closed.
V12's event trace showed 541 seconds without a gate-rank change while it was
in the fields; the next objective explicitly called out the stall. It then
visited the bazaar, bought the previously unused club, and the supervisor
selected the legal `wield_club` action. The gate-aware menu and gear override
are therefore functioning; the remaining question is whether method release
and lane acquisition translate into Circle 2, not merely more experience.

One harness-only policy correction was made before either queued matched run
launched: safe Survival/Lore practice remains a useful early nudge, but after
180 seconds with no Circle-gate movement it no longer replaces the model's
legal choice indefinitely. Tests cover behavior immediately below and at the
threshold. Both future runs will load the same revised policy; the old V12 and
V19 processes retain their prior loaded code. The policy version records this
change as `release-field-practice-choice-after-180s-gate-stall`, and the
supervisor version is `barbarian-gate-quest-funded-progression-v20-analysis-health-band-field-practice-release-180s`.
Full Jev suite passes 130/130; this remains a live-progression hypothesis,
not a demonstrated leveling improvement.

Hosted Jev attempts on this date returned HTTP 402 before any Jev decision
was made (`jevDecisions: 0`); the brief hybrid smoke therefore fell back to
local Qwen3:4B. The current long runs and queued V20/V21 comparison are local
model tests, not hosted Jev results. The credential itself is kept out of
reports. At 15:02 UTC both current processes and both sequential queue
workers were heartbeating; queues correctly remained waiting on V12 and V19.
No new sim was started and no game/server code was changed.

Follow-up inspection of V12's 15:03–15:05 trace found a weapon-specific
supervisor mistake: after buying and wielding a blunt club for the open Nth
weapon rows, the old policy later forced `wield_dagger` even though
Small Edged was rank 14 and every remaining weapon-row threshold was at most
8. The new gate-aware gear filter excludes a `wield_*` action when that
skill's rank already meets the lowest still-open weapon threshold, while
leaving distinct under-ranked lanes eligible. This should prevent a return to
the saturated dagger and rotate toward blunt or another offered lane. A
regression test recreates the recorded ranks and legal menu; full Jev suite
passes 131/131. The code is Jev-harness-only, and future queued V20/V21 runs
load it identically. V12/V19 keep their in-memory old policy. This is still a
hypothesis until requirement rows close in a live run.

The next matched runs now have an explicit audit metric for this intervention:
`stalledChoicePassThroughs` counts decisions made after 180 seconds without
gate movement where the supervisor left the provider's action unchanged. The
per-decision event records `stalledChoicePassThrough`, and the Jev-player
dashboard surfaces the total while preserving `n/a` for older manifests.
This makes V20/V21 auditable for whether the stall release actually engaged,
separately from whether it ultimately closed a requirement. The counter has
focused unit coverage and the dashboard contract test passes; Jev suite is
133/133 green. It adds telemetry only and does not alter action selection.

At 15:10 UTC, an offline replay of V19's latest 100 saved decisions supplied a
strong direct check of that change. On 55 decisions, Jev had chosen the legal
`practice_brawling` action after more than 180 seconds without gate progress;
the old live policy executed `perform` in all 55. Replaying the same saved
menus and provider choices through the revised policy selected
`practice_brawling` in all 55. This is a counterfactual over real recorded
menus (not a provider rerun or game execution), and it identifies one
plausible weapon-gate mechanism now being suppressed by the wrapper. A focused
regression test covers this exact open-weapon-gate choice. V19 itself still
runs old loaded code.

At 15:19 UTC, a fresh replay of V19's latest 100 recorded menus compared the
queued variants directly. The revised uncoached supervisor would still
replace 41 provider choices with field practice; advisory lane coaching would
preserve all 41 mapped choices. Of these, 31 were Jev's `practice_brawling`
choices that the old live supervisor turned into `perform`, and 9 were
Brawling choices turned into `appraise_dagger`; one other mapped choice made
up the remainder. Separately, the revised uncoached policy already passes
through 58/58 Brawling choices in this sample taken after 180 seconds without
gate progress. This supports keeping V20 (revised supervisor, coach off) and
V21 (same supervisor, coach advisory) as a matched pair: their predicted
behavior differs on useful choices before the stall threshold. These are
replays of real provider outputs, not live executions or causal evidence; the
queues remain the required validation.

The offline pair report originally omitted the new pass-through telemetry, so
the matched V20/V21 result would have hidden whether the coaching variant
changed this mechanism. `compareJevPlayerPair` now includes both
`stalledChoicePassThroughs` and `supervisorOverrides` per run and reports their
candidate-minus-baseline deltas; missing values remain unknown. A dedicated
pair test verifies the metric independently from rank-point and gate-closure
deltas. The Jev suite passes 134/134, the comparison tests pass 5/5, and the
edited comparison module passes `node --check`. This is reporting-only; the
current live runs and queued settings were not changed.

At 15:31 UTC, added an offline decision-streak audit to make the next trace
reviews more useful without launching a sim. It reports long same-action runs,
provider choices versus executed actions, supervisor overrides, observed gate
rank-point/row deltas, and mapped action-skill rank deltas. It explicitly treats
these as temporal associations, not proof of causation; automatic combat can
advance requirements concurrently. Replay over the then-current V19 trace
(490 decisions) found two long overridden streaks: `perform` for 2,649 seconds
(136 decisions; Jev chose `practice_brawling` every time; gate +10 points and
one row closed), then `appraise_dagger` for 819 seconds (44 decisions; same
provider choice; gate +3 points and another row closed). Neither action's
mapped skill rank changed in the captured endpoints, so their apparent gate
gains may have come from concurrent combat or other activity. This proves the
old wrapper was steering the model for long intervals, but does not prove its
chosen lane was ineffective. The audit also correctly found no flat-gate
streaks in these runs. Current live manifests at that check: V12 remained
Circle 1 at 63/84, 9 rows closed, 10 unmet; V19 remained Circle 1 at 23/84,
2 closed, 17 unmet. Both were still active; queued V20/V21 plans were not
disturbed. The new tool has 4 focused tests; the complete Jev suite passes
138/138. This is observability progress only, not evidence of a leveling gain.

At 15:42 UTC, V12's live trace had reached 101/101 Dragon Form selections
rejected by the server's roundtime gate, with zero observed successful/fade
messages and the Inner Fire and supernatural requirement rows still at 0.
Each rejected decision began from a prompt reporting RT 0, but local Qwen took
about 4.7–9 seconds and automatic combat restarted RT before the command was
processed. This is a direct cause of the Barbarian gate stall, not a game-rule
problem. Added a harness-only RT-prefetch path: when a learned and affordable
ability advances an open supernatural row, Jev may select it while RT is
running; the wrapper holds the selected command, rechecks room/combat/health,
gate and resource state, and sends it only at an observed RT-free prompt. A
server RT refusal schedules the same selected action for the next legal window.
The player dashboard and pair report now expose requests, pending choices,
executions, cancellations and server deferrals. Ability-to-gate mapping is
specific (Dragon: Inner Fire/Augmentation; Tenacity/Serenity: Inner
Fire/Warding), so irrelevant learned forms are not offered as prefetches.
Focused scheduler/menu tests and the full Jev suite pass 142/142; syntax and
diff checks pass. No DR-native files or active-process settings were changed.
The already-running V12/V19 loaded old code and are not validation of this fix;
queued V20/V21 will load it when launched. At the check, V12 was still Circle 1
(64/84, 9 rows closed), V19 Circle 1 (25/84, 2 closed), and both processes plus
both queue workers were alive and heartbeating.

At 15:45 UTC, the same legacy runs continued to advance slowly: V12 reached
65/84 points and 10 rows closed; V19 reached 26/84 and 3 closed. This confirms
neither is wedged, so they remain untouched. The Dragon RT-prefetch patch is
not loaded by them and still awaits the queued V20/V21 live comparison.
`npm test` was also repeated: 708/715 passed; all seven failures were existing
Puffer expectation mismatches in `puffer-barbarian.test.mjs` and
`puffer-circle.test.mjs`. The focused 142-test Jev suite passes, with no Jev
failure in the repo-wide run.

Follow-up policy audit tightened ability-to-gate matching in both the normal
combat menu and the roundtime-prefetch menu: Dragon is offered/forced only for
open Inner Fire or Augmentation rows; Tenacity and Serenity map to Inner Fire
or Warding. The supervisor no longer spends an ability on a supernatural row
that the ability cannot train, and Jev's descriptions name the actual lane.
Added regression cases for the Warding-only mismatch and retained Dragon's
30-tick description. The full focused Jev suite now passes 143/143; policy,
runner, and prefetch module syntax checks plus scoped `git diff --check` pass.
This follow-up is still harness-only; the active runs and queue plans remain
unchanged.

At 15:50 UTC, both legacy players and both sequential queue processes were
still alive. V12 was at Circle 1, 66/84 points, 10 rows closed; V19 was at
Circle 1, 26/84 points, 3 closed. Queue manifests still correctly listed both
blocker runs as `playing`, with no V20/V21 run IDs yet. The latest repo-wide
test run reports 709/716 passing and 7 failures; the focused Jev suite is
143/143 green. The failures remain the already identified Puffer subprocess
expectation mismatches; no Jev test failed.

At 15:54 UTC, the same live runs remained active and their manifests continued
heartbeating. V12 had reached 67/84 Circle-2 rank points with 11 rows closed
and 8 unmet; V19 remained at 26/84 with 3 closed and 16 unmet, with no gate
movement for 636 seconds. An offline audit of V19's saved decisions (562
decisions) found two long periods where the old loaded supervisor replaced
Jev's `practice_brawling` choice: 136 decisions/2,649 seconds became `perform`,
then 116 decisions/2,200 seconds became `appraise_dagger`. Performance and
Appraisal ranks were unchanged at the sampled endpoints, while other skills
and gate points changed concurrently, so this is evidence of prolonged
wrapper steering—not proof those actions caused or failed to cause gate gains.
The current policy's 180-second no-gate-progress release and lane-coach
pass-through are specifically intended to prevent this kind of indefinite
override; V19 is old loaded code and cannot validate them. V12 and V19 still
have not reached Circle 2, and queued V20/V21 remain the live validation of
the updated harness. No sim was started or stopped for this audit.

At 15:57 UTC, tightened that escape hatch in the independent Jev supervisor.
Previously it released Jev's legal choice only after 180 seconds with no
Circle-gate movement; unrelated combat could periodically close a row and
reset that timer while a wrapper-selected Lore/Survival action repeated.
Now, after four consecutive same-room provider decisions redirected by that
specific field-practice override, the next legal provider choice passes through even
if unrelated gate progress was observed. Room changes reset the streak, and
safety/gear/combat overrides are unaffected. This is tied directly to V19's
long override trace, but that run has old code loaded. The Jev suite passes
143/143, the combined policy/dashboard/comparison suite passes 80/80, and
syntax/diff checks pass. Repo-wide `npm test` remains 709/716: all seven
failures are in the existing Puffer expectation tests, confirmed by running
those two Puffer test files directly. No live sim was started or modified;
V20/V21 remain necessary to establish whether this policy improves outcomes.

The first counterfactual replay showed why tests alone were not enough: the
runner supplies only eight recent action records, and V19 alternates each
provider decision with an internal wait, so a six-action threshold could
never trigger. The threshold was corrected to four consecutive provider
decisions (ignoring non-provider waits; a provider choice that passes through
resets the streak). A second flaw then surfaced: replaying every decision
against the old run's stored history did not model counterfactual history.
The replay now seeds from the first saved history and evolves action memory
after each simulated choice. On the latest 592 V19 decision menus, the old
run recorded 469 field-practice overrides; the sequential current-policy
replay produced 156. This is a choice-level offline counterfactual over menus
and provider choices generated under the old wrapper—not proof that live
progress will improve, since the simulated divergence would change future
menus and provider choices. The corrected report is
`supervisor-replay-2026-09-21T16-03-33-705Z-75da93.json`.

At 16:02 UTC, the complete Jev test suite passes 144/144. Repo-wide
`npm test` passes 710/717; its seven failures remain confined to the known
Puffer expectation mismatches (the Puffer-specific files were rerun directly
and reproduce them). Syntax and diff checks pass. The old V12/V19 live runs
and their queue workers remain untouched; live promotion of this harness
change still awaits the queued V20/V21 comparison.

At 16:04 UTC, after switching the replay to evolve its own simulated action
history, V19's latest 592 recorded provider decisions yielded 156
field-practice overrides under the current policy, compared with 469 such
overrides actually recorded by the old wrapper over those menus. This
decision-only counterfactual is not a matched gameplay outcome. The complete
Jev suite passes 145/145; repo-wide `npm test` passes 711/718, with the same
seven Puffer expectation failures. No game code or live process was changed.

At 16:05 UTC, both legacy runs and both queues were still alive. V12 remained
at 67/84 with 8 open rows and had shown no gate movement for 743 seconds; its
remaining lanes included Inner Fire/supernatural (0/2 each), 2nd and 4th
weapon, 3rd/4th Survival, and both Lore slots. V19 reached 27/84 with 16 open
rows and recent gate movement; its 1st weapon was 7/8, but Melee Mastery,
Expertise, Parry, supernatural, additional weapon/armor, and Survival lanes
remained. This confirms the old runs have distinct residual gates; neither
validates the new policy. The V20/V21 queue manifests still list V12/V19 as
blockers, so no replacement cohort was launched.

At 16:07 UTC, V19's latest menu still showed Jev choosing `practice_brawling`
while the old supervisor selected `appraise_dagger`. The evidence does not
make Appraisal a useless action: Appraisal had reached rank 1 and the 2nd Lore
row was 1/2, while the 1st weapon row was 7/8, 2nd weapon was 0/8, and Melee
Mastery was 1/8. Brawling could target the latter open combat lanes; Appraisal
could close a Lore lane. The new release is therefore meant to restore
bounded Jev agency between targeted supervisor choices, not to declare that
the supervisor's choice was ineffective. A matched live comparison is still
needed to find which balance advances gates faster.

At 16:11 UTC, a read-only audit of the 89 saved realtime Jev-player manifests
found 48 Barbarian runs and zero that reached Circle 2; the best so far is the
active Qwen3:8B V12 at 68/84 points. This is the actual program-level gap,
not just a replay metric. The saved V19 lane-coach replay (611 identical menu
records) shows the local Qwen3:4B chose `practice_brawling` 504 times. Without
advisory coaching, the supervisor changed 272 choices, including 192
field-practice overrides of Brawling; with coaching, 192 provider choices
were preserved and no field-practice override remained in that sample. This
supports testing the V20/V21 matched pair, but it still cannot establish which
policy levels faster because each replay holds old menus and provider choices
fixed. The pair queues remain waiting on V12/V19; no additional run was
started.

At 16:13 UTC, V12's latest menu/requirements snapshot was still Circle 1 at
68/84: Inner Fire 0/2, first Supernatural 0/2, second Weapon 6/8, fourth
Weapon 1/2, third Survival 1/4, fourth Survival 0/2, and both Lore rows 0/2.
While in combat, its only relevant legal gate action was `analyze_flame`; the
supernatural gains require learned forms in a legal execution window. V19 was
at 28/84 with 16 rows open and again had Jev choose `practice_brawling` while
the old wrapper chose `appraise_dagger`. Both manifests were heartbeating,
and queues remained waiting. This supports the queued tests of RT-prefetch
and lane-choice preservation; it does not justify changing active players.

At 16:14 UTC, V12's saved trace contained 128 decisions offering Dragon Form,
127 selected `ability_dragon`, all 127 were refused by the server for
roundtime, and zero activation messages were observed. Its active process is
still the old runner, so the RT-prefetch path is not loaded there. This is
direct live-trace evidence for the prefetched execution hypothesis, while
the queued newer-code run remains necessary to verify that the delayed form
actually activates and advances the open supernatural rows.

V19's 16:15 UTC snapshot clarifies the complementary failure: Dragon was
already learned and Inner Fire was 100, with Inner Fire and first Supernatural
still 0/2, yet the old action menu offered Dragon in only 6 of 631 decisions
and Jev selected it zero times. The old runner's normal menu only exposes
RT-gated forms at an RT-free prompt, so this is primarily an opportunity-window
visibility problem, unlike V12's repeated server refusals after attempted
selections. The prefetch menu is intended to address both: expose a relevant
learned form during RT, then hold and revalidate it until execution is legal.

At 16:20 UTC, queued a second matched policy pair for the stronger locally
available Qwen3:8B: control with coaching off, then the identical natural-speed
240-minute cohort with advisory lane coaching. It waits for the V20/V21 Qwen3:4B
pair to finish and for both legacy blockers to become terminal, preserving
sequential local-model load. Queue worker `jev-player-qwen8b-pair-after-v21-20260921`
is alive and its durable record is `waiting`; no V22/V23 player has launched.
The previous Qwen3:8B run reached 68/84 while the Qwen3:4B run reached 28/84,
so this paired follow-up tests whether the newer harness can retain the
stronger model's apparent advantage. It is not a result yet. Queue readiness
tests pass 6/6, the Jev suite passes 147/147, and full `npm test` reports
713/720 with the same seven Puffer expectation failures.

At 16:26 UTC, the advisory lane coach gained v2 progress sensing. Previously
it judged a committed skill lane only by rank; ranks can remain flat while
the player's per-skill learning mindstate is moving through the experience
pool. It now suppresses its two-pulse stall warning when that lane's observed
mindstate has advanced, and tracks mindstate stage when the lane action is
temporarily absent. The wire mindstate feed is top-ten only, so omission is
explicitly unknown and retains the last stage/timestamp. This changes only the
independent harness and its provider context; no game/server files or active
runs were changed. Targeted lane-coach tests pass 11/11, Jev suite 149/149,
syntax and diff checks pass. Repo-wide `npm test` completed 715/722; the same
seven Puffer expectation failures remain outside this Jev change.
The currently running V12/V19 processes and V20/V21/V22-V23 waiters were
verified alive before the edit and remain untouched; these old/new comparisons
will still be needed to judge actual leveling rather than the improved stall
diagnostic.

At 16:28 UTC, an initial replay of V19's newest 120 saved menus against
supervisor v23 reported 19 uncoached changes. That count is superseded: the
first evaluator incorrectly shared the coached arm's action history with the
uncoached arm, so coach-preserved choices erased control override streaks.
The replay tool now evolves those histories independently. A trace audit also
found that v2's dashboard stall counter was still rank-only; it now counts a
stall only when both rank and observed per-skill mindstate have been flat for
400 seconds, and the dashboard exposes committed-lane mindstate advances for
the upcoming matched comparison.

At 16:34 UTC, the corrected independent-history replay of the latest 120 V19
menus found 29 uncoached changes and 35 lane-coach preservations. This is a
fixed-menu counterfactual with separate action-memory trajectories, not proof
of faster gate progress; the natural-speed V20/V21 paired runs remain the live
test. Replay unit tests now include a regression where the coached branch must
not reset the uncoached branch's four-override streak.

V12 ended naturally at its four-hour cap at 16:30:20 UTC, status `incomplete`,
Circle 1, 68/84 points, 137 kills, and 2,417 commands. Its eight open rows were
Inner Fire 0/2, first Supernatural 0/2, second Weapon 6/8, fourth Weapon 1/2,
third Survival 1/4, fourth Survival 0/2, and both Lore rows 0/2. The old run's
supervisor was v12 and therefore did not exercise the newer RT-prefetch or
override-release changes. At 16:31 UTC V19 remained live at 29/84, Circle 1,
with 15 unmet rows after three hours and nine kills; its four-hour run remains
the last blocker before the queued Qwen3:4B comparison can start.

At 16:30 UTC, V19's live manifest advanced from 28 to 29/84 rank points
(still Circle 1); its gate-progress timer reset 13 seconds earlier. V12
remains Circle 1 at 68/84, with no gate-rank movement for 1,350 seconds and
only seconds left before its four-hour cap. Both player processes are still
heartbeating, so V12 is being allowed to reach its configured cap naturally.
The three local queues remain alive and waiting for both legacy runs to become
terminal; no new model has been loaded and no duplicate run has been started.

At 16:35 UTC, V19 still heartbeats at Circle 1 and 29/84 with 15 unmet rows;
its latest gate movement was 347 seconds earlier. The corrected replay unit
suite passes 8/8, all Jev tests pass 150/150, and `git diff --check` passes.
Repo-wide `npm test` completes 716/723 with the same seven Puffer expectation
failures. All three local-model queues remain alive and waiting only on V19 to
finish; no new sim was launched during verification.

At 16:36 UTC, the corrected replay over V19's newest 120 menus reports 27
uncoached changes and 33 lane-coach preservations (the window advances as the
live trace grows). The comparison remains fixed-menu and observational. V19
and all three queue workers were confirmed alive; each queue still identifies
V19 as its sole playing blocker.

At 16:39 UTC, the matched-pair report was extended to expose the advisory
coach's decision count, gate-mapped/preserved choices, rank and mindstate
advances, and true stall prompts, with candidate-minus-control deltas. This
will let the queued natural-speed comparison answer both whether the coach
changed the progression outcome and whether it actually engaged as designed.
The Jev suite passes 151/151; repo-wide tests are 717/724, retaining the same
seven Puffer expectation failures. V19 is still Circle 1 at 29/84 after 3h08m,
with 15 rows unmet and 577 seconds since gate movement. All queues are live
and waiting; no replacement run was launched.

At 16:40 UTC, V19's saved trace confirmed a separate diagnostic blind spot:
its wrapper alternated execution between `practice_stealth` and `forage` while
overriding `practice_brawling` repeatedly. The old same-action loop audit
therefore reported no current streak. The offline audit now adds a separate
override-streak view grouped by Jev's provider choice, wrapper reason, and
room, and includes the distribution of executed substitutions plus gate
movement. A regression test reproduces the alternating-action case. This is
diagnostic only; it does not alter gameplay.

At 16:43 UTC, the expanded audit found V19's longest override streak: 434
consecutive decisions over 7,787 seconds where Qwen3:4B chose Brawling and the
old supervisor selected one of four Survival/Lore actions (136 Performance,
230 Appraisal, 34 Stealth, 34 Forage). Gate points rose 20 during this span,
so the streak is not a causal failure verdict; the execution alternation and
choice loss are now visible. Two shorter override streaks (30 and 10
decisions) had no displayed gate-point or row closure movement. The current
policy would release choices after a gate-progress stall, but this live V19
process predates that release. The loop-audit regression passes 5/5, all Jev
tests 152/152, and full `npm test` 718/725 with the same seven Puffer failures.
V19 remains live at 29/84; the three local queues still wait on it.

A 16:43 UTC replay of all 748 saved V19 menus against current supervisor v23
counted 184 field-practice overrides in the uncoached counterfactual versus
434 actually logged by V19's historical v19 supervisor. The advisory branch
preserved 218 provider choices; 80 total decisions still changed under other
supervisor rules. These are separate-history fixed-menu simulations, not a
live learning result, but they confirm the repeated-override release is
exercised by this trace and make the queued natural-speed cohort a direct test
of whether preserving those choices improves Circle 2 gate closure.

At 16:54 UTC, the loop audit's menu-coverage mapping was refined against the
active V19 trace. A visible-prey attack can open combat and passively train
Evasion, Parry, Melee Mastery, and visibly worn armor; equipment snapshots
identify armor by displayed item name when they omit item IDs. This reduced a
false appearance of missing armor choices: 769/794 observed open-armor menus
had a mapped option in the latest snapshot. The audit still measures offered
opportunity only, not execution or EXP. The Jev suite passes 157/157.

A fresh fixed-menu replay of 805 V19 decisions against supervisor v23 changed
264 choices with lane coaching off. The advisory lane-coach counterfactual
preserved 218 provider choices and changed 80 total decisions. The live V19
runner remains on its older policy, Circle 1 at 29/84 rank points with 15
requirements open and 1,329 seconds since the last gate-rank movement. This
replay does not establish that lane coaching improves leveling; the queued
natural-speed comparison remains the relevant outcome test.

At 16:55 UTC, a fresh trace count sharpened the failure diagnosis. Completed
V12 (Qwen3:8B, supervisor v12, four hours) recorded 68/84 Circle-2 rank points,
11 rows closed, and 137 kills. Active V19 (Qwen3:4B, supervisor v19, 3h25m)
had 29/84 points, 4 rows closed, 9 kills, and 698 logged field-practice
supervisor overrides. These runs are not a matched model comparison, so the
outcome difference cannot be attributed to model size alone. The V19 trace does
show the old wrapper replacing most of its model's decisions, making the
current V20 uncoached run the direct test of the stall-release repair before
interpreting the queued Qwen3:8B pair.

At 17:01 UTC, the most recent 120 V19 decision menus provided a particularly
clean offline check: Jev chose Brawling in all 120; the live v19 supervisor
replaced those choices with Stealth/Forage, while v23 replay preserved all 120
provider choices. This validates the policy branch on the exact failure trace,
not its gameplay effect. V19 is still the old live process, so only the queued
V20 run can test whether the repair improves actual Circle 2 progression.

The best completed V12 trace's final actionable snapshot was taken 15 seconds
before its 240-minute cap. It was still Circle 1 at 68/84 points, with 11
requirement rows closed and 8 open (16 rank points remaining). Its menu offered
only Rest and strongbox handling while health was below the outdoor recovery
ceiling. In the final 30 minutes it gained one rank point and closed no row.
This suggests that Circle 2 may need a longer natural-speed cap even for the
stronger observed cohort; it does not establish the exact needed duration.
Keep the existing 240-minute matched pairs intact, then use their results to
choose a longer cap for a follow-up rather than silently extending one arm.

At 17:02 UTC, V19's gate total advanced by one point to 30/84 after about 33
minutes flat. Its last 120 choices were still Jev selecting Brawling while the
old supervisor alternated 60 Forage and 60 Stealth executions. This shows the
old substitutions can coincide with slow gate movement; it is not a causal
failure claim, but the run remains far below Circle 2 with roughly 28 minutes
left on its cap.

At 17:11 UTC, V19 had 31/84 rank points, 4 rows closed, 15 open, and had gone
375 seconds without a gate-rank gain. The latest 120 decision menus repeatedly
show the exact equipped-weapon closeout case: Jev selects Brawling while the
equipped Small Edged lane is rank 7/8 and a legal attack is visible. Supervisor
v25 adds a bounded attack override for that exact one-rank gap (healthy, no
bleeding or active delivery, at most four nudges in the recent-action window
for that room). Importantly, the
override remains eligible during gate stalls; v24's initial replay showed
that excluding stalled state suppressed the closeout precisely when it was
needed. Replaying the same 120 menus changed 62 choices: 35 closeout nudges
and 27 existing safe Survival/Lore practice nudges. This is fixed-menu
counterfactual evidence, not proof of kills or rank gains. The focused policy
and replay suites pass 82/82. The full repository suite currently reports 7
failures in the pre-existing Puffer Barbarian/circle subprocess tests; no game
engine or native server files were changed for this supervisor rule.

V19 remains on its already-loaded v19 process and is still active, so it cannot
validate v25. The queued V20 control and V21 advisory-coach run still wait for
V19's terminal state; their children will import the current supervisor code
when they launch. V12 remains the strongest completed Jev run at 68/84, but no
run has yet reached Circle 2, so consistent progression beyond level 2 remains
unproven and the objective is open.

At 17:12 UTC, the live V19 trace strengthened the closeout hypothesis: its
latest 100 decisions were all Jev choosing Brawling with Small Edged at 7/8,
both attack actions visible, at least 75% HP, no bleeding, and no active
delivery quest, all in the same field room. The gate had been stalled for over
six minutes. Thus all 100 menus satisfy v25's closeout guards, though its
four-in-the-recent-window cap intentionally allows Jev's own choice to pass
through after four recent nudges. This shows the intervention is highly
relevant to the observed stall; V19 itself still runs v19 and gives no evidence
yet about whether the nudges actually produce rank gains.

At 17:14 UTC, V19 remained at 31/84 after 529 seconds without gate progress.
Its authoritative open rows show this attack is only one part of the circle
gate: Expertise 0/8, Melee Mastery 1/8, Inner Fire 0/2, Parry 2/8, weapon
lanes 7/8, 0/8, 0/4 and 0/2, first armor 2/6, Survival rows 3/4, 3/4, 0/4,
0/2, and Tactics 0/2 (plus the first supernatural row at 0/2). The visible
attack can advance several physical lanes, but cannot satisfy Expertise,
Inner Fire, Tactics, Survival or Lore by itself. Future comparisons must
therefore be judged on total gate-closure rate and target completion, not on
whether the first weapon row closes alone.

At 17:19 UTC, live counters made the autonomy problem clearer: V19 had 9 kills
and 31/84 gate points after 3h49m, with 926 supervisor overrides across 953
decisions (97%). In its latest 100 decisions Jev chose Brawling every time;
the v19 wrapper had mostly executed Survival/Lore practice instead. Completed
V12 (Qwen3:8B, different older supervisor) had 137 kills and 68/84 at its
four-hour cap. This is not a matched comparison, but it makes V20's revised
post-stall pass-through an important live test of preserving Jev's combat
choice instead of replacing it. Model size, supervisor version, and other
run differences still prevent attributing the outcome to one factor.

Added a read-only action-to-next-snapshot audit at
`scripts/jev-player-outcome-audit.mjs` so future v25 runs can report observed
gate/skill changes near each selected action. Applied to active V19 at 17:18
UTC, it processed 936 decisions and found 935 adjacent outcome windows. Some
survival/lore commands were followed by gate movement in those windows, while
attack and analysis samples were small; ongoing combat and asynchronous EXP
make these descriptive associations unsuitable for attributing progress to a
single action. The report is
`public/live/jev-player/outcome-audit-2026-09-21T17-18-07-848Z-b5152e.json`.
Focused Jev tests pass 85/85. Full `npm test` now reports 7 failures, still
confined to the Puffer Barbarian/circle subprocess suites (727 pass); the new
audit and the isolated Jev policy/replay tests pass.

Inspection of V12's actual final decision menu (16:30:05 UTC, 15 seconds
before its cap) narrows the remaining 16 rank points: Inner Fire 0/2 and first
Supernatural 0/2; 2nd weapon 6/8 and 4th weapon 1/2; 3rd Survival 1/4 and 4th
Survival 0/2; and both Lore rows 0/2. Its visible actions at that instant were
only Rest and strongbox handling at 112/145 HP. This is one final snapshot,
not proof that those lanes were unavailable throughout the run, but it shows
why simply lengthening the cap is not yet a sufficient diagnosis: future run
reviews must check that Jev is offered and reaches the required ability,
distinct-weapon, Survival and Lore activities after recovery.

At 17:23 UTC, the latest 100 V19 decision events again show 100/100 Jev
choices as `practice_brawling`, but the v19 wrapper executed 50 Forage and 50
Stealth actions, with no attacks in that window. The manifest stood at 31/84,
9 kills, and 944 overrides / 971 decisions (97.2%). This confirms that V19's
current activity is not evidence against Jev's combat choice; it is evidence
of the old supervisor repeatedly suppressing it. The queued v20 run remains
the first live test where that choice can pass through after the stall guard.

Correction/addendum at 17:26 UTC: V19's currently loaded v19 supervisor also
has a repeated-field-practice release after a streak, so it is not accurate to
say it never passes Jev's choice through. At 17:25:52 it passed a Brawling
choice after a run of Survival/Lore overrides; the same snapshot showed
Foraging 3→4, the first Survival row closing, and gate points 31→32. The next
decision selected analysis and combat, so this is a short-lived observed
pass-through associated with progress, not proof of causation. The key v25
distinction is that its 180-second gate-stall release is broader and it has a
bounded near-complete weapon closeout; V20 tests whether those differences
improve sustained progression over V19.

At 17:25 UTC, replaying the latest 120 V19 menus through v25 changed 57
choices: 35 bounded first-weapon closeouts and 22 existing Survival/Lore
practice nudges; 63 choices passed through unchanged. The old v19 execution
changed all 120 Jev Brawling choices in that sample. This is a fixed-menu
policy contrast only, but it quantifies the intended reduction in wrapper
interference while preserving a targeted completion attempt.

The replay tool also correctly declines to reconstruct V12's provider choice:
its older event schema records the executed `choice` but not the model's
separate recommendation. A replay of its latest 500 decisions therefore
reports 500 missing provider choices instead of pretending the wrapper's
action was Jev's. Keep this distinction in new runs; V19 onward records
`providerChoice`, selected action, and supervisor reason separately.

At 17:34 UTC, I verified the configured Keychain credential by starting a
Jev-primary natural-speed run in a disposable world. The provider returned
HTTP 402 on its first decision request; the run stopped with zero Jev choices
and zero game commands. The single failed call opened the permanent-error
circuit as designed, so it was not retried. Run
`jev-player-2026-09-21T17-34-21-400Z-5cfdf3` records the sanitized error and
code hashes. This is evidence of a provider-account/payment gate, not a Jev
decision-quality result. Keep progression experiments on the local provider
until Jev API access accepts requests; then rerun the Jev-primary cohort.

V20 interim snapshot at 17:36 UTC (306 seconds, still `playing`): local
Qwen3:4B had made 39 decisions, with 34 supervisor overrides and one kill.
Circle 2 remained 0/84 with all 19 rows open, while 65 learning-mindstate
advances were observed and the activity signal was `learning-only-no-gate-rank`.
This is not a run verdict: it shows the distinction between learning progress
and gate progress that later review must preserve. The model chose `flee`
repeatedly in an initially stable kobold fight; the wrapper temporarily
substituted legal analysis/wait actions, then the character fled after taking
damage. Since this is the local control, it says nothing about Jev's play
quality.

To test the autonomy lever without changing the active V20, I added an opt-in
same-room repeated-choice release (default off), an event counter, and a
fixed-menu replay flag. The release is still subject to the runner's existing
emergency-health and roundtime checks. At 17:42 UTC, both supervisors replayed
the same 63 V20 menus: the current policy changed 50 provider choices; the
four-override candidate changed 45 and recorded six bounded pass-throughs.
This is only a counterfactual choice-preservation measure, not evidence of
better progression. Focused policy/replay/queue tests pass 86/86. The live
candidate is now queued as
`jev-player-repeat-choice-release-v26-after-v23-pair-20260921`; it waits for
V20, V21 and both V23 Qwen8B runs to finish, then runs the same natural-speed
Qwen3:4B control settings with lane coach off and release threshold 4. At
17:45 UTC it was `waiting`, with V20 still `playing`; no duplicate run started.
Do not change V20 or conflate this treatment with the lane-coach comparison.
The Jev-player dashboard now exposes the V26 queue/prerequisite states and,
for candidate runs, the release threshold and release count beside the other
supervisor telemetry. A later V20 heartbeat at 17:47 UTC (964 seconds) still
showed 0/84 rank points and 19 open rows, despite 118 observed learning-stage
advances (`learning-only-no-gate-rank`). Treat the run as active and
inconclusive until its cap; the persistent gap is why natural-speed gate
completion, not mindstate movement alone, remains the promotion criterion.
The next heartbeat at 17:48 UTC reached 1/84 with all 19 rows still open:
first measurable gate movement, but nowhere near a Circle 2 result.

Read-only V20 loop/menu audit at 17:50 UTC covered 97 provider decisions.
It found no repeated same-action streak meeting the two-minute threshold, but
the active `1st supernatural` row had no mapped direct skill action in any of
the 97 menus; the player had not learned a qualifying Barbarian ability.
First Survival and Lore actions were mapped in only 19/97 and 28/97 menus,
respectively. This is menu-coverage evidence, not proof those skills could not
be trained: prerequisite routes and delayed EXP are not fully represented by
the direct-action mapping. The policy already offers the guild-hall route and
prioritizes it after 180 seconds without gate movement when at least 40 silver
is available. Next review should verify whether V20 actually reaches the hall
and learns Dragon Form after that gate-stall trigger before changing that
priority; otherwise we'd risk mistaking the audit's incomplete prerequisite
mapping for a real missing action.

Follow-up confirms that route works. V20 executed `learn dragon` at the
Barbarian hall at 17:51:43 UTC after the stall/funds conditions were met. In
the next 13 decisions, five menus offered `ability_dragon`; provider selection
and supervisor selection were only decision/prefetch evidence, not executed
ability use. The event trace shows five Dragon Form prefetches and five
cancellations, primarily at the 75% HP safety bound (one after combat ended).
There were zero confirmed executions at the latest audit. By 17:53 UTC the run
was still active at 3/84 points, with all 19 rows open. The earlier 0/97
coverage was a pre-learning snapshot, not a persistent menu defect. Keep
actual use separate from offers, selections, and prefetches; the harness stayed
isolated and the native game engine was not changed.

At 17:57:48 UTC, the V20 manifest heartbeat was current and the run remained
`playing` (1,603 seconds elapsed). It had 4/84 Circle-2 rank points, no rows
closed (19 unmet), 201 observed learning-stage advances, and 8 kills. Dragon
Form was learned; the runner had recorded 7 prefetches, 6 cancellations, and
0 executions. This is still an active, inconclusive run—not evidence that the
new harness has improved leveling. The player was at 109/145 HP, so the 75% HP
execution floor is an observable constraint rather than a stale telemetry
artifact. The Jev-player dashboard now displays ability cancellations as a
separate counter; its focused regression assertion passes.

The V20 action audit clarified one wrapper inefficiency: RT Dragon Form
prefetches have repeatedly been made below the action's 75% execution floor,
then discarded after paying for a provider decision. Added an opt-in
`JEV_PLAYER_RT_ABILITY_MIN_HP_FRACTION` gate (default `0`, preserving existing
run behavior) so a future candidate can hide that future-action choice while
HP is below a declared floor. Its manifest and dashboard record the setting;
the pair comparator requires the floor difference to be explicitly declared,
then reports it alongside cancellation/execution metrics. Unit tests fail
closed when enabled without valid HP telemetry. The feature does not change DR
action legality, combat, or automatic swings. Do not opt it into V21/V23/V26:
those queues are already defined and should remain interpretable. Next test
should be a matched natural-speed control/candidate pair after the existing
queue chain, judged by Circle-2 gate closure first and canceled-vs-executed
ability counts second; until then this is a harness hypothesis, not a gameplay
improvement.

At 18:03:25 UTC, V20 was still `playing` at 1,940 seconds with 5/84 points,
zero closed rows, and 19 unmet. Its counters had grown to 13 RT ability
prefetches, 12 cancellations, and zero executions. This strengthens the case
for testing the opt-in health floor, but the existing run remains unchanged
and the candidate has not been exercised live.

At 18:08:31 UTC, V20 remained active at 9/84, still zero rows closed; Dragon
Form counters had reached 16 prefetches, 16 cancellations, and zero executions.
The matched V27 health-floor pair is now durably queued after V20/V21/V23/V26.
Its worker PID is 93566 and the queue manifest is heartbeating `waiting`; no
new sim was launched while the earlier chain is active. The pair compares
Qwen3:4B, Barbarian Human, natural speed, 240 minutes, identical code/settings,
with only RT ability prefetch HP floor 0 vs 0.75 changed.

An 18:16 UTC audit corrected an important telemetry distinction: zero
`rtAbilityPrefetchExecutions` means none of the delayed RT-prefetch actions were
dispatched, not that Dragon Form was never used. The trace has three ordinary
RT-free `form dragon` dispatches; each is followed within 4.6 seconds by an
Inner Fire change from 100 to 83 or 77, consistent with the 20-point cost plus
natural regeneration. Because the server emits no success text for this form,
the dashboard now labels these as resource-delta-inferred uses, not confirmed
server acknowledgements. The inference helper has tests for positive resource
deltas, insufficient deltas, and canceled prefetches. At the same heartbeat the
run was still Circle 1 at 14/84 with zero rows closed; RT prefetches/cancellations
had risen to 23/23. These ability uses are evidence of working live combat
choices, but not evidence of Circle 2 progress.

The offline loop audit now includes safe-idle field-practice choice coverage and
can save a durable snapshot with `node scripts/jev-player-loop-audit.mjs --run
RUN_ID --save`. On V20 at 18:25 UTC, 85 of 102 safe out-of-combat decisions
offered a Survival/Lore practice action; only 4 selected one (2 stealth, 2
forage). Of the other 81 field-practice menus, `attack_0` was selected 27 times,
26 corpse skins, 11 field routes, and the rest were gear, training, or other
objectives. This is decision-selection evidence, not command success or EXP
attribution. It narrows a future experiment: test whether field-lane
choices can be preserved ahead of optional new fights once urgent gear,
training, and corpse obligations are satisfied. Do not change the active
matched queue's policy/code; implement and compare that candidate only after
the current chain resolves.

Added a harness-only `--stalled-field-practice-release-after 180` replay
counterfactual. It leaves the baseline `supervisedChoice` intact and records a
separate candidate choice only when an already-legal Survival/Lore action is
available, the player is safe/out of combat with no quest, and the baseline
supervisor is about to route to optional fields or start another fight. On
V20's 283 saved menus it found 9 such choices (6 Stealth, 3 Performance); the
baseline supervisor replay still reports 175 changes independently. This is
not evidence of XP or Circle gains, but it confirms a narrow, measurable
policy candidate exists in captured decisions. The independent rule and
counterfactual replay do not enter the live player import graph, preserving
the queued comparison hashes. Its focused policy/replay tests pass (86 total).

V20 is still running and remains Circle 1, but it has now gained 22/84
Circle-2 points and closed 1 of 19 rows (18 remain). That is genuine gate
progress, so this field-practice result is a candidate for a later matched
comparison, not a reason to disrupt the active run or imply that the run is
stalled overall.

Integrity caveat for the already queued series: comparing V20's launch-time
manifest hashes with the present workspace shows drift in `player`,
`jevClient`, `decisionPolicy`, and `rtPrefetch`; the other recorded hashes
checked here match. Those source files' mtimes are after V20 started. The pair
comparator correctly treats `codeHashes` as a matched field, so any later arm
using the current source will be marked `invalid-pair` against V20. Existing
queue processes were already running with their earlier code and are not
silently rewritten by this offline candidate work. Do not interpret any such
pair as a policy comparison; future queues need to pin/check source hashes
before launch, and this queued chain needs an integrity audit before its
results are used.

Correction, 2026-09-21 18:29 UTC: V20's process actually exited at 18:27:53
with `ReferenceError: retryAt is not defined` in the RT-refusal callback, after
reaching 23/84 points and closing 1 row. The manifest had remained falsely
`playing`. Fixed the field to use the in-scope `retryAfter` and confirmed the
RT-prefetch/policy/comparison tests pass. Fatal-error finalization in the player
is still missing; adding it now would change V28/V29's pinned runner source, so
defer it until this pair terminates. Stopped the four dependent queue
workers before they could launch descendants from this failed baseline; V21,
V23, V26 and V27 queue records are marked `invalidated`, not usable outcomes.

The queue extension now snapshots the runner's complete source-hash set and
fails closed if source changes while waiting or differs from its prerequisite;
failed prerequisites are no longer treated as launch-ready. A clean replacement
control/advisory pair is configured as V28/V29 with fresh comparison IDs. These
new runs use the current source snapshot and must not be edited after V28 starts.

V28 launched at 18:39:54 UTC as
`jev-player-2026-09-21T18-39-54-558Z-1f504a` (Qwen3:4B, Barbarian Human,
physical-combat-v1, natural speed, boost 1, 240-minute cap, target Circle 3).
The queue's 14 source hashes exactly matched both the run manifest and current
workspace at launch. At 18:44 UTC it was alive at 269 seconds, Circle 1, 0/84
Circle-2 points, 0 rows closed, no errors; fresh wire events showed ordinary
combat activity. This is an early startup sample, not a stall verdict. V29 is
still waiting on V28 with the same pinned hashes. Do not edit hash-covered Jev
runner files while this pair is active.

An early V28 trace audit at 374 seconds analyzed 43 legal menus: all 19 safe
idle menus offered field practice, with 4 selections; the outcome audit saw no
rank or learning-mindstate advancement yet, although saved wire text confirms
real combat and completed Barbarian flame combos. This short window cannot
establish whether those activities will close gates. Offline replay of the
same 51 menus found 4 safe, quest-free optional-hunt decisions where the
180-second field-practice release would substitute a mapped legal action (3
Stealth, 1 Performance). This supports testing that one coherent lever after
the V28/V29 pair, not applying it to either active arm. Trace report:
`/live/jev-player/supervisor-replay-2026-09-21T18-47-11-285Z-0e2e09.json`.

At 18:53 UTC V28 remains alive (about 13 minutes), at Circle 1 with 1/84
Circle-2 rank points, 0 rows closed, 19 unmet, 3 kills, and no manifest errors.
Learning signals are now active (127 observed mindstate advances); this is
nonzero early progress, not evidence of a sustainable Circle-2 pace. V29 is
still queued behind V28. Replaying the latest 85 V28 menus yielded 62
supervisor changes overall and one low-funds crier offer where the baseline
selected `travel_fields_furrow`; the separate training-funds candidate would
choose the legal `take_quest` there. This exact choice is a testable funding
hypothesis, not proof that the quest is completed or profitable. Replay report:
`/live/jev-player/supervisor-replay-2026-09-21T18-53-02-203Z-656c22.json`.
Keep the quest candidate out of V28/V29, and compare only in a fresh run after
the pinned pair is finished.

The 18:54 UTC counterfactual replay covered 92 menus (the trace continued while
the previous note was written). It found 8 safe field-practice release
opportunities after 180 seconds (5 Stealth, 3 Performance), 7 choices the
advisory lane coach would preserve, and the same single crier offer. The
outcome audit had 87 adjacent decision windows: one `wait` window coincided
with +1 gate point (1/16), while none of 29 `analyze_flame` windows showed a
gate-point delta. This is observational only: a point can accrue between
decisions and cannot be credited causally to the preceding action. It does
suggest the harness should measure requirement deltas and mindstate progress,
not promote policies from action frequency alone. Replay:
`/live/jev-player/supervisor-replay-2026-09-21T18-54-38-292Z-dac52d.json`;
outcomes: `/live/jev-player/outcome-audit-2026-09-21T18-53-43-943Z-f79f6e.json`.

At 18:56 UTC the 101-decision V28 snapshot stood at 3/84 points: Brawling 1
and Evasion 2 account for those three rank points, with 159 observed learning-
mindstate advances, but still 0 requirement rows closed and all 19 unmet. The
latest adjacent-window audit associated +1 point each with one of 33 observed
`analyze_flame` windows, one of 18 `wait` windows, and one of five
`skin_marsh_hog` windows; these are not causal attributions. The loop audit
also shows only 35/101 menus had a mapped 1st/2nd Lore choice (mostly
`perform`/`appraise_dagger`), making lane opportunity coverage worth tracking
alongside rank pace. Run outputs:
`/live/jev-player/jev-player-2026-09-21T18-39-54-558Z-1f504a/loop-audit.json`,
`/live/jev-player/outcome-audit-2026-09-21T18-53-43-943Z-f79f6e.json`.

Added an independent crash-reconciliation utility (`scripts/jev-player-reconcile.mjs`)
to address the V20 failure where a dead player left its manifest as `playing`.
It is dry-run by default; it only proposes a terminal `failed` update after the
recorded process is confirmed gone and the heartbeat grace has elapsed. A live
dry-run of V28 returned no findings, preserving its active manifest. Four
targeted tests cover live process, stale dead process, recent exit/unknown
process, terminal/invalid manifests, and evidence-preserving apply semantics;
the Jev harness suites pass 22/22.

At 19:02 UTC the new efficiency audit covered 163 V28 decisions across 22.8
minutes: Qwen3:4B median response 2.575s (p90 3.118s), consuming 30.6% of the
observed trace span; mean prompt/completion usage was 1,274/12 tokens. The run
had 8 kills, 6/84 Circle-2 points, 0 rows closed, and 19 unmet. Current observed
pace is 15.8 points/hour; to reach 84 within the 240-minute cap from this
checkpoint would require about 21.5 points/hour over the remaining time. This
is a pace warning, not a forecast: learning rate can change, and no future
progress is inferred. Report:
`/live/jev-player/jev-player-2026-09-21T18-39-54-558Z-1f504a/efficiency-audit-2026-09-21T19-02-42.591Z-561a67.json`.
Qwen3:8B is installed locally, but should be assessed only after the matched
V28/V29 pair completes; changing models now would confound it. The trace audit
supports testing reduced prompt cost as a separate harness candidate, since
the small model spends roughly a third of wall time in inference.

For a scale reference, the same audit was run over completed V12 (Qwen3:8B,
four hours): median response 5.777s (p90 8.404s), 54.6% observed wall share,
34.25 kills/hour, and 17 rank points/hour; it finished 68/84 with 11 rows
closed. V28's early 4B snapshot was faster (2.575s median, 30.6% wall share)
but showed 21.06 kills/hour and 15.8 rank points/hour. These runs used
different supervisors and V28 is only about 23 minutes old, so the difference
is not attributable to model size. Keep the matched V28/V29 comparison intact;
consider prompt-size optimization before moving to a slower model. V12 audit:
`/live/jev-player/jev-player-2026-09-21T12-30-20-797Z-a0984e/efficiency-audit-2026-09-21T19-04-30.030Z-5f657b.json`.

At 19:05 UTC V28 reached 7/84 in 25.2 minutes (10 kills, 0 rows closed,
19 unmet, no errors). Refreshed observed pace is 16.65 points/hour—close to
V12's completed 17/hour, but still below the roughly 21.5/hour needed from
this point to finish its 240-minute target. Report:
`/live/jev-player/jev-player-2026-09-21T18-39-54-558Z-1f504a/efficiency-audit-2026-09-21T19-05-08.488Z-1726aa.json`.

The run page previously displayed stale V20/V21/V26/V27 queue files while the
actual pair was V28/V29. Updated `public/jev-player.html` to surface the active
control/advisory pair and links, and to compute observed points/hour, kills/hour,
provider response median/p90, and inference wall-share from saved run events.
Inline module syntax, served page contents, old-queue-reference absence, and
24 focused harness tests pass. At 19:07 UTC V28 was still playing at 8/84,
12 kills, 0 rows closed; V29 remained waiting with valid source hashes.

By 19:09 UTC the active V28 manifest advanced to 10/84 with 13 kills, 0 rows
closed, 19 unmet, and no errors. Enhanced the offline matched-pair comparison
to include rank-points/hour, requirement-rows/hour, and kills/hour, rounding
only hourly deltas to two decimals. This prevents duration differences from
masquerading as policy improvements when a run ends early. Comparison,
efficiency, reconciler, replay, and code-hash focused tests now pass 33/33.

Browser QA of the live page at 19:08 UTC confirmed the refreshed dashboard
loads V28/V29 rather than the obsolete queues, exposes queue/run links, and
renders telemetry from the active trace. At that browser snapshot V28 had
reached 10/84, with 250 learning-stage advances; V29 was still waiting.

At 19:11 UTC V28 reached 12/84, 14 kills, 0 requirement rows closed, and
19 unmet. The refreshed audit measured 22.74 points/hour versus roughly
20.7/hour needed to reach the 84-point threshold during the remaining cap;
this clears the rank-pace threshold at that sample, but all 19 rows remain
independent circling blockers. V29 is still waiting with valid hashes. The
dashboard now displays the required rank pace separately and explicitly warns
that row requirements may still prevent circling. Inline syntax and served-page
checks plus 33 focused tests pass.

The authoritative Circle-2 snapshot identifies the remaining-owner spread:
Expertise 3/8, Melee Mastery 1/8, Parry 1/8, Evasion 5/6, Tactics 1/2; weapon
rows 3/8, 2/8, 0/4, 0/2; armor rows 1/6 and 1/2; Inner Fire 0/2, supernatural
0/2; survival rows 0/4, 0/4, 0/4, 0/2; lore rows 0/2 and 0/2. V28 has enough
rank points to show progression but has closed no row, so the practical blocker
is distinct-lane closure, not only rank throughput.

Added an opt-in offline counterfactual for a legal trainer lesson that opens a
new distinct Barbarian weapon lane. Replaying 258 V28 menus finds exactly one
eligible trainer choice: at `hall_barbarian` the model offered `skin_marsh_hog`,
the supervisor chose `learn_ability_dragon`, then chose `train_expertise` on the
next decision. The candidate would replace the first with `train_large_edged`.
That lesson costs 40 silvers, so it may consume the purse needed for the
subsequent Expertise lesson; this is a hypothesis with a real tradeoff, not a
promoted improvement. Replay:
`/live/jev-player/supervisor-replay-2026-09-21T19-22-14-334Z-3a734e.json`.
At 19:22 UTC V28 was still healthy at 18/84 and 20 kills, with 0 rows closed;
the 25.54 points/hour observed pace exceeds the approximately 20/hour needed
to reach 84 before cap. V29 remains waiting with valid hashes. Focused harness
tests pass 35/35.

At 19:25 UTC, extended the independent loop audit with a current distinct-lane
coverage snapshot (not a runtime policy change). Applied to V28's 285 saved
decisions, the latest authoritative skill state shows 2/4 weapon lanes ranked
(Brawling and Small Edged), 2/2 armor lanes (Light Armor and Shield Usage),
0/4 survival, 0/2 lore, and 0/1 supernatural. This corrects a misleading way
of reading the repeated Nth-skill rows as unrelated progress: the remaining
shortfall is nine new distinct skill lanes, besides any hard-skill rows. The
audit also shows 94/101 safe out-of-combat menus offered field practice, but
only six selected it; those are menu/selection counts, not proof of command
success or EXP. This points the next harness investigation at whether these
offers stay executable and lead to rank movement, rather than blindly forcing
another action. Replay artifact: `.../jev-player-2026-09-21T18-39-54-558Z-1f504a/loop-audit.json`.
The new loop-audit tests pass 13/13. A combined optional dashboard test also
exposed an existing stale assertion for the V21 queue filename after the page
had already moved to V28/V29; the loop-audit-only suite passes. At 19:25 the
live V28 audit was still `playing`, with 22/84 points and 1 closed row, so the
Circle-2 run itself remains incomplete.

At 19:30 UTC, expanded the offline outcome auditor again: it now distinguishes
provider/supervisor selection from observed execution and command echo, and
keeps adjacent-snapshot outcomes separate from a bounded five-decision/60s
lookahead. The lookahead also reports advancement in skills explicitly mapped
to the selected action, separate from unrelated skill movement in the same
period. In V28, each of the three observed `practice_stealth` and three
`forage` override actions was dispatched, but there is no mapped Stealth or
Foraging rank advance within the bounded windows; occasional Brawling/Evasion
movement in those same windows is unrelated and is not credited to the field
action. This narrows the diagnosis: not a lost dispatch, but no recorded rank
advancement in those windows. It still does not rule out EXP-pool or mindstate
progress that is not represented as a numeric skill rank in the saved state.
Added distinct-lane coverage to the live run page, derived from the manifest's
server-reported requirement eligibility and current skill ranks. Extracted its
pure formatter into `public/js/jev-gate-summary.js` so duplicate eligible
skills across Nth rows cannot be double-counted; dashboard queue assertions
were brought forward from obsolete V20/V21/V26/V27 names to the actual V28/V29
pair. The focused outcome/loop/dashboard suite passes 23/23.

The outcome report:
`/live/jev-player/outcome-audit-2026-09-21T19-30-43.686Z-afeeb0.json`.
The refreshed live V28 audit at 19:31 showed 26/84 points, 2 rows closed, 17
unmet, and 26 kills; it remains in progress and has not cleared Circle 2.
V29 is still waiting on the V28 baseline, with source integrity valid.

At 19:36 UTC, added a read-only action-feedback classifier to the outcome
auditor. It distinguishes accepted Forage attempts (including “find nothing
useful,” which still awards Foraging EXP in the native implementation) from
rejected location attempts, and accepted Hide/Performance/Appraisal feedback
from unknown text; explicit “Skill improved!” messages are reported separately
as rank-ups. This fixes the earlier ambiguity: V28's three Forages were all
valid attempts (two found no item, one found a root), and its three Hide actions
all succeeded, even though none showed a Stealth/Foraging numeric rank-up in
the bounded lookahead. The server source confirms these accepted paths award
skill EXP; whether and when that pool becomes a gate rank is separate evidence.
Action-feedback, outcome, loop, gate-summary, and dashboard tests pass 27/27.
Latest V28 audit: 28/84 points, 3 rows closed, 16 unmet, 28 kills at 19:36;
still playing, with 31.8% of observed wall time spent in provider inference.
Outcome report: `/live/jev-player/outcome-audit-2026-09-21T19-36-20.471Z-59eca1.json`.

By 19:37 UTC, refreshed V28 had reached 29/84 points while still at 3 closed
rows and 16 unmet; it is actively progressing but far from Circle 2. The new
safe-menu lane audit shows 108/108 sampled safe menus offered at least one
action mapped to an open Survival/Lore lane (75 Forage, 72 Hide/Stealth, 75
Hunt/Perception, 108 Performance, 106 Appraisal option appearances; menus may
offer several). Only 6 of those menus selected such a lane. This is now a
measured choice-allocation gap, not an availability or dispatch gap. The six
selected actions were all accepted, but the trace alone does not prove their
EXP-to-gate conversion. This supports an offline replay of a safe lane-practice
priority as the next candidate analysis; do not alter the active V28/V29
comparison or promote a candidate based on option counts alone.

At 19:40 UTC, replayed the existing 180-second stalled-safe-field counterfactual
with two offline harness refinements: it recognizes carried-item Appraisal as a
Lore option, and evolves its own recent-action history so equal-rank lanes are
rotated instead of repeatedly selecting the first menu item. On the 358 V28
decision menus, it finds 11 substitutions for otherwise optional field travel
or fresh hunting: 3 Hide/Stealth, 2 Forage, 2 Hunt/Perception, 2 Performance,
and 2 Appraisal. This is an opportunity count, not a predicted EXP or Circle
gain: replay cannot execute those unchosen commands or model travel/state
effects. The candidate may trade combat time for breadth and must be evaluated
in a later matched live run after V28/V29 completes. Replay:
`/live/jev-player/supervisor-replay-2026-09-21T19-40-19.583Z-d04fdb.json`.
The refreshed V28 heartbeat was current at 19:38 and the run was still playing
at 29/84 with 3 rows closed; V29 remained waiting with valid source hashes.
The focused supervisor/audit/dashboard suite passes 43/43.

Refreshed that replay at 19:41 as V28 continued. On 369 saved decision menus,
the 180-second candidate made 13 counterfactual substitutions: 8 would replace
an optional attack and 5 would defer travel to the fields. The candidate
rotated 3 Stealth, 3 Performance, 3 Foraging, 2 Perception, and 2 Appraisal
choices rather than selecting a single tied lane repeatedly. This exposes its
main cost: it would trade 5 field trips as well as 8 attacks for practice, so
do not treat the 13 choices as free progress. The replay report now records
those displaced baseline actions explicitly:
`/live/jev-player/supervisor-replay-2026-09-21T19-41-39.731Z-e6890b.json`.
V28 remains active at 31/84, 3 rows closed, 16 unmet; V29 is still waiting.
The replay now includes the displaced action type and navigation path length:
those same 13 choices replace 8 optional attacks plus 5 trips toward the
fields, with 97 total listed route rooms across the five travel options. These
are deferred routes, not travel savings; taking practice first may delay
combat gates and make the candidate a net loss. Replay report:
`/live/jev-player/supervisor-replay-2026-09-21T19-43-30.112Z-aca371.json`.
All 17 focused supervisor-replay tests pass.

Refined the candidate after accounting for those 97 route rooms: it now only
replaces a fresh optional attack and never substitutes for `travel_fields_*`,
which is needed to access prey for combat gates. Replaying the same V28 trace
now yields 8 optional-attack substitutions, still rotated across Survival and
Lore options, and zero displaced travel. This is a stricter, test-covered
hypothesis; still not a promotion or live-policy change. Replay:
`/live/jev-player/supervisor-replay-2026-09-21T19-44-33.785Z-5bdb65.json`.
At 19:44 V28 remained playing at 32/84 points, 3 rows closed, 16 unmet; V29
remained waiting with source integrity valid. Seventeen replay tests pass.

At 19:50 UTC, extended the offline loop audit's general gate menu-coverage
report into a per-row choice funnel: for each open requirement it now counts
decision snapshots with a mapped eligible option, selected actions mapped to
that row, and the conditional selection rate. The new audit was run against
the existing V28 trace (413 decisions), not a new game run. It separates
unavailable choices from available-but-unselected ones: for example, mapped
Lore actions appeared on 129 menus and none were selected; eligible Survival
actions appeared on 159 menus and were selected on 73; supernatural options
appeared on 139 menus and were selected on 10. The report is saved alongside
the trace at
`/live/jev-player/jev-player-2026-09-21T18-39-54-558Z-1f504a/loop-audit.json`.
These are mapped-option selection rates, not proof of command success, EXP,
or causal gate progress; broad combat actions can map to multiple passive rows,
and the metric does not claim a chosen distinct Nth skill lane. Focused
loop/outcome/efficiency/dashboard tests pass 26/26. No live policy or game
runtime changed.

At 19:46 UTC, the independent efficiency audit gained per-row trajectories,
grouped by circle so a later promotion cannot mix gates. Across 385 Circle-2
decision snapshots, V28 closed Evasion (19:25), 2nd Armor (19:27), and Tactics
(19:33). First Armor is 3/6; Expertise 5/8; Melee Mastery 3/8; Parry 2/8;
1st/2nd Weapon 4/8 each; and 1st Survival 1/4. Inner Fire, Supernatural,
3rd/4th Weapon, Survival 2-4, and both Lore rows have no displayed progress.
This is a more specific bottleneck than “16 rows remain”: Lore/Supernatural
have not started, Survival diversity has barely started, and weapon lane 3/4
are untouched. Audit report:
`/live/jev-player/jev-player-2026-09-21T18-39-54-558Z-1f504a/efficiency-audit-2026-09-21T19-46-56.005Z-ac3eb1.json`.
Focused efficiency, replay, and dashboard tests pass 21/21.

At 19:55 UTC, refined the choice funnel to distinguish Jev's `providerChoice`
from the harness's final selected action; the run page now shows both with an
offline-audit timestamp and an explicit stale label. On the latest V28 trace
(443 decisions), Lore actions were mapped on 138 menus. Jev selected an
eligible Lore action on 4 (2.9%); the final wrapper action selected Lore on
0. Inspection of all four shows Jev chose `appraise_dagger`, but the supervisor
changed each to `travel_fields_furrow` under
`route-to-fields-for-open-combat-gates`. The V29 advisory lane-coach replay
also left those four overrides unchanged. So the gap is not simply “Jev never
chooses Lore”: on these rare opportunities, the wrapper suppresses it. This
is evidence for a future matched wrapper-policy experiment, not proof that
honoring Lore would reduce time-to-Circle-2; the active V28/V29 pair remains
untouched. Latest audit:
`/live/jev-player/jev-player-2026-09-21T18-39-54-558Z-1f504a/loop-audit.json`.
The run page identifies the audit as stale when the live heartbeat advances
past its snapshot. Focused loop/outcome/efficiency/dashboard tests pass 26/26.

At 19:57 UTC, added an independent offline counterfactual for this exact
wrapper interaction. It only releases a provider-selected, currently offered
action mapped to an open requirement when the baseline supervisor is routing
to the fields and the character is out of combat, at least 75% HP, not
bleeding, and has no pending delivery quest. Replaying 458 V28 decisions found
5 eligible substitutions (4 Appraisal and 1 Brawling), all displacing one
`travel_fields_furrow` decision. This is a fixed-menu safety/opportunity
count, not a simulation of the extra command, later pathing, EXP, or
Circle-2 completion. The report is
`/live/jev-player/provider-choice-replay-2026-09-21T19-57-18-823Z-1a2311.json`;
the runner is `scripts/jev-player-provider-choice-replay.mjs`. Its helper has
explicit safety/menu/open-row tests and remains outside the live player import
graph. The focused loop, dashboard, outcome, efficiency, and counterfactual
suites pass 30/30. V28 remains live at 39/84 points with 3 rows closed and 16
unmet at 19:55; V29 is queued/waiting with source integrity valid. No live
behavior was changed.

At 20:07 UTC, verified another harness-data limitation before trusting a
rank-aware replay: `scripts/lib/wire-session.mjs` only fills `v.skills` from
the server's top-10 mindstate feed, while `server/status.js` explicitly sorts
and slices that feed to ten entries. Therefore absence from `state.skills` is
not proof that a lane is rank zero. The per-row audit now requires an explicit
complete-census marker for Nth-skill “next rank moves this gate” calculations
and reports the V28 Nth-row samples as unknown (500/500 each), instead of
calling them zero-effective opportunities. `showSkills` is an ordinary
read-only game command that lists every registered skill; added a standalone
parser/validator for that output in `scripts/lib/jev-skill-census.mjs`, plus
tests requiring every skill and the native total-rank header before claiming
completeness. Integrating this refresh into the live Jev client would change
the hashes of the active V28/V29 comparison, so it is deliberately deferred
until that pair resolves. Focused loop/dashboard/census/counterfactual/outcome/
efficiency tests pass 36/36. Native files were not changed.

At 20:09 UTC, the active V28 run had advanced to 47/84 points in 89 minutes,
closing a fourth row (Expertise) while still Circle 1 with 15 rows open. Its
weapon requirements now read 1st 6/8 and 2nd 5/8; Survival rows 1-3 are 2/4,
1/4, and 1/4; 4th Survival, 3rd/4th Weapon, Inner Fire, Supernatural, and both
Lore rows remain at zero. Rank-point pace is about 31.7/hour, but that alone
does not resolve the unstarted skill lanes. The refreshed choice audit covers
522 decisions: Lore was mapped on 161 menus, selected by Jev 4 times and by
the final wrapper 0 times; the full-rank sensitivity remains unknown on all
522 snapshots because this run has no verified census. V28 and its world are
still live; V29 is still waiting and its queued source-integrity check remains
valid. This is progress, not Circle-2 completion.

At 20:15 UTC, the historical manifest audit found 92 saved Jev runs and no
run whose verified `highestCircle` reached 2. V12 remains the best completed
reference (Qwen3:8B, time cap): 68/84 points, 11 requirement rows closed, but
eight still open—Inner Fire, Supernatural, 2nd Weapon, 4th Weapon, 3rd/4th
Survival, and both Lore rows. Its trace had 402 safe menus with mapped open
field-practice choices and selected none. The current V28 snapshot is improving
but has the same category-level risk: 51/84, five rows closed, 14 open at
20:14; both Lore rows and 4th Survival plus Inner Fire/Supernatural remain
unclosed.

Added an offline safe-lane cadence replay (no live import): only when out of
combat, at least 75% HP, zero roundtime, no bleeding, no quest, not overloaded,
and a legal Survival/Lore action is offered, it replaces every fourth baseline
optional fresh attack with the least-recently-used offered skill. It never
replaces travel, quests, corpse work, or an unsafe action. On the completed V12
trace this yields 29 counterfactual substitutions across Stealth, Foraging,
Perception, Performance, and Appraisal; on current V28 it yields 12. These
counts show that a bounded treatment is available, not that it closes a row or
improves time-to-Circle-2. Saved reports:
`/live/jev-player/safe-lane-budget-replay-2026-09-21T20-15-02-915Z-09d334.json`
and
`/live/jev-player/safe-lane-budget-replay-2026-09-21T20-15-03-090Z-b522c5.json`.
The exact helper has safety/cadence/rotation tests; all 40 focused Jev
audit/dashboard/census/counterfactual/outcome/efficiency tests pass. Current
V28 and V29 remain live/waiting with source integrity valid, so no policy was
changed.

At 20:18 UTC, V28 remained live at Circle 1 with 53/84 points, five rows
closed, and 14 unmet; V29 remains waiting with source integrity valid. The
repo-wide `npm test` run completed 787/794 passing, with seven failures
reported only by `test/puffer-barbarian.test.mjs` and five subtests under
`test/puffer-circle.test.mjs` (Puffer version/expectation mismatches). The
Jev-focused suite still passes 40/40, and syntax/diff checks are clean. Those
Puffer failures were not changed as part of the Jev work.

At 20:19 UTC, a fixed-menu cadence sweep quantified the tradeoff before
selecting a live rate. On V12's 117 safe optional-attack opportunities,
release rates of every 2/4/8 yield 58/29/14 candidate practices; on the latest
V28 trace's 54 such opportunities they yield 27/13/6. The every-4 setting
therefore preserves roughly three quarters of optional attacks while still
rotating all five offered field skills in both traces. These remain menu
counterfactuals, not outcome evidence. V28 is still Circle 1 at 53/84, five
rows closed, 14 unmet; V29 remains waiting with integrity valid.

At 20:23 UTC, the active V28 trace had grown to 606 auditable decisions. Its
Nth-skill rank sensitivity remains unknown on every observed row because the
wire session only mirrors the top-10 mindstate feed and no complete census has
been captured. The harness now has a tested adapter for a full read-only
`skills` census: complete maps can be merged with explicit source/time
provenance or represented as trace events, and partial/malformed maps cannot
turn absent skills into zero or unlock rank-sensitive conclusions. Offline
audits will associate a complete census only with decisions within 180 seconds.
This is deliberately an observer-side extension; V28's player, wire session,
and policy hashes were not changed, preserving its comparison with queued V29.
The focused Jev audit/dashboard/census/counterfactual/outcome/efficiency suite
passes 45/45; syntax and whitespace checks pass. V28's queue still reports
playing and clean source integrity, while V29 is still waiting on that baseline
with clean source integrity. No new live test was needed to validate this
missing-data handling.

At 20:26 UTC, a fresh V28 sample showed 54/84 rank points, five closed rows,
and 14 open while still Circle 1; V28 was actively heartbeating and V29 was
still queued behind it, both with intact source hashes. The latest audited
skill feed confirms two ranked weapon lanes (Brawling and Small Edged), while
13 other eligible weapon lanes are unobserved in that partial feed. The gate
itself reports 3rd/4th Weapon at 0, so this is not a claim that those unknown
skills are zero—it is a precise diagnosis that the character has not yet
demonstrated enough distinct weapons to satisfy the displayed gate.

Fixed the second manifestation of the same telemetry bug: offline
distinct-lane reports and the live dashboard had presented every omitted skill
as untrained. They now separate confirmed ranked lanes, observed rank-zero
lanes, and unobserved lanes; the remaining-lane count is explicitly a lower
bound while the eligible pool is incomplete. This makes the harness less
likely to recommend repeating a lane or overlook a viable one based on a
truncated mindstate feed. Focused Jev suite: 49/49; syntax and diff checks
pass. These observer/dashboard changes did not touch active-player source
hashes, and no live behavior was changed or claimed improved.

At 20:36 UTC, found and removed a monitoring scalability problem: the Jev
dashboard previously fetched and reparsed the entire append-only event log
every two seconds. The active trace was 28,220,413 bytes. The dashboard now
checks the log size with `HEAD`, requests only appended bytes using the static
server's existing byte-range support, parses complete JSONL records
incrementally (including split UTF-8 characters/records), and maintains
bounded recent decisions plus incremental gate, response-latency, Dragon Form,
and loot summaries. Response latency retains at most 4,096 samples and labels
the median/p90 as recent-sample figures after that cap. This is a Jev
dashboard/observer extension; no native game
server or active player code changed. The browser smoke check loaded the live
page and verified its decision stream, gate history, loot totals, and latency/
Dragon Form metrics.

V28 remains active at 58/84 points, seven rows closed, 12 unmet at 20:36; the
V29 lane-coach comparison remains queued behind it with clean source integrity.
V28 is a local Qwen3:4B control run, so it measures harness/policy progression,
not Jev-provider performance. The offline choice audit was refreshed at 20:36.
The focused Jev suite passes 61/61 and static-serving suite 11/11; syntax/diff
checks pass. These results verify telemetry and dashboard behavior only;
Circle 2 has not yet been reached.

At 20:41 UTC, factored the dashboard's HEAD/range polling and run/truncation
reset behavior into a reusable reader with injectable fetch. Tests now verify
that unchanged polls transfer no body, appends request only the byte suffix,
partial JSONL records wait for their newline, and a run change or shorter file
resets old aggregates. V28 is still the local Qwen3:4B control and remains
active at 59/84, seven rows closed, 12 open; V29 is waiting with code integrity
valid. The 72 focused Jev/static tests pass. The result is still below Circle 2.

At 20:42 UTC, refreshed loop, outcome, and safe-lane reports from V28's live
trace. It has reached 60/84 points, eight rows closed, and 11 open after about
122 minutes. Among 234 safe menus offering an open Survival/Lore action, only
six ended in field practice (three Stealth, three Foraging); this is 2.6% of
those eligible menus, not an EXP-success rate. The fixed-menu every-fourth
attack counterfactual identifies 17 additional safe substitutions across 70
optional attacks, balanced 3-4 each among Stealth, Foraging, Perception,
Performance, and Appraisal. It deliberately does not simulate practice EXP or
time-to-Circle-2. This makes field-lane under-selection a measurable next
candidate lever if the queued V29 advisory comparison still misses Circle 2;
V29 should finish first so only one lever changes at a time. V28 is a local
Qwen3:4B control, not a Jev-provider run; both active queue source-integrity
checks remain valid.

At 20:47 UTC, factored that bounded cadence into a standalone
`SafeFieldPracticeCadence` candidate wrapper
(`scripts/lib/jev-safe-field-practice.mjs`). It can only return an
already-offered action mapped to an open Survival/Lore gate, only on a safe
out-of-combat optional attack, and persists its cadence and per-skill rotation
counters for restart recovery. The saved-trace replay now uses this exact
policy implementation rather than a separate approximation; tests cover
cadence, rotation, safety exclusions, restart serialization, and that it never
invents commands. The module is imported only by the offline replay, not by the
live player or current V28/V29 code-hash surfaces. All Jev tests pass. V28
continues to advance at 63/84 with eight rows closed and 11 unmet; V29 remains
queued with source integrity valid.

At 20:48 UTC, corrected a restart edge in the independent cadence candidate:
restoration now hydrates its saved `every` and health-floor settings unless the
caller explicitly overrides them. A regression test uses non-default values
and proves the next opportunity releases at the correct step after recovery.
The complete Jev test suite passes, syntax/diff checks are clean, and V28/V29
remain active/waiting with intact source hashes. No active player was changed.

At 20:56 UTC, improved the offline replay's evidence hydration. Replay had been
filtering event traces down to decisions before looking for standalone
`skill-census` events, so a future complete census could not inform replayed
weapon-training readiness. Census attachment is now shared with loop audit:
only a structurally complete map for every game skill, timestamped within 180
seconds of a decision, can fill missing ranks; partial or stale census remains
unknown. Tests prove a fresh complete census enables only an already-offered,
affordable weapon lesson, while partial and stale census do not. All Jev tests
pass (including the full Jev suite); syntax and diff checks pass.

Replaying the live V28 trace with the distinct-weapon counterfactual now
reports 851 decisions and zero trustworthy lesson opportunities: 295 safe-ish
readiness checks still lack a complete rank census, with 553 unsafe states and
three recent same-room training exclusions. This confirms the current live
trace lacks the evidence needed for a safe lane-diversity intervention; it is
not evidence there were no zero-rank weapon lanes. V28 is still a local
Qwen3:4B control, not a Jev-provider result; its manifest remained `playing`
at 20:56:58 UTC with 63/84 Circle-2 points, eight requirement rows closed, and
11 unmet. Its code hashes are unchanged. V29 remains queued behind V28.

At 20:59 UTC, V28 advanced another requirement: 64/84 points, nine rows
closed, ten unmet, still Circle 1, with the manifest heartbeat current. V29
remains waiting. The trace contains no `skills` command or census event, so the
full-rank gap is still confirmed. Added a reusable opt-in `SkillCensusProbe`
that brackets multi-message output from the normal read-only `skills` command,
limits captured text to 64 KiB, emits only a validated complete census, and
discards cancelled captures. Probe tests cover chunking, duplicate starts,
cancellation, and oversized output. It is intentionally not wired into V28:
that live process and its queued comparison retain their original source
hashes. The collector is exposed through the optional Node preload described
below; it has not been activated in the current cohort.

Follow-up harness change: added a pure sampling predicate for the future
integration. It permits a census request only out of combat, at zero RT, with
known vitals, no bleeding/overload, at least 80% HP, and no more than one
request per 180 seconds. Unit coverage verifies each exclusion and the
interval. V28's gate snapshot at 21:01 remains 64/84 with 9 rows closed and
10 open; the principal uncertainty is which eligible weapon/survival/lore
skills are actually zero-rank, while its Barbarian inner-fire/supernatural
rows also remain open. Active and queued source hashes still match, and the
V29 queue remains waiting.

Parser integrity was tightened before treating that census as training data:
the reported total rank count must now equal the sum of parsed skill ranks,
and duplicate skill rows invalidate the snapshot even if every expected name
appears. Regression tests cover both false-complete cases. At 21:03 UTC V28
was still active at 64/84 (9 closed, 10 unmet); no Circle 2 milestone has
occurred. The new parser remains independent of its hashed live-player
sources, and the V29 queue's pinned source integrity is still valid.

The optional adapter is now implemented as
`scripts/jev-player-skill-census-preload.mjs` plus the independent
`scripts/lib/jev-skill-census-instrumentation.mjs`. For a future run, launch
the isolated runner with
`NODE_OPTIONS="--import=/absolute/path/scripts/jev-player-skill-census-preload.mjs"`
in its environment. The preload guard activates only when the entrypoint is
`scripts/jev-player.mjs`; the isolated world/server and queue processes remain
unpatched. It wraps the in-process WireSession, samples the existing read-only
`skills` command at safe intervals, hydrates ranks only after full parser and
rank-total validation, and appends request/census events to that run's normal
`events.jsonl`. Tests use a fake WireSession to verify command scheduling,
rank hydration, request cadence, and timeout behavior. No hashed code or game
server file is modified. The preload is not active in V28/V29, and must be
enabled deliberately on a fresh run.

The filesystem path is now covered too: a temp-root integration test creates
two run manifests with different PIDs and verifies that the default writer
appends the census/request events only to the matching player's `events.jsonl`.
This closes the gap between testing generated event objects and testing the
actual run artifact that downstream replay consumes.

At 21:12 UTC, the V28 manifest recorded a fresh gate advance: 65/84 points,
10 rows closed and 9 unmet, still Circle 1. This is +1 closed requirement
since the previous checkpoint, not Circle 2. The run is the unchanged local
Qwen3:4B control, and its source hashes remain clean; V29 is still waiting.

At 21:10 UTC, a trace inspection found a concrete live-harness recovery case:
at 21:09:37 the model selected `guild_hall` while carrying unbundled loot; the
wire refused movement for overload, and the next observation exposed a legal
`bundle_kobold_skin` action. Bundling 12 hides cleared the movement block and
the player resumed. This is a one-attempt recovery, not a sustained regression,
but it shows overload is discovered reactively from refused movement rather
than before choosing a route. The same trace still has no verified Circle-2
gate closure since 20:57. The new skills preload does not solve overload; it
adds the missing rank evidence independently so future choices can be judged
against the actual weapon/survival/lore lanes.

Repository verification at 21:11: all Jev tests pass, syntax checks and
`git diff --check` pass. `npm test` completes with 820 passing and 7 failing
out of 827; the failures are in `test/puffer-barbarian.test.mjs` and
`test/puffer-circle.test.mjs` (variant ID, simulation mode, and
reset/snapshot expectations), outside the Jev changes. V28 is still actively
heartbeating at 64/84, nine closed and ten unmet; its hashed source and V29's
queued source hashes remain unchanged.

At 21:17 UTC, queued the next telemetry experiment as
`jev-player-skill-census-v30-after-v29-20260921`. It waits for the V28
baseline and V29 advisory run to reach terminal manifests, the V29 queue to
finish, and other local-model runs to clear; it also pins and rechecks the
player-source hashes. Only then will it launch a matched 240-minute Qwen3:4B
control-policy run with the census preload enabled. The queue is confirmed
running and `waiting`; it has not started V30. V28 continues advancing at
67/84 points, 10 rows closed and 9 unmet. All Jev tests pass after adding queue
gating tests.

At 21:18 UTC, inspected V28's actual overload loop instead of inferring from
the refusal alone. It had only `unlock_strongbox` legal while overloaded; each
successful `pick strongbox` removed one container and yielded 25–43 silvers,
while failed attempts kept the same box for another try. Thus the repeated
choice is currently a valid unload/economy recovery, not proof of a harness
deadlock. The run is at 67/84 with nine gates unmet; Lockpicking's hidden rank
is still unknown in the top-10 feed, so V30's complete census will determine
whether these attempts also advance a Survival lane. No active policy change
is warranted from this evidence alone.

At 21:27 UTC, the V28 trace still records `only-legal-action` waits every ten
seconds, with the latest heartbeat at 21:27:30 and no gate progress for ten
minutes (67/84, 10 rows closed, 9 unmet). The wait event currently omits the
candidate list, cooldown/blocklist state, vitals, and recent action feedback,
so this artifact cannot tell whether the policy had no usable option or
mistakenly withheld a sole action. The earlier overload refusal did blacklist
the preceding `rest` action, but the trace then shows bundling and resumed
combat; that event is a confirmed cooldown bug, not a proven cause of the
later wait loop.

Added an opt-in, source-independent diagnostic extension:
`scripts/jev-player-diagnostics-preload.mjs` registers a Node ESM load hook
for `scripts/jev-player.mjs` only. At the existing wait log site it records
candidate action IDs, cooled and blocked actions, once-per-fight actions,
burden flag, vitals, gate rows, and recent action/text context. It does not
change policy decisions or commands and does not transform the game server or
native DR scripts. Source-shape mismatch fails closed. Focused tests verify
the transformed fields, fail-closed behavior, and exact-entrypoint restriction
(3/3 passing); syntax and `git diff --check` pass. The preload is optional and
was not injected into active V28 or queued V29/V30, so their source integrity
and treatment remain unchanged. It must be enabled on a fresh diagnostic run
to obtain the missing evidence.

At 21:31 UTC, correlated the full V28 event sequence with the policy code and
reproduced the stall offline. At 21:09:37 an overload refusal was logged with
`action:"rest"`; the generic refusal handler adds that ID to
`blockedActionIds`. The first overloaded navigation attempt also permanently
blocks `guild_hall`; a later overload refusal while navigating to the tanner
permanently blocks `sell_field_loot`. Both sets of blocks clear only after a
room change, and V28 never left `fields_furrow`. After the final strongbox was
consumed at 21:17:46, the manifest showed HP 84/145, zero RT, and no combat.
With its hides and 551 silvers, the policy offers `sell_field_loot` and `rest`
at that state; both IDs had been blacklisted by overload-related refusals. It
then began `only-legal-action` waits at 21:17:49 (78 consecutive by 21:28:31).
The saved-state policy test reproduces that both blocked IDs produce an empty
choice set. This is now a strongly supported causal explanation of the
sustained stall, rather than the earlier unproven hypothesis.

At 21:41 UTC, compared historical no-action counts to avoid treating every
`only-legal-action` event as a deadlock. The earlier V19 4B run logged 612 such
events across 1,023 decisions and 42 rooms, with only two burden warnings and
two navigation failures; its waits are interspersed with later choices and
aren't one continuous wedge. V28's 134 events include a distinct 99-wait,
16-minute contiguous burst after its final strongbox, while its decision count
stops advancing. This supports targeting sustained no-action bursts, not raw
wait totals. V29 is still early (about seven minutes, two kills, no gate change)
and remains active; no conclusion about the lane-coach treatment yet.

At 21:47 UTC, found a separate low-funds progression defect in V29. At
21:36:22 it had 15 silvers and correctly navigated from the bazaar toward the
town crier. Once it arrived in `market_way`, the offered action was
`take_quest`, but the supervisor's later `route-to-fields-for-open-combat-gates`
override selected `travel_fields_furrow` instead. It therefore skipped a quest
that could have funded trainer lessons and returned to hunting with only 15
silvers. This is distinct from the overload deadlock and is directly visible
in the saved decision states.

Added the independent opt-in `jev-low-funds-crier` overlay. When out of combat,
below 40 silvers, and `take_quest` is actually offered, it takes that action
before field-routing overrides. It is source-shape guarded, exact-entrypoint
scoped, logs its extension hash, and does not modify native DR or checked-in
player code. Focused overlay/queue tests pass. Queued matched V32 as
`jev-player-low-funds-crier-v32-after-v31-20260921`; it waits behind the V31
overload candidate, preserves the same Qwen3:4B natural-speed settings, and
has clean source integrity. V32 has not launched; V29 remains the active live
comparison.

At 21:48 UTC, V29 reached its first observed Circle-2 gate point: 1/84 rank
points, still Circle 1, with five kills, 49 silvers, and zero no-action waits.
This is early positive evidence that the lane-coach run is converting field
activity rather than wedging, but it is not yet a Circle-2 milestone. V29 is
still active and remains the only local-model player allowed by the downstream
queues.

At the next checkpoint, V29 remained healthy at 1/84 but had converted Small
Edged to rank 1, accumulated six kills and 59 silvers, and still had zero
`only-legal-action` waits. The supervisor sent it to the guild hall after a
gate-stall threshold and the saved trace shows it learned Dragon, opening the
Barbarian supernatural path. The next meaningful check is whether it now uses
that path and affordable trainer actions to close additional rows; no live
intervention was made.

Added the read-only `jev-no-action-bursts` analyzer and CLI. It groups adjacent
`only-legal-action` waits by timestamp gap, reports span, room, intervening
decisions/commands, and the longest burst, while leaving scattered waits
unclassified. Running it against V28 identifies exactly one 99-wait burst
lasting 981.9 seconds with zero decisions or commands; running it against the
older V19 trace reports 612 waits but zero bursts. This turns the prior manual
stall distinction into a repeatable artifact-level check. Focused tests pass,
and the complete Jev suite now passes 276/276.

Prepared an opt-in recovery overlay in
`scripts/jev-player-overload-recovery-preload.mjs`. Its ESM hook is limited to
the isolated Jev runner, records an extension ID/hash, enriches no-action wait
events, classifies overload as an environmental refusal (clears stale action
attribution without blacklisting it), and avoids permanently cooling a
navigation goal when the failed move was specifically caused by overload.
Unrelated invalid-exit/path failures remain blocked as before. This does not
change checked-in player source, game-server code, or native DR scripts. The
saved-state policy regression, transform fail-closed checks, entrypoint guard,
ESM syntax check, and all focused tests pass (9/9). This overlay has not been
applied to V28 or the queued V29/V30 runs; use it on a fresh matched candidate
after those source-pinned comparisons finish.

The overlay also clears stale `lastCommandActionId` attribution before a
navigation loop begins. This addresses why the V28 movement refusal was
misattributed to its previous `rest`/skinning command; `walkTo` records the
navigation goal separately. Movement refusals can no longer blacklist an
unrelated prior command. The expanded recovery tests verify this transformation
and syntax before any live candidate starts.

V28's no-action loop was stopped with SIGTERM at 21:34 UTC after 17 minutes
without a real action; its runner finalized cleanly as `incomplete` with
`finishReason:"terminated"`. The main game server was left running. Its
terminal manifest released V29, which launched at 21:34:28 as
`jev-player-2026-09-21T21-34-28-429Z-9f55c4` with a live isolated-world
launcher, player process, manifest, and launch log. V29 remains the one-lever
lane-coach candidate; it was not altered by the overload fix.

Queued the independent overload-recovery candidate as
`jev-player-overload-recovery-v31-after-v30-20260921`. Its durable queue waits
for V30's census run and queue to finish, the V28 baseline and V30 candidate
to be terminal, and all other local-model players to be idle. It pins and
rechecks the core source hashes, then launches one 240-minute natural-speed
Qwen3:4B Barbarian candidate with only the overload-recovery preload enabled.
At queue validation, status is `waiting`, V29 is active, V30 is waiting, and
the V31 source integrity check is clean. Queue and policy gating tests pass;
the V31 live run has not launched yet.

At 22:00 UTC, the active V29 trace identified the missing Puffer curriculum
prerequisite: after buying `dagger`, `padded_cloth`, and `shield_wood`, Jev had
47 silvers but still needed `club`, `broadsword`, and `staff`. It had returned
to combat nine times without opening those lanes. Added the independent
`jev-curriculum-bridge` overlay. It only selects the already-observed `perform`
action while the remaining Barbarian kit is unaffordable, yields once the kit
is fundable, and never acts during combat, recovery, or a completed quest. The
overlay is ESM-preload/source-hook based, so the native `jev-player.mjs` hash
still matches V29 and native DR remains untouched. Four focused tests pass and
the full Jev suite passes 279/279.

The brief direct-integration attempt correctly invalidated the source-pinned
V30–V32 queues; no run was mixed across hashes. Re-queued the clean overlay as
`jev-player-curriculum-bridge-v34-after-v29-20260921`, with source integrity
valid and status `waiting` behind the active V29 comparison. It will launch one
matched natural-speed Qwen3:4B run after V29 reaches a terminal state and local
model exclusivity is available.

The bridge was then extended from funding-only to a bounded Puffer curriculum
projection: when Jev is safe and no active quest is in progress, it may select
only an offered action for the next open supernatural, distinct Lore, distinct
Survival, or distinct weapon lane, in that order. It still cannot synthesize a
command or act in combat, recovery, or quest handling. The extension remains a
preload/source hook and leaves the native player hash unchanged. The full Jev
suite now passes 283/283, including the active-quest boundary test; V34 remains
source-integrity-valid and waiting for V29.

Created the read-only `jev-player-curriculum-replay.mjs` counterfactual report
for V29. It replayed 137 saved local-decision menus and found 58 legal bridge
choices, all in the kit-funding phase. The report includes the exact 15-silver
state where V29 chose to continue toward combat and the bridge would have
chosen the already-offered `perform` action. This is evidence for the lever,
not a claim that V29 completed Circle 2; the durable artifact is
`public/live/jev-player/curriculum-replay-jev-player-2026-09-21T21-34-28-429Z-9f55c4.json`.

At 22:11 UTC, V29 had advanced to 9/84 rank points and 15 kills with no
no-action burst and no errors. It remains Circle 1 and still uses the original
three-item kit; this is positive live progress but not a Circle-2 result. V34
is still waiting rather than being started concurrently.

The next bridge refinement closes a concrete omission in that replay: the
extension previously recognized `perform` as a funding activity but did not
select the ordinary policy's already-offered `starter_kit` route or `buy_*`
menu entries. Version `puffer-curriculum-bridge-v2-legal-menu-only` now
prefers those legal entries before falling back to Performance. Focused bridge,
instrumentation, queue, and replay tests pass 9/9; the edit is confined to the
opt-in extension and its tests.

Because the bridge source changed, the prior V34 waiting process was retired
before it could launch. A fresh source-pinned queue, V35
(`jev-player-curriculum-bridge-v35-after-v29-20260921`), is waiting behind the
same V29 prerequisite and V28 baseline. At the latest checkpoint V29 was still
healthy at 18/84 rank points, 20 kills, two closed rows, and no finish reason;
V35 had valid code integrity and had not launched yet.

Re-running the read-only counterfactual with bridge v2 over the now-expanded
V29 trace produced 179 saved local-decision menus and 74 legal bridge choices:
53 `kit-purchase` choices and 21 `kit-funding` choices. It would have selected
the observed bazaar route, bought `dagger`/`padded_cloth`/`shield_wood` from
the offered menus, and then selected the offered funding action instead of
returning to combat with 15 silvers. This remains counterfactual evidence;
the V35 run is the required live verification.

The same replay then exposed a second funding hole: the saved menus contained
`quest_crier` or `take_quest` in 75 decisions, including the 15-silver state,
but the bridge still fell through to Performance. Bridge v3 now chooses those
already-offered crier actions before field combat. The replay currently shows
76 legal interventions, including the crier route at 15 silvers. Focused
bridge/instrumentation/queue/replay tests remain 9/9.

Retired the waiting V35 process before launch and queued the source-pinned V36
comparison (`jev-player-curriculum-bridge-v36-after-v29-20260921`). V36 was
then superseded before launch while the queue integrity model was tightened:
the queue now pins the bridge preload/loader/library hash separately from the
native core hashes, so old control runs without a bridge hash remain valid
prerequisites while a modified bridge invalidates only its waiting candidate.
The resulting V38 queue (`jev-player-curriculum-bridge-v38-after-v29-20260921`)
is waiting behind healthy V29 with valid core and bridge integrity; no
candidate has launched concurrently and native DR remains unchanged.

The V29 event audit exposed a separate combat-training omission: Jev repeatedly
selected the legal Dragon Form action, but the RT prefetch overlay discarded the
pending action after ordinary incoming damage crossed its hard-coded 75% HP
floor. That left the displayed `inner_fire` gate at 0 despite a learned,
affordable ability. Bridge v4 keeps the change opt-in and source-pinned, lowering
only the isolated candidate's pending-ability floor to 70% (still well above
the native emergency-flee floor), and logs the floor in its extension event.
Focused bridge, instrumentation, queue, and source checks pass 8/8 plus
`git diff --check`. V38 invalidated itself on the bridge hash change as
designed; V39 (`jev-player-curriculum-bridge-v39-after-v29-20260921`) is now
waiting behind the same V29 control with valid integrity.
