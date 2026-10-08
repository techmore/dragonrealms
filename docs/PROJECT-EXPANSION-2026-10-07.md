# Project expansion receipt — October 7, 2026

This continuation uses separate subagents for quest-domain cohesion, live
Journal presentation and module auditing. Parent integration adds world
discovery, an architecture map, npm/verification wiring and documentation.
The existing October 6 changes remain in the working tree.

## Delivered behavior

- A canonical quest snapshot serves descriptions, NPC reminders, wire messages
  and passive journal inspection. It distinguishes remaining work from an
  original total, preserves unknown totals in old kill tasks and rejects invalid
  counters instead of inventing progress.
- Skin reminders show the remaining harvest. Crier reminders handle delivery,
  recovery and harvest work. Asking a guild leader for a task preserves existing
  unfinished work instead of replacing it.
- Completed work is reviewed without automatically paying its reward. `claim`
  collects it explicitly; generated crier visits issue `claim` before requesting
  or reviewing the next quest. Explicit abandon does not create another task.
- The live Journal displays objective/status information and accessible progress
  when a consistent total is available. Passive inspection retains the command
  draft, and malformed or legacy snapshots remain understandable.
- Starting watch supplies the target's current quest or null; returning to play
  restores the owning character's current task. Delayed own-character panel
  responses cannot overwrite a spectator's live task inspection.
- `where [creature|npc|item|guild] <name>` finds known haunts, services, guild
  leaders and item sellers from authored content. It never consults live players
  and does not promise current creature presence or shop stock. Output is bounded.
- `npm run audit:modules` checks relative ESM targets without executing the world
  and reports cycles and directory dependencies. Standard verification includes
  this audit. [The architecture map](ARCHITECTURE.md) explains module ownership.
- Active project-reference checking includes this receipt and the architecture
  map while preserving historical documentation outside its bounded scope.

## Verification scope

Focused tests cover quest snapshots and task preservation, all objective types,
world placement and seller catalogs, input/panel restrictions, and lexical module
checking. Final verification passed:

- `npm run verify`: syntax, 1,028 tests with no failures/skips, content integrity,
  module references, generated documentation consistency and project references.
- `npm run regression:ego`: 107 client checks and 15 audit checks passed in an
  owned world and browser task space, both cleaned up by the runner.
- `node scripts/verify-corpus.mjs`: 184 messages captured and replayed with a
  match in disposable worlds. This establishes same-revision repeatability,
  rather than an exact cross-revision balance comparison.
- Module audit: 265 source files, 596 relative references, zero broken targets,
  two informational cycle groups and zero unresolved variable imports in this
  scan. Runtime/external-package resolution remains outside the lexical audit.
- Project references: five active documents, 42 local links and 25 explicit Node
  targets; one glob/stdin test target reported as skipped.
- `git diff --check` passed.

Local verification logs:
`/tmp/dragonrealms-expansion-2026-10-07-verify.log`,
`/tmp/dragonrealms-expansion-2026-10-07-browser.log` and
`/tmp/dragonrealms-expansion-2026-10-07-corpus.log`.

No gameplay learning rates, quest reward values, circle requirements or schema
versions are changed. No balance simulation is implied by unit or browser checks.
Authored whereabouts are a reference, not live occupancy or inventory telemetry.
Module cycles are informational; the audit is lexical and explicitly marks
unresolved dynamic imports as skipped.

## Test isolation correction

An early quest test imported the database before its helper configured the
temporary path and created three named test accounts/characters in the default
database. The import order was corrected before subsequent runs. Cleanup is
limited to the positively identified test records; the shared world was not
restarted. A guarded transaction removed account IDs 1131–1133 and their
character IDs 1144–1146 after exact joined name checks. Foreign-key cascades
removed their related character state; account/character reference tables were
checked for leftovers. No sessions, script artifacts or combat/world-loot
artifacts were created by these cases. An independent read-only check confirmed
zero remaining rows for those account and character IDs. Shared autoincrement
counters were left monotonic. The corrected tests load their temporary-database
helper before importing any module that can open persistence.

## Further continuation: routes, reconnect and command contracts

A second batch on October 7 used the same three subagents at separate module
seams. `where room <name|id|area>` now searches authored room records explicitly,
and location rows show exact IDs. `route <room-id or room name> [steps]` reports
a shortest directed walk from the character's current room, including the wilds.
It shows eight steps by default, accepts up to twenty, lists ambiguous
destinations instead of selecting one, and leaves command-only ferry, passage
and magic travel outside the route. Authored compass links remain valid even
when the visual grid calls them portals. Combat, stocks and jail can still
prevent movement; the route does not move, spend, persist or inspect players.

The client transport now owns an explicit connection lifecycle in
[connection.js](../public/js/connection.js), with one deadline-based retry timer,
capped backoff and stale-socket guards. A native Retry now button supports
keyboard activation. The countdown stays outside live screen-reader
announcements. Disconnects preserve drafts and selection; reconnects restore
authentication without queuing or replaying commands. Puffer observation pages
cannot open sockets or retry.

[The command contract audit](../scripts/audit-commands.mjs) checks static registry
keys, pure metadata and the curated guide without importing gameplay or opening
the database. It checks guide usage, categories, aliases and recognized local
routes; uncovered commands remain informational. Registry scanning is lexical,
with literal handler strings kept opaque. It does not claim full JavaScript
grammar parsing or support for arbitrary nested template expressions.

Focused tests cover real exit semantics, unreachable special travel, ambiguous
rooms, step bounds, passive dispatch, deadline timing, duplicate timers, stale
socket events, command rejection/replay, observation mode and audit fixtures.

Verification for this further continuation:

- `npm run verify`: 1,052 tests passed, zero failures/skips, plus syntax, content,
  command contracts, module references, generators and active project links.
- Final browser gate: 113 client checks and 15 audit checks passed (128 total),
  including a trusted keyboard activation creating exactly one new socket.
  The final runner stopped its disposable world and finished its successful
  browser task space; diagnostic worlds also stopped and removed their temp DBs.
- Wire corpus: 184 messages captured and replayed with a same-revision match.
- Command audit: 187 registry commands, 68 metadata declarations and 103 guide
  entries; zero issues, with 102 uncovered dispatcher/movement commands
  informational because the guide is curated.
- Module audit: 269 source files and 604 relative references; zero missing
  targets and two informational cycle groups.
- Project references: five active documents, 44 local links and 26 explicit Node
  targets; one glob/stdin target skipped.

The initial browser run exposed an incomplete CDP Enter event in its keyboard
activation check. A targeted reproduction showed keydown without a native click;
adding carriage-return text produced one trusted keyboard click and exactly one
new socket. The acceptance check now records focus, event and socket evidence
at activation and uses a longer retry window to avoid deadline races. A second
run exposed a capture-listener microtask sampling before the button handler;
capture/bubble measurements now bracket the handler synchronously. Production
code did not require changes for either test-harness correction.

Logs: `/tmp/dragonrealms-expansion-2026-10-07-routes-verify.log`,
`/tmp/dragonrealms-expansion-2026-10-07-routes-corpus.log`, and the browser logs
`/tmp/dragonrealms-expansion-2026-10-07-routes-browser.log` (initial run) and
`/tmp/dragonrealms-expansion-2026-10-07-routes-browser-final.log` (second run),
and `/tmp/dragonrealms-expansion-2026-10-07-routes-browser-verified.log` (final gate).

## Further continuation: recipe plans, quest routes and script diagnostics

The next three-agent batch extends crafting discovery, script debugging and
verification evidence. `recipes [alchemy|forging|engineering|outfitting] [query]`
shows bounded authored recipes, exact commands, output, current rank and material
gaps, actual eligible stations, learned optional techniques and work-order
set-aside guidance. Its twelve current recipes match production mechanics:
alchemy has no minimum rank and accepts role-craft stations; the other
disciplines use their existing rank and room gates. No new mandatory tools or
techniques are invented. Readiness does not guarantee brewing success, quality
or bypass roundtime. The planner does not spend materials or change orders.

`route quest [steps]` follows an unfinished delivery's recorded destination.
Completed tasks choose the nearest reachable authored crier or matching guild
leader; unknown placements and unfinished hunts receive explicit guidance.
Journal prose points to this command, which remains a read-only walking plan.

Script diagnostics preserve physical source lines despite blank lines, comments
and labels, identify called-script frames and distinguish warnings from fatal
runtime errors. Invalid regular expressions stop the runner safely. The Scripts
panel presents wait, completed, stopped and error states without replacing
editor drafts or automatically restarting scripts.

`npm run verify -- --report <path>` optionally writes an atomic machine-readable
receipt with timings, selected/pass/fail/skip checks, audit counts, Git revision
and dirty counts, and before/after scoped source fingerprints. It explicitly
records unverified skips and changed or unavailable source identity. It avoids
environment, child-output, raw Git-path and error-text capture; process logs
retain diagnostics. No report is published into a shared world's live artifacts.
The improvement schedule now separates its September baseline from October
continuations, and the original codebase audit links the current receipts.

The first combined release gate passed 1,080 tests, all static/data/doc checks
and the 184-message wire replay, then stopped at a malformed JavaScript string
in the new browser diagnostic fixture. JSON-based fixture serialization fixes
that harness error. Its failed receipt retained stable before/after source
fingerprints and the browser failure rather than claiming a completed gate.

Review of downstream runner consumers found browser agents could label fatal
errors as normal completion, while sweep cycles could restart error-stopped
scripts or claim an escape had arrived. Fatal completion signals now retain
source context and terminate these paths explicitly; ordinary completion and
recovery remain separate. This is tested interpreter/lifecycle handling, not
a newly measured progression cohort. No simulations were launched.

Final combined release gate: **1,086 tests passed**, **118 client browser checks
and 15 audit checks passed** (133 total), and the **184-message wire corpus
matched**. Syntax, content, command contracts, module references, generators and
active project links all passed. The machine receipt records nine passed checks,
zero failures/skips and identical before/after scoped source fingerprints.
The captured identity covers the source during that gate; this results paragraph
and receipt copies were added afterward and received a final project-link check.

- [Final machine receipt](verification/2026-10-07-crafting-release.json).
- [Initial gate receipt](verification/2026-10-07-crafting-release-initial.json),
  preserving the browser fixture failure rather than overwriting its history.
- Full process log: `/tmp/dragonrealms-expansion-2026-10-07-crafting-final-release.log`.

Current audits cover 188 registry commands/104 guide entries and 274 modules/622
relative references. Curated guide omissions and two existing module-cycle
groups remain informational. No balance simulation or shared-world restart was
performed. Successful browser verification cleaned up its owned world and task
space; failed browser task spaces remain available for diagnosis.

## Further continuation: work orders and the Crafting dock

`orders` adds passive inspection of the current work-order ledger from anywhere.
A pure canonical snapshot reports the recipe, quality, completion state, base
pay and current payout, material plan and actual eligible claim stations. Shared
station and payout policy preserves production behavior and compatibility
exports. Malformed historical orders receive explicit feedback, and invalid
claims are rejected before reward mutation. `route order [steps]` uses eligible
stations and shortest directed walks without trusting the remembered issuer or
performing an assignment, claim, abandon or movement.

The Crafting dock uses the established passive-panel protocol for Recipes and
Work order tabs. Loading, failure and unavailable states are visible; tab
navigation supports the keyboard. Switching tabs, disconnecting or entering
watch cancels pending inspection and rejects stale responses. Command and script
drafts remain intact. No fallback to mutating command dispatch is used.

Crafting content validation now covers three alchemy, five forging, two
engineering and two outfitting recipes, all sixteen techniques and five quality
levels. Optional added catalogs preserve older fixtures while explicit malformed
values fail. Slot-rule checks use sixteen bounded rank/affinity samples and do
not claim exhaustive proof. No crafting content errors were discovered and no
new tools, mandatory techniques, claim stations or reward values were invented.

Final release gate for this batch: **1,104 tests passed**, **127 client checks
and 15 audit checks passed** (142 browser checks), and the **184-message wire
replay matched**. All nine selected gates passed with zero skips and matching
before/after scoped source fingerprints. The results paragraph and durable
receipt copy were added afterward; project links and whitespace were checked
again. The Crafting assertions cover passive requests, drafts, keyboard tabs,
mobile bounds, scoped errors, stale responses and watch/protocol restrictions.

[Machine receipt](verification/2026-10-07-orders-release.json).
Process log: `/tmp/dragonrealms-expansion-2026-10-07-orders-release.log`.
No simulation, schema migration, shared-world restart or reward rebalance was
performed by this batch.

## Further continuation: spell planning and the Spells dock

`spellbook [query]` provides bounded, passive curriculum search with circle
status, forgotten spells, slot costs, relearning capacity and actual learning
hall IDs. Base mana and soft mastery references are shown separately from
permission to attempt casting. The existing cast/prepare rules use circle and
forgotten status, while the older `spells` list reads a separate recorded roster;
the planner identifies disagreements without rewriting character state or
changing either mechanic.

The Spells dock now offers keyboard-accessible Spells, Spellbook and Slots tabs.
These use correlated passive panel requests, require an active connected playing
session and invalidate pending responses on tab changes, close, disconnect or
watch. Draft commands and script edits are preserved. Inspection does not learn,
forget, prepare or cast. A real WebSocket regression checks runtime and saved
magic state while roundtime is active and player aliases point at magic actions.

The content audit checks all forty authored spells across eight magical guilds,
including IDs, costs, circles, skills, cast kinds and buff structure. It also
checks the six mana definitions, five tier rank/cost entries, nine tier samples,
sixty-six guild/circle slot samples and thirty-six mana-cycle samples. These are
bounded invariant checks rather than exhaustive balance evidence. The Trader's
existing mana assignment is preserved; a nonmagical guild is not inferred to
require the `none` mana type.

Final review clarified that a prepared spell takes priority over `cast <id>`;
the planner recommends preparing the chosen spell first. The initial gate passed
all checks but records a changed source fingerprint because that clarification
landed during verification. A second full release gate verified the final source:
**1,120 tests**, **135 client plus 15 audit browser checks** (150 total), and the
**184-message wire corpus** all passed. All nine gates passed with no skips and
matching before/after scoped source fingerprints. This results paragraph and
receipt copies were added afterward and received a final project-link and
whitespace check.

- [Final machine receipt](verification/2026-10-07-magic-release.json).
- [Initial machine receipt](verification/2026-10-07-magic-release-initial.json),
  retaining the explicit source-change limitation.
- Full final process log: `/tmp/dragonrealms-expansion-2026-10-07-magic-final-release.log`.

No simulations, balance changes, schema migrations or shared-world restart were
performed. Successful browser runs cleaned up their owned worlds and task spaces.

## Further continuation: spell grants, search and counted receipts

Isolated regressions reproduced two circle-grant failures: an affordable cleric
spell was rejected at circle eight, and advancing a paladin to circle seven
removed prior holdings. The shared spell policy now considers only newly
unlocked curriculum entries, charges accepted costs once and preserves old
holdings plus forgotten/rejected choices. Existing over-budget characters retain
their holdings; new spells must fit. Authored budgets, rank references, casting
permission and hall placement are unchanged.

`spells`, load-time roster reconstruction and learn/forget use the same
circle/forgotten holding policy as preparation and casting. The previous batch's
legacy roster discrepancy is therefore resolved in the passive spell list.
Reconstruction on load derives the roster from saved forgotten choices rather
than restoring forgotten spells to the display. No database migration is used.

Spellbook search uses an optional plain-text `query` on the passive panel
protocol, accepted only for `spellbook` and bounded at 120 characters before
trimming. Invalid queries return correlated errors. Command-like text never
expands aliases or dispatches commands. The client sends a query only on Search,
Enter, Clear or an explicit refresh/navigation request; typing sends nothing.
Submitted filters and unsent filter drafts remain separate, and terminal/script
drafts remain intact.

Verification receipts now extract complete aggregate summaries from each single
subprocess execution. Tests, browser assertions and captured corpus messages
are numeric evidence; missing, ambiguous, failed or oversized summaries remain
explicitly unknown. Parsing is bounded at four MiB, capture at thirty-two MiB;
raw logs and environment details are excluded from receipts.

Final release verification passed **1,136 tests**, **141 client plus 15 audit
browser checks** (156 total), and the **184-message wire replay**. All nine gates
passed with no skips and matching before/after scoped source fingerprints. The
receipt records known numeric aggregates for all three integration summaries.
The initial gate passed but marked browser counts unknown because Ego summaries
were written to stderr. Capture now reads and forwards each stream once; a real
stderr-only subprocess fixture and the final complete gate verified the fix.

- [Final machine receipt](verification/2026-10-07-curriculum-release.json).
- [Initial machine receipt](verification/2026-10-07-curriculum-release-initial.json),
  preserving the unknown browser-count result.
- Full final process log: `/tmp/dragonrealms-expansion-2026-10-07-curriculum-final-release.log`.

The results paragraph and receipt copies were added after verification and
received a final link/whitespace check. No simulations, authored balance-table
changes, schema migrations or shared-world restarts were performed. Successful
browser runs cleaned up their owned worlds and task spaces.

## Further continuation: lesson planning and passive contracts

`training [skills|stats] [query]` adds bounded lesson discovery by exact skill or
stat ID and by name. Plans show current ranks, lesson prices and direct experience,
affordability, actual matching guild trainers and their room IDs, plus stat
values, TDP costs and the Fane. The bare view includes up to eight guild skills
and all eight stat costs. A shared pure policy provides the same pricing and
lesson formulas to production and planning; existing player exports are preserved.
A lesson adds progress and does not promise an entire rank. Actual training,
confirmation and TDP spending remain explicit commands.

The Progress dock now has Requirements and Training tabs with keyboard navigation
and guarded passive requests. Switching tabs or closing, disconnecting or watching
invalidates pending responses. Training inspection preserves skill experience,
silvers, TDPs, attributes and pending stat confirmation. Existing command/script
drafts remain intact. These views require the passive-panel protocol and an
active connected playing session.

The command audit validates metadata field types and rejects passive panel
contracts that declare mutation domains, roundtime gates or exemptions. JSON
reports include resolved canonical/alias panel entries. The checks are structural;
handler purity still requires runtime tests. Current guide omissions remain
informational, and no command handlers or database modules are evaluated by the
audit.

Final release verification passed **1,149 tests**, **149 client plus 15 audit
browser checks** (164 total), and the **184-message wire replay**. All nine gates
passed with no skips and matching scoped source fingerprints; all result-count
evidence is known. The initial gate uncovered an outdated category-help test:
`training` now resolves to its exact command before the historical category
synonym. The corrected test verifies that behavior and uses `advancement` for
category browsing. The initial failed receipt remains available.

- [Final machine receipt](verification/2026-10-07-training-release.json).
- [Initial machine receipt](verification/2026-10-07-training-release-initial.json).
- Full final process log: `/tmp/dragonrealms-expansion-2026-10-07-training-final-release.log`.

The results paragraph and receipt copies were added afterward and checked for
links and whitespace. No simulations, balance changes, schema migrations or
shared-world restart were performed. Successful browser runs cleaned up their
owned worlds and task spaces.
