"""Builds the single-page 3D network site into docs/ from content/*.json and network/.

Run after the main build (build.py calls this automatically):
    python network/build_network.py
"""
import datetime
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent
OUT = ROOT / "docs"
CONTENT = ROOT / "content"
SITE = "https://the1alex.github.io/ali-alzahrani/"

# Old multi-page paths now open the matching place in the network.
LEGACY = {
    "ai": "ai",
    "career": "career",
    "credentials": "credentials",
    "profile": "career",
    "skills": "skills",
    "projects": "projects",
}


def load(name):
    return json.loads((CONTENT / f"{name}.json").read_text(encoding="utf-8"))


def redirect(path, target):
    depth = len(Path(path).parts)
    rel = "../" * depth
    html = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="robots" content="noindex">'
        f'<link rel="canonical" href="{SITE}#{target}">'
        f'<meta http-equiv="refresh" content="0; url={rel}#{target}">'
        "<title>Ali Alzahrani</title></head><body>"
        f'<script>location.replace("{rel}#{target}")</script>'
        f'<a href="{rel}#{target}">Continue to Ali Alzahrani</a></body></html>'
    )
    d = OUT / path
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(html, encoding="utf-8")


def main():
    data = {k: load(k) for k in ["profile", "career", "projects", "ai", "credentials", "skills", "map"]}
    data["built"] = datetime.date.today().isoformat()
    net = OUT / "net"
    net.mkdir(parents=True, exist_ok=True)
    js = "export const DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (net / "data.js").write_text(js, encoding="utf-8")
    sources = sorted(f for f in (SRC / "net").iterdir() if f.is_file())
    digest = hashlib.sha1(js.encode("utf-8"))
    for f in sources:
        digest.update(f.read_bytes())
    v = digest.hexdigest()[:10]
    for f in sources:
        if f.suffix == ".js":
            text = f.read_text(encoding="utf-8")
            text = text.replace("'./data.js'", f"'./data.js?v={v}'").replace("'./world.js'", f"'./world.js?v={v}'")
            (net / f.name).write_text(text, encoding="utf-8")
        else:
            shutil.copy(f, net / f.name)
    index = (SRC / "index.html").read_text(encoding="utf-8")
    for asset in ("net/style.css", "net/app.js", "net/data.js"):
        index = index.replace(asset, f"{asset}?v={v}")
    (OUT / "index.html").write_text(index, encoding="utf-8")
    shutil.copy(SRC / "404.html", OUT / "404.html")

    for old, target in LEGACY.items():
        redirect(old, target)
    for p in data["projects"]["projects"]:
        redirect(f"projects/{p['slug']}", f"project/{p['slug']}")

    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"<url><loc>{SITE}</loc></url></urlset>",
        encoding="utf-8",
    )
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    if not (OUT / "Ali-Alzahrani-CV.pdf").exists():
        raise SystemExit("CV PDF missing: run python cv/build_cv.py")
    print(f"Network site built into {OUT}")


if __name__ == "__main__":
    main()
