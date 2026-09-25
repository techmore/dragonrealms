// Reward shaping only. The production circle gate still checks integer ranks.
import { expToNextRank } from '../data/skills.js';

export const CIRCLE_REWARD_VERSION = 'circle2-absorbed-fraction/2';

export function requirementPotential(rows, skills) {
  return rows.reduce((sum, row) => {
    if (!Number.isFinite(row.need) || row.need <= 0 || !row.eligible?.length) {
      throw new Error('Unknown reward requirement');
    }
    const nth = row.eligible.length === 1 ? 1 : Number(/^(\d+)(?:st|nd|rd|th) /.exec(row.label)?.[1]);
    if (!Number.isInteger(nth) || nth < 1 || nth > row.eligible.length) {
      throw new Error('Unknown ranked requirement');
    }
    const ranks = row.eligible.map(id => {
      const skill = skills[id] ?? {rank:0, exp:0};
      if (!Number.isInteger(skill.rank) || skill.rank < 0 || !Number.isFinite(skill.exp) || skill.exp < 0) {
        throw new Error('Unknown reward skill state');
      }
      // Absorbed EXP only: pooled EXP earns nothing until the game drains it.
      return skill.rank + Math.min(1, skill.exp / expToNextRank(skill.rank));
    }).sort((a,b) => b-a);
    return sum + Math.min(1, ranks[nth-1] / row.need);
  }, 0);
}
