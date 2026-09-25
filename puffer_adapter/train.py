"""Actual PuffeRL CPU updates; local-only metrics and checkpoints."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import signal
import time
import fcntl
import sys

import numpy as np
import torch
from .runtime import load_pufferlib
load_pufferlib()
import pufferlib.emulation
import pufferlib.models
import pufferlib.pufferl
import pufferlib.vector

from .environment import DragonRealmsEnv, ROOT
from .guardrails import contract, load_parent
from .watch import watch_snapshot
from .budget import evaluation_deadline
from .terminal_display import native_dashboard

VERSION = "3.0.0 @ 3b5c6046bb8b46685d62d151720025507e3418c2"
ENVIRONMENTS = []


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (np.integer, np.floating)):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(clean(data), indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def fingerprint(policy):
    digest = hashlib.sha256()
    for tensor in policy.state_dict().values():
        digest.update(tensor.detach().cpu().numpy().tobytes())
    return digest.hexdigest()


def make_env(buf=None, seed=42, scenario='skilling', target_circle=2, time_cost_per_hour=0):
    env = DragonRealmsEnv(scenario, target_circle, time_cost_per_hour)
    ENVIRONMENTS.append(env)  # Serial also constructs a disposable space-probe env.
    return pufferlib.emulation.GymnasiumPufferEnv(env=env, buf=buf, seed=seed)


class LocalLogger:
    def __init__(self, run_id):
        self.run_id = run_id
    def log(self, logs, step):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=16384)
    parser.add_argument("--seconds", type=int, default=300)
    parser.add_argument("--evaluation-seconds", type=int, default=3600)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--no-publish-latest", action="store_true", help="Keep test runs off the default monitor")
    parser.add_argument("--resume", help="Warm-start policy weights from a compatible completed run")
    parser.add_argument("--auto-evaluate", action="store_true")
    parser.add_argument('--terminal-dashboard', choices=['auto','native','quiet'], default='auto',
                        help='Native Puffer dashboard on an interactive terminal; quiet for detached logs')
    parser.add_argument('--demonstration-episodes', type=int, default=0)
    parser.add_argument('--demonstration-teacher', choices=['rotation','requirements'], default='rotation')
    parser.add_argument('--imitation-epochs', type=int, default=30)
    parser.add_argument('--imitation-balanced', action='store_true')
    parser.add_argument('--demonstration-rollin-steps', type=int, default=0,
                        help='Add successful teacher recovery suffixes after frozen sampled roll-ins')
    parser.add_argument('--script-comparison',action='store_true')
    parser.add_argument('--target-circle', type=int, default=2)
    parser.add_argument('--time-cost-per-hour', type=float, default=0)
    parser.add_argument('--scenario', choices=['skilling','circling','barbarian'], default='barbarian')
    args = parser.parse_args()
    if (not 0 <= args.demonstration_rollin_steps <= 256 or (args.demonstration_rollin_steps and
            (not args.resume or not args.demonstration_episodes or args.demonstration_teacher != 'requirements'))):
        parser.error('demonstration-rollin-steps requires 0..256, resume, demonstrations and requirements teacher')
    if args.script_comparison and args.scenario!='barbarian':
        parser.error('script-comparison requires barbarian')
    if not 1 <= args.imitation_epochs <= 100:
        parser.error('imitation-epochs must be 1..100')
    if not 2 <= args.target_circle <= 20 or not math.isfinite(args.time_cost_per_hour) or not 0 <= args.time_cost_per_hour <= 1:
        parser.error('target-circle must be 2..20; time-cost-per-hour must be 0..1')
    if args.scenario != 'barbarian' and (args.target_circle != 2 or args.time_cost_per_hour):
        parser.error('Higher curriculum is Barbarian only')
    if not 0 <= args.demonstration_episodes <= 20 or (args.demonstration_episodes and args.scenario != 'barbarian'):
        parser.error('demonstration-episodes must be 0..20 and requires barbarian')
    if args.steps < 128 or args.steps % 128 or not 1 <= args.seconds <= 3600:
        parser.error("steps must be a positive multiple of 128; seconds must be 1..3600")
    try:
        evaluation_deadline(args.evaluation_seconds, 0)
    except ValueError as error:
        parser.error(str(error))
    if not args.run_id.replace("-", "").isalnum():
        parser.error("run-id must be alphanumeric with optional hyphens")
    output = ROOT / "public/live/puffer" / args.run_id
    output.mkdir(parents=True, exist_ok=True)
    engine_contract = contract()
    parent = load_parent(args.resume, engine_contract) if args.resume else None
    private = ROOT / ".puffer-runtime" / args.run_id
    private.mkdir(parents=True, exist_ok=True)
    run_lock = None
    if not args.no_publish_latest:
        run_lock = (ROOT / '.puffer-runtime/training.lock').open('a')
        try:
            fcntl.flock(run_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another monitored candidate is active; concurrent launch rejected')
    torch.set_num_threads(2)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    state = dict(schema="dragonrealms.puffer.run/1", run_id=args.run_id,
                 status="starting", trainer="PuffeRL (PufferLib)", version=VERSION,
                 device="cpu", started_at=time.time(), steps=0, updates=0,
                 episodes=0, history=[], checkpoint=None, baseline=None,
                 step_cap=args.steps, seconds_cap=args.seconds, seed=args.seed,
                 evaluation_seconds_cap=args.evaluation_seconds,
                 demonstration_episodes=args.demonstration_episodes,
                 demonstration_teacher=args.demonstration_teacher,
                 demonstration_rollin_steps=args.demonstration_rollin_steps,
                 imitation_epochs=args.imitation_epochs, imitation_balanced=args.imitation_balanced,
                 script_comparison=args.script_comparison,
                 target_circle=args.target_circle, time_cost_per_hour=args.time_cost_per_hour,
                 mode="isolated real-engine training; not live-server play")
    state.update(engine_contract=engine_contract, parent_run=args.resume,
                 scenario=args.scenario, max_circle=1, circle_milestones=[],
                 guild='barbarian' if args.scenario == 'barbarian' else 'ranger',
                 continuation='policy weights; fresh optimizer and learning-rate schedule' if parent else 'fresh policy',
                 evaluation_status='pending' if args.auto_evaluate else 'not_requested',
                 promotion={'eligible': False, 'reasons': ['Not evaluated']})
    def publish():
        state["updated_at"] = time.time()
        atomic_json(output / "manifest.json", state)
        if not args.no_publish_latest:
            atomic_json(ROOT / "public/live/puffer/latest.json", state)
    publish()
    if not args.no_publish_latest:
        from .records import publish_records
        publish_records()
    stop = False
    def request_stop(signum, frame):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    vec = trainer = None
    try:
        if parent and parent.get('scenario','skilling') != args.scenario:
            raise ValueError('Parent scenario mismatch')
        if parent and (parent.get('target_circle', 2) != args.target_circle or parent.get('time_cost_per_hour', 0) != args.time_cost_per_hour):
            raise ValueError('Parent curriculum/reward parameters mismatch; use a fresh candidate')
        vec = pufferlib.vector.make(make_env, env_kwargs={'scenario':args.scenario,
            'target_circle':args.target_circle,'time_cost_per_hour':args.time_cost_per_hour}, backend=pufferlib.vector.Serial, num_envs=1)
        policy = pufferlib.models.Default(vec, hidden_size=64)
        if parent:
            policy.load_state_dict(torch.load(parent['checkpoint'], map_location='cpu', weights_only=True))
        before = fingerprint(policy)
        state["initial_weights_sha256"] = before
        deadline = time.monotonic() + args.seconds
        if args.demonstration_episodes:
            from .imitation import collect_demonstrations, behavior_clone, TEACHER
            from .teacher import TEACHER_VERSION
            state['status'] = 'running'
            state['training_phase'] = 'collecting_demonstrations'
            state['imitation'] = dict(teacher=TEACHER_VERSION if args.demonstration_teacher == 'requirements' else TEACHER,
                episodes=[], weights_before=before,
                source_sha256=hashlib.sha256((ROOT / 'puffer_adapter/imitation.py').read_bytes()).hexdigest(),
                teacher_source_sha256=hashlib.sha256((ROOT / 'puffer_adapter/teacher.py').read_bytes()).hexdigest())
            publish()
            demo_env = DragonRealmsEnv(args.scenario, args.target_circle, args.time_cost_per_hour)
            try:
                def demo_progress(receipt):
                    state['imitation']['episodes'].append(receipt)
                    state['watch'] = watch_snapshot(demo_env.last_info)
                    publish()
                observations, actions, receipts = collect_demonstrations(demo_env,
                    range(args.demonstration_episodes), cancelled=lambda: stop or time.monotonic() >= deadline,
                    on_episode=demo_progress, teacher=args.demonstration_teacher)
                if args.demonstration_rollin_steps:
                    # Retain canonical successful demonstrations to reduce forgetting.
                    # Recovery seeds are separate training seeds, never evaluation seeds.
                    policy.eval()
                    recovery_obs, recovery_actions, _ = collect_demonstrations(demo_env,
                        range(100, 100 + args.demonstration_episodes),
                        cancelled=lambda: stop or time.monotonic() >= deadline,
                        on_episode=demo_progress, teacher='requirements',
                        rollin_policy=policy, rollin_steps=args.demonstration_rollin_steps)
                    if fingerprint(policy) != before:
                        raise RuntimeError('Frozen roll-in policy changed during collection')
                    state['imitation']['canonical_examples'] = len(actions)
                    state['imitation']['recovery_examples'] = len(recovery_actions)
                    state['imitation']['rollin_weights_unchanged'] = True
                    observations = np.concatenate((observations, recovery_obs))
                    actions = np.concatenate((actions, recovery_actions))
            finally:
                demo_env.close()
            dataset = private / 'demonstrations.npz'
            np.savez_compressed(dataset, observations=observations, actions=actions)
            state['imitation']['dataset_sha256'] = hashlib.sha256(dataset.read_bytes()).hexdigest()
            state['training_phase'] = 'behavior_cloning'
            publish()
            state['imitation'].update(behavior_clone(policy, observations, actions, seed=args.seed,
                epochs=args.imitation_epochs, balanced=args.imitation_balanced,
                cancelled=lambda: stop or time.monotonic() >= deadline))
            state['imitation']['weights_after'] = fingerprint(policy)
            state['imitation']['weights_changed'] = before != fingerprint(policy)
            imitation_checkpoint = private / 'imitation.pt'
            torch.save(policy.state_dict(), imitation_checkpoint)
            state['imitation']['checkpoint'] = str(imitation_checkpoint)
            state['imitation']['checkpoint_sha256'] = hashlib.sha256(imitation_checkpoint.read_bytes()).hexdigest()
            state['training_phase'] = 'reinforcement_learning'
            publish()
        config = dict(env="dragonrealms", seed=args.seed, torch_deterministic=True,
            batch_size=128, bptt_horizon=16, device="cpu", cpu_offload=False,
            use_rnn=False, minibatch_size=64, max_minibatch_size=64, update_epochs=4,
            compile=False, optimizer="adam", learning_rate=0.0003,
            adam_beta1=0.9, adam_beta2=0.999, adam_eps=1e-8,
            total_timesteps=args.steps, min_lr_ratio=0.0, precision="float32", amp=False,
            gamma=0.99, gae_lambda=0.95, clip_coef=0.2, vf_coef=0.5,
            vf_clip_coef=0.2, max_grad_norm=0.5, ent_coef=0.01,
            anneal_lr=True, vtrace_rho_clip=1.0, vtrace_c_clip=1.0,
            prio_alpha=0.0, prio_beta0=0.0, checkpoint_interval=10,
            data_dir=str(private))
        # Keep the native terminal UI alongside our saved web telemetry.
        show_native = native_dashboard(args.terminal_dashboard, sys.stdout.isatty())
        class QuietPuffeRL(pufferlib.pufferl.PuffeRL):
            def print_dashboard(self, *args, **kwargs):
                if show_native:
                    return super().print_dashboard(*args, **kwargs)
        trainer = QuietPuffeRL(config, vec, policy, LocalLogger(args.run_id))
        state['terminal_dashboard'] = 'native' if show_native else 'quiet'
        state["configuration"] = config
        state["environment"] = vec.envs[0].env.specification
        state["status"] = "running"
        publish()
        while trainer.global_step < args.steps and time.monotonic() < deadline and not stop:
            trainer.evaluate()
            trainer.last_log_time = 0  # Collect loss metrics even for sub-250ms updates.
            trainer.train()
            env = vec.envs[0].env
            state.update(steps=trainer.global_step, updates=trainer.epoch,
                episodes=env.episodes, reward=env.total_reward,
                loss=trainer.losses.get("policy_loss"), entropy=trainer.losses.get("entropy"),
                sps=trainer.global_step / max(0.001, time.time()-state["started_at"]),
                experience_absorbed=env.last_info.get("experience_absorbed"),
                experience_pooled=env.last_info.get("experience_pooled"),
                circle=env.last_info.get("circle"),
                current_weights_sha256=fingerprint(policy))
            state["weights_changed"] = before != state["current_weights_sha256"]
            state['max_circle'] = env.max_circle
            state['circle_milestones'] = env.circle_milestones
            state['requirements'] = env.last_info.get('requirements')
            state['requirement_gap'] = env.last_info.get('requirement_gap')
            state['watch'] = watch_snapshot(env.last_info)
            row = {k: state[k] for k in ("steps", "updates", "reward", "loss", "experience_absorbed", "circle")}
            row["timestamp"] = time.time()
            state["history"] = (state["history"] + [row])[-200:]
            with (output / "metrics.jsonl").open("a") as stream:
                stream.write(json.dumps(clean(row), allow_nan=False) + "\n")
            publish()
            if not show_native:
                print(json.dumps(clean(row)), flush=True)
        state["checkpoint"] = trainer.close()
        state['checkpoint_sha256'] = hashlib.sha256(Path(state['checkpoint']).read_bytes()).hexdigest()
        trainer = vec = None
        state["status"] = "stopped" if stop else "completed"
        state["stop_reason"] = "manual" if stop else ("step_cap" if state["steps"] >= args.steps else "time_cap")
        if args.auto_evaluate and not stop:
            if contract() != engine_contract:
                raise RuntimeError('Engine changed during training; evaluation blocked')
            state['evaluation_status'] = 'running'
            state['evaluation_started_at'] = time.time()
            eval_deadline = evaluation_deadline(args.evaluation_seconds, time.monotonic())
            publish()
            from .evaluate import evaluate_run
            def evaluation_progress(receipt):
                state['evaluation_progress'] = receipt
                publish()
            try:
                result = evaluate_run(args.run_id, 5, parent_run=args.resume,
                    cancelled=lambda: stop or time.monotonic() >= eval_deadline,
                    on_progress=evaluation_progress,script_comparison=args.script_comparison)
                state['baseline'] = result['summary']
                state['promotion'] = result['promotion']
                state['evaluation_status'] = 'completed'
                state['evaluation_scope'] = result['scope']
            except InterruptedError:
                state['evaluation_status'] = 'interrupted'
                state['promotion'] = {'eligible': False, 'reasons': ['Evaluation interrupted by stop or time cap']}
                if stop:
                    state['status'] = 'stopped'
                    state['stop_reason'] = 'manual'
        elif args.auto_evaluate:
            state['evaluation_status'] = 'skipped_manual_stop'
    except InterruptedError as exc:
        state['status'] = 'stopped'
        state['stop_reason'] = 'manual' if stop else 'time_cap'
        state['evaluation_status'] = 'skipped_incomplete_training'
        state['promotion'] = {'eligible': False, 'reasons': [str(exc)]}
    except BaseException as exc:
        state["status"] = "failed"
        state["error"] = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        if trainer is not None:
            trainer.utilization.stop()
        if vec is not None:
            vec.close()
        for env in ENVIRONMENTS:
            env.close()
        state["finished_at"] = time.time()
        publish()
        if not args.no_publish_latest:
            from .records import publish_records
            publish_records()


if __name__ == "__main__":
    main()
