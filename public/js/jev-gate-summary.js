// Summarize Nth-skill gates by distinct ranked skills, not by repeated rows.
export function distinctLaneSummary(rows=[],skills={}) {
  if(!Array.isArray(rows)||!skills||typeof skills!=='object') return 'unknown';
  const groups=new Map();
  for(const row of rows) {
    const match=/^(\d+)(?:st|nd|rd|th) (weapon|armor|survival|lore|supernatural)$/i
      .exec(String(row?.label||''));
    if(!match) continue;
    const key=match[2].toLowerCase();
    const group=groups.get(key)||{required:0,eligible:new Set()};
    group.required=Math.max(group.required,Number(match[1]));
    for(const skill of Array.isArray(row.eligible)?row.eligible:[]) group.eligible.add(String(skill));
    groups.set(key,group);
  }
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,group])=>{
    const observed=[...group.eligible].filter(skill=>Object.hasOwn(skills,skill));
    const ranked=observed.filter(skill=>Number(skills[skill])>0).length;
    const knownZero=observed.length-ranked;
    const unknown=group.eligible.size-observed.length;
    return `${key} ${ranked}/${group.required} ranked${knownZero?` · ${knownZero} known zero`:''}${unknown?` · ${unknown} unknown`:''}`;
  }).join(' · ')||'unknown';
}

export function requirementProgressSummary(events=[]) {
  if(!Array.isArray(events)) return [];
  const snapshots=events.filter(event=>/^(local|jev)-decision$/.test(event?.type)
    &&Array.isArray(event.state?.requirements?.rows))
    .map(event=>({at:event.ts||null,circle:event.state.requirements.circle??null,
      rows:event.state.requirements.rows}));
  const gates=new Map();
  for(const snapshot of snapshots) {
    const key=String(snapshot.circle??'unknown');
    if(!gates.has(key)) gates.set(key,[]);
    gates.get(key).push(snapshot);
  }
  return [...gates.values()].map(group=>{
    const first=group[0],last=group.at(-1);
    const labels=[...new Set(group.flatMap(snapshot=>snapshot.rows.map(row=>String(row.label||'unlabeled'))))];
    const rows=labels.map(label=>{
      const timeline=group.flatMap(snapshot=>snapshot.rows
        .filter(row=>String(row.label||'unlabeled')===label)
        .map(row=>({at:snapshot.at,have:Number(row.have)||0,need:Number(row.need)||0})));
      const initial=timeline[0],latest=timeline.at(-1);
      const firstClosed=timeline.find(sample=>sample.need>0&&sample.have>=sample.need);
      return {label,firstHave:initial?.have??null,latestHave:latest?.have??null,
        need:latest?.need??initial?.need??null,
        delta:initial&&latest?latest.have-initial.have:null,
        closedDuringRun:Boolean(firstClosed&&initial?.have<initial?.need),
        closedAt:firstClosed?.at??null};
    });
    return {circle:first.circle,snapshots:group.length,firstAt:first.at,lastAt:last.at,rows};
  });
}
