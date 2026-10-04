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
import { isAutomationPaused, setAutomationPaused } from './automation-control.js';
import { isScriptRunning, activeScriptName } from './scripts.js';
import { initJourney, updateJourney } from './journey.js';

// Cross-module wiring.
automation.setRunner(input.pressEnter);
terminal.setExitRunner(input.pressEnter);
terminal.setFocusRunner(input.focusInput);
initJourney(input.pressEnter);

onSettingsChange(() => {
  terminal.setAutoScroll(settings.autoscroll);
  input.setDpadVisible(settings.dpad);
  panels.applyVisibility();
  automation.renderMacros();
  status.renderStatusStrip();
});

onDisconnect(() => {
  setAutomationPaused(true);
  resetSession('disconnected');
  input.blockInput(true);
  updateJourney(null, null, false);
});

// A compact safety control stays available without opening the Scripts panel.
const automationButton = $('automation-control');
function renderAutomationControl() {
  const paused = isAutomationPaused();
  const active = isScriptRunning() || automation.timers.length || automation.triggers.length;
  automationButton.hidden = !input.isPlaying();
  automationButton.textContent = paused ? 'Automation paused' : active ? 'Pause automation' : 'Automation idle';
  automationButton.setAttribute('aria-pressed', String(paused));
  automationButton.title = paused ? 'Resume timers and triggers; stopped scripts must be run explicitly' : `${activeScriptName() || 'No DR script'} · ${automation.timers.length} timers · ${automation.triggers.length} triggers. Click to pause all.`;
}
automationButton.addEventListener('click', () => { setAutomationPaused(!isAutomationPaused()); renderAutomationControl(); });
setInterval(renderAutomationControl, 500);
renderAutomationControl();

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
  if (msg.t === 'prompt') updateJourney(msg.journey, msg.requirements, input.isPlaying());
  else if (!input.isPlaying()) updateJourney(null, null, false);
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
