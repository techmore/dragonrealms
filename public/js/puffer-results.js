// Presentation only: completed episode evidence is not a promotion decision.
export function historyCurve(history, key) {
  const rows = (Array.isArray(history) ? history : []).filter(row => Number.isFinite(row?.steps) && row.steps >= 0).slice(-200).sort((a,b)=>a.steps-b.steps);
  const values = rows.filter(row=>Number.isFinite(row[key]));
  if (!values.length) return null;
  const xmin = rows[0].steps, xmax = rows.at(-1).steps;
  const ymin = Math.min(...values.map(row=>row[key])), ymax = Math.max(...values.map(row=>row[key]));
  let drawing = false;
  const path = rows.map(row=>{
    if (!Number.isFinite(row[key])) {drawing=false;return '';}
    const x = 12 + (xmax === xmin ? .5 : (row.steps-xmin)/(xmax-xmin))*376;
    const y = 112 - (ymax === ymin ? .5 : (row[key]-ymin)/(ymax-ymin))*100;
    const command = drawing ? 'L' : 'M'; drawing=true;
    return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
  }).filter(Boolean).join(' ');
  return {path,xmin,xmax,ymin,ymax,samples:values.length};
}
export function requirementBlip(row) {
  const valid = Number.isFinite(row?.have) && row.have >= 0 && Number.isFinite(row?.need) && row.need > 0;
  const fraction = valid ? row.have / row.need : null;
  return { tone: fraction === null ? 'unknown' : row.have >= row.need + 2 ? 'over' : fraction >= 1 ? 'met' : row.need - row.have <= 2 ? 'close' : 'behind',
    percent: fraction === null ? null : Math.floor(fraction * 100) };
}
export const policyLabel = policy => ({
  trained_greedy: 'PPO · best-choice actions', trained_sampled: 'PPO · sampled actions',
  imitation_greedy: 'Imitation only · best-choice', imitation_sampled: 'Imitation only · sampled',
  scripted_rotation: 'Scripted rotation', random: 'Random control',
  parent_greedy: 'Previous model · best-choice', parent_sampled: 'Previous model · sampled',
}[policy] || String(policy || 'Unknown policy'));

export function evaluationSummary(manifest, progress, evaluation) {
  const source = evaluation?.run_id === manifest?.run_id ? evaluation
    : progress?.run_id === manifest?.run_id ? progress : null;
  const target = manifest?.environment?.target_circle ?? manifest?.target_circle ?? 2;
  const groups = new Map();
  for (const row of Array.isArray(source?.rows) ? source.rows : []) {
    if (!row || typeof row.policy !== 'string' || !Number.isInteger(row.seed)) continue;
    if (!groups.has(row.policy)) groups.set(row.policy, new Map());
    groups.get(row.policy).set(row.seed, row);
  }
  return { target, groups: [...groups].map(([policy, seeds]) => {
    const rows = [...seeds.values()];
    return { policy, label: policyLabel(policy), completed: rows.length,
      reached: rows.filter(row => Number.isFinite(row.circle) && row.circle >= target && row.requirements?.ok === true && row.death === false).length };
  }) };
}
