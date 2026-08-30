// Shared live-log index writer. Keep the legacy name-only index for existing
// viewers and publish metadata so newer viewers can find changed logs with a
// single request instead of issuing one HEAD request per historical log.
import { readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const lastWriteByDir = new Map();

function atomicWrite(path, body) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

export function refreshLiveIndex(liveDir, { force = false, minIntervalMs = 5000 } = {}) {
  const now = Date.now();
  const last = lastWriteByDir.get(liveDir) || 0;
  if (!force && now - last < minIntervalMs) return false;
  lastWriteByDir.set(liveDir, now);

  const logs = readdirSync(liveDir)
    .filter((file) => file.endsWith('.log'))
    .sort()
    .map((file) => {
      const stat = statSync(join(liveDir, file));
      return {
        name: file.slice(0, -4),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      };
    });

  atomicWrite(join(liveDir, 'index.json'), JSON.stringify(logs.map((log) => log.name)));
  atomicWrite(join(liveDir, 'index-meta.json'), JSON.stringify({ generatedAt: now, logs }));
  return true;
}
