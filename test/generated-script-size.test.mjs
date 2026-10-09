import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as h from './helpers.mjs';
import { compactScriptLabels, buildHuntScript } from '../scripts/lib/script-gen.mjs';
import { parseScript, createRunner } from '../public/js/script-engine.js';
import { GUILD_SCRIPTS } from '../data/guild-scripts.js';
const { putScript } = await import('../server/player.js');
h.setupGame(); after(() => h.teardownGame());
// Exact terminal RC9 Barbarian baseline body: previously rejected by putScript.
const original = readFileSync(new URL('./fixtures/barbarian-overlimit-hunt.dr', import.meta.url), 'utf8');

function controlFlow(source) {
  const parsed = parseScript(source);
  return parsed.lines.map(line => {
    const parts = line.split(' ');
    let i;
    if (['match', 'matchre', 'goto'].includes(parts[0])) i = 1;
    else if (/^(iflt|ifge|ifgt)$/.test(parts[0])) i = parts[3] === 'goto' ? 4 : 3;
    else if (/^(ife|ifne)$/.test(parts[0]) && parts[3] === 'goto') i = 4;
    else if (/^if_\d+$/.test(parts[0]) && parts.length <= 3) i = parts[1] === 'goto' ? 2 : 1;
    if (i !== undefined && parts[i] && Object.hasOwn(parsed.labels, parts[i].toLowerCase()))
      parts[i] = `@${parsed.labels[parts[i].toLowerCase()]}`;
    return parts.join(' ');
  });
}

test('overlimit native baseline compaction preserves instructions, branch destinations and diagnostic lines', () => {
  assert.equal(original.length, 21801);
  const compact = compactScriptLabels(original);
  assert.ok(compact.length <= 16000, compact.length);
  assert.equal(compact.split('\n').length, original.split('\n').length);
  assert.deepEqual(controlFlow(compact), controlFlow(original));
  assert.deepEqual(parseScript(compact).sourceLines, parseScript(original).sourceLines);
  assert.deepEqual(parseScript(compact).diagnostics, []);
  assert.equal(compactScriptLabels('START:\n  put look\n  wait\nexit'), 'START:\n  put look\n  wait\nexit');
});

test('compaction changes only syntactic references, retaining literal label words in native commands and regexes', () => {
  const source = '# START stays prose\nSTART:\n  matchre DONE START|DONE is here\n  put echo DONE\n  if_3 put echo DONE\n  ifge hp 1 goto DONE\n  matchwait 1\nDONE:\n  exit';
  const compact = compactScriptLabels(source, 1);
  assert.match(compact, /matchre L1 START\|DONE is here/);
  assert.match(compact, /put echo DONE/);
  assert.match(compact, /if_3 put echo DONE/);
  assert.deepEqual(controlFlow(compact), controlFlow(source));
  const sent = [], runner = createRunner(compact, [], { send: line => sent.push(line) }).start();
  runner.feed('START is here', 'msg');
  assert.deepEqual(sent, ['echo DONE']); assert.equal(runner.running, false);
});

test('previously rejected baseline body saves and reloads through the real native persistence policy after compaction', async () => {
  const account = await h.auth.registerAccount('Sizefixture', 'isolated-test-password');
  const p = h.loadPlayer(h.createCharacter(account.accountId, { name: 'Sizefixture', race: 'human', guild: 'barbarian' }));
  assert.deepEqual(putScript(p, 'fixturehunt', original), { ok: false, error: 'Script too large (max 16000 characters).' });
  assert.equal(Object.hasOwn(p.scripts, 'fixturehunt'), false);
  const compact = compactScriptLabels(original);
  assert.deepEqual(putScript(p, 'fixturehunt', compact), { ok: true });
  const loaded = h.loadPlayer(p.charId);
  assert.equal(loaded.scripts.fixturehunt, compact);
  assert.deepEqual(controlFlow(loaded.scripts.fixturehunt), controlFlow(original));
});

test('every generated branch opcode preserves forward/backward destinations even with existing compact-looking labels', () => {
  const source = ['START:', '  goto LONG_FORWARD', 'L0:', '  iflt hp 1 START',
    '  ifge hp 1 goto LONG_FORWARD', '  ifgt hp 1 START', '  ife room L0 goto LONG_FORWARD',
    '  ifne room START goto L0', '  if_1 goto START', '  if_2 L0',
    '  match LONG_FORWARD START', '  matchre L0 LONG_FORWARD|START',
    '  matchwait 1', 'LONG_FORWARD:', '  goto L0'].join('\n');
  const compact = compactScriptLabels(source, 1);
  assert.deepEqual(controlFlow(compact), controlFlow(source));
  const parsed = parseScript(compact);
  assert.equal(Object.keys(parsed.labels).length, 3);
  assert.deepEqual(parsed.diagnostics, []);
  assert.match(compact, /ife room L0 goto L2/); // condition value is literal, not a branch label
  assert.match(compact, /matchre L1 LONG_FORWARD\|START/);
});

test('representative eight-room generated baseline hunts remain inside unchanged native body and WS limits for every guild', () => {
  for (const guild of Object.keys(GUILD_SCRIPTS)) {
    const source = buildHuntScript({ cap: { guild, char: 'Sizefixture', circle: 1, scriptBase: 'fixture', defensiveKit: guild === 'barbarian' },
      arena: { id: 'sewers_1', fromArmed: [] }, hallPath: [],
      candidates: ['sewers_2', 'sewers_3', 'sewers_4', 'marsh_1', 'marsh_2', 'marsh_3', 'goblin_path', 'fields_furrow'].map(id => ({ id, fromHere: [] })) });
    assert.ok(source.length <= 16000, `${guild}: ${source.length}`);
    assert.ok(Buffer.byteLength(JSON.stringify({ t: 'scripts_put', name: 'fixturehunt', body: source })) < 65536);
    assert.deepEqual(parseScript(source).diagnostics, [], guild);
  }
});
