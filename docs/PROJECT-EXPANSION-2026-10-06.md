# Project expansion receipt — October 6, 2026

Implemented in a clean shared working tree using three subagents with separate
gameplay, client and content-tooling ownership. Parent integration added launch
diagnostics, documentation navigation, npm commands and help discoverability.
This batch adds player and developer capabilities without adding dependencies
or changing learning rates, circle requirements or the persistence schema.

## Delivered capabilities

| Capability | Implementation | Evidence |
|---|---|---|
| Next-circle guidance | `server/progression.js`, `progress [all]`, command metadata | Authoritative requirement agreement across 11 guilds; Nth candidate eligibility; read-only behavior; trainer costs; held EXP; Paladin soul gate |
| Command discovery | Commands dock, `commands [query]`, 97 curated entries | Dispatcher-reference contracts; search and aliases; safe draft preparation; browser keyboard/mobile and spectator checks |
| Content validation | Pure `scripts/lib/content-audit.mjs`, existing audit CLI | Injected broken references/shapes/ranges, recipe quantities, circle parsing and navigation checks; JSON and CLI exit contracts |
| Startup diagnostics | `scripts/doctor.mjs`, `npm run doctor` | No database or directory creation; invalid settings aggregated; credentials excluded; filesystem access and in-memory SQLite checked |
| Project organization | `docs/README.md`, README navigation, changelog | Module ownership and task index; existing documents linked without moving historical evidence |

## Validation

- `npm run verify`: syntax, domain suite, data integrity and generated
  documentation consistency passed. The final `npm test` invocation, including
  all integrated command-reference tests, passed 971/971 tests with no skips.
- `node scripts/verify-corpus.mjs`: 184 captured messages replayed with a corpus
  match using disposable worlds.
- `npm run regression:ego`: 90 client checks and 15 audit client checks passed.
  The task space and disposable world were cleaned up by the runner.
- Repository content audit: zero issues, 312/312 rooms reachable; all 11 guild
  circle tables validated.
- `npm run doctor -- --json`: all six preflight checks passed.
- Final changed client modules passed syntax checking; `git diff --check` passed.

Captured verification logs are local to this workstation:
`/tmp/dragonrealms-expansion-verify-2026-10-06.log`,
`/tmp/dragonrealms-expansion-corpus-2026-10-06.log`,
`/tmp/dragonrealms-expansion-browser-2026-10-06.log` and
`/tmp/dragonrealms-expansion-final-tests-2026-10-06.log`.
Temporary logs are supplementary; the source tests and this receipt
describe the reproducible checks.

## Practical limits

The command reference is curated rather than exhaustive. Verbs and aliases are
checked against the dispatcher; locations and prerequisites still apply.
Progress suggestions use current ranks and eligible pools and must be refreshed
as skills change. Readiness advice does not replace guild-hall validation.
The content validator intentionally accepts only the current literal circle-table
format and reports unsupported changes rather than evaluating source text.
Doctor checks prerequisites without checking port ownership, performing migrations
or certifying a running world. Browser assertions cover specific behavior and
mobile geometry, not a full screen-reader audit. No progression simulation or
balance benchmark was run, and no shared world was restarted.

## Continued expansion

The follow-up batch adds contextual `help <command|category|search terms>` using
the same catalog as the Commands guide; bare help retains its overview. The
catalog now contains 101 entries. Metadata aliases and category synonyms resolve
without dispatching an action.

The Progress dock uses scoped read-only panel requests and keeps output out of
the story. Next-step hints recommend practice guidance, check Paladin soul
readiness, avoid inferring completion from malformed snapshots, and suppress
spectator actions. Guild directions point to Riverhaven's shared training/circle
row and the appropriate Crossing guild destination. Recovery hints use the
temple destination supported by both cities.

`journal` reports active kill, skin, delivery and recovery objectives, remaining
work and completion state without assigning, delivering or claiming work. It
handles missing historical objective fields without inventing progress. The
existing quest command retains its assignment and claim behavior.

Fixed the client interception of `search corpse`: explicit corpse searches now
reach the world. `find [text]` always opens local transcript search; legacy
non-corpse `search <text>` searches remain supported.

`npm run check:project` validates the three active documentation entry points,
local links/fragments and explicit Node targets in npm scripts. The standard
verification command includes it. Glob/stdin targets are explicitly skipped;
historical documents are outside its bounded scope. The wire protocol guide now
documents the passive panels and additive soul/direction snapshot fields.

Final follow-up verification logs:
`/tmp/dragonrealms-expansion-batch2-final-verify-2026-10-06.log`,
`/tmp/dragonrealms-expansion-batch2-final-browser-2026-10-06.log` and
`/tmp/dragonrealms-expansion-batch2-final-corpus-2026-10-06.log`.
The corpus checks same-revision capture/replay repeatability; it is not an exact
cross-revision balance comparison. This follow-up also leaves shared worlds,
databases and simulator evidence intact.

The final browser run passed 97 client checks and 15 audit checks, including
Progress requests, draft retention, spectator guards, corpse routing and local
transcript search. The final corpus run captured and replayed 184 messages with
a match. Integration exposed a missing real-helper binding in the existing VM
input-test harness; the harness now injects the imported search-routing helper
and checks both server corpse inspection and local transcript search.
The final standard verification passed syntax, all 999 tests with no skips,
content integrity, generated documentation consistency and project references.
Its optional integration steps were run separately as described above.
