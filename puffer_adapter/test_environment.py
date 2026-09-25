import unittest

import numpy as np
from gymnasium.utils.env_checker import check_env

from puffer_adapter.environment import DragonRealmsEnv


class EnvironmentTest(unittest.TestCase):
    def test_higher_curriculum_keeps_playing_after_circle2(self):
        env = DragonRealmsEnv('barbarian', target_circle=3)
        try:
            self.assertEqual(env.specification['target_circle'], 3)
            env.reset(seed=0)
            for step in range(400):
                action = 8 if env.last_info['requirements']['ok'] else step % 12
                _, _, terminated, truncated, _ = env.step(action)
                if terminated or truncated:
                    break
            self.assertEqual(env.last_info['circle'], 3)
            self.assertFalse(env.last_info['death'])
            self.assertEqual([m['circle'] for m in env.last_info['milestones']], [2,3])
            for milestone in env.last_info['milestones']:
                self.assertTrue(milestone['requirements']['ok'])
                self.assertGreater(milestone['commands'], 0)
            self.assertTrue(all(m['requirements']['ok'] for m in env.circle_milestones))
        finally:
            env.close()
        env = DragonRealmsEnv('barbarian', target_circle=20)
        try:
            definitions = env.specification['requirements_by_circle']['20']
            self.assertEqual(next(r['need'] for r in definitions if r['label']=='1st weapon'),90)
        finally:
            env.close()

    def test_barbarian_wrapper_has_separate_guild_and_action_contract(self):
        env = DragonRealmsEnv('barbarian')
        try:
            self.assertEqual(env.specification['guild'], 'barbarian')
            self.assertEqual(env.specification['race'], 'gortog')
            self.assertEqual(env.action_space.n, 12)
            self.assertNotIn('magic', env.specification['actions'])
            self.assertEqual(len(env.specification['requirement_labels']), 19)
            self.assertEqual(len(env.specification['economic_feature_labels']),13)
            self.assertEqual(env.specification['item_costs']['broadsword'],650)
            observation, info = env.reset(seed=42)
            self.assertTrue(np.isfinite(observation).all())
            self.assertEqual(env.last_info['guild'], 'barbarian')
            self.assertEqual(env.last_info['silver'],150)
            env.step(env.specification['actions'].index('study'))
            self.assertGreater(env.last_info['skills']['scholarship']['absorbed'], 0)
            self.assertGreater(env.last_info['skills']['appraisal']['absorbed'], 0)
        finally:
            env.close()

    def test_gym_contract_and_rejection(self):
        env = DragonRealmsEnv()
        try:
            check_env(env, skip_render_check=True)
            observation, info = env.reset(seed=42)
            self.assertTrue(np.isfinite(observation).all())
            with self.assertRaises(ValueError):
                env.step("look; drop all")
            with self.assertRaises(ValueError):
                env.step(env.action_space.n)
        finally:
            env.close()
        self.assertIsNotNone(env.process.poll())


if __name__ == "__main__":
    unittest.main()
