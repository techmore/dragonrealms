// Shared production prices and lesson size; importing this policy never opens DB.
import { expToNextRank } from '../data/skills.js';

export const MAX_STAT = 100;
export const RANK_CAP = 1750;
export const STAT_NAMES = ['str', 'con', 'ref', 'agi', 'cha', 'dis', 'wis', 'int'];
export function statRaiseCost(current) {
  return Math.max(10, Math.floor(current * 0.6));
}
export const skillLessonCost = rank => 40 + rank * 20;
export const skillLessonExp = rank => Math.floor(expToNextRank(rank) * 0.4);
