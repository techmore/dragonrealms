# Sorrow (spell)

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{disambig2|Sorrow}}
{{Spell
|abbrev=sorrow
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=-
|validtarget=PC, Creature
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Psychic Projection
|prereqs=[[Mental Blast]]
|slot=3
|illegal=?
|corrupt=no
|desc=Crystal magic is a form of Lunar Magic largely abandoned with the genocide of the Trabe in the distant past.  Kept alive in limited form by the Monks of the Crystal Hand and recently gifted by the Arbiter in Darkness for the Traders' Guild, the Moon Mage Guild has likewise renewed their interest in the old ways.

Sorrow conjures a large crystal that amplifies psychic energy to dangerous levels.  The crystal discharges psychokinetic rays at a target of the magician's choosing, resulting in potentially fatal injuries to the brain.  The crystal and unleashed energy are both 'semi-real', psychic in nature but in form close enough to piezoelectricity to be defended against by shields and wards capable of affecting electricity.
|buffs=No buffs
|debuffs=Balance
|dtype=Cold damage, Electrical damage
|htype=No heal
|poststring=No
|messaging=You hold out your left hand, palm facing up.<br>
A blinding actinic light explodes before you, which coalesces into a dark crystalline obelisk.  It slowly drifts upward, trailing gossamer filaments of electrical light in its wake.
You notice the crystalline obelisk wobble slightly as it orients its matrix toward Malkien.<br>
'''FEINT:'''<br>
A dark crystalline obelisk discharges a few low-energy rays at <target>!<br>
The rays flash squarely in front of <target>, shattering into myriad splinters bright as lightning.  He flinches away from the feint.<br>
'''ATTACK:'''<br>
A dark crystalline obelisk quivers silently before discharging a psychokinetic ray at Malkien!<br>
Centered unerringly on <target's> head, the ray is sustained for several seconds, collateral energy escaping as abstract teardrops in the air.  Each one sprouts smaller tear-shapes from itself, fractalizing and evolving into an intricate paisley.  <Target> appears utterly mesmerized until his head melts from within.
|sig=Yes
|diff=intermediate
|source=standard
|type=targeted
|ctype=battle
}}
==Notes==
* Is cast directly at a target, without using {{com|TARGET}}. Creates an obelisk in the room which will then attack the target.
* By default fires two shots. The first shot may be a feint, which unbalances the target rather than damaging them. (Chance to feint approximately 33%)
** Casting [[Mental Blast]] adds an extra shot to the next Sorrow cast (2 casts for Monks of the Crystal Hand).
** Casting [[Mind Shout]] adds an extra shot to the next 4 Sorrow casts (5 casts for Monks of the Crystal Hand).
** An obelisk cannot exceed 6 stored shots.
* When recasting on a target already being attacked by a previous obelisk, its remaining shots are combined with the new cast, up to 6.
* Average time for obelisk to attack: 3.7 seconds (sample size: 200)
* When recasted, the next shot has a chance to be a feint, and obelisk attack timer is reset (i.e. 3.7 seconds until next attack)
* If the target leaves the room before the obelisk's shots are spent, it will slowly build up shots and lie dormant until they come back.
* If the target dies before the obelisk's shots are spent, it will lie dormant until the spell's next cast, to which the remaining shots will be added.
* If the caster leaves the room, the obelisk will persist for a short time but will not attack until they come back. (2 minutes)
* RELEASE SORROW will cause all of your existing obelisks to self-destruct when they pulse.
* Cannot be cast in water

The appearance of this spell can potentially be changed by an [[Alteration|Alterer]]. See [[Alteration/Sorrow|here]] for guidelines.
{{RefAl}}