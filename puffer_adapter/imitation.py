"""Successful curriculum demonstrations and bounded behavior cloning.

This teacher is an activity rotation, NOT the production leveling script.
Only training seeds below 1000 are accepted; frozen evaluations use >=1000.
"""
import time
import numpy as np
import torch


TEACHER = 'curriculum-rotation-with-earned-guild-check/1'


def collect_demonstrations(env, seeds, *, cancelled, on_episode=lambda row: None, teacher='rotation',
                           rollin_policy=None, rollin_steps=0):
    if type(rollin_steps) is not int or not 0 <= rollin_steps <= 256:
        raise ValueError('Roll-in steps must be 0..256')
    if rollin_steps and (rollin_policy is None or teacher != 'requirements'):
        raise ValueError('Roll-in requires a frozen policy and requirement teacher')
    if teacher not in ('rotation', 'requirements'):
        raise ValueError('Unknown demonstration teacher')
    from .teacher import choose_activity
    seeds = list(seeds)
    if not seeds or len(seeds) > 20 or len(set(seeds)) != len(seeds) or any(type(s) is not int or not 0 <= s < 1000 for s in seeds):
        raise ValueError('Use 1..20 distinct training seeds in 0..999')
    observations, actions, receipts = [], [], []
    rotation = env.specification['baseline_actions']
    guild_action = env.specification['actions'].index('guild')
    target = env.specification['target_circle']
    for seed in seeds:
        obs, _ = env.reset(seed=seed)
        rollin_count = 0
        ended = False
        if rollin_steps:
            from .policy_selection import select_action
            generator = torch.Generator(device='cpu').manual_seed(seed)
            for _ in range(min(rollin_steps, env.specification['horizon'])):
                if cancelled(): raise InterruptedError('Demonstration roll-in stopped')
                action = select_action(rollin_policy, obs, sampled=True, generator=generator)
                obs, _, terminated, truncated, _ = env.step(action)
                rollin_count += 1
                if terminated or truncated:
                    ended = True
                    break
        episode_obs, episode_actions = [], []
        # Learner roll-in actions are never teacher labels; keep the original
        # total horizon and retain only verified successful teacher suffixes.
        for step in range(0 if ended else env.specification['horizon'] - rollin_count):
            if cancelled():
                raise InterruptedError('Demonstration collection stopped')
            action = (choose_activity(env.last_info, env.specification)['action'] if teacher == 'requirements'
                else guild_action if env.last_info.get('requirements', {}).get('ok') is True else rotation[step % len(rotation)])
            episode_obs.append(obs.copy())
            episode_actions.append(action)
            obs, _, terminated, truncated, _ = env.step(action)
            if terminated or truncated:
                break
        info = env.last_info
        success = (info.get('circle', 0) >= target and info.get('death') is False
                   and info.get('requirements', {}).get('ok') is True
                   and info.get('requirement_gap') == 0
                   and any(m.get('circle') == target for m in info.get('milestones', [])))
        receipt = dict(seed=seed, teacher=teacher, success=success, steps=rollin_count+len(episode_actions),
                       rollin_steps=rollin_count, teacher_steps=len(episode_actions),
                       action_counts=np.bincount(episode_actions,minlength=len(env.specification['actions'])).tolist(),
                       circle=info.get('circle'), death=info.get('death'),
                       requirement_gap=info.get('requirement_gap'), requirements=info.get('requirements'),
                       commands=info.get('commands'), simulated_seconds=info.get('simulated_seconds'),
                       milestones=info.get('milestones'), timestamp=time.time())
        receipts.append(receipt)
        on_episode(receipt)
        if success:
            observations.extend(episode_obs)
            actions.extend(episode_actions)
    if not actions:
        raise ValueError('No verified successful demonstrations; imitation refused')
    return np.asarray(observations, dtype=np.float32), np.asarray(actions, dtype=np.int64), receipts


def behavior_clone(policy, observations, actions, *, seed, epochs=30, balanced=False, cancelled=lambda: False):
    if type(epochs) is not int or not 1 <= epochs <= 100:
        raise ValueError('Imitation epochs must be 1..100')
    x = torch.as_tensor(observations, dtype=torch.float32)
    y = torch.as_tensor(actions, dtype=torch.long)
    if x.ndim != 2 or y.ndim != 1 or len(x) != len(y) or not len(y) or not torch.isfinite(x).all():
        raise ValueError('Invalid demonstration arrays')
    with torch.no_grad():
        logits, _ = policy(x[:1])
    if torch.any(y < 0) or torch.any(y >= logits.shape[-1]):
        raise ValueError('Demonstration action is outside policy allowlist')
    counts = torch.bincount(y, minlength=logits.shape[-1])
    weights = torch.zeros(logits.shape[-1],dtype=torch.float32)
    observed = counts > 0
    weights[observed] = len(y) / (int(observed.sum()) * counts[observed].float())
    loss_weights = weights if balanced else None
    optimizer = torch.optim.Adam(policy.parameters(), lr=0.001)
    generator = torch.Generator().manual_seed(seed)
    updates = 0
    policy.train()
    for _ in range(epochs):
        for indices in torch.randperm(len(y), generator=generator).split(64):
            if cancelled():
                raise InterruptedError('Imitation training stopped')
            logits, _ = policy(x[indices])
            loss = torch.nn.functional.cross_entropy(logits, y[indices], weight=loss_weights)
            if not torch.isfinite(loss):
                raise ValueError('Non-finite imitation loss')
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), 0.5)
            optimizer.step()
            updates += 1
    policy.eval()
    with torch.no_grad():
        logits, _ = policy(x)
        accuracy = float((logits.argmax(-1) == y).float().mean())
        loss = float(torch.nn.functional.cross_entropy(logits, y))
        per_action = [dict(action=i, examples=int(counts[i]),
            training_accuracy=float((logits[y==i].argmax(-1)==i).float().mean()) if counts[i] else None,
            loss_weight=float(weights[i]) if balanced else 1.0) for i in range(logits.shape[-1])]
    return dict(updates=updates, epochs=epochs, examples=len(y), loss=loss,
                balanced=balanced, per_action=per_action,
                training_accuracy=accuracy, scope='Training fit only; not held-out game performance')
