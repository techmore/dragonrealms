// Dragon Realms server entry point.
import { createServer } from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { migrate, closeDb } from './db.js';
import { Game } from './game.js';
import { attachWebSocket } from './session.js';
import { createHttpHandler } from './http.js';

const PORT = Number(process.env.PORT || 3000);
// Local-play defaults: a bare `node server/index.js` (no env) still gets the
// test API and a STABLE local GM token, so the menu-bar app, dash handoff,
// and Watch links never race a rotating credential. Set DR_GM_TOKEN to
// override; the chosen token is published to /tmp/dr-world-token-<port>.json
// (per port — parallel worlds on different ports never clobber each other).
const LOCAL_TOKEN_FILE = `/tmp/dr-world-token-${PORT}.json`;
function resolveGmToken() {
  if (process.env.DR_GM_TOKEN) return process.env.DR_GM_TOKEN;
  try {
    const prev = JSON.parse(readFileSync(LOCAL_TOKEN_FILE, 'utf8'));
    if (prev?.token && prev.port === PORT) return prev.token; // keep it stable across restarts
  } catch {}
  // Legacy single-file location (pre per-port keying).
  try {
    const legacy = JSON.parse(readFileSync('/tmp/dr-world-token.json', 'utf8'));
    if (legacy?.token && legacy.port === PORT) return legacy.token;
  } catch {}
  return 'dr-local-' + Math.random().toString(36).slice(2, 10);
}
const GM_TOKEN = resolveGmToken();
const API_ENABLED = process.env.DR_ENABLE_API !== '0'; // on by default for local play
const DEBUG_API_ENABLED = process.env.DR_ENABLE_DEBUG_API === '1';
// Debug API defaults OFF. When the operator enables it without choosing a
// token, refuse the literal/guessable defaults: the debug surface mutates
// game state (teleport, setSkills, die), so it demands a real secret.
const DEBUG_TOKEN = process.env.DR_DEBUG_TOKEN
  || (DEBUG_API_ENABLED ? 'debug-' + randomBytes(24).toString('hex') : undefined);
if (DEBUG_API_ENABLED && process.env.DR_DEBUG_TOKEN) {
  console.log('Dragon Realms: debug API ENABLED (DR_DEBUG_TOKEN configured).');
} else if (DEBUG_API_ENABLED) {
  console.log('Dragon Realms: debug API ENABLED with a generated token (set DR_DEBUG_TOKEN to pin it for test tooling).');
}

// Single-world guard: probe the port BEFORE bootstrapping anything. A second
// world on :3000 desyncs GM tokens, splits sessions, and logs operators out.
// (An 'error' listener on the http server is not enough — the WSS attached to
// it can surface the failure as an unhandled event first.)
function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net.connect({ port, host: '127.0.0.1' });
    probe.once('connect', () => { probe.destroy(); resolve(true); });
    probe.once('error', () => { resolve(false); });
  });
}

const busy = await portInUse(PORT);
if (busy && process.env.DR_ALLOW_SECOND_WORLD !== '1') {
  console.error(`Dragon Realms: port ${PORT} already has a world running.`);
  console.error(`Refusing to start a duplicate — two worlds would desync GM ` +
    `tokens and sessions. Kill the other process or set PORT=<other>.`);
  process.exit(1);
}

migrate();
const game = new Game();
game.init();

const server = createServer(createHttpHandler(game, {
  apiEnabled: API_ENABLED,
  debugApiEnabled: DEBUG_API_ENABLED,
  gmToken: GM_TOKEN,
  debugToken: DEBUG_TOKEN,
}));

attachWebSocket(server, game, { gmToken: GM_TOKEN });

server.listen(PORT, () => {
  console.log(`Dragon Realms listening on http://localhost:${PORT}`);
  // Publish the live credential for local tooling (the menu-bar app reads this
  // instead of inventing a second token that the running server rejects).
  try {
    writeFileSync(LOCAL_TOKEN_FILE, JSON.stringify({
      port: PORT, token: GM_TOKEN, at: Date.now(),
    }), { mode: 0o600 });
  } catch {}
  // Publish the debug credential too (only when the surface is enabled), so
  // local tooling (mapper-agent, bots) can discover it without a literal
  // committed secret. Env-configured tokens win on both sides regardless.
  if (DEBUG_API_ENABLED) {
    try {
      writeFileSync(`/tmp/dr-debug-token-${PORT}.json`, JSON.stringify({
        port: PORT, token: DEBUG_TOKEN, at: Date.now(),
      }), { mode: 0o600 });
    } catch {}
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    game.stop();
    closeDb();
    process.exit(0);
  });
}
