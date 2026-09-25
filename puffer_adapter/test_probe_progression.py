import json
import subprocess
import sys
import unittest
import uuid
from .environment import ROOT


class ProbeTest(unittest.TestCase):
    def test_real_probe_obeys_activity_cap_without_claiming_learning(self):
        run_id='puffer-probe-test-'+uuid.uuid4().hex[:10]
        directory=ROOT/'public/live/puffer'/run_id
        directory.mkdir()
        result=subprocess.run([sys.executable,'-m','puffer_adapter.probe_progression','--worker',
            '--run-id',run_id,'--target-circle','20','--activities','2','--seconds','10'],cwd=ROOT,
            capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        state=json.loads((directory/'manifest.json').read_text())
        self.assertEqual(state['steps'],2)
        self.assertEqual(state['updates'],0)
        self.assertEqual(state['stop_reason'],'activity_cap')
        self.assertEqual(state['run_kind'],'scripted_feasibility')
        self.assertFalse(state['scripted_target_reached'])
        self.assertFalse(state['promotion']['eligible'])
        self.assertEqual(state['target_circle'],20)
        self.assertTrue(state['source_unchanged'])
