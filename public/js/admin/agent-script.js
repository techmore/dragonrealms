// Each browser sim owns a real DR interpreter and a complete script snapshot.
import { createRunner } from '../script-engine.js';
export function createAgentScript(io) {
  let scripts = Object.create(null);
  let runner = null;
  return {
    setLibrary(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      scripts = Object.fromEntries(Object.entries(value).filter(([, body]) => typeof body === 'string'));
    },
    start(name) {
      runner?.stop();
      runner = null;
      if (!Object.hasOwn(scripts, name)) return false;
      runner = createRunner(scripts[name], [], { ...io, getScript: n => Object.hasOwn(scripts, n) ? scripts[n] : null });
      runner.start();
      return true;
    },
    feed(message) {
      if (typeof message.msg === 'string' && ['room','msg','combat','notice','error','prompt'].includes(message.t)) {
        runner?.feed(message.msg, message.t === 'prompt' ? true : message.t);
      }
    },
    tick() { runner?.feed(''); },
    stop() { runner?.stop(); },
    get running() { return Boolean(runner?.running); },
  };
}
