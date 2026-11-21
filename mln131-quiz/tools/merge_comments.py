"""Merge community comment votes (answers_all.csv) into exam JSON files (stdlib only).

CLI: python -I tools/merge_comments.py --csv <answers_all.csv> --mln <MLN131 dir> [--only FA24-B5-FE]
"""
import argparse
import csv
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_manifest import DEFAULT_DATA_DIR, write_manifest  # noqa: E402

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


def _filter_votes(votes, options, pick):
    """Keep only vote keys with ``pick`` letters, all of them in ``options``."""
    if not votes:
        return {}
    allowed = set(options)
    return {
        k: v for k, v in votes.items() if len(k) == pick and k and set(k) <= allowed
    }


def reconcile(ai, votes, options, pick):
    """Return ``(status, commentAnswer)`` from the AI answer and the vote distribution."""
    votes = _filter_votes(votes, options, pick)
    if not votes:
        return "ai-only", None
    aikey = "".join(sorted(ai))
    best = max(votes.values())
    top = [k for k, v in votes.items() if v == best]
    if aikey in top:
        return "verified", list(aikey)
    return "disputed", list(sorted(top)[0])


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


def load_csv(path):
    """Return ``{"<TERM>/<CODE>": {n: {key: count}}}`` from answers_all.csv."""
    rows = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            try:
                n = int(row["cau"])
            except (KeyError, TypeError, ValueError):
                continue
            rows.setdefault(row["de"].strip(), {})[n] = parse_dist(row.get("phan_bo") or "")
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
    parser.add_argument("--mln", required=True, help="MLN131 directory (<TERM>/<CODE>/comments.json)")
    parser.add_argument("--data", default=str(DEFAULT_DATA_DIR), help="data directory")
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
        dist_by_n = rows.get(f"{exam['term']}/{exam['code']}")
        if not dist_by_n:
            print(f"{exam['id']}: no comment data")
            continue
        source = load_source(args.mln, exam["term"], exam["code"])
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
