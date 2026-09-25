import unittest
from .script_benchmark import evaluate_script, compare_production, comparison_plan


class ScriptBenchmarkTest(unittest.TestCase):
    def test_five_seed_report_runs_the_real_worker(self):
        manifest=dict(run_id='puffer-test-real',scenario='barbarian',guild='barbarian',target_circle=20)
        evaluation=dict(run_id='puffer-test-real',weights_unchanged=True,updates_during_evaluation=0,
            rows=[dict(policy='trained_greedy',seed=i,commands=50,simulated_seconds=300) for i in range(5)])
        result=compare_production(manifest,evaluation,cancelled=lambda:False,publish=lambda row:None)
        self.assertEqual(len(result['rows']),5)
        self.assertTrue(all(r['baseline']['database_isolated'] for r in result['rows']))
        self.assertTrue(all(r['baseline']['source_unchanged'] for r in result['rows']))
        self.assertTrue(all(r['baseline']['seed']==r['seed'] for r in result['rows']))
        self.assertFalse(result['promotion_eligible'])
        self.assertFalse(result['control_equivalent_to_sims'])
        self.assertEqual(result['comparison_validity'],'limited_fixed_arena_control')

    def test_comparison_matches_candidate_budgets_and_retains_partial_evidence(self):
        manifest=dict(run_id='puffer-test',scenario='barbarian',guild='barbarian',target_circle=20)
        evaluation=dict(run_id='puffer-test',weights_unchanged=True,updates_during_evaluation=0,
            rows=[dict(policy='trained_greedy',seed=i,commands=100+i,simulated_seconds=300+i) for i in range(5)])
        seen=[];receipts=[]
        def fixture_worker(**kw):
            seen.append((kw['seed'],kw['target_circle'],kw['command_cap'],kw['simulated_seconds_cap']))
            return dict(reason='time_cap')
        result=compare_production(manifest,evaluation,cancelled=lambda:False,publish=lambda r:receipts.append(r['status']),worker=fixture_worker)
        self.assertEqual(seen,[(i,20,100+i,300+i) for i in range(5)])
        self.assertEqual(result['status'],'completed')
        self.assertFalse(result['all_resource_tests_complete'])
        self.assertFalse(result['promotion_eligible'])
        evaluation['weights_unchanged']=False
        with self.assertRaises(ValueError):comparison_plan(manifest,evaluation)

    def test_real_engine_worker_obeys_matched_resource_caps(self):
        result=evaluate_script(seed=42,target_circle=20,command_cap=50,simulated_seconds_cap=300,seconds=5)
        self.assertEqual(result['guild'],'barbarian')
        self.assertEqual(result['race'],'gortog')
        self.assertEqual(result['boost'],1)
        self.assertEqual(result['stat_allocation'],dict(con=10,str=10,ref=10))
        self.assertLessEqual(result['commands'],50)
        self.assertLessEqual(result['simulated_seconds'],300.11)
        self.assertTrue(result['database_isolated'])
        self.assertTrue(result['source_unchanged'])
        self.assertTrue(result['script_hashes'])
        self.assertEqual(len(result['requirements']['rows']),19)
        self.assertNotEqual(result['reason'],'target')

    def test_invalid_bounds_and_cancel_fail_closed(self):
        with self.assertRaises(ValueError):
            evaluate_script(seed=1,target_circle=20,command_cap=50,simulated_seconds_cap=300,hall_supervisor='yes')
        with self.assertRaises(ValueError):
            evaluate_script(seed=1,target_circle=21,command_cap=50,simulated_seconds_cap=300)
        with self.assertRaises(InterruptedError):
            evaluate_script(seed=1,target_circle=20,command_cap=50,simulated_seconds_cap=300,cancelled=lambda:True)

    def test_hall_mode_is_explicit_and_remains_a_limited_control(self):
        result=evaluate_script(seed=7740620,target_circle=20,command_cap=500,
            simulated_seconds_cap=10000,seconds=5,hall_supervisor=True)
        self.assertTrue(result['hall_supervisor'])
        self.assertTrue(any(h['event']=='hall_script_return' for h in result['handoffs']))
        manifest=dict(run_id='puffer-hall',scenario='barbarian',guild='barbarian',target_circle=20)
        evaluation=dict(run_id='puffer-hall',weights_unchanged=True,updates_during_evaluation=0,
            rows=[dict(policy='trained_greedy',seed=i,commands=50,simulated_seconds=300) for i in range(5)])
        def worker(**kw):
            self.assertIs(kw['hall_supervisor'],True)
            return dict(reason='command_cap')
        report=compare_production(manifest,evaluation,cancelled=lambda:False,publish=lambda row:None,
            worker=worker,hall_supervisor=True)
        self.assertTrue(report['hall_supervisor'])
        self.assertFalse(report['control_equivalent_to_sims'])
        self.assertFalse(report['promotion_eligible'])
        self.assertEqual(report['comparison_validity'],'limited_fixed_arena_hall_control')
