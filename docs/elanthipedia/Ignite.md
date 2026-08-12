# Ignite

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=-
|minprep=5
|castcap=100
|minskill=10
|maxskill=600
|minduration=4
|maxduration=20
|validtarget=Item
|guild=Warrior Mage
|magic=Elemental Magic
|spellbook=Fire Manipulation
|prereqs=[[Fire Shards]] or [[Elementalism]]
|slot=2
|illegal=no
|corrupt=no
|desc=The Ignite spell adds a touch of fire to your weapon to help you strike down your enemies.  Ignite's effects will even bolster weapons that already have a certain variety of fire damage, though not to the extent that it enhances the mundane sort.  Of course, given the spell's nature, its effectiveness can be lost in water or if the weapon strays from your hand.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Adds fire damage proportional to the highest physical damage stat of the weapon
|messaging=Tendrils of flame dart along your hand toward an etched steel bastard sword, which suddenly bursts into flames!
'''FOCUS'''<br/>
You focus your magical senses on a ''<weapon>''.<br/>
Flames dance along the surface of the weapon.  You sense that your ''<weapon>'' has been magically enhanced with fire.<br/>
Roundtime: 6 sec.<br/>
|sig=No
|diff=basic
|source=standard
|type=utility
|ctype=standard
}}
==Weather-related atmospherics==
Wisps of vapor rise as raindrops sizzle on contact with your ''<weapon>''.<br />
Flakes of snow melt then sizzle as they near your ''<weapon>''.<br />
A few swirling eddies of flame flit up from your ''<weapon>'', quickly consuming themselves as they rise.<br />

==Special Weapon Swap Description==
You spin your sword off to one side, the flames grunting out a turbulent 'Whoomph' before you settle in to use it as a heavy edged weapon.<br />
The flames dancing along your deep crimson sword suddenly extinguish.
 
Your deep crimson sword suddenly bursts into flames.

==Notes==
*This spell creates two effects: one on the targeted weapon and one on yourself.
:*The effect applied to the weapon is the actual damage enhancing effect and lasts as long as you hold the weapon in your hand or until the spell's effect on yourself wears off, whichever happens first. Because this effect is applied by a pulsing mechanic, the effect on the weapon takes a few seconds to wear off in either case.
:*The effect that is applied to yourself is the pulsing mechanic that applies the damage enhancing effect to the targeted weapon. It is this effect that reapplies the fire damage effect to a weapon after it returns to your hand if the weapon's effect had worn off. The duration of this pulsing effect on yourself shows up in the normal {{tt|PERCEIVE}} list.
*The fire damage added by Ignite will appear on the weapon when using {{com|appraise}}.
*The proportional damage added is only based on the physical stats of the weapon, not the elemental stats.
:*For [[elemental weapon]]s this has the implication that weapons {{com|shape}}d to fire, ice or electricity will have their damage increased proportional to the second highest physical stat of the stone form since the highest stat is 100% converted to the elemental damage type.
*Swimming through rooms with deep enough water will not dispel Ignite, but will extinguish the weapon until dry land is reached.
*Only one weapon may be affected at once. To ignite a different weapon, you must {{com|RELEASE}} the spell.
*Aimed weapons and brawling weapons may not be Ignited.
*Ignited weapon strikes can ignite [[Naphtha]] and will trigger [[Mark of Arhat]].

{{RefAl}}