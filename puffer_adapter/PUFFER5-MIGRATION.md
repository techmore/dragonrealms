# PufferLib 5.0 compatibility assessment

Checked official https://puffer.ai/docs.html on 2026-09-17 UTC.
This machine reports Darwin arm64. The existing adapter uses PufferLib 3.0
and a Python Gymnasium boundary to the actual Node game engine.

## Verified upstream constraints

- 5.0 trains through a CUDA C backend. The FAQ explicitly says there is no
  CPU training option; CPU evaluation/rendering is supported.
- Constellation is a native local/web experiment visualization toolkit.
  The documented workflow builds `cache_data`, then `constellation`, then
  runs `./seethestars`. It is not our installed 3.0 terminal dashboard.
- Native environments use C buffers and lifecycle functions. Our existing
  Gymnasium adapter is not established as a drop-in 5.0 environment.
- CPU evaluation support does not establish that this Mac can train 5.0,
  or that an untested macOS build will compile successfully.

## Migration gates (not completed)

1. Choose an authorized NVIDIA/CUDA worker. Do not rent compute, install a
   downloaded installer, or upload checkpoints/transcripts without approval.
2. Pin and inspect the 5.0 revision and environment API. Prototype an isolated
   bridge preserving the actual Node engine; do not substitute a simplified game.
3. Replay fixed observation/action sequences and verify identical rewards,
   terminal flags, ranks, requirements, simulated time and command accounting.
4. Validate finite optimizer updates, independent seeded resets, cancellation,
   exclusive run ownership and resource caps.
5. Re-run held-out Circle 20 verification and comparable script baselines.
   Do not assume 3.0 weights or checkpoints can be loaded by 5.0.
6. Keep our game dashboard alongside native Constellation views. Import only
   explicitly scoped structured experiment metrics; retain local privacy defaults.

No upgrade, remote provisioning, transfer or replacement has been performed.
