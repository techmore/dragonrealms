import json
from pathlib import Path
import tempfile
import unittest
from .records import build_records


class RecordsTest(unittest.TestCase):
    def test_validation_test_artifacts_stay_out_of_run_discovery(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ['puffer-validation-test-fixture','puffer-validation-real']:
                path=root/name;path.mkdir()
                (path/'manifest.json').write_text(json.dumps(dict(run_id=name,status='interrupted')))
            self.assertEqual([r['run_id'] for r in build_records(root)['runs']],['puffer-validation-real'])

    def test_circle_best_requires_all_verified_seeds_and_keeps_cohorts_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, seed, guild, seconds in [('a',100,'barbarian',10),('b',100,'barbarian',20),
                                                ('c',200,'barbarian',1),('d',100,'ranger',1)]:
                run = root / name
                run.mkdir()
                scenario = 'barbarian' if guild == 'barbarian' else 'circling'
                (run / 'manifest.json').write_text(json.dumps(dict(status='completed',run_id=name,
                    guild=guild,scenario=scenario,engine_contract='same',environment=dict(guild=guild,
                    scenario_name=scenario,horizon=2048,requirement_labels=['test gate']))))
                (run / 'evaluation.json').write_text(json.dumps(dict(run_id=name,weights_unchanged=True,
                    updates_during_evaluation=0,rows=[dict(policy='trained_greedy',seed=i,steps=2,
                    circle=2,death=False,absorbed_gain=10,requirement_gap=0,commands=10,
                    simulated_seconds=seconds,requirements=dict(ok=True,missing=[],
                    rows=[dict(label='test gate',have=2,need=2)]),milestones=[dict(circle=2,step=2)])
                    for i in range(seed,seed+5)])))
            result = build_records(root)
            self.assertEqual(len(result['runs']),4)
            self.assertEqual(len(result['circle_groups']),3)
            group = next(g for g in result['circle_groups'] if 'b' in g['runs'])
            self.assertEqual(group['best']['run_id'],'a')
            path = root / 'a/evaluation.json'
            data = json.loads(path.read_text())
            data['rows'][0]['death'] = True
            path.write_text(json.dumps(data))
            group = next(g for g in build_records(root)['circle_groups'] if 'b' in g['runs'])
            self.assertEqual(group['best']['run_id'],'b')
            data['rows'][0]['death'] = False
            data['rows'][0]['milestones'] = []
            path.write_text(json.dumps(data))
            group = next(g for g in build_records(root)['circle_groups'] if 'b' in g['runs'])
            self.assertEqual(group['best']['run_id'],'b')

    def test_rejected_is_raw_only_and_mismatched_seeds_are_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, seed, status in [('a', 100, 'rejected'), ('b', 200, 'approval_required')]:
                run = root / name
                run.mkdir()
                (run / 'manifest.json').write_text(json.dumps(dict(status='completed', run_id=name,
                    engine_contract='same', environment=dict(scenario='same',horizon=128))))
                (run / 'evaluation.json').write_text(json.dumps(dict(run_id=name, weights_unchanged=True,
                    promotion=dict(status=status, eligible=status=='approval_required'),
                    rows=[dict(policy='trained_greedy', seed=i, steps=128, death=False, absorbed_gain=100) for i in range(seed,seed+5)])))
            groups = build_records(root)['groups']
            self.assertEqual(len(groups),2)
            rejected = next(g for g in groups if 'a' in g['runs'])
            self.assertIsNone(rejected['balanced_exp'])
            self.assertEqual(rejected['raw_exp']['mean_exp'],100)
            (root / 'a/evaluation.json').write_text('{}')
            self.assertEqual(len(build_records(root)['groups']),1)
