#!/usr/bin/env node
// Bounded loopback control gateway for an external Unreal Agent DR player.
// Owns one disposable world and one ordinary WebSocket player; never the live world.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startWorld } from './lib/disposable-world.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runId = `unreal-dr-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`;
const seconds = Math.max(60, Math.min(600, Number(process.env.UNREAL_DR_SECONDS || 300)));
const maxCommands = Math.max(1, Math.min(60, Number(process.env.UNREAL_DR_MAX_COMMANDS || 30)));
const artifactDir = path.join(root, 'public/live/unreal-agent', runId);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `${runId}-`));
const charSuffix = randomUUID().replaceAll('-', '').slice(0, 12)
  .split('').map(c => String.fromCharCode(65 + (Number.parseInt(c, 16) % 26))).join('');
fs.mkdirSync(artifactDir, { recursive: true });
const manifestPath = path.join(artifactDir, 'manifest.json');
const eventsPath = path.join(artifactDir, 'events.jsonl');
const manifest = { schema: 'dragonrealms.unreal-player/1', runId, status: 'starting',
  startedAt: new Date().toISOString(), durationCapSeconds: seconds, commandCap: maxCommands,
  provider: 'unreal-agent-runner/openai-codex', model: process.env.UNREAL_HARNESS_LLM_MODEL || null,
  world: 'disposable loopback, fresh SQLite DB, ordinary WebSocket player, no boost',
  progress: { commands: 0, commandPosts: 0, highestCircle: 1 }, manifest: `/live/unreal-agent/${runId}/manifest.json` };
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const record = event => fs.appendFileSync(eventsPath, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
save();

const allowed = new Set(['look','help','exp','inventory','skills','score','health','info','hunt','attack','assess',
  'advance','retreat','flee','stance','circle','wield','wear','get','skin','search','train','rest','stand','forage',
  'track','ask','quest','dir','direction','learn','study','east','west','north','south','northeast','northwest',
  'southeast','southwest','up','down','out']);
let world, session, httpServer;
let stopping = false, activeCommand = false, lastCommandAt = 0;
let sequence = 0;
const recent = [];
const room = { id: null, name: null, exits: [] };
const state = () => ({ runId, ready: Boolean(session && session.vitals.maxhp && session.vitals.room),
  availableCommands: [...allowed],
  vitals: session ? { ...session.vitals, rt: session.roundtimeLeftNow() } : null,
  room: { ...room }, recent: recent.slice(-16), commandsRemaining: maxCommands - manifest.progress.commandPosts,
  secondsRemaining: Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000)) });
const startedAt = Date.now();

async function respond(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store', 'access-control-allow-origin': 'null' });
  res.end(text);
}
async function handle(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') return respond(res, 200, { ok: !stopping, runId });
  if (req.method === 'GET' && req.url === '/state') return respond(res, 200, state());
  if (req.method === 'POST' && req.url === '/command') {
    if (stopping) return respond(res, 410, { error: 'run is stopping' });
    if (manifest.progress.commandPosts >= maxCommands) return respond(res, 429, { error: 'command-post cap reached' });
    manifest.progress.commandPosts++;
    save();
    if (activeCommand) return respond(res, 409, { error: 'one command is already in flight' });
    if (Date.now() - startedAt > seconds * 1000) return respond(res, 429, { error: 'time cap reached' });
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 2048) return respond(res, 413, { error: 'request too large' }); }
    let line;
    try { line = JSON.parse(raw).line; } catch { return respond(res, 400, { error: 'body must be JSON with a line' }); }
    line = String(line || '').trim();
    const verb = line.split(/\s+/, 1)[0].toLowerCase();
    if (!line || line.length > 120 || /[;\r\n\x00-\x1f]/.test(line) || !allowed.has(verb))
      return respond(res, 400, { error: 'command rejected by the player whitelist' });
    if (!state().ready) return respond(res, 409, { error: 'player is not ready; use GET /state' });
    if (Date.now() - lastCommandAt < 900) return respond(res, 429, { error: 'command rate cap: wait 900ms' });
    activeCommand = true;
    const before = sequence;
    lastCommandAt = Date.now();
    manifest.progress.commands++;
    record({ type: 'command', number: manifest.progress.commands, line });
    try {
      await session.cmd(line);
      const deadline = Date.now() + 1800;
      while (Date.now() < deadline && sequence === before && !stopping)
        await new Promise(resolve => setTimeout(resolve, 50));
      const current = state();
      manifest.progress.highestCircle = Math.max(manifest.progress.highestCircle, current.vitals?.circle || 1);
      save();
      return respond(res, 200, current);
    } catch { return respond(res, 503, { error: 'command could not be sent' }); }
    finally { activeCommand = false; }
  }
  if (req.method === 'POST' && req.url === '/stop') { void shutdown('agent_stop'); return respond(res, 200, { ok: true }); }
  return respond(res, 404, { error: 'not found' });
}

async function shutdown(reason) {
  if (stopping) return;
  stopping = true;
  clearTimeout(capTimer);
  manifest.status = reason === 'agent_stop' ? 'stopped' : 'completed';
  manifest.finishedAt = new Date().toISOString();
  manifest.finishReason = reason;
  save();
  try { session?.close(); } catch {}
  if (httpServer?.listening) await new Promise(resolve => httpServer.close(resolve));
  if (world) await world.stop();
  fs.rmSync(scratch, { recursive: true, force: true });
  save();
  console.log(JSON.stringify({ type: 'unreal-dr-stop', runId, status: manifest.status, reason,
    manifest: manifestPath, events: eventsPath }));
}
const capTimer = setTimeout(() => void shutdown('time_cap'), seconds * 1000);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => void shutdown(signal.toLowerCase()));

try {
  // The disposable launcher inherits parent env. Pin natural spawn density for this run.
  const priorSpawn = process.env.DR_SPAWN_MULT;
  process.env.DR_SPAWN_MULT = '1';
  world = await startWorld({ dbPath: path.join(scratch, 'world.db'), enableApi: true });
  if (priorSpawn == null) delete process.env.DR_SPAWN_MULT; else process.env.DR_SPAWN_MULT = priorSpawn;
  process.env.DR_HTTP_ORIGIN = world.url;
  process.env.DR_WS_ORIGIN = world.wsUrl;
  // wire-session captures both origins at module evaluation; import only after
  // startWorld has assigned explicit disposable-world endpoints.
  const { WireSession, stripAnsi } = await import('./lib/wire-session.mjs');
  session = new WireSession({ user: `unreal_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    pass: randomUUID(), char: `Unreal${charSuffix}`,
    race: 'human', guild: 'barbarian', bot: false });
  await session.httpLogin();
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('player entry timed out')), 15000);
    session.connect({
      onCharAlloc: async () => {
        const allocation = { str: 10, con: 10, agi: 5, ref: 5 };
        for (const [stat, amount] of Object.entries(allocation)) await session.cmd(`alloc ${stat} ${amount}`);
        await session.cmd('enter');
        record({ type: 'chargen_allocation', allocation });
      },
      onEnter: () => { manifest.status = 'playing'; save(); record({ type: 'entered' }); },
      onRoom: message => { room.id = message.roomId || null; room.name = message.msg ? stripAnsi(message.msg) : null;
        room.exits = message.exits || []; room.contents = message.contents || {};
        sequence++; record({ type: 'room', roomId: room.id, exits: room.exits, contents: room.contents }); },
      onPrompt: message => { sequence++; record({ type: 'prompt', circle: session.vitals.circle, hp: session.vitals.hp, maxHp: session.vitals.maxhp, rt: session.roundtimeLeftNow() }); if (session.vitals.maxhp && session.vitals.room) { clearTimeout(timer); resolve(); } },
      onText: (text, type) => { recent.push({ type, text: String(text).slice(0, 500) }); if (recent.length > 40) recent.shift(); sequence++; record({ type: 'text', channel: type, text: String(text).slice(0, 500) }); },
      onError: error => record({ type: 'player_error', message: String(error).slice(0, 300) }),
      onFatal: reason => { record({ type: 'fatal', reason }); void shutdown('player_fatal'); },
    });
  });
  await ready;
  httpServer = createServer((req, res) => { void handle(req, res).catch(() => { if (!res.headersSent) void respond(res, 500, { error: 'internal error' }); }); });
  await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', resolve); });
  manifest.status = 'playing'; manifest.endpoint = `http://127.0.0.1:${httpServer.address().port}`; save();
  console.log(JSON.stringify({ type: 'unreal-dr-ready', runId, endpoint: manifest.endpoint,
    durationCapSeconds: seconds, commandCap: maxCommands, manifest: manifestPath }));
  await new Promise(resolve => httpServer.once('close', resolve));
} catch (error) {
  manifest.status = 'failed'; manifest.finishReason = String(error?.message || error).slice(0, 500);
  manifest.finishedAt = new Date().toISOString(); save();
  try { session?.close(); } catch {}
  if (httpServer?.listening) await new Promise(resolve => httpServer.close(resolve));
  if (world) await world.stop();
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exitCode = 1;
  console.error(JSON.stringify({ type: 'unreal-dr-failed', runId, error: manifest.finishReason, manifest: manifestPath }));
}
