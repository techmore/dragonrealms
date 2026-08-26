# Reference: The Crossing armor shops — Tembeg's Armory

Facts extracted from Elanthipedia page "Tembeg's Armory" (clean-room note;
prose not copied — inventory/prices only). Kronars-only shop.

Shop: Province Zoluren, town The Crossing, room 19601, owner Tembeg
(Gor'Tog smith, no bargaining — flat prices).
Surfaces: plate / brigandine(scale) / chain / leather / cloth armor +
shields. Workroom repairs; bellows room = Strength training area.

Price ladder pattern (Kronars): cloth < leather < chain < scale < plate,
per equivalent coverage slot. Full-body piece ≈ 1,320–1,350 across all
five classes (nearly flat); per-slot pieces rise with material class.

## Plate (obsidian knight)
| Item | Slots | Price |
|---|---|---|
| light plate greaves | legs | 212 |
| plate gauntlets | hands | 62 |
| plate vambraces | arms | 100 |
| plate fauld | abdomen | 400 |
| light full plate | torso/arms/legs | 1350 |
| light plate aventail | neck | 87 |
| light plate mask | eyes | 192 |
| bascinet | head/eyes | 75 |
| metal armet | head/neck/eyes | 75 |

## Brigandine → "metal scale" (counter)
| Item | Slots | Price |
|---|---|---|
| metal scale greaves | legs | 206 |
| metal scale gloves | hands | 50 |
| metal scale vambraces | arms | 87 |
| metal scale tasset | abdomen | 318 |
| metal scale shirt | torso/arms | 393 |
| metal scale hauberk | torso/arms/legs | 1337 |
| metal scale aventail | neck | 81 |
| metal scale mask | eyes | 137 |
| metal scale helm | head/neck | 62 |
| metal scale balaclava | head/neck/eyes | 62 |

## Chain (rack)
| Item | Slots | Price |
|---|---|---|
| metal chain greaves | legs | 200 |
| metal chain gloves | hands | 43 |
| metal chain vambraces | arms | 81 |
| metal chain tasset | abdomen | 312 |
| metal chain shirt | torso/arms | 387 |
| metal chain hauberk | torso/arms/legs | 1331 |
| metal chain aventail | neck | 75 |
| metal chain mask | eyes | 110 |
| metal chain helm | head/neck | 58 |
| metal chain balaclava | head/neck/eyes | 58 |

## Leather ("rugged", box)
| Item | Slots | Price |
|---|---|---|
| rugged greaves | legs | 193 |
| rugged gloves | hands | 31 |
| rugged vambraces | arms | 75 |
| rugged leather tasset | abdomen | 312 |
| rugged leather jerkin | torso | 381 |
| rugged leathers | torso/arms/legs | 1325 |
| rugged leather aventail | neck | 68 |
| rugged leather mask | eyes | 68 |
| rugged leather cowl | head/eyes/neck | 56 |

## Cloth (quilted, bin)
| Item | Slots | Price |
|---|---|---|
| quilted cloth pants | legs | 187 |
| quilted cloth gloves | hands | 38 |
| quilted cloth vambraces | arms | 75 |
| quilted cloth tasset | abdomen | 306 |
| quilted cloth shirt | torso/arms | 375 |
| quilted cloth hauberk | torso/arms/legs | 1320 |
| quilted cloth aventail | neck | 68 |
| quilted cloth mask | eyes | 56 |
| quilted cloth hood | head/neck | 50 |

## Shields (hooks)
| Item | Size / hindrance | Price |
|---|---|---|
| metal target shield | small, trivial | 250 |
| metal oval shield | medium, mild | 312 |
| metal kite shield | large, noticeable | 437 |
| metal tower shield | large, significant | 562 |

Implementation notes for data/shops.js + data/items.js:
- Hindrance values map to our shield size field; slot lists map onto
  EQUIP slots incl. multi-region pieces (torso/arms/legs hauberks etc.)
  — check how player.js equipItem handles multi-slot armor before wiring.
