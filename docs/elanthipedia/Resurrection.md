# Resurrection

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=rezz
|minprep=5
|castcap=50
|minskill=80
|maxskill=800
|validtarget=PC
|guild=Cleric
|magic=Holy Magic
|spellbook=Divine Intervention
|prereqs=Circle 30, [[Soul Bonding]], [[Vigil]], [[Resurrection_quest|Quest]], and the [[Infusion ability]]
|slot=1
|pulse=18
|illegal=none
|corrupt=none
|desc=The Resurrection spell is but one of the greatest gifts the Immortals may grant a Cleric.  Once a soul is bonded to its body, this spell will return the body to life.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=Brings a dead player back to life.
|messaging=A pale blue nimbus explodes outward, enshrouding your body like a ghostly blanket. Slender tendrils of silver vapor slowly arise from the cloud and reach for your eyes like long spectral fingers.<br /> 
The last of the silvery vapors enter your eyes, tinting your vision with a pale blue light.  Adjusting to your new sight, you begin to see the faint spirits of all living beings around you.  You prepare to look for the lost spirits of the dead.<br />

The supernatural sight granted to you fades, returning your vision to normal.
|sig=Yes
|diff=intermediate
|source=quest
|type=utility
|ctype=cyclic
}}
{{RTOC}}
*This spell is learned through completion of a quest ([[Resurrection Quest|spoiler]]).

==Usage==
The basic steps to raising a corpse:

# {{com|perceive}} {{tt|<body>}}
#* Make sure they have at least one [[Favor]].
#* If they are going to be forced to depart soon (a few minutes or less), cast [[Vigil]] on them.
# Prepare the body by casting [[Rejuvenation]] until they are surrounded by a silver nimbus.
# {{com|prepare}} {{tt|rezz}} and {{com|cast}} it.
# {{com|harness}} {{tt|<amount of mana>}} (the amount must be less than or equal to the amount of mana you cast Resurrection at)
#* Clerics with at least 541 [[Attunement skill|Attunement]] and [[Persistence of Mana]] active can skip the {{com|harness}} step. Without POM active, the cleric will need 600 Attunement. See [[Infusion_ability#Practices_of_harness_infusion|harness infusion]] for more detail.
# {{com|infuse}} {{tt|rezz <amount of mana>}}
# Repeat steps 4 and 5 until you can see the spirit in the Void.
# Cast [[Soul Bonding]] on the body. This can be snap cast at minimum mana.
# Do one more infusion at this point to ensure the body has silver memories, if not, cast Rejuvenation again.
# {{com|gesture}} {{tt|<body>}}

==Notes==
* If the body died from a spirit death (loss of spirit), you will be unable to find their depleted spirit in the Void.
* Using Resurrection requires a [[devotion]] level of at least slightly above "After a moment, you sense that your efforts have not gone unnoticed."
* You must continuously infuse mana into this spell. After a short period of time the infused amount will begin to drop rapidly, though it will not go back to 0. You will have enough time to cast a fully prepared Rejuvenation without losing infused mana, but not much more.
* When raised by this spell, the target has a chance to keep a memorized spell scroll and will retain some field experience. The chance of retaining and amount of field experience kept is based on the target's favors.
* It is very helpful to have both the Raw Channeling and Dedicated Cambrinth Use [[Magical feats|feats]]. This is so that you can {{com|invoke}} {{tt|<cambrinth> cyclic}} to power the cyclic portion of Resurrection while the [[Infusion ability|infusion]] will draw from your Attunement. The Raw Channeling will keep you from taking nerve damage from holding having to hold mana for the cyclic and from losing the infusion if you run out of mana held in the cambrinth.
* The amount of mana needed to be infused before you find a corpse is based on the target's circle and number of favors. This will range from about 60 to over 1000 mana.
* A small amount of infusion now happens passively on each cyclic pulse, although it will speed things up greatly to continue manually infusing as before. This is simply an aid for overcoming any attunement issues that might arise.
* The roundtime on Harnessing and Infusing is reduced by your [[Attunement skill]], to a minimum of 2 seconds.
* Max infusion is directly related to the amount of mana that the spell is cast at. If you cast the spell at cap the most you can infuse is 50 regardless of skill.
* May rarely grant the raising cleric a favor. The cleric will receive the following messaging: "A warm glow envelops you briefly.  You sense the Immortals are pleased with your selfless aid to the dead."

==Decay Messaging==
===On perceive===
* His body will decay in about a half hour.
* His body will decay in less than a half hour.
* His body will decay in several minutes.
* His body will decay in a few minutes!
* His body will decay in about a minute!

===Visible to room===
* Person's body grows paler as the blood drains away from the skin.
* Person's body grows paler as the last of its blood pools within.
* Person's body seems to shrivel slightly.
* Person's body appears to grow rigid.
* Person's body appears to dim, like a candle growing weaker.
* Person's body's appearance takes on a strikingly dark look.

{{RefAl}}