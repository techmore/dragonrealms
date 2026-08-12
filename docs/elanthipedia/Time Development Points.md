# Time Development Points

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{RTOC}}
Time Development Points (TDPs) are used to increase [[attributes]].

In order to use TDPs to raise a stat, one must go to a designated room for training that particular stat and type <tt>TRAIN</tt> or <tt>STUDY</tt> twice to confirm. Training rooms for each stat are available within or near every major city.

A new character is given 600 TDPs right out of the Character Manager. After that, the only way to gain more TDPs is by circling or obtaining new ranks in skills. 

==TDPs from Circling==
Each time you circle, up to 150, you will gain a base number of TDPs plus a bonus based on your circle. Below circle 10 you get a base of 50 TDPs. Circle 10 onward, you will gain 100 TDPs as a base. The bonus TDPs are always equal to the circle you just attained. For example: if you attain circle 27, you will get 127 TDPs.

After circle 150, TDPs cannot be gained from circling.  The total number of TDPs gained from circling is 25,824.

==TDPs from Leveling Skills==
Each time you gain a new rank in any skill, the integer value of that rank is added into a hidden pool (the TDP pool). If at any time the total in the pool reaches or exceeds 200, you gain one TDP and 200 is subtracted from the pool. This also applies for multiples of 200: if the TDP pool reaches 400, you gain two TDPs and 400 points are subtracted; for 600 you get three TDPs and 600 is deducted from the pool, etc.

For example, let's assume that your TDP pool is currently zero. You increase your [[Perception skill]] to attain rank 150. 150 points are added to the TDP pool. You then increase your [[Leather Armor skill]] to rank 66. 66 points are added to the TDP pool, making a total of 216. You gain one TDP, and 200 points are subtracted from the TDP pool leaving 16 points. Next, you increase your {{skill|Arcana}} to 197. Your pool increases to 213, you gain yet another TDP, and the pool is reduced to 13.

Since the experience change where all tertiary skills less than 100 ranks are learned at the rate of secondary skills, it is considerably easier than it was to level tertiary skills for the sake of TDPs alone. Leveling a single skill to 100 ranks will result in a gain of 25 TDPs when all is said and done. Leveling a skill to only 50 will result in a gain of 6 TDPs.

Magic Using guilds (all but Thief and Barbarian) can gain a maximum of 398,352 TDPs from skills (Every trainable skill [52] to 1750).  Thieves and Barbarians cannot learn Sorcery, Attunemnet, or Targeted Magic so can only gain a maximum of 375,370 TDPs from skills (22,982 less than magic using guilds).  Commoners, who can only learn Arcana from the Magic Skillset, can only gain a maximum of 329,406 TDPS (68,946 less than Magic Using Guilds, and 45,964 less than Barbarians and Thieves).

==Death and Losing TDPs==
When you '''lose''' ranks from memory decay as a result of death without rejuvenation, your TDP pool will be '''reduced''' by the ranks you lost. If this sends the TDP pool below zero you will lose a TDP, and 200 will be added to the pool. This process makes it possible to have a negative number of TDPs.

==TDP Formulas==
In mathematical terms, the total number of TDPs gained from a single skill is the sum of integers from 0 to the maximum earned rank divided by 200. This can be expressed as follows:

[[Image:TDPs_from_single_skill_formula.png]]

In particular, TDPs are quadratic with respect to rank, meaning that it becomes more and more efficient at higher levels to train higher ranked skills.  For example, a single skill produces the equivalent of one TDP at ranks 20, 28, 34, 39, 43, and so on, with the gap narrowly closing until (of course) a TDP is produced every rank past 200.

Since the "hidden TDP pool" is shared between skills, the floor function operates on the sum of skills, instead of each skill individually. The formula to calculate the total TDPs gained from all skills is as follows:

[[Image:TDPs_from_all_skill_formula.png]]

TDPs granted from all levels gained can be expressed with the following formula:

[[Image:TDPs_from_all_levels_formula.png]]

==Other Resources==
* {{com|TDP}} {{tt|project}}
* [[Calculate TDPs gained (script)]]: A Genie script for calcluating the number of TDPs gained from advancing one skill from 1 to X.
* [http://matoom.github.io/calculators/tdpcalc.html DragonRealms TDP Calculator]

{{RefAl}}
{{Cat|Statistics}}