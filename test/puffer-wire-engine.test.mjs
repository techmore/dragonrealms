// Contract fixtures, NOT earned-circle or gameplay evidence. Only temporary DB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { auth, createCharacter, loadPlayer, fakeWs, game, setupGame, teardownGame } from './helpers.mjs';
import { status } from '../server/status.js';
import { parseWirePrompt } from '../puffer_adapter/wire_observation.mjs';

before(setupGame);
after(teardownGame);

test('ordinary engine prompts preserve Barbarian requirements through target Circle 20', async () => {
  const account = await auth.registerAccount('Wirecontract', 'test-only-password');
  const id = createCharacter(account.accountId, { name: 'Wirecontract', race: 'gortog', guild: 'barbarian' });
  const p = loadPlayer(id);
  p.ws = fakeWs();
  for (let circle = 1; circle <= 20; circle++) {
    // Shape coverage only: this does not claim a character earned these circles.
    p.circle = circle;
    status.status(game, p);
    const frame = p.ws.msgs.filter(m => m.t === 'prompt').at(-1);
    const parsed = parseWirePrompt(frame);
    assert.equal(parsed.valid, true, `Circle ${circle}: ${parsed.reason}`);
    assert.equal(parsed.vitals.circle, circle);
    assert.equal(parsed.vitals.resource, 'fire');
    assert.equal(parsed.requirements.circle, circle + 1);
    assert.deepEqual(parsed.requirements.rows, frame.requirements.rows.map(({label, have, need}) => ({label, have, need})));
    assert.equal(parsed.exact_skill_exp, null);
  }
  p.boostMult = 20;
  status.status(game, p);
  assert.equal(parseWirePrompt(p.ws.msgs.filter(m => m.t === 'prompt').at(-1)).reason, 'boosted_session');
});
