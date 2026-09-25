// Host the SAME event-driven interpreter as the web client. The caller must
// supply an isolated game and generated library, never model-generated text.
import {createRunner} from '../public/js/script-engine.js';

export function scriptController({library, entry, isolated, send, roomNow,
  commandCap, simulatedSecondsCap, initialPrompt = null, unsafe = () => false}) {
  if (isolated !== true) throw new Error('Production baseline requires an isolated world');
  if (!Number.isInteger(commandCap) || commandCap < 1 || commandCap > 1000000
      || !Number.isFinite(simulatedSecondsCap) || simulatedSecondsCap <= 0
      || typeof library?.[entry] !== 'string') throw new Error('Invalid baseline limits or entry');
  const started = Date.now();
  const commands = [], events = [];
  if (initialPrompt !== null && typeof initialPrompt !== 'string') throw new Error('Invalid received prompt');
  // Cache only: never deliver an inherited prompt as a fresh command response.
  let sent = 0, stopped = false, reason = null,
    lastPrompt = initialPrompt?.replace(/\x1b\[[0-9;]*m/g, '') ?? null, lastRefresh = started;
  const runner = createRunner(library[entry], [], {
    roomNow, getScript: name => library[name] ?? null,
    send: line => {
      if (commands.length >= 1000) throw new Error('Script command queue exceeded');
      commands.push(line);
    },
  });
  function stop(why = 'manual') {
    stopped = true; reason = why; runner.stop(); commands.length = events.length = 0;
  }
  function check() {
    if (stopped) return false;
    if (unsafe()) stop('unsafe_state');
    else if (sent >= commandCap) stop('command_cap');
    else if (Date.now() - started >= simulatedSecondsCap * 1000) stop('simulated_time_cap');
    return !stopped;
  }
  function feed(text, kind = false) {
    if (stopped) return;
    text = String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '');
    if (kind === true || kind === 'prompt') lastPrompt = text;
    if (events.length >= 1000) { stop('event_queue_cap'); return; }
    events.push([text, kind]);
  }
  return {
    start() { if (check()) runner.start(); },
    feed,
    // Bounded work per tick, no recursive re-entry when send emits synchronously.
    pump() {
      try {
        // Match the wire supervisor's prompt-shaped heartbeat. Use only a
        // received prompt, never privileged player state; 'inject' cannot
        // re-arm stale RT or satisfy prose matchers in the client interpreter.
        if (check() && lastPrompt && Date.now() - lastRefresh >= 1000) {
          lastRefresh = Date.now();
          feed(lastPrompt, 'inject');
        }
        for (let i=0; i<256 && check(); i++) {
          // Deliver all replies from the preceding command before sending the
          // next one. Otherwise a stale prompt/room reply can satisfy a newer
          // wait and skip purchase or movement gates.
          if (events.length) runner.feed(...events.shift());
          else if (commands.length) { sent++; send(commands.shift()); }
          else { runner.feed(''); break; }
        }
      } catch (error) { stop('script_error'); throw error; }
    },
    stop,
    get state() { return {stopped, reason, commands:sent,
      simulated_seconds:(Date.now()-started)/1000,
      cycle_finished:!runner.running && !commands.length && !events.length,
      interpreter:runner.state}; },
  };
}
