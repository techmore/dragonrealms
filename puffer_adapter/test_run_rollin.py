import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock
from . import run


class RunRollinTests(unittest.TestCase):
    def test_detached_launcher_forwards_recovery_mode_and_caps(self):
        argv=['run','--resume','puffer-parent','--demonstration-episodes','8',
            '--demonstration-teacher','requirements','--demonstration-rollin-steps','64',
            '--target-circle','20','--steps','4096','--seconds','600','--evaluation-seconds','900']
        child=Mock(pid=123);child.poll.return_value=None
        with tempfile.TemporaryDirectory() as directory, patch.object(run,'ROOT',Path(directory)), \
             patch('sys.argv',argv), patch.object(run.subprocess,'Popen',return_value=child) as spawn, \
             patch.object(run.time,'sleep'), contextlib.redirect_stdout(io.StringIO()):
            run.main()
            command=spawn.call_args.args[0]
            for flag,value in [('--demonstration-rollin-steps','64'),('--target-circle','20'),
                               ('--steps','4096'),('--seconds','600'),('--evaluation-seconds','900')]:
                self.assertEqual(command[command.index(flag)+1],value)
            self.assertIn('--auto-evaluate',command)
            self.assertTrue(spawn.call_args.kwargs['start_new_session'])

    def test_invalid_recovery_launch_cannot_spawn(self):
        for args in [['--demonstration-rollin-steps','1'],['--demonstration-rollin-steps','257']]:
            with patch('sys.argv',['run',*args]), patch.object(run.subprocess,'Popen') as spawn, \
                 contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                run.main()
            spawn.assert_not_called()
