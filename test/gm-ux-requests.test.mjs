import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { gmRequest } from '../public/js/gm-request.js';

test('GM POST merges Headers and keeps the dedicated credential and deadline', async () => {
  const old = globalThis.fetch;
  let call;
  globalThis.fetch = async (...args) => { call = args; return { ok: true }; };
  try {
    await gmRequest('/api/gm/admin/reload', 'secret', { method: 'POST', headers: new Headers({ 'Content-Type': 'application/json', Authorization: 'wrong' }), body: '{}' });
    assert.equal(call[1].method, 'POST');
    assert.equal(call[1].headers.get('Authorization'), 'Bearer secret');
    assert.equal(call[1].headers.get('Content-Type'), 'application/json');
    assert.equal(call[1].body, '{}');
    assert.ok(call[1].signal instanceof AbortSignal);
    await gmRequest('/api/gm/summary', '', { headers: { Authorization: 'wrong' } });
    assert.equal(call[1].headers.has('Authorization'), false);
  } finally { globalThis.fetch = old; }
});

test('failed deletion retains selected IDs; partial success retains online IDs', async () => {
  const html = await readFile(new URL('../public/characters.html', import.meta.url), 'utf8');
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*;$/m, '').replace(/\n    load\(\);\s*$/, '');
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: id === 'filter' ? 'all' : '', dataset: {}, classList: { add() {}, remove() {} }, querySelectorAll: () => [], addEventListener(event, fn) { this[event] = fn; } });
    return elements.get(id);
  };
  let result = { ok: false, status: 403 };
  const context = vm.createContext({ document: { getElementById: element }, location: { hash: '' }, localStorage: { removeItem() {} }, sessionStorage: { getItem: () => 'token' }, confirm: () => true, setTimeout: () => 1, clearTimeout() {}, gmRequest: async () => ({ ...result, json: async () => result.data }) });
  vm.runInContext(script, context);
  vm.runInContext("chars = [{ id: 1, name: 'SimHuman', username: 'testRealPlayer' }, { id: 2, name: 'Other' }]; selected.add(1); selected.add(2);", context);
  await element('del-selected').click();
  assert.equal(vm.runInContext('selected.size', context), 2);
  assert.equal(element('del-selected').disabled, false);
  result = { ok: true, status: 200, data: { ok: true, deleted: 1, skippedOnline: [2], characters: [{ id: 2, name: 'Other' }] } };
  await element('del-selected').click();
  assert.equal(vm.runInContext('selected.size', context), 1);
  assert.equal(vm.runInContext('selected.has(2)', context), true);
  assert.doesNotMatch(html, /SIM_ACCOUNT_RE|safe to delete/);
});

test('GM selection ignores late snapshots and closes watch before offline lookup', async () => {
  const source = (await readFile(new URL('../public/js/gm-console.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '').replace(/\nloadAll\(\);\s*$/, '');
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', dataset: {}, style: {}, addEventListener() {}, querySelectorAll: () => [] });
    return nodes.get(id);
  };
  const pending = [];
  const sockets = [];
  class Socket { constructor() { sockets.push(this); } close() { this.closed = true; } }
  const context = vm.createContext({ $: get, esc: String, harvestGmTokenFromFragment() {}, storedGmToken: () => 'token', storeGmToken() {}, location: { protocol: 'http:', host: 'localhost' }, WebSocket: Socket,
    gmRequest: () => new Promise((resolve) => pending.push((data) => resolve({ status: 200, json: async () => data }))) });
  vm.runInContext(source, context);
  const snapshot = (name, offline = false) => ({ ok: true, offline, player: { name }, skills: {}, equipment: {} });
  const a = vm.runInContext("selectedPlayer = 'A'; loadPlayerView()", context);
  const b = vm.runInContext("selectedPlayer = 'B'; loadPlayerView()", context);
  pending[1](snapshot('B')); await b;
  pending[0](snapshot('A')); await a;
  assert.match(get('gm-player-detail').innerHTML, /B/);
  assert.equal(sockets.length, 1);
  const offline = vm.runInContext("selectedPlayer = 'Offline'; loadPlayerView()", context);
  assert.equal(sockets[0].closed, true);
  pending[2](snapshot('Offline', true)); await offline;
  assert.match(get('gm-player-stream').innerHTML, /offline/);
  assert.equal(sockets.length, 1);
  const stale = vm.runInContext("selectedPlayer = 'OldToken'; loadPlayerView()", context);
  vm.runInContext("saveToken('new')", context);
  pending[3](snapshot('OldToken')); await stale;
  assert.equal(get('gm-player-detail').innerHTML, '');
});

test('admin poll coalesces manual refreshes and never overlaps requests', async () => {
  const source = (await readFile(new URL('../public/js/admin/render.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '').replace(/export /g, '');
  const context = vm.createContext({ $: () => null });
  vm.runInContext(source, context);
  vm.runInContext('var calls = 0; var releases = []; poll = async () => { calls++; await new Promise(resolve => releases.push(resolve)); };', context);
  const first = vm.runInContext('tick(true)', context);
  await vm.runInContext('tick(true)', context);
  await vm.runInContext('tick(true)', context);
  await vm.runInContext('tick()', context);
  assert.equal(vm.runInContext('calls', context), 1);
  vm.runInContext('releases.shift()()', context);
  await first;
  assert.equal(vm.runInContext('calls', context), 2);
  vm.runInContext('releases.shift()()', context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('tickBusy', context), false);
});

test('admin reload explicitly uses POST', async () => {
  const source = await readFile(new URL('../public/js/admin/boot.js', import.meta.url), 'utf8');
  const handler = source.match(/\$\('reload'\)\.addEventListener\('click', (async \(\) => \{[\s\S]*?\n\})\);/)[1];
  let call;
  const context = vm.createContext({ S: {}, renderAll() {}, confirm: () => true, gm: async (...args) => { call = args; return { ok: true, d: { reloaded: 3 } }; }, toast() {}, tick() {} });
  await vm.runInContext('(' + handler + ')()', context);
  assert.equal(call[0], 'admin/reload');
  assert.equal(call[1].method, 'POST');
});
