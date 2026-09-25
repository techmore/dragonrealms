// Bounded observations from the ordinary player stream; no engine state reads.
export class CombatEvidence {
  constructor() { this.reset(); }
  reset() { this.startedAt = null; this.samples = []; this.hits = []; this.assessment = null; }
  prompt(v, now = Date.now()) {
    if (!v.inCombat) { this.reset(); return; }
    this.startedAt ??= now;
    this.samples.push({at: now, hp: v.hp});
    this.samples = this.samples.filter(s => now - s.at <= 30000);
  }
  text(text, now = Date.now()) {
    if (this.startedAt === null) return;
    if (text.includes('You assess your combat situation')) this.assessment = {at: now, text};
    const damage = /for (\d+) damage[!.]/.exec(text);
    if (damage) this.hits.push({at: now, direction: /^You /.test(text) ? 'outgoing' : 'incoming', damage: Number(damage[1])});
    this.hits = this.hits.filter(h => now - h.at <= 30000);
  }
  snapshot(now = Date.now()) {
    const samples = this.samples.filter(s => now - s.at <= 30000);
    const first = samples[0], last = samples.at(-1);
    const hits = this.hits.filter(h => now - h.at <= 30000);
    return {
      fightAgeSeconds: this.startedAt === null ? null : Math.floor((now - this.startedAt) / 1000),
      observedSeconds: first && last ? (last.at - first.at) / 1000 : 0,
      hpLoss: first && last ? first.hp - last.hp : null,
      hpSamples: samples,
      parsedOutgoingDamage: hits.filter(h=>h.direction==='outgoing').reduce((n,h)=>n+h.damage,0),
      parsedIncomingDamage: hits.filter(h=>h.direction==='incoming').reduce((n,h)=>n+h.damage,0),
      caveat: 'Parsed damage totals cover recognized messages only. Zero does not prove no damage. Enemy HP is unknown.',
      assessment: this.assessment && now-this.assessment.at <= 15000 ? this.assessment.text : null,
    };
  }
}

// A falling HP bar is stronger evidence than an unrecognized damage-message
// total. Trigger an escape while there is still room to recover: waiting for
// 30% loss let a new Barbarian lose 52/145 HP in 17 seconds before the
// controller overrode the model. Short bursts and small scratches do not trip
// this guard; the window must show both sustained observation and material loss.
export function sustainedCombatLoss(evidence, maxHp) {
  const maximum = Number(maxHp);
  return Number.isFinite(maximum) && maximum > 0
    && Number(evidence?.observedSeconds) >= 8
    && Number(evidence?.hpLoss) >= maximum * 0.2;
}

export function uncertaintyRecovery(inCombat, streak) {
  if (!inCombat) return streak >= 3 ? {stop: true} : {command: 'look'};
  return streak >= 3 ? {command: 'flee', escape: true} : {command: 'assess'};
}
