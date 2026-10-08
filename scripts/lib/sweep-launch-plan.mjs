// Scheduled capacity is not an observation of simultaneous authenticated peers.
export function sweepLaunchPlan({ mode, requestedConcurrency, agents }) {
  if (!['benchmark', 'sweep', 'spawn'].includes(mode)) throw new Error('Unknown sweep mode');
  if (!Number.isSafeInteger(agents) || agents < 0) throw new Error('Agent count must be a nonnegative integer');
  if (!Number.isSafeInteger(requestedConcurrency) || requestedConcurrency < 1) throw new Error('Requested concurrency must be a positive integer');
  return {
    requestedConcurrency,
    scheduledLaunchWidth: !agents ? 0 : mode === 'benchmark' ? Math.min(requestedConcurrency, 10, agents) : mode === 'spawn' ? 1 : agents,
  };
}
