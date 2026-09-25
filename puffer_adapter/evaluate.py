"""Matched fixed-seed evaluation, not a claim about full leveling scripts."""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from .runtime import load_pufferlib
load_pufferlib()
import pufferlib.models
from .environment import DragonRealmsEnv, ROOT
from .train import atomic_json, fingerprint
from .guardrails import contract, load_parent, decide, decide_circling, imitation_checkpoint
from .watch import watch_snapshot
from .policy_selection import select_action


def evaluate_run(run_id, episodes=5, parent_run=None, cancelled=lambda: False, on_progress=None, script_comparison=False,
                 validation_id=None, validation_seeds=None):
    if not run_id.replace("-", "").isalnum() or not 1 <= episodes <= 20:
        raise ValueError("invalid run id or episode count (1..20)")
    output = ROOT / "public/live/puffer" / run_id
    manifest = json.loads((output / "manifest.json").read_text())
    if script_comparison and (episodes != 5 or manifest.get('scenario') != 'barbarian'):
        raise ValueError('Production comparison requires five Barbarian evaluation seeds')
    if not manifest.get("checkpoint"):
        raise ValueError("run has no completed checkpoint")
    if manifest.get('engine_contract') != contract():
        raise ValueError('Evaluation requires the same recorded engine/reward contract')
    load_parent(run_id, contract())  # Verify candidate checkpoint containment/checksum too.
    imitation_path = imitation_checkpoint(manifest)
    source_run = run_id
    if validation_id is not None:
        from .validation_plan import reserve_validation
        output, selected_seeds = reserve_validation(ROOT/'public/live/puffer', run_id,
            validation_id, validation_seeds, episodes)
        manifest = dict(manifest, run_id=validation_id, parent_run=source_run,
            run_kind='frozen_validation', status='running', evaluation_status='running',
            started_at=time.time(), updated_at=time.time(), validation_seeds=selected_seeds,
            source_training_updates=manifest.get('updates'), updates=0, steps=0,
            history=[], circle_milestones=[], max_circle=None, training_phase=None,
            promotion={'eligible':False,'reasons':['Independent validation incomplete']})
        run_id = validation_id
        atomic_json(output/'manifest.json',manifest)
    elif validation_seeds is not None:
        raise ValueError('Validation seeds require a separate validation output')
    parent = load_parent(parent_run, contract()) if parent_run else None
    if parent and parent.get('scenario', 'skilling') != manifest.get('scenario', 'skilling'):
        raise ValueError('Parent scenario mismatch')
    if parent and any(parent.get(k, default) != manifest.get(k, default) for k, default in [('target_circle',2),('time_cost_per_hour',0)]):
        raise ValueError('Parent curriculum/reward parameters mismatch')
    circling=manifest.get('scenario') in ('circling', 'barbarian')
    env = DragonRealmsEnv(manifest.get('scenario','skilling'), manifest.get('target_circle',2), manifest.get('time_cost_per_hour',0))
    # Default policy needs only these two spaces for our flat observation.
    env.single_action_space = env.action_space
    env.single_observation_space = env.observation_space
    torch.set_num_threads(2)
    policy = pufferlib.models.Default(env, hidden_size=64)
    policy.load_state_dict(torch.load(manifest["checkpoint"], map_location="cpu", weights_only=True))
    policy.eval()
    parent_policy = None
    if parent:
        parent_policy = pufferlib.models.Default(env, hidden_size=64)
        parent_policy.load_state_dict(torch.load(parent['checkpoint'], map_location='cpu', weights_only=True))
        parent_policy.eval()
    before = fingerprint(policy)
    parent_before = fingerprint(parent_policy) if parent_policy is not None else None
    imitation_policy = None
    if imitation_path:
        try:
            imitation_policy = pufferlib.models.Default(env, hidden_size=64)
            imitation_policy.load_state_dict(torch.load(imitation_path, map_location='cpu', weights_only=True))
            imitation_policy.eval()
            if fingerprint(imitation_policy) != manifest['imitation'].get('weights_after'):
                raise ValueError('Imitation checkpoint weight fingerprint mismatch')
        except BaseException:
            env.close()
            raise
    imitation_before = fingerprint(imitation_policy) if imitation_policy is not None else None
    rows = []
    last_progress = 0
    current = None
    def progress(status='running', force=False):
        nonlocal last_progress
        now = time.monotonic()
        if not force and now-last_progress < 5:
            return
        last_progress = now
        receipt = dict(schema='dragonrealms.puffer.evaluation-progress/1', run_id=run_id,
            status=status, updated_at=time.time(), completed_episodes=len(rows),
            current=current, rows=rows, promotion_eligible=False)
        atomic_json(output / 'evaluation-progress.json', receipt)
        if validation_id is not None:
            manifest.update(updated_at=time.time(), evaluation_status=status)
            if status in ('failed','interrupted'):
                manifest.update(status=status, finished_at=time.time())
            atomic_json(output/'manifest.json',manifest)
        if on_progress:
            on_progress({k:v for k,v in receipt.items() if k!='rows'})
    try:
        modes = ['trained_greedy', 'trained_sampled', 'scripted_rotation', 'random'] + (['parent', 'parent_sampled'] if parent else [])
        if imitation_policy is not None:
            modes += ['imitation_greedy', 'imitation_sampled']
        neural_modes = {'trained_greedy':policy, 'trained_sampled':policy,
                        'parent':parent_policy, 'parent_sampled':parent_policy,
                        'imitation_greedy':imitation_policy, 'imitation_sampled':imitation_policy}
        # Seeds are reproducible per candidate but different across runs; never used in training.
        import hashlib
        seed_start = 1000 + int(hashlib.sha256(run_id.encode()).hexdigest()[:6], 16)
        seeds = selected_seeds if validation_id is not None else range(seed_start, seed_start + episodes)
        for mode in modes:
            for seed in seeds:
                obs, info = env.reset(seed=seed)
                rng = np.random.default_rng(seed)
                action_rng = torch.Generator(device='cpu').manual_seed(seed)
                initial = info["experience_absorbed"]
                reward = 0
                actions = [0] * env.action_space.n
                current = dict(policy=mode, seed=seed, steps=0)
                progress(force=True)
                for step in range(env.specification["horizon"]):
                    if cancelled():
                        raise InterruptedError('Evaluation stopped; candidate not approved')
                    if mode in neural_modes:
                        selected = neural_modes[mode]
                        action = select_action(selected, obs, sampled=mode.endswith('_sampled'), generator=action_rng)
                    elif mode == "scripted_rotation":
                        rotation=env.specification.get('baseline_actions',list(range(1,env.action_space.n)))
                        action=rotation[step%len(rotation)]
                    else:
                        action = int(rng.integers(env.action_space.n))
                    obs, value, terminated, truncated, info = env.step(action)
                    reward += value
                    actions[action] += 1
                    current = dict(policy=mode, seed=seed, steps=step+1,
                        circle=info.get('circle'), requirement_gap=info.get('requirement_gap'),
                        commands=info.get('commands'), simulated_seconds=info.get('simulated_seconds'),
                        actions=actions.copy())
                    current['watch'] = watch_snapshot(env.last_info)
                    progress()
                    if terminated or truncated:
                        break
                rows.append(dict(policy=mode, seed=seed, steps=step+1,
                    reward=reward, absorbed_gain=info["experience_absorbed"]-initial,
                    weakest_skill_gain=min(v['absorbed'] for v in env.last_info['skills'].values()),
                    circle=info["circle"], death=bool(info.get('death',terminated)), actions=actions,
                    requirement_gap=info.get('requirement_gap'),simulated_seconds=info.get('simulated_seconds'),
                    commands=info.get('commands'),requirements=env.last_info.get('requirements'),
                    watch=watch_snapshot(env.last_info),
                    milestones=env.last_info.get('milestones',[])))
                progress(force=True)
        result = dict(schema="dragonrealms.puffer.evaluation/2", run_id=run_id,
            source_run=source_run, validation_seeds=list(seeds),
            decision_protocol='matched-greedy-and-seeded-categorical/1',
            sampled_scope='Diagnostic only; promotion continues to require trained_greedy evidence',
            parent_weights_unchanged=parent_before == fingerprint(parent_policy) if parent_policy is not None else None,
            imitation_weights_unchanged=imitation_before == fingerprint(imitation_policy) if imitation_policy is not None else None,
            scope="stationary noncombat skill acquisition only; NOT full leveling-script comparison",
            updates_during_evaluation=0, weights_unchanged=before == fingerprint(policy), rows=rows,
            summary={mode: {"mean_absorbed_gain": float(np.mean([r["absorbed_gain"] for r in rows if r["policy"] == mode])),
                           "mean_reward": float(np.mean([r["reward"] for r in rows if r["policy"] == mode]))}
                     for mode in modes})
        result['promotion'] = decide(rows, ['scripted_rotation'] + (['parent'] if parent else []))
        if circling:
            result['scope']=env.specification['scenario'] + '; not live-server deployment or comparison with production leveling scripts'
            result['promotion']=decide_circling(rows,
                [row['label'] for row in env.last_info.get('requirements',{}).get('rows',[])],
                env.specification['horizon'], env.specification.get('target_circle', 2),
                env.specification.get('requirements_by_circle'))
        if not result['weights_unchanged'] or result['parent_weights_unchanged'] is False or result['imitation_weights_unchanged'] is False or contract() != manifest['engine_contract']:
            result['promotion'] = {'eligible': False, 'reasons': ['Weights or engine changed during evaluation']}
        # Eligibility is evidence, not deployment. Human approval remains required.
        if not circling:
            result['promotion']['status'] = 'approval_required' if result['promotion']['eligible'] else 'rejected'
        if script_comparison:
            from .script_benchmark import compare_production
            # Preserve the completed neural tests even if the optional baseline
            # later hits a timeout or cancellation.
            result['production_comparison'] = {'status':'pending','promotion_eligible':False}
            atomic_json(output/'evaluation.json',result)
            def script_progress(row):
                nonlocal current
                current = dict(policy='production_generated_baseline',seed=row['seed'],
                    steps=row['commands'],steps_unit='commands',circle=row['circle'],
                    requirement_gap=row['requirement_gap'],commands=row['commands'],
                    simulated_seconds=row['simulated_seconds'],watch=watch_snapshot(row))
                progress()
            result['production_comparison'] = compare_production(manifest,result,cancelled=cancelled,
                publish=lambda report:atomic_json(output/'production-comparison.json',report),
                on_progress=script_progress)
            if contract() != manifest['engine_contract']:
                result['promotion'] = {'eligible':False,'status':'rejected','reasons':['Engine changed during script comparison']}
        atomic_json(output / "evaluation.json", result)
        manifest["baseline"] = result["summary"]
        if validation_id is not None:
            manifest.update(status='completed', evaluation_status='completed', finished_at=time.time())
        manifest["evaluation_scope"] = result["scope"]
        atomic_json(output / "manifest.json", manifest)
        latest = ROOT / "public/live/puffer/latest.json"
        manifest['promotion'] = result['promotion']
        atomic_json(output / "manifest.json", manifest)
        if latest.exists() and json.loads(latest.read_text())["run_id"] == run_id:
            atomic_json(latest, manifest)
        from .records import publish_records
        publish_records()
        current = None
        progress('completed', force=True)
        return result
    except InterruptedError:
        progress('interrupted', force=True)
        raise
    except BaseException:
        progress('failed', force=True)
        raise
    finally:
        env.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('run_id')
    parser.add_argument('--episodes', type=int, default=5)
    parser.add_argument('--parent')
    parser.add_argument('--script-comparison',action='store_true')
    args = parser.parse_args()
    print(json.dumps(evaluate_run(args.run_id, args.episodes, args.parent, script_comparison=args.script_comparison), indent=2))


if __name__ == "__main__":
    main()
