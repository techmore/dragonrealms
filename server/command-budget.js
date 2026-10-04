// Shared transport policy: charge actual command executions, including alias
// expansion, instead of letting one frame buy an arbitrary number of actions.
export const COMMANDS_PER_SECOND = 20;
export const MAX_COMMAND_LENGTH = 4096;
export const MAX_COMMANDS_PER_INPUT = 20;

export function consumeCommandBudget(owner, now = Date.now()) {
  const recent = (owner.commandTimes || []).filter((time) => now - time < 1000);
  owner.commandTimes = recent;
  if (recent.length >= COMMANDS_PER_SECOND) return false;
  recent.push(now);
  return true;
}
