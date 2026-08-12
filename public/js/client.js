// Dragon Realms web client.
const terminal = document.getElementById('terminal');
const cmdInput = document.getElementById('cmd');
const statusEl = document.getElementById('conn-status');
const chargenEl = document.getElementById('chargen');

const history = [];
let histIndex = -1;

const RACES = [
  ['human', 'Human'], ['dwarf', 'Dwarf'], ['elf', 'Elf'], ['elothean', 'Elothean'],
  ['gnome', 'Gnome'], ['gortog', "Gor'Tog"], ['giantman', 'Giantman'], ['halfling', 'Halfling'],
  ['kaldar', 'Kaldar'], ['prydaen', 'Prydaen'], ['rakash', 'Rakash'], ['skra', "S'Kra Mur"],
];
const GUILDS = [
  ['barbarian', 'Barbarian'], ['bard', 'Bard'], ['cleric', 'Cleric'], ['empath', 'Empath'],
  ['moonmage', 'Moon Mage'], ['necromancer', 'Necromancer'], ['paladin', 'Paladin'],
  ['ranger', 'Ranger'], ['thief', 'Thief'], ['trader', 'Trader'], ['warmage', 'Warrior Mage'],
];
const STATS = ['str', 'con', 'ref', 'agi', 'cha', 'dis', 'wis', 'int'];
const DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd'];

let ws = null;
let token = localStorage.getItem('dr_token') || null;
let inChargen = false;
let state = 'login';

const $ = (id) => document.getElementById(id);

// ---------------- Connection ----------------
function connect() {
  setStatus(false);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    setStatus(true);
    if (token) send({ t: 'token', token });
  };
  ws.onclose = () => {
    setStatus(false);
    blockInput(true);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    onMessage(msg);
  };
}

function setStatus(on) {
  statusEl.textContent = on ? 'connected' : 'disconnected';
  statusEl.className = on ? 'conn-on' : 'conn-off';
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function padRun(cmd) {
  cmdInput.value = cmd;
  cmdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

// ---------------- ANSI to HTML ----------------
function ansiToHtml(str) {
  const parts = String(str).split(/(\x1b\[\d+m)/g);
  let html = '';
  let b = false;
  for (const p of parts) {
    const m = /^\x1b\[(\d+)m$/.exec(p);
    if (m) {
      const code = Number(m[1]);
      if (code === 0) { b = false; html += '</b>'; }
      else if (code === 1) { b = true; html += '<b>'; }
      else html += `<span class="c${code}">`;
      continue;
    }
    html += escapeHtml(p);
  }
  if (b) html += '</b>';
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[\d+m/g, '');
}

// ---------------- Terminal output ----------------
let autoScroll = true;
let searchMarks = [];

function append(text, cls = '') {
  const div = document.createElement('div');
  div.className = 'block' + (cls ? ' ' + cls : '');
  div.innerHTML = ansiToHtml(text);
  terminal.appendChild(div);
  if (autoScroll) terminal.scrollTop = terminal.scrollHeight;
}

function renderRoomHeader(div, text) {
  const parts = String(text).split('\n');
  const header = stripAnsi(parts[1] || '');
  const m = /^(.*?)\s*[—\-–]\s*(.*)$/.exec(header);
  if (m) {
    const title = document.createElement('span');
    title.className = 'room-title';
    title.textContent = m[1];
    div.appendChild(title);
    const rest = parts.slice(2).join('\n');
    if (rest) {
      div.appendChild(document.createTextNode('\n'));
      const span = document.createElement('span');
      span.innerHTML = ansiToHtml(rest);
      div.appendChild(span);
    }
  } else {
    div.innerHTML = ansiToHtml(text);
  }
}

// Condensed combat: group combat lines arriving in one burst into a single block.
let combatBuffer = [];
let combatTimer = null;

function appendCombat(text) {
  if (!settings.condensed) { append(text, 'ch-combat'); return; }
  combatBuffer.push(text);
  clearTimeout(combatTimer);
  combatTimer = setTimeout(() => {
    const lines = combatBuffer;
    combatBuffer = [];
    append(lines.join('\n'), 'ch-combat');
  }, 600);
}

function onMessage(msg) {
  if (['room', 'msg', 'combat', 'notice', 'error'].includes(msg.t) && msg.msg) {
    runTriggers(msg.msg);
  }
  switch (msg.t) {
    case 'room': {
      const div = document.createElement('div');
      div.className = 'block ch-room';
      renderRoomHeader(div, msg.msg);
      terminal.appendChild(div);
      if (autoScroll) terminal.scrollTop = terminal.scrollHeight;
      lastRoom = { name: roomNameOf(msg.msg), exits: msg.exits || [] };
      renderExitsWidget();
      renderStatusStrip();
      if (msg.exits && msg.exits.length) appendExitBar(msg.exits);
      break;
    }
    case 'msg':
      if (panelCapture.active) { captureToPanel(msg.msg); break; }
      append(msg.msg, 'ch-msg');
      break;
    case 'combat':
      appendCombat(msg.msg);
      break;
    case 'notice':
      if (panelCapture.active) { captureToPanel(msg.msg); break; }
      append(msg.msg, 'ch-notice');
      break;
    case 'error':
      if (panelCapture.active) { captureToPanel(msg.msg, true); break; }
      append(msg.msg, 'ch-error');
      break;
    case 'prompt':
      append(msg.msg, 'ch-prompt');
      parsePrompt(msg.msg);
      blockInput(false);
      break;
    case 'login_prompt':
      append('(type: login <username> <password>  or  register <username> <password>)', 'ch-msg');
      showWelcome('login');
      break;
    case 'authed':
      token = msg.token;
      localStorage.setItem('dr_token', token);
      state = 'logged';
      break;
    case 'charselect':
      state = 'charselect';
      append(msg.msg, 'ch-notice');
      showWelcome('charselect', msg.msg);
      blockInput(false);
      break;
    case 'charcreate':
      state = 'charcreate';
      inChargen = true;
      showWelcome('chargen');
      parseChargenFlavor(msg.msg);
      showChargen();
      append(msg.msg, 'ch-notice');
      break;
    case 'charalloc':
      showAlloc(msg.msg);
      break;
    case 'enter':
      state = 'playing';
      inChargen = false;
      chargenEl.hidden = true;
      $('welcome').hidden = true;
      $('welcome-body').innerHTML = '';
      append(msg.msg, 'ch-notice');
      break;
    case 'pong':
      break;
  }
}

// ---------------- Room / prompt state ----------------
let lastRoom = { name: null, exits: [] };
let promptState = null;

function roomNameOf(text) {
  const plain = stripAnsi(text).replace(/^\n+/, '');
  const first = plain.split('\n')[0] || '';
  const m = /^(.*?)\s*[—\-–]\s*(.*)$/.exec(first);
  return (m ? m[1] : first.replace(/^Obvious exits:.*$/, '')).trim() || null;
}

function parsePrompt(text) {
  const plain = stripAnsi(text);
  const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const circle = /Circle\s*(\d+)/i.exec(plain);
  const silver = /(\d+)\s+silvers?/i.exec(plain);
  if (!hp && !circle) { $('status-strip').hidden = true; return; }
  promptState = {
    hp: hp ? [Number(hp[1]), Number(hp[2])] : null,
    mana: mana ? [Number(mana[1]), Number(mana[2])] : null,
    circle: circle ? Number(circle[1]) : null,
    silver: silver ? Number(silver[1]) : null,
    combat: /\[COMBAT\]/.test(plain),
  };
  renderStatusStrip();
}

function renderStatusStrip() {
  const strip = $('status-strip');
  if (!stripEffective() || !promptState) { strip.hidden = true; return; }
  strip.hidden = false;
  $('strip-room').textContent = lastRoom.name || '\u2014';
  const hp = promptState.hp;
  if (hp) {
    $('strip-hp-fill').style.width = `${Math.max(0, Math.min(100, (hp[0] / hp[1]) * 100))}%`;
    $('strip-hp-label').textContent = `HP ${hp[0]}/${hp[1]}`;
  } else {
    $('strip-hp-fill').style.width = '0%';
    $('strip-hp-label').textContent = 'HP --';
  }
  const mana = promptState.mana;
  $('strip-mana-wrap').hidden = !mana;
  if (mana) {
    $('strip-mana-fill').style.width = `${Math.max(0, Math.min(100, (mana[0] / mana[1]) * 100))}%`;
    $('strip-mana-label').textContent = `Mana ${mana[0]}/${mana[1]}`;
  }
  $('strip-circle').textContent = `Circle ${promptState.circle ?? '--'}`;
  $('strip-silver').textContent = `${promptState.silver ?? '--'} silvers`;
  $('strip-combat').hidden = !promptState.combat;
}

// ---------------- Exits widget ----------------
function renderExitsWidget() {
  const row = $('exits-row');
  row.innerHTML = '';
  if (!lastRoom.exits.length) {
    const span = document.createElement('span');
    span.className = 'panel-empty';
    span.textContent = 'No obvious exits.';
    row.appendChild(span);
    return;
  }
  for (const dir of lastRoom.exits) {
    const b = document.createElement('button');
    b.className = 'exbtn' + (dir === 'u' ? ' u' : '');
    b.textContent = dir.toUpperCase();
    b.title = `go ${dir}`;
    b.addEventListener('click', () => padRun(`go ${dir}`));
    row.appendChild(b);
  }
}

// ---------------- Dock & panels ----------------
const PANELS = {
  inv: { title: 'INVENTORY', cmd: 'inventory' },
  score: { title: 'SCORE', cmd: 'score' },
  skills: { title: 'SKILLS', cmd: 'skills' },
  spells: { title: 'SPELLS', cmd: 'spells' },
  scripts: { title: 'SCRIPTS', cmd: null },
};

let activePanel = null;
const panelCapture = { active: false, timer: null };

function openPanel(key, sendCmd = true) {
  const panel = PANELS[key];
  if (!panel) return;
  activePanel = key;
  $('dock').hidden = false;
  if (isMobile()) document.body.classList.add('dock-open');
  $('panel-wrap').hidden = false;
  $('panel-title').textContent = panel.title;
  const body = $('panel-body');
  if (panel.cmd === null) {
    renderScriptsPanel();
    syncToolbar();
    return;
  }
  if (!['playing', 'charcreate_playing'].includes(state)) {
    body.innerHTML = '<span class="panel-empty">Enter the world first to use this panel.</span>';
    return;
  }
  body.innerHTML = '<span class="panel-empty">Requesting\u2026</span>';
  if (sendCmd) {
    panelCapture.active = true;
    clearTimeout(panelCapture.timer);
    panelCapture.timer = setTimeout(() => { panelCapture.active = false; }, 2000);
    send({ t: 'input', line: panel.cmd });
  }
  syncToolbar();
}

function captureToPanel(text, isError = false) {
  const body = $('panel-body');
  if (body.innerHTML.trim() === '<span class="panel-empty">Requesting\u2026</span>') body.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'block' + (isError ? ' ch-error' : ' ch-msg');
  div.innerHTML = ansiToHtml(text);
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  clearTimeout(panelCapture.timer);
  panelCapture.timer = setTimeout(() => { panelCapture.active = false; }, 200);
}

function closePanel() {
  activePanel = null;
  panelCapture.active = false;
  clearTimeout(panelCapture.timer);
  $('panel-wrap').hidden = true;
  document.body.classList.remove('dock-open');
  if (!$('set-exits').checked) $('dock').hidden = true;
  syncToolbar();
  cmdInput.focus();
}

function syncToolbar() {
  for (const key of Object.keys(PANELS)) {
    $('btn-' + key).classList.toggle('on', activePanel === key);
  }
  $('btn-exits').classList.toggle('on', !$('dock').hidden);
}

function renderScriptsPanel() {
  const body = $('panel-body');
  let html = '';
  const macroKeys = Object.keys(macros);
  html += macroKeys.length
    ? macroKeys.map((k) => `<div class="script-row"><span class="script-kind">MACRO</span><span class="script-text" title="${escapeHtml(macros[k])}">${escapeHtml(k)} \u2192 ${escapeHtml(macros[k])}</span><button data-remove="macro:${escapeHtml(k)}">\u2715</button></div>`).join('')
    : '';
  html += timers.length
    ? timers.map((t, i) => `<div class="script-row"><span class="script-kind">TIMER</span><span class="script-text">every ${t.sec}s \u2192 ${escapeHtml(t.cmd)}</span><button data-remove="timer:${i}">\u2715</button></div>`).join('')
    : '';
  html += triggers.length
    ? triggers.map((t) => `<div class="script-row"><span class="script-kind">TRIGGER</span><span class="script-text" title="${escapeHtml(t.command)}">${escapeHtml(t.pattern)} \u2192 ${escapeHtml(t.command)}</span><button data-remove="trigger:${t.id}">\u2715</button></div>`).join('')
    : '';
  if (!html) html = '<span class="panel-empty">No scripts yet. Define macros, timers, or triggers below.</span>';
  html += `<div class="script-add">
    <select id="script-kind">
      <option value="macro">Macro (label + command)</option>
      <option value="timer">Timer (every Ns + command)</option>
      <option value="trigger">Trigger (text + command)</option>
    </select>
    <input id="script-a" placeholder="label / seconds / trigger text" autocomplete="off">
    <input id="script-b" placeholder="command" autocomplete="off">
    <button id="script-addbtn">Add script</button>
  </div>`;
  body.innerHTML = html;
  body.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeScript(btn.dataset.remove));
  });
  $('script-addbtn').addEventListener('click', () => {
    const kind = $('script-kind').value;
    const a = $('script-a').value.trim();
    const b = $('script-b').value.trim();
    if (!a || !b) return;
    if (kind === 'macro') handleLocalCommand(`macro ${a} ${b}`);
    else if (kind === 'timer') handleLocalCommand(`timer ${a} ${b}`);
    else handleLocalCommand(`trigger ${a} ${b}`);
    renderScriptsPanel();
  });
}

function removeScript(which) {
  const [kind, id] = which.split(':');
  if (kind === 'macro') {
    delete macros[id];
    saveMacros(); renderMacros();
  } else if (kind === 'timer') {
    const t = timers[Number(id)];
    if (t) { clearInterval(t.id); timers.splice(Number(id), 1); }
  } else if (kind === 'trigger') {
    triggers = triggers.filter((t) => t.id !== Number(id));
    saveTriggers();
  }
  renderScriptsPanel();
}

// ---------------- Input ----------------
function blockInput(blocked) {
  cmdInput.disabled = blocked;
  if (!blocked) cmdInput.focus();
}

function appendExitBar(exits) {
  const bar = document.createElement('div');
  bar.className = 'block exits';
  const label = document.createElement('span');
  label.textContent = 'Go: ';
  bar.appendChild(label);
  for (const dir of exits) {
    const a = document.createElement('a');
    a.className = 'exit';
    a.textContent = dir;
    a.href = '#';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      padRun(`go ${dir}`);
    });
    bar.appendChild(a);
    bar.appendChild(document.createTextNode(' '));
  }
  terminal.appendChild(bar);
  if (autoScroll) terminal.scrollTop = terminal.scrollHeight;
}

// ---------------- Tab completion ----------------
const COMMANDS = [
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd',
  'go', 'look', 'l', 'attack', 'cast', 'retreat', 'skin', 'disarm', 'trip', 'bash',
  'stance', 'spells', 'berserk', 'backstab', 'get', 'drop', 'inventory', 'i',
  'wear', 'wield', 'remove', 'use', 'list', 'buy', 'sell', 'deposit', 'withdraw',
  'train', 'circle', 'tdp', 'raise', 'tdptrain', 'quest', 'claim', 'craft',
  'alias', 'macro', 'timer', 'trigger', 'macros', 'timers', 'triggers',
  'ask', 'score', 'skills', 'exp', 'alloc', 'say', 'emote', 'shout', 'who', 'time',
  'help', 'save', 'quit', 'rest', 'forage', 'hunt', 'track', 'steal', 'pick',
  'perform', 'appraise', 'duel', 'accept', 'decline',
];
const CONTEXT_ARGS = {
  alloc: STATS, raise: STATS,
  stance: ['aggressive', 'defensive', 'guarded', 'balanced'],
  go: DIRECTIONS,
};
let tabMatches = [];
let tabIndex = -1;

function completeTab(line) {
  const caret = cmdInput.selectionStart ?? line.length;
  const before = line.slice(0, caret);
  const tokens = before.split(/\s+/);
  const isFirst = tokens.length === 1;
  const word = tokens[tokens.length - 1];
  if (!word) { setCompletion(''); return; }
  const dict = isFirst ? COMMANDS : (CONTEXT_ARGS[tokens[0].toLowerCase()] || []);
  if (!dict.length) return;
  if (tabMatches.length === 0 || word.toLowerCase() !== tabMatches[0].slice(0, word.length).toLowerCase() || !line.startsWith(lastTabLine)) {
    tabMatches = dict.filter((c) => c.toLowerCase().startsWith(word.toLowerCase()));
    tabIndex = 0;
    lastTabLine = line;
  } else {
    tabIndex = (tabIndex + 1) % tabMatches.length;
  }
  if (tabMatches.length === 0) { setCompletion(''); return; }
  const choice = tabMatches[tabIndex];
  const prefix = tokens.slice(0, -1).join(' ');
  cmdInput.value = (prefix ? prefix + ' ' : '') + choice + ' ';
  cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
  if (tabMatches.length > 1) {
    setCompletion(`${tabMatches.slice(0, 8).join('  ')}${tabMatches.length > 8 ? ' \u2026' : ''}`);
  } else {
    setCompletion('');
  }
}

let lastTabLine = '';
let completionTimer = null;
function setCompletion(text) {
  const el = $('completion');
  el.textContent = text;
  clearTimeout(completionTimer);
  if (text) completionTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}

// ---------------- Scrollback controls ----------------
function isAtBottom() {
  return terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 24;
}

function scrollPill() {
  return $('scroll-pill');
}

terminal.addEventListener('scroll', () => {
  if (!autoScroll && isAtBottom()) {
    autoScroll = true;
    scrollPill().hidden = true;
  } else if (autoScroll && !isAtBottom()) {
    autoScroll = false;
    scrollPill().hidden = false;
  }
});

scrollPill().addEventListener('click', () => {
  autoScroll = true;
  terminal.scrollTop = terminal.scrollHeight;
  scrollPill().hidden = true;
});

// ---------------- Search ----------------
function clearSearch() {
  for (const mark of searchMarks) {
    const frag = document.createDocumentFragment();
    const parent = mark.parentNode;
    while (mark.firstChild) frag.appendChild(mark.firstChild);
    parent.replaceChild(frag, mark);
  }
  searchMarks = [];
  $('search-count').textContent = '';
}

function runSearch(term) {
  clearSearch();
  if (!term) return;
  const re = new RegExp(escapeRegExp(term), 'gi');
  const walker = document.createTreeWalker(terminal, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  const marks = [];
  for (const node of nodes) {
    const text = node.nodeValue;
    if (!text || !re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.textContent = m[0];
      frag.appendChild(mark);
      marks.push(mark);
      last = m.index + m[0].length;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
  searchMarks = marks;
  $('search-count').textContent = `${marks.length} match${marks.length === 1 ? '' : 'es'}`;
  if (marks.length) jumpToMark(0);
}

function jumpToMark(i) {
  if (!searchMarks.length) return;
  const idx = ((i % searchMarks.length) + searchMarks.length) % searchMarks.length;
  searchMarks.forEach((m, k) => m.classList.toggle('current', k === idx));
  searchMarks[idx].scrollIntoView({ block: 'center' });
  currentMark = idx;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let currentMark = -1;

function openSearch() {
  const bar = $('searchbar');
  bar.hidden = false;
  const input = $('search-input');
  input.value = '';
  input.focus();
  runSearch('');
}
function closeSearch() {
  $('searchbar').hidden = true;
  clearSearch();
  cmdInput.focus();
}

// ---------------- Key handling ----------------
cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const line = cmdInput.value.trim();
    cmdInput.value = '';
    tabMatches = [];
    setCompletion('');
    if (!line) return;
    append(`> ${line}`, 'ch-echo');
    if (line.toLowerCase() !== 'quit') {
      history.push(line);
      if (history.length > 500) history.shift();
    }
    histIndex = -1;
    handleLocalCommand(line);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (history.length) {
      histIndex = histIndex < 0 ? history.length - 1 : Math.max(0, histIndex - 1);
      cmdInput.value = history[histIndex];
      cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (histIndex >= 0) {
      histIndex += 1;
      cmdInput.value = histIndex < history.length ? history[histIndex] : '';
      if (histIndex >= history.length) histIndex = -1;
      cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length);
    }
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    completeTab(cmdInput.value);
    return;
  }
});

cmdInput.addEventListener('input', () => { tabMatches = []; setCompletion(''); });

document.addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' && e.target !== cmdInput) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.key === 'End' && tag === 'INPUT') {
    autoScroll = true;
    terminal.scrollTop = terminal.scrollHeight;
    scrollPill().hidden = true;
    return;
  }
  if (e.key === 'Escape') {
    if (!$('searchbar').hidden) { closeSearch(); return; }
    if (activePanel) { closePanel(); return; }
    if (!$('settings-panel').hidden) { $('settings-panel').hidden = true; return; }
  }
});

$('search-input').addEventListener('input', () => runSearch($('search-input').value));
$('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    jumpToMark(currentMark + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearch();
  }
});
$('search-next').addEventListener('click', () => jumpToMark(currentMark + 1));
$('search-prev').addEventListener('click', () => jumpToMark(currentMark - 1));
$('search-close').addEventListener('click', closeSearch);

// ---------------- Command routing ----------------
function handleLocalCommand(line) {
  if (handleAutomation(line)) return;
  const parts = line.split(/\s+/);

  if (parts[0].toLowerCase() === 'search' && parts[1]) {
    openSearch();
    $('search-input').value = parts.slice(1).join(' ');
    runSearch($('search-input').value);
    return;
  }

  if (inChargen && state === 'charcreate') {
    const p = parts;
    if (p[0] === 'charcreate' && p[1] && p[2] && p[3]) {
      $('cg-name').value = p[1];
      $('cg-race').value = p[2];
      $('cg-guild').value = p[3];
      submitChargen();
      return;
    }
    send({ t: 'input', line });
    return;
  }

  if (state === 'login') {
    if (parts[0] === 'login' && parts[1] && parts[2]) {
      send({ t: 'login', u: parts[1], p: parts[2] });
    } else if (parts[0] === 'register' && parts[1] && parts[2]) {
      send({ t: 'register', u: parts[1], p: parts[2] });
    } else {
      append('Use: login <username> <password>  or  register <username> <password>', 'ch-msg');
    }
    return;
  }

  if (state === 'charselect') {
    send({ t: 'charselect', id: line });
    return;
  }

  send({ t: 'input', line });
}

// ---------------- Welcome screen ----------------
function showWelcome(mode, msgText) {
  const body = $('welcome-body');
  $('welcome').hidden = false;
  if (mode === 'login') {
    body.innerHTML = `
      <p class="welcome-hint">A text realm. You move by typing, and the world answers in words. Everything you need is one command away \u2014 begin with <b>help</b> once inside.</p>
      <div class="welcome-form">
        <label>Account name<input id="wf-user" autocomplete="off" autocapitalize="off"></label>
        <label>Password<input id="wf-pass" type="password" autocomplete="off"></label>
        <div class="wf-btns">
          <button id="wf-login">Enter the Crossing</button>
          <button id="wf-register" class="ghost">Create account</button>
        </div>
        <div id="wf-err" class="welcome-err"></div>
      </div>
      <p class="welcome-sub">Or just type <b>login</b> or <b>register</b> into the terminal below.</p>`;
    const go = (reg) => {
      const u = $('wf-user').value.trim();
      const p = $('wf-pass').value;
      if (!u || !p) { $('wf-err').textContent = 'Name and password are required.'; return; }
      send(reg ? { t: 'register', u, p } : { t: 'login', u, p });
    };
    $('wf-login').addEventListener('click', () => go(false));
    $('wf-register').addEventListener('click', () => go(true));
    $('wf-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(false); });
    $('wf-user').focus();
    return;
  }
  if (mode === 'charselect') {
    const rows = [];
    for (const line of String(msgText || '').split('\n')) {
      const m = /^\s*(\d+)\)\s*(.+)$/.exec(line);
      if (m) rows.push({ id: m[1], label: m[2] });
    }
    const slots = rows.length ? '' : `<p class="welcome-sub">${escapeHtml(stripAnsi(msgText || ''))}</p>`;
    const hasNew = /"new"/.test(String(msgText || ''));
    body.innerHTML = `
      ${slots}
      <div class="welcome-list">
        ${rows.map((r) => `<button class="wslot" data-id="${r.id}">${escapeHtml(r.label)}</button>`).join('')}
        ${hasNew ? '<button class="wslot wnew" data-id="new">+ New adventurer</button>' : ''}
      </div>
      <p class="welcome-sub">Select a soul to enter the Crossing \u2014 or type its number below.</p>`;
    body.querySelectorAll('.wslot').forEach((b) => {
      b.addEventListener('click', () => send({ t: 'charselect', id: b.dataset.id }));
    });
    return;
  }
  if (mode === 'chargen') {
    $('welcome').hidden = true;
  }
}

// ---------------- Character creation form ----------------
const raceFlavor = {};
const guildFlavor = {};

function parseChargenFlavor(msgText) {
  for (const line of String(msgText || '').split('\n')) {
    const m = /^(\w+)\s*-\s*([^:]+):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const id = m[1].toLowerCase();
    const name = m[2].trim();
    const desc = m[3].trim();
    if (RACES.some(([r]) => r === id)) raceFlavor[id] = { name, desc };
    if (GUILDS.some(([g]) => g === id)) guildFlavor[id] = { name, desc };
  }
}

function showChargen() {
  const raceSel = $('cg-race');
  raceSel.innerHTML = RACES.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  const guildSel = $('cg-guild');
  guildSel.innerHTML = GUILDS.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  $('cg-alloc').textContent = '';
  $('cg-alloc-row').hidden = true;
  chargenEl.hidden = false;
  $('cg-name').focus();
  updateCgFlavor();
}

function updateCgFlavor() {
  const r = raceFlavor[$('cg-race').value];
  const g = guildFlavor[$('cg-guild').value];
  $('cg-race-flavor').textContent = r ? r.desc : '';
  $('cg-guild-flavor').textContent = g ? g.desc : '';
}

function showAlloc(panel) {
  $('cg-alloc').textContent = panel;
  const statSel = $('cg-stat');
  if (statSel.options.length === 0) {
    statSel.innerHTML = STATS.map((s) => `<option value="${s}">${s.toUpperCase()}</option>`).join('');
  }
  $('cg-alloc-row').hidden = false;
}

function submitChargen() {
  send({
    t: 'charcreate',
    name: $('cg-name').value.trim(),
    race: $('cg-race').value,
    guild: $('cg-guild').value,
  });
}

$('cg-submit').addEventListener('click', submitChargen);
$('cg-race').addEventListener('change', updateCgFlavor);
$('cg-guild').addEventListener('change', updateCgFlavor);
$('cg-allocbtn').addEventListener('click', () => {
  send({ t: 'alloc', stat: $('cg-stat').value, amt: Number($('cg-amt').value) || 1 });
});
$('cg-enter').addEventListener('click', () => send({ t: 'enter' }));

// ---------------- Macros & timers (client-side scripting) ----------------
const MACROS_KEY = 'dr_macros';
const TRIGGERS_KEY = 'dr_triggers';
let macros = (() => { try { return JSON.parse(localStorage.getItem(MACROS_KEY)) || {}; } catch { return {}; } })();
let triggers = (() => { try { return JSON.parse(localStorage.getItem(TRIGGERS_KEY)) || []; } catch { return []; } })();
const macrobars = $('macrobars');
const timers = [];
let triggerSeq = 1;
let macroEditMode = false;

function runTriggers(text) {
  const t = String(text);
  for (const tr of triggers) {
    if (tr.pattern && t.toLowerCase().includes(tr.pattern.toLowerCase())) {
      append(`[trigger] ${tr.command}`, 'ch-msg');
      handleLocalCommand(tr.command);
    }
  }
}

function saveMacros() { try { localStorage.setItem(MACROS_KEY, JSON.stringify(macros)); } catch {} }
function saveTriggers() { try { localStorage.setItem(TRIGGERS_KEY, JSON.stringify(triggers)); } catch {} }

function renderMacros() {
  const keys = Object.keys(macros);
  const show = settings.macrobar && keys.length > 0;
  macrobars.hidden = !show;
  const row = $('macros-row');
  row.innerHTML = '';
  if (!show) return;
  if (macroEditMode) {
    for (const label of keys) {
      const box = document.createElement('div');
      box.className = 'macro-editbox';
      box.innerHTML = `
        <input class="mc-label" value="${escapeHtml(label)}" title="Label">
        <input class="mc-cmd" value="${escapeHtml(macros[label])}" title="Command">
        <button class="save" title="Save">&#10003;</button>
        <button class="del" title="Delete">&#10005;</button>`;
      box.querySelector('.save').addEventListener('click', () => {
        const nl = box.querySelector('.mc-label').value.trim();
        const nc = box.querySelector('.mc-cmd').value.trim();
        if (!nl || !nc) return;
        delete macros[label];
        macros[nl] = nc;
        saveMacros(); renderMacros();
      });
      box.querySelector('.del').addEventListener('click', () => {
        delete macros[label];
        saveMacros(); renderMacros();
      });
      row.appendChild(box);
    }
    const add = document.createElement('div');
    add.className = 'macro-editbox';
    add.innerHTML = `<input class="mc-label" placeholder="label"><input class="mc-cmd" placeholder="command"><button class="save" title="Add">+</button>`;
    add.querySelector('.save').addEventListener('click', () => {
      const l = add.querySelector('.mc-label').value.trim();
      const c = add.querySelector('.mc-cmd').value.trim();
      if (!l || !c) return;
      macros[l] = c;
      saveMacros(); renderMacros();
    });
    row.appendChild(add);
    macrobars.classList.add('collapsed');
    return;
  }
  macrobars.classList.remove('collapsed');
  for (const label of keys) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = macros[label];
    b.addEventListener('click', () => padRun(macros[label]));
    row.appendChild(b);
  }
}

function handleAutomation(line) {
  const parts = line.split(/\s+/);
  const head = parts[0].toLowerCase();
  if (head === 'macro') {
    if (parts[1] === 'remove' || parts[1] === 'delete') {
      const label = parts[2];
      if (!label || !macros[label]) { append('No such macro.', 'ch-error'); return true; }
      delete macros[label];
      saveMacros(); renderMacros();
      append(`Macro "${label}" removed.`, 'ch-notice');
      return true;
    }
    if (!parts[1] || !parts[2]) { append('Usage: macro <label> <command>  |  macro remove <label>', 'ch-msg'); return true; }
    const label = parts[1];
    const cmd = parts.slice(2).join(' ');
    macros[label] = cmd;
    saveMacros(); renderMacros();
    append(`Macro "${label}" -> ${cmd}`, 'ch-notice');
    return true;
  }
  if (head === 'macros') {
    const keys = Object.keys(macros);
    append(keys.length ? `\nMacros:\n${keys.map((k) => `  ${k} -> ${macros[k]}`).join('\n')}` : 'No macros defined. Use: macro <label> <command>', 'ch-msg');
    return true;
  }
  if (head === 'timer') {
    if (parts[1] === 'off' || parts[1] === 'clear') {
      timers.forEach((t) => clearInterval(t.id));
      timers.length = 0;
      append('All timers stopped.', 'ch-notice');
      if (activePanel === 'scripts') renderScriptsPanel();
      return true;
    }
    const sec = parseInt(parts[1], 10);
    const cmd = parts.slice(2).join(' ');
    if (!sec || sec < 2 || !cmd) { append('Usage: timer <seconds> <command> (min 2s) | timer off', 'ch-msg'); return true; }
    const id = setInterval(() => {
      append(`> [timer] ${cmd}`, 'ch-msg');
      handleLocalCommand(cmd);
    }, sec * 1000);
    timers.push({ id, sec, cmd });
    append(`Timer started: every ${sec}s -> ${cmd}`, 'ch-notice');
    if (activePanel === 'scripts') renderScriptsPanel();
    return true;
  }
  if (head === 'timers') {
    append(timers.length ? `Active timers:\n${timers.map((t) => `  every ${t.sec}s -> ${t.cmd}`).join('\n')}` : 'No active timers.', 'ch-msg');
    return true;
  }
  if (head === 'trigger') {
    if (parts[1] === 'remove' || parts[1] === 'delete') {
      const id = parseInt(parts[2], 10);
      const before = triggers.length;
      triggers = triggers.filter((t) => t.id !== id);
      if (triggers.length === before) { append('No such trigger.', 'ch-error'); return true; }
      saveTriggers();
      append(`Trigger ${id} removed.`, 'ch-notice');
      if (activePanel === 'scripts') renderScriptsPanel();
      return true;
    }
    if (!parts[1] || !parts[2]) { append('Usage: trigger <text> <command> | trigger remove <id>', 'ch-msg'); return true; }
    const pattern = parts[1];
    const command = parts.slice(2).join(' ');
    const id = triggerSeq++;
    triggers.push({ id, pattern, command });
    saveTriggers();
    append(`Trigger ${id}: "${pattern}" -> ${command}`, 'ch-notice');
    if (activePanel === 'scripts') renderScriptsPanel();
    return true;
  }
  if (head === 'triggers') {
    append(triggers.length ? `Triggers:\n${triggers.map((t) => `  ${t.id} "${t.pattern}" -> ${t.command}`).join('\n')}` : 'No triggers defined. Use: trigger <text> <command>', 'ch-msg');
    return true;
  }
  return false;
}

$('macros-toggle').addEventListener('click', () => {
  macrobars.classList.toggle('collapsed');
  const collapsed = macrobars.classList.contains('collapsed');
  $('macros-toggle').textContent = collapsed ? '\u25B6' : '\u25BC';
});
$('macros-edit').addEventListener('click', () => {
  macroEditMode = !macroEditMode;
  renderMacros();
});

// ---------------- Settings (themes, font, D-pad) ----------------
const settingsBtn = $('settings-btn');
const settingsPanel = $('settings-panel');
const themeSel = $('set-theme');
const fontRange = $('set-font');
const fontVal = $('set-fontval');

const SETTINGS_KEY = 'dr_settings';
const settings = Object.assign({
  theme: 'dark', font: 14, dpad: true, colors: {},
  fontFamily: 'mono', lineHeight: 1.45, autoscroll: true, condensed: true,
  statusstrip: null, haptics: true, macrobar: true, exits: true,
}, (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
})());

const PALETTE_DEFAULTS = { text: '#d8d3b0', amber: '#e0b34c', green: '#7ac47a', dim: '#6b6754' };

function isMobile() {
  return window.matchMedia('(max-width: 700px)').matches;
}

function stripEffective() {
  return settings.statusstrip === null ? !isMobile() : settings.statusstrip;
}

function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.dataset.font = settings.fontFamily;
  document.body.style.fontSize = settings.font + 'px';
  document.documentElement.style.setProperty('--lh', settings.lineHeight);
  themeSel.value = settings.theme;
  fontRange.value = settings.font;
  fontVal.textContent = settings.font;
  $('set-fontfam').value = settings.fontFamily;
  $('set-lineh').value = String(settings.lineHeight);
  $('set-dpad').checked = settings.dpad;
  $('set-haptics').checked = settings.haptics;
  $('set-autoscroll').checked = settings.autoscroll;
  $('set-condensed').checked = settings.condensed;
  $('set-macrobar').checked = settings.macrobar;
  $('set-statusstrip').checked = stripEffective();
  $('set-exits').checked = settings.exits;
  autoScroll = settings.autoscroll;
  dpad.hidden = !settings.dpad;
  if (!settings.exits && !activePanel) $('dock').hidden = true;
  else if (settings.exits && !activePanel) $('dock').hidden = false;
  macrobars.classList.remove('collapsed');
  $('macros-toggle').textContent = '\u25BC';
  renderStatusStrip();
  const root = document.documentElement.style;
  for (const key of ['text', 'amber', 'green', 'dim']) {
    const val = (settings.colors && settings.colors[key]) || '';
    if (val) root.setProperty(`--${key}`, val);
    else root.removeProperty(`--${key}`);
  }
  $('set-col-text').value = (settings.colors && settings.colors.text) || PALETTE_DEFAULTS.text;
  $('set-col-amber').value = (settings.colors && settings.colors.amber) || PALETTE_DEFAULTS.amber;
  $('set-col-green').value = (settings.colors && settings.colors.green) || PALETTE_DEFAULTS.green;
  $('set-col-dim').value = (settings.colors && settings.colors.dim) || PALETTE_DEFAULTS.dim;
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

settingsBtn.addEventListener('click', () => { settingsPanel.hidden = !settingsPanel.hidden; });
themeSel.addEventListener('change', () => { settings.theme = themeSel.value; saveSettings(); applySettings(); });
fontRange.addEventListener('input', () => { settings.font = Number(fontRange.value); saveSettings(); applySettings(); });
$('set-fontfam').addEventListener('change', (e) => { settings.fontFamily = e.target.value; saveSettings(); applySettings(); });
$('set-lineh').addEventListener('change', (e) => { settings.lineHeight = Number(e.target.value); saveSettings(); applySettings(); });
$('set-dpad').addEventListener('change', (e) => { settings.dpad = e.target.checked; saveSettings(); applySettings(); });
$('set-haptics').addEventListener('change', (e) => { settings.haptics = e.target.checked; saveSettings(); });
$('set-autoscroll').addEventListener('change', (e) => { settings.autoscroll = e.target.checked; autoScroll = e.target.checked; saveSettings(); });
$('set-condensed').addEventListener('change', (e) => { settings.condensed = e.target.checked; saveSettings(); });
$('set-macrobar').addEventListener('change', (e) => { settings.macrobar = e.target.checked; saveSettings(); renderMacros(); });
$('set-statusstrip').addEventListener('change', (e) => { settings.statusstrip = e.target.checked; saveSettings(); renderStatusStrip(); });
$('set-exits').addEventListener('change', (e) => { settings.exits = e.target.checked; saveSettings(); applySettings(); });

for (const key of ['text', 'amber', 'green', 'dim']) {
  $('set-col-' + key).addEventListener('input', (e) => {
    settings.colors = settings.colors || {};
    settings.colors[key] = e.target.value;
    saveSettings();
    applySettings();
  });
}

// Toolbar
$('btn-exits').addEventListener('click', () => {
  const show = $('dock').hidden;
  if (show) $('dock').hidden = false;
  else closePanel();
  syncToolbar();
  if (show) cmdInput.focus();
});
$('btn-inv').addEventListener('click', () => openPanel('inv'));
$('btn-score').addEventListener('click', () => openPanel('score'));
$('btn-skills').addEventListener('click', () => openPanel('skills'));
$('btn-spells').addEventListener('click', () => openPanel('spells'));
$('btn-scripts').addEventListener('click', () => openPanel('scripts', false));
$('panel-close').addEventListener('click', closePanel);
$('panel-refresh').addEventListener('click', () => {
  if (!activePanel || activePanel === 'scripts') return;
  openPanel(activePanel);
});
$('strip-close').addEventListener('click', () => {
  settings.statusstrip = false;
  saveSettings();
  renderStatusStrip();
});

// ---------------- D-pad ----------------
const dpad = $('dpad');
dpad.querySelectorAll('.dbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (settings.haptics && navigator.vibrate) navigator.vibrate(10);
    padRun(`go ${btn.dataset.dir}`);
  });
});

// ---------------- Gamepad (native D-pad / controller) ----------------
const GAMEPAD_DIRS = { 12: 'n', 13: 's', 14: 'w', 15: 'e' };
const GAMEPAD_ACTIONS = { 0: 'attack', 1: 'retreat', 2: 'look', 3: 'cast' };
const prevPad = {};

window.addEventListener('gamepadconnected', (e) => {
  append(`Controller connected: ${e.gamepad.id}`, 'ch-msg');
});
window.addEventListener('gamepaddisconnected', () => {
  append('Controller disconnected.', 'ch-msg');
});

setInterval(() => {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((g) => g && g.connected);
  if (!gp) return;

  for (const [idx, dir] of Object.entries(GAMEPAD_DIRS)) {
    const pressed = Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
    if (pressed && !prevPad['d' + idx]) padRun(`go ${dir}`);
    prevPad['d' + idx] = pressed;
  }
  for (const [idx, action] of Object.entries(GAMEPAD_ACTIONS)) {
    const pressed = Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
    if (pressed && !prevPad['b' + idx]) padRun(action);
    prevPad['b' + idx] = pressed;
  }

  const ax = gp.axes && gp.axes[0];
  const ay = gp.axes && gp.axes[1];
  const stickDir = ay < -0.5 ? 'n' : ay > 0.5 ? 's' : ax < -0.5 ? 'w' : ax > 0.5 ? 'e' : null;
  if (stickDir && !prevPad.stick) padRun(`go ${stickDir}`);
  prevPad.stick = stickDir;
}, 150);

applySettings();
renderMacros();
connect();
