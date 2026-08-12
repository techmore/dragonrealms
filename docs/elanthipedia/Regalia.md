# Regalia

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=rega
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=11
|maxduration=40
|validtarget=Self
|guild=Trader
|magic=Lunar Magic
|spellbook=Fabrication
|prereqs=[[Trabe Chalice]]
|slot=2
|illegal=no
|corrupt=no
|desc=Showcasing the sturdiness and versatility of Trabe crystal, Regalia ensconces its caster in glittering armor, provided they are not already protected as such.  The caster's defensive skill and predilections will determine which type of armor the spell manifests, while knowledge of the corresponding crafting techniques allows for the creation of even stronger pieces.  As with most Fabrication spells, Regalia requires direct starlight, bright moonlight, or an infusion of aura to properly function.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Creates crystal armor
|messaging=Cupping your palms skyward, you bask in a cascade of moonlight.
The moonlight coalesces into a rough-cut crystal chain balaclava atop your head!<br>
The moonlight coalesces into some rough-cut crystal chain gloves around your hands!<br>
The moonlight coalesces into a rough-cut crystal chain hauberk around your body!<br>
Roundtime: 2 sec.
|sig=No
|diff=intermediate
|source=standard
|type=utility
|ctype=battle
}}
{{RTOC}}
*Requires unobscured starlight, an unobscured bright moon (Xibar or Yavash), or [[Starlight Aura]]. [[Trader spell requirement is::starlightaurabrightmoon| ]]
*Additional mana adds duration and reduces weight.
*Can be refreshed fully. This has no starlight aura cost in situations with no moons or natural starlight, although it still requires having enough starlight aura to be able to cover what a new cast would have cost or it fails.
*Cannot be dispelled.
*{{com|release|Releasing}} the spell will destroy all summoned armor at once. 
*You can {{com|remove}} individual pieces to destroy specific armor pieces without affecting the rest of them.
*Warning messages occur starting at 2 minutes from expiration.
::''Your carapace hauberk glimmers weakly.''
* Usage: CAST {armor type} {area of coverage}
:::Valid armor types are:  light, chain, brigandine, and plate.
:::Valid areas are:  all, head, body, cap, neck, eyes, hands, shirt, torso, waist, arms, and legs.
*The armor type defaults to your highest armor skill. The armor type can be specified (light, chain, brigandine, plate) if you know the [[Bespoke Regalia]] metaspell.
*The spell defaults to covering all body parts. Narrower regions or specific body parts can be specified instead if you know the [[Bespoke Regalia]] metaspell.
:*Specifying a single body part (cap, neck, eyes, waist, hands, legs) will only create armor for that specific body part if possible.
:*Specifying one of the possible regions (head, body, shirt, torso, arms) will attempt to fill that region with a single piece of armor. The default cast does this as well, but for 3 pieces of armor covering the head region, body region and the hands. If a single piece of armor can't be created due to the region being partially filled with other armor then the spell will fill smaller body parts as per the list below, continuing until all of the appropriate body parts are filled. E.g. if you're wearing a tasset but use {{com|cast}} {{tt|body}} which normally creates a hauberk it will instead create arms, legs, and chest/back torso pieces.
:::{{com|cast}} - head, body, hands
:::{{com|cast}} {{tt|head}} - head, eyes and neck (use {{com|cast}} {{tt|cap}} if you want to cover only the head)
:::{{com|cast}} {{tt|body}} - torso, arms and legs
:::{{com|cast}} {{tt|shirt}} - torso and arms
:::{{com|cast}} {{tt|torso}} - chest/back/abdomen OR chest/back and abdomen (light, chain, brigandine only) OR chest, back and abdomen (plate only). This will always create the first option if possible.
:::{{com|cast}} {{tt|arms}} - arms and hands
:*It is not possible to specify chest/back, chest-only or back-only coverage even though the spell can create carapace, chain and scale vests and plate breastplates and backplates. The only way to create these pieces is to use either CAST or CAST {body|shirt|torso} while wearing an armor piece on your waist.
:*Likewise, it is not possible to specify arm-only coverage even though the spell can create vambraces. The only way to create vambraces is to use either CAST or CAST {body|shirt|arms} while wearing an armor piece on your hands.
:*One oddity is that the CAST BODY and SHIRT options normally create a hauberk, shirt or half plate which do not have hand coverage, but if these cannot be created it will attempt to make sleeves which do cover the hands.
:*If removing either the plate breastplate or backplate in order to switch armor types via the spell then make sure to remove both of them. Because the other armor types do not have chest-only or back-only coverage options, leaving one of them on will result in the other location being exposed.
*Light armor created by this spell can be enhanced by knowing the appropriate bone armor carving technique. Chain, Brigandine and Plate armor use the appropriate armorsmithing technique instead. See the chart below for which techniques you need for specific pieces.
:*It takes 12 armorsmithing techniques and 4 carving techniques to be able to fully upgrade all possible pieces of armor created by this spell. If you only want to use a specific combination of armor pieces you will likely require fewer techniques than this, so having all of them is only necessary for flexibility.
*While [[Enrichment]] is active, newly created Regalia will gain +1 tier to armor quality.
*The caster must be free of armor, whether mundane or summoned, in the area to be covered or it will fail with the following message. Note that the spell ''will'' fill in available spaces with appropriate armor pieces if the desired armor was only partially covered, so the only time it will completely fail is if there are no available spots to fill at all. Even then it will still successfully refresh the duration if the spell was already in effect.
::''Rebuffed by your existing clothing and armor, the liquid light finds no purchase for taking physical form.''

==Templates==
*Conjured armor is of the form <quality> crystal <template>.
*Quality and tier are determined at the time of creation by the armorsmithing and carving techniques known as well as when created under the effects of [[Enrichment]]. Armor created under Enrichment's effect does not lose the tier bonus when Enrichment wears off.
*The templates are all standard crafting templates aside from the weight which is reduced by casting the spell with more mana down to half the weight at spell cap. Unlike weight reductions in crafting, this does not affect the other stats of the armor.

:{| class="wikitable"
! quality !! tier !! requirement !! rough equivalency
|-
| rough-cut || tier 3 || --- || average storebought
|-
| faceted || tier 4 || Knowing the appropriate crafting technique || player crafted steel
|-
| faceted || tier 4 || Created under the effects of [[Enrichment]] without knowing the appropriate crafting technique || player crafted steel
|-
| resplendent || tier 5 || Knowing the appropriate crafting technique when created under the effects of [[Enrichment]] || player crafted rare metal
|-
|}

===Light Armor===
====Protection====
{{CraftHead|lma|c=y}}
{{CraftM|t=la|m= | | |08|06|08|07|08|05|||||||9|4}}
{{CraftM|t=la|m= | | |08|06|08|07|08|05|09|07|09|07|06|04|11|4}}
{{CraftM|t=la|m= | | |09|07|09|08|09|06|10|08|10|08|06|05|13|4}}
|}

====Coverage and Hindrance====
{| class="wikitable sortable mw-collapsible mw-collapsed"
! Cast option !! Armor !! Coverage !! Carving Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Head || carapace balaclava || head, eyes, neck || Extremity Bone Armor Design || 03-light || 01-insignificant || 48 || 24
|-
| Cap || carapace cap || head || Extremity Bone Armor Design || 02-trivial || 01-insignificant || 32 || 16
|-
| Eyes || carapace mask || eyes || Accesory Bone Armor Design || 01-insignificant || 00-no || 12 || 6
|-
| Neck || carapace aventail || neck || Accessory Bone Armor Design || 01-insignificant || 01-insignificant || 16 || 8
|-
! Cast option !! Armor !! Coverage !! Carving Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Body || carapace hauberk || chest, back, abdomen, arms, legs || Complete Bone Armor Design || 09-high || 04-mild || 232 ||  116
|-
| Shirt || carapace coat || chest, back, abdomen, arms || Complete Bone Armor Design || 08-noticeable || 03-light || 184 ||  92
|-
| Torso || carapace tabard || chest, back, abdomen || Torso Bone Armor Design || 05-fair || 03-light || 120 || 60
|-
| --- || carapace vest || chest, back || Torso Bone Armor Design || 04-mild || 02-trivial || 80 || 40
|-
| Waist || carapace tasset || abdomen || Torso Bone Armor Design || 03-light || 01-insignificant || 40 || 20
|-
! Cast option !! Armor !! Coverage !! Carving Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Arms || carapace sleeves || arms, hands || Extremity Bone Armor Design || 05-fair || 02-trivial || 84 || 42  
|-
| --- || carapace vambraces || arms || Extremity Bone Armor Design || 04-mild || 01-insignificant || 64 || 32
|-
| Hands || carapace gloves || hands || Accessory Bone Armor Design || 02-trivial || 01-insignificant || 20 || 10  
|-
| Legs || carapace greaves || legs || Extremity Bone Armor Design || 03-light || 02-trivial || 48 || 24
|}

===Chain Armor===
====Protection====
{{CraftHead|lma|c=y}}
{{CraftM|t=la|m= | | |04|10|05|10|04|10|06|11|06|11|02|06|9|5}}
{{CraftM|t=la|m= | | |05|11|05|11|05|11|06|12|06|12|03|08|11|5}}
{{CraftM|t=la|m= | | |05|12|06|12|05|12|07|14|07|14|03|09|13|5}}
|}

====Coverage and Hindrance====
{| class="wikitable sortable mw-collapsible mw-collapsed"
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Head || chain balaclava || head, eyes, neck || Extremity Chain Armor Design || 02-trivial || 02-trivial || 100 || 50
|-
| Cap || chain cap || head || Extremity Chain Armor Design || 01-insignificant || 01-insignificant || 50 || 25
|-
| Eyes || chain mask || eyes || Accesory Chain Armor Design || 01-insignificant || 01-insignificant || 20 || 10
|-
| Neck || chain aventail || neck || Accessory Chain Armor Design || 01-insignificant || 01-insignificant || 30 || 15
|-
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Body || chain hauberk || chest, back, abdomen, arms, legs || Complete Chain Armor Design || 08-noticeable || 06-mild || 400 || 200
|-
| Shirt || chain shirt || chest, back, abdomen, arms || Complete Chain Armor Design || 06-mild || 05-fair || 250 || 125
|-
| Torso || chain lorica || chest, back, abdomen || Torso Chain Armor Design || 04-minor || 04-minor || 150 ||  75
|-
| --- || chain vest || chest, back || Torso Chain Armor Design || 03-light || 03-light || 100 || 50
|-
| Waist || chain tasset || abdomen || Torso Chain Armor Design || 02-trivial || 01-insignificant || 50 || 25
|-
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Arms || chain sleeves || arms, hands || Extremity Chain Armor Design || 04-minor || 03-light || 130 || 65
|-
| --- || chain vambraces || arms || Extremity Chain Armor Design || 03-light || 02-trivial || 100 || 50
|-
| Hands || chain gloves || hands || Accessory Chain Armor Design || 02-trivial || 01-insignificant || 40 || 20
|-
| Legs || chain greaves || legs || Extremity Chain Armor Design || 03-light || 03-light || 75 || 38
|}

===Brigandine Armor===
====Protection====
{{CraftHead|lma|c=y}}
{{CraftM|t=la|m= | | |06|11|05|11|05|11|06|12|06|12|03|07|9|5}}
{{CraftM|t=la|m= | | |06|11|05|11|05|11|07|13|07|13|04|08|11|5}}
{{CraftM|t=la|m= | | |07|13|06|13|06|13|08|15|07|15|04|09|13|5}}
|}

====Coverage and Hindrance====
{| class="wikitable sortable mw-collapsible mw-collapsed"
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Head || scale balaclava || head, eyes, neck || Extremity Brigandine Armor Design|| 03-light || 04-minor || 130 || 65
|-
| Cap || scale cap || head || Extremity Brigandine Armor Design|| 02-trivial || 03-light || 60 || 30
|-
| Eyes || scale mask || eyes || Accesory Brigandine Armor Design|| 01-insignificant || 01-insignificant || 25 || 13
|-
| Neck || scale aventail || neck || Accessory Brigandine Armor Design|| 02-trivial || 02-trivial || 45 || 23
|-
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Body || scale hauberk || chest, back, abdomen, arms, legs || Complete Brigandine Armor Design|| 09-high || 13-debilitating || 400 || 200
|-
| Shirt || scale shirt || chest, back, abdomen, arms || Complete Brigandine Armor Design|| 07-moderate || 09-high || 280 || 140
|-
| Torso || scale lorica || chest, back, abdomen || Torso Brigandine Armor Design|| 05-fair || 07-moderate || 170 || 85
|-
| --- || scale vest || chest, back || Torso Brigandine Armor Design|| 05-fair || 06-mild || 120 || 60
|-
| Waist || scale tasset || abdomen || Torso Brigandine Armor Design|| 03-light || 03-light || 50 || 25
|-
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Arms || scale sleeves || arms, hands || Extremity Brigandine Armor Design|| 05-fair || 04-mild || 150 || 75
|-
| --- || scale vambraces || arms || Extremity Brigandine Armor Design|| 04-mild || 04-mild || 110 || 55
|-
| Hands || scale gloves || hands || Accessory Brigandine Armor Design|| 02-trivial || 02-trivial || 40 || 20
|-
| Legs || scale greaves || legs || Extremity Brigandine Armor Design|| 03-light || 05-fair || 75 || 38
|}

===Plate Armor===
====Protection====
{{CraftHead|lma|c=y}}
{{CraftM|t=la|m= | | |07|12|08|12|05|12|08|13|08|13|04|07|9|5}}
{{CraftM|t=la|m= | | |07|12|08|12|05|12|08|14|08|14|04|09|11|5}}
{{CraftM|t=la|m= | | |08|14|09|14|06|14|09|16|09|16|05|10|13|5}}
|}

====Coverage and Hindrance====
{| class="wikitable sortable mw-collapsible mw-collapsed"
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Head || sallet || head, eyes, neck || Extremity Plate Armor Design || 04-minor || 05-fair || 175 || 88
|-
| Cap || dome helm || head || Extremity Plate Armor Design || 02-trivial || 03-light || 80 || 40
|-
| Eyes || plate mask || eyes || Accesory Plate Armor Design || 02-trivial || 01-insignificant || 35 || 18
|-
| Neck || plate aventail || neck || Accessory Plate Armor Design || 03-light || 03-light || 60 || 30
|-
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Body || full plate || chest, back, abdomen, arms, legs || Complete Plate Armor Design || 10-significant || 15-insane || 500 || 250
|-
| Shirt || half plate || chest, back, abdomen, arms || Complete Plate Armor Design || 08-noticeable || 13-debilitating || 325 || 163
|-
| Torso || plate cuirass || chest, back, abdomen || Torso Plate Armor Design || 06-mild || 10-significant || 195 || 98
|-
| --- || plate breastplate || chest || Torso Plate Armor Design || 03-light || 05-fair || 80 || 40
|-
| --- || plate backplate || back || Torso Plate Armor Design || 03-light || 05-fair || 50 || 25
|-
| Waist || plate fauld || abdomen || Torso Plate Armor Design || 03-light || 03-light || 65 || 33
|-
! Cast option !! Armor !! Coverage !! Armorsmithing Technique !! Maneuver Hindrance !! Stealth Hindrance !! Min Prep Weight !! Capped Weight !!
|-
| Arms || plate sleeves || arms, hands || Extremity Plate Armor Design || 06-mild || 06-mild || 195 || 98
|-
| --- || plate vambraces || arms || Extremity Plate Armor Design || 04-minor || 05-fair || 130 || 65
|-
| Hands || plate gauntlets || hands || Accessory Plate Armor Design || 03-light || 03-light || 65 || 33
|-
| Legs || plate greaves || legs || Extremity Plate Armor Design || 04-minor || 07-moderate || 101 || 51
|}
{{RefAl}}