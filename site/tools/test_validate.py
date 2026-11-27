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


    def test_duplicate_answer_letters(self):
        data = load_sample()
        q = data["questions"][0]
        q["pick"] = 2
        q["answer"] = ["B", "B"]
        q["aiAnswer"] = ["A", "B"]
        q["commentAnswer"] = ["A", "B"]
        errors = validate.validate_exam(data)
        self.assertTrue(any("answer" in e and "unique" in e for e in errors), errors)

    def test_duplicate_ai_answer_letters(self):
        data = load_sample()
        q = data["questions"][0]
        q["pick"] = 2
        q["answer"] = ["A", "B"]
        q["aiAnswer"] = ["B", "B"]
        errors = validate.validate_exam(data)
        self.assertTrue(any("aiAnswer" in e and "unique" in e for e in errors), errors)

    def test_ai_answer_length_must_equal_pick(self):
        data = load_sample()
        q = data["questions"][0]
        q["aiAnswer"] = ["A", "B"]
        errors = validate.validate_exam(data)
        self.assertTrue(any("aiAnswer" in e and "pick" in e for e in errors), errors)

    def test_draft_ignores_answer_uniqueness(self):
        data = load_sample()
        data["questions"][0]["answer"] = ["B", "B"]
        self.assertEqual(validate.validate_exam(data, draft=True), [])

    def test_n_must_not_be_bool(self):
        data = load_sample()
        data["questions"][0]["n"] = True
        self.assert_error(validate.validate_exam(data), "n")
        self.assert_error(validate.validate_exam(data, draft=True), "n")

    def test_n_must_not_be_float(self):
        data = load_sample()
        data["questions"][0]["n"] = 1.0
        self.assert_error(validate.validate_exam(data), "n")


class ValidateReconcileTests(unittest.TestCase):
    def assert_error(self, errors, field):
        self.assertTrue(any(field in e for e in errors), f"no error mentions {field!r}: {errors}")

    def test_stored_status_must_match_recomputed(self):
        data = load_sample()
        data["questions"][0]["status"] = "disputed"  # votes {"B": 2} agree with the AI
        self.assert_error(validate.validate_exam(data), "status")

    def test_stored_comment_answer_must_match_recomputed(self):
        data = load_sample()
        data["questions"][1]["commentAnswer"] = ["D"]  # votes say C
        self.assert_error(validate.validate_exam(data), "commentAnswer")

    def test_votes_removed_but_status_kept(self):
        data = load_sample()
        data["questions"][0]["commentVotes"] = None
        self.assert_error(validate.validate_exam(data), "status")

    def test_answer_must_equal_ai_answer(self):
        data = load_sample()
        data["questions"][0]["answer"] = ["C"]
        self.assert_error(validate.validate_exam(data), "answer")

    def test_tied_votes_with_ai_key_is_verified(self):
        data = load_sample()
        q = data["questions"][0]
        q["commentVotes"] = {"A": 1, "B": 1}
        self.assertEqual(validate.validate_exam(data), [])

    def test_draft_skips_reconcile(self):
        data = load_sample()
        data["questions"][0]["status"] = "disputed"
        data["questions"][0]["answer"] = ["C"]
        errors = validate.validate_exam(data, draft=True)
        self.assertFalse(any("status" in e or "answer" in e for e in errors), errors)

    def test_check_reconcile_can_be_disabled(self):
        data = load_sample()
        data["questions"][0]["status"] = "disputed"
        self.assertEqual(validate.validate_exam(data, check_reconcile=False), [])

    def test_malformed_votes_are_an_error_not_a_crash(self):
        data = load_sample()
        data["questions"][0]["commentVotes"] = ["B"]
        self.assert_error(validate.validate_exam(data), "commentVotes")


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
