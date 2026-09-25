"""Re-run repaired production controls without overwriting old comparisons."""
import argparse
import datetime
import fcntl
import json
import signal
import subprocess
import sys
import time
from .environment import ROOT
from .guardrails import contract, load_parent
from .live_play import publish
from .script_benchmark import comparison_plan, compare_production
from .records import publish_records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('parent')
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--run-id')
    parser.add_argument('--hall-supervisor', action='store_true')
    args = parser.parse_args()
    parent = load_parent(args.parent, contract())
    evaluation = json.loads((ROOT/'public/live/puffer'/args.parent/'evaluation.json').read_text())
    rows = comparison_plan(parent, evaluation)
    run_id = args.run_id or 'puffer-comparison-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    if not run_id.startswith('puffer-comparison-') or not run_id.replace('-','').isalnum():
        parser.error('Invalid run ID')
    output = ROOT/'public/live/puffer'/run_id
    output.mkdir(exist_ok=True)
    if args.launch:
        with (output/'comparison.log').open('x') as log:
            process = subprocess.Popen([sys.executable,'-m','puffer_adapter.recompare',args.parent,'--run-id',run_id,
                *(['--hall-supervisor'] if args.hall_supervisor else [])],
                cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        publish(output/'process.json',dict(pid=process.pid,run_id=run_id))
        time.sleep(2)
        if process.poll() not in (None,0) or not (output/'manifest.json').exists():
            raise RuntimeError(f'Launch not verified: {output}')
        print(json.dumps(dict(run_id=run_id,pid=process.pid,results=str(output),worker_seconds_cap=120,workers=5)))
        return
    # Same exclusive lock as training, plus watch lock: no concurrent workers.
    locks = [(ROOT/'.puffer-runtime'/name).open('a') for name in ('training.lock','live-play.lock')]
    for lock in locks:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    stopped = False
    def stop(*_):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGTERM,stop)
    signal.signal(signal.SIGINT,stop)
    state = dict(schema='dragonrealms.puffer.run/1',run_id=run_id,parent_run=args.parent,
        run_kind='production_script_comparison',scenario='barbarian',guild='barbarian',
        target_circle=parent['target_circle'],status='running',started_at=time.time(),
        engine_contract=parent['engine_contract'],worker_seconds_cap=120,workers=5,
        hall_supervisor=args.hall_supervisor,control_equivalent_to_sims=False,
        scope='Repaired fixed-arena production-script controls; no new PPO training or promotion',
        budgets=[{k:r[k] for k in ('seed','commands','simulated_seconds')} for r in rows])
    def save(report=None):
        state['updated_at']=time.time()
        if report is not None:
            publish(output/'production-comparison.json',report)
            state['completed_workers']=len(report['rows'])
        publish(output/'manifest.json',state)
    save(); publish_records()
    try:
        result=compare_production(parent,evaluation,cancelled=lambda:stopped,publish=save,hall_supervisor=args.hall_supervisor,
            on_progress=lambda row:(publish(output/'current.json',row),save()))
        state['status']=result['status']
    except BaseException as error:
        state.update(status='stopped' if isinstance(error,InterruptedError) else 'failed',error=type(error).__name__)
        raise
    finally:
        state['finished_at']=time.time();save();publish_records()
        for lock in locks:lock.close()


if __name__=='__main__':
    main()
