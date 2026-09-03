// Static file serving for the web client. Pure handler factory — unit-testable
// without booting the game.
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

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
  // Canonical root (S4): containment is judged against the RESOLVED root and
  // a separator-bounded prefix, not a raw string prefix — "/srv/public" once
  // accepted "/srv/publicity/..." because the former is a prefix of the latter.
  const ROOT = resolve(publicDir);
  const contained = (p) => p === ROOT || p.startsWith(ROOT + sep);
  return (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (path === '/') path = '/index.html';
      let filePath = resolve(ROOT, `.${path}`);
      // Pretty URLs: an extensionless miss falls back to <path>.html
      // (/admin -> admin.html). Containment guard below is unchanged.
      if (!existsSync(filePath) && !extname(path)) {
        filePath = resolve(ROOT, `.${path}.html`);
      }
      if (!contained(filePath) || !existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const type = MIME[extname(filePath)] || 'application/octet-stream';
      // Pages and assets iterate fast during development and are viewed both
      // locally and through Tailscale on a phone — never let any cache pin a
      // stale copy or the two views diverge. no-store forbids storing, so the
      // phone always re-fetches from local and the two views stay mirrored.
      const headers = { 'Content-Type': type };
      if (type.startsWith('text/')) headers['Cache-Control'] = 'no-store';
      // Live logs' clients (sims.html) key liveness on Last-Modified — a log
      // that stopped appending is a dead run, not an active one.
      headers['Last-Modified'] = statSync(filePath).mtime.toUTCString();
      // Async: a synchronous read here stalls the entire event loop —
      // game ticks included — on every page load. Headers go out only after
      // the read succeeds: a failed read (EISDIR, EACCES, deleted mid-flight)
      // must not crash the server with ERR_HTTP_HEADERS_SENT.
      readFile(filePath)
        .then((body) => {
          res.writeHead(200, headers);
          res.end(body);
        })
        .catch(() => {
          if (!res.headersSent) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          } else {
            res.end();
          }
        });
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  };
}
