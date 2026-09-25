"""Launch a bounded durable local training job, or stop that exact job."""
import argparse
import datetime
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import math
from .budget import evaluation_deadline

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=16384)
    parser.add_argument("--seconds", type=int, default=300)
    parser.add_argument("--evaluation-seconds", type=int, default=3600)
    parser.add_argument("--stop", metavar="RUN_ID")
    parser.add_argument("--resume", metavar="RUN_ID")
    parser.add_argument('--demonstration-episodes', type=int, default=0)
    parser.add_argument('--demonstration-teacher', choices=['rotation','requirements'], default='rotation')
    parser.add_argument('--imitation-epochs', type=int, default=30)
    parser.add_argument('--imitation-balanced', action='store_true')
    parser.add_argument('--demonstration-rollin-steps', type=int, default=0)
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
    if args.stop:
        if not args.stop.replace("-", "").isalnum():
            parser.error("invalid run id")
        path = ROOT / "public/live/puffer" / args.stop / "process.json"
        record = json.loads(path.read_text())
        result = subprocess.run(["ps", "-p", str(record["pid"]), "-o", "command="], capture_output=True, text=True)
        if "puffer_adapter.train" not in result.stdout or args.stop not in result.stdout:
            parser.error("recorded training process is not running; no signal sent")
        os.kill(record["pid"], signal.SIGTERM)
        print(f"Stop requested for {args.stop}")
        return
    if args.steps < 128 or args.steps % 128 or not 1 <= args.seconds <= 3600:
        parser.error("steps must be a multiple of 128; seconds must be 1..3600")
    try:
        evaluation_deadline(args.evaluation_seconds, 0)
    except ValueError as error:
        parser.error(str(error))
    run_id = "puffer-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    output = ROOT / "public/live/puffer" / run_id
    output.mkdir(parents=True)
    (output / "manifest.json").write_text(json.dumps({
        "schema": "dragonrealms.puffer.run/1", "run_id": run_id,
        "status": "launching", "started_at": time.time(),
        "scenario": args.scenario,
        "guild": 'barbarian' if args.scenario == 'barbarian' else 'ranger',
        "step_cap": args.steps, "seconds_cap": args.seconds,
        "evaluation_seconds_cap": args.evaluation_seconds,
        "target_circle": args.target_circle, "time_cost_per_hour": args.time_cost_per_hour,
    }))
    with (output / "train.log").open("w") as stream:
        process = subprocess.Popen([sys.executable, "-m", "puffer_adapter.train",
            "--run-id", run_id, "--steps", str(args.steps), "--seconds", str(args.seconds),
            "--evaluation-seconds", str(args.evaluation_seconds),
            '--demonstration-episodes', str(args.demonstration_episodes),
            '--demonstration-teacher', args.demonstration_teacher,
            '--demonstration-rollin-steps', str(args.demonstration_rollin_steps),
            '--imitation-epochs', str(args.imitation_epochs), *(['--imitation-balanced'] if args.imitation_balanced else []),
            *(['--script-comparison'] if args.script_comparison else []),
            '--target-circle', str(args.target_circle), '--time-cost-per-hour', str(args.time_cost_per_hour),
            "--auto-evaluate", '--scenario',args.scenario, *(['--resume', args.resume] if args.resume else [])],
            cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
    (output / "process.json").write_text(json.dumps({"pid": process.pid, "run_id": run_id}))
    # One bounded launch check, not a training-monitoring loop.
    time.sleep(2)
    if process.poll() not in (None, 0):
        failed = json.loads((output / 'manifest.json').read_text())
        failed.update(status='failed', error='Process exited during launch; see train.log')
        (output / 'manifest.json').write_text(json.dumps(failed))
        print((output / "train.log").read_text()[-4000:], file=sys.stderr)
        raise SystemExit("Training exited during launch; inspect saved log")
    manifest = json.loads((output / "manifest.json").read_text())
    print(json.dumps({"run_id": run_id, "pid": process.pid, "status": manifest["status"], "step_cap": args.steps,
        "seconds_cap": args.seconds, "results": str(output),
        "evaluation_seconds_cap": args.evaluation_seconds,
        "dashboard": "http://127.0.0.1:3000/puffer.html"}, indent=2))


if __name__ == "__main__":
    main()
