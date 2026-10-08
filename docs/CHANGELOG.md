# Dragon Realms — Changelog

All notable changes, newest first. Generated from the project history.

## 2026-10-08

- Added passive equipment inspection and Inventory/Equipment tabs, with condition,
  quality, armor contributions and repair quotes from shared production policy.
- Expanded authored item-field validation and started a dated October 8 receipt.

## 2026-10-07

- Added passive skill/stat training plans and Requirements/Training tabs in
  Progress; shared lesson pricing keeps plans aligned with purchases.
- Strengthened command audits with metadata schema and passive panel contracts.

- Corrected circle spell grants to charge new spells once and preserve prior
  holdings; aligned spell lists and loaded rosters with casting rules.
- Added passive Spellbook search and actual aggregate counts to verification receipts.

- Added passive spellbook planning and keyboard-accessible Spells/Spellbook/Slots
  tabs, with explicit circle, slot and soft mastery guidance.
- Extended content validation to spell curricula and sampled magic rules.

- Added passive work-order inspection, eligible-station routing and a Crafting
  dock with Recipes/Work order tabs.
- Extended content checks across all four crafting recipe catalogs, techniques,
  quality levels and sampled slot rules.

- Added quest destination routing, passive recipe planning, source-aware script
  diagnostics and opt-in machine-readable verification receipts.

- Added passive walking routes and explicit room search with reusable room IDs.
- Improved connection recovery with an accurate retry countdown and Retry now
  control; command drafts survive disconnects.
- Added a read-only command contract audit to standard verification.

- Unified quest objectives for wire snapshots, NPC reminders, Journal and quest
  inspection. Preserved active tasks, corrected harvest counts and kept unknown
  legacy totals explicit. Rewards now require explicit `claim`.
- Enhanced the live Journal with accessible progress, passive inspection,
  spectator snapshots, stale-state guards and destination information.
- Added `where` for hunting grounds, NPC services, guilds and item sellers.
- Added lexical module auditing to standard verification and an
  [architecture map](ARCHITECTURE.md). See [the continuation receipt](PROJECT-EXPANSION-2026-10-07.md).

## 2026-10-06

- Continued the expansion with contextual server help, a Progress dock,
  Paladin-aware next-step guidance, a passive quest journal and automatic active
  project-reference checks in the standard verification command.
- Corrected corpse-search routing, added explicit local `find` search, and
  directed Riverhaven progression to the shared guild row. The command catalog
  now contains 101 entries.
- Added `progress [all]`: next-circle requirements, rank gaps, concrete practice
  choices, guild lesson costs and held EXP. Paladin soul readiness is included.
- Added the client Commands dock: 97 searchable categorized entries, alias
  lookup and command preparation with draft preservation and spectator guards.
- Refactored content auditing into a pure validator with structured JSON
  diagnostics, malformed-definition checks and explicit navigation validation.
- Added `npm run doctor`: read-only runtime, launch-configuration and database
  path preflight, with JSON output and no world database opening.
- Added [the project guide](README.md) to organize module ownership, verification,
  operations, simulation evidence and historical documentation.
- Verification details and limits are recorded in
  [the October expansion receipt](PROJECT-EXPANSION-2026-10-06.md).

## 2026-08-12

### Docs & tooling
- **Roadmap tracker is generated** — `public/ROADMAP.html` now builds from
  `data/roadmap.js` via `npm run roadmap-doc`; the circle-10 band matrix is
  pulled live from the circle engine at build time.
- **`SKILLS.md` is generated** — the markdown twin of `/SKILLS.html`, emitted
  from `data/skills.js` + `data/guilds.js` (`npm run skills-doc`).
- **Docs consistency checker** — `npm run verify-docs` validates the roadmap
  data, cross-references every ROADMAP.md row against tracker features, and
  confirms both generators are reproducible.
- Tracker deep audit: fixed 19 duplicate feature ids, replaced the stale
  circle matrix with the live band tables, corrected 27 stale statuses, added
  15 missing features (163 total: 93 done / 39 partial / 31 todo), and added
  per-feature work-log notes.
- **One-command verify** — `npm run verify` runs syntax checks + the full
  test suite + corpus capture/replay.
- Client-regression CDP suite added as a permanent script.

### Guild fidelity (v1s for all 11 guilds)
- Barbarian: inner fire, berserks/forms/meditations/roars, whirlwind, war
  stomp, choke, dual load, masteries, ANALYZE combos.
- Thief: khri (Elusion, Focus, Strike, Nimbleness, Dampen).
- Warrior Mage: familiars that fight alongside.
- Moon Mage: prediction omen buff.
- Empath: wound-taking (`mend`), empathic stain on living kills.
- Paladin: soul, smite, code of honor.
- Ranger: wolf companions, wind/sun beseeches.
- Necromancer: risen minions from corpses.
- Cleric: devotion rituals with holy scaling.
- Bard: enchantes (war/bravery/regen).
- Trader: commodity pits with a fluctuating board.

### Core systems
- **Exp pools & pulses** — 70% lands immediately, 30% banks in a field pool
  that pulses into ranks every 30s; mindstate ladder reads the pool; REXP
  doubles learning (2 offline minutes → 1 REXP, cap 120).
- **Authentic TDP model** — 600 starting TDPs, 50+circle (<10) / 100+circle
  (≥10) on circling, shared hidden pool (every 200 rank-points → 1 TDP),
  Fane of Training with train-twice confirm, death shaves the pool.
- **Riverhaven** — second starting city (square, market, shrine, shared guild
  hall row, ferry to the Old Woods), chargen city choice end-to-end.
- **Justice loop** — theft near guards risks arrest, Town Cells, PLEAD
  guilty/innocent, heat-scaled judge costs on release.
- **Command refactor** — the 1,500-line command monolith split into domain
  modules (`server/commands/`); chargen extracted to `server/chargen.js`;
  combat split into a fight state machine + lifecycle manager.
- **Test refactor** — the 2,320-line smoke monolith split into domain suites
  (82 tests total, all green).

### Earlier (initial build)
- Secure accounts (scrypt, lockout, sessions), 12 races, 11 guilds with
  authentic DR band circle tables, 83-skill taxonomy, 5 character slots.
- Async ticker combat: stances with stance points, maneuvers (disarm/trip/
  shield-bash), PvP duels with end conditions (blood/blow/pain), ambush from
  hiding, hunting ladder with teaching bands, death + corpse retrieval.
- Magic: 6 mana types + cycles, cambrinth, prepare/cast overchanneling, 4
  spells per guild, TARGET verb, spell-slot display.
- World: The Crossing (market, bank, temple, brewery, forge, fane, jail,
  commodity pit, guild district) + 7 hunting zones incl. the Blackwood Ruins
  dungeon and named rares.
- Crafting: alchemy (herbs → potions) and forging (ore → quality steel).
- Scripting: aliases, `;` chaining, macros, timers, triggers (client-side).
- Interface: themes, palette, font control, search, tab completion, status
  strip, clickable exits, D-pad + gamepad + haptics.
- Reference corpus: 587-page Elanthipedia mirror under `docs/elanthipedia/`
  with a search tool (`npm run`-free: `node scripts/elathip-search.mjs`).
