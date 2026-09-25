// Read-only parsing of ordinary client messages. No engine imports or I/O.
// Deliberately NOT compatible with the existing privileged 286-feature model.
export const WIRE_SCHEMA = 'dragonrealms.puffer.client-observation/1';
const clean = value => typeof value === 'string' ? value.replace(/\x1b\[[0-9;]*m/g, '') : '';
const integer = n => Number.isSafeInteger(n) && n >= 0;

// One observer per connection. Once stopped, construct a new observer only
// through an explicit runner re-arm; receiving another prompt cannot re-arm it.
export class WireObserver {
  constructor({ now = () => performance.now(), staleMs = 15000 } = {}) {
    if (!Number.isFinite(staleMs) || staleMs <= 0 || staleMs > 60000) throw new Error('Invalid freshness limit');
    this.now = now;
    this.staleMs = staleMs;
    this.observation = null;
    this.receivedAt = null;
    this.stopped = null;
  }
  stop(reason = 'manual_stop') {
    this.stopped ??= reason;
    this.observation = null;
  }
  accept(message) {
    this.snapshot(); // Expire old state before a late prompt can overwrite its timestamp.
    if (this.stopped) return this.snapshot();
    if (['login_prompt', 'charselect', 'charcreate', 'charalloc', 'error'].includes(message?.t)) {
      this.stop('session_not_playable');
    } else if (message?.t === 'prompt') {
      const parsed = parseWirePrompt(message);
      if (!parsed.valid) this.stop(parsed.reason);
      else {
        this.observation = parsed;
        this.receivedAt = this.now();
      }
    }
    return this.snapshot();
  }
  disconnect() { this.stop('disconnected'); }
  snapshot() {
    const age = this.receivedAt == null ? null : this.now() - this.receivedAt;
    if (age != null && (!Number.isFinite(age) || age < 0 || age > this.staleMs)) this.stop('stale_observation');
    return { ready: !this.stopped && this.observation != null,
      reason: this.stopped ?? (this.observation ? null : 'awaiting_prompt'),
      observation: this.observation ? structuredClone(this.observation) : null };
  }
}

export function parseWirePrompt(message) {
  const unknown = reason => ({ schema: WIRE_SCHEMA, valid: false, reason,
    vitals: null, requirements: null, exact_skill_exp: null });
  if (message?.t !== 'prompt') return unknown('not_prompt');
  const text = clean(message.msg);
  if (/\[BOOST\b/.test(text)) return unknown('boosted_session');
  const match = /^\s*HP: (\d+)\/(\d+)\s+(?:(Mana|Fire): (\d+)\/(\d+)\s+)?Stamina: (\d+)\/(\d+)(?:\s+RT: (\d+))?\s+Circle (\d+)\s+(\d+) silvers\b/.exec(text);
  if (!match) return unknown('unknown_prompt');
  const [, hp, maxHp, resource, current, maximum, stamina, maxStamina, rt, circle, silver] = match;
  const vitals = { hp: +hp, max_hp: +maxHp, stamina: +stamina, max_stamina: +maxStamina,
    resource: resource?.toLowerCase() ?? null, resource_value: current == null ? null : +current,
    resource_max: maximum == null ? null : +maximum, roundtime_seconds: +(rt ?? 0),
    circle: +circle, silver: +silver, in_combat: text.includes('[COMBAT]') };
  const bleeding=/\[bleeding: ([^\]]+)\]/.exec(text);
  vitals.bleeding=bleeding?bleeding[1].split('; ').map(s=>s.trim()):[];
  if ([hp, maxHp, stamina, maxStamina, rt ?? 0, circle, silver, current ?? 0, maximum ?? 0].some(n => !integer(+n))
      || +maxHp === 0 || +maxStamina === 0 || +hp > +maxHp || +stamina > +maxStamina || +circle < 1
      || (resource && (+maximum === 0 || +current > +maximum))) return unknown('invalid_vitals');
  if (+hp === 0) return unknown('dead');
  const req = message.requirements;
  if (!req || req.circle !== +circle + 1 || !Array.isArray(req.rows) || !req.rows.length
      || req.rows.some(r => !r || typeof r.label !== 'string' || !r.label.trim() || r.label.length > 100
        || !integer(r.have) || !integer(r.need) || r.need === 0)
      || new Set(req.rows.map(r => r.label)).size !== req.rows.length) return unknown('unknown_requirements');
  return { schema: WIRE_SCHEMA, valid: true, reason: null, vitals,
    requirements: { circle: req.circle, rows: req.rows.map(({ label, have, need }) => ({ label, have, need })) },
    exact_skill_exp: null };
}
