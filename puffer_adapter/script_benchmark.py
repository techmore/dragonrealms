"""Bounded real-engine production-script benchmark subprocess boundary."""
import json
import os
import selectors
import subprocess
import time
import math
from .environment import ROOT


def comparison_plan(manifest, evaluation):
    if (manifest.get('scenario')!='barbarian' or manifest.get('guild')!='barbarian'
        or evaluation.get('run_id')!=manifest.get('run_id')
        or evaluation.get('weights_unchanged') is not True or evaluation.get('updates_during_evaluation')!=0):
        raise ValueError('Production comparison requires a frozen Barbarian evaluation')
    rows=[r for r in evaluation.get('rows',[]) if r.get('policy')=='trained_greedy']
    if len(rows)!=5 or any(type(r.get('seed')) is not int for r in rows) or len({r['seed'] for r in rows})!=5:
        raise ValueError('Exactly five distinct candidate seeds required')
    for row in rows:
        commands,seconds=row.get('commands'),row.get('simulated_seconds')
        if (type(commands) is not int or not 4<=commands<=1000000 or type(seconds) not in (int,float)
            or not math.isfinite(seconds) or seconds!=int(seconds) or not 20<=seconds<=10000000):
            raise ValueError('Unknown or unsupported matched resource budget')
    return rows


def compare_production(manifest, evaluation, *, cancelled, publish, on_progress=lambda row: None, worker=None, hall_supervisor=False):
    # Baseline budgets are the candidate's observed consumption, not a new
    # activity horizon. Label this retrospective design explicitly.
    if type(hall_supervisor) is not bool: raise ValueError('Invalid supervisor mode')
    rows=comparison_plan(manifest,evaluation)
    report=dict(schema='dragonrealms.puffer.production-comparison/1',run_id=manifest['run_id'],
        status='running',scope='Production-generated fixed-arena scripts, not adaptive wire-sweep supervisor',
        design='Retrospective per-seed comparison under the candidate consumed command/simulated-time budgets',
        target_circle=manifest.get('target_circle',2),rows=[],promotion_eligible=False)
    report['control_equivalent_to_sims'] = False
    report['hall_supervisor'] = hall_supervisor
    report['comparison_validity'] = 'limited_fixed_arena_control'
    report['limitations'] = [
        'Generated hunt loops require an external hunt-to-hall handoff; this worker does not implement it',
        'Observed requirement-driven training list and adaptive arena supervisor are absent',
        'Resource completion is not successful leveling or evidence of superiority over Sims scripts',
    ]
    if hall_supervisor:
        report['scope'] = 'Production-generated fixed-arena scripts with observed hall handoffs; incomplete Sims supervisor'
        report['comparison_validity'] = 'limited_fixed_arena_hall_control'
        report['limitations'] = [
            'Hall handoffs and observed training prose are enabled, not the complete Sims supervisor',
            'Fixed beginner arena; no adaptive arena selection or best-variant gear/activity configuration',
            'Matching seed and budgets does not match stochastic event ordering between policies',
            'No superiority claim over complete production scripts or automatic promotion',
        ]
    publish(report)
    try:
        for candidate in rows:
            if cancelled(): raise InterruptedError('Script comparison cancelled')
            baseline=(worker or evaluate_script)(seed=candidate['seed'],target_circle=report['target_circle'],
                command_cap=candidate['commands'],simulated_seconds_cap=int(candidate['simulated_seconds']),
                seconds=120,cancelled=cancelled,on_progress=on_progress,hall_supervisor=hall_supervisor)
            report['rows'].append(dict(seed=candidate['seed'],candidate=candidate,baseline=baseline,
                baseline_resource_test_complete=baseline.get('reason') in ('target','death','command_cap','simulated_time_cap')))
            publish(report)
        report['status']='completed'
        report['all_resource_tests_complete']=all(r['baseline_resource_test_complete'] for r in report['rows'])
        return report
    except InterruptedError:
        report['status']='interrupted';raise
    except BaseException:
        report['status']='failed';raise
    finally:
        publish(report)


def evaluate_script(*, seed, target_circle, command_cap, simulated_seconds_cap,
                    seconds=120, cancelled=lambda: False, on_progress=lambda row: None, hall_supervisor=False):
    if type(hall_supervisor) is not bool: raise ValueError('Invalid supervisor mode')
    values = (seed, target_circle, command_cap, simulated_seconds_cap, seconds)
    if any(type(v) is not int for v in values) or not 0<=seed<=2147483647 or not 2<=target_circle<=20 or not 4<=command_cap<=1000000 or not 20<=simulated_seconds_cap<=10000000 or not 1<=seconds<=600:
        raise ValueError('Invalid production-script benchmark bounds')
    process = subprocess.Popen([os.environ.get('DR_NODE','node'),str(ROOT/'puffer_adapter/engine_script.mjs'),
        '--seed',str(seed),'--target',str(target_circle),'--commands',str(command_cap),
        '--simulated-seconds',str(simulated_seconds_cap),'--seconds',str(seconds),
        *(['--hall-supervisor'] if hall_supervisor else [])],cwd=ROOT,
        stdout=subprocess.PIPE,text=True,bufsize=1)
    selector=selectors.DefaultSelector()
    selector.register(process.stdout,selectors.EVENT_READ)
    deadline=time.monotonic()+seconds+15
    result=None
    try:
        while time.monotonic()<deadline:
            if cancelled(): raise InterruptedError('Production-script benchmark cancelled')
            if not selector.select(timeout=.25):
                if process.poll() is not None: break
                continue
            line=process.stdout.readline()
            if not line: break
            row=json.loads(line)
            if row.get('status')=='completed': result=row
            else: on_progress(row)
        if result is None: raise RuntimeError('Production-script benchmark ended without a completion receipt')
        if process.wait(timeout=5)!=0: raise RuntimeError('Production-script worker failed')
        if (result.get('seed')!=seed or result.get('target_circle')!=target_circle
            or result.get('hall_supervisor') is not hall_supervisor
            or result.get('database_isolated') is not True or result.get('source_unchanged') is not True
            or result.get('commands',command_cap+1)>command_cap
            or result.get('simulated_seconds',simulated_seconds_cap+1)>simulated_seconds_cap+.11):
            raise ValueError('Production-script receipt violates its benchmark contract')
        return result
    finally:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill();process.wait()
        process.stdout.close();selector.close()
