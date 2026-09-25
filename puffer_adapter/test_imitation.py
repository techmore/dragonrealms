import json
import subprocess
import sys
import unittest
import uuid
import hashlib
from pathlib import Path
import numpy as np
import torch
from .environment import ROOT
from .environment import DragonRealmsEnv
import time
from .imitation import behavior_clone, collect_demonstrations
from .guardrails import imitation_checkpoint


class TinyPolicy(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.head = torch.nn.Linear(2, 2)

    def forward(self, x):
        return self.head(x), torch.zeros(len(x))


class ImitationTest(unittest.TestCase):
    def test_balanced_imitation_reports_rare_action_fit_separately(self):
        torch.manual_seed(42)
        x=np.asarray([[10.,0.]]*128+[[0.,10.]]*8,dtype=np.float32)
        y=np.asarray([0]*128+[1]*8)
        result=behavior_clone(TinyPolicy(),x,y,seed=42,epochs=100,balanced=True)
        self.assertTrue(result['balanced'])
        common,rare=result['per_action']
        self.assertEqual(common['examples'],128)
        self.assertEqual(rare['examples'],8)
        self.assertAlmostEqual(rare['loss_weight']/common['loss_weight'],16)
        self.assertEqual(rare['training_accuracy'],1)
        self.assertEqual(common['training_accuracy'],1)

    def test_requirement_teacher_earns_real_circle(self):
        env = DragonRealmsEnv('barbarian')
        try:
            deadline = time.monotonic()+30
            observations, actions, receipts = collect_demonstrations(env,[0],teacher='requirements',
                cancelled=lambda:time.monotonic()>=deadline)
            self.assertTrue(receipts[0]['success'])
            self.assertEqual(receipts[0]['requirement_gap'],0)
            self.assertEqual(len(observations),len(actions))
            self.assertLess(len(actions),2048)
        finally:
            env.close()

    def test_actual_optimizer_learns_labels_and_preserves_global_rng(self):
        torch.manual_seed(42)
        model = TinyPolicy()
        x = np.tile(np.eye(2, dtype=np.float32) * 10, (64, 1))
        y = np.tile([0, 1], 64)
        before = model.head.weight.detach().clone()
        rng = torch.get_rng_state().clone()
        result = behavior_clone(model, x, y, seed=42, epochs=100)
        self.assertGreater(result['training_accuracy'], .99)
        self.assertFalse(torch.equal(before, model.head.weight))
        self.assertTrue(torch.equal(rng, torch.get_rng_state()))

    def test_invalid_data_and_evaluation_seeds_rejected(self):
        with self.assertRaises(ValueError):
            collect_demonstrations(None, [1000], cancelled=lambda: False)
        with self.assertRaises(ValueError):
            behavior_clone(TinyPolicy(), [[float('nan'), 0]], [0], seed=0)
        with self.assertRaises(ValueError):
            behavior_clone(TinyPolicy(), [[0., 0.]], [2], seed=0)
        with self.assertRaises(InterruptedError):
            behavior_clone(TinyPolicy(), [[0., 0.]], [0], seed=0, cancelled=lambda: True)

    def test_real_engine_demonstration_then_puffer_updates(self):
        run_id = 'puffer-test-imitation-' + uuid.uuid4().hex[:10]
        result = subprocess.run([sys.executable, '-m', 'puffer_adapter.train',
            '--run-id', run_id, '--scenario', 'barbarian', '--steps', '128', '--seconds', '60',
            '--demonstration-episodes', '1', '--no-publish-latest'], cwd=ROOT,
            capture_output=True, text=True, timeout=80)
        self.assertEqual(result.returncode, 0, result.stderr[-3000:])
        state = json.loads((ROOT / 'public/live/puffer' / run_id / 'manifest.json').read_text())
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(state['updates'], 1)
        evidence = state['imitation']
        self.assertTrue(evidence['weights_changed'])
        self.assertTrue(evidence['episodes'][0]['success'])
        self.assertEqual(evidence['episodes'][0]['circle'], 2)
        self.assertEqual(evidence['episodes'][0]['requirement_gap'], 0)
        self.assertTrue(evidence['episodes'][0]['requirements']['ok'])
        self.assertGreater(evidence['updates'], 0)
        self.assertEqual(len(evidence['dataset_sha256']), 64)
        self.assertNotEqual(evidence['weights_after'], state['current_weights_sha256'])
        checkpoint = imitation_checkpoint(state)
        self.assertEqual(checkpoint, Path(evidence['checkpoint']))
        self.assertEqual(hashlib.sha256(checkpoint.read_bytes()).hexdigest(), evidence['checkpoint_sha256'])
        continued_id = run_id + '-recovery'
        continued = subprocess.run([sys.executable, '-m', 'puffer_adapter.train',
            '--run-id', continued_id, '--resume', run_id, '--scenario', 'barbarian',
            '--steps', '128', '--seconds', '60', '--demonstration-episodes', '1',
            '--demonstration-teacher', 'requirements', '--demonstration-rollin-steps', '2',
            '--imitation-epochs', '1', '--no-publish-latest'], cwd=ROOT,
            capture_output=True, text=True, timeout=80)
        self.assertEqual(continued.returncode, 0, continued.stderr[-3000:])
        child=json.loads((ROOT/'public/live/puffer'/continued_id/'manifest.json').read_text())
        self.assertEqual(child['demonstration_rollin_steps'],2)
        self.assertTrue(child['imitation']['rollin_weights_unchanged'])
        self.assertGreater(child['imitation']['canonical_examples'],0)
        self.assertGreater(child['imitation']['recovery_examples'],0)
        self.assertEqual([r['seed'] for r in child['imitation']['episodes']],[0,100])
        self.assertEqual([r['rollin_steps'] for r in child['imitation']['episodes']],[0,2])
        # A fresh validation must load checkpoints from their source directory,
        # preserve source evidence, and label cancellation in its own output.
        from .evaluate import evaluate_run
        source_dir=ROOT/'public/live/puffer'/continued_id
        source_before=(source_dir/'manifest.json').read_bytes()
        validation_id='puffer-validation-test-'+uuid.uuid4().hex[:12]
        validation_seed=1000000000+int(uuid.uuid4().hex[:6],16)
        with self.assertRaises(InterruptedError):
            evaluate_run(continued_id,episodes=1,cancelled=lambda:True,
                validation_id=validation_id,validation_seeds=[validation_seed])
        self.assertEqual((source_dir/'manifest.json').read_bytes(),source_before)
        validation=json.loads((ROOT/'public/live/puffer'/validation_id/'manifest.json').read_text())
        self.assertEqual(validation['status'],'interrupted')
        self.assertEqual(validation['parent_run'],continued_id)
        self.assertEqual(validation['validation_seeds'],[validation_seed])
        state['imitation']['checkpoint_sha256'] = 'incorrect'
        with self.assertRaises(ValueError): imitation_checkpoint(state)
        state['imitation']['checkpoint'] = '/tmp/not-owned.pt'
        with self.assertRaises(ValueError): imitation_checkpoint(state)
        self.assertIsNone(imitation_checkpoint({'run_id':run_id}))
