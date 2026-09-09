// Opt-in presentation only. Reuse existing tools and never send commands here.
import { settings, saveSettings, applySettings, onSettingsChange } from './settings.js';
import { onServerMessage, onDisconnect } from './net.js';
import { gameState } from './state.js';

export function initFieldDesk() {
  const query = new URL(location.href);
  if (query.searchParams.get('ui') === 'experimental') settings.experimental = true;
  const desk = document.getElementById('field-desk');
  const avatar = document.getElementById('hands-doll');
  const detail = document.getElementById('field-avatar-detail');
  const inspect = event => {
    const region = event.target.closest('.pd-region');
    if (region) detail.textContent = region.querySelector('title')?.textContent || region.getAttribute('aria-label') || 'Equipment details unavailable.';
  };
  avatar.addEventListener('pointerover', inspect);
  avatar.addEventListener('focus', inspect, true);
  avatar.addEventListener('focusin', inspect);
  avatar.addEventListener('click', inspect);
  const refresh = () => {
    desk.hidden = settings.experimental !== true;
    avatar.setAttribute('viewBox', settings.experimental === true ? '0 0 140 184' : '0 0 140 230');
    detail.hidden = settings.experimental !== true;
    document.getElementById('field-avatar-key').hidden = settings.experimental !== true;
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
