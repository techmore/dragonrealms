// Background resources have explicit ownership and idempotent cleanup. Weak
// ownership avoids retaining a stopped/disposable world in module globals.
const resources = new WeakMap();

export function registerRuntimeCleanup(owner, cleanup) {
  let callbacks = resources.get(owner);
  if (!callbacks) resources.set(owner, callbacks = new Set());
  callbacks.add(cleanup);
  return () => callbacks.delete(cleanup);
}

export function disposeRuntimeResources(owner) {
  const callbacks = resources.get(owner);
  resources.delete(owner);
  for (const cleanup of callbacks || []) {
    try { cleanup(); } catch (error) { console.error('runtime cleanup failed', error); }
  }
}
