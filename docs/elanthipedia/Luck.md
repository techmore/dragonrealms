# Luck

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{RTOC}}
Luck is a new system, not something that has been active in the past.  While various systems have more or less performance based on luck (in the literal sense of how reliant they are on a RNG), there has been no luck stat before now. The objective of luck from a mechanical standpoint is to tweak RNGs rather than having an otherwise impossible effect.

==Range of Values==

The range of Luck is:
{|class=wikitable
|-
!Adjective
!Value
|-
|Divine||+3
|-
|Very Lucky||+2
|-
|Lucky||+1
|-
|Average||0
|-
|Unlucky||-1
|-
|Very Unlucky||-2
|-
|Abysmal||-3
|}

These adjectives are discrete values rather than ranges.  The entire range of Luck is +3 to -3.<br>
<br>

==Practical Use==
The main things Luck interfaces with are the magic and stealth systems.  There's a few places here and there beyond that but that's the major bit.

Luck provides an additional chance to find extra material when mining and lumberjacking. E.g:

 Pebbles scatter and a plume of dust hazes the air as your clockwork tongs strikes stone.  A dislodged gabbro pebble topples free.
 Roundtime: 3 sec.
 A series of lucky events results in some additional ore being found.

==Effect of Luck==

This is, by intention, going to be variable from system to system that we touch.  Luck as a concept is slippery and hard to define, and some activities are more prone to it than others.  But that's also a very unsatisfying explanation from a technical standpoint, so I'd like to go a bit deeper.

Here are a few concepts I'm running with while implementing Luck into the game.  Note that these are not ironbound rules and they may face changes as we go forward, but it's what I'm dealing with now.

#Average is default.  Luck manipulation isn't necessary to get a fair roll on an RNG (insofar as the GM who invented the system defined 'fair').
#When microtrans money is directly concerned, Luck does not apply.  For example, Luck will not apply to the small RNG in Su Helmas event currency.
#In general, Luck is either additive to results (such as in Lumberjacking, you may be "lucky" and gain more material) or modifying existing RNGs (such as in stealth, it will skew the RNG).  We are not in general making things more random to accommodate the system.

Luck is mainly designed along a two-prong system. Something for Traders/Moon Mages to be concerned about, and then a microtrans-oriented outlet for it as well. If neither "prong" is interesting to the individual, it's designed to be something that can be safely ignored and not interfere with your play.<br>
<br>
No benefits to being unlucky are currently planned.

===Power and Duration of Effect===
Like the core effect, the power of luck is going to vary based on the system's needs and capabilities.  In general, I am looking at staying within the pre-defined ranges of how powerful the RNG was already set and not expanding it.

Duration will be variable based on how the luck effect is achieved, but in general we're looking at the following in terms of uptime:
{|class=wikitable
|-
!Value
!Duration
|-
|3||10% uptime
|-
|2||33% uptime
|-
|1||66% uptime
|}

==Access to Luck Manipulation Effects==
Forms of luck manipulation include:
* A [[Trader]] [[Speculate_command#Speculate_Luck|speculate]] that gives them a +Luck bonus.
* [[:Category:Su Helmas|Su Helmas]] has [[:Category:Luck manipulators|luck-manipulating devices]] that anyone can use if they choose to acquire them.
* A [[Moon Mage]] [[:Category:Teleologic Sorcery spellbook|Teleologic Sorcery]] spell that allows them to steal luck was planned but has not been released.
* Via [[Login rewards]].

==Examples of Luck==
===Mining===
Waves of debris spill forth as you repeatedly strike the earth with your [tool].  When the dust clears, both a [stone] and a [metal] are visible on the ground.<br/>
Roundtime: 6 sec.<br/>
A series of lucky events results in some additional ore being found.

===[[Breaking and Entering]]===
* Someone who is visible during a {{com|BURGLE}} attempt during the day time now has a chance to auto-hide if their good luck allows to prevent from failing the attempt.
* Once inside, your luck now gives a bonus to the chance of finding an item when you {{com|SEARCH}}. This one doesn't message, because it's still possible to fail the search.

===[[Justice]]===
* Good luck can allow you to avoid a guard searching for criminals on a given scan -- it may be just enough time to dash away from the guard, don't linger because luck may not save you on the next attempt!
* If you {{com|PLEAD}} {{tt|INNOCENT}} but would have failed and been found guilty, there's now a chance for your luck to flip the failure back to a successful plea of innocence.

===Other Applications===
* [[Skinning skill|Skinning]] (and arranging): If you would have failed an attempt, there's a chance your good luck can flip the failure back to a success.
* Treasure: There is now a '''very very''' small chance to find rare crafting materials from high-level, item-dropping creatures. Item-dropping means things like scrolls, maps, cards, etc. This starts with [[Relative creature level|creatures at level]] 175+ -- anything below that will not have a chance at any crafting materials, rare or otherwise. Creatures level 175-189 can drop 'rare' materials if your luck allows, while those at 190+ can drop 'rare' or 'ultra rare'.
::Messaging for creature drops: ''Your luck knows no bounds!''
* Some games (like [[Don't Spill The Tea]]): With a frightened look, you watch your tea slosh into the air, but as your luck may have it, it lands back into your porcelain teacup!


{{RefAl|r=y|a=y}}
{{cat|Statistics}}