import { checkIn, reviewPrompt } from './puffer-checkin.js';
import { activity, matchingRecords, verifiedMilestones, runIdentity, matchingCircleRecord, workSummary } from './puffer-records.js';
import { validRunId, watchView } from './puffer-watch.js';
import { policyLabel, evaluationSummary, requirementBlip, historyCurve } from './puffer-results.js';
const $ = id => document.getElementById(id);
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const number = (value, key) => {
  if (!numeric(value)) return 'Unknown';
  if (value !== 0 && Math.abs(value) < 1e-4) return value.toExponential(3);
  return value.toLocaleString(undefined, key === 'sps'
    ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
    : { maximumFractionDigits: 6 });
};
const display = value => value == null || value === '' ? 'Unknown' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const metricFields = [
  ['steps', 'Environment steps', 'Reported training steps'],
  ['updates', 'Policy updates', 'Reported optimizer updates'],
  ['episodes', 'Episodes', 'Reported episode count'],
  ['sps', 'Steps / second', 'Trainer throughput'],
  ['reward', 'Cumulative reward', 'Total across episodes · not a performance comparison'],
  ['loss', 'Loss', 'Trainer-reported loss'],
  ['entropy', 'Entropy', 'Reported policy entropy'],
  ['circle', 'Current episode circle', 'Episode horizon unknown'],
  ['experience_absorbed', 'Current episode EXP absorbed', 'Episode horizon unknown'],
  ['experience_pooled', 'Current episode EXP pooled', 'Episode horizon unknown'],
];
const detailFields = ['run_id', 'trainer', 'version', 'device', 'schema', 'mode', 'step_cap', 'training_phase', 'imitation', 'parent_run', 'continuation', 'evaluation_status', 'promotion', 'started_at', 'updated_at', 'weights_changed', 'initial_weights_sha256', 'current_weights_sha256', 'environment', 'evaluation_scope', 'baseline', 'checkpoint'];
const labels = { run_id: 'Run ID', started_at: 'Started at', updated_at: 'Trainer updated at', step_cap: 'Step cap', weights_changed: 'Weights changed', initial_weights_sha256: 'Initial weights SHA-256', current_weights_sha256: 'Current weights SHA-256', environment: 'Environment · scenario and limits', evaluation_scope: 'Evaluation scope', baseline: 'Comparison baseline · evaluation summary (not learned-policy evidence)' };
const metricNodes = new Map();
const metricHints = new Map();
const detailNodes = new Map();
let snapshot = null;
let requestError = '';
let pending = false;
let records = null;
const requestedRun = new URLSearchParams(location.search).get('run');
const selectedRun = validRunId(requestedRun) ? requestedRun : null;
let watchProgress = null, watchEvaluation = null;
let watchInitialRun = null;
function renderWatch() {
  if (!snapshot) return;
  const select = $('watch-episode');
  let previous = select.value;
  let view = watchView(snapshot, watchProgress, watchEvaluation, previous);
  if (watchInitialRun !== snapshot.run_id && view.episodes.length && snapshot.evaluation_status === 'completed') {
    previous = '0';
    view = watchView(snapshot, watchProgress, watchEvaluation, previous);
    watchInitialRun = snapshot.run_id;
  }
  const options = [element('option', snapshot.evaluation_status === 'running' ? 'Follow current evaluation' : 'Current / final training snapshot')];
  options[0].value = '';
  view.episodes.forEach((row,index) => {const option=element('option', `${policyLabel(row.policy)} · seed ${row.seed} · Circle ${row.circle}`);option.value=String(index);options.push(option);});
  const catalog = options.map(option=>`${option.value}:${option.textContent}`).join('|');
  if (select.dataset.catalog !== catalog) {select.replaceChildren(...options);select.dataset.catalog=catalog;}
  select.value = [...select.options].some(option=>option.value===previous) ? previous : '';
  $('watch-indicator').textContent = view.label;
  $('watch-indicator').dataset.live = String(view.live);
  $('watch-screen').textContent = view.text;
  const state = view.state;
  const rows = Array.isArray(state.requirements?.rows) ? state.requirements.rows : [];
  const labels = snapshot.environment?.requirement_labels;
  const blips = rows.length ? rows : Array.isArray(labels) ? labels.map(label => ({label})) : [];
  const target = snapshot.environment?.target_circle ?? snapshot.target_circle ?? 2;
  const gate = state.requirement_circle ?? (numeric(state.circle) ? Math.min(target, state.circle + 1) : null);
  const met = rows.filter(row => ['met','over'].includes(requirementBlip(row).tone)).length;
  $('blip-heading').textContent = `Circle ${number(gate)} requirements · ${rows.length ? `${met} / ${rows.length} met` : 'progress unknown'}`;
  $('blip-context').textContent = `${state.policy ? `${policyLabel(state.policy)} · seed ${state.seed}` : 'Training snapshot'} · follows the Watch view below. ${view.label}`;
  $('requirement-blips').replaceChildren(...blips.map(row => {
    const status = requirementBlip(row);
    const item = element('li', undefined, 'requirement-blip');
    item.dataset.tone = status.tone;
    const label = display(row.label).replaceAll('_', ' ');
    item.title = `${label}: ${number(row.have)} of ${number(row.need)} ranks · ${status.tone}`;
    const button = element('button');
    button.type = 'button';
    button.setAttribute('aria-label', item.title);
    button.title = item.title;
    const describe = () => { $('blip-detail').textContent = item.title; };
    button.addEventListener('focus', describe);
    button.addEventListener('click', describe);
    button.addEventListener('mouseenter', describe);
    item.append(button);
    return item;
  }));
  if (document.activeElement !== $('watch-run')) $('watch-run').value = snapshot.run_id;
  renderBest();
  const summary = evaluationSummary(snapshot, watchProgress, watchEvaluation);
  $('evaluation-heading').textContent = `Circle ${number(summary.target)} · evaluation results`;
  $('evaluation-summary').textContent = summary.groups.length
    ? `${summary.groups.reduce((sum, row) => sum + row.completed, 0)} completed episodes · ${snapshot.evaluation_status === 'running' ? 'results still coming in' : 'saved evidence'}`
    : snapshot.run_kind === 'scripted_feasibility' ? 'Scripted feasibility only — no neural evaluation.' : 'No completed evaluation episodes reported yet.';
  $('evaluation-rows').replaceChildren(...summary.groups.map(row => {
    const tr = element('tr');
    tr.append(element('td', row.label), element('td', `${row.reached} of ${row.completed} test episodes`));
    return tr;
  }));
  $('evaluation-table').hidden = summary.groups.length === 0;
  $('run-target').textContent = `This run: Circle ${number(summary.target)}`;
}

function renderBest() {
  const group = matchingCircleRecord(snapshot, records);
  const best = group?.best;
  $('verified-best').textContent = !runIdentity(snapshot).barbarian ? 'No Barbarian run selected' : !best ? 'Not yet verified' : `Circle ${number(best.circle)} · 5/5 seeds`;
  $('verified-best-note').textContent = !best
    ? 'No verified Barbarian result in this group.'
    : `5/5 seeds · median ${number(best.median_simulated_seconds)} simulated seconds / ${number(best.median_commands)} commands.`;
}

function renderRunSelector() {
  const ids = new Set([selectedRun, snapshot?.run_id].filter(validRunId));
  const index = new Map();
  if (Array.isArray(records?.runs)) for (const row of records.runs) if (validRunId(row?.run_id)) {
    ids.add(row.run_id); index.set(row.run_id, row);
  }
  if (Array.isArray(records?.groups)) for (const group of records.groups)
    if (Array.isArray(group?.runs)) for (const id of group.runs) if (validRunId(id)) ids.add(id);
  const options = [element('option', 'Follow latest')];
  options[0].value = '';
  for (const id of [...ids].sort().reverse()) {
    const row = id === snapshot?.run_id ? snapshot : index.get(id);
    const option = element('option', `${row?.run_kind === 'scripted_feasibility' ? 'SCRIPTED PROBE · ' : row ? runIdentity(row).guild + ' · ' : 'Historical · '}${id}`);
    option.value = id; options.push(option);
  }
  if (document.activeElement !== $('run-selector')) {
    $('run-selector').replaceChildren(...options);
    $('run-selector').value = selectedRun || '';
  }
}
$('run-selector').addEventListener('change', () => {
  const id = $('run-selector').value;
  if (!id || validRunId(id)) location.href = id ? `/puffer.html?run=${encodeURIComponent(id)}` : '/puffer.html';
});
$('watch-episode').addEventListener('change', renderWatch);
async function readWatchArtifact(path, signal) {
  const response = await fetch(path, {cache:'no-store',signal});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Watch evidence unavailable (${response.status})`);
  return response.json();
}

function renderRecords() {
  renderBest();
  renderRunSelector();
  const group = matchingRecords(records, snapshot?.run_id, snapshot);
  $('record-scope').textContent = group
    ? `${group.scenario} · ${group.horizon} actions/episode · ${group.seeds.length} matched evaluation seeds · ${group.runs.length} comparable run(s)`
    : ['circling', 'barbarian'].includes(snapshot?.scenario)
      ? 'Historical EXP records are not shown for circling: their scenario descriptions do not establish circling compatibility. Verified milestones below belong to this run.'
      : 'No matching verified evaluation history available for this run.';
  for (const [id, key] of [['best-balanced', 'balanced_exp'], ['best-raw', 'raw_exp']]) {
    const record = group?.[key];
    $(id).textContent = record ? `${number(record.mean_exp)} EXP / episode` : key === 'balanced_exp' ? 'No passing candidate yet' : 'Not available';
    const link = $(id + '-source');
    link.hidden = !record;
    if (record) {
      link.textContent = `${record.run_id} · ${record.promotion}`;
      link.href = `/live/puffer/${encodeURIComponent(record.run_id)}/evaluation.json`;
    }
  }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// Accept ISO dates and Unix timestamps in seconds or milliseconds.
function timestamp(value) {
  if (value == null || value === '') return null;
  const milliseconds = numeric(value) ? (Math.abs(value) < 1e12 ? value * 1000 : value) : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(milliseconds) && Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
}

for (const [key, label, hint] of metricFields) {
  const card = element('div', undefined, `metric${['steps', 'updates', 'episodes', 'sps'].includes(key) ? ' primary' : ''}`);
  const value = element('b', 'Unknown');
  const hintNode = element('small', hint);
  card.append(element('span', label, 'label'), value, hintNode);
  metricHints.set(key, hintNode);
  $('metrics').append(card);
  metricNodes.set(key, value);
}
for (const key of detailFields) {
  const row = element('div');
  const value = element('dd', 'Unknown');
  row.append(element('dt', labels[key] || key), value);
  $('details').append(row);
  detailNodes.set(key, value);
}

function freshness() {
  const running = activity(snapshot, requestError);
  $('activity-indicator').textContent = running.label;
  $('activity-indicator').dataset.active = String(running.active);
  $('hero-status').textContent = running.active ? (snapshot?.evaluation_status === 'running' ? 'Evaluating' : 'Running')
    : requestError || !snapshot || running.label.startsWith('Activity unknown') ? 'Activity unknown'
      : ['starting', 'launching'].includes(snapshot.status) ? 'Starting' : 'Not running';
  $('hero-status').dataset.active = String(running.active);
  if (running.active && snapshot?.evaluation_status !== 'running') {
    const phases = {collecting_demonstrations:'Collecting script examples',behavior_cloning:'Learning from scripts',reinforcement_learning:'Training with RL'};
    $('hero-status').textContent = phases[snapshot.training_phase] || $('hero-status').textContent;
  }
  if (snapshot?.run_kind === 'scripted_feasibility') $('hero-status').textContent = running.active ? 'Scripted probe running' : 'Saved scripted probe';
  $('hero-context').textContent = snapshot
    ? `${runIdentity(snapshot).guild} · ${selectedRun ? 'selected run' : 'latest run'} · ${snapshot.run_id}`
    : 'Waiting for run telemetry. Current focus: Barbarian Circle 2.';
  if (!selectedRun && !requestError && snapshot?.scenario === 'circling' && !running.active
      && ['completed', 'stopped', 'failed'].includes(snapshot.status)) {
    $('hero-status').textContent = 'Barbarian not started';
    $('hero-context').textContent = `Latest telemetry is archived Ranger run ${snapshot.run_id}. No Barbarian run is reported in latest telemetry.`;
  }
  const advice = checkIn(snapshot, { error: requestError });
  $('checkin-panel').dataset.tone = advice.tone;
  $('checkin-title').textContent = advice.title;
  $('checkin-reason').textContent = advice.reason;
  $('checkin-next').textContent = advice.next;
  const limits = [];
  if (numeric(snapshot?.step_cap)) limits.push(`${number(snapshot.step_cap)} training samples`);
  if (numeric(snapshot?.seconds_cap)) limits.push(`${number(snapshot.seconds_cap)} seconds ${numeric(snapshot?.evaluation_seconds_cap) ? 'training' : 'configured runtime'} cap`);
  if (numeric(snapshot?.evaluation_seconds_cap)) limits.push(`${number(snapshot.evaluation_seconds_cap)} seconds separate evaluation cap`);
  $('checkin-limits').textContent = limits.length ? `Run limits: ${limits.join(' / ')}. Limits are not a promise of leveling progress.` : 'Run limits: unknown.';
  const saved = ['completed', 'stopped'].includes(String(snapshot?.status).toLowerCase()) && snapshot?.evaluation_status !== 'running';
  const updated = timestamp(snapshot?.updated_at);
  const age = updated === null ? null : (Date.now() - updated) / 1000;
  const flag = $('freshness');
  flag.dataset.tone = 'warn';
  if (requestError) flag.textContent = snapshot ? 'Unavailable · showing last snapshot' : 'Telemetry unavailable';
  else if (saved) { flag.textContent = 'Saved result'; flag.dataset.tone = 'neutral'; }
  else if (!snapshot) flag.textContent = 'Waiting for telemetry';
  else if (age === null) flag.textContent = 'Freshness unknown';
  else if (age < -5) flag.textContent = 'Freshness unknown · clock mismatch';
  else if (age > 15) flag.textContent = `Stale · updated ${Math.floor(age)}s ago`;
  else { flag.textContent = `Fresh · updated ${Math.max(0, Math.floor(age))}s ago`; flag.dataset.tone = 'good'; }
  const notice = $('connection');
  notice.hidden = !requestError && (saved || (age !== null && age >= -5 && age <= 15));
  notice.textContent = requestError || (!snapshot ? 'Loading the latest training snapshot…' : age === null ? 'The trainer has not provided a valid updated_at timestamp. Freshness is unknown.' : age < -5 ? 'The trainer timestamp is in the future. Check the trainer clock.' : 'Telemetry is stale. The reported status and metrics do not confirm that the trainer is still active.');
}

function render(data) {
  if (data.run_kind === 'frozen_validation') data = {...data, updates:0, steps:0,
    episodes:0, history:[], circle_milestones:[], max_circle:null};
  $('training-progress').textContent = `Displayed run: ${workSummary(data)}. Controls target the active process, not an archived selection.`;
  const identity = runIdentity(data);
  const circling = identity.circling;
  $('watch-title').textContent = `Watch · ${identity.guild}`;
  $('training-milestone-label').textContent = `${data.run_kind === 'frozen_validation' ? 'Frozen validation, NOT new training' : data.run_kind === 'scripted_feasibility' ? 'Scripted feasibility, NOT learned' : 'Training milestone'} · ${identity.guild} · selected run`;
  const target = data.environment?.target_circle ?? data.target_circle ?? 2;
  const gate = Math.min(target, (data.circle ?? 1) + 1);
  $('circling-title').textContent = `${identity.guild} Circle ${gate} · current requirements`;
  const horizon = data.environment?.horizon;
  const episodeHint = numeric(horizon) ? `Character resets at episode end · horizon ${number(horizon)} activities` : 'Character resets at episode end · horizon unknown';
  for (const key of ['circle', 'experience_absorbed', 'experience_pooled']) metricHints.get(key).textContent = episodeHint;
  $('history-scope').textContent = `Reward accumulates across episodes; it is not a performance comparison. EXP and circle describe the current episode character. ${episodeHint}.`;
  $('curriculum-scope').textContent = circling
    ? `Circle ${number(target)} curriculum · ultimate goal Circle 20. Learned activity selection with scripted command execution. Higher targets require separate verified runs.`
    : 'Noncombat skilling scenario. Full circling is not tested, and the curriculum does not expand automatically.';
  $('records-note').textContent = 'Reliable best requires the backend’s full five-seed verification gate within the selected run’s engine, scenario, horizon and seed group. Training or individual evaluation milestones do not establish reliable best. Historical groups are not ranked across cohorts and do not establish superiority over scripts.';
  $('safeguards-scope').textContent = circling
    ? `Assess engine-reached Circle ${number(target)}, unmet requirements, commands and simulated time. The network selects bounded scripted activities. Scripted rotation feasibility is baseline evidence, not a learned-policy achievement. Completion and EXP alone do not establish superiority over scripts.`
    : 'Promotion eligibility requires matched EXP improvement without weakest-skill regression; eligible candidates still require approval. See the saved evaluation for its scope.';
  const milestones = verifiedMilestones(data);
  const best = milestones.length ? Math.max(...milestones.map(row => row.circle)) : null;
  $('best-circle').textContent = best === null ? 'No verified milestone' : `Circle ${number(best)}`;
  $('circle-note').textContent = `Selected run only · reported max ${number(data.max_circle)}. Circle 1 is the starting state.`;
  $('circling-progress').hidden = !circling;
  const req = data.requirements;
  const reqRows = Array.isArray(req?.rows) ? req.rows : [];
  const known = reqRows.length > 0 && reqRows.every(row => numeric(row?.have) && numeric(row?.need));
  const gap = known ? reqRows.reduce((sum, row) => sum + Math.max(0, row.need - row.have), 0) : null;
  $('requirement-gap').textContent = `Circle ${number(gate)} requirement gap: ${number(gap)} ranks · engine requirements satisfied: ${display(req?.ok)}. This run targets Circle ${number(target)}.`;
  $('requirement-rows').replaceChildren(...reqRows.map(row => {
    const card = element('li', undefined, 'requirement-card');
    const valid = numeric(row?.have) && numeric(row?.need) && row.need > 0;
    const remaining = valid ? Math.max(0, row.need - row.have) : null;
    card.dataset.complete = String(valid && remaining === 0);
    const label = display(row?.label).replaceAll('_', ' ');
    card.append(element('h3', label), element('b', `${number(row?.have)} / ${number(row?.need)}`));
    if (valid) {
      const bar = element('progress');
      bar.max = row.need;
      bar.value = Math.max(0, Math.min(row.have, row.need));
      bar.setAttribute('aria-label', `${label}: ${number(row.have)} of ${number(row.need)} ranks`);
      card.append(bar);
    }
    card.append(element('small', !valid ? 'Progress unknown' : remaining === 0 ? 'Requirement met' : `${number(remaining)} ranks to go`));
    return card;
  }));
  $('milestones').replaceChildren(...milestones.map(row => {
    const item = element('li');
    const at = timestamp(row.timestamp);
    item.append(element('p', `Circle ${number(row.circle)} · ${at === null ? 'Timestamp unknown' : new Date(at).toLocaleString()} · ${number(row.commands)} commands · ${number(row.simulated_seconds)} simulated seconds`));
    const evidence = element('details');
    evidence.append(element('summary', 'Verified engine requirements · ok: true'), element('pre', display(row.requirements)));
    item.append(evidence);
    return item;
  }));
  $('milestones-empty').hidden = milestones.length > 0;
  renderRecords();
  renderBest();
  $('checkin-prompt').value = reviewPrompt(data);
  $('learning-decision').textContent = data.evaluation_status === 'running'
    ? 'Checking the candidate against its comparison policies…'
    : data.promotion?.status === 'rejected'
      ? 'Candidate rejected: the improvement checks did not pass. No model was replaced.'
      : data.promotion?.status === 'approval_required'
        ? circling
          ? 'Candidate reached the milestone across all evaluation seeds. This does not establish superiority over scripts. Human approval is still required; nothing was deployed.'
          : 'Candidate passed the limited tests. Human approval is still required; nothing was deployed.'
        : 'No accepted improvement yet. See evaluation status and reasons below.';
  for (const [key, node] of metricNodes) node.textContent = number(data[key], key);
  for (const [key, node] of detailNodes) {
    if (key === 'imitation' && data.imitation) {
      const info = data.imitation;
      node.textContent = display({teacher:info.teacher,demonstration_episodes:info.episodes?.length,examples:info.examples,epochs:info.epochs,balanced:info.balanced,training_accuracy:info.training_accuracy,scope:'Training fit only, not held-out success. Full evidence is saved in the manifest.'});
      continue;
    }
    const date = key.endsWith('_at') ? timestamp(data[key]) : null;
    node.textContent = key.endsWith('_at') ? date === null ? 'Unknown' : new Date(date).toLocaleString() : display(data[key]);
  }
  $('run-status').textContent = `Reported status: ${display(data.status)}`;
  if (data.evaluation_status === 'running') $('run-status').textContent = 'Training finished · evaluating candidate';
  $('trainer-error').textContent = data.error == null ? 'No trainer error reported' : display(data.error);
  const rows = Array.isArray(data.history) ? data.history.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
  for (const key of ['circle','reward']) {
    const curve = historyCurve(rows,key);
    $(`curve-${key}`).setAttribute('d',curve?.path || '');
    $(`curve-${key}-note`).textContent = curve
      ? `${number(curve.samples)} snapshots · samples ${number(curve.xmin)}–${number(curve.xmax)} · range ${number(curve.ymin)}–${number(curve.ymax)}${curve.samples < 2 ? ' · not enough points for a trend' : ''}`
      : 'No numeric history available.';
  }
  $('history-empty').hidden = rows.length > 0;
  $('history-wrap').hidden = rows.length === 0;
  const fragment = document.createDocumentFragment();
  for (const row of rows.slice(-200).reverse()) {
    const tr = element('tr');
    for (const key of ['steps', 'reward', 'loss', 'experience_absorbed', 'circle']) tr.append(element('td', number(row[key])));
    fragment.append(tr);
  }
  $('history').replaceChildren(fragment);
  $('history-empty').textContent = 'History unknown — no samples reported.';
  document.querySelector('caption').textContent = `Cumulative reward, loss and current episode progress · showing ${Math.min(rows.length, 200)} of ${rows.length} reported samples`;
}

async function poll() {
  if (pending) return;
  pending = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    if (requestedRun && !selectedRun) throw new Error('Invalid run ID. Use Follow latest to return.');
    const response = await fetch(selectedRun ? `/live/puffer/${selectedRun}/manifest.json` : '/live/puffer/latest.json', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 404 ? 'No telemetry published yet (HTTP 404).' : `Telemetry request failed (HTTP ${response.status}).`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) throw new Error('The telemetry snapshot is empty or invalid.');
    snapshot = data;
    if (watchEvaluation?.run_id !== data.run_id) watchEvaluation = null;
    if (watchProgress?.run_id !== data.run_id) watchProgress = null;
    requestError = '';
    render(data);
    try {
      if (!validRunId(data.run_id)) throw new Error('Invalid run ID in telemetry');
      [watchProgress,watchEvaluation] = await Promise.all(['evaluation-progress.json','evaluation.json'].map(file=>readWatchArtifact(`/live/puffer/${data.run_id}/${file}`,controller.signal)));
      $('watch-error').textContent = '';
    } catch(error) {
      watchProgress = watchEvaluation = null;
      $('watch-error').textContent = error.message;
    }
    renderWatch();
  } catch (error) {
    requestError = `${error.name === 'AbortError' ? 'Telemetry request timed out.' : error.message}${snapshot ? ' Showing the last successfully received snapshot.' : ' Metrics are unknown until telemetry is available.'}`;
  } finally {
    clearTimeout(timeout);
    pending = false;
    freshness();
    if (requestError) { $('watch-indicator').textContent='UNAVAILABLE · last saved view';$('watch-indicator').dataset.live='false'; }
  }
}

$('copy-review').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('checkin-prompt').value);
    $('copy-result').textContent = 'Copied. Paste it into this chat when you want a review.';
  } catch {
    $('checkin-prompt').focus();
    $('checkin-prompt').select();
    $('copy-result').textContent = 'Select and copy the review request below.';
  }
});
poll();
async function pollRecords() {
  try {
    const response = await fetch('/live/puffer/records.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Records unavailable');
    records = await response.json();
  } catch { records = null; }
  renderRecords();
}
pollRecords();
setInterval(pollRecords, 10000);
setInterval(poll, 2000);
setInterval(freshness, 1000);
