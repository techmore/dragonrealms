# Moonblade

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=-
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=12
|maxduration=41
|validtarget=Self, Special
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Moonlight Manipulation
|prereqs=[[Dazzle]] or [[Dinazen Olkar]]
|slot=1
|illegal=no
|corrupt=no
|desc=Moonblade is a relic from the early years of the Moon Mage Guild.  It became one of the most visible symbols of Lunar magic and the chosen weapon of the Y'Shai.  The spell channels the light-fire of the moons into a lightweight blade, though with additional study it can be shaped into a selection of other forms.  The blade is sturdy, but lasts only for a short while and must never leave your hands.  Additionally, sufficient knowledge of weaponsmithing can improve your efforts.

Perhaps due to their martial heritage, the [[Monks of the Crystal Hand]] tend to be particularly adept at forming a sturdy blade.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Creates temporary Small Edged weapon
|messaging='''Katamba:'''<br />
A shadow deeper than night oozes into existence in your right hand and coalesces into a long narrow moonblade of dull black which seems to absorb light itself.

'''Xibar:'''<br />
A shaft of intense white light leaps into being in your right hand and coalesces into a long narrow moonblade of glossy blue-white diamond-hard metal.

'''Yavash:'''<br />
A shaft of ruby-red light leaps into being in your right hand and coalesces into a long narrow moonblade of some fiery, almost liquid substance. 

'''Breaking Moonblade:'''<br />
You thrust your blue-white moonblade above your head and focus on disrupting its matrix in a spectacular manner.<br />
With a careful touch, you pick apart the right structures from the matrix, weakening its physical integrity without disrupting the power of the spell.<br />
The blue-white moonblade turns bright as a miniature sun before exploding into a cloud of blue-white slivers!<br />
The slivers drift about for a moment, then begin to orbit your head.
|sig=Yes
|diff=intermediate
|source=standard
|type=utility
|ctype=battle
}}
{{RTOC}}
==Syntax==
*{{com|CAST}} {{tt|<moon> <refresh> <hand>}}
:You must specify one of the three moons.  Refresh is optional and will lengthen the duration of an already existing Moonblade.  Hand is optional and lets you designate the hand in which you will try to create or refresh a Moonblade.  By default the spell will try both, starting with your right.
*{{com|SHAPE}} {{tt|<moonblade/moonstaff>}}
:Shows syntax and possible options for changing the physical and magical structure of the Moonblade.
*{{com|SHAPE}} {{tt|<moonblade/moonstaff> TO <warded/unwarded>}}
:Disable/reactivate the moonblade's attack messaging.
*{{com|shape}} {{tt|<moonblade/moonstaff> TO <normal/small/narrow/curved/heavy/huge/blunt>}}
:Changes the type of weapon. Requires [[Shape Moonblade]].
*{{com|shape}} {{tt|<moonblade/moonstaff> TO <primary/secondary/tertiary>}}
:Changes which node is active. Requires [[Empower Moonblade]].
*{{com|shape}} {{tt|<moonblade/moonstaff>}} TO [[Cambrinth|CAMBRINTH]]
:Allows the moonblade to be utilized as cambrinth. Requires [[Empower Moonblade]].
*{{com|STUDY}} {{tt|<moonblade/moonstaff>}} for syntax
*{{com|wear}} {{tt|<moonblade/moonstaff>}}
:Suspends the moonblade on telekinetic currents around you. This is simply a way to be able to free up your hands without losing/destroying the moonblade.
*{{com|push}}, {{com|pull}}, {{com|tap}} {{tt|<moonblade/moonstaff>}}
:Fluff messaging while a moonblade is suspended on telekinetic currents.

==Appraisal==
*Appraisal depends on the current form of the moonblade.
*All forms but the normal version require the meta-spell [[Shape Moonblade]] to be known.  
*Every form gains improved stats with knowledge of the appropriate [[weaponsmithing techniques]].
*Moonblades also have improved stats if created when their respective moon has a very strong influence on mana.
:*[[Monks of the Crystal Hand]] have a [[Sect Spell Affinity]] to this spell, and gain this effect at the lower threshold of moderately strong moon influence.
*Weight is constant across a template regardless of tier.

===Tiers===
:{| class="wikitable"
! Tier !! Requirement(s) !! Messaging !! Equivalency
|-
| 3 || None. This is the base weapon || n/a || best storebought
|-
| 4 || Knowing the appropriate weaponsmithing technique to the weapon you are creating or shaping || Your Weaponsmithing techniques aid your effort. || player crafted steel
|-
| 4 || Creating or shaping a weapon when the moon's influence is very strong and you do not know the appropriate weaponsmithing technique || You are aided by the strength of ''<Moon>'''s influence. || player crafted steel
|-
| 5 || Creating or shaping a weapon when the moon's influence is very strong and you know the appropriate weaponsmithing technique || Your Weaponsmithing techniques aid your effort.<br>You are further aided by the strength of ''<Moon>'''s influence. ||player crafted rare metal
|-
|}

===Variations===
{| class="wikitable"
|-
! Shape !! Class !! Template !! W/S Tech !! Tier !! Punc !! Slic !! Impa !! FoI !! Bal !! Pwr !! Const !! Wgt !! Kron
|-
| rowspan=3 | Normal || rowspan=3 | Medium Edged || rowspan=3 | N/A || rowspan=3 | Proficient Bladed Weapon
| 3rd || {{CWep|3|7|0||9|2|9|10|}}
|-
| 4th || {{CWep|3|8|0|0|10|2|11|10|262}}
|-
| 5th || {{CWep|3|9|0|0|11|2|13|10|262}}
|-
| rowspan=3 | Small || rowspan=3 | Light Edged || rowspan=3 | Short Sword || rowspan=3 | Basic Bladed Weapon
| 3rd || {{CWep|3|5|2||7|4|9|17|}}
|-
| 4th || {{CWep|4|6|2|1|7|5|11|17|262}}
|-
| 5th || {{CWep|5|6|2|1|8|5|13|17|262}}
|-
| rowspan=3 | Narrow || rowspan=3 | Medium Edged || rowspan=3 | Rapier || rowspan=3 | Proficient Bladed Weapon
| 3rd || {{CWep|6|4|2||8|3|9|18|}}
|-
| 4th || {{CWep|7|4|2|1|9|4|11|18|262}}
|-
| 5th || {{CWep|8|4|2|1|9|4|13|18|262}}
|-
| rowspan=3 | Curved || rowspan=3 | Medium Edged || rowspan=3 | Scimitar || rowspan=3 | Proficient Bladed Weapon
| 3rd || {{CWep|2|7|3||6|6|9|20|}}
|-
| 4th || {{CWep|2|8|3|2|6|6|11|20|262}}
|-
| 5th || {{CWep|2|9|3|2|7|6|13|20|262}}
|-
| rowspan=3 | Heavy || rowspan=3 | Heavy Edged || rowspan=3 | Broadsword || rowspan=3 | Advanced Bladed Weapon
| 3rd || {{CWep|3|10|3|2|6|6|9|35|262}}
|-
| 4th || {{CWep|3|11|3||6|6|11|35|}}
|-
| 5th || {{CWep|3|12|3|2|6|7|13|35|262}}
|-
| rowspan=3 | Huge || rowspan=3 | Two-handed Edged || rowspan=3 | Claymore || rowspan=3 | Expert Bladed Weapon
| 3rd || {{CWep|3|13|5|5|5|7|9|45|262}}
|-
| 4th || {{CWep|3|14|6|5|6|8|11|45|262}}
|-
| 5th || {{CWep|3|16|6||6|8|13|45|}}
|-
| rowspan=3 | Blunt || rowspan=3 | Quarter Staff || rowspan=3 | Quarterstaff || rowspan=3 | Simple Martial Weapon
| 3rd || {{CWep|4|1|9||8|6|9|37|}}
|-
| 4th || {{CWep|4|1|10|7|9|6|11|37|262}}
|-
| 5th || {{CWep|4|1|11|8|9|6|13|37|262}}
|-
|}

==Notes==
*Refreshing a moonblade does not stack the duration. Instead, it is simply set to whatever duration the refreshing cast would normally give. If the current duration of the moonblade is greater than this amount then the refresh has no effect.
*You can refresh a moonblade's duration using a different moon, with reduced effectiveness, in order to extend the duration of the moonblade.
**The reduced duration of a cross-moon refresh ranges from 12 to 30 minutes. I.e. the minimum duration is the same, but each additional point of mana produces less duration. Refreshing it follows the same rule of only applying if the new duration is longer than the current duration.
**Works even if the original moon has set, making it possible to keep a moonblade up indefinitely as long as there remains at least one moon in the sky.
**This only affects duration. I.e. the color and stats of the moonblade are still determined by the original moon and its strength even if it has set.
*You can {{com|BREAK}} a moonblade to create slivers to use as first priority ammunition for [[Telekinetic Throw]] and [[Telekinetic Storm]].
:*These slivers provide different damage types depending on which moon was used to create them. These variations to damage type only apply to the slivers, and not to the moonblades themselves.
::*Katamba - Piercing and impact damage.
::*Xibar - Piercing and cold damage.
::*Yavash - Piercing and fire damage.
:*The ability to break slivers off of a moonblade is based on the {{skill|Arcana}}. It takes approximately 104 ranks of Arcana to begin to perform this feat (you will still fail from time to time), and approximately 115-116 to break it consistently.
:*The slivers stack up to a maximum of 100 orbiting you at one time.
:*You can only have slivers from a single moon orbiting you at one time.  If you attempt to create slivers from a different moon, they will instead eliminate an equal number of slivers orbiting you.  If you create more slivers than you currently have, the excess will orbit you as normal.
::''e.g. If you have 10 red slivers orbiting you and attempt to create 8 blue slivers, 8 red slivers will be destroyed leaving you with 2 red slivers.  If you then attempt to create another 9 blue slivers, the remaining 2 red slivers will be destroyed leaving you with 7 blue slivers.''
:*Slivers will periodically float away on their own 1 to 3 at a time.
*You may also {{com|Release}} slivers to rid yourself of orbiting slivers prematurely.
*There is an easter egg when casting Moonblade in a room containing a Moonbeam. Rather than form the blade in your hand you will reach into the moonbeam and draw out the blade.

{{RefAl}}