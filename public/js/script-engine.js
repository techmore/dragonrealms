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
  const vars = {};
  (args || []).forEach((v, i) => { vars[i + 1] = v; }); // DR args are %1..%9
  // Frame stack for `putrun <name>` nested scripts: each frame has its own
  // labels/lines/pc. `exit` pops back to the caller; exiting the top frame
  // ends the whole run — like DR's nested script calls.
  const getScript = io.getScript || (() => null);
  const onRefusedMove = io.onRefusedMove;
  const frames = [parseScript(src)];
  frames[0].pc = 0;
  const cur = () => frames[frames.length - 1];
  const s = {
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
      case 'move': out(rest); s.lastMove = rest; s.mode = 'room';
        // Safety deadline: if no room event (or recognized refusal) resolves
        // this move, feed()'s watchdog below abandons the chain instead of
        // leaving the script wedged in 'room' mode forever.
        s.moveDeadline = Date.now() + 12000;
        // Room-change gate: the caller may pass io.roomNow(); when present,
        // a room event only resolves this move if the reported room differs
        // from the room we were in when the move was sent. Stale look echoes
        // and enter-look replies otherwise resolve moves that are still in
        // flight, desyncing the whole chain by one room per echo.
        s.moveFromRoom = io.roomNow ? (io.roomNow() || null) : null;
        return false;
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
      case 'matchwait': {
        // matchwait [secs] — wait for any registered match, but time out
        // after N seconds (default: none, DR-style) and fall through to
        // the next line. The timeout is what lets generated hunt scripts
        // bail out of a FIGHT loop when the target has vanished.
        const tmo = parseFloat(rest);
        s.mode = 'match';
        if (Number.isFinite(tmo) && tmo > 0) {
          s.matchDeadline = Date.now() + tmo * 1000;
          s.timerAt = s.matchDeadline;
        } else {
          s.matchDeadline = null;
        }
        return false;
      }
      case 'goto': {
        const target = rest.toLowerCase();
        if (cur().labels[target] !== undefined) cur().pc = cur().labels[target];
        else say(`[script] no such label: ${rest}`);
        return true;
      }
      case 'putrun': {
        // Nested script call: resolve <name> through io.getScript (the client
        // library / account storage), push a frame, keep running inline.
        const name = rest.split(/\s+/)[0];
        const body = getScript(name);
        if (body == null) { say(`[script] no script named "${name}"`); return true; }
        const parsed = parseScript(body);
        parsed.pc = 0;
        if (frames.length >= 8) { say('[script] putrun depth limit reached'); return true; }
        frames.push(parsed);
        return true;
      }
      case 'exit': {
        frames.pop();
        if (!frames.length) { s.done = true; return false; } // top-level exit
        return true; // resume the caller at its next line
      }
      case 'setvariable': {
        const sp = rest.split(/\s+/);
        vars[sp[0]] = sp.slice(1).join(' ');
        return true;
      }
      case 'iflt':
      case 'ifge': {
        // iflt/ifge <var> <number> [goto] <label> — numeric branch on live
        // game state (%hp, %maxhp, %mana, %circle, %rt, ...) or setvariable.
        const sp = rest.split(/\s+/);
        const val = Number(vars[sp[0]]);
        const ref = Number(sp[1]);
        const hit = Number.isFinite(val) && Number.isFinite(ref)
          && (cmd === 'iflt' ? val < ref : val >= ref);
        if (hit) {
          const li = sp[2] === 'goto' ? 3 : 2;
          const name = sp[li];
          const target = name ? cur().labels[String(name).toLowerCase()] : undefined;
          if (target !== undefined) cur().pc = target;
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
    while (!s.done) {
      const f = cur();
      if (f.pc >= f.lines.length) {
        // Fell off the end of a nested script: implicit exit back to caller.
        frames.pop();
        if (!frames.length) { s.done = true; break; }
        continue;
      }
      const line = sub(f.lines[f.pc]);
      // After a hard movement failure, skip the rest of the move chain so
      // the script lands on its reaction logic (scan/fight/retreat).
      if (s.skipMoves && /^move\s/i.test(line)) { f.pc += 1; continue; }
      f.pc += 1;
      if (!execOne(line)) return;
    }
    s.done = true;
  }

  function feed(text, isPrompt = false) {
    if (s.done) return;
    // Prompts carry live game state: mirror it into %vars so scripts can
    // branch on HP / mana / circle / roundtime ("iflt hp 35 goto FLEE",
    // "iflt mana 10 goto WAITMANA").
    if ((isPrompt === true || isPrompt === 'prompt') && typeof text === 'string') {
      const plain = text.replace(/\x1b\[\d+m/g, '');
      const hp = /HP:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
      if (hp) { vars.hp = hp[1]; vars.maxhp = hp[2]; }
      const mana = /Mana:\s*(\d+)\s*\/\s*(\d+)/.exec(plain);
      if (mana) { vars.mana = mana[1]; vars.maxmana = mana[2]; }
      const circle = /Circle\s*(\d+)/.exec(plain);
      if (circle) vars.circle = circle[1];
      // Synthetic sim prompts (wire-session injectState) may carry the
      // tracked TDP balance; real DR-style prompts never do.
      const tdp = /TDPs?:\s*(\d+)/i.exec(plain);
      if (tdp) vars.tdp = tdp[1];
      const rt = /RT:\s*(\d+)/.exec(plain);
      if (rt) { vars.rt = rt[1]; }
      vars.combat = /\[COMBAT\]/.test(plain) ? '1' : '0';
    }
    // TDP balance surfaces in command OUTPUT (training refusals state the
    // exact balance, `tdp` prints it, spends confirm the cost) rather than
    // the prompt. Mirror it into %tdp whenever prose states it so generated
    // hall scripts can afford-gate tdptrain instead of spamming refusals.
    if (typeof text === 'string') {
      const bal = /costs? \d+ TDPs?; you have (\d+)/i.exec(text);
      if (bal) { vars.tdp = bal[1]; }
      else {
        const shown = /Training Points \(TDPs\): (\d+)/i.exec(text);
        if (shown) { vars.tdp = shown[1]; }
        else {
          const spent = /You (?:spend|invest) (\d+) TDPs/i.exec(text);
          if (spent && vars.tdp !== undefined) vars.tdp = String(Math.max(0, Number(vars.tdp) - Number(spent[1])));
        }
      }
    }
    if (s.matches.length && text && typeof text === 'string') {
      const hit = s.matches.find((m) =>
        m.re ? m.re.test(text) : m.text && text.toLowerCase().includes(m.text));
      if (hit) {
        s.matches = [];
        s.mode = null;
        s.matchDeadline = null;
        const f = cur();
        if (f.labels[hit.label] !== undefined) f.pc = f.labels[hit.label];
        advance();
        return;
      }
    }
    // matchwait timeout: no prose matched within the window — fall through
    // to the next line so the script can re-scan or bail out.
    if (s.mode === 'match' && s.matchDeadline && Date.now() >= s.matchDeadline) {
      s.matches = [];
      s.mode = null;
      s.matchDeadline = null;
      advance();
      return;
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
    // Hard refusals that retrying can't fix (encumbrance, justice): abandon
    // the move chain immediately so the script reacts (drop loot, change plan).
    if (s.mode === 'room' && text && typeof text === 'string'
      && /overloaded|in the stocks|cell door is barred/i.test(text)
      && s.lastMove !== undefined) {
      s.skipMoves = true;
      s.lastMove = undefined;
      s.mode = null;
      advance();
      return;
    }
    // Move watchdog: a move that produced neither a room event nor a
    // recognized refusal within its deadline is treated as a hard failure —
    // fall through so the script re-scans instead of hanging in 'room' mode
    // until an external supervisor restarts it.
    if (s.mode === 'room' && s.moveDeadline && Date.now() >= s.moveDeadline) {
      s.moveDeadline = null;
      s.skipMoves = true;
      s.lastMove = undefined;
      s.mode = null;
      advance();
      return;
    }
    // Wrong direction: no point retrying — abandon the chain at once. Also
    // tell the session the move was refused so no phantom edge is recorded.
    if (s.mode === 'room' && text && typeof text === 'string'
      && /cannot go that way/i.test(text) && s.lastMove !== undefined) {
      onRefusedMove?.(s.lastMove);
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
    if (s.mode === 'room' && isPrompt === 'room') {
      // Room-change gate (see 'move' dispatch): with io.roomNow, a room event
      // only resolves the pending move when the room actually CHANGED since
      // the move was sent. Same-room echoes (look replies) are ignored here
      // and fall through to matcher processing below.
      if (s.moveFromRoom != null && io.roomNow && io.roomNow() === s.moveFromRoom) return;
      s.moveFails = 0; s.skipMoves = false; s.moveDeadline = null; s.moveFromRoom = null; s.mode = null; advance(); return;
    }
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
    get depth() { return frames.length; },
    // Diagnostics for supervisors: why is this script sitting still?
    get state() {
      const f = cur();
      if (!f) return { mode: 'done', depth: 0, pc: -1, pendingMatches: 0 };
      return { mode: s.mode, depth: frames.length - 1, pc: f.pc,
        pendingMatches: s.matches.length };
    },
  };
}
