// Behavioral corpus harness for the text-game protocol.
//
// Captures the full server output of a deterministic scripted play-session,
// then replays the same session against the current server build and diffs
// the output. Used to prove refactors are behavior-preserving.
//
//   node scripts/client-corpus.mjs capture <out.json>
//   node scripts/client-corpus.mjs replay  <captured.json>
//
// Requires a running server on :3000. Replay exits non-zero on any drift.
import WebSocket from 'ws';
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'capture';
const inFile = process.argv[3] || '/tmp/dr-corpus.json';
const user = 'corp' + Date.now();
const cname = 'Corp' + Array.from({ length: 7 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');

// Deterministic commands only — combat, RNG rolls, and random-flavor output are
// covered by the smoke suite and the client regression (scripts/client-regression.mjs).
// Numbers and session tokens are normalized at diff time.
const SCRIPT = [
  ['look', 400], ['help', 300], ['inventory', 300], ['score', 300],
  ['skills', 300], ['exp', 300], ['spells', 300], ['tdp', 300],
  ['who', 300], ['stats', 300], ['stance', 300],
  ['stance balanced', 300], ['n', 500], ['look', 300], ['list', 300],
  ['buy nonexistent', 300], ['s', 500], ['e', 500], ['look', 300],
  ['list', 300], ['forge', 300], ['craft', 300], ['khri', 300],
  ['target', 300], ['slots', 300], ['ability', 300], ['meditate', 300],
  ['analyze', 300], ['belch', 300], ['shakehand', 300], ['w', 500],
  ['s', 500], ['look', 300], ['ask', 300], ['ask crier help', 400],
  ['study', 300], ['appraise', 300], ['hide', 300], ['ambush', 300],
  ['use sword', 300], ['wear sword', 300], ['drop sword', 300],
  ['get sword', 300], ['drink water', 300], ['search', 400],
  ['deposit 10', 300], ['withdraw 5', 300], ['heal', 300],
  ['train', 300], ['circle', 300], ['raise str', 300],
  ['tdptrain large_edged', 300], ['alloc str 5', 300],
  ['say hello there', 300], ['emote waves', 300], ['shout testing', 300],
  ['alias testcmd say hi', 300], ['alias', 300], ['testcmd', 300],
  ['unalias testcmd', 300], ['alias', 300], ['save', 300], ['quit', 300],
];

const ws = new WebSocket('ws://localhost:3000/ws');
const output = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.on('message', (d) => output.push(JSON.parse(d)));

async function waitFor(t, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (output.some((m) => m.t === t)) return true;
    await sleep(50);
  }
  throw new Error('timeout waiting for ' + t);
}

async function runScript() {
  for (const [cmd, wait] of SCRIPT) {
    output.push({ t: '>>', cmd });
    ws.send(JSON.stringify({ t: 'input', line: cmd }));
    await sleep(wait);
  }
  await sleep(1500);
}

function normalize(msgs) {
  return msgs
    .map((m) => {
      if (typeof m.msg === 'string') {
        m = { ...m, msg: m.msg.replace(/\s+/g, ' ') };
      }
      return JSON.stringify(m)
        .replace(/[0-9a-f]{32,64}/g, 'TOKEN')
        .replace(/\d+/g, 'N');
    })
    .join('\n');
}

ws.on('open', async () => {
  try {
    await waitFor('login_prompt');
    ws.send(JSON.stringify({ t: 'register', u: user, p: 'pw123456' }));
    await waitFor('charcreate');
    ws.send(JSON.stringify({ t: 'charcreate', name: cname, race: 'human', guild: 'warmage' }));
    await waitFor('charalloc');
    ws.send(JSON.stringify({ t: 'alloc', stat: 'str', amt: 5 }));
    await sleep(200);
    ws.send(JSON.stringify({ t: 'enter' }));
    await waitFor('prompt');
    await runScript();

    if (mode === 'capture') {
      writeFileSync(inFile, JSON.stringify({ name: cname, output }, null, 1));
      console.log(`CAPTURED ${output.length} messages -> ${inFile}`);
      process.exit(0);
    }

    const before = JSON.parse(readFileSync(inFile, 'utf8'));
    const a = normalize(before.output).replaceAll(before.name, 'NAME');
    const b = normalize(output).replaceAll(cname, 'NAME');
    if (a === b) {
      console.log('CORPUS MATCH — behavior preserved');
      process.exit(0);
    }
    const al = a.split('\n'); const bl = b.split('\n');
    let diffs = 0;
    for (let i = 0; i < Math.max(al.length, bl.length); i++) {
      if (al[i] !== bl[i]) {
        diffs++;
        console.log(`drift @${i}:\n  old: ${al[i] || '(none)'}\n  new: ${bl[i] || '(none)'}`);
        if (diffs > 8) break;
      }
    }
    console.error(`CORPUS DRIFT — ${diffs} message(s) differ`);
    process.exit(1);
  } catch (e) {
    console.error('FAIL', e.message);
    process.exit(1);
  }
});
setTimeout(() => { console.error('FAIL: overall timeout'); process.exit(1); }, 120000);
