// Read-only presentation of captured evidence. No game connection or commands.
export const validRunId = value => typeof value === 'string' && /^puffer-[a-zA-Z0-9-]{1,100}$/.test(value);
const show = value => value == null ? 'Unknown' : String(value);
export function watchView(manifest, progress, evaluation, selection = '', now = Date.now()) {
  const rows = evaluation?.run_id === manifest.run_id ? evaluation.rows
    : progress?.run_id === manifest.run_id ? progress.rows : [];
  const episodes = Array.isArray(rows) ? rows : [];
  const picked = selection === '' ? null : episodes[Number(selection)];
  const evaluating = manifest.evaluation_status === 'running';
  const current = evaluating && progress?.run_id === manifest.run_id ? progress.current : null;
  const state = picked || current || manifest;
  const sample = state.watch;
  const captured = sample?.captured_at;
  const fresh = typeof captured === 'number' && now-captured*1000 >= -5000 && now-captured*1000 <= 15000;
  const active = !picked && (manifest.status === 'running' || evaluating);
  const label = active && fresh ? 'LIVE · sampled game text'
    : active ? 'WAITING · no fresh screen sample' : 'SAVED · recorded state';
  const lines = [
    `RUN     ${show(manifest.run_id)}`,
    `VIEW    ${picked || current ? `${show(state.policy)} / seed ${show(state.seed)}` : manifest.run_kind === 'frozen_live_play' ? 'Frozen model · live engine player' : 'Training snapshot'}`,
    ...(manifest.run_kind === 'frozen_live_play' ? [`ACTIVITY  ${show(manifest.current_activity)}`, 'SCOPE   Accelerated isolated engine; sampled responses, not every command'] : []),
    `CIRCLE  ${show(sample?.circle ?? state.circle)}    REQUIREMENT GAP  ${show(sample?.requirement_gap ?? state.requirement_gap)}`,
    `ROOM    ${show(sample?.room)}`,
    `STEPS   ${show(sample?.step ?? state.steps)}    COMMAND ATTEMPTS  ${show(sample?.commands ?? state.commands)}`,
    `TIME    ${show(sample?.simulated_seconds ?? state.simulated_seconds)} simulated seconds`,
    `LAST COMMAND  ${show(sample?.last_command)}`,
    '',
    ...(sample?.messages?.length ? sample.messages : ['No game-text capture was recorded for this snapshot. This is a state summary, not a screen replay.']),
  ];
  if (Array.isArray(state.actions)) {
    lines.push('', 'ACTIVITY COUNTS (not command order)');
    state.actions.forEach((count,index) => lines.push(`${manifest.environment?.actions?.[index] || `Action ${index}`}: ${show(count)}`));
  }
  if (state.requirements?.missing?.length) lines.push('', 'UNMET REQUIREMENTS', ...state.requirements.missing);
  return {label, live:active && fresh, text:lines.join('\n'), episodes, state};
}
