# Combat maneuvers

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{RTOC}}
==Introduction==

Combat maneuvers are commands for attacking an enemy or putting yourself into a better defensive position. Each manuever favors certain kinds of weapons and damage types, defensive stances like parry, shield, or evasion, and vary in the amount of roundtime and fatigue required to perform successfully.

==Attack==

The {{com|attack}} command is one of many commands associated with combat. It's designed to be a perfectly average attack, with no particular strengths or weaknesses. The {{tt|attack}} command issues potentially any of the [[#Melee_Maneuvers|melee maneuvers]] that is relevant to the non-ranged weapon held including brawling.

It chooses a maneuver that is neutral in nature, meaning it does not potentially choose the "best" attack but one that brings you back into a normalized state of combat related to your fatigue, balance, and position.

While it is good for almost any situation, there is almost always a better option for a specific weapon or specific situation, so once you become more accustomed to combat you may want to investigate using other combat maneuvers.

==Offhand Attacks==

Your right hand is your main hand and your left hand is your offhand. Use {{tt|ATTACK LEFT}} to attack with a non-ranged/non-brawling weapon in your left hand. This will train both the weapon skill and [[Offhand Weapon skill]].

Adding the word {{tt|left}} also works with all the other attack maneuvers, for example {{tt|feint left}} or {{tt|lob left}}.

==Targeting Attacks==

You can optionally choose who or what you attack by specifying their name after the maneuver command. For example, {{tt|attack rat}}, {{tt|slice second bear}}, or {{tt|hurl left Frodo}}.

If you don't specify a target then the game will automatically choose the next eligible living creature. In general, letting the game auto target is preferred. When you specify the target, the game doesn't exclude dead creatures. For example, {{tt|attack rat}} would try to attack the first rat listed in the room rather than the one you're currently facing (unless they're the same) and you may end up trying to attack a dead rat.

==Melee Maneuvers==

The following table lists details about each attack maneuver. The data comes from the {{tt|(maneuver) HELP FULL}} command.

See [[Roundtime#Weapon_minimum_roundtimes|Roundtime]] for specific weapon minimum attainable roundtimes per maneuver.

{| class="wikitable sortable" border="1"
! Maneuver !! Type !! Fatigue || Balance || Speed || Accuracy || Most Suited || Least Suited || Least Penalizes || Most Penalizes
|-
| Thrust || damage || 2 - somewhat fatiguing || 4 - balance building || 3 - reasonably paced || 2 - accurate as most || puncture || slice || parry || evasion 
|-
| Lunge || damage || 5 - extremely fatiguing || 2 - unbalancing || 4 - slow || 3 - more accurate than most || puncture || slice || parry || evasion/shield
|-
| Slice || damage || 2 - somewhat fatiguing || 4 - balance building || 3 - reasonably paced || 2 - accurate as most || slice || puncture || evasion/parry || shield
|-
| Chop || damage || 5 - extremely fatiguing || 2 - unbalancing || 4 - slow || 3 - more accurate than most || slice || puncture || evasion/parry || shield
|-
| Sweep || damage || 4 - fatiguing || 1 - very unbalancing || 4 - slow || 3 - more accurate than most || slice/impact || puncture || equal || equal
|-
| Feint || debuff || 1 - barely fatiguing || 5 - very balance building || 1 - very quick || 1 - less accurate than most || slice/impact || puncture || equal || equal
|-
| Jab || damage || 3 - moderately fatiguing || 5 - very balance building || 1 - very quick || 1 - less accurate than most || puncture || slice/impact || parry || evasion/shield
|-
| Draw || debuff || 5 - extremely fatiguing || 5 - very balance building || 2 - quick || 3 - more accurate than most || equal || equal || equal || equal
|-
| Slam || damage || 4 - very fatiguing || 2 - unbalancing || 3 - reasonably paced || 2 - accurate as most || impact || slice || equal || equal
|-
| Pummel || damage || 2 - somewhat fatiguing || 3 - balance neutral || 2 - quick || 1 - less accurate than most || impact || slice || evasion/parry || shield
|-
| Bash || damage || 5 - extremely fatiguing || 2 - unbalancing || 4 - slow || 3 - more accurate than most || impact || puncture || evasion/shield || parry
|-
| Parry || defensive || 1 - barely fatiguing || 3 - balance neutral || 2 - quick || - || - || - || parry || evasion/shield 
|-
| Dodge || defensive || 1 - barely fatiguing || 3 - balance neutral || 2 - quick || - || - || - || evasion || parry/shield
|-
| Block || defensive || 1 - barely fatiguing || 3 - balance neutral || 2 - quick || - || - || - || shield || evasion/parry
|-
| Weave || tactical || 5 - extremely fatiguing || 2 - unbalancing || 3 - reasonably paced || 2 - accurate as most || equal || equal || evasion || parry/shield
|-
| Circle || tactical || 3 - moderately fatiguing || 4 - balance building || 3 - reasonably paced || 2 - accurate as most || equal || equal || evasion/parry || shield
|-
| Bob || tactical || 1 - barely fatiguing || 5 - very balance building || 3 - reasonably paced || 2 - accurate as most || equal || equal || evasion || shield
|-
| Grapple || tactical || 2 - somewhat fatiguing || 0 - extremely unbalancing || 3 - reasonably paced || 3 - more accurate than most || equal || equal || evasion || shield
|-
| Tackle || tactical || 5 - extremely fatiguing || 3 - balance neutral || 1 - very quick || 1 - less accurate than most || equal || equal || equal || equal
|-
| Shove || tactical || 2 - somewhat fatiguing || 2 - unbalancing || 3 - reasonably paced || 3 - more accurate than most || equal || equal || evasion || parry/shield
|-
| Punch || brawling || 2 - somewhat fatiguing || 4 - balance building || 1 - very quick || 2 - accurate as most || impact || slice || equal || equal
|-
| Claw || brawling || 2 - somewhat fatiguing || 4 - balance building || 2 - quick || 2 - accurate as most || slice || impact || parry/shield || evasion
|-
| Gouge || brawling || 3 - moderately fatiguing || 5 - very balance building || 1 - very quick || 1 - less accurate than most || puncture || slice/impact || parry/shield || evasion
|-
| Kick || brawling || 5 - extremely fatiguing || 2 - unbalancing || 2 - quick || 3 - more accurate than most || impact || slice || parry || evasion/shield
|-
| Elbow || brawling || 3 - moderately fatiguing || 4 - balance building || 1 - very quick || 2 - accurate as most || impact || slice || evasion || parry
|-
| Slap || brawling || 3 - moderately fatiguing || 4 - balance building || 1 - very quick || 1 - less accurate than most || impact || puncture/slice || evasion || parry/shield
|-
| Bite || brawling || 3 - moderately fatiguing || 2 - unbalancing || 2 - quick || 2 - accurate as most || puncture || impact || equal || equal
|-
| Butt || brawling || 2 - somewhat fatiguing || 2 - unbalancing || 1 - very quick || 3 - more accurate than most || impact || slice || equal || equal
|-
| Swing || damage || 2 - somewhat fatiguing || 4 - balance building || 3 - reasonably paced || 2 - accurate as most || impact || puncture || evasion/shield || parry
|-
| Knee || brawling || 2 - somewhat fatiguing || 2 - unbalancing || 2 - quick || 3 - more accurate than most || impact || slice || equal || equal
|-
|Trip
|tactical
|2 - somewhat fatiguing
|2 - unbalancing
|3 - reasonably placed
|3 - more accurate than most
|evasion
|parry/shield
|equal
|equal
|-
|}

==Throwing Maneuvers==

Most weapons can be thrown in addition to their normal combat maneuvers. Weapons which appraise as either [[Light Thrown]] or [[Heavy Thrown]] are better suited for this purpose and will have higher accuracy. Items that don't appraise as either skill may still be thrown -- this is known as an improvised thrown weapon. If the improvised thrown weapon weighs less than 25 stones then it uses your [[Light Thrown]] skill, otherwise if it is 25 stones or greater it uses your [[Heavy Thrown]] skill. Improvised thrown weapons suffer an accuracy and damage penalty.<ref>[[Post:Is_it_still_throwable_-_11/28/2014_-_17:48]]</ref><ref>[https://discord.com/channels/619301383451181075/819303984719200297/1032542879366774784|Improvised Thrown Weapons Player Test], October 2022</ref>

* {{com|Throw}}: Moderately damaging attack with normal chances for weapons to lodge.
* {{com|Hurl}}: Incredibly damaging maneuver for thrown weapons with a guaranteed chance to lodge for all types of weapons (even blunts).  More accurate than {{tt|throw}} command.
* {{com|Lob}}: Lightly damaging, fast attack for thrown weapons that has no chance to lodge with all types of weapons. Less accurate than {{tt|throw}} command.

==Advanced Combat Maneuvers==

Formerly known as "Charged Maneuvers", these commands no longer take a certain amount of time to "charge up" in between the command being typed and when the action is executed. Like other combat maneuvers, the attack is instant.[[Pretty name is::Advanced Combat Maneuvers| ]]

These manuevers have greatly increased damage and are more difficult to defend against.

===Syntax===

 MANEUVER LIST - Display all known maneuvers.
 MANEUVER (ability name) (target) To use a specific maneuver.
 MANEUVER HELP (ability name) To learn more about that maneuver.

{| class="wikitable"
! Maneuver !! Weapon Type !! Description
|-
| Powershot || Bows, Crossbows, Slings, Blowguns || This preparation includes the necessary aim time, and does greatly improved damage.
|-
| Cleave || Small, Larged, Twohanded Edged || This attack is difficult to block with a shield and does a great amount of additional damage.
|-
| Crash || Small, Large, Twohanded Blunts || The attack is difficult to block with a shield and does an exceptional amount of extra damage.
|-
| Impale || Polearms || The attack penetrates armor with ease and does extraordinary damage. [[Ability type is::armor piercing| ]]
|-
| Twirl || Staves || The attack is very difficult to evade and does extraordinary damage.
|-
| Palmstrike || Brawling || The attack is extraordinarily accurate and ignores the enemy's armor. [[Ability type is::armor ignoring| ]]
|-
| Suplex || Brawling (grappled) || This maneuver is very accurate, does exceptional damage and ignores the enemy's armor. [[Ability type is::armor ignoring| ]]
|-
| Doublestrike || Dual wielding one-handed weapons || This attack is difficult to block with a shield and does a great amount of additional damage.
|-
| Rush || Shield held in left hand, target not at melee range || The warrior will leap into range and perform a brutal slam with the held shield.
|-
| Distract || Small edged or small blunt weapon no more than 30 stones || Allows you to immediately slip into hiding as part of the attack.

|}

===Notes===

* Powershot includes the bonus of a fully aimed shot. Aiming will prevent the maneuver and show the message ''You are unable to focus on performing a maneuver while aiming at an enemy.''
* Powershot only fires one arrow from a bow. You cannot perform this maneuver if you've [[Dual Load|dual loaded]].
* There is a small chance that any melee advanced combat maneuver may trigger a simultaneous attack with your offhand weapon. Doublestrike guarantees it.
* If the first hit from doublestrike kills the enemy then the combat messaging won't include the second strike.

===Cooldown===

After performing an advanced combat maneuver there is a cooldown before you can perform the same maneuver again. The cooldown is per maneuver, which means you can immediately perform a different maneuver that's not on cooldown back-to-back.
For example, you can {{tt|cleave}} with your longsword, change to a mallet, then {{tt|crash}} while the first maneuver is on cooldown, then {{tt|doublestrike}} while dual wielding the longsword and mallet. That's three maneuvers performed back to back. Switch to another weapon type, like staves or polearms, to keep the momentum going.

* Cooldown on charged maneuvers is 90 seconds for non-Barbarians.
* [[Barbarians]] who pass an [[Expertise]] check versus the enemy's defenses will have the cooldown reduced randomly to between 45 to 55 seconds (reduced by 35-45 seconds). If you pass the expertise check to get reduced cooldown then you'll see the message "With expert skill you end the attack and maneuver into a better position."
* [[Paladins]] who pass a [[Conviction]] check versus the enemy's defenses will have the cooldown reduced randomly to between 45 to 55 seconds (reduced by 35-45 seconds) specifically for the Rush maneuver.
* [[Thieves]] who pass a [[Blindside]] check versus the enemy will have the cooldown reduced randomly to between 45 to 55 seconds (reduced by 35-45 seconds) specifically for the Distract maneuver.
{{RefAl|a=y}}
* [[Attack command]]
* [[Maneuver command]]
{{Cat|Combat}}