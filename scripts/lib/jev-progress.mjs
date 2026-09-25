// Read-only progression telemetry for the independent Jev player harness.
// It observes ordinary player-visible skill and circle-gate snapshots only.
const MINDSTATES = [
  'clear', 'dabbling', 'perusing', 'learning', 'thoughtful', 'thinking',
  'considering', 'pondering', 'ruminating', 'concentrating', 'attentive',
  'deliberative', 'interested', 'examining', 'understanding', 'absorbing',
  'intrigued', 'scrutinizing', 'analyzing', 'studious', 'focused',
  'very focused', 'engaged', 'very engaged', 'cogitating', 'fascinated',
  'captivated', 'engrossed', 'riveted', 'very riveted', 'rapt', 'very rapt',
  'enthralled', 'nearly locked', 'mind lock',
];

const requirementTotals = requirements => {
  const rows = requirements?.rows || [];
  return {
    rows,
    rankPoints: rows.reduce((sum, row) => sum + Math.min(Number(row.have) || 0, Number(row.need) || 0), 0),
    requiredRankPoints: rows.reduce((sum, row) => sum + (Number(row.need) || 0), 0),
    closedRows: rows.filter(row => Number(row.have) >= Number(row.need)).length,
    unmetRows: rows.filter(row => Number(row.have) < Number(row.need)).length,
  };
};

export class JevProgressObserver {
  constructor({ startedAt = Date.now() } = {}) {
    this.startedAt = startedAt;
    this.initial = null;
    this.lastProgressAt = startedAt;
    this.lastGateProgressAt = startedAt;
    this.lastLearningProgressAt = startedAt;
    this.highestRankPoints = 0;
    this.highestClosedRows = 0;
    this.skillHighWater = new Map();
    this.mindstateAdvances = 0;
    this.samples = 0;
  }

  observe(vitals = {}, now = Date.now()) {
    const gate = requirementTotals(vitals.requirements);
    const learning = (vitals.skillLearning || []).map(row => ({
      name: String(row.name || ''), rank: Number(row.rank) || 0,
      mindstate: String(row.mindstate || 'clear'),
    }));
    if (!this.initial) {
      this.initial = { rankPoints:gate.rankPoints, closedRows:gate.closedRows, circle:Number(vitals.circle) || 1,
        skillRanks:Object.fromEntries(learning.map(row => [row.name, row.rank])) };
      this.currentCircle = this.initial.circle;
      this.highestRankPoints = gate.rankPoints;
      this.highestClosedRows = gate.closedRows;
    }

    let learningImproved = false;
    for (const row of learning) {
      const key = row.name.toLowerCase().replace(/\s+/g, '_');
      const stage = MINDSTATES.indexOf(row.mindstate.toLowerCase());
      const previous = this.skillHighWater.get(key) || { rank:0, stage:-1 };
      const rankAdvanced = row.rank > previous.rank;
      if (rankAdvanced) learningImproved = true;
      if (!rankAdvanced && previous.stage >= 0 && stage > previous.stage) {
        learningImproved = true;
        this.mindstateAdvances += Math.max(1, stage - Math.max(0, previous.stage));
      }
      this.skillHighWater.set(key, { rank:Math.max(previous.rank, row.rank),
        stage:rankAdvanced ? stage : Math.max(previous.stage, stage) });
    }
    const circle = Number(vitals.circle) || 1;
    const gateImproved = gate.rankPoints > this.highestRankPoints
      || gate.closedRows > this.highestClosedRows
      || circle > this.currentCircle;
    if (gateImproved) this.lastGateProgressAt = now;
    if (learningImproved) this.lastLearningProgressAt = now;
    const improved = gateImproved || learningImproved;
    this.highestRankPoints = Math.max(this.highestRankPoints, gate.rankPoints);
    this.highestClosedRows = Math.max(this.highestClosedRows, gate.closedRows);
    this.circleHighWater = Math.max(this.circleHighWater || circle, circle);
    this.currentCircle = circle;
    if (improved) this.lastProgressAt = now;
    this.samples++;

    const circleGains = circle - this.initial.circle;
    const activityState = gate.rankPoints > this.initial.rankPoints
      || gate.closedRows > this.initial.closedRows || circleGains > 0
      ? 'gate-progress-observed'
      : (this.mindstateAdvances > 0 || learning.some(row => row.rank > (this.initial.skillRanks?.[row.name] || 0)))
        ? 'learning-only-no-gate-rank' : 'no-observed-progress';
    const secondsSince = at => Math.max(0, Math.floor((now - at) / 1000));
    return {
      samples:this.samples,
      currentCircle:circle,
      targetCircle:circle + 1,
      rankPoints:gate.rankPoints,
      requiredRankPoints:gate.requiredRankPoints,
      rankPointsGained:gate.rankPoints - this.initial.rankPoints,
      bestRankPointsGained:this.highestRankPoints - this.initial.rankPoints,
      closedRows:gate.closedRows,
      rowsClosedSinceStart:gate.closedRows - this.initial.closedRows,
      unmetRows:gate.unmetRows,
      circleGains,
      activityState,
      skillLearning:learning,
      mindstateAdvances:this.mindstateAdvances,
      lastProgressAt:new Date(this.lastProgressAt).toISOString(),
      secondsSinceProgress:secondsSince(this.lastProgressAt),
      lastGateProgressAt:new Date(this.lastGateProgressAt).toISOString(),
      secondsSinceGateProgress:secondsSince(this.lastGateProgressAt),
      lastLearningProgressAt:new Date(this.lastLearningProgressAt).toISOString(),
      secondsSinceLearningProgress:secondsSince(this.lastLearningProgressAt),
      elapsedSeconds:Math.max(0, Math.floor((now - this.startedAt) / 1000)),
    };
  }
}
