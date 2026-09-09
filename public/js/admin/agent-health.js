// Inactivity is a diagnostic, not proof of failed progression: scripts can rest.
export function agentHealth(agent, now = Date.now()) {
  if (agent.status !== 'running') return '';
  const since = agent.lastScriptCommandAt ?? agent.scriptStartedAt ?? agent.startedAt;
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return '';
  return `No script commands for ${seconds}s. The script may be waiting; inspect the live view before stopping.`;
}
