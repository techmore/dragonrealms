# Appraisal skill

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{incomplete|Need info on creature strength, other stats, health and injuries. Also crafting tools and materials sections.}}

{{RTOC}}
'''Appraisal''' is a Lore skill with applications in a wide variety of systems.  It can tell you the value, weight, and other qualities of items; the stats of your [[weapon]]s and [[armor]]; the skills of your opponent; the [[mana]] capacity of [[cambrinth]] items; and more.

==Spells and Abilities that Boost Appraisal==
{{#ask:[[Boosts::Appraisal skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Spells and Abilities that Decrease Appraisal==
{{#ask:[[Debuffs::Appraisal skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

=Use=
{{com|appraise}} will give you an assessment of something's abilities. {{com|compare}} will give you a relative assessment of two items' attributes. <br>

Appraisal, at least for comparing creatures, is based on base skills rather than factoring {{stat|Agility}}. However, it does take your current {{com|stance}} settings into account.<br>

When comparing armor, it will give an assessment of the armor's overall maneuvering and stealth hindrance, as well as how hindering it is with everything your are currently wearing after factoring in the relevant armor skill.<br>

Appraisal can also give you an idea of how well you can swim or climb something, and can even provide a bonus to the swim or climb contest on a particularly good appraisal success.<br>

You will begin to see (at first very inaccurate) damage and protection appraisals at precisely 50 ranks. You can successfully appraise a creature, albeit inaccurately, without experience gain at 10 ranks. You do not gain experience for appraising creatures until 76 ranks, at which point you can see messaging about how well the critter trains.  It takes closer to around 100 ranks to get [[Appraisal skill#accuracy|accurate information]] on items and creatures.<br>

You can appraise [[cambrinth]] items to determine their capacity. Appraisal is the primary factor, but [[Arcana skill|arcana]] also contributes to the accuracy. As with weight, holding the cambrinth makes it easier to appraise its capacity.

[[Trader|Traders]] get a bonus to Appraisal. In addition they will appraise the monetary value of any item in all three currencies instead of just that of the current province.

You can also use {{tt|APPRAISE}}  to check an item's [[Item Registration|registration]] status. There is a line if it's registered indicating whether it's yours or someone else's:

:Registered to you: The funny blade looks to bear your familiar marks of registration.
:Registered to someone else: Unfamiliar marks of registration are evident on the blade.


{| class="wikitable"
|-
! Classification
! Appraisal
! Description
|-
| Trader Appraisal 
| Circle 1
| Appraised values in all three currencies
|-
| Creature Appraisal 
| 10
| Inaccurate / No experience gain
|-
| Weapon/armor appraisals 
| 50
| Inaccurate
|-
| Creature Appraisal 
| 76
| Teaches Appraisal
|-
| Accuracy Improves 
| 100+
| Generally at this point can start getting accurate appraisals. Accuracy of weapon/armor improves with the particular skill.
|-
| Appraisal Focus 
| 200
| Teaches appraisal and boosts skill drain
|-
|}

==Appraisal For Beginners==

====Weapon and Armor Appraisals====
Choosing the right equipment for your character is one of the most important decisions a new combatant faces.  Before making an informed decision, however, those wishing to enter combat should first be familiar with the basic terminology of combat.  First, let us {{tt|APPRAISE}} some weapons and armor to understand how to differentiate the value of one piece of equipment from another.  Take, for example, this fictional weapon appraisal:

<pre>
A broadsword is a heavy edged melee-ranged weapon.
A broadsword trains the large edged skill.

You are certain that it could do:
  poor puncture damage
  severe slice damage
  moderate impact damage
  no fire damage
  no cold damage
  no electric damage

The broadsword is inadequately designed for improving the force of your attacks.

You are certain that the broadsword is fairly balanced and is soundly suited to gaining extra attack power from your strength.

You are certain that the broadsword is unusually resilient to damage, and is practically in mint condition.

The broadsword is made with metal.
You are certain that the broadsword weighs exactly 52 stones.
You are certain that the broadsword is worth exactly 445398 kronars.
</pre>

Lets look at it line by line:
<pre>
A broadsword is a heavy edged melee-ranged weapon.
</pre>

The first line indicates two things: the weapon class of the weapon being appraised and the range of the weapon.

<pre>
A broadsword trains the large edged skill.
</pre>

The second line indicates which skill the weapon will train. The class is not the same as the skill. For example, both light edge, and medium edge teach the small edge skill. For the vast majority of cases, only the skill trained is important.

<pre>
You are certain that it could do:
  poor puncture damage
  severe slice damage
  moderate impact damage
  no fire damage
  no cold damage
  no electric damage
</pre>

This section lists the type of damage it does. Based on this, you will want to tailor your attacks to utilize the highest damage.

<pre>
The broadsword is inadequately designed for improving the force of your attacks.
</pre>

This is known as the Force of Impact (or FoI) stat. The higher this is, the higher the likelyhood of it causing a stun, unbalancing, or disarming an opponent.

<pre>
You are certain that the broadsword is fairly balanced and is soundly suited to gaining extra attack power from your strength.
</pre>

Balance is a stat that determines two things. The first is how well it utilizes agility to bonus accuracy. It also determines how good a weapon is at parrying.

Suitability determines how well it uses strength to grant extra damage.

<pre>
You are certain that the broadsword is unusually resilient to damage, and is practically in mint condition.
</pre>

This is a readout of how resistant to damage your weapon is, as well as it's current condition.

<pre>
The broadsword is made with metal.
</pre>

For the most part, whether a weapon is metal or not only determines which repair shop it goes to, though occasionally it may matter for other reasons.

<pre>
You are certain that the broadsword weighs exactly 52 stones.
</pre>

The heavier a weapon is, the slower it will swing, and the more fatigue it will sap on use.

<pre>
You are certain that the broadsword is worth exactly 445398 kronars.
</pre>

This is the hard-coded value of the weapon. It's only major use is to determine the cost of having a shop repair an item, which will be a percent of the appraised cost. It should be noted this has nothing to do with what players value the weapon, which can fluctuate wildly and is completely unrelated.

==Item appraisal==
There are many ways to train the Appraisal skill. The first way is to appraise items. The quickest way to learn is to appraise an item that is very valuable or has many parts, like a full gem pouch, a really nice bundle, weapons, or armor. If you can't do this, the next best option is to appraise all of your inventory, the more valuable, the better.

==Appraise Focus==
A specific type of item appraisal, {{com|APPRAISE}} {{tt|FOCUS <object>}} allows players to focus on valid objects and begin a research project similar to [[magical research]]. This command requires a minimum of 200 ranks in the appraisal skill or a [[Item:Clockwork shark|clockwork shark]] to do. Once completed, this appraisal project will award [[Appraisal skill]] experience, as well as giving a temporary boost to the amount of experience being drained in a target skill. Only one appraisal project may be active on a character at any given time, and the experience drain bonus does not stack with the bonus for an [[RPA]]. Valid targets for this ability range from yourself, which gives an evasion bonus, weapons, armor, and crafting books.

This ability uses the same base mechanics as [[Magical Research|magical research]], so cannot be performed at the same time as a research project and will be [[Magical Research#Other_actions_during_research|interupted and prevented by many of the same things]] although it is not quite as restricted.

====Example Messaging====
;Start of APPRAISE FOCUS
 You carefully examine your deobar coffer, focusing beyond any individual details.  Instead you concentrate your efforts toward honing your knowledge of locksmithing based on its abstract.

;Research is complete, Bonus begins
 Breakthrough!
 You've pored over the possibilities, weighed out the consequences, and dismissed a few flawed techniques.  Finally, you think that you've grasped a new approach for the subtleties of locksmithing inspired by its abstract.  All that's left is to put it into practice.

;Bonus ends
 Your focused insight of locksmithing has been fully explored.

====Duration====
Duration of the bonus is tied to your appraisal ranks:

{| class="wikitable" 
|- style="font-weight:bold;"
! Appraisal
! Duration
|-
| 200-399
| 20 min
|-
| 400-474
| 25 min
|-
| 475-549
| 30 min
|-
| 550-624
| 35 min
|-
| 625-699
| 40 min
|-
| 700-774
| 45 min
|-
| 775-849
| 50 min
|-
| 850-924
| 55 min
|-
| 925+
| 60 min
|}

====Compatible Skills====
{|class="sortable wikitable"
|+
|-
!Skill!!Skillset!!Game help text!!Notes
|-
|Conviction||Armor||?||Functional [[soulstone]]. (Paladin only)
|-
|Brigandine||Armor||Any piece of Brigandine Armor can be used as an APPRAISE FOCUS item.||
|-
|Chain Armor||Armor||Any piece of Chain Armor can be used as an APPRAISE FOCUS item.||
|-
|Defending||Armor||The term "Defense" can be used as an APPRAISE FOCUS concept.||
|-
|Light Armor||Armor||Any piece of Light Armor can be used as an APPRAISE FOCUS item.||
|-
|Plate Armor||Armor||Any piece of Heavy Armor can be used as an APPRAISE FOCUS item.||
|-
|Shield Usage||Armor||Any shield can be used as an APPRAISE FOCUS item.||
|-
|Alchemy||Lore||A crafting book from one of the Alchemy disciplines can be an APPRAISE FOCUS item.||
|-
|Appraisal||Lore||There are no methods to use APPRAISE FOCUS for Appraisal.||This ability cannot boost itself.
|-
|Bardic Lore||Lore||The term "Recall" can be used as an APPRAISE FOCUS concept.||the word "Recall" (Bard only)
|-
|Empathy||Lore||Other players and NPCs can be used as APPRAISAL FOCUS targets.||Empath only
|-
|Enchanting||Lore||A crafting book from one of the Enchanting disciplines can be an APPRAISE FOCUS item.||
|-
|Engineering||Lore||A crafting book from one of the Engineering disciplines can be an APPRAISE FOCUS item.||
|-
|Forging||Lore||A crafting book from one of the Forging disciplines can be an APPRAISE FOCUS item.||
|-
|Mechanical Lore||Lore||There are no methods to use APPRAISE FOCUS for Mechanical Lore.||This skill is not planned to exist much longer.
|-
|Outfitting||Lore||A crafting book from one of the Outfitting disciplines can be an APPRAISE FOCUS item.||
|-
|Performance||Lore||Any musical instrument can be used as an APPRAISAL FOCUS item.||
|-
|Scholarship||Lore||The term "Logic" can be used as an APPRAISE FOCUS concept.||
|-
|Tactics||Lore||The term "Offense" can be used as an APPRAISE FOCUS concept.||
|-
|Trading||Lore||A typical ledger can be used as an APPRAISE FOCUS item.||Trader only
|-
|Arcana||Magic||Any type of runestone can be used as an APPRAISE FOCUS item.||
|-
|Astrology||Magic||Any type of telescope can be used as an APPRAISE FOCUS item.||Moon Mage only
|-
|Attunement||Magic||Any type of cambrinth item can be used as an APPRAISE FOCUS item.||
|-
|Augmentation||Magic||Any spell that primarily uses Augmentation can be used as an APPRAISE FOCUS concept.||Both the full name and abbreviation work. APPRAISE FOCUS FORM for Barbarians
|-
|Debilitation||Magic||Any spell that primarily uses Debilitation can be used as an APPRAISE FOCUS concept.||Both the full name and abbreviation work. APPRAISE FOCUS ROAR for Barbarians
|-
|Primary Magic||Magic||The term "Magic" can be used as an APPRAISE FOCUS concept.||KHRI for Thieves, INNER FIRE for Barbarians
|-
|Sorcery||Magic||The term "Arcane" can be used as an APPRAISE FOCUS concept.||
|-
|Summoning||Magic||?||Talisman (Warrior Mage only)
|-
|Targeted Magic||Magic||Any spell that primarily uses Targeted Magic can be used as an APPRAISE FOCUS concept.||Both the full name and abbreviation work.
|-
|Theurgy||Magic||Holy water can be used as an APPRAISE FOCUS item.||Cleric only
|-
|Utility||Magic||Any spell that primarily uses Utility can be used as an APPRAISE FOCUS concept||Both the full name and abbreviation work.
|-
|Warding||Magic||Any spell that primarily uses Warding can be used as an APPRAISE FOCUS concept.||Both the full name and abbreviation work. APPRAISE FOCUS MEDITATION for Barbarians
|-
|Athletics||Survival||Any cardinal direction, or "WATER", while in a swimming area can be an APPRAISE FOCUS concept.<br>Any climbing obstacle can be an APPRAISE FOCUS item.||Only cardinal directions that exist in the current room.
|-
|Backstab||Survival||Other players and NPCs can be used as APPRAISAL FOCUS targets.||Thief only
|-
|Evasion||Survival||You can be used as an APPRAISE FOCUS item.||Yourself
|-
|First Aid||Survival||Anatomy Charts and Compendiums can be APPRAISE FOCUS items.||
|-
|Locksmithing||Survival||Any locked or trapped treasure container can be an APPRAISE FOCUS item.||
|-
|Outdoorsmanship||Survival||Foraged plants can be APPRAISE FOCUS items.||
|-
|Perception||Survival||Any cardinal direction can be used as an APPRAISE FOCUS concept.||Only cardinal directions that exist in the current room.
|-
|Scouting||Survival||Any type of companion can be used as an APPRAISE FOCUS item.||Ranger Companion
|-
|Skinning||Survival||Any worn skinning knife (regardless of adjective) or part can be an APPRAISE FOCUS item.||
|-
|Stealth||Survival||Any cardinal direction while hidden can be used as an APPRAISE FOCUS concept.||Only cardinal directions that exist in the current room.
|-
|Thanatology||Survival||A ritual knife can be used as an APPRAISE FOCUS item.||Necromancer only
|-
|Thievery||Survival||Any coin on the ground can be an APPRAISE FOCUS item.||
|-
|Bows||Weapon||Any Bows type weapon can be used as an APPRAISE FOCUS item.||
|-
|Brawling||Weapon||Any type of Brawling gear can be used as an APPRAISE FOCUS item.||Not including parry sticks.
|-
|Crossbow||Weapon||Any Crossbow type weapon can be used as an APPRAISE FOCUS item.||
|-
|Expertise||Weapon||Any chakrel item can be used as an APPRAISE FOCUS item.||Chakrel amulets (Barbarian only)
|-
|Heavy Thrown||Weapon||Any weapon that is primarily a Heavy Thrown weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Large Blunt||Weapon||Any Large Blunt weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Large Edged||Weapon||Any Large Edged weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Light Thrown||Weapon||Any weapon that is primarily a Light Thrown weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Melee Mastery||Weapon||Any swappable weapon can be used as an APPRAISE FOCUS item.||e.g. bastard sword
|-
|Missile Mastery||Weapon||Any type of ammo can be used as an APPRAISE FOCUS item.||
|-
|Offhand Weapon||Weapon||Any melee weapon held in the left hand can be used as an APPRAISE FOCUS item.||
|-
|Parry Ability||Weapon||Parry sticks can be used as an APPRAISE FOCUS item.||
|-
|Polearms||Weapon||Any Polearms type weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Slings||Weapon||Any Slings type weapon can be used as an APPRAISE FOCUS item.||
|-
|Small Blunt||Weapon||Any Small Blunt weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Small Edged||Weapon||Any Small Edged weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Staves||Weapon||Any Staves type weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Twohanded Blunt||Weapon||Any Twohanded Blunt weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|-
|Twohanded Edged||Weapon||Any Twohanded Edged weapon can be used as an APPRAISE FOCUS item.||Must not be a swappable weapon and must be held in the right hand.
|}

==Creature appraisal==
The second way to learn is to appraise [[#Creature|critters]].  One can appraise a beast multiple times without regard for a delay between appraisals to quickly learn the ability.  Besides being a good way to gain appraisal experience once you have 76 ranks in Appraisal skill, this is a good habit to develop: It's useful to know in advance how a critter's skill compares to yours.<br />
A normal or {{tt|quick}} appraise will gauge how much vitality and fatigue a critter currently has, how your stats compare to theirs, and an overall comparison of your offense and defense to theirs.<br />
At 76 ranks, appraising {{tt|careful}} will also tell you how the critter will train by [[Brawling skill|brawling]], [[Parry Ability skill|parrying]], [[Evasion skill|evading]], [[Shield Usage skill|blocking]], beguile with [[Tactics skill|tactics]], and [[Targeted Magic skill|targeting]].  If you are holding a [[:Category:Weapon Skillset|weapon]], it will also tell you how well it will train, and if you were to throw it, how it would teach thrown.

==Barrier appraisal==
The third way, possibly of greatest use to new adventurers, is to appraise swimming locations. In a room where a swimming contest is necessary to exit, you can appraise water or direction. It's not clear how well this trains, as a new character can learn very little in the Crossing sewers but very well in the Arthe Dale swimming hole. It may be dependent on water depth and current. You can also appraise climbing barriers, but this seems to teach little or nothing at lower ranks.  Successfully appraising a swim or a climb may give you a bonus ("You think you have determined the best route to take") to climbing or swimming the appraised barrier.
*It's worth noting that climbing barriers can be more difficult than the appraisal lets on.

==Item creation==
The fourth way to learn is through the creation process of several items.  Usually when you are creating an item you will gain a little appraisal as well when you determine the quality of the item.  For example, when braiding grass/vines, you will learn appraisal.  Every time you braid you are automatically appraising the item to see the quality of the item.  Another example is Moon Mage sigil scrolls, every time you read a scroll you appraise the quality of the scroll.  This way is good for learning appraisal while also learning other skills. (In the case of Moon Mage sigil scrolls, you will learn appraisal faster than you will learn astrology or scholarship, but possibly might have a limit.  I have tested with 267 in astrology, 241 in appraisal, and 324 in scholarhsip, I am locking appraisal first, then astrology, then scholarship).

==[[Fine art appraisal]]==
Adventurers have the ability to analyze one-of-a-kind stationary artifacts and receive more details than just your standard {{com|LOOK}}. The [[Raven's Court]] was the inaugural area with this type of appraisal available, with more pieces now found in locations around Elanthia. One must {{tt|STUDY}} a piece in order to learn. STUDYing will teach appraisal and scholarship. There are a few levels of success. Everyone should be able to learn no matter what information they see. Naturally, with the highest level of success, the most information will be displayed. Bards and Traders have a bonus, so they should effectively be able to learn better and see more information earlier on.

==Item weight detection==
3.0 changed detecting numerical weights in stones to not occur until higher ranks.  For a non-trader, expect not to begin to get numerical weight return on appraisals for any item until 170 ranks at minimum.  As you increase in skill, weight detection will become more common and more accurate.  At 400 ranks you receive a fairly accurate weight estimate most of the time.  At 500 ranks, expect perfect weight results every time with the standard 8 second roundtime.  As an aside, at 500 ranks, quick appraisals continue to be clumsy regarding weight, but will be exact in all other regards, probably the equivalent of a standard appraisal at 250-300 ranks.

An accurate weight appraisal will have the following messaging:
  You are certain that the <item> weighs exactly <N> stones.

The key words are '''You are certain''' and '''weighs exactly'''.

Even if you are certain about your appraisal, you may only be approximating the weight.

A fairly close approximation will have the following messaging:
  You are certain that the <item> weighs around <N> stones.

The key words are '''You are certain''' and '''weighs around'''. This is not a guarantee that the weight you approximated is the real weight, but you're close.

=Accuracy=
The accuracy of your appraisal depends primarily upon the number of ranks that you have in appraisal. ([[Trader|Traders]] have a bonus.)<br>
<br>
When appraising weapons or armor, the number of ranks that you have in that weapon or armor type affects the accuracy, at least for non-Traders. For example, if you were appraising a claymore, you find it easier to appraise if you had 200 ranks in twohanded edged weapons than if you had only 50 ranks.<br>
<br>
Only when "you are certain" about some property can you be sure that your appraisal is an accurate assessment. Otherwise, the more confident you are about the accuracy, the closer your assessment is to the truth.

Accuracy Levels (from best to worst)

*are/feel certain that
*are/feel confident that
*think that
*believe that
*are pretty sure that
*think it is likely that
*estimate that
*guess that
*wonder if

=Appraisal values=
==Weapons==
{|
|valign="top"|
{|class="wikitable"
|+
|-
!Order!!Damage!!Min Value!!Max Value
|-
|0||no||0||0
|-
|1||dismal||1||5
|-
|2||poor||5||10
|-
|3||low||10||15
|-
|4||somewhat fair||15||20
|-
|5||fair||20||25
|-
|6||somewhat moderate||25||30
|-
|7||moderate||30||35
|-
|8||somewhat heavy||35||40
|-
|9||heavy||40||45
|-
|10||very heavy||45||50
|-
|11||great||50||55
|-
|12||very great||55||60
|-
|13||severe||60||65
|-
|14||very severe||65||70
|-
|15||extreme||70||75
|-
|16||very extreme||75||??
|-
|17||mighty||||
|-
|18||very mighty||||
|-
|19||bone-crushing||||
|-
|20||very bone-crushing||||
|-
|21||devastating||||
|-
|22||very devastating||||
|-
|23||overwhelming||||
|-
|24||annihilating||||
|-
|25||obliterating||||
|-
|26||demolishing||||
|-
|27||catastrophic||||
|-
|28||god-like||||
|}
|valign="top"|
{|class="wikitable"
|+
|-
!Order!!Balance/Power/FOI!!Min Value!!Max Value
|-
|0 ||not||||
|-
|1 ||terribly||||
|-
|2 ||dismally||||
|-
|3 ||poorly||||
|-
|4 ||inadequately||||
|-
|5 ||fairly||||
|-
|6 ||decently||||
|-
|7 ||reasonably||||
|-
|8 ||soundly||||
|-
|9 ||well||||
|-
|10 ||very well||||
|-
|11 ||extremely well||||
|-
|12 ||exellently||||
|-
|13 ||superbly||||
|-
|14 ||incredibly||||
|-
|15 ||amazingly||||
|-
|16 ||unbelievably||||
|-
|17 ||perfectly||||
|}
|}
The numerical values for damage were derived from Copernicus' Storebought Guide. Copernicus derived the weapon values through an intensive process of comparing storebought weapons with forged weapons having known values of damage, balance, and power.  Some information is still missing or incomplete.

{|class="wikitable"
|-
!Order||Draw Strength!!Shortbow!!Longbow!!Composite Bow
|-
|1||extremely low||||||
|-
|2||very low||||||
|-
|3||somewhat low||||||
|-
|4||average||3||4||5
|-
|5||somewhat high||||||
|-
|6||very high||||||
|-
|7||exceptionally high||||||
|-
|8||extremely high||||||
|}

{|class="wikitable"
|-
!Order!!Brawling Gear Damage!!Min Value!!Max Value
|-
|0||no||0||0
|-
|1||a little||?||?
|-
|2||some||?||?
|-
|3||quite a bit||?||?
|-
|4||a lot||?||?
|}

{|class="wikitable"
|-
!Order!!Brawling Weapon Damage Increase
|-
|0||no
|-
|1||poor
|-
|2||low
|-
|3||fair
|-
|4||moderate
|-
|5||heavy
|-
|6||great
|-
|7||severe
|}
There are two types of brawling damage.
:*If the damage stat does not end in "increase," it replaces the standard stat-based damage and uses the brawling weapon scale.
:*If the damage stat ends in "increase," the weapon adds a percentage-based bonus to the standard stat-based damage and uses the same scale as standard weapons. According to GM Kodius, this model is being phased out, because these weapons "don't seem to do much of anything."

===Load Times===
When you {{tt|APPRAISE}} a sling, bow, or crossbow, you will now see the base load time (before any stat, skill, or other modifications).

Load times are given in a range of X-Y seconds. The line about whether or not the weapon has a weighting preference refers to the load time. It can be unweighted, weighted toward the lower number (X), or weighted toward the higher number (Y).

:''For an unskilled commoner, this shortbow typically takes 2-3 seconds to load, weighted towards the shorter loading time.''

==Armor & shield==

===Hindrance===

Though they use the same adjectives and order, a trivially hindering piece of armor does not hinder the same as a trivially hindering shield. The armor has more hindrance.

The armor/shield hindrance list reflects the hindrance of that armor piece before taking into consideration your skills and abilities.

The skill hindrance list reflects the range of hindrance you actually endure when wearing the items, taking into consideration your skills and abilities.

{|
|- valign="top"
|'''Armor/Shield Hindrance'''
{|class="wikitable"
!Order!!Hindrance
|-
|0||no
|-
|1||insignificant
|-
|2||trivial
|-
|3||light
|-
|4||minor
|-
|5||fair
|-
|6||mild
|-
|7||moderate
|-
|8||noticeable
|-
|9||high
|-
|10||significant
|-
|11||great
|-
|12||extreme
|-
|13||debilitating
|-
|14||overwhelming
|-
|15||insane
|}
|valign="top"|
|'''Skill Hindrance'''
{|class="wikitable"
!Order!!Hindrance
|-
|0||unhindered
|-
|1||barely hindered
|-
|2||minimally hindered
|-
|3||insignificantly hindered
|-
|4||lightly hindered
|-
|5||fairly hindered
|-
|6||somewhat hindered
|-
|7||moderately hindered
|-
|8||rather hindered
|-
|9||very hindered
|-
|10||highly hindered
|-
|11||greatly hindered
|-
|12||extremely hindered
|-
|13||overwhelmingly hindered
|-
|14||insanely hindered
|}
|}

===Armor protection and absorption===
{|
|- valign="top"
|
{|class="wikitable"
!Order!! Protection
|-
|0|| no
|-
|1|| poor
|-
|2|| low
|-
|3|| fair
|-
|4|| moderate
|-
|5|| good
|-
|6|| very good
|-
|7|| high
|-
|8|| very high
|-
|9|| great
|-
|10|| very great
|-
|11|| extreme
|-
|12|| exceptional
|-
|13|| incredible
|-
|14|| amazing
|-
|15|| unbelievable
|}
|valign="top"|
{|class="wikitable"
!Order!! Absorbance
|-
|0|| no
|-
|1|| very poor
|-
|2|| poor
|-
|3|| low
|-
|4|| somewhat fair
|-
|5|| fair
|-
|6|| moderate
|-
|7|| good
|-
|8|| very good
|-
|9|| high
|-
|10|| very high
|-
|11|| great
|-
|12|| very great
|-
|13|| extreme
|-
|14|| exceptional
|-
|15|| incredible
|-
|16|| amazing
|-
|17|| unbelievable
|}
|}

===Shield protection===

There are two tiers of armor perception, requiring skill to get more detailed information. [[Paladin|Paladins]] always receive the more specific scale.

The message "Your experience with shields allows a better appraisal of the protection capabilities." means you have received the more detailed appraisal.
{|
|valign="top"|
{|class="wikitable"
!Order!!Standard
|-
|0||no
|-
|1||extremely terrible
|-
|2||dismal
|-
|3||poor
|-
|4||low
|-
|5||fair
|-
|6||moderate
|-
|7||good
|-
|8||high
|-
|9||great
|-
|10||exceptional
|-
|11||impressive
|-
|12||amazing
|-
|13||tremendous
|-
|14||god-like
|}
|valign="top"|
{|class="wikitable"
!Order!!Expanded
|-
|0||no
|-
|1||extremely terrible
|-
|2||terrible
|-
|3||dismal
|-
|4||very poor
|-
|5||poor
|-
|6||rather low
|-
|7||low
|-
|8||fair
|-
|9||better than fair
|-
|10||moderate
|-
|11||moderately good
|-
|12||good
|-
|13||very good
|-
|14||high
|-
|15||very high
|-
|16||great
|-
|17||very great
|-
|18||exceptional
|-
|19||very exceptional
|-
|20||impressive
|-
|21||very impressive
|-
|22||amazing
|-
|23||incredible
|-
|24||tremendous
|-
|25||unbelievable
|-
|26||god-like
|}
|}

==Crafting Tools==
===Speed===
{|class="wikitable"
|+
! Order !! Speed
|-
| 1 || completely ineffective
|-
| 2 || tremendously ineffective
|-
| 3 || extremely ineffective
|-
| 4 || very ineffective
|-
| 5 || not very effective
|-
| 6 || sort of effective
|-
| 7 || rather effective
|-
| 8 || very effective
|-
| 9 || exceptionally effective
|-
| 10 || extremely effective
|-
| 11 || tremendously effective
|}
==Equipment construction and condition==
===Construction===
{|class="wikitable"
|+
! Order !! Construction
|-
| 1 || extremely weak and easily damaged 
|-
| 2 || very delicate and easily damaged
|-
| 3 || quite fragile and easily damaged
|-
| 4 || rather flimsy and easily damaged
|-
| 5 || particularly weak against damage
|-
| 6 || somewhat unsound against damage
|-
| 7 || appreciably susceptible to damage
|-
| 8 || marginally vulnerable to damage
|-
| 9 || of average construction
|-
| 10 || a bit safeguarded against damage
|-
| 11 || rather reinforced against damage
|-
| 12 || quite guarded against damage
|-
| 13 || highly protected against damage
|-
| 14 || very strong against damage
|-
| 15 || extremely resistant to damage
|-
| 16 || unusually resilient to damage
|-
| 17 || nearly impervious to damage
|-
| 18 || practically invulnerable to damage
|}

===Condition===
{|class="wikitable"
|+
|-
!Condition!!Min Health!!Max Health
|-
|in pristine condition||100%||100%
|-
|practically in mint condition||91%||99%
|-
|in good condition||81%||90%
|-
|rather scuffed up||71%||80%
|-
|some minor scratches||61%||70%
|-
|a few dents and dings||51%||60%
|-
|several unsightly notches||41%||50%
|-
|heavily scratched and notched||31%||40%
|-
|badly damaged||21%||30%
|-
|battered and practically destroyed||0%||20%
|}

==Equipment Comparisions==
When using {{com|COMPARE}} on weapons, shields, and armor.

===Weapon Damage===
{|class="wikitable"
!# !! Weapon Damage
|-
| -7 || does far less [type] damage than
|-
| -6 || does a lot less [type] damage than
|-
| -5 || does a lot less [type] damage than
|-
| -4 || does less [type] damage than
|-
| -3 || does less [type] damage than
|-
| -2 || does somewhat less [type] damage than
|-
| -1 || does a little less [type] damage than
|-
| 0 || does about as much [type] damage as
|-
| +1 || does a little more [type] damage than
|-
| +2 || does somewhat more [type] damage than
|-
| +3 || does more [type] damage than
|-
| +4 || does more [type] damage than
|-
| +5 || does a lot more [type] damage than
|-
| +6 || does a lot more [type] damage than
|-
| +7 || does far more [type] damage than
|}

===Balance/Power===
{|class="wikitable"
!# !! Balance/Power
|-
| -7 || is far less balanced than
|-
| -6 || is a lot less balanced than
|-
| -5 || is a lot less balanced than
|-
| -4 || is less balanced than
|-
| -3 || is less balanced than
|-
| -2 || is somewhat less balanced than
|-
| -1 || is a little less balanced than
|-
| 0 || is about as balanced as
|-
| +1 || is a little more balanced than
|-
| +2 || is somewhat more balanced than
|-
| +3 || is more balanced than
|-
| +4 || is more balanced than
|-
| +5 || is a lot more balanced than
|-
| +6 || is a lot more balanced than
|-
| +7 || is far more balanced than
|}

===Shield Protection===
{|
|- valign="top"
|'''[[Shield_Usage_skill#Shield_Stats|Fortuitous Block Chance]]'''&thinsp;<ref>Previously called "minimum defense".</ref>
{|class="wikitable"
!# !! Shield Protection
|-
| -7 || offers a far lower chance to fortuitously block attacks than
|-
| -6 || offers a lot lower chance to fortuitously block attacks than
|-
| -5 || offers a lot lower chance to fortuitously block attacks than
|-
| -4 || offers a lower chance to fortuitously block attacks than
|-
| -3 || offers a lower chance to fortuitously block attacks than
|-
| -2 || offers a somewhat lower chance to fortuitously block attacks than
|-
| -1 || offers a little lower chance to fortuitously block attacks than
|-
| 0 || offers about as good of a chance to fortuitously block attacks as
|-
| +1 || offers a little higher chance to fortuitously block attacks than
|-
| +2 || offers a somewhat higher chance to fortuitously block attacks than
|-
| +3 || offers a higher chance to fortuitously block attacks than
|-
| +4 || offers a higher chance to fortuitously block attacks than
|-
| +5 || offers a lot higher chance to fortuitously block attacks than
|-
| +6 || offers a lot higher chance to fortuitously block attacks than
|-
| +7 || offers a far higher chance to fortuitously block attacks than
|}
|valign="top"|
| '''[[Shield_Usage_skill#Shield_Stats|Protection]]'''&thinsp;<ref>Previously called "maximum defense".</ref>
{|class="wikitable"
!# !! Shield Protection
|-
| -7 || offers far lower protection than
|-
| -6 || offers a lot lower protection than
|-
| -5 || offers a lot lower protection than
|-
| -4 || offers lower protection than
|-
| -3 || offers lower protection than
|-
| -2 || offers somewhat lower protection than
|-
| -1 || offers a little lower protection than
|-
| 0 || offers about as much protection as
|-
| +1 || offers a little higher protection than
|-
| +2 || offers somewhat higher protection than
|-
| +3 || offers higher protection than
|-
| +4 || offers higher protection than
|-
| +5 || offers a lot higher protection than
|-
| +6 || offers a lot higher protection than
|-
| +7 || offers far higher protection than
|}
|}

===Armor Protection and Absorption===
{|class="wikitable"
!# !! Armor Protection and Absorption
|-
| -7 || is far less [resistant/absorptive]
|-
| -6 || is a lot less [resistant/absorptive]
|-
| -5 || is a lot less [resistant/absorptive]
|-
| -4 || is less [resistant/absorptive]
|-
| -3 || is less [resistant/absorptive]
|-
| -2 || is somewhat less [resistant/absorptive]
|-
| -1 || is a little less [resistant/absorptive]
|-
| 0 || is about as [resistant/absorptive]
|-
| +1 || is a little more [resistant/absorptive]
|-
| +2 || is somewhat more [resistant/absorptive]
|-
| +3 || is more [resistant/absorptive]
|-
| +4 || is more [resistant/absorptive]
|-
| +5 || is a lot more [resistant/absorptive]
|-
| +6 || is a lot more [resistant/absorptive]
|-
| +7 || is far more [resistant/absorptive]
|}

===Base Hindrance===
{|class="wikitable"
!# !! Base Hindrance
|-
| -7 || is far easier to maneuver with than
|-
| -6 || is a lot easier to maneuver with than
|-
| -5 || is a lot easier to maneuver with than
|-
| -4 || is easier to maneuver with than
|-
| -3 || is easier to maneuver with than
|-
| -2 || is somewhat easier to maneuver with than
|-
| -1 || is a little easier to maneuver with than
|-
| 0 || is about as easy to maneuver with as
|-
| +1 || is a little harder to maneuver with than
|-
| +2 || is somewhat harder to maneuver with than
|-
| +3 || is harder to maneuver with than
|-
| +4 || is harder to maneuver with than
|-
| +5 || is a lot harder to maneuver with than
|-
| +6 || is a lot harder to maneuver with than
|-
| +7 || is far harder to maneuver with than
|}

===Construction/Durability===
{|class="wikitable"
!# !! Construction/Durability
|-
| -7 || is far weaker than
|-
| -6 || is a lot weaker than
|-
| -5 || is a lot weaker than
|-
| -4 || is weaker than
|-
| -3 || is weaker than
|-
| -2 || is somewhat weaker than
|-
| -1 || is a little weaker than
|-
| 0 || is about as strong as
|-
| +1 || is a little stronger than
|-
| +2 || is somewhat stronger than
|-
| +3 || is stronger than
|-
| +4 || is stronger than
|-
| +5 || is a lot stronger than
|-
| +6 || is a lot stronger than
|-
| +7 || is far stronger than
|}

==Creature==
* Can start appraising creatures with 10 ranks of Appraisal, although it will not teach until 76 ranks when you unlock more information about training.

===Condition===
For vitality, spirit health, and fatigue, it may be possible to see value of 11/10. This indicates that the creature is
buffed beyond 100%. (Spirit size is available to Empaths and Clerics only.)

{|
|- valign="top"
|'''Vitality, Spirit Health, & Fatigue'''
{|class="wikitable"
|+
!# !! Vitality !! Spirit Health !! Fatigue
|-
| 11 || incredibly healthy || incredibly healthy || invigorated
|-
| 10 || healthy || healthy || [no messaging]
|-
| 9 || slightly battered || slightly battered || slightly fatigued
|-
| 8 || slightly battered || slightly battered || slightly fatigued
|-
| 7 || battered || battered || somewhat fatigued
|-
| 6 || beat up || beat up || somewhat fatigued
|-
| 5 || very beat up || very beat up || tired
|-
| 4 || extremely beat up || extremely beat up || tired
|-
| 3 || in bad shape || in bad shape || very tired
|-
| 2 || in very bad shape || in very bad shape || very tired
|-
| 1 || in extremely bad shape || in extremely bad shape || extremely tired
|-
| 0 || at death's door || without life || exhausted
|-
| 0 || dead || beyond life ||
|-
|}
|'''Spirit Size (Cleric/Empath Only)'''
{|class="wikitable"
|+
! # !! Spirit Size
|-
| 6 || an incredible
|-
| 5 || a tremendous
|-
| 4 || a mighty
|-
| 3 || a great
|-
| 2 || a large
|-
| 1 || a normal
|}
|}

===Wounds===
The appearance of two numbers is intentional. The first number represents the ''number'' of wounds, and the second number represents the ''severity'' of the creature's worst wound(s).

Example: The young wyvern has a (1) major wound (3/3).

{|
|- valign="top"
|'''Wound Count'''
{|class="wikitable"
|+
! # !! Wound Count
|-
| 1 || a
|-
| 2 || a couple
|-
| 3 || a few
|-
| 4 || more than a few
|-
| 5 || more than a few
|-
| 6 || many
|}
|'''Wound Severity'''
{|class="wikitable"
|+
! # !! Wound Severity
|-
| 1 || relatively minor wound(s)
|-
| 2 || serious wound(s)
|-
| 3 || major wound(s)
|}
|}

===Relative Statistics===
All five attributes -- strength, agility, discipline, reflex, and stamina -- use the same scale. For simplicity, only
the strength descriptors are shown in the table. The descriptors for the other stats are agile, disciplined, quick to
react, and conditioned, respectively.

As a reminder, each appraisal typically represents a range of values. Seeing that a creature is +1 level in strength
over you does not mean it has 1 more point in strength than you have; rather, it just represents the next tier of
messaging.

{|class="wikitable"
|+
! # !! Attribute
|-
| -10 || not nearly as strong as
|-
| -9 || far weaker than
|-
| -8 || a great deal weaker than
|-
| -7 || significantly weaker than
|-
| -6 || quite a bit weaker than
|-
| -5 || definitely weaker than
|-
| -4 || rather weaker than
|-
| -3 || somewhat weaker than
|-
| -2 || not quite as strong as
|-
| -1 || about as strong as
|-
| 0 || about as strong as
|-
| +1 || about as strong as
|-
| +2 || apparently as strong as
|-
| +3 || a little stronger than
|-
| +4 || a little stronger than
|-
| +5 || somewhat stronger than
|-
| +6 || somewhat stronger than
|-
| +7 || rather stronger than
|-
| +8 || rather stronger than
|-
| +9 || definitely stronger than
|-
| +10 || definitely stronger than
|-
| +11 || quite a bit stronger than
|-
| +12 || quite a bit stronger than
|-
| +13 || significantly stronger than
|-
| +14 || significantly stronger than
|-
| +15 || a great deal stronger than
|-
| +16 || a great deal stronger than
|-
| +17 || far stronger than
|-
| +18 || far stronger than
|-
| +19 || far, far stronger than
|-
| +20 || far, far, far stronger than
|-
| +21 || incomprehensibly stronger than
|}

===Relative Difficulty===
Relative offensive and defensive difficulty use the same scale. 0 represents something that is evenly matched. (Yes, the
scale is asymmetric, with more negative values than positive values; adding positive values to balance it out was beyond
the scope of the initial release.)

{|class="wikitable"
|+
! # !! Relative Difficulty
|-
| -11 || a very easy opponent
|-
| -10 || well beneath your abilities
|-
| -9 || a simple opponent
|-
| -8 || an easy opponent
|-
| -7 || a relatively easy opponent
|-
| -6 || definitely less skilled
|-
| -5 || a less skilled opponent
|-
| -4 || a slightly less skilled opponent
|-
| -3 || a worthy opponent
|-
| -2 || a solid opponent
|-
| -1 || a challenging opponent
|-
| 0 || a difficult opponent
|-
| +1 || a rather difficult opponent
|-
| +2 || a quite difficult opponent
|-
| +3 || a very difficult opponent
|-
| +4 || a truly skilled opponent
|-
| +5 || an extremely skillful opponent
|-
| +6 || something that'd kill you quickly
|-
| +7 || something that could tear you to shreds
|}

===Training Evaluations===
While all eight training evaluations -- held weapons, thrown weapons, parry, evasion, shield, tactics, TM, and
debilitation -- use the same scale, the "very well" and "exceptionally well" messaging for offensive abilities has
caveats representing the low likelihood of success.

{|class="wikitable"
|+
! # !! Training Potential
|-
| 1 || quite badly
|-
| 2 || very poorly
|-
| 3 || somewhat poorly
|-
| 4 || acceptably
|-
| 5 || rather well
|-
| 6 || very well
|-
| 7 || exceptionally well
|}

==Cambrinth==
Exact values appear around 360 Appraisal, possible that Arcana plays a role as well.

===Difficulty===
{|class="wikitable"
|+
|-
!Capacity!!Verbal Description
|-
|4-20||very lttle mana
|-
|30-50||a little mana
|-
|<108||a moderate amount of mana
|}

==Climbing and swimming==

==Scripts and settings==
*[[See 'n Say Appraisal (script)]]: Genie script that appraises any weapon, shield, or armor and then echoes the appraisal in IC and OOC ways
*[[See 'n Say Comparison (script)]]: Genie script that compares any weapon, shield, or armor and then echoes the comparison in an IC way.
*[http://www.genieclient.com/bulletin/index.php?app=downloads&showfile=15 Numerical Appraisal Subs]: Genie subs that add a numerical description to the verbal appraisal output for damage, balance/suitability, protection, hindrance, construction, and condition.

==See also==
*{{com|analyze}}
*[[Trader's Scale]]
{{RefAl|a=y}}
{{Cat|Lore skillset,Skills,Trader abilities}}