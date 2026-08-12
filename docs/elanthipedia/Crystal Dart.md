# Crystal Dart

_Automatically mirrored from Elanthipedia (2026-08-12)._

{{Spell
|abbrev=CRD
|minprep=2
|castcap=50
|minskill=10
|maxskill=600
|minduration=-
|validtarget=PC, Creature
|guild=Trader
|magic=Lunar Magic
|spellbook=Fabrication
|prereqs=[[Trabe Chalice]]
|slot=1
|illegal=no
|corrupt=no
|desc=One of the simplest manifestations of crauyarin at a lunar mage’s disposal, the Crystal Dart spell summons a short-lived spike of milky red crystal and flings it at a chosen target.  The crauyarin requires direct starlight or bright moonlight to properly coalesce otherwise, the caster must expend starlight aura to fuel its creation.  This simple fabrication is quite inefficient, however, and produces a cloud of crauyarin residue for a brief time that can be used to form darts in leu of the starlight aura.
|buffs=No buffs
|debuffs=No debuffs
|dtype=Puncture damage, Slice damage
|htype=No heal
|poststring=No
|messaging=You mold a minute amount of the available moonlight into a tiny crauyarin dart and mentally flick it towards a ship's rat!<br />
The crystalline dart rebounds off the ship's rat's chest, a little pinprick marking where the projectile struck.<br />
Roundtime: 1 sec.
|sig=No
|diff=basic
|source=standard
|type=targeted
|ctype=battle
}}
*Requires starlight, starlight aura, or bright moon. Unlike other spells that require a bright moon, this spell can make use of a cloud obscured moon. [[Trader spell requirement is::starlightaurabrightmoon| ]]

 For two minutes after a CRD cast, minimum preps of CRD in that room will not cost aura even in adverse conditions. One mana point over min prep and the current cost scheme applies. You will be messaged about the free cast if you benefit from it, but not in cases where you wouldn't have to spend aura to begin with.
 
 Note that this grace period is not refreshed on each cast, it can only be reapplied to the room after the initial two minutes are up. What this means is that you'll still spend aura over time casting CRD in adverse conditions, but you should see its cost drastically reduced when used for learning.
 
 You can now detect the residue cloud in a room with PERC. The spell now messages correctly if your dart is created from residue, and there is messaging to note if you have access to a residue cloud but are casting too powerfully to make use of it.
 
 The residue cloud now has a density directly related to the Integrity of the cast that created it. The more dense/higher integrity the cloud has, the more mana you can stuff into Crystal Dart without having to spend aura in adverse conditions. This isn't a 1:1 calculation between Potency and Integrity, but it's pretty generous.
 
 Like before, you only default to the cloud if the only other option is to spend aura. Unlike before, a higher Integrity cast will override an existing cloud without making you wait until the existing one is gone.

*[[Enrichment]] grants a large damage bonus to the next Crystal Dart cast, after which the bonus will recharge over a minute as long as Enrichment is up.

{{RefAl}}