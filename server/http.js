// Shared HTTP request composition for the production server and integration
// tests. Keeping routing here prevents test harnesses from drifting away from
// the real API/GM/static precedence and error behavior.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRequest } from './api.js';
import { gmRequest } from './gm.js';
import { createStaticHandler, SECURITY_HEADERS } from './static.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = join(__dirname, '..', 'public');

export function createHttpHandler(game, {
  apiEnabled = process.env.DR_ENABLE_API === '1',
  debugApiEnabled = process.env.DR_ENABLE_DEBUG_API === '1',
  gmToken = process.env.DR_GM_TOKEN,
  gmOperatorToken = process.env.DR_GM_OPERATOR_TOKEN || gmToken,
  gmAdminToken = process.env.DR_GM_ADMIN_TOKEN || gmToken,
  gmPlayToken = process.env.DR_GM_PLAY_TOKEN || gmToken,
  debugToken = process.env.DR_DEBUG_TOKEN,
  publicDir = DEFAULT_PUBLIC_DIR,
  maxConcurrent = 256,
  requestTimeoutMs = 30_000,
} = {}) {
  const staticHandler = createStaticHandler(publicDir);
  let active = 0;

  return function handleHttpRequest(req, res) {
    // API/GM handlers write their own content headers. Install the shared
    // browser hardening first so success, overload, timeout, and route errors
    // all carry the same policy as static responses.
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (active >= maxConcurrent) {
      res.writeHead(503, { 'Content-Type': 'text/plain', Connection: 'close', 'Retry-After': '1' });
      res.end('Server busy');
      return;
    }
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
    };
    res.once('finish', release);
    res.once('close', release);
    req.setTimeout?.(requestTimeoutMs, () => {
      if (!res.headersSent) res.writeHead(408, { 'Content-Type': 'text/plain' });
      res.destroy();
    });

    if (game.shuttingDown) {
      res.writeHead(503, { 'Content-Type': 'text/plain', Connection: 'close' });
      res.end('World shutting down');
      return;
    }
    try {
      const path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (path === '/api/gm' || path.startsWith('/api/gm/')) {
        if (!apiEnabled) return notFound(res);
        gmRequest(req, res, game, { gmToken, gmOperatorToken, gmAdminToken, gmPlayToken });
        return;
      }
      if (path === '/api' || path.startsWith('/api/')) {
        if (!apiEnabled) return notFound(res);
        apiRequest(req, res, game, { debugApiEnabled, debugToken }).catch(() => res.destroy());
        return;
      }
      staticHandler(req, res);
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  };
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}
