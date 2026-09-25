"""Integration test: real upstream optimizer and graceful stop, no fake trainer."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import unittest
import uuid

from puffer_adapter.environment import ROOT


class TrainingTest(unittest.TestCase):
    def test_actual_updates_checkpoint_and_stop(self):
        run_id = "puffer-test-" + uuid.uuid4().hex[:12]
        output = ROOT / "public/live/puffer" / run_id
        output.mkdir(parents=True)
        with (output / "test.log").open("w") as stream:
            process = subprocess.Popen([sys.executable, "-m", "puffer_adapter.train",
                "--run-id", run_id, "--scenario", "skilling", "--steps", "1048576", "--seconds", "60", "--no-publish-latest", "--terminal-dashboard", "native"],
                cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 30
                state = {}
                while time.monotonic() < deadline and process.poll() is None:
                    manifest = output / "manifest.json"
                    if manifest.exists():
                        state = json.loads(manifest.read_text())
                        if state.get("updates", 0) >= 1:
                            break
                    time.sleep(0.1)
                self.assertGreaterEqual(state.get("updates", 0), 1, (output / "test.log").read_text())
                process.send_signal(signal.SIGTERM)
                self.assertEqual(process.wait(timeout=15), 0)
                state = json.loads((output / "manifest.json").read_text())
                self.assertEqual(state["status"], "stopped")
                self.assertEqual(state['terminal_dashboard'], 'native')
                self.assertTrue(state["weights_changed"])
                self.assertNotEqual(state["initial_weights_sha256"], state["current_weights_sha256"])
                self.assertIsInstance(state["loss"], float)
                self.assertTrue(Path(state["checkpoint"]).is_file())
                child_id = run_id + '-continued'
                continued = subprocess.run([sys.executable, '-m', 'puffer_adapter.train',
                    '--run-id', child_id, '--scenario', 'skilling', '--resume', run_id, '--steps', '128', '--seconds', '60',
                    '--auto-evaluate', '--no-publish-latest'], cwd=ROOT,
                    stdout=stream, stderr=subprocess.STDOUT, timeout=30)
                self.assertEqual(continued.returncode, 0)
                child = json.loads((ROOT / 'public/live/puffer' / child_id / 'manifest.json').read_text())
                self.assertEqual(child['initial_weights_sha256'], state['current_weights_sha256'])
                self.assertEqual(child['parent_run'], run_id)
                self.assertEqual(child['evaluation_status'], 'completed')
                self.assertEqual(child['evaluation_seconds_cap'], 3600)
                self.assertGreaterEqual(child['evaluation_started_at'], child['started_at'])
                self.assertFalse(child['promotion']['eligible'], 'EXP-only track policy must not pass balance gate')
                self.assertTrue((ROOT / 'public/live/puffer' / child_id / 'evaluation.json').exists())
                progress = json.loads((ROOT / 'public/live/puffer' / child_id / 'evaluation-progress.json').read_text())
                self.assertEqual(progress['status'], 'completed')
                self.assertEqual(progress['completed_episodes'], 30)
                evaluation = json.loads((ROOT / 'public/live/puffer' / child_id / 'evaluation.json').read_text())
                self.assertTrue(evaluation['weights_unchanged'])
                self.assertTrue(evaluation['parent_weights_unchanged'])
                policies = {row['policy'] for row in evaluation['rows']}
                self.assertEqual(policies, {'trained_greedy', 'trained_sampled', 'parent', 'parent_sampled', 'random', 'scripted_rotation'})
                seed_sets = [{row['seed'] for row in evaluation['rows'] if row['policy'] == mode} for mode in policies]
                self.assertTrue(all(seeds == seed_sets[0] for seeds in seed_sets))
                self.assertFalse(progress['promotion_eligible'])
                self.assertEqual(child['evaluation_progress']['status'], 'completed')
                self.assertTrue(all('commands' in row and 'requirements' in row for row in progress['rows']))
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=15)


if __name__ == "__main__":
    unittest.main()
