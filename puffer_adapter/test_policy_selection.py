import unittest
import numpy as np
import torch
from .policy_selection import select_action, select_decision


class PolicySelectionTests(unittest.TestCase):
    def test_diagnostic_probabilities_preserve_exact_sampling_sequence(self):
        policy=lambda obs:(torch.tensor([[.3, -.2, .7]]), None)
        a=torch.Generator().manual_seed(7740620)
        b=torch.Generator().manual_seed(7740620)
        for _ in range(100):
            expected=int(torch.multinomial(policy(None)[0].softmax(-1),1,generator=a).item())
            decision=select_decision(policy,[0.],sampled=True,generator=b)
            self.assertEqual(decision['action'],expected)
            self.assertAlmostEqual(sum(decision['probabilities']),1,places=6)
            self.assertTrue(decision['sampled'])
        self.assertTrue(torch.equal(a.get_state(),b.get_state()))

    def test_seeded_sampling_is_reproducible_and_not_argmax(self):
        policy = lambda obs: (torch.tensor([[0., 0., .1]]), torch.zeros(1))
        before = torch.get_rng_state().clone()
        def sequence(seed):
            generator = torch.Generator().manual_seed(seed)
            return [select_action(policy, np.zeros(2, dtype=np.float32), sampled=True, generator=generator) for _ in range(100)]
        self.assertEqual(sequence(21), sequence(21))
        self.assertNotEqual(sequence(21), sequence(22))
        self.assertEqual(set(sequence(21)), {0, 1, 2})
        self.assertEqual(select_action(policy, [0., 0.]), 2)
        self.assertTrue(torch.equal(before, torch.get_rng_state()))

    def test_invalid_logits_and_unseeded_sampling_fail_closed(self):
        for logits in (torch.tensor([[float('nan'), 0.]]), torch.tensor([1., 2.])):
            with self.assertRaises(ValueError):
                select_action(lambda obs: (logits, None), [0.])
        with self.assertRaises(ValueError):
            select_action(lambda obs: (torch.zeros(1, 2), None), [0.], sampled=True)
