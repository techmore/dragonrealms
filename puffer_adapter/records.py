"""Publish comparable evaluation records, never cumulative training reward."""
import hashlib
import json
import math
from pathlib import Path
import time
import statistics
import tempfile
import os
from .guardrails import decide_circling

ROOT = Path(__file__).resolve().parent.parent


def build_records(directory):
    groups = {}
    circle_groups = {}
    runs = []
    for path in sorted(directory.glob('*/manifest.json')):
        if path.parent.name.startswith(('puffer-test-', 'puffer-probe-test-', 'puffer-validation-test-')):
            continue
        try:
            state = json.loads(path.read_text())
            if state.get('run_id') != path.parent.name:
                continue
            runs.append({key:state.get(key) for key in
                         ('run_id','scenario','guild','status','updated_at','started_at','run_kind')})
            evaluation = json.loads((path.parent / 'evaluation.json').read_text())
            if state.get('status') != 'completed' or not state.get('engine_contract'):
                continue
            if evaluation.get('run_id') != state['run_id'] or evaluation.get('weights_unchanged') is not True:
                continue
            rows = [r for r in evaluation['rows'] if r['policy'] == 'trained_greedy']
            if len(rows) < 5 or len({r['seed'] for r in rows}) != len(rows):
                continue
            if any(r.get('death') is not False or not isinstance(r.get('absorbed_gain'), (int, float))
                   or not math.isfinite(r['absorbed_gain']) for r in rows):
                continue
            env = state['environment']
            if state.get('scenario') in ('barbarian', 'circling'):
                guild = 'barbarian' if state['scenario'] == 'barbarian' else 'ranger'
                if state.get('guild') != guild or env.get('guild') != guild:
                    continue
                dimensions = [state['engine_contract'], state['scenario'], env.get('scenario_name'),
                              env.get('target_circle', 2), env.get('time_cost_per_hour', 0),
                              env['horizon'], sorted(r['seed'] for r in rows)]
                key = hashlib.sha256(json.dumps(dimensions).encode()).hexdigest()[:16]
                group = circle_groups.setdefault(key, dict(key=key, guild=guild,
                    scenario=state['scenario'], engine_contract=state['engine_contract'],
                    target_circle=env.get('target_circle', 2),
                    seeds=sorted(r['seed'] for r in rows), runs=[], best=None))
                group['runs'].append(state['run_id'])
                verdict = decide_circling(rows, env.get('requirement_labels', []), env['horizon'],
                    env.get('target_circle', 2), env.get('requirements_by_circle'))
                if evaluation.get('updates_during_evaluation') != 0 or verdict['status'] != 'approval_required':
                    continue
                record = dict(run_id=state['run_id'], circle=env.get('target_circle', 2), samples=len(rows),
                    median_commands=statistics.median(r['commands'] for r in rows),
                    median_simulated_seconds=statistics.median(r['simulated_seconds'] for r in rows))
                if group['best'] is None or (record['median_simulated_seconds'], record['median_commands']) < (
                        group['best']['median_simulated_seconds'], group['best']['median_commands']):
                    group['best'] = record
                continue
            if any(r['steps'] != env['horizon'] for r in rows):
                continue
            dimensions = [state['engine_contract'], env['scenario'], env['horizon'], sorted(r['seed'] for r in rows)]
            key = hashlib.sha256(json.dumps(dimensions).encode()).hexdigest()[:16]
            group = groups.setdefault(key, dict(key=key, scenario=env['scenario'], horizon=env['horizon'],
                seeds=sorted(r['seed'] for r in rows), runs=[], raw_exp=None, balanced_exp=None))
            record = dict(run_id=state['run_id'], mean_exp=sum(r['absorbed_gain'] for r in rows)/len(rows),
                          samples=len(rows), timestamp=state.get('finished_at'),
                          promotion=evaluation.get('promotion', {}).get('status', 'not_verified'))
            group['runs'].append(state['run_id'])
            if group['raw_exp'] is None or record['mean_exp'] > group['raw_exp']['mean_exp']:
                group['raw_exp'] = record
            if record['promotion'] == 'approval_required' and evaluation['promotion'].get('eligible') is True:
                if group['balanced_exp'] is None or record['mean_exp'] > group['balanced_exp']['mean_exp']:
                    group['balanced_exp'] = record
        except (OSError, ValueError, KeyError, TypeError):
            continue  # Incomplete evidence is not a zero or a record.
    runs.sort(key=lambda row: row.get('started_at') or 0, reverse=True)
    return dict(schema='dragonrealms.puffer.records/1', updated_at=time.time(),
                groups=list(groups.values()), circle_groups=list(circle_groups.values()), runs=runs)


def publish_records():
    directory = ROOT / 'public/live/puffer'
    directory.mkdir(parents=True, exist_ok=True)
    result = build_records(directory)
    with tempfile.NamedTemporaryFile(mode='w', dir=directory, prefix='.records-', suffix='.tmp',delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(result, stream, indent=2, allow_nan=False)
    try:
        os.replace(temporary, directory / 'records.json')
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    publish_records()
