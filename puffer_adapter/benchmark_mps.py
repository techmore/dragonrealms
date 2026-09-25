"""Bounded device microbenchmark: recorded observations, no game or model writes.

Run: .puffer-venv/bin/python -m puffer_adapter.benchmark_mps RUN_ID
This measures inference and a surrogate optimizer workload, NOT full PPO.
"""
import argparse
import copy
import hashlib
import json
import platform
import statistics
import time
from types import SimpleNamespace
from pathlib import Path

import numpy as np
import torch
import pufferlib.models
from gymnasium import spaces

from .guardrails import ROOT, load_parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_id')
    args = parser.parse_args()
    if not args.run_id.replace('-', '').isalnum():
        parser.error('Invalid run ID')
    manifest = json.loads((ROOT / 'public/live/puffer' / args.run_id / 'manifest.json').read_text())
    # Benchmark a historical model, not its compatibility with today's engine.
    manifest = load_parent(args.run_id, manifest['engine_contract'])
    if not torch.backends.mps.is_available():
        raise RuntimeError('MPS unavailable; nothing changed')
    torch.set_num_threads(2)
    torch.manual_seed(71)
    with np.load(ROOT / '.puffer-runtime' / args.run_id / 'demonstrations.npz', allow_pickle=False) as data:
        obs = torch.tensor(data['observations'][:2048], dtype=torch.float32)
        labels = torch.tensor(data['actions'][:2048], dtype=torch.int64)
    space = spaces.Box(-np.inf, np.inf, shape=(obs.shape[1],), dtype=np.float32)
    env = SimpleNamespace(single_observation_space=space, observation_space=space,
                          single_action_space=spaces.Discrete(12))
    base = pufferlib.models.Default(env, hidden_size=64)
    base.load_state_dict(torch.load(manifest['checkpoint'], map_location='cpu', weights_only=True))
    base.eval()
    report = dict(run_id=args.run_id, torch=torch.__version__, platform=platform.platform(),
                  cpu_threads=2, checkpoint_sha256=manifest['checkpoint_sha256'],
                  scope='Microbenchmark only; no environment steps, PPO advantages, or saved weight changes',
                  warmup=10, repetitions=3, iterations=50, timings=[])

    def sync(device):
        if device == 'mps':
            torch.mps.synchronize()

    with torch.no_grad():
        expected = base(obs)
        actual = copy.deepcopy(base).to('mps')(obs.to('mps'))
        report['forward_max_abs_error'] = max((a.cpu() - b).abs().max().item() for a, b in zip(actual, expected))
        report['greedy_action_agreement'] = (actual[0].cpu().argmax(-1) == expected[0].argmax(-1)).float().mean().item()

    for device in ('cpu', 'mps'):
        for batch, training in ((1, False), (128, True), (2048, True)):
            model = copy.deepcopy(base).to(device)
            optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
            x, y = obs[:batch].to(device), labels[:batch].to(device)

            def step():
                if training:
                    optimizer.zero_grad(set_to_none=True)
                    logits, values = model(x)
                    loss = torch.nn.functional.cross_entropy(logits, y) + 0.5 * values.square().mean()
                    loss.backward()
                    optimizer.step()
                    return loss
                with torch.no_grad():
                    # Include host/device transfer and action retrieval for single-agent play.
                    return model(obs[:1].to(device))[0].argmax(-1).cpu()

            for _ in range(10):
                step()
            sync(device)
            durations = []
            for _ in range(3):
                start = time.perf_counter()
                for _ in range(50):
                    result = step()
                sync(device)
                durations.append((time.perf_counter() - start) * 1000 / 50)
            if not torch.isfinite(result).all().item() or not all(torch.isfinite(p).all().item() for p in model.parameters()):
                raise RuntimeError('Non-finite benchmark result')
            report['timings'].append(dict(device=device, batch=batch, mode='surrogate_update' if training else 'inference_roundtrip',
                                          median_ms=statistics.median(durations), samples_ms=durations))
    if hashlib.sha256(Path(manifest['checkpoint']).read_bytes()).hexdigest() != manifest['checkpoint_sha256']:
        raise RuntimeError('Source checkpoint changed during benchmark')
    report['checkpoint_unchanged'] = True
    output = ROOT / '.puffer-runtime' / f'mps-benchmark-{time.time_ns()}.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(report_path=str(output), **report), indent=2))


if __name__ == '__main__':
    main()
