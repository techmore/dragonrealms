# Dragon Realms — Remaining Work

Canonical handoff list. Generated from the tracker's partial rows
(`data/roadmap.js`) plus known divergences. Edit the tracker first; this
document is the narrative companion to `/ROADMAP.html`.

**State at time of writing:** 178 tracked features — 133 done / 45 partial /
0 todo. Stages 1, 2, 6, 7, 8 fully done. P1 and P2 backlogs complete.
Verification: 236 server tests, 68-check client CDP suite, data audit,
docs verification — all green.

---

## 1. Balance & playtest (blocks "done" claims more than code does)

- **Live-player pacing pass (S9).** The simulator proves all 11 guilds reach
  circle 10 but the spread is wide (Empath ≈75 active-hours vs Moon Mage
  ≈15). Needs real playtests + economy tuning before any "balanced" claim.
- **Economy sink-vs-source audit (S4).** Training costs scale, healer/tavern/
  chaffer/respec/caravan sinks exist; needs a full pass against playtest data.
- **Circles 4–10 pacing curves (S5)** are tuned but flagged for re-verify
  after every learning-system change (pulse groups, slots, techniques).

## 2. Cross-guild system polish (S11/S13)

- **Crafting technique slots** are live (rank-gated, affinity bonus) — the
  DR-scale ladder (13 slots, ranks 25–1200) awaits the rank-cap expansion.
- **Magic: analogous patterns + metaspells**; spell types (battle/ritual/
  cyclic beyond bard enchantes); cambrinth multi-device + partial-invoke.
- **Trader Lunar magic / Starlight Aura** reserved, not implemented.
- **Combat stances**: custom evasion/parry/shield point allocation.
- **PvP**: zone variants beyond lawless/standard/strict; broader moderation
  tooling beyond REPORT + circle-gap guards.

## 3. Per-guild depth (Pillars 13–22) — the main remaining content

Each guild has a fidelity v1; the pending items per guild:

| Guild | Pending |
|---|---|
| Barbarian | full berserk/form/roar families; ability-path trees; registers; ACM-check cooldown reduction; stance-point allocation effects |
| Bard | Segue (song-to-song transition), area-effect enchantes, PRACTICE VOICE, BLUFF/Recall/Showmanship, 55-slot tree |
| Cleric | Align (39 Immortals), Infusion matrices, Resurrection ritual, holy quests/visions/altar network, Enchanting affinity |
| Empath | Shift, Unity Link, Manipulate, Hand of Hodierna, Khalaen, full spellbooks |
| Moon Mage | astral travel, ALIGN/sects, Event Prediction, six spellbooks |
| Necromancer | Slip (stealth), States of Being + Outrage meters, Call/Creation rituals |
| Paladin | Armor Proficiency, Lead/Protect (party interception), soulstone/holy weapon |
| Ranger | horse wrangling (mounts), trailmarkers, raccoon companions |
| Thief | Passages (city shortcuts), lockpick carving, reputation/heat depth, voice throw, Mark/Glance |
| Trader | TELL LEAD/SPOOK/TIE/RECALL caravan commands, pack animals, tessera remote learning, Trade Route Justice, rumors/ledgers |
| Warrior Mage | Aethereal Pathways, SUMMON ADMITTANCE, talisman familiars/scrying, 89-slot tree |

Plus the shared **guild spellbook expansion**: every magic guild has 5 spells
(c1–c8 incl. signature); DR trees run 55–89 slots.

## 4. Known intentional divergences (documented, not bugs)

- Rank cap = circle × 4 (anti-grind) vs DR's 1750.
- Exp pools use DR's ten fixed pulse groups and 200 s cycle, but the overall
  game is compressed to circle 10 (see `docs/FIDELITY.md` for the full
  fidelity ledger, including remaining exp-system gaps: offline drain,
  bonus pools).
- Combat is tick-resolved with ranges/stances, not per-blow sim resolution.
- Death auto-respawns at the temple (Rite of Departure replaces DEPART).
- Thief Ignite ambush move not modeled (no fire-source item).

## 5. Suggested order for the next contributor

1. Playtest + pacing pass (unblocks S9 and several "pending playtest" rows).
2. Bard Segue + area enchantes (smallest guild tree; enchante infra exists).
3. Thief Passages + reputation (urban systems pair well with justice loop).
4. Warrior Mage pathways + Trader caravan commands (both extend live v1s).
5. Spellbook expansion as a shared system (slot budgets already live — this
   is content authoring against `data/guilds.js` spell lists).
