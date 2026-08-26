# Reference: The Crossing weapon shop — Milgrym's Weapons

Facts from Elanthipedia "Milgrym's Weapons" (clean-room: inventory/prices
only, no prose copied). Kronars-only. Room 19801, owner Milgrym.
Weights shown in parentheses are stones.

## Small & Large Edged + Blunt (pine table)
| Item | Type (stones) | Price |
|---|---|---|
| wide-bladed dagger | light edged (10) | 200 |
| short-handled kris | light edged (20) | 250 |
| refurbished short sword | light edged (15) | 337 |
| recurved cavalry sabre | medium edged (30) | 562 |
| watered steel scimitar | medium edged (30) | 562 |
| basket-hilt cutlass | medium edged (35) | 575 |
| stout broadsword | heavy edged (35) | 650 |
| sturdy oaken club | light blunt (30) | 112 |
| lead-weighted elkhorn bludgeon | light blunt (25) | 562 |
| heavy flanged mace | medium blunt (40) | 206 |
| ironwood-hafted war hammer | medium blunt (40) | 375 |

## Ranged + Ammunition (pine counter)
| Item | Type | Price |
|---|---|---|
| leather-gripped yew shortbow | short bow | 162 |
| leather-gripped yew longbow | long bow | 562 |
| lever-drawn light crossbow | light crossbow | 650 |
| boar-tusk arrows ×5 | bow ammo | 62 |
| cougar-claw arrows ×5 | bow ammo | 75 |
| crossbow bolts ×15 | xbow ammo | 112 |
| narrow-headed spear | heavy thrown/pike (50) | 250 |
| triple-weighted bola | light thrown/light blunt (25) | 250 |

## Two-Handed (rack)
| Item | Type (stones) | Price |
|---|---|---|
| double-bit greataxe | twohanded edged (60) | 675 |
| scrimshaw-handled claymore | twohanded edged (70) | 675 |
| oak-hafted halberd | halberd (60) | 562 |
| iron-studded footman's flail | twohanded blunt (65) | 500 |
| pine-handled sledgehammer | heavy blunt (50) | 625 |
| etched greathammer | heavy blunt (50) | 681 |
| long-bladed cinquedea | heavy edged (40) | 662 |

## Misc (bin)
| Item | Type (stones) | Price |
|---|---|---|
| stalwart ironwood quarterstaff | quarter staff (50) | 112 |
| steel-banded deobar cane | quarter staff (40) | 562 |
| ash-handled pike | pike (75) | 637 |

## Accessories / Brawling (bench)
| Item | Price |
|---|---|
| brass knuckles | 575 |
| silver-chased elbow spikes | 575 |
| polished steel parry stick | 1250 |

Implementation notes:
- Weapon types here map to our skill names: light_edged, medium_edged,
  heavy_edged, twohanded_edged, light_blunt, medium_blunt, heavy_blunt,
  twohanded_blunt, quarter_staff, halberd, pike, short_bow, long_bow,
  light_crossbow, sling, light_thrown, heavy_thrown, brawling (knuckles/
  spikes), parry_stick (parry infra).
- Our current hunt-script BUY ladder buys club(15)/hand_axe(65)/
  short_sword(80)/forged_short_sword(150) — those prices look like a
  different (generic) price set; real smith prices above should win for
  fidelity where items overlap (club=112, short sword=337 etc.). Reconcile
  with data/items.js before changing the script ladder.
