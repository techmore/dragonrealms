# Invocation of the Spheres

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=iots
|minprep=300
|castcap=800
|minskill=250
|maxskill=1000
|minduration=30
|maxduration=90
|validtarget=Self, Special
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Stellar Magic
|prereqs=[[Moongate]], completion of a [[Invocation of the Spheres quest|quest]]
|slot=2
|illegal=no
|corrupt=no
|desc=The Invocation of the Spheres spell creates a ritual circle based on any planet visible in the heavens.  The circle can be invoked to charge the caster with celestial energy, the nature of which varies with the planet invoked.  Care should be taken to not mix unlike energies or the results can prove undesirable.
|buffs=Agility (stat), Charisma (stat), Discipline (stat), Intelligence (stat), Reflex (stat), Wisdom (stat)
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Only two from specific stat pairings.
|messaging=You gesture.<br />
The mental strain of this pattern is considerably eased by your ritual focus.<br />
A red-orange nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br />
The molten light continues speeds up as it descends, until it resolves into a rapidly churning disk a foot off the ground.<br />
<br />
'''Invoking the Circle:'''<br />
You draw your hand into the molten disk.  Fiery energy races up your arm and into your body with a violent rush!  Within a moment the circle is consumed.<br />
The burning energy settles into your body after a few spikes of pain.  You feel much lighter on your feet.<br />
<br />
'''Death by Invoking Multiple Ritual Circles:'''<br />
You step inside the ring of hieroglyphs.  The glowing figures arc up and inward, swirling around your head.  Each element of the ritual circle spins in front of your eyes, incomprehensible yet somehow meaningful.<br />
The circle's energy settles into your mind, making it easier to think analytically.<br />
Ripping pain shoots through your body as the conflicting energies of two invocations discharge uncontrollably!
|sig=Yes
|diff=advanced
|source=quest
|type=augmentation
|ctype=ritual
}}
==Notes==
*Buffs two specific stats selected from these pairings: +Int./+Dis., +Wis./+Cha, or +Ref./+Agi.
*[[Ritual spells]] may require the use of a [[Focus (item)|ritual focus]].
*Uses Enlightened Geometry mana levels to determine the attunement cost.
*Creates a ritual circle in your room which provides a self-only buff to two stats when {{com|invoke}}d. The circle is destroyed when invoked. Only the creator can invoke their own circle.
*The planet used determines which stats are buffed.
:*{{in|Charisma}}/{{in|Wisdom}}: Durgaulda, Yoakena, ''Ismenia'', ''Er'qutra''
:*{{in|Discipline}}/{{in|Intelligence}}: Estrilda, Penhetia, ''Morleena'', ''Amlothi''
:*{{in|Reflex}}/{{in|Agility}}: Verena, Szeldia, Dawgolesh, ''Merewalda'', 
*Invoking a second circle while still under the effects of a previously invoked circle will result in death if the buffs provided are different.
*Invoking a second circle while still under the effects of a previously invoked circle will not result in death if the buffs provided are the same, even if created with different planets.
*{{com|break}} {{tt|circle}} will destroy a circle without invoking it, as will leaving the room. Circles will otherwise last indefinitely until either dispelled or invoked. The spell's duration begins at the moment the circle is invoked.
*Only one circle per caster may exist at any given time, although multiple circles from multiple casters can exist in the same room.
*{{com|focus}}ing on a circle will provide information on which planet it represents, which stats it buffs, and who created it.
*Casting the spell on a planet that is not currently in the sky casts the spell with no effect, but still has the full attunement and concentration costs. Being able to efficiently determine which planets are up is therefore quite important.
:*The non-italicized planets in the list above can be seen with the naked eye, and the most efficient tool to determine which of these are up is simply to {{com|observe}} {{tt|sky}}.
:*The ''italicized'' planets in the list above cannot be seen with the naked eye and thus cannot be seen with {{tt|observe sky}}. The most efficient way to determine if these ones are in the sky is by using {{tt|observe <planet>}} without a telescope, since there is no possibility of roundtime.
:*A [[Front end|StormFront]] script for ascertaining which planets are available by stat can be found [[IOTS (script)|here]].
:*In general, more planets tend to be available around dawn and during the day rather than at night. This is due to the fact the planets closer to the sun than Elanthia (in order from the sun: Verena, Estrilda, Durgaulda, Yoakena and Penhetia) will always be positioned somewhere in the vicinity of the sun in the heavens.
:*The planets further from the sun than Elanthia (in order from the sun: Szeldia, Merewalda, Ismenia, Morleena, Amlothi, Dawgolesh, and Er'qutra) are not related to the sun's position in the sky and so they can appear at any time of the day or night. Because their orbits are much longer than Elanthia's, they do not shift position in the sky very quickly. This effect is more pronounced the farther away from Elanthia they are.
:*This means there can be times at night when the planets you need for the buff you want are not available, and there are even occasionally times at night when there are no planets available at all. This will eventually shift back over time as the planets move, but it can take some time. Usually in the order of weeks due to how slowly the planets move. 
*There's a messaging easter egg when attempting to cast on our own sixth planet of Elanthia.
::''> cast elanthia<br>
::''You're in the wrong frame of reference to call down (up?) the stellar power of Elanthia.''

==Planets==
{| class="wikitable sortable"
|-
| '''Stats''' || '''Planet''' || '''Circle description''' || '''CAST messaging''' || '''INVOKE messaging'''
|-
| [[Charisma]]/[[Wisdom]] || [[Durgaulda]] || a shimmering circle of shade<br>'''LOOK''': A circular patch of shade hangs nearby, looking very much like a cloud shadow.  In addition to lacking the cloud to go with it, the shade's unnatural character is betrayed through a subtle but constant silver shimmer in its depths. || A murky black nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The dark cloud floats gently downward until it settles into a disk-like shape a foot off the ground. ||You step inside the shimmering shade.  You close your eyes and concentrate, allowing the shadows to gradually seep into you.<br>The circle's energy settles into your mind.  Upon reflection, the world doesn't seem nearly as complex as it did a moment ago.
|-
| [[Charisma]]/[[Wisdom]] || [[Yoakena]] || a circle of green vapors<br>'''LOOK''': A circular cloud of vapors hovers about a foot above the ground.  While from a distance it looks like green gas held suspended in the air, upon closer observation it... doesn't look right.  There is no odor, and the circle, upon inspection, seems more translucent than vaporous. || A faint green nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The nebula floats gently downward until it settles into a disk-like shape a foot off the ground. || You step inside the the circle of green vapors.  You close your eyes and concentrate, allowing the vapors to gradually seep into you.<br>The circle's energy settles into your mind.  Upon reflection, the world doesn't seem nearly as complex as it did a moment ago.
|-
| [[Charisma]]/[[Wisdom]] || [[Ismenia]] || a sunlit circle<br>'''LOOK''': A circular band of yellow light, looking for all the world like a turgid sunbeam, hovers about a foot off the ground.  On closer inspection, the circle's resemblance to sunlight falls away: the light is slightly off-colour compared to any variation of the Sun you have seen. || A bright yellow nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The unnatural sunlight floats gently downward until it settles into a disk-like shape a foot off the ground. || You step inside the the disk of turgid sunlight.  You close your eyes and concentrate, allowing the sunlight to gradually seep into you.<br>The circle's energy settles into your mind.  Upon reflection, the world doesn't seem nearly as complex as it did a moment ago.
|-
| [[Charisma]]/[[Wisdom]] || [[Er'qutra]] || a circle of grey dust<br>'''LOOK''': A cloud of grey and black motes is suspended approximately a foot off the ground.  The material within the cloud billows around, but an unseen force seems to contain it within a disk-shaped circle.  On closer examination, what appeared to be dust and grit is nothing so substantial: the motes of the cloud are tiny spheres of colour, seemingly without mass. || A gritty dusk nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The condensed cloud of dust floats gently downward until it settles into a disk-like shape a foot off the ground. || You step inside the the billowing dust cloud.  You close your eyes and concentrate, allowing the dust to gradually seep into you.<br>The circle's energy settles into your mind.  Upon reflection, the world doesn't seem nearly as complex as it did a moment ago.
|-
| [[Discipline]]/[[Intelligence]] || [[Estrilda]] || a green circle of letters<br>'''LOOK''': An unbroken circle of letters slowly spins in the air a foot off the ground.  The letters are written in bright green light, vivid but not hard on the eyes.  They resemble the Common alphabet in a sense, but appear to twist and change as you focus on them. || A lush green nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The light condenses into a broad column as it descends.  The column collapses upon itself a foot off the ground and fades away, leaving behind a circle of unintelligible symbols. || You step inside the circle of curving letters.  The green letters arc up and inward, swirling around your head.  Each element of the ritual circle spins in front of your eyes, incomprehensible yet somehow meaningful.<br>The circle's energy settles into your mind, making it easier to think analytically.
|-
| [[Discipline]]/[[Intelligence]] || [[Penhetia]] || a brown circle of runes<br>'''LOOK''': Three concentric rings of dirt-brown symbols hang suspended a foot off the ground.  The symbols are from no language you recognize, resembling runic script more than anything. || A dusty brown nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The nebula condenses into a broad column as it descends.  The column collapses upon itself a foot off the ground and fades away, leaving behind a circle of unintelligible symbols. || You step inside the concentric rings of blocky symbols.  The brown images arc up and inward, swirling around your head.  Each element of the ritual circle spins in front of your eyes, incomprehensible yet somehow meaningful.<br>The circle's energy settles into your mind, making it easier to think analytically.
|-
| [[Discipline]]/[[Intelligence]] || [[Morleena]] || an orange circle of hieroglyphs<br>'''LOOK''': A ring of hieroglyphs slowly spins in the air a foot off the ground.  Composed out of a steady orange light, the hieroglyphs are clear to see but in no way bright.  The hieroglyphs resemble images of labor and animals, but correspond to no language you recognize. || A warm orange nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The light condenses into a broad column as it descends.  The column collapses upon itself a foot off the ground and fades away, leaving behind a circle of unintelligible symbols. || You step inside the ring of hieroglyphs.  The glowing figures arc up and inward, swirling around your head.  Each element of the ritual circle spins in front of your eyes, incomprehensible yet somehow meaningful.<br>The circle's energy settles into your mind, making it easier to think analytically.
|-
| [[Discipline]]/[[Intelligence]] || [[Amlothi]] || a yellow-green circle of numbers<br>'''LOOK''': Three concentric rings of numbers and mathematical symbols spin in the air a foot off the ground.  Each ring of figures is composed of flickering yellow-green light and the middle ring spins counter to the direction of the outer two.  The numbers and signs are familiar enough, but are somehow impossible to keep track of, perhaps even changing when your eyes are off them. || A yellow-green nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The light condenses into a broad column as it descends.  The column collapses upon itself a foot off the ground and fades away, leaving behind a circle of unintelligible symbols. || You step inside the concentric circles of numbers.  The flickering equations arc up and inward, swirling around your head.  Each element of the ritual circle spins in front of your eyes, incomprehensible yet somehow meaningful.<br>The circle's energy settles into your mind, making it easier to think analytically.
|-
| [[Reflex]]/[[Agility]] || [[Verena]] || a fiery circle<br>'''LOOK''': A rapidly spinning disk of fiery light floats about a foot off the ground.  The light is a bright red-orange which hurts to directly look at, but the flow of the disk resembles more a liquid mass.  A high-pitched keening emanates from the disk as it spins and bits of mass are occasionally thrown off and dissipate into the air. || A red-orange nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The molten light speeds up as it descends, until it resolves into a rapidly churning disk a foot off the ground. || You draw your hand into the molten disk.  Fiery energy races up your arm and into your body with a violent rush!  Within a moment the circle is consumed.<br>The burning energy settles into your body after a few spikes of pain.  You feel much lighter on your feet.
|-
| [[Reflex]]/[[Agility]] || [[Szeldia]] || an unstable monochromatic circle<br>'''LOOK''': A disk made of equal amounts vivid white light and unnatural shadow spins a foot off the ground.  In addition to its rapid spin, the two masses within the disk flow back and forth against each other, causing the disk to dip and wobble perilously.  A high-pitched keening emanates from the disk as it spins. || A black and white nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The nebula speeds up as it descends, until it resolves into a rapidly churning disk a foot off the ground. || You draw your hand into the unstable disk.  Light and shadows race up your arm and into your body with a violent rush!  Within a moment the circle is consumed.<br>The burning energy settles into your body after a few spikes of pain.  You feel much lighter on your feet.
|-
| [[Reflex]]/[[Agility]] || [[Merewalda]] || a churning blue circle<br>'''LOOK''': A deep blue disk violently spins about a foot off the ground.  By some bizarre perceptual twist, the disk maintains a dark blue colour while somehow producing so much luminescence that it hurts to stare at directly.  A high-pitched keening emanates from the disk as it spins and bits of mass are occasionally thrown off, to dissipate in the air. || A deep blue nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The harsh light speeds up as it descends, until it resolves into a rapidly churning disk a foot off the ground. || You draw your hand into the strangely bright disk.  A fluid torrent of energy races up your arm and into your body with a violent rush!  Within a moment the circle is consumed.<br>The burning energy settles into your body after a few spikes of pain.  You feel much lighter on your feet.
|-
| [[Reflex]]/[[Agility]] || [[Dawgolesh]] || a blinding white circle<br>'''LOOK''': It is impossible to get a good look at the disk, due to the unrelenting presence of blinding white light.  You detect hints of movement underneath the glare and hear a constant sizzling tone, but you can feel neither air movement or heat. || A stark white nebula forms high in the sky.  Currents spin within the nebula as it condenses and descends toward you.<br>The searing light speeds up as it descends, until it resolves into a rapidly churning disk a foot off the ground. || You draw your hand into the blinding mass of light.  The light races up your arm and into your body with a violent rush!  Within a moment the circle is consumed.<br>The burning energy settles into your body after a few spikes of pain.  You feel much lighter on your feet.
|-
|}

==Known Invocation Integration Levels==
*Haphazardly
*Badly
*Poorly
*Decently
*Well
*Skillfully
*Masterfully
*Perfectly

==Trivia==
*Used to be known as [[Invocation of Energy]] which was based on the moons instead of the planets.
{{RefAl}}