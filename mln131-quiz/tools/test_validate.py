import copy
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import validate  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "sample.json")


def load_sample():
    with open(FIXTURE, encoding="utf-8") as f:
        return json.load(f)


class ValidateExamTests(unittest.TestCase):
    def assert_error(self, errors, field):
        self.assertTrue(errors, "expected at least one error")
        self.assertTrue(
            any(field in e for e in errors),
            f"no error mentions {field!r}: {errors}",
        )

    def test_sample_valid(self):
        self.assertEqual(validate.validate_exam(load_sample()), [])
        self.assertEqual(validate.validate_exam(load_sample(), image_count=3), [])

    def test_gap_in_n(self):
        data = load_sample()
        data["questions"][2]["n"] = 4
        self.assert_error(validate.validate_exam(data), "n")

    def test_empty_option(self):
        data = load_sample()
        data["questions"][0]["options"]["C"] = "  "
        self.assert_error(validate.validate_exam(data), "options")

    def test_answer_not_in_options(self):
        data = load_sample()
        q = data["questions"][0]
        q["answer"] = ["E"]
        self.assert_error(validate.validate_exam(data), "answer")

    def test_pick_mismatch(self):
        data = load_sample()
        q = data["questions"][0]
        q["pick"] = 1
        q["answer"] = ["A", "B"]
        self.assert_error(validate.validate_exam(data), "pick")

    def test_bad_status(self):
        data = load_sample()
        data["questions"][0]["status"] = "maybe"
        self.assert_error(validate.validate_exam(data), "status")

    def test_ai_only_requires_null_comment(self):
        data = load_sample()
        data["questions"][2]["commentAnswer"] = ["A"]
        self.assert_error(validate.validate_exam(data), "commentAnswer")
        data = load_sample()
        data["questions"][0]["commentAnswer"] = None
        self.assert_error(validate.validate_exam(data), "commentAnswer")

    def test_image_count_mismatch(self):
        self.assert_error(
            validate.validate_exam(load_sample(), image_count=4), "image"
        )

    def test_draft_allows_missing_answers(self):
        data = load_sample()
        for q in data["questions"]:
            for key in ("answer", "aiAnswer", "commentAnswer", "commentVotes", "status"):
                q.pop(key, None)
        self.assertTrue(validate.validate_exam(data))  # strict mode rejects
        self.assertEqual(validate.validate_exam(data, draft=True), [])

    def test_draft_still_checks_structure(self):
        data = load_sample()
        data["questions"][1]["options"] = {"A": "only one"}
        self.assert_error(validate.validate_exam(data, draft=True), "options")

    def test_id_mismatch(self):
        data = load_sample()
        data["id"] = "TEST-XX"
        self.assert_error(validate.validate_exam(data), "id")

    def test_missing_top_level_key(self):
        data = load_sample()
        del data["title"]
        self.assert_error(validate.validate_exam(data), "title")

    def test_empty_text(self):
        data = load_sample()
        data["questions"][0]["text"] = ""
        self.assert_error(validate.validate_exam(data), "text")


class ValidateManifestTests(unittest.TestCase):
    def make(self):
        exam = load_sample()
        manifest = {
            "exams": [
                {
                    "id": "TEST-FE",
                    "title": exam["title"],
                    "term": "TEST",
                    "code": "FE",
                    "count": 3,
                    "stats": {"verified": 1, "disputed": 1, "aiOnly": 1},
                }
            ]
        }
        return manifest, {"TEST-FE": exam}

    def test_manifest_valid(self):
        manifest, exams = self.make()
        self.assertEqual(validate.validate_manifest(manifest, exams), [])

    def test_manifest_count_mismatch(self):
        manifest, exams = self.make()
        manifest["exams"][0]["count"] = 5
        errors = validate.validate_manifest(manifest, exams)
        self.assertTrue(errors)
        self.assertTrue(any("count" in e for e in errors), errors)

    def test_manifest_stats_mismatch(self):
        manifest, exams = self.make()
        manifest["exams"][0]["stats"]["verified"] = 2
        errors = validate.validate_manifest(manifest, exams)
        self.assertTrue(any("stats" in e for e in errors), errors)

    def test_manifest_missing_and_extra_exam(self):
        manifest, exams = self.make()
        exams2 = {"OTHER-FE": copy.deepcopy(exams["TEST-FE"])}
        errors = validate.validate_manifest(manifest, exams2)
        self.assertTrue(any("TEST-FE" in e for e in errors), errors)
        self.assertTrue(any("OTHER-FE" in e for e in errors), errors)


if __name__ == "__main__":
    unittest.main()
