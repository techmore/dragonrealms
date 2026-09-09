import test from 'node:test';
import assert from 'node:assert/strict';
import { pushStarterScripts } from '../server/starter-scripts.js';
import { createRunner } from '../public/js/script-engine.js';

test('starter arrival route is guarded by its actual town origin', () => {
  for (const guild of ['barbarian', 'warmage']) {
    const messages = [];
    const player = { guild: { id: guild }, race: { id: 'human' }, room: 'square', name: 'RouteAudit', scripts: {} };
    assert.equal(pushStarterScripts({ send: m => messages.push(m) }, player), true);
    const hunt = player.scripts.autohunt;
    const route = hunt.slice(hunt.indexOf('\nARMED:') + 1, hunt.indexOf('\nARMED_FROM_BAZAAR:'));
    assert.match(route, /ifne room square goto ARMED_ANYWHERE/);
    assert.match(route, /move /);
    const shop = hunt.slice(hunt.indexOf('\nGETWEAPON:') + 1, hunt.indexOf('\nBUY_SKIP:'));
    assert.match(shop, /move /, 'fresh unarmed characters need a route to the shop');
    const armed = hunt.slice(hunt.indexOf('\nARMED_FROM_BAZAAR:') + 1, hunt.indexOf('\nARMED_HERE:'));
    assert.match(armed, /move /, 'newly equipped characters need a route to the arena');
    const commands = [];
    const runner = createRunner(route + '\nARMED_ANYWHERE:\nexit\nSCAN:\nexit', [], {
      send: line => commands.push(line), roomNow: () => 'square',
    });
    runner.start();
    assert.ok(commands.length > 0, `${guild} should take the first outbound step`);
    runner.stop();
    assert.equal(messages.at(-1).t, 'autorun');
  }
});
