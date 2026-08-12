// Dragon Realms server entry point.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, db, closeDb } from './db.js';
import { Game } from './game.js';
import { attachWebSocket } from './session.js';
import { apiRequest } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const API_ENABLED = process.env.DR_ENABLE_API === '1';
const PUBLIC_DIR = join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

migrate();
const game = new Game();
game.init();

const server = createServer((req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    if (path === '/') path = '/index.html';
    if (path === '/api' || path.startsWith('/api/')) {
      if (!API_ENABLED) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      apiRequest(req, res, game).catch(() => res.destroy());
      return;
    }
    const filePath = join(PUBLIC_DIR, path);
    if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(readFileSync(filePath));
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
