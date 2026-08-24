// Status strip + room/prompt state, all derived from server output.
import { $, stripAnsi, escapeHtml as esc } from './util.js';
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
// plus a paper doll — body regions light up per equipped slot. Slots without
// a dedicated region fold into the closest one (accessory → neck pendant).
const DOLL_SLOT_LABELS = { head: 'head', torso: 'body', arms: 'arms', hand: 'hands', shield: 'shield', legs: 'legs', feet: 'feet', neck: 'neck', accessory: 'neck' };
const DOLL_SLOT_REGION = { accessory: 'neck' };
let dollSeen = false;
let rtTimer = null;
export function renderHands(msg) {
  const bar = $('hands-bar');
  if (!bar) return;
  const hand = msg.hand || 'empty hands';
  $('hands-hand').textContent = `Hand: ${hand}`;
  $('hands-worn').textContent = msg.worn && msg.worn.length ? `Worn: ${msg.worn.join(', ')}` : '';
  $('hands-carried').textContent = `Carried: ${msg.carried || 0}`;
  // Paper doll: fill regions whose slot has gear; tooltip names the item and
  // its condition. Damaged gear (<60 condition) gains a red tint via
  // pd-damaged + --pd-cond so wear reads at a glance.
  // Slots fold into their region first (accessory → neck), then each region
  // aggregates every item mapped onto it — so a neck slot AND an accessory
  // both light the same pendant instead of one being silently invisible.
  const slots = msg.slots || {};
  const regions = {};
  for (const [slot, items] of Object.entries(slots)) {
    const region = DOLL_SLOT_REGION[slot] || slot;
    (regions[region] = regions[region] || []).push(...items);
  }
  const doll = $('hands-doll');
  if (doll) {
    for (const g of doll.querySelectorAll('.pd-region')) {
      const slot = g.dataset.slot;
      const items = regions[slot] || [];
      const names = items.map((it) => (typeof it === 'string' ? it : it.name));
      const cond = items.length ? Math.min(...items.map((it) => (typeof it === 'string' ? 100 : it.cond))) : 100;
      g.classList.toggle('pd-filled', items.length > 0);
      g.classList.toggle('pd-damaged', items.length > 0 && cond < 60);
      if (items.length) g.style.setProperty('--pd-cond', String(cond));
      else g.style.removeProperty('--pd-cond');
      g.setAttribute('aria-label', `${DOLL_SLOT_LABELS[slot] || slot}: ${names.join(', ') || 'empty'}`);
      const title = g.querySelector('title') || document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${DOLL_SLOT_LABELS[slot] || slot}: ${names.join(', ') || 'empty'}${items.length ? ` (${cond}% condition)` : ''}`;
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

export function parsePrompt(text, msg = null) {
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
  // Bleeding wounds (server prompt tag): map each "part (severity)" to the
  // paper-doll region it pulses red. DR shows wounds on the body.
  const bleed = /\[bleeding: ([^\]]+)\]/.exec(plain);
  promptState.wounds = bleed
    ? bleed[1].split(', ').map((s) => {
        const m = /^([a-z ]+?) \(([a-z]+)(?:, tended)?\)$/.exec(s.trim());
        return m ? { part: m[1], severity: m[2] } : { part: s.trim(), severity: 'light' };
      })
    : [];
  renderWounds();
  // Structured buff list (server): every active effect with remaining ticks,
  // plus the agent boost. The BUFFS window appears only when non-empty.
  renderBuffs(Array.isArray(msg.buffs) ? msg.buffs : []);
  renderStatusStrip();
  renderCombatStatus();
}

// BUFFS window: one chip per active effect — name + remaining ticks ("~2m"
// at DR's ~6s/tick), boost listed without a countdown while it lasts.
function renderBuffs(buffs) {
  const win = $('buffs-window');
  const body = $('buffs-body');
  if (!win || !body) return;
  if (!buffs.length) {
    win.hidden = true;
    body.innerHTML = '';
    return;
  }
  win.hidden = false;
  revealWindow('buffs');
  body.innerHTML = buffs.map((b) => {
    const left = b.permanent
      ? '<span class="buff-perm">while active</span>'
      : `<span class="buff-ticks">${b.ticks} tick${b.ticks === 1 ? '' : 's'} (~${Math.max(1, Math.round((b.ticks || 0) * 6 / 60))}m)</span>`;
    return `<div class="buff-row" data-buff="${esc(b.key)}"><b>${esc(b.name)}</b>${left}</div>`;
  }).join('');
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
    renderDollHealth(hp[0], hp[1]);
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
  renderRtBlocks(rt);
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
        renderRtBlocks(0);
      } else {
        rtEl.textContent = `RT: ${left}`;
        renderRtBlocks(left);
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

// DR roundtime blocks on the input bar: one red square per remaining second,
// draining right-to-left. Typing is never blocked; the blocks are the cue.
// DR injuries show on the body: as your vitality drops the paper doll's
// regions pale, then take on a bruised red tint — a haggard figure near
// death. Purely visual; numbers stay in the vitals gauge.
// The tint level derives from the SAME word ladder as the HP label, so the
// figure and the prose never disagree (the doll said "healthy" while the
// strip read "HP: battered" under raw-percentage thresholds).
const HEALTH_LEVEL_OF_WORD = {
  healthy: 'healthy',
  'in good shape': 'healthy',
  bruised: 'hurt', hurt: 'hurt', battered: 'hurt', 'beat up': 'hurt',
  'very beat up': 'battered', 'badly hurt': 'battered', 'very badly hurt': 'battered',
  'smashed up': 'critical', 'terribly wounded': 'critical', 'near death': 'critical',
  dead: 'dead',
};
function renderDollHealth(current, maximum) {
  const doll = $('hands-doll');
  if (!doll) return;
  const level = HEALTH_LEVEL_OF_WORD[vitalityWord(current, maximum)] || 'healthy';
  doll.dataset.health = level === 'dead' ? 'critical' : level;
  const word = vitalityWord(current, maximum);
  doll.setAttribute('aria-label', `Your adventurer — ${word}`);
}

// Wounded body parts pulse on the paper doll: map a wound's body-part name
// to the closest doll region and mark it pd-wounded (+pd-tended if bandaged).
const PART_TO_REGION = {
  head: ['head'], chest: ['torso'], abdomen: ['torso'], back: ['torso'],
  'left arm': ['arms'], 'right arm': ['arms'],
  'left leg': ['legs'], 'right leg': ['legs'],
};
function renderWounds() {
  const doll = $('hands-doll');
  if (!doll) return;
  const wounds = (promptState && promptState.wounds) || [];
  // Wound info per region, collected first so the tooltip can be REBUILT in
  // full each prompt (appending used to grow one string per combat tick —
  // a two-minute fight left "— bleeding (slight)" repeated 39 times).
  const woundByRegion = new Map();
  for (const w of wounds) {
    for (const region of PART_TO_REGION[w.part] || []) {
      if (!woundByRegion.has(region)) woundByRegion.set(region, []);
      woundByRegion.get(region).push(w);
    }
  }
  for (const g of doll.querySelectorAll('.pd-region')) {
    const slot = g.dataset.slot;
    const regionWounds = woundByRegion.get(slot) || [];
    g.classList.toggle('pd-wounded', regionWounds.length > 0);
    g.classList.toggle('pd-tended', regionWounds.some((w) => w.tended));
    if (regionWounds.length) {
      g.setAttribute('data-wound-severity', worstSeverity(regionWounds));
      const title = g.querySelector('title');
      if (title) {
        const base = title.textContent.split(' — bleeding')[0];
        const bleed = regionWounds
          .map((w) => `${w.part} (${w.severity}${w.tended ? ', tended' : ''})`)
          .join(', ');
        title.textContent = `${base} — bleeding: ${bleed}`;
      }
    } else {
      g.removeAttribute('data-wound-severity');
    }
  }
}

// Worst active bleed in the region drives the pulse intensity (CSS keys on
// severity for severe/profuse/gushing; lighter bleeds stay at the base pulse).
const SEVERITY_ORDER = ['slight', 'light', 'moderate', 'bad', 'heavy', 'severe', 'profuse', 'gushing'];
function worstSeverity(wounds) {
  let worst = 'slight';
  for (const w of wounds) {
    if (SEVERITY_ORDER.indexOf(w.severity) > SEVERITY_ORDER.indexOf(worst)) worst = w.severity;
  }
  return worst;
}

function renderRtBlocks(left) {
  const wrap = $('rt-blocks');
  if (!wrap) return;
  const n = Math.max(0, Math.min(10, left));
  wrap.hidden = n <= 0;
  if (wrap.childElementCount !== n) {
    wrap.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const b = document.createElement('span');
      b.className = 'rt-block' + (i === 0 ? ' expiring' : '');
      wrap.appendChild(b);
    }
  }
}

// DR vitality words (server ladder mirrored client-side): numbers stay in the
// tooltip for those who want them, but the visible label is prose.
const VITALITY_WORDS = [
  [0.99, 'in good shape'], [0.9, 'bruised'], [0.8, 'hurt'], [0.7, 'battered'],
  [0.6, 'beat up'], [0.5, 'very beat up'], [0.4, 'badly hurt'],
  [0.3, 'very badly hurt'], [0.2, 'smashed up'], [0.1, 'terribly wounded'],
  [0.01, 'near death'], [0, 'dead'],
];
function vitalityWord(current, maximum) {
  const pct = maximum > 0 ? current / maximum : 1;
  return (VITALITY_WORDS.find(([min]) => pct >= min) || VITALITY_WORDS[0])[1];
}

function setGauge(wrapId, fillId, labelId, label, values, urgent = true) {
  const [current, maximum] = values;
  const pct = maximum > 0 ? Math.max(0, Math.min(100, (current / maximum) * 100)) : 0;
  const wrap = $(wrapId);
  $(fillId).style.width = `${pct}%`;
  $(labelId).textContent = `${label}: ${vitalityWord(current, maximum)}`;
  $(labelId).title = `${current}/${maximum}`;
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
    // DR never shows creature numbers — vitality reads as prose, exactly like
    // the player's own condition ("in good shape" → "near death"). The exact
    // hp stays in the title tooltip for those who want it.
    const hpWord = vitalityWord(Math.max(0, t.hp), t.maxHp);
    const name = document.createElement('div');
    name.className = 'target-name';
    name.textContent = t.name + (t.range ? ` (${t.range})` : '');
    const fill = document.createElement('div');
    fill.className = 'target-fill';
    const pct = Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100));
    fill.style.width = pct + '%';
    const hp = document.createElement('div');
    hp.className = 'target-hp';
    hp.textContent = `is ${hpWord}`;
    bar.appendChild(name);
    bar.appendChild(fill);
    bar.appendChild(hp);
    bar.title = `${t.name}: ${Math.max(0, t.hp)}/${t.maxHp}`;
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
