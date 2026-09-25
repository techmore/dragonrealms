import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
from . import validate


class ValidateLauncherTests(unittest.TestCase):
    def test_launch_is_detached_and_preserves_explicit_seed_and_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'public/live/puffer').mkdir(parents=True)
            child=Mock(pid=123);child.poll.return_value=None
            argv=['validate','puffer-source','--seed-start','15000000','--seconds','900',
                '--run-id','puffer-validation-fixture','--launch']
            with patch.object(validate,'ROOT',root),patch('sys.argv',argv), \
                 patch.object(validate.subprocess,'Popen',return_value=child) as spawn, \
                 patch.object(validate.time,'sleep'),contextlib.redirect_stdout(io.StringIO()) as output:
                validate.main()
            command=spawn.call_args.args[0]
            self.assertEqual(command[command.index('--seed-start')+1],'15000000')
            self.assertEqual(command[command.index('--seconds')+1],'900')
            self.assertNotIn('--launch',command)
            self.assertTrue(spawn.call_args.kwargs['start_new_session'])
            self.assertIn('"verified": false',output.getvalue())

    def test_invalid_caps_and_busy_lock_do_not_evaluate(self):
        with patch('sys.argv',['validate','puffer-source','--seed-start','999','--launch']), \
             patch.object(validate.subprocess,'Popen') as spawn,contextlib.redirect_stderr(io.StringIO()), \
             self.assertRaises(SystemExit):
            validate.main()
        spawn.assert_not_called()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'.puffer-runtime').mkdir()
            with patch.object(validate,'ROOT',root),patch('sys.argv',['validate','puffer-source','--seed-start','15000000']), \
                 patch.object(validate.fcntl,'flock',side_effect=BlockingIOError),self.assertRaises(BlockingIOError):
                validate.main()
