"""Bounded detached independent frozen evaluation; never trains or deploys."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parent.parent


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('--seed-start',type=int,required=True)
    parser.add_argument('--seconds',type=int,default=1200)
    parser.add_argument('--launch',action='store_true')
    parser.add_argument('--run-id')
    args=parser.parse_args()
    if not args.source.replace('-','').isalnum() or not 1000<=args.seed_start<=2147483643 or not 30<=args.seconds<=1800:
        parser.error('Invalid source, five-seed range, or 30..1800 second cap')
    run_id=args.run_id or 'puffer-validation-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    if not run_id.startswith('puffer-validation-') or not run_id.replace('-','').isalnum():
        parser.error('Invalid validation ID')
    root=ROOT/'public/live/puffer';output=root/run_id
    if args.launch:
        # Log lives beside the immutable output directory so the worker can
        # reserve that directory atomically after checking seed reuse.
        with (root/(run_id+'.log')).open('x') as log:
            child=subprocess.Popen([sys.executable,'-m','puffer_adapter.validate',args.source,
                '--seed-start',str(args.seed_start),'--seconds',str(args.seconds),'--run-id',run_id],
                cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        time.sleep(5)
        verified=(output/'manifest.json').exists() and (output/'process.json').exists()
        print(json.dumps(dict(run_id=run_id,pid=child.pid,verified=verified,
            status='starting' if child.poll() is None else 'exited',results=str(output),seconds_cap=args.seconds)))
        if child.poll() not in (None,0): raise SystemExit('Validation failed; inspect saved launcher log')
        return
    locks=[]
    for name in ('training.lock','live-play.lock'):
        lock=(ROOT/'.puffer-runtime'/name).open('a')
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BaseException:
            lock.close()
            for held in locks: held.close()
            raise
        locks.append(lock)
    stopped=False
    def stop(*_):
        nonlocal stopped
        stopped=True
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    deadline=time.monotonic()+args.seconds
    from .evaluate import evaluate_run
    from .live_play import publish
    from .records import publish_records
    def progress(_):
        publish(output/'process.json',dict(pid=os.getpid(),run_id=run_id,source=args.source,seconds_cap=args.seconds))
        publish_records()
    try:
        evaluate_run(args.source,episodes=5,validation_id=run_id,
            validation_seeds=list(range(args.seed_start,args.seed_start+5)),
            cancelled=lambda:stopped or time.monotonic()>=deadline,on_progress=progress)
    finally:
        publish_records()
        for lock in locks:lock.close()


if __name__=='__main__':
    main()
