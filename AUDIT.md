# Dragon Realms — Deep Audit: Roadmap × Implementation × DragonRealms (through Circle 10)

Date: 2026-08-12 · **Revision 2** (re-audit after the P0/P1/P2 follow-up batch) ·
Scope: everything the game claims through **circle 10** parity.

Method: 58/58 tests ×4 consecutive runs · headless sims for all 11 guilds ·
programmatic data-integrity audit (`scripts/audit-data.mjs`, persistent) ·
feature-existence greps · local mirror of the official wiki corpus
(`docs/elanthipedia/`, search with `node scripts/elathip-search.mjs <query>`).

---

## 1. Executive summary

**Core parity claim verified true (again, post-change):** all 11 guilds reach
circle 10 through the authentic DragonRealms band tables (4–12 simulated
active minutes each, TDP totals ≈910–1040 — the DR-authentic range). Since
Revision 1 the following audit items have shipped: the **authentic TDP
model** (600 start, 50+circle, hidden pool, death pool shave), **Giantman**,
**mastery skills**, **mindstate readout**, **stance points** (with Barbarian/
Ranger bonuses), the **hunting ladder**, **thief ambush from hiding**, and
the fourth spells per guild were found already live.

**Remaining gaps are breadth, not parity:** exp pools/pulses (we convert
directly; the mindstate ladder is a readout only), spell-slot budgets +
TARGET verb, DR's 16-tier skill messaging, world fidelity (Crossing
districts/Riverhaven/tasks), crafting disciplines, PvP/justice, and the
per-guild fidelity passes (ROADMAP Pillars 13–22). Two roadmap rows were
found stale this pass and fixed (barbarian forgetting status; rank-cap row).

**Operational risk unchanged:** the repository still has **zero commits**.

---

## 2. Verification runs

| Check | Result |
|---|---|
| `npm test` (58 tests, ×4) | ✅ 58/58, 0 fail |
| Sim: all 11 guilds → circle 10 | ✅ 4–12 sim-min each; TDPs ≈910–1040 |
| Data-integrity audit (`scripts/audit-data.mjs`) | ✅ ALL CROSS-REFERENCES VALID |
| Feature greps (perceive/harness/prepare/cambrinth/inner fire/learn/analyze/whirlwind/stomp/choke/duel/steal/pick/quest/claim/ambush/ladder/stance-points) | ✅ all present |
| Auth security (scrypt, timing-safe, lockout, sessions, rate limits, body caps, no eval) | ✅ |
| Client claims (P9): Ctrl-F search, tab completion, status strip, auto-scroll, mobile, gamepad, haptics | ✅ all present |
| Wiki corpus mirror | ✅ 587 pages local (`docs/elanthipedia/`) |

---

## 3. Roadmap accuracy audit

| # | Claim in ROADMAP.md | Reality | Verdict |
|---|---|---|---|
| P2 | "45+ skills across 7 categories" | **83 skills** across 8 categories | ❌ stale |
| P2 | "Skill caps tied to circle" ⬜ | **Implemented** (`maxRankFor = circle*4` in `gainSkillExp`) | ❌ wrong status |
| P3 | "Circles 3–6 pacing balanced" ⬜ | Sim-validated (smooth per-circle milestones) | ❌ stale |
| P3 | "Circle display … titles pending" | Titles live (10/guild, in `score`/`circle`/`who`) | ❌ stale |
| P5 | "8 creature types across 5 zones" | **15 creature types, 7 zones** (+ rares) | ❌ stale |
| P6 | "2 spells/guild" | **3 spells/guild** + prepare/cast + overchannel + cambrinth | ❌ stale |
| P7 | "5 hunting zones" | 7 zones | ❌ stale |
| P12 | "77 skills" | 83 skills | ❌ stale |
| Matrix | "Primary ≥ 10 / Secondary ≥ 8" model | Live engine uses **authentic DR band tables**; matrix section describes the retired model | ❌ must rewrite |
| Tooling | "54 tests" | 55 tests | ❌ stale |
| Sim table | 9–24 min | Measured 10–23 (random-seeded variance run to run) | 🟡 close, note variance |
| P11/P12–27 | 🚧/⬜ fidelity statuses | Verified against code — accurate | ✅ |

**Tracker (`/ROADMAP.html`) note:** stage badges are a coarse manual mirror of
the markdown; rows drift independently. Recommend generating the tracker from
ROADMAP.md or vice versa.

---

## 4. Implementation audit

### 4.1 Data integrity (scripted cross-reference audit)
- Skills ↔ guilds (primary/secondary/guildSkill), spells, circle tables, items,
  creatures, rare loot, NPC stock/buys, room exits (reciprocity!), recipes,
  mana types: **all valid** after one fix.
- **Fixed during audit:** `east_gate` exit `w → square` had no reciprocal exit
  (one-way dead connection). Added `east_road` room connecting square ↔ east_gate.

### 4.2 Security
- scrypt + per-user salt + `timingSafeEqual` · 5-fail lockout · 12h session
  tokens · WS input rate limit (20/s) · API rate limit + 16KB body cap ·
  parameterized SQL everywhere · no `eval` · per-account scoping on all API
  state. **No findings.**

### 4.3 Robustness
- **Critical:** no git history. Recommend `git add` + first commit immediately.
- One flaky test (`barbarian kit` warhorn step) — order-sensitive against the
  shared game instance; ~5–10% flake; assert rewritten to be message-based.
- The API test suite was previously flaky on real-combat randomness; made
  deterministic via a `/debug die` fixture.
- Sim tooling (`scripts/simulate-progression.mjs`) is now a genuine balance
  harness (trains via the real commands: hunt/forage/hide/study/sell/steal/
  pick/berserk/maneuvers, spends TDPs via `tdptrain`).

### 4.4 Known intentional divergences (documented, not bugs)
- Exp is direct (no field-exp pools → pulses; the mindstate ladder is a
  readout, not a timing mechanic).
- Rank cap is circle × 4 (anti-grind) instead of DR's 1750.
- `raise` spends TDPs anywhere rather than at designated stat-training rooms.
- Combat is tick-resolved, not a DR-style RT/sim system (no positioning, no
  per-blow dodge/parry/armor-layer resolution).

---

## 5. Comparison vs DragonRealms (through circle 10)

Faithfulness key: ✅ faithful · 🟡 partial/divergent · ❌ absent.

### 5.1 Races & stats
| System | DR (authentic) | Ours | Faith |
|---|---|---|---|
| Races | 12 (Human, Dwarf, Elf, Elothean, Gnome, Gor'Tog, Halfling, Kaldar, Prydaen, Rakash, S'Kra Mur, Giantman) | 12/12 (Giantman added in R2) | ✅ |
| Stats | 8 (Str/Con/Ref/Agi/Cha/Dis/Wis/Int), ~35–40 start, raise via TDPs | 8 identical, 35 base + 30 alloc, TDP `raise` | ✅ |

### 5.2 Guilds
| Guild | Mana | Our implementation vs DR |
|---|---|---|
| Barbarian | none | ✅ Best pass: inner fire, 4 ability classes, paths, whirlwind/stomp/choke/dual load, warhorn, chakrel, analyze, flavor verbs. ❌ warpaint, roar helms, registers, bonus stance points, full masteries |
| Bard | Elemental | 🟡 spells + performance; ❌ enchantes, vocals/instruments, segue, bardic tree |
| Cleric | Holy | 🟡 spells; ❌ align/devotion/communes/infusion |
| Empath | Life | 🟡 healing spells; ❌ touch/transfer/take wounds, links, scar tax |
| Moon Mage | Lunar | 🟡 lunar spells + moon gating; ❌ prediction, moongates, telescopes |
| Necromancer | Necromantic | 🟡 necro spells; ❌ risen minions, states of being, thanatology rituals |
| Paladin | Holy | 🟡 smite/wards; ❌ code of honor, soul system, glyphs, lead/protect |
| Ranger | Life | 🟡 hunt/track/scouting; ❌ beseeches, animal companions, snipe/slip |
| Thief | none | 🟡 backstab/steal/strongboxes; ❌ khri, blindside, ambush moves, passages |
| Trader | Lunar | 🟡 trading skill; ❌ caravans, commodity pits, hirelings, market advantages |
| Warrior Mage | Elemental | 🟡 war magic; ❌ familiars, aethereal pathways, elemental charge |

All 11 guilds ✅ on circle tables, titles, capstones, spells to circle 5.

### 5.3 Skills & experience
| System | DR | Ours | Faith |
|---|---|---|---|
| Skill set | 65+ (Weapon/Armor/Magic/Survival/Lore/Guild) | 83 (adds Combat Manipulation + Defense categories) | 🟡 superset |
| Rank cost | 200 + n "bits" | 200 + n (exact) | ✅ |
| Rank cap | 1750 | circle*4 (40 @ circle 10) | 🟡 intentional anti-grind |
| Learning stats | Int (pool size), Wis (pulse size), Dis (pool+pulse) | Int/Wis/Dis multiplier | 🟡 |
| Field exp → pulses | 10 groups, 200s pulses, mindstate ladder, primary 40–60 min drain | direct conversion; **mindstate ladder shown as readout** in `exp` | 🟡 |
| Mastery skills (Melee/Missile/Primary Magic) | boost lower same-class skills | ✅ live (combat + casting effective ranks; trains alongside use) | ✅ |
| 11 guild skills | guild-only training | 8 in Guild category + 3 magic-tagged; trainer-gated | 🟡 |

### 5.4 TDPs — now faithful
| Aspect | DR | Ours |
|---|---|---|
| Starting TDPs | **600** | ✅ 600 |
| Circling | base 50 (<10) + circle; 100 + circle (≥10) | ✅ identical formula |
| Rank-ups | shared hidden pool; every 200 pool points → 1 TDP; quadratic in rank | ✅ identical (pool shown in `tdp`) |
| Spending | designated stat-training rooms, TRAIN twice | 🟡 `raise <stat>` anywhere (convenience divergence) |
| Death | TDP pool can go negative | 🟡 pool shaved 25% (no negative) |

**This was the least-faithful core system in R1; it is now the most faithful
alongside the circle engine.**

### 5.5 Circling (the crown jewel — ✅ faithful)
- Band tables for all 11 guilds match the wiki exactly (1–10 bands scaled by
  circle; e.g. Warmage: Summoning 3 hard, Targeted Magic 4, Scholarship 1,
  Parry 2, Defending 1, 1st–5th magic 4/4/3/0/0, …).
- Hard-skill exclusion from Nth pools ✅ · mastery exclusions ✅ ·
  Sorcery/Thievery exclusions ✅ · `circle` at guild hall ✅ · titles ✅ ·
  capstones ✅.
- **Sim-verified: every guild reaches circle 10.**

### 5.6 Combat, death, magic, world, economy
| System | DR | Ours | Faith |
|---|---|---|---|
| Combat model | RT/sim: positioning, per-blow parry/dodge/armor-layer, stance points, combos, ambushes | tick-resolved auto-resolve + stances (+**stance points**) + maneuvers + **ambush-from-hiding** + PvP duels | 🟡 |
| Ammo | bows/arrows, quivers | bows/arrows + bolts | ✅ |
| Death | corpse + exp drain (+ favors at higher levels) | corpse + reclaim + exp penalty (+ **TDP pool shave**) | ✅ |
| Hunting ladder | creature rank bands drive zone choice | ✅ teaching bands + `ladder` command + anti-grind scaling | ✅ |
| Spell slots | 89–91 primary @150, prep/keep/cast, TARGET verb | `prepare <spell> [pct]` + overchannel + cambrinth; **no slot budgets / TARGET verb** | 🟡 |
| Mana types | 6 types + cycles | 6 types + cycles + perceive/harness + held mana | 🟡 |
| Cambrinth | charge/invoke/release/focus, type-locked | charge/invoke/focus, type-lock explosion, Arcana-gated | 🟡 |
| World | Crossing/Riverhaven districts, tasks, ladders | one town, 7 zones, crier quests | 🟡 |
| Economy | silvers + kronars, auctions, commodity pits | silvers only, shops/bank/quests | 🟡 |
| Scripting | full scripting language | aliases/;/macros/timers/triggers (client) | 🟡 |
| Interface | xml feeds, genie-style UIs | themes/fonts/palette/search/tab-complete/status strip | ✅ |
| Native controls | — | D-pad + gamepad + haptics | ➕ (beyond DR) |

---

## 6. Prioritized recommendations (Revision 2)

**P0 — do immediately**
1. **Commit the repository** (still zero commits; total data-loss risk).
2. Audit's R1 roadmap fixes are all shipped; remaining staleness is tracked
   in ROADMAP.md itself (a periodic `npm test && node scripts/audit-data.mjs`
   catches data drift).

**P1 — remaining growth-loop fidelity**
3. **Exp pools/pulses**: keep direct conversion (it's our divergence) but
   finish the feel — the mindstate readout is live; a full pool/pulse model
   is the big lift. Optionally: message tiers (Novice → Avatar, 16 tiers)
   in `skills` output — cheap and flavorful.
4. **Stat-training rooms** (TDP spending at designated rooms with TRAIN
   twice) — closes the last TDP divergence; otherwise document `raise` as a
   convenience.
5. **Spell-slot budgets + TARGET verb** — the largest remaining magic gap
   (Pillar 25 rows).

**P2 — combat & world depth**
6. Ambush polish: poach/snipe verbs, hiding persistence per round.
7. World fidelity: depth-tiered grounds, task givers, a second district.
8. PvP/justice: CHALLENGE duels, stance flags, crime/jail loop.

**P3 — breadth**
9. Crafting disciplines (Pillar 26).
10. Per-guild fidelity passes (Pillars 13–22), starting with Thief (khri)
    and Warrior Mage (familiars).

---

## 7. Artifacts produced by this audit

- `docs/elanthipedia/` — 587-page local wiki mirror + `index.json`
- `scripts/fetch-elanthipedia.mjs` — re-mirror tool
- `scripts/elathip-search.mjs` — local search: `node scripts/elathip-search.mjs "Circle Requirements"`
- `scripts/audit-data.mjs` — persistent data-integrity audit (run in CI-style)
- Fixed (R1): `east_gate` one-way exit (added `east_road`); flaky API death test
  → deterministic `/debug die` fixture
- Fixed (R2): ROADMAP rows for barbarian forgetting + rank-cap
- Verified stable: 58/58 tests ×4, all-guild circle-10 sims

## 8. Resolution status (Revision 2)

| Audit item | Status |
|---|---|
| ROADMAP.md stale claims (counts, circle matrix, statuses, test count) | ✅ rewritten in R1; two more rows fixed in R2 (barbarian forgetting, rank-cap) |
| Authentic TDP model | ✅ 600 start, 50+circle / 100+circle, hidden pool (200→1), death pool shave, pool in `tdp` |
| Giantman race | ✅ 12/12 races |
| Mastery skills mechanic | ✅ Melee/Missile Mastery + Primary Magic boost lower same-class skills |
| Mindstate readout | ✅ `exp` shows clear → mind lock |
| Stance points | ✅ costs + Barbarian +1/60 Defending, Ranger defense scaling |
| Hunting ladder | ✅ teaching bands, `ladder` command, anti-grind scaling |
| Ambush from hiding | ✅ `hide` → `ambush`; thieves hide mid-fight; breaks on move/hit |
| Fourth spells @ circle 8 | ✅ verified live (all 8 magic guilds); tracker claim corrected |
| Persistent audit tool | ✅ `scripts/audit-data.mjs` (all cross-references valid) |
| Sim re-validation | ✅ all 11 guilds → circle 10 in 4–12 sim-min; TDPs ≈910–1040 |
| Git commit | ⚠️ **still zero commits** — run `git add -A && git commit` |
| Exp pools/pulses, spell slots + TARGET, messaging tiers, world/justice/crafting, per-guild passes | ⬜ next batches |

**Revision 3 — gaps targeted this pass:**

| Item | Status |
|---|---|
| 16-tier skill messaging (Novice → Avatar) | ✅ `skills` output with degree modifiers |
| Stat-training rooms for TDPs | ✅ Fane of Training; `raise` gated; `train <stat>` twice to confirm |
| TARGET verb + spell-slot display | ✅ `target <creature>`, `slots` (per-guild slot rates) |
| PvP/justice v1 | ✅ duel end conditions (blood/blow/pain), `surrender`, `pvp stance` flags, steal forces OPEN |
| Exp pools/pulses as a timing mechanic | ⬜ large lift (mindstate readout remains) |
| Crafting disciplines, world fidelity (districts/tasks/Riverhaven), full justice loop, per-guild passes (Pillars 13–22) | ⬜ roadmap |

**Revision 4 — more pillars closed:**

| Item | Status |
|---|---|
| Thief khri v1 (Pillar 20) | ✅ concentration pool + 5 khri buffs, break on hit |
| Forging crafting v1 (Pillar 26) | ✅ ore drops, Ember Forge, quality ladder (worthless → masterfully-crafted), crafted steel scales damage |
| Guild-leader tasks | ✅ `ask <leader> task`, guild-skill rewards |
| Exp pools/pulses, world fidelity, full justice, remaining per-guild passes | ⬜ roadmap |

**Revision 5:**

| Item | Status |
|---|---|
| Rested Experience | ✅ bank offline 2:1 (cap 120), 2× drain while active |
| Moon Mage prediction v1 (Pillar 16) | ✅ `predict` omen buff + Astrology/Scholarship exp |
| Warrior Mage familiars v1 (Pillar 22) | ✅ combat ally, Summoning exp, hall-bound |
| Justice loop (Pillar 27) | ✅ theft → arrest → Town Cells → PLEAD guilty/innocent |
| Exp pool/pulse timing, Riverhaven/world depth, full crimes+judge, remaining guild passes | ⬜ roadmap |

**Revision 6:**

| Item | Status |
|---|---|
| Empath wound-taking v1 (Pillar 15) | ✅ `mend` (wounds pass to you), empathic stain on living kills |
| Paladin soul v1 (Pillar 18) | ✅ smite, code of honor (theft/striking first), undead + pray restore, dim soul blocks circling |
| Ranger companions + beseeches v1 (Pillar 19) | ✅ wolf bonding, wind/sun buffs, overuse spurning |
| Command refactor (parallel session) | ✅ commands.js split into server/commands/ modules; `plead` restored after the split dropped it; sim import path fixed |
| Exp pool/pulse timing, Riverhaven, full crimes+judge, remaining guild passes | ⬜ roadmap |

**Revision 7 — all guild fidelity pillars now have live v1s:**

| Item | Status |
|---|---|
| Necromancer risen v1 (Pillar 17) | ✅ animate corpses → fighting minions |
| Cleric devotion v1 (Pillar 14) | ✅ rituals, holy scaling, dim-devotion mana penalty |
| Bard enchantes v1 (Pillar 13) | ✅ cyclic songs with upkeep |
| Trader commodity pits v1 (Pillar 21) | ✅ fluctuating board, buy low/sell high |
| 11/11 guilds now have a fidelity v1 (Barbarian, Thief, Warmage, Moon Mage, Empath, Paladin, Ranger, Necro, Cleric, Bard, Trader) | ✅ |
| Exp pool/pulse timing, Riverhaven, full crimes+judge | ⬜ roadmap |

**Revision 8:**

| Item | Status |
|---|---|
| Exp pools/pulses | ✅ 70/30 field split, 30s pulse ticker, persistent pools, mindstate reads the pool |
| Riverhaven (second starting city) | ✅ square/market/shrine/shared hall row/ferry; chargen city choice |
| Justice judge verdicts | ✅ heat-scaled costs on release after pleading innocent |
| DR 10-group pulse offsets, provinces, full crimes+debts | ⬜ roadmap |
