# Dragon Realms project guide

This index organizes the existing project without moving runtime files or
historical evidence. Node 22.5+ runs the ESM server and SQLite; the browser
client uses native modules. `ws` remains the only runtime dependency.

## Start and validate

Run these from the repository root:

| Task | Command | What it establishes |
|---|---|---|
| Install | `npm install` | Install the existing dependency |
| Preflight | `npm run doctor` | Runtime, configuration and filesystem access; no database writes |
| Local world | `npm start` | Loopback world at port 3000 by default |
| Watch source | `npm run dev` | Restart on source changes; use only for an owned development world |
| Content audit | `npm run audit:data` | Authored data relationships and world navigation integrity |
| Import audit | `npm run audit:modules` | Relative ESM targets, cycles and directory dependencies without execution |
| Project references | `npm run check:project` | Active guide links and anchors, explicit npm Node script targets |
| Domain checks | `npm test` | Headless suites, including isolated HTTP and recovery tests |
| Standard verification | `npm run verify` | Syntax, tests, data and generated documentation |
| Release verification | `npm run verify:release` | Standard checks plus disposable corpus and browser worlds |
| Regenerate references | `npm run docs` | Roadmap and skill references from authored data |

Doctor does not check port ownership, migrate the database or assess a running
world. Structured reports are available with `npm run doctor -- --json` and
`npm run audit:data -- --json`. Nonzero exit status means a failed check.
Release verification requires a supported browser; see [recovery and isolated
verification](RECOVERY.md). Skipped integration checks remain unverified.

## Find the right module

| Change | Implementation seam | Relevant verification |
|---|---|---|
| Player command | `server/commands/` domain module and `metadata.js` | Domain and command-contract suites |
| Progression guidance | `server/progression.js`, character command | Progression guidance tests; circle engine remains authoritative |
| Spell discovery | `server/spell-reference.js`, magic command, Spells dock | Circle/forgotten state, slot planning, passive wire requests and browser tabs |
| Equipped gear | `server/equipment-reference.js`, shared equipment policy, Inventory dock | Instance condition/quality, armor contributions, repair quotes and passive wire requests |
| Combat rules | `server/combat.js`, `combat-manager.js` | Combat, range, maneuver and guild suites |
| Economy / wilds / quests | `server/economy.js`, `wilds.js`, `quests.js` through Game | Matching domain suites |
| Auth / wire lifecycle | `server/auth.js`, `session.js`, `chargen.js` | Auth, ownership, protocol and API suites |
| Persistence | `server/player.js`, `schema.js`, `db.js` | Save, schema and process recovery suites |
| Terminal and panels | `public/js/`, `public/css/style.css`, `public/index.html` | Client unit tests and isolated browser regression |
| Command discovery | `public/js/command-reference.js`, `command-guide.js` | Search/reference contracts and browser review |
| Contextual help / journal | `server/command-help.js`, `quest-journal.js` | Passive command dispatch, panel safety and objective-state tests |
| Quest objectives | `server/quest-objectives.js`, `public/js/quest-view.js` | Remaining work, legacy counters, task preservation, persistence and live Journal |
| World discovery | `server/world-reference.js`, `where` and `route` commands | Authored NPC/spawn placement and seller references without live-player inspection |
| Game content | `data/` | Content audit, domain tests and generated reference consistency |
| Simulation | `scripts/`, shared `scripts/lib/`, `data/guild-scripts.js` | Matched bounded cohorts with saved evidence |
| GM / ops | `server/gm.js`, admin and GM clients, `admin/` | Authorization, admin and GM suites |

Commands use the shared context signature and declare roundtime, panel safety,
aliases and mutation domains in metadata. Domain logic belongs behind Game's
facade. Preserve the terminal-first interface, plain-text wire messages and
spectator restrictions. See [AGENTS.md](../AGENTS.md) for the full contract and
[client protocol](CLIENT-PROTOCOL.md) for interface details.

## Player discovery

`progress` reports unmet next-circle requirements with current ranks, gaps,
training options and EXP awaiting absorption. `progress all` expands the practice
choices; both forms show completed requirements. Recommendations are guidance:
the circle engine and guild hall
decide eligibility, including guild-specific gates.

The Commands dock filters examples by search and category. `commands <query>`
opens the client guide. Preparing an example puts it into the input for review;
the player sends it explicitly. Availability and prerequisites still depend on
the character and location.

The Progress dock requests the same passive advancement view as `progress`
through the character-panel protocol. Its Training tab shows guild lesson
costs, direct experience, affordability, trainer room IDs and stat/TDP costs.
`training [skills|stats] [query]` narrows the plans by exact ID or name. Lessons
add experience rather than guaranteeing a rank; buying a lesson or raising a
stat requires an explicit command. Next-step guidance points to progression
options and respects the Paladin soul gate. `help <command>`, `help <category>`
and `help <search terms>` reuse the same reference descriptions as Commands;
`help topics` lists categories. `journal` reads the current objective, remaining
work and completion state without assigning, delivering or claiming a task.

Use `find <text>` for transcript search, including the literal word `corpse`.
Explicit `search corpse` commands reach the world; older `search <text>`
transcript searches continue to work for non-corpse terms.

The live Journal shows objectives, status and consistent known progress counts.
Inspect and Refresh use passive panel requests; a spectator inspects the watched
snapshot locally. Switching watch targets and returning to play supply current
quest snapshots. Legacy kill tasks with no original total show remaining work
without inventing a fraction. `quest` requests or reviews work; `claim` collects
a completed reward explicitly. Generated crier-visit scripts issue `claim`
before checking or requesting their next assignment.

`where [creature|npc|item|guild|room] <name>` lists known hunting grounds, NPC services,
guild leaders or merchants. For example, `where creature rat` and
`where guild warrior mage` use the authored world. Creatures may be absent and
shops sold out; the command does not reveal live players or promise availability.
`where room <name|id|area>` searches rooms explicitly. Location rows include
room IDs for `route <room-id|room name> [steps]`, which describes a shortest
walking route without moving the character. A route uses authored exits, not
map coordinates; combat and justice restrictions still apply.
`route quest [steps]` follows an unfinished delivery destination or finds a
reachable task giver for completed work. Hunting objectives remain explicit
in the Journal rather than choosing a hunting ground automatically.

`npm run audit:commands` checks the curated guide against registry keys,
metadata aliases and recognized local routes without loading gameplay or opening
the world database. Missing guide coverage is informational; broken declarations
fail verification.
Metadata field types and passive panel declarations are checked too. Panel-safe
commands must not declare mutation domains or roundtime gates/exemptions.
Resolved panel aliases are listed in JSON; this structural audit does not prove
that a handler is free of side effects.

`check:project` checks this guide, the root README, architecture map and dated expansion receipts.
It verifies local file links and Markdown/HTML fragments and inspects explicit
Node script targets in package scripts. Historical documents remain outside
the checked scope; glob and stdin targets are reported as skipped.

The connection indicator distinguishes connecting, connected and retrying.
Retry now starts the next connection attempt immediately. A disconnect retains
the input draft and does not replay previously sent commands.

`recipes [alchemy|forging|engineering|outfitting] [query]` lists authored recipes
and carried material gaps without crafting. Plans show exact command IDs,
required ranks, actual stations, output and optional learned techniques. Ready
means the rank, station and materials are available; success, quality and
roundtime remain the production command's decision.

The Scripts panel shows the current wait, completion, explicit stop or error
state. Diagnostics identify physical source lines and called-script context;
malformed regular expressions stop safely. Warnings such as unknown labels
remain nonfatal, and status refreshes preserve editor drafts.

`equipment [query]` inspects equipped gear by item ID, name or slot. It shows
condition, quality, armor contributions and repair quotes at the Ember Forge
and Needle & Thread. Base weapon values are not a prediction of combat damage.
The Inventory dock has Inventory and Equipment tabs; inspection does not change
gear or spend silvers. Use explicit commands to equip, remove or repair.

`spellbook [query]` searches the guild curriculum by spell ID, name, skill or
state. It reports held, forgotten and future spells, slot costs, learning halls,
base mana and soft mastery references. Those ranks affect spell strength rather
than permission to attempt a cast. The spell list and planner share the casting
rules based on circle and forgotten status. Circle grants consider newly
unlocked spells once, preserving prior holdings and forgotten choices. Mana
costs can vary during an actual cast.
The Spells dock provides Spells, Spellbook and Slots tabs through passive panel
requests. Spellbook supports an explicit search of up to 120 characters;
typing a filter sends nothing. Search, Clear and Refresh preserve terminal and
script drafts. Learning, forgetting, preparing and casting remain explicit commands.

Save a structured gate receipt with
`npm run verify -- --report /tmp/dragonrealms-verification.json`.
`--release` selects wire and browser integration too; choose the Ego driver with
`DR_VERIFY_BROWSER_DRIVER=ego`. Receipts record per-check timings, explicit
skips, numeric audit counts, Git revision/dirty counts and scoped source hashes.
Complete subprocess summaries also supply actual test, browser and corpus
aggregates. Missing, ambiguous, failed or oversized summaries are explicitly
unknown. Each selected check executes once; raw subprocess logs stay outside
the receipt.
A changed or unavailable source identity is reported explicitly. Reports do not
contain environment values or child output; keep the accompanying process log
for failure diagnostics.

`orders` inspects the current crafting work order from any room. It shows
quality, current payout, eligible claim stations and recipe material gaps without
requesting, abandoning or claiming work. `route order [steps]` chooses a nearest
reachable eligible order station. An unsupported or historical order stays
explicit; station guidance does not infer eligibility from the issuer's name.

The Crafting dock has Recipes and Work order tabs. Both use passive inspection,
preserve drafts, and report loading or request errors. Connected play and the
server's passive-panel protocol are required; watch and disconnected sessions
cannot issue these requests.

## Operations and evidence

- [Release preparation](RELEASE.md): explicit source packages, fresh-install
  verification, launch and rollback.
- [Launch profiles](LAUNCH-PROFILES.md): local/public configuration and GM roles.
- [Backup and recovery](RECOVERY.md): verified snapshots, restore to a new path,
  migrations and disposable integration worlds.
- [Test API](api.md): authenticated HTTP test tooling.
- [Artifact retention](ARTIFACT-RETENTION.md): dry-run-first treatment of saved evidence.
- [Simulation scripts](../documentation/sim_script.md) and
  [Jev simulations](../documentation/JEV-SIMS.md): specialized agent workflows.
- [Barbarian Kaizen](../documentation/barbarian-kaizen.md): matched experiment methodology.

Run simulations as bounded background jobs with durable logs. Barbarian
benchmarks must publish manifests, discovery indexes and timestamped requirement
and EXP telemetry to the world's served `public/live`. Check launch once and
review saved results on a requested continuation. Compare target completion and
requirement-gap closure first, then deaths, stalls and time. Missing telemetry
is unknown. A unit-test pass does not establish player pacing.

## Planning and reference index

- [Implementation schedule](IMPROVEMENT-SCHEDULE.md): ongoing work and acceptance checks.
- [Roadmap](../ROADMAP.md): narrative; `data/roadmap.js` generates the browser tracker.
- [Fidelity ledger](FIDELITY.md) and [skills reference](../SKILLS.md): mechanics and sources.
- [September project audit](../documentation/PROJECT-AUDIT-2026-09-24.md) and
  [later audit fixes](../documentation/AUDIT-FIXES-2026-09-29.md): dated implementation receipts.
- [Core readiness](CORE-READINESS-2026-09-09.md) and
  [integration closeout](INTEGRATION-CLOSEOUT-2026-09-09.md): historical verification scope.
- [Historical remaining work](REMAINING.md): August snapshot, not current acceptance evidence.
- [Change log](CHANGELOG.md): dated changes.
- [October expansion receipt](PROJECT-EXPANSION-2026-10-06.md): delivered guidance,
  discovery and tooling with verification scope.
- [October 7 continuation](PROJECT-EXPANSION-2026-10-07.md): quest coherence,
  world discovery and module auditing.
- [October 8 continuation](PROJECT-EXPANSION-2026-10-08.md): equipped-gear inspection,
  item validation and current verification evidence.
- [Architecture map](ARCHITECTURE.md): runtime flow, module ownership and current
  import-audit scope.

Keep historical receipts dated rather than updating their old counts into
current claims. Query the permitted local Elanthipedia archive for fidelity
questions; rewrite mechanics in our own words and cite source titles.

## Shared-worktree discipline

Check `git status` and file mtimes before restructuring. Give parallel agents
separate file ownership and integrate at stable module seams. Stage only owned
changes. Regenerate derived references through their scripts. Use temporary
databases for tests and leave shared worlds and saved experiment evidence intact.
