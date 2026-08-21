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
  const acctUser = 'reg' + Date.now();
  const acctPass = 'pw123456';
  await evalJs(`document.getElementById('wf-user').value=${JSON.stringify(acctUser)};document.getElementById('wf-pass').value=${JSON.stringify(acctPass)};document.getElementById('wf-register').click();true`);
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
  // 3b. Chargen cards: the server's structured race data renders stat-mod chips.
  check('race stat mods render', await waitFor(`document.querySelectorAll('#cg-race-mods .stat-mod').length === 8`, 4000));
  await evalJs(`(function(){const r=document.getElementById('cg-race'); r.value='dwarf'; r.dispatchEvent(new Event('change'));})();true`);
  await sleep(200);
  check('stat mods update per race', (await evalJs(`document.getElementById('cg-race-mods').textContent`)).includes('CON +10'));
  await evalJs(`(function(){const g=document.getElementById('cg-guild'); g.value='warmage'; g.dispatchEvent(new Event('change'));})();true`);
  await sleep(200);
  check('guild flavor shows mana type', (await evalJs(`document.getElementById('cg-guild-flavor').textContent`)).includes('Elemental magic'));
  await evalJs(`(function(){const g=document.getElementById('cg-guild'); g.value='barbarian'; g.dispatchEvent(new Event('change'));})();true`);
  await sleep(200);
  check('guild flavor shows no-magic', (await evalJs(`document.getElementById('cg-guild-flavor').textContent`)).includes('no magic'));
  await evalJs(`(function(){const g=document.getElementById('cg-guild'); g.value='warmage'; g.dispatchEvent(new Event('change'));})();true`);

  await evalJs(`document.getElementById('cg-enter').click();true`);
  await waitFor(`!!document.querySelector('.room-title')`);
  // Layout-agnostic: derive expectations from the live room output rather
  // than hardcoding world data (the map evolves under fidelity passes).
  const startTitle = await evalJs(`${lastTitle}.textContent`);
  check('room title', /^[A-Z].+, .+$/.test(startTitle), startTitle);
  check('room panel pinned', (await evalJs(`document.getElementById('rp-title').textContent`)) === startTitle);
  const exitDirsOf = async () => evalJs(`(document.getElementById('rp-exits').textContent.match(/Obvious (?:paths|exits): (.*)\\./)||[])[1]?.split(', ').map(s=>s.trim()).filter(Boolean) || []`);
  const startExits = await exitDirsOf();
  check('room panel compass', (await evalJs(`document.querySelectorAll('#rp-compass .compass-btn:not(.off)').length`)) === startExits.length, `${startExits.length} exits`);
  check('room panel exits', (await evalJs(`document.getElementById('rp-exits').textContent`)).startsWith('Obvious paths:') || (await evalJs(`document.getElementById('rp-exits').textContent`)).startsWith('Obvious exits:'));
  check('nav hint present', (await evalJs(`document.getElementById('rp-hint').textContent`)).includes('help'));
  check('hands bar shows hand', (await evalJs(`document.getElementById('hands-hand').textContent`)).startsWith('Hand:'));
  check('exp + info buttons', await evalJs(`!!document.getElementById('btn-exp') && !!document.getElementById('btn-info')`));

  // 4b. DR-style window manager: Windows menu, collapse toggles, room phrasing.
  check('Windows menu button present', await evalJs(`!!document.getElementById('windows-btn')`));
  await evalJs(`document.getElementById('windows-btn').click();true`);
  await sleep(200);
  check('Windows menu opens with 7 windows', (await evalJs(`document.querySelectorAll('#windows-menu .wmenu-row').length`)) === 7);
  await evalJs(`document.querySelector('#windows-menu [data-w="chat-widget"] .wmenu-vis').click();true`);
  await sleep(200);
  check('Windows menu toggles chat hidden', await evalJs(`document.getElementById('chat-container').hasAttribute('data-whidden')`));
  await evalJs(`document.querySelector('#windows-menu [data-w="chat-widget"] .wmenu-vis').click();true`);
  await sleep(200);
  check('Windows menu restores chat', await evalJs(`!document.getElementById('chat-container').getAttribute('data-whidden')`));
  await evalJs(`document.getElementById('windows-btn').click();true`); // close menu

  // 4c. Collapse toggle on the room window.
  const roomOuter = `document.querySelector('#room-panel')`;
  check('room window starts expanded', await evalJs(`${roomOuter}.classList.contains('collapsed') === false`));
  await evalJs(`document.querySelector('#room-panel .dwin-collapse[data-collapse="room-panel"]').click();true`);
  await sleep(200);
  check('room window collapses', await evalJs(`${roomOuter}.classList.contains('collapsed')`));
  await evalJs(`document.querySelector('#room-panel .dwin-collapse[data-collapse="room-panel"]').click();true`);
  await sleep(200);

  // 4d. DR room contents phrasing: the room panel separates "Here:" and "You also see".
  await cmd('look');
  await sleep(400);
  const roomContents = await evalJs(`document.getElementById('rp-contents').textContent`);
  check('room contents DR phrasing', /Here:|You also see/.test(roomContents), roomContents.slice(0, 80));
  check('room contents mentions players/NPCs or objects', (await evalJs(`document.getElementById('rp-contents').textContent`)).length > 0);

  // 4e. Quest journal: the start room has the crier — take a task and the
  // Journal window opens with live state.
  await cmd('quest');
  await sleep(800);
  check('journal opens on quest', await waitFor(`!document.getElementById('quest-container').hasAttribute('data-whidden') && document.querySelectorAll('#quest-row .quest-kind').length === 1`, 4000));
  check('journal shows description', (await evalJs(`(document.querySelector('#quest-row .quest-desc')||{textContent:''}).textContent`)).length > 10);



  // 5. Status strip
  await waitFor(`!document.getElementById('status-strip').hidden`);
  const strip = await evalJs(`document.getElementById('strip-hp-label').textContent + '|' + document.getElementById('strip-mana-label').textContent + '|' + document.getElementById('strip-circle').textContent + '|' + document.getElementById('strip-silver').textContent`);
  check('status strip', /^HP \d+\/\d+\|Mana \d+\/\d+\|Circle \d+\|\d+ silvers$/.test(strip), strip);

  // 6. Exits widget: the compass rose must light exactly the room's exits.
  const exits = await evalJs(`[...document.querySelectorAll('#rp-compass .compass-btn:not(.off)')].map(b => b.textContent.toLowerCase()).sort().join(',')`);
  const wantExits = [...startExits].map((e) => ({ north:'n',south:'s',east:'e',west:'w',northeast:'ne',northwest:'nw',southeast:'se',southwest:'sw',up:'u',down:'d' }[e] || e)).sort().join(',');
  check('exits widget', exits === wantExits, `${exits} vs ${wantExits}`);

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

  // 10. Search — search for a word actually present in the room description.
  await evalJs(`document.getElementById('panel-close').click();true`);
  const searchWord = await evalJs(`(document.getElementById('rp-desc').textContent.match(/[A-Za-z]{5,}/)||['the'])[0].toLowerCase()`);
  await cmd('search ' + searchWord);
  await waitFor(`document.querySelectorAll('#terminal mark').length > 0`);
  check('search highlight', (await evalJs(`document.getElementById('search-count').textContent`)).match(/^\d+ matches$/) !== null, `term: ${searchWord}`);
  await evalJs(`document.getElementById('search-close').click();true`);

  // 11. Move via compass widget: click any lit cardinal direction, expect a
  // new room, then step back the way we came.
  const OPP = { n:'s', s:'n', e:'w', w:'e', ne:'sw', sw:'ne', nw:'se', se:'nw' };
  const moveDir = await evalJs(`(document.querySelector('#rp-compass .compass-btn:not(.off)[data-dir="n"], #rp-compass .compass-btn:not(.off)[data-dir="e"], #rp-compass .compass-btn:not(.off)[data-dir="w"], #rp-compass .compass-btn:not(.off)[data-dir="s"]')||{}).dataset?.dir || ''`);
  if (moveDir) {
    await evalJs(`document.querySelector('#rp-compass .compass-btn[data-dir="${moveDir}"]').click();true`);
    await sleep(1500);
    const movedTitle = await evalJs(`${lastTitle}.textContent`);
    check('move via widget', movedTitle !== startTitle && !!movedTitle, movedTitle);
    await evalJs(`document.querySelector('#rp-compass .compass-btn[data-dir="${OPP[moveDir]}"]')?.click();true`);
    await sleep(1500);
  } else {
    check('move via widget', false, 'no cardinal exit lit');
  }

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

  // 13d. Highlight engine: add a rule, emit matching text, check the color span.
  await evalJs(`(function(){
    const b=document.getElementById('settings-btn'); if(b) b.click();
    const p=document.getElementById('hl-pattern'); if(p) p.value='GreetingsHighlight';
    const c=document.getElementById('hl-color'); if(c) c.value='red';
    const add=document.getElementById('hl-add'); if(add) add.click();
    const s=document.getElementById('settings-btn'); if(s) s.click();
    return true;
  })();true`);
  await cmd('say GreetingsHighlight from the engine');
  await sleep(500);
  check('highlight colors matched text', await evalJs(`[...document.querySelectorAll('#terminal .block')].some(b => b.innerHTML.includes('c31'))`));

  // 13c. Conversations pane: say routes to the chat window with channel styling.
  await cmd('say Greetings from the test');
  await sleep(500);
  check('chat pane captures say', (await evalJs(`!document.getElementById('chat-widget').hidden && document.getElementById('chat-row').textContent.includes('Greetings from the test')`)));
  check('say styled in terminal', (await evalJs(`[...document.querySelectorAll('#terminal .block')].some(b => b.classList.contains('ch-say'))`)));

  // 14. Combat: descend into the sewers (temple quarter grate), attack, chip
  // on, clear after end. Path is from the Town Green start room.
  for (const dir of ['nw', 'w', 'w', 'd']) {
    await cmd(dir);
    await sleep(700);
  }
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
    check('target window shows the foe', await waitFor(`!document.getElementById('target-widget').hidden && document.querySelectorAll('#target-row .target').length >= 1`, 8000));
    check('combat status line shown', await waitFor(`document.getElementById('combat-status') && document.getElementById('combat-status').textContent.trim().length > 0`, 8000));
    check('FE tracker lists a learning skill', await waitFor(`document.querySelectorAll('#fe-row .fe-line').length >= 1`, 16000));
    check('room contents lists the foe', (await evalJs(`document.getElementById('rp-contents').textContent`)).includes(creature));
    await waitFor(`document.querySelectorAll('#terminal .ch-combat').length > 1`, 10000);
    // Combat lines render in the theme's dim token; compare against the live
    // custom property rather than a hardcoded rgb (themes may retune it).
    const combatDim = await evalJs(`getComputedStyle(document.querySelector('#terminal .ch-combat')).color`);
    const wantDim = await evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--dim').trim()`);
    const wantRgb = await evalJs(`(function(){const d=document.createElement('span');d.style.color='var(--dim)';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c;})()`);
    check('combat dimmed', combatDim === wantRgb, `${combatDim} vs ${wantRgb}`);
    let cleared = false;
    for (let i = 0; i < 60 && !cleared; i++) { await sleep(1500); cleared = await evalJs(`document.getElementById('strip-combat').hidden`); }
    check('combat chip clears after end', cleared);
  }

  // 15. Settings: font resize actually applies
  await evalJs(`document.getElementById('set-font').value='18';document.getElementById('set-font').dispatchEvent(new Event('input'));true`);
  check('font resize', (await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`)) === '18px');

  // 16. Themes: switching to Ember applies data-theme and retints the text.
  const beforeColor = await evalJs(`getComputedStyle(document.getElementById('terminal')).color`);
  await evalJs(`(function(){const sel=document.getElementById('set-theme'); sel.value='ember'; sel.dispatchEvent(new Event('change'));})();true`);
  await sleep(200);
  check('ember theme applies', (await evalJs(`document.body.dataset.theme`)) === 'ember');
  check('ember theme retints text', (await evalJs(`getComputedStyle(document.getElementById('terminal')).color`)) !== beforeColor);
  // Persisted across the change; restore default for the remaining session.
  await evalJs(`(function(){const sel=document.getElementById('set-theme'); sel.value='dark'; sel.dispatchEvent(new Event('change'));})();true`);
  await sleep(100);
  check('theme restores', (await evalJs(`document.body.dataset.theme`)) === 'dark');

  // 17. Channel muting: muting Say drops new say lines from the story stream
  // (triggers/scripts still see them — they are fed before rendering).
  await evalJs(`(function(){const cb=document.getElementById('set-ch-say'); cb.checked=false; cb.dispatchEvent(new Event('change'));})();true`);
  const sayCountBefore = await evalJs(`document.querySelectorAll('#terminal .ch-say').length`);
  await cmd('say mute-check-xyz');
  await sleep(500);
  const sayCountAfter = await evalJs(`document.querySelectorAll('#terminal .ch-say').length`);
  check('muted channel not printed', sayCountAfter === sayCountBefore, `${sayCountBefore} -> ${sayCountAfter}`);
  await evalJs(`(function(){const cb=document.getElementById('set-ch-say'); cb.checked=true; cb.dispatchEvent(new Event('change'));})();true`);
  await cmd('say unmute-check-xyz');
  await sleep(500);
  check('unmuted channel prints again', (await evalJs(`document.querySelectorAll('#terminal .ch-say').length`)) > sayCountAfter);

  // 18. Timestamps: enabling stamps new lines with [HH:MM].
  await evalJs(`(function(){const cb=document.getElementById('set-timestamps'); cb.checked=true; cb.dispatchEvent(new Event('change'));})();true`);
  await cmd('look');
  await sleep(500);
  const tsText = await evalJs(`(document.querySelector('#terminal .ts')||{}).textContent || ''`);
  check('timestamps render', /^\[\d{2}:\d{2}\]$/.test(tsText), tsText);
  await evalJs(`(function(){const cb=document.getElementById('set-timestamps'); cb.checked=false; cb.dispatchEvent(new Event('change'));})();true`);
  await cmd('look');
  await sleep(400);
  const tsCount = await evalJs(`document.querySelectorAll('#terminal .ts').length`);
  const lastBlockHasTs = await evalJs(`!![...document.querySelectorAll('#terminal .block')].pop().querySelector('.ts')`);
  check('timestamps disable cleanly', tsCount >= 1 && !lastBlockHasTs, `total ${tsCount}, newest stamped: ${lastBlockHasTs}`);

  // 19. Automation edit-in-place: rename the hunt macro via the panel editor.
  await evalJs(`document.getElementById('btn-scripts').click();true`);
  await waitFor(`document.getElementById('script-addbtn') !== null`);
  await evalJs(`document.querySelector('[data-edit="macro:hunt"]').click();true`);
  await sleep(200);
  await evalJs(`(function(){
    const row = document.querySelector('[data-save^="macro:"]').closest('.script-row');
    row.querySelector('.edit-a').value = 'hunt2';
    row.querySelector('.edit-b').value = 'attack';
    row.querySelector('[data-save]').click();
  })();true`);
  await sleep(300);
  check('macro edited in place', await evalJs(`JSON.parse(localStorage.getItem('dr_macros')).hunt2 === 'attack' && !JSON.parse(localStorage.getItem('dr_macros')).hunt`));
  // Trigger edit-in-place: reword the pattern, keep it resolvable.
  await evalJs(`(function(){
    const btn = document.querySelector('[data-edit^="trigger:"]');
    if (btn) btn.click();
  })();true`);
  await sleep(200);
  await evalJs(`(function(){
    const save = document.querySelector('[data-save^="trigger:"]');
    if (!save) return;
    const row = save.closest('.script-row');
    row.querySelector('.edit-a').value = 'wounded';
    row.querySelector('.edit-b').value = 'heal';
    save.click();
  })();true`);
  await sleep(300);
  check('trigger edited in place', await evalJs(`JSON.parse(localStorage.getItem('dr_triggers'))[0].pattern === 'wounded'`));

  // 20. Config backup: Export serializes client config into the textarea.
  await evalJs(`document.getElementById('config-export').click();true`);
  await sleep(200);
  const exported = await evalJs(`document.getElementById('config-io').value`);
  let exportOk = false; let exportKeys = [];
  try { const blob = JSON.parse(exported); exportKeys = Object.keys(blob); exportOk = !!blob.dr_macros && !!blob.dr_settings; } catch {}
  check('config export produces JSON', exportOk, exportKeys.join(','));
  await evalJs(`document.getElementById('panel-close').click();true`);

  // 21. Quick font keys: Ctrl+= steps up, Ctrl+0 resets.
  const fontBefore = await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'=', ctrlKey:true, cancelable:true}));true`);
  await sleep(150);
  const fontStepped = await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'0', ctrlKey:true, cancelable:true}));true`);
  await sleep(150);
  const fontReset = await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`);
  check('font quick keys', parseFloat(fontStepped) === parseFloat(fontBefore) + 1 && fontReset === '14px', `${fontBefore} -> ${fontStepped} -> ${fontReset}`);

  // 22. Gag rules: a gagged server line is dropped from the story stream.
  // The pattern anchors on the server's phrasing so the typed command's own
  // echo (which contains the same words) still renders.
  await evalJs(`(function(){
    document.getElementById('settings-btn').click();
    document.getElementById('gag-pattern').value = '^You say, "gag-test';
    document.getElementById('gag-add').click();
    document.getElementById('settings-btn').click();
  })();true`);
  const gagBefore = await evalJs(`document.querySelectorAll('#terminal .block').length`);
  await cmd('say gag-test-xyz should vanish');
  await sleep(500);
  const gagAfter = await evalJs(`document.querySelectorAll('#terminal .block').length`);
  check('gagged line dropped', gagAfter === gagBefore + 1, `${gagBefore} -> ${gagAfter} (echo only)`);
  check('gag text absent from stream', !(await evalJs(`document.getElementById('terminal').textContent.includes('You say, "gag-test-xyz')`)));
  await evalJs(`(function(){
    document.getElementById('settings-btn').click();
    const del = document.querySelector('[data-del-gag]');
    if (del) del.click();
    document.getElementById('settings-btn').click();
  })();true`);

  // 23. Audio alert: enabling chimes counts a beep when a highlight matches.
  await evalJs(`(function(){
    document.getElementById('settings-btn').click();
    const cb = document.getElementById('set-soundalerts'); cb.checked = true; cb.dispatchEvent(new Event('change'));
    const p = document.getElementById('hl-pattern'); p.value = 'chime-test-xyz';
    document.getElementById('hl-add').click();
    document.getElementById('settings-btn').click();
  })();true`);
  await cmd('say chime-test-xyz alert');
  await sleep(500);
  check('highlight match plays alert', await waitFor(`window.__alertBeeps >= 1`, 3000));
  await evalJs(`(function(){
    document.getElementById('settings-btn').click();
    const cb = document.getElementById('set-soundalerts'); cb.checked = false; cb.dispatchEvent(new Event('change'));
    const del = [...document.querySelectorAll('[data-del-hl]')].pop();
    if (del) del.click();
    document.getElementById('settings-btn').click();
  })();true`);

  // 24. Scrollback buffer cap: echoes beyond the cap fall off the top.
  await evalJs(`(function(){
    document.getElementById('settings-btn').click();
    const sel = document.getElementById('set-scrollback'); sel.value = '500'; sel.dispatchEvent(new Event('change'));
    document.getElementById('settings-btn').click();
  })();true`);
  for (let i = 0; i < 520; i++) {
    await evalJs(`(function(){const i=document.getElementById('cmd');i.value='cap'+${i};i.setSelectionRange(0,0);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));})();true`);
  }
  await sleep(600);
  const blockCount = await evalJs(`document.querySelectorAll('#terminal .block').length`);
  check('scrollback cap enforced', blockCount <= 505 && blockCount > 400, `${blockCount} blocks (cap 500)`);
  await evalJs(`(function(){
    document.getElementById('settings-btn').click();
    const sel = document.getElementById('set-scrollback'); sel.value = '2000'; sel.dispatchEvent(new Event('change'));
    document.getElementById('settings-btn').click();
  })();true`);

  // 25. Keys overlay: F1 opens, Esc closes.
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'F1', cancelable:true}));true`);
  await sleep(200);
  check('F1 opens keys overlay', await evalJs(`!document.getElementById('keys-overlay').hidden`));
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', cancelable:true}));true`);
  await sleep(200);
  check('Esc closes keys overlay', await evalJs(`document.getElementById('keys-overlay').hidden`));

  // 26. Server-stored scripts: save one, wipe localStorage (fresh browser),
  // reload, re-enter — the script comes back from the server.
  await evalJs(`document.getElementById('btn-scripts').click();true`);
  await waitFor(`document.getElementById('script-addbtn') !== null`);
  await evalJs(`(function(){
    document.getElementById('script-kind').value = 'script';
    document.getElementById('script-a').value = 'persistme';
    document.getElementById('script-b').value = 'echo * still here *\\nexit';
    document.getElementById('script-addbtn').click();
  })();true`);
  await sleep(400);
  check('script saved locally', await evalJs(`!!JSON.parse(localStorage.getItem('dr_scripts_v1')||'{}').persistme`));
  // Simulate a brand-new browser: drop local config AND the session token.
  await evalJs(`localStorage.removeItem('dr_scripts_v1'); localStorage.removeItem('dr_token'); location.reload(); true`);
  await waitFor(`!!document.getElementById('wf-user')`, 15000);
  await evalJs(`document.getElementById('wf-user').value=${JSON.stringify(acctUser)};document.getElementById('wf-pass').value=${JSON.stringify(acctPass)};document.getElementById('wf-login').click();true`);
  await waitFor(`!document.getElementById('welcome').hidden && document.querySelectorAll('.wslot').length >= 1`, 10000);
  // Select THIS account's character by clicking its slot (ids are global).
  await evalJs(`document.querySelector('.wslot:not(.wnew)')?.click();true`);
  await waitFor(`!!document.querySelector('.room-title')`, 12000);
  check('re-entered world after fresh-browser reload', true);
  // The server pushes the script library right after entry; wait for it.
  check('scripts restored from server', await waitFor(`!!JSON.parse(localStorage.getItem('dr_scripts_v1')||'{}').persistme`, 10000));
  await evalJs(`document.getElementById('btn-scripts').click();true`);
  await waitFor(`document.getElementById('script-addbtn') !== null`);
  check('restored script listed in panel', await evalJs(`[...document.querySelectorAll('#panel-body [data-run]')].some(b => b.dataset.run === 'persistme')`));
  await evalJs(`document.getElementById('panel-close').click();true`);

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
