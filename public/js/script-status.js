// Presentation for a runner snapshot; waiting never means it was restarted.
const waits = { prompt: 'waiting for a prompt', room: 'waiting for a room', text: 'waiting for text', match: 'waiting for a match', timer: 'waiting for a timer or roundtime' };
export function scriptStatusText(snapshot, paused = false) {
  if (paused) {
    const previous = snapshot.phase === 'completed' ? 'last run completed' : snapshot.phase === 'error' ? 'last run errored' : snapshot.phase === 'stopped' ? 'stopped' : '';
    return `Automation paused${snapshot.name ? ` · ${snapshot.name}${previous ? ': ' + previous : ''}` : ''}. Run stopped scripts explicitly after resuming.`;
  }
  const name = snapshot.name || 'DR script';
  const location = snapshot.state?.location;
  const at = location?.line ? ` · ${location.script}:${location.line}` : '';
  if (snapshot.phase === 'waiting') return `${name}: ${waits[snapshot.state?.mode] || 'waiting'}${at}`;
  if (snapshot.phase === 'running') return `${name}: running${at}`;
  if (snapshot.phase === 'error') return `${name}: stopped after an error${at}`;
  if (snapshot.phase === 'completed') return `${name}: completed`;
  if (snapshot.phase === 'stopped') return `${name}: stopped. Run it explicitly to start again.`;
  return 'No DR script has run in this session.';
}
export function scriptDiagnosticText(diagnostic) {
  if (!diagnostic) return '';
  const where = `${diagnostic.script || 'DR script'}${diagnostic.line ? `:${diagnostic.line}` : ''}`;
  const callers = (diagnostic.stack || []).slice(0, -1).map(frame => `${frame.script}${frame.line ? ':' + frame.line : ''}`).join(' → ');
  return `${diagnostic.severity === 'error' ? 'Error' : 'Warning'} at ${where}: ${diagnostic.message}`
    + (diagnostic.source ? `\n${diagnostic.source}` : '') + (callers ? `\nCalled from ${callers}` : '');
}
