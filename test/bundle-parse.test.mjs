// C5 regression: a malformed inventory.bundle value must not brick loadPlayer.
// Other optional persistent fields degrade defensively (see persistence.test.mjs
// 'corrupt optional persistent state'); inventory.bundle was missed. The
// consuming code (totalBurden, fold/unbundle, addItem bundle-merge) treats an
// absent/falsy entry.bundle as an unbundled stack, so a corrupt value should
// degrade to exactly that shape — the row stays, unbundleable and stackable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth, db, createCharacter, loadPlayer, setupGame, teardownGame,
} from './helpers.mjs';

const { addItem, savePlayer } = await import('../server/player.js');

before(() => setupGame());
after(() => teardownGame());

test('malformed inventory.bundle degrades to an unbundled stack on load', () => {
  return (async () => {
    const account = await auth.registerAccount('Bundlebad', 's3cretword');
    const charId = createCharacter(account.accountId, {
      name: 'Tiedup', race: 'human', guild: 'barbarian',
    });

    db.prepare('INSERT INTO inventory (character_id, item_id, qty, bundle) VALUES (?,?,?,?)')
      .run(charId, 'arrows', 5, '{bad');

    let p;
    assert.doesNotThrow(() => { p = loadPlayer(charId); }, 'corrupt bundle must not throw during load');
    assert.equal(typeof p, 'object');
    assert.ok(Array.isArray(p.inventory), 'inventory must load as an array');

    // The row survives — degraded to unbundled, not dropped.
    const entry = p.inventory.find((e) => e.item.id === 'arrows');
    assert.ok(entry, 'stackable row with corrupt bundle is still carried');
    assert.equal(entry.qty, 5);
    assert.ok(!('bundle' in entry) || entry.bundle == null,
      'corrupt bundle degrades to the same shape as no bundle (unbundled)');
  })();
});

test('a valid bundle still round-trips through save and load', () => {
  return (async () => {
    const account = await auth.registerAccount('Bundleok', 's3cretword');
    const charId = createCharacter(account.accountId, {
      name: 'Neatpack', race: 'human', guild: 'barbarian',
    });
    const p = loadPlayer(charId);

    addItem(p, 'arrows', 4, { bundle: { bundled: 4 } });
    savePlayer(p);

    const reloaded = loadPlayer(charId);
    const entry = reloaded.inventory.find((e) => e.item.id === 'arrows');
    assert.ok(entry, 'bundled stack is present after reload');
    assert.equal(entry.qty, 4);
    assert.deepEqual(entry.bundle, { bundled: 4 }, 'legitimate bundle data survives save+load');
  })();
});
