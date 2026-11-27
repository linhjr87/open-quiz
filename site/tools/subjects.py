"""The subject list of the site: ``data/subjects.json`` (stdlib only).

Layout of the data root::

    data/subjects.json                 [{"code", "name", "semester"}, ...]  (the subjects shown)
    data/<CODE>/<TERM>-<CODE>.json      one file per exam
    data/<CODE>/index.json              per-subject manifest (build_manifest.py)

Only subjects listed in ``subjects.json`` appear on the site. A listed subject may have no
exams yet (an empty ``index.json``); the home page then shows it as "đang chép đề".
"""
import json
import re
from pathlib import Path

SUBJECTS_FILE = "subjects.json"
CODE_RE = re.compile(r"^[A-Z]{3}\d{3}[A-Z]?$")


def is_root(path):
    """True if ``path`` is a data root (holds ``subjects.json``) rather than one subject folder."""
    return Path(path).is_dir() and (Path(path) / SUBJECTS_FILE).is_file()


def check_subjects(raw):
    """Return errors for the parsed ``subjects.json`` (empty list = OK)."""
    if not isinstance(raw, dict) or not isinstance(raw.get("subjects"), list):
        return ["subjects.json: must be an object with a 'subjects' list"]
    errors = []
    seen = set()
    for i, s in enumerate(raw["subjects"]):
        label = f"subjects[{i}]"
        if not isinstance(s, dict):
            errors.append(f"{label}: must be an object")
            continue
        code = s.get("code")
        if not isinstance(code, str) or not CODE_RE.match(code):
            errors.append(f"{label}.code: must look like MLN131, got {code!r}")
        elif code in seen:
            errors.append(f"{label}.code: duplicate {code!r}")
        else:
            seen.add(code)
        name = s.get("name")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"{label}.name: must be a non-empty string")
        sem = s.get("semester")
        if isinstance(sem, bool) or not isinstance(sem, int) or not 0 <= sem <= 9:
            errors.append(f"{label}.semester: must be an integer 0-9, got {sem!r}")
    return errors


def load_subjects(root):
    """Parsed subject list of a data root. Raises ``ValueError`` if the file is invalid."""
    with open(Path(root) / SUBJECTS_FILE, encoding="utf-8") as f:
        raw = json.load(f)
    errors = check_subjects(raw)
    if errors:
        raise ValueError("; ".join(errors))
    return raw["subjects"]


def subject_dirs(root):
    """``[(code, Path)]`` for every subject listed in ``subjects.json``, in file order."""
    return [(s["code"], Path(root) / s["code"]) for s in load_subjects(root)]
