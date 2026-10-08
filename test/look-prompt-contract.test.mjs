import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
// Helpers establish a private temporary DB before importing game modules.
import { setupGame, teardownGame, auth, createCharacter, loadPlayer, fakeWs, handleCommand } from './helpers.mjs';
let game, player, ws;
before(async () => {
  game = setupGame();
  const account = await auth.registerAccount('LookPromptContract', 'fixture-only-password');
  player = loadPlayer(createCharacter(account.accountId, { name: 'LookPromptContract', race: 'human', guild: 'barbarian' }));
  ws = fakeWs(); player.ws = ws; game.addPlayer(player);
});
after(() => teardownGame());

function invoke(line) {
  ws.msgs.length = 0;
  handleCommand(game, player, line, 0, { applyRT: true });
  return ws.msgs;
}

test('look, around and at emit one current prompt after the native room', () => {
  for (const line of ['look', 'look around', 'look at']) {
    player.rtUntil = 0;
    const messages = invoke(line);
    assert.deepEqual(messages.filter(message => ['room', 'prompt'].includes(message.t)).map(message => message.t), ['room', 'prompt'], line);
    assert.equal(messages[0].roomId, player.room);
    assert.equal(player.rtUntil, 0, 'passive look creates no RT');
  }
});

test('object and directional look emit one prompt after their native prose', () => {
  for (const [line, pattern] of [['look crier', /town crier/i], ['look n', /You peer north into/], ['look nonexistent', /nothing special/]]) {
    const messages = invoke(line);
    assert.deepEqual(messages.filter(message => ['msg', 'prompt'].includes(message.t)).map(message => message.t), ['msg', 'prompt'], line);
    assert.match(messages[0].msg, pattern);
  }
});

test('all look paths remain available during RT and preserve its current deadline', t => {
  const now = Date.now(); t.mock.method(Date, 'now', () => now);
  const deadline = now + 5000;
  for (const line of ['look', 'look around', 'look at', 'look crier', 'look n']) {
    player.rtUntil = deadline;
    const messages = invoke(line);
    assert.equal(messages.filter(message => message.t === 'prompt').length, 1, line);
    const prompt = messages.find(message => message.t === 'prompt');
    assert.ok(messages.indexOf(prompt) > messages.findIndex(message => ['room', 'msg'].includes(message.t)));
    assert.match(prompt.msg.replace(/\x1b\[[0-9;]*m/g, ''), /RT: 5/);
    assert.equal(player.rtUntil, deadline, 'passive look does not consume or reset active RT');
    assert.ok(messages.every(message => !/You must wait/.test(message.msg)), line);
  }
});
