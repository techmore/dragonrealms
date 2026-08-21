// Persisted client settings + appearance panel. Cross-module re-renders
// are notified via onSettingsChange (wired in main.js).
import { $ } from './util.js';

const SETTINGS_KEY = 'dr_settings';

export const settings = Object.assign({
  theme: 'dark', font: 14, dpad: true, colors: {},
  fontFamily: 'mono', lineHeight: 1.45, autoscroll: true, condensed: true,
  statusstrip: null, haptics: true, macrobar: true, exits: true,
  timestamps: false,
  soundAlerts: false,
  scrollback: 2000,
  channels: { room: true, combat: true, say: true, emote: true, shout: true, echo: true, notice: true },
}, (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
})());

export const PALETTE_DEFAULTS = { text: '#ded8b8', amber: '#dfb64f', green: '#79c88a', dim: '#6b6754' };

const listeners = [];

export function onSettingsChange(fn) { listeners.push(fn); }

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

export function isMobile() {
  return window.matchMedia('(max-width: 820px)').matches;
}

export function stripEffective() {
  return settings.statusstrip === null ? true : settings.statusstrip;
}

export function setSettingsOpen(open, returnFocus = false) {
  const panel = $('settings-panel');
  const button = $('settings-btn');
  panel.hidden = !open;
  document.body.classList.toggle('settings-open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
  button.classList.toggle('on', open);
  if (open) requestAnimationFrame(() => $('settings-close').focus());
  else if (returnFocus) button.focus();
}

export function closeSettings(returnFocus = false) {
  if (!$('settings-panel').hidden) setSettingsOpen(false, returnFocus);
}

export function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.dataset.font = settings.fontFamily;
  document.body.style.fontSize = settings.font + 'px';
  document.documentElement.style.setProperty('--lh', settings.lineHeight);
  $('set-theme').value = settings.theme;
  $('set-font').value = settings.font;
  $('set-fontval').textContent = settings.font;
  $('set-fontfam').value = settings.fontFamily;
  $('set-lineh').value = String(settings.lineHeight);
  $('set-dpad').checked = settings.dpad;
  $('set-haptics').checked = settings.haptics;
  $('set-autoscroll').checked = settings.autoscroll;
  $('set-condensed').checked = settings.condensed;
  $('set-macrobar').checked = settings.macrobar;
  $('set-statusstrip').checked = stripEffective();
  $('set-exits').checked = settings.exits;
  $('set-timestamps').checked = Boolean(settings.timestamps);
  $('set-soundalerts').checked = Boolean(settings.soundAlerts);
  $('set-scrollback').value = String(settings.scrollback);
  for (const ch of Object.keys(settings.channels)) {
    const cb = $('set-ch-' + ch);
    if (cb) cb.checked = settings.channels[ch] !== false;
  }
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
  for (const fn of listeners) fn();
}

const bind = (id, key) => {
  $(id).addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    saveSettings();
    applySettings();
  });
};
bind('set-dpad', 'dpad');
bind('set-haptics', 'haptics');
bind('set-autoscroll', 'autoscroll');
bind('set-condensed', 'condensed');
bind('set-macrobar', 'macrobar');
bind('set-statusstrip', 'statusstrip');
bind('set-exits', 'exits');
bind('set-timestamps', 'timestamps');
bind('set-soundalerts', 'soundAlerts');

$('set-scrollback').addEventListener('change', (e) => {
  const v = e.target.value;
  settings.scrollback = v === '0' ? 0 : Number(v);
  saveSettings();
});

export function setChannelVisible(channel, visible) {
  settings.channels = settings.channels || {};
  settings.channels[channel] = visible;
  saveSettings();
}
export function isChannelVisible(channel) {
  return !settings.channels || settings.channels[channel] !== false;
}

for (const ch of ['combat', 'say', 'emote', 'shout', 'echo', 'notice']) {
  $('set-ch-' + ch).addEventListener('change', (e) => {
    setChannelVisible(ch, e.target.checked);
  });
}

$('set-theme').addEventListener('change', (e) => { settings.theme = e.target.value; saveSettings(); applySettings(); });
$('set-font').addEventListener('input', (e) => { settings.font = Number(e.target.value); saveSettings(); applySettings(); });
$('set-fontfam').addEventListener('change', (e) => { settings.fontFamily = e.target.value; saveSettings(); applySettings(); });
$('set-lineh').addEventListener('change', (e) => { settings.lineHeight = Number(e.target.value); saveSettings(); applySettings(); });

for (const key of ['text', 'amber', 'green', 'dim']) {
  $('set-col-' + key).addEventListener('input', (e) => {
    settings.colors = settings.colors || {};
    settings.colors[key] = e.target.value;
    saveSettings();
    applySettings();
  });
}

$('settings-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  setSettingsOpen($('settings-panel').hidden, false);
});
$('settings-close').addEventListener('click', () => setSettingsOpen(false, true));
$('settings-panel').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => closeSettings(false));
