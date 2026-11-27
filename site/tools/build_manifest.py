"""Build each subject's ``index.json`` (the exam manifest) from its exam files (stdlib only).

CLI: python -I tools/build_manifest.py [data/]          every subject listed in data/subjects.json
     python -I tools/build_manifest.py data/MLN131      one subject folder
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from subjects import is_root, subject_dirs  # noqa: E402
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


def write_all(root):
    """Rebuild ``index.json`` in every subject folder of a data root (creating empty ones)."""
    built = []
    for code, folder in subject_dirs(root):
        folder.mkdir(exist_ok=True)
        built.append((code, write_manifest(folder)))
    return built


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build index.json for each subject.")
    parser.add_argument("data_dir", nargs="?", default=str(DEFAULT_DATA_DIR),
                        help="data root (has subjects.json) or one subject folder")
    args = parser.parse_args(argv)
    if is_root(args.data_dir):
        for code, manifest in write_all(args.data_dir):
            print(f"{code}/index.json: {len(manifest['exams'])} exams")
    else:
        manifest = write_manifest(args.data_dir)
        print(f"index.json: {len(manifest['exams'])} exams")
    return 0


if __name__ == "__main__":
    sys.exit(main())
