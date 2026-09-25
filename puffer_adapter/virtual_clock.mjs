// Deterministic scheduler executes the game's own timer callbacks, not copied rules.
export function virtualClock() {
  const saved = { now: Date.now, setInterval, clearInterval, setTimeout, clearTimeout };
  let now = 1700000000000, serial = 0;
  const timers = new Map();
  function schedule(fn, delay, repeat, args) {
    const timer = { id: ++serial, fn, delay: Math.max(1, Number(delay) || 1), repeat, args, unref() { return this; }, ref() { return this; } };
    timer.at = now + timer.delay;
    timers.set(timer.id, timer);
    return timer;
  }
  Date.now = () => now;
  globalThis.setInterval = (fn, delay, ...args) => schedule(fn, delay, true, args);
  globalThis.setTimeout = (fn, delay, ...args) => schedule(fn, delay, false, args);
  globalThis.clearInterval = globalThis.clearTimeout = timer => timers.delete(timer?.id ?? timer);
  return {
    advance(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        let next;
        for (const timer of timers.values()) if (timer.at <= end && (!next || timer.at < next.at)) next = timer;
        if (!next) break;
        if (++count > 100000) throw new Error('Virtual timer budget exceeded');
        now = next.at;
        if (next.repeat) next.at += next.delay; else timers.delete(next.id);
        next.fn(...next.args);
      }
      now = end;
    },
    reset() { timers.clear(); now = 1700000000000; },
    close() {
      timers.clear(); Date.now = saved.now;
      for (const key of ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']) globalThis[key] = saved[key];
    },
  };
}
