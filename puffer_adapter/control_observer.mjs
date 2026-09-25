// Observe only client frames for the experimental fixed-arena hall supervisor.
import { parseWirePrompt } from './wire_observation.mjs';
import { hallHandoff } from './hall_handoff.mjs';
import { trainListFromMissing } from '../scripts/lib/script-gen.mjs';
import { SKILLS } from '../data/skills.js';

export function controlObserver({now=()=>Date.now()}={}) {
  const entered=now();
  let lastHall=entered, kills=0, killsAtVisit=0, room=null, prompt=null,
    promptAt=null, tdp=null, helmWorn=null, training=[], stopped=false;
  return {
    feed(frame) {
      if (stopped) return;
      const text=typeof frame?.msg==='string'?frame.msg.replace(/\x1b\[[0-9;]*m/g,''):'';
      if (['login_prompt','charselect','disconnect'].includes(frame?.t)) {stopped=true;return;}
      if (frame?.t==='room' && typeof frame.roomId==='string') room=frame.roomId;
      if (frame?.t==='hands' && Array.isArray(frame.worn))
        helmWorn=frame.worn.some(name=>typeof name==='string'&&/iron helm/i.test(name));
      if (frame?.t==='prompt') {
        prompt=parseWirePrompt(frame); promptAt=now();
        if (!prompt.valid) {stopped=true;return;}
      }
      if (['msg','combat','notice'].includes(frame?.t)) {
        // Match the Sims supervisor's kill-text counter (not a combat simulator).
        if (/lies still|crumples|is gone|dies|slumps|lifeless|stops moving|collapses/.test(text)) kills++;
        const shown=/Training Points \(TDPs\): (\d+)/.exec(text);
        const balance=/costs? \d+ TDPs?; you have (\d+)/i.exec(text);
        const remain=/(\d+) TDPs remain/.exec(text);
        if (shown||balance||remain) tdp=Number((shown||balance||remain)[1]);
        if (/at least rank \d+/.test(text)) training=trainListFromMissing(text,'barbarian')
          .map(id=>id.replaceAll(' ','_')).filter(id=>Object.hasOwn(SKILLS,id));
      }
    },
    decision(hunting=true) {
      // Virtual engine timestamps are intentional here, unlike live sockets.
      if(stopped || !prompt?.valid || !room || promptAt===null || now()-promptAt>15000 || now()<promptAt)
        return {action:'hold',reason:'unknown_observation'};
      return hallHandoff({hunting,inCombat:prompt.vitals.in_combat,kills,killsAtVisit,
        elapsedSinceHallMs:now()-lastHall,elapsedSinceEntryMs:now()-entered,
        requirementsMet:prompt.requirements.rows.every(r=>r.have>=r.need),
        tdp,silver:prompt.vitals.silver,helmWorn});
    },
    acknowledge(decision) {
      if(decision.action==='hall') {lastHall=now();killsAtVisit=kills;}
      else if(decision.consumeKills) killsAtVisit=kills;
    },
    get snapshot() {return {room,circle:prompt?.valid?prompt.vitals.circle:null,
      kills,killsAtVisit,tdp,helmWorn,training:[...training],stopped};},
  };
}
