// Adapter-only progression semantics. Production guild requirements are authoritative.
import {circleRequirements} from '../data/guilds.js';
import {requirementPotential} from './circle_reward.mjs';

export const CURRICULUM_VERSION = 'earned-circles-2-through-20/1';

export function validateTarget(target) {
  if (!Number.isInteger(target) || target < 2 || target > 20) throw new Error('Target circle must be 2..20');
  return target;
}

export function nextGate(circle, target) {
  validateTarget(target);
  if (!Number.isInteger(circle) || circle < 1 || circle > target) throw new Error('Unknown earned circle');
  return Math.min(target, circle + 1);
}

export function gateSnapshot(guild, skills, circle, target) {
  const gate = nextGate(circle, target);
  const requirements = circleRequirements(guild, skills, gate);
  if (!requirements.rows?.length) throw new Error('Unknown guild requirements');
  return {gate, requirements, potential: requirementPotential(requirements.rows, skills)};
}

// Evaluate both skill snapshots against the SAME pre-action gate. Opening a
// harder gate must not turn an earned circle into a negative shaping event.
// A time cost is opt-in and separately recorded; default preserves no time cost.
export function progressionReward({guild, beforeSkills, afterSkills, beforeCircle,
  afterCircle, target, dead, elapsedSeconds, timeCostPerHour = 0}) {
  const before = gateSnapshot(guild, beforeSkills, beforeCircle, target);
  if (!Number.isInteger(afterCircle) || afterCircle < beforeCircle || afterCircle > target || afterCircle > beforeCircle + 1) {
    throw new Error('Invalid earned-circle transition');
  }
  if (typeof dead !== 'boolean' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0
      || !Number.isFinite(timeCostPerHour) || timeCostPerHour < 0 || timeCostPerHour > 1) {
    throw new Error('Unknown transition cost');
  }
  const afterRequirements = circleRequirements(guild, afterSkills, before.gate);
  if (afterCircle > beforeCircle && !afterRequirements.ok) throw new Error('Earned circle lacks requirement evidence');
  const progress = (requirementPotential(afterRequirements.rows, afterSkills) - before.potential) * .25;
  const circleBonus = afterCircle > beforeCircle ? 1 : 0;
  const timeCost = timeCostPerHour * elapsedSeconds / 3600;
  return {reward: dead ? -1 : Math.max(-1, Math.min(1, progress + circleBonus - timeCost)),
    progress, circle_bonus: circleBonus, time_cost: timeCost, gate: before.gate};
}
