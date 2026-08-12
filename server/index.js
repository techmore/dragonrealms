// Dragon Realms server entry point.
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, db, closeDb } from './db.js';
import { Game } from './game.js';
import { attachWebSocket } from './session.js';
import { apiRequest } from './api.js';
import { createStaticHandler } from './static.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const API_ENABLED = process.env.DR_ENABLE_API === '1';
const PUBLIC_DIR = join(__dirname, '..', 'public');

migrate();
const game = new Game();
game.init();

const staticHandler = createStaticHandler(PUBLIC_DIR);

const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    if (path === '/api' || path.startsWith('/api/')) {
      if (!API_ENABLED) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      apiRequest(req, res, game).catch(() => res.destroy());
      return;
    }
    staticHandler(req, res);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});

attachWebSocket(server, game);

server.listen(PORT, () => {
  console.log(`Dragon Realms listening on http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\nShutting down...');
    game.combat.stopTicker();
    for (const p of game.players.values()) {
      try { game.persistPlayer(p); } catch {}
    }
    closeDb();
    process.exit(0);
  });
}
