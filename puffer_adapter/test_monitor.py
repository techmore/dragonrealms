import unittest
from .monitor import render, safe

class MonitorTests(unittest.TestCase):
    def test_readonly_unknown_stale_and_matching_run(self):
        self.assertIn('unavailable',render({},{}))
        manifest = dict(run_id='puffer-test',status='running',target_circle=20,updated_at=1)
        row = dict(policy='trained_greedy',seed=1,circle=20,requirements={'ok':True},death=False)
        progress = dict(run_id='puffer-test',rows=[row,row],completed_episodes=1)
        text = render(manifest,progress,now=100)
        self.assertIn('STALE/UNKNOWN',text)
        self.assertIn('1 / 1 finished episodes',text)
        self.assertNotIn('finished episodes reached',render(manifest,{**progress,'run_id':'other'},100))
        self.assertNotIn('\x1b',safe('\x1b[2Jhello'))

if __name__ == '__main__': unittest.main()
