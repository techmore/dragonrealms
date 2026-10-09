import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transcriptSearchQuery } from '../public/js/search-routing.js';

function harness(sendResult = true) {
  const listeners = {};
  const cmd = { value: 'unfinished draft', selectionStart: 3, selectionEnd: 7,
    addEventListener: (key, fn) => { listeners[key] = fn; },
    focus() { throw new Error('unexpected focus'); },
    setSelectionRange() { throw new Error('unexpected caret change'); } };
  const active = {};
  const document = { activeElement: active, addEventListener: (key, fn) => { listeners[`document:${key}`] = fn; } };
  const elements = { cmd, dpad: { querySelectorAll: () => [] }, completion: { textContent: '' } };
  const sent = [], output = [], searches = [];
  const context = vm.createContext({ document, $: (id) => elements[id],
    send: (msg) => { sent.push(msg); return sendResult; }, append: (...args) => output.push(args),
    handleAutomation: (line) => line.startsWith('macro '),
    settings: { font: 14 }, saveSettings() {}, applySettings() {},
    gameState: { value: 'playing' }, routeTypedCommand: () => false,
    transcriptSearchQuery, searchWith: query => searches.push(query), endScroll() {}, clearTimeout() {}, setInterval() {},
    navigator: {}, window: { addEventListener() {} } });
  const source = readFileSync(new URL('../public/js/input.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
  vm.runInContext(source, context);
  return { context, cmd, document, active, listeners, sent, output, searches };
}

test('programmatic commands dispatch independently of draft, selection and focus', () => {
  const h = harness();
  assert.equal(h.context.pressEnter('look'), true);
  assert.equal(h.sent[0].line, 'look');
  assert.equal(h.cmd.value, 'unfinished draft');
  assert.equal(h.cmd.selectionStart, 3);
  assert.equal(h.cmd.selectionEnd, 7);
  assert.equal(h.document.activeElement, h.active);
});

test('read-only watch blocks gameplay and authentication before login or chargen routing', () => {
  for (const value of ['login', 'playing', 'charcreate', 'charcreate_playing']) {
    const h = harness();
    Object.assign(h.context.gameState, { value, spectating: true, inChargen: true });
    h.context.pressEnter('north');
    h.context.pressEnter('login user secret');
    assert.equal(h.sent.length, 0);
    assert.ok(h.output.some(([text]) => text.includes('Watch mode is read-only')));
    assert.equal(h.output.some(([text]) => text.includes('secret')), false);
    assert.equal(h.cmd.value, 'unfinished draft');
    assert.equal(h.cmd.selectionStart, 3);
    assert.equal(h.cmd.selectionEnd, 7);
  }
});

test('input routing sends corpse inspection and keeps explicit transcript search local', () => {
  const h = harness();
  h.context.pressEnter('search corpse');
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].line, 'search corpse');
  assert.equal(h.searches.length, 0);
  h.context.pressEnter('find corpse');
  h.context.pressEnter('search bank');
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.searches, ['corpse', 'bank']);
  assert.equal(h.cmd.value, 'unfinished draft');
});

test('failed typed sends preserve exact draft and selection across protocol states', () => {
  for (const [state, inChargen, line] of [
    ['playing', false, '  look  '], ['login', false, 'login user secret'],
    ['login', false, 'register user secret'], ['charselect', false, '2'],
    ['charcreate', true, 'name Ada'], ['charcreate_playing', true, 'alloc str 1'],
    ['charcreate_playing', true, 'enter'], ['playing', false, 'logout'],
  ]) {
    const h = harness(false);
    Object.assign(h.context.gameState, { value: state, inChargen });
    h.cmd.value = line;
    h.listeners.keydown({ key: 'Enter' });
    assert.equal(h.cmd.value, line);
    assert.equal(h.cmd.selectionStart, 3);
    assert.equal(h.cmd.selectionEnd, 7);
    assert.equal(vm.runInContext('history.length', h.context), 0);
    assert.equal(h.output.some(([text]) => text.includes('secret')), false);
  }
});

test('successful typed and local offline commands clear input; credentials stay out of history', () => {
  const h = harness();
  h.cmd.value = 'login user secret';
  h.context.gameState.value = 'login';
  h.listeners.keydown({ key: 'Enter' });
  assert.equal(h.cmd.value, '');
  assert.equal(vm.runInContext('history.length', h.context), 0);
  assert.match(h.output[0][0], /credentials hidden/);
  const offline = harness(false);
  offline.cmd.value = 'macro scout look';
  offline.listeners.keydown({ key: 'Enter' });
  assert.equal(offline.cmd.value, '');
  assert.equal(offline.sent.length, 0);
});

test('native Ctrl/Cmd zoom passes through; Alt modifier controls terminal font', () => {
  const h = harness();
  for (const modifier of ['ctrlKey', 'metaKey']) {
    for (const key of ['=', '+', '-', '0']) {
      let prevented = false;
      const event = { key, [modifier]: true, target: h.cmd, preventDefault() { prevented = true; } };
      h.listeners['document:keydown'](event);
      assert.equal(prevented, false);
      event.altKey = true;
      h.listeners['document:keydown'](event);
      assert.equal(prevented, true);
    }
  }
  assert.equal(h.context.settings.font, 14);
});
