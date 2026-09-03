// DR-script engine suite: labels, put/move/wait/waitfor/match/matchwait/
// goto/pause/echo/exit, %1..%9 args, %vars, IF_n.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, createRunner } from '../public/js/script-engine.js';

const feed = (r, line, isPrompt = false) => r.feed(line, isPrompt);

test('parseScript collects labels and skips comments', () => {
  const { labels, lines } = parseScript('# hi\nfoo:\n  put look\nbar:\necho x\n');
  assert.deepEqual(labels, { foo: 0, bar: 1 });
  assert.deepEqual(lines, ['put look', 'echo x']);
});

test('echo + put sequence runs to completion', () => {
  const out = [];
  const say = [];
  const r = createRunner('echo hello\nput look\nput attack rat\nexit', [], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(out, ['look', 'attack rat']);
  assert.deepEqual(say, ['hello']);
  assert.equal(r.running, false);
});

test('wait blocks until a prompt then continues', () => {
  const out = [];
  const r = createRunner('put look\nwait\nput attack rat', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['look'], 'blocked before prompt');
  assert.equal(r.running, true);
  feed(r, 'HP: 100/100', true);
  assert.deepEqual(out, ['look', 'attack rat']);
  assert.equal(r.running, false);
});

test('waitfor resumes on matching text', () => {
  const out = [];
  const r = createRunner('put forage\nwaitfor roundtime\nput skin', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['forage']);
  feed(r, 'You find a wild ginseng here.');
  assert.deepEqual(out, ['forage'], 'unrelated text ignored');
  feed(r, 'Roundtime: 5 seconds.');
  assert.deepEqual(out, ['forage', 'skin']);
});

test('match/matchwait jumps to the matched label', () => {
  const out = [];
  const say = [];
  const r = createRunner(
    'putaway:\nmatch putaway ...wait\nmatch done You find\nput forage\nmatchwait\ndone:\necho done\nexit',
    [], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  // first attempt: "...wait" roundtime -> retry the putaway label
  feed(r, '...wait');
  assert.equal(out.join(','), 'forage,forage', 'retried via the putaway label');
  // second attempt succeeds -> jump to done
  feed(r, 'You find a bunch of wild herbs.');
  assert.deepEqual(say, ['done']);
  assert.equal(r.running, false);
});

test('%1..%9 run args and %var substitution', () => {
  const out = [];
  const say = [];
  const r = createRunner(
    'echo Targeting %1 with %weapon\nsetvariable weapon sword\nput attack %1\nput wield %weapon\nexit',
    ['goblin'], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(say, ['Targeting goblin with %weapon']); // set after echo
  assert.deepEqual(out, ['attack goblin', 'wield sword']);
});

test('if_n runs only when the arg is present', () => {
  const out = [];
  const say = [];
  const r = createRunner('if_1 put look at %1\nif_2 put look at %2\nexit', ['rat'], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(out, ['look at rat']);
});

test('move waits for a room, nextroom too', () => {
  const out = [];
  const r = createRunner('move n\nput look\nexit', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['n']);
  feed(r, '[[Sewer Entrance, Old Sewers]]\nObvious paths: up, north.', 'room');
  assert.deepEqual(out, ['n', 'look']);
});

test('pause waits the given seconds (timer mode)', () => {
  const out = [];
  const r = createRunner('put look\npause 0.01\nput attack', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['look'], 'paused');
  feed(r, '', false); // heartbeat before expiry does nothing
  assert.deepEqual(out, ['look']);
  setTimeout(() => {
    feed(r, '', false); // after expiry resumes
    assert.deepEqual(out, ['look', 'attack']);
  }, 30);
});

test('unknown command echoes an error but keeps going', () => {
  const say = [];
  const r = createRunner('wibble\nput look\nexit', [], { say: (t) => say.push(t) });
  r.start();
  assert.ok(say[0].includes('unknown command'));
});

test('prompts mirror game state into %hp/%maxhp/%circle/%rt/%combat', () => {
  const out = [];
  const say = [];
  const r = createRunner('wait\necho HP=%hp MAX=%maxhp C=%circle RT=%rt COMBAT=%combat\nexit', [],
    { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  feed(r, '\x1b[32mHP: 42/100  Mana: 0/0  Stamina: 55/70  RT: 3  Circle 2  120 silvers [COMBAT]\x1b[0m', true);
  assert.deepEqual(say, ['HP=42 MAX=100 C=2 RT=3 COMBAT=1']);
});

test('iflt/ifge branch on live prompt vars', () => {
  const out = [];
  const src = 'put attack\nwait\niflt hp 35 goto FLED\nput press\nexit\nFLED:\nput flee\nexit';
  const r = createRunner(src, [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['attack']);
  feed(r, 'HP: 80/100  Circle 1  RT: 0', true); // healthy -> press
  assert.deepEqual(out, ['attack', 'press']);
  const out2 = [];
  const hurt = createRunner(src, [], { send: (l) => out2.push(l) });
  hurt.start();
  feed(hurt, 'HP: 20/100  Circle 1  RT: 0', true); // hurt -> FLED branch
  assert.deepEqual(out2, ['attack', 'flee']);
});

test('ifge takes the branch only when the var clears the bar', () => {
  const low = [];
  const r = createRunner('wait\nifge circle 2 goto HIGH\nput lowcircle\nexit\nHIGH:\nput highcircle\nexit', [], { send: (l) => low.push(l) });
  const high = [];
  const r2 = createRunner('wait\nifge circle 2 goto HIGH\nput lowcircle\nexit\nHIGH:\nput highcircle\nexit', [], { send: (l) => high.push(l) });
  r.start(); r2.start();
  feed(r, 'HP: 50/50  Circle 1', true);
  feed(r2, 'HP: 60/60  Circle 2', true);
  assert.deepEqual(low, ['lowcircle']);
  assert.deepEqual(high, ['highcircle']);
});

test('move retries after a roundtime rejection instead of hanging', async () => {
  const out = [];
  const r = createRunner('move north\nmove east', [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, ['north']);
  feed(r, 'You are not ready to do that. Wait for roundtime!', 'error');
  assert.deepEqual(out, ['north'], 'blocked, retry scheduled');
  await new Promise((res) => setTimeout(res, 1600));
  feed(r, '', false); // heartbeat
  assert.deepEqual(out, ['north', 'north'], 're-sent the move');
  feed(r, '[[Town Green, Crossing]] You walk north.', 'room');
  assert.deepEqual(out, ['north', 'north', 'east'], 'continues after room event');
});

test('combat-blocked moves retry, then fall through so the script reacts', async () => {
  const out = [];
  const say = [];
  const r = createRunner('move north\nmove north\necho arrived', [],
    { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(out, ['north']);
  feed(r, 'Creatures block your path — flee, fall back, or fight on.', 'msg');
  await new Promise((res) => setTimeout(res, 1300));
  feed(r, '', false); // heartbeat fires the retry
  assert.deepEqual(out, ['north', 'north'], 'first retry');
  for (let i = 0; i < 3; i++) { // keeps failing -> gives up after 2 retries
    feed(r, 'Creatures block your path — flee, fall back, or fight on.', 'msg');
    await new Promise((res) => setTimeout(res, 1300));
    feed(r, '', false);
  }
  assert.ok(out.filter((l) => l === 'north').length >= 3, 'retried at least twice: ' + JSON.stringify(out));
  assert.deepEqual(say, ['arrived'], 'fell through past the whole move chain');
});

test('dead-end move abandons the rest of the chain; later chains still move', () => {
  const out = [];
  const say = [];
  const r = createRunner('move north\nmove east\nmove north\nput look\nwait\nmove south\nexit', [],
    { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.deepEqual(out, ['north']);
  feed(r, 'You cannot go that way.', 'error');
  assert.deepEqual(out, ['north', 'look'],
    'no retry on a wrong turn — skipped straight to the reaction step');
  feed(r, 'HP: 50/50  Circle 1  RT: 0', true); // satisfies the wait
  assert.deepEqual(out, ['north', 'look', 'south'], 'a fresh chain moves again');
});

test('putrun nests a sub-script; exit returns to the caller', () => {
  const out = [];
  const say = [];
  const r = createRunner(
    'echo outer\nputrun sub\necho resumed\nexit',
    [], {
      send: (l) => out.push(l), say: (t) => say.push(t),
      getScript: (n) => n === 'sub' ? 'put look\nwaitfor done-marker\nput attack rat' : null,
    });
  r.start();
  assert.deepEqual(out, ['look'], 'sub-script runs before the caller resumes');
  feed(r, 'You see a marker. done-marker');
  assert.deepEqual(out, ['look', 'attack rat']);
  assert.equal(say[0], 'outer');
  assert.deepEqual(say, ['outer', 'resumed'], 'caller continued after sub exit-by-eof');
  assert.equal(r.running, false);
});

test('putrun passes positional arguments to the nested script', () => {
  const out = [];
  const r = createRunner('putrun hit "sewer rat"\nexit', [], {
    send: (l) => out.push(l),
    getScript: (name) => name === 'hit' ? 'put attack %1\nexit' : null,
  });
  r.start();
  assert.deepEqual(out, ['attack sewer rat']);
});

test('exit inside a nested putrun pops only one frame', () => {
  const out = [];
  const say = [];
  const r = createRunner('putrun inner\necho back-in-outer\nexit', [],
    { send: (l) => out.push(l), say: (t) => say.push(t), getScript: () => 'put wave\nexit\nput never' });
  r.start();
  assert.deepEqual(out, ['wave']);
  assert.ok(!out.includes('never'), 'nothing runs after the sub-script exit');
  assert.deepEqual(say, ['back-in-outer'], 'caller resumed after nested exit');
  assert.equal(r.running, false);
});

test('putrun of an unknown script reports and continues', () => {
  const say = [];
  const out = [];
  const r = createRunner('putrun nosuch\nput look', [], { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  assert.ok(say.join().includes('no script named'));
  assert.deepEqual(out, ['look']);
});

test('prompts mirror %mana/%maxmana for caster loops', () => {
  const out = [];
  const r = createRunner('wait\niflt mana 10 goto LOWMANA\nput cast\nexit\nLOWMANA:\nput rest-mana\nexit', [],
    { send: (l) => out.push(l) });
  r.start();
  feed(r, 'HP: 90/100  Mana: 4/50  Stamina: 70/70  RT: 0  Circle 1', true);
  assert.deepEqual(out, ['rest-mana']);
  const out2 = [];
  const r2 = createRunner('wait\niflt mana 10 goto LOWMANA\nput cast\nexit\nLOWMANA:\nput rest-mana\nexit', [],
    { send: (l) => out2.push(l) });
  r2.start();
  feed(r2, 'HP: 90/100  Mana: 40/50  Stamina: 70/70  RT: 0  Circle 1', true);
  assert.deepEqual(out2, ['cast']);
});

test('multi-line inventory report drives the arm-check probe', () => {
  // Mirrors scripts/barb-run.mjs ARMCHECK: equipped wins, then a carried
  // club is picked up, else the buy fallback fires on the carrying line.
  // The inventory reply arrives as ONE multi-line msg — matchers run in
  // registration order against the whole text.
  const src = 'matchre ARMED_HERE Worn:.*club\n' +
    'matchre GETCLUB carrying:\\s*[\\s\\S]*?\\bclub\\b\n' +
    'matchre BUY You are carrying\nput inventory\nmatchwait\n' +
    'ARMED_HERE:\nput hunt\nexit\nGETCLUB:\nput get club\nexit\nBUY:\nput buy club\nexit';
  const mk = (buf) => createRunner(src, [], { send: (l) => buf.push(l) });

  const worn = []; const rw = mk(worn); rw.start();
  feed(rw, '\nYou are carrying:\n  3x ale\nWorn: a stout club.\nSilvers: 120.', 'msg');
  assert.deepEqual(worn, ['inventory', 'hunt'], 'already equipped -> straight to hunting');

  const carried = []; const rc = mk(carried); rc.start();
  feed(rc, '\nYou are carrying:\n  a stout club\nWorn: nothing.\nSilvers: 120.', 'msg');
  assert.deepEqual(carried, ['inventory', 'get club'], 'carried but not worn -> pick it up');

  const bare = []; const rb = mk(bare); rb.start();
  feed(rb, '\nYou are carrying: nothing.\nWorn: nothing.\nSilvers: 5.', 'msg');
  assert.deepEqual(bare, ['inventory', 'buy club'], 'no club anywhere -> buy one');

  const strays = []; const rs = mk(strays); rs.start();
  feed(rs, 'You club the great rat for 6 damage!', 'combat'); // must NOT match \bclub\b mid-fight prose
  feed(rs, '\nYou are carrying:\nWorn: nothing.\nSilvers: 5.', 'msg');
  assert.deepEqual(strays, ['inventory', 'buy club'], 'combat prose never triggers the probe');
});

test('guild script capability map covers every guild with valid regexes', async () => {
  const { GUILDS } = await import('../data/guilds.js');
  const { GUILD_SCRIPTS, RACE_MATRIX } = await import('../data/guild-scripts.js');
  const { RACES } = await import('../data/races.js');
  for (const id of Object.keys(GUILDS)) {
    const cfg = GUILD_SCRIPTS[id];
    assert.ok(cfg, `no script capability entry for guild ${id}`);
    assert.ok(Array.isArray(cfg.fight) && cfg.fight.length, `${id}: fight steps`);
    assert.ok(Array.isArray(cfg.defaultTrain) && cfg.defaultTrain.length >= 5, `${id}: TDP curriculum`);
    for (const chk of cfg.fidelityChecks || []) {
      assert.doesNotThrow(() => new RegExp(chk.re), `${id}: fidelity regex ${chk.name}`);
    }
  }
  // curated race matrix: every race exists, every guild covered
  for (const [g, races] of Object.entries(RACE_MATRIX)) {
    assert.ok(GUILDS[g], `matrix references unknown guild ${g}`);
    assert.ok(races.length >= 3, `${g}: matrix wants >=3 races`);
    for (const r of races) assert.ok(RACES[r], `unknown race ${r} for ${g}`);
  }
});

test('putrun mega-script chains hunt + circle libraries end to end', async () => {
  const out = [];
  const lib = {
    gwhunt: 'put attack rat\nwait\npause 0.01\nexit',
    gwcircle: 'put circle\nwait\nexit',
  };
  const r = createRunner('putrun gwhunt\nputrun gwcircle\nexit', [], {
    send: (l) => out.push(l),
    getScript: (n) => lib[n] ?? null,
  });
  r.start();
  r.feed('HP: 90/100', true);   // satisfies the hunt wait
  await new Promise((res) => setTimeout(res, 30));
  r.feed('', false);            // heartbeat resumes hunt exit -> mega continues into circle leg
  assert.deepEqual(out, ['attack rat', 'circle'],
    'mega chained straight through: hunt attack then circle command');
  assert.equal(r.running, true); // circle leg still waiting for its prompt
  r.feed('HP: 88/100', true);   // satisfies the circle wait
  assert.equal(r.running, false);
});

test('ifgt branches on a greater-than comparison of live vars', () => {
  const out = [];
  const src = 'wait\nifgt pcount 0 goto OCCUPIED\nput hunt\nexit\nOCCUPIED:\nput relocate\nexit';
  const r = createRunner(src, [], { send: (l) => out.push(l) });
  r.start();
  assert.deepEqual(out, [], 'blocked before prompt');
  feed(r, 'HP: 50/50  Circle 1  [PLAYERS:2]', 'inject'); // 2 other players
  assert.deepEqual(out, ['relocate'], 'occupied -> relocate branch');
  const out2 = [];
  const empty = createRunner(src, [], { send: (l) => out2.push(l) });
  empty.start();
  feed(empty, 'HP: 50/50  Circle 1', 'prompt'); // no players token -> pcount undefined
  assert.deepEqual(out2, ['hunt'], 'empty (or unset) -> hunt in place');
});

test('[PLAYERS:n] prompt token mirrors into %pcount', () => {
  const out = [];
  const say = [];
  const r = createRunner('wait\necho PC=%pcount\nexit', [],
    { send: (l) => out.push(l), say: (t) => say.push(t) });
  r.start();
  feed(r, 'HP: 50/50  Circle 1  [PLAYERS:3]', 'inject');
  assert.deepEqual(say, ['PC=3']);
  // A room with nobody present emits no token; pcount stays undefined and
  // the arena-picking ladder treats that as "empty" (safe to hunt).
  const say2 = [];
  const r2 = createRunner('wait\necho PC=%pcount\nexit', [],
    { send: (l) => out.push(l), say: (t) => say2.push(t) });
  r2.start();
  feed(r2, 'HP: 50/50  Circle 1', 'prompt');
  assert.deepEqual(say2, ['PC=%pcount'], 'unset pcount prints literally (branch sees non-number)');
});
