# Heal Scars

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=hs
|minprep=1
|castcap=100
|minskill=0
|maxskill=400
|minduration=-
|validtarget=Self
|guild=Empath
|magic=Life Magic
|spellbook=Healing
|prereqs=[[Heal Wounds]]
|slot=1
|illegal=no
|corrupt=no
|desc=The second of the fundamental healing spells, Heal Scars functions in an identical manner as Heal Wounds (all CAST options described in Heal Wounds applies to this spell as well).  Where Heal Wounds restores functionality and flesh to body parts, Heal Scars smoothes out the flaws left behind.  Calluses, scars and lingering aches fade away under corrective magic, returning the body part to the ideal form for the Empath's age and natural fitness.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=Wound heal
|poststring=No
|effect=heals scars
|messaging=You gesture.<br>Your external back is greatly improved.<br>Your internal back is greatly improved.<br>Your back is completely healed of all external scarring.<br>Your back is completely healed of all internal scarring.
|sig=Yes
|diff=intro
|source=standard
|type=utility
|ctype=standard
}}
==Notes==
* Can be used when [[Empathic Shock|shocked]].

===Syntax===
<tt>CAST [RIGHT|LEFT] <BODY PART> [INTERNAL|EXTERNAL|REVERSE]</tt>

*When cast on a body part (CAST [bodypart]), it will attempt to heal external wounds first, and then internal if any healing potential remains.
*An Empath can choose to heal only external wounds or only internal wounds as well (CAST [bodypart] [EXT|INT]). 
*The empath can also attempt to heal internals first with any remaining power going to externals (CAST [bodypart] REVERSE).

===Spell Messaging===
From least healed to greatest:
* Your wound appears very slightly improved.
* Your wound appears slightly improved.
* Your wound appears better.
* Your wound appears greatly improved.
* Your wound appears almost completely healed.
* Your wound appears completely healed.