// Transport lifecycle with a single deadline-based retry timer. No command queue.
import { isServerMessage } from './wire-message.js';

export function createConnection({ socketFactory, url, readOnly = false, getToken = () => null,
  onMessage = () => {}, onDisconnect = () => {}, onState = () => {},
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
  let socket = null, retryTimer = null, retryAt = null, attempts = 0;
  let phase = readOnly ? 'read-only' : 'idle';
  let lastSeconds = null;
  const state = () => Object.freeze({ phase, attempts, retryAt,
    retrySeconds: retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now()) / 1000)) });
  const publish = () => onState(state());
  const clearRetry = () => { if (retryTimer !== null) cancel(retryTimer); retryTimer = null; retryAt = null; lastSeconds = null; };

  function tick() {
    retryTimer = null;
    if (phase !== 'retrying') return;
    const remaining = retryAt - now();
    if (remaining <= 0) { connect(); return; }
    const seconds = Math.ceil(remaining / 1000);
    if (lastSeconds !== seconds) { lastSeconds = seconds; publish(); }
    retryTimer = schedule(tick, Math.min(1000, remaining));
  }
  function lost() {
    clearRetry();
    phase = 'retrying';
    retryAt = now() + Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5));
    onDisconnect();
    tick();
  }
  function connect() {
    if (readOnly || socket && (socket.readyState === 0 || socket.readyState === 1)) return false;
    clearRetry();
    phase = 'connecting';
    publish();
    let next;
    try { next = socketFactory(url); }
    catch { socket = null; lost(); return false; }
    socket = next;
    next.onopen = () => {
      if (socket !== next) return;
      phase = 'connected';
      publish();
      const token = getToken();
      if (token) send({ t: 'token', token });
    };
    next.onclose = () => {
      if (socket !== next) return;
      socket = null;
      lost();
    };
    next.onerror = () => {
      if (socket !== next) return;
      next.close();
    };
    next.onmessage = event => {
      if (socket !== next || phase !== 'connected') return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!isServerMessage(message)) return;
      if (message.t === 'authed' || message.t === 'enter') attempts = 0;
      onMessage(message);
    };
    return true;
  }
  function send(message) {
    if (readOnly || !socket || socket.readyState !== 1 || phase !== 'connected') return false;
    try { socket.send(JSON.stringify(message)); return true; }
    catch { return false; }
  }
  return { connect, send, state,
    retryNow() { return readOnly || phase === 'connected' || phase === 'connecting' ? false : connect(); } };
}

export function connectionLabel(state) {
  if (state.phase === 'read-only') return 'observation mode';
  if (state.phase === 'connected') return 'connected';
  if (state.phase === 'connecting') return state.attempts ? 'reconnecting…' : 'connecting…';
  if (state.phase === 'retrying') return `disconnected · retrying in ${state.retrySeconds}s`;
  return 'disconnected';
}
