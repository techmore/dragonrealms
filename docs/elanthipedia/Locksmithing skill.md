# Locksmithing skill

_Automatically mirrored from Elanthipedia (2026-08-12)._

'''Locksmithing [[page type is::skill]]''' is used to pick locks and disarm traps, as well as for lockpick carving and lockpick fixing. Locksmithing is most commonly used for opening containers dropped by slain creatures, commonly referred to as boxes.
The [[DR 3.0]] update combined and replaced the now obsolete Lockpicking and Disarming skills with Locksmithing.

==Spells and abilities that boost Locksmithing==
{{#ask:[[Boosts::Locksmithing skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Spells and abilities that decrease Locksmithing==
{{#ask:[[Debuffs::Locksmithing skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Modifiers==
Locksmithing is affected by armor hindrance and can be especially affected by armor and brawling gear worn on the hands. If you are being impeded by anything you are wearing you will notice it when you try to Pick or Disarm. Kneeling and/or sitting while popping boxes is also recommended to increase chances of success.

Mentals contribute only to the ident part, and agil/reflex contribute only to the actual disarm/pick part. ~ [[Javac]] — 2022-05-23

==Training==
All commands associated with [[Pick command|lockpicking]] or [[Disarm command|disarming]] will train the Locksmithing skill to some degree. Some of the commands will also train perception, to a much smaller degree. There are multiple variations of both commands that can help increase both the amount of training received and chance of success.

===Disarming===
{{tt|disarm <item> identify}} - Tells you the type of trap, and the difficulty in accordance with your skill. If the last trap on the box has already been disarmed you will incur a small roundtime letting you know what the disarmed trap looks like.<br/>
NOTE: <item> is not required as long as you are holding the box type in your right hand.

{{tt|disarm <item> <caution>}} - The act of actually disarming the trap, the level of caution you use is up to you.
: {{tt|careful}} - Slowest, but safest caution level
: None - Putting nothing for caution will result in the second slowest, and second safest form of disarming
: {{tt|quick}} - 2nd fastest and 2nd most dangerous.
: {{tt|Blind}} - Fastest and most dangerous.

{{tt|disarm <item> analyze}} - Analyzing a box will show you what type of mechanism can be harvested from trap. Each trap can only be harvested if you have not started working on the next trap.

{{tt|disarm <item> harvest}} - Harvesting will attempt to retrieve a piece of the trap mechanism.

===Lockpicking===
NOTE: <item> is not required as long as you are holding the box type in your right hand.<br/>
{{tt|pick <item> analyze}} - Analyzing a lock will tell you what the lock looks like, determining what type of lockpick should be used. If the last lock in the box has been picked you will receive a message saying the box is not locked, but no roundtime.

{{tt|pick <item> identify}} - Identifying a lock will tell you the locks difficulty in accordance with your skill.

{{tt|pick <item> <caution>}} - Caution levels are the same as disarming; "Careful", none, "Quick", "Blind".

===Lockpick carving===
See [[Lockpick carving]] and {{com|Fix}} command articles.

===Locksmithing trainers===
The [[Locksmithing trainer]]s are made to {{tt|lock}} and {{tt|pick}} to train Locksmithing, giving the user 1/34 skill per "pick" regardless of the total ranks of the user.  They can be found as limited use, limited per-day or unlimited variations.

===[[Breaking and Entering]]===
Use the {{com|Burgle}} command outdoors and inside [[Justice]] to enter properties to steal items.  Holding a lockpick or wearing a [[Lockpick rings|lockpick ring]] to {{tt|burgle}} will grant locksmithing skill upon your exit from temporarily generated homes.

==Types of locks and picks==
Certain lockpicks will need to be used on certain types of locks. Analyzing the lock will reveal what type of lock it is. This has only partially been introduced into the game and is waiting on the [[Mechanical_Lore_skill|Lore rewrite]] to be fully incorporated. Quality and style will be separated out, so it will be possible to have a master quality pick of the following styles. It was mentioned that grandmaster quality would be able to open all styles of locks, but be restricted to the thief guild.
 
*Although difficult to spot at first, a thin hole along the bottom of the lock appears to be the key receptacle.
:Slim

*The lock's structure is relatively basic, standard in every way without any unusual characteristics.
:Ordinary

*A sturdy block of metal, the hole for the key is very wide.  This big lock obviously is meant for a correspondingly large key.
:Stout

*An intricate steel star houses a complex locking mechanism, with two different spots that each look like they're meant to house keys.
:??

==Trap and lock difficulty==
{{com|Disarm}}/{{com|Pick}} {{tt|identify}} will give you an appraisal of the difficulty based on your skill. The following is a list of the varying difficulties.

{| class="wikitable"
|-
! Difficulty <br/> ranking <ref>Originally ranked 0 thru 16. Changed to ranks 1 thru 17 to reflect the numerical values generated in game via {{com|toggle}} {{tt|appraisal}} as of the [[Tuesday_Tidings#November 2020|Tuesday Tidings 37]] November 2020 update.  [[Post:Tuesday Tidings 37 - More Toggles - 11/03/2020 - 20:32]]</ref>
! Trap
! Lock
|-
| 1/17
| An aged grandmother could defeat this trap in her sleep.
| An aged grandmother could open this in her sleep.
|-
| 2/17
| This trap is a laughable matter, you could do it blindfolded!
| This lock is a laughable matter, you could do it blindfolded!
|-
| 3/17
| The <material> <box>'s trap is a trivially constructed gadget which you can take down any time.
| The lock is a trivially constructed piece of junk barely worth your time.
|-
| 4/17
| The <material> <box> will be a simple matter for you to disarm.
| The <material> <box> will be a simple matter for you to unlock.
|-
| 5/17
| The <material> <box> should not take long with your skills.
| The <material> <box> should not take long with your skills.
|-
| 6/17
| You can disarm the <material> <box> with only minor troubles.
| You can unlock the <material> <box> with only minor troubles.
|-
| 7/17
| You think this trap is precisely at your skill level.
| You think this lock is precisely at your skill level.
|-
| 8/17
| The trap has the edge on you, but you've got a good shot at disarming the <material> <box>.
| The lock has the edge on you, but you've got a good shot at picking open the <material> <box>.
|-
| 9/17
| The odds are against you, but with persistence you believe you could disarm the <material> <box>.
| The odds are against you, but with persistence you believe you could pick open the <material> <box>.
|-
| 10/17
| You have some chance of being able to disarm the <material> <box>.
| You have some chance of being able to pick open the <material> <box>.
|-
| 11/17
| Disarming the <material> <box> would be a longshot.
| Opening the <material> <box> would be a longshot.
|-
| 12/17
| Prayer would be a good start for any attempt of yours at disarming the <material> <box>.
| Prayer would be a good start for any attempt of yours at picking open the <material> <box>.
|-
| 13/17
| You have an amazingly minimal chance at disarming the <material> <box>.
| You have an amazingly minimal chance at picking open the <material> <box>.
|-
| 14/17
| You really don't have any chance at disarming this <material> <box>.
| You really don't have any chance at picking open this <material> <box>.
|-
| 15/17
| You probably have the same shot as a snowball does crossing the desert.
| You probably have the same shot as a snowball does crossing the desert.
|-
| 16/17
| You could just jump off a cliff and save yourself the frustration of attempting this <material> <box>.
| You could just jump off a cliff and save yourself the frustration of attempting this <material> <box>.
|-
| 17/17
| A pitiful snowball encased in the Flames of Ushnish would fare better than you.
| A pitiful snowball encased in the Flames of Ushnish would fare better than you.
|-
|}

==Mid- to High-Level Box Difficulty Chart by Kaxis==

===Messaging Scale===

There are 17 different difficulty level messages that can result when Disarm IDing a box. These were numbered from 1-17 (easiest to hardest).<br />

===Variables===

There are two notable variables. The first is when disarm IDing a box multiple times, the difficulty messages generated will be similar but not exact. They will cluster as an average around the unknown true difficulty level. The second variable is that some boxes from a creature type are easier or harder than others.<br />

===Testing Procedure===

To compensate, a 10-box sample was collected from each creature type and then each box disarm IDed 100 times. This generated 1000 data points, with each data point representing a particular difficulty level. These were totaled to give a final numerical score for each creature type. The higher the score, the more difficult the box.<br />

The final scores for each creature type were arranged in descending numerical order to create a box difficulty chart. The chart below was done on mid- to high-level creatures. At the time, Dragon Priest intercessors were the highest creature in DragonRealms.<br />

The tests were run without change of either statistics or skill ranks. Thus, each creature type was tested against the same parameters.<br />

===Notes===

This method does not deal with Locksmithing ranks. The final scores are unitless and allow boxes to be accurately scaled against each other.<br />

It must be understood that the numbers in the chart were unique to Kaxis at the time. Were he to run the test now with different Locksmithing ranks and statistics, he would get different numbers, but the box order generated would be virtually identical. This would hold true for any character from any guild. The scores in the chart were included only for reference purposes and increased transparency of the testing procedures.<br />

There is an effectiveness overlap between creatures on the chart, so as the player goes up the list, some can be skipped if there are other hunting requirements. The notable exception is the rather significant gap between Misenseor resuscitants and Dragon Priest assassins.<br />

This testing method was chosen because the considerable random number generation in the box system, combined with the wide variety of player stats, ranks, spells, guild abilities, bonuses, disarming techniques/approaches, and other factors makes accuracy in a Locksmithing ranks-based system impractical. Such a system could be useful but only as a rough guide.<br />

===Original Thread on the DragonRealms Forums===

[http://forums.play.net/forums/DragonRealms/Abilities,%20Skills%20and%20Magic/Survival%20Skills%20-%20Economic/view/1481 Dragonrealms Forum: Survival Skills - Economic]<br />

===Box Difficulty Chart===

{| class="wikitable sortable"
|-
! Creature
! Score
|-
|-
|[[Dragon Priest intercessor]]||9762
|-
|[[Dragon Priest assassin]]||8812
|-
|[[Misenseor resuscitant]]||4496
|-
|[[Sinister Maelshyvean hierophant]]||4239
|-
|[[Zombie head-splitter]]||4080
|-
|[[Black goblin]]||3522
|-
|[[Ashu hhinvi]]||3396
|-
|[[S'sugi malchata]]||3321
|-
|[[Zombie mauler]]||3131
|-
|[[Sky giant]]||3119
|-
|[[Vile plague wraith]]||2984
|-
|[[Zombie stomper]]||2771
|-
|[[Maelshyvean cinder beast]]||2756
|-
|[[Adan'f spirit dancer]]||2703
|-
|[[Maelshyvean shadow beast]]||2585
|-
|[[Mountain giant]]||2580
|-
|[[Isundjen conjurer]]||2492
|-
|[[Armored shalswar]]||2250
|-
|[[Dragon Priest juggernaut]]||2226
|-
|[[Dragon Priest zealot]]||2177
|-
|[[Dragon Priest purifier]]||2163
|-
|[[Orc raider]] (2nd floor)||2159
|-
|[[Black marble gargoyle]]||2156
|-
|[[Dragon Priest crone]]||2131
|-
|[[Telga moradu]]||2089
|-
|[[Dragon Priest sentinel]]||2088
|-
|[[Orc raider]] (1st floor)||2084
|-
|[[Misshapen germish'din]]||2077
|-
|[[Kra'hei]]||2071
|-
|[[Wir dinego]]||2054
|-
|[[Lun'Shele hunter]]||2025
|-
|}

==Boxes==
Each box can contain multiple traps and multiple locks. Upon each successful disarm or unlock you will see if it is not yet fully disarmed or picked.
Each type of trap has a unique appearance, a harvestable item, and a unique consequence for tripping it.

Additionally, on a successful open, a box can contain coins, gems or items from the [[Random creature drop]] pool.

The nouns for them can be of the following: box, caddy, casket, chest, coffer, crate, skippet, strongbox, trunk.

Boxes measure 6x3x3 except crates, those are 7x4x3.

Metal boxes weigh 40 stones each, wooden ones weigh 20 stones each.

===Creatures with boxes===
{| class="wikitable sortable" 
|-
!Creature
!Approx. Min. Ranks
!Approx. Cap
!Spawn Rate
!Drop Rate
|-
|[[Goblin]]||0||40+|| ||High
|-
|[[Sleazy Lout]]||0||35|| ||High
|-
|[[Trollkin]]||0||35|| ||High
|-
|[[Goblin Zombie]]||0||35|| ||
|-
|[[Ghoul]]||0||35|| ||
|-
|[[Crazed Madmen]]||0||35|| ||
|-
|[[Blood Nyad]]||0||35|| ||
|-
|[[Blood Dryad]]||0||35|| ||
|-
|[[Kobold]]||30||55|| ||
|-
|[[Goblin Shaman]]||30||55|| ||
|-
|[[Small Boggle|Boggle]]||30||55|| ||
|-
|[[Revenant Zombie]]||30||55|| ||
|-
|[[Wood Troll]]||30||55|| ||
|-
|[[Grendel]]||30||55|| ||
|-
|[[S'lai Scout]]||30(?)||??|| ||
|-
|[[Faenrae Reaver]]||35||75|| ||
|-
|[[Sand Sprite]]||40||100+||High||High
|-
|[[Rock Troll (1)]]||40||>120|| ||
|-
|[[Dusk Ogre]]||50||85|| ||High
|-
|[[Fire Sprite]]||55||85(?)|| ||
|-
|[[Fire Maiden]]||55||85(?)|| ||
|-
|[[Skeletal Kobold Savage]]||55||85(?)|| ||
|-
|[[Skeletal Kobold Headhunter]]||55||85(?)|| ||
|-
|[[Zombie Kobold Savage]]||55||85(?)|| ||
|-
|[[Zombie Kobold Headhunter]]||55||85(?)|| ||
|-
|[[Arbelog]]||60||??|| ||
|-
|[[Dark Fiend]]||60(?)||??|| ||
|-
|[[Lesser Sluagh]]||60||??|| ||
|-
|[[Moss Mey]]||70||105(?)|| ||
|-
|[[Gypsy Marauder]]||75(?)||105(?)|| ||
|-
|[[Young Ogre]]||75(?)||105(?)|| ||
|-
|[[Scout Ogre]]||75(?)||110(?)|| ||
|-
|[[Bawdy Swain]]||75(?)||185(?)|| ||High
|-
|[[Swamp Troll]] (Haven)||80||??|| ||
|-
|[[Snow Goblin (1)|Snow Goblin]]s, 1st Tier||85(?)||135(?)|| ||
|-
|[[Young Cave Troll]]||85(?)||135(?)|| ||
|-
|[[Miserly Moneygrubber|Moneyrubber]], [[Pugnacious Pinchfist|Pinchfist]], [[Shifty-eyed Skinflint|Skinflint]], [[Troublesome Tightwad|Tightwad]]||90(?)|||| ||
|-
|[[Granite Gargoyle]]||80||>300|| ||High
|-
|Crossing [[Thug (Creature)|Thug]], [[Cutthroat (Creature)|Cutthroat]], [[Ruffian (Creature)|Ruffian]], [[Footpad (Creature)|Footpad]]||100||??|| ||
|-
|[[River Sprite]]||125(?)||??|| ||
|-
|[[Snow Goblin (2)|Snow Goblin]]s, 2nd Tier||120||190|| ||
|-
|[[Kra'hei Hatchling]]||130||320 softcap||High||High
|-
|[[Writhing Maiden's Tress]]||130(?)||??|| ||
|-
|[[Dark Spirit]]||130||??|| ||
|-
|[[Quartz Gargoyle]]||135||>300|| ||High
|-
|[[Scavenger Troll]]||140||>300||Low||High
|-
|[[Pale Grey Death Spirit]]||140??||??|| ||
|-
|[[Rotting Deadwood Dryad]]||150(?)||??|| ||
|-
|[[Alley Thug]]||130(?)||??|| ||
|-
|[[Frostweaver]]||150||250 softcap|| ||
|-
|[[Lanky Grey Lach]]||150||??|| ||
|-
|[[Pirate]]s on the Lybadel//Kree'la||110||220|| ||
|-
|[[Shadoweaver]]||150(?)||??|| ||
|-
|[[Snow Goblin (3)|Snow Goblin]]s, 3rd Tier||150||210|| ||High
|-
|[[Orc Scout]]||150??||??|| ||High
|-
|[[Forest Geni]]||150||420(soft cap)|| ||High
|-
|[[Ur Hhrki'izh (1)|Ur Hhrki'izh]], 1st Tier||160(?)||230(?)|| ||
|-
|[[Orc Bandit]]||150||??|| ||
|-
|[[Adan'f Shadow Mage]]||200||??|| ||
|-
|[[Adan'f Blood Warrior]]||200||??|| ||
|-
|[[Orc Reiver]]||200??||??|| ||High
|-
|[[Red-bristled Gremlin]]||205(?)||>300|| ||Medium
|-
|[[Velakan Slaver]]||210(?)||??|| ||
|-
|[[Zombie Nomad]]||210(?)||??|| ||
|-
|[[Ashu Hhinvi]]||350(?)||700|| ||
|-
|[[Armored Shalswar]]||245||??|| ||
|-
|[[Misshapen Germish'din]]||260(?)||??|| ||
|-
|[[Orc Raider]]||276+||??|| ||High
|-
|[[Adan'f Spirit Dancer]]||276||??|| ||
|-
|[[Greater Sluagh]]||280(?)||??|| ||
|-
|[[Sky Giant]]||350??||??|| ||High
|-
|[[Crypt Fiend]]||??||??|| ||
|-
|[[Blight Ogre]]||??||??|| ||
|-
|Super [[Rock Troll (2)|Rock Troll]]||??||??|| ||
|-
|[[Swamp Troll (3)|Swamp Troll]] (Lang)||85||??|| ||
|-
|[[Merrows]]||115||160|| ||
|-
|[[Corsair]]s||??||??|| ||
|-
|Plain [[Atik'et]]||??||??|| ||
|-
|[[Fendryad]]||150(?)||??|| ||
|-
|Temple [[Atik'et]]||??||??|| ||
|-
|[[Spectral Pirate]]||150?||??|| ||
|-
|[[Skeletal Sailor]]||150?||??|| ||
|-
|Lava field [[Atik'et]]||??||??|| ||
|-
|[[Dragon Priest]]/Priestess||245||(similar to Armored Shalswar)|| ||
|-
|[[Faenrae Stalker]]||??||??|| ||
|-
|[[Lun'Shele Hunter]]||240?||??|| ||
|-
|[[Lun'Shele Trekhalo]]||240?||??|| ||
|-
|[[Wir Dinego]]||240||350|| ||
|-
|[[Kra'hei]]||260||350?||high||
|-
|[[Telga Moradu]]||??||??|| ||
|-
|[[Maelshyvean cinder beast]]||340||??||High||High
|-
|[[Maelshyvean Shadow Beast]]||340||??||High||High
|-
|[[Orc Clan-Chief]]||??||??|| ||
|-
|[[Shadow Master]]||??||??|| ||
|-
|[[Zombie Stomper]]||300||>760|| ||High
|-
|[[Zombie Mauler]]||500(?)||>760|| ||
|-
|[[S'sugi Malchata]]||300||>760|| ||
|-
|[[Black Goblin]]||??||??|| ||
|-
|[[Zombie Head-splitter]]||600(?)||>760|| ||High
|-
|[[Dragon Priest Assassin]]||850||??|| ||
|-
|[[Dragon Priest Intercessor]]||1100(??)||??|| ||
|-
|}

===Box Traps===
{| class="wikitable sortable" 
|-
!Trap Type
!Appearance
!Failure Result
!Harvestable Parts
!Leathality
|-
|[[Damage#Acid|Acid]] Trap||  style="width:300px" |As you look closely, you notice a tiny hole right next to the lock which looks to be a trap of some kind.|| style="width:300px"|Sprays a random body part with acid. Will damage armor if some is worn on that part, but will prevent wounds and vitality damage||a {{sloot|i|glass reservoir}}||Deadly, Armor Damaging, Acid
|-
|Boomer|| A glistening black square, surrounded by a tight ring of fibrous cord, catches your eye.||Explodes the box causing damage to the hands and eyes.||a {{sloot|i|steel striker}}, a {{sloot|i|black cube}}||Deadly, explosion to hands/eyes
|-
|Bug ([[Vykathi reaper|Reaper]]) Trap||A crust-covered black scarab of some unidentifiable substance clings to the <material> <box> by six tiny legs, all of which are firmly imbedded into the <wood/metal> and look like it may be tough to dig them out.||Summons about 3 [[vykathi reaper]]s, who appear at melee range with the locksmith. They do not share the locksmith's roundtime for the disarm attempt.||a {{sloot|i|tiny chitinous leg}}||Deadly, summons creatures
|-
|Crossbolt Trap||You find a series of openings on the front of the <box> concealing the points of several wickedly barbed crossbow bolts.||Fires numerous crossbow bolts at the target, evasion skill affect how many hit, the amount shot is based off the difficulty of the box.||a {{sloot|i|tightly coiled spring}}||Deadly
|-
|Crossbolt Trap ([[Damage#Poison|Poison]])||You find a series of openings on the front of the box concealing the points of several crossbow bolts glistening with moisture.||Fires numerous poisoned crossbow bolts at the target, evasion skill affect how many hit, the amount shot is based off the difficulty of the box.||a {{sloot|i|coiled spring}}||Deadly, poison
|-
|Concussion Trap||Right above the lock inside the keyhole, you see a tiny metal tube just poking out of a small wad of brown clay.||Explodes, possibly blasting some victims out of the room. All will receive internal head wounds, causing repeated ringing in the ears, accompanied by roundtime. The locksmith will also have hand wounds.||some {{sloot|i|brown clay}}||Deadly, Area Affect
|-
|[[Poison#Vitality_Poisons|Cyanide]] Trap||The glint of silver from the tip of a dart and a slight smell of almonds catches your attention as you go over the <box>.||Shoots a tiny dart into forehead. Inflicts cyanide [[Damage#Poison|poison]]. Dart can be tended out and used as a weapon.||a {{sloot|i|coiled spring}}||Deadly, poison
|-
|[[Damage#Disease|Disease]] Trap||While inspecting the <box> patiently, you see what appears to be a small, swollen animal bladder recessed inside the keyhole.||Infects the locksmith with disease.||a {{sloot|i|bloated animal bladder}}||Deadly, Disease
|-
|Fire Ant Trap||Within the casing of the wooden strongbox is a mesh bag, a very sharp blade poised to the side just within the structure of the strongbox. The bag twitches on occasion, leading you to believe the blade's presence likely to be a very bad thing.||Upon failure, the blade slices open a bag of Fire Ants, which crawl up your hands and over your entire body. Every few seconds, there is a damage pulse and you receive the above messaging while taking a large hit to vitality (15-30% or more per pulse). Victim can die within a few moments of the trap activating if the burning sensation isn't resolved immediately.||a {{sloot|i|sharp blade}}||Deadly, pulsing vitality
|-
|Flea Trap||Imbedded in the front of the iron <box> is a small glass tube of milky-white opacity. Small black dots bounce inside, though the lack of transparency makes it impossible to be certain what they are.||Causes to Disarmer to be covered in fleas that inflict vitality damage and random Roundtimes. You will need to find a body of water at least ankle deep (or a [[Warrior Mage]] with [[Water Globe]]) to wash away the fleas.||a {{sloot|i|tiny hammer}}||Deadly, pulsing vitality
|-
|Gas Trap ([[Damage#Poison|Poison]])||You notice a vial of lime green liquid just under the <box>'s lid. The stopper is attached so that the vial will open when the top is lifted.||Releases a cloud of Chlorine gas that will poison everyone in the room. There is a chance that the locksmith will inhale all the gas upon its release, preventing the gas cloud in the room.||a {{sloot|i|sealed vial}},<br/>(easter egg) a {{sloot|i|stoppered vial}}||Deadly, Poison, Area
|-
|Lightning Trap||Looking closely into the keyhole, you spy what appears to be a pulsating ball with some sort of metal lacing around it. The lacing runs to meet a coin sized piece of metal near the keyhole itself.||Shoots a lightning bolt at the locksmith. Can be amplified if set off in water.||an {{sloot|i|iron disc}}||Deadly, Lightning Bolt
|-
|[[Naphtha]] Soaker||Searching the <box> carefully, you notice a small notch beside a tiny metal lever on the front. Though it's hard to see, there also appears to be a liquid-filled bladder inside the notch.||A two stage trap. First Failure soaks the Disarmer in [[naphtha]]. Second failure will ignite the naphtha causing damage to various parts of the body and inflicting a hefty damage to vitality. The naptha will eventually evaporate if it's not ignited.||a {{sloot|i|metal spring}},a {{sloot|i|tiny metal lever}}||Deadly, Naptha [[Damage#On_Fire|burning]]
|-
|[[Naphtha]] Trap||A tiny striker is cleverly concealed under the lid, set to ignite a frighteningly large vial of [[naphtha]].||Explodes in a large fireball. Can harm others in the room, but they have a chance of avoiding it.||a {{sloot|i|steel striker}}||Deadly, Explosion, Area
|-
|[[Damage#Poison|Poison]] (Local)||You notice a tiny needle with a greenish discoloration on its tip hidden next to the keyhole.||Inflicts [[Poison#Location_Poisons|standard poison]] in either hand.||a {{sloot|i|broken needle}}||Deadly, poison
|-
|[[Damage#Poison|Poison]] (Nerve)||You notice a tiny needle with a rust colored discoloration on its tip hidden next to the keyhole.||Inflicts [[Poison#Nerve_Poisons|nerve poison]].||a {{sloot|i|short needle}}||Deadly, Nerve Poison
|-
|Scythe Trap||Out of the corner of your eye, you notice a glint of razor sharp steel hidden within a suspicious looking seam on the <box>.||Chops off a random hand giving a very heavy bleeder.||a {{sloot|i|short curved blade}}||Deadly, hand bleeding
|-
|Shocker Trap||You notice two silver studs right below the keyhole which look dangerously out of place there.||Discharges an electrical bolt at the Disarmer. Causes Nerve and vitality damage and inflicts a stun.||some {{sloot|i|silver studs}}||Deadly, Nerve and Vit damage
|-
|Shrapnel Trap||Squinting slightly to see better, you notice the <box>'s keyhole is packed tightly with a powder around the insides of the lock.||Explodes, casting shrapnel at the person holding the box. Causes internal wounds.||a {{sloot|i|steel striker}}||Deadly, explosion
|-
|[[Teleport]] Trap||The hinges of the <material> <box> are covered with a thin metal circle that has been lacquered with a shade of <deep ebony/bluish azure/bright crimson>.||Casts the [[Teleport]] spell on the locksmith. If the associated moon (see the color of the disc) is down, the locksmith is disintegrated. If the moon is up, they are teleported to a random one of several predetermined locations within nearby hunting grounds. The harder the box, the longer the potential range of the teleport.||a {{sloot|i|thin metal circle}}||Deadly, possible disentigration
|-
|Bouncing Box||Looking into the keyhole you see what seems to be a pin lodged against the tumblers of the lock. Connected to the pin is a small shaft that runs downward into a shadow.||The box will bounce from room to room and eventually destroys the box. Will toss out the contents of the box as it's bouncing, one per room (may take several bounces to start), until it runs out, upon which it is destroyed. (At the moment the box doesn't actually spit out any treasure. This is due to the box changes that made treasure spawn within the box at the moment it is lockpicked.)||a {{sloot|i|steel pin}}||None
|-
|Curse Trap||While checking the caddy with an careful eye, you notice a small glowing rune hidden inside the box near the lock.||Curses the box and contents so that it can not be dropped/stowed/dismantled. You will need a [[Cleric]] with [[Uncurse]] to break the curse or a [[Warrior Mage]] with [[Flashpoint]]. Eventually the curse on the box itself will fade, but the items inside will remain cursed.||a {{sloot|i|broken rune}}||Cursed, box won't leave hand
|-
|Frog Trap||While checking the <box> with a careful eye, you notice a lumpy green rune hidden inside the <box> near the lock.||Turns the locksmith into a warty toad. Being kissed will change them back. Will wear off by itself after a few minutes.||a {{sloot|i|broken rune}},<br/>(easter egg) : a {{sloot|i|lumpy green runestone}}||Turned into frog temporarily
|-
|Gas Trap (Laughing)||Examining the box for traps reveals a tiny glass tube filled with a black gaseous substance of some sort and a tiny hammer at the ready to do what it was designed for.||Causes anyone in the room to randomly tell jokes. May cause Roundtimes or cause a character to drop to his/her knees.||a {{sloot|i|tiny hammer}}||Involitary roundtimes and kneeling, Area
|-
|Mana Sucker||While checking the box for traps, you notice a bronze seal over the box's lock. The seal is covered in strange runes and a glass sphere is embedded within it.||Drains mana and keeps it there for a few minutes. [[Uncurse]] can be used to prematurely end the effect.||a {{sloot|i|bronze seal}},<br/>(easter egg) : a glass sphere||Drains Mana
|-
|Mime Trap||A tiny bronze face, Fae in appearance, grins ridiculously from its place on the <material> <box>. Some sort of fatty bladder sticks out from the edges of this miniature metallic visage.||Turns the locksmith into a mime. Many actions will result in the mime acting as if stuck in an invisible box, with a 10-second roundtime. Some actions have specific mime interpretations. It will wear off after a time, or can be canceled by a [[Cleric]] with [[Uncurse]].||a {{sloot|i|tiny bronze face}}||Cursed as a mime
|-
|Shadowling Trap||While scanning the <box> with a careful eye, you notice a small black crystal deep in the shadows of the <material> <box>.||Causes the locksmith to speak in gibberish. Does not affect [[gwethdesuan]] [[ESP|thoughts]].||{{sloot|i|cracked black crystal}}||Can't speak temporarily
|-
|Sleeper Trap||Two sets of six pinholes on either side of the oaken coffer's lock indicate that something is awry.||This will cause you to fall asleep. You will have to WAKE up which takes about 30 seconds.||a {{sloot|i|capillary tube}}||Cause SLEEP
|-
|}

{{RefAl|r=y}}
{{Cat|Survival skillset,Experience 3.0 skills,Skills}}