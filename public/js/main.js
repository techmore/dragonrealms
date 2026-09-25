// Boot + wiring. Message routing lives in router.js.
import { initFieldDesk } from './experimental.js';
import { $ } from './util.js';
import { onServerMessage, onDisconnect } from './net.js';
import * as terminal from './terminal.js';
import * as status from './status.js';
import * as panels from './panels.js';
import * as automation from './automation.js';
import * as input from './input.js';
import { settings, applySettings, onSettingsChange, closeSettings } from './settings.js';
import { feedScripts } from './scripts.js';
import { bindHighlightPanel } from './highlights.js';
import { bindGagPanel } from './gags.js';
import { bindWindows } from './windows.js';
import { handlers, SCRIPT_TYPES, resetSession } from './router.js';
import { connect } from './net.js';

// Cross-module wiring.
automation.setRunner(input.pressEnter);
terminal.setExitRunner(input.pressEnter);
terminal.setFocusRunner(input.focusInput);

onSettingsChange(() => {
  terminal.setAutoScroll(settings.autoscroll);
  input.setDpadVisible(settings.dpad);
  panels.applyVisibility();
  automation.renderMacros();
  status.renderStatusStrip();
});

onDisconnect(() => {
  resetSession('disconnected');
  input.blockInput(true);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('keys-overlay').hidden) { import('./keys.js').then((k) => k.toggleKeys(false)); return; }
  if (!$('searchbar').hidden) { terminal.closeSearch(); return; }
  if (!$('settings-panel').hidden) { closeSettings(true); return; }
  if (panels.isPanelOpen()) { panels.closePanel(); return; }
  if (panels.isDockOpen()) panels.closeDock();
});

// ---------------- Message dispatch ----------------
function onMessage(msg) {
  if (SCRIPT_TYPES.includes(msg.t) && msg.msg) {
    automation.runTriggers(msg.msg);
    feedScripts(msg.msg, msg.t);
  }
  const handler = handlers[msg.t];
  if (!handler) return;
  const extra = handler(msg);
  // Handlers can request follow-ups without importing their peers here.
  if (extra?.feedScripts) feedScripts(extra.feedScripts, true);
  if (extra && msg.t === 'prompt') input.blockInput(false);
  if (extra?.applyPanels) panels.applyVisibility();
}

onServerMessage(onMessage);

initFieldDesk();
applySettings();
automation.renderMacros();
bindHighlightPanel();
bindGagPanel();
bindWindows();
window.__panelReady = true;
panels.applyVisibility();
if (new URLSearchParams(location.search).has('pufferWatch')) {
  import('./puffer-native-watch.js').then(({ startNativeWatch }) => startNativeWatch(handlers));
} else {
  connect();
}
