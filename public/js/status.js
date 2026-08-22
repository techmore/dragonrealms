// Status strip + room/prompt state, all derived from server output.
import { $, stripAnsi } from './util.js';
import { settings, stripEffective, saveSettings } from './settings.js';
import { buildCompassRose } from './compass.js';
import { revealWindow, clearWindowSeen, applyWindow } from './windows.js';

let lastRoom = { name: null, exits: [] };
let promptState = null;

export function getLastRoom() { return lastRoom; }
export function setLastRoom(r) { lastRoom = r; }

// Persistent room panel (DR room window): name/area, description, worded
// exits, and the compass — pinned above the story so you always know where
// you are, even after the terminal scrolls.
export function renderRoomPanel(msg) {
  const panel = $('room-panel');
  if (!panel) return;
  const plain = String(msg.msg || '').replace(/^\n+/, '');
  const lines = plain.split('\n');
  const header = stripAnsi(lines[0] || '');
  const dr = /^\[\[(.*?)\]\]$/.exec(header);
  const title = $('rp-title');
  if (dr) {
    const nameArea = dr[1].split(/,\s*/);
    title.textContent = nameArea[0] + (nameArea.length > 1 ? `, ${nameArea.slice(1).join(', ')}` : '');
  } else {
    title.textContent = stripAnsi(header).replace(/^\[\[/, '').replace(/\]\]$/, '');
  }
  // Description = everything between the header and the exits line.
  const exitIdx = lines.findIndex((l) => /^Obvious (paths|exits):/i.test(stripAnsi(l).trim()));
  const descLines = exitIdx >= 0 ? lines.slice(1, exitIdx) : lines.slice(1);
  $('rp-desc').textContent = descLines.map((l) => stripAnsi(l)).filter((l) => l.trim()).join('\n').trim();
  const exits = msg.exits || [];
  $('rp-exits').textContent = exits.length ? `Obvious paths: ${exits.join(', ')}.` : 'Obvious paths: none.';
  const compass = $('rp-compass');
  compass.innerHTML = '';
  compass.appendChild(buildCompassRose(exits));
  revealWindow('room-panel');
}

export function hideRoomPanel() {
  clearWindowSeen('room-panel');
}

// Persistent hands bar: what you hold, wear, and carry (DR hands window),
// plus a paper doll — body regions light up per equipped slot.
const DOLL_SLOT_LABELS = { head: 'head', torso: 'body', arms: 'arms', hand: 'hands', shield: 'shield', legs: 'legs', feet: 'feet', neck: 'neck', accessory: 'worn' };
let dollSeen = false;
let rtTimer = null;
export function renderHands(msg) {
  const bar = $('hands-bar');
  if (!bar) return;
  const hand = msg.hand || 'empty hands';
  $('hands-hand').textContent = `Hand: ${hand}`;
  $('hands-worn').textContent = msg.worn && msg.worn.length ? `Worn: ${msg.worn.join(', ')}` : '';
  $('hands-carried').textContent = `Carried: ${msg.carried || 0}`;
  // Paper doll: fill regions whose slot has gear; title tooltip names it.
  // First real hands data force-reveals the window (survives the empty-window
  // auto-hide and a player's previously hidden layout) so new players see it.
  const slots = msg.slots || {};
  const doll = $('hands-doll');
  if (doll) {
    for (const g of doll.querySelectorAll('.pd-region')) {
      const slot = g.dataset.slot;
      const items = slots[slot] || [];
      g.classList.toggle('pd-filled', items.length > 0);
      g.setAttribute('aria-label', `${DOLL_SLOT_LABELS[slot] || slot}: ${items.join(', ') || 'empty'}`);
      const title = g.querySelector('title') || document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${DOLL_SLOT_LABELS[slot] || slot}: ${items.join(', ') || 'empty'}`;
      if (!title.parentNode) g.appendChild(title);
    }
    if (!dollSeen && Object.keys(slots).length) {
      dollSeen = true;
      import('./windows.js').then((w) => w.setWindowVisible('hands-bar', true, true));
    }
  }
  revealWindow('hands-bar');
}

export function hideHands() {
  clearWindowSeen('hands-bar');
}

export function markDisconnected() {
  promptState = null;
  targets = [];
  lastRoom = { name: null, area: null, exits: [] };
  document.body.classList.remove('in-combat');
  $('status-strip').hidden = true;
  const row = $('target-row');
  if (row) row.innerHTML = '';
  clearWindowSeen('target-widget');
  renderCombatStatus();
}

export function roomNameOf(text) {
  const plain = stripAnsi(text).replace(/^\n+/, '');
  const first = plain.split('\n')[0] || '';
  const dr = /^\[\[(.*?)\]\]$/.exec(first);
  if (dr) return dr[1].split(/,\s*/)[0].trim() || null;
  const m = /^(.*?)\s*[—\-–]\s*(.*)$/.exec(first);
  return (m ? m[1] : first.replace(/^Obvious exits:.*$/, '')).trim() || null;
}

export function roomAreaOf(text) {
  const plain = stripAnsi(text).replace(/^\n+/, '');
  const first = plain.split('\n')[0] || '';
  const dr = /^\[\[(.*?)\]\]$/.exec(first);
  if (!dr) return null;
  const parts = dr[1].split(/,\s*/);
  return parts.length > 1 ? parts.slice(1).join(', ').trim() : null;
}

export function parsePrompt(text) {
  const plain = stripAnsi(text);
  const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  // Barbarians channel inner fire instead of mana — same gauge, honest label.
  const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const fire = /Fire:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const mental = mana || fire;
  const stamina = /Stamina:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const rt = /RT:\s*(\d+)/i.exec(plain);
  const circle = /Circle\s*(\d+)/i.exec(plain);
  const silver = /(\d+)\s+silvers?/i.exec(plain);
  const stance = /\b(aggressive|defensive|guarded|balanced) stance\b/i.exec(plain);
  if (!hp && !circle) { $('status-strip').hidden = true; return; }
  promptState = {
    hp: hp ? [Number(hp[1]), Number(hp[2])] : null,
    mana: mental ? [Number(mental[1]), Number(mental[2])] : null,
    mentalLabel: mana ? 'Mana' : fire ? 'Inner Fire' : null,
    stamina: stamina ? [Number(stamina[1]), Number(stamina[2])] : null,
    circle: circle ? Number(circle[1]) : null,
    silver: silver ? Number(silver[1]) : null,
    combat: /\[COMBAT\]/.test(plain),
    rt: rt ? Number(rt[1]) : 0,
    hidden: /\[Hidden\]/.test(plain),
    resting: /\[Resting\]/.test(plain),
    stance: stance ? stance[1].toLowerCase() : null,
  };
  renderStatusStrip();
  renderCombatStatus();
}

export function renderStatusStrip() {
  const strip = $('status-strip');
  document.body.classList.toggle('in-combat', Boolean(promptState && promptState.combat));
  if (!stripEffective() || !promptState) { strip.hidden = true; return; }
  strip.hidden = false;
  $('strip-room').textContent = lastRoom.name
    ? lastRoom.name + (lastRoom.area ? ', ' + lastRoom.area : '')
    : '\u2014';
  const hp = promptState.hp;
  if (hp) {
    setGauge('strip-hp-wrap', 'strip-hp-fill', 'strip-hp-label', 'HP', hp);
  } else {
    clearGauge('strip-hp-wrap', 'strip-hp-fill', 'strip-hp-label', 'HP');
  }
  const mental = promptState.mana;
  $('strip-mana-wrap').hidden = !mental;
  if (mental) setGauge('strip-mana-wrap', 'strip-mana-fill', 'strip-mana-label', promptState.mentalLabel || 'Mana', mental, false);
  const stamina = promptState.stamina;
  $('strip-stamina-wrap').hidden = !stamina;
  if (stamina) setGauge('strip-stamina-wrap', 'strip-stamina-fill', 'strip-stamina-label', 'Stamina', stamina, false);
  $('strip-circle').textContent = `Circle ${promptState.circle ?? '--'}`;
  $('strip-silver').textContent = `${promptState.silver ?? '--'} silvers`;
  $('strip-combat').hidden = !promptState.combat;
  const rt = promptState.rt || 0;
  const rtEl = $('strip-rt');
  rtEl.hidden = rt <= 0;
  if (rt > 0) {
    rtEl.textContent = `RT: ${rt}`;
    // DR roundtime cue: pulse while bound; a local countdown keeps it ticking
    // between server prompts, and the next prompt re-syncs the value.
    rtEl.classList.add('rt-live');
    if (rtTimer) clearInterval(rtTimer);
    const startedAt = Date.now();
    rtTimer = setInterval(() => {
      const left = rt - Math.floor((Date.now() - startedAt) / 1000);
      if (left <= 0) {
        clearInterval(rtTimer); rtTimer = null;
        rtEl.hidden = true; rtEl.classList.remove('rt-live');
      } else {
        rtEl.textContent = `RT: ${left}`;
      }
    }, 500);
  } else if (rtTimer) {
    clearInterval(rtTimer); rtTimer = null;
    rtEl.classList.remove('rt-live');
  }
  $('strip-hidden').hidden = !promptState.hidden;
  $('strip-resting').hidden = !promptState.resting;
  renderCombatStatus();
}

function setGauge(wrapId, fillId, labelId, label, values, urgent = true) {
  const [current, maximum] = values;
  const pct = maximum > 0 ? Math.max(0, Math.min(100, (current / maximum) * 100)) : 0;
  const wrap = $(wrapId);
  $(fillId).style.width = `${pct}%`;
  $(labelId).textContent = `${label} ${current}/${maximum}`;
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', String(maximum));
  wrap.setAttribute('aria-valuenow', String(current));
  wrap.setAttribute('aria-valuetext', `${label} ${current} of ${maximum}`);
  if (urgent) wrap.dataset.level = pct <= 25 ? 'critical' : pct <= 50 ? 'low' : 'healthy';
}

function clearGauge(wrapId, fillId, labelId, label) {
  const wrap = $(wrapId);
  $(fillId).style.width = '0%';
  $(labelId).textContent = `${label} --`;
  delete wrap.dataset.level;
  wrap.removeAttribute('aria-valuenow');
  wrap.removeAttribute('aria-valuemax');
  wrap.setAttribute('aria-valuetext', `${label} unavailable`);
}

// Target window (DR combat pane): per-foe HP/range while you fight, plus a
// live status line (roundtime / stance) derived from the prompt.
let targets = [];
export function renderTargets(msg) {
  const wrap = $('target-widget');
  if (!wrap) return;
  targets = (msg && msg.enemies) || [];
  // The combat snapshot carries the authoritative RT — mirror it into
  // promptState so the status-strip chip stays live between prompts.
  if (msg && typeof msg.rt === 'number' && promptState) promptState.rt = msg.rt;
  if (!targets.length) { clearWindowSeen('target-widget'); return; }
  revealWindow('target-widget');
  const row = $('target-row');
  row.innerHTML = '';
  for (const t of targets) {
    const bar = document.createElement('div');
    bar.className = 'target';
    bar.dataset.range = t.range || 'unknown';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `${t.name}${t.range ? ` at ${t.range} range` : ''}`);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(t.maxHp));
    bar.setAttribute('aria-valuenow', String(Math.max(0, t.hp)));
    bar.setAttribute('aria-valuetext', `${Math.max(0, t.hp)} of ${t.maxHp} vitality`);
    const name = document.createElement('div');
    name.className = 'target-name';
    name.textContent = t.name + (t.range ? ` (${t.range})` : '');
    const fill = document.createElement('div');
    fill.className = 'target-fill';
    const pct = Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100));
    fill.style.width = pct + '%';
    const hp = document.createElement('div');
    hp.className = 'target-hp';
    hp.textContent = `${Math.max(0, t.hp)}/${t.maxHp}`;
    bar.appendChild(name);
    bar.appendChild(fill);
    bar.appendChild(hp);
    row.appendChild(bar);
  }
  renderStatusStrip();
}

// Live combat header line: roundtime + stance, parsed from the prompt state.
function renderCombatStatus() {
  const pill = $('combat-status');
  if (!pill) return;
  const bits = [];
  const st = promptState;
  if (st && st.combat) bits.push('COMBAT');
  if (st && st.rt > 0) bits.push(`RT ${st.rt}s`);
  if (st && st.stance) bits.push(st.stance);
  pill.textContent = bits.length ? bits.join(' \u00b7 ') : '';
  pill.hidden = !bits.length;
}

// Room contents line in the pinned room panel (who/what is here), using DR
// phrasing: creatures/players on a "Here:" line, floor objects on a separate
// "You also see ..." line (matching the webclient's object list).
export function renderRoomContents(contents) {
  const el = $('rp-contents');
  if (!el) return;
  const blocks = [];
  const here = [];
  if (contents && contents.creatures && contents.creatures.length) {
    here.push(contents.creatures.map((c) => `${c.name}${c.state && c.state !== 'in good shape' ? ` (${c.state})` : ''}`).join(', '));
  }
  if (contents && contents.npcs && contents.npcs.length) here.push(contents.npcs.join(', '));
  if (contents && contents.players && contents.players.length) here.push(contents.players.join(', '));
  if (here.length) blocks.push(`Here: ${here.join(' · ')}`);
  if (contents && contents.items && contents.items.length) {
    blocks.push(`You also see ${contents.items.join(', ')}.`);
  }
  el.textContent = blocks.join('\n');
  // Give the "You also see" line DR flavor (amber like gem drops are caught by highlights elsewhere).
}

// Quest journal (DR task window): the active crier/guild task, live.
export function renderQuest(msg) {
  const row = $('quest-row');
  if (!row) return;
  const q = msg && msg.quest;
  row.innerHTML = '';
  if (!q) {
    const empty = document.createElement('div');
    empty.className = 'quest-empty';
    empty.textContent = 'No task. Ask the crier or your guild leader for work.';
    row.appendChild(empty);
    clearWindowSeen('quest-widget');
    return;
  }
  revealWindow('quest-widget');
  const kindLabels = { kill: 'Pest control', deliver: 'Delivery', recover: 'Recovery', skin: 'Harvest' };
  const head = document.createElement('div');
  head.className = 'quest-head';
  const kind = document.createElement('span');
  kind.className = 'quest-kind';
  kind.textContent = kindLabels[q.kind] || q.kind;
  head.appendChild(kind);
  if (q.source === 'leader') {
    const src = document.createElement('span');
    src.className = 'quest-src';
    src.textContent = 'guild task';
    head.appendChild(src);
  }
  if (q.done) {
    const done = document.createElement('span');
    done.className = 'quest-done';
    done.textContent = '\u2713 ready to claim';
    head.appendChild(done);
  }
  row.appendChild(head);
  const desc = document.createElement('div');
  desc.className = 'quest-desc';
  desc.textContent = q.desc || '';
  row.appendChild(desc);
}

// FE tracker (DR field-experience pane): skills currently learning.
export function renderFe(msg) {
  const row = $('fe-row');
  if (!row) return;
  const skills = (msg && msg.skills) || [];
  row.innerHTML = '';
  const count = $('fe-count');
  if (count) {
    if (!skills.length) count.hidden = true;
    else {
      count.hidden = false;
      count.textContent = `${skills.length} skill${skills.length === 1 ? '' : 's'} learning`;
    }
  }
  if (!skills.length) {
    const empty = document.createElement('div');
    empty.className = 'fe-empty';
    empty.textContent = 'clear';
    row.appendChild(empty);
    revealWindow('fe-tracker');
    return;
  }
  revealWindow('fe-tracker');
  for (const s of skills) {
    const div = document.createElement('div');
    div.className = 'fe-line';
    const name = document.createElement('span');
    name.className = 'fe-name';
    name.textContent = s.name;
    const ms = document.createElement('span');
    ms.className = 'fe-ms';
    ms.textContent = s.mindstate;
    div.appendChild(name);
    div.appendChild(ms);
    row.appendChild(div);
  }
}
