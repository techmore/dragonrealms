# Combat

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{UpdateDR3|Needs massive updating}}
{{Incomplete|needs massive work}}
{{RTOC}}
==Introduction==
Although not the primary focus of [[DragonRealms]] as some may argue, '''combat''' is for many guilds and players an integral part of experiencing DragonRealms.  DragonRealms has a wonderfully intricate and diverse combat system.  Given the sheer amount of information needed to truly succeed in combat, however, many players new to combat (or the game) are initially overwhelmed.  The purpose of this page is to serve as a guide for combat at all skill levels.

Note that this guide will deal primarily with standard critter-hunting.  For tips on Player versus Player (PvP) combat, refer to individual guild pages.  A PvP guide may be forthcoming at some point.

==Beginner's Guide==

Welcome to combat!  Combat in DragonRealms is fun and challenging; however, I remember as a young player how overwhelming combat could be at first.  This guide is meant to help players completely new to combat, whether they be a transcendent Moon Mage or a Commoner fresh out of character generation.  Let's start from the very beginning, which is...

===Equipment You Will Need===

*'''A weapon''': There is little substitute for a good weapon at your side.  Magic is amazingly versatile but has definite limitations; a weapon in your hand will be equally deadly no matter how poor the mana in the room is.  The great thing about DragonRealms is that the experience system allows one to do almost anything they want; as a result, nothing on this list is absolutely necessary.  Non-combatants wishing to learn only Parry and not a weapon class itself can substitute parry sticks for weapons.  A break-down of all weapon classes, with positives and negatives, will follow shortly.

*'''A shield''': Many characters choose to train with a [[Shield skill|shield]] in addition to [[Parry Ability skill|parry]] and [[Evasion skill|evasion]]. Shields add to a character's [[hinderance]], but tend to be more reliable than other defenses when the character is [[stun|stunned]], prone, or otherwise compromised. Shields may be held in the left hand or worn on the arm. Armworn shields offer a greater hinderance penalty and do not protect as well, but leave the character's off hand free to hold other objects. Most guilds are limited in what shields may be worn on the arm.

*'''Some armor''': Armor hinders your [[stealth]], [[evasion skill]], and several other skills, but is vital for protecting a character at any level. Attacks made on body parts (specifically the hands and eyes) which are unarmored have a much higher chance of stunning a character. Armor also offers an absorptive and an ablative effect, either outright deflecting blows or cushioning some of the damage.

For more on how to evaluate weapons and armors see [[Appraisal_skill#Appraisal_For_Beginners|Appraisal For Beginners]].

===Combat Ranges===
All combat is divided into three different ranges: missile, pole, and melee.  To demonstrate these three, let's take a look at our first opponent, who has just entered the area:
<pre>
A ship rat just arrived.
</pre>
We now have our target!  Harmless though he may seem, he can be deceptively deadly if you go in swinging with a terrible set-up.  Now, in order to engage in pole or melee combat, one of the opponents (you or the rat) must {{com|ADVANCE}} <target>.
<pre>
The ship rat begins to advance on you!
The ship rat is still a distance away from you and is closing steadily.
</pre>

In this case, it has begun advancing you. Over time, it will begin to get closer. The range a creature begins at depends on the environment. If outside, the target will begin at Missile range, in which only bows, crossbows, slings, or thrown weapons can be used.
<pre>
The ship rat closes to pole weapon range on you!
</pre>

If combat is inside, such as a building or a cave, targets begin at pole range. At this range, in addition to ranged weapons, long pole range weapons such as halberds or longer spears can also be employed.

Any melee attack at this point will just tell you you're out of range. You will no longer automatically charge to melee.

<pre>
The ship rat closes to melee range on you!
</pre>

The final range is melee range, in which any weapon can be used.

===Range Management and Disengaging===
There are four commands used to affect range. As previously mentioned, {{com|advance}} attempts to close the distance between yourself and a target. 

The {{com|retreat}} command will either stop advancing or attempt to move back one combat range. Success depends a great deal on hindrance and encumbrance as well as the agility and reflex stats. Each time an attempt is made to retreat within a short period of time, an additional attack penalty is added. This is to prevent endless attacks on a person who is attempting to close to melee. Eventually the penalties will become so severe that landing a hit is impossible. 

{{com|hangback}} is an automated command that will attempt to counter any advance with a retreat, preventing change in distance.

Lastly, {{com|flee}} attempts to completely disengage from combat, and if a direction is specified, leave that direction. Be warned, it is not an instantaneous command, and during the period between activating and actually fleeing, defenses are reduced. Flee is automatic, unless a stun is received during the attempt.

You can use the {{com|assess}} command at any time to see the combat ranges of any creatures present, as well as which one you are facing. '''In order to leave a room it is necessary to have no creatures at melee or pole range.'''
<pre>
 You assess your combat situation...

You (solidly balanced) are facing a ship rat (1) at melee range.
A ship rat (1: very badly balanced) is flanking you at melee range.
A ship rat (2: solidly balanced) is facing you at melee range.
A ship rat (3: off balance) is flanking you at melee range.
</pre>

===Attack!===
Once you have your creature, such as a rat, at a range suitable for your weapon you can simply use the {{com|ATTACK}} command to try to attack it. {{com|Attack}} is a simplistic combat command that uses a balance-neutral combat combo based on the weapon being used. Once you are feeling more comfortable in combat, it is recommended you learn more about the different types of combat attacks called [[Combat#Maneuver Chart|maneuvers]].

===Offensive Skills===
*[[Weapon Skillset|Weapon skills]] (examples being small edged, longbow, two-handed blunt, etc.) represent skill at attacking opponents with any chosen weapon category.
*[[Brawling skill|Brawling]] represents skill attacking an opponent with the intent to damage while unarmed.  <s>Brawling is a very versatile weapon class, and is even useful to empaths, as brawling can be learned without damaging an opponent via the commands {{tt|CIRCLE}}, {{tt|BOB}}, and {{tt|WEAVE}}.</s> [{{tt|CIRCLE}}, {{tt|BOB}}, and {{tt|WEAVE}} now train Tactics instead.]
*[[Offhand Weapon skill]] represents the ability to accurately hit and do damage with a weapon in the left hand, or via dual wielding. This only applies to melee and thrown weapons.
*{{skill|Tactics}} covers the use of non-damaging unarmed attacks and brawling-like defensive maneuvers. Can be learned with {{tt|CIRCLE}}, {{tt|BOB}}, {{tt|WEAVE}}, and {{tt|ANALYZE}} (critter name).
*[[Targeted Magic skill|Targeted Magic]] represents the ability to better aim direct damage spells.
*[[Debilitation skill]] covers the magic that impedes, but does not directly damage.

===Defensive Skills===
*{{skill|Evasion}} represents your ability to twist out of the way of blows.  Usually mandatory for anyone interested in combat, as it is weakens your foe's attack power more per rank than the other two defense.
*{{skill|Shield Usage}} represents your ability to block oncoming attacks with your shield.  Highly recommended for everyone, and almost mandatory for those wishing to engage in scenarios like PvP, invasions, etc.
*{{skill|Parry Ability}} represents your ability to block oncoming attacks by deflecting them with your weapon.  As per GM [[Ssra]], parry is (supposedly) the most powerful defense at melee, so anyone planning to wade through a sea of foes should consider training this skill.
*Armor skills ({{skill|Light Armor}}, {{skill|Chain Armor}}, {{skill|Brigandine Armor}}, {{skill|Plate Armor}}) represent your ability to maneuver and hide in the respective armor category.  Eventually your skill in an armor will also contribute to the protection your armor provides you.
*{{skill|Perception}} represents your ability to spot hidden targets, particularly those trying to attack you from hiding.  Mandatory for anyone interested in PvP or fighting foes that like to hide.  Recommended for anyone, though, as it is a great defense against theft.
*{{skill|Defending}} represents your ability to handle many foes at once, as well as any defensive measures that are not covered by evasion, parry, or shield.

===Stealth Skills===

*{{skill|Stealth}} represents your ability to perform stealth actions, and to evade detection.
*{{skill|Backstab}} (Thief only) represents ability to attack a target with a light or medium weapon from hiding. The basic backstab can be initiated via the {{tt|BACKSTAB}} command and ignores shield and parry. Ambushes also utilize this skill.


==Combat Messaging==
You'll notice information in brackets below each attack you or an opponent makes.  This information is a summary of how the attack affected your character.  We'll go over each message in detail.
{| align="right"
| '''Vitality'''
{| class="wikitable" border="1"
| >100% || invigorated
|-
| 100% || none
|-
| 99%-90% || bruised
|-
| 89%-80% || hurt
|-
| 79%-70% || battered
|-
| 69%-60% || beat up
|-
| 59%-50% || very beat up
|-
| 49%-40% || badly hurt
|-
| 39%-30% || very badly hurt
|-
| 29%-20% || smashed up
|-
| 10%-9% || terribly wounded
|-
| 9%-1% || near death
|-
| <1% || in death's grasp
|}
| valign="top"|'''Spirit'''
{| class="wikitable" border="1"
| mighty
|-
| ''no message''
|-
| shaky
|-
| very shaky
|-
| weak
|-
| very weak
|-
| drained
|-
| very drained
|-
| cold
|-
| very cold
|-
| empty
|-
| desolate
|-
| nonexistant
|}
| valign="top"| '''Fatigue'''
{| class="wikitable" border="1"
|>100% || energetic
|-
|100%-90% || '''no message'''
|-
|89%-80% || winded
|-
|79%-60% || tired
|-
|59%-40% || fatigued
|-
|39%-30% || worn-out
|-
|29%-20% || beat
|-
|19%-10% || exhausted
|-
|9%-~<1% || bone-tired
|}
|}

===Vitality===
Vitality is a verbal representation of your hit points.  Each attack that damages you reduces the number of hit points you have by a certain percentage.

===Spirit===
When you are brought back to life (either via departing or [[Resurrection]]) it takes a little while to regain your full spirit health.  Spirit health affects the time before you depart.  Some [[Cleric]] spells cause the caster to lose ([[Aesrela Everild]]) or gain spirit ([[Vigil]]).  There are also plans for Spell vs. Spirit [[Contested Spells|contested spells]].

===Fatigue===
You lose some fatigue with each attack you make.  If you are using a weapon that is suited for your character's stats the loss will be regained before you even notice it, but you can lose noticeable amounts of fatigue from either using a weapon too heavy for your character or swinging a light one too often.

Fatigue cost is determined base on weapon weight, maneuver used, and the user's strength and stamina.
{{-}}
===Balance and Position===

{| align="right"
| valign="top" | '''Balance'''
{| class="wikitable" border="1"
| incredibly balanced
|-
|adeptly balanced
|-
|nimbly balanced
|-
|solidly balanced
|-
|slightly off balance
|-
|off balance
|-
|somewhat off balance
|-
|badly balanced
|-
|very badly balanced
|-
|extremely imbalanced
|-
|hopelessly unbalanced
|-
|completely imbalanced
|}
| '''Position'''
{| class="wikitable" border="1"
| overwhelming
|-
| in dominating position 
|-
| in excellent position 
|-
| in superior position 
|-
| in very strong position 
|-
| in strong position 
|-
| in good position 
|-
| in better position 
|-
| have slight advantage 
|-
| no advantage 
|-
| opponent has slight advantage 
|-
| opponent in better position 
|-
| opponent in good position 
|-
| opponent in strong position 
|-
| opponent in very strong position 
|-
| opponent in superior position 
|-
| opponent in excellent position 
|-
| opponent dominating 
|-
| opponent overwhelming you
|}
|}

There are several levels of balance and position.  The base is <solidly balanced> with <no advantage>.  You can either gain or lose balance depending on the types of attack you choose; some are balance positive, some are balance negative, and some are balance neutral. Stuns cause balance loss, which in turn reduces your effective defense. A stun will automatically drop your balance to very badly, with more severe stuns dropping your balance further down the scale as the stun continues.


'''Position''' is the relation between your opponent's balance and your own.

The higher the balance and the position, the larger bonus there is to both offense and defense.
====Abilities that heal balance====
{{#ask:[[Heal type::Balance heal]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

====Abilities that damage your target's balance====
{{#ask:[[Damage type::Balance damage]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Maneuver Chart==
KEY:
:'''+''': good for this
:'''=''': won't help, won't hurt
:'''-''': bad for this

'''NOTE:''' {{com|attack}} will perform a randomized maneuver that is appropriate to the given situation.

===Weapon===
The below listed combat maneuvers work with any held weapon, but some are better for certain types of damage. Once you know what type of damage your weapon of choice causes, it's a good idea to have an understanding of what attacks best suit your weapon's damage type.

*For puncture type damage, use maneuvers like {{com|jab}}, {{com|thrust}}, and {{com|lunge}}.
*For slice type damage, use maneuvers like {{com|feint}}, {{com|slice}}, and {{com|chop}}.
*For impact type damage, use maneuvers like {{com|jab}}/{{com|feint}}, {{com|swing}}, {{com|slam}}, and {{com|bash}}.

{|class="wikitable sortable"
|-
!move||fatigue||balance||speed||accurate||puncture||slice||impact||evasion||parry||shield
|-
|bash	||-||-||-||+||-||=||+||=||-||+
|-
|chop	||=||=||-||+||-||+||=||=||=||-
|-
|draw	||-||+||=||+||=||=||=||=||=||=
|-
|feint	||+||+||+||-||-||=||=||=||=||=
|-
|jab	||=||+||+||-||=||-||-||-||+||-
|-
|lunge	||-||-||-||+||+||-||=||-||+||-
|-
|pummel	||-||=||+||-||=||-||+||=||=||-
|-
|slam	||=||=||+||=||=||=||=||=||=||=
|-
|slice	||-||=||+||=||-||+||=||-||+||-
|-
|smite*	|| || || || || || || || || ||
|-
|sweep	||-||-||-||-||-||+||=||+||-||-
|-
|swing	||-||+||+||=||-||=||+||+||-||+
|-
|throw*	|| || || || || || || || || ||
|-
|thrust	||-||=||+||=||+||-||=||-||+||=
|}

===Brawling===
{|class="wikitable sortable"
|-
!move||fatigue||balance||speed||accurate||puncture||slice||impact||evasion||parry||shield
|-
|bite ||-||-||+||=||+||=||-||-||+||+
|-
|butt ||-||-||+||+||=||-||+||-||=||+
|-
|choke* || || || || || || || || || ||
|-
|claw ||-||=||+||=||=||+||-||+||-||-
|-
|elbow ||-||=||+||=||=||-||+||+||-||-
|-
|gouge ||-||=||+||=||-||+||=||+||-||-
|-
|grab / grapple ||-||-||+||+||=||=||=||=||=||=
|-
|kick ||-||-||+||=||=||-||+||=||=||-
|-
|knee ||-||-||+||=||=||-||+||-||=||+
|-
|punch ||-||=||+||=||=||-||+||=||=||=
|-
|shove ||-||-||+||+||=||=||=||+||-||-
|-
|slap ||-||+||+||-||-||-||+||+||-||-
|-
|tackle ||+||=||+||-||=||=||=||=||=||=
|}

===Tactical===
{|class="wikitable sortable"
|-
!move   ||fatigue||balance||speed||accurate||puncture||slice||impact||evasion||parry||shield
|-
|block	||+||=||+||x||x||x||x||-||-||+
|-
|bob	||+||+||=||=||=||=||=||+||-||-
|-
|circle	||-||=||+||=||=||=||=||=||=||=
|-
|dodge	||+||=||+||x||x||x||x||+||-||-
|-
|flee*	|| || || || || || || || || ||
|-
|parry	||+||=||+||x||x||x||x||-||+||-
|-
|retreat*|| || || || || || || || || ||
|-
|shove	||-||-||+||+||=||=||=||+||-||-
|-
|tackle	||+||=||+||-||=||=||=||=||=||=
|-
|weave	||-||-||+||=||=||=||=||+||-||-
|}

<nowiki>* Currently unable to view stats for moves</nowiki>

==Damage==
The following is a theoretical process for how attacks calculated.

===To hit===
* Based on skill and a random number, an Offensive Force/Factor (OF) is generated. 
* This number is bonused by the user's {{stat|Agility}} as modified by the weapon's balance.
* The number is compared to the effective score of the defender's combined Evasion, Parry, and Shield. From this a chance of hitting is determined. At exactly equal OF and defense, the chance to hit is 66%.
* There is always a chance to both hit or miss, regardless of the numbers.

===Damage===
* If a hit is achieved, then damage is calculated. It begins with the base physical damage from the weapon, modified by the type of attack used.
* Each type of attack will use a different percentage of the weapons piercing, slicing and impact damage.
* Damage is added based on the user's strength, modified by the weapon's suitability.
* The damage is then reduced by the target's armor modified by the skill of the user in that armor.
* Damage is modified by the degree to which the amount that to hit exceeded the minimal number, increasing it up to double the base damage.
* Lastly, the specific body part damage is capped based on the target's remaining vitality left.

====Damage Values====
This information has been verified by GM Kodius.<ref>[[Post:List of All Hits in Combat - 07/28/2014 - 19:27]]</ref>

#light hit
#good hit
#good strike
#solid hit
#hard hit
#strong hit
#heavy strike
#very heavy hit
#extremely heavy hit
#powerful strike
#massive strike
#awesome strike
#vicious strike
#earth-shaking strike
#demolishing hit
#spine-rattling strike
#devastating hit
#devastating hit (That'll leave a mark!)
#overwhelming strike
#obliterating hit
#annihilating strike
#cataclysmic strike
#apocalyptic strike

The following messaging indicates a hit that did no damage:
*benign
*brushing
*gentle
*glancing
*grazing
*harmless
*ineffective
*skimming

==Notes==
Weapon balance determines parry suitability.

Protection grows with ranks, absorption doesn't.
{{RefAl|a=y|r=y}}
*[[Armor and shield guide]]
{{cat|Combat, Tutorials,New and returning player help}}