import unittest
from unittest.mock import patch
import numpy as np
import torch
from .imitation import collect_demonstrations


class ReachableEnv:
    specification = dict(actions=['work', 'guild'], baseline_actions=[0], target_circle=2, horizon=5)

    def reset(self, seed):
        self.steps = 0
        self.last_info = dict(circle=1, death=False, requirements={'ok': False}, requirement_gap=1)
        return np.array([0.], dtype=np.float32), self.last_info

    def step(self, action):
        self.steps += 1
        done = self.steps == 5
        self.last_info = dict(circle=2 if done else 1, death=False,
            requirements={'ok': done}, requirement_gap=0 if done else 1,
            milestones=[{'circle': 2}] if done else [])
        return np.array([self.steps], dtype=np.float32), 0., done, False, self.last_info


class RollinTests(unittest.TestCase):
    def test_only_teacher_suffix_is_labeled_and_total_horizon_is_preserved(self):
        policy=lambda obs:(torch.tensor([[100., -100.]]), None)
        with patch('puffer_adapter.teacher.choose_activity', return_value={'action': 1}):
            x,y,receipts=collect_demonstrations(ReachableEnv(),[3],cancelled=lambda:False,
                teacher='requirements',rollin_policy=policy,rollin_steps=2)
        self.assertEqual(x.flatten().tolist(),[2.,3.,4.])
        self.assertEqual(y.tolist(),[1,1,1])
        self.assertEqual(receipts[0]['steps'],5)
        self.assertEqual(receipts[0]['rollin_steps'],2)
        self.assertEqual(receipts[0]['teacher_steps'],3)

    def test_validation_cancellation_and_no_teacher_labels_fail_closed(self):
        policy=lambda obs:(torch.tensor([[100., -100.]]), None)
        for kwargs in ({'rollin_steps':257},{'rollin_steps':1},{'rollin_steps':True}):
            with self.assertRaises(ValueError):
                collect_demonstrations(ReachableEnv(),[0],cancelled=lambda:False,**kwargs)
        with self.assertRaises(InterruptedError):
            collect_demonstrations(ReachableEnv(),[0],cancelled=lambda:True,
                teacher='requirements',rollin_policy=policy,rollin_steps=2)
        with self.assertRaises(ValueError):
            collect_demonstrations(ReachableEnv(),[0],cancelled=lambda:False,
                teacher='requirements',rollin_policy=policy,rollin_steps=5)
        with self.assertRaises(ValueError):
            collect_demonstrations(ReachableEnv(),[7740620],cancelled=lambda:False,
                teacher='requirements',rollin_policy=policy,rollin_steps=2)
