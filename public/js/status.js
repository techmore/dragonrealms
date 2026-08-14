// Status strip + room/prompt state, all derived from server output.
import { $, stripAnsi } from './util.js';
import { settings, stripEffective, saveSettings } from './settings.js';

let lastRoom = { name: null, exits: [] };
let promptState = null;

export function getLastRoom() { return lastRoom; }
export function setLastRoom(r) { lastRoom = r; }

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
  const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const stamina = /Stamina:\s*(\d+)\s*\/\s*(\d+)/i.exec(plain);
  const rt = /RT:\s*(\d+)/i.exec(plain);
  const circle = /Circle\s*(\d+)/i.exec(plain);
  const silver = /(\d+)\s+silvers?/i.exec(plain);
  if (!hp && !circle) { $('status-strip').hidden = true; return; }
  promptState = {
    hp: hp ? [Number(hp[1]), Number(hp[2])] : null,
    mana: mana ? [Number(mana[1]), Number(mana[2])] : null,
    stamina: stamina ? [Number(stamina[1]), Number(stamina[2])] : null,
    circle: circle ? Number(circle[1]) : null,
    silver: silver ? Number(silver[1]) : null,
    combat: /\[COMBAT\]/.test(plain),
    rt: rt ? Number(rt[1]) : 0,
  };
  renderStatusStrip();
}

export function renderStatusStrip() {
  const strip = $('status-strip');
  if (!stripEffective() || !promptState) { strip.hidden = true; return; }
  strip.hidden = false;
  $('strip-room').textContent = lastRoom.name
    ? lastRoom.name + (lastRoom.area ? ', ' + lastRoom.area : '')
    : '\u2014';
  const hp = promptState.hp;
  if (hp) {
    $('strip-hp-fill').style.width = `${Math.max(0, Math.min(100, (hp[0] / hp[1]) * 100))}%`;
    $('strip-hp-label').textContent = `HP ${hp[0]}/${hp[1]}`;
  } else {
    $('strip-hp-fill').style.width = '0%';
    $('strip-hp-label').textContent = 'HP --';
  }
  const mana = promptState.mana;
  $('strip-mana-wrap').hidden = !mana;
  if (mana) {
    $('strip-mana-fill').style.width = `${Math.max(0, Math.min(100, (mana[0] / mana[1]) * 100))}%`;
    $('strip-mana-label').textContent = `Mana ${mana[0]}/${mana[1]}`;
  }
  const stamina = promptState.stamina;
  $('strip-stamina-wrap').hidden = !stamina;
  if (stamina) {
    $('strip-stamina-fill').style.width = `${Math.max(0, Math.min(100, (stamina[0] / stamina[1]) * 100))}%`;
    $('strip-stamina-label').textContent = `Stamina ${stamina[0]}/${stamina[1]}`;
  }
  $('strip-circle').textContent = `Circle ${promptState.circle ?? '--'}`;
  $('strip-silver').textContent = `${promptState.silver ?? '--'} silvers`;
  $('strip-combat').hidden = !promptState.combat;
  const rt = promptState.rt || 0;
  $('strip-rt').hidden = rt <= 0;
  if (rt > 0) $('strip-rt').textContent = `RT: ${rt}`;
}

$('strip-close').addEventListener('click', () => {
  settings.statusstrip = false;
  saveSettings();
  renderStatusStrip();
});
