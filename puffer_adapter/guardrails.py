"""Fail-closed compatibility and matched evaluation gates. No live promotion."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def contract():
    digest = hashlib.sha256()
    paths = [ROOT / 'puffer_adapter/engine.mjs', ROOT / 'puffer_adapter/environment.py']
    paths += [ROOT / 'puffer_adapter/engine_circle.mjs', ROOT / 'puffer_adapter/virtual_clock.mjs']
    paths += [ROOT / 'puffer_adapter/circle_reward.mjs']
    paths += [ROOT / 'puffer_adapter/curriculum.mjs']
    paths += [ROOT / 'puffer_adapter/economic_observation.mjs']
    paths += sorted((ROOT / 'server').rglob('*.js')) + sorted((ROOT / 'data').rglob('*.js'))
    for path in paths:
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def load_parent(run_id, expected_contract):
    if not run_id or not run_id.replace('-', '').isalnum():
        raise ValueError('Invalid parent run ID')
    state = json.loads((ROOT / 'public/live/puffer' / run_id / 'manifest.json').read_text())
    if state.get('status') not in ('completed', 'stopped'):
        raise ValueError('Parent must be a finished run')
    if state.get('engine_contract') != expected_contract:
        raise ValueError('Parent engine/reward contract missing or changed; start a fresh run')
    checkpoint = Path(state['checkpoint']).resolve()
    if not checkpoint.is_relative_to((ROOT / '.puffer-runtime' / run_id).resolve()):
        raise ValueError('Checkpoint outside parent runtime directory')
    if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != state.get('checkpoint_sha256'):
        raise ValueError('Parent checkpoint checksum mismatch')
    return state


def imitation_checkpoint(manifest):
    """Accept only a checksum-verified checkpoint owned by this exact run."""
    evidence = manifest.get('imitation') or {}
    if not evidence.get('checkpoint'):
        return None  # Historical runs have no recoverable pre-RL checkpoint.
    run_id = manifest.get('run_id', '')
    if not run_id or not run_id.replace('-', '').isalnum():
        raise ValueError('Invalid imitation run id')
    path = Path(evidence['checkpoint']).resolve()
    if not path.is_relative_to((ROOT / '.puffer-runtime' / run_id).resolve()):
        raise ValueError('Imitation checkpoint outside run directory')
    if hashlib.sha256(path.read_bytes()).hexdigest() != evidence.get('checkpoint_sha256'):
        raise ValueError('Imitation checkpoint checksum mismatch')
    return path


def decide(rows, references):
    """Require EXP improvement without sacrificing the weakest observed skill.

    Per-seed nonregression plus strict mean gain, not statistical significance.
    """
    reasons = []
    candidates = {r['seed']: r for r in rows if r['policy'] == 'trained_greedy'}
    if len(candidates) < 5 or len(candidates) != len([r for r in rows if r['policy'] == 'trained_greedy']):
        return {'eligible': False, 'reasons': ['Missing or duplicate candidate seeds']}
    for reference in references:
        matched = {r['seed']: r for r in rows if r['policy'] == reference}
        if set(matched) != set(candidates) or len(matched) != len([r for r in rows if r['policy'] == reference]):
            reasons.append(f'{reference}: unmatched evaluation seeds')
            continue
        gains = []
        for seed, candidate in candidates.items():
            baseline = matched[seed]
            values = [candidate.get('absorbed_gain'), baseline.get('absorbed_gain'),
                      candidate.get('weakest_skill_gain'), baseline.get('weakest_skill_gain')]
            if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
                reasons.append(f'{reference}: unknown metrics on seed {seed}')
                continue
            if candidate.get('death') is not False or candidate.get('steps') != baseline.get('steps'):
                reasons.append(f'{reference}: death or unmatched horizon on seed {seed}')
            if values[0] < values[1] or values[2] < values[3]:
                reasons.append(f'{reference}: EXP or weakest-skill regression on seed {seed}')
            gains.append(values[0] - values[1])
        if len(gains) != len(candidates) or sum(gains) <= 0:
            reasons.append(f'{reference}: no measured mean EXP improvement')
    if not references:
        reasons.append('No comparison policies supplied')
    return {'eligible': not reasons, 'reasons': reasons,
            'scope': 'isolated skilling only; never authorizes live deployment',
            'rule': 'strict mean EXP gain, no per-seed EXP/weakest-skill regression, no deaths'}


def decide_circling(rows, expected_labels, horizon, target_circle=2, requirements_by_circle=None):
    """Verify earned milestones, never claim script superiority or deploy."""
    candidates = [row for row in rows if row.get('policy') == 'trained_greedy']
    reasons = []
    if type(target_circle) is not int or not 2 <= target_circle <= 20:
        return dict(eligible=False, status='rejected', reasons=['Invalid target circle'], circle_successes=0, circle_tests=len(candidates))
    seeds = [row.get('seed') for row in candidates]
    if len(candidates) < 5 or any(type(seed) is not int for seed in seeds) or len(set(seeds)) != len(seeds):
        reasons.append('At least five distinct held-out candidate seeds required')
    expected = sorted(expected_labels)
    if not expected or len(set(expected)) != len(expected):
        reasons.append('Missing or duplicate engine requirement definitions')
    successes = 0
    for row in candidates:
        req = row.get('requirements') or {}
        evidence = req.get('rows') or []
        valid = (row.get('circle') == target_circle and row.get('death') is False
            and type(row.get('steps')) is int and 0 < row['steps'] <= horizon
            and row.get('requirement_gap') == 0 and req.get('ok') is True
            and req.get('missing') == [] and bool(expected)
            and sorted(item.get('label', '') for item in evidence) == expected
            and all(type(item.get('have')) in (int,float) and math.isfinite(item['have'])
                    and type(item.get('need')) in (int,float) and math.isfinite(item['need'])
                    and item['need'] > 0 and item['have'] >= item['need'] for item in evidence)
            and type(row.get('commands')) is int and row['commands'] > 0
            and type(row.get('simulated_seconds')) in (int,float)
            and math.isfinite(row['simulated_seconds']) and row['simulated_seconds'] > 0
            and any(m.get('circle') == target_circle and m.get('step') == row['steps'] for m in row.get('milestones', [])))
        if target_circle > 2 and valid:
            # Higher targets must prove every intermediate engine-earned gate,
            # not just a final circle number or a Circle-2 requirement snapshot.
            milestones = row.get('milestones', [])
            valid = valid and [m.get('circle') for m in milestones] == list(range(2, target_circle + 1))
            previous_step = previous_time = previous_commands = 0
            final_definitions = (requirements_by_circle or {}).get(str(target_circle), [])
            final_needs = {r['label']: r['need'] for r in final_definitions}
            valid = valid and bool(final_needs) and all(r.get('need') == final_needs.get(r.get('label')) for r in evidence)
            for milestone in milestones:
                definitions = (requirements_by_circle or {}).get(str(milestone.get('circle')), [])
                required = {r['label']: r['need'] for r in definitions}
                proof = milestone.get('requirements') or {}
                evidence_rows = proof.get('rows') or []
                valid = valid and bool(required) and len(required) == len(definitions)
                valid = valid and proof.get('ok') is True and proof.get('missing') == []
                valid = valid and sorted(r.get('label', '') for r in evidence_rows) == sorted(required)
                valid = valid and all(type(r.get('have')) in (int, float) and math.isfinite(r['have'])
                    and r.get('need') == required.get(r.get('label')) and r['have'] >= r['need'] for r in evidence_rows)
                step, seconds, commands = (milestone.get(k) for k in ('step', 'simulated_seconds', 'commands'))
                ordered = (type(step) is int and previous_step < step <= row.get('steps', 0)
                    and type(seconds) in (int, float) and math.isfinite(seconds)
                    and previous_time < seconds <= row.get('simulated_seconds', 0)
                    and type(commands) is int and previous_commands < commands <= row.get('commands', 0))
                valid = valid and ordered
                if ordered:
                    previous_step, previous_time, previous_commands = step, seconds, commands
        successes += int(valid)
        if not valid:
            reasons.append(f"Seed {row.get('seed')}: Circle {target_circle} not reached safely or milestone evidence incomplete")
    return dict(eligible=False, status='rejected' if reasons else 'approval_required',
        reasons=reasons or ['All held-out milestones verified; manual review required, no deployment or script-superiority claim'],
        target_circle=target_circle, circle_successes=successes, circle_tests=len(candidates))
