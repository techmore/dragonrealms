// Embedded player view: watch a player's live client in an overlay iframe.
// Split out of boot.js because render.js binds roster Watch buttons to
// openPlayerView — after the admin.html module split that reference was
// bare and every Watch click died with a ReferenceError (the ↗ new-tab
// button kept working, which made this look like "the button never works").
import { $, esc, S, toast } from './core.js';
import { rosterList, hpBarHtml } from './render.js';

let pvName = null;
let pvOfflineNotified = false;

export function openPlayerView(name, charId) {
  if (!S.token) {
    toast('Live watch is GM-only \u2014 enter DR_GM_TOKEN first.');
    return;
  }
  localStorage.setItem('dr_gm_token', S.token); // the embedded client reads the same key
  pvName = name;
  pvOfflineNotified = false;
  $('pv-name').textContent = name;
  // Hand the token through the fragment too: the embedded client may load
  // before the storage write lands, and a fresh tab has no shared state.
  // The spectate target prefers the stable charId when the server knows it.
  const target = charId || name;
  const url = '/?spectate=' + encodeURIComponent(target) + '#gm=' + encodeURIComponent(S.token);
  $('pv-newtab').href = url; // fragment REQUIRED: a fresh tab has no shared storage yet
  $('pv-frame').src = url;
  $('pv').hidden = false;
  renderPv();
}

function closePlayerView() {
  $('pv').hidden = true;
  $('pv-frame').src = 'about:blank'; // drops the spectator websocket
  pvName = null;
}

// Live summary line for the watched player, refreshed by the normal poll.
export function renderPv() {
  const el = $('pv-vitals');
  if ($('pv').hidden || !pvName) return;
  const p = rosterList().find((x) => x.name === pvName);
  if (!p) {
    el.innerHTML = '<span class="badge fight">OFFLINE</span>';
    if (S.up && !pvOfflineNotified) {
      pvOfflineNotified = true;
      toast(`${pvName} is no longer online.`);
    }
    return;
  }
  el.innerHTML =
    `${esc(p.race ? p.race + ' \u00b7 ' : '')}${esc(p.guild || '?')} · circle ${esc(p.circle)}` +
    `${p.room != null ? ` · room ${esc(p.room)}` : ''} ` +
    hpBarHtml(p) +
    (p.inCombat ? ' <span class="badge fight">\u2694 FIGHT</span>' : '');
}

$('pv-close').addEventListener('click', closePlayerView);
// Keydowns inside the iframe never reach this document, so Escape here
// only ever fires while focus is on the admin chrome.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('pv').hidden) closePlayerView();
});
setInterval(renderPv, 1000);
