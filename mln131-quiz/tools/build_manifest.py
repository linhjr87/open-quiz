"""Build ``data/index.json`` (the exam manifest) from ``data/*.json`` (stdlib only).

CLI: python -I tools/build_manifest.py [data/]
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from validate import _stats  # noqa: E402

SEASON_ORDER = {"SP": 0, "SU": 1, "FA": 2}
TERM_RE = re.compile(r"^(SP|SU|FA)(\d{2})$")
DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _sort_key(entry):
    """Newest term first, then code ascending; unrecognised terms sort last."""
    term, code = str(entry["term"]), str(entry["code"])
    match = TERM_RE.match(term)
    if not match:
        return (1, 0, 0, term, code)
    season, yy = match.groups()
    return (0, -int(yy), -SEASON_ORDER[season], term, code)


def build_manifest(data_dir):
    entries = []
    for path in sorted(Path(data_dir).glob("*.json")):
        if path.name == "index.json":
            continue
        with open(path, encoding="utf-8") as f:
            exam = json.load(f)
        entries.append(
            {
                "id": exam["id"],
                "title": exam["title"],
                "term": exam["term"],
                "code": exam["code"],
                "count": len(exam.get("questions", [])),
                "stats": _stats(exam),
            }
        )
    entries.sort(key=_sort_key)
    return {"exams": entries}


def write_manifest(data_dir):
    manifest = build_manifest(data_dir)
    out = Path(data_dir) / "index.json"
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build data/index.json.")
    parser.add_argument("data_dir", nargs="?", default=str(DEFAULT_DATA_DIR))
    args = parser.parse_args(argv)
    manifest = write_manifest(args.data_dir)
    print(f"index.json: {len(manifest['exams'])} exams")
    return 0


if __name__ == "__main__":
    sys.exit(main())
