// live-log.mjs — append-only job logs for the /jobs.html live viewer.
// Long-running scripts call liveJob(name) and write lines through the
// returned sink; the page polls public/live/ every 2 s.
import { appendFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { refreshLiveIndex } from './lib/live-index.mjs';

const DIR = new URL('../public/live/', import.meta.url).pathname;

// Start a named job log (truncates any previous run). Returns a sink
// function; pass it lines as the job progresses.
export function liveJob(name) {
  const safe = String(name).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'job';
  mkdirSync(DIR, { recursive: true });
  const file = DIR + safe + '.log';
  try { unlinkSync(file); } catch {}
  let last = '';
  let indexed = false;
  return (line) => {
    last = String(line);
    try {
      appendFileSync(file, last + '\n');
      refreshLiveIndex(DIR, { force: !indexed });
      indexed = true;
    } catch {}
  };
}
