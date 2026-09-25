const endpoint = 'http://127.0.0.1:8788';
const $ = id => document.getElementById(id);
let busy = false, activeRun = null;
async function request(route, body) {
  const response = await fetch(endpoint + route, {method:body ? 'POST' : 'GET',
    headers:body ? {'Content-Type':'application/json'} : {},
    body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(body ? 20000 : 5000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Controller unavailable');
  return result;
}
function budget() {
  const updates = Number($('training-updates').value);
  $('training-budget').textContent = `${updates.toLocaleString()} PPO updates = ${(updates*128).toLocaleString()} training samples. Fresh Circle 20 candidate with script demonstrations; not a continuation of the selected model. Training ends at the sample or time cap, whichever comes first. Evaluation adds up to 60 minutes. Nothing is deployed.`;
}
async function refresh() {
  if (busy) return;
  try {
    const state = await request('/status');
    activeRun = state.runs.find(row=>row.kind === 'train')?.run_id || null;
    $('start-training').disabled = state.pending || state.runs.length > 0;
    $('stop-training').disabled = state.pending || !activeRun;
    $('control-status').textContent = state.pending ? 'Starting or stopping…' : state.runs.length
      ? `Active process: ${state.runs.map(row=>row.run_id).join(', ')}. Start is locked until training and evaluation finish.`
      : 'Ready · no active trainer or evaluation. Start creates one bounded run.';
  } catch {
    activeRun = null;
    $('start-training').disabled = $('stop-training').disabled = true;
    $('control-status').textContent = 'Controls offline or unavailable. Start the local controller with: node puffer_adapter/control.mjs';
  }
}
$('training-updates').addEventListener('change',budget);
$('start-training').addEventListener('click',async()=>{
  if (busy) return;
  busy = true; $('start-training').disabled = $('stop-training').disabled = true;
  $('control-message').textContent = 'Starting one bounded experiment…';
  try {
    const result = await request('/start',{updates:Number($('training-updates').value),minutes:Number($('training-minutes').value)});
    $('control-message').textContent = `Launch accepted: ${result.started.run_id}. Follow latest to view its telemetry.`;
  } catch(error) { $('control-message').textContent = `${error.message} Check process status before retrying.`; }
  finally { busy = false; await refresh(); }
});
$('stop-training').addEventListener('click',async()=>{
  if (busy || !activeRun || !confirm(`Stop ${activeRun}? This stops its training/evaluation, not future externally scheduled runs.`)) return;
  busy = true; $('start-training').disabled = $('stop-training').disabled = true;
  try { const result = await request('/stop',{run_id:activeRun}); $('control-message').textContent = `Stop requested for ${result.stopping}. Waiting for process exit.`; }
  catch(error) { $('control-message').textContent = error.message; }
  finally { busy = false; await refresh(); }
});
budget(); refresh(); setInterval(refresh,5000);
