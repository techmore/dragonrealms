# Shield of Light

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=sol
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=10
|maxduration=40
|validtarget=Self
|guild=Cleric
|magic=Holy Magic
|spellbook=Holy Defense
|prereqs=Circle 10, [[Divine Radiance]], [[Visage]]
|slot=3
|illegal=none
|corrupt=none
|desc=The Shield of Light spell creates a blessed shield, keeping it in existence as long as the pattern holds.  This divine shield is very light, can be shaped somewhat, and will also allow the cleric to block attacks with greater accuracy than they would otherwise with mundane shields.
|buffs=Shield Usage skill
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Conjures a shield
|messaging='''Cast without a shield:'''<br/>
In a fiery blaze, a shimmering tower shield appears in your left hand.<br/>

'''Wearing the shield:'''<br/>
Your shield dissolves into a pinpoint of light and quickly reconstructs itself as a flickering oval shield on your left arm.<br/>

'''Shaping the shield:'''<br/>
Your shield suddenly fluctuates, changing shape and reforming into a luminous target shield.<br/>

'''Effect ends:'''<br/>
Your tower shield fades away into nothingness.<br/>

'''Cast while left hand is occupied:'''<br/>
A fiery blaze covers your shield arm like a vambrace of solid sunlight.
|sig=Yes
|diff=intermediate
|source=standard
|type=augmentation, utility
|ctype=battle
}}
==Notes==
*Can be used with an [[Osrel Meraud]] orb.
*Shield of Light does not summon a shield if your left hand is occupied and currently worn Shield of Light will dissolve.
*If Shield of Light does not summon a shield, you still get the skill buff.
*If Shield of Light does not summon a shield due your left hand being occupied, a Shield of Light will not appear once your left hand is emptied.
*Dropping a Shield of Light will temporarily free your left hand but the shield will reappear after a moment.
*Shield of Light will not summon a shield if you are already wearing or holding one, even if left hand is free.
*The summoned oval (medium sized) shield of light can be arm-worn despite being larger than what a cleric could normally wear.
*[[Unbend sigil|Unbend sigils]] can destroy a shield of light when dropped in the same room.
* The stats of the summoned shield are improved if the caster knows the Simple Shield Design [[Armorsmithing techniques|Armorsmithing technique]] or the Simple Tailored Defensive Designs [[Tailoring techniques|Tailoring technique]]. <ref>[[Post:A few questions - 05/13/2013 - 22:05]]</ref>

{{RTOC}}

==Syntax==
* {{com|SHAPE}} {{tt|SHIELD TO}} ''<option>''

===Examples===
: SHAPE SHIELD TO TARGET<br />
: SHAPE SHIELD TO MERAUD<br />

===Valid options===
* target (small)
* oval (medium)
* tower (large)
* spiked (adds puncture damage)
* blank (without spikes)
* the name of any Immortal (alters appearance)
* custom (alters appearance, requires custom scroll)

Target (small) and oval (medium) options can be worn on the arm. Tower (large) shields will automatically shape to oval when worn.

====Custom designs====
Custom scrolls have been sold at various festival shops (e.g. [[See The Light]]) or are available as part of quest loot (e.g. the [[Item:Salt-stained vellum scroll|salt-stained vellum scroll]]). When you {{com|shape}} {{tt|shield to custom}}, your shield will take on the appearance set in the last scroll you studied.

These custom scrolls bind to the user when you {{com|study}} them. Once a scroll has been studied by one cleric, another cleric cannot study them to learn the pattern. The scroll is not destroyed, however, allowing you to collect multiple scrolls with different designs.

==Protection==
{|class="wikitable sortable"
|-
!Option||Size||Weight||Hindrance||Held Basic||Held Full||Worn Basic||Worn Full
|-
|target||small||35||01-insignificant||03-dismal||09-better than fair||03-dismal||07-low
|-
|oval||medium||62||04-minor||05-poor||12-good||05-poor||10-moderate
|-
|tower||large||100||07-moderate||07-low||16-great||-||-
|}

==Protection with Shield crafting technique==
{|class="wikitable sortable"
|-
!Option||Size||Weight||Hindrance||Held Basic||Held Full||Worn Basic||Worn Full
|-
|target||small||35||01-insignificant||03-dismal||10-moderate||03-dismal||08-fair
|-
|oval||medium||62||04-minor||06-rather low||13-very good||05-poor||10-moderate
|-
|tower||large||100||07-moderate||07-low||17-very great||-||-
|}

{{RefAl}}