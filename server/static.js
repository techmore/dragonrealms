// Static file serving for the web client. Pure handler factory — unit-testable
// without booting the game.
import { readFileSync, existsSync } from 'node:fs';
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
      const filePath = join(publicDir, path);
      if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
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
  };
}
