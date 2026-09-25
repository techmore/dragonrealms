import { validRunId } from './puffer-watch.js';
import { activity } from './puffer-records.js';
import { nativeWatchFrames } from './puffer-native-frames.js';
import { gameState } from './state.js';
import { setStatusOverride } from './net.js';
import { blockInput } from './input.js';
import { hideAll } from './welcome.js';
import { stopScript } from './scripts.js';
import { stopTimers } from './automation.js';
import * as terminal from './terminal.js';
import * as status from './status.js';

export function startNativeWatch(handlers) {
  const selected = new URLSearchParams(location.search).get('pufferWatch');
  gameState.spectating = true;
  gameState.value = 'watching';
  stopScript({silent:true}); stopTimers(); hideAll(); blockInput(true);
  document.getElementById('cmd').placeholder = 'Read-only Puffer watch';
  const banner = document.createElement('aside');
  banner.id = 'puffer-watch-banner';
  banner.style.cssText = 'padding:8px 12px;background:#19262d;color:#d5e5dc;font:12px/1.5 system-ui;';
  const back = document.createElement('a'); back.href = '/sims.html#puffer-runs'; back.textContent = '← Sims';
  const detail = document.createElement('span');
  detail.textContent = ' · Puffer player · read-only · accelerated isolated engine · sampled responses';
  banner.append(back, detail); document.getElementById('topbar').after(banner);
  terminal.clear();
  terminal.append('Watching Puffer in the native DragonRealms UI. Sampled responses, not a full command stream. Unobserved equipment and panels remain unavailable.', 'ch-notice');
  if (selected !== 'latest' && !validRunId(selected)) {
    setStatusOverride('Invalid Puffer run', 'conn-off'); return;
  }
  let key, run, stopped = false, timer;
  async function poll() {
    try {
      const path = selected === 'latest' ? '/live/puffer/live-play.json' : `/live/puffer/${selected}/manifest.json`;
      const response = await fetch(path, {cache:'no-store',signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error(`Screen unavailable (${response.status})`);
      const manifest = await response.json();
      if (selected !== 'latest' && manifest.run_id !== selected) throw new Error('Run identity mismatch');
      const view = nativeWatchFrames(manifest);
      // Requirement telemetry exists even when the sampled text omits a prompt.
      status.renderExpBlips(view.requirements);
      const state = activity(manifest);
      setStatusOverride(state.active ? 'watching Puffer · LIVE' : `Puffer · ${state.label}`, state.active ? 'conn-on' : 'conn-off');
      detail.textContent = ` · ${manifest.watch.character_name ?? 'Puffer'} · ${manifest.current_activity ?? 'observation'} · room ${manifest.watch.room ?? 'unknown'} · read-only · accelerated isolated engine · sampled responses`;
      if (view.key !== key) {
        if (run && run !== manifest.run_id) { terminal.clear(); status.markDisconnected(); }
        run = manifest.run_id; key = view.key;
        handlers.notice({msg:`— Activity ${manifest.current_activity ?? 'sample'} · step ${manifest.watch.step ?? '?'} · ${manifest.watch.simulated_seconds ?? '?'} simulated seconds —`});
        // Bypass main's automation/script dispatch; render only allowlisted frames.
        for (const frame of view.frames) handlers[frame.t](frame);
      }
      if (!state.active) status.markDisconnected();
    } catch (error) {
      setStatusOverride('Puffer screen unavailable', 'conn-off');
      status.markDisconnected();
      detail.textContent = ` · ${error.message} · read-only; retrying`;
    } finally {
      blockInput(true);
      if (!stopped) timer = setTimeout(poll, 2000);
    }
  }
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); }, {once:true});
  poll();
}
