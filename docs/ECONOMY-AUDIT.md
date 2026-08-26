# Economy Audit — Currency, Drops, Bank, Pricing

**Scope:** full money-flow review — income sources, sinks, drop rates, bank
mechanics, item pricing. Grounded in code as of 2026-08-25 (HEAD `9481cca`),
286/286 tests passing. Findings ranked P0 (exploit/broken) → P2 (polish).

---

## 1. Income sources (per-kill model, verified against code)

Coin formula (`server/combat.js:337`): `circle × (2 + rand(4))` = avg `circle × 3.5`.
Skinning: 100% of the creature's loot list on success (skill-checked).
Gems: flat **45%** chance when the creature has a gems list.

| Tier | Creature | Coin | Skin sell | Gem exp. | Total/kill | Silver/hr @30s/kill |
|---|---|---|---|---|---|---|
| c1 | rat | 4 | 4 | — | ~8 | ~900 |
| c3 | great_rat | 11 | 7 | 27 | ~45 | ~5,300 |
| c5 | bandit | 18 | 26 | 45 | ~88 | ~10,600 |
| c7 | wraith | 25 | 130 | 90 | ~245 | ~29,000 |
| c10 | dread_knight | 35 | 154 | 225 | ~414 | ~50,000 |

Other income: quests `40 + circle×35` (deliveries ×0.7), strongbox picking
`20 + circle×5 + rand(20)` at lockpicking-scaled odds, scavenge at the Middens
(diamond 2% / garnet 8% rolls), commodity-pit timing trades.

## 2. Sinks

| Sink | Cost | Notes |
|---|---|---|
| Shop purchases | 100% of value | Full-price buys vs 50% sells — the classic spread |
| Healer | 10% of missing HP (min 5) | **Undercut by free rest — see F1** |
| Repair | `missing% × value ÷ 100 × 2` | Scales with item value; fine |
| Ferry | 20 silvers flat | Trivial at any tier |
| Rite of Departure | 10 × circle | Once per death; reasonable |
| Coin toss | 5/play | Minor |
| Auction | **no fee** | See F3 |
| Commodity pits | zero spread | Zero-sum, not a sink — see F4 |
| Justice fines/debts | variable, 25%/sighting garnish | Only bites criminals |

## 3. Findings

### P0 — real problems

**F3 resolution note (2026-08-25):** tier variants shipped — great_rats drop
`dire_rat_pelt` (22s), fire drakes drop `drake_scale` (190s), iron_ore padding
removed from c7/c8/c10 tables (captains now carry organ_vials, revenants a
second sigil, dread knights a silver ring), and both hide-buyers accept the
new items. Two deliberate flats remain: `wraith_essence` (c7 wraith / c8
revenant) and `silver_ring` (c7 captain / c8 revenant) — shared trophy drops
where the higher-tier creature also carries strictly better additional loot.

**F1. Free rest makes the paid healer obsolete.**
Tavern rest heals 4.5% maxHP per 2 s tick (~45 s to full) at zero cost
(`server/wilds.js:208`). The healer charges 10% of missing HP for an instant
fill. A rational player walks to any of the four taverns and waits 45 seconds.
The healer sink is dead code economically.
*Fix options:* (a) tavern rest heals slower than wild rest but costs silver per
tick ("the keeper expects coin for the hearth"), or (b) rest caps at 70–80% and
only the healer (or magic) reaches 100%. Option (b) preserves the DR feel that
resting is free but incomplete.

**F2. Expired auction lots destroy items and silently eat proceeds.**
`auctionPrune()` (server/game.js:619) filters lapsed listings out of memory —
the seller's items are gone forever, unpaid. Worse: `this.auctions` is
in-memory only (`game.js:54`), so a world restart wipes every open lot too.
This is item destruction disguised as a listing timeout.
*Fix:* return items to the seller's inventory/bank on prune (offline → vault or
bank credit), and persist listings to SQLite so restarts don't eat them.

**F3. Flat-value loot across tiers breaks the risk/reward curve.**
The repo rule ("skin values must strictly increase with source circle") is
violated by shared drops:
- `rat_pelt` (8s) drops from both rat (c1) and great_rat (c3) — 5.7× the exp,
  identical reward.
- `strongbox` (item value 20s) drops from kobold c2 through river_thug c5.
- `iron_ore` (15s) is top-line loot on troll c6, bandit_captain c7, revenant
  c8 — padding on otherwise good tables.
- `cinder_scale` (120s) identical from cinder_lizard c5 and fire_drake c6.
Per-tier creatures should carry tier-appropriate variants (great_rat pelt >
rat pelt; drake scale > lizard scale), or high-circle creatures should roll
on a richer table.
*Fix:* per-creature loot variants with circle-scaled values, or a value
multiplier applied at drop time by creature circle.

### P1 — worth doing

**F4 resolution (2026-08-25):** failed picks at Lockpicking below rank 5 leave
the box intact (only practiced hands jam the mechanism), which keeps pick-EV
above the 20s sell floor for fresh thieves. Payout still scales with picker
circle — boxes stack, so per-box provenance isn't tracked.

**F5 resolution (2026-08-25):** auction sales now pay a 3% broker fee
(min 1s) to the hall. Seller notifications and offline bank payouts use the
net proceeds; buyers see no change.

**F6 resolution (2026-08-25):** commodity pits gained a house edge — buys
clear at +8%, sells at −8%. Riding the 48-minute sine remains profitable;
instant round-trips now lose ~16% instead of being free.

**F8 resolution (2026-08-25):** scavenge cooldown raised 15s → 60s, diamond
tail thinned 2% → 0.5%, garnet 8% → 4%. Expected value per minute at low
circles is now clearly below hunting, with gems kept as a lottery.

**F4. Strongbox economics are inverted.**
A strongbox sells for 20s unpicked but yields `20 + circle×5 + rand(20)`
(≈25–45s at c1–c5) when picked. Correct incentive direction (pick > sell) but
the margin is thin at low lockpicking (40% base chance, box consumed either
way — expected value can dip below the 20s sell floor for fresh characters).
Consider: failed picks leave the box intact at low skill, or scale box coin
with source-circle rather than picker-circle.

**F5. No auction fee = no silver sink at endgame.**
Player-to-player trade is the dominant endgame economy and it's completely
free (posting, buying, no tax). A small broker fee (2–5%) on sale would make
the auction house a meaningful late-game sink without hurting early play.

**F6. Commodity pits have zero spread and deterministic prices.**
Buy price == sell price at the same moment (`commodityPrice` is a pure sine
of wall time). Profit is purely predictive, not costly; there is no house
edge. A buy premium (buy at price+X%, sell at price−X%) would make the pit a
real sink for impatient traders and keep the arbitrage game for skilled ones.

### P2 — polish

**F7. Coin formula is linear in circle while gear cost is superlinear.**
c10 gear (dragonsteel 2600–3000) costs ~85× a c1 weapon (club 15) but c10
income is only ~55× c1 income. Fine directionally, but combined with F3 fixes
it's worth re-checking that a c10 character can *maintain* endgame gear
(repair on a 3000-value sword at 50% wear = 3000s — steep).

**F8. Scavenge table skews rich for its cost.** 15s cooldown, ~35% hit chance
at modest appraisal, 2% diamond (500s). Expected value ≈ 30–60s/min for a
low-circle character standing still — competitive with hunting for zero risk.
Either lengthen the cooldown or shift the table toward iron_ore/herbs.

**F9. Bank has no capacity cost or interest.** Free unlimited storage plus
free item vault is fine for now, but there's no reason to ever use the vault
over carrying everything except death insurance. A tiny vault fee per deposit
(or interest on held bank silver to reward depositing) would give the bank a
role beyond "safe number."

## 4. What's already right

- The 100%-price-buy / 50%-price-sell shop spread is the correct backbone.
- Repair cost scaling off item value is elegant — expensive gear is expensive
  to maintain, which is a natural endgame sink.
- Quest pay scaling with target circle keeps quests relevant at every tier.
- Gem tiering (garnet 60 → sapphire 140 → emerald 260 → diamond 500) is clean
  and matches creature circles well after F3 fixes.
- Justice debts + guard garnishment is a genuinely good slow-release sink.

## 5. Recommended order

1. ~~**F2 (auction loss bug)**~~ ✅ shipped — SQLite escrow + vault returns.
2. ~~**F1 (rest vs healer)**~~ ✅ shipped — rest caps at ~80%/85%, healer
   needed for the last fifth.
3. ~~**F3 (flat loot values)**~~ ✅ shipped — dire_rat_pelt, drake_scale,
   iron_ore padding removed.
4. ~~F4/F5/F6 as one "trading fees" pass~~ ✅ shipped (plus F8 scavenge).
5. F7–F9 revisit after a real playtest produces spending data.
