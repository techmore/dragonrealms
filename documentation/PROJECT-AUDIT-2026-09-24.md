# Dragon Realms Project Audit and Extension Plan

**Audit date:** 2026-09-24
**Scope:** initial repository-wide audit of the current worktree, including the Node game server, SQLite persistence, web client, GM/admin surfaces, simulation/fidelity tooling, data model, documentation, and tests, followed by the remediation checkpoint recorded below.
**Important:** this is an active worktree, not a clean release checkout. The initial audit was read-only; the later checkpoint records the resulting application, test, and documentation changes. Unrelated parallel JEV/Puffer work was not cleaned up or staged.

## Executive summary

Dragon Realms is a substantial, well-tested single-process MUD with a good foundation: the command dispatcher is modular, data cross-references validate cleanly, the test suite is broad, the client has a real router/window/scripting architecture, and the GM surface has deliberate authentication boundaries.

At the start of the audit, the most important near-term risk was not missing content; it was **contract drift caused by the in-progress guildless-character change**. The server and API allowed `p.guild === null`, but many command and combat paths still dereferenced `p.guild.id` or `p.guild.magic`. A guildless player could therefore crash on ordinary actions such as `health`, guild-specific verbs, and combat code paths. The implementation checkpoint below closes the immediate null-safety regression, while the broader command-capability contract remains planned work.

The second major operational risk is the simulation artifact footprint: `public/live/` is ignored by Git but is currently approximately **973 MB**. A conservative dry-run-first retention manager now protects active, recent, referenced, review, shared, and unknown evidence, but shared-history/SQLite compaction is still intentionally absent. The remaining footprint can still affect disk usage, dashboard performance, and operator recovery procedures.

After the first remediation pass, the project is ready for the next implementation phase. That phase should be framed as **broaden transactional coverage → formalize contracts and retention → modularize content → expand fidelity**, not “add more guild mechanics everywhere.”

## Independent review additions

A second architecture/security review identified several high-priority risks that should be tracked alongside the initial audit:

- **Test boost authorization was missing:** the original `{t:'boost'}` path allowed any authenticated playing session to set up to x100. The implementation checkpoint below closes this.
- **World loot and corpses are memory-only:** death deletes durable inventory/equipment rows and then stores the contents in `Game.floorItems`; a crash before recovery can lose the items. This is now the top durability item.
- **Several high-value mutations are not atomic:** character creation, equipment swaps, non-stackable item metadata writes, and death/corpse creation need one transaction boundary.
- **Economy actions are not always immediately durable:** bank, commodity, healing, and speculation actions rely on the 60-second autosave, so success is acknowledged before a crash-safe commit.
- **Connection/resource limits are incomplete:** WebSocket connections, unauthenticated idle time, HTTP concurrency, outbound backpressure, and request abort handling need explicit budgets.
- **Session tokens are stored as plaintext primary keys in SQLite:** a database/backup compromise yields usable sessions.
- **Character names are case-sensitive in the database but case-insensitive in lookups:** this can create ambiguous PvP/GM/spectator targeting.
- **Content is not fully data-driven:** spell/ability effects, creature behaviors, buffs, stations, and many script capabilities still require hardcoded command/combat branches.
- **`dir` and script capability data contain stale references:** for example, the `dir` alchemist destination points at a nonexistent room, and at least one guild script references a non-existent skill ID. These need schema validation.

## Implementation checkpoint — P0 fixes applied

The first remediation pass has now been implemented and targeted tests pass:

- Added `DR_ENABLE_AGENT_BOOST=1`, disabled by default and forbidden on the public profile.
- Required both a bot-tagged session and the dedicated GM credential for the wire boost message.
- Updated the GM quick-play path and browser/Node simulation clients to send the required authorization.
- Added a dedicated `test/boost.test.mjs` authorization contract covering disabled worlds, ordinary sessions, bad tokens, and the x100 cap.
- Added null-safe guild handling across status, character views, magic, world, shops, combat, PvP, wilds, and related command paths.
- Added a guildless command-matrix regression covering read-only, guild-sensitive, economy, passage, and combat commands.
- Added schema version 2 with a `world_loot` table; world startup now rehydrates dropped items and player corpses.
- Made player drops, corpse creation, corpse retrieval, and floor pickup durable/transactional across restart.
- Added commodity holdings to persistent state.
- Made bank deposit/withdrawal, healing, commodity trades, speculation, and caravan rent/sell/hire commit before acknowledging success, with runtime rollback on save failure.
- Added configurable WebSocket connection caps, authentication timeouts, origin allowlists for public hosting, and all-message rate limiting.
- Added bounded HTTP concurrency/request timeouts and explicit aborted-request handling in the API body reader.
- Added schema v3 session-token migration; the database now stores SHA-256 token digests, while clients retain only the raw bearer token.
- Split GM privileges into inspect, operator, destructive-admin, and GM-play credentials; mutating GM routes now require the appropriate role and explicit HTTP methods.
- Made unauthenticated `/api/health` content-free: it now returns only service status, API version, and process uptime; roster and player metadata remain behind authenticated surfaces.
- Added a shared browser security policy to static, API, GM, overload, and error responses: CSP, MIME sniffing protection, frame denial, referrer policy, cross-domain policy, and a restrictive permissions policy.
- Moved player and GM bearer tokens from persistent `localStorage` to tab-scoped `sessionStorage`; shared GM handoff/fragment code removes legacy persistent copies, and fresh-tab launches still pass credentials explicitly through URL fragments that are immediately stripped.
- Added a structural command metadata contract with canonical/static-alias inheritance, derived RT policy, canonical-only panel safety, movement metadata, coarse mutation/capability fields, and backward-compatible function registries/direct imports.
- Added a flat, schema-tagged `characters.persistent_state` codec with legacy/malformed/wrong-type normalization, non-persistent diagnostics, fail-closed unsupported versions, and one codec-aware writer for full saves, scripts, crafting, and work-order claims while preserving top-level SQL JSON paths.
- Added `scripts/retention.mjs` and a tested planning library: dry-run by default, explicit apply, age/keep-last/disk-budget policy, process/manifest/reference revalidation, active/review/unknown protection, atomic metadata-only receipts, and idempotent complete-run deletion.
- Extended the inventory transfer savepoint to snapshot/restore equipment, then made equip, same-slot swap, and unequip ownership changes atomic; equipment inserts now persist maker metadata immediately.
- Made bundle/unbundle conversions atomic, restored runtime work-order state when take/abandon persistence fails, and made repair payment/condition/experience commit durably before success.
- Added failure-injection coverage for equipment inserts, inventory inserts, bundle markers, work-order state, and repair payment, including direct reload checks.
- Updated runtime configuration, auth, schema, disposable-world, GM, session, API, static, HTTP, persistence, and retention tests for the new capability, migration, privacy, authorization, response-policy, transaction, and artifact-safety boundaries.

The first remediation pass leaves **901 tests passing, 0 failing**; the current client regression gate also passes **82/82 browser checks** with the shared response policy and tab-scoped credential flow enabled. The immediate next implementation priority is extending capability guards and codecs to the remaining JSON columns; shared JSONL/SQLite compaction remains a separately locked maintenance phase.

## Initial baseline evidence

The following evidence was captured before application remediation and is retained as the audit baseline:

- `node --version`: Node **v22.23.1**; package requires Node `>=22.5.0`.
- `npm test`: **868 passing, 0 failing** in approximately 23.5 seconds.
- `node scripts/audit-data.mjs`: **all cross-references valid**.
- `node scripts/verify-roadmap.mjs`: **0 errors, 0 unmatched roadmap rows, 0 stale status markers**.
- `git diff --check`: clean.
- `npm ls --depth=0`: only the declared runtime dependency `ws@8.21.3`.
- Repository contains approximately 48,000 lines across the inspected JS/MJS/PY source areas, 147 test files, and a large set of new experiment tests.
- At initial capture, the worktree had **16 modified tracked files and 159 untracked files**. It remains intentionally dirty as remediation, deployment documentation, and unrelated JEV/Puffer experiment work coexist. The untracked set includes experiment tooling, tests, UI assets, and documentation; use `git status --short` for the changing count and reconcile the exact release set before release tagging.
- `npm run verify` was not treated as a complete green gate here because its corpus and browser phases are opt-in. The default verification script explicitly skips those checks.

## Current architecture

### Runtime

- `server/index.js`: boot, port guard, configuration, HTTP server, WebSocket attachment, shutdown.
- `server/http.js`: API/GM/static route composition.
- `server/session.js`: WebSocket auth, chargen, input routing, spectator/GM messages, scripts.
- `server/game.js`: world state, presence, room movement, spawns, timers, combat lifecycle, persistence facade.
- `server/combat.js` and `server/combat-manager.js`: per-fight state machine and world combat lifecycle.
- `server/player.js`: character model, load/save, skills, inventory, equipment, TDPs, scripts.
- `server/commands/`: command registry split by combat, magic, items, shops, character, world, movement, and joining.
- `server/schema.js`: one versioned SQLite baseline with compatibility migrations.
- `server/api.js`: account-authenticated HTTP test/driver API.
- `server/gm.js`: bearer-token GM inspection and controlled operations.
- `public/js/`: vanilla client with transport, message router, terminal, panels, status, scripting, windows, admin, and experiment views.
- `data/`: content tables for guilds, skills, items, creatures, world, recipes, mana, abilities, and roadmap/script metadata.
- `scripts/` and `puffer_adapter/`: real-wire simulation, fidelity sweeps, JEV agents, Puffer training/evaluation, dashboards, and evidence tooling.

## Findings and risks

### P0 — Guildless state is only partially supported *(fixed in this checkpoint; broader contract work remains)*

**Evidence:**

- `server/player.js:208-211` and the current chargen/API paths intentionally load/create `p.guild === null`.
- `server/chargen.js:43-68` and `server/api.js:210-214` explicitly advertise guildless entry.
- `server/commands/character.js:219-221` dereferences `p.guild.magic` and `p.guild.id` in `health`.
- `server/commands/magic.js:24` dereferences `p.guild.id` in `enchant`; many later magic verbs do the same.
- `server/combat.js:200`, `337`, `345`, `354`, `382`, and `442` contain direct guild accesses.
- `server/commands/world.js:203` and `server/commands/shops.js:115,145` also assume a guild exists.
- `server/status.js:16` assumes `p.guild` in `guildTrainer`.

A direct audit reproduction against a fresh guildless character showed `health` and `enchant` throwing `Cannot read properties of null`; the WebSocket route turns these into generic server errors rather than safe player-facing validation.

**Impact:** new players can reach an advertised state that is not robust. A combat/ability/command interaction can become a process-level exception path or an opaque generic error. This blocks the intended DR-style “join at the hall” ceremony and makes the current API/chargen changes unsafe to ship.

**Required fix:** introduce a single explicit capability model for player states, preferably:

- `p.guild` may be null only before joining.
- Every command declares whether it requires a guild, a magic guild, a specific guild, combat, a room, or a hall.
- Central helpers reject invalid capability combinations with player-facing messages.
- Combat and all derived-state calculations use optional guild capability checks.
- Add a contract test that runs a large representative command matrix for `guildless`, joined, wrong-guild, and combat states.

### P1 — `/api/health` contradicted the API privacy contract *(fixed in this checkpoint)*

**Original evidence:**

- `server/api.js:1-4` said the API “never serves unauthenticated state,” while the public health response returned online character names, guilds, circles, bot flags, and GM-toon flags.

**Original impact:** if the API was enabled in a public profile, this became a roster/privacy leak and exposed operational metadata without authentication.

**Implemented fix:** `/api/health` is still unauthenticated for service probes, but now returns only `ok`, the service identifier, `apiVersion`, and `uptimeMs`. A seeded sentinel regression verifies that names, guilds, circles, bot/GM classifications, player counts, and roster arrays are absent. Authenticated character state and the GM API remain the appropriate surfaces for detailed online data.

### P1 — Public simulation artifact retention *(bounded manager added; shared compaction remains)*

**Original evidence:** `public/live/` is ignored by Git and currently occupies about 973 MB. `scripts/live-log.mjs` appends logs and updates the index, while sweep and experiment tooling retains manifests, JSONL, checkpoints, evaluation files, and `sweeps.db`. No central retention/compaction policy was found.

**Original impact:** local operator disks fill; dashboard indexes grow; backups and incident recovery become difficult; stale logs can be mistaken for current evidence unless their metadata is interpreted correctly.

**Implemented fix:** `npm run retention` inventories the tree and defaults to a no-write dry run. Explicit `--apply` can remove only old, terminal, unreferenced Jev/Puffer/Unreal run directories with recognized schemas. Active processes/states/evaluations, uncertain process identity, recent terminal runs, malformed/unknown/symlinked paths, Puffer approval/rejection evidence, every referenced run, and all shared histories/indexes/catalogs are protected. Age, keep-last, and optional disk-budget policy are bounded; candidates are revalidated immediately before deletion; apply emits an atomic, public, metadata-only `retention-manifest.json`; regression tests cover dry-run immutability, state/reference/process protection, keep-last, budgets, revalidation, symlinks, apply, and idempotence.

**Residual work:** the manager intentionally does not rewrite shared logs/JSONL, delete `sweeps.db` rows, compact SQLite, prune experiment manifests, or rebuild the large generated catalogs. Those operations need a separate maintenance lock, pre-compaction backup/checksum, transaction/integrity checks, and derived-index rebuilds. The current 30-day dry run correctly reports zero reclaimable bytes rather than touching the dominant shared evidence.

### P1 — Verification is broad but not complete by default

**Evidence:** `npm test` is excellent in breadth, but `scripts/verify.mjs` only runs corpus and browser regression when `DR_VERIFY_CORPUS=1` / `DR_VERIFY_BROWSER=1`.

**Missing/underweighted gates:**

- no default browser smoke/regression gate;
- no performance/load budget;
- no automatic dependency/security audit;
- no coverage report or mutation-style invariant check;
- no explicit test that every persisted JSON column can survive malformed/legacy data;
- no full server restart/production boot check in the normal path.

**Fix:** create tiered gates: fast local, pre-commit, nightly, and release. Keep the fast suite fast, but require browser, isolated-world, restart, and data migration checks before merge/release for affected areas.

### P1 — Persistence versioning and JSON contracts were incomplete *(persistent-state v1 codec added)*

**Original evidence:** `server/schema.js` originally centered too much work in a version-1 baseline, while `server/player.js` stored substantial state in loosely parsed JSON columns. `characters.persistent_state` accepted any object without a schema contract, and crafting mutated it through raw `json_set()` calls.

**Strengths:** foreign keys, WAL, transaction boundaries in `savePlayer`, inventory transfer savepoints, ordered schema migrations through version 3, and migration tests are good foundations.

**Implemented fix:** `characters.persistent_state` now has a pure backward-compatible codec. The stored document remains flat and keeps `version: 1`, but new writes add `schema: "dragonrealms.characters.persistent_state"`. Missing, legacy-unversioned, current flat-v1, and tagged-v1 records load compatibly; malformed and valid-but-wrong-type fields normalize to safe defaults with non-persistent diagnostics. Unsupported schema/version records are diagnosed and blocked from overwrite. Full saves, script writes, crafting, and work-order claims share a codec-aware writer, so malformed JSON is repaired on the next legitimate mutation while `$.workOrder` and `$.forgedQuality` remain compatible with SQL/external consumers.

**Residual work:** the other character, quest, inventory, vault, corpse, and auction JSON columns still need explicit codecs/diagnostics. A future nested state envelope must be an explicit format migration, not an incidental change. Add a disposable-world migration matrix and a complete backup → migrate → boot → state-integrity release workflow.

### P1 — Public browser hardening was incomplete *(headers and persistent token storage fixed; rendering/inline work remains)*

**Original evidence:** `server/static.js` correctly prevents traversal and private DB artifacts, and the GM console escapes DB cells, but the static/HTTP layer had no response security headers. Privileged tokens were also stored persistently in `localStorage` for the main client and GM/admin surfaces.

**Original impact:** a rendering mistake, injected script, or compromised same-origin page had a higher blast radius because session/GM tokens survived outside the active tab and remained available to browser JavaScript.

**Implemented fix:** static, API, GM, overload, timeout, and error responses now share a CSP; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; `frame-ancestors 'none'`; `Referrer-Policy: no-referrer`; `X-Permitted-Cross-Domain-Policies: none`; and a camera/microphone/geolocation-denying permissions policy. Tests assert policy on successful static content, static errors, ranged content, and unauthenticated API health. Player and GM tokens now use tab-scoped `sessionStorage`; legacy persistent copies are removed, while trusted launcher/quick-play handoffs continue through immediately consumed fragments. The 82-check browser gate passes with explicit session clearing and reauthentication.

**Residual work:** authored inline scripts/styles require CSP `'unsafe-inline'` compatibility for now, same-origin JavaScript can still read the tab-scoped token, and a release browser gate must continue auditing server text before raw `innerHTML`. Remove inline code in favor of nonce/hash or external modules, move GM credentials to a dedicated isolated origin or non-browser launcher handoff, and add the planned rendered-DOM regression before claiming full browser hardening.

### P2 — Large modules remain the main extension bottleneck

**Largest inspected files include:**

- `server/combat.js`: ~1,587 lines;
- `data/world.js`: ~1,669 lines;
- `scripts/lib/script-gen.mjs`: ~1,850 lines;
- `scripts/race-guild-sweep.mjs`: ~3,241 lines;
- `public/js/status.js`: ~887 lines;
- `server/player.js`: ~953 lines;
- `server/commands/magic.js`: ~975 lines.

The project has already extracted delegates, but many cross-cutting behaviors still live in large modules. This makes new guild mechanics prone to duplicated conditions and broad regression risk.

**Fix:** split by responsibility, not by arbitrary line count:

- combat: setup, targeting, attack resolution, damage, status/DoTs, maneuvers, PvP, kill/reward;
- player: persistence codecs, inventory transactions, skill/EXP, equipment, resources;
- world: rooms, navigation, wilds, NPC services, quests;
- client: wire handlers, status rendering, room rendering, panels, scripting UI;
- experiments: scenario contracts, telemetry, evidence, dashboard rendering.

Preserve public interfaces and use corpus/snapshot tests around each extraction.

### P2 — Data authoring is powerful but not schema-driven

**Evidence:** `scripts/audit-data.mjs` validates many cross-references, which is excellent, but it parses the unexported `CIRCLE_TABLES` from source with regular expressions (`scripts/audit-data.mjs:16-29`). Several content and simulation contracts are described in prose/comments and duplicated across `data/`, server logic, client logic, and scripts.

**Risks:** silent drift, brittle source parsing, difficult external content packs, and overclaiming in the roadmap when a UI or script assumes a field the server does not enforce.

**Fix:** export machine-readable schemas/tables, add runtime startup validation, define explicit capability/effect descriptors, and generate both server and client indexes from the same source. Keep the cross-reference audit, but make it consume exports rather than source text.

### P2 — Experiment tooling is powerful but fragmented

The repository now contains multiple overlapping research systems:

- race/guild fidelity sweeps;
- real-wire live simulations;
- JEV player/control/replay pipelines;
- Puffer training, imitation, evaluation, and native watch;
- dashboard-specific record and result stores.

This is a strength for experimentation, but the boundaries between production game code, test fixtures, agent code, private checkpoints, and public telemetry are not yet represented as a single explicit package/layer contract.

**Fix:** define a common experiment manifest and result contract:

- source revision/hash;
- scenario and environment contract;
- target circle and requirement snapshot;
- seed set;
- actions/observations and feature schema version;
- budgets and stop reason;
- deaths, stalls, time-to-target, requirement-gap closure;
- approval/rejection evidence;
- artifact retention class.

Keep experiment code out of the production game’s hot path and make all dashboard claims derive from validated manifests.

### P2 — The roadmap contains stale and contradictory implementation signals

The generated tracker is internally consistent, but the repository also contains older plans and prose that no longer match the code. For example, the old modularity plan describes extracting a client message switch, while `public/js/main.js` already delegates to `public/js/router.js`; the roadmap still describes guild selection/chargen behavior that is being replaced by the current guildless work.

**Fix:** maintain one canonical status source (`data/roadmap.js` + generated docs), archive old plans as historical design notes, and add a “last verified commit/test evidence” field to roadmap features. Do not treat “sim-verified” as “production parity”; the existing roadmap correctly distinguishes this, and the distinction should be preserved.

## Extension strategy

The recommended sequence is:

1. **Make current behavior safe and internally consistent.**
2. **Create stable contracts for commands, state, content, and experiments.**
3. **Move guild-specific behavior behind capability/effect interfaces.**
4. **Expand fidelity and content breadth.**
5. **Add scale/operations/security hardening as the player base grows.**

## Phased implementation plan

### Phase 0 — Establish a clean baseline (1–2 days)

**Goal:** make parallel work auditable and prevent audits/releases from mixing incomplete experiments.

1. Decide which current changes belong to the release line.
2. Create a feature branch/worktree for the audit follow-up.
3. Split the untracked JEV/Puffer material into: production, test fixtures, experiment code, dashboards, and private artifacts.
4. Add an explicit `EXPERIMENTAL.md`/manifest policy if not already present.
5. Record the exact test and data-audit baseline in the release notes.

**Exit criteria:** clean status for the release branch, all release files tracked, and a documented list of intentionally local/private artifacts.

### Phase 1 — Close the guildless safety gap (2–4 days, highest priority)

**Files/seams:** `server/player.js`, `server/commands/character.js`, `server/commands/magic.js`, `server/commands/world.js`, `server/commands/shops.js`, `server/combat.js`, `server/status.js`, `server/api.js`, `server/chargen.js`.

1. Define capability helpers such as `requireGuild`, `requireMagicGuild`, `requireGuildId`, and `requireHall`.
2. Replace direct `p.guild.id`/`p.guild.magic` assumptions in all command handlers and combat hooks.
3. Decide whether guildless characters can attack, forage, use shops, and train generic skills; encode the decision in one place.
4. Make guild joining atomic and re-derive mana, abilities, spell curriculum, derived stats, and persisted state after joining.
5. Add a full command-matrix test for:
   - guildless pre-join;
   - just joined;
   - wrong guild;
   - magic/non-magic;
   - combat/no combat;
   - hall/not hall.
6. Add a WebSocket integration test covering the advertised creation → walk → join → train flow.

**Exit criteria:** no uncaught `TypeError` for a guildless player; every invalid capability produces a deterministic player-facing message; `npm test` and browser smoke remain green.

### Phase 2 — Introduce explicit domain contracts (1–2 weeks)

1. Add command metadata alongside handlers: `requiresGuild`, `requiresMagic`, `requiresCombat`, `requiresRoom`, `rt`, `mutates`, and `panelSafe` where useful.
2. Replace the separate `RT_BLOCK` list with metadata or generate both from one declaration.
3. Add a typed/validated persisted-state codec per JSON column.
4. Add an event/effect seam for `kill`, `spell_cast`, `ability_start`, `ability_tick`, `train`, `craft`, and `circle_up` instead of scattered guild conditionals.
5. Version the wire protocol with a server/client capability handshake and preserve backward-compatible message fields.

**Exit criteria:** new commands declare their contract once; handlers no longer contain repeated capability guards; protocol changes have compatibility tests.

### Phase 3 — Persistence, migration, and recovery (1 week)

1. Split `schema.js` baseline construction from ordered incremental migrations.
2. Add JSON envelope versions and corrupt-data recovery policy with diagnostics.
3. Add a backup/restore command and a restore-into-disposable-world verification path.
4. Add transaction boundaries for high-value multi-row actions: auction settlement, character deletion, crafting/escrow, and cross-session inventory transfer.
5. Add restart tests covering active players, auctions, quests, guild joining, scripts, wounds, and partial saves.

**Exit criteria:** a world can be backed up, migrated, restored, booted, and verified without silent state loss.

### Phase 4 — Content modularization (2–4 weeks)

1. Export circle tables and content metadata from `data/guilds.js`; remove source regex parsing from the audit tool.
2. Create a content validation command that checks IDs, room reachability, guild capability references, recipes, item requirements, spell slots, ability prerequisites, and client-display fields.
3. Move Barbarian special cases first because they are the most mature fidelity surface:
   - resources;
   - ability classes;
   - paths;
   - kill effects;
   - combat hooks.
4. Define an effect/capability interface for other guilds without changing their player-facing behavior.
5. Add an authoring guide and fixture-based tests for adding a new guild, spell, item, creature, room, and ability.

**Exit criteria:** a new data-only guild mechanic can be added without editing the central command dispatcher or combat engine; the audit validates it automatically.

### Phase 5 — Fidelity and gameplay breadth (ongoing, prioritized by player value)

Prioritize in this order:

1. **Onboarding:** guildless → hall → join → first training → first hunt → first circle tutorial.
2. **Barbarian depth:** full berserk/form/roar families, path progression, mastery/ACM combinations, registers.
3. **Cross-guild systems:** spell patterns/metaspells, technique trees, crafting disciplines, mana/cambrinth edge cases.
4. **Guild-specific depth:** Cleric infusion/resurrection, Empath shift, Moon Mage astral travel, Necromancer states, Paladin protect, Ranger horses, Thief reputation/contacts, Trader caravans/justice, Warrior Mage pathways.
5. **World/economy:** province content, deeper hunting bands, task-giver variety, player trading fees, crime variants.
6. **Circle 10+:** only after playable world content and live pacing support the higher gates; do not treat the requirement engine alone as playable coverage.

Each feature should include:

- a player-facing contract;
- data/schema validation;
- positive and negative tests;
- a simulator or script contract where relevant;
- a live evidence/dashboard record for balance-sensitive changes;
- a roadmap status update.

### Phase 6 — Client and interface evolution (1–2 weeks, then incremental)

1. Split `status.js` by concern: prompt parsing, room compass, hands/doll, buffs/wounds, experience blips, combat target.
2. Replace remaining server-derived `innerHTML` with text-node/DOM construction or a single audited escape helper.
3. Add browser regression coverage for login, guildless chargen, joining, combat, script execution, panel requests, reconnect, and accessibility.
4. Add a visible “connection/protocol/version” diagnostic state.
5. Add server-backed config/schema versioning so old clients fail clearly rather than partially rendering.

**Exit criteria:** browser regressions run in CI-like verification, no raw server text reaches HTML, and client state is recoverable after reconnect/reset.

### Phase 7 — Observability, security, and scale (ongoing before public hosting)

1. Add structured logs with request/session/run IDs and redaction rules.
2. Add metrics for command latency, combat tick duration, DB transaction latency, active sessions, queue depth, auth latency, sim artifact bytes, and dashboard failures.
3. ~~Add dry-run-first retention and disk-budget tooling for complete public run directories.~~ **Done in the first remediation checkpoint.** Shared history/SQLite compaction remains a separate maintenance workflow.
4. ~~Add CSP/security headers, remove persistent browser token storage, and publish an explicit public-profile deployment checklist.~~ **Done in the first remediation checkpoint.** Externalize inline CSP exceptions and isolate privileged origins.
5. Add load tests for 25/100/250 WebSocket sessions and bursty command/auth traffic; define p95/p99 targets.
6. Decide deliberately whether the game remains a single-world process. If horizontal scaling is required, design authoritative world ownership before attempting multiple game processes against one SQLite file.

**Exit criteria:** public hosting has a documented threat model, operational dashboards, bounded artifact growth, and measured behavior under target load.

## Prioritized task list

### Immediate / P0

1. ~~Fix all guildless null dereferences in commands, combat, status, and derived views.~~ **Done in the first remediation checkpoint.**
2. ~~Add a guildless command-matrix regression test.~~ **Done in the first remediation checkpoint.**
3. ~~Require explicit test-world + GM authorization for agent boost.~~ **Done in the first remediation checkpoint.**
4. ~~Add durable corpse/floor-loot state before relying on death recovery in production.~~ **Done in the first remediation checkpoint.**
5. ~~Make banking/commodity/healing/speculation/caravan mutations transactional and immediately durable.~~ **Done in the first remediation checkpoint.**
6. ~~Add public-profile connection, request, origin, and authentication budgets.~~ **Done in the first remediation checkpoint.**
7. ~~Hash stored session tokens and migrate existing sessions.~~ **Done in the first remediation checkpoint.**
8. ~~Separate inspect, operator, destructive-admin, and GM-play credentials.~~ **Done in the first remediation checkpoint.**
9. ~~Make `/api/health` content-free before enabling the API in a public deployment.~~ **Done in the first remediation checkpoint.**
10. ~~Add dry-run-first retention/disk-budget tooling for `public/live/`.~~ **Done for complete recognized run groups.** Add separately locked and backed-up shared JSONL/SQLite compaction later.

### Next / P1

11. ~~Add structural command metadata and derive RT/panel policy.~~ **Done for the backward-compatible first slice.** Opt simple contextual capability checks into central guards over time; custom validation remains authoritative.
12. ~~Add the first flat, schema-tagged persisted-state codec.~~ **Done for `characters.persistent_state`.** Add codecs/diagnostics for the remaining JSON columns and continue incremental schema migrations.
13. ~~Add transactions for crafting/escrow, equipment changes, auctions, and the bounded high-value service slice.~~ **Done:** crafting, auctions, vault/shop transfers, equipment swaps/removal, bundle/unbundle, work-order take/abandon, and repair now have durable/failure-tested boundaries. Cross-session transfers and conjured-item lifecycle remain later work.
14. Expand restart, backup/restore, migration, and partial-save release gates.
15. Add default browser smoke and isolated-world restart gates.
16. ~~Add shared security headers and remove persistent browser token storage.~~ **Done in the first remediation checkpoint.** Externalize inline CSP exceptions, add the rendered-DOM browser audit, and isolate GM credentials on a dedicated operator origin.
17. Add load testing and explicit p95/p99 targets for auth, input, HTTP, and combat ticks.

### Then / P2

18. Export circle tables and replace regex source parsing in data validation.
19. Split combat/player/status/script-generation modules behind stable interfaces.
20. Unify experiment manifests and dashboard evidence contracts.
21. Run matched live pacing cohorts for all guilds and retune the 10–40 hour spread.
22. Add guild-specific depth only after the capability/effect framework is stable.

## Public deployment checklist

This checklist describes the **current** implementation. Items explicitly marked as gaps must not be represented as automated controls until their code or an external deployment control exists.

### 1. Reconcile and freeze the release artifact

- Decide which changes belong in the release line. The audit worktree contains unrelated tracked and untracked JEV/Puffer experiments and must not be released by accident.
- Build from a reviewed revision, not from a live dirty directory. Record the revision and whether simulation/experimental surfaces are enabled.
- Use Node **22.5.0 or newer**; the audit environment used Node **v22.23.1**.
- Keep `public/live/`, SQLite files, backups, credential files, private simulator outputs, and local experiment databases out of the deployed source artifact unless their public-serving behavior is intentional.

### 2. Configure the public profile

The public profile fails closed when the four GM role credentials or the origin allowlist are absent. Generate four independent high-entropy secrets (for example, 32 random bytes rendered as 64 hexadecimal characters) and inject them from a secret manager; do not reuse one token for multiple roles.

| Variable | Public minimum | Purpose |
| --- | --- | --- |
| `DR_PROFILE` | `public` | Enables public-host validation and WebSocket origin enforcement. |
| `DR_GM_TOKEN` | 32 characters | Read-only GM inspection and live watch. |
| `DR_GM_OPERATOR_TOKEN` | 32 characters | Inspection plus reload, simulation start/status/cancel, and script-folder operations. |
| `DR_GM_ADMIN_TOKEN` | 32 characters | Destructive character deletion; use only for an intentional, audited workflow. |
| `DR_GM_PLAY_TOKEN` | 32 characters | GM quick-play/character injection; it is not a destructive-admin credential. |
| `DR_ALLOWED_ORIGINS` | one or more exact origins | Comma-separated WebSocket origins, including scheme and non-default port, with no path or trailing slash. |

A reverse-proxy deployment should normally bind the application to loopback and let the proxy be the only network entry point:

```sh
DR_PROFILE=public
DR_HOST=127.0.0.1
PORT=3000
DR_DB_PATH=/absolute/path/outside-public/dragonrealms.db
DR_ALLOWED_ORIGINS=https://play.example.com
DR_ENABLE_API=0
DR_GM_TOKEN='<injected inspect secret>'
DR_GM_OPERATOR_TOKEN='<injected operator secret>'
DR_GM_ADMIN_TOKEN='<injected destructive-admin secret>'
DR_GM_PLAY_TOKEN='<injected GM-play secret>'
npm start
```

The quoted values above are configuration shapes, not usable secrets. Configure them through the service manager or secret store rather than committing an env file. Limit read access to the environment, process table, shell history, crash dumps, and deployment logs. The server also publishes the active inspect token to `/tmp/dr-world-token-<port>.json` with mode `0600`; keep the host single-tenant, prevent `/tmp` contents from being backed up or served, and remove stale local token files during decommissioning.

Required public safety settings:

- Leave `DR_ENABLE_AGENT_BOOST` unset. The public profile rejects it when set.
- Leave `DR_ENABLE_DEBUG_API` and `DR_DEBUG_TOKEN` unset unless a separately reviewed test/debug deployment requires them.
- Prefer `DR_ENABLE_API=0` for a player-only world. GM HTTP routes are intentionally unavailable while it is off.
- The GM dashboard requires `DR_ENABLE_API=1`, but that same switch enables the account-authenticated test API. `/api/health` is now content-free; still restrict the broader API surface to the operator origin and review account-authenticated test endpoints before general exposure.
- Never place GM credentials in `public/live/`, source files, browser bundles, URLs, or experiment manifests. The client keeps operator-provided bearer credentials only in tab-scoped browser storage and removes legacy persistent copies, but same-origin JavaScript can still read them; use a dedicated operator origin and protected workstation.

### 3. Set and load-test resource budgets

The application validates these optional values. The defaults are suitable as starting bounds, not proof of capacity for a particular host:

| Variable | Public default | Accepted range |
| --- | ---: | ---: |
| `DR_MAX_WS_CLIENTS` | `250` | `1`–`10000` |
| `DR_WS_AUTH_TIMEOUT_MS` | `30000` | `5000`–`300000` |
| `DR_MAX_HTTP_CONCURRENT` | `256` | `1`–`5000` |
| `DR_HTTP_REQUEST_TIMEOUT_MS` | `30000` | `1000`–`300000` |

The server also applies fixed per-connection message budgets: 5 auth messages/second, 20 input commands/second, and 60 control messages/second. Configure proxy connection/body limits, request rate limits, and upstream timeouts as a second layer. Measure auth latency, HTTP p95/p99, command latency, combat-tick duration, memory, and database contention at expected and burst load before raising a limit. The public profile does not provide horizontal scaling: one process owns one authoritative world and SQLite database.

### 4. Configure the TLS reverse proxy

- Terminate TLS with current HTTPS policy and serve the client and `/ws` as `wss://`; do not expose cleartext game traffic on a public network. Add HSTS at the proxy once every supported client path is confirmed HTTPS-only.
- Preserve the application response security headers. The CSP still permits authored inline scripts/styles for compatibility, so do not treat header presence as proof that every DOM rendering path is injection-safe.
- Preserve the browser `Host` and `Origin` headers. `DR_ALLOWED_ORIGINS` performs an exact string comparison; a rewritten host, missing origin, or extra trailing slash will close the WebSocket.
- Forward `/ws` HTTP upgrades with `Connection: Upgrade` and `Upgrade: websocket`, use HTTP/1.1 or a correctly implemented equivalent upstream, and set an idle timeout that does not sever active sessions.
- Do not add a permissive CORS wildcard for privileged routes. Restrict administrative/API access by source network or dedicated origin where possible.
- Verify that the application port is reachable only through the proxy and that health, account, GM, debug, and raw database paths are not accidentally exposed by a static-file alias.
- A production `DR_PROFILE=public` rejects WebSocket connections without an allowlisted `Origin`. Browser clients satisfy this automatically; scripted clients must send an intentional allowlisted origin.

### 5. Back up, migrate, and restore safely

- Put `DR_DB_PATH` on persistent storage owned by the service account and outside the directory served by the static handler. Its parent must already exist.
- Before every schema upgrade, stop the world gracefully, wait for a successful exit, and run the verified snapshot command to a new mode-`0600` file outside `public/`:

  ```sh
  node scripts/backup-db.mjs /absolute/path/world.db /absolute/path/backups/world-YYYY-MM-DD.db
  ```

- A live `VACUUM INTO` backup includes committed WAL data, but it cannot include in-memory changes awaiting autosave. Do not call a snapshot from a failed or forced shutdown a complete final-state backup.
- Schema version 3 must be applied before opening traffic. Migrations run transactionally and reject unknown newer versions. If startup fails, stop retrying blindly, retain the original database/WAL files, inspect the contextual error, and restore to a **new path** for diagnosis rather than editing migration history.
- Restore into a new database, boot it with the normal runtime configuration, and verify account login, character selection, inventory/equipment, balances, progression, durable floor loot/corpses, and GM inspection before accepting the restore.
- Encrypt backups, restrict them to the service/operator roles, monitor backup age, and test a restore on a schedule. Session rows contain SHA-256 token digests after migration, but backup confidentiality remains required.

### 6. Govern public experiment artifacts

- `public/live/` is ignored by Git but is deliberately served as public static content. Every manifest, log, telemetry row, screenshot, and sweep database copied there is public unless a future deployment-specific access policy says otherwise.
- Preserve completed run manifests, indexed log locations, target/requirement telemetry, stop reasons, and comparison summaries required for the project’s durable-evidence convention.
- Never place secrets, raw session tokens, private account exports, or restricted player data in artifacts. Redact before publication, not only on the dashboard.
- Add disk-usage alerts and a reviewed archival/retention schedule. Use `npm run retention` for a no-write dry run and inspect its relative-path JSON before explicit apply. It protects shared histories, SQLite, indexes, active/recent/referenced/review/unknown evidence, and emits a metadata-only receipt on apply. Archive complete immutable bundles before deletion; do not use blind `rm` cleanup.
- The current manager cannot reclaim the dominant shared logs/JSONL or `sweeps.db`. Treat any future shared compaction as a separate maintenance operation with a writer lock, pre-compaction backup/checksum, SQLite integrity checks, and atomic derived-index rebuilds.
- A dashboard-visible run is not live unless its bounded process, manifest, and log discovery files have been verified. Missing or stale telemetry means **unknown**, not zero progress.

### 7. Verify before and after cutover

Run the release candidate checks before deployment:

```sh
git diff --check
node --version
npm test
node scripts/audit-data.mjs
node scripts/verify-roadmap.mjs
node --test test/schema.test.mjs test/persistence.test.mjs test/backup.test.mjs test/process-recovery.test.mjs
DR_VERIFY_CORPUS=1 DR_VERIFY_BROWSER=1 DR_CHROMIUM_PATH='/absolute/path/to/chromium' npm run verify
```

The first remediation checkpoint's full suite result was **901 passing, 0 failing**. The isolated corpus currently captures and matches 184 messages; `npm run regression` passes all 82 browser checks after the tab-scoped credential change. The combined verifier covers syntax, tests, data/documentation, corpus, and optional browser phases; any required command that cannot run must be reported as unverified rather than skipped silently.

After cutover, smoke-test through the public origin:

1. Load static assets over HTTPS with no mixed-content errors.
2. Register/login, select/create a guildless character, join a guild, train, move, and reconnect.
3. Exercise ordinary combat, death, corpse retrieval, and floor-loot pickup, then restart once and confirm the durable state rehydrates.
4. Exercise a bank transaction and a commodity/caravan action, restart, and confirm committed state.
5. Confirm the login page works from an allowlisted origin and a WebSocket from a non-allowlisted origin is rejected.
6. If the GM surface is enabled, verify inspect-only denial, operator-only reload, GM-play behavior, and destructive-admin denial with the wrong credentials. Never test character deletion on production data without an approved fixture and rollback plan.
7. Check process logs, database growth, HTTP/WebSocket limits, and dashboard/artifact growth. Confirm logs contain no bearer credentials or raw session tokens.

### 8. Roll back safely

- On application failure, stop gracefully and retain the failed database plus its WAL/SHM companions for diagnosis.
- Roll back code only after checking schema compatibility. A newer application may have committed schema version 3; do not point an older binary at that database blindly.
- Restore a known-good backup to a new path, update the service configuration, boot with the normal secrets/origins, and repeat the smoke checks.
- Rotate all four GM role secrets if any privileged credential may have leaked. Player session compromise is a separate incident: use a reviewed session-revocation procedure and force reauthentication rather than editing `schema_migrations` or deleting unrelated account data.
- Keep the rolled-back database available until character/economy/loot integrity and the incident cause are accepted; then retire artifacts according to the reviewed retention policy.

## Release gates

A release candidate should require:

- `npm test` green;
- `npm run verify` green with isolated corpus enabled;
- browser regression green;
- data audit green;
- guildless/join integration green;
- restart and migration tests green;
- no critical security findings;
- artifact retention within its configured disk budget;
- roadmap generated docs current;
- release notes identifying experimental and non-production surfaces.

## Bottom line

The first remediation checkpoint has made the new character lifecycle, durable world/economy/equipment mutations, stored sessions, content-free public health, bounded public resources, shared browser response policy, tab-scoped browser credentials, structural command metadata, a tagged persistent-state codec, bounded complete-run retention, and GM role boundaries materially safer. The best next investment is still not another isolated guild ability. It is to extend capability guards and JSON codecs, formalize wire-protocol contracts, design locked shared-history compaction, close remaining browser-rendering/inline-script gaps, and give experiments a common evidence model. Once those foundations are in place, the existing roadmap’s deeper guild/world fidelity work can proceed without multiplying regressions.
