#!/usr/bin/env python3
"""Builds the static site into docs/ from content/*.json and src/.

Usage:  python build.py          (needs Python 3.9+, no other packages)
Then:   python -m http.server 8000 --directory docs
"""
import html
import json
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
OUT = ROOT / "docs"


def load(name):
    return json.loads((ROOT / "content" / f"{name}.json").read_text(encoding="utf-8"))


P, CAREER, PROJ, CRED, SK, MAP, AI = [load(n) for n in ("profile", "career", "projects", "credentials", "skills", "map", "ai")]
SITE = P["site_url"].rstrip("/") + "/"
BASE_PATH = urlparse(SITE).path
ALL = PROJ["projects"]
BY_SLUG = {p["slug"]: p for p in ALL}
PERSONAL = {p["slug"]: p for p in PROJ["personal"]}
ROLES = {r["id"]: (r, e) for e in CAREER["employers"] for r in e["roles"]}
ASSET_V = "1"
errors = []
e = html.escape
NAV = [("Profile", "profile/"), ("Career", "career/"), ("Projects", "projects/"), ("AI", "ai/"), ("Skills", "skills/"), ("Credentials", "credentials/")]


def page(path, title, desc, body, current="", og_type="website", jsonld=None):
    depth = path.count("/")
    r = "../" * depth
    full_title = title if title.startswith(P["name"]) else f"{title} | {P['name']}"
    nav = "".join(
        f'<a href="{r}{h}"{" aria-current=page" if current == h else ""}>{n}</a>' for n, h in NAV
    )
    ld = f'<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>' if jsonld else ""
    canonical = SITE + path
    doc = f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#0b1215">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{SITE}assets/social-preview.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{r}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{r}assets/apple-touch-icon.png">
<link rel="preload" href="{r}assets/fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{r}assets/fonts/instrument-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{r}assets/styles.css?v={ASSET_V}">
<script>document.documentElement.classList.add('js')</script>
{ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <a class="wordmark" href="{r or './'}"><span class="mark" aria-hidden="true"></span>Ali Alzahrani</a>
  <nav class="nav-wide" aria-label="Main">{nav}<a class="nav-cv" href="{r}Ali-Alzahrani-CV.pdf">Download CV</a></nav>
  <details class="menu">
    <summary><span>Menu</span></summary>
    <nav class="nav-narrow" aria-label="Main, small screens">{nav}<a class="nav-cv" href="{r}Ali-Alzahrani-CV.pdf">Download CV</a></nav>
  </details>
</header>
<main id="main">
{body.replace('@@/', r)}
</main>
<footer class="site-foot">
  <div class="foot-grid">
    <div>
      <p class="foot-name">Ali Alzahrani</p>
      <p>{e(P['current_title'])}<br>{e(P['location'])}</p>
    </div>
    <nav aria-label="Footer">{nav}</nav>
    <div class="foot-contact">
      <a href="mailto:{P['email']}">{P['email']}</a>
      <a href="{P['linkedin']}" rel="me noopener">{P['linkedin_label']}</a>
      <a href="{r}Ali-Alzahrani-CV.pdf">Download CV (PDF)</a>
    </div>
  </div>
</footer>
<script src="{r}assets/app.js?v={ASSET_V}" defer></script>
</body>
</html>
"""
    target = OUT / path / "index.html" if (not path or path.endswith("/")) else OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(doc, encoding="utf-8")
    return path


def case_href(slug):
    if slug in BY_SLUG:
        return f"@@/projects/{slug}/" if BY_SLUG[slug]["tier"] != "library" else f"@@/projects/#{slug}"
    if slug in PERSONAL:
        return f"@@/projects/{slug}/"
    errors.append(f"unknown project {slug}")
    return "#"


def case_title(slug):
    return (BY_SLUG.get(slug) or PERSONAL.get(slug) or {"title": slug})["title"]


def cred_item(c, level=3):
    st = f'<span class="status status-{c.get("kind","done")}">{e(c["status"])}</span>' if c.get("status") else ""
    det = f'<p>{e(c["detail"])}</p>' if c.get("detail") else ""
    return f'<li class="cred"><div><h{level}>{e(c["title"])}</h{level}><p class="org">{e(c["org"])}</p>{det}</div>{st}</li>'


def contact_band():
    return f"""<section class="band band-contact" aria-labelledby="contact-title" id="contact">
  <div class="wrap contact-grid">
    <div>
      <p class="eyebrow">Contact</p>
      <h2 id="contact-title">Bring me a difficult problem.</h2>
      <p class="lede">I'm open to conversations with recruiters, technology leaders and collaborators. Email is the best way to reach me.</p>
    </div>
    <div class="contact-actions">
      <a class="contact-line" href="mailto:{P['email']}"><span>Email</span>{P['email']}</a>
      <button class="copy" type="button" data-copy="{P['email']}" hidden>Copy email address</button>
      <a class="contact-line" href="{P['linkedin']}" rel="me noopener"><span>LinkedIn</span>{P['linkedin_label']}</a>
      <a class="contact-line" href="@@/Ali-Alzahrani-CV.pdf"><span>CV</span>Download PDF</a>
      <p class="contact-line static"><span>Based in</span>{e(P['location'])}</p>
    </div>
  </div>
</section>"""


# ---------- Solution Map ----------
def solution_map(short=False):
    hubs = MAP["hubs"]
    pos = {h["id"]: h for h in hubs}
    lines = "".join(
        f'<line data-a="{a}" data-b="{b}" x1="{pos[a]["x"]*10}" y1="{pos[a]["y"]*6}" x2="{pos[b]["x"]*10}" y2="{pos[b]["y"]*6}"/>'
        for a, b, _ in MAP["links"]
    )
    hub_btns = "".join(
        f'<a class="hub" href="#hub-{h["id"]}" data-hub="{h["id"]}" style="--x:{h["x"]};--y:{h["y"]}"><span class="dot" aria-hidden="true"></span><span class="hub-name">{e(h["name"])}</span></a>'
        for h in hubs
    )
    panels = []
    for h in hubs:
        does = "".join(f"<li>{e(x)}</li>" for x in h["does"])
        proof = "".join(f'<li><a href="{case_href(s)}">{e(case_title(s))}</a></li>' for s in h["proof"])
        conns = []
        for a, b, label in MAP["links"]:
            if h["id"] in (a, b):
                other = pos[b if a == h["id"] else a]
                conns.append(f'<li><a class="conn" href="#hub-{other["id"]}" data-hub-link="{other["id"]}"><strong>{e(other["name"])}</strong><span>{e(label)}</span></a></li>')
        panels.append(f"""<article class="hub-panel" id="hub-{h['id']}" data-panel="{h['id']}" tabindex="-1">
  <h3>{e(h['name'])}</h3>
  <p class="hub-line">{e(h['line'])}</p>
  <div class="hub-cols">
    <div><h4>What I do here</h4><ul>{does}</ul></div>
    <div><h4>A decision I stand by</h4><p>{e(h['decision'])}</p>
      <h4>Where to see it</h4><ul class="linklist">{proof}</ul>
      <p class="more"><a href="@@/{h['extra']['href']}">{e(h['extra']['label'])}</a></p></div>
    <div><h4>How it connects</h4><ul class="conns">{''.join(conns)}</ul></div>
  </div>
</article>""")
    traces_btn = "".join(
        f'<li><a class="trace-btn" href="#trace-{t["id"]}" data-trace="{t["id"]}">{e(t["problem"])}</a></li>' for t in MAP["traces"]
    )
    traces = []
    for t in MAP["traces"]:
        hubname = {h["id"]: h["name"] for h in hubs}
        steps = "".join(
            f'<li data-at="{p}"><span class="at">{e(hubname[p])}</span>{e(s)}</li>' for p, s in zip(t["path"], t["steps"])
        )
        if len(t["path"]) != len(t["steps"]):
            errors.append(f"trace {t['id']} path/steps mismatch")
        traces.append(f"""<article class="trace-panel" id="trace-{t['id']}" data-trace-panel="{t['id']}" data-path="{','.join(t['path'])}" tabindex="-1">
  <h3>{e(t['problem'])}</h3>
  <ol class="trace-steps">{steps}</ol>
  <p class="more"><a href="{case_href(t['case'])}">Read the full case study</a></p>
</article>""")
    return f"""<section class="band band-map" id="solution-map" aria-labelledby="map-title">
  <div class="wrap">
    <div class="map-head">
      <div>
        <p class="eyebrow">The Solution Map</p>
        <h2 id="map-title">Real problems rarely stay in one department.</h2>
      </div>
      <p class="lede">This is how I think: people, AI, enterprise technology, industrial operations and security, all connected to a business outcome. Choose an area, or trace how a real problem was solved. The map is conceptual and doesn't show any employer's actual systems.</p>
    </div>
    <div class="map-grid">
      <div class="map-left">
        <div class="map-stage" data-map>
          <svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g class="map-lines">{lines}</g><polyline class="map-trace" points="" pathLength="1"/></svg>
          <nav class="hubs" aria-label="Areas of the Solution Map">{hub_btns}</nav>
        </div>
        <div class="traces">
          <h3 class="traces-title">Trace a real problem</h3>
          <ul>{traces_btn}</ul>
        </div>
      </div>
      <div class="map-panels" aria-live="polite">
        {''.join(panels)}
        {''.join(traces)}
      </div>
    </div>
  </div>
</section>"""


# ---------- Career timeline ----------
def timeline():
    s, end = 2014.0, 2027.0
    items = []
    for emp in CAREER["employers"]:
        for r in emp["roles"]:
            left = (r["start"] - s) / (end - s) * 100
            width = (r["end"] - r["start"]) / (end - s) * 100
            items.append(
                f'<li class="tl-role" style="--l:{left:.2f};--w:{width:.2f}"><a href="@@/career/#{r["id"]}"><span class="tl-bar" aria-hidden="true"></span><span class="tl-text"><strong>{e(r["title"])}</strong><span>{e(emp["name"])}, {e(r["dates"])}</span></span></a></li>'
            )
    items.reverse()
    years = "".join(f'<span style="--l:{(y - s) / (end - s) * 100:.2f}">{y}</span>' for y in range(2014, 2027, 2))
    return f'<div class="timeline"><ol>{"".join(items)}</ol><div class="tl-years" aria-hidden="true">{years}</div></div>'


# ---------- Pages ----------
def project_card(p, cls=""):
    return f"""<a class="pcard {cls}" href="@@/projects/{p['slug']}/">
  <p class="pcard-key">{e(p['key'])}</p>
  <h3>{e(p['title'])}</h3>
  <p>{e(p['summary'])}</p>
  <p class="pcard-meta">{e(p['where'])} · {e(p['my_role'])}</p>
</a>"""


def home():
    proof = "".join(
        f'<li><a href="@@/{x["href"]}"><strong>{e(x["figure"])}</strong><span>{e(x["label"])}</span></a></li>' for x in P["proof"]
    )
    traits = "".join(
        f'<li><h3>{e(t["name"])}</h3><div><p>{e(t["text"])}</p><a href="@@/{t["href"]}">{e(t["link"])}</a></div></li>' for t in P["traits"]
    )
    flagship = "".join(project_card(p) for p in ALL if p["tier"] == "flagship")
    ai_layers = "".join(
        f'<li><h3>{e(l["name"])}</h3><p class="status-line">{e(l["status"])}</p></li>' for l in AI["layers"]
    )
    body = f"""<section class="hero">
  <div class="hero-lines" aria-hidden="true"></div>
  <div class="wrap hero-grid">
    <div class="hero-text">
      <p class="eyebrow">{e(P['current_title'])} · {e(P['location'])}</p>
      <h1>Ali Alzahrani</h1>
      <p class="hero-head">{e(P['headline'])}</p>
      <p class="hero-value">{e(P['value'])}</p>
      <div class="cta">
        <a class="btn btn-solid" href="#solution-map">Explore the Solution Map</a>
        <a class="btn" href="@@/Ali-Alzahrani-CV.pdf">Download CV</a>
        <a class="btn-text" href="#contact">Contact</a>
      </div>
    </div>
    <figure class="portrait">
      <picture>
        <source srcset="@@/assets/ali-480.webp 480w, @@/assets/ali-800.webp 800w" type="image/webp" sizes="(max-width: 860px) 60vw, 380px">
        <img src="@@/assets/ali-800.jpg" width="800" height="1000" alt="Portrait of Ali Alzahrani in a white thobe and red shemagh" fetchpriority="high">
      </picture>
    </figure>
  </div>
  <div class="wrap"><ul class="proof">{proof}</ul></div>
</section>

<section class="band band-ivory philosophy" aria-labelledby="phil-title">
  <div class="wrap narrow">
    <p class="eyebrow" id="phil-title">My philosophy</p>
    <blockquote>{e(P['philosophy'])}</blockquote>
  </div>
</section>

{solution_map()}

<section class="band band-ivory" aria-labelledby="work-title">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Selected work</p><h2 id="work-title">The challenge, the decisions, the result.</h2></div>
    <a class="all" href="@@/projects/">All projects and contributions</a></div>
    <div class="pgrid">{flagship}</div>
  </div>
</section>

<section class="band band-ai" aria-labelledby="ai-title">
  <div class="wrap ai-split">
    <div>
      <p class="eyebrow">AI expertise</p>
      <h2 id="ai-title">AI is how I work, not something I talk about.</h2>
      <p class="lede">{e(AI['intro'])}</p>
      <a class="btn btn-solid" href="@@/ai/">See the full range of my AI work</a>
    </div>
    <ul class="ai-layers">{ai_layers}</ul>
  </div>
</section>

<section class="band band-ivory" aria-labelledby="traits-title">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">How I show up</p><h2 id="traits-title">What people can count on, with the evidence.</h2></div></div>
    <ol class="traits">{traits}</ol>
  </div>
</section>

<section class="band band-ink" aria-labelledby="career-title">
  <div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Career</p><h2 id="career-title">From remote sites to a regional role.</h2></div>
    <a class="all" href="@@/career/">Complete career history</a></div>
    {timeline()}
  </div>
</section>

{contact_band()}"""
    person = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": P["name"],
        "url": SITE,
        "image": SITE + "assets/ali-800.jpg",
        "jobTitle": "Middle East IT Leader",
        "worksFor": {"@type": "Organization", "name": "Vallourec"},
        "email": "mailto:" + P["email"],
        "address": {"@type": "PostalAddress", "addressRegion": "Eastern Province", "addressCountry": "SA"},
        "sameAs": [P["linkedin"]],
        "alumniOf": [{"@type": "CollegeOrUniversity", "name": "Arab Open University"}, {"@type": "CollegeOrUniversity", "name": "University of Nottingham"}],
        "knowsLanguage": ["Arabic", "English", "Spanish"],
        "knowsAbout": ["Enterprise IT", "Industrial IT", "Cybersecurity coordination", "AI adoption", "Digital transformation"],
    }
    return page("", f"{P['name']}: {P['headline']}", P["description"], body, jsonld=person)


def profile():
    journey = "".join(f"<p>{e(x)}</p>" for x in P["journey"])
    contrib = "".join(f'<li><h3>{e(c["title"])}</h3><p>{e(c["text"])}</p></li>' for c in P["contribution"])
    how = "".join(f"<li>{e(x)}</li>" for x in P["how_i_work"])
    traits = "".join(f'<li><h3>{e(t["name"])}</h3><div><p>{e(t["text"])}</p><a href="@@/{t["href"]}">{e(t["link"])}</a></div></li>' for t in P["traits"])
    langs = "".join(f'<li><strong>{e(l["name"])}</strong> {e(l["level"])}</li>' for l in P["languages"])
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">Professional profile</p>
  <h1>I have never faced an issue without providing a solution.</h1>
  <p class="lede">That is how I describe my own approach, and it is a high bar to set in public. The rest of this site is the evidence.</p>
</div></section>
<section class="band band-ivory"><div class="wrap two-col">
  <div><h2 class="side">My journey</h2></div>
  <div class="prose">{journey}</div>
</div></section>
<section class="band band-ink"><div class="wrap">
  <div class="sec-head"><div><p class="eyebrow">Contribution</p><h2>What I bring to an organisation</h2></div></div>
  <ul class="contrib">{contrib}</ul>
</div></section>
<section class="band band-ivory"><div class="wrap two-col">
  <div><h2 class="side">How I work</h2></div>
  <ul class="plain-list">{how}</ul>
</div></section>
<section class="band band-ivory band-tight"><div class="wrap">
  <div class="sec-head"><div><p class="eyebrow">Strengths, with evidence</p><h2>What people can count on</h2></div></div>
  <ol class="traits">{traits}</ol>
</div></section>
<section class="band band-ink band-tight"><div class="wrap two-col">
  <div><h2 class="side">Languages</h2></div>
  <ul class="langs">{langs}</ul>
</div></section>
{contact_band()}"""
    return page("profile/", "Professional profile", "Ali Alzahrani's professional journey, working approach and contribution to organisations.", body, current="profile/")


def career():
    legend = "".join(f'<li><span class="tag tag-{k}">{e(v)}</span></li>' for k, v in CAREER["legend"].items())
    out = []
    for emp in CAREER["employers"]:
        roles = []
        for r in emp["roles"]:
            groups = ""
            for g in r["groups"]:
                items = "".join(
                    f'<li><span class="tag tag-{k}">{e(CAREER["legend"][k])}</span><span>{e(t)}</span></li>' for k, t in g["items"]
                )
                groups += f'<h3 class="minor">{e(g["name"])}</h3><ul class="duties">{items}</ul>'
            cases = "".join(f'<li><a href="{case_href(c)}">{e(case_title(c))}</a></li>' for c in r["cases"])
            roles.append(f"""<details class="role" id="{r['id']}" open>
  <summary><span class="role-title">{e(r['title'])}</span><span class="role-dates">{e(r['dates'])}</span></summary>
  <div class="role-body">
    <p class="role-sum">{e(r['summary'])}</p>
    {groups}
    <h3 class="minor">Related case studies</h3><ul class="linklist">{cases}</ul>
  </div>
</details>""")
        legal = f" ({e(emp['legal'])})" if emp.get("legal") else ""
        out.append(f"""<section class="employer">
  <header><h2>{e(emp['name'])}{legal}</h2><p>{e(emp['context'])} · {e(emp['dates'])}</p></header>
  {''.join(roles)}
</section>""")
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">Career history</p>
  <h1>Twelve years, five roles, two very different industries.</h1>
  <p class="lede">Start with the overview, then open any role for its full detail. Each line says whether I led, built, coordinated or supported the work.</p>
</div></section>
<section class="band band-ink band-tight"><div class="wrap">{timeline()}</div></section>
<section class="band band-ivory"><div class="wrap career">
  <div class="career-tools">
    <ul class="legend" aria-label="Key to my role in each item">{legend}</ul>
    <button type="button" class="link-btn" data-toggle-roles hidden>Collapse all roles</button>
  </div>
  {''.join(out)}
  <p class="career-note">{e(CAREER['earlier'])} <a href="@@/credentials/">See education</a>. {e(CAREER['references'])}</p>
</div></section>
{contact_band()}"""
    return page("career/", "Career history", "Complete career history of Ali Alzahrani: Middle East IT Leader, Infrastructure Expert and Project Manager, IT Specialist, Head of IT Department and Project Engineer.", body, current="career/")


def skills():
    total = 0
    cats = []
    levels = SK["levels"]
    chips = ['<button type="button" class="chip" data-cat="all" aria-pressed="true">All</button>']
    for c in SK["categories"]:
        rows = []
        for name, lvl, refs in c["skills"]:
            total += 1
            links = []
            for ref in filter(None, refs.split(",")):
                if ref == "@career":
                    links.append('<a href="@@/career/">Career history</a>')
                elif ref == "@credentials":
                    links.append('<a href="@@/credentials/">Credentials</a>')
                elif ref == "@ai":
                    links.append('<a href="@@/ai/">AI work</a>')
                else:
                    links.append(f'<a href="{case_href(ref)}">{e(case_title(ref))}</a>')
            lv = levels.get(lvl)
            if not lv:
                errors.append(f"bad level {lvl} on {name}")
            rows.append(
                f'<li class="skill" data-name="{e(name.lower())}" data-level="{lvl}"><span class="skill-name">{e(name)}</span><span class="skill-level">{e(lv or "")}</span><span class="skill-links">{" ".join(links)}</span></li>'
            )
        chips.append(f'<button type="button" class="chip" data-cat="{c["id"]}" aria-pressed="false">{e(c["name"])}</button>')
        cats.append(f'<section class="skill-cat" data-category="{c["id"]}" id="{c["id"]}"><h2>{e(c["name"])} <span class="count">{len(rows)}</span></h2><ul>{"".join(rows)}</ul></section>')
    legend = "".join(f"<li><strong>{e(v)}</strong></li>" for v in levels.values())
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">Skills and capabilities</p>
  <h1>The complete directory.</h1>
  <p class="lede">All {total} skills and technologies, with where I applied them. I describe how I used each one rather than giving it a percentage score.</p>
</div></section>
<section class="band band-ivory"><div class="wrap">
  <div class="skill-tools">
    <label for="skill-search">Find a skill or technology</label>
    <input id="skill-search" type="search" placeholder="Try Copilot, Intune, Cisco, procurement" autocomplete="off" disabled>
    <p class="skill-count" role="status" data-count>{total} skills</p>
    <div class="chips" data-chips hidden role="group" aria-label="Filter by category">{''.join(chips)}</div>
  </div>
  <p class="no-results" data-empty hidden>No skills match that search. <button type="button" class="link-btn" data-clear>Clear search</button></p>
  {''.join(cats)}
  <ul class="levels" aria-label="How proficiency is described"><li>How I describe my use:</li>{legend}</ul>
</div></section>
{contact_band()}"""
    return page("skills/", "Skills and capabilities", f"A searchable directory of Ali Alzahrani's {total} professional skills and technologies, across AI, infrastructure, networking, security, industrial IT and leadership.", body, current="skills/")


def projects_index():
    flagship = "".join(project_card(p) for p in ALL if p["tier"] == "flagship")
    cases = "".join(project_card(p) for p in ALL if p["tier"] == "case")
    lib = "".join(
        f'<li id="{p["slug"]}"><div><h3>{e(p["title"])}</h3><p>{e(p["summary"])}</p></div><p class="lib-meta">{e(p["where"])}<br>{e(p["my_role"])}. {e(p["status"])}.<br><a href="@@/career/#{p["role_id"]}">{e(ROLES[p["role_id"]][0]["title"])}</a></p></li>'
        for p in ALL if p["tier"] == "library"
    )
    personal = "".join(
        f'<a class="pcard pcard-p" href="@@/projects/{p["slug"]}/"><p class="pcard-key">{e(p["stage"])}</p><h3>{e(p["title"])}</h3><p>{e(p["summary"])}</p><p class="pcard-meta">{e(p["category"])}</p></a>'
        for p in PROJ["personal"]
    )
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">Projects and achievements</p>
  <h1>How problems were actually solved.</h1>
  <p class="lede">The strongest work comes first, with every other documented contribution below it. {e(PROJ['note'])}</p>
</div></section>
<section class="band band-ivory"><div class="wrap">
  <h2 class="group">Flagship work</h2><div class="pgrid">{flagship}</div>
  <h2 class="group">More case studies</h2><div class="pgrid">{cases}</div>
  <h2 class="group">Other contributions</h2><ul class="library">{lib}</ul>
</div></section>
<section class="band band-ink" id="personal"><div class="wrap">
  <div class="sec-head"><div><p class="eyebrow">Personal innovation</p><h2>What I build on my own time</h2></div></div>
  <p class="lede narrow-l">Each project shows its actual stage. These are separate from my employment, and I direct and test them with AI-assisted development.</p>
  <div class="pgrid">{personal}</div>
</div></section>
{contact_band()}"""
    page("projects/", "Projects and achievements", "Case studies and documented contributions from Ali Alzahrani's career, plus personal AI projects with their actual status.", body, current="projects/")
    for p in ALL:
        if p["tier"] != "library":
            case_page(p)
    for p in PROJ["personal"]:
        personal_page(p)


def case_page(p):
    role, emp = ROLES[p["role_id"]]
    dec = "".join(f"<li>{e(x)}</li>" for x in p["decisions"])
    known = {s[0] for c in SK["categories"] for s in c["skills"]}
    for s in p["skills"]:
        if s not in known:
            errors.append(f"case {p['slug']} skill not in directory: {s}")
    sk = "".join(f'<li><a href="@@/skills/?q={e(s)}">{e(s)}</a></li>' for s in p["skills"])
    idx = [x for x in ALL if x["tier"] != "library"]
    nxt = idx[(idx.index(p) + 1) % len(idx)]
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="crumb"><a href="@@/projects/">Projects</a></p>
  <p class="eyebrow">{e(p['where'])}</p>
  <h1>{e(p['title'])}</h1>
  <p class="lede">{e(p['summary'])}</p>
  <dl class="facts"><div><dt>My role</dt><dd>{e(p['my_role'])}</dd></div><div><dt>Status</dt><dd>{e(p['status'])}</dd></div><div><dt>Position</dt><dd><a href="@@/career/#{p['role_id']}">{e(role['title'])}</a></dd></div></dl>
</div></section>
<section class="band band-ivory"><div class="wrap narrow case">
  <h2><span>1</span>The challenge</h2><p>{e(p['challenge'])}</p>
  <h2><span>2</span>My responsibility</h2><p>{e(p['responsibility'])}</p>
  <h2><span>3</span>My reasoning and decisions</h2><ul>{dec}</ul>
  <h2><span>4</span>The solution</h2><p>{e(p['solution'])}</p>
  <h2><span>5</span>The result</h2><p class="result">{e(p['result'])}</p>
  <h2><span>6</span>Skills demonstrated</h2><ul class="tags">{sk}</ul>
  <p class="next">Next: <a href="@@/projects/{nxt['slug']}/">{e(nxt['title'])}</a></p>
</div></section>
{contact_band()}"""
    page(f"projects/{p['slug']}/", p["title"], p["summary"], body, current="projects/", og_type="article")


def personal_page(p):
    dec = "".join(f"<li>{e(x)}</li>" for x in p["decisions"])
    con = "".join(f"<li>{e(x)}</li>" for x in p["contributions"])
    tech = "".join(f"<li>{e(x)}</li>" for x in p["technologies"])
    tech_block = f'<h2>Implementation environment</h2><ul class="tags plain">{tech}</ul>' if tech else ""
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="crumb"><a href="@@/projects/#personal">Personal innovation</a></p>
  <p class="eyebrow">{e(p['category'])}</p>
  <h1>{e(p['title'])}</h1>
  <p class="lede">{e(p['summary'])}</p>
  <dl class="facts"><div><dt>Actual status</dt><dd>{e(p['status'])}</dd></div><div><dt>My role</dt><dd>{e(p['role'])}</dd></div></dl>
</div></section>
<section class="band band-ivory"><div class="wrap narrow case">
  <h2>Decisions I made</h2><ul>{dec}</ul>
  <h2>What it covers</h2><ul>{con}</ul>
  {tech_block}
  <p class="note">{e(p['note'])}</p>
</div></section>
{contact_band()}"""
    page(f"projects/{p['slug']}/", p["title"], p["summary"], body, current="projects/", og_type="article")


def ai_page():
    def fix(h):
        return "#personal-ai" if h == "#projects" else "@@/" + h
    layers = "".join(
        f'<li><div><p class="status-line">{e(l["status"])}</p><h3>{e(l["name"])}</h3></div><div><p>{e(l["text"])}</p><a href="{fix(l["href"])}">{e(l["link"])}</a></div></li>'
        for l in AI["layers"]
    )
    caps = "".join(f'<li><h3>{e(c["name"])}</h3><p class="status-line">{e(c["level"])}</p><p>{e(c["text"])}</p></li>' for c in AI["capabilities"])
    personal = "".join(
        f'<a class="pcard pcard-p" href="@@/projects/{p["slug"]}/"><p class="pcard-key">{e(p["stage"])}</p><h3>{e(p["title"])}</h3><p>{e(p["summary"])}</p><p class="pcard-meta">{e(p["status"])}</p></a>'
        for p in PROJ["personal"] if p["slug"] != "hospital-database"
    )
    learn = "".join(f"<li>{e(x)}</li>" for x in AI["learning"])
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">AI expertise and innovation</p>
  <h1>AI is how I work, not something I talk about.</h1>
  <p class="lede">{e(AI['intro'])}</p>
</div></section>
<section class="band band-ivory"><div class="wrap"><h2 class="group">Where I apply it</h2><ol class="ai-rows">{layers}</ol></div></section>
<section class="band band-ink"><div class="wrap">
  <div class="sec-head"><div><p class="eyebrow">Capabilities</p><h2>The full range, with an honest level for each</h2></div></div>
  <ul class="caps">{caps}</ul>
</div></section>
<section class="band band-ivory" id="personal-ai"><div class="wrap">
  <div class="sec-head"><div><p class="eyebrow">Innovation</p><h2>Personal AI projects, with their actual status</h2></div></div>
  <div class="pgrid">{personal}</div>
  <h2 class="group">How I keep learning</h2><ul class="plain-list">{learn}</ul>
</div></section>
{contact_band()}"""
    return page("ai/", "AI expertise and innovation", "Ali Alzahrani's practical AI work: adoption, training, use-case delivery, automation, governance, agents and personal AI projects.", body, current="ai/")


def credentials():
    edu = "".join(cred_item(c) for c in CRED["education"])
    qual = "".join(cred_item(c) for c in CRED["qualifications"])
    groups = "".join(f'<h3 class="cred-group">{e(g["name"])}</h3><ul class="creds">{"".join(cred_item(c, 4) for c in g["items"])}</ul>' for g in CRED["groups"])
    awards = "".join(f'<li><h3>{e(a["title"])}</h3><p>{e(a["org"])}. {e(a["detail"])}</p></li>' for a in CRED["awards"])
    aff = "".join(f"<li>{e(a)}</li>" for a in CRED["affiliations"])
    body = f"""<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">Education and professional development</p>
  <h1>Qualifications, stated exactly.</h1>
  <p class="lede">Formal education, professional credentials and training are kept apart here, and each one shows its actual status.</p>
</div></section>
<section class="band band-ivory"><div class="wrap two-col">
  <div><h2 class="side">Formal education</h2></div><ul class="creds">{edu}</ul>
</div></section>
<section class="band band-ivory band-tight"><div class="wrap two-col">
  <div><h2 class="side">Professional credentials</h2></div>
  <div><ul class="creds">{qual}</ul><p class="note">{e(CRED['standards_note'])}</p></div>
</div></section>
<section class="band band-ivory band-tight"><div class="wrap two-col">
  <div><h2 class="side">Courses and training</h2></div><div>{groups}</div>
</div></section>
<section class="band band-ink"><div class="wrap two-col">
  <div><h2 class="side">Awards and scholarships</h2></div><ul class="awards">{awards}</ul>
</div></section>
<section class="band band-ink band-tight"><div class="wrap two-col">
  <div><h2 class="side">Affiliations</h2></div><ul class="plain-list">{aff}</ul>
</div></section>
{contact_band()}"""
    return page("credentials/", "Education and credentials", "Verified education, professional credentials, courses, awards and affiliations of Ali Alzahrani.", body, current="credentials/")


def not_found():
    body = """<section class="page-head"><div class="wrap narrow">
  <p class="eyebrow">Page not found</p>
  <h1>This page doesn't exist. Here's the way back.</h1>
  <p class="lede"><a href="./">Go to the home page</a>, or look through the <a href="career/">career history</a>, the <a href="projects/">projects</a> or the <a href="skills/">skills directory</a>.</p>
</div></section>"""
    page("404.html", "Page not found", "This page could not be found.", body)
    f = OUT / "404.html"
    t = f.read_text(encoding="utf-8").replace("<head>", f'<head>\n<base href="{BASE_PATH}">', 1).replace('<meta name="description"', '<meta name="robots" content="noindex">\n<meta name="description"', 1)
    f.write_text(t, encoding="utf-8")


def main():
    if OUT.exists():
        for child in OUT.iterdir():
            if child.name == "Ali-Alzahrani-CV.pdf":
                continue
            shutil.rmtree(child) if child.is_dir() else child.unlink()
    OUT.mkdir(exist_ok=True)
    shutil.copytree(ROOT / "src" / "assets", OUT / "assets")
    shutil.copy(ROOT / "src" / "styles.css", OUT / "assets" / "styles.css")
    shutil.copy(ROOT / "src" / "app.js", OUT / "assets" / "app.js")
    home(); profile(); career(); skills(); projects_index(); ai_page(); credentials(); not_found()
    urls = sorted(str(p.parent.relative_to(OUT)).replace("\\", "/") for p in OUT.rglob("index.html"))
    sm = "".join(f"<url><loc>{SITE}{'' if u == '.' else u + '/'}</loc></url>" for u in urls)
    (OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sm}</urlset>', encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    if not (OUT / "Ali-Alzahrani-CV.pdf").exists():
        errors.append("CV PDF missing: run python cv/build_cv.py")
    print(f"Built {len(urls)} pages into {OUT}")
    if errors:
        print("PROBLEMS:\n - " + "\n - ".join(sorted(set(errors))))
        sys.exit(1)


if __name__ == "__main__":
    main()
