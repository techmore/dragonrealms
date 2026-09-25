// Static file serving for the web client. Pure handler factory — unit-testable
// without booting the game.
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync, realpathSync } from 'node:fs';
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

// Applied to HTML, assets, API responses, and error responses. The project
// still has authored inline scripts/styles, so those two directives retain
// 'unsafe-inline' until the HTML is fully externalized; external script hosts
// and framing remain denied. TLS/HSTS belongs at the public reverse proxy.
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; manifest-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});

const secure = (headers = {}) => ({ ...SECURITY_HEADERS, ...headers });

export function createStaticHandler(publicDir) {
  // Canonical root (S4): containment is judged against the RESOLVED root and
  // a separator-bounded prefix, not a raw string prefix — "/srv/public" once
  // accepted "/srv/publicity/..." because the former is a prefix of the latter.
  const ROOT = realpathSync(resolve(publicDir));
  const forbidden = (path) => path.split(/[\\/]/).some((part) => part.startsWith('.'))
    || /\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/i.test(path)
    || /\.(?:sql|bak|backup)$/i.test(path);
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
      if (!contained(filePath) || forbidden(path) || !existsSync(filePath)) {
        res.writeHead(404, secure({ 'Content-Type': 'text/plain' }));
        res.end('Not found');
        return;
      }
      // Resolve symlinks before serving either bytes or metadata. Apply the
      // artifact policy to the target too, so an alias cannot publish a DB.
      filePath = realpathSync(filePath);
      if (!contained(filePath) || forbidden(filePath.slice(ROOT.length)) || !statSync(filePath).isFile()) {
        res.writeHead(404, secure({ 'Content-Type': 'text/plain' }));
        res.end('Not found');
        return;
      }
      const type = MIME[extname(filePath)] || 'application/octet-stream';
      // Pages and assets iterate fast during development and are viewed both
      // locally and through Tailscale on a phone — never let any cache pin a
      // stale copy or the two views diverge. no-store forbids storing, so the
      // phone always re-fetches from local and the two views stay mirrored.
      const headers = secure({ 'Content-Type': type });
      if (type.startsWith('text/')) headers['Cache-Control'] = 'no-store';
      // Live logs' clients (sims.html) key liveness on Last-Modified — a log
      // that stopped appending is a dead run, not an active one.
      const stat = statSync(filePath);
      headers['Last-Modified'] = stat.mtime.toUTCString();
      headers['Accept-Ranges'] = 'bytes';
      // HEAD answers from the stat alone — a full readFile of a multi-MB log
      // just to learn its size/mtime stalled the game tick for nothing.
      if (req.method === 'HEAD') {
        headers['Content-Length'] = String(stat.size);
        res.writeHead(200, headers);
        res.end();
        return;
      }
      // Range requests (bytes=from-): the sims dashboard tails append-only
      // logs by asking for the suffix after the byte offset it last saw, so
      // a 4 MB log appends cost bytes instead of a full re-download.
      // (Suffix form "bytes=-N" is not needed by any client; start-form is.)
      const range = /^bytes=(\d+)-$/.exec(req.headers.range || '');
      if (range) {
        const start = Number(range[1]);
        if (start >= stat.size) {
          res.writeHead(416, secure({ 'Content-Type': type, 'Content-Range': `bytes */${stat.size}` }));
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${stat.size - 1}/${stat.size}`,
          'Content-Length': String(stat.size - start),
        });
        createReadStream(filePath, { start })
          .on('error', () => { try { res.destroy(); } catch {} })
          .pipe(res);
        return;
      }
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
            res.writeHead(404, secure({ 'Content-Type': 'text/plain' }));
            res.end('Not found');
          } else {
            res.end();
          }
        });
    } catch {
      res.writeHead(500, secure());
      res.end('error');
    }
  };
}
