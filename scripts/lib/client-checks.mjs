import { ROOMS } from '../../data/world.js';
import { findPath } from '../../data/grid.js';

// Shared browser assertions. The driver owns browser and world lifecycles.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randName = () => 'Tst' + Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');


export async function runClientRegression({ cdp, log = console.log }) {
const evalJs = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails)); return r.result.value; };
const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } throw new Error('Timed out waiting for: ' + expr); };
let lastCommandAt = 0;
const cmd = async (v) => {
  // Browser/CDP latency is not a rate limiter. Stay below the real session's
  // 20/sec budget even on fast local runs; room arrival remains state-driven.
  await sleep(Math.max(0, 100 - (Date.now() - lastCommandAt)));
  lastCommandAt = Date.now();
  return evalJs(`(function(){const i=document.getElementById('cmd');i.value=${JSON.stringify(v)};i.setSelectionRange(0,0);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));})();true`);
};
const lastTitle = `document.querySelectorAll('.room-title')[document.querySelectorAll('.room-title').length-1]`;

const checks = [];
const check = (name, ok, extra = '') => { checks.push([name, ok]); log(`${ok ? 'PASS' : 'FAIL'} - ${name}${extra ? ' | ' + extra : ''}`); };

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

  // 3b. Chargen cards: the server's structured race data renders stat-mod chips.
  check('race stat mods render', await waitFor(`document.querySelectorAll('#cg-race-mods .stat-mod').length === 8`, 4000));
  await evalJs(`(function(){const r=document.getElementById('cg-race'); r.value='dwarf'; r.dispatchEvent(new Event('change'));})();true`);
  await sleep(200);
  check('stat mods update per race', (await evalJs(`document.getElementById('cg-race-mods').textContent`)).includes('CON +10'));
  check('guild chosen in game', await evalJs(`document.getElementById('cg-guild').type === 'hidden'`));
  check('Temple and directions guidance', await evalJs(`document.getElementById('chargen').textContent.includes('DIR BARBARIAN')`));

  // 3. Create character
  const cname = randName();
  await evalJs(`document.getElementById('cg-name').value=${JSON.stringify(cname)};document.getElementById('cg-race').value='human';document.getElementById('cg-guild').value='warmage';document.getElementById('cg-submit').click();true`);
  await waitFor(`!document.getElementById('cg-alloc-row').hidden`);
  check('allocation controls remain visible', await evalJs(`document.getElementById('cg-enter').checkVisibility() && document.getElementById('cg-allocbtn').checkVisibility()`));

  // 4. Allocate + enter
  await evalJs(`document.getElementById('cg-stat').value='str';document.getElementById('cg-amt').value='5';document.getElementById('cg-allocbtn').click();true`);
  await sleep(300);
  await evalJs(`document.getElementById('cg-enter').click();true`);
  await waitFor(`!!document.querySelector('.room-title')`);
  check('new character arrives at Temple', await evalJs(`${lastTitle}.textContent.includes('Temple')`));
  await cmd('info');
  check('new character is guildless', await waitFor(`document.getElementById('terminal').textContent.includes('guildless')`));
  await cmd('DIR WARMAGE');
  check('DIR works from Temple', await waitFor(`document.getElementById('terminal').textContent.includes('Heading to')`));
  for (const [from, to] of [['temple', 'hall_warmage'], ['hall_warmage', 'square']]) {
    for (const direction of findPath(from, to)) {
      const before = await evalJs(`document.querySelectorAll('.room-title').length`);
      await cmd(direction);
      await waitFor(`document.querySelectorAll('.room-title').length > ${before}`);
    }
    if (to === 'hall_warmage') {
      await cmd('join warmage');
      check('joins guild at its hall', await waitFor(`document.getElementById('terminal').textContent.includes('You have joined the Warrior Mage guild.')`));
    }
  }
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
  check('Windows menu includes every supported window', await evalJs(`(async () => { const { WINDOWS } = await import('/js/windows.js'); return WINDOWS.every(w => document.querySelector('#windows-menu [data-w=\"' + w.id + '\"]')) && document.querySelectorAll('#windows-menu .wmenu-row').length === WINDOWS.length; })()`));
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

  await evalJs(`(async () => {
    const net = await import('/js/net.js');
    net.onServerMessage(msg => { if (msg.t === 'quest') window.__journalWireSnapshot = msg.quest; });
  })()`);
  // 4e. Quest journal: the start room has the crier — take a task and the
  // Journal window opens with live state.
  await cmd('quest');
  await sleep(800);
  check('journal opens on quest', await waitFor(`!document.getElementById('quest-container').hasAttribute('data-whidden') && document.querySelectorAll('#quest-row .quest-kind').length === 1`, 4000));
  check('journal shows description', (await evalJs(`(document.querySelector('#quest-row .quest-desc')||{textContent:''}).textContent`)).length > 10);



  check('live Journal snapshots include an additive readable objective', await evalJs(`typeof window.__journalWireSnapshot?.objective === 'string' && typeof window.__journalWireSnapshot?.done === 'boolean'`));
  check('Journal renders known counters with native accessible progress', await evalJs(`(async () => {
    const status = await import('/js/status.js');
    status.renderQuest({quest:{kind:'kill',source:'crier',done:false,objective:'Defeat assigned goblins.',counter:{current:2,total:5,remaining:3,unit:'kills'}}});
    const p = document.querySelector('#quest-row progress');
    return p?.value === 2 && p.max === 5 && p.getAttribute('aria-label').includes('progress') && p.getAttribute('aria-valuetext').includes('2/5') && document.querySelector('#quest-row .quest-status').textContent === 'In progress';
  })()`));
  check('Journal status follows DONE and supports delivery and recovery', await evalJs(`(async () => {
    const status = await import('/js/status.js');
    status.renderQuest({quest:{kind:'kill',done:false,counter:{current:5,total:5,remaining:0}}});
    const active = document.querySelector('#quest-row .quest-status').textContent === 'In progress';
    status.renderQuest({quest:{kind:'deliver',done:false,objective:'Carry parcel.',destination:{parcel:'Parcel',recipient:'Baker',name:'Bakery',atDestination:true}}});
    const delivery = document.querySelector('#quest-row .quest-destination').textContent.includes('At destination') && document.querySelector('#quest-row .quest-next').textContent.includes('Hand over');
    status.renderQuest({quest:{kind:'recover',source:'leader',done:true,counter:{current:1,total:1,remaining:0,unit:'trinkets'}}});
    return active && delivery && document.querySelector('#quest-row .quest-status').textContent.includes('reward unclaimed') && document.querySelector('#quest-row .quest-next').textContent.includes('guild leader') && !document.querySelector('#quest-row button');
  })()`));
  check('Journal handles legacy totals and inconsistent counters honestly', await evalJs(`(async () => {
    const status = await import('/js/status.js');
    status.renderQuest({quest:{kind:'kill',done:false,desc:'Legacy assignment',counter:{current:null,total:null,remaining:3,unit:'kills'}}});
    const legacy = !document.querySelector('#quest-row progress') && document.querySelector('#quest-row .quest-counter').textContent.includes('original total unknown') && document.querySelector('#quest-row .quest-desc').textContent === 'Legacy assignment';
    status.renderQuest({quest:{kind:'kill',done:false,counter:{current:5,total:5,remaining:3}}});
    return legacy && !document.querySelector('#quest-row progress') && document.querySelector('#quest-row .quest-counter').textContent.includes('inconsistent');
  })()`));
  check('Journal clears stale content on malformed and empty snapshots', await evalJs(`(async () => {
    const status = await import('/js/status.js');
    status.renderQuest({quest:'malformed'});
    const malformed = !document.querySelector('#quest-row progress') && document.getElementById('quest-row').textContent.includes('unavailable');
    status.renderQuest({quest:null});
    return malformed && document.getElementById('quest-row').textContent.includes('No task') && !document.querySelector('#quest-row .quest-desc');
  })()`));
  check('Journal treats snapshot prose as text rather than executable markup', await evalJs(`(async () => {
    const status = await import('/js/status.js');
    const payload = '<img src=x onerror="window.__questXss=true">';
    status.renderQuest({quest:{kind:'deliver',done:false,objective:payload,destination:{name:payload},returnTo:payload}});
    return document.querySelector('#quest-row .quest-desc').textContent === payload && !document.querySelector('#quest-row img') && window.__questXss !== true;
  })()`));
  await evalJs(`(async () => {
    (await import('/js/status.js')).renderQuest({quest:window.__journalWireSnapshot});
    window.__journalSend = WebSocket.prototype.send;
    window.__journalFrames = [];
    WebSocket.prototype.send = function(data) {
      try { const m=JSON.parse(data); if (['input','panel_request'].includes(m.t)) window.__journalFrames.push(m); } catch {}
      return window.__journalSend.call(this,data);
    };
    document.getElementById('cmd').value='say preserve journal draft';
    document.getElementById('quest-inspect').click();
  })()`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('Journal')`);
  check('Journal inspection preserves drafts and sends only a passive scoped request', await evalJs(`document.getElementById('cmd').value === 'say preserve journal draft' && window.__journalFrames.length === 1 && window.__journalFrames[0].t === 'panel_request' && window.__journalFrames[0].panel === 'journal'`));
  await evalJs(`document.getElementById('panel-refresh').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('Journal')`);
  check('Journal refresh scopes a new passive request', await evalJs(`window.__journalFrames.length === 2 && window.__journalFrames.every(m=>m.t === 'panel_request' && m.panel === 'journal') && window.__journalFrames[0].requestId !== window.__journalFrames[1].requestId`));
  check('spectator Journal inspection stays local and updates as snapshots change', await evalJs(`(async () => {
    const {gameState} = await import('/js/state.js');
    const status = await import('/js/status.js');
    gameState.spectating = true;
    try {
      status.renderQuest({quest:{kind:'skin',source:'crier',done:false,objective:'Harvest pelts.',counter:{current:1,total:4,remaining:3,unit:'skins'}}});
      document.getElementById('btn-journal').click();
      document.getElementById('panel-refresh').click();
      const browsing = document.querySelector('#panel-body progress')?.value === 1 && document.getElementById('panel-body').textContent.includes('Read-only live snapshot');
      status.renderQuest({quest:null});
      return browsing && window.__journalFrames.length === 2 && !document.querySelector('#panel-body progress') && document.getElementById('panel-body').textContent.includes('No task') && document.getElementById('cmd').value === 'say preserve journal draft';
    } finally {
      gameState.spectating = false;
      status.renderQuest({quest:window.__journalWireSnapshot});
      WebSocket.prototype.send = window.__journalSend;
      document.getElementById('cmd').value='';
      document.getElementById('panel-close').click();
    }
  })()`));

  // 5. Status strip
  await waitFor(`!document.getElementById('status-strip').hidden`);
  const strip = await evalJs(`document.getElementById('strip-hp-label').textContent + '|' + document.getElementById('strip-mana-label').textContent + '|' + document.getElementById('strip-circle').textContent + '|' + document.getElementById('strip-silver').textContent`);
  check('status strip shows prose vitals', /^HP: .+\|Mana: .+\|Circle \d+\|\d+ silvers$/.test(strip), strip);
  check('vitals retain numeric accessible values', await evalJs(`['hp','mana','stamina'].every(k => { const e=document.getElementById('strip-'+k+'-wrap'); return Number(e.getAttribute('aria-valuemax')) > 0 && e.hasAttribute('aria-valuenow') && e.getAttribute('aria-valuetext').includes(' of '); })`));

  // 6. Exits widget: the compass rose must light exactly the room's exits.
  const exits = await evalJs(`[...document.querySelectorAll('#rp-compass .compass-btn:not(.off)')].map(b => b.textContent.toLowerCase()).sort().join(',')`);
  const wantExits = [...startExits].map((e) => ({ north:'n',south:'s',east:'e',west:'w',northeast:'ne',northwest:'nw',southeast:'se',southwest:'sw',up:'u',down:'d' }[e] || e)).sort().join(',');
  check('exits widget', exits === wantExits, `${exits} vs ${wantExits}`);

  // Command discovery is local: browsing and preparing never send game input.
  await evalJs(`(() => {
    window.__guideSend = WebSocket.prototype.send;
    window.__guideFrames = [];
    WebSocket.prototype.send = function(data) {
      try { const m=JSON.parse(data); if (['input','panel_request'].includes(m.t)) window.__guideFrames.push(m); } catch {}
      return window.__guideSend.call(this, data);
    };
    document.getElementById('cmd').value='';
    document.getElementById('btn-commands').click();
  })();true`);
  await waitFor(`document.getElementById('command-guide-search') && document.activeElement.id === 'command-guide-search'`);
  check('Commands dock opens with accessible search focus', await evalJs(`document.getElementById('btn-commands').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('.command-guide-card').length > 80`));
  await evalJs(`(() => { const s=document.getElementById('command-guide-search'); s.value='bank'; s.dispatchEvent(new Event('input')); })();true`);
  check('Commands search finds bank actions', await evalJs(`document.querySelectorAll('.command-guide-card').length === 3 && !!document.querySelector('[data-prepare-command="deposit"]') && !!document.querySelector('[data-prepare-command="withdraw"]')`));
  await evalJs(`(() => { const s=document.getElementById('command-guide-category'); s.value='Combat'; s.dispatchEvent(new Event('change')); })();true`);
  check('Commands category combines with search and explains empty results', await evalJs(`document.querySelectorAll('.command-guide-card').length === 0 && document.querySelector('.command-guide-results').textContent.includes('No matches')`));
  await evalJs(`(() => { const c=document.getElementById('command-guide-category'); c.value=''; c.dispatchEvent(new Event('change')); document.querySelector('[data-prepare-command="deposit"]').click(); })();true`);
  check('Commands prepares editable verb without sending syntax placeholders', await evalJs(`document.getElementById('cmd').value === 'deposit' && document.activeElement.id === 'cmd' && window.__guideFrames.length === 0`));
  await evalJs(`document.getElementById('cmd').value='say my draft';document.querySelector('[data-prepare-command="withdraw"]').click();true`);
  check('Commands preserves an existing input draft', await evalJs(`document.getElementById('cmd').value === 'say my draft' && document.querySelector('.command-guide-feedback').textContent.includes('draft')`));
  check('Commands rechecks spectator safety at click time', await evalJs(`(async () => {
    const { gameState } = await import('/js/state.js');
    gameState.spectating = true;
    try {
      const i=document.getElementById('cmd'); i.value='';
      document.querySelector('[data-prepare-command="deposit"]').click();
      document.getElementById('btn-commands').click();
      return i.value === '' && [...document.querySelectorAll('[data-prepare-command]')].every(b=>b.disabled) && window.__guideFrames.length === 0;
    } finally { gameState.spectating = false; }
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__guideSend;document.getElementById('panel-close').click();true`);
  check('Commands close restores focus', await evalJs(`document.activeElement.id === 'cmd' && document.getElementById('panel-wrap').hidden`));

  // Progress uses the scoped read-only panel protocol and preserves typed drafts.
  await evalJs(`(() => {
    window.__progressSend = WebSocket.prototype.send;
    window.__progressFrames = [];
    WebSocket.prototype.send = function(data) {
      try { const m=JSON.parse(data); if (['input','panel_request'].includes(m.t)) window.__progressFrames.push(m); } catch {}
      return window.__progressSend.call(this, data);
    };
    document.getElementById('cmd').value='say keep this draft';
    document.getElementById('btn-progress').click();
  })();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('Advancement to circle')`);
  check('Progress dock loads requirements through the panel protocol', await evalJs(`document.getElementById('panel-body').textContent.includes('Requirements met:') && window.__progressFrames.length === 1 && window.__progressFrames[0].t === 'panel_request' && window.__progressFrames[0].panel === 'progress'`));
  check('Progress preserves the draft and isolates output from the story', await evalJs(`document.getElementById('cmd').value === 'say keep this draft' && !document.getElementById('terminal').textContent.includes('Advancement to circle') && document.getElementById('btn-progress').getAttribute('aria-expanded') === 'true'`));
  await evalJs(`document.getElementById('panel-refresh').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('Advancement to circle')`);
  check('Progress refresh uses a fresh scoped request', await evalJs(`window.__progressFrames.length === 2 && window.__progressFrames.every(m=>m.t === 'panel_request' && m.panel === 'progress') && window.__progressFrames[0].requestId !== window.__progressFrames[1].requestId`));
  check('spectators cannot request Progress or execute stale journey actions', await evalJs(`(async () => {
    const { gameState } = await import('/js/state.js');
    const journey = await import('/js/journey.js');
    journey.updateJourney({ characterId: 1, guildId: 'paladin', hp: 100, maxHp: 100, soul: 19 }, { circle: 2, rows: [{ label: 'Conviction', have: 5, need: 5 }] }, true);
    const action = document.querySelector('#journey-actions button');
    const soulGuard = document.getElementById('journey-text').textContent.includes('soul is too dim') && action.textContent === 'progress';
    gameState.spectating = true;
    try {
      action.click();
      document.getElementById('btn-progress').click();
      journey.updateJourney({ characterId: 1, guildId: 'paladin', hp: 100, maxHp: 100, soul: 19 }, { circle: 2, rows: [{ label: 'Conviction', have: 5, need: 5 }] }, true);
      return soulGuard && window.__progressFrames.length === 2 && document.getElementById('panel-body').textContent.includes('Watching is read-only') && document.getElementById('panel-refresh').disabled && document.getElementById('journey-guide').hidden && document.getElementById('journey-toggle').hidden;
    } finally { gameState.spectating = false; journey.updateJourney(null, null, false); }
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__progressSend;document.getElementById('cmd').value='';document.getElementById('panel-close').click();true`);

  // Training planning shares the passive Progress dock without mutating stats.
  await evalJs(`(() => {
    window.__trainingSend=WebSocket.prototype.send;window.__trainingFrames=[];window.__trainingHold=false;
    WebSocket.prototype.send=function(data){let m;try{m=JSON.parse(data);}catch{}if(['input','panel_request'].includes(m?.t)){window.__trainingFrames.push(m);if(window.__trainingHold&&m.t==='panel_request')return;}return window.__trainingSend.call(this,data);};
    const input=document.getElementById('cmd');input.value=${JSON.stringify('train preserve training draft')};input.focus();input.setSelectionRange(6,12);
    document.getElementById('btn-progress').click();document.getElementById('progress-tab-training').click();
  })()`);
  await waitFor(`document.getElementById('progress-content')?.textContent.includes('Training plan')`);
  check('Training tab loads only a passive plan request', await evalJs(`window.__trainingFrames.length===2&&window.__trainingFrames.every(m=>m.t==='panel_request'&&!Object.hasOwn(m,'query'))&&window.__trainingFrames.at(-1).panel==='training'&&document.getElementById('progress-tab-training').getAttribute('aria-selected')==='true'`));
  check('Progress training preserves command draft, caret and input focus', await evalJs(`document.getElementById('cmd').value===${JSON.stringify('train preserve training draft')}&&document.getElementById('cmd').selectionStart===6&&document.getElementById('cmd').selectionEnd===12&&document.activeElement.id==='cmd'`));
  check('Progress keyboard tabs reject stale responses and escape text', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');window.__trainingHold=true;document.getElementById('panel-refresh').click();const old=window.__trainingFrames.at(-1);
    document.getElementById('progress-tab-training').focus();document.getElementById('progress-tab-training').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));const current=window.__trainingFrames.at(-1);
    panels.receivePanel({requestId:old.requestId,ok:true,lines:['STALE TRAINING']});const ignored=!document.getElementById('progress-content').textContent.includes('STALE')&&document.getElementById('progress-content').getAttribute('aria-busy')==='true';
    panels.receivePanel({requestId:current.requestId,ok:true,lines:[${JSON.stringify('<img src=x onerror="window.__trainingXss=true">')}]});
    return ignored&&current.panel==='progress'&&document.activeElement.id==='progress-tab-progress'&&!document.querySelector('#progress-content img')&&window.__trainingXss!==true&&document.getElementById('progress-content').textContent.includes('<img');
  })()`));
  check('Training refresh creates fresh scoped requests and shows server errors', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');document.getElementById('progress-tab-training').click();const old=window.__trainingFrames.at(-1);document.getElementById('panel-refresh').click();const current=window.__trainingFrames.at(-1);
    panels.receivePanel({requestId:current.requestId,ok:false,error:'Training inspection unavailable.'});return old.requestId!==current.requestId&&current.panel==='training'&&document.querySelector('#progress-content .ch-error')?.textContent==='Training inspection unavailable.';
  })()`));
  await evalJs(`document.getElementById('panel-refresh').click();window.__trainingTimedOut=window.__trainingFrames.at(-1);true`);
  await waitFor(`document.getElementById('progress-content')?.textContent.includes('No response received')`, 6500);
  check('Training timeout rejects late responses and permits explicit refresh', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');panels.receivePanel({requestId:window.__trainingTimedOut.requestId,ok:true,lines:['LATE TIMEOUT RESPONSE']});const ignored=!document.getElementById('progress-content').textContent.includes('LATE');document.getElementById('panel-refresh').click();const current=window.__trainingFrames.at(-1);
    return ignored&&current.requestId!==window.__trainingTimedOut.requestId&&document.getElementById('progress-content').getAttribute('aria-busy')==='true';
  })()`));
  check('Training requests stay disabled while watching, allocating or missing protocol', await evalJs(`(async () => {
    const panels=await import('/js/panels.js'),{gameState}=await import('/js/state.js');const pending=window.__trainingFrames.at(-1),before=window.__trainingFrames.length,inChargen=gameState.inChargen;
    try{gameState.spectating=true;panels.receivePanel({requestId:pending.requestId,ok:true,lines:['PRIVATE TRAINING']});document.getElementById('progress-tab-training').click();const watch=!document.getElementById('progress-content').textContent.includes('PRIVATE')&&document.getElementById('panel-refresh').disabled;
      gameState.spectating=false;gameState.inChargen=true;document.getElementById('btn-progress').click();gameState.inChargen=false;panels.setProtocolSupported(false);document.getElementById('btn-progress').click();
      return watch&&window.__trainingFrames.length===before&&document.getElementById('progress-content').textContent.includes('panels-v1');
    }finally{gameState.spectating=false;gameState.inChargen=inChargen;panels.setProtocolSupported(true);}
  })()`));
  check('closing Progress rejects pending Training replies', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');document.getElementById('btn-progress').click();const pending=window.__trainingFrames.at(-1);document.getElementById('panel-close').click();panels.receivePanel({requestId:pending.requestId,ok:true,lines:['LATE CLOSED TRAINING']});return !panels.isPanelOpen()&&!document.getElementById('panel-body').textContent.includes('LATE CLOSED');
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__trainingSend;document.getElementById('cmd').value='';true`);

  // 7. Inventory panel
  await evalJs(`document.getElementById('btn-inv').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('carrying')`);
  check('inventory panel', true);

  // Equipment inspection preserves drafts and never equips or repairs gear.
  await evalJs(`(() => {
    window.__gearSend=WebSocket.prototype.send;window.__gearFrames=[];window.__gearHold=false;
    WebSocket.prototype.send=function(data){let m;try{m=JSON.parse(data);}catch{}if(['input','panel_request'].includes(m?.t)){window.__gearFrames.push(m);if(window.__gearHold&&m.t==='panel_request')return;}return window.__gearSend.call(this,data);};
    const input=document.getElementById('cmd');input.value=${JSON.stringify('repair preserve equipment draft')};input.focus();input.setSelectionRange(6,12);
    document.getElementById('btn-inv').click();document.getElementById('inventory-tab-equipment').click();
  })()`);
  await waitFor(`document.getElementById('inventory-content')?.textContent.includes('Equipment report')`);
  check('Equipment tab loads only passive inventory and equipment requests', await evalJs(`window.__gearFrames.length===2&&window.__gearFrames[0].panel==='inventory'&&window.__gearFrames.every(m=>m.t==='panel_request'&&!Object.hasOwn(m,'query'))&&window.__gearFrames.at(-1).panel==='equipment'&&document.getElementById('inventory-tab-equipment').getAttribute('aria-selected')==='true'`));
  check('Inventory equipment preserves command draft, caret and input focus', await evalJs(`document.getElementById('cmd').value===${JSON.stringify('repair preserve equipment draft')}&&document.getElementById('cmd').selectionStart===6&&document.getElementById('cmd').selectionEnd===12&&document.activeElement.id==='cmd'`));
  check('Inventory keyboard tabs reject stale responses and escape text', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');window.__gearHold=true;document.getElementById('panel-refresh').click();const old=window.__gearFrames.at(-1);
    document.getElementById('inventory-tab-equipment').focus();document.getElementById('inventory-tab-equipment').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));const current=window.__gearFrames.at(-1);
    panels.receivePanel({requestId:old.requestId,ok:true,lines:['STALE EQUIPMENT']});const ignored=!document.getElementById('inventory-content').textContent.includes('STALE')&&document.getElementById('inventory-content').getAttribute('aria-busy')==='true';
    panels.receivePanel({requestId:current.requestId,ok:true,lines:[${JSON.stringify('<img src=x onerror="window.__gearXss=true">')}]});
    return ignored&&current.panel==='inventory'&&document.activeElement.id==='inventory-tab-inventory'&&!document.querySelector('#inventory-content img')&&window.__gearXss!==true&&document.getElementById('inventory-content').textContent.includes('<img');
  })()`));
  check('Equipment refresh creates fresh scoped requests and shows server errors', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');document.getElementById('inventory-tab-equipment').click();const old=window.__gearFrames.at(-1);document.getElementById('panel-refresh').click();const current=window.__gearFrames.at(-1);
    panels.receivePanel({requestId:current.requestId,ok:false,error:'Equipment inspection unavailable.'});return old.requestId!==current.requestId&&current.panel==='equipment'&&document.querySelector('#inventory-content .ch-error')?.textContent==='Equipment inspection unavailable.';
  })()`));
  await evalJs(`document.getElementById('panel-refresh').click();window.__gearTimedOut=window.__gearFrames.at(-1);true`);
  await waitFor(`document.getElementById('inventory-content')?.textContent.includes('No response received')`, 6500);
  check('Equipment timeout rejects late responses and permits explicit refresh', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');panels.receivePanel({requestId:window.__gearTimedOut.requestId,ok:true,lines:['LATE TIMEOUT RESPONSE']});const ignored=!document.getElementById('inventory-content').textContent.includes('LATE');document.getElementById('panel-refresh').click();const current=window.__gearFrames.at(-1);
    return ignored&&current.requestId!==window.__gearTimedOut.requestId&&document.getElementById('inventory-content').getAttribute('aria-busy')==='true';
  })()`));
  check('Equipment requests stay disabled while watching, allocating or missing protocol', await evalJs(`(async () => {
    const panels=await import('/js/panels.js'),{gameState}=await import('/js/state.js');const pending=window.__gearFrames.at(-1),before=window.__gearFrames.length,inChargen=gameState.inChargen;
    try{gameState.spectating=true;panels.receivePanel({requestId:pending.requestId,ok:true,lines:['PRIVATE EQUIPMENT']});document.getElementById('inventory-tab-equipment').click();const watch=!document.getElementById('inventory-content').textContent.includes('PRIVATE')&&document.getElementById('panel-refresh').disabled;
      gameState.spectating=false;gameState.inChargen=true;document.getElementById('btn-inv').click();gameState.inChargen=false;panels.setProtocolSupported(false);document.getElementById('btn-inv').click();
      return watch&&window.__gearFrames.length===before&&document.getElementById('inventory-content').textContent.includes('panels-v1');
    }finally{gameState.spectating=false;gameState.inChargen=inChargen;panels.setProtocolSupported(true);}
  })()`));
  check('closing Inventory rejects pending Equipment replies', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');document.getElementById('btn-inv').click();const pending=window.__gearFrames.at(-1);document.getElementById('panel-close').click();panels.receivePanel({requestId:pending.requestId,ok:true,lines:['LATE CLOSED EQUIPMENT']});return !panels.isPanelOpen()&&!document.getElementById('panel-body').textContent.includes('LATE CLOSED');
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__gearSend;document.getElementById('cmd').value='';true`);


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

  // Explicit corpse inspection reaches the server; FIND is always local search.
  await evalJs(`(() => {
    window.__searchSend = WebSocket.prototype.send;
    window.__searchFrames = [];
    WebSocket.prototype.send = function(data) {
      try { const m=JSON.parse(data); if (m.t === 'input') window.__searchFrames.push(m); } catch {}
      return window.__searchSend.call(this, data);
    };
  })();true`);
  await cmd('search corpse');
  check('explicit corpse search reaches the world instead of the transcript', await evalJs(`window.__searchFrames.length === 1 && window.__searchFrames[0].line === 'search corpse' && document.getElementById('searchbar').hidden`));
  await cmd('find corpse');
  check('find searches corpse text locally without sending input', await evalJs(`window.__searchFrames.length === 1 && !document.getElementById('searchbar').hidden && document.getElementById('search-input').value === 'corpse'`));
  await evalJs(`WebSocket.prototype.send=window.__searchSend;document.getElementById('search-close').click();true`);

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

  // Walk current content paths through ordinary commands; no teleport API.
  let roomId = Object.values(ROOMS).find(r => startTitle.startsWith(r.name + ','))?.id;
  if (!roomId) throw new Error('Cannot identify the fixture starting room.');
  async function walkTo(destination) {
    const path = findPath(roomId, destination);
    if (!path) throw new Error(`No fixture route from ${roomId} to ${destination}`);
    for (const dir of path) {
      const before = await evalJs(`document.querySelectorAll('.room-title').length`);
      await cmd(dir);
      await waitFor(`document.querySelectorAll('.room-title').length > ${before}`, 5000);
    }
    roomId = destination;
    check('arrived at ' + destination, await evalJs(`document.getElementById('rp-title').textContent.startsWith(${JSON.stringify(ROOMS[destination].name + ',')})`));
  }
  await walkTo('bazaar');
  await cmd('buy dagger');
  await cmd('wield dagger');
  check('purchased weapon equips', await waitFor(`document.getElementById('hands-hand').textContent.includes('dagger')`));
  await walkTo('sewers_1');
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
    for (let i = 0; i < 30 && !cleared; i++) { await cmd('flee'); await sleep(1000); cleared = await evalJs(`document.getElementById('strip-combat').hidden`); }
    check('combat chip clears after leaving combat', cleared, cleared ? '' : await evalJs(`document.getElementById('terminal').textContent.slice(-600)`));
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
  try { const blob = JSON.parse(exported); exportKeys = Object.keys(blob.config || {}); exportOk = blob.version === 1 && !!blob.config?.dr_macros && !!blob.config?.dr_settings; } catch {}
  check('config export produces JSON', exportOk, exportKeys.join(','));
  await evalJs(`document.getElementById('panel-close').click();true`);

  // 21. Alt-modified terminal font keys leave native browser zoom intact.
  const fontBefore = await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'=', ctrlKey:true, altKey:true, cancelable:true}));true`);
  await sleep(150);
  const fontStepped = await evalJs(`getComputedStyle(document.querySelector('#terminal .block')).fontSize`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'0', ctrlKey:true, altKey:true, cancelable:true}));true`);
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

  // 26. Server-stored scripts: save one, clear the tab-scoped session token,
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
  check('script save confirmed by server', await waitFor(`import('/js/scripts.js').then(m => m.ownsScript('persistme'))`));
  // Runtime diagnostics update only their own elements, never the editor draft.
  await evalJs(`(async () => {
    const scripts=await import('/js/scripts.js'),control=await import('/js/automation-control.js');
    window.__debugPaused=control.isAutomationPaused();control.setAutomationPaused(false);
    window.__debugLibrary=Object.fromEntries(scripts.listScripts().filter(n=>scripts.ownsScript(n)).map(n=>[n,scripts.readScript(n)]));
    scripts.mergeServerScripts({...window.__debugLibrary,...${JSON.stringify({__debug_parent:'# parent\n\nstart:\nputrun __debug_child',__debug_child:'# child\n\nwaitforre [<img src=x onerror="window.__scriptXss=true">',__debug_wait:'# waiting\npause 60'})}});
    const editor=document.getElementById('script-b');editor.value='Keep this unfinished script draft';editor.dispatchEvent(new Event('input'));editor.focus();editor.setSelectionRange(2,5);
    scripts.runScript('__debug_parent');
  })()`);
  check('script errors show child source and parent call context accessibly', await evalJs(`document.getElementById('script-run-status').textContent.includes('stopped after an error') && document.getElementById('script-run-diagnostic').getAttribute('role') === 'alert' && document.getElementById('script-run-diagnostic').textContent.includes('__debug_child:3') && document.getElementById('script-run-diagnostic').textContent.includes('Called from __debug_parent:4')`));
  check('script diagnostics preserve editor draft, selection and focus', await evalJs(`document.getElementById('script-b').value === 'Keep this unfinished script draft' && document.getElementById('script-b').selectionStart === 2 && document.getElementById('script-b').selectionEnd === 5 && document.activeElement.id === 'script-b'`));
  check('script source diagnostics cannot execute HTML', await evalJs(`document.getElementById('script-run-diagnostic').textContent.includes('<img src=x') && !document.querySelector('#script-run-diagnostic img') && window.__scriptXss !== true`));
  check('explicit new script clears the old error and reports waiting state', await evalJs(`(async () => {
    const scripts=await import('/js/scripts.js');scripts.runScript('__debug_wait');
    return scripts.isScriptRunning() && document.getElementById('script-run-status').textContent.includes('waiting for a timer or roundtime') && document.getElementById('script-run-diagnostic').hidden;
  })()`));
  check('script pause feedback never restarts a stopped script on resume', await evalJs(`(async () => {
    const scripts=await import('/js/scripts.js'),control=await import('/js/automation-control.js');
    control.setAutomationPaused(true);
    const paused=document.getElementById('script-run-status').textContent.includes('Automation paused') && !scripts.isScriptRunning();
    control.setAutomationPaused(false);
    return paused && !scripts.isScriptRunning() && document.getElementById('script-run-status').textContent.includes('stopped');
  })()`));
  await evalJs(`(async () => {
    const scripts=await import('/js/scripts.js'),control=await import('/js/automation-control.js');
    scripts.mergeServerScripts(window.__debugLibrary);control.setAutomationPaused(window.__debugPaused);document.getElementById('script-cancel').click();
  })()`);
  // Passive crafting tabs reuse scoped requests and leave both editors untouched.
  await evalJs(`(async () => {
    window.__craftSend=WebSocket.prototype.send;window.__craftFrames=[];window.__craftHold=false;
    WebSocket.prototype.send=function(data){let message;try{message=JSON.parse(data);}catch{}if(['input','panel_request'].includes(message?.t)){window.__craftFrames.push(message);if(window.__craftHold&&message.t==='panel_request')return;}return window.__craftSend.call(this,data);};
    document.getElementById('cmd').value=${JSON.stringify('say preserve crafting draft')};
    document.getElementById('script-kind').value='script';document.getElementById('script-a').value='unfinished_crafting';
    const editor=document.getElementById('script-b');editor.value=${JSON.stringify('echo unfinished\nwait')};editor.dispatchEvent(new Event('input'));
    document.getElementById('btn-crafting').click();
  })()`);
  await waitFor(`document.getElementById('crafting-content')?.textContent.includes('Recipe plans')`);
  check('Crafting Recipes loads through one passive panel request', await evalJs(`window.__craftFrames.length===1&&window.__craftFrames[0].t==='panel_request'&&window.__craftFrames[0].panel==='recipes'&&document.querySelector('#crafting-tab-recipes[aria-selected="true"]')!==null`));
  await evalJs(`document.getElementById('crafting-tab-orders').click();true`);
  await waitFor(`/Work orders?:/.test(document.getElementById('crafting-content')?.textContent)||document.getElementById('crafting-content')?.textContent.includes('Work order —')`);
  check('Crafting Work order tab inspects without assigning work', await evalJs(`window.__craftFrames.length===2&&window.__craftFrames[1].t==='panel_request'&&window.__craftFrames[1].panel==='orders'&&window.__craftFrames[0].requestId!==window.__craftFrames[1].requestId`));
  check('Crafting preserves command and Scripts editor drafts', await evalJs(`(() => {document.getElementById('btn-scripts').click();return document.getElementById('cmd').value===${JSON.stringify('say preserve crafting draft')}&&document.getElementById('script-a').value==='unfinished_crafting'&&document.getElementById('script-b').value===${JSON.stringify('echo unfinished\nwait')};})()`));
  check('Crafting keyboard tabs reject stale responses and escape source HTML', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');window.__craftHold=true;document.getElementById('btn-crafting').click();
    const old=window.__craftFrames.at(-1);document.getElementById('crafting-tab-orders').focus();
    document.getElementById('crafting-tab-orders').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
    const current=window.__craftFrames.at(-1);panels.receivePanel({requestId:old.requestId,ok:true,lines:['STALE WORK ORDER']});
    const staleIgnored=!document.getElementById('crafting-content').textContent.includes('STALE')&&document.getElementById('crafting-content').getAttribute('aria-busy')==='true';
    panels.receivePanel({requestId:current.requestId,ok:true,lines:[${JSON.stringify('<img src=x onerror="window.__craftXss=true">')}]});
    return staleIgnored&&current.panel==='recipes'&&document.activeElement.id==='crafting-tab-recipes'&&document.getElementById('crafting-content').textContent.includes('<img')&&!document.querySelector('#crafting-content img')&&window.__craftXss!==true;
  })()`));
  check('Crafting displays scoped server errors and refresh creates a fresh request', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');const old=window.__craftFrames.at(-1).requestId;document.getElementById('panel-refresh').click();
    const current=window.__craftFrames.at(-1);panels.receivePanel({requestId:current.requestId,ok:false,error:'Crafting inspection unavailable.'});
    return current.requestId!==old&&document.querySelector('#crafting-content .ch-error')?.textContent==='Crafting inspection unavailable.'&&!document.getElementById('crafting-content').hasAttribute('aria-busy');
  })()`));
  check('Crafting rejects pending responses and sends nothing while watching or signing in', await evalJs(`(async () => {
    const panels=await import('/js/panels.js'),{gameState}=await import('/js/state.js');const value=gameState.value;
    document.getElementById('panel-refresh').click();const pending=window.__craftFrames.at(-1);const before=window.__craftFrames.length;
    try{gameState.spectating=true;panels.receivePanel({requestId:pending.requestId,ok:true,lines:['STALE PRIVATE ORDER']});
      document.getElementById('crafting-tab-orders').click();document.getElementById('panel-refresh').click();
      const watch=!document.getElementById('crafting-content').textContent.includes('STALE')&&document.getElementById('panel-refresh').disabled;
      gameState.spectating=false;gameState.value='login';document.getElementById('btn-crafting').click();
      return watch&&window.__craftFrames.length===before&&document.getElementById('cmd').value===${JSON.stringify('say preserve crafting draft')};
    }finally{gameState.spectating=false;gameState.value=value;}
  })()`));
  check('Crafting never falls back to ordinary commands without panel support', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');const before=window.__craftFrames.length;panels.setProtocolSupported(false);
    try{document.getElementById('btn-crafting').click();return window.__craftFrames.length===before&&document.getElementById('panel-refresh').disabled;}finally{panels.setProtocolSupported(true);}
  })()`));
  check('closing Crafting cancels pending requests and ignores late responses', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');document.getElementById('btn-crafting').click();const pending=window.__craftFrames.at(-1);
    document.getElementById('panel-close').click();panels.receivePanel({requestId:pending.requestId,ok:true,lines:['LATE CRAFTING RESPONSE']});
    return !panels.isPanelOpen()&&document.getElementById('panel-wrap').hidden&&!document.getElementById('panel-body').textContent.includes('LATE CRAFTING RESPONSE');
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__craftSend;document.getElementById('cmd').value='';document.getElementById('btn-scripts').click();document.getElementById('script-cancel').click();document.getElementById('panel-close').click();true`);
  // Spell inspection is passive across all tabs, including replayed stale replies.
  await evalJs(`(async () => {
    window.__spellSend=WebSocket.prototype.send;window.__spellFrames=[];window.__spellHold=false;
    WebSocket.prototype.send=function(data){let message;try{message=JSON.parse(data);}catch{}if(['input','panel_request'].includes(message?.t)){window.__spellFrames.push(message);if(window.__spellHold&&message.t==='panel_request')return;}return window.__spellSend.call(this,data);};
    document.getElementById('cmd').value=${JSON.stringify('prepare preserve spell draft')};document.getElementById('btn-scripts').click();
    document.getElementById('script-a').value='unfinished_spell';const editor=document.getElementById('script-b');editor.value=${JSON.stringify('echo unfinished spells\nwait')};editor.dispatchEvent(new Event('input'));
    document.getElementById('btn-spells').click();
  })()`);
  await waitFor(`/Spells you hold:|You hold no spells yet/.test(document.getElementById('spells-content')?.textContent)`);
  check('Spells tab sends only a passive spells request', await evalJs(`window.__spellFrames.length===1&&window.__spellFrames[0].t==='panel_request'&&window.__spellFrames[0].panel==='spells'&&document.getElementById('spells-tab-spells').getAttribute('aria-selected')==='true'`));
  await evalJs(`document.getElementById('spells-tab-spellbook').click();true`);
  await waitFor(`document.getElementById('spells-content')?.textContent.includes('Spellbook —')`);
  check('Spellbook tab passively loads guild catalogue', await evalJs(`window.__spellFrames.length===2&&window.__spellFrames[1].t==='panel_request'&&window.__spellFrames[1].panel==='spellbook'`));
  await evalJs(`document.getElementById('spells-tab-slots').click();true`);
  await waitFor(`document.getElementById('spells-content')?.textContent.includes('Spell slots:')`);
  check('Slots tab loads budget without learning or preparing spells', await evalJs(`window.__spellFrames.length===3&&window.__spellFrames[2].t==='panel_request'&&window.__spellFrames[2].panel==='slots'&&new Set(window.__spellFrames.map(m=>m.requestId)).size===3`));
  check('spell inspection preserves command and Scripts drafts', await evalJs(`(() => {document.getElementById('btn-scripts').click();return document.getElementById('cmd').value===${JSON.stringify('prepare preserve spell draft')}&&document.getElementById('script-a').value==='unfinished_spell'&&document.getElementById('script-b').value===${JSON.stringify('echo unfinished spells\nwait')};})()`));
  check('spell tabs support keyboard navigation and reject stale text safely', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');window.__spellHold=true;document.getElementById('btn-spells').click();const old=window.__spellFrames.at(-1);
    document.getElementById('spells-tab-slots').focus();document.getElementById('spells-tab-slots').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
    const current=window.__spellFrames.at(-1);panels.receivePanel({requestId:old.requestId,ok:true,lines:['STALE SPELL SLOTS']});
    const ignored=!document.getElementById('spells-content').textContent.includes('STALE')&&document.getElementById('spells-content').getAttribute('aria-busy')==='true';
    panels.receivePanel({requestId:current.requestId,ok:true,lines:[${JSON.stringify('<img src=x onerror="window.__spellXss=true">')}]});
    return ignored&&current.panel==='spells'&&document.activeElement.id==='spells-tab-spells'&&document.getElementById('spells-content').textContent.includes('<img')&&!document.querySelector('#spells-content img')&&window.__spellXss!==true;
  })()`));
  check('spell refresh shows errors and closed panels ignore late responses', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');const old=window.__spellFrames.at(-1);document.getElementById('panel-refresh').click();const current=window.__spellFrames.at(-1);
    panels.receivePanel({requestId:current.requestId,ok:false,error:'Spell inspection unavailable.'});const error=document.querySelector('#spells-content .ch-error')?.textContent==='Spell inspection unavailable.'&&old.requestId!==current.requestId;
    document.getElementById('panel-refresh').click();const late=window.__spellFrames.at(-1);document.getElementById('panel-close').click();panels.receivePanel({requestId:late.requestId,ok:true,lines:['LATE SPELL RESPONSE']});
    return error&&!panels.isPanelOpen()&&!document.getElementById('panel-body').textContent.includes('LATE SPELL RESPONSE');
  })()`));
  check('spell inspection sends nothing while watching, allocating, signing in or without protocol', await evalJs(`(async () => {
    const panels=await import('/js/panels.js'),{gameState}=await import('/js/state.js');const value=gameState.value,inChargen=gameState.inChargen;
    document.getElementById('btn-spells').click();const pending=window.__spellFrames.at(-1);const before=window.__spellFrames.length;
    try{gameState.spectating=true;panels.receivePanel({requestId:pending.requestId,ok:true,lines:['PRIVATE SPELL SNAPSHOT']});document.getElementById('spells-tab-spellbook').click();
      const watch=!document.getElementById('spells-content').textContent.includes('PRIVATE')&&document.getElementById('panel-refresh').disabled;
      gameState.spectating=false;gameState.inChargen=true;document.getElementById('btn-spells').click();
      gameState.inChargen=false;gameState.value='login';document.getElementById('btn-spells').click();
      gameState.value=value;panels.setProtocolSupported(false);document.getElementById('btn-spells').click();
      return watch&&window.__spellFrames.length===before&&document.getElementById('spells-content').textContent.includes('panels-v1')&&document.getElementById('panel-refresh').disabled;
    }finally{gameState.spectating=false;gameState.value=value;gameState.inChargen=inChargen;panels.setProtocolSupported(true);}
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__spellSend;document.getElementById('cmd').value='';document.getElementById('btn-scripts').click();document.getElementById('script-cancel').click();document.getElementById('panel-close').click();true`);
  // Spellbook search submits text through the passive query field only.
  await evalJs(`(async () => {
    window.__filterSend=WebSocket.prototype.send;window.__filterFrames=[];window.__filterHold=false;
    WebSocket.prototype.send=function(data){let message;try{message=JSON.parse(data);}catch{}if(['input','panel_request'].includes(message?.t)){window.__filterFrames.push(message);if(window.__filterHold&&message.t==='panel_request')return;}return window.__filterSend.call(this,data);};
    document.getElementById('cmd').value=${JSON.stringify('cast preserve filter draft')};document.getElementById('btn-spells').click();document.getElementById('spells-tab-spellbook').click();
  })()`);
  await waitFor(`document.getElementById('spells-content')?.getAttribute('aria-busy')!=='true'`);
  check('Spellbook typing keeps command drafts and makes no request', await evalJs(`(() => {
    const before=window.__filterFrames.length,input=document.getElementById('spellbook-query');input.value='  fire  ';input.dispatchEvent(new Event('input'));input.focus();
    return window.__filterFrames.length===before&&document.querySelector('label[for="spellbook-query"]').textContent==='Search spellbook'&&input.maxLength===120&&document.getElementById('cmd').value===${JSON.stringify('cast preserve filter draft')};
  })()`));
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await waitFor(`window.__filterFrames.at(-1)?.query==='fire'&&document.getElementById('spells-content')?.getAttribute('aria-busy')!=='true'`);
  check('Spellbook Search submits a trimmed query only through panel protocol', await evalJs(`(() => {
    const frame=window.__filterFrames.at(-1);return frame.t==='panel_request'&&frame.panel==='spellbook'&&frame.query==='fire'&&window.__filterFrames.every(m=>m.t==='panel_request')&&document.getElementById('spellbook-query').value==='fire'&&document.getElementById('spells-content').textContent.toLowerCase().includes('fire');
  })()`));
  check('Spellbook query and unsent draft survive refresh and tab navigation', await evalJs(`(() => {
    window.__filterHold=true;const input=document.getElementById('spellbook-query');input.value='unsent water';input.dispatchEvent(new Event('input'));
    document.getElementById('panel-refresh').click();const refreshed=window.__filterFrames.at(-1);
    document.getElementById('spells-tab-slots').click();const slots=window.__filterFrames.at(-1);document.getElementById('spells-tab-spellbook').click();const restored=window.__filterFrames.at(-1);
    return refreshed.query==='fire'&&restored.query==='fire'&&!Object.hasOwn(slots,'query')&&document.getElementById('spellbook-query').value==='unsent water'&&refreshed.requestId!==restored.requestId;
  })()`));
  check('Spellbook Clear cancels previous search and safely keeps query text literal', await evalJs(`(async () => {
    const panels=await import('/js/panels.js'),input=document.getElementById('spellbook-query');input.value=${JSON.stringify('<img src=x>;learn fireball')};input.dispatchEvent(new Event('input'));input.form.requestSubmit();const previous=window.__filterFrames.at(-1);
    const literal=previous.query===${JSON.stringify('<img src=x>;learn fireball')}&&!document.querySelector('.spellbook-search img');document.getElementById('spellbook-clear').click();const current=window.__filterFrames.at(-1);
    panels.receivePanel({requestId:previous.requestId,ok:true,lines:['STALE SEARCH RESULT']});const ignored=!document.getElementById('spells-content').textContent.includes('STALE');
    panels.receivePanel({requestId:current.requestId,ok:true,lines:['All spells restored.']});
    return literal&&ignored&&current.query===''&&document.getElementById('spellbook-query').value===''&&document.getElementById('spells-content').textContent==='All spells restored.'&&document.activeElement.id==='spellbook-query';
  })()`));
  check('unavailable Spellbook search and Clear cannot send requests', await evalJs(`(async () => {
    const panels=await import('/js/panels.js'),{gameState}=await import('/js/state.js');const before=window.__filterFrames.length;
    try{gameState.spectating=true;document.getElementById('btn-spells').click();const input=document.getElementById('spellbook-query');input.value='learn fireball';input.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.getElementById('spellbook-clear').click();
      return input.disabled&&document.getElementById('spellbook-search').disabled&&document.getElementById('spellbook-clear').disabled&&window.__filterFrames.length===before;
    }finally{gameState.spectating=false;panels.closePanel(false);}
  })()`));
  await evalJs(`WebSocket.prototype.send=window.__filterSend;document.getElementById('cmd').value='';true`);
  // Simulate a brand-new browser: drop local config AND the session token.
  await evalJs(`localStorage.removeItem('dr_scripts_v1'); localStorage.removeItem('dr_token'); sessionStorage.removeItem('dr_token'); location.reload(); true`);
  await waitFor(`!!document.getElementById('wf-user')`, 15000);
  await evalJs(`document.getElementById('wf-user').value=${JSON.stringify(acctUser)};document.getElementById('wf-pass').value=${JSON.stringify(acctPass)};document.getElementById('wf-login').click();true`);
  await waitFor(`!document.getElementById('welcome').hidden && document.querySelectorAll('.wslot').length >= 1`, 10000);
  // Select THIS account's character by clicking its slot (ids are global).
  await evalJs(`document.querySelector('.wslot:not(.wnew)')?.click();true`);
  await waitFor(`!!document.querySelector('.room-title')`, 12000);
  check('re-entered world after fresh-browser reload', true);
  // The server pushes the script library right after entry; wait for it.
  check('scripts restored from server', await waitFor(`import('/js/scripts.js').then(m => m.ownsScript('persistme'))`, 10000));
  await evalJs(`document.getElementById('btn-scripts').click();true`);
  await waitFor(`document.getElementById('script-addbtn') !== null`);
  check('restored script listed in panel', await evalJs(`[...document.querySelectorAll('#panel-body [data-run]')].some(b => b.dataset.run === 'persistme')`));
  await evalJs(`document.getElementById('panel-close').click();true`);

  // Component contract: a non-mana resource keeps its real accessible name.
  check('Inner Fire gauge has an accurate accessible name', await evalJs(`(async () => {
    const status = await import('/js/status.js');
    status.parsePrompt('HP: 100/100  Inner Fire: 75/100  Stamina: 100/100  RT: 0  Circle 1  150 silvers');
    status.renderStatusStrip();
    return document.getElementById('strip-mana-wrap').getAttribute('aria-label') === 'Inner Fire';
  })()`));
  await cmd('look');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check('mobile viewport does not overflow', await evalJs(`document.documentElement.scrollWidth <= innerWidth`));
  await evalJs(`document.getElementById('btn-inv').click();document.getElementById('inventory-tab-inventory').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('carrying')`);
  check('mobile inventory panel stays within viewport', await evalJs(`(() => {
    const r = document.getElementById('panel-body').getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth;
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  check('panel close returns command focus', await evalJs(`document.activeElement.id === 'cmd'`));
  await evalJs(`document.getElementById('btn-journal').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('Journal')`);
  check('mobile Journal inspection remains within viewport', await evalJs(`(() => {
    const r=document.getElementById('panel-body').getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth;
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-progress').click();document.getElementById('progress-tab-progress').click();true`);
  await waitFor(`document.getElementById('panel-body').textContent.includes('Advancement to circle')`);
  check('mobile Progress dock stays within viewport', await evalJs(`(() => {
    const r = document.getElementById('panel-body').getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth;
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-commands').click();true`);
  check('mobile Commands dock stays within viewport', await evalJs(`(() => {
    const r = document.querySelector('.command-guide').getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-crafting').click();true`);
  await waitFor(`document.getElementById('crafting-content')?.getAttribute('aria-busy')!== 'true'`);
  check('mobile Crafting tabs are accessible and stay within the viewport', await evalJs(`(() => {
    const body=document.getElementById('panel-body').getBoundingClientRect();
    return body.width>0&&body.left>=0&&body.right<=innerWidth&&[...document.querySelectorAll('.crafting-tabs button')].every(tab=>{const r=tab.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;})&&document.querySelector('[role="tablist"][aria-label="Crafting information"]')!==null;
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-spells').click();true`);
  await waitFor(`document.getElementById('spells-content')?.getAttribute('aria-busy')!=='true'`);
  check('mobile Spells tabs remain accessible within the viewport', await evalJs(`(() => {
    const body=document.getElementById('panel-body').getBoundingClientRect();
    return body.width>0&&body.left>=0&&body.right<=innerWidth&&[...document.querySelectorAll('.spells-tabs button')].length===3&&[...document.querySelectorAll('.spells-tabs button')].every(tab=>{const r=tab.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;});
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-spells').click();document.getElementById('spells-tab-spellbook').click();true`);
  check('mobile Spellbook search controls fit and expose native labels', await evalJs(`(() => {
    return document.querySelector('label[for="spellbook-query"]')!==null&&[...document.querySelectorAll('.spellbook-search input,.spellbook-search button')].every(control=>{const r=control.getBoundingClientRect();return r.height>=44&&r.width>0&&r.left>=0&&r.right<=innerWidth;})&&document.documentElement.scrollWidth<=innerWidth;
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-progress').click();document.getElementById('progress-tab-training').click();true`);
  await waitFor(`document.getElementById('progress-content')?.textContent.includes('Training plan')`);
  check('mobile Requirements and Training tabs remain accessible within viewport', await evalJs(`(() => {
    const body=document.getElementById('panel-body').getBoundingClientRect();return body.width>0&&body.left>=0&&body.right<=innerWidth&&document.querySelector('[role="tablist"][aria-label="Progress information"]')!==null&&[...document.querySelectorAll('.progress-tabs button')].every(tab=>{const r=tab.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;});
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  await evalJs(`document.getElementById('btn-inv').click();document.getElementById('inventory-tab-equipment').click();true`);
  await waitFor(`document.getElementById('inventory-content')?.textContent.includes('Equipment report')`);
  check('mobile Inventory and Equipment tabs remain accessible within viewport', await evalJs(`(() => {
    const body=document.getElementById('panel-body').getBoundingClientRect();return body.width>0&&body.left>=0&&body.right<=innerWidth&&document.querySelector('[role="tablist"][aria-label="Inventory information"]')!==null&&[...document.querySelectorAll('.inventory-tabs button')].every(tab=>{const r=tab.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;});
  })()`));
  await evalJs(`document.getElementById('panel-close').click();true`);
  // Hold a real server panel response across an actual owned-socket disconnect.
  await evalJs(`(() => {
    window.__pendingSend=WebSocket.prototype.send;window.__pendingFrames=[];
    WebSocket.prototype.send=function(data){try{const m=JSON.parse(data);if(['panel_request','input'].includes(m.t))window.__pendingFrames.push(m);}catch{}return window.__pendingSend.call(this,data);};
    const socket=window.__auditSockets.find(s=>s.readyState===WebSocket.OPEN);window.__pendingOldSocket=socket;window.__pendingOldHandler=socket.onmessage;
    socket.onmessage=event=>{let m;try{m=JSON.parse(event.data);}catch{}if(m?.t==='panel_response'){window.__pendingOldResponse=m;return;}window.__pendingOldHandler(event);};
    document.getElementById('cmd').value=${JSON.stringify('repair retain disconnect draft')};document.getElementById('cmd').setSelectionRange(7,13);document.getElementById('btn-inv').click();
  })()`);
  await waitFor(`!!window.__pendingOldResponse`);
  check('pending panel isolation uses a real response while its renderer is loading', await evalJs(`window.__pendingOldResponse.ok===true&&window.__pendingFrames.at(-1).t==='panel_request'&&window.__pendingOldResponse.requestId===window.__pendingFrames.at(-1).requestId&&document.getElementById('inventory-content').getAttribute('aria-busy')==='true'`));
  await evalJs(`window.__pendingOldSocket.close();true`);
  await waitFor(`window.__pendingOldSocket.readyState===WebSocket.CLOSED&&document.getElementById('panel-wrap').hidden`);
  check('actual disconnect cancels the pending panel and preserves the command draft', await evalJs(`document.getElementById('panel-wrap').hidden&&document.getElementById('panel-body').textContent===''&&document.getElementById('cmd').value===${JSON.stringify('repair retain disconnect draft')}&&document.getElementById('cmd').selectionStart===7&&document.getElementById('cmd').selectionEnd===13`));
  await evalJs(`import('/js/net.js').then(m=>m.retryNow())`);
  await waitFor(`!document.getElementById('welcome').hidden&&document.querySelectorAll('.wslot:not(.wnew)').length>=1`, 12000);
  await evalJs(`document.querySelector('.wslot:not(.wnew)').click();true`);
  await waitFor(`import('/js/state.js').then(m=>m.gameState.value==='playing')`, 12000);
  await evalJs(`(() => {
    const current=window.__auditSockets.find(s=>s.readyState===WebSocket.OPEN);window.__pendingCurrentHandler=current.onmessage;
    current.onmessage=event=>{let m;try{m=JSON.parse(event.data);}catch{}if(m?.t==='panel_response'){window.__pendingCurrentResponse=m;return;}window.__pendingCurrentHandler(event);};
    document.getElementById('btn-inv').click();
  })()`);
  await waitFor(`!!window.__pendingCurrentResponse`);
  check('old panel response cannot overwrite a new session request or replay the draft', await evalJs(`(async () => {
    const panels=await import('/js/panels.js');window.__pendingOldHandler({data:JSON.stringify(window.__pendingOldResponse)});panels.receivePanel(window.__pendingOldResponse);
    const isolated=document.getElementById('inventory-content').getAttribute('aria-busy')==='true'&&window.__pendingOldResponse.requestId!==window.__pendingCurrentResponse.requestId;
    window.__pendingCurrentHandler({data:JSON.stringify(window.__pendingCurrentResponse)});
    return isolated&&!document.getElementById('inventory-content').hasAttribute('aria-busy')&&window.__pendingFrames.every(m=>m.t==='panel_request')&&document.getElementById('cmd').value===${JSON.stringify('repair retain disconnect draft')};
  })()`));
  await evalJs(`(() => {const current=window.__auditSockets.find(s=>s.readyState===WebSocket.OPEN);current.onmessage=window.__pendingCurrentHandler;WebSocket.prototype.send=window.__pendingSend;document.getElementById('panel-close').click();document.getElementById('cmd').value='';})();true`);
  await cmd('logout');
  await waitFor(`!!document.getElementById('wf-user')`);
  check('logout clears session token', await evalJs(`!localStorage.getItem('dr_token')`));
  check('logout leaves no running script', await evalJs(`(async () => !(await import('/js/scripts.js')).isScriptRunning())()`));

  // Reconnect acceptance: an actual closed/offline socket, keyboard retry, no replay.
  await cdp('Network.enable');
  await evalJs(`(() => {
    window.__retrySend = WebSocket.prototype.send;
    window.__retryInputs = [];
    WebSocket.prototype.send = function(data) {
      try { const m=JSON.parse(data); if (m.t === 'input') window.__retryInputs.push(m); } catch {}
      return window.__retrySend.call(this,data);
    };
    const i=document.getElementById('cmd'); i.value='  say retain reconnect draft  '; i.setSelectionRange(3,8);
  })();true`);
  try {
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await evalJs(`(() => { const s=window.__auditSockets.find(s=>s.readyState===WebSocket.OPEN); window.__retryOldSocket=s; s.close(); })();true`);
    await waitFor(`import('/js/net.js').then(m=>m.connectionState().phase === 'retrying' && m.connectionState().retrySeconds >= 2)`, 5000);
    const retrySeconds = await evalJs(`import('/js/net.js').then(m=>m.connectionState().retrySeconds)`);
    await waitFor(`import('/js/net.js').then(m=>m.connectionState().phase === 'retrying' && m.connectionState().retrySeconds < ${retrySeconds})`, 4000);
    check('reconnect countdown tracks time outside live announcements', await evalJs(`document.getElementById('conn-status').textContent === 'disconnected' && document.getElementById('conn-status').getAttribute('aria-live') === 'polite' && document.getElementById('connection-countdown').getAttribute('aria-live') === 'off' && document.getElementById('connection-countdown').textContent.includes('Retry in')`));
    check('offline reconnect preserves exact draft and selection', await evalJs(`document.getElementById('cmd').value === '  say retain reconnect draft  ' && document.getElementById('cmd').selectionStart === 3 && document.getElementById('cmd').selectionEnd === 8`));
    check('mobile reconnect control stays within the viewport', await evalJs(`(() => { const b=document.getElementById('connection-retry'),r=b.getBoundingClientRect(); return !b.hidden && !b.disabled && r.width > 0 && r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()`));
    // Arm in a fresh retry window so timer expiry cannot hide the button while
    // the driver crosses process boundaries. Capture evidence at the click itself.
    await waitFor(`import('/js/net.js').then(m=>m.connectionState().phase === 'retrying' && m.connectionState().retrySeconds >= 4)`, 8000);
    await evalJs(`(async () => {
      const state=(await import('/js/net.js')).connectionState();
      const button=document.getElementById('connection-retry');
      button.focus();
      window.__retryActivation={phase:state.phase,seconds:state.retrySeconds,focusedBefore:document.activeElement.id,socketsBefore:window.__auditSockets.length,keys:[],clicks:[]};
      button.addEventListener('keydown',event=>window.__retryActivation.keys.push({key:event.key,target:event.target.id,active:document.activeElement.id}),{once:true});
      window.__retryClickDiagnostic=event=>{
        if(event.target!==button)return;
        const click={target:event.target.id,trusted:event.isTrusted,detail:event.detail,activeBefore:document.activeElement.id,before:window.__auditSockets.length};
        window.__retryActivation.clicks.push(click);
      };
      window.__retryClickAfter=event=>{
        if(event.target!==button)return;
        const click=window.__retryActivation.clicks.at(-1);
        click.after=window.__auditSockets.length;
      };
      document.addEventListener('click',window.__retryClickDiagnostic,true);
      document.addEventListener('click',window.__retryClickAfter,false);
    })()`);
    // CR text produces Chromium's native Enter button activation; a keyDown
    // without text only delivers the key event and never invokes the button.
    await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, text:'\r', unmodifiedText:'\r' });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
    const retryEvidence=await evalJs(`window.__retryActivation`);
    const retryClick=retryEvidence.clicks[0];
    check('Retry now supports keyboard activation and starts one connection',
      retryEvidence.phase === 'retrying' && retryEvidence.focusedBefore === 'connection-retry'
      && retryEvidence.keys.length === 1 && retryEvidence.keys[0].key === 'Enter' && retryEvidence.keys[0].active === 'connection-retry'
      && retryEvidence.clicks.length === 1 && retryClick.target === 'connection-retry' && retryClick.trusted && retryClick.detail === 0
      && retryClick.activeBefore === 'connection-retry' && retryClick.before === retryEvidence.socketsBefore && retryClick.after === retryClick.before + 1,
      JSON.stringify(retryEvidence));
    await evalJs(`document.removeEventListener('click',window.__retryClickDiagnostic,true);document.removeEventListener('click',window.__retryClickAfter,false);true`);
    await waitFor(`import('/js/net.js').then(m=>m.connectionState().phase === 'retrying')`, 5000);
    await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evalJs(`document.getElementById('connection-retry').click();true`);
    await waitFor(`import('/js/net.js').then(m=>m.connectionState().phase === 'connected')`, 8000);
    check('reconnect hides Retry now and never replays input drafts', await evalJs(`document.getElementById('connection-retry').hidden && document.getElementById('connection-countdown').hidden && document.getElementById('cmd').value === '  say retain reconnect draft  ' && window.__retryInputs.length === 0`));
    check('stale socket callbacks cannot change the new connection', await evalJs(`(async () => {
      const old=window.__retryOldSocket;
      old.onopen(); old.onerror(); old.onclose(); old.onmessage({data:JSON.stringify({t:'msg',msg:'__STALE_SOCKET_MESSAGE__'})});
      return (await import('/js/net.js')).connectionState().phase === 'connected' && !document.getElementById('terminal').textContent.includes('__STALE_SOCKET_MESSAGE__');
    })()`));
  } finally {
    await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evalJs(`document.removeEventListener('click',window.__retryClickDiagnostic,true);document.removeEventListener('click',window.__retryClickAfter,false);WebSocket.prototype.send=window.__retrySend;document.getElementById('cmd').value='';true`);
  }

  const failed = checks.filter(([, ok]) => !ok).length;
  if (failed) throw new Error(`${failed} browser check(s) failed`);
  log(`ALL ${checks.length} CLIENT CHECKS PASSED`);
  return checks.length;
}
