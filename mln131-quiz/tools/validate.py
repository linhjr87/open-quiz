"""Validate MLN131 exam data files and the manifest (stdlib only).

CLI: python -I tools/validate.py [--draft] [--images ../MLN131] [--check-manifest] data/
Exits 1 if any error is found; prints ``<file>: <error>`` lines.
"""
import argparse
import json
import sys
from pathlib import Path

REQUIRED_KEYS = ("id", "subject", "term", "code", "title", "questions")
OPTION_LETTERS = "ABCDEF"
VALID_STATUSES = ("verified", "disputed", "ai-only")


def _is_nonempty_str(value):
    return isinstance(value, str) and value.strip() != ""


def _is_letter_list(value):
    return isinstance(value, list) and all(isinstance(x, str) for x in value)


def _validate_question(q, idx, draft):
    """Return errors for one question. ``idx`` is its 1-based position."""
    errors = []
    label = f"questions[{idx}]"
    if not isinstance(q, dict):
        return [f"{label}: must be an object"]

    if not _is_nonempty_str(q.get("text")):
        errors.append(f"{label}.text: must be a non-empty string")

    options = q.get("options")
    valid_options = False
    if not isinstance(options, dict):
        errors.append(f"{label}.options: must be an object")
    else:
        bad_keys = [k for k in options if k not in OPTION_LETTERS or len(k) != 1]
        if bad_keys:
            errors.append(f"{label}.options: keys must be from A-F, got {bad_keys}")
        if len(options) < 2:
            errors.append(f"{label}.options: needs at least 2 options, got {len(options)}")
        empty = [k for k, v in options.items() if not _is_nonempty_str(v)]
        if empty:
            errors.append(f"{label}.options: empty value for {empty}")
        valid_options = not bad_keys and len(options) >= 2

    pick = q.get("pick")
    pick_ok = isinstance(pick, int) and not isinstance(pick, bool) and pick >= 1
    if not pick_ok:
        errors.append(f"{label}.pick: must be an integer >= 1, got {pick!r}")

    if draft:
        return errors

    for field in ("answer", "aiAnswer"):
        value = q.get(field)
        if not _is_letter_list(value) or not value:
            errors.append(f"{label}.{field}: must be a non-empty list of letters")
        elif valid_options:
            missing = [x for x in value if x not in options]
            if missing:
                errors.append(f"{label}.{field}: {missing} not in options {sorted(options)}")
        if _is_letter_list(value) and len(set(value)) != len(value):
            errors.append(f"{label}.{field}: letters must be unique, got {value}")
    answer = q.get("answer")
    if pick_ok and _is_letter_list(answer) and answer and len(answer) != pick:
        errors.append(f"{label}.pick: pick={pick} but answer has {len(answer)} letters")
    ai_answer = q.get("aiAnswer")
    if pick_ok and _is_letter_list(ai_answer) and ai_answer and len(ai_answer) != pick:
        errors.append(f"{label}.pick: pick={pick} but aiAnswer has {len(ai_answer)} letters")

    status = q.get("status")
    if status not in VALID_STATUSES:
        errors.append(f"{label}.status: must be one of {list(VALID_STATUSES)}, got {status!r}")
    else:
        comment = q.get("commentAnswer")
        if status == "ai-only" and comment is not None:
            errors.append(f"{label}.commentAnswer: must be null when status is 'ai-only'")
        if status != "ai-only" and comment is None:
            errors.append(f"{label}.commentAnswer: must not be null when status is '{status}'")
    return errors


def validate_exam(data, image_count=None, draft=False):
    """Return a list of error strings for one exam dict (empty list = OK)."""
    if not isinstance(data, dict):
        return ["exam: must be a JSON object"]
    errors = []

    for key in REQUIRED_KEYS:
        if key not in data:
            errors.append(f"{key}: required key is missing")

    if "id" in data and "term" in data and "code" in data:
        expected = f"{data['term']}-{data['code']}"
        if data["id"] != expected:
            errors.append(f"id: {data['id']!r} must equal term-code {expected!r}")

    if "questions" in data:
        questions = data["questions"]
        if not isinstance(questions, list) or not questions:
            errors.append("questions: must be a non-empty list")
        else:
            for pos, q in enumerate(questions, start=1):
                n = q.get("n") if isinstance(q, dict) else None
                if isinstance(n, bool) or not isinstance(n, int) or n != pos:
                    errors.append(f"questions[{pos}].n: expected {pos}, got {n!r}")
                errors.extend(_validate_question(q, pos, draft))
            if image_count is not None and image_count != len(questions):
                errors.append(
                    f"questions: image count {image_count} != {len(questions)} questions"
                )
    return errors


def _stats(exam):
    stats = {"verified": 0, "disputed": 0, "aiOnly": 0}
    for q in exam.get("questions", []):
        status = q.get("status") if isinstance(q, dict) else None
        if status == "verified":
            stats["verified"] += 1
        elif status == "disputed":
            stats["disputed"] += 1
        elif status == "ai-only":
            stats["aiOnly"] += 1
    return stats


def validate_manifest(manifest, exams):
    """Check ``{"exams":[...]}`` against ``{id: exam_dict}``."""
    if not isinstance(manifest, dict) or not isinstance(manifest.get("exams"), list):
        return ["exams: manifest must be an object with an 'exams' list"]
    errors = []
    seen = set()
    for i, entry in enumerate(manifest["exams"]):
        if not isinstance(entry, dict):
            errors.append(f"exams[{i}]: must be an object")
            continue
        eid = entry.get("id")
        if eid in seen:
            errors.append(f"exams[{i}].id: duplicate id {eid!r}")
        seen.add(eid)
        exam = exams.get(eid)
        if exam is None:
            errors.append(f"exams[{i}].id: {eid!r} has no data file")
            continue
        for key in ("title", "term", "code"):
            if entry.get(key) != exam.get(key):
                errors.append(
                    f"{eid}.{key}: manifest {entry.get(key)!r} != data {exam.get(key)!r}"
                )
        count = len(exam.get("questions", []))
        if entry.get("count") != count:
            errors.append(f"{eid}.count: manifest {entry.get('count')!r} != data {count}")
        if entry.get("stats") != _stats(exam):
            errors.append(f"{eid}.stats: manifest {entry.get('stats')!r} != data {_stats(exam)}")
    for eid in exams:
        if eid not in seen:
            errors.append(f"exams: {eid!r} has a data file but is missing from the manifest")
    return errors


def _load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _count_images(images_dir, data):
    term, code = data.get("term"), data.get("code")
    if not _is_nonempty_str(term) or not _is_nonempty_str(code):
        return None, []
    folder = Path(images_dir) / term / code
    if not folder.is_dir():
        return None, [f"images: folder not found: {folder}"]
    return sum(1 for _ in folder.glob("*.webp")), []


def main(argv=None):
    parser = argparse.ArgumentParser(description="Validate MLN131 exam data.")
    parser.add_argument("path", help="data directory (or a single JSON file)")
    parser.add_argument("--draft", action="store_true", help="allow missing answer fields")
    parser.add_argument("--images", help="MLN131 image root; <term>/<code>/*.webp is counted")
    parser.add_argument(
        "--check-manifest", action="store_true", help="also check index.json against the data"
    )
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    target = Path(args.path)
    files = [target] if target.is_file() else sorted(target.glob("*.json"))
    files = [f for f in files if f.name != "index.json"]

    problems = 0
    exams = {}
    for f in files:
        try:
            data = _load_json(f)
        except (OSError, ValueError) as exc:
            print(f"{f}: cannot read JSON: {exc}")
            problems += 1
            continue
        image_count, errors = None, []
        if args.images:
            image_count, errors = _count_images(args.images, data if isinstance(data, dict) else {})
        errors += validate_exam(data, image_count=image_count, draft=args.draft)
        if isinstance(data, dict) and isinstance(data.get("id"), str):
            exams[data["id"]] = data
        for e in errors:
            print(f"{f}: {e}")
        problems += len(errors)

    if args.check_manifest:
        index = (target if target.is_dir() else target.parent) / "index.json"
        try:
            errors = validate_manifest(_load_json(index), exams)
        except (OSError, ValueError) as exc:
            errors = [f"cannot read manifest: {exc}"]
        for e in errors:
            print(f"{index}: {e}")
        problems += len(errors)

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
