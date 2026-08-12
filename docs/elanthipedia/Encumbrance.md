# Encumbrance

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{RTOC}}
Encumbrance is how the weight of a character's on-person possessions affect their (or others') ability to perform actions.  Having a higher Encumbrance is normally considered a disadvantage, as many important skills such as [[Evasion]] and [[Athletics skill|Athletics]] (formerly [[Climbing]] and [[Swimming]]) are penalized, as well as being less able to stand after being knocked off your feet.  It is however, helpful to have a higher encumbrance if you would like it to be difficult for other people to pull you to your feet, or drag you around.

== Encumbrance Levels ==

Burden from lightest to greatest:
{| class="wikitable"
|-
!Order !! Encumbrance
|-
| 0 || None
|-
| 1 || Light Burden
|-
| 2 || Somewhat Burdened
|-
| 3 || Burdened
|-
| 4 || Heavy Burden
|-
| 5 || Very Heavy Burden
|-
| 6 || Overburdened
|-
| 7 || Very Overburdened
|-
| 8 || Extremely Overburdened
|-
| 9 || Tottering Under Burden
|-
| 10 || Are you even able to move?
|-
| 11 || It's amazing you aren't squashed!
|}

==Spells and abilities that reduce encumbrance==
{{#ask:[[Ability effect is::~*reduces encumbrance*]] OR [[Ability effect is::~*+Strength*]] OR [[Ability effect is::~*+Stamina*]]
|?Ability effect is=Effect
|format=ul
|headers=hide
|default=None
}}

==Spells and abilities that increase encumbrance==
{{#ask:[[Ability effect is::~*increases encumbrance*]] OR [[Ability effect is::~*-Strength*]] OR [[Ability effect is::~*-Stamina*]]
|?Ability effect is=Effect
|format=ul
|headers=hide
|default=None
}}

== Armor Anomaly ==

Many players experience a situation where their characters have little or no encumbrance when wearing their armor, and a greater encumbrance when they're carrying it in a container on their person.  This can be explained when you consider that encumbrance '''is not''' weight.  It is caused by weight.

Armor is heavy.  It is designed to be worn in such a way that its center of mass correlates to the center of mass of its wearer's body.  Well-designed armor worn properly causes a minimal increase in angular momentum.  If it's not being worn properly, instead sitting off to one side all jumbled up (like in a backpack.)  It will be causing much greater angular momentum upon the supporting body.

== Reducing Encumbrance ==

There are several approaches to reducing Encumbrance.

;Increasing Capacity: A character's [[Strength]] and [[Stamina]] determines the number of stones they can carry before their encumbrance increases.  Training these attributes is an effective way to reduce encumbrance, however the cost to train an attribute increases, while the benefit per training stays the same, making this less helpful as a character progresses.  Additionally, many survival and magic primary guilds emphasize speed and intelligence over brute strength, making this a viable early strategy for members of these guilds, but not later.

;Decreasing Weight: It is common for characters to get heavier as they progress.  Interesting things end up slipping into pockets and being forgotten as the next interesting thing is picked up.  Periodically, most characters "defluff", or audit their own inventories, removing non-essential things for the sake of dropping encumbrance (or being easier to look at).

;Augmenting Capacity: There are spells and abilities which can temporarily increase a character's carrying capacity, and reduce their encumbrance.  [[Ease Burden]] is the direct one.

== Formulas ==

For the following formulas, lets assign numerical values to each encumbrance level: 1 for none, in order, up to 12 for squashed.

Use the following formula to determine the maximum number of stones your character can carry with a given encumbrance:

[[Image:Encumbrance formula.png]]

For example, a character with 10 strength and 10 stamina could carry 480 stones of weight with no encumbrance: 10 x ceiling( 0.4 x (1+5) x (10+10) ) = 480 stones.

== Miscellaneous Notes ==

* A coin of any type weighs 0.2 stones (5 coins weigh 1 stone).
* Beards and mustaches do add your burden level.
* Encumbrance causes a penalty to evasion starting at Light Burden.<ref>[[Post:Encumbrance and Evasion - 4/15/2009 - 2:41:11]]</ref>
* There are no racial bonuses or penalties.

{{RefAl|r=y}}
{{cat|Combat,Statistics,Game Mechanics,Definitions,Concepts}}[[page type is::definition| ]][[page type is::concept| ]]