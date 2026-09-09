// Opt-in presentation only. Reuse existing tools and never send commands here.
import { settings, saveSettings, applySettings, onSettingsChange } from './settings.js';
import { onServerMessage, onDisconnect } from './net.js';
import { gameState } from './state.js';

export function initFieldDesk() {
  const query = new URL(location.href);
  if (query.searchParams.get('ui') === 'experimental') settings.experimental = true;
  const desk = document.getElementById('field-desk');
  const refresh = () => {
    desk.hidden = settings.experimental !== true;
    const active = gameState.value === 'playing';
    desk.querySelector('.field-reference').hidden = !active;
    desk.querySelector('.field-actions').hidden = !active;
    desk.querySelector('.field-hint').hidden = !active;
    document.getElementById('field-help').disabled = !active || gameState.spectating;
  };
  onSettingsChange(refresh);
  onServerMessage(() => queueMicrotask(refresh));
  onDisconnect(() => queueMicrotask(refresh));
  desk.querySelectorAll('[data-field-panel]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.fieldPanel).click());
  });
  document.getElementById('field-help').addEventListener('click', () => {
    const input = document.getElementById('cmd');
    if (input.disabled || gameState.spectating) return;
    // Preserve a draft; help is prepared for review, never executed automatically.
    if (!input.value.trim()) input.value = 'help';
    input.focus();
  });
  document.getElementById('field-classic').addEventListener('click', () => {
    settings.experimental = false;
    const url = new URL(location.href);
    url.searchParams.delete('ui');
    history.replaceState(null, '', url);
    saveSettings();
    applySettings();
    document.getElementById('settings-btn').focus();
  });
}
