// Candidate wrapper policy for bounded, safe field-lane practice. It only
// returns an action already offered by the game; it never invents commands.
import { mappedActionSkills } from './jev-loop-audit.mjs';

function safeForPractice(state,hpFloor){
  const hp=Number(state?.hp),maxHp=Number(state?.maxHp);
  const rt=Number(state?.roundtime??state?.rt);
  const bleeding=Array.isArray(state?.bleeding)?state.bleeding.length>0
    :state?.bleeding===true||(Number(state?.bleeding)||0)>0;
  return state?.inCombat===false&&maxHp>0&&hp/maxHp>=hpFloor
    &&Number.isFinite(rt)&&rt<=0&&!bleeding&&!state?.quest&&!state?.overloaded;
}

function offeredFieldChoices(event){
  return (Array.isArray(event.options)?event.options:[]).flatMap((option,index)=>
    mappedActionSkills({id:String(option.id||''),state:event.state})
      .filter(skill=>(event.state.requirements?.rows||[]).some(row=>
        Number(row.have)<Number(row.need)&&/\b(?:survival|lore)$/i.test(String(row.label||''))
          &&(row.eligible||[]).includes(skill)))
      .map(skill=>({option,index,skill})));
}

export class SafeFieldPracticeCadence {
  constructor(options={}){
    const snapshot=options.snapshot||{};
    const every=options.every??snapshot.every??4;
    const hpFloor=options.hpFloor??snapshot.hpFloor??0.75;
    if(!Number.isInteger(every)||every<1||every>100)
      throw new Error('every must be an integer from 1 to 100');
    if(!Number.isFinite(hpFloor)||hpFloor<0.5||hpFloor>1)
      throw new Error('hpFloor must be between 0.5 and 1');
    this.every=every;this.hpFloor=hpFloor;
    this.safeMenusWithOpenLaneChoice=Number(snapshot.safeMenusWithOpenLaneChoice)||0;
    this.optionalAttackOpportunities=Number(snapshot.optionalAttackOpportunities)||0;
    this.releases=Number(snapshot.releases)||0;
    this.candidateUseBySkill={...(snapshot.candidateUseBySkill||{})};
    this.candidateUseByAction={...(snapshot.candidateUseByAction||{})};
  }

  consider(event={}){
    if(!event.state||!safeForPractice(event.state,this.hpFloor))return {released:false};
    const choices=offeredFieldChoices(event);
    if(!choices.length)return {released:false};
    this.safeMenusWithOpenLaneChoice++;
    if(!/^attack_\d+$/.test(String(event.id||'')))return {released:false,eligibleMenu:true};
    this.optionalAttackOpportunities++;
    if(this.optionalAttackOpportunities%this.every!==0)return {released:false,eligibleMenu:true};
    choices.sort((a,b)=>(this.candidateUseBySkill[a.skill]||0)-(this.candidateUseBySkill[b.skill]||0)
      ||(this.candidateUseByAction[a.option.id]||0)-(this.candidateUseByAction[b.option.id]||0)
      ||a.index-b.index||a.skill.localeCompare(b.skill));
    const choice=choices[0];this.releases++;
    this.candidateUseBySkill[choice.skill]=(this.candidateUseBySkill[choice.skill]||0)+1;
    this.candidateUseByAction[choice.option.id]=(this.candidateUseByAction[choice.option.id]||0)+1;
    return {released:true,eligibleMenu:true,option:choice.option,skill:choice.skill,
      baselineAction:event.id,opportunity:this.optionalAttackOpportunities,
      reason:'safe-field-practice-cadence'};
  }

  snapshot(){return {every:this.every,hpFloor:this.hpFloor,
    safeMenusWithOpenLaneChoice:this.safeMenusWithOpenLaneChoice,
    optionalAttackOpportunities:this.optionalAttackOpportunities,releases:this.releases,
    candidateUseBySkill:{...this.candidateUseBySkill},candidateUseByAction:{...this.candidateUseByAction}}}
}
