"""Copy generated public files into a separate, history-free publishing checkout."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "docs"
CHECKOUT = ROOT.parent / ".codex-work" / "ali-alzahrani-publication"
DESTINATION = CHECKOUT / "docs"

if not (SOURCE / "index.html").is_file():
    raise SystemExit("Build the website with python build.py first.")
if CHECKOUT.resolve().parent != (ROOT.parent / ".codex-work").resolve():
    raise SystemExit("Unexpected publication destination.")

files = [path for path in SOURCE.rglob("*") if path.is_file()]
if any(path.is_symlink() or not path.resolve().is_relative_to(SOURCE.resolve()) for path in files):
    raise SystemExit("The public output contains a file outside the website folder.")
DESTINATION.mkdir(parents=True, exist_ok=True)
relative_files = {path.relative_to(SOURCE) for path in files}
for old_file in DESTINATION.rglob("*"):
    if old_file.is_file() and old_file.relative_to(DESTINATION) not in relative_files:
        if not old_file.resolve().is_relative_to(DESTINATION.resolve()):
            raise SystemExit("Unexpected file outside the publication folder.")
        old_file.unlink()
for path in files:
    target = DESTINATION / path.relative_to(SOURCE)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)

(CHECKOUT / "README.md").write_text(
    "# Ali Alzahrani\n\n"
    "Published professional website: https://the1alex.github.io/ali-alzahrani/\n\n"
    "This repository contains only the generated public website. "
    "GitHub Pages serves `docs/` from the `main` branch. "
    "Development files and private source documents are maintained separately.\n",
    encoding="utf-8",
)
(CHECKOUT / ".gitattributes").write_text(
    "* text=auto\n*.pdf binary\n*.jpg binary\n*.png binary\n*.webp binary\n*.woff2 binary\n",
    encoding="utf-8",
)
print(f"Prepared {len(files)} public files in {CHECKOUT}")
