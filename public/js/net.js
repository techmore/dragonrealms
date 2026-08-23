// WebSocket transport. Message routing happens in main.js via onServerMessage.
import { $ } from './util.js';

let ws = null;
let token = localStorage.getItem('dr_token') || null;
const messageListeners = [];
const disconnectListeners = [];

export function onServerMessage(fn) { messageListeners.push(fn); }
export function onDisconnect(fn) { disconnectListeners.push(fn); }
export function setToken(t) { token = t; }

export function connect() {
  setStatus(false);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    setStatus(true);
    if (token) send({ t: 'token', token });
  };
  ws.onclose = () => {
    setStatus(false);
    for (const fn of disconnectListeners) fn();
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    for (const fn of messageListeners) fn(msg);
  };
}

export function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
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
  el.textContent = on ? 'connected' : 'disconnected';
  el.className = on ? 'conn-on' : 'conn-off';
}
