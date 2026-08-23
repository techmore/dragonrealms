// Small, shared HTTP credential helpers. Privileged service secrets are kept
// separate from game-account sessions and compared without early byte exits.
import { timingSafeEqual } from 'node:crypto';

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)$/i.exec(Array.isArray(header) ? header[0] : header);
  return match ? match[1] : null;
}

export function headerToken(req, name) {
  const value = req.headers[String(name).toLowerCase()];
  return typeof value === 'string' && value.length ? value : null;
}

export function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length === 0) return false;
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

// True when `token` is the configured GM credential. Lives here (not in
// gm.js) because session.js and gm-play.js need it as a general auth
// primitive without pulling in the whole GM HTTP surface.
export function isGmToken(token, configuredToken = process.env.DR_GM_TOKEN) {
  return secretMatches(token, configuredToken);
}
