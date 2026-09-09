import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import { startWorld } from '../scripts/lib/disposable-world.mjs';
import { backupDatabase } from '../scripts/backup-db.mjs';

function connect(url) {
  const ws = new WebSocket(url);
  const messages = [];
  let fault;
  ws.on('error', (error) => { fault = error; });
  ws.on('message', (data) => messages.push(JSON.parse(data)));
  return {
    ws, send: (value) => ws.send(JSON.stringify(value)),
    async wait(type, after = 0) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (fault) throw fault;
        const found = messages.slice(after).find((m) => m.t === type);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${type}`);
    },
    get count() { return messages.length; },
  };
}

function character(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare('SELECT str, unspent_stat FROM characters WHERE name=?').get('Recoverytester'); }
  finally { db.close(); }
}

test('real SIGTERM and restored backup preserve an online allocation made since last save', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dr-recovery-'));
  const path = join(dir, 'world.db');
  let world, client;
  try {
    world = await startWorld({ dbPath: path });
    client = connect(world.wsUrl);
    await client.wait('login_prompt');
    client.send({ t: 'register', u: 'recoverytester', p: 'recovery-test-password' });
    const token = (await client.wait('authed')).token;
    await client.wait('charcreate');
    client.send({ t: 'charcreate', name: 'Recoverytester', race: 'human' });
    await client.wait('charalloc');
    client.send({ t: 'enter' });
    await client.wait('prompt');
    const before = character(path);
    const start = client.count;
    client.send({ t: 'input', line: 'alloc str 5' });
    await client.wait('prompt', start);
    assert.equal(character(path).str, before.str, 'mutation is not already durable before shutdown');
    const result = await world.stop(); world = null;
    assert.equal(result.code, 0);
    assert.equal(character(path).str, before.str + 5);
    assert.equal(character(path).unspent_stat, before.unspent_stat - 5);
    const restored = join(dir, 'restored.db');
    backupDatabase(path, restored);
    world = await startWorld({ dbPath: restored });
    client = connect(world.wsUrl);
    await client.wait('login_prompt');
    client.send({ t: 'token', token });
    const select = await client.wait('charselect');
    assert.match(select.msg, /Recoverytester/);
    assert.equal(character(restored).str, before.str + 5);
  } finally {
    client?.ws.terminate();
    if (world) await world.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
