import { activity, runIdentity, workSummary } from './puffer-records.js';
import { validRunId, watchView } from './puffer-watch.js';
import { evaluationSummary, policyLabel } from './puffer-results.js';

export function discoveredRuns(records, latest) {
  const rows = new Map();
  for (const row of Array.isArray(records?.runs) ? records.runs : [])
    if (validRunId(row?.run_id)) rows.set(row.run_id, row);
  if (validRunId(latest?.run_id)) rows.set(latest.run_id, latest);
  return [...rows.values()].sort((a, b) => b.run_id.localeCompare(a.run_id));
}

export function mountPufferRuns(doc = document, fetcher = fetch) {
  const $ = id => doc.getElementById(id);
  const el = (tag, text) => { const node = doc.createElement(tag); node.textContent = text; return node; };
  let manifest, progress, evaluation, generation = 0, timer, disposed = false;
  let catalog = null, catalogAt = 0;
  async function read(path, signal, optional = false) {
    const response = await fetcher(path, { cache: 'no-store', signal });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`Evidence unavailable (HTTP ${response.status})`);
    return response.json();
  }
  function showWatch() {
    if (!manifest) return;
    const view = watchView(manifest, progress, evaluation, $('sp-episode').value);
    $('sp-screen').textContent = view.text;
    $('sp-watch-status').textContent = view.label;
  }
  async function refresh() {
    const ticket = ++generation;
    const selected = $('sp-run').value;
    try {
      const signal = AbortSignal.timeout(10000);
      if (!catalog || Date.now() - catalogAt > 15000) {
        catalog = await Promise.all([read('/live/puffer/records.json', signal, true), read('/live/puffer/latest.json', signal, true)]);
        catalogAt = Date.now();
      }
      const [records, latest] = catalog;
      const play = await read('/live/puffer/live-play.json', signal, true);
      const runs = discoveredRuns({runs: discoveredRuns(records, latest)}, play);
      if (ticket !== generation) return;
      if (doc.activeElement !== $('sp-run')) {
        const options = [el('option', 'Follow latest')]; options[0].value = '';
        for (const row of runs) {
          const option = el('option', `${runIdentity(row).guild} · ${row.run_id}`);
          option.value = row.run_id; options.push(option);
        }
        if (selected && !runs.some(r => r.run_id === selected)) {
          const option = el('option', selected); option.value = selected; options.push(option);
        }
        $('sp-run').replaceChildren(...options); $('sp-run').value = selected;
      }
      const data = selected && validRunId(selected)
        ? await read(`/live/puffer/${selected}/manifest.json`, signal) : validRunId(play?.run_id) ? play : latest;
      if (!validRunId(data?.run_id)) throw new Error('No published Puffer runs yet.');
      const root = `/live/puffer/${data.run_id}`;
      const [nextProgress, nextEvaluation] = data.run_kind === 'frozen_live_play' ? [null, null] : await Promise.all([
        read(`${root}/evaluation-progress.json`, signal, true), read(`${root}/evaluation.json`, signal, true)]);
      if (ticket !== generation) return;
      const changed = manifest?.run_id !== data.run_id;
      manifest = data; progress = nextProgress; evaluation = nextEvaluation;
      const state = activity(data);
      $('sp-status').textContent = data.run_kind === 'frozen_live_play' && state.active ? 'PLAYING · frozen model' : state.label;
      if (changed && data.run_kind === 'frozen_live_play') $('sp-watch').open = true;
      $('sp-details').href = `/puffer.html?run=${encodeURIComponent(data.run_id)}#watch-panel`;
      $('sp-native-watch').href = `/?pufferWatch=${encodeURIComponent(data.run_id)}`;
      const summary = evaluationSummary(data, progress, evaluation);
      $('sp-summary').textContent = `${data.run_id} · ${runIdentity(data).guild} · target Circle ${summary.target} · ${workSummary(data)}`;
      $('sp-results').replaceChildren(...summary.groups.map(g => el('span', `${g.label}: ${g.reached}/${g.completed} reached target`)));
      const view = watchView(data, progress, evaluation);
      if (doc.activeElement !== $('sp-episode')) {
        const previous = changed ? null : $('sp-episode').value;
        const options = [el('option', data.run_kind === 'frozen_live_play' ? 'Follow player' : data.run_kind === 'frozen_validation' ? 'Current / final validation snapshot' : 'Current / final training snapshot')]; options[0].value = '';
        view.episodes.forEach((row, i) => {
          const option = el('option', `${policyLabel(row.policy)} · seed ${row.seed} · Circle ${row.circle ?? '?'}`);
          option.value = String(i); options.push(option);
        });
        $('sp-episode').replaceChildren(...options);
        $('sp-episode').value = previous !== null && options.some(o => o.value === previous) ? previous : view.episodes.length ? '0' : '';
      }
      $('sp-error').textContent = '';
      showWatch();
    } catch (error) {
      if (ticket !== generation) return;
      $('sp-status').textContent = 'Unavailable · not evidence of an active run';
      $('sp-error').textContent = error.message;
      $('sp-watch-status').textContent = 'Unavailable · last display may be stale';
    }
  }
  $('sp-run').addEventListener('change', refresh);
  $('sp-episode').addEventListener('change', showWatch);
  const tick = async () => { await refresh(); if (!disposed) timer = setTimeout(tick, 2000); };
  tick();
  return () => { disposed = true; ++generation; clearTimeout(timer); };
}
if (typeof document !== 'undefined' && document.getElementById('puffer-runs')) mountPufferRuns();
