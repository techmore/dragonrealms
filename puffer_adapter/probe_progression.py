"""Detached bounded curriculum feasibility, explicitly not neural training."""
import argparse
import datetime
import fcntl
import json
import os
import signal
import subprocess
import sys
import time
import hashlib
from .environment import DragonRealmsEnv, ROOT
from .teacher import choose_activity, TEACHER_VERSION
from .guardrails import contract
from .watch import watch_snapshot
from .records import publish_records


def save(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2, allow_nan=False))
    temporary.replace(path)


def worker(args, directory):
    (ROOT / '.puffer-runtime').mkdir(exist_ok=True)
    with (ROOT / '.puffer-runtime/progression-probe.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stop = False
        def stop_requested(*_):
            nonlocal stop
            stop = True
        signal.signal(signal.SIGTERM, stop_requested)
        signal.signal(signal.SIGINT, stop_requested)
        start = time.monotonic()
        state = dict(schema='dragonrealms.puffer.run/1', run_id=args.run_id,
            run_kind='scripted_feasibility', trainer='Requirement-aware script; no neural optimizer',
            status='running', scenario='barbarian', guild='barbarian', target_circle=args.target_circle,
            teacher=TEACHER_VERSION, started_at=time.time(), engine_contract=contract(),
            teacher_source_sha256=hashlib.sha256((ROOT/'puffer_adapter/teacher.py').read_bytes()).hexdigest(),
            seconds_cap=args.seconds, step_cap=args.activities, steps=0, updates=0,
            evaluation_status='not_applicable', promotion={'eligible':False,'reasons':['Scripted feasibility is not learned performance']},
            mode='Isolated real-engine scripted feasibility; not a matched production-script benchmark')
        env = None
        def publish():
            state['updated_at'] = time.time()
            save(directory / 'manifest.json', state)
        try:
            publish()
            publish_records()
            env = DragonRealmsEnv('barbarian', args.target_circle)
            state['environment'] = env.specification
            env.reset(seed=args.seed)
            state['seed'] = args.seed
            for step in range(args.activities):
                if stop or time.monotonic()-start >= args.seconds:
                    state['stop_reason'] = 'manual' if stop else 'time_cap'
                    break
                decision = choose_activity(env.last_info, env.specification)
                _, _, terminated, truncated, _ = env.step(decision['action'])
                state.update(steps=step+1, circle=env.last_info['circle'],max_circle=env.max_circle,
                    requirements=env.last_info['requirements'],requirement_gap=env.last_info['requirement_gap'],
                    commands=env.last_info['commands'],simulated_seconds=env.last_info['simulated_seconds'],
                    death=env.last_info['death'],skills=env.last_info['skills'],
                    circle_milestones=env.circle_milestones,watch=watch_snapshot(env.last_info),
                    last_decision=decision)
                print(json.dumps({k:state[k] for k in ['steps','circle','requirement_gap','commands','simulated_seconds','last_decision']}),flush=True)
                publish()
                if terminated or truncated:
                    state['stop_reason'] = 'death' if state['death'] else 'target' if state['circle']>=args.target_circle else 'horizon'
                    break
            state.setdefault('stop_reason','activity_cap')
            state['status'] = 'stopped' if stop else 'completed'
            state['source_unchanged'] = (state['engine_contract'] == contract()
                and state['teacher_source_sha256'] == hashlib.sha256((ROOT/'puffer_adapter/teacher.py').read_bytes()).hexdigest())
            state['scripted_target_reached'] = state['stop_reason']=='target' and state['source_unchanged']
        except BaseException as error:
            state.update(status='failed',error=f'{type(error).__name__}: {error}')
            raise
        finally:
            if env is not None: env.close()
            state['finished_at'] = time.time()
            publish()
            publish_records()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target-circle',type=int,default=20)
    parser.add_argument('--seconds',type=int,default=300)
    parser.add_argument('--activities',type=int,default=2048)
    parser.add_argument('--seed',type=int,default=0)
    parser.add_argument('--run-id')
    parser.add_argument('--worker',action='store_true')
    args = parser.parse_args()
    if not 2<=args.target_circle<=20 or not 1<=args.seconds<=600 or not 1<=args.activities<=2048 or not 0<=args.seed<1000:
        parser.error('Invalid bounded probe configuration')
    if args.worker:
        if not args.run_id or not args.run_id.startswith('puffer-probe-') or not args.run_id.replace('-','').isalnum():
            parser.error('Invalid probe run id')
        worker(args, ROOT/'public/live/puffer'/args.run_id)
        return
    run_id = 'puffer-probe-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    directory = ROOT/'public/live/puffer'/run_id
    directory.mkdir(parents=True)
    save(directory/'manifest.json',dict(run_id=run_id,status='launching',run_kind='scripted_feasibility'))
    with (directory/'train.log').open('w') as log:
        process = subprocess.Popen([sys.executable,'-m','puffer_adapter.probe_progression','--worker','--run-id',run_id,
            '--target-circle',str(args.target_circle),'--seconds',str(args.seconds),'--activities',str(args.activities),
            '--seed',str(args.seed)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    save(directory/'process.json',dict(pid=process.pid,run_id=run_id,kind='scripted_feasibility'))
    time.sleep(2)
    if process.poll() not in (None,0):
        state = json.loads((directory/'manifest.json').read_text())
        state.update(status='failed',error='Probe exited during launch; see train.log')
        save(directory/'manifest.json',state)
        raise RuntimeError((directory/'train.log').read_text()[-3000:])
    print(json.dumps(dict(run_id=run_id,pid=process.pid,results=str(directory),
        dashboard=f'http://127.0.0.1:3000/puffer.html?run={run_id}',
        seconds_cap=args.seconds,activities_cap=args.activities),indent=2))


if __name__ == '__main__': main()
