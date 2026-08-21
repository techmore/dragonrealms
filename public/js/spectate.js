// Live spectator view: streams one player's session through the wire relay.
const terminal = document.getElementById('terminal');
const statusEl = document.getElementById('conn-status');
const nameInput = document.getElementById('watch-name');
const tokenInput = document.getElementById('watch-token');
const infoEl = document.getElementById('watch-info');

let ws = null;
let watching = null;

const params = new URLSearchParams(location.search);
const initial = params.get('name') || '';
if (initial) nameInput.value = initial;
tokenInput.value = localStorage.getItem('dr_gm_token') || '';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

function append(text, cls = '') {
  const div = document.createElement('div');
  div.className = 'block' + (cls ? ' ' + cls : '');
  div.innerHTML = ansiToHtml(text);
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

function setStatus(on) {
  statusEl.textContent = on ? 'connected' : 'disconnected';
  statusEl.className = on ? 'conn-on' : 'conn-off';
}

function connect() {
  setStatus(false);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    setStatus(true);
    if (watching) sendSpectate();
  };
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.t) {
      case 'room':
        append(msg.msg, 'ch-room');
        break;
      case 'msg':
        append(msg.msg, 'ch-msg');
        break;
      case 'combat':
        append(msg.msg, 'ch-combat');
        break;
      case 'notice':
        append(msg.msg, 'ch-notice');
        break;
      case 'error':
        append(msg.msg, 'ch-error');
        break;
      case 'command':
        append(`> ${msg.line}`, 'ch-echo');
        break;
      case 'prompt':
        // Vitals aren't echoed into the story window (DR clients show gauges).
        break;
      default:
        append(`[${msg.t}] ${msg.msg || ''}`, 'ch-notice');
    }
  };
}

function sendSpectate() {
  ws.send(JSON.stringify({
    t: 'spectate',
    name: watching,
    gmToken: tokenInput.value.trim(),
  }));
}

function watch(name) {
  const n = name.trim();
  if (!n) return;
  localStorage.setItem('dr_gm_token', tokenInput.value.trim());
  watching = n;
  infoEl.textContent = `watching ${n}`;
  terminal.innerHTML = '';
  if (ws && ws.readyState === WebSocket.OPEN) sendSpectate();
  history.replaceState(null, '', `?name=${encodeURIComponent(n)}`);
}

document.getElementById('watch-go').addEventListener('click', () => watch(nameInput.value));
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') watch(nameInput.value); });
tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') watch(nameInput.value); });

connect();
if (initial) { watching = initial; infoEl.textContent = `watching ${initial}`; }
