import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

export const REPRESENTATIVE_GUILDS = ['barbarian', 'warmage', 'trader'];
export const stripAnsi = (value) => String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '');
export function routeSteps(messages) {
  return messages.flatMap((message) => [...stripAnsi(message.msg).matchAll(/^\s*\d+\.\s+(n|s|e|w|ne|nw|se|sw|u|d)\s+→.*?\[([^\]]+)\]\s*$/gm)].map((match) => ({ direction: match[1], roomId: match[2] })));
}
const aliases = { north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw', up: 'u', down: 'd' };
export function exitAllows(room, direction) { return (room?.exits ?? []).some((exit) => (aliases[String(exit).toLowerCase()] ?? exit) === direction); }
export function promptState(message) {
  const text = stripAnsi(message?.msg);
  return { ...message?.journey, silver: Number(text.match(/\b(\d+) silvers\b/)?.[1]), rt: Number(text.match(/\bRT: (\d+)/)?.[1] ?? 0), requirements: message?.requirements };
}
export function requirementSnapshot(message) {
  assert.ok(message?.requirements && Array.isArray(message.requirements.rows), 'Requirement rows missing on wire');
  return structuredClone(message.requirements);
}
export function safeWireMessage(message) {
  if (message.t === 'authed') return { t: 'authed', token: '[REDACTED]' };
  const fields = ['t', 'msg', 'exits', 'roomId', 'contents', 'journey', 'requirements', 'buffs', 'hand', 'handSkill', 'worn', 'carried', 'slots', 'reason'];
  return Object.fromEntries(fields.filter(key => Object.hasOwn(message, key)).map(key => [key, message[key]]));
}
export function assertPaidRecovery(before, after, messages) {
  assert.ok(Number.isFinite(before.hp) && before.hp < before.maxHp, 'Observed injury required');
  assert.ok(after.hp > before.hp && after.hp === after.maxHp, 'Native healing must restore injured HP');
  assert.ok(Number.isFinite(before.silver) && Number.isFinite(after.silver) && after.silver < before.silver, 'Native healing must spend money');
  const paid = messages.map(message => stripAnsi(message.msg)).join('\n').match(/restored for (\d+) silvers/);
  assert.ok(paid, 'Native paid-healing receipt required');
  assert.equal(before.silver - after.silver, Number(paid[1]), 'Healing debit must match the native receipt');
}
export function sourceWsUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Source URL must be an HTTP/WS origin or /ws URL without credentials/query/fragment');
  if (!['/', '/ws'].includes(url.pathname)) throw new Error('Source URL path must be / or /ws');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:'; url.pathname = '/ws';
  return url.toString();
}

export class JourneyPeer {
  constructor(url, { deadline = Date.now() + 120000, onRecord = () => {} } = {}) {
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('Journey deadline expired before connection');
    this.deadline = deadline; this.messages = []; this.waiters = new Set(); this.onRecord = onRecord; this.lastSend = 0; this.rtUntil = 0;
    this.ws = new WebSocket(sourceWsUrl(url));
    this.ws.on('message', (bytes) => {
      try {
        const message = JSON.parse(bytes);
        if (!message || typeof message !== 'object' || typeof message.t !== 'string') throw new Error('Malformed wire frame');
        this.messages.push(message); this.onRecord(safeWireMessage(message));
        if (message.t === 'room') this.room = message;
        if (message.t === 'prompt') { this.prompt = message; this.rtUntil = Date.now() + promptState(message).rt * 1000; }
        for (const notify of this.waiters) notify();
      } catch (error) { this.failure = error; this.close(); for (const notify of this.waiters) notify(); }
    });
    this.ws.on('error', (error) => { this.failure = error; for (const notify of this.waiters) notify(); });
    this.ws.on('close', () => { this.closed = true; for (const notify of this.waiters) notify(); });
  }
  wait(predicate, start = 0, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const end = Math.min(this.deadline, Date.now() + timeout);
      const finish = (error, value) => { clearTimeout(timer); this.waiters.delete(check); error ? reject(error) : resolve(value); };
      const check = () => {
        const found = this.messages.slice(start).find(predicate);
        if (found) return finish(null, found);
        if (this.failure || this.closed) finish(this.failure ?? new Error('Wire closed before expected response'));
      };
      const timer = setTimeout(() => finish(new Error('Bounded wire response timed out')), Math.max(0, end - Date.now()));
      this.waiters.add(check); check();
    });
  }
  async send(message, expected) {
    if (Date.now() >= this.deadline) throw new Error('Journey deadline expired before send');
    if (this.failure) throw this.failure;
    const start = this.messages.length;
    this.ws.send(JSON.stringify(message));
    return expected ? this.wait(expected, start) : start;
  }
  async command(line, { expected } = {}) {
    if (/^(?:login|register|token)\b/i.test(line)) throw new Error('Authentication must use unlogged structured messages');
    const wait = Math.max(this.rtUntil - Date.now() + 100, this.lastSend + 160 - Date.now(), 0);
    if (Date.now() + wait >= this.deadline) throw new Error('Journey cap reached before next command');
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    this.onRecord({ t: 'command', line }); this.lastSend = Date.now();
    const start = this.messages.length;
    const movement = /^(?:n|s|e|w|ne|nw|se|sw|u|d|up|down)$/.test(line);
    await this.send({ t: 'input', line }, expected ?? (message => message.t === 'prompt' || (movement && message.t === 'room')));
    return this.messages.slice(start);
  }
  close() { this.ws.terminate(); }
}
const prose = (messages) => messages.map(message => stripAnsi(message.msg)).join('\n');
function contains(messages, pattern, description) { assert.match(prose(messages), pattern, description); }
async function navigate(peer, target, checks) {
  for (let round = 0; peer.room?.roomId !== target && round < 8; round++) {
    const steps = routeSteps(await peer.command(`route ${target} 20`));
    assert.ok(steps.length, `No authored walking route to ${target}`);
    for (const step of steps) {
      const before = peer.room;
      assert.ok(exitAllows(before, step.direction), `Route direction ${step.direction} absent from observed exits at ${before?.roomId}`);
      await peer.command(step.direction);
      assert.equal(peer.room?.roomId, step.roomId, 'Movement must reach the route step room');
      checks.moves++;
    }
  }
  assert.equal(peer.room?.roomId, target, `Destination ${target} not reached`);
}

export async function runWireJourney({ url, guild, deadline, onRecord = () => {} }) {
  assert.ok(REPRESENTATIVE_GUILDS.includes(guild));
  const suffix = [...randomBytes(10)].map(byte => String.fromCharCode(97 + byte % 26)).join('');
  const username = `journey${suffix}`, name = `Journey${suffix}`, password = randomBytes(18).toString('base64url');
  const checks = { moves: 0, assertions: 0 }; const peer = new JourneyPeer(url, { deadline, onRecord });
  const mark = (step) => { checks.assertions++; onRecord({ t: 'verified', step }); };
  try {
    await peer.wait(message => message.t === 'login_prompt');
    await peer.send({ t: 'register', u: username, p: password }, message => message.t === 'charcreate'); mark('normal-ws-registration');
    await peer.send({ t: 'charcreate', name, race: 'human', city: 'crossing' }, message => message.t === 'charalloc');
    await peer.send({ t: 'alloc', stat: 'str', amt: 5 }, message => message.t === 'charalloc');
    await peer.send({ t: 'enter' }, message => message.t === 'prompt');
    assert.equal(promptState(peer.prompt).guildId, null); assert.equal(promptState(peer.prompt).circle, 1); mark('guildless-chargen-entry');
    await navigate(peer, `hall_${guild}`, checks);
    await peer.command(`join ${guild}`); assert.equal(promptState(peer.prompt).guildId, guild); mark('observed-exits-and-hall-oath');
    const initialRequirements = requirementSnapshot(peer.prompt);
    const beforeTraining = promptState(peer.prompt).silver;
    const skill = { barbarian: 'expertise', warmage: 'attunement', trader: 'trading' }[guild];
    contains(await peer.command(`train ${skill}`), /drills you.*make progress/i, 'Guild lesson must be accepted');
    assert.ok(promptState(peer.prompt).silver < beforeTraining); mark('paid-normal-guild-training');
    await navigate(peer, 'bazaar', checks);
    contains(await peer.command('list'), /silvers.*stock/i, 'Authored shop listing required');
    contains(await peer.command('buy dagger'), /You buy .*dagger for 25 silvers/); mark('equipment-purchase');
    contains(await peer.command('wield dagger'), /wield|equip/i);
    assert.match(peer.messages.filter(message => message.t === 'hands').at(-1)?.hand ?? '', /dagger/i); mark('equipment-use');
    contains(await peer.command('buy padded_cloth'), /You buy padded cloth armor for 40 silvers/);
    contains(await peer.command('wear padded_cloth'), /wear|equip/i); mark('armor-use');
    if (guild === 'trader') {
      contains(await peer.command('appraise dagger'), /worth about 25 silvers/); mark('trader-appraisal');
      contains(await peer.command('chaffer'), /next sale will run 10% better/); mark('trader-chaffer');
      await navigate(peer, 'commodity_pit', checks);
      const beforeBuy = promptState(peer.prompt).silver;
      contains(await peer.command('buy grain 1'), /You buy 1 unit\(s\) of grain/);
      const afterBuy = promptState(peer.prompt).silver; assert.ok(afterBuy < beforeBuy);
      contains(await peer.command('sell grain 1'), /You sell 1 unit\(s\) of grain/);
      assert.ok(promptState(peer.prompt).silver > afterBuy); mark('noncombat-commodity-buy-and-sale');
    } else {
      await navigate(peer, 'sewers_3', checks);
      assert.ok(peer.room.contents?.creatures?.some(creature => /kobold/i.test(creature.name)), 'Authored kobold spawn must be visible');
      const attackStart = peer.messages.length;
      await peer.command('attack kobold');
      // Thirty seconds permits ordinary enemy attack attempts; RNG can still leave
      // recovery unverified. The whole-cohort deadline always takes precedence.
      await peer.wait(message => message.t === 'prompt' && (message.journey?.inCombat === false || (message.journey?.inCombat === true && message.journey.hp < message.journey.maxHp)), attackStart, 30000);
      assert.ok(promptState(peer.prompt).hp < promptState(peer.prompt).maxHp, 'Recovery unverified: ordinary encounter ended without observed injury');
      assert.equal(promptState(peer.prompt).inCombat, true);
      assert.ok(peer.messages.some(message => message.t === 'combat'), 'Actual combat frames required'); mark('normal-wire-combat');
      for (let attempt = 0; promptState(peer.prompt).inCombat && attempt < 8; attempt++) await peer.command('flee');
      assert.equal(promptState(peer.prompt).inCombat, false); mark('combat-disengagement');
      await navigate(peer, 'temple_row', checks);
      await peer.command('progress');
      const beforeHeal = promptState(peer.prompt);
      assert.ok(beforeHeal.hp < beforeHeal.maxHp, 'Ordinary combat injury must remain before paid recovery');
      const healingMessages = await peer.command('heal');
      const healed = promptState(peer.prompt);
      assertPaidRecovery(beforeHeal, healed, healingMessages); mark('paid-injury-recovery');
      contains(await peer.command('rest'), /settle.*rest/i); mark('ordinary-rest-command');
    }
    const scoreBefore = prose(await peer.command('score', { expected: message => message.t === 'msg' && /Attributes:/.test(message.msg) })); 
    const before = promptState(peer.prompt);
    const finalRequirements = requirementSnapshot(peer.prompt);
    const handsBefore = peer.messages.filter(message => message.t === 'hands').at(-1);
    contains(await peer.command('save'), /saved/i); mark('explicit-save');
    await peer.send({ t: 'logout' }, message => message.t === 'login_prompt' && message.reason === 'logout'); mark('normal-logout');
    await peer.send({ t: 'login', u: username, p: password }, message => message.t === 'charselect');
    const selection = peer.messages.filter(message => message.t === 'charselect').at(-1);
    const selected = prose([selection]).match(new RegExp(`(\\d+)\\) ${name}`)); assert.ok(selected, 'Saved character offered after relogin');
    await peer.send({ t: 'charselect', id: Number(selected[1]) }, message => message.t === 'prompt');
    const after = promptState(peer.prompt);
    assert.equal(after.characterId, before.characterId); assert.equal(after.guildId, guild); assert.equal(after.circle, before.circle); assert.equal(after.silver, before.silver);
    const freshHands = peer.messages.filter(message => message.t === 'hands').at(-1); assert.equal(freshHands?.hand, handsBefore?.hand);
    assert.deepEqual(freshHands?.slots, handsBefore?.slots); mark('durable-identity-guild-money-and-equipment');
    contains(await peer.command('score', { expected: message => message.t === 'msg' && /Attributes:/.test(message.msg) }), /Str\s+40/); assert.match(scoreBefore, /Str\s+40/); mark('durable-allocation');
    const reloginRequirements = requirementSnapshot(peer.prompt);
    await peer.send({ t: 'logout' }, message => message.t === 'login_prompt' && message.reason === 'logout');
    return { guild, race: 'human', ok: true, checks, circle: after.circle, initialRequirements, finalRequirements, reloginRequirements, limitations: ['Functional journey, not circle-2 completion or progression pacing.', 'Combat/recovery sampled by combat guilds; Trader leg remains noncombat.'] };
  } finally { peer.close(); }
}
