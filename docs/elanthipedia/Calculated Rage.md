# Calculated Rage

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=CR
|minprep=30
|castcap=100
|minskill=250
|maxskill=1000
|minduration=1
|maxduration=10
|validtarget=Self
|guild=Empath
|magic=Life Magic
|spellbook=Mental Preparation
|prereqs=20th Circle, [[Tranquility]]
|slot=3
|illegal=none
|corrupt=none
|desc=Calculated Rage is an adaptation of empathic manipulation to a more specific degree. The pattern allows the magician to simultaneously tightly control and yet also heighten their anger. Letting it go in a RAGE at a target will produce a fleeting transference of this state to the recipient, often confusing and putting them on the back foot in combat.

Due to the need for physical contact, the "raging" is only effective at melee range. Also note that misuse of the spell by failing to empathize with the target, be it unliving or due to the magician's own lack of empathy, can have emotionally exhausting results.
|buffs=No buffs
|debuffs=Defensive Factor
|dtype=Puncture damage, Impact damage
|htype=No heal
|poststring=No
|effect=Pre-cast TM. Gives uses of RAGE command to make attacks.
|messaging=>cast<br />
You gesture.<br />
You contribute your harnessed streams to increase the pattern's potential.<br />
You weave the Calculated Rage pattern around your mind.  There is no overt change at first, except the feeling of emotional control -- and potential.

>perc self<br />
You sense the presence of the Calculated Rage spell isolating a vast reserve of emotion in your mind.  The spell should last around nine roisaen or until you have unleashed your RAGE six more times.

Damaging:<br />
>rage<br />
You discharge a portion of the Calculated Rage spell.<br />
There is no connection there, no empathy to be had.  Fury without release builds in a split second a white hot, certain thing.  You reach out violently for catharsis.
With calculated malice you dart along the side of a lava drake and drop kick, scoring an awesome strike (12/23).<br />
The lava drake is knocked completely senseless!<br />

Defensive debuffing:<br />
>rage<br />
You discharge a portion of the Calculated Rage spell.<br />
There is no connection there, no empathy to be had.  Fury without release builds in a split second a white hot, certain thing.  You reach out violently for catharsis.<br />
The attack doesn't faze a giant mechanical mouse!<br />
The mechanical mouse is stunned!

Empath touches you with force, though not enough to cause direct injury.  Despite this, you feel utterly out of sorts.  Your emotions are out of control, and your ability to concentrate on defense diminished in the face of a consuming rage.

>rage person<br/ >
You discharge a portion of the Calculated Rage spell.<br/ >
With a flicker of emotion you build a fleeting transference link with person.  It is not much, but it is enough to release the calculated rage that burns inside you, if you can touch he.<br/ >
You make contact with Person and release your spike of rage!  Person reels in confusion.

Third party:<br/ >
Empath pushes against Person with modest force.  Despite appearing unharmed, Person reels and seems positively out of sorts.

On wear off of the caster:<br />
Your emotional control returns to normal, leaving behind the normal ebb and flow of thought.

On debuff wear off (seen by the person debuffed):<br />
You feel steadier on your feet again.
|sig=Yes
|diff=advanced
|source=standard
|type=targeted
|ctype=battle
}}
==Notes==
* CR is a Mental Preparation TM spell that has a heavy conceptual debt to [[Blufmor Garaen]] and [[Icutu Zaharenela]].  You pre-cast it and it gives you a number of uses of the {{com|RAGE}} verb that you can use at your discretion.  This attack, depending on factors, if successful will result in a potent defensive penalty to your victim, or a melee-range TM attack with a substantially weaker but still useful defensive penalty attached.
* Basically: for shocked empaths it's like a limited-use IZ with a defense penalty attached.  For normal Empaths, it's a non-damaging attack that does a considerably larger and longer-acting defense penalty.
* The spell requires melee range to function.
* The spell pierces spell wards. Calculated Rage's are treated as non-magic for the purposes of many anti-magic defenses like Shear, Turtle Form, and Sanyu Lyba.
* {{skill|Brawling}} factors slightly into the attack.
* It can't be dispelled as a spell effect, but anything that explicitly removes defense debuffs would affect this as well.
* The debuff is extremely short, less than a minute even for healthy Empaths, even shorter as a damaging attack rider.
* The debuff is based on the potency of the attack, which is influenced by both TM skill and mana.
* "Defense factor" is the math that happens to your defensive skills that is then compared against the attackers corresponding "offense factor". CR basically modifies the output of the formula that your skills/stats play into to determine your defensive factor.

==Effects==
The debuff strength is based on the potency of the attack, which is influenced by both {{skill|Targeted Magic}}  and mana amount. The bigger the hit, the bigger the debuff.  (In the case of a non-damaging strike, the damage is still calculated but just "thrown out" afterward.)
{|class="wikitable sortable"
! Empath Status !! Target Type !! Effect !! Causes Shock
|- 
| Non-Shock || Living || Big defensive debuff || No
|- 
| Non-Shock || Construct ||Damage + small debuff ||  No
|-
| Non-Shock || Undead (without Absolution up)|| Damage + small debuff || Yes
|- 
| Non-Shock || Undead (with Absolution up)|| Damage + small debuff || No
|- 
| Grey Area || Anything || Random ||
|- 
| Full Shock || Living || Damage + small debuff || n/a
|-
| Full Shock || Construct || Damage + small debuff || n/a
|- 
| Full Shock || Undead || Damage + small debuff || n/a
|}