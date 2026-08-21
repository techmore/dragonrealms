# Dragon Realms — Complete Skills Reference

Clean-room skill taxonomy modeled on the source game's full list: six skillsets
plus guild skills, with sub-skills and governing stats.

> **Generated from the live game data** by `node scripts/build-skills-doc.mjs`
> (also emits the interactive `/SKILLS.html`) — edit `data/skills.js` /
> `data/guilds.js`, never this file.

## Weapon Skillset

### Small Edged — Melee

Fight with daggers, short swords, and rapiers.

Sub-skills: Knives, Daggers, Hatchets, Hand Axes, Short Swords, Rapiers, Scimitars
> _primary for Bard, Empath, Moon Mage, Necromancer, Thief, Trader_

### Medium Edged — Melee

Fight with long swords and hand-and-a-half blades.

Sub-skills: Hand-and-a-half Swords, Long Swords
> _primary for Bard, Cleric, Moon Mage, Paladin, Thief, Warrior Mage · secondary for Ranger_

### Large Edged — Melee

Fight with broadswords and battle axes.

Sub-skills: Broadswords, Longswords, Battle Axes
> _primary for Barbarian, Paladin, Ranger_

### Two-Handed Edged — Melee

Fight with greatswords and greataxes.

Sub-skills: Greatswords, Greataxes, Flamberges, Claymores
> _primary for Barbarian_

### Small Blunt — Melee

Fight with clubs, gavels, and maces.

Sub-skills: Clubs, Gavels, Mallets, Maces
> _primary for Cleric, Empath, Necromancer, Trader, Warrior Mage · secondary for Barbarian_

### Large Blunt — Melee

Fight with morning stars, war hammers, and heavy maces.

Sub-skills: Morning Stars, War Hammers, Ball and Chains, Heavy Maces
> _secondary for Barbarian_

### Two-Handed Blunt — Melee

Fight with mauls and war mattocks.

Sub-skills: War Mattocks, Mauls
> _primary for Barbarian_

### Polearms — Melee/Pole

Fight with spears, halberds, and glaives.

Sub-skills: Spears, Pikes, Halberds, Scythes, Glaives, Voulges

### Staves — Melee/Pole

Fight with quarterstaves.

Sub-skills: Nightsticks, Quarterstaves

### Brawling — Melee

Fight unarmed.

Sub-skills: Brass Knuckles, Spike Knuckles, Elbow Spikes, Knee Spikes, Footwraps
> _primary for Trader · secondary for Thief_

### Offhand Weapon — Melee/Ranged

Fight with a weapon held in the left hand.

### Melee Mastery — Meta

A general skill with melee weapons; boosts any melee weapon skill below it.

### Missile Mastery — Meta

A general skill with ranged weapons; boosts any ranged weapon skill below it.

### Bows — Ranged

Fight with bows (consumes arrows).

Sub-skills: Shortbows, Longbows, Composite Bows
> _primary for Ranger_

### Crossbows — Ranged

Fight with crossbows (consumes bolts).

Sub-skills: Light Crossbows, Heavy Crossbows, Arbalests, Stonebows

### Slings — Ranged

Fight with slings.

Sub-skills: Slings, Slingshots, Staff Slings

### Light Thrown — Ranged

Fight with thrown blades and knives.

Sub-skills: Throwing Knives, Throwing Blades, Bolas, Boomerangs, Light Throwing Axes
> _secondary for Barbarian_

### Heavy Thrown — Ranged

Fight with hurling axes and throwing spears.

Sub-skills: Throwing Hammers, Hurling Axes, Throwing Spears

### Parry Ability — Melee/Pole

Fend off incoming melee and pole attacks.
> _secondary for Paladin_

---

## Armor Skillset

### Shield Usage

Take hits while a shield is equipped.

Sub-skills: Small Shields, Medium Shields, Large Shields
> _primary for Paladin · secondary for Cleric_

### Light Armor

Take hits while wearing light armor.

Sub-skills: Cloth, Leather, Bone
> _primary for Barbarian, Bard, Empath, Moon Mage, Ranger, Thief, Trader_

### Chain Armor

Take hits while wearing chain armor.

Sub-skills: Mail, Chain, Ring
> _primary for Cleric, Necromancer, Warrior Mage_

### Brigandine

Take hits while wearing brigandine.

Sub-skills: Lamellar, Brigandine, Scale

### Plate Armor

Take hits while wearing plate armor.

Sub-skills: Heavy Plate, Plate, Light Plate
> _primary for Paladin_

### Defending

General armor proficiency; grows with any armor training.

---

## Combat Manipulation

### Martial Arts

Mastered unarmed forms.

### Warding

Turn aside blows with disciplined parries.

---

## Survival Skillset

### Evasion

Dodge attacks in combat.

Governing stats: Reflex
> _primary for Barbarian, Empath, Ranger, Thief · secondary for Bard, Moon Mage, Trader, Warrior Mage_

### Athletics

Climb and swim more surely.

Governing stats: Str, Sta

### Climbing

Scale obstacles.
> _secondary for Ranger_

### Swimming

Move through water.
> _secondary for Ranger_

### Perception

Hunt, track, and spot hidden things.

Governing stats: Wisdom
> _primary for Bard, Trader · secondary for Barbarian, Moon Mage, Necromancer, Ranger, Thief_

### Hunting

Stalk prey; grows alongside combat kills.

### Tracking

Use the "track" command to read the wilds.
> _primary for Ranger_

### Outdoorsmanship

Use the "forage" command in the wilds.

Governing stats: Int, Wis

Sub-skills: Foraging, Mining, Fishing, Animal Lore
> _primary for Ranger · secondary for Barbarian, Trader_

### Hiding

Melt out of sight.
> _primary for Thief_

### Stealth

Move unseen; backstabs strike from stealth.

Governing stats: Dis, Agi, Ref
> _primary for Thief_

### Locksmithing

Disarm and pick locks.

Governing stats: Agi, Ref
> _secondary for Thief_

### Thievery

Pilfer coins and goods.

Governing stats: Agi, Dis

### First Aid

Use salves, herbs, and potions.
> _secondary for Empath_

### Skinning

Skin the creatures you fell.

Governing stats: Agi, Int, Dis

---

## Defense

### Physical Fitness

Grow through combat and survival.
> _primary for Barbarian · secondary for Bard, Cleric, Empath, Necromancer, Paladin, Ranger, Trader, Warrior Mage_

### Endurance

Grow through long fights and hard work.

---

## Magic Skillset

### Attunement

Harness mana — gained by casting any spell.
> _primary for Empath, Moon Mage, Necromancer, Warrior Mage · secondary for Bard, Cleric, Paladin_

### Primary Magic

General facility with magic; raised alongside any casting.

### Arcana

Facility with magical devices.

### Augmentation

Spells that enhance abilities and stats.

### Debilitation

Combat spells that cripple or curse.

### Targeted Magic

Offensive spells that damage enemies.

### Offensive Magic

Direct damage spells.
> _primary for Warrior Mage · secondary for Necromancer_

### Defensive Magic

Wards and protective spells.
> _primary for Paladin · secondary for Cleric, Moon Mage, Warrior Mage_

### Warding Magic

Spells that prevent or mitigate damage.

### Utility Magic

Useful non-combat spells.
> _primary for Bard · secondary for Empath, Moon Mage, Necromancer, Trader_

### Healing Magic

Mending and restoring spells.
> _primary for Cleric, Empath_

### Holy Magic

Faith-wrought cleric and paladin magic.
> _primary for Cleric, Paladin_

### Moon Magic

Lunar and stellar magic.
> _primary for Moon Mage_

### War Magic

Elemental battle magic.
> _primary for Warrior Mage_

### Illusion

Deceptive and phantasmal magic.
> _primary for Bard_

### Necromancy

Magic of death and decay.
> _primary for Necromancer_

### Sorcery

Casting outside your guild's domain; risks backlash.

### Summoning

Controlling familiars and summoned weapons.
> _guild skill (Warrior Mage)_

### Inner Fire

The fury that fuels barbarian powers; grows in battle.

### Astrology

Read the celestial spheres.
> _primary for Moon Mage · guild skill (Moon Mage)_

### Theurgy

Ritual devotion and faith magic.
> _primary for Cleric · secondary for Paladin · guild skill (Cleric)_

---

## Lore Skillset

### Herbal Lore

Identify and gather useful plants.
> _secondary for Empath_

### Appraisal

Judge the quality and value of items.
> _primary for Trader · secondary for Bard, Thief_

### Alchemy

Craft potions at the Tilted Retort.

Sub-skills: Reactants, Remedies

### Engineering

Carve, shape, and tinker mechanical items.

Sub-skills: Carving, Shaping, Tinkering

### Forging

Smith metal into weapons and armor.

Sub-skills: Blacksmithing, Armorsmithing, Weaponsmithing

### Enchanting

Craft enchanted magical items.

### Outfitting

Tailor cloth, leather, and jewelry.

Sub-skills: Artistry, Jewelry Making, Tailoring

### Scholarship

Study books, tomes, and teachers.

### Performance

Play music and perform.

Sub-skills: Instruments, Voice

### Tactics

Gain advantage through combat maneuvers.

### Elemental Lore

Knowledge of the elements.
> _secondary for Warrior Mage_

### Necromancy Lore

Knowledge of death and the grave.
> _primary for Necromancer_

---

## Guild Skills

### Empathy

Feel and mend the life force of others.
> _guild skill (Empath)_

### Expertise

Barbarian analyze and combat mastery.
> _guild skill (Barbarian)_

### Scouting

Ranger trails and scouting reports.
> _guild skill (Ranger)_

### Backstab

Strike hidden foes from the shadows.
> _guild skill (Thief)_

### Bardic Lore

Bardic songs, whistling, and recall.
> _guild skill (Bard)_

### Conviction

Paladin faith and smite.
> _guild skill (Paladin)_

### Thanatology

Necromancer rituals of the grave.
> _guild skill (Necromancer)_

### Trading

Deal, bargain, and move silver.
> _guild skill (Trader)_

---

## Circle requirements

Circling uses the authentic DR band tables per guild (see `ROADMAP.md`).
Guild skills are optional flavor progression, not required to circle.
