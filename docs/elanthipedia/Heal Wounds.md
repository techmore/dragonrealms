# Heal Wounds

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=hw
|minprep=1
|castcap=100
|minskill=0
|maxskill=400
|minduration=-
|validtarget=Self
|guild=Empath
|magic=Life Magic
|spellbook=Healing
|prereqs=-
|slot=1
|illegal=no
|corrupt=no
|desc=The most fundamental tool of the Empath, Heal Wounds attempts to restore a body part to its natural state, as defined by the Empath's race, age, heredity and so forth.  It cannot "cure" senescence or correct birth defects, but its effect on wounds and trauma is miraculous.  When cast on a body part (CAST [bodypart]), it will attempt to heal external wounds first, and then internal if any healing potential remains.  An empath can choose to heal only external wounds or only internal wounds as well (CAST [bodypart] [EXT/INT]).  The empath can also attempt to heal internals first with any remaining power going to externals (CAST [bodypart] REVERSE).
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=Wound heal
|poststring=No
|messaging=You gesture.<br>Your external back is greatly improved.<br>Your internal back is not injured.<br>Your back is completely healed of all external injury.
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