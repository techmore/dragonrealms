// Dragon Realms server entry point.
import { createServer } from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';
import { migrate, closeDb } from './db.js';
import { Game } from './game.js';
import { attachWebSocket } from './session.js';
import { createHttpHandler } from './http.js';

const PORT = Number(process.env.PORT || 3000);
// Local-play defaults: a bare `node server/index.js` (no env) still gets the
// test API and a STABLE local GM token, so the menu-bar app, dash handoff,
// and Watch links never race a rotating credential. Set DR_GM_TOKEN to
// override; the chosen token is published to /tmp/dr-world-token.json below.
const LOCAL_TOKEN_FILE = '/tmp/dr-world-token.json';
function resolveGmToken() {
  if (process.env.DR_GM_TOKEN) return process.env.DR_GM_TOKEN;
  try {
    const prev = JSON.parse(readFileSync(LOCAL_TOKEN_FILE, 'utf8'));
    if (prev?.token && prev.port === PORT) return prev.token; // keep it stable across restarts
  } catch {}
  return 'dr-local-' + Math.random().toString(36).slice(2, 10);
}
const GM_TOKEN = resolveGmToken();
const API_ENABLED = process.env.DR_ENABLE_API !== '0'; // on by default for local play
const DEBUG_API_ENABLED = process.env.DR_ENABLE_DEBUG_API === '1';

migrate();
const game = new Game();
game.init();

const server = createServer(createHttpHandler(game, {
  apiEnabled: API_ENABLED,
  debugApiEnabled: DEBUG_API_ENABLED,
  gmToken: GM_TOKEN,
  debugToken: process.env.DR_DEBUG_TOKEN,
}));

attachWebSocket(server, game);

server.listen(PORT, () => {
  console.log(`Dragon Realms listening on http://localhost:${PORT}`);
  // Publish the live credential for local tooling (the menu-bar app reads this
  // instead of inventing a second token that the running server rejects).
  try {
    writeFileSync(LOCAL_TOKEN_FILE, JSON.stringify({
      port: PORT, token: GM_TOKEN, at: Date.now(),
    }), { mode: 0o600 });
  } catch {}
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\nShutting down...');
    game.stop();
    for (const p of game.players.values()) {
      try { game.persistPlayer(p); } catch {}
    }
    closeDb();
    process.exit(0);
  });
}
