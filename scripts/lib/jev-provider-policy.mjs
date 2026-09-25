// Bounded wrapper behavior for repeated Jev service failures. This module is
// intentionally independent of the game server and provider transport.
export const JEV_MAX_CONSECUTIVE_FAILURES = 5;

export function jevBackoffSeconds(failureCount, { baseSeconds = 10, maxSeconds = 120 } = {}) {
  const failures = Math.max(0, Math.floor(Number(failureCount) || 0));
  if (!failures) return 0;
  const base = Math.max(1, Number(baseSeconds) || 10);
  const maximum = Math.max(base, Number(maxSeconds) || 120);
  return Math.min(maximum, base * (2 ** Math.min(failures - 1, 30)));
}

// Invalid/auth/provider client errors will not heal by repeating the same
// request. HTTP 429 is excluded because a later request after backoff can be
// valid once the server's rate window clears.
export function isPermanentJevClientError(status) {
  const code = Number(status);
  return Number.isInteger(code) && code >= 400 && code < 500 && code !== 429;
}

// Optional Jev-first hybrid for the independent player harness. A permanent
// provider error opens the primary circuit before local fallback is attempted,
// so (for example) HTTP 402 never triggers another paid Jev request.
export function createJevLocalFallback({ askJev, askLocal }) {
  if (typeof askJev !== 'function' || typeof askLocal !== 'function')
    throw new TypeError('Hybrid decision providers must both be functions.');
  let primaryCircuitOpen = false;
  return {
    isPrimaryCircuitOpen: () => primaryCircuitOpen,
    openPrimaryCircuit: () => { primaryCircuitOpen = true; },
    async choose(state, questions, { skipPrimary = false, jevOptions, localOptions } = {}) {
      if (primaryCircuitOpen || skipPrimary) {
        return { provider:'local', result:await askLocal(state, questions, localOptions),
          fallback:true, circuitOpen:primaryCircuitOpen, skippedPrimary:true };
      }
      try {
        return { provider:'jev', result:await askJev(state, questions, jevOptions),
          fallback:false, circuitOpen:false, skippedPrimary:false };
      } catch (primaryError) {
        if (isPermanentJevClientError(primaryError.status)) primaryCircuitOpen = true;
        try {
          return { provider:'local', result:await askLocal(state, questions, localOptions),
            fallback:true, primaryError, circuitOpen:primaryCircuitOpen, skippedPrimary:false };
        } catch (localError) {
          localError.primaryError = primaryError;
          localError.primaryCircuitOpen = primaryCircuitOpen;
          throw localError;
        }
      }
    },
  };
}
