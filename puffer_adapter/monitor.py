"""Read-only terminal view of saved telemetry, not PufferLib's native dashboard."""
import argparse
import json
import math
from pathlib import Path
import re
import sys
import time

ROOT = Path(__file__).resolve().parent.parent / 'public/live/puffer'

def safe(value):
    # Never pass terminal control sequences from saved text through to the tty.
    return ''.join(c for c in str(value if value is not None else 'unknown') if c.isprintable())[:160]

def read(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}

def render(manifest, progress, now=None):
    now = time.time() if now is None else now
    run = manifest.get('run_id')
    if not run:
        return 'Telemetry unavailable. No training process has been changed.'
    progress = progress if progress.get('run_id') == run else {}
    updated = progress.get('updated_at', manifest.get('updated_at'))
    age = now-updated if type(updated) in (int,float) and math.isfinite(updated) else None
    active = manifest.get('status') in ('running','starting') or manifest.get('evaluation_status') == 'running'
    freshness = 'unknown' if age is None or age < -5 else f'{max(0,int(age))}s old'
    if active and (age is None or age < -5 or age > 15):
        freshness += ' — STALE/UNKNOWN; not proof of a running process'
    target = manifest.get('target_circle', manifest.get('environment',{}).get('target_circle'))
    lines = ['DR PUFFER · saved-telemetry viewer (read-only; not native Puffer UI)',
        f'Run: {safe(run)}',
        f'Reported: {safe(manifest.get("status"))} | evaluation: {safe(manifest.get("evaluation_status"))} | {freshness}',
        f'Target: Circle {safe(target)} | PPO updates: {safe(manifest.get("updates"))}',
        f'Training samples: {safe(manifest.get("steps"))} / {safe(manifest.get("step_cap"))}',
        f'Finished evaluation episodes: {safe(progress.get("completed_episodes"))}']
    current = progress.get('current') or {}
    if current:
        lines += [f'Now: {safe(current.get("policy"))} / seed {safe(current.get("seed"))}',
            f'Circle {safe(current.get("circle"))} | gap {safe(current.get("requirement_gap"))} | commands {safe(current.get("commands"))} | simulated seconds {safe(current.get("simulated_seconds"))}']
    counts = {}
    for row in progress.get('rows',[]):
        if not isinstance(row,dict): continue
        policy, seed = row.get('policy'), row.get('seed')
        if not isinstance(policy,str) or type(seed) is not int: continue
        success = (type(target) is int and type(row.get('circle')) is int
            and row['circle'] >= target and row.get('requirements',{}).get('ok') is True and row.get('death') is False)
        counts.setdefault(policy,{})[seed] = success
    for policy, seeds in counts.items():
        lines.append(f'{safe(policy):28} {sum(seeds.values())} / {len(seeds)} finished episodes reached target')
    lines += ['Counts are screening evidence, not promotion or superiority over scripts.',
        'Ctrl+C closes this viewer only. Training/evaluation continues.']
    return '\n'.join(lines)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', help='Saved run ID; otherwise follow latest')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if args.run and not re.fullmatch(r'puffer-[a-zA-Z0-9-]{1,100}',args.run): parser.error('Invalid run ID')
    try:
        while True:
            manifest = read(ROOT / args.run / 'manifest.json' if args.run else ROOT / 'latest.json')
            run = manifest.get('run_id','')
            progress = read(ROOT / run / 'evaluation-progress.json') if isinstance(run,str) and re.fullmatch(r'puffer-[a-zA-Z0-9-]{1,100}',run) else {}
            if sys.stdout.isatty() and not args.once: print('\033[2J\033[H',end='')
            print(render(manifest,progress),flush=True)
            if args.once: return
            time.sleep(2)
    except KeyboardInterrupt:
        print('\nViewer closed; no stop signal sent to training.')

if __name__ == '__main__': main()
