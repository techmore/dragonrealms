import unittest
from .terminal_display import native_dashboard

class TerminalDisplayTests(unittest.TestCase):
    def test_auto_preserves_native_interactive_and_quiet_detached(self):
        self.assertTrue(native_dashboard('auto',True))
        self.assertFalse(native_dashboard('auto',False))
        self.assertTrue(native_dashboard('native',False))
        self.assertFalse(native_dashboard('quiet',True))
        with self.assertRaises(ValueError): native_dashboard('invalid',True)
