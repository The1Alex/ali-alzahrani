#!/usr/bin/env python3
"""Builds the static site into docs/ from content/*.json and src/.

Usage:  python build.py          (needs Python 3.9+, no other packages)
Then:   python -m http.server 8000 --directory docs
"""
import hashlib
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
ROLES = {r["id"]: (r, emp) for emp in CAREER["employers"] for r in emp["roles"]}
ASSET_V = hashlib.sha1((ROOT / "src" / "styles.css").read_bytes() + (ROOT / "src" / "app.js").read_bytes()).hexdigest()[:8]
errors = []
e = html.escape
NAV = [("Profile", "profile/"), ("Career", "career/"), ("Projects", "projects/"), ("AI", "ai/"), ("Skills", "skills/"), ("Credentials", "credentials/")]
CV = "@@/Ali-Alzahrani-CV.pdf"


def waves(variant=""):
    a = "M0 100C200 58 400 58 600 100S1000 142 1200 100 1600 58 1800 100 2200 142 2400 100V220H0Z"
    b = "M0 110C150 80 450 80 600 110S1050 140 1200 110 1650 80 1800 110 2250 140 2400 110V220H0Z"
    c = "M0 120C200 96 400 96 600 120S1000 144 1200 120 1600 96 1800 120 2200 144 2400 120V220H0Z"
    return f"""<div class="waves {variant}" aria-hidden="true">
  <svg class="wv wv1" viewBox="0 0 2400 220" preserveAspectRatio="none" focusable="false"><path d="{a}"/></svg>
  <svg class="wv wv2" viewBox="0 0 2400 220" preserveAspectRatio="none" focusable="false"><path d="{b}"/></svg>
  <svg class="wv wv3" viewBox="0 0 2400 220" preserveAspectRatio="none" focusable="false"><path d="{c}"/></svg>
</div>"""


def page(path, title, desc, body, current="", og_type="website", jsonld=None):
    depth = path.count("/")
    r = "../" * depth
    full_title = title if title.startswith(P["name"]) else f"{title} | {P['name']}"
    nav = "".join(f'<a href="{r}{h}"{" aria-current=page" if current == h else ""}>{n}</a>' for n, h in NAV)
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
<meta name="theme-color" content="#06142a">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{SITE}assets/calm-sea-v1.png">
<meta property="og:image:width" content="1672">
<meta property="og:image:height" content="941">
<meta property="og:image:alt" content="A calm blue sea at twilight">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{r}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{r}assets/apple-touch-icon.png">
<link rel="preload" href="{r}assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{r}assets/styles.css?v={ASSET_V}">
<script>document.documentElement.classList.add('js')</script>
{ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="nav-in">
    <a class="wordmark" href="{r or './'}">Ali Alzahrani</a>
    <nav class="nav-wide" aria-label="Main">{nav}<a class="nav-cv" href="{r}Ali-Alzahrani-CV.pdf">Download CV</a></nav>
    <details class="menu">
      <summary aria-label="Menu"><span class="bars" aria-hidden="true"></span></summary>
      <nav class="nav-narrow" aria-label="Main, small screens">{nav}<a class="nav-cv" href="{r}Ali-Alzahrani-CV.pdf">Download CV</a></nav>
    </details>
  </div>
</header>
<main id="main">
{body.replace('@@/', r)}
</main>
<footer class="foot">
  <div class="wrap foot-in">
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
    st = f'<span class="status status-{c.get("kind", "done")}">{e(c["status"])}</span>' if c.get("status") else ""
    det = f'<p>{e(c["detail"])}</p>' if c.get("detail") else ""
    return f'<li class="cred"><div><h{level}>{e(c["title"])}</h{level}><p class="org">{e(c["org"])}</p>{det}</div>{st}</li>'


def contact_band():
    return f"""<section class="contact" aria-labelledby="contact-title" id="contact">
  <div class="wrap contact-in">
    <h2 id="contact-title" class="rv">Bring me a difficult problem.</h2>
    <p class="lede rv">I'm open to conversations with recruiters, technology leaders and collaborators. Email is the best way to reach me.</p>
    <div class="cta rv">
      <a class="pill pill-white" href="mailto:{P['email']}">Email me</a>
      <a class="pill pill-line" href="{P['linkedin']}" rel="me noopener">LinkedIn</a>
      <a class="pill pill-line" href="{CV}">Download CV</a>
    </div>
    <p class="contact-mail rv"><a href="mailto:{P['email']}">{P['email']}</a> <button class="copy" type="button" data-copy="{P['email']}" hidden>Copy</button></p>
  </div>
  {waves('waves-foot')}
</section>"""


def page_hero(eyebrow, title, lede="", extra="", crumb=""):
    crumb_html = f'<p class="crumb"><a href="{crumb[1]}">{e(crumb[0])}</a></p>' if crumb else ""
    lede_html = f'<p class="lede">{e(lede)}</p>' if lede else ""
    return f"""<section class="phero">
  <div class="wrap phero-in">
    {crumb_html}
    <p class="eyebrow">{e(eyebrow)}</p>
    <h1>{e(title)}</h1>
    {lede_html}
    {extra}
  </div>
  {waves('waves-sail')}
</section>"""


# ---------- Home sections ----------
def bento():
    cards = []
    for b in P["bento"]:
        count = f' data-count="{b["count"]}" data-pre="{e(b.get("pre", ""))}" data-suf="{e(b.get("suf", ""))}"' if b.get("count") else ""
        fig_cls = "fig fig-words" if b.get("words") else "fig"
        cards.append(
            f'<a class="tile tile-{b.get("size", "s")} {"tile-navy" if b.get("navy") else ""}" href="@@/{b["href"]}"><span class="{fig_cls}"{count}>{e(b["fig"])}</span><span class="tile-label">{e(b["label"])}</span></a>'
        )
    return f'<div class="bento">{"".join(cards)}</div>'


def stack():
    cards = []
    flag = [p for p in ALL if p["tier"] == "flagship"]
    for i, p in enumerate(flag):
        tone = ["t-navy", "t-deep", "t-white"][i % 3]
        cards.append(f"""<article class="scard {tone}" style="--i:{i}" data-scard>
  <div class="scard-in">
    <div>
      <p class="scard-where">{e(p['where'])} · {e(p['my_role'])}</p>
      <h3>{e(p['title'])}</h3>
      <p class="scard-sum">{e(p['summary'])}</p>
    </div>
    <div class="scard-end">
      <p class="scard-key">{e(p['key'])}</p>
      <a class="pill {'pill-navy' if tone == 't-white' else 'pill-white'}" href="@@/projects/{p['slug']}/" aria-label="Read the case study: {e(p['title'])}">Read the case study</a>
    </div>
  </div>
</article>""")
    return f'<div class="stack" data-stack>{"".join(cards)}</div>'


def story():
    hubname = {h["id"]: h["name"] for h in MAP["hubs"]}
    pills = "".join(
        f'<button type="button" class="spill" data-story-btn="{i}" aria-pressed="{"true" if i == 0 else "false"}">{e(t["label"])}</button>'
        for i, t in enumerate(MAP["traces"])
    )
    panels = []
    for t in MAP["traces"]:
        if len(t["path"]) != len(t["steps"]):
            errors.append(f"trace {t['id']} path/steps mismatch")
        steps = "".join(
            f'<li><span class="story-at">{e(hubname[p])}</span><p>{e(s)}</p></li>' for p, s in zip(t["path"], t["steps"])
        )
        wps = "".join(f'<li><span class="dot"></span><span class="lbl">{e(hubname[p])}</span></li>' for p in t["path"])
        panels.append(f"""<article class="story-panel" data-story-panel id="story-{t['id']}">
  <h3 class="story-problem">{e(t['problem'])}</h3>
  <ol class="story-steps">{steps}</ol>
  <div class="course" aria-hidden="true"><div class="course-track"><span class="course-fill"></span></div><ol class="course-wps">{wps}</ol></div>
  <p class="story-more"><a class="more" href="{case_href(t['case'])}">Read the full case study</a></p>
</article>""")
    return f"""<section class="story" data-story aria-labelledby="story-title">
  <div class="story-stage">
    <div class="wrap story-top">
      <div>
        <p class="eyebrow">Follow one problem</p>
        <h2 id="story-title">From first symptom to lasting fix.</h2>
      </div>
      <div class="story-pills" role="group" aria-label="Choose a real problem" data-story-pills hidden>{pills}</div>
    </div>
    <div class="wrap story-panels">{''.join(panels)}</div>
  </div>
</section>"""


def areas():
    short = {"ai": "AI", "people": "People", "enterprise": "Enterprise", "industrial": "Industrial", "security": "Security", "outcomes": "Outcomes"}
    hubs = MAP["hubs"]
    pos = {h["id"]: h for h in hubs}
    tabs = "".join(
        f'<button type="button" role="tab" id="tab-{h["id"]}" aria-controls="area-{h["id"]}" aria-selected="{"true" if i == 0 else "false"}" tabindex="{0 if i == 0 else -1}" data-area="{h["id"]}">{short[h["id"]]}</button>'
        for i, h in enumerate(hubs)
    )
    panels = []
    for h in hubs:
        does = "".join(f"<li>{e(x)}</li>" for x in h["does"])
        proof = "".join(f'<a class="chip-link" href="{case_href(s)}">{e(case_title(s))}</a>' for s in h["proof"])
        conns = []
        for a, b, label in MAP["links"]:
            if h["id"] in (a, b):
                other = pos[b if a == h["id"] else a]
                conns.append(f'<li><a href="#area-{other["id"]}" data-area-link="{other["id"]}"><strong>{e(other["name"])}</strong><span>{e(label)}</span></a></li>')
        panels.append(f"""<div class="area" id="area-{h['id']}" role="tabpanel" aria-labelledby="tab-{h['id']}" tabindex="0" data-area-panel="{h['id']}">
  <p class="area-name">{e(h['name'])}</p>
  <h3>{e(h['line'])}</h3>
  <div class="area-cols">
    <div><h4>What I do</h4><ul class="ticks">{does}</ul></div>
    <div><h4>A decision I stand by</h4><p>{e(h['decision'])}</p></div>
    <div><h4>How it connects</h4><ul class="conns">{''.join(conns)}</ul></div>
  </div>
  <div class="area-proof"><h4>See it in practice</h4><div>{proof}<a class="more" href="@@/{h['extra']['href']}">{e(h['extra']['label'])}</a></div></div>
</div>""")
    return f"""<section class="sec sec-white" aria-labelledby="areas-title">
  <div class="wrap">
    <div class="sec-head center">
      <p class="eyebrow rv">Where the work connects</p>
      <h2 id="areas-title" class="rv">Real problems rarely stay in one department.</h2>
      <p class="lede rv">People, AI, enterprise technology, industrial operations and security, all connected to a business outcome. This view is conceptual and doesn't show any employer's actual systems.</p>
    </div>
    <div class="seg-wrap" data-seg-wrap hidden><div class="seg" role="tablist" aria-label="Areas of my work"><span class="seg-thumb" aria-hidden="true"></span>{tabs}</div></div>
    <div class="areas" data-areas>{''.join(panels)}</div>
  </div>
</section>"""


def route(compact=False):
    items = []
    for emp in reversed(CAREER["employers"]):
        for r in reversed(emp["roles"]):
            items.append(f"""<li class="wp"><a href="@@/career/#{r['id']}">
  <span class="wp-dates">{e(r['dates'])}</span>
  <span class="wp-title">{e(r['title'])}</span>
  <span class="wp-emp">{e(emp['name'])}</span>
  {'' if compact else f'<span class="wp-sum">{e(r["summary"])}</span>'}
</a></li>""")
    return f'<div class="route" data-route><span class="route-line" aria-hidden="true"><span class="route-fill"></span></span><ol>{"".join(items)}</ol></div>'


def project_card(p):
    return f"""<a class="pcard" href="@@/projects/{p['slug']}/">
  <p class="pcard-key">{e(p['key'])}</p>
  <h3>{e(p['title'])}</h3>
  <p>{e(p['summary'])}</p>
  <p class="pcard-meta">{e(p['where'])} · {e(p['my_role'])}</p>
</a>"""


def personal_card(p, meta=None):
    return f"""<a class="pcard" href="@@/projects/{p['slug']}/">
  <p class="pcard-key">{e(p['stage'])}</p>
  <h3>{e(p['title'])}</h3>
  <p>{e(p['summary'])}</p>
  <p class="pcard-meta">{e(meta or p['category'])}</p>
</a>"""


def home():
    words = "".join(f'<span class="w">{e(x)}</span> ' for x in P["philosophy"].split())
    stat = lambda n, l: f'<div><strong>{e(n)}</strong><span>{e(l)}</span></div>'
    ai_rows = "".join(
        f'<li class="ai-row"><p class="ai-status">{e(l["status"])}</p><h3>{e(l["name"])}</h3><p>{e(l["text"])}</p><a class="more" href="{"@@/ai/#personal-ai" if l["href"] == "#projects" else "@@/" + l["href"]}">{e(l["link"])}</a></li>'
        for l in AI["layers"]
    )
    body = f"""<section class="hero" data-hero>
  <div class="hero-stage">
    {waves('waves-back')}
    <div class="hero-copy">
      <p class="hero-kicker">{e(P['current_title'])} · {e(P['location'])}</p>
      <h1>Ali Alzahrani</h1>
      <p class="hero-sub">{e(P['headline'])}</p>
      <div class="cta">
        <a class="pill pill-white" href="#record">See the record</a>
        <a class="pill pill-line" href="{CV}">Download CV</a>
      </div>
    </div>
    <div class="hero-stats hero-stats-l">{stat('12', 'years in IT')}{stat('4', 'international sites')}</div>
    <div class="hero-stats hero-stats-r">{stat('~300', 'employees trained on AI')}{stat('9', 'remote sites delivered')}</div>
    <div class="hero-value"><p>{e(P['value'])}</p></div>
    {waves('waves-front')}
  </div>
</section>

<section class="phil" data-phil aria-label="My philosophy">
  <div class="phil-stage"><div class="wrap">
    <p class="eyebrow">My philosophy</p>
    <p class="phil-text">{words}</p>
  </div></div>
</section>

<section class="sec sec-sail" id="record" aria-labelledby="record-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow rv">The record</p>
      <h2 id="record-title" class="rv">Twelve years of delivery, in plain numbers.</h2>
    </div>
    {bento()}
  </div>
</section>

<section class="sec sec-navy" aria-labelledby="ai-title">
  <div class="wrap ai-grid">
    <div class="ai-side">
      <p class="eyebrow rv">AI expertise</p>
      <h2 id="ai-title" class="rv">AI that does real work.</h2>
      <p class="lede rv">{e(AI['intro'])}</p>
      <a class="pill pill-white rv" href="@@/ai/">See all my AI work</a>
    </div>
    <ol class="ai-rows" data-ai-rows>{ai_rows}</ol>
  </div>
</section>

<section class="sec sec-sail" aria-labelledby="work-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow rv">Selected work</p>
      <h2 id="work-title" class="rv">The work that proves it.</h2>
    </div>
    {stack()}
    <p class="sec-more"><a class="pill pill-navy" href="@@/projects/">All projects and contributions</a></p>
  </div>
</section>

{story()}

{areas()}

<section class="sec sec-navy" aria-labelledby="career-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow rv">Career</p>
      <h2 id="career-title" class="rv">The course so far.</h2>
    </div>
    {route()}
    <p class="sec-more"><a class="pill pill-white" href="@@/career/">Complete career history</a></p>
  </div>
</section>

<section class="sec sec-sail" aria-labelledby="cred-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow rv">Qualifications</p>
      <h2 id="cred-title" class="rv">Stated exactly as they are.</h2>
    </div>
    <div class="bento bento-4">
      <div class="tile"><span class="tile-kicker">Degree</span><span class="tile-h">BSc Information Technology &amp; Computing</span><span class="tile-label">Arab Open University. GPA 3.24 / 4.00.</span></div>
      <div class="tile"><span class="tile-kicker">Certified, 2026</span><span class="tile-h">Five ISO standards, practitioner level</span><span class="tile-label">TRECCERT Digital Trust Fellowship, 91.7%. ISO 27001, 27701, 22301, 31000 and 42001.</span></div>
      <div class="tile"><span class="tile-kicker">In progress</span><span class="tile-h">PMP and MIT</span><span class="tile-label">PMP exam booked. Enrolled in MIT's Applied Generative AI for Digital Transformation.</span></div>
      <div class="tile"><span class="tile-kicker">Recognition</span><span class="tile-h">Two Vallourec awards</span><span class="tile-label">Excellence Leader Award, 2020. Group Creativity Award, 2019.</span></div>
    </div>
    <p class="sec-more"><a class="pill pill-navy" href="@@/credentials/">All qualifications and training</a></p>
  </div>
</section>

{contact_band()}"""
    person = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": P["name"],
        "url": SITE,
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


def traits_list():
    return "".join(
        f'<li class="rv"><h3>{e(t["name"])}</h3><div><p>{e(t["text"])}</p><a class="more" href="@@/{t["href"]}">{e(t["link"])}</a></div></li>' for t in P["traits"]
    )


def profile():
    journey = "".join(f'<p class="rv">{e(x)}</p>' for x in P["journey"])
    contrib = "".join(f'<li class="rv"><h3>{e(c["title"])}</h3><p>{e(c["text"])}</p></li>' for c in P["contribution"])
    how = "".join(f'<li class="rv">{e(x)}</li>' for x in P["how_i_work"])
    langs = "".join(f'<li><strong>{e(l["name"])}</strong><span>{e(l["level"])}</span></li>' for l in P["languages"])
    body = f"""{page_hero('Professional profile', P['own_words'], 'That is how I describe my own approach, and it is a high bar to set in public. The rest of this site is the evidence.')}
<section class="sec sec-sail"><div class="wrap split">
  <h2 class="side">My journey</h2>
  <div class="prose">{journey}</div>
</div></section>
<section class="sec sec-navy"><div class="wrap">
  <div class="sec-head"><p class="eyebrow rv">Contribution</p><h2 class="rv">What I bring to an organisation.</h2></div>
  <ul class="contrib">{contrib}</ul>
</div></section>
<section class="sec sec-white"><div class="wrap split">
  <h2 class="side">How I work</h2>
  <ul class="plain-list">{how}</ul>
</div></section>
<section class="sec sec-sail"><div class="wrap">
  <div class="sec-head"><p class="eyebrow rv">Strengths, with evidence</p><h2 class="rv">What people can count on.</h2></div>
  <ol class="traits">{traits_list()}</ol>
</div></section>
<section class="sec sec-white sec-tight"><div class="wrap split">
  <h2 class="side">Languages</h2>
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
                items = "".join(f'<li><span class="tag tag-{k}">{e(CAREER["legend"][k])}</span><span>{e(t)}</span></li>' for k, t in g["items"])
                groups += f'<h3 class="minor">{e(g["name"])}</h3><ul class="duties">{items}</ul>'
            cases = "".join(f'<a class="chip-link" href="{case_href(c)}">{e(case_title(c))}</a>' for c in r["cases"])
            roles.append(f"""<details class="role" id="{r['id']}" open>
  <summary><span class="role-title">{e(r['title'])}</span><span class="role-dates">{e(r['dates'])}</span></summary>
  <div class="role-body">
    <p class="role-sum">{e(r['summary'])}</p>
    {groups}
    <h3 class="minor">Related case studies</h3><div class="chips-row">{cases}</div>
  </div>
</details>""")
        legal = f" ({e(emp['legal'])})" if emp.get("legal") else ""
        out.append(f"""<section class="employer">
  <header><h2>{e(emp['name'])}{legal}</h2><p>{e(emp['context'])} · {e(emp['dates'])}</p></header>
  {''.join(roles)}
</section>""")
    body = f"""{page_hero('Career history', 'Twelve years, five roles, two very different industries.', 'Start with the overview, then open any role for its full detail. Each line says whether I led, built, coordinated or supported the work.')}
<section class="sec sec-sail"><div class="wrap career">
  <div class="career-over">{route(compact=True).replace('class="route"', 'class="route route-light"')}</div>
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
    legend = "".join(f"<li>{e(v)}</li>" for v in levels.values())
    body = f"""{page_hero('Skills and capabilities', 'The complete directory.', f'All {total} skills and technologies, with where I applied them. I describe how I used each one rather than giving it a percentage score.')}
<section class="sec sec-sail sec-skills"><div class="wrap">
  <div class="skill-tools">
    <label for="skill-search">Find a skill or technology</label>
    <input id="skill-search" type="search" placeholder="Try Copilot, Intune, Cisco or procurement" autocomplete="off" disabled>
    <p class="skill-count" role="status" data-count>{total} skills</p>
    <div class="chips" data-chips hidden role="group" aria-label="Filter by category">{''.join(chips)}</div>
  </div>
  <p class="no-results" data-empty hidden>No skills match that search. <button type="button" class="link-btn" data-clear>Clear search</button></p>
  {''.join(cats)}
  <ul class="levels" aria-label="How proficiency is described"><li class="levels-t">How I describe my use:</li>{legend}</ul>
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
    personal = "".join(personal_card(p) for p in PROJ["personal"])
    body = f"""{page_hero('Projects and achievements', 'How problems were actually solved.', 'The strongest work comes first, with every other documented contribution below it. ' + PROJ['note'])}
<section class="sec sec-sail"><div class="wrap">
  <h2 class="group">Flagship work</h2><div class="pgrid">{flagship}</div>
  <h2 class="group">More case studies</h2><div class="pgrid">{cases}</div>
  <h2 class="group">Other contributions</h2><ul class="library">{lib}</ul>
</div></section>
<section class="sec sec-navy" id="personal"><div class="wrap">
  <div class="sec-head"><p class="eyebrow rv">Personal innovation</p><h2 class="rv">What I build on my own time.</h2>
  <p class="lede rv">Each project shows its actual stage. These are separate from my employment, and I direct and test them with AI-assisted development.</p></div>
  <div class="pgrid pgrid-dark">{personal}</div>
</div></section>
{contact_band()}"""
    page("projects/", "Projects and achievements", "Case studies and documented contributions from Ali Alzahrani's career, plus personal AI projects with their actual status.", body, current="projects/")
    for p in ALL:
        if p["tier"] != "library":
            case_page(p)
    for p in PROJ["personal"]:
        personal_page(p)


def facts(items):
    return '<dl class="facts">' + "".join(f"<div><dt>{e(k)}</dt><dd>{v}</dd></div>" for k, v in items) + "</dl>"


def case_page(p):
    role, _ = ROLES[p["role_id"]]
    dec = "".join(f"<li>{e(x)}</li>" for x in p["decisions"])
    known = {s[0] for c in SK["categories"] for s in c["skills"]}
    for s in p["skills"]:
        if s not in known:
            errors.append(f"case {p['slug']} skill not in directory: {s}")
    sk = "".join(f'<a class="chip-link" href="@@/skills/?q={e(s)}">{e(s)}</a>' for s in p["skills"])
    idx = [x for x in ALL if x["tier"] != "library"]
    nxt = idx[(idx.index(p) + 1) % len(idx)]
    fx = facts([("My role", e(p["my_role"])), ("Status", e(p["status"])), ("Position", f'<a href="@@/career/#{p["role_id"]}">{e(role["title"])}</a>')])
    parts = [
        ("The challenge", f"<p>{e(p['challenge'])}</p>"),
        ("My responsibility", f"<p>{e(p['responsibility'])}</p>"),
        ("My reasoning and decisions", f'<ul class="ticks">{dec}</ul>'),
        ("The solution", f"<p>{e(p['solution'])}</p>"),
        ("The result", f'<p class="result">{e(p["result"])}</p>'),
        ("Skills demonstrated", f'<div class="chips-row">{sk}</div>'),
    ]
    blocks = "".join(f'<div class="cpart rv"><h2><span class="cn">{i}</span>{t}</h2>{b}</div>' for i, (t, b) in enumerate(parts, 1))
    body = f"""{page_hero(p['where'], p['title'], p['summary'], fx, crumb=('Projects', '@@/projects/'))}
<section class="sec sec-sail"><div class="wrap narrow">
  <div class="case" data-case><span class="case-line" aria-hidden="true"><span class="case-fill"></span></span>{blocks}</div>
  <p class="next">Next <a class="pill pill-navy" href="@@/projects/{nxt['slug']}/">{e(nxt['title'])}</a></p>
</div></section>
{contact_band()}"""
    page(f"projects/{p['slug']}/", p["title"], p["summary"], body, current="projects/", og_type="article")


def personal_page(p):
    dec = "".join(f"<li>{e(x)}</li>" for x in p["decisions"])
    con = "".join(f"<li>{e(x)}</li>" for x in p["contributions"])
    tech = "".join(f'<span class="chip-plain">{e(x)}</span>' for x in p["technologies"])
    tech_block = f'<div class="cpart rv"><h2>Implementation environment</h2><div class="chips-row">{tech}</div></div>' if tech else ""
    fx = facts([("Actual status", e(p["status"])), ("My role", e(p["role"]))])
    body = f"""{page_hero(p['category'], p['title'], p['summary'], fx, crumb=('Personal innovation', '@@/projects/#personal'))}
<section class="sec sec-sail"><div class="wrap narrow">
  <div class="cpart rv"><h2>Decisions I made</h2><ul class="ticks">{dec}</ul></div>
  <div class="cpart rv"><h2>What it covers</h2><ul class="ticks">{con}</ul></div>
  {tech_block}
  <p class="note rv">{e(p['note'])}</p>
</div></section>
{contact_band()}"""
    page(f"projects/{p['slug']}/", p["title"], p["summary"], body, current="projects/", og_type="article")


def ai_page():
    def fix(h):
        return "#personal-ai" if h == "#projects" else "@@/" + h
    layers = "".join(
        f'<li class="rv"><div><p class="ai-status">{e(l["status"])}</p><h3>{e(l["name"])}</h3></div><div><p>{e(l["text"])}</p><a class="more" href="{fix(l["href"])}">{e(l["link"])}</a></div></li>'
        for l in AI["layers"]
    )
    caps = "".join(f'<li class="rv"><h3>{e(c["name"])}</h3><p class="ai-status">{e(c["level"])}</p><p>{e(c["text"])}</p></li>' for c in AI["capabilities"])
    personal = "".join(personal_card(p, p["status"]) for p in PROJ["personal"] if p["slug"] != "hospital-database")
    learn = "".join(f'<li class="rv">{e(x)}</li>' for x in AI["learning"])
    body = f"""{page_hero('AI expertise and innovation', 'AI that does real work.', AI['intro'])}
<section class="sec sec-sail"><div class="wrap">
  <div class="sec-head"><p class="eyebrow rv">Where I apply it</p><h2 class="rv">From a training room to a working product.</h2></div>
  <ol class="ai-list">{layers}</ol>
</div></section>
<section class="sec sec-navy"><div class="wrap">
  <div class="sec-head"><p class="eyebrow rv">Capabilities</p><h2 class="rv">The full range, with an honest level for each.</h2></div>
  <ul class="contrib caps">{caps}</ul>
</div></section>
<section class="sec sec-sail" id="personal-ai"><div class="wrap">
  <div class="sec-head"><p class="eyebrow rv">Innovation</p><h2 class="rv">Personal AI projects, with their actual status.</h2></div>
  <div class="pgrid">{personal}</div>
</div></section>
<section class="sec sec-white sec-tight"><div class="wrap split">
  <h2 class="side">How I keep learning</h2><ul class="plain-list">{learn}</ul>
</div></section>
{contact_band()}"""
    return page("ai/", "AI expertise and innovation", "Ali Alzahrani's practical AI work: adoption, training, use-case delivery, automation, governance, agents and personal AI projects.", body, current="ai/")


def credentials():
    edu = "".join(cred_item(c) for c in CRED["education"])
    qual = "".join(cred_item(c) for c in CRED["qualifications"])
    groups = "".join(f'<h3 class="cred-group">{e(g["name"])}</h3><ul class="creds">{"".join(cred_item(c, 4) for c in g["items"])}</ul>' for g in CRED["groups"])
    awards = "".join(f'<li class="rv"><h3>{e(a["title"])}</h3><p>{e(a["org"])}. {e(a["detail"])}</p></li>' for a in CRED["awards"])
    aff = "".join(f'<li class="rv">{e(a)}</li>' for a in CRED["affiliations"])
    body = f"""{page_hero('Education and professional development', 'Qualifications, stated exactly.', 'Formal education, professional credentials and training are kept apart here, and each one shows its actual status.')}
<section class="sec sec-sail"><div class="wrap split">
  <h2 class="side">Formal education</h2><ul class="creds">{edu}</ul>
</div></section>
<section class="sec sec-white"><div class="wrap split">
  <h2 class="side">Professional credentials</h2>
  <div><ul class="creds">{qual}</ul><p class="note">{e(CRED['standards_note'])}</p></div>
</div></section>
<section class="sec sec-sail"><div class="wrap split">
  <h2 class="side">Courses and training</h2><div>{groups}</div>
</div></section>
<section class="sec sec-navy"><div class="wrap split">
  <h2 class="side">Awards and scholarships</h2><ul class="awards">{awards}</ul>
</div></section>
<section class="sec sec-white sec-tight"><div class="wrap split">
  <h2 class="side">Affiliations</h2><ul class="plain-list">{aff}</ul>
</div></section>
{contact_band()}"""
    return page("credentials/", "Education and credentials", "Verified education, professional credentials, courses, awards and affiliations of Ali Alzahrani.", body, current="credentials/")


def not_found():
    extra = '<div class="cta"><a class="pill pill-white" href="./">Go to the home page</a><a class="pill pill-line" href="career/">Career history</a><a class="pill pill-line" href="projects/">Projects</a></div>'
    body = page_hero("Page not found", "This page doesn't exist. Here's the way back.", "", extra)
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
    # Preserve the original portraits locally, but omit them from the public site.
    shutil.copytree(ROOT / "src" / "assets", OUT / "assets", ignore=shutil.ignore_patterns(
        "ali-640.webp", "ali-1122.webp", "ali-navy-800.jpg", "social-preview.jpg"
    ))
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
