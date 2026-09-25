"""Contain PufferLib 3's import-time resources symlink in ignored runtime data."""
import importlib
import os
from pathlib import Path


def load_pufferlib():
    directory = Path(__file__).resolve().parent.parent / ".puffer-runtime"
    directory.mkdir(exist_ok=True)
    previous = Path.cwd()
    try:
        os.chdir(directory)
        return importlib.import_module("pufferlib")
    finally:
        os.chdir(previous)
