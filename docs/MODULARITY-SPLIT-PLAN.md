# Modularity split plan — the over-long files

**Status:** investigation done (read-only seam map + coverage), one safe demo split executed. See §5 for what changed.
**Lens:** reduce the largest single-file maintenance burden by extracting clean, test-covered seams — not a rewrite.

## 0. Repo-state caveat (read before acting)

There is **no clean committed baseline**: `git status` shows ~90 modified + ~30 untracked files, and all 12 target files carry working-tree edits. So "in flux" must be read from file mtime + the plan docs, not git. The strongest parallel-edit signal is `.hermes/plans/sweep-split.md` (a SweepAgent refactor of `scripts/race-guild-sweep.mjs`), which imposes a benchmark freeze "covering `scripts/lib/script-gen.mjs`, `data/guild-scripts.js`, `server/`, `data/`." Treat `data/guild-scripts.js`, `server/combat.js`, `server/player.js`, `server/commands/*`, `server/game.js` as the **contested zone** — avoid splitting these first. `data/skills.js` (oldest mtime, not in the freeze) was the safest first target.

## 1. The twelve longest files (server + data + client)

| File | Lines | Contents (natural seams) | Split risk |
|---|---|---|---|
| `data/world.js` | 1669 | `ZONES`; one giant `ROOMS` literal (27–1665); `roomById`. ~770 lines (896–1665) are pure `dens_*`/`trav_*` connector filler, no spawns | **Med** |
| `server/combat.js` | 1587 | `Combat` class 100–1579 method-delimited (player attacks 191–403, creature 404–550, abilities 975–1096, maneuvers 1116–1204, `tick` 1302–1513); helpers `weaponRT`/`weaponReach`/`vitalityLabel`/`pruneCorpses` | **High** (contested) |
| `server/commands/magic.js` | 975 | command handlers (`doEnchant` 22–553, cambrinth/glyph/moon/ritual/commune/sacrifice/technique/familiar); `commands` registry 58 | **High** (contested) |
| `server/player.js` | 953 | domain model: name/stats/say 15–113, `createCharacter` 150, `loadPlayer` 196, `savePlayer` 427, burden 364–426, skill/exp pools 470–688, items/equipment 777–934, stance/TDP 935–951 | **High** (contested, biggest fan-out ~33 tests) |
| `public/js/status.js` | 885 | client render fns (`renderRoomPanel` 16, `renderHericons` 170, `renderHands` 274, `parsePrompt` 388, `renderStatusStrip` 462, `renderTargets` 714…) | **Med** (browser-only, no unit test) |
| `data/guild-scripts.js` | 748 | per-guild sim script data `GUILD_SCRIPTS`, `RACE_MATRIX`, `VARIANTS` | **Med-high** (under sweep freeze) |
| `server/commands/world.js` | 660 | world/quest/social/shop command handlers | **Med-high** (contested) |
| `data/guilds.js` | 638 | `GUILDS` + lookups + `spellsFor` + big `spellById` 241–496, then a **clean pure block** 497–638 (`circleRequirements*`, spell-tier/slot helpers) | **Med** (contested zone) |
| `server/commands/combat.js` | 635 | combat verb handlers (khri/ambush/hide/retreat/flee/advance + maneuvers + barbarian tech) | **High** (contested) |
| `public/js/script-engine.js` | 614 | DR-script interpreter: `parseScript` + `createRunner` only; single class/state, no sub-seam | **Low-med** |
| `data/skills.js` | 585 | `CATEGORIES`/`SKILLS` catalog 9–452 + derived (`skillList`/`skillById`) + **pure stat/rank math** 459–585 | **Low** ← demo done |
| `server/game.js` | 569 | `Game` facade — already delegates to economy/wilds/quests/status/justice; "split" largely already done | **Med, low value** |

## 2. Test coverage guardrails (measured)

- `server/player.js` → ~33 test files; `data/guilds.js` → 11; `data/world.js` → 9; `data/skills.js` → 8; `server/game.js` → 6; `server/combat.js` → 2 (via helpers); `commands/magic.js` → 1; `guild-scripts.js` → 1; `commands/world.js`/`commands/combat.js`/`script-engine.js`/`status.js` → direct-file coverage 0 (covered indirectly by CDP / wire tests).

Rule of thumb: a split is only "safe" if (a) the moved code is pure or self-contained, (b) it is **not** in the contested freeze zone, and (c) at least one existing test exercises the same names from the original module. That is why `data/skills.js` was chosen for the demo.

## 3. Recommended execution order (risk-gated)

1. **✅ Done — `data/skills.js` → `data/skill-math.js`.** Move the pure stat/rank/exp helpers (`expToNextRank`, `pulseGroupFor`, `mentalStatBonus`, `totalRanks`, `mindstate`, `skillTier`) + their module-local consts (`PULSE_GROUPS`, `MINDSTATES`, `TIERS`) into `data/skill-math.js`; `data/skills.js` re-exports them so every caller is unchanged. See §5.
2. **`data/guilds.js` → `data/guild-circle-math.js`** (same recipe as #1): extract the pure circle/spell block 497–638, re-export from `guilds.js`. Pure, but in the contested zone — do once the sweep freeze lifts. Guarded by `circle-1130`, `guild-join`, `spell-slots`, `character`, `magic` tests.
3. **`data/world.js` filler extraction** (highest value of the data files): move the ~770-line connector tail (896–1665) into `data/world-streets.js` as `STREET_ROOMS` and build `ROOMS = { ...base, ...STREET_ROOMS }`. Verified: the tail is contiguous, zero `spawns:`, cross-references preserved by merge, and the merge order equals current insertion order. Guarded by world/grid/map-facts/rh-wilds/economy tests. Medium risk mainly because it's a large mechanical cut.
4. **Defer the contested engine files** (`combat.js`, `player.js`, `commands/{combat,magic,world}.js`, `guild-scripts.js`) until the parallel sweep split and benchmark freeze settle. When done, prefer *method-group extraction to sibling modules re-imported by the same class* (e.g. a `server/combat-maneuvers.js` for `combat.js:1116-1204`), keeping the exported surface identical.
5. **`public/js/status.js`**: if a client split is wanted, break render helpers into ES modules loaded in `index.html` script order before `status.js`, and add a unit test — currently it has none, so any refactor is unguarded.

## 4. Anti-goals

- Do **not** chase the two "0 direct coverage + contested" files (`commands/world.js`, `commands/combat.js`) for a first split.
- Do **not** restructure `world.js` room defs by zone while a parallel session may regenerate/densify the map.
- Do **not** change public export names during a split; re-export from the original module so call sites (and `npm test`) are untouched. Behavior preservation is proven by the suite, not by refactor confidence.

## 5. Executed demo split (this task)

**`data/skills.js` → `data/skill-math.js`** — moved, verbatim:
- `expToNextRank`, `PULSE_GROUPS`, `pulseGroupFor`(+ `PULSE_GROUP_OF`), `mentalStatBonus`, `totalRanks`, `MINDSTATES`, `mindstate`, `TIERS`, `skillTier`.
`data/skills.js` keeps `CATEGORIES`, `SKILLS`, `skillList`, `skillById` and now ends with:
```js
export { expToNextRank, PULSE_GROUPS, pulseGroupFor, mentalStatBonus, totalRanks, mindstate, skillTier } from './skill-math.js';
```
(`PULSE_GROUPS` is exported too because `test/exp-groups.test.mjs` reads it via `data/skills.js`; `MINDSTATES`/`TIERS` stay module-local in `skill-math.js`.)
Result: `data/skills.js` shrinks 585 → ~460 lines (data only); `data/skill-math.js` is the pure-mechanics seam. Verified: `node --check` both; all 10 original names still importable from `data/skills.js`; full suite green.
