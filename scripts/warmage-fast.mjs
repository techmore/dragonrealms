// Warmage fast cohort launcher: three isolated workers in one invocation.
//
//   node scripts/warmage-fast.mjs --fast
//
// Each worker is a normal warmage-bot process with its own character, account,
// and live log. This keeps concurrent telemetry visible without sharing state.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const runId = Array.from(randomBytes(3), (b) => String.fromCharCode(97 + (b % 26))).join('');
const minutes = Number(opt('--minutes', '90')) || 90;
const circle = Number(opt('--circle', '2')) || 2;
const boost = Number(opt('--boost', '20')) || 20;
const variants = ['spell-loop', 'watchdog-loop', 'spell-loop-crowded'];
const bot = fileURLToPath(new URL('./warmage-bot.mjs', import.meta.url));
const children = variants.map((variant, i) => {
  const name = `WarmFast${String.fromCharCode(65 + i)}${runId}`;
  const child = spawn(process.execPath, [bot, '--circle', String(circle), '--minutes', String(minutes), '--boost', String(boost), '--variant', variant, '--name', name], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  return child;
});

let remaining = children.length;
for (const child of children) child.on('exit', (code, signal) => {
  remaining -= 1;
  if (code || signal) console.error(`warmage worker ${child.pid} ended (${code ?? signal})`);
  if (!remaining) process.exitCode = children.some((c) => c.exitCode) ? 1 : 0;
});

function stopAll(signal) {
  for (const child of children) if (!child.killed) child.kill(signal);
}
process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));

console.log(`warmage fast cohort ${runId}: ${children.length} workers, circle ${circle}, ${minutes}m cap, boost x${boost}`);
