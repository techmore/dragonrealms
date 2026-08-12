# Starlight Sphere

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|name=Starlight Sphere
|abbrev=sls
|minprep=6
|castcap=33
|minskill=250
|maxskill=1000
|validtarget=Special
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Stellar Magic
|prereqs=Circle 40, either [[Burn]] or [[Dinazen Olkar]], and a [[Starlight Sphere quest|quest]]
|slot=1
|pulse=8 to 12
|illegal=no
|corrupt=no
|desc=The Starlight Sphere spell harnesses the distant, cold energy of the stars to create a sphere of stellar magic that can be directed by the caster towards an enemy.  This spell can only be cast during the night and must be anchored by a constellation.
|buffs=No buffs
|debuffs=No debuffs
|dtype=Impact damage, Cold damage
|htype=No heal
|poststring=No
|effect=pulsing single target.
|messaging='''Cast:'''<br>Several motes of light gather, briefly forming a minute version of the constellation of ''<constellation>'' before collapsing into a ''<adjective>'' ''<color>'' sphere.<br>

'''Attacking:'''<br>
The air takes on a sudden chill as a ''<adjective>'' ''<color>'' sphere flares and rushes at a ''<target>''!<br>

A ''<target>'' stops suddenly, frozen in place by the flash of icy light, but only for a moment -- a flurry of activity follows as bones, flesh, and blood all snap, crackle, and rearrange themselves under the stress of the frigid starlight.<br>

The air takes on a sudden chill as a ''<adjective>'' ''<color>'' sphere flares and rushes at a ''<target>''!<br>

The ''<target>'' stares blankly as the flesh on its right leg crystallizes instantly and falls away in icy sloops.  A skeletal appendage dangles there for a moment before it, too, shatters into frosted splinters.
|sig=Yes
|diff=advanced
|source=quest
|type=targeted
|ctype=battle, cyclic
}}
{{RTOC}}

==Usage==
*{{com|CAST}} {{tt|<constellation>}}  (cast against a constellation that is visible with OBSERVE SKY)
*{{com|POINT}} {{tt|<target>}} 
*{{com|POINT}} {{tt|sphere at <target>}}
:Both commands force sphere engagement with your target. Using the former command avoids confusion when other moon mages' spheres are in the room.

*{{com|RELEASE}} {{tt|SLS}}: To release the spell pattern.

==Notes==
===General===
*Auto-engages any target that advances on you.
*Uses Moonlight Manipulation mana level to determine attunement cost.
*As with all cyclic spells, the power is determined by the amount of mana it is prepared at and cannot be increased by harnessing mana or using cambrinth. Those instead act as a fuel source with the spell draining mana from cambrinth first, followed by held mana, and finally directly from your attunement if the Raw Channelling feat is known.
*The constellation used will determine both the [http://www.olwydd.org/guilds/moonmage/sls.php color] and the pulse speed of your sphere. Increased pulse rate translates to an increased attack rate and attunement cost.
:* [[Star Chart|Constellations]] which fill the Offense prediction pool will speed up the pulse rate and mana drain. (~8 seconds per pulse)
:* [[Star Chart|Constellations]] which fill the Defense prediction pool will slow down the pulse rate and mana drain. (~12 seconds per pulse)
:* [[Star Chart|Constellations]] which fill neither the Offense or Defense prediction pools will have the standard pulse rate and mana drain. (~10 seconds per pulse)
*The descriptive adjective varies from caster to caster and is not able to be changed.
*:Possible adjectives: flaring, glimmering, glittering, glowing, pulsating, shimmering, shining, sparkling, translucent, twinkling.
*Holding a {{ilink|i|Glowing iron fragment}} in your hands at cast will reduce the mana cost of each cylic pulse, but the potency will be unchanged. In fact, tests indicate a potential 10-15% dmg loss from using the fragment.
*Mana costs will decrease significantly when the sphere is idling outside of combat.
:*E.g. at 15 mana the sphere will act as a 3-4 mana sphere for purposes of determining mana cost while out of combat.
:*Pulses within combat where the sphere doesn't attack (i.e. it faces a new target or advances towards them) will cost the full amount of attunement, not the reduced amount.
* Successfully able to cast on a moon mage with 100 TM, 700 primary magic,700 astrology, 100 int, 100 wis, and 70 disc. Likely requires fewer stats and may have a lower cast requirement. 

===Limitations===
*Can only be cast at night (works at least as early as "early evening"). The sphere will dissipate the moment the sun rises.

===Tips on Maintenance===
This spell has a particularly high attunement cost, and so can be challenging to maintain. The following are some tips to help mitigate and manage these costs.
*TM learning is primarily based on the difficulty of the creature you are hunting, and the mana put into the spell only acts as a modifier to this. As such, don't worry about not being able to maintain this spell at or near your personal cap. Casting it with a lower amount, even minimum prep, is just fine. Especially if you cannot maintain it at higher amounts.
*Use a constellation linked to Defense to slow down your pulse rate. This will slow down your attack rate in addition to the rate of mana drain, but that is a moot point if you cannot maintain the attunement cost at the higher rate of drain.
:*Good options are the Giant and the Magpie because these are available year round.
*Raw Channelling is required if you don't want to constantly maintain your sphere by charging cambrinth or harnessing mana. Be aware, however, that this means you are casting the full prep amount in one go every pulse and the attunement cost for this can be quite prohibitive.
*At lower ranks or on low mana days, using cambrinth or held mana will probably be required to maintain a sphere for any length of time.
:*Break up the mana cost into parts and charge your cambrinth or harness mana multiple times per pulse. E.g. if you prepared it at 15 mana, then charge your cambrinth 3 times per pulse with 5 mana each time, or twice per pulse with 8 mana.
:*The main disadvantage to this is that you will likely not be able to do very much but maintain your sphere due to the roundtimes. Using held mana can also lead to damaged nerves.
:*Note: You only have to invoke the cambrinth once as long as it doesn't drain completely, but be aware that the link will eventually fade after 5 to 10 minutes regardless so be prepared to re-invoke it or you will lose your sphere.
*You can combine the cambrinth and Raw Channelling methods by using {{com|invoke}} {{tt|<cambrinth> <#>}} to only drain a limited amount from the cambrinth each pulse.
:*E.g. if you prepared it with 15 mana, you could invoke your cambrinth with a limit of 5 mana and then you only need to charge your cambrinth once per pulse with 5 mana and would only have to provide 10 mana per pulse through Raw Channelling rather than the full 15. <br/>

*Useful [[Magical feats]]:
:*Raw channelling: This allows you to fuel the sphere directly from your attunement making it set and forget. Also useful for Moongate and especially Steps of Vuan, so it is worth getting even if you don't want to use it for this spell. Attunement costs will be higher by using the set and forget method, but knowing this feat doesn't preclude you from using the cambrinth or held mana methods so don't let that be a deterrent to choosing this.
:*Dedicated Cambrinth Use: This allows you to set cambrinth to only work for cyclic spells or only for standard spells. This is useful in two ways:
::*If you know Raw Channelling and are maintaining directly from your attunement you can {{com|invoke}} {{tt|<cambrinth> spell}} to prevent your sphere from using the cambrinth. Without this it becomes hard to boost standard spells with cambrinth because the cyclic drains it before you can cast the spell.
::*If you are using cambrinth to fuel your sphere then you can {{com|invoke}} {{tt|<cambrinth> cyclic}} to prevent standard spells from using the mana stored in your cambrinth. This is useful so that you can still cast standard spells without draining your sphere's resource.
::*If you are combining both cambrinth and Raw Channelling to maintain your sphere via setting a limit on cambrinth drain then you can use {{com|invoke}} {{tt|<cambrinth> <#> cyclic}} to set your cambrinth to only drain a specific amount and still let you cast standard spells without draining your sphere's resource.
:*Deep Attunement: This improves your natural attunement regeneration rate. This will help a lot with being able to maintain a sphere, and is useful for any high cost spell casting situation. Worth getting for multiple reasons.
:*Efficient Channelling: This reduces your cyclic spell attunement costs by 10%. Very useful for this spell if you know Raw Channelling. This is much more focused than Deep Attunement so you won't get much benefit from it except with this spell, since the other cyclic spells Moon Mages have are not attunement intensive. Still very useful to have if you want to use SLS with any frequency.
:*Efficient Harnessing: This reduces attunement costs for casting spells. This will help with being able to maintain your sphere, and is useful for any spell casting situation. Worth getting for multiple reasons. <br/>

*Useful spells:
:*[[Aura Sight]]: The buff to {{skill|attunement}} will reduce attunement costs. Always have this up while using a sphere.
:*[[Shadowling]]: The extra attunement regeneration provided by a shadowling is significant and a must have for using a sphere. It is up to you whether you want to {{com|invoke}} your shadowling or not, since there are advantages either way. Because the sphere can only be used at night, you can easily use a single cast of an un-invoked shadowling to last a very long time. Invoking it, however, provides mobility.
:*[[Blessing of the Fae]]: This spell works like a shadowling to provide additional attunement regeneration. This is a signature cyclic Bard spell, so you can only receive its effects from a Bard who remains in the same room as you. If you hunt with a Bard, make sure to ask them to use this.

===Movement Messages===
* A ''<adjective>'' ''<color>'' sphere drifts in with a hiss, following you.
* A ''<adjective>'' ''<color>'' sphere crackles with luminescence, its previous target unavailable.
* A ''<adjective>'' ''<color>'' buoys above your head like a guardian star, appearing nigh-erased by the sunlight.
* An aura of what feels like frozen light radiates from a ''<adjective>'' ''<color>'' sphere.
*''The <color> sphere begins to move ominously towards <target>. -'''missile range'''''
*''A <adjective> <color> sphere drifts closer to <target>. -'''pole range'''''
*''A <adjective> <color> sphere drifts very close to <target>. -'''melee range'''''
*''A <adjective> <color> sphere suddenly flares with a cold light and vaporizes!''

===Sphere Description===
*{{com|LOOK}} sphere
: The sphere is a nearly translucent globe of light only two fingers in width.
: Sparkling with brilliant red shades of color, it leaves a barely noticeable trail of frost hanging delicately in the air when it moves.
: It is currently not attempting to attack anyone.
: This sphere was created by you.
: [POINT at a target to direct the sphere to attack it.]
{{RefAl}}