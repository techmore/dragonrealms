// WebSocket transport. Message routing happens in main.js via onServerMessage.
import { $ } from './util.js';

let ws = null;
let token = null;
try { token = localStorage.getItem('dr_token') || null; } catch {}
let reconnectTimer = null;
let reconnectAttempts = 0;
const messageListeners = [];
const disconnectListeners = [];

export function onServerMessage(fn) { messageListeners.push(fn); }
export function onDisconnect(fn) { disconnectListeners.push(fn); }
export function setToken(t) {
  token = t || null;
  try {
    if (token) localStorage.setItem('dr_token', token);
    else localStorage.removeItem('dr_token');
  } catch {}
}

export function connect() {
  if (ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(ws.readyState)) return;
  clearTimeout(reconnectTimer);
  setStatus(false);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${proto}//${location.host}/ws`);
  ws = socket;
  socket.onopen = () => {
    setStatus(true);
    if (token) send({ t: 'token', token });
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    setStatus(false);
    for (const fn of disconnectListeners) fn();
    const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts++, 5));
    setStatusOverride(`disconnected · retrying in ${delay / 1000}s`, 'conn-off');
    reconnectTimer = setTimeout(connect, delay);
  };
  socket.onerror = () => socket.close();
  socket.onmessage = (ev) => {
    if (ws !== socket) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'authed' || msg.t === 'enter') reconnectAttempts = 0;
    for (const fn of messageListeners) fn(msg);
  };
}

export function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// Override the connection chip with a session-level meaning (e.g. "watching
// X", "watch failed"). Pass null to return to the raw connected/disconnected.
export function setStatusOverride(text, cls) {
  const el = $('conn-status');
  if (!el) return;
  if (text == null) {
    el.textContent = ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
    el.className = ws && ws.readyState === WebSocket.OPEN ? 'conn-on' : 'conn-off';
  } else {
    el.textContent = text;
    el.className = cls || 'conn-off';
  }
}

function setStatus(on) {
  const el = $('conn-status');
  if (!el) return;
  el.textContent = on ? 'connected' : 'disconnected';
  el.className = on ? 'conn-on' : 'conn-off';
}
