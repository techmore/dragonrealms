# Dragon Realms — Complete Skills Reference

Clean-room skill taxonomy modeled on the source game's full list: six skillsets
plus guild skills, with sub-skills and governing stats. The interactive
reference lives at `/SKILLS.html` and is **generated from the live game data**
(`node scripts/build-skills-doc.mjs`), so it can never drift from the code.

---

## Skillsets at a glance

| Skillset | Count | Roster |
|---|---|---|
| Weapon | 17 | Small Edged, Medium Edged, Large Edged, Two-Handed Edged, Small Blunt, Two-Handed Blunt, Polearms, Staves, Brawling, Offhand Weapon, Melee Mastery, Missile Mastery, Bows, Crossbows, Slings, Light Thrown, Heavy Thrown, Parry Ability |
| Armor | 6 | Shield Usage, Light Armor, Chain Armor, Brigandine, Plate Armor, Defending |
| Magic | 15 | Attunement, Primary Magic, Arcana, Augmentation, Debilitation, Targeted Magic, Offensive Magic, Defensive Magic, Warding Magic, Utility Magic, Healing Magic, Holy Magic, Moon Magic, War Magic, Illusion, Necromancy, Sorcery, Summoning |
| Survival | 12 | Evasion, Athletics, Climbing, Swimming, Perception, Hunting, Tracking, Outdoorsmanship, Hiding, Stealth, Locksmithing, Thievery, First Aid, Skinning |
| Lore | 11 | Appraisal, Alchemy, Engineering, Forging, Enchanting, Outfitting, Scholarship, Performance, Tactics, Herbal Lore, Elemental Lore, Necromancy Lore, Astrology, Theurgy |
| Guild | 8 | Empathy, Expertise, Scouting, Backstab, Bardic Lore, Conviction, Thanatology, Trading |

> **Note on guild skills:** Astrology (Moon Mage), Theurgy (Cleric), and
> Summoning (Warrior Mage) live in the Magic skillset but are also guild-only
> skills in the source. In Dragon Realms they are flagged `guildSkill` and can
> only be trained by the owning guild.

---

## Weapon Skillset

| Skill | Range | Sub-skills | In-game training |
|---|---|---|---|
| **Small Edged** | Melee | Knives, Daggers, Hatchets, Hand Axes, Short Swords, Rapiers, Scimitars | Fight with daggers/short swords |
| **Medium Edged** | Melee | Hand-and-a-half Swords, Long Swords | Fight with long swords |
| **Large Edged** | Melee | Broadswords, Longswords, Battle Axes | Fight with broadswords |
| **Two-Handed Edged** | Melee | Greatswords, Greataxes, Flamberges, Claymores | Fight with greatswords |
| **Small Blunt** | Melee | Clubs, Gavels, Mallets, Maces, War Hammers | Fight with maces/clubs |
| **Two-Handed Blunt** | Melee | War Mattocks, Mauls | Fight with mauls |
| **Polearms** | Melee/Pole | Spears, Pikes, Halberds, Scythes, Glaives, Voulges | Fight with polearms |
| **Staves** | Melee/Pole | Nightsticks, Quarterstaves | Fight with staves |
| **Brawling** | Melee | Brass Knuckles, Spike Knuckles, Elbow Spikes, Knee Spikes, Footwraps | Fight unarmed |
| **Offhand Weapon** | Melee/Ranged | — | Fight with a left-hand weapon |
| **Melee Mastery** | Meta | — | General melee skill; boosts lower melee weapon skills |
| **Missile Mastery** | Meta | — | General ranged skill; boosts lower ranged weapon skills |
| **Bows** | Ranged | Shortbows, Longbows, Composite Bows | Fight with bows (consumes arrows) |
| **Crossbows** | Ranged | Light Crossbows, Heavy Crossbows, Arbalests, Stonebows | Fight with crossbows (consumes bolts) |
| **Slings** | Ranged | Slings, Slingshots, Staff Slings | Fight with slings |
| **Light Thrown** | Ranged | Throwing Knives, Throwing Blades, Bolas, Boomerangs, Light Throwing Axes | Fight with thrown knives |
| **Heavy Thrown** | Ranged | Throwing Hammers, Hurling Axes, Throwing Spears | Fight with hurling axes |
| **Parry Ability** | Melee/Pole | — | Fend off incoming melee attacks |

## Armor Skillset

| Skill | Sub-skills | In-game training |
|---|---|---|
| **Shield Usage** | Small, Medium, Large Shields | Take hits with a shield equipped |
| **Light Armor** | Cloth, Leather, Bone | Take hits in light armor |
| **Chain Armor** | Mail, Chain, Ring | Take hits in chain armor |
| **Brigandine** | Lamellar, Brigandine, Scale | Take hits in brigandine |
| **Plate Armor** | Heavy Plate, Plate, Light Plate | Take hits in plate armor |
| **Defending** | — | General armor proficiency; grows with any armor training |

## Magic Skillset

| Skill | In-game training |
|---|---|
| **Attunement** | Cast any spell |
| **Primary Magic** | General facility; raised alongside any casting |
| **Arcana** | Magical devices (future) |
| **Augmentation** | Buff spells (e.g. Hunter's Aspect, Righteous Aegis) |
| **Debilitation** | Crippling spells (e.g. Grave Mist, Rot) |
| **Targeted Magic** | Offensive spells |
| **Offensive Magic** | Direct damage spells |
| **Defensive Magic** | Wards and protection (e.g. Guardian Ward, Holy Bulwark) |
| **Warding Magic** | Damage-mitigation spells |
| **Utility Magic** | Non-combat spells (e.g. Camouflage) |
| **Healing Magic** | Mending spells (e.g. Soothe, Rekindle) |
| **Holy Magic** | Cleric/Paladin faith magic |
| **Moon Magic** | Lunar magic |
| **War Magic** | Elemental battle magic |
| **Illusion** | Phantasmal magic |
| **Necromancy** | Death magic |
| **Sorcery** | Casting outside your guild's domain |
| **Summoning** | Guild skill (Warrior Mage) |

## Survival Skillset

| Skill | Governing stats | In-game training |
|---|---|---|
| **Evasion** | Reflex | Dodge attacks in combat |
| **Athletics** | Str, Sta | Climb and swim |
| **Climbing** | — | Scale obstacles |
| **Swimming** | — | Move through water |
| **Perception** | Wisdom | `hunt`, `track` |
| **Hunting** | — | Stalk prey |
| **Tracking** | — | `track` command |
| **Outdoorsmanship** | Int, Wis | `forage` command |
| **Hiding** | — | Melt out of sight (Thief) |
| **Stealth** | Dis, Agi, Ref | Move unseen; backstab |
| **Locksmithing** | Agi, Ref | Disarm and pick locks |
| **Thievery** | Agi, Dis | Pilfer coins and goods |
| **First Aid** | — | Use salves, herbs, potions |
| **Skinning** | Agi, Int, Dis | `skin` your kills |

## Lore Skillset

| Skill | Sub-skills | In-game training |
|---|---|---|
| **Appraisal** | — | Judge items |
| **Alchemy** | Reactants, Remedies | `craft` at the Tilted Retort |
| **Engineering** | Carving, Shaping, Tinkering | Future crafting |
| **Forging** | Blacksmithing, Armorsmithing, Weaponsmithing | Future crafting |
| **Enchanting** | — | Future crafting |
| **Outfitting** | Artistry, Jewelry Making, Tailoring | Future crafting |
| **Scholarship** | — | Study books |
| **Performance** | Instruments, Voice | `perform`/`sing` |
| **Tactics** | — | Combat maneuvers |
| **Herbal Lore** | — | Identify plants |
| **Elemental Lore** | — | Elemental knowledge |
| **Necromancy Lore** | — | Grave knowledge |
| **Astrology** | — | Guild skill (Moon Mage) |
| **Theurgy** | — | Guild skill (Cleric) |

## Guild Skills

Guild skills are exclusive to their guild and train through guild activity.

| Skill | Guild | Trains via |
|---|---|---|
| **Empathy** | Empath | Casting (Soothe, Mending Touch, Rekindle) |
| **Expertise** | Barbarian | Berserk, maneuvers |
| **Scouting** | Ranger | `hunt` |
| **Backstab** | Thief | `backstab` |
| **Bardic Lore** | Bard | Casting (Chime, Lullaby, Finale) |
| **Conviction** | Paladin | Casting (Smite, Wrath, Bulwark) |
| **Thanatology** | Necromancer | Casting (Bone Spear, Blood Harvest) |
| **Trading** | Trader | `sell` at shops |
| **Astrology** | Moon Mage | Casting (Moon Bolt, Stellar Cascade) |
| **Theurgy** | Cleric | Casting (Sacred Flame, Judgement) |
| **Summoning** | Warrior Mage | Casting (Fire Shard, Cataclysm) |

All guild skills are trainable at your guild hall (`train <skill>`) and never
count toward circle requirements.

---

## Circle requirements

Circling uses the primary/secondary skill lists per guild (see the
**Circle-10 Requirement Matrix** in `ROADMAP.md`). Guild skills are optional
flavor progression, not required to circle.
