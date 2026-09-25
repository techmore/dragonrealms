import unittest
from .watch import watch_snapshot

class WatchTest(unittest.TestCase):
    def test_bounded_local_screen_sample(self):
        info={'room':'pine_needle_path','last_command':'look','credentials':'never publish',
              'last_messages':['\x1b[31mRoom\x1b[0m']*10}
        sample=watch_snapshot(info)
        self.assertEqual(sample['messages'],['Room']*8)
        self.assertNotIn('credentials',sample)
        self.assertEqual(sample['last_command'],'look')
        self.assertEqual(info['last_messages'][0],'\x1b[31mRoom\x1b[0m')
        self.assertEqual(len(watch_snapshot({'last_messages':['x'*3000]})['messages'][0]),2000)
