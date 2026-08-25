// Agent boost: a per-connection speed-run multiplier for automated test
// characters. Enabled by the wire message {t:'boost', mult:N} (N clamped to
// 1..20, 0 disables) and announced in the player's prompt as [BOOST xN] so
// boosted runs are always visible on every status surface.
//
// Effects while active:
//   - skill experience gains multiplied by N (gainSkillExp)
//   - rest ticks restore N× health / mana / stamina (rest recovery)
// The multiplier lives on the player object (p.boostMult) and is applied in
// the shared game systems, so scripts, bots, and manual play all see it.
// It is applied EXACTLY ONCE, at gain time — pulse conversion (pulseExp)
// deliberately does not multiply again, keeping rank velocity linear in N.
//
// DR-fidelity note: this is a declared test-only divergence — real DR has no
// such mechanic. It exists so scripted agents can exercise progression
// (circle-ups, TDP curricula, guild halls) in minutes instead of hours.

const MAX_MULT = 100;

export function boostState(p) {
  const mult = Number(p?.boostMult) || 1;
  return mult > 1 ? mult : 1;
}

// Wire handler: attach to the session message switch.
export function handleBoostMessage(session, msg) {
  const p = session.player;
  if (session.state !== 'playing' || !p) {
    session.send({ t: 'error', msg: 'Boost applies only to a playing character.' });
    return;
  }
  let mult = Math.floor(Number(msg.mult));
  if (!Number.isFinite(mult) || mult <= 0) mult = 1;
  mult = Math.min(MAX_MULT, Math.max(1, mult));
  p.boostMult = mult;
  const tag = mult > 1
    ? `\x1b[35m[BOOST x${mult}]\x1b[0m`
    : '[boost off]';
  session.send({ t: 'msg', msg: `Agent boost ${mult > 1 ? `engaged: x${mult} experience and accelerated recovery.` : 'disengaged.'} ${tag}` });
}

// Prompt suffix so boosted characters are identifiable everywhere.
export function boostPromptTag(p) {
  const m = boostState(p);
  return m > 1 ? ` [BOOST x${m}]` : '';
}
