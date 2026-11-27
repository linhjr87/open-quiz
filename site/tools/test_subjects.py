import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_manifest  # noqa: E402
import merge_comments  # noqa: E402
import subjects  # noqa: E402
import validate  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample.json"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def run_quiet(fn, argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = fn(argv)
    return code, out.getvalue()


class CheckSubjectsTests(unittest.TestCase):
    def test_valid(self):
        raw = {"subjects": [{"code": "MLN131", "name": "CNXHKH", "semester": 9},
                            {"code": "HRM201C", "name": "x", "semester": 3}]}
        self.assertEqual(subjects.check_subjects(raw), [])

    def test_errors(self):
        self.assertTrue(subjects.check_subjects([]))
        raw = {"subjects": [{"code": "mln131", "name": "", "semester": 10},
                            {"code": "VNR202", "name": "a", "semester": True},
                            {"code": "VNR202", "name": "b", "semester": 9}]}
        errors = " | ".join(subjects.check_subjects(raw))
        for part in ("subjects[0].code", "subjects[0].name", "subjects[0].semester",
                     "subjects[1].semester", "duplicate"):
            self.assertIn(part, errors)


class RootTests(unittest.TestCase):
    """data/subjects.json lists MLN131 (one exam) and VNR202 (no exams yet)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "data"
        write_json(self.root / "subjects.json", {"subjects": [
            {"code": "MLN131", "name": "Chủ nghĩa xã hội khoa học", "semester": 9},
            {"code": "VNR202", "name": "Lịch sử Đảng", "semester": 9},
        ]})
        self.root.joinpath("MLN131").mkdir()
        shutil.copy(FIXTURE, self.root / "MLN131" / "TEST-FE.json")

    def build(self):
        return run_quiet(build_manifest.main, [str(self.root)])

    def check(self, *extra):
        return run_quiet(validate.main, ["--check-manifest", *extra, str(self.root)])

    def test_build_all_creates_empty_subject_and_validates(self):
        code, out = self.build()
        self.assertEqual(code, 0)
        self.assertIn("MLN131/index.json: 1 exams", out)
        self.assertIn("VNR202/index.json: 0 exams", out)
        vnr = json.loads((self.root / "VNR202" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(vnr, {"exams": []})
        self.assertFalse((self.root / "index.json").exists())
        self.assertEqual(self.check(), (0, ""))

    def test_subject_must_match_folder(self):
        exam = json.loads(FIXTURE.read_text(encoding="utf-8"))
        exam["subject"] = "VNR202"
        write_json(self.root / "MLN131" / "TEST-FE.json", exam)
        self.build()
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("must equal its folder 'MLN131'", out)

    def test_unlisted_folder_and_stray_root_file(self):
        self.build()
        (self.root / "JPD113").mkdir()
        write_json(self.root / "index.json", {"exams": []})
        code, out = self.check()
        self.assertEqual(code, 1)
        self.assertIn("JPD113: folder is not listed", out)
        self.assertIn("not the data root", out)

    def test_missing_listed_folder(self):
        code, out = self.check()  # VNR202 folder not built yet
        self.assertEqual(code, 1)
        self.assertIn("VNR202: listed in subjects.json but the folder is missing", out)

    def test_images_use_semester_folder(self):
        self.build()
        images = Path(self._tmp.name) / "Exams"
        folder = images / "Semester9" / "MLN131" / "TEST" / "FE"
        folder.mkdir(parents=True)
        for i in range(1, 3):
            (folder / f"00{i}.webp").write_bytes(b"")
        code, out = self.check("--images", str(images))
        self.assertEqual(code, 1)
        self.assertIn("image count 2 != 3 questions", out)
        (folder / "003.webp").write_bytes(b"")
        self.assertEqual(self.check("--images", str(images)), (0, ""))

    def test_merge_comments_requires_data(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            merge_comments.main(["--csv", "x.csv", "--images", "y"])


if __name__ == "__main__":
    unittest.main()
