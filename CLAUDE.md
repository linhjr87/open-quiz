# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**FU-open-quiz**: a static practice site for old FPT University final exams, one section per subject (currently MLN131 and VNR202), deployed to GitHub Pages at https://linhjr87.github.io/open-quiz/ (repo `linhjr87/open-quiz`). The repo has two halves:

- **Repo root** has the scraper scripts for fuexam.me (XenForo forum). They run locally only and need a logged-in session cookie.
- **`site/`** is the published site plus its data tooling. Only this folder is deployed.

User-facing text, the README and many code comments are in Vietnamese. Keep UI strings in Vietnamese.

## Commands

Run all of these from `site/`. No dependencies to install: JS is plain ES modules (Node 22+), and the Python tools use the stdlib only. Always call Python with `-I`, as CI does.

```bash
node --test                                        # all JS tests (tests/*.test.mjs)
node --test tests/core.test.mjs                    # one JS test file
python -I -m unittest discover -s tools            # all Python tests
python -I -m unittest discover -s tools -p test_validate.py   # one Python test file

python -I tools/validate.py --check-manifest data/            # what CI runs (every subject in data/subjects.json)
python -I tools/validate.py --images ../Exams data/           # check question count against local images
python -I tools/build_manifest.py                             # regenerate data/<SUBJECT>/index.json for every subject
python -I tools/merge_comments.py --csv ../MLN131/answers_all.csv --images ../MLN131 --data data/MLN131 [--only FA24-B5-FE]

python -m http.server                              # preview at http://localhost:8000/ (fetch breaks under file://)
```

Scrapers, run from the repo root (they need `cookie.txt` or `FUEXAM_COOKIE`):

```bash
python fuexam_dl.py mln131 --filter fe        # download question images into Exams/Semester9/MLN131/<TERM>/<CODE>/NNN.webp
python fuexam_dl.py jpd113 --semester 3        # new subject: give its semester (1-9) once, saved in Exams/subjects.json
python fuexam_answers.py mln131 [--reparse]   # scrape per-image comment votes into Exams/Semester9/MLN131/answers_all.csv
```

## Architecture

### Data pipeline (each exam is a JSON file, no code changes needed)

1. `fuexam_dl.py` downloads each exam thread's images into `Exams/Semester<n>/<SUBJECT>/<TERM>/<CODE>/`, where `n` (semester 1-9) comes from `Exams/subjects.json`. `MLN131` at the repo root is a Windows junction to `Exams/Semester9/MLN131`, so `../MLN131` works from `site/` (other subjects: `../Exams/Semester<n>/<SUBJECT>`). `fuexam_answers.py` takes the comments under each image, gives each user one vote (their latest comment), and writes `answers_all.csv`. Its columns are `de,cau,dap_an,phieu,tong,dong_thuan,phan_bo,co`, and `de` looks like `FA24/B5-FE`. Both scripts share `Client` and `load_cookie` from `fuexam_dl.py`.
2. (Preferred, saves Claude tokens) Gemini in Antigravity runs `/ocr-exam` (`.agent/workflows/`), writing drafts into the gitignored `ocr/staging/`; `python -I ocr/promote.py <file>` validates and moves them into `site/data/<SUBJECT>/` (the subject must be listed in `site/data/subjects.json`). See `ocr/README.md`; tests: `python -I -m unittest discover -s ocr`. Otherwise, Claude transcribes the images into `site/data/<SUBJECT>/<TERM>-<CODE>.json` in **two independent passes**. Pass 1 copies the text verbatim. Pass 2 re-checks against the image, records any fix in `ocrNote`, and solves the question, filling `answer` and `aiAnswer`.
3. `merge_comments.py` reconciles `aiAnswer` with the votes. It sets `commentVotes`, `commentAnswer` and `status` (`verified` when they agree, `disputed` when they disagree, `ai-only` when there are no votes). It does **not** change `answer`: the displayed answer is always the AI's. It then rebuilds the manifest. `status`, `commentVotes` and `commentAnswer` are internal (data QA only): the UI never shows answer provenance or vote counts, only right/wrong and the correct answer.
4. `build_manifest.py` writes `data/<SUBJECT>/index.json` for every subject, which the pages read. It holds the per-exam `count` and `stats`.

Data layout: `site/data/subjects.json` (`{"subjects": [{"code", "name", "semester"}]}`) decides which subjects the site shows; only list subjects you are actually working on. Each listed subject has a folder `data/<SUBJECT>/` with its exams and `index.json` (empty `{"exams": []}` while it is still being transcribed, shown as "Đang chép đề"). An exam's `subject` field must equal its folder. Exam ids (`<TERM>-<CODE>`) are unique only within a subject. `tools/subjects.py` reads the list; `validate.py` and `build_manifest.py` take either the data root or one subject folder.

Question schema: `n`, `text`, `options` (letter → text), `pick` (how many answers to choose), `answer`, `aiAnswer`, `commentAnswer`, `commentVotes`, `status`, `ocrNote`. `validate.py` enforces `len(answer) == pick`, answers drawn from `options`, a valid `status`, and a manifest that matches the data. `--draft` allows exams that have no answers yet. CI runs without it.

**Gotcha:** after adding or editing any `data/<SUBJECT>/*.json`, run `build_manifest.py` before committing, or the CI `--check-manifest` step fails.

### Front end (`site/assets/`)

- `core.js` holds the pure logic (scoring, `isCorrect`, response sanitizing, seeded `shuffled` via mulberry32, and `localStorage` wrappers keyed `foq:<SUBJECT>/<examId>:<mode>`, built with `examKey` + `storageKey`). It is the only module with unit tests, so put testable logic here rather than in the page scripts. `migrateLegacy()` moves the pre-platform keys `mln131:<id>:<mode>` and `mln131:lastSeen` to `foq:MLN131/<id>:<mode>` and `foq:lastSeen` (copy only if the target is absent, then delete); both pages call it first in `main()`.
- `home.js` (`index.html`) has two views. Without `?subject=`: the platform home, with "Tiếp tục ôn" (`recentAttempts`) and the subjects from `data/subjects.json` grouped by semester (`#ky-<n>`). With `?subject=<CODE>`: that subject's exams from `data/<CODE>/index.json`, with a breadcrumb and saved progress.
- `quiz.js` (`quiz.html?subject=<CODE>&exam=<examId>&mode=study|exam|history|review`, plus `attempt=<k>` for review; a missing `subject` means MLN131 so old links keep working) is a single view state machine (`study | examStart | exam | result | history | review`). **Thi thử** (exam) mode has a countdown and shows answers only after submitting, scored out of 10. **Ôn tập** (study) mode gives instant feedback. `mode=history` lists past attempts of the exam, and `mode=review&attempt=<k>` reviews attempt k (1-based). Attempts are stored under `foq:<SUBJECT>/<id>:history` (helpers `loadHistory`, `appendAttempt`, `historyStats` in `core.js`). Both pages call `expireIfIdle(Date.now())` right after `migrateLegacy()`: if `foq:lastSeen` is older than 7 days, every `foq:*` key is wiped. The "Báo lỗi" button opens a prefilled GitHub issue on `linhjr87/open-quiz` titled `[<SUBJECT> <examId>] Câu n:`.
- `icons.js` holds the SVG icons and the `esc` HTML-escaping helper. Escape all question text through `esc`.
- `design/prototype.html` is the UI prototype. The spec and plan are in `docs/superpowers/`.

### CI/CD

`.github/workflows/pages.yml` runs on every push to `main`. It runs the JS tests, the Python tests and the validator, then uploads `site/` as the Pages artifact.

## Never commit

These are already gitignored: `cookie.txt` (fuexam session), `Exams/` (source images for every subject, `answers_all.csv`, raw `comments.json`/`answers.md`) and the `MLN131` junction, `.venv/`, `.superpowers/` (agent scratch).
