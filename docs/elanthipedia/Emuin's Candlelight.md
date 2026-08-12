# Emuin's Candlelight

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=EMC
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=10
|maxduration=40
|validtarget=Self
|guild=Necromancer
|wardslot=1-slot
|magic=Arcane Magic
|spellbook=Anabasis
|prereqs=Must be [[Redeemed]], [[Solace (spell)|Solace]]
|slot=1
|illegal=illegal, social outrage
|corrupt=none
|desc=[[Emuin|Emuin's]] Candlelight is a spell that will cultivate your sense of self-preservation.  Moreover, it will absorb most kinds of potential damage to your body, returning it to you as fiery atonement over time.  In certain ways, it aptly encapsulates the precarious fact of Redemption itself: incaution and hubris ever bring their own punishments.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=staggers incoming damage over time
|messaging='''1st person:'''

>cast<br>
You clench your fists, pressing your fingernails painfully into your flesh.<br>
When you reopen them, a benign candlelight falls across your palms, though there is no flame. You are pervaded by indistinctly sweet memories as well as a presentiment of peril.

'''3rd person:'''<br>
''<Necromancer>'' clenches his/her fists.<br>
When he reopens them, an eerie candlelight falls across ''<Necromancer>'''s palms, though there is no flame.  The flickers cast ghoulish, metamorphosing shadows all around him/her.<br>


'''Delaying damage:'''<br>
Your hands glimmer with orange light.

'''Releasing stored damage:'''<br>
A scourging heat <parches> your right arm.

>release emc<br>
A scourging heat <chars> your right arm.<br>
A scourging heat <singes> your chest.<br>
A scourging heat <parches> your abdomen.<br>
A scourging heat <parches> your abdomen.<br>
A scourging heat <scorches> your right hand.<br>
A scourging heat <sears> your left arm.<br>
Your protective candlelight is snuffed out.
|sig=Yes
|diff=intermediate
|source=quest
|type=augmentation, warding
|ctype=standard
}}
==Notes==
* Higher potency casts staggers damage over a longer time.
* No wound reduction occurs. Defers both [[Damage|physical wounds]] and the [[Vitality|vitality damage]] those wounds caused.
* Damage is capped based on Potency and once capped will not accept more damage until some has drained away. 
* Letting the spell drop or having it dispelled no longer causes all the damage to hit immediately, instead you'll get an "enhanced" damage burst (equivalent to a few drain pulses in a row), and then after that the remainder of the damage will drain away at a normal rate.
* Knowing [[Relight]] greatly increases how much damage Emuin's Candlelight can store and will let you periodically fully cleanse the stored damage so that you do not take it.
* The pulse message will indicate how much damage is being released. This can also be checked if you know the Relight spell using {{com|relight}} {{tt|check}}.
: {|class="wikitable"
|-
! Severity!!Damage Release Message
|-
|1|| parches
|-
|2|| singes
|-
|3|| scorches
|-
|4|| sears
|-
|5|| chars
|-
|6|| burns
|-
|7|| immolates
|}
* Like all other [[:Category:Anabasis spellbook|Anabasis spells]], this is not taught by the various guildleaders.
* Like all other Anabasis spells, this spell only functions while [[Redeemed]].
* Casting this spell inside a standard [[justice]] zone generates [[Social Outrage]]. [[Generates Social Outrage::true| ]]

{{RefAl}}