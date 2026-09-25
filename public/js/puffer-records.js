export function activity(data, error = '', now = Date.now()) {
  if (!data || error) return { label: 'Activity unknown', active: false };
  if (data.status === 'failed') return { label: 'Failed · not training', active: false };
  const evaluating = data.evaluation_status === 'running';
  if (['completed', 'stopped', 'interrupted'].includes(data.status) && !evaluating)
    return { label: 'Idle · run finished', active: false };
  const raw = data.updated_at;
  const updated = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : typeof raw === 'string' ? Date.parse(raw) : NaN;
  const age = now - updated;
  if (!Number.isFinite(age) || age > 15000 || age < -5000) return { label: 'Activity unknown · stale', active: false };
  if (data.run_kind === 'frozen_live_play' && data.status === 'running') return {label:'Playing · frozen model',active:true};
  if (evaluating) return { label: data.run_kind === 'frozen_validation' ? 'Validating · frozen weights' : 'Evaluating · active', active: true };
  if (data.status === 'running') return { label: 'Running · training', active: true };
  if (['launching', 'starting'].includes(data.status)) return { label: 'Starting', active: false };
  return { label: 'Activity unknown', active: false };
}

export function workSummary(data) {
  if (data?.run_kind === 'frozen_validation')
    return `Independent validation · no training · source ${data.parent_run ?? 'unknown'} · ${data.validation_seeds?.length ?? '?'} seeds · ${data.evaluation_status ?? 'unknown'}`;
  if (data?.run_kind === 'frozen_live_play')
    return `Frozen replay · ${data.policy_mode ?? 'trained_greedy'} · seed ${data.seed ?? '?'} · diagnostic, not new held-out evidence · ${data.stop_reason ?? data.status ?? 'unknown'}`;
  return `${data?.updates ?? 'unknown'} PPO updates · evaluation: ${data?.evaluation_status ?? 'unknown'}`;
}

export function matchingRecords(records, runId, state) {
  // Record scenarios contain environment prose, not the state scenario key.
  // Deliberately omit historical EXP records until circling compatibility has
  // a structured contract; this run's verified milestones remain separate.
  if (['circling', 'barbarian'].includes(state?.scenario)) return null;
  const group = records?.schema === 'dragonrealms.puffer.records/1'
    ? records.groups?.find(group => group.runs?.includes(runId)) ?? null : null;
  return group;
}

export function verifiedMilestones(state) {
  return (Array.isArray(state?.circle_milestones) ? state.circle_milestones : [])
    .filter(row => Number.isInteger(row?.circle) && row.circle > 1 && row.requirements?.ok === true);
}

export function runIdentity(state) {
  // The original circling curriculum is Ranger, even while the page's planned
  // focus is Barbarian. Never infer a guild from a page heading or record prose.
  if (state?.scenario === 'circling') return { guild: 'Ranger', barbarian: false, circling: true };
  if (state?.scenario === 'barbarian' && state?.guild === 'barbarian')
    return { guild: 'Barbarian', barbarian: true, circling: true };
  return { guild: state?.guild ? String(state.guild) : 'Guild unknown', barbarian: false, circling: false };
}

export function matchingCircleRecord(state, records) {
  // circle_groups is authoritative: the publisher must run decide_circling
  // across all five seeds, require unchanged weights and zero evaluation
  // updates, no deaths, gap zero, valid requirement rows and engine milestones.
  // Never reconstruct that gate from a successful individual episode here.
  if (!runIdentity(state).barbarian || !state.engine_contract
      || records?.schema !== 'dragonrealms.puffer.records/1' || !Array.isArray(records.circle_groups)) return null;
  const canonical = value => JSON.stringify(value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
    : value);
  return records.circle_groups.find(group => {
    const best = group?.best;
    return typeof group?.key === 'string' && group.key.length > 0 && group.guild === 'barbarian'
      && [state.scenario, state.environment?.scenario].filter(Boolean).includes(group.scenario)
      && canonical(group.engine_contract ?? null) === canonical(state.engine_contract)
      && Array.isArray(group.runs) && group.runs.includes(state.run_id) && group.runs.includes(best?.run_id)
      && Array.isArray(group.seeds) && group.seeds.length === 5 && group.seeds.every(Number.isInteger)
      && new Set(group.seeds).size === 5 && best?.samples === 5
      && best.circle === (state.environment?.target_circle ?? state.target_circle ?? 2)
      && (group.target_circle ?? 2) === best.circle
      && typeof best.run_id === 'string' && /^puffer-[a-zA-Z0-9-]{1,100}$/.test(best.run_id)
      && Number.isFinite(best.median_commands) && best.median_commands > 0
      && Number.isFinite(best.median_simulated_seconds) && best.median_simulated_seconds > 0;
  }) ?? null;
}
