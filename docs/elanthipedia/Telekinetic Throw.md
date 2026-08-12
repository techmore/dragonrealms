# Telekinetic Throw

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=tkt
|minprep=1
|castcap=50
|minskill=0
|maxskill=400
|minduration=-
|validtarget=PC, Creature
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Psychic Projection
|prereqs=-
|slot=1
|illegal=no
|corrupt=no
|desc=The Telekinetic Throw spell hurls a loose object from the ground at its target.  The more mana you feed the spell, the more forceful the throw.  If you have the Moonblade spell, you can create small slivers which will be chosen by Telekinetic Throw rather than a random item on the ground.
|buffs=No buffs
|debuffs=No debuffs
|dtype=Puncture damage, Impact damage, Fire damage, Cold damage
|htype=No heal
|poststring=No
|effect=multi-shot single target, damage type varies with object used.
|messaging=You gesture at a sleazy lout.<br />
A wee ebony sliver suddenly swings from orbiting around your head and hurtles toward a sleazy lout!<br />
The ebony sliver lands a powerful strike to its chest!<br />
The sleazy lout is stunned!<br />
The ebony sliver explodes into even tinier multicolored fragments and vanishes!<br />
A wee ebony sliver suddenly swings from orbiting around your head and zips toward a sleazy lout!<br />
The ebony sliver lands a powerful strike to its right leg!<br />
The ebony sliver explodes into even tinier multicolored fragments and vanishes!<br />
A wee ebony sliver suddenly swings from orbiting around your head and zips toward a sleazy lout!<br />
The ebony sliver lands a powerful strike to its right hand!<br />
The lout's sturdy cudgel falls to the ground.<br />
A wee ebony sliver suddenly swings from orbiting around your head and zips toward a sleazy lout!<br />
The ebony sliver lands a powerful strike to its chest!<br />
The ebony sliver explodes into even tinier multicolored fragments and vanishes!<br />
Gasping out in terror, a sleazy lout crumples to the ground.  Eyes closing, the once rebellious flame dies out completely.<br />
Roundtime: 1 sec.
|sig=No
|diff=intro
|source=standard
|type=targeted, multistrike
|ctype=battle
}}
==Notes==
*Telekinetically throws multiple objects at target.
*The number of objects thrown increases with mana used.
:{|class="wikitable" align="center"
!Mana!!Objects
|-
| ?? || 1
|-
| ?? || 2
|-
| ?? || 3
|-
| ?? || 4
|-
| ?? || 5
|}
*Object priority is active [[Moonblade]] slivers followed by objects on the ground.
*Weight and speed of an item no longer causes spell to fail, but still impacts messaging. I.e. any objects can now be used.
*Does varied damage based on what item is thrown.
:*Random objects and Katamba slivers: Piercing + Impact damage.
:*Xibar slivers: Piercing + Cold damage.
:*Yavash slivers: Piercing + Fire damage.