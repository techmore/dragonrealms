// Fatal interpreter failures are terminal evidence, not watchdog stalls.
// Normal completion retains each caller's existing recovery/handoff policy.
import { scriptDiagnosticText } from '../../public/js/script-status.js';

export function sweepRunnerCompletion(name, onError, onComplete = () => {}) {
  return result => {
    if (result?.reason === 'error') {
      const diagnostic = result.diagnostic || { script: name, message: 'runtime error', severity: 'error' };
      const details = scriptDiagnosticText({ ...diagnostic, script: diagnostic.script || name, severity: 'error' });
      onError(`script error: ${details.replace(/\r?\n/g, ' | ')}`);
      return;
    }
    onComplete(result);
  };
}
