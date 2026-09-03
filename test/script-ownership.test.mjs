// Audit C6 regression: a stale/superseded socket (state still 'playing', but
// its Player object no longer owns the character in game.players) must not be
// able to mutate persisted scripts through scripts_put / scripts_del /
// gen_starter. The 'input' path already guards with
// `session.game.players.get(p.charId) === session.player`; these handlers now
// use the same predicate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, createCharacter, loadPlayer, fakeWs,
  game, setupGame, teardownGame,
} from './helpers.mjs';
import { putScript } from '../server/player.js';
import { route } from '../server/session.js';

before(() => setupGame());
after(() => teardownGame());

function makeChar(name, guild = 'barbarian', race = 'human') {
  return auth.registerAccount(name, 's3cretword').then((acc) => {
    const charId = createCharacter(acc.accountId, { name, race, guild });
    return loadPlayer(charId);
  });
}

// C17-shape fabricated session (same fields audit-fixes.test.mjs uses).
function makeSession(player) {
  const send = [];
  return {
    session: {
      socket: { readyState: 1, send: () => {} },
      state: 'playing', token: null, accountId: null, username: null,
      player, gmToken: 'x', isBot: false, charCreate: null,
      cmdTimestamps: [], authGeneration: 0, gmAuthorized: false,
      stateBeforeSpectate: null, game,
      send: (o) => send.push(o),
    },
    send,
  };
}

test('C6: stale session cannot putScript through route()', async () => {
  const p = await makeChar('ScriptOwner');
  const { session, send } = makeSession(p); // NOT addPlayer'd — stale socket

  route(session, { t: 'scripts_put', name: 'x', body: 'move n' });

  const errs = send.filter((m) => m.t === 'error');
  assert.equal(errs.length, 1, 'exactly one error is sent');
  assert.equal(errs[0].msg, 'This character is no longer active in this session.');
  assert.equal(send.some((m) => m.t === 'scripts'), false, 'no scripts ack on the stale path');

  // Persistence untouched: putScript() writes through immediately, so a fresh
  // load would have picked the script up had the guard been missing.
  const fresh = loadPlayer(p.charId);
  assert.equal(fresh.scripts.x, undefined, 'script "x" was NOT persisted');
});

test('C6: stale session cannot delScript through route()', async () => {
  const p = await makeChar('ScriptKeeper');
  putScript(p, 'keep', 'look'); // direct API write — persists immediately
  const { session, send } = makeSession(p);

  route(session, { t: 'scripts_del', name: 'keep' });

  const errs = send.filter((m) => m.t === 'error');
  assert.equal(errs.length, 1, 'exactly one error is sent');
  assert.equal(errs[0].msg, 'This character is no longer active in this session.');
  assert.equal(send.some((m) => m.t === 'scripts'), false, 'no scripts ack on the stale path');

  const fresh = loadPlayer(p.charId);
  assert.equal(fresh.scripts.keep, 'look', 'script "keep" survived the stale delete');
});

test('C6: stale session cannot gen_starter through route()', async () => {
  const p = await makeChar('ScriptStarter');
  const { session, send } = makeSession(p);

  route(session, { t: 'gen_starter' });

  const errs = send.filter((m) => m.t === 'error');
  assert.equal(errs.length, 1, 'exactly one error is sent');
  assert.equal(errs[0].msg, 'This character is no longer active in this session.');
  assert.equal(send.some((m) => m.t === 'autorun'), false, 'no autorun pushed to the stale socket');
  assert.equal(send.some((m) => m.t === 'scripts'), false, 'no scripts pushed to the stale socket');

  const fresh = loadPlayer(p.charId);
  assert.equal(fresh.scripts.autohunt, undefined, 'starter library was NOT persisted');
});

test('C6: a properly-owned session can still save scripts through route()', async () => {
  const p = await makeChar('ScriptLive');
  p.ws = fakeWs();
  game.addPlayer(p); // real runtime ownership
  const { session, send } = makeSession(p);

  route(session, { t: 'scripts_put', name: 'pos', body: 'move n' });

  const errs = send.filter((m) => m.t === 'error');
  assert.equal(errs.length, 0, 'no error on the owned path');
  const ack = send.find((m) => m.t === 'scripts');
  assert.ok(ack, 'scripts ack sent');
  assert.equal(ack.scripts.pos, 'move n', 'ack carries the new script');

  const fresh = loadPlayer(p.charId);
  assert.equal(fresh.scripts.pos, 'move n', 'script persisted through the owned session');

  game.removePlayer(p);
});
