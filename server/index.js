// Dragon Realms server entry point.
import { createServer } from 'node:http';
import { migrate, closeDb } from './db.js';
import { Game } from './game.js';
import { attachWebSocket } from './session.js';
import { createHttpHandler } from './http.js';

const PORT = Number(process.env.PORT || 3000);
const API_ENABLED = process.env.DR_ENABLE_API === '1';
const DEBUG_API_ENABLED = process.env.DR_ENABLE_DEBUG_API === '1';

migrate();
const game = new Game();
game.init();

const server = createServer(createHttpHandler(game, {
  apiEnabled: API_ENABLED,
  debugApiEnabled: DEBUG_API_ENABLED,
  gmToken: process.env.DR_GM_TOKEN,
  debugToken: process.env.DR_DEBUG_TOKEN,
}));

attachWebSocket(server, game);

server.listen(PORT, () => {
  console.log(`Dragon Realms listening on http://localhost:${PORT}`);
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
