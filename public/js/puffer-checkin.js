// Pure presentation logic: no scheduling, training or model promotion.
export function checkIn(data, { now = Date.now(), error = '' } = {}) {
  const result = (tone, title, reason, next) => ({ tone, title, reason, next });
  if (error || !data) return result('warn', 'Check connection',
    'Current training activity cannot be confirmed.', 'Ask me to check the trainer connection before starting another run.');
  const status = data.status;
  if (status === 'failed' || data.error) return result('danger', 'Check in now · run failed',
    String(data.error || 'The trainer reported a failure.'), 'Ask me to diagnose the saved run before retrying.');
  const evaluating = data.evaluation_status === 'running';
  if (['completed', 'stopped'].includes(status) && !evaluating) {
    if (status === 'stopped') return result('warn', 'Check in before restarting',
      'This run was stopped. It will not restart itself.', 'Ask me to review its checkpoint and any incomplete evaluation.');
    if (data.promotion?.status === 'rejected') return result('warn', 'Check in now · candidate rejected',
      'Training finished, but the improvement checks did not pass. Waiting longer will not improve this saved run.',
      'Ask me to review the rejection reasons and choose the next experiment.');
    if (data.promotion?.status === 'approval_required') return result('warn', 'Check in now · review candidate',
      ['circling', 'barbarian'].includes(data.scenario)
        ? 'The candidate reached the milestone across all evaluation seeds. This does not establish superiority over scripts. No model was deployed and no next run is scheduled.'
        : 'The limited evaluation passed. No model was deployed and no next run is scheduled.',
      'Ask me to review the evidence before deciding whether to keep or continue this candidate.');
    return result('warn', 'Check in now · run finished',
      'The run reached its limit. A completed run is not proof of better leveling.',
      'Ask me to review evaluation results, or complete evaluation if it is missing.');
  }
  if (!['running', 'starting', 'launching'].includes(status) && !evaluating)
    return result('warn', 'Check status · activity unknown', 'No recognized active run status was reported.', 'Ask me to inspect the trainer state.');
  const raw = data.updated_at;
  const updated = typeof raw === 'number' && Number.isFinite(raw)
    ? (raw < 1e12 ? raw * 1000 : raw) : typeof raw === 'string' ? Date.parse(raw) : NaN;
  const age = (now - updated) / 1000;
  if (!Number.isFinite(age) || age > 15 || age < -5)
    return result('warn', 'Check in now · activity unconfirmed',
      'Telemetry is missing, stale or has a clock mismatch. This does not prove the trainer has crashed.',
      'Ask me to inspect the process and saved logs before restarting anything.');
  return result('good', evaluating ? 'Evaluating · no check-in needed yet' : 'Training · no check-in needed yet',
    evaluating ? 'The candidate is being checked against its comparison policies.' : 'The trainer is reporting fresh activity.',
    'Check in when this run finishes, is rejected, fails, or loses telemetry—not after an arbitrary 30 minutes or day.');
}

export function reviewPrompt(data) {
  const id = typeof data?.run_id === 'string' && /^[a-zA-Z0-9-]+$/.test(data.run_id) ? data.run_id : '(run ID unavailable)';
  const reportedTarget = data?.environment?.target_circle ?? data?.target_circle ?? 2;
  const target = Number.isInteger(reportedTarget) && reportedTarget>=2 && reportedTarget<=20 ? reportedTarget : 'unknown';
  if (data?.run_kind === 'scripted_feasibility') return `Review scripted feasibility probe ${id} targeting Circle ${target}. Verify every earned engine milestone, requirement gap, deaths, command counts and simulated seconds. This probe has no neural optimizer and must not count as learned progress or superiority over production scripts. Inspect saved manifest and logs. Do not launch another run or change training without my approval.`;
  if (['circling', 'barbarian'].includes(data?.scenario)) return `Review Puffer ${data.scenario === 'circling' ? 'Ranger' : 'Barbarian'} circling run ${id}. Verify engine-reached Circle ${target} milestones, requirement rows and gap, command counts and simulated seconds. Keep training milestones separate from evaluation results. This is a Circle ${target} curriculum with learned activity selection and scripted command execution, not proof of reliable Circle 20. Do not infer superiority over scripts. Inspect saved evaluation and logs. Do not launch another run or change training without my approval.`;
  return `Review Puffer run ${id}. Inspect its saved manifest, evaluation and logs. Explain progress, balance, comparison results and any failure or rejection. Recommend the next bounded experiment. Do not launch another run, change rewards or deploy a model without my approval.`;
}
