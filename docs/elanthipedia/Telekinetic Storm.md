# Telekinetic Storm

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=tks
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=-
|validtarget=Area
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Psychic Projection
|prereqs=Circle 10 and [[Telekinetic Throw]]
|slot=1
|illegal=illegal
|corrupt=none
|desc=The Telekinetic Storm spell is a major refiguring of the Telekinetic Throw pattern.  Where the earlier spell can throw many objects at a single point, the storm pattern throws many objects across a larger area.  It's not as potentially destructive to an individual as the throw is, but you can catch multiple targets at once.
|buffs=No buffs
|debuffs=No debuffs
|dtype=Puncture damage, Impact damage, Fire damage, Cold damage
|htype=No heal
|poststring=No
|effect=Multi-strike AoE. Damage type varies with object used.
|messaging=You gesture.
You contribute your harnessed streams to increase the pattern's potential.<br />
An ominous rustling comes from all around as debris takes flight of its own accord!<br />
A wee ebony sliver suddenly swings from orbiting around your head and hurtles toward a sleazy lout!<br />
The ebony sliver lands an awesome strike to its back!<br />
Gasping out in terror, a sleazy lout crumples to the ground.  Eyes closing, the once rebellious flame dies out completely.<br />
The ebony sliver explodes into even tinier multicolored fragments and vanishes!<br />
Roundtime: 2 sec.
|sig=No
|diff=intermediate
|source=standard
|type=targeted, multistrike, area of effect
|ctype=battle
}}
==Notes==
*Telekinetically throws objects at all targets in the area.
*At minimum prep each target will be hit once. More mana will increase the number of strikes per target up to a cap of 3 per target.<ref>[[Post:Re:_So_this_happened..._-_4/25/2015_-_12:58]]</ref>
:{|class="wikitable" align="center"
!Mana!!Objects per creature
|-
| 15 || 1
|-
| 42 || 2
|-
| >80 (89?) || 3
|-
|}
*Will hit all targets included by your chosen {{com|target}} syntax up to the cap of 6 creatures.
*Object priority is active [[Moonblade]] slivers followed by objects on the ground.
*Weight and speed of an item no longer causes spell to fail, but still impacts messaging. I.e. any objects can now be used.
*Does varied damage based on what item is thrown.
:*Random objects and Katamba slivers: Piercing + Impact damage.
:*Xibar slivers: Piercing + Cold damage.
:*Yavash slivers: Piercing + Fire damage.

{{RefAl|r=y}}