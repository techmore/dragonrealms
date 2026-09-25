"""Bounded, paced frozen-model play with live Sims telemetry; no optimizer.

Uses the isolated accelerated engine, NOT a logged-in production character.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

from .environment import DragonRealmsEnv, ROOT
from .guardrails import contract, load_parent
from .watch import watch_snapshot


def publish(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, allow_nan=False) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('parent')
    parser.add_argument('--seconds', type=int, default=600)
    parser.add_argument('--steps', type=int, default=2048)
    parser.add_argument('--seed', type=int, default=7740620)
    parser.add_argument('--pace', type=float, default=1.0)
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--run-id')
    parser.add_argument('--sampled', action='store_true', help='Seeded sampled policy diagnostic, not held-out validation')
    args = parser.parse_args()
    if not 1 <= args.seconds <= 1800 or not 1 <= args.steps <= 2048 or not 0.1 <= args.pace <= 5:
        parser.error('Caps: seconds 1..1800, steps 1..2048, pace 0.1..5 seconds')
    if not 0 <= args.seed <= 2147483647:
        parser.error('Seed must be in 0..2147483647')
    parent = load_parent(args.parent, contract())
    if parent.get('scenario') != 'barbarian':
        parser.error('This watch runner requires a Barbarian checkpoint')
    run_id = args.run_id or 'puffer-play-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    if not run_id.startswith('puffer-play-') or not run_id.replace('-', '').isalnum():
        parser.error('Invalid play run ID')
    output = ROOT / 'public/live/puffer' / run_id
    output.mkdir(parents=True, exist_ok=True)
    if args.launch:
        with (output / 'play.log').open('x') as log:
            process = subprocess.Popen([sys.executable, '-m', 'puffer_adapter.live_play', args.parent,
                '--run-id', run_id, '--seconds', str(args.seconds), '--steps', str(args.steps),
                '--seed', str(args.seed), '--pace', str(args.pace),
                *(['--sampled'] if args.sampled else [])], cwd=ROOT,
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        publish(output / 'process.json', dict(pid=process.pid, run_id=run_id))
        time.sleep(2)
        if process.poll() not in (None, 0) or not (output / 'manifest.json').exists():
            raise RuntimeError(f'Launch not verified; inspect {output / "play.log"}')
        print(json.dumps(dict(run_id=run_id, pid=process.pid, seconds_cap=args.seconds,
            results=str(output), dashboard='http://127.0.0.1:3000/sims.html#puffer-runs')))
        return
    training_lock = (ROOT / '.puffer-runtime/training.lock').open('a')
    fcntl.flock(training_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock = (ROOT / '.puffer-runtime/live-play.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    state = dict(schema='dragonrealms.puffer.run/1', run_id=run_id, parent_run=args.parent,
        run_kind='frozen_live_play', status='starting', evaluation_status='running',
        scenario='barbarian', guild='barbarian', target_circle=parent['target_circle'],
        started_at=time.time(), seconds_cap=args.seconds, step_cap=args.steps, updates=0,
        engine_contract=parent['engine_contract'], checkpoint_sha256=parent['checkpoint_sha256'],
        scope='Live isolated engine play; accelerated game time, scripted activity execution; not a server login',
        seed=args.seed, pace_seconds=args.pace, steps=0,
        policy_mode='trained_sampled' if args.sampled else 'trained_greedy',
        diagnostic_only=True)

    def save(info=None, activity=None):
        state['updated_at'] = time.time()
        if info is not None:
            state.update({k: info[k] for k in ('circle','requirements','requirement_gap','commands','simulated_seconds','death','milestones') if k in info})
            state['watch'] = watch_snapshot(info)
            state['current_activity'] = activity
        publish(output / 'manifest.json', state)
        publish(ROOT / 'public/live/puffer/live-play.json', state)
    save()
    env = None
    try:
        import torch
        from .runtime import load_pufferlib
        load_pufferlib()
        import pufferlib.models
        from .policy_selection import select_decision
        torch.set_num_threads(2)
        env = DragonRealmsEnv('barbarian', parent['target_circle'], parent.get('time_cost_per_hour', 0))
        env.single_action_space = env.action_space
        env.single_observation_space = env.observation_space
        policy = pufferlib.models.Default(env, hidden_size=64)
        policy.load_state_dict(torch.load(parent['checkpoint'], map_location='cpu', weights_only=True))
        policy.eval()
        def fingerprint():
            return hashlib.sha256(b''.join(p.detach().cpu().numpy().tobytes() for p in policy.state_dict().values())).hexdigest()
        before = fingerprint()
        state['environment'] = env.specification
        obs, _ = env.reset(seed=args.seed)
        action_rng = torch.Generator(device='cpu').manual_seed(args.seed)
        state['status'] = 'running'
        save(env.last_info)
        deadline = time.monotonic() + args.seconds
        with (output / 'observations.jsonl').open('x') as events:
            for step in range(args.steps):
                if stopped.is_set() or time.monotonic() >= deadline:
                    state['stop_reason'] = 'manual_stop' if stopped.is_set() else 'wall_time_cap'
                    break
                decision = select_decision(policy, obs, sampled=args.sampled, generator=action_rng)
                observation_before = obs.tolist()
                action = decision['action']
                obs, reward, terminated, truncated, _ = env.step(action)
                state['steps'] = step + 1
                name = env.specification['actions'][action]
                save(env.last_info, name)
                events.write(json.dumps(dict(timestamp=state['updated_at'], step=step+1,
                    action=name, decision=decision, observation_before=observation_before,
                    requirements_after=env.last_info.get('requirements'),
                    reward=reward, watch=state['watch'])) + '\n')
                events.flush()
                if terminated or truncated:
                    state['stop_reason'] = 'death' if env.last_info.get('death') else 'target_reached' if env.last_info.get('circle', 0) >= parent['target_circle'] else 'episode_end'
                    break
                stopped.wait(min(args.pace, max(0, deadline-time.monotonic())))
            else:
                state['stop_reason'] = 'step_cap'
        state['weights_unchanged'] = before == fingerprint()
        state['checkpoint_unchanged'] = hashlib.sha256(Path(parent['checkpoint']).read_bytes()).hexdigest() == parent['checkpoint_sha256']
        if not state['weights_unchanged'] or not state['checkpoint_unchanged']:
            raise RuntimeError('Frozen model integrity failure')
        state.update(status='completed', evaluation_status='completed', finished_at=time.time())
    except BaseException as error:
        state.update(status='failed', evaluation_status='failed', error=type(error).__name__, finished_at=time.time())
        raise
    finally:
        if env is not None:
            env.close()
        save()
        lock.close()
        training_lock.close()


if __name__ == '__main__':
    main()
