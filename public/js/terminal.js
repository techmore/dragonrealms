// Terminal scrollback: rendering, ANSI, channels, scroll controls, search.
import { $, escapeHtml, stripAnsi } from './util.js';
import { settings } from './settings.js';

const terminal = $('terminal');
let autoScroll = true;
let searchMarks = [];
let currentMark = -1;
let combatBuffer = [];
let combatTimer = null;
let exitRunner = (line) => {};
let focusRunner = () => {};

export function setExitRunner(fn) { exitRunner = fn; }
export function setFocusRunner(fn) { focusRunner = fn; }

// ---------------- ANSI ----------------
export function ansiToHtml(str) {
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

// ---------------- Output ----------------
function scrollToBottom() {
  if (autoScroll) terminal.scrollTop = terminal.scrollHeight;
}

export function append(text, cls = '') {
  const div = document.createElement('div');
  div.className = 'block' + (cls ? ' ' + cls : '');
  div.innerHTML = ansiToHtml(text);
  terminal.appendChild(div);
  scrollToBottom();
}

export function appendRoom(text) {
  const div = document.createElement('div');
  div.className = 'block ch-room';
  renderRoomHeader(div, text);
  terminal.appendChild(div);
  scrollToBottom();
}

export function clear() {
  terminal.innerHTML = '';
}

function renderRoomHeader(div, text) {
  const parts = String(text).split('\n');
  const header = stripAnsi(parts[1] || '');
  const dr = /^\[\[(.*?)\]\]$/.exec(header);
  if (dr) {
    // DR format: [[Room Name, Area]]
    const nameArea = dr[1].split(/,\s*/);
    const title = document.createElement('span');
    title.className = 'room-title';
    title.textContent = nameArea[0];
    if (nameArea.length > 1) {
      const area = document.createElement('span');
      area.className = 'room-area';
      area.textContent = ', ' + nameArea.slice(1).join(', ');
      title.appendChild(area);
    }
    div.appendChild(title);
    const rest = parts.slice(2).join('\n');
    if (rest) {
      div.appendChild(document.createTextNode('\n'));
      const span = document.createElement('span');
      span.innerHTML = ansiToHtml(rest);
      div.appendChild(span);
    }
    return;
  }
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

export function appendExitBar(exits) {
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
      exitRunner(`go ${dir}`);
    });
    bar.appendChild(a);
    bar.appendChild(document.createTextNode(' '));
  }
  terminal.appendChild(bar);
  scrollToBottom();
}

// Condensed combat: group lines arriving in one burst into a single block.
export function appendCombat(text) {
  if (!settings.condensed) { append(text, 'ch-combat'); return; }
  combatBuffer.push(text);
  clearTimeout(combatTimer);
  combatTimer = setTimeout(() => {
    const lines = combatBuffer;
    combatBuffer = [];
    append(lines.join('\n'), 'ch-combat');
  }, 600);
}

// ---------------- Scroll controls ----------------
export function setAutoScroll(v) {
  autoScroll = v;
  if (v) endScroll();
}

export function endScroll() {
  autoScroll = true;
  terminal.scrollTop = terminal.scrollHeight;
  $('scroll-pill').hidden = true;
}

function isAtBottom() {
  return terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 24;
}

terminal.addEventListener('scroll', () => {
  if (!autoScroll && isAtBottom()) {
    autoScroll = true;
    $('scroll-pill').hidden = true;
  } else if (autoScroll && !isAtBottom()) {
    autoScroll = false;
    $('scroll-pill').hidden = false;
  }
});

$('scroll-pill').addEventListener('click', endScroll);

// ---------------- Search ----------------
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  searchMarks.forEach((mark, k) => mark.classList.toggle('current', k === idx));
  searchMarks[idx].scrollIntoView({ block: 'center' });
  currentMark = idx;
}

export function searchWith(term) {
  const bar = $('searchbar');
  bar.hidden = false;
  const input = $('search-input');
  input.value = term;
  input.focus();
  runSearch(term);
}

export function closeSearch() {
  $('searchbar').hidden = true;
  clearSearch();
  focusRunner();
}

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
