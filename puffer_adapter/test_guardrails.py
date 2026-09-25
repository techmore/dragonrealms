import unittest
from puffer_adapter.guardrails import decide, load_parent, decide_circling
from copy import deepcopy


class GateTest(unittest.TestCase):
    def circle_rows(self):
        return [dict(policy='trained_greedy', seed=seed, circle=2, death=False, steps=415,
            requirement_gap=0, commands=30583, simulated_seconds=299676,
            requirements={'ok':True,'missing':[],'rows':[{'label':'first_aid','have':4,'need':4}]},
            milestones=[{'circle':2,'step':415}]) for seed in range(5)]

    def test_circle_milestone_gate_never_deploys(self):
        result=decide_circling(self.circle_rows(), ['first_aid'], 2048)
        self.assertEqual(result['status'],'approval_required')
        self.assertEqual(result['circle_successes'],5)
        self.assertFalse(result['eligible'])

    def test_circle20_requires_every_intermediate_gate(self):
        definitions = {str(circle): [{'label':'first_aid', 'need':circle * 2}] for circle in range(2,21)}
        rows = self.circle_rows()
        for row in rows:
            row['circle'] = 20
            row['steps'] = 200
            row['milestones'] = [dict(circle=c, step=c*10, simulated_seconds=c*100,
                commands=c*20, requirements=dict(ok=True, missing=[], rows=[dict(label='first_aid', have=c*2, need=c*2)])) for c in range(2,21)]
            row['requirements'] = deepcopy(row['milestones'][-1]['requirements'])
        self.assertEqual(decide_circling(rows,['first_aid'],2048,20,definitions)['status'],'approval_required')
        self.assertEqual(decide_circling(rows,['first_aid'],2048,20)['status'],'rejected')
        for mutation in ('missing', 'wrong_need', 'out_of_order'):
            broken = deepcopy(rows)
            if mutation == 'missing':
                broken[0]['milestones'].pop(3)
            elif mutation == 'wrong_need':
                broken[0]['milestones'][3]['requirements']['rows'][0]['need'] = 1
            else:
                broken[0]['milestones'][3]['step'] = 1
            self.assertEqual(decide_circling(broken,['first_aid'],2048,20,definitions)['status'],'rejected')

    def test_circle_incomplete_or_unsafe_evidence_rejected(self):
        for field,value in [('circle',1),('death',True),('steps',2049),('steps',0),
                ('requirement_gap',1),('commands',None),('simulated_seconds',float('nan')),
                ('milestones',[]),('requirements',{'ok':True,'rows':[],'missing':[]})]:
            with self.subTest(field=field):
                rows=self.circle_rows(); rows[0][field]=value
                self.assertEqual(decide_circling(rows,['first_aid'],2048)['status'],'rejected')
        for rows in [[],self.circle_rows()[:4],self.circle_rows()+[deepcopy(self.circle_rows()[0])]]:
            self.assertEqual(decide_circling(rows,['first_aid'],2048)['status'],'rejected')
        self.assertEqual(decide_circling(self.circle_rows(),['first_aid','parry'],2048)['status'],'rejected')
        rows=self.circle_rows(); rows[0]['requirements']['rows'][0]['have']=3
        self.assertEqual(decide_circling(rows,['first_aid'],2048)['status'],'rejected')

    def rows(self):
        return [dict(policy=policy, seed=seed, steps=128, death=False,
                     absorbed_gain=100 if policy == 'trained_greedy' else 90,
                     weakest_skill_gain=10)
                for policy in ('trained_greedy', 'scripted_rotation') for seed in range(5)]

    def test_matched_improvement(self):
        self.assertTrue(decide(self.rows(), ['scripted_rotation'])['eligible'])

    def test_fail_closed(self):
        for key, value in [('weakest_skill_gain', 0), ('absorbed_gain', float('nan')),
                           ('death', True), ('steps', 127), ('absorbed_gain', 80)]:
            with self.subTest(key=key, value=value):
                rows = self.rows()
                rows[0][key] = value
                self.assertFalse(decide(rows, ['scripted_rotation'])['eligible'])
        self.assertFalse(decide(self.rows()[1:], ['scripted_rotation'])['eligible'])
        self.assertFalse(decide(self.rows(), [])['eligible'])

    def test_plateau_and_bad_parent(self):
        rows = self.rows()
        for row in rows:
            row['absorbed_gain'] = 90
        self.assertFalse(decide(rows, ['scripted_rotation'])['eligible'])
        with self.assertRaises(ValueError):
            load_parent('../../outside', 'fake')


if __name__ == '__main__':
    unittest.main()
