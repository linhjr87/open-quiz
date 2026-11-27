"""Merge community comment votes (answers_all.csv) into exam JSON files (stdlib only).

CLI: python -I tools/merge_comments.py --csv <answers_all.csv> --images <subject image dir> --data data/<SUBJECT> [--only FA24-B5-FE]
"""
import argparse
import csv
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_manifest import write_manifest  # noqa: E402
from reconcile import _filter_votes, reconcile  # noqa: E402,F401
from validate import validate_exam  # noqa: E402

BASE_URL = "https://fuexam.me"


def parse_dist(s):
    """``"AC:2, A:1"`` -> ``{"AC": 2, "A": 1}``; empty/blank -> ``{}``."""
    dist = {}
    if not s or not s.strip():
        return dist
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        key, _, count = part.partition(":")
        dist[key.strip()] = int(count)
    return dist


def merge(exam, dist_by_n, source):
    """Set commentVotes/commentAnswer/status on every question (``answer`` is untouched)."""
    for q in exam["questions"]:
        options = list(q["options"])
        votes = _filter_votes(dist_by_n.get(q["n"]), options, q["pick"])
        status, comment = reconcile(q["aiAnswer"], votes, options, q["pick"])
        q["commentVotes"] = votes or None
        q["commentAnswer"] = comment
        q["status"] = status
    if source is not None:
        exam["source"] = source
    return exam


def _warn(de, cau, reason):
    print(f"warn: {de}/{cau}: {reason}", file=sys.stderr)


def _row_dist(row):
    """Votes for one CSV row.

    A row without ``phan_bo`` but with ``dap_an`` is hand-mapped (e.g. "SUA TAY"):
    its votes are ``{dap_an: max(phieu, 1)}``. Raises ValueError on a malformed row.
    """
    phan_bo = row.get("phan_bo") or ""
    dap_an = (row.get("dap_an") or "").strip()
    if phan_bo.strip() or not dap_an:
        return parse_dist(phan_bo)
    return {dap_an: max(int((row.get("phieu") or "").strip() or 0), 1)}


def load_csv(path):
    """Return ``{"<TERM>/<CODE>": {n: {key: count}}}`` from answers_all.csv.

    Malformed rows (missing ``de``/``cau``, unparsable ``phan_bo``/``phieu``) are
    skipped with one ``warn: <de>/<cau>: <reason>`` line on stderr.
    """
    rows = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            de = (row.get("de") or "").strip()
            raw_cau = (row.get("cau") or "").strip()
            if not de:
                _warn(de, raw_cau, "missing de")
                continue
            try:
                n = int(raw_cau)
            except ValueError:
                _warn(de, raw_cau, f"missing or invalid cau {raw_cau!r}")
                continue
            try:
                dist = _row_dist(row)
            except ValueError as exc:
                _warn(de, n, f"malformed votes ({exc})")
                continue
            rows.setdefault(de, {})[n] = dist
    return rows


def load_source(mln_dir, term, code):
    """Thread URL from ``<mln>/<term>/<code>/comments.json`` or None."""
    path = Path(mln_dir) / term / code / "comments.json"
    try:
        with open(path, encoding="utf-8") as f:
            url = json.load(f).get("url")
    except (OSError, ValueError, AttributeError):
        return None
    if not isinstance(url, str) or not url:
        return None
    return url if url.startswith("http") else BASE_URL + url


def main(argv=None):
    parser = argparse.ArgumentParser(description="Merge comment votes into exam data.")
    parser.add_argument("--csv", required=True, help="answers_all.csv")
    parser.add_argument("--images", "--mln", dest="images", required=True,
                        help="subject image directory (<TERM>/<CODE>/comments.json)")
    parser.add_argument("--data", required=True, help="the subject's data folder, e.g. data/MLN131")
    parser.add_argument("--only", help="only this exam id, e.g. FA24-B5-FE")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    rows = load_csv(args.csv)
    data_dir = Path(args.data)
    for path in sorted(data_dir.glob("*.json")):
        if path.name == "index.json":
            continue
        with open(path, encoding="utf-8") as f:
            exam = json.load(f)
        if args.only and exam["id"] != args.only:
            continue
        if validate_exam(exam, draft=False, check_reconcile=False):
            print(f"{exam.get('id', path.stem)}: skipped, not fully answered")
            continue
        dist_by_n = rows.get(f"{exam['term']}/{exam['code']}")
        if not dist_by_n:
            print(f"{exam['id']}: no comment data")
            continue
        source = load_source(args.images, exam["term"], exam["code"])
        merge(exam, dist_by_n, source)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(exam, f, ensure_ascii=False, indent=2)
            f.write("\n")
        counts = {"verified": 0, "disputed": 0, "ai-only": 0}
        for q in exam["questions"]:
            counts[q["status"]] += 1
        print(
            f"{exam['id']}: verified {counts['verified']}, "
            f"disputed {counts['disputed']}, ai-only {counts['ai-only']}"
        )
    write_manifest(data_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
