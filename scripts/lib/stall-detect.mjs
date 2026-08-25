// Per-run stall classification for progression sweeps — shared by the sweep
// driver (live verdicts each heartbeat + end-of-run verdict row) so the
// numbers behind a verdict are identical in both places.
//
// Verdict ladder (worst evidence wins):
//   wedged  — hard-stop pathology: parked in one room with climbing move
//             refusals and zero kills (the catrox_forge signature), OR no
//             progress of any kind for WEDGE_SILENCE_MS, OR pinned under
//             25% HP for minutes without dying or escaping.
//   stalled — idle and killless despite a sustained refusal storm, or no
//             progress recently, or parked out of combat.
//   slow    — alive but killing far below the guild baseline.
//   healthy — none of the above.
//
// Pure module: no I/O, no timers. Callers snapshot agent state into a plain
// object (see SweepAgent.stallSnapshot) and get { verdict, reason } back.

// Rough healthy kill baselines (kills/hour at boost x20, c1-c3 arenas).
// Barbarian recalibrated 2026-08-25 from the clean post-clock-fix benchmark
// (run sohw: 12/12 healthy, 48-60/h across variants); other guilds scaled by
// the same ratio until their own benchmarks land — revisit per guild.
export const GUILD_KILLS_PER_HOUR = {
  barbarian: 50, bard: 40, cleric: 40, empath: 30, moonmage: 33,
  necromancer: 33, paladin: 42, ranger: 47, thief: 45, trader: 25,
  warmage: 45,
};
const DEFAULT_BASELINE = 40;

const GRACE_MS = 120000;        // enter/arm/settle window — never judge before this
const REFUSAL_WINDOW_MS = 120000; // refusal-rate window

const WEDGE_ROOM_MS = 240000;   // parked in one room this long...
const WEDGE_REFUSALS = 6;       // ...with this many refused moves in the window & no kills
const WEDGE_REFUSALS_SINCE_ROOM = 5; // or this many since arriving in the room (drip-feed wedge)
const WEDGE_SILENCE_MS = 360000;// zero progress of any kind this long
const WEDGE_LOWHP_MS = 180000;  // pinned under LOW_HP_FRAC this long

const STALL_SILENCE_MS = 180000;// no progress this long
const STALL_ROOM_MS = 180000;   // parked (out of combat) this long
const STALL_REFUSALS = 14;      // refusals inside the window = refusal storm

const SLOW_RATE_FRAC = 0.4;     // < 40% of guild baseline kills/hour
const SLOW_MIN_MS = 180000;     // ...once the run has lasted at least 3 min
const LOW_HP_FRAC = 0.25;

const fmtDur = (ms) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
};

export function classifyStall(st, now = Date.now()) {
  const elapsed = now - st.startedAt;
  if (elapsed < GRACE_MS) return { verdict: 'healthy', reason: 'warming up' };

  const recentRefusals = st.refusalTimes
    ? st.refusalTimes.filter((t) => now - t <= REFUSAL_WINDOW_MS).length : 0;
  const roomParkedMs = st.roomChangedAt ? now - st.roomChangedAt : 0;
  const silentMs = st.lastProgressAt ? now - st.lastProgressAt : 0;
  const lowHpMs = st.lowHpSince ? now - st.lowHpSince : 0;
  const ratePerHour = elapsed > 0 ? (st.kills / (elapsed / 3600000)) : 0;

  // ---- wedged ----
  // Fast storm: many refusals inside a short window while parked & killless.
  const refusalsSinceRoomChange = st.refusalTimes
    ? st.refusalTimes.filter((t) => t > (st.roomChangedAt || 0)).length : 0;
  if (st.room && roomParkedMs >= WEDGE_ROOM_MS
    && (recentRefusals >= WEDGE_REFUSALS || refusalsSinceRoomChange >= WEDGE_REFUSALS_SINCE_ROOM)
    && st.kills === 0) {
    return {
      verdict: 'wedged',
      reason: `parked in ${st.room} ${fmtDur(roomParkedMs)}, ${refusalsSinceRoomChange} refused moves since arrival, 0 kills`,
    };
  }
  if (silentMs >= WEDGE_SILENCE_MS) {
    return { verdict: 'wedged', reason: `no progress (kills/circles/trains/moves) for ${fmtDur(silentMs)} [room ${st.room || '?'}]` };
  }
  if (lowHpMs >= WEDGE_LOWHP_MS) {
    return { verdict: 'wedged', reason: `pinned under ${Math.round(LOW_HP_FRAC * 100)}% HP for ${fmtDur(lowHpMs)} [room ${st.room || '?'}]` };
  }

  // ---- stalled ----
  // A refusal storm only means "stalled" when the agent is idle and killless:
  // productive agents trip move refusals constantly (RT-gated steps, crowded
  // spawns) while still killing — that noise must not read as a stall.
  if (recentRefusals >= STALL_REFUSALS && st.kills === 0 && silentMs >= STALL_SILENCE_MS) {
    return { verdict: 'stalled', reason: `refusal storm: ${recentRefusals}/${REFUSAL_WINDOW_MS / 60000}m [room ${st.room || '?'}]` };
  }
  if (silentMs >= STALL_SILENCE_MS) {
    return { verdict: 'stalled', reason: `no progress for ${fmtDur(silentMs)} [room ${st.room || '?'}]` };
  }
  // Parked counts as stalled only when nothing has progressed either — an
  // agent resting between fights in the same arena room is working, not stuck.
  if (st.room && roomParkedMs >= STALL_ROOM_MS && !st.inCombat && silentMs >= STALL_SILENCE_MS) {
    return { verdict: 'stalled', reason: `parked in ${st.room} ${fmtDur(roomParkedMs)}, idle` };
  }

  // ---- slow ----
  const baseline = GUILD_KILLS_PER_HOUR[st.guild] || DEFAULT_BASELINE;
  if (elapsed >= SLOW_MIN_MS && ratePerHour < baseline * SLOW_RATE_FRAC) {
    return {
      verdict: 'slow',
      reason: `${Math.round(ratePerHour)}/h vs ~${baseline}/h baseline (${st.kills} kills in ${fmtDur(elapsed)})`,
    };
  }

  return { verdict: 'healthy', reason: `${st.kills} kills, ${Math.round(ratePerHour)}/h, moving` };
}

// Human one-liner used in report tables: "verdict — reason".
export function verdictLabel(verdict, reason, maxLen = 78) {
  const s = reason ? `${verdict} — ${reason}` : String(verdict || '-');
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}
