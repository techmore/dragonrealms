# Race/Guild Script-Driven Test Agents — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Give every race/guild combination an authentic, DR-faithful *script library* (the same DR `.script` language players use in the client) plus one orchestrating "mega script" harness, so automated characters exercise guild-specific fidelity end-to-end over the real wire protocol — and produce pass/fail fidelity reports.

**Architecture:** Extend the proven `barb-run.mjs` pattern (real account → WS session → scripts saved via `{t:'scripts_put'}` → executed by the pure engine in `public/js/script-engine.js`) into a generic, data-driven runner. Per-guild script libraries live as plain text under `scripts/dr-scripts/<guild>/`, generated/maintained by hand + a small generator. A new `scripts/race-guild-sweep.mjs` orchestrates N characters (race × guild matrix), runs each character's mega script cycle (hunt → guild arts → circle trip → report), and writes structured results to `public/live/fidelity-<guild>.log` for the admin jobs tailer.

**Tech Stack:** Node 22 ESM, zero deps (`ws` already dev-used), existing script engine, existing wire protocol. No server changes required except (optionally) small prompt/state additions noted below.

---

## Investigation summary (what exists today)

| Piece | Location | State |
|---|---|---|
| DR script language engine | `public/js/script-engine.js` | Solid: labels, goto, match/matchre/matchwait, waitfor(re), pause, nextroom, setvariable, if_<n>, iflt/ifge on %hp/%maxhp/%circle/%rt/%combat. Unit-tested (`test/scripts.test.mjs`). |
| Client runner + storage | `public/js/scripts.js` | One-at-a-time runner, per-account server sync via `scripts_put/del`. |
| Live bot over real wire | `scripts/live-sim.mjs` | Imperative JS state machine (hunt/rest/circle/TDP). Works for all guilds but is *not* script-driven and is guild-blind (same loop for bard and barbarian). |
| Script-driven run (proof) | `scripts/barb-run.mjs` | Full pattern: generated DR scripts saved to account, executed by the engine, driver supervises with flee/death/stall interlocks. **Barbarian-only** — analyze/expertise baked in. |
| Headless progression sim | `scripts/simulate-progression.mjs` | In-process, per-guild pacing to circle 10. Not wire-level. |
| Guilds | `data/guilds.js` | 11: barbarian, bard, cleric, empath, moonmage, necromancer, paladin, ranger, thief, trader, warmage. |
| Races | `data/races.js` | 12 (human…skra) — affect stats; chargen alloc differs per race. |

**Gap:** nothing exercises *guild identity* (spells/khri/arts/compositions/songs, cambrinth, stealing, forging, etc.) through the scripting layer, and no race dimension at all. The mega-script idea is exactly right: one supervisor script per guild whose sub-scripts match how a real DR player would script their hunt.

## Proposed approach

1. **Generalize the barb-run driver** into `scripts/race-guild-sweep.mjs`: same auth/WS/script-persist/engine-execution skeleton, parameterized by `--guild`, `--race`, `--char`, `--minutes`, `--circle-target`. Guild specifics move OUT of the driver INTO the script library (the driver only knows: run `<guild>.mega`, supervise safety, parse results).
2. **Per-guild script libraries** at `scripts/dr-scripts/<guild>/*.dr`:
   - `hunt.dr` — travel to arena, scan, fight using **guild-appropriate attacks** (`attack` for weapon guilds; `prepare <spell>` + `cast` for casters with cambrinth charge/invoke where applicable; `khri <x>` for thief; `play <song>` / `compose` hooks for bard).
   - `rest.dr`, `armup.dr`, `circle.dr` (TDP curriculum from that guild's requirement pools — port the SET_CANDIDATES idea per guild), `recover.dr` (empath heal-self / cleric pray patterns).
   - `<guild>.mega` — top-level: calls the cycle labels; because the engine has no `call`, implement chaining the way barb-run does: driver runs `hunt` until kills threshold, then `circle`, then re-runs — OR add a tiny `putrun <name>` extension (see open questions).
3. **Race dimension:** sweep matrix picks race per run (`--race`); chargen stat allocation is auto. First pass: 3 representative races per guild (racial-stat fit / mid / poor) rather than all 12×11 = 132.
4. **Fidelity assertions** parsed from player-facing prose (like live-sim parses circle failures): spell prep/cast messages, khri activations, song effects, cambrinth charges, guild-hall trainer interactions, death/flee handling. Written to `public/live/fidelity-<guild>.log` + a final JSON summary (`results.fidelity.json`) listing checks passed/failed per guild.
5. **Safety interlocks stay in the driver** (not scripts): flee at HP<30%, death detection + re-entry, stall watchdog, rate limiting (160ms/cmd).

---

## Step-by-step plan

### Task 1: Extract shared session/driver core
**Files:** Create `scripts/lib/wire-session.mjs`; refactor `scripts/barb-run.mjs` to import it (no behavior change).
Steps: lift httpLogin/connect/onMessage dispatch/prompt parsing/injectState into a `WireSession` class with callbacks `{onRoom, onPrompt, onText, onError}`; barb-run keeps its logic on top. Verify: `node scripts/barb-run.mjs --minutes 2 --char Kargok2` still completes a cycle.

### Task 2: Guild capability map (data)
**Files:** Create `data/guild-scripts.js` — per-guild: primary attack verbs (`attack X` vs `prepare/cast`), signature abilities to exercise (analyze, khri list, songs, spells, cambrinth, pray, steal, forge smoke-test), TDP candidate sets per requirement slot, arena room ids, hall id. Source facts from existing `data/guilds.js`, `data/abilities`/`khri`/`mana` files; cite elanthipedia pages in comments per clean-room rule.
Verify: `node --check data/guild-scripts.js` + a unit test asserting every guild key exists with attack verb + ≥1 signature ability.

### Task 3: Script library generator + first two guilds
**Files:** Create `scripts/gen-dr-scripts.mjs` (writes `scripts/dr-scripts/<guild>/*.dr` from `data/guild-scripts.js` + BFS paths), generate for `barbarian` and `warmage` first (weapon vs caster archetypes). Warmage exercises prepare/cast/cambrinth.
Verify: generated scripts parse with `parseScript`; dry-run one warmage char for 5 minutes via the Task-4 driver.

### Task 4: Sweep driver
**Files:** Create `scripts/race-guild-sweep.mjs`.
Flags: `--guilds a,b --races human,dwarf --minutes 15 --circle 2`. Per combo: create/login account `sim_<guild>_<race>`, enter world, push library scripts via `scripts_put`, run mega/hunt+circle cycles like barb-run, log fidelity events, finish with JSON summary appended to `public/live/fidelity-summary.log`.
Interlocks copied from barb-run: flee<30%, death counter, 90s stall watchdog, injectState vitals feeding.
Verify: 5-minute warmage+dwarf and barbarian+giantman runs both reach circle 2 or log precise blockers.

### Task 5: Remaining guilds' libraries
Port per guild in archetype order: paladin/ranger (weapon+minor magic), thief (khri + stealth), bard (songs/emotions), cleric/empath (heal/pray loops, empath self-heal), necromancer (corpse/ritual hooks guarded by "ability not known" fallbacks), moonmage (stars/cambrinth), trader (run money/pit smoke steps). Each gets a fidelity check list.
Verify: `node scripts/race-guild-sweep.mjs --all --minutes 8`.

### Task 6: Tests + docs
**Files:** Modify `test/scripts.test.mjs` (generator output parses; guild map complete); update AGENTS.md Verification section with the sweep command.
Verify: `npm test`.

---

## Open questions (decide before Task 3)

1. **Mega-script chaining:** add a `putrun <name>` engine command (engine change + test, ~20 lines) so `<guild>.mega` can call sub-scripts, vs. keeping the barb-run model of driver-orchestrated sub-runs. Recommend: add `putrun` — it makes the mega script genuinely DR-authentic (DR had nested script calls) and simplifies the driver.
2. **Script storage location:** ship libraries as repo files pushed via `scripts_put` at run start (recommended — versioned, reviewable) vs. pre-seeding the DB.
3. Matrix size: full 12 races × 11 guilds is 132 sessions; recommend defaulting to curated pairs with `--all` opt-in.

## Risks

- Caster loops can spin while mana regenerates — need `iflt mana` support: extend prompt-var mirroring (%mana) in script-engine feed (small, tested change).
- Death/re-entry mid-mega-script: driver must restart the current sub-script after respawn (barb-run already does this; keep it in driver).
- Baked paths go stale after regrids — reuse barb-run's observed-exits BFS approach in the generator and regenerate paths at run start, not commit time.

## Verification commands

```bash
node --check scripts/race-guild-sweep.mjs && npm test
node scripts/race-guild-sweep.mjs --guilds warmage --races dwarf --minutes 10 --circle 2
node scripts/race-guild-sweep.mjs --all --minutes 8   # full sweep
tail -f public/live/fidelity-warmage.log
```
