# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A static practice site for old FPT University **MLN131** final exams, deployed to GitHub Pages at https://linhjr87.github.io/open-quiz/ (repo `linhjr87/open-quiz`). The repo has two halves:

- **Repo root** has the scraper scripts for fuexam.me (XenForo forum). They run locally only and need a logged-in session cookie.
- **`mln131-quiz/`** is the published site plus its data tooling. Only this folder is deployed.

User-facing text, the README and many code comments are in Vietnamese. Keep UI strings in Vietnamese.

## Commands

Run all of these from `mln131-quiz/`. No dependencies to install: JS is plain ES modules (Node 22+), and the Python tools use the stdlib only. Always call Python with `-I`, as CI does.

```bash
node --test                                        # all JS tests (tests/*.test.mjs)
node --test tests/core.test.mjs                    # one JS test file
python -I -m unittest discover -s tools            # all Python tests
python -I -m unittest discover -s tools -p test_validate.py   # one Python test file

python -I tools/validate.py --check-manifest data/            # what CI runs
python -I tools/validate.py --images ../MLN131 data/          # check question count against local images
python -I tools/build_manifest.py                             # regenerate data/index.json
python -I tools/merge_comments.py --csv ../MLN131/answers_all.csv --mln ../MLN131 [--only FA24-B5-FE]

python -m http.server                              # preview at http://localhost:8000/ (fetch breaks under file://)
```

Scrapers, run from the repo root (they need `cookie.txt` or `FUEXAM_COOKIE`):

```bash
python fuexam_dl.py mln131 --filter fe        # download question images into MLN131/<TERM>/<CODE>/NNN.webp
python fuexam_answers.py mln131 [--reparse]   # scrape per-image comment votes into MLN131/answers_all.csv
```

## Architecture

### Data pipeline (each exam is a JSON file, no code changes needed)

1. `fuexam_dl.py` downloads each exam thread's images into `MLN131/<TERM>/<CODE>/`. `fuexam_answers.py` takes the comments under each image, gives each user one vote (their latest comment), and writes `answers_all.csv`. Its columns are `de,cau,dap_an,phieu,tong,dong_thuan,phan_bo,co`, and `de` looks like `FA24/B5-FE`. Both scripts share `Client` and `load_cookie` from `fuexam_dl.py`.
2. Claude transcribes the images into `mln131-quiz/data/<TERM>-<CODE>.json` in **two independent passes**. Pass 1 copies the text verbatim. Pass 2 re-checks against the image, records any fix in `ocrNote`, and solves the question, filling `answer` and `aiAnswer`.
3. `merge_comments.py` reconciles `aiAnswer` with the votes. It sets `commentVotes`, `commentAnswer` and `status` (`verified` when they agree, `disputed` when they disagree, `ai-only` when there are no votes). It does **not** change `answer`: the displayed answer is always the AI's. It then rebuilds the manifest.
4. `build_manifest.py` writes `data/index.json`, which the home page reads. It holds the per-exam `count` and `stats`.

Question schema: `n`, `text`, `options` (letter → text), `pick` (how many answers to choose), `answer`, `aiAnswer`, `commentAnswer`, `commentVotes`, `status`, `ocrNote`. `validate.py` enforces `len(answer) == pick`, answers drawn from `options`, a valid `status`, and a manifest that matches the data. `--draft` allows exams that have no answers yet. CI runs without it.

**Gotcha:** after adding or editing any `data/*.json`, run `build_manifest.py` before committing, or the CI `--check-manifest` step fails.

### Front end (`mln131-quiz/assets/`)

- `core.js` holds the pure logic (scoring, `isCorrect`, response sanitizing, seeded `shuffled` via mulberry32, and `localStorage` wrappers keyed `mln131:<examId>:<mode>`). It is the only module with unit tests, so put testable logic here rather than in the page scripts.
- `home.js` (`index.html`) lists the exams from `data/index.json` and shows saved progress.
- `quiz.js` (`quiz.html?id=<examId>&mode=exam|study`) is a single view state machine (`study | examStart | exam | result`). **Thi thử** (exam) mode has a countdown and shows answers only after submitting, scored out of 10. **Ôn tập** (study) mode gives instant feedback. The "Báo lỗi" button opens a prefilled GitHub issue on `linhjr87/open-quiz`.
- `icons.js` holds the SVG icons and the `esc` HTML-escaping helper. Escape all question text through `esc`.
- `design/prototype.html` is the UI prototype. The spec and plan are in `docs/superpowers/`.

### CI/CD

`.github/workflows/pages.yml` runs on every push to `main`. It runs the JS tests, the Python tests and the validator, then uploads `mln131-quiz/` as the Pages artifact.

## Never commit

These are already gitignored: `cookie.txt` (fuexam session), `MLN131/` (source images, `answers_all.csv`, raw `comments.json`/`answers.md`), `.venv/`, `.superpowers/` (agent scratch).
