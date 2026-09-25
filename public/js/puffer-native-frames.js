import { validRunId } from './puffer-watch.js';

export function nativeWatchFrames(manifest) {
  if (!validRunId(manifest?.run_id) || !manifest.watch) throw new Error('No player screen available');
  const sample = manifest.watch;
  const requirements = manifest.requirements?.rows ? {
    circle: manifest.requirement_circle ?? Math.min((sample.circle ?? 0)+1,manifest.target_circle ?? Infinity),
    rows: manifest.requirements.rows,
  } : null;
  const frames = [];
  for (const msg of Array.isArray(sample.messages) ? sample.messages : []) {
    if (typeof msg !== 'string') continue;
    if (/^\s*HP: \d+\/\d+/.test(msg)) {
      frames.push({t:'prompt',msg,requirements:requirements ?? undefined});
    } else if (/^\s*\[\[.+\]\]/.test(msg)) {
      const exits = /Obvious exits: ([^.]+)\./.exec(msg)?.[1].split(',').map(s=>s.trim()) ?? [];
      frames.push({t:'room',msg,exits});
    } else frames.push({t:'msg',msg});
  }
  // Last command is a sample endpoint, not a reconstructed command transcript.
  if (typeof sample.last_command === 'string') frames.push({t:'notice',msg:`Last observed command: ${sample.last_command}`});
  return {frames,requirements,key:`${manifest.run_id}:${sample.captured_at}:${sample.step}:${sample.commands}`};
}
