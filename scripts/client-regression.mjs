// Client regression suite: register, chargen, enter, strip/exits/panels,
// completion/search/macro/scripts/move/combat-chip. Requires a running server
// and a chromium binary; run: node scripts/client-regression.mjs
import WebSocket from 'ws';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.DR_CDP_PORT || 9360);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randName = () => 'Tst' + Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');

const chrome = spawn('chromium', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
  '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/dr-cdp-' + Date.now(),
  '--window-size=1280,800', 'http://localhost:3000',
], { stdio: 'ignore' });

let pageWs = null;
let seq = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); pageWs.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails)); return r.result.value; };
const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return false; };
const cmd = (v) => evalJs(`(function(){const i=document.getElementById('cmd');i.value=${JSON.stringify(v)};i.setSelectionRange(0,0);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));})();true`);
const lastTitle = `document.querySelectorAll('.room-title')[document.querySelectorAll('.room-title').length-1]`;

let target = null;
for (let i = 0; i < 30 && !target; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = l.find((t) => t.type === 'page' && t.url.includes('localhost:3000')); } catch {}
  if (!target) await sleep(400);
}
if (!target) { console.error('FAIL: no page target'); chrome.kill(); process.exit(1); }
pageWs = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => pageWs.on('open', r));
pageWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } });

const checks = [];
const check = (name, ok, extra = '') => { checks.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}${extra ? ' | ' + extra : ''}`); };

try {
  await cdp('Runtime.enable');

  // 1. Welcome
  await waitFor(`!!document.getElementById('wf-user')`, 12000);
  check('welcome screen', true);

  // 2. Register
  await evalJs(`document.getElementById('wf-user').value='reg'+Date.now();document.getElementById('wf-pass').value='pw123456';document.getElementById('wf-register').click();true`);
  await waitFor(`!document.getElementById('chargen').hidden`);
  check('chargen after register', true);

  // 3. Create character
  const cname = randName();
  await evalJs(`document.getElementById('cg-name').value=${JSON.stringify(cname)};document.getElementById('cg-race').value='human';document.getElementById('cg-guild').value='warmage';document.getElementById('cg-submit').click();true`);
  await waitFor(`!document.getElementById('cg-alloc-row').hidden`);
  check('alloc + flavor', await evalJs(`document.getElementById('cg-race-flavor').textContent.length > 10`));

  // 4. Allocate + enter
  await evalJs(`document.getElementById('cg-stat').value='str';document.getElementById('cg-amt').value='5';document.getElementById('cg-allocbtn').click();true`);
  await sleep(300);
  await evalJs(`document.getElementById('cg-enter').click();true`);
  await waitFor(`!!document.querySelector('.room-title')`);
  check('room title', await evalJs(`${lastTitle}.textContent`) === 'Town Square, Crossing');
  check('room panel pinned', (await evalJs(`document.getElementById('rp-title').textContent`)) === 'Town Square, Crossing');
  check('room panel compass', (await evalJs(`document.querySelectorAll('#rp-compass .compass-btn:not(.off)').length`)) === 6);
  check('room panel exits', (await evalJs(`document.getElementById('rp-exits').textContent`)).startsWith('Obvious paths:'));
  check('nav hint present', (await evalJs(`document.getElementById('rp-hint').textContent`)).includes('help'));
  check('hands bar shows hand', (await evalJs(`document.getElementById('hands-hand').textContent`)).startsWith('Hand:'));
  check('exp + info buttons', await evalJs(`!!document.getElementById('btn-exp') && !!document.getElementById('btn-info')`));

  // 5. Status strip
  await waitFor(`!document.getElementById('status-strip').hidden`);
  const strip = await evalJs(`document.getElementById('strip-hp-label').textContent + '|' + document.getElementById('strip-mana-label').textContent + '|' + document.getElementById('strip-circle').textContent + '|' + document.getElementById('strip-silver').textContent`);
  check('status strip', /^HP \d+\/\d+\|Mana \d+\/\d+\|Circle \d+\|\d+ silvers$/.test(strip), strip);

  // 6. Exits widget (DR compass rose)
  const exits = await evalJs(`[...document.querySelectorAll('#exits-row .compass-btn:not(.off)')].map(b => b.textContent).join(',')`);
  check('exits widget', exits === 'NW,N,W,E,S,D', exits);

  // 7. Inventory panel
  await evalJs(`document.getElementById('btn-inv').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('carrying')`);
  check('inventory panel', true);

  // 8. Score panel
  await evalJs(`document.getElementById('btn-score').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes(${JSON.stringify(cname)})`);
  check('score panel', true);

  // 9. Tab completion
  await evalJs(`(function(){const i=document.getElementById('cmd');i.value='sta';i.setSelectionRange(3,3);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',cancelable:true}));})();true`);
  check('tab completion', (await evalJs(`document.getElementById('cmd').value`)) === 'stance ');

  // 10. Search
  await evalJs(`document.getElementById('panel-close').click();true`);
  await cmd('search Town');
  await waitFor(`document.querySelectorAll('#terminal mark').length > 0`);
  check('search highlight', (await evalJs(`document.getElementById('search-count').textContent`)).match(/^\d+ matches$/) !== null);
  await evalJs(`document.getElementById('search-close').click();true`);

  // 11. Move via compass widget
  await evalJs(`document.querySelector('#exits-row .compass-btn[data-dir="n"]')?.click();true`);
  await sleep(1500);
  check('move via widget', (await evalJs(`${lastTitle}.textContent`)) === 'Market Way, Crossing');

  // 12. Scripts panel + macro
  await evalJs(`document.getElementById('btn-scripts').click();true`);
  await waitFor(`document.getElementById('script-addbtn') !== null`);
  await cmd('macro hunt attack');
  await sleep(400);
  await evalJs(`document.getElementById('panel-close').click();true`);
  check('macro bar', (await evalJs(`[...document.querySelectorAll('.macros-row button')].map(b=>b.textContent).join(',')`)) === 'hunt');

  // 13. Trigger row in scripts panel
  await evalJs(`document.getElementById('btn-scripts').click();true`);
  await cmd('trigger wounded heal');
  await sleep(300);
  check('scripts panel rows', (await evalJs(`document.querySelectorAll('#panel-body .script-row').length`)) === 2);
  check('scripts panel lists DR scripts', (await evalJs(`document.querySelectorAll('#panel-body .script-name-row').length`)) >= 3);
  await evalJs(`document.getElementById('panel-close').click();true`);

  // 13b. DR script runs (.demo): echoes fire, `put look` sends, `wait` resumes.
  await cmd('.demo');
  await sleep(1200);
  const scriptEcho = await evalJs(`document.querySelector('#terminal').textContent`);
  check('DR script .demo runs', scriptEcho.includes('A DragonRealms script is running') && scriptEcho.includes('And the world answered'), scriptEcho.slice(-120));
  await cmd('script stop');
  await sleep(200);

  // 14. Combat: sewers, attack, chip on, clear after end
  await cmd('s');
  await sleep(600);
  await cmd('s');
  await sleep(600);
  await cmd('d');
  await sleep(600);
  let creature = '';
  for (let i = 0; i < 20 && !creature; i++) {
    await cmd('look');
    await sleep(800);
    const m = /\b([a-z][a-z ]+?)\s+is here/.exec(await evalJs(`[...document.querySelectorAll('.ch-room')].pop().textContent`));
    if (m) creature = m[1].trim();
  }
  check('creature found', !!creature, creature || '');
  if (creature) {
    await cmd('attack ' + creature);
    await waitFor(`!document.getElementById('strip-combat').hidden`, 10000);
    check('combat chip appears', true);
    await waitFor(`document.querySelectorAll('#terminal .ch-combat').length > 1`, 10000);
    const combatDim = await evalJs(`getComputedStyle(document.querySelector('#terminal .ch-combat')).color`);
    check('combat dimmed', combatDim === 'rgb(107, 103, 84)', combatDim);
    let cleared = false;
    for (let i = 0; i < 60 && !cleared; i++) { await sleep(1500); cleared = await evalJs(`document.getElementById('strip-combat').hidden`); }
    check('combat chip clears after end', cleared);
  }

  // 15. Settings: font resize actually applies
  await evalJs(`document.getElementById('set-font').value='18';document.getElementById('set-font').dispatchEvent(new Event('input'));true`);
  check('font resize', (await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`)) === '18px');

  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? 'ALL CLIENT TESTS PASSED' : `${failed} CHECK(S) FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  if (pageWs) pageWs.close();
  process.exit(process.exitCode || 0);
}
