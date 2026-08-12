// Welcome screen (login / charselect) and character creation form.
import { $, escapeHtml, stripAnsi } from './util.js';
import { send } from './net.js';

const RACES = [
  ['human', 'Human'], ['dwarf', 'Dwarf'], ['elf', 'Elf'], ['elothean', 'Elothean'],
  ['gnome', 'Gnome'], ['gortog', "Gor'Tog"], ['halfling', 'Halfling'], ['kaldar', 'Kaldar'],
  ['prydaen', 'Prydaen'], ['rakash', 'Rakash'], ['skra', "S'Kra Mur"],
];
const GUILDS = [
  ['barbarian', 'Barbarian'], ['bard', 'Bard'], ['cleric', 'Cleric'], ['empath', 'Empath'],
  ['moonmage', 'Moon Mage'], ['necromancer', 'Necromancer'], ['paladin', 'Paladin'],
  ['ranger', 'Ranger'], ['thief', 'Thief'], ['trader', 'Trader'], ['warmage', 'Warrior Mage'],
];
const STATS = ['str', 'con', 'ref', 'agi', 'cha', 'dis', 'wis', 'int'];

const raceFlavor = {};
const guildFlavor = {};

export function hideAll() {
  $('welcome').hidden = true;
  $('welcome-body').innerHTML = '';
  chargenEl.hidden = true;
}

export function showWelcome(mode, msgText) {
  const body = $('welcome-body');
  $('welcome').hidden = false;
  if (mode === 'login') {
    body.innerHTML = `
      <p class="welcome-hint">A text realm. You move by typing, and the world answers in words. Everything you need is one command away \u2014 begin with <b>help</b> once inside.</p>
      <div class="welcome-form">
        <label>Account name<input id="wf-user" autocomplete="off" autocapitalize="off"></label>
        <label>Password<input id="wf-pass" type="password" autocomplete="off"></label>
        <div class="wf-btns">
          <button id="wf-login">Enter the Crossing</button>
          <button id="wf-register" class="ghost">Create account</button>
        </div>
        <div id="wf-err" class="welcome-err"></div>
      </div>
      <p class="welcome-sub">Or just type <b>login</b> or <b>register</b> into the terminal below.</p>`;
    const go = (reg) => {
      const u = $('wf-user').value.trim();
      const p = $('wf-pass').value;
      if (!u || !p) { $('wf-err').textContent = 'Name and password are required.'; return; }
      send(reg ? { t: 'register', u, p } : { t: 'login', u, p });
    };
    $('wf-login').addEventListener('click', () => go(false));
    $('wf-register').addEventListener('click', () => go(true));
    $('wf-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(false); });
    $('wf-user').focus();
    return;
  }
  if (mode === 'charselect') {
    const rows = [];
    for (const line of String(msgText || '').split('\n')) {
      const m = /^\s*(\d+)\)\s*(.+)$/.exec(line);
      if (m) rows.push({ id: m[1], label: m[2] });
    }
    const slots = rows.length ? '' : `<p class="welcome-sub">${escapeHtml(stripAnsi(msgText || ''))}</p>`;
    const hasNew = /"new"/.test(String(msgText || ''));
    body.innerHTML = `
      ${slots}
      <div class="welcome-list">
        ${rows.map((r) => `<button class="wslot" data-id="${r.id}">${escapeHtml(r.label)}</button>`).join('')}
        ${hasNew ? '<button class="wslot wnew" data-id="new">+ New adventurer</button>' : ''}
      </div>
      <p class="welcome-sub">Select a soul to enter the Crossing \u2014 or type its number below.</p>`;
    body.querySelectorAll('.wslot').forEach((b) => {
      b.addEventListener('click', () => send({ t: 'charselect', id: b.dataset.id }));
    });
    return;
  }
  if (mode === 'chargen') {
    $('welcome').hidden = true;
  }
}

export function enterChargen(msgText) {
  $('welcome').hidden = true;
  parseChargenFlavor(msgText);
  showChargen();
}

export function routeTypedCommand(line) {
  const parts = line.split(/\s+/);
  if (parts[0] === 'charcreate' && parts[1] && parts[2] && parts[3]) {
    $('cg-name').value = parts[1];
    $('cg-race').value = parts[2];
    $('cg-guild').value = parts[3];
    submitChargen();
    return true;
  }
  return false;
}

// ---------------- Character creation form ----------------
function parseChargenFlavor(msgText) {
  for (const line of String(msgText || '').split('\n')) {
    const m = /^(\w+)\s*-\s*([^:]+):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const id = m[1].toLowerCase();
    const name = m[2].trim();
    const desc = m[3].trim();
    if (RACES.some(([r]) => r === id)) raceFlavor[id] = { name, desc };
    if (GUILDS.some(([g]) => g === id)) guildFlavor[id] = { name, desc };
  }
}

function showChargen() {
  const raceSel = $('cg-race');
  raceSel.innerHTML = RACES.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  const guildSel = $('cg-guild');
  guildSel.innerHTML = GUILDS.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  $('cg-alloc').textContent = '';
  $('cg-alloc-row').hidden = true;
  chargenEl.hidden = false;
  $('cg-name').focus();
  updateCgFlavor();
}

function updateCgFlavor() {
  const r = raceFlavor[$('cg-race').value];
  const g = guildFlavor[$('cg-guild').value];
  $('cg-race-flavor').textContent = r ? r.desc : '';
  $('cg-guild-flavor').textContent = g ? g.desc : '';
}

export function showAlloc(panel) {
  $('cg-alloc').textContent = panel;
  const statSel = $('cg-stat');
  if (statSel.options.length === 0) {
    statSel.innerHTML = STATS.map((s) => `<option value="${s}">${s.toUpperCase()}</option>`).join('');
  }
  $('cg-alloc-row').hidden = false;
}

function submitChargen() {
  send({
    t: 'charcreate',
    name: $('cg-name').value.trim(),
    race: $('cg-race').value,
    guild: $('cg-guild').value,
    city: ($('cg-city') && $('cg-city').value) || 'crossing',
  });
}

const chargenEl = $('chargen');

$('cg-submit').addEventListener('click', submitChargen);
$('cg-race').addEventListener('change', updateCgFlavor);
$('cg-guild').addEventListener('change', updateCgFlavor);
$('cg-allocbtn').addEventListener('click', () => {
  send({ t: 'alloc', stat: $('cg-stat').value, amt: Number($('cg-amt').value) || 1 });
});
$('cg-enter').addEventListener('click', () => send({ t: 'enter' }));
