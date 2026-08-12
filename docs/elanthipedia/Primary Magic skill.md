# Primary Magic skill

_Automatically mirrored from Elanthipedia (2026-08-12)._

The '''Primary Magic [[page type is::skill]]''' (also known as '''PM''' or simply '''Primary''') is a [[magic skillset|magic skill]] that partly determines how many mana streams you can put into a [[Spells|spell]] without backfiring, when casting any [[:Category:Analogous_Patterns_Spellbook|Analogous Patterns spell]] or a spell of your [[:Category:Magic Types|magic type]]. Ironically, the Primary Magic skill is of secondary importance, compared to the specific magic skills ({{skill|Augmentation}}, {{skill|Debilitation}}, {{skill|Targeted Magic}}, {{skill|Utility}}, and {{skill|Warding}}); the effective casting level is a weighted average of Primary Magic and the specific magic skill, with Primary Magic counting only one-fourth as much as the specific skill (see formulas, below).  For most magic users, Primary Magic effectively provides a small bonus to the specific magic skills. 
Primary Magic is replaced by {{skill|Sorcery}} when casting [[:Category:Sorcerous Magic|Sorcery]] or a spell not of your magic type.

Your magic type and the corresponding name of your Primary Magic skill is different depending on your [[guild]].

{|class="wikitable sortable"
|-
!Guild!!Skill Name!![[Mana]] Type
|-
|[[Barbarian]]||Inner Fire||None
|-
|[[Bard]]||Elemental Magic||Elemental
|-
|[[Cleric]]||Holy Magic||Holy
|-
|[[Empath]]||Life Magic||Life
|-
|[[Moon Mage]]||Lunar Magic||Lunar
|-
|[[Necromancer]]||Arcane Magic||Necromantic
|-
|[[Paladin]]||Holy Magic||Holy
|-
|[[Ranger]]||Life Magic||Life
|-
|[[Thief]]||Inner Magic||None
|-
|[[Trader]]||Lunar Magic||Lunar
|-
|[[Warrior Mage]]||Elemental Magic|||Elemental
|}

Outside teaching issues, the skill works the same for most guilds (Barbarians being the exception).

==Spells and abilities that boost Primary Magic==
{{#ask:[[Boosts::Primary Magic skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Spells and abilities that decrease Primary Magic==
{{#ask:[[Debuffs::Primary Magic skill]]
|?guild association is
|format=ul
|headers=hide
|default=None
}}

==Teaching==
Attempting to teach someone using a different form of skill, such as a Lunar Magic caster teaching an Elemental Magic user, will result instead in the learning of the [[Sorcery skill]]. Teaching within mana types will teach the skill, even if the teacher and student are different guilds, such as a Bard teaching a Warrior Mage.

Magic users cannot teach this skill to non-magic users.

==Training==
In general, PM is learned best from casting higher tier (thus more difficult) spells without full preparation, especially when straining your ability (i.e. near backfiring).

==Casting Formula==
Reverse engineering has been performed on years of game data and determined that there are two formulas in place for this mastery skill.  In these formulas, the Primary Magic skill is represented by "PM," and the applicable specific magic skill is represented by "SMS."  These are base formulas, and do not account for any bonuses the character may have in effect, such as from feats or from other spells.  Note that every spell falls into at least one of the specific magic skill categories; most use exactly one, but for any spell that uses more than one the caster's effective level will be calculated using the skill in which they have the fewest ranks, to reflect that competence in all specific magic skills is required to cast that spell.  Casting will teach mainly that SMS, with a modicum of experience for any other SMS used by the spell.

Normally, the formula for your effective casting ranks is (PM+(SMS*4))/5, which can also be written as 0.2*PM + 0.8*SMS.  It can also be described as 20% of your Primary Magic plus 80% of your specific magic skill, or a weighted average with the specific magic skill counting four times as much.  However, effective casting ranks are capped at 130% of your Primary Magic skill; in the event that your specific magic skill is greater than 1.38 times your PM, which using the default formula would produce values great than 130% of PM, the effective casting ranks are instead just set equal to PM*1.3.

Most magic users will have at least as many ranks in PM as in their highest specific magic skill, because training a specific skill usually also trains PM.  So PM will normally provide a small boost to a specific magic skill when casting.  In particular, since even magic primary guilds can advance indefinitely while leaving at least one specific magic skill untrained, this enables a high-circle character to pick up a new spell for an untrained specific magic skill and start using it modestly, without having to backtrack to training methods for absolute beginners.  In contrast, most magic users will have lower Sorcery skill ranks than their other magic skills, so the same mechanic will prevent them from gaining the full benefits of their skill ranks in the specific magic skills when casting sorcerously, even before the additional difficulty level of sorcerous casting is considered.

==Inner Magic==

Inner Magic does a few things for Thieves.  It determines how many khri you can start simultaneously, it determines the reuse timer on Khri, it determines when non-premium subscribers get their second bonus spell slot, and it acts as a mastery skill.<ref>Per [[Javac]] on [https://discord.com/channels/619301383451181075/619330375562428463/968936162196586606 Discord].</ref>

==Inner Fire==
IF skill works differently for Barbarians than other guilds.  It's not a mastery that increases your skill in Util/Warding/Aug.  For Barbarians, the Inner Fire skill reduces the cost of your abilities.<ref>Per [[Javac]] on [https://discord.com/channels/619301383451181075/619330237418831917/941206194347974686 Discord].</ref>

{{RefAl|a=y}}
{{cat|Magic skillset,Skills}}