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
  };
  const say = io.say || (() => {});
  const out = io.send || (() => {});
  const sub = (line) => String(line).replace(/%(\w+)/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

  function execOne(line) {
    const cmd = line.split(/\s+/)[0].toLowerCase();
    const rest = line.slice(cmd.length).trim();
    switch (cmd) {
      case 'echo': say(rest); return true;
      case 'put': out(rest); return true;
      case 'move': out(rest); s.mode = 'room'; return false;
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
      s.pc += 1;
      if (!execOne(line)) return;
    }
    s.done = true;
  }

  function feed(text, isPrompt = false) {
    if (s.done) return;
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
    if (s.mode === 'prompt' && isPrompt) { s.mode = null; advance(); return; }
    if (s.mode === 'room' && isPrompt === 'room') { s.mode = null; advance(); return; }
    if (s.mode === 'text' && text) {
      const hit = s.waitRe ? s.waitRe.test(text) : (s.waitText && text.toLowerCase().includes(s.waitText));
      if (hit) { s.mode = null; advance(); return; }
    }
    if (s.mode === 'timer' && Date.now() >= s.timerAt) { s.mode = null; advance(); }
  }

  return {
    start() { advance(); return this; },
    feed,
    stop() { s.done = true; s.matches = []; },
    get running() { return !s.done; },
  };
}
