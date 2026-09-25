import json
from pathlib import Path
import tempfile
import unittest
from .validation_plan import reserve_validation


class ValidationPlanTests(unittest.TestCase):
    def test_new_output_preserves_source_and_rejects_reused_seeds(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'puffer-source';source.mkdir()
            data=json.dumps({'rows':[{'seed':2000}]})
            (source/'evaluation.json').write_text(data)
            for seeds in ([2000], [999], [True]):
                with self.assertRaises(ValueError):
                    reserve_validation(root,'puffer-source','puffer-validation-invalid',seeds,1)
            output,seeds=reserve_validation(root,'puffer-source','puffer-validation-new',[3000],1)
            self.assertEqual(seeds,[3000]);self.assertTrue(output.is_dir())
            self.assertEqual((source/'evaluation.json').read_text(),data)
            with self.assertRaises(FileExistsError):
                reserve_validation(root,'puffer-source','puffer-validation-new',[3001],1)
            (output/'manifest.json').write_text(json.dumps({'validation_seeds':[3000]}))
            with self.assertRaises(ValueError):
                reserve_validation(root,'puffer-source','puffer-validation-other',[3000],1)
