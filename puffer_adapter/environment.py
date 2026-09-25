"""Gymnasium boundary to the real Node game engine, over private pipes."""
import json
import os
from pathlib import Path
import selectors
import subprocess

import gymnasium as gym
import numpy as np

ROOT = Path(__file__).resolve().parent.parent


class DragonRealmsEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, scenario="skilling", target_circle=2, time_cost_per_hour=0):
        if scenario not in ('skilling', 'circling', 'barbarian'):
            raise ValueError('Unknown scenario')
        if type(target_circle) is not int or not 2 <= target_circle <= 20:
            raise ValueError('Target circle must be 2..20')
        if not isinstance(time_cost_per_hour, (int, float)) or not np.isfinite(time_cost_per_hour) or not 0 <= time_cost_per_hour <= 1:
            raise ValueError('Invalid time cost')
        if scenario != 'barbarian' and (target_circle != 2 or time_cost_per_hour != 0):
            raise ValueError('Higher curriculum is Barbarian only')
        engine = 'engine_circle.mjs' if scenario in ('circling', 'barbarian') else 'engine.mjs'
        self.process = subprocess.Popen(
            [os.environ.get("DR_NODE", "node"), str(ROOT / 'puffer_adapter' / engine),
             *(['--guild', 'barbarian', '--target-circle', str(target_circle),
                '--time-cost-per-hour', str(time_cost_per_hour)] if scenario == 'barbarian' else [])],
            cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, bufsize=1,
        )
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        try:
            self.specification = self._request({"op": "spec"})
            self.action_space = gym.spaces.Discrete(len(self.specification["actions"]))
            self.observation_space = gym.spaces.Box(
                -np.inf, np.inf, (self.specification["observation_size"],), np.float32)
        except BaseException:
            self.close()
            raise
        self.last_info = {}
        self.episodes = 0
        self.total_reward = 0.0
        self.max_circle = 1
        self.circle_milestones = []

    def _request(self, request):
        if self.process.poll() is not None:
            raise RuntimeError("DR engine disconnected")
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        if not self.selector.select(timeout=15):
            self.process.kill()
            raise TimeoutError("DR engine heartbeat timed out")
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("DR engine closed its observation stream")
        result = json.loads(line)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result

    def _observation(self, result):
        obs = np.asarray(result["observation"], dtype=np.float32)
        if obs.shape != self.observation_space.shape or not np.isfinite(obs).all():
            raise ValueError("Unknown/invalid engine observation")
        self.last_info = result.get("info", {})
        return obs

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        result = self._request({"op": "reset", "seed": seed if seed is not None else 42})
        obs = self._observation(result)
        return obs, self._numeric_info()

    def _numeric_info(self):
        return {k: v for k, v in self.last_info.items()
                if isinstance(v, (int, float)) and np.isfinite(v)}

    def step(self, action):
        if not self.action_space.contains(action):
            raise ValueError("Action is not allowlisted")
        result = self._request({"op": "step", "action": int(action)})
        obs = self._observation(result)
        reward = float(result["reward"])
        if not np.isfinite(reward):
            raise ValueError("Invalid reward")
        self.total_reward += reward
        circle=self.last_info.get('circle',1)
        if circle>self.max_circle:
            import time
            self.max_circle=circle
            earned = next((m for m in reversed(self.last_info.get('milestones', [])) if m.get('circle') == circle), {})
            self.circle_milestones.append(dict(circle=circle,timestamp=time.time(),episode=self.episodes,
                commands=self.last_info.get('commands'),simulated_seconds=self.last_info.get('simulated_seconds'),
                requirements=earned.get('requirements', self.last_info.get('requirements')),milestones=self.last_info.get('milestones')))
        self.episodes += int(result["terminated"] or result["truncated"])
        # Puffer's aggregate logger expects numerical info; detailed spec stays local.
        info = self._numeric_info()
        return obs, reward, bool(result["terminated"]), bool(result["truncated"]), info

    def close(self):
        if getattr(self, "process", None):
            if self.process.poll() is None:
                self.process.stdin.close()
                try:
                    self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.process.terminate()
                    try:
                        self.process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        self.process.kill()
                        self.process.wait()
            self.process.stdout.close()
        if getattr(self, "selector", None):
            self.selector.close()
