# Heal

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=-
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=10
|maxduration=40
|validtarget=Self
|guild=Empath
|magic=Life Magic
|spellbook=Healing
|prereqs=[[Vitality Healing]]
|slot=3
|illegal=no
|corrupt=no
|desc=A matrix built around the two fundamental healing spells, Heal attempts to locate and heal the worst wounds of the Empath over time, doing whatever correction is necessary to bring her body to wholeness.  The Empath can specifically cast it with wounds or scars in mind to focus the spell upon the worst injury of the given type, or allow it to do its best for both.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=Wound heal
|poststring=No
|effect=periodically heals your worst wounds
|messaging=A wave of feverish heat settles into your flesh, the momentary surge of discomfort subsiding slowly into a warm feeling of heightened sensation.
|sig=Yes
|diff=intermediate
|source=standard
|type=utility
|ctype=standard
}}
==Notes==
===Syntax===
:{{tt|CAST}}
:{{tt|CAST <WOUND{{!}}SCAR>}}
===Details===
*This spell will attempt to locate and heal the worst damage on the [[Empath]].<br>
:*If you do a general cast, it will look through both fresh wounds and scars for the worst wound.<br>
:*If you specify WOUND or SCAR, it will search for the worst damage of the type indicated.<br>
*Heal's effects persist after death.
*Heal will remain active when you are uninjured, waiting for wounds to trigger it, if you have the [[Adaptive Curing]] metaspell.
*HEAL is not intended to be a primary means of healing, although it may be used that way with sufficient skill. Its primary purpose is emergency healing in order to get the worst wounds under control immediately when you don't have the time/luxury/desire to try to work out your priorities yourself.  It will always heal the worst of your wounds, even if that wound is not visible.<br>
*Can be used when [[Empathic Shock|shocked]].