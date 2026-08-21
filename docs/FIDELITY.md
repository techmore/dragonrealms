# Dragon Realms — Fidelity Notes

Working record of how closely our systems match the source game as documented
in the local Elanthipedia mirror (`docs/elanthipedia/`, mirrored 2026-08-12),
plus fresh progression-sim results. Ground truth first, our implementation
second, verdict third. This complements `REMAINING.md` (the handoff list) and
`ROADMAP.md` (the tracker): where they say *what* remains, this file records
*how what we have compares*.

Priority framing: **fidelity to the source game is the goal; balance is
downstream of fidelity.** Divergences below are listed even when they were
previously flagged "intentional" — an intentional divergence is still a place
where we differ from DR, and worth keeping on the record.

---

## 1. Progression sim results

Fresh deterministic runs of `node scripts/simulate-progression.mjs <guild>`
(same engine as the ROADMAP matrix; run-to-run variance comes from seeded
randomness in combat/loot).

| Guild | Circle reached | Sim hours | Hunts | Deaths | TDPs |
|---|---|---:|---:|---:|---:|
| Barbarian | 10 | 16.0 | 1,052 | 0 | 1,168 |
| Bard | 10 | 28.5 | 2,557 | 0 | 1,258 |
| Cleric | 10 | 33.6 | 3,021 | 0 | 1,259 |
| Empath | 10 | 76.4 | 3,989 | 0 | 1,274 |
| Moon Mage | 10 | 27.6 | 2,486 | 0 | 1,253 |
| Necromancer | 10 | 34.5 | 3,157 | 0 | 200 |
| Paladin | 10 | 18.7 | 1,652 | 0 | 1,216 |
| Ranger | 10 | 27.3 | 2,034 | 0 | 133 |
| Thief | 10 | 20.7 | 1,221 | 0 | 571 |
| Trader | 10 | 34.5 | 2,034 | 0 | 1,197 |
| Warrior Mage | 10 | 32.6 | 2,981 | 0 | 1,260 |

All eleven reach circle 10 with zero deaths. TDP column is *unspent* balance
at circle 10 (the sim spends via `tdptrain` where trainers can't teach), so
low values mean heavier TDP spending, not lower earnings.

vs published matrix (ROADMAP.md): every guild matches within seed variance
except **Ranger — 27.3 h this run vs 40.4 h published** (−32%). Re-run to
confirm before treating as drift; if it reproduces, something changed in the
learning/combat path since the matrix was generated and the ROADMAP table
should be regenerated.

**Post-re-shape spot check** (after §6 landed): Barbarian 14.8 h / 979 hunts
(was 16.0 h / 1,052 pre-change, 15.6 h published). Slightly faster despite
the slower pulses — the invented learning lockout (D11) had been halving the
sim's training most of the time. Expect the full matrix to shift a few hours;
regenerate before drawing balance conclusions.

**Concern (fidelity lens):** the spread itself is not evidence of infidelity —
DR guilds genuinely pace differently — but we have no source-grounded target
for *how much* they should differ. DR does not publish hours-to-circle;
Elanthipedia documents requirements, not wall-clock cost. Any claim that
"Empath is too slow" is therefore a balance judgment, not a fidelity finding.
The fidelity findings are the mechanical ones in §2–§3.

---

## 2. Verified matches (implementation ↔ corpus)

| System | Source ground truth (`docs/elanthipedia/Experience.md`) | Our implementation | Verdict |
|---|---|---|---|
| Rank cost curve | next rank costs `200 + n` bits | `expToNextRank(rank) = 200 + rank` (`data/skills.js:460`) | ✅ exact |
| Mindstate ladder | 34 fractions, `clear` (0/34) → `mind lock` (34/34), 35 labels | `MINDSTATES`, 35 entries, same words, same order (`data/skills.js:473`) | ✅ exact |
| Skill messaging tiers | Novice 1–49 … Avatar 1750, 16 tiers, degree modifiers inside most | `TIERS` + `skillTier()` (`data/skills.js:490`) incl. Lowly/Promising/Able/Trained/Full and Exceptional/Outstanding/Renowned/True families | ✅ matches |
| TDP from ranks | ranks feed TDPs | shared hidden pool, every 200 rank-points → 1 TDP (`tdpGainFor`, `TDP_POOL_CONVERSION`) | ✅ shape matches |
| REXP banking | 2 minutes not draining → 1 minute banked | `bankRexp`: 120,000 ms → 1 (`server/player.js:449`) | ✅ ratio matches |
| Circle tables | cumulative named-skill + Nth-of-skillset bands per guild | `CIRCLE_TABLES` band engine, `need = band × circle` | ✅ (per-guild rows readable against `docs/elanthipedia/<Guild>.md`) |

---

## 3. Divergences (each with its source ground truth)

> **Update (this pass):** D2–D7 and D11 are now **resolved** — the learning
> system was re-shaped onto the DR model (see §6): 100% banking, fixed groups
> on the 200 s schedule, corpus pool formulas × Int/Disc, tier fractions with
> accelerators, Wisdom scaling. D8 is partially resolved (3× drain value +
> per-pulse consumption live; subscription caps/cycles stay out by design).
> **D1 is now resolved (Option A)** — flat 1750 cap, soft mastery tiers,
> technique ladder at DR scale (see §7). D9, D10 remain open.

### 3.1 Structural

| # | System | DR (corpus) | Ours | Where |
|---|---|---|---|---|
| D1 | **Rank cap** | flat 1750 for every skill; buffs can exceed to +30% | `(circle + 1) × 4` — rank 40 at c9 | `maxRankFor` (`server/player.js:445`) |
| D2 | **Field-exp split** | 100% of field exp enters the skill's pool; only pulses create ranks | ~70% converts immediately, ~30% banks | `gainSkillExp` (`server/player.js:463`) |
| D3 | **Pool size** | formula by skillset: primary `15000·X/(X+900)+1000`, secondary `12750·…+850`, tertiary `10500·…+700`; ×Int/Disc modifiers (break points at 30/60) | cap = 2× the current rank's bit cost, stats ignored | `server/player.js:495` |
| D4 | **Pulse schedule** | 10 fixed groups (documented membership, skillset order, guild skills last), pulsing every 200 s, offsets 20 s apart → full cycle 200 s | 10 groups assigned by deterministic hash of skill id, one group per 30 s phase → full cycle 300 s | `expGroupFor`, `pulseExp` (`server/player.js:534,553`) |
| D5 | **Pulse size** | fraction of *pool size*, scaled by Wisdom; secondary <50 ranks drains like primary, tertiary <25 like secondary | fixed conversion rate by skillset tier: primary 1.0, secondary 0.8, tertiary 0.65 | `poolConversionRate` (`server/player.js:544`) |
| D6 | **Drain duration** | mind lock → clear: primary 40–60 min, secondary 50–80, tertiary 70–100 | implied by D2/D4/D5: a full pool clears in ≤ 5 min (one 30 s phase per group, ≥65% per pass) | derived |
| D7 | **Stats in learning** | Intelligence → pool size; Wisdom → pulse size; Discipline → both at 10% efficacy | no stat touches the exp flow | — |
| D8 | **REXP drain value** | drained exp worth **3×** ranks while REXP active; subscription caps 4/6/8 h; usage cap per personal 23.5 h cycle; 20 s consumed per group-pulse (stretchable); light/deep sleep states | 2× drain; flat 120-minute cap; 1 unit per gain event; no sleep states, no cycle | `REXP_CAP`, `gainSkillExp` (`server/player.js:441,474`) |
| D9 | **Bonus pools** | experience 3.0 bonus pools double learning per skillset until exhausted | absent | — |
| D10 | **Offline drain** | at login, pools drain `minutes-out / 360` (÷480 with warning) | none — pools persist untouched | — |
| D11 | **Learning lockout** | no such mechanic; natural brakes are mind lock + pool size | 3 rank-ups in 5 min → 50% learning for 2 min ("DR-flavored" anti-grind invention) | `server/player.js:467` |

### 3.2 Why the structural ones matter downstream

- **D1 (rank cap)** is the root of several pending rows: DR-scale spell-slot
  trees (55–89 slots @150 ranks), crafting technique slots (13 @ ranks
  25–1200), and spell difficulty tiers (~10/80/250/400 rank thresholds) all
  assume ranks far beyond our circle-10 ceiling of 40. Any "full tree"
  fidelity work eventually collides with this cap.
- **D2–D6 (pool/pulse cluster)** together replace DR's entire learning-rhythm
  system with a faster, flatter approximation. DR's version makes *what* you
  train and *when you log* matter (pool sizes, pulse windows, offline drain);
  ours makes learning nearly immediate. This is the largest mechanical
  fidelity gap found this pass — and it is invisible in reachability sims,
  which is why the simulator reports all-green while the feel differs.
- **D8 (REXP)**: our 2× vs DR's 3× and the missing cycle/usage-cap structure
  make REXP both weaker and simpler than the source.

---

## 4. Suggested fidelity-first follow-ups

Ordered by (fidelity gap size × how much content depends on it):

1. **Pool/pulse re-shape (D2–D6)** — move to 100%-into-pool, adopt DR's
   documented group membership + 200 s/20 s schedule, pool-size formulas with
   Int/Wis/Disc scaling, and low-rank drain accelerators. Keep the 70/30
   hybrid only if playtesting says new players bounce off pure-pool delay.
2. **Rank-cap expansion path (D1)** — even without going to 1750, a
   documented plan for post-circle-10 rank growth unblocks spellbook trees,
   technique slots, and difficulty tiers.
3. **REXP alignment (D8)** — 3× drain value, cycle + usage cap, sleep states.
   Small, self-contained, high player-visible authenticity.
4. **Offline drain (D10)** — simple to add once pools exist in DR shape;
   gives logout decisions weight.
5. **Learning lockout (D11)** — decide: keep as declared house rule or remove
   in favor of authentic mind-lock braking once pools are DR-shaped.

---

## 5. Method & sources

- Corpus: `docs/elanthipedia/*.md` (587 pages, mirrored 2026-08-12);
  primary page this pass: `Experience.md`.
- Code: `server/player.js` (exp pools, pulses, REXP, locks),
  `data/skills.js` (bit curve, mindstates, tiers),
  `data/guilds.js` (circle tables).
- Sims: `scripts/simulate-progression.mjs` (see §1 for refresh commands).
- Re-verify after any change to the learning system: `npm test`,
  `npm run verify-docs`, `node scripts/audit-data.mjs`, then refresh §1.

---

## 6. Implementation plan — pool/pulse re-shape (D2–D6)

> **Status: IMPLEMENTED (this pass).** Decisions: authentic 200 s cycle,
> hard cut (no legacy flag), lockout removed, Wisdom on the shared
> mental-stat curve (corpus-anchored, see §6.5 Q4). Verification: 239/239
> tests, `verify-docs` clean, data audit clean; post-change sim spot check
> in §1.

Goal: replace the 70/30-hybrid + hash groups + fixed conversion rates with
the source-documented model: **all field exp banks into per-skill pools;
fixed skill groups pulse on the 200 s / 20 s-offset schedule; pulse size is a
fraction of pool size scaled by skillset and stats.**

### 6.1 Model changes

| Aspect | New behavior | Source |
|---|---|---|
| Banking | `gainSkillExp` sends **100%** of field exp to the pool; ranks change only in `pulseExp` | Experience.md "Experience pools" |
| Cycle | 10 groups; group *g* converts when `(floor(t/20) % 10) === g` — i.e. each group fires once per 200 s, staggered 20 s | "Skills pulse in groups every 200 seconds… offset… by 20 seconds" |
| Group membership | fixed table (§6.2), not hash | documented table |
| Pool cap | `base(X) × (1000 + i + d) / 1000`, where `base` by skillset: primary `15000·X/(X+900)+1000`, secondary `12750·X/(X+900)+850`, tertiary `10500·X/(X+900)+700`; `i`,`d` = Int/Disc modifiers (break points 30/60, formulas in corpus) | "Base pool size" tables |
| Overflow | pool full → further field exp for that skill yields nothing ("mind lock" feel) | implied by pool caps |
| Pulse fraction | primary 1/15 (~6.7%), secondary 1/19 (~5.3%), tertiary 1/25 (4%) of current pool — derived from documented lock→clear drain times (40–60 / 50–80 / 70–100 min ÷ 200 s cycle), midpoints | "Time to Pulse" table |
| Low-rank accelerator | secondary <50 ranks drains at primary rate; tertiary <25 at secondary rate | documented footnotes |
| Wisdom | pulse-fraction multiplier following the documented mental-stat curve (the Int table's piecewise shape: ×1.00 @10, ×1.12 @30, ×1.21 @60, ×1.26 @90) — the corpus presents that table as covering Intelligence *and* Wisdom equally ("affect all skills equally"); the lone player experiment (Wis 30→40 → +6.24% absorption, `Wisdom (stat).md`) is compatible within its error bars. Flagged inferred-shape, published-anchor | "Stats and learning" + `Wisdom (stat).md` |
| Mindstate readout | unchanged (35-state ladder already exact); pct now reads pool/base-pool-size instead of raw banked bits | — |
| REXP interplay | REXP triples drained value (see D8 fix, separate change); each group-pulse with content consumes 20 s of REXP | REXP technical notes |
| Logout flush | `pulseExp()` no-arg flush stays for save/shutdown paths | existing behavior |

### 6.2 Skill → pulse-group mapping

Documented rows are fixed; `†` = inferred (corpus table silent on these ids —
placed to keep skillset contiguity).

| Group (offset) | Skills |
|---|---|
| 0 (0 s) | shield_usage light_armor chain_armor brigandine plate_armor defending |
| 1 (20 s) | parry small_edged large_edged twohanded_edged †medium_edged |
| 2 (40 s) | blunt large_blunt twohanded_blunt slings bow crossbow |
| 3 (60 s) | staff polearm thrown heavy_thrown brawling offhand melee_mastery †martial_arts |
| 4 (80 s) | missile_mastery primary_magic attunement arcana targeted_magic augmentation †offensive_magic defensive_magic warding_magic healing_magic holy_magic moon_magic war_magic illusion necromancy |
| 5 (100 s) | debilitation utility_magic warding sorcery evasion athletics perception †climbing swimming fitness endurance |
| 6 (120 s) | stealth lockpicking thievery first_aid †foraging(=Outdoorsmanship) hunting tracking hiding |
| 7 (140 s) | skinning |
| 8 (160 s) | forging engineering outfitting alchemy enchanting scholarship appraisal †herbal_lore elemental_lore necromancy_lore |
| 9 (180 s) | performance tactics + guild: empathy expertise scouting backstab bardic_lore conviction thanatology trading summoning astrology theurgy inner_fire |

Notes: DR has no Medium Edged (post-3.0 merge) — ours rides with the edged
cluster. `warding` (our Combat Manipulation id) takes DR Warding's documented
slot; `warding_magic` (spell-school id) sits with the schools. Guild-typed
magic (`summoning astrology theurgy inner_fire`) goes to the final group per
"guild-only skills pulse in the final group", matching the corpus's italic
entries.

### 6.3 Code touch points

- `server/player.js` — rewrite `expGroupFor` (table lookup via `data/skills.js`
  annotation, hash fallback for unknown ids), `poolConversionRate` →
  `pulseFraction(p, skillId)` (skillset + low-rank accelerator + Wis),
  `gainSkillExp` (bank 100%, respect pool cap), `pulseExp` (fraction-of-pool
  drain, 20 s phase math), delete the exp-lock block **or** gate it behind a
  house-rule flag (§6.5 Q3).
- `data/skills.js` — add `group:` index per skill (single source of truth);
  export Int/Disc modifier helpers.
- `server/status.js` — FE pane pct source changes to pool/cap.
- `scripts/simulate-progression.mjs` — sim ticks advance wall clock; verify
  pacing output still meaningful (pulses now slower → circle times lengthen;
  expected and honest).
- Tests: rewrite `test/exp-groups.test.mjs` (membership stability, phase
  gating, fraction drain, accelerator, pool caps, Wis scaling);
  update `test/character.test.mjs:224` (no more instant 70%); update any
  economy/world tests that rely on immediate rank-ups.

### 6.4 Verification ladder

`node --check` on touched files → `npm test` → `npm run verify-docs` →
`node scripts/audit-data.mjs` → refresh ROADMAP P24 row + REMAINING.md §4 →
refresh §1 sims here (expect longer active-hours across all guilds; spread
shape is the fidelity signal, not the absolute hours).

### 6.5 Open questions (need approval before implementation)

1. ~~Cycle speed~~ **Resolved:** authentic 200 s cycle shipped.
2. ~~Transition~~ **Resolved:** hard cut, no legacy flag.
3. ~~Learning lockout~~ **Resolved:** removed entirely.
4. **Wis formula:** ~~accept the inferred band multiplier, or leave Wis out of
   v1~~ **Resolved:** corpus search found no exact formula; adopting the
   documented mental-stat curve shape (same piecewise table as Int — the wiki
   states Int and Wis "affect all skills equally"), cross-checked against the
   player experiment in `Wisdom (stat).md`. Implemented as a shared helper so
   the day a real formula surfaces, one function changes.
   *Source audit via the local dump (`~/elanthipedia-dump`, ns0 + ns120):*
   the live `Experience` page matches our mirror verbatim on pools/pulses/
   groups/stats — no hidden formula. Two GM posts refine the picture:
   Zeyurn 2011 ("Int and Wis affect all skills equally, diminishing returns
   not logarithmic") supports the shared curve; Armifer 2009 ("Intelligence
   has the strongest impact… Wisdom… less power in the equation") suggests
   Wis may be deliberately weaker than Int — possibly because Int also grows
   the pool while Wis only speeds draining. We keep the 2015 hard numbers
   (shared table) over the 2009 prose; revisit if playtesting shows Wis
   overweighted.

---

## 7. Implementation plan — rank cap expansion (D1)

> **Status: IMPLEMENTED (Option A).** `RANK_CAP = 1750` replaces the
> circle-linked ceiling; spell tiers are soft mastery references at DR
> thresholds (0/10/80/250/400); technique gates sit at quarters of DR's
> 25–1200 range. Commit d9838ce. The livelock that motivated speed: at
> circle 9 every skill pinned at rank 40, rank-ups stopped, TDP flow
> stopped, and an untaught breadth skill became unpurchasable — the sim's
> ranger hung for 90+ minutes as a result.

### 7.1 Source ground truth

- **Flat 1750 cap, no circle linkage.** "Ranks are capped at 1750" for every
  skill (`Experience.md`); "nothing prevents a character from training skills
  not required to circle, or in excess of circle requirements" (`Circle.md`).
  Buffs may exceed to +20% (self) / +30% (third-party).
- **What lives at high ranks:** spell-slot trees master at 55–89 slots @150
  ranks; crafting technique slots rank-gated 25–1200 (13 general); spell
  difficulty tiers ~10 / 80 / 250 / 400+ ranks; hunting-ladder teaching bands
  continue upward.

### 7.2 Our compression and its dependents

`(circle + 1) × 4` (rank 40 at c9) is enforced in `applyExpToSkill`
(`server/player.js`). Three systems are tuned to that ceiling:

| System | Compressed | DR scale | Where |
|---|---|---|---|
| Spell mastery gates | `SPELL_TIER_RANKS` 0/10/24/32/44, hard cast-gate | ~0/10/80/250/400, mastery ≠ access | `data/guilds.js:498`, gate in `server/commands/magic.js:57` |
| Technique slots | minRank 8/16/24/32 per craft skill | 13 slots gated 25–1200 | `data/forging.js` |
| Reachability tests | cap must cover next-circle bands | n/a | `test/progression-fidelity.test.mjs` |

**Key insight from the corpus:** DR does *not* hard-gate casting on ranks —
circle/knowledge unlocks the spell; ranks drive success and potency. Our hard
`minRank` cast-gate is itself a compression artifact, independent of where
the cap sits.

### 7.3 Options

**A. Authentic flat cap (recommended end-state).** `RANK_CAP = 1750` replaces
`maxRankFor(circle)`; circle requirements stay as minimums (already far below
the cap). Brakes become the authentic ones: trainer silver curve
(`40 + rank×20` → 2,040/train at rank 100), pool sizes, TDP economy, and
hunting-ladder teaching bands. Spell gates convert from hard permission to
soft mastery (success/potency scaling); technique ladders migrate to the
25–1200 data table.
*Cost:* absolute thresholds assume DR's time/economy scale. Under our silver
curve, rank-80 Primary Magic by c5 costs ≈166k trainer silvers — out of reach
without organic-casting supplements. That is *also true in DR* (intermediate
spells arrive well after their nominal circle), so this is fidelity-honest,
but it changes the c1–10 feel and demands a full sim/economy re-baseline.

**B. Two-tier cap (pragmatic middle).** Keep `(circle+1)×4` through c10 as
the breadth-enforcing training ceiling; open a documented post-capstone elder
track where the ceiling rises along a DR-shaped curve toward 175 (a
compressed 1750). Dependent gates stretch on the elder track instead of now.
*Cost:* preserves the circle-linked-cap divergence forever; two cap regimes
to document.

**C. Status quo + documentation.** Keep D1 as declared divergence. Cheapest;
leaves every high-rank system (spell trees, technique ladder, difficulty
tiers) permanently blocked at compressed scale.

### 7.4 If A lands, implementation order

1. `RANK_CAP = 1750` constant; `applyExpToSkill` uses it; delete
   `maxRankFor` (or keep as display helper).
2. Spell gates: drop the hard cast-gate; add mastery scaling to
   success/potency using DR tier thresholds as soft reference points.
3. Migrate technique `minRank` tables to the DR 25–1200 ladder (data-only).
4. Update `progression-fidelity.test.mjs` invariants: requirements-below-cap
   becomes trivial; replace with pacing assertions (sim-based).
5. Full sim re-baseline + economy pass (trainer income vs costs at ranks
   40–150); update ROADMAP P2/P24/P25 rows and FIDELITY.md.

### 7.5 Decision needed

Pick A, B, or C. A is the fidelity-first choice but is a game-feel earthquake
and should follow a playtest of the §6 learning re-shape, not precede it.
