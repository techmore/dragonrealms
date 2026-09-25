const IMPROVEMENT_SKILLS={
  'Inner Fire':'inner_fire','Foraging':'foraging','Hiding':'hiding','Stealth':'stealth',
  'Performance':'performance','Appraisal':'appraisal','Athletics':'athletics',
  'Perception':'perception','Skinning':'skinning','Small Edged':'small_edged',
  'Brawling':'brawling','Evasion':'evasion','Parry':'parry','Light Armor':'light_armor',
  'Shield Usage':'shield_usage','Expertise':'expertise','Tactics':'tactics',
};
const stripAnsi=text=>String(text||'').replace(/\u001b\[[0-9;]*m/g,'').replace(/\s+/g,' ').trim();

function feedbackStatus(actionId,text) {
  if(actionId==='forage') {
    if(/You find nothing worth foraging here\./i.test(text)) return 'rejected';
    if(/You comb the ground but find nothing useful\./i.test(text)
        ||/You find .+ growing here and tuck it into your pack\./i.test(text)) return 'accepted';
  }
  if(actionId==='practice_stealth'&&/You melt into the shadows of the /i.test(text)) return 'accepted';
  if(actionId==='perform'&&/You perform .+ for a moment, filling the air with your voice\./i.test(text)) return 'accepted';
  if(actionId.startsWith('appraise_')) {
    if(/You cannot appraise that\./i.test(text)) return 'rejected';
    if(/You appraise .+\./i.test(text)) return 'accepted';
  }
  return null;
}

// Read-only interpretation of server text within one saved decision interval.
export function summarizeActionFeedback(actionId,events=[]) {
  const messages=events.filter(event=>event?.type==='text')
    .map(event=>stripAnsi(event.text)).filter(Boolean);
  const improvements=[];
  for(const message of messages) {
    for(const [display,skill] of Object.entries(IMPROVEMENT_SKILLS))
      if(new RegExp(`Your ${display.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} improved!`,'i').test(message))
        improvements.push(skill);
  }
  const rankUps=[...new Set(improvements)];
  const statuses=messages.map(message=>feedbackStatus(actionId,message)).filter(Boolean);
  const status=rankUps.length?'rank-improved':statuses.includes('rejected')?'rejected'
    :statuses.includes('accepted')?'accepted':'unknown';
  return {status,messages,reportedRankImprovements:rankUps};
}
