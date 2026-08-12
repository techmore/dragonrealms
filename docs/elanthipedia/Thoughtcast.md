# Thoughtcast

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=th
|minprep=15
|castcap=100
|minskill=80
|maxskill=800
|minduration=30
|maxduration=90
|validtarget=Self, PC
|guild=Moon Mage
|magic=Lunar Magic
|spellbook=Psychic Projection
|prereqs=[[Sleep]] or [[Psychic Shield]]
|slot=2
|illegal=no
|corrupt=no
|desc=Thoughtcast allows the caster to contact another person with a single ESP message.  A Seer's Sense link can reduce the difficulty of this task.  If that person has a Seer's Sense link with others, the message may cascade to them as well.

If cast on yourself, the spell instead heightens your sensitivity to psychic waves, allowing you to communicate as though you are using gwethdesuans.  It is unadvisable to do this while wearing gwethdesuans, or putting them on while the spell is in effect, as the magics may nullify each other.
|buffs=No buffs
|debuffs=No debuffs
|dtype=No damage
|htype=No heal
|poststring=No
|effect=sends thought to target, connects to gweth network
|messaging='''Sending a Thought:'''<br />
You focus your mind on sending a message to <target>.

You hear <caster>'s loud thoughts in your head <saying/asking>, "message<?>" 

'''Self Cast:'''<br />
You gesture.<br />
Your mind is joined by foreign thoughts playing against a background of melodic whispers.
|sig=No
|diff=intermediate
|source=standard
|type=utility
|ctype=standard
}}
==Syntax==
*{{com|CAST}} <your character's name> (while not wearing gweths): Your mind is joined by foreign thoughts playing against a background of melodic whispers. 
: You join the gwethdesuan network as though you were wearing gweths for the duration of the spell
*{{com|CAST}} <your character's name> (wear wearing gweths): Your spell fires, but some kind of psychic interference prevents it from having an effect.
: The spell fails because the gwethdesuan enchantment interferes with the spell pattern. For the duration of the spell you won't be able to wear gwethdesuans.
*{{com|CAST}} <target/another character's name> <your message>: You focus your mind on sending a message to <person>, "message" 
: Sends a psychic message to your target
*{{com|RELEASE}} <thoughtcast>: The melodic whispers recede as your mind goes quiet. 
: Releases the spell pattern so you can once again wear gwethdesuans

==Notes==
*Sends private telepathic messages to other characters. The further away the recipient is, the more mana is required. 
*For 60 seconds following a successful Thoughtcast to another player both the caster and recipient are linked to the [[Item:Albredine crystal ring|albredine crystal ring]] network and can use {{com|SEND}} {{tt|<player> <message>}} to communicate with anyone connected to that network as many times as they are able to.
*Use the {{com|ESP}} command to turn on any gwethdesuan channels that you want to listen to after casting Thoughtcast.
*An active [[Seer's Sense]] link will reduce the amount of mana required to cast over distances.
*More difficult to cast if you have a Seers Sense link active on a third party.
*Casting on someone who has an active Seer's Sense link with someone else will cause that thought to cascade to them. It will not cascade any further than this one additional step.
*Self cast will give access to the gwethdesuan network.
*When the victim of a successful [[Gwethsmasher|gwethsmashing]], you will be disconnected from the gwethdesuan network and will be unable to recast Thoughtcast for one real life hour.

{{RefAl|p=y}}