// JSONL subprocess for CPU RL. No game server, network session, or live DB.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { format } from 'node:util';

export const ACTIONS = Object.freeze(['look', 'forage', 'track', 'hunt', 'perform']);
export const SKILL_IDS = Object.freeze(['foraging', 'tracking', 'scouting', 'perception', 'performance']);
export const HORIZON = 128;
export const OBSERVATION_FIELDS = Object.freeze([
  'episode_fraction', 'health_fraction', 'stamina_fraction', 'circle_div_100',
  ...SKILL_IDS.flatMap(id => [`${id}_rank_div_100`, `${id}_rank_progress`, `${id}_pool_fraction`]),
]);
export const SPEC = Object.freeze({
  actions: ACTIONS, observation_size: OBSERVATION_FIELDS.length,
  observation_fields: OBSERVATION_FIELDS, horizon: HORIZON,
  baseline_actions: [1, 2, 3, 4],
  baseline_policy: 'Repeat forage, track, hunt, perform cyclically; fixed reference curriculum, not an optimized policy.',
  scenario_name: 'pine_needle_ranger_skilling_v1',
  scenario: 'human ranger, Pine Needle Path; stationary noncombat skilling',
  clock_semantics: {
    initial_epoch_ms: 1700000000000, seconds_per_step: 200,
    pulse_phases_per_step: 10, seconds_per_phase: 20,
    order: 'Command at current virtual time, then advance 20 seconds and call pulseExp for each phase 0 through 9.',
    world_timers: false, roundtime_validation: true,
  },
  mode: 'accelerated_engine', reward_scale: 10,
  reward_definition: '(total absorbed skill EXP after step - before step) / 10; ranks converted back to EXP using expToNextRank',
  seed_supported: true,
  seed_scope: 'uint32 seeded Math.random and fixed Date.now, repeatable for this scenario on the same engine revision; not a general engine determinism guarantee',
  limits: ['One command per step, followed by ten real pulseExp phases (one 200-second EXP cycle).',
    'Game.init then Game.stop disables all world timers; no combat, respawn, weather, regeneration or wall-clock pacing simulation.',
    'Roundtime validation enabled; virtual time advances 200 seconds per step. No EXP boost.',
    'Circle progression is not an episode objective; horizon truncation is not success.',
    'Rewards can follow earlier actions while their real EXP pools drain.'],
});

export async function run() {
  // This assignment MUST precede every server import, even if the parent
  // supplied DR_DB_PATH. Rollbacks below touch only this owned temporary DB.
  const directory = mkdtempSync(join(tmpdir(), 'dr-puffer-'));
  process.env.DR_DB_PATH = join(directory, 'engine.db');
  process.env.DR_SPAWN_MULT = '1';
  const originalRandom = Math.random, originalNow = Date.now, originalLog = console.log;
  console.log = (...args) => process.stderr.write(format(...args) + '\n');
  let game, player, closeDb, db, transaction = false, steps = 0, ended = true;
  let seed = 42, randomState = 42, now = 1700000000000;
  const cleanup = () => {
    game?.stop();
    if (transaction) { db.exec('ROLLBACK'); transaction = false; }
    closeDb?.(); closeDb = undefined;
    rmSync(directory, { recursive: true, force: true });
    Math.random = originalRandom; Date.now = originalNow; console.log = originalLog;
  };
  const signal = () => { cleanup(); process.exit(0); };
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  try {
    ({ db, closeDb } = await import('../server/db.js'));
    const { migrate } = await import('../server/db.js');
    const { registerAccount } = await import('../server/auth.js');
    const { Game } = await import('../server/game.js');
    const { createCharacter, loadPlayer, pulseExp, poolCap } = await import('../server/player.js');
    const { handleCommand } = await import('../server/commands/index.js');
    const { expToNextRank } = await import('../data/skills.js');
    migrate();
    const account = await registerAccount('PufferEngine', 'isolated-engine-account');
    if (!account.accountId) throw new Error('Cannot create isolated engine account');
    const rankTotals = [0];
    function absorbedSkill(skill) {
      while (rankTotals.length <= skill.rank) {
        const rank = rankTotals.length - 1;
        rankTotals.push(rankTotals[rank] + expToNextRank(rank));
      }
      return rankTotals[skill.rank] + skill.exp;
    }
    const absorbed = () => Object.values(player.skills).reduce((sum, skill) => sum + absorbedSkill(skill), 0);
    const pooled = () => Object.values(player.expPools || {}).reduce((sum, exp) => sum + exp, 0);
    function snapshot(reward = 0, command = null) {
      const skills = Object.fromEntries(SKILL_IDS.map(id => [id, {
        rank: player.skills[id].rank, exp: player.skills[id].exp,
        pooled: player.expPools?.[id] || 0, absorbed: absorbedSkill(player.skills[id]),
      }]));
      const observation = [steps / HORIZON, player.hp / player.maxHp,
        player.stamina / player.maxStamina, player.circle / 100,
        ...SKILL_IDS.flatMap(id => [skills[id].rank / 100,
          skills[id].exp / expToNextRank(skills[id].rank), skills[id].pooled / poolCap(player, id)])];
      const terminated = player.hp <= 0;
      return { observation, reward, terminated, truncated: steps >= HORIZON && !terminated,
        info: { experience_absorbed: absorbed(), experience_pooled: pooled(),
          circle: player.circle, hp: player.hp, max_hp: player.maxHp, room: player.room,
          step: steps, command, skills, seed, seed_supported: true,
          mode: SPEC.mode, simulated_exp_seconds: steps * 200,
          episode_end: terminated ? 'death' : steps >= HORIZON ? 'horizon' : null,
          database_isolated: true } };
    }
    function reset(request) {
      const nextSeed = request.seed ?? 42;
      if (!Number.isInteger(nextSeed) || nextSeed < 0 || nextSeed > 0xffffffff) throw new Error('seed must be a uint32 integer');
      game?.stop();
      if (transaction) db.exec('ROLLBACK');
      db.exec('BEGIN'); transaction = true;
      seed = nextSeed; randomState = seed; now = 1700000000000;
      Math.random = () => {
        randomState = (randomState + 0x6d2b79f5) >>> 0;
        let t = randomState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      Date.now = () => now;
      game = new Game(); game.init(); game.stop();
      player = loadPlayer(createCharacter(account.accountId, { name: 'Puffer', race: 'human', guild: 'ranger' }));
      game.addPlayer(player);
      if (player.room !== 'pine_needle_path' || game.creaturesIn(player.room).length) throw new Error('Scenario starting room is no longer safe');
      steps = 0; ended = false;
      return snapshot();
    }
    function step(request) {
      if (!player || ended) throw new Error('reset required before stepping');
      if (!Number.isInteger(request.action) || request.action < 0 || request.action >= ACTIONS.length) throw new Error('action must be an integer in [0, 4]');
      const before = absorbed();
      handleCommand(game, player, ACTIONS[request.action], 0, { applyRT: true });
      for (let phase = 0; phase < 10; phase++) { now += 20000; pulseExp(player, phase); }
      steps++;
      // Skills are the real in-memory player state. Do not call savePlayer:
      // its own transaction would nest inside our episode rollback boundary.
      const result = snapshot((absorbed() - before) / SPEC.reward_scale, ACTIONS[request.action]);
      ended = result.terminated || result.truncated;
      return result;
    }
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    const reply = value => process.stdout.write(JSON.stringify(value) + '\n');
    for await (const line of input) {
      try {
        if (line.length > 16384) throw new Error('request exceeds 16384 characters');
        const request = JSON.parse(line);
        if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('request must be an object');
        if (Object.hasOwn(request, 'command')) throw new Error('arbitrary commands are not supported');
        if (request.op === 'spec') reply(SPEC);
        else if (request.op === 'reset') reply(reset(request));
        else if (request.op === 'step') reply(step(request));
        else if (request.op === 'close') { reply({ ok: true, closed: true }); break; }
        else throw new Error('unknown operation');
      } catch (error) { reply({ error: error.message }); }
    }
    input.close();
  } finally {
    process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal);
    cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => { console.error(error); process.exitCode = 1; });
}
