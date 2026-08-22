// Pure DR-script engine (no DOM): parsing + event-driven execution.
// Used by the client (public/js/scripts.js) and unit tests.

export function parseScript(text) {
  const labels = {};
  const lines = [];
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):$/.exec(line);
    if (labelMatch) { labels[labelMatch[1].toLowerCase()] = lines.length; return; }
    lines.push(line);
  });
  return { labels, lines };
}

export function createRunner(src, args = [], io = {}) {
  const { labels, lines } = parseScript(src);
  const vars = {};
  (args || []).forEach((v, i) => { vars[i + 1] = v; }); // DR args are %1..%9
  const s = {
    pc: 0,
    done: false,
    mode: null,          // 'prompt' | 'room' | 'text' | 'match' | 'timer'
    waitText: null,
    waitRe: null,
    matches: [],
    timerAt: 0,
    lastMove: undefined, // last move command (for RT-blocked retries)
    retryLine: null,     // move pending re-send after roundtime
  };
  const say = io.say || (() => {});
  const out = io.send || (() => {});
  const sub = (line) => String(line).replace(/%(\w+)/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

  function execOne(line) {
    const cmd = line.split(/\s+/)[0].toLowerCase();
    if (cmd !== 'move') s.skipMoves = false;
    const rest = line.slice(cmd.length).trim();
    switch (cmd) {
      case 'echo': say(rest); return true;
      case 'put': out(rest); return true;
      case 'move': out(rest); s.lastMove = rest; s.mode = 'room'; return false;
      case 'nextroom': s.mode = 'room'; return false;
      case 'pause': {
        const secs = parseFloat(rest) || 1;
        s.mode = 'timer'; s.timerAt = Date.now() + secs * 1000; return false;
      }
      case 'wait': s.mode = 'prompt'; return false;
      case 'waitfor': s.mode = 'text'; s.waitText = rest.toLowerCase(); s.waitRe = null; return false;
      case 'waitforre': s.mode = 'text'; s.waitText = null; s.waitRe = new RegExp(rest.replace(/^\/(.*)\/$/, '$1'), 'i'); return false;
      case 'match': {
        const sp = rest.split(/\s+/);
        const label = sp.shift().toLowerCase();
        s.matches.push({ label, text: sp.join(' ').toLowerCase(), re: null });
        return true;
      }
      case 'matchre': {
        const sp = rest.split(/\s+/);
        const label = sp.shift().toLowerCase();
        s.matches.push({ label, text: null, re: new RegExp(sp.join(' ').replace(/^\/(.*)\/$/, '$1'), 'i') });
        return true;
      }
      case 'matchwait': s.mode = 'match'; return false;
      case 'goto': {
        const target = rest.toLowerCase();
        if (labels[target] !== undefined) s.pc = labels[target];
        else say(`[script] no such label: ${rest}`);
        return true;
      }
      case 'exit': s.done = true; return false;
      case 'setvariable': {
        const sp = rest.split(/\s+/);
        vars[sp[0]] = sp.slice(1).join(' ');
        return true;
      }
      case 'iflt':
      case 'ifge': {
        // iflt/ifge <var> <number> [goto] <label> — numeric branch on live
        // game state (%hp, %maxhp, %circle, %rt, ...) or a setvariable value.
        const sp = rest.split(/\s+/);
        const val = Number(vars[sp[0]]);
        const ref = Number(sp[1]);
        const hit = Number.isFinite(val) && Number.isFinite(ref)
          && (cmd === 'iflt' ? val < ref : val >= ref);
        if (hit) {
          const li = sp[2] === 'goto' ? 3 : 2;
          const name = sp[li];
          const target = name ? labels[String(name).toLowerCase()] : undefined;
          if (target !== undefined) s.pc = target;
          else say(`[script] no such label: ${name}`);
        }
        return true;
      }
      default:
        if (/^if_\d+$/i.test(cmd)) {
          const n = cmd.slice(3);
          if (vars[n]) return execOne(rest);
          return true;
        }
        say(`[script] unknown command: ${cmd}`);
        return true;
    }
  }

  function advance() {
    while (!s.done && s.pc < lines.length) {
      const line = sub(lines[s.pc]);
      // After a hard movement failure, skip the rest of the move chain so
      // the script lands on its reaction logic (scan/fight/retreat).
      if (s.skipMoves && /^move\s/i.test(line)) { s.pc += 1; continue; }
      s.pc += 1;
      if (!execOne(line)) return;
    }
    s.done = true;
  }

  function feed(text, isPrompt = false) {
    if (s.done) return;
    // Prompts carry live game state: mirror it into %vars so scripts can
    // branch on HP / circle / roundtime (e.g. "iflt hp 35 goto FLEE").
    if ((isPrompt === true || isPrompt === 'prompt') && typeof text === 'string') {
      const plain = text.replace(/\x1b\[\d+m/g, '');
      const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
      if (hp) { vars.hp = hp[1]; vars.maxhp = hp[2]; }
      const circle = /Circle\s*(\d+)/.exec(plain);
      if (circle) vars.circle = circle[1];
      const rt = /RT:\s*(\d+)/.exec(plain);
      if (rt) vars.rt = rt[1];
      vars.combat = /\[COMBAT\]/.test(plain) ? '1' : '0';
    }
    if (s.matches.length && text && typeof text === 'string') {
      const hit = s.matches.find((m) =>
        m.re ? m.re.test(text) : m.text && text.toLowerCase().includes(m.text));
      if (hit) {
        s.matches = [];
        s.mode = null;
        if (labels[hit.label] !== undefined) s.pc = labels[hit.label];
        advance();
        return;
      }
    }
    // Movement rejections: roundtime gets a timed retry; anything else
    // (creatures blocking, closed doors) retries once, then falls through
    // so the script can react to whatever stopped it (e.g. fight).
    if (s.mode === 'room' && text && typeof text === 'string'
      && /roundtime|not ready/i.test(text) && s.lastMove !== undefined) {
      s.retryLine = s.lastMove;
      s.mode = 'timer';
      s.timerAt = Date.now() + 1500;
      return;
    }
    // Wrong direction: no point retrying — abandon the chain at once.
    if (s.mode === 'room' && text && typeof text === 'string'
      && /cannot go that way/i.test(text) && s.lastMove !== undefined) {
      s.skipMoves = true;
      s.lastMove = undefined;
      s.mode = null;
      advance();
      return;
    }
    // Creatures blocking: retry a couple of times, then fall through so the
    // script can react to whatever stopped it (scan/fight/retreat).
    if (s.mode === 'room' && text && typeof text === 'string'
      && /creatures block your path|middle of a fight/i.test(text)
      && s.lastMove !== undefined) {
      s.moveFails = (s.moveFails || 0) + 1;
      if (s.moveFails <= 2) {
        s.retryLine = s.lastMove;
        s.mode = 'timer';
        s.timerAt = Date.now() + 1200;
        return;
      }
      s.moveFails = 0;
      s.skipMoves = true; // abandon the chain; react to what blocked us
      s.lastMove = undefined;
      s.mode = null;
      advance();
      return;
    }
    if (s.mode === 'prompt' && isPrompt) { s.mode = null; advance(); return; }
    if (s.mode === 'room' && isPrompt === 'room') { s.moveFails = 0; s.skipMoves = false; s.mode = null; advance(); return; }
    if (s.mode === 'text' && text) {
      const hit = s.waitRe ? s.waitRe.test(text) : (s.waitText && text.toLowerCase().includes(s.waitText));
      if (hit) { s.mode = null; advance(); return; }
    }
    if (s.mode === 'timer' && Date.now() >= s.timerAt) {
      if (s.retryLine !== undefined && s.retryLine !== null) {
        const line = s.retryLine;
        s.retryLine = null;
        out(line);
        s.mode = 'room';
        return;
      }
      s.mode = null;
      advance();
    }
  }

  return {
    start() { advance(); return this; },
    feed,
    stop() { s.done = true; s.matches = []; },
    get running() { return !s.done; },
  };
}
