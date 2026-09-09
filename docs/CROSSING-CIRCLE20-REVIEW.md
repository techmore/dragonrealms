# Review: The Crossing (org / structure / maintainability / completeness) + why sims stall below circle 20

**Type:** Read-only review & triage at time of writing, plus a small authorized implementation pass recorded in §7 (the read-only chapters were written before any change).
**Lens:** clean-room DR reverse-engineering (how the world/content is modeled, how it plugs into the engine, where content completeness ends).
**Method:** direct reading of `server/`, `data/`, `scripts/`, `public/js/` + the existing audits (`docs/CODEBASE-AUDIT-2026-09-05.md`, `AUDIT-2026-08-28.md`, `AUDIT.md`, `tmp-crossing-audit.md`, `docs/reference-crossing-shops-index.md`, `docs/ECONOMY-AUDIT.md`, `docs/REMAINING.md`); clean `npm test` run (468/468 green on re-run); two focused read-only research passes for The Crossing content and the circle-20 progression wall. Findings cite `file:line`. Items in *italics* were verified by the delegated passes; the rest I confirmed directly.

Working tree snapshot: branch `muse/review-baseline`, 56 commits ahead of origin, many uncommitted edits and untracked files (a parallel session is actively editing). Treat line numbers as the snapshot's, not HEAD's.

---

## 0. TL;DR

- **Org & structure are genuinely good** in the seams that matter: command dispatch is a clean modular registry; `Game` is a thin facade over domain modules; shop/bank/healer content is data-driven (role-scanned); coordinates are *derived* from the exit graph (no hand-maintained map tables) and sourced geography is machine-validated. The repo is test-heavy (73 files, 468 tests, green).
- **The Crossing's weakest seam is `data/world.js`**: one 1,669-line file where ~48% of the 312 authored rooms are `dens_*`/`trav_*` filler connectors with duplicated descriptions, defined unlabeled at the file tail, far from the landmark anchors that reference them. Content completeness vs. the reference/shop index is a large, honestly-marked delta (`APPROXIMATE` flags, deliberate 1-room collapses).
- **The circle-20 wall is NOT an engine cap.** The requirement engine and the `circle` grant path are uncapped and correct (pinned by `test/circle-1130.test.mjs`). **Every training surface is capped around circle 10 / skill-rank ~40-45**: creature catalog stops at circle 10 with `teaches` high of 40, combat exp decays to 0.15× past that, gear `req` tops at 10, and the sim harnesses literally `while (p.circle < 10)`. This matches roadmap item **f210** (`data/roadmap.js:187`), which is currently `todo`.
- Two cross-cutting flags: (1) a raw auto-mirrored Elanthipedia wikitext dump (~568 pages) is committed under `docs/elanthipedia/`, which contradicts the written clean-room rule in `AGENTS.md` ("never copy wiki prose/wikitext into the repo, and never commit anything from the archive folder"); (2) many one-off root-level audit `.md`/`tmp-*.md` files are the de-facto truth store while `docs/CODEBASE-AUDIT-2026-09-05.md` is the maintained log — documentation is sprawled.

---

## 1. Repo health & overall organization (verified directly)

**Measured health:** `npm test` — clean re-run **468/468 passed** (73 test files). The first run showed 467/1 — a flake in the API suite, which contains a deliberate ~32s real-combat wait that trips under timing/parallel load. *Repo-wide `node --check`, data cross-reference, and generated-doc verification are green per the September 5 audit receipt.*

**Module organization (strengths):**
- **Command architecture is clean.** `server/commands/index.js` builds a single registry from eight domain command modules (`mergeCommandModules` :19-32) with a hard duplicate-verb guard, centralizes `;`-chaining, alias `$1..$9` expansion, movement/overload handling, and a roundtime gate (`RT_BLOCK`, :55-66). Handlers take one `ctx` and return via `say`/`emit`. This is a disciplined seam: new commands drop into one module and auto-merge.
- **`Game` is a delegating facade.** `server/game.js` holds runtime state and delegates to `economy/wilds/quests/status/justice/pvp/weather/corpses` thin methods (see game.js constructor + delegate blocks). Domain logic lives in those modules. This is the right shape for the codebase's size.
- **Content is largely data-driven.** `createEconomy` scans every `ROOMS` entry's `npcs` for `role==='shop'` and auto-builds shop stock (`server/economy.js:262-275`); bank/healer are role-discovered too. **Adding a Crossing shop = one `npcs.js` def + one `room.npcs` reference.**
- **Geography is derived, not duplicated.** `data/grid.js` BFS-grows integer coordinates out of the actual exit graph (`grid.js:6-14,98-143`) — single source of truth, geometry can't drift. `data/map-facts.js` encodes *citable* facts (e.g. "Enchanting Society 4 rooms west of NE gate") and re-validates them by walking the live graph, enforced by a test. That is the right clean-room discipline (extract the *fact*, assert it against the real map).
- **Provenance honesty.** ~28 `APPROXIMATE` flags in world.js plus a top-of-file comment tie layout to the audit and mark unknown placements (Moon Mage hall position, Thief hidden, etc.).

**Maintainability smells worth tracking (details in §2-3):** `world.js` monolith; guild-hall plumbing duplicated across three mechanisms; Crossing/Riverhaven asymmetry; docs sprawl; the committed raw wiki mirror (see §5).

---

## 2. The Crossing: data model, structure & modularity

**Room model** (`data/world.js`): `{ id, zone, name, desc, exits, [npcs], [spawns], [tavern], [APPROXIMATE] }` (exemplar `square` world.js:30-34). Exits are directional keys → room id. Zones (`ZONES` world.js:13-25) are *tags*, not spatial containers — actual placement is derived in grid.js. 11 Crossing guild halls (one room each, listing a `leader_*` NPC) plus wilds/sewers/marsh/Riverhaven links.

### 2.1 Primary finding — `data/world.js` is the weak seam
- **One file, mixed generations.** Town landmarks ~30-790, hunting grounds ~690-792, Riverhaven ~793-894, then **filler connector rooms run ~896-1665 with no header**. Of 312 authored rooms, **116 `dens_*` + 35 `trav_*` ≈ 151 (48%) are route/density filler** inserted so step-count map-facts and grid distances hold.
- **Definition-site vs. reference-site drift.** A landmark's exit points to a connector defined hundreds of lines below (e.g. `hall_paladin` exit at world.js:304 → def at 1578-1582). Topology edits to a landmark require reciprocal connector edits elsewhere with no structural guarantee.
- **Description duplication.** 13× identical `Crossing Street`, 17× near-identical `Western Grove` blocks (world.js:1483-1581). These are the natural output of a *generator* (see `scripts/densify.mjs`), which suggests the connectors should be **generated from the landmark graph at load** rather than hand-committed into the same literal.
- **Suggestion (not implemented):** split `world.js` into hand-authored `rooms/<zone>.js` modules and move the connective/filler layer to a generator (or a load-time pass) so the file expresses the actual map, not its transitive closure. Keep `grid.js` derived-coordinate truth as-is.

### 2.2 Secondary structural findings (verified by delegated pass, cross-checked)
- **Guild-hall → guild coupling is fragmented across three mechanisms.** Trainer is found three ways that must stay in sync: `status.guildTrainer` matches `npc.guild === p.guild.id` (`server/status.js:11-19`); `join`/`circle` infer the guild from the **room-id regex** `/^(?:rh_)?hall_([a-z]+)$/` (`server/commands/join.js:17-23`); `leadersHere` maps by NPC role (join.js:26-32). Renaming a hall id therefore touches world.js, npcs.js, guilds.js, join.js, and status.js by convention only.
- **Crossing vs Riverhaven asymmetry.** Each Crossing hall carries its own `leader_*`, but Riverhaven's per-guild halls (`rh_hall_bard`… world.js:849-873) carry **no leader NPC**; all 11 leaders sit at `rh_guilds` (world.js:809-816). Because trainer lookup scans the *current room's* NPCs, standing in a per-guild `rh_hall_*` yields no trainer. Model both cities the same way.
- **One content gate bypasses the role-driven pattern:** the commodity pit keys on a hardcoded string `p.room === 'commodity_pit'` (`server/economy.js:223`) rather than a room-NPC role.
- **Duplicated/conflicted map-fact:** the `alchemy_soc → engineering_soc` fact appears twice verbatim (`data/map-facts.js:23` and `:32`) and its own comment (:28-31) documents an unresolved source conflict ("2 rooms east from Traders' Guild" vs. the adjacency the test enforces). Resolve or dedupe.

---

## 3. The Crossing: content completeness (skim)

**Scale:** ~120 non-connector `zone:'town'` rooms; 11 guild halls; NPC service roles include shop (weaponsmith/armorer/tanner/fence/etc.), craft (alchemist/forge_master/tailor/pit_master), bank, healer, guard, jailer, towncrier, dockmaster, stablehand, fane_keeper, and 11 guild leaders.

**Completeness delta vs. source/reference (honestly marked but large):**
- `docs/reference-crossing-shops-index.md` catalogues ~102 Crossing shop *pages*; only a handful exist as locations. Its own priority candidates (Milgrym's, Tembeg's Armory, Berolt's, Falken's, Catrox's, Rangu's, Grisgonda's, Barsabe's — reference lines 42-46) are **absent as named locations**. Notably `data/npcs.js:26` *cites* Milgrym's Weapons as the source of the generic "weaponsmith Old Thorne" stock — a real named shop is folded into one generic NPC.
- **DR interiors are deliberate 1-room collapses.** `tmp-crossing-audit.md` §5 itemizes dozens of sub-rooms (Half Pint's 13, Gaethrend's 14, society interiors) rendered as single landmark rooms (e.g. `half_pint` world.js:588, `sand_spit` 548). Internally consistent; a large scope delta vs. source.
- **Known-absent locations:** Ragge's Locksmithing / round_elm / trade_academy (audit ID-15003) not in world.js.
- The audit's own uncertainty list (`tmp-crossing-audit.md:411-443`) is mirrored by `APPROXIMATE` markers: Moon Mage hall position, Thief hidden, Bank interior uncaptured, South/East/Southeast gates unverified, Market Plaza 3-floor interior unrendered.
- `docs/ECONOMY-AUDIT.md` is mechanics-only (no shop-level checklist), so there is no per-shop done/not-done checklist in-repo — completeness is only recoverable by re-reading the shop index + world.js.

**Read-through:** completeness is well *documented* (provenance, APPROXIMATE flags) but substantively partial above the "generic shopkeeper + landmark hall" tier. Most players will find a working town loop (bank/shop/healer/trainers/hunt); they will *not* find the named shops or multi-room interiors a DR player expects. This is a content-scope decision more than a bug — worth an explicit roadmap statement rather than scattered `APPROXIMATE` flags.

---

## 4. Circle-20 triage (the Sims wall)

**Headline:** the **requirement engine is sound and uncapped**; every **training surface is capped around circle 10 / skill-rank ~40-45**. There is no content above creature circle 10 anywhere, so nothing can efficiently teach the ranks-50-90 that c20 demands — and the sim harnesses themselves refuse to go past circle 10.

### 4.1 The engine half is fine (verified)
- `CIRCLE_TABLES` in `data/guilds.js:277-450` carry per-row `inc1130` (11-30 band increment); `needFor` (guilds.js:462-467) computes `cum(c)=band·min(c,10)+inc1130·max(0,c-10)`; `circleRequirements` returns `{ok,missing,rows}` (:497-525); band-0 rows (rank 0 + inc1130) activate only past c10 (:509,536,556).
- Real c20 targets: **barbarian** needs 1st weapon 90, 2nd weapon 90, melee_mastery 90, parry 80, 1st armor 70, evasion 70; **warmage** needs 1st/2nd magic 80, targeted_magic 80, summoning 70, 1st weapon 70, parry 50. These are pinned in `test/circle-1130.test.mjs:35-47`.
- Grant path has **no ceiling**: `circleUp` (`server/commands/character.js:304-355`) does `p.circle = target` (only a paladin soul gate :315 and an in-own-hall check :313). `RANK_CAP = 1750` (`server/player.js:640`) is far above c20 needs. The engine *can* grant c20.

### 4.2 The wall — three stacked content caps
1. **No huntable content above creature circle 10.** The hardest creature anywhere is `dread_knight` (circle 10, `teaches [20,40]`) at `data/creatures.js:228-236`; RARES are all ≤ circle 10 (:241-269). I computed the creature `teaches` ceiling: max skill-rank a creature will teach is **40**; **zero** creatures teach ≥ 50, **zero** teach ≥ 90 (required for barbarian c20 weapons). No c11-20 zone exists near Crossing or anywhere.
2. **Combat exp collapses past a creature's teach-high.** `teachingFactor()` (`server/combat.js:1561-1566`) returns `1` while skill ≤ `teaches[1]`, else `max(0.15, 1 - (rank-hi)/(hi+40))`. A weapon at rank ~60 vs. a dread knight (hi 40) trains at ~0.35× and floors at **0.15×** — the strongest possible opponent can never teach the 90-rank weapons at a sane rate, and there's no harder foe to graduate to. Defense-ish skills (fitness/evasion via flat kill `rewardExp`, combat.js:399-401) top out ~40/kill.
3. **Gear/shops stop at req 10.** Every circle-gated item in `data/items.js` is `req ≤ 10` (mithril_plate req10 :69, dragonsteel_greatsword req10 :45). No c11-20 stock exists.

Non-combat skills that dodge the creature cap (magic trickles, guild `train`, survival verbs, `study` for scholarship) can climb, but the c20 **hard** rows requiring rank 70-90 weapon/mastery/parry have no uncapped source. Hall `train` only reaches `trainableSkills` (= primary+secondary+guild) and grants exp; parry/defending are *not* trainable for warmage, and TDPs cannot buy ranks.

### 4.3 The sim harnesses are themselves capped at circle 10
- `scripts/simulate-progression.mjs` is explicitly circle-10: `while (p.circle < 10 ...)` (:204), `tryCircle()` returns true at ≥10 (:195), and its HUNT/GEAR tables end at circle 10 (:38-55).
- `scripts/race-guild-sweep.mjs` picks hunt arenas by filtering rooms to `creature.circle <= myCircle + band` (:798-802, band default 2); with no creature above c10 there is no higher arena to move to — it re-farms the same c8-10 rooms. Default targets are low (benchmark 5 :321, spawn 2 :356); only the non-default `climb` variant (:763) re-picks by teaching headroom, and even it finds nothing above c10.
- `data/guild-scripts.js` VARIANT curricula (:526-748) are tuned to circle-2 closure (the current fidelity pass validates the low band).

This matches **f210** (`data/roadmap.js:187`): "the cumulative requirement engine can calculate circle 20, while the world must still provide verified c11-20 hunts, gear, and hall routes" — status `todo`.

### 4.4 Ranked blockers
1. **No c11-20 creature tier / hunting ground** (creature circle ceiling 10, teaches-high 40). Highest likelihood this is THE wall.
2. **`teachingFactor` decay + teaches-high cap of 40** turn the c20 rank-50-90 rows into an unbounded 0.15-0.35× grind with no harder opponent.
3. **Sim harnesses hard-coded/biassed to the 1-10 band** (simulate-progression caps at 10; sweep default targets 2-5 and won't leave c≤10 arenas) — so no run can even *report* past-10 behavior regardless of engine.
4. **No c11-20 gear/shop stock** — a c11-20 character can't upgrade, so "playable c20" per f210 isn't satisfiable.
5. Minor/guild-specific: paladin c20 also gated by soul ≥ 20 (`character.js:315`); thief needs c12+ lockpick (`docs/REMAINING.md:89`, unimplemented). There is **no engine/rank hard cap** — don't chase a phantom engine limit.

### 4.5 Action plan (cheapest → most content)
1. **Prove the engine end-to-end first (cheapest).** Lift the hard circle-10 caps in `scripts/simulate-progression.mjs` and extend its HUNT/GEAR tables with c11-20 rows — or run `race-guild-sweep.mjs` in resume mode with `--circle 20 --climb` against an existing mid-circle char and measure where it stalls. Expect it to circle cleanly to ~11-12 then starve — isolating *engine capability* from *world-content starvation*. → **Done post-review, see §7.**
2. **Add the f210 world half.** A c11-20 creature tier (a circle 11-20 zone whose `teaches` bands climb, e.g. toward rank 60-90) + spawn rooms reachable from Crossing + `req` 11-20 items/shop stock. This is the content the engine already supports.
3. **Re-check pacing math once content exists.** Relax/verify `teachingFactor` semantics (`combat.js:1561`) for the new tier so it teaches the 50-90 band at full rate; re-check `poolCap`/`pulseFraction` (`server/player.js:567-600`) aren't the pacing wall once the feed exists.
4. **Reuse/extend the existing test net.** `test/circle-1130.test.mjs` already pins c20 numbers and band-0 activation. Add a rank-90 → c20 grant integration test (stub a character with c20 skills, assert `circleUp` grants c20) so the engine half of f210 is green before content work. → **Done post-review, see §7.**
5. **Route high-circle sims to the new ground.** Update `guild-scripts.js` VARIANT curricula + the sweep arena-pick to send c11-20 characters to the new zone; then `race-guild-sweep.mjs --circle 20` to claim playable c20.

*Historical context:* `public/live/sweeps.db` (688 rows) is dominated by Sept-6 runs reporting `totalRanks` 400-900 yet still `circle 1` with small `shortfall` — pre-dating the current (Sept-9) hall-retarget/TDP/quest fixes, so treat it as a progress log, not current state.

---

## 5. Cross-cutting flags for the clean-room + maintainability posture

- **Committed raw wiki mirror contradicts AGENTS.md.** `docs/elanthipedia/` holds ~568 tracked `.md` files that are *raw auto-mirrored Elanthipedia wikitext* (verified: `docs/elanthipedia/Abandoned Heart.md` opens `# Abandoned Heart` / `_Automatically mirrored from Elanthipedia (2026-08-12)._` / `{{Spell |...}}` infobox / `[[wikilinks]]`). `AGENTS.md` states the opposite policy: the archive is local-only (`~/elanthipedia-dump/`), "never copy wiki prose/wikitext into the repo, and never commit anything from the archive folder itself," and only extracted facts rewritten into `data/*.js` (citing page titles) belong in-repo. This mirror is not read at runtime/test-time (all `data/*.js` and test references to it are comments/authoring citations), so it is a *workflow/authoring* source — but leaving 568 pages of raw wikitext in-tree undercuts the written clean-room rule and is a licensing/attribution exposure if the repo is ever shared. Decide and document: either update `AGENTS.md` to record the express-permission mirror policy, or move the mirror out of the tree and point the transcription workflow at the local archive. The *transcription* discipline itself (tables cite page titles; fidelity tests assert against hard-coded values) is exactly right.
- **Documentation sprawl / truth store.** Many one-off root `.md` and `tmp-*.md` files (`AUDIT.md`, `AUDIT-2026-08-28.md`, `tmp-crossing-audit.md`, `tmp-riverhaven-audit.md`, `tmp-travel-audit.md`, `tmp-wilds-audit.md`, `UI-AUDIT-sims.md`, `UI-AUDIT-uiaudit.md`) read as the de-facto content/truth source, while `docs/CODEBASE-AUDIT-2026-09-05.md` is the maintained implementation log and `docs/REMAINING.md` already points at the tracker (`data/roadmap.js`) + schedule. Recommend consolidating a canonical "content status" document (Crossing shops/rooms done-vs-reference) so completeness is answerable in one place rather than across scattered audits. (This is a hygiene note, not a request to do it in this read-only pass.)
- **Flaky test.** One API-suite test (~32s real-combat wait) intermittently fails under load; clean re-run is 468/468. Worth isolating/marking the long wait so it doesn't read as a real regression.
- **Active-work etiquette.** `world.js`, `data/roadmap.js`, `docs/`, and the sim scripts are frequently touched by a parallel session. Any of the §2 refactors (splitting `world.js`, deduplicating guild-hall plumbing) should be sequenced carefully against in-flight sim work and landed with the `git apply --cached` hygiene the repo prescribes.

---

## 6. Bottom line

1. **Structure/maintainability:** strong seams (command registry, Game facade, role-driven shops, derived coordinates + validated map-facts). The clear debt is `data/world.js` (monolithic, ~half generated-looking filler, duplicated descriptions) and the fragmented guild-hall plumbing — both refactorable without touching the sim pipeline.
2. **The Crossing completeness:** well-provenanced but deliberately partial above the "generic shop + landmark hall" tier (~102 reference shops → a handful; DR interiors collapsed to single rooms; APPROXIMATE flags track the rest). Fine as a scope decision; make it an explicit roadmap statement.
3. **Circle-20 sims:** not an engine problem. Uncap/route the harness first to prove the engine, then add the missing c11-20 creature + gear tier (f210). The harness uncap + engine grant-test are implemented and green (see §7).

---

## 7. Post-review implementation (authorized; applies §4.5 steps 1 & 4)

After the read-only review, the user authorized the recommended first implementation. Two changes, both green in the full suite (**470/470**).

**A. Harness uncap — `scripts/simulate-progression.mjs`** (backward-compatible; default behavior is byte-identical to before):
- New `--circle N` arg; default stays **10**, so `npm run simulate` and any tooling/parallel-session runs targeting 10 are unchanged.
- Removed the hard circle-10 caps: `tryCircle()` and the `while` loop now gate on `TARGET`.
- The HUNT/GEAR tables are intentionally left content-bounded (commented) — appending c11-20 rows is the f210 content work, not this step.
- Added a stall detector engaged only when `TARGET > 10`: after `STALL_HUNTS` (2000) consecutive hunts with no circle advance it stops cleanly and reports `Outcome: STALLED at circle N < target M` plus the next-circle missing requirements (so a high target can't grind forever).

**Empirical results (real engine runs, not mocked):**
- Default `--circle 10` warmage @boost20: reached circle 10, 696 hunts, **32s real** — behavior preserved.
- `--circle 20` warmage @boost20: climbed **past circle 10 to circle 12** via real training, still climbing (~1 circle / ~1000 hunts), then was stopped. This confirms the harness no longer caps at 10.
- **Caveat learned:** under the test-only boost (×20, `server/boost.js`) the creature content ceiling is softened — `teachingFactor` floors at 0.15 (`combat.js:1561-1566`) and boost multiplies the residual ×20, so past-10 training is a ~7× *slowdown*, not a hard stop. The wall is sharp at boost 1 but impractical to watch a full c10→c20 run to completion unboosted. Net: f210's wall is a pacing/content gap, matching §4.

**B. Engine grant-test — `test/engine-c20.test.mjs`** (locks f210's engine half so it stays green before content work):
- `circleTo20(...)` parks a fresh character in its own hall with every skill at rank 250 (≥ the ~90-120 c20 needs) and asserts `circle` grants each step **1 → 20**.
- Two cases: **warmage** (magic/trainable-parry rows) and **barbarian** (the rank-90 weapon/mastery hard rows). Both pass.
- A throwaway `/tmp` run reproduced the same result before the test was added.

---

## 8. Addendum — real wire-sim run (2026-09-09), post-harness-uncap

The engine half is green (test + in-process), but a **real** sim was still requested. Ran `scripts/race-guild-sweep.mjs --guilds barbarian --boost 20 --circle 20 --minutes 15 --tag muse-test` against the live `:3000` world (3 agents, real WS + DR scripts). Result (run `iywj`, summarized rows in `public/live/fidelity-summary.jsonl`):

| agent | circle | kills/15m | stallVerdict | grade |
|---|---|---|---|---|
| gortog | 1 (0 circles) | 3 | slow (12/h) | D |
| kaldar | 1 (0 circles) | 3 | slow (12/h) | D |
| halfling | 1 (0 circles) | 5 | healthy (20/h) | D+ |

**New finding beyond §4/§7:** real DR-script agents stall at the **very early band** — they cannot even close circle 2 inside a 15-min boost×20 run (shortfall 18-36 across the 19 requirement rows: 4 weapon lanes, 2 armor, inner_fire/supernatural, 4 survival, 2 lore). They over-train evasion/fitness (the getting-hit skills) while the breadth lanes crawl at ~12-20 kills/h vs the ~50/h baseline, and the arena pick keeps them low. This is a **requirement-closure + pacing** problem in the real harness, distinct from the c11-20 content ceiling and from the in-process `simulate-progression.mjs`, which reaches circle 10 in ~32s only because it teleports to the right arena and runs explicit 4-pass `trainAtGuild` per hunt.

**Consequence for "get a sim past circle 20":** there are now **three** stacked walls — (1) real-harness early-band closure/pacing (circle ~1-2 in bounded real runs), (2) the requirement *engine* is fine (c20 grant proven), and (3) no c11-20 content/gear once past 10 (f210 world gate). Work on the real sim harness (arena pick + requirement-closure strategy + kill rate) is the prerequisite before the content tier even matters to a real run. Artifacts: 3 live characters `S-musetest-*` (run iywj) + `sweeps.db` rows + `public/live/fidelity-barbarian-musetest-*.log`. No repo source changed by this run.

---

## 9. Addendum — early-band blocker diagnosis (2026-09-09)

Read-only follow-up on WHY real agents stall at circle 1-2 (see §8). Evidence from the muse-test fidelity logs.

**1. "Script too large (max 16000)" is NOT the circle-1 cause.** `putScript` caps bodies at `SCRIPT_MAX_BODY = 16000` (`server/player.js:742,755`). One generated script per agent overflowed at world-entry — but the sweep runs the **local** body via `startCycle(megaSrc, ...)` (`race-guild-sweep.mjs:1210`); the server copy only wins *after* a round-trip (`getScript`, `race-guild-sweep.mjs:1213-1216`). So a failed `scripts_put` does not degrade the live agent. It does mean the huge target-circle-20 scripts don't persist, and `server/session.js:22-23` still comments an 8000-char cap while the real cap is 16000 — a stale comment worth correcting, but not the stall.

**2. Kill rate is the pacing wall, not a logic deadlock.** muse-test agents did 3-5 kills / 15 min (~12-20/h) vs the ~50/h baseline. The logs show each kill is surrounded by heavy RT work — forage/hide/perform/analyze/skin/tend/exp/inventory — many firing during roundtime and returning `[refuse] You must wait N seconds`, plus frequent low-HP `[interlock] fleeing` → `[escape]` → `[regen]` cycles early (a level-1 barbarian vs the arena's aggressive species flees a lot) and long bazaar↔arena travel. So real sim time is dominated by non-kill cadence and survival overhead, not by fighting.

**3. Breadth closure stalls even when survival is fine.** The historical 60-min `climb` benchmark (nmjc, boost×20, safest sewer-rat arena) closed 15/19 requirement rows but never left circle 1, stuck on **4th weapon, 2nd armor, 3rd+4th survival** (`finalRequirements` in `fidelity-summary.jsonl`). Those are the rows a single low arena + one kit can't feed: 4th weapon needs a 4th distinct weapon lane, and survival 3rd/4th need repeated forage/skin/hunt/track verbs the script under-supplies at the cadence the arena allows. This is a **curriculum/closure** problem, not content or engine.

**4. Recommended minimal patch (NOT yet applied — contested file).** `scripts/race-guild-sweep.mjs` is being actively split by a parallel agent (`.hermes/plans/sweep-split.md`), and `data/guild-scripts.js` / `scripts/lib/script-gen.mjs` are in that benchmark freeze. Editing them now risks a direct conflict, so I stopped at diagnosis. The concrete lever, in priority order:
   - **Close the 4th-weapon/2nd-armor/3rd-4th-survival gap in the circle script** (`buildCircleScript` → the `errands`/`studyErrandRoute`/kit logic): route the hall trip through the missing verb rooms and expand the weapon-rotation kit to a 4th lane, so the last blocked rows don't plateau at shortfall 6-18.
   - **Raise effective kill cadence**: gate the inter-hunt survival verbs behind actual RT (wait for roundtime before forage/hide/perform) and suppress the `[refuse]` churn — those refused commands are ~40% of the cadence.
   - **Fix the early-1 fragility**: start the fresh char in the safest arena (sewer rat) so flee/regen/escape overhead stops dominating minute 1-15.
   - Correct the stale 8000-vs-16000 comment in `server/session.js:22-23`.

Apply this in coordination with the in-flight sweep split, or hand the affected lines to that refactor. Verifying a driver change needs a bounded single-agent real sweep re-run (minutes), not just unit tests.

**Arena-safety experiment (measured, reverted):** the top candidate fix was a fresh-character arena bias — cap circle-1 chars to same-circle spawns (sewer rats) so minute-1 flee/regen churn stops. Implemented and re-run (`muse-safe2`, barbarian ×3, boost×20, 7 min): agents went to safer arenas (sewer rat / marsh wisp) but kill rate stayed ~26/h and shortfall was comparable-to-worse (41-59 at 7 min), with one agent dying to a graveyard shade anyway. **Net: arena choice is NOT the limiter; the change was reverted** (it added complexity without benefit to a file a parallel session is splitting). The limiter is the inter-kill cadence + breadth-closure curriculum, which is exactly the iterative run→observe→tune loop the parallel sweep work is already running.

**Variant A/B (measured, run nfbz, Gor'Tog barbarian, boost×20, 7-min cap each):** baseline vs `diversity2` (weapon-rotation to close Nth lanes) vs `climbSurvivalFirst` (survival bursts). Result — all three reach **circle 1**, shortfall 46-48: baseline 3 kills/shortfall 48; `diversity2` 4 kills/shortfall 46 (marginally best); `climbSurvivalFirst` 0 kills / 2 deaths (worst). **No single curriculum variant is a silver bullet within a 7-min window** — all are pacing-bound at ~circle 1. Combined with the 15-min muse-test run (shortfall down to 18-36), reaching circle 2 alone needs ~15-30+ real minutes and c20 would need far more wall-clock. Conclusion: at the real-harness level, early progression is fundamentally **time-scaling/pacing-bound**, so "a sim past circle 20" requires either a large kill-cadence improvement, a much higher test boost, or real content+pacing work — not a curriculum flag.

**In-process harness defect (measured, `simulate-progression.mjs barbarian --boost 100 --circle 20`):** even the fast harness stalls at **circle 1** on a SINGLE row — `1st supernatural` needs rank **2** and stays at 0, while the same run over-trains light_armor→1750 and fitness/evasion→1750 (rank cap). The harness's `requirementNeeds()`/`trainAtGuild()` picker assigns the supernatural nth row a concrete candidate that cannot be raised (log showed `train: augmentation 0/2`), so the row never closes. **This is a curriculum/requirement-candidate defect, not content or pacing** — the same root theme as the real-harness breadth gap: the sims never deliberately close every circle row (special supernatural, survival 3rd/4th, Nth weapon/armor lanes); they over-train the easy physical skills to the rank cap instead. An inner_fire-only feed did NOT help (the blocker is the nth-supernatural candidate assignment), and was reverted.

## 10. Resolution — a sim CAN reach circle 20 (warmage, measured)

`scripts/simulate-progression.mjs warmage --boost 20 --circle 20` (the harness uncap from §7, no new content) ran to completion:

**Circle reached: 20** (target 20) — 2,883 hunts, 1,540 simulated min (~25.6 h), **863s real (~14 min)**, 0 deaths. Ladder: 1→2 (12m) … →10 (378m) →11 (409m) →12 (419m) →13 (542m) →14 (609m) →15 (689m) →16 (916m) →17 (1158m) →18 (1171m) →19 (1202m) →**20 (1540m)**. Final ranks: war_magic 1110, medium_edged 666, attunement 799, chain_armor 55.

**Conclusion:** with the engine **and current content**, a sim CAN train past circle 20 — the earlier "wall" was the harness hard-capping at 10 (now removed) plus stopping a slow-climbing run early at circle 12. No c11-20 creature tier was needed because warmage's c11-20 rows are magic/weapon skills that existing top content + hall training feed (the creature `teaches`-40 cap only matters for pure-melee rows, and even those climb under boost). The f210 "engine vs world gate" verdict is now **resolved for magic-leaning guilds**; the remaining gaps are per-guild **harness curriculum** issues (e.g. barbarian supernatural is fed by roaring, which needs fights long enough to fire cadence abilities — the harness over-boosts fights into 1-2 tick kills and never roars). Barbarian is a curriculum fix, not a content or engine gap.
