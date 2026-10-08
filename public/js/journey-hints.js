// Suggestions, not automated progression. Facts come from the server snapshot;
// never infer a completed milestone from EXP blips or scripted activity.
export function journeyHint(journey, requirements) {
  if (!journey || !Number.isSafeInteger(journey.characterId)) return null;
  if (journey.inCombat) return { text: 'You are in combat. Check range and roundtime before acting; retreat if the fight is unsafe.', commands: ['assess', 'help combat'] };
  if (journey.maxHp > 0 && journey.hp < journey.maxHp / 2) return { text: 'Recover before another encounter. Rest when safe, or head to the temple to recover.', commands: ['health', 'dir temple'] };
  if (!journey.guildId) return { text: 'Explore the guilds before choosing. Ask for directions to a guild, walk to its hall, then JOIN <guild> there.', commands: ['dir list guilds', 'help join'] };
  const guildDirections = typeof journey.guildDirections === 'string' && /^dir (?:guilds|[a-z]+)$/.test(journey.guildDirections)
    ? journey.guildDirections : `dir ${journey.guildId}`;
  const reportedRows = Array.isArray(requirements?.rows) ? requirements.rows : [];
  const rows = reportedRows.filter(r => r && Number.isFinite(r.have) && Number.isFinite(r.need) && r.have >= 0 && r.need >= 0);
  const gaps = rows.filter(r => r.have < r.need);
  const ranksMet = rows.length > 0 && rows.length === reportedRows.length && !gaps.length
    && Number.isSafeInteger(requirements.circle) && requirements.circle > 0;
  if (ranksMet && journey.guildId === 'paladin') {
    if (!Number.isFinite(journey.soul)) return {
      text: 'Your reported rank requirements are met. Check progress to verify your soul before visiting the Paladin guild hall to circle.',
      commands: ['progress', guildDirections],
    };
    if (journey.soul < 20) return {
      text: `Your rank requirements are met, but your soul is too dim to advance (${journey.soul}/20). Pray at the temple, or restore your honor by slaying the undead.`,
      commands: ['progress', 'dir temple'],
    };
  }
  if (ranksMet) return { text: `The reported requirements for circle ${requirements.circle} are met. Visit your guild hall and ask to circle.`, commands: [guildDirections, 'progress'] };
  const gap = gaps.slice().sort((a, b) => b.need - b.have - (a.need - a.have))[0];
  return {
    text: gap ? `Next circle: ${gap.label || 'A requirement'} needs ${gap.need - gap.have} more ranks (${gap.have}/${gap.need}). Field EXP is learning in progress, not earned ranks. Progress lists practice choices and guild training options; combat is not every guild's path.`
      : 'Check progress for your guild requirements and practice choices, then choose a suitable training route. Learning converts to ranks over time.',
    commands: ['progress', 'inventory', guildDirections],
  };
}
