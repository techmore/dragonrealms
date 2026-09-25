import unittest
from .budget import evaluation_deadline


class BudgetTest(unittest.TestCase):
    def test_evaluation_starts_with_its_own_budget(self):
        self.assertEqual(evaluation_deadline(3600, 145), 3745)
        self.assertEqual(evaluation_deadline(1, 600), 601)

    def test_invalid_budget_rejected(self):
        for value in (0, -1, 3601, 1.5, True, None):
            with self.assertRaises(ValueError):
                evaluation_deadline(value, 0)
