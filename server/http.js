// Shared HTTP request composition for the production server and integration
// tests. Keeping routing here prevents test harnesses from drifting away from
// the real API/GM/static precedence and error behavior.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRequest } from './api.js';
import { gmRequest } from './gm.js';
import { createStaticHandler } from './static.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = join(__dirname, '..', 'public');

export function createHttpHandler(game, {
  apiEnabled = process.env.DR_ENABLE_API === '1',
  debugApiEnabled = process.env.DR_ENABLE_DEBUG_API === '1',
  gmToken = process.env.DR_GM_TOKEN,
  debugToken = process.env.DR_DEBUG_TOKEN,
  publicDir = DEFAULT_PUBLIC_DIR,
} = {}) {
  const staticHandler = createStaticHandler(publicDir);

  return function handleHttpRequest(req, res) {
    try {
      const path = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      if (path === '/api/gm' || path.startsWith('/api/gm/')) {
        if (!apiEnabled) return notFound(res);
        gmRequest(req, res, game, { gmToken });
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
