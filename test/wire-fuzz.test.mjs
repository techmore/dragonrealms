// Wire-level robustness: every client message type is fed malformed payloads
// (wrong types, prototype keys, huge strings, nested junk) at every session
// state. The contract is simple — no payload may escape as a SESSION_ERROR
// ("Something went wrong") or a thrown exception; the player gets a plain
// refusal instead. These are the shapes a hostile or buggy client sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupGame, teardownGame, auth, createCharacter, fakeWs, game as sharedGame } from './helpers.mjs';

const { route } = await import('../server/session.js');
const { COMMAND_REGISTRY_METADATA } = await import('../server/commands/index.js');

const game = setupGame();
let counter = 0;

function makeSession(state = 'login', extra = {}) {
  const socket = fakeWs();
  const messages = socket.msgs;
  const session = {
    socket, game, state, token: null, accountId: null, username: null, player: null,
    gmToken: 'gm-secret', gmOperatorToken: 'gm-secret', gmAdminToken: 'gm-secret', gmPlayToken: 'gm-secret',
    agentBoostEnabled: false, isBot: false, charCreate: null,
    inputTimestamps: [], controlTimestamps: [], authTimestamps: [],
    authTimer: null, authTimeoutMs: 30_000, authGeneration: 0,
    gmAuthorized: false, stateBeforeSpectate: null,
    messages,
    send: (obj) => messages.push(obj),
    ...extra,
  };
  socket.drSession = session;
  return session;
}

async function accountSession(state = 'charselect') {
  const name = `fuzz${++counter}`;
  const reg = await auth.registerAccount(name, 'fuzz-password-1');
  assert.ok(reg.ok, reg.error);
  const login = await auth.loginAccount(name, 'fuzz-password-1');
  assert.ok(login.ok);
  const session = makeSession(state, { accountId: login.accountId, username: login.username, token: login.token });
  return session;
}

async function playingSession() {
  const session = await accountSession('charselect');
  const charId = createCharacter(session.accountId, { name: `Fuzzer${String.fromCharCode(64 + counter)}`, race: 'human', guild: 'barbarian' });
  route(session, { t: 'charselect', id: String(charId) });
  assert.equal(session.state, 'playing', 'fixture should enter the world');
  assert.ok(session.player);
  session.messages.length = 0;
  return session;
}

const JUNK = [
  undefined, null, true, 0, -1, 1.5, NaN, '', ' ', 'x'.repeat(100_000),
  '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty',
  [], [1, 2], {}, { a: 1 }, { __proto__: { evil: true } },
  '\u0000', '\ud800', '%s%s%n', '../../etc/passwd',
];

const MESSAGE_TYPES = ['login', 'register', 'token', 'charselect', 'charcreate', 'alloc', 'enter',
  'spectate', 'worldwatch', 'unspectate', 'logout', 'panel_request', 'input', 'ping',
  'gen_starter', 'scripts_put', 'scripts_del', 'boost', 'gm_play', 'nonsense'];

const FIELD_NAMES = ['u', 'p', 'token', 'id', 'name', 'race', 'guild', 'city', 'stat', 'amt', 'gmToken',
  'requestId', 'panel', 'line', 'body', 'mult', 'boost'];

function sessionErrors(session) {
  return session.messages.filter((m) => m.t === 'error' && m.code === 'SESSION_ERROR');
}

async function fuzzOne(session, msg) {
  // Reset the per-second limiter so a long fuzz loop is not refused as spam.
  session.inputTimestamps = []; session.controlTimestamps = []; session.authTimestamps = [];
  session.messages.length = 0;
  let threw = null;
  try { await route(session, msg); }
  catch (e) { threw = e; }
  const label = JSON.stringify(msg, (k, v) => (typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '…' : v));
  assert.equal(threw, null, `route threw for ${label}: ${threw && threw.stack}`);
  assert.deepEqual(sessionErrors(session), [], `SESSION_ERROR for ${label} in state ${session.state}`);
}

test('malformed envelopes are refused without a session error', async () => {
  const session = makeSession('login');
  for (const junk of [...JUNK, { t: 5 }, { t: null }, { t: {} }, { t: [] }]) {
    await fuzzOne(session, junk);
  }
  assert.equal(session.state, 'login');
});

test('every message type survives junk fields in the login state', async () => {
  const session = makeSession('login');
  for (const t of MESSAGE_TYPES) {
    await fuzzOne(session, { t });
    for (const field of FIELD_NAMES) {
      for (const junk of JUNK) await fuzzOne(session, { t, [field]: junk });
    }
  }
});

test('character selection and creation reject junk ids, races and guilds', async () => {
  const session = await accountSession('charselect');
  for (const junk of JUNK) await fuzzOne(session, { t: 'charselect', id: junk });
  assert.equal(session.state, 'charselect');
  route(session, { t: 'charselect', id: 'new' });
  assert.equal(session.state, 'charcreate');
  for (const race of JUNK) {
    for (const guild of [undefined, 'barbarian', ...JUNK.slice(0, 16)]) {
      await fuzzOne(session, { t: 'charcreate', name: 'Fuzzname', race, guild });
      assert.equal(session.state, 'charcreate', `junk race ${String(race).slice(0, 20)} must not create a character`);
    }
  }
  for (const name of JUNK) {
    if (/^[a-zA-Z]{2,20}$/.test(String(name))) continue; // "toString" is a legal name
    await fuzzOne(session, { t: 'charcreate', name, race: 'human' });
    assert.equal(session.state, 'charcreate', `junk name must not create a character`);
  }
  // A valid creation still works after all that noise.
  route(session, { t: 'charcreate', name: `Survivor${String.fromCharCode(64 + counter)}`, race: 'elf' });
  assert.equal(session.state, 'charcreate_playing');
  for (const stat of JUNK) for (const amt of JUNK.slice(0, 12)) await fuzzOne(session, { t: 'alloc', stat, amt });
  await fuzzOne(session, { t: 'alloc', stat: 'str', amt: 1e308 });
  await fuzzOne(session, { t: 'alloc', stat: 'str', amt: '1e3' });
  route(session, { t: 'enter' });
  assert.equal(session.state, 'playing');
});

test('playing sessions survive junk in every control-plane field', async () => {
  const session = await playingSession();
  for (const t of MESSAGE_TYPES) {
    if (t === 'logout' || t === 'login' || t === 'register' || t === 'token') continue;
    await fuzzOne(session, { t });
    for (const field of FIELD_NAMES) {
      for (const junk of JUNK) await fuzzOne(session, { t, [field]: junk });
    }
    assert.equal(session.state, 'playing', `${t} must not knock the session out of the world`);
  }
});

test('every registered verb tolerates junk arguments', async () => {
  const session = await playingSession();
  const verbs = [...COMMAND_REGISTRY_METADATA.keys()];
  const args = ['', ' ', 'x'.repeat(300), '__proto__', 'constructor', '-1', '0', '1e9', 'NaN', '%s',
    '\u0000', 'a b c d e f g', '; ; ;', '$1 $2', 'all', 'me', 'self'];
  for (const verb of verbs) {
    for (const arg of args) {
      await fuzzOne(session, { t: 'input', line: `${verb} ${arg}` });
      await fuzzOne(session, { t: 'input', line: `${verb} ${arg} ${arg}` });
    }
  }
});

test('prototype keys are not races, guilds, aliases or verbs', async () => {
  const session = await accountSession('charcreate');
  route(session, { t: 'charcreate', name: 'Protoname', race: 'constructor' });
  assert.equal(session.state, 'charcreate');
  assert.match(session.messages.at(-1).msg, /^Unknown race/);
  session.messages.length = 0;
  route(session, { t: 'charcreate', name: 'Protoname', race: 'human', guild: '__proto__' });
  assert.equal(session.state, 'charcreate');
  assert.match(session.messages.at(-1).msg, /^Unknown guild/);

  const playing = await playingSession();
  for (const verb of ['__proto__', 'constructor', 'hasOwnProperty', 'toString']) {
    await fuzzOne(playing, { t: 'input', line: verb });
    assert.ok(playing.messages.some((m) => /I do not know the command/.test(m.msg)), `${verb} should be an unknown verb`);
    await fuzzOne(playing, { t: 'input', line: `alias ${verb} look` });
    await fuzzOne(playing, { t: 'input', line: verb });
    await fuzzOne(playing, { t: 'input', line: `unalias ${verb}` });
  }
  // "__proto__" fails the alias-name rule, so it can never be set or removed.
  await fuzzOne(playing, { t: 'input', line: 'unalias __proto__' });
  assert.ok(playing.messages.some((m) => /No such alias/.test(m.msg)));
  assert.equal(playing.state, 'playing');
});

test('junk command lines never raise a session error', async () => {
  const session = await playingSession();
  for (const junk of JUNK) await fuzzOne(session, { t: 'input', line: junk });
  for (const line of [';'.repeat(500), 'go ' + 'n;'.repeat(400), 'alias x x; x', 'alias $1 $1', 'look '.repeat(200)]) {
    await fuzzOne(session, { t: 'input', line });
  }
});

test.after(() => teardownGame());
