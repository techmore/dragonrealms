import unittest
from .teacher import choose_activity


class TeacherTest(unittest.TestCase):
    def state(self):
        info = dict(guild='barbarian',death=False,silver=1000,inventory=[],equipment={},
            skills={skill:{'rank':0} for skill in ['small_edged','blunt','large_edged','staff','foraging','perception','stealth','first_aid']},
            requirements=dict(ok=False,rows=[dict(label='1st weapon',have=0,need=8)]))
        spec = dict(actions=['perform','guild','study','barbarian_arts','knife_combat','club_combat','sword_combat','staff_combat','stealth','field_medicine'],
            item_costs=dict(padded_cloth=40,shield_wood=70,dagger=25,club=112,broadsword=650,staff=112))
        return info,spec

    def test_fund_real_kit_before_trying_unaffordable_combat(self):
        info,spec = self.state(); info['silver']=150
        self.assertEqual(choose_activity(info,spec)['activity'],'perform')
        info['silver']=1000
        self.assertEqual(choose_activity(info,spec)['activity'],'knife_combat')

    def test_closed_gates_go_to_guild_and_unknowns_fail_closed(self):
        info,spec = self.state(); info['requirements']['ok']=True
        with self.assertRaises(ValueError): choose_activity(info,spec)
        info['requirements']['rows'][0]['have']=8
        self.assertEqual(choose_activity(info,spec)['activity'],'guild')
        info,spec=self.state();del info['silver']
        with self.assertRaises(ValueError): choose_activity(info,spec)
        info,spec=self.state();spec['item_costs'].pop('broadsword')
        with self.assertRaises(ValueError): choose_activity(info,spec)

    def test_does_not_keep_training_a_satisfied_weapon_lane(self):
        info,spec=self.state()
        info['skills']['small_edged']['rank']=100
        info['requirements']['rows']=[dict(label='1st weapon',have=100,need=8),dict(label='2nd weapon',have=0,need=8)]
        self.assertEqual(choose_activity(info,spec)['activity'],'club_combat')

    def test_teacher_uses_known_survival_and_lore_lanes(self):
        info,spec=self.state()
        for label,action in [('inner_fire','barbarian_arts'),('2nd lore','study'),('1st survival','field_medicine')]:
            info['requirements']['rows']=[dict(label=label,have=0,need=4)]
            self.assertEqual(choose_activity(info,spec)['activity'],action)
