// Static file serving for the web client. Pure handler factory — unit-testable
// without booting the game.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.log': 'text/plain; charset=utf-8',
};

export function createStaticHandler(publicDir) {
  return (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (path === '/') path = '/index.html';
      let filePath = join(publicDir, path);
      // Pretty URLs: an extensionless miss falls back to <path>.html
      // (/admin -> admin.html). Traversal guards below are unchanged.
      if (!existsSync(filePath) && !extname(path)) {
        filePath = join(publicDir, `${path}.html`);
      }
      if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const type = MIME[extname(filePath)] || 'application/octet-stream';
      // Pages iterate fast during development; never let browsers pin them.
      const headers = { 'Content-Type': type };
      if (type.startsWith('text/')) headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      // Async: a synchronous read here stalls the entire event loop —
      // game ticks included — on every page load.
      readFile(filePath)
        .then((body) => res.end(body))
        .catch(() => { res.writeHead(500); res.end('error'); });
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  };
}
