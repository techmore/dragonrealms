// Shared debug-token discovery for local test tooling (mapper-agent, bots).
// Resolution order: explicit env first (DR_DEBUG_TOKEN, then the mapper's
// DR_MAPPER_DEBUG alias), then the 0600 file the world publishes at startup
// when DR_ENABLE_DEBUG_API=1 (/tmp/dr-debug-token-<port>.json, with a legacy
// un-keyed fallback). Returns '' when nothing is configured — callers treat
// that as "debug fixtures unavailable".
import { readFileSync } from 'node:fs';

export function resolveDebugToken({ port = Number(process.env.DR_PORT || process.env.PORT || 3000) } = {}) {
  if (process.env.DR_DEBUG_TOKEN) return process.env.DR_DEBUG_TOKEN;
  if (process.env.DR_MAPPER_DEBUG) return process.env.DR_MAPPER_DEBUG;
  for (const f of [`/tmp/dr-debug-token-${port}.json`, '/tmp/dr-debug-token.json']) {
    try {
      const prev = JSON.parse(readFileSync(f, 'utf8'));
      if (prev?.token && (prev.port === undefined || prev.port === port)) return prev.token;
    } catch {}
  }
  return '';
}
