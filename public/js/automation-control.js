// A session-local safety latch. Pausing never deletes saved definitions, and
// only an explicit user action may resume automatic sends.
let paused = false;
try { paused = sessionStorage.getItem('dr_automation_paused') === 'true'; } catch {}
const listeners = new Set();
export const isAutomationPaused = () => paused;
export function setAutomationPaused(value) {
  const next = Boolean(value);
  if (next === paused) return;
  paused = next;
  try { sessionStorage.setItem('dr_automation_paused', String(paused)); } catch {}
  for (const fn of listeners) fn(paused);
}
export function onAutomationPause(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
