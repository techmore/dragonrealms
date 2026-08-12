# Shadewatch Mirror

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=shm
|minprep=30
|castcap=100
|minskill=250
|maxskill=1000
|minduration=999
|validtarget=PC
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Stellar Magic
|prereqs=Circle 40, [[Distant Gaze]], and a [[Shadewatch Mirror quest|quest]]
|slot=1
|illegal=no
|corrupt=no
|desc=The Shadewatch Mirror spell will create a viewing mirror focused on any individual who is not concealed from the skies above.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Creates a mirror that scries on a PC (continuous)
|messaging=You gesture.
With a raspy sigh, a shadowy mirror drifts up out of the ground.

'''Rubbing Mirror:'''<br />
You rub the shadowy mirror, and it clouds over and turns extremely murky.

'''Breaking Mirror:'''<br />
You gesture at your shadowy mirror.<br />
Your visions due to the Shadewatch Mirror cease.<br />
A shadowy mirror shudders and splits into a thousand shards that quickly melt away.
|sig=Yes
|diff=advanced
|source=quest
|type=utility
|ctype=standard
}}
==Syntax==
*{{com|GAZE}} or {{com|LOOK}} {{tt|mirror}} to start watching.
*{{com|TAP}} {{tt|mirror}} to stop watching.
*{{com|RUB}} {{tt|mirror}} to toggle blocking other people from {{tt|look}}ing into it.
*{{com|BREAK}} {{tt|mirror}} to end the spell.

==Notes==
*Uses the Perception spellbook mana levels to determine the attunement cost.
*The mirror will be destroyed if you leave the room.
*Freshly cast mirrors default to allowing other players to {{tt|look}} into them.
*The scrying is focused on your target, following them as they move around. This tracking is not instant, but updates to their new location a second or two after they move.
*Mirrors have more restrictions when cast during the day as compared to during the night:
:*Day:
::*The spell can only be cast if your target is outdoors or otherwise able to see the sky.
::*Using the mirror to view the target likewise only functions as long as the target remains outdoors or able to see the sky even if the spell was originally cast at night.
:*Night:
::*The mirror can be cast on your target regardless of them being indoors or outdoors.
::*Likewise, it can also be used to view the target whether they are indoors or outdoors even if the spell was originally cast during the day.
*Scrying does not automatically restart if it is ever interrupted. For example, if the target moves indoors during the day then it must be {{tt|look}}ed into again in order to resume the scrying after they move back outside.
*Acquiring this spell requires the completion of a [[Shadewatch Mirror Quest|quest]] (Spoiler)