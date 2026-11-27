import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_manifest  # noqa: E402
import merge_comments  # noqa: E402
import validate  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "sample.json")
ABCD = ["A", "B", "C", "D"]


def load_sample():
    with open(FIXTURE, encoding="utf-8") as f:
        return json.load(f)


def make_exam(term, code, statuses=("verified", "disputed", "ai-only")):
    exam = load_sample()
    exam.update(id=f"{term}-{code}", term=term, code=code, title=f"MLN131 · {term} · {code}")
    exam["questions"] = []
    for i, status in enumerate(statuses, start=1):
        exam["questions"].append(
            {
                "n": i,
                "text": f"Câu {i}",
                "options": {"A": "a", "B": "b", "C": "c", "D": "d"},
                "pick": 1,
                "answer": ["A"],
                "aiAnswer": ["A"],
                "commentAnswer": None if status == "ai-only" else ["A"],
                "commentVotes": None if status == "ai-only" else {"A": 1},
                "status": status,
                "ocrNote": None,
            }
        )
    return exam


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class ParseDistTests(unittest.TestCase):
    def test_parse_dist(self):
        self.assertEqual(merge_comments.parse_dist("AC:2, A:1"), {"AC": 2, "A": 1})
        self.assertEqual(merge_comments.parse_dist("A:3, D:1"), {"A": 3, "D": 1})
        self.assertEqual(merge_comments.parse_dist(""), {})
        self.assertEqual(merge_comments.parse_dist("   "), {})


class ReconcileTests(unittest.TestCase):
    def test_no_votes(self):
        self.assertEqual(merge_comments.reconcile(["D"], None, ABCD, 1), ("ai-only", None))
        self.assertEqual(merge_comments.reconcile(["D"], {}, ABCD, 1), ("ai-only", None))

    def test_agree(self):
        self.assertEqual(
            merge_comments.reconcile(["D"], {"D": 3}, ABCD, 1), ("verified", ["D"])
        )

    def test_disagree(self):
        self.assertEqual(
            merge_comments.reconcile(["D"], {"B": 2, "D": 1}, ABCD, 1), ("disputed", ["B"])
        )

    def test_tie(self):
        self.assertEqual(
            merge_comments.reconcile(["D"], {"A": 2, "D": 2}, ABCD, 1), ("verified", ["D"])
        )
        status, answer = merge_comments.reconcile(["C"], {"A": 2, "D": 2}, ABCD, 1)
        self.assertEqual(status, "disputed")
        self.assertEqual(answer, ["A"])

    def test_invalid_keys_dropped(self):
        self.assertEqual(
            merge_comments.reconcile(["A"], {"AC": 5, "E": 3}, ABCD, 1), ("ai-only", None)
        )

    def test_multi_pick(self):
        self.assertEqual(
            merge_comments.reconcile(["C", "A"], {"AC": 2, "A": 1}, ABCD, 2),
            ("verified", ["A", "C"]),
        )


class MergeTests(unittest.TestCase):
    def test_merge_keeps_answer(self):
        exam = make_exam("FA24", "FE", ("ai-only", "ai-only", "ai-only"))
        merged = merge_comments.merge(
            exam, {1: {"B": 2, "A": 1}, 2: {"A": 1, "E": 4}}, "https://fuexam.me/t/1"
        )
        q1, q2, q3 = merged["questions"]
        self.assertEqual(q1["status"], "disputed")
        self.assertEqual(q1["commentAnswer"], ["B"])
        self.assertEqual(q1["commentVotes"], {"B": 2, "A": 1})
        self.assertEqual(q1["answer"], ["A"])
        self.assertEqual(q2["status"], "verified")
        self.assertEqual(q2["commentVotes"], {"A": 1})  # invalid key E dropped
        self.assertEqual(q3["status"], "ai-only")
        self.assertIsNone(q3["commentAnswer"])
        self.assertIsNone(q3["commentVotes"])
        self.assertEqual(merged["source"], "https://fuexam.me/t/1")

    def test_merge_without_source_leaves_source(self):
        exam = make_exam("FA24", "FE")
        exam["source"] = "keep"
        merge_comments.merge(exam, {}, None)
        self.assertEqual(exam["source"], "keep")

    def test_merge_output_passes_validation(self):
        exam = make_exam("FA24", "FE", ("ai-only", "ai-only", "ai-only"))
        merged = merge_comments.merge(exam, {1: {"A": 3}, 2: {"C": 2, "A": 1}}, None)
        self.assertEqual(validate.validate_exam(merged, draft=False), [])
        statuses = [q["status"] for q in merged["questions"]]
        self.assertEqual(statuses, ["verified", "disputed", "ai-only"])


class ManifestTests(unittest.TestCase):
    def test_manifest_stats_and_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            write_json(data / "FA24-FE.json", make_exam("FA24", "FE"))
            write_json(
                data / "SP25-FE.json",
                make_exam("SP25", "FE", ("verified", "verified", "ai-only", "disputed")),
            )
            write_json(data / "index.json", {"exams": [{"id": "stale"}]})
            manifest = build_manifest.build_manifest(data)
        self.assertEqual([e["id"] for e in manifest["exams"]], ["SP25-FE", "FA24-FE"])
        sp25 = manifest["exams"][0]
        self.assertEqual(sp25["stats"], {"verified": 2, "disputed": 1, "aiOnly": 1})
        self.assertEqual(sp25["count"], 4)
        self.assertEqual(set(sp25), {"id", "title", "term", "code", "count", "stats"})

    def test_order_season_year_code_and_unknown_term(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            for term, code in [
                ("FA24", "B5"), ("FA24", "A1"), ("SU26", "FE"), ("SP26", "FE"),
                ("FA25", "FE"), ("TEST", "FE"), ("SU25", "FE"),
            ]:
                write_json(data / f"{term}-{code}.json", make_exam(term, code))
            manifest = build_manifest.build_manifest(data)
        self.assertEqual(
            [e["id"] for e in manifest["exams"]],
            ["SU26-FE", "SP26-FE", "FA25-FE", "SU25-FE", "FA24-A1", "FA24-B5", "TEST-FE"],
        )

    def test_manifest_passes_validate_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            exams = {}
            for term in ("FA24", "SP25"):
                exam = make_exam(term, "FE")
                exams[exam["id"]] = exam
                write_json(data / f"{exam['id']}.json", exam)
            manifest = build_manifest.build_manifest(data)
        self.assertEqual(validate.validate_manifest(manifest, exams), [])

    def test_cli_writes_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            write_json(data / "SP25-FE.json", make_exam("SP25", "FE"))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(build_manifest.main([str(data)]), 0)
            raw = (data / "index.json").read_text(encoding="utf-8")
            self.assertIn("MLN131 · SP25 · FE", raw)  # ensure_ascii=False
            self.assertEqual(json.loads(raw)["exams"][0]["id"], "SP25-FE")


CSV_HEADER = "de,cau,dap_an,phieu,tong,dong_thuan,phan_bo,co\n"


class LoadCsvTests(unittest.TestCase):
    def test_load_csv_bom_and_empty_dist(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "answers_all.csv"
            path.write_text(
                CSV_HEADER
                + 'FA24/FE,1,A,4,4,3,"A:3, D:1",x\n'
                + "FA24/FE,2,,0,0,0,,x\n"
                + "SP25/FE,1,C,1,1,1,C:1,x\n",
                encoding="utf-8-sig",
            )
            rows = merge_comments.load_csv(path)
        self.assertEqual(rows["FA24/FE"], {1: {"A": 3, "D": 1}, 2: {}})
        self.assertEqual(rows["SP25/FE"], {1: {"C": 1}})

    def test_hand_mapped_row_uses_dap_an(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "answers_all.csv"
            path.write_text(
                CSV_HEADER
                + "FA24/B5-FE,17,B,0,0,0.0,,SUA TAY\n"
                + "FA24/B5-FE,43,D,,,,   ,SUA TAY\n"
                + "FA24/B5-FE,56,C,3,3,1.0,,SUA TAY\n"
                + "FA24/B5-FE,57,,0,0,0.0,,\n",
                encoding="utf-8-sig",
            )
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                rows = merge_comments.load_csv(path)
        self.assertEqual(
            rows["FA24/B5-FE"], {17: {"B": 1}, 43: {"D": 1}, 56: {"C": 3}, 57: {}}
        )
        self.assertEqual(err.getvalue(), "")

    def test_hand_mapped_votes_merge(self):
        exam = make_exam("FA24", "FE", ("ai-only", "ai-only", "ai-only"))
        merged = merge_comments.merge(exam, {1: {"A": 1}, 2: {"C": 1}}, None)
        self.assertEqual(
            [q["status"] for q in merged["questions"]], ["verified", "disputed", "ai-only"]
        )

    def test_malformed_rows_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "answers_all.csv"
            path.write_text(
                CSV_HEADER
                + 'FA24/FE,1,A,4,4,3,"A:3, D:1",x\n'
                + "FA24/FE,2,A,2,2,2,A:x,x\n"
                + "FA24/FE,3,A,2,2,2,A,x\n"
                + "FA24/FE,4,B,1,1,1,B:1,x\n"
                + ",5,A,1,1,1,A:1,x\n"
                + "FA24/FE,,A,1,1,1,A:1,x\n"
                + "FA24/FE,zz,A,1,1,1,A:1,x\n"
                + "FA24/FE,6,B,oops,0,0,,SUA TAY\n",
                encoding="utf-8-sig",
            )
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                rows = merge_comments.load_csv(path)
        self.assertEqual(rows, {"FA24/FE": {1: {"A": 3, "D": 1}, 4: {"B": 1}}})
        lines = err.getvalue().splitlines()
        self.assertEqual(len(lines), 6)
        for line, prefix in zip(
            lines,
            ["FA24/FE/2", "FA24/FE/3", "/5", "FA24/FE/", "FA24/FE/zz", "FA24/FE/6"],
        ):
            self.assertTrue(line.startswith(f"warn: {prefix}: "), line)


class MergeCliTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        root = Path(self._tmp.name)
        self.data = root / "data"
        self.data.mkdir()
        self.mln = root / "MLN131"
        self.csv = root / "answers_all.csv"
        write_json(self.data / "FA24-FE.json", make_exam("FA24", "FE", ("ai-only",) * 3))
        write_json(self.data / "SP25-FE.json", make_exam("SP25", "FE"))
        write_json(self.data / "SU25-FE.json", make_exam("SU25", "FE"))
        self.csv.write_text(
            CSV_HEADER
            + 'FA24/FE,1,A,4,4,3,"A:3, D:1",x\n'
            + "FA24/FE,2,A,2,2,2,B:2,x\n"
            + "FA24/FE,3,,0,0,0,,x\n"
            + "SU25/FE,1,A,1,1,1,A:1,x\n",
            encoding="utf-8-sig",
        )
        (self.mln / "FA24" / "FE").mkdir(parents=True)
        write_json(self.mln / "FA24" / "FE" / "comments.json", {"url": "/threads/abc.123/"})

    def run_cli(self, *extra):
        out = io.StringIO()
        argv = ["--csv", str(self.csv), "--mln", str(self.mln), "--data", str(self.data), *extra]
        with contextlib.redirect_stdout(out):
            code = merge_comments.main(argv)
        return code, out.getvalue()

    def load(self, name):
        return json.loads((self.data / name).read_text(encoding="utf-8"))

    def test_cli_merges_and_rebuilds_manifest(self):
        code, out = self.run_cli()
        self.assertEqual(code, 0)
        self.assertIn("FA24-FE: verified 1, disputed 1, ai-only 1", out)
        self.assertIn("SP25-FE: no comment data", out)
        fa24 = self.load("FA24-FE.json")
        self.assertEqual(fa24["source"], "https://fuexam.me/threads/abc.123/")
        self.assertEqual(validate.validate_exam(fa24, draft=False), [])
        index = self.load("index.json")
        self.assertEqual([e["id"] for e in index["exams"]], ["SU25-FE", "SP25-FE", "FA24-FE"])
        self.assertEqual(index["exams"][2]["stats"], {"verified": 1, "disputed": 1, "aiOnly": 1})

    def test_missing_comments_json_leaves_source_unset(self):
        self.run_cli()
        su25 = self.load("SU25-FE.json")
        self.assertIsNone(su25["source"])
        self.assertEqual(su25["questions"][0]["status"], "verified")

    def test_no_rows_leaves_file_untouched(self):
        before = (self.data / "SP25-FE.json").read_bytes()
        self.run_cli()
        self.assertEqual((self.data / "SP25-FE.json").read_bytes(), before)

    def test_only_filter(self):
        before = (self.data / "SU25-FE.json").read_bytes()
        code, out = self.run_cli("--only", "FA24-FE")
        self.assertEqual(code, 0)
        self.assertIn("FA24-FE:", out)
        self.assertNotIn("SU25-FE", out)
        self.assertEqual((self.data / "SU25-FE.json").read_bytes(), before)

    def test_cli_skips_unanswered_exam(self):
        draft = make_exam("SP26", "FE")
        for q in draft["questions"]:
            for key in ("answer", "aiAnswer", "commentAnswer", "commentVotes", "status"):
                q.pop(key)
        write_json(self.data / "SP26-FE.json", draft)
        with open(self.csv, "a", encoding="utf-8") as f:
            f.write("SP26/FE,1,A,1,1,1,A:1,x\n")
        before = (self.data / "SP26-FE.json").read_bytes()
        code, out = self.run_cli()
        self.assertEqual(code, 0)
        self.assertIn("SP26-FE: skipped, not fully answered", out)
        self.assertEqual((self.data / "SP26-FE.json").read_bytes(), before)
        self.assertIn("FA24-FE: verified 1, disputed 1, ai-only 1", out)


if __name__ == "__main__":
    unittest.main()
