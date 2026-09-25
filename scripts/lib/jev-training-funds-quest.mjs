// Offline candidate rule only. A legal crier quest may fund a trainer lesson;
// replay this against saved menus before introducing it to the live wrapper.
export function prioritizeTrainingFundsQuest({options,selected,state,
  minimumSilver=40,minHpFraction=0.75}={}) {
  if (!Array.isArray(options)||!selected?.action||!state
      || !Number.isFinite(minimumSilver)||minimumSilver<0
      || !Number.isFinite(minHpFraction)||minHpFraction<0||minHpFraction>1)
    return null;
  const hpFraction=Number(state.hp)/Math.max(1,Number(state.maxHp));
  if (state.inCombat!==false || hpFraction<minHpFraction
      || (state.bleeding||[]).length || state.overloaded || state.quest
      || Number(state.silver||0)>=minimumSilver) return null;
  const quest=options.find(option=>option.id==='take_quest');
  if (!quest) return null;
  return {...selected,action:quest,probability:null,
    overrideReason:'accept-available-quest-to-fund-required-training',
    supervisorReleaseReason:'training-funds-quest-counterfactual'};
}
