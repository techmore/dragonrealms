# Sanctify Pattern

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=sap
|minprep=5
|castcap=100
|minskill=10
|maxskill=600
|minduration=10
|maxduration=40
|validtarget=Self, PC
|guild=Cleric
|magic=Holy Magic
|spellbook=Metamagic
|prereqs=[[Bless]]
|slot=2
|illegal=none
|corrupt=none
|desc=The sacred pursuit of Metamagic was born from experiments into blessing increasingly abstract subjects, such as vocations or times of day.  While magic is at its heart neither divine nor "of the soul," its subtle physics have proven more amendable than most subjects to holy manipulation.

Sanctify Pattern was an early fruit from that endeavor.  By blessing the subject's capacity for magic, their spell patterns are in turn sanctified and express in their design a fleeting element of the Immortals' wisdom and glory.  In practice, this serves to artificially bolster the subject's skill at Warding, Augmentation, Debilitation or Utility.
|buffs=Augmentation skill, Debilitation skill, Utility skill, Warding skill
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Only one at a time
|messaging=You gesture.<br />
A brilliant silver halo appears briefly around your head.<br />
Your nerves gently tingle as the spell settles into the interface between your mind and the mana streams.  You feel more adept at ''<Augmentation/Debilitation/Warding/Utility>'' magic.
|sig=No
|diff=basic
|source=standard
|type=augmentation
|ctype=standard
}}
==Syntax==
* {{tt|CAST [person] <skill>}}

==Notes==
* Buffs one of [[Augmentation]], [[Debilitation]], [[Warding]], or [[Utility]] skill at a time.
* Reduced potency if cast on others.