// Client-side automation: macros, timers, triggers, macro bar.
// Commands are fired through a runner wired by main.js (pressEnter).
import { $, escapeHtml } from './util.js';
import { settings } from './settings.js';
import { append } from './terminal.js';

const MACROS_KEY = 'dr_macros';
const TRIGGERS_KEY = 'dr_triggers';
const macrobars = $('macrobars');

let runner = (line) => {};
export function setRunner(fn) { runner = fn; }

export let macros = (() => { try { return JSON.parse(localStorage.getItem(MACROS_KEY)) || {}; } catch { return {}; } })();
export let triggers = (() => { try { return JSON.parse(localStorage.getItem(TRIGGERS_KEY)) || []; } catch { return []; } })();
export const timers = [];
let triggerSeq = 1;
let macroEditMode = false;
let scriptsDirty = () => {};

export function onScriptsChange(fn) { scriptsDirty = fn; }

export function saveMacros() { try { localStorage.setItem(MACROS_KEY, JSON.stringify(macros)); } catch {} }
export function saveTriggers() { try { localStorage.setItem(TRIGGERS_KEY, JSON.stringify(triggers)); } catch {} }

export function runTriggers(text) {
  const t = String(text);
  for (const tr of triggers) {
    if (tr.pattern && t.toLowerCase().includes(tr.pattern.toLowerCase())) {
      append(`[trigger] ${tr.command}`, 'ch-msg');
      runner(tr.command);
    }
  }
}

export function renderMacros() {
  const keys = Object.keys(macros);
  const show = settings.macrobar && keys.length > 0;
  macrobars.hidden = !show;
  const row = $('macros-row');
  row.innerHTML = '';
  $('macros-toggle').textContent = macrobars.classList.contains('collapsed') ? '\u25B6' : '\u25BC';
  if (!show) return;
  if (macroEditMode) {
    for (const label of keys) {
      const box = document.createElement('div');
      box.className = 'macro-editbox';
      box.innerHTML = `
        <input class="mc-label" value="${escapeHtml(label)}" title="Label">
        <input class="mc-cmd" value="${escapeHtml(macros[label])}" title="Command">
        <button class="save" title="Save">&#10003;</button>
        <button class="del" title="Delete">&#10005;</button>`;
      box.querySelector('.save').addEventListener('click', () => {
        const nl = box.querySelector('.mc-label').value.trim();
        const nc = box.querySelector('.mc-cmd').value.trim();
        if (!nl || !nc) return;
        delete macros[label];
        macros[nl] = nc;
        saveMacros(); renderMacros();
      });
      box.querySelector('.del').addEventListener('click', () => {
        delete macros[label];
        saveMacros(); renderMacros();
      });
      row.appendChild(box);
    }
    const add = document.createElement('div');
    add.className = 'macro-editbox';
    add.innerHTML = `<input class="mc-label" placeholder="label"><input class="mc-cmd" placeholder="command"><button class="save" title="Add">+</button>`;
    add.querySelector('.save').addEventListener('click', () => {
      const l = add.querySelector('.mc-label').value.trim();
      const c = add.querySelector('.mc-cmd').value.trim();
      if (!l || !c) return;
      macros[l] = c;
      saveMacros(); renderMacros();
    });
    row.appendChild(add);
    macrobars.classList.add('collapsed');
    return;
  }
  macrobars.classList.remove('collapsed');
  for (const label of keys) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = macros[label];
    b.addEventListener('click', () => runner(macros[label]));
    row.appendChild(b);
  }
}

export function handleAutomation(line) {
  const parts = line.split(/\s+/);
  const head = parts[0].toLowerCase();
  if (head === 'macro') {
    if (parts[1] === 'remove' || parts[1] === 'delete') {
      const label = parts[2];
      if (!label || !macros[label]) { append('No such macro.', 'ch-error'); return true; }
      delete macros[label];
      saveMacros(); renderMacros();
      append(`Macro "${label}" removed.`, 'ch-notice');
      scriptsDirty();
      return true;
    }
    if (!parts[1] || !parts[2]) { append('Usage: macro <label> <command>  |  macro remove <label>', 'ch-msg'); return true; }
    const label = parts[1];
    const cmd = parts.slice(2).join(' ');
    macros[label] = cmd;
    saveMacros(); renderMacros();
    append(`Macro "${label}" -> ${cmd}`, 'ch-notice');
    scriptsDirty();
    return true;
  }
  if (head === 'macros') {
    const keys = Object.keys(macros);
    append(keys.length ? `\nMacros:\n${keys.map((k) => `  ${k} -> ${macros[k]}`).join('\n')}` : 'No macros defined. Use: macro <label> <command>', 'ch-msg');
    return true;
  }
  if (head === 'timer') {
    if (parts[1] === 'off' || parts[1] === 'clear') {
      timers.forEach((t) => clearInterval(t.id));
      timers.length = 0;
      append('All timers stopped.', 'ch-notice');
      scriptsDirty();
      return true;
    }
    const sec = parseInt(parts[1], 10);
    const cmd = parts.slice(2).join(' ');
    if (!sec || sec < 2 || !cmd) { append('Usage: timer <seconds> <command> (min 2s) | timer off', 'ch-msg'); return true; }
    const id = setInterval(() => {
      append(`> [timer] ${cmd}`, 'ch-msg');
      runner(cmd);
    }, sec * 1000);
    timers.push({ id, sec, cmd });
    append(`Timer started: every ${sec}s -> ${cmd}`, 'ch-notice');
    scriptsDirty();
    return true;
  }
  if (head === 'timers') {
    append(timers.length ? `Active timers:\n${timers.map((t) => `  every ${t.sec}s -> ${t.cmd}`).join('\n')}` : 'No active timers.', 'ch-msg');
    return true;
  }
  if (head === 'trigger') {
    if (parts[1] === 'remove' || parts[1] === 'delete') {
      const id = parseInt(parts[2], 10);
      const before = triggers.length;
      triggers = triggers.filter((t) => t.id !== id);
      if (triggers.length === before) { append('No such trigger.', 'ch-error'); return true; }
      saveTriggers();
      append(`Trigger ${id} removed.`, 'ch-notice');
      scriptsDirty();
      return true;
    }
    if (!parts[1] || !parts[2]) { append('Usage: trigger <text> <command> | trigger remove <id>', 'ch-msg'); return true; }
    const pattern = parts[1];
    const command = parts.slice(2).join(' ');
    const id = triggerSeq++;
    triggers.push({ id, pattern, command });
    saveTriggers();
    append(`Trigger ${id}: "${pattern}" -> ${command}`, 'ch-notice');
    scriptsDirty();
    return true;
  }
  if (head === 'triggers') {
    append(triggers.length ? `Triggers:\n${triggers.map((t) => `  ${t.id} "${t.pattern}" -> ${t.command}`).join('\n')}` : 'No triggers defined. Use: trigger <text> <command>', 'ch-msg');
    return true;
  }
  return false;
}

export function removeScript(which) {
  const [kind, id] = which.split(':');
  if (kind === 'macro') {
    delete macros[id];
    saveMacros(); renderMacros();
  } else if (kind === 'timer') {
    const t = timers[Number(id)];
    if (t) { clearInterval(t.id); timers.splice(Number(id), 1); }
  } else if (kind === 'trigger') {
    triggers = triggers.filter((t) => t.id !== Number(id));
    saveTriggers();
  }
  scriptsDirty();
}

$('macros-toggle').addEventListener('click', () => {
  macrobars.classList.toggle('collapsed');
  $('macros-toggle').textContent = macrobars.classList.contains('collapsed') ? '\u25B6' : '\u25BC';
});
$('macros-edit').addEventListener('click', () => {
  macroEditMode = !macroEditMode;
  renderMacros();
});
