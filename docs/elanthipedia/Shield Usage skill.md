# Shield Usage skill

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{RTOC}}
'''Shield Usage [[page type is::skill]]''' is used in determining the effectiveness of an arm-worn or held shield in blocking attacks.  The stats that assist in blocking (from most to least important) are [[Reflex]],  [[Discipline]], and [[Strength]].

==Spells and abilities that boost Shield Usage==
{{#ask:[[Boosts::Shield Usage skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Spells and abilities that decrease Shield Usage==
{{#ask:[[Debuffs::Shield Usage skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Shield Usage==
To use a shield, just hold one in your left hand and fight something.  Alternatively, shields may be worn on the arm <small>([[Shield Usage skill#Arm-worn Shield Notes|see below]])</small>.  

You may adjust the amount of shield skill you are actively using via the {{com|Stance}} command.

==Training Strategies==
Below about 50 ranks, shield is not a terribly effective defense.  However, shield coupled with the {{skill|evasion}} is the most effective means of defending against ranged attacks.  You will be unable to effectively use larger shields' higher protection values until your ranks in Shield Usage increase.  There is a contest in shield that examines the stats used in your defense ({{stat|Reflex}}, {{stat|Discipline}}, {{stat|Strength}}) and compares that to the weight of the shield to see if you have full use of your ability to block. When working normally this "penalty" is truly a trivial thing and most likely only impacts very young characters. Most characters have no penalty whatsoever from the weight of shield. At low ranks in skill, small non-hindering shields are your best bet.  {{ilink|s|Target shield}}s from the [[Field Goblin|goblins]] west of the [[Crossing]] make a good starter shield.<br />
<br />
An arm-worn shield will penalize shots fired by a longbow, short bow, or composite bow, as per the standard penalties for two-handed weapons.<br />
<br />
As skill approaches 100 ranks, moving to medium-sized shields will begin to pay off.<sup>[citation needed]</sup>  Larger shields are generally more hindering, but with more skill in shield your defense will improve at an increased rate compared to the shield's maximum appraised protection.  Shield defense will increase at a slower pace after the maximum appraised protection has been reached.<br />
<br />
Experience is now awarded to all skills you are stanced to use, regardless of whether or not that skill is actually contested. It may still be in your better interest to swap stances around a little, but the need to stance down dramatically (especially in evasion) should not be as common or necessary.

==Arm-worn Shield Notes==
The {{com|ADJUST}} verb changes any shield to allow wearing on the arm.  Adjusting it again will revert it to shoulder-worn.

The maximum size of shield you can wear on your arm is based on your guild's facility with {{catskill|armor}}:
*[[Guilds#Skill_Sets|Armor Primary]] - Can wear large shields (tower, kite, etc.) or smaller
*[[Guilds#Skill_Sets|Armor Secondary]] - Can wear medium shields (oval, buckler, etc.) or smaller
*[[Guilds#Skill_Sets|Armor Tertiary]] - Can wear small shields (buckler, targe, target, etc.)

There is a 4th circle requirement to arm-wearing a medium or large shield, to exclude [[commoner]]s from wearing medium shields.

Note:  An arm-worn shield's protection is reduced by 25%.

[[Cleric]]s can arm-wear an infused [[Shield of Light]] shield that is medium in size, an exception to the size rule above.

Different classes of ranged weapons interact differently with arm-worn shields:
*[[Slings]] are not affected in any way.
*[[Light Thrown skill|Light Thrown]] and [[Heavy Thrown skill|Heavy Thrown]] weapons are not affected in any way.
*[[Crossbows]] do not seem to be affected. (The 50-rank loading requirement was removed.)
*[[Stick bows]] receive both a loading penalty and an accuracy penalty when used with an arm-worn shield.

The exceptions to the stick bow penalty are as follows:
*A [[Paladin]] wearing a medium or small shield.
*A [[Barbarian]] wearing a small shield.
*A [[Ranger]] wearing a small shield.

==Shield Stats==
All shields have two levels of protection, referred to as:
* '''"fortuitous block chance"''': Previously called "minimum defense",<ref>[[Post:Tuesday Tidings 92 - Appraisal of Shield Protection - 11/23/2021 - 19:06]]</ref> this represents the chance of receiving a substantial bonus to your ability to block with a shield. This reflects the idea that sometimes the shield just happens to be in the right place to block an incoming attack, regardless of how skilled or unskilled you may be in using the shield.  This chance remains the same whether you are holding or wearing the shield, so it is only listed once in shield appraisal messaging.  When you appraise a shield, you will see that the shield offers "a [fortuitous block level] chance to fortuitously block attacks."
* '''"protection"''': Represents how well you can block with the shield, with the ability to take full advantage of this stat scaling through Shield skill.  (Note that unlike fortuitous block chance, protection is penalized when you wear a shield on your arm instead of holding it.) When you appraise a shield, you will see "Additionally, the shield offers [protection level while held] protection when held and [protection level while worn] protection when worn on the left arm."<br>
'''Possible levels of protection''': none, extremely terrible, terrible, dismal, very poor, poor, rather low, low, fair, better than fair, moderate, moderately good, good, very good, high, very high, great, very great, exceptional, very exceptional, impressive, very impressive, amazing, incredible, tremendous, unbelievable, god-like<br>
:<nowiki>*</nowiki> Some protection levels can only be discerned by Paladins and people who are skilled with shields.

==Size Differences==
Even beyond their stats, different shield sizes behave differently against different types of attacks.

:Small Shield: 100% melee, 80% Missile
:Medium Shield : 98% melee, 90% Missile
:Large Shield: 96% melee, 100% Missile

==Shield Slam==
Using a shield (held in left hand or worn), it is possible to {{com|SLAM}} left an opponent with your shield.  Larger shields are heavier and therefore have high impact damage.

'''Update''': "You can now {{com|SLAM}} with arm-worn shields in combat as if you were holding it in your left hand."-Ssra 09/08/15

==Shield Listing==
Listed below are the highest protecting shields of each type. Only those with current appraisals are shown. They are sorted by maximum possible protection, then by minimum hindrance.

==== Small Shields ====
{{#ask:[[Is combat type::Small Shield]]
|?Min protection is number=Fortuitous Block Rating
|?Max protection is number=Maximum held protection
|?Max arm protection is number=Maximum arm-worn protection
|?Hindrance is number=Hindrance
|?Weight of=Weight
|type=broadtable
|sort=Min protection is number,Max protection is number,Hindrance is number
|order=desc,desc,asc
|limit=25
}}

==== Medium Shields ====
{{#ask:[[Is combat type::Medium Shield]]
|?Min protection is number=Fortuitous Block Rating
|?Max protection is number=Maximum held protection
|?Max arm protection is number=Maximum arm-worn protection
|?Hindrance is number=Hindrance
|?Weight of=Weight
|type=broadtable
|sort=Min protection is number,Max protection is number,Hindrance is number
|order=desc,desc,asc
|limit=25
}}

==== Large Shields ====
{{#ask:[[Is combat type::Large Shield]]
|?Min protection is number=Fortuitous Block Rating
|?Max protection is number=Maximum held protection
|?Max arm protection is number=Maximum arm-worn protection
|?Hindrance is number=Hindrance
|?Weight of=Weight
|type=broadtable
|sort=Min protection is number,Max protection is number,Hindrance is number
|order=desc,desc,asc
|limit=25
}}
{{RefAl|a=y}}
{{cat|Armor skillset,Combat,Skills}}