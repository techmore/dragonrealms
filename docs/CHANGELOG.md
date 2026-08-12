# Dragon Realms — Changelog

All notable changes, newest first. Generated from the project history.

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
