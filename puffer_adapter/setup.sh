#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
UV=${UV:-uv}
"$UV" venv --python 3.11 .puffer-venv
"$UV" pip install --python .puffer-venv/bin/python \
  'numpy==1.26.4' 'torch==2.14.0' 'setuptools==84.0.0' wheel cython ninja \
  'gym==0.23.0' 'gymnasium==1.3.0' shimmy pettingzoo psutil rich rich_argparse \
  imageio gpytorch scikit-learn heavyball neptune wandb nvidia-ml-py
source_dir=$(mktemp -d -t dr-puffer-source)
git clone --filter=blob:none --no-checkout https://github.com/PufferAI/PufferLib.git "$source_dir"
git -C "$source_dir" checkout 3b5c6046bb8b46685d62d151720025507e3418c2
git -C "$source_dir" apply "$PWD/puffer_adapter/pufferlib-no-ocean.patch"
NO_OCEAN=1 MAX_JOBS=2 "$UV" pip install --python .puffer-venv/bin/python \
  --no-build-isolation --no-deps "$source_dir"
printf 'Installed pinned PufferLib CPU trainer. Build source retained at %s\n' "$source_dir"
