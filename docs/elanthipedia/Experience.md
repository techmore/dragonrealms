# Experience

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{RTOC}}
:''For the game command, see {{com|experience}}.''

[[Experience]], often abbreviated '''exp''', is the general term for all of the [[skill]] learning your character has attained.  

In [[DragonRealms]], your ranks in a skill are increased by using it. This is called training. The amount of experience gained from any action is scaled to the difficulty of that action for your character at that time, and how successful your character is in performing it. It is common for a task that has become very simple or unchallenging to grant zero experience.

Experience can potentially be lost as a consequence of character [[death]], although this can be easily avoided through [[favors]].

==Ranks==
Gained [[experience]] is measured as whole-number increments called "ranks." As your experience drains from your experience pool for a particular [[:Category:Skills|skill]], your learning is converted into ranks. Your ability in a skill is measured by the number of ranks you have attained in that skill. Additionally, there are skill requirements for advancing in circle (or character level) within a guild. Finally, gaining ranks in skills grants [[Time Development Points|TDPs]], which can be used to raise your stats.

''Note:'' It is generally considered OOC to engage in explicit discussions of numerical stats or skills. (Role-players may also object to the term "ranks.") When discussing skill via IC channels, the most conservative approach is to use the [[Experience#RP_messaging|RP messaging]], reserving numerical discussions for whispers and private messages. See [[Out of Character]] for additional information.

The amount of effort required to move up one rank in a skill can be measured in bits. Through analysis of the output of the {{com|CONVERT}} command it was possible to reverse engineer this relationship between ranks. Your next rank in a skill will be reached after you have gained 200 + n bits, where n is the current rank. This means to go from rank 0 to rank 1 in a skill you will need 200 bits, to go from rank 1 to rank 2, you will need 201 bits, and so on. By summing up the number of ranks you can determine how many bits it will take to reach a current level.

The graph and table below show the total number of bits needed to reach a specific rank from 0. This graphic demonstrates the relative difficulty to climb ranks. For example, to go from 300 to 400 ranks takes roughly the same number of bits as going from 0 to 200 ranks. Going from rank 1,000 to 1,500 requires approximately twice the number of bits as going from 0 to 1,000.

[[File:TotalBitsNeededToReachRank.png|left|500px]]
{|class="wikitable"
!Rank!!Total bits needed
|-
| 1||200
|-
| 25||5,300
|-
| 50||11,225
|-
| 75||18,050
|-
| 100||24,950
|-
| 150||41,175
|-
| 200||59,900
|-
| 250||81,125
|-
| 300||104,850
|-
| 400||159,800
|-
| 500||224,750
|-
| 750||430,875
|-
|1,000||699,500
|-
|1,250||1,030,625
|-
|1,500||1,424,250
|-
|1,750||1,880,375
|}

===Maximum rank===
Ranks are capped at 1750. Once you hit 1750 ranks, you no longer gain experience into your experience pool for that skill and draining experience has no effect. It is possible to have effective ranks higher than 1750 through buffs such as abilities or spells. Self-cast skill buffs are capped at 20%. Third party casts from guild abilities bonusing the same skill with a different ability can extend the buff to 30%<ref>[[Post:Buff_Limit_Expansion_-_04/20/2019_-_12:45]]</ref>. You can see your current buffs using {{com|EXPERIENCE}} {{tt|MODS}}.

===Calculations for Ranks and Bits===
The relationship between bits and ranks can be defined algebraically. In the formulas below ''r'' refers to ranks and ''b'' refers to bits.<ref>[[Talk:Convert_command]]</ref>

[[File:Bits_from_ranks_formula.png]] yields the bits needed to reach a specific rank.

[[File:Ranks_from_bits_formula.png]] yields the rank a number of bits would reach.

==Experience pools and pulses==
===Experience pools===
Every skill has its own individual pool, which fills with field experience as you obtain it. The current amount of field experience in your pool ranges from clear (empty) to mind lock (full).

Factors that determine maximum pool size (in descending order of importance):
#whether the skill is in your primary, secondary, or tertiary skillset
#the number of ranks you have in the skill
#{{stat|Intelligence}} (Note: Break points can be found at 30 and 60 Intelligence, see charts below for more info)
#{{stat|Discipline}} (Notes:  Break points can be found at 30 and 60 Discipline, see charts below for more info. Additionally: It was planned for 3.0 to remove discipline from the experience pool effects, but as posted by Socharis on 1/18/13, "...So I looked into this, and Discipline was never taken out - It's not as significant as intelligence, but it definitely increases your <nowiki>[</nowiki>experience<nowiki>]</nowiki> pool size."

==Experience Pool Size==
The amount of bits that can be held in a particular skill can be determined by using the following method:
<br>


===Base pool size===
1. Find the size of the base bank pool for the skill, where total ranks is x
[[File:Baserankpool.png|left|200px]]
{|class="wikitable"
!Skillset placement!!Formula
|-
|Primary skills||y=(15000*X/(X+900))+1000
|-
|Secondary skills||y=(12750*X/(X+900))+850
|-
|Tertiary skills||y=(10500*X/(X+900))+700
|}
An interactive visualization of this formula can be seen here: https://www.desmos.com/calculator/gn8gjlwegm
<br><br><br>


===Intelligence Score===
2. Determine the effective Intelligence score bonus to apply to step 4, where x is Intelligence
[[File:Intscore.png|left|200px]]
{|class="wikitable"
!Int value!!Formula
|-
|< 30||y=((x-10)*60)/10
|-
|30-60||y=(((x-30)*30)+1200)/10
|-
|>60||y=(((x-60)*15)+2100)/10
|}
An interactive visualization of this formula can be seen here: https://www.desmos.com/calculator/fhy7bwvtn7
<br><br><br>

===Discipline Score===
3. Determine the effective Discipline score bonus to apply to step 4, where x is Discipline
[[File:Discscore.png|left|200px]]
{|class="wikitable"
!Disc value!!Formula
|-
|< 30||y=((x-10)*20)/10
|-
|30-60||y=(((x-30)*10)+400)/10
|-
|>60||y=(((x-60)*5)+700)/10
|}
An interactive visualization of this formula can be seen here: https://www.desmos.com/calculator/srwbrdzhv6
<br><br><br>

===Total Base pool===
4. Using the values determined in steps 1-3, determine the stat modified size of the pool, where i is the Intelligence score from step 2, d is the Discipline score from step 3, and x is the base rank pool from step 1
[[File:Totalbasepool.png|left|200px]]
{|class="wikitable"
!Formula
|-
|y=((1000+i+d)/1000)*x
|}
An interactive visualization of this formula can be seen here: https://www.desmos.com/calculator/nvukewhbb1
<br><br><br><br><br><br>



===Mindstates===
{|
|valign="top"|
{| class="wikitable"
|-
!Amount Learning
!Mindstate Fraction
|-
|clear||0/34
|-
|dabbling||1/34
|-
|perusing||2/34
|-
|learning||3/34
|-
|thoughtful||4/34
|-
|thinking||5/34
|-
|considering||6/34
|-
|pondering||7/34
|-
|ruminating||8/34
|-
|concentrating||9/34
|-
|attentive||10/34
|-
|deliberative||11/34
|-
|interested||12/34
|-
|examining||13/34
|-
|understanding||14/34
|-
|absorbing||15/34
|-
|intrigued||16/34
|-
|scrutinizing||17/34
|}
|valign="top"|
{| class="wikitable"
!Amount Learning
!Mindstate Fraction
|-
|analyzing||18/34
|-
|studious||19/34
|-
|focused||20/34
|-
|very focused||21/34
|-
|engaged||22/34
|-
|very engaged||23/34
|-
|cogitating||24/34
|-
|fascinated||25/34
|-
|captivated||26/34
|-
|engrossed||27/34
|-
|riveted||28/34
|-
|very riveted||29/34
|-
|rapt||30/34
|-
|very rapt||31/34
|-
|enthralled||32/34
|-
|nearly locked||33/34
|-
|mind lock||34/34
|}
|}

===Experience pulses===
This field experience is gradually converted into actual ranks. When field experience is converted to ranks, it is called a pulse.  The size of the pulse is calculated as a fraction of your total pool size.  The primary factor affecting this fraction is whether the skill is primary, secondary, or tertiary; higher Wisdom also increases this fraction. However, secondary skills under 50 ranks will drain like primary skills<ref>[[Post:Low_level_ranks,_EXP,_and_you!_-_7/11/2008_-_8:58:48]]</ref><ref>[[Post:Minor_exp_change_-_02/05/2015_-_20:51]]</ref>, and tertiary skills under 25 ranks will drain like secondary skills.<ref>[[Post:Minor_exp_change_-_02/06/2015_-_10:57]]</ref>

{|class=wikitable
|-
!Skillset
!Time to Pulse From Mind Lock to Clear
|-
|Primary||40-60 minutes
|-
|Secondary||50-80 minutes
|-
|Tertiary||70-100 minutes
|}

===Skill Groups===
Skills pulse in groups every 200 seconds, with each group being offset from the previous one by 20 seconds.  These skill groupings are arranged by skillset in the order they appear in the experience list in game, with the exception of guild-only skills which all pulse in the final group.  The order and timing of the pulses is fixed, meaning the pulses happen at the exact same time for the same skills for every single player in the game.

{|class=wikitable
|-
!Relative Time Offset
!Skill Group
|-
|0 sec.||Shield Usage, Light Armor, Chain Armor, Brigandine, Plate Armor, Defending
|-
|20 sec.||Parry Ability, Small Edged, Large Edged, Twohanded Edged
|-
|40 sec.||Small Blunt, Large Blunt, Twohanded Blunt, Slings, Bow, Crossbow
|-
|60 sec.||Staves, Polearms, Light Thrown, Heavy Thrown, Brawling, Offhand Weapon, Melee Mastery
|-
|80 sec.||Missile Mastery, Primary Magic, Attunement, Arcana, Targeted Magic, Augmentation
|-
|100 sec.||Debilitation, Utility, Warding, Sorcery, Evasion, Athletics, Perception
|-
|120 sec.||Stealth, Locksmithing, Thievery, First Aid, Outdoorsmanship
|-
|140 sec.||Skinning
|-
|160 sec.||Forging, Engineering, Outfitting, Alchemy, Enchanting, Scholarship, Mechanical Lore, Appraisal
|-
|180 sec.||Performance, Tactics, ''Astrology'', ''Backstab'', ''Bardic Lore'', ''Conviction'', ''Empathy'', ''Expertise'', ''Instinct'', ''Summoning'', ''Thanatology'', ''Theurgy'', ''Trading''
|-
|}

==Stats and learning==
Mental statistics have a significant effect on the experience system. Intelligence and Wisdom affect all skills equally and have diminishing returns that are not logarithmically diminishing. (Every TDP spent on these stats provides a benefit.)

*'''{{stat|Intelligence}}''': Maximum size of experience pools
*'''{{stat|Wisdom}}''': Pulse size
*'''{{stat|Discipline}}''': Experience pool size and pulse size (10% efficiency each comparatively)

The effect of Intelligence and Wisdom is a percentage and not dependent on how many ranks you have in the skill. The effects of these stats can't be "tested" in an hour. This is something that assists you over the course of your entire career.

On 12/10/2015, GM [[Armifer]] shared some hard numbers on how intelligence and wisdom affect learning.<ref>[[Post:Experience Pool Size - Bug Fix - 12/10/2015 - 19:03]]</ref> Using 10 as the baseline (100%), here is the magnitude of the effect of training those stats:

{|class=wikitable
|-
!Stat!!Value!!Effect (Compared to 10)
|-
|Intelligence/Wisdom||30||112%
|-
|Intelligence/Wisdom||60||121%
|-
|Intelligence/Wisdom||90||125%
|-
|Intelligence/Wisdom||120||130%
|}
"Discipline also increases pool size, at 10% efficacy, thus continuing its trend of doing just a little bit of everything." --GM [[Armifer]]

==Rested Experience System==
Regular Subscribers, Premium Subscribers, and F2P accounts (with a unlock purchased with [[SimuCoins]]) can utilize the Rested Experience System (REXP).<ref>[[Post:Rested Experience System is LIVE! - 02/02/2019 - 14:48]]</ref> When active, this system provides a bonus when field experience is converted to ranks. The actual EXP pools are unchanged, but when you drain experience from the pools it will simply be worth more actual ranks by a factor of 3.  

===Summary for Casual Players===
When you type {{com|EXP}} you will see three numbers at the bottom of the screen. An example:

<pre>Rested EXP Stored: 2:25 hours  Usable This Cycle: 2 hours  Cycle Refreshes: 13:14 hours</pre>

Here's what they mean:
* First number: How much REXP you have banked.
* Second number: How much of the banked REXP you can use before the cycle resets.  This can be larger or smaller than you have banked.
* Third number: How long until the second number resets.

'''By design, you don't need to manage anything.''' If the first and second numbers are populated you are ''automatically'' using REXP and your experience pools are draining at the accelerated rate. If you have REXP available the system will use it. More technical information is available in the next section, for those who want to try and optimize their REXP or just want to understand more. For the casual player: just play like you normally do.

The first number, the amount of banked REXP, regenerates automatically when you're logged out or if you're in a state of deep sleep (by typing {{com|sleep}} twice).

The max capacity of the first and second numbers are determined by your subscription type:
{|class="wikitable"
! Subscription !! REXP Capacity !! Notes
|-
| F2P || None || 
|-
| F2P || 2 hours || With the purchase of a Brain Boost from the SimuCoin Store.
|-
| Standard || 4 hours || 
|-
| Premium || 6 hours || 
|-
| Platinum || 8 hours || 8 hours in the Platinum instance only. 6 hours in Prime/TF.
|-
|}

===Technical Information===
There are three mechanical components to the system: pool cap, usage cap and cycle.  Information about these features is available in the EXP command.

*The pool cap is how much rested exp you can have banked on your character at any time. Simple enough. At this time, the pool cap depends upon your subscription type. Standard accounts will be able to bank up to 4 hours of REXP. Premium accounts will store up to 6 hours, and in the Platinum instance the pool can hold 8 hours.  This time will accumulate after 5 consecutive minutes of not draining experience. This is whether offline, online without any EXP in your pools, or with the help of deep sleep.  The rested experience pool is filled at a rate of 2:1 (for every 2 minutes of not draining experience, 1 minute of rested experience is earned).

*The usage cap is how much rested exp you can use. For now, regardless of how frequently you fill the storage cap, you can only use up to 4/6/8 rested experience during one cycle (dependent upon account type).

*The cycle is how long it takes for the usage cap to reset. After 23:30 hours your usage cap will refresh and you can spend additional rested exp. The timing of the cycle is personal rather than universal: it starts when you, personally, do something with the rested exp system and then runs its course.

In addition to changes to how experience is converted under REXP, a modification to the sleep verb was provided.  In "Light Sleep" you will stop gaining new experience but continue to drain experience from your pools. You will use REXP in this state. In "Deep Sleep" you will not gain experience NOR will you drain experience. Your REXP is not used, and you will start to accumulate time in your rested experience pool again.

Each time one of the 10 skill groups drain that has experience in it for any single, or multiple skills, 20 seconds is removed from your REXP time. If a skill group pulses and there isn't any experience in any of the skills for that group the 20 seconds remains. This makes it possible to focus on specific skill groups and stretch out the REXP time for any targeted skills in them. For Example, if you are only training skills in 5 of the 10 skill groups, your REXP time would take twice the amount of time to be used up. 4 hours could be 8 hours of focused training, or 6 hours could be 12.

A final note: [[RPA command|Roleplaying awards]] are multiplicative, and stack with REXP drain. For optimum gains, use any RPAs during your REXP time.

==Experience drain at login==
Experience drain at login is based on when you last logged out of the game. Starting at 30 minutes, you will drain a percentage of your experience equal to the number of minutes that you have been logged out divided by 360 (or 480 if you received a warning within the last six months).

When you're logged out, experience drains at a static rate, regardless of skillset placement, ranks, or stats. Technically, the experience doesn't actually pulse until you log back in. Previously, if one were to log in then log out before the pulse it would reset the timer. With the addition of Rested EXP, this is no longer true.

{|class=wikitable
|-
!Time Logged Out
!%Pulsed (Clean)
!%Pulsed (Warning)
|-
|30 minutes||8.33%||6.25%
|-
|1 hour||16.67%||12.5%
|-
|2 hours||33.33%||25%
|-
|3 hours||50%||37.5%
|-
|4 hours||66.67%||50%
|-
|5 hours||83.33%||62.5%
|-
|6 hours||100%||75%
|-
|7 hours||100%||87.5%
|-
|8 hours||100%||100%
|}

*'''Note: [[Free to play]] players do not receive offline drain without a pass from the [[Simucoin]] store. See [[Idle experience drain]] for more details.'''
*As of 03/12/2015, players who have received a warning within the last six months drain over eight hours instead of not being able to drain experience at login.<ref>[[Post:Login Experience Drain - 03/12/2015 - 21:32]]</ref>

==RP messaging==
Ranks in each skill are numerical. However, there is also a role-playing system of nomenclature set up for skills, to make it easier to integrate into game-play.

;Ranks 1-49 / Novice
''Within the above range:''
*+ 0-09 = Lowly
*+ 10-19 = Promising
*+ 20-29 = Able
*+ 30-39 = Trained
*+ 40-49 = Full

;Ranks 50-99 / Practitioner

;Ranks 100-149 / Dilettante

;Ranks 150-199 / Aficionado

''Within the above ranges:''
*+ 0-09 = Beginning
*+ 10-19 = Competent
*+ 20-29 = Proficient
*+ 30-39 = Experienced
*+ 40-49 = Skilled

;Ranks 200-299 / Adept

;Ranks 300-399 / Expert

''Within the above ranges:''
*Rated by degrees 0-99

;Ranks 400-499 / Professional

;Ranks 500-599 / Authority

;Ranks 600-699 / Genius

''Within the above ranges:''
*+ 20-39 = Exceptional
*+ 40-59 = Outstanding
*+ 60-79 = Renowned
*+ 80-99 = True

;Ranks 700-799 / Savant

;Ranks 800-899 / Master

;Ranks 900-999 / Grand Master

''Within the above ranges:''
*+ 20-39 = Distinguished
*+ 40-59 = Venerated
*+ 60-79 = Exalted
*+ 80-99 = Transcendent

;Ranks 1000-1249 / Guru

;Ranks 1250-1499 / Legend

;Ranks 1500-1749 / Phenom

;Ranks 1750 / Avatar

==Bonus experience pools==
During [[experience 3.0]], when skills were combined, the "lost" experience bits were moved into the bonus pools, one for each skillset. When experience is absorbed through the normal method, an equal amount is removed from the appropriate bonus pool and added to permanent experience. This effectively doubles learning rates in the skillset so long as experience remains in the bonus pools.

The metric used is an arbitrary unit, a multiple of the amount of bits that it takes to move a skill from 0 to 200 (60,300 bits) plus the number of ranks any remaining bits would teach. As an example:

{|
|<pre>Your Lore pool could fill 14 empty skills to 200 ranks and one empty skill to 57 ranks.</pre>
|}

===Syntax===
To view how much experience is left use {{com|experience}} {{tt|bonus}}. When there is no longer any experience left, you will receive the message "You do not have any experience in your bonus pools."

To toggle absorption, use {{tt|experience bonus toggle}} ''<skillset>''.

{{RefAl|a=y|r=y}}
*[http://www.elanthia.org/Learning/ Demystifying the Experience System]: [[User:Isharon|Isharon]]'s explanation of the experience system (a good link to share with new players)
*[[Experience (obsolete)]] has information on the obsolete experience system prior to the 3.0 release.
*[[:Category:Skills]] has a listing of all skills in game.
*[[Skillsets]] for how skills are grouped in game.
*[[Time Development Points]] are calculated based on earned ranks in a skill.

{{cat|Skills|*}}[[page type is::concept| ]]