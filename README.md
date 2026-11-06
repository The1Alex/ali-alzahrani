# Ali Alzahrani: professional website

A fast, static website with no build dependencies other than Python.

## Update the content

All the words live in `content/`. You don't need to touch the design code.

| File | What it holds |
|---|---|
| `profile.json` | Name, headline, philosophy, contact details, journey |
| `career.json` | Employers, roles, dates and responsibilities |
| `projects.json` | Case studies and personal projects |
| `skills.json` | The skills directory |
| `credentials.json` | Education, credentials, courses and awards |
| `ai.json` | The AI page |
| `map.json` | The Solution Map |

When a credential changes (for example, when the PMP is passed), edit `credentials.json` and `cv/build_cv.py`, so that the site and CV keep agreeing.

## Build and preview

```
python cv/build_cv.py
python build.py
python -m http.server 8000 --directory docs
```

Then open http://localhost:8000. The `cv/build_cv.py` step needs the private CV builder in `../tmp/cv-builder`, and is only needed when the CV changes.

## Publish

GitHub Pages serves the `docs/` folder of the `main` branch in the separate publishing checkout. This development repository and its history contain private preparation details; do not push it to the public repository.

```
python build.py
python prepare_publish.py
cd ../.codex-work/ali-alzahrani-publication
git add -A
git commit -m "Update website"
git push
```

The publication URL is https://the1alex.github.io/ali-alzahrani/. The publishing checkout includes only generated website files and its public README.

## Fonts

Inter, under the SIL Open Font License.
