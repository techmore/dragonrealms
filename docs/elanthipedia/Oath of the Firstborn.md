# Oath of the Firstborn

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=oath
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=10
|maxduration=40
|validtarget=Self
|guild=Ranger
|magic=Life Magic
|spellbook=Wilderness Survival
|prereqs=[[Hands of Lirisa]]
|slot=2
|illegal=no
|corrupt=no
|desc=The primordial call of the wild has always existed, and always have there been those willing to answer that call.  Those who feel more kinship with beast than man, those who have no use for the constructs of civilization, those willing to shed blood to protect the purity of nature.  The words of the Oath vary, but always the intent is the same a promise of swift and lethal violence to those who would defile that which the Ranger holds dear.  While the Oath is useful predator and the defender alike, its justice is personal.  Those seeking to engage in ranged combat should instead attempt to See the Wind.
|buffs=Large Blunt skill, Large Edged skill, Polearms skill, Small Blunt skill, Small Edged skill, Staves skill, Twohanded Blunt skill, Twohanded Edged skill
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=only up to 2 skills at a time.
|messaging='''CAST:'''
You swear, "I shall protect the wilds."
Your words fill you with an unflagging sense of resolve and purpose.

'''BUFF SWITCHING TO NEW WEAPONS:'''
You flourish your narrow-headed spear about in a butterfly pattern to test its balance.

You twirl your narrow-headed spear about in a graceful looping pattern to test its balance.

You spin your narrow-headed spear and throwing hammer about in a crisscrossing flourish to test their balance.
|sig=Yes
|diff=intermediate
|source=standard
|type=augmentation
|ctype=standard
}}
==Notes==
*Provides a buff to the weapon skill for any held weapon. It will provide up to two buffs depending on the weapons held.
:*The right hand buff defaults to {{skill|Large Edged}} if the right hand is empty or is holding a non-weapon.
:*The left hand buff defaults to {{skill|Small Edged}} if the left hand is empty or holding a non-weapon, and the right hand is not holding a {{skill|Twohanded Edged}} or {{skill|Twohanded Blunt}} weapon.
:*If the right hand is holding a {{skill|Twohanded Edged}} or {{skill|Twohanded Blunt}} weapon then that is the only skill that gets buffed regardless of what is held or not held in the left hand. This does not apply to {{skill|Polearms}} or {{skill|Staves}} weapons since those skills have single-handed varieties.
::*''Quirk: The way the spell updates the buffed skills when weapons are changed makes it possible to have the buff from your left hand weapon while holding a twohanded weapon in your right hand for a couple of seconds. When you first wield a weapon in your right hand the spell updates that buff almost instantly, but takes a second or two to update whatever is held in the opposite hand. When stowing a weapon, however, it does not update either buff quickly meaning you will not regain the left hand buff immediately after sheathing the twohanded weapon, so it's not a particularly exploitable quirk.
:*If the left hand is holding a weapon that you cannot make use of in your offhand (E.g. a heavy edged weapon as a Ranger) then it will not buff that skill regardless of what is held in the right hand.

==Oaths==
Each race gets a different oath message when casting the spell.
{|class="wikitable sortable"
! Race !! Oath
|-
| [[:Category:Dwarf|Dwarf]] || You swear, "I will honor the stones as my fathers before me."
|-
| [[:Category:Elf|Elf]] || You swear, "I will live in harmony with the wilds."
|-
| [[:Category:Elothean|Elothean]] || You swear, "I will learn from the wisdom of the wilds that no book may ever hold."
|-
| [[:Category:Gnome|Gnome]] || You swear, "As nature adapts to a threat, so shall I be inspired in its defense."
|-
| [[:Category:Gor'Tog|Gor'Tog]] || You swear, "No bonds will ever hold me back from doing what is needed."
|-
| [[:Category:Halfling|Halfling]] || You swear, "I will protect these lands from field to stream."
|-
| [[:Category:Human|Human]] || You swear, "Ever shall I seek the horizon."
|-
| [[:Category:Kaldar|Kaldar]] || You swear, "I will remember that which was cast aside by my ancestors."
|-
| [[:Category:Prydaen|Prydaen]] || You swear, "That which lives will die, but that which dies will live again."
|-
| [[:Category:Rakash|Rakash]] || You swear, "The Pack and the lands are one."
|-
| [[:Category:S'Kra Mur|S'Kra Mur]] || You swear, "I will protect these lands from sand to sea."
|}
Use of the <{{com|spell}} {{tt|briefmsg on}}> command will change and truncate these oaths.
{{RefAl}}