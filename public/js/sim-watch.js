// Public manifests identify worlds, never authenticate them. Private GM
// credentials may be handed off only within their own origin.
export function simulationWatchLink(character, manifest, { origin, operatorToken = '' }) {
  const base = new URL(origin);
  const target = new URL('/', base);
  const port = Number(manifest?.worldPort);
  if (Number.isInteger(port) && port >= 1 && port <= 65535) target.port = String(port);
  target.searchParams.set('spectate', String(character));
  const crossOrigin = target.origin !== base.origin;
  if (!crossOrigin && !operatorToken) return { enabled: false, href: null,
    title: 'GM token needed — open Sims from the Admin dashboard first' };
  if (!crossOrigin) target.hash = 'gm=' + encodeURIComponent(operatorToken);
  return { enabled: true, href: target.href, title: crossOrigin
    ? 'Watch the target world; sign in there with its own GM credential.'
    : `Watch ${character}'s game stream in a new tab` };
}
