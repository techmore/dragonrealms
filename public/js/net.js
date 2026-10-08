// WebSocket transport. Message routing happens in main.js via onServerMessage.
import { $ } from './util.js';
import { createConnection, connectionLabel } from './connection.js';

// Puffer observation pages never connect or send, including indirect UI actions.
const pufferReadOnly = new URLSearchParams(location.search).has('pufferWatch');
let token = null;
try { localStorage.removeItem('dr_token'); token = sessionStorage.getItem('dr_token') || null; } catch {}
const messageListeners = [];
const disconnectListeners = [];
let statusOverride = null;
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const connection = createConnection({
  url: `${protocol}//${location.host}/ws`, readOnly: pufferReadOnly,
  socketFactory: url => new WebSocket(url), getToken: () => token,
  onMessage: message => { for (const listener of messageListeners) listener(message); },
  onDisconnect: () => { for (const listener of disconnectListeners) listener(); },
  onState: state => {
    // Session labels belong to the live connection that produced them.
    if (state.phase !== 'connected' && state.phase !== 'read-only') statusOverride = null;
    renderConnection(state);
  },
});

export function onServerMessage(fn) { messageListeners.push(fn); }
export function onDisconnect(fn) { disconnectListeners.push(fn); }
export function setToken(t) {
  token = t || null;
  try {
    if (token) sessionStorage.setItem('dr_token', token);
    else {
      sessionStorage.removeItem('dr_token');
      try { localStorage.removeItem('dr_token'); } catch {}
    }
  } catch {}
}

export const connect = () => connection.connect();
export const send = message => connection.send(message);
export const retryNow = () => connection.retryNow();
export const connectionState = () => connection.state();

// Session meaning (playing, watching, sign-in) applies only to a live transport.
export function setStatusOverride(text, cls) {
  statusOverride = text == null ? null : { text, cls: cls || 'conn-off' };
  renderConnection(connection.state());
}

function renderConnection(state) {
  const element = $('conn-status');
  const override = ['connected', 'read-only'].includes(state.phase) ? statusOverride : null;
  if (element) {
    const text = override ? override.text : state.phase === 'retrying' ? 'disconnected' : connectionLabel(state);
    if (element.textContent !== text) element.textContent = text;
    element.className = override ? override.cls : state.phase === 'connected' ? 'conn-on' : 'conn-off';
    element.dataset.connectionState = state.phase;
  }
  const countdown = $('connection-countdown');
  if (countdown) {
    countdown.hidden = state.phase !== 'retrying';
    countdown.textContent = state.phase === 'retrying' ? `Retry in ${state.retrySeconds}s` : '';
  }
  const retry = $('connection-retry');
  if (retry) {
    retry.hidden = pufferReadOnly || !['idle', 'retrying'].includes(state.phase);
    retry.disabled = retry.hidden;
  }
}
$('connection-retry')?.addEventListener('click', retryNow);
renderConnection(connection.state());
