# Drums of the Snake

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=drum
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=10
|maxduration=40
|validtarget=Self
|guild=Bard
|magic=Elemental Magic
|spellbook=Sound Manipulation
|prereqs=[[Demrris' Resolve]] or [[Hodierna's Lilt]]
|slot=2
|illegal=no
|corrupt=no
|desc=Renowned for its usefulness, Drums of the Snake will attune the magician to the tribal rhythms of nature, greatly increasing their own ability in activities that require a steady hand and good coordination.  The magic ebbs and pulses around its caster, much like a drum beat, providing benefit to any follower of the magician who stays near.
|buffs=Locksmithing skill, Agility (stat)
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|messaging=On:
You feel yourself swaying to an internal beat that hums with the natural rhythm of nature itself as the magic of "Drums of the Snake" begins to flow through you.

Off:
The rhythmic thrum flowing through your body lingers with a fading warmth like the last rays of the setting sun.
|sig=No
|diff=intermediate
|source=standard
|type=augmentation, area of effect, pulse to group
|ctype=standard
}}
==Notes==
*Self cast buff to {{stat|Agility}} and {{skill|Locksmithing}} that pulses from yourself to other players every several seconds.
*Defaults to {{com|cast}} {{tt|group}}.
*Other players lose the effect on the next pulse if they are no longer in your group.
*Can be {{com|cast}} {{tt|area}} if the [[Magical feats|Area Casting feat]] is known. This extends all pulsing effects to every player in your room instead of just your group.

'''Bug: This spell does not pulse properly like with [[Rage of the Clans]] or other pulse to group effects. Players will still lose the effect on the next pulse if they leave your group or room, but do not regain it if they join/re-join your group or enter/re-enter your room after it has been cast.'''