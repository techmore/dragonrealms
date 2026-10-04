// Suggestions, not automated progression. Facts come from the server snapshot;
// never infer a completed milestone from EXP blips or scripted activity.
export function journeyHint(journey, requirements) {
  if (!journey || !Number.isSafeInteger(journey.characterId)) return null;
  if (journey.inCombat) return { text: 'You are in combat. Check range and roundtime before acting; retreat if the fight is unsafe.', commands: ['assess', 'help combat'] };
  if (journey.maxHp > 0 && journey.hp < journey.maxHp / 2) return { text: 'Recover before another encounter. Rest when safe, or ask for directions to the healer.', commands: ['health', 'dir healer'] };
  if (!journey.guildId) return { text: 'Explore the guilds before choosing. Ask for directions to a guild, walk to its hall, then JOIN <guild> there.', commands: ['dir list guilds', 'help join'] };
  const rows = Array.isArray(requirements?.rows) ? requirements.rows.filter(r => r && Number.isFinite(r.have) && Number.isFinite(r.need)) : [];
  const gaps = rows.filter(r => r.have < r.need);
  if (rows.length && !gaps.length) return { text: `The reported requirements for circle ${requirements.circle} are met. Visit your guild hall and ask to circle.`, commands: [`dir ${journey.guildId}`, 'exp'] };
  const gap = gaps.slice().sort((a, b) => b.need - b.have - (a.need - a.have))[0];
  return {
    text: gap ? `Next circle: ${gap.label} needs ${gap.need - gap.have} more ranks (${gap.have}/${gap.need}). Field EXP is learning in progress, not earned ranks. Check guild training and practice options; combat is not every guild's path.`
      : 'Check your guild requirements and equipment, then choose a suitable training or practice route. Learning converts to ranks over time.',
    commands: ['exp', 'inventory', `dir ${journey.guildId}`],
  };
}
