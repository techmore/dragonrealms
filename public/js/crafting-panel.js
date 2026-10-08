// Crafting browsing never falls back to ordinary (potentially mutating) commands.
export function craftingAvailable(state, phase, protocolSupported) {
  return state.value === 'playing' && !state.inChargen && !state.spectating
    && phase === 'connected' && protocolSupported;
}
export function craftingTab(key) { return key === 'orders' ? 'orders' : 'recipes'; }
