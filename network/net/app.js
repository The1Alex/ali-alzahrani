// The experience layer: chapters, labels tethered to 3D nodes, cards, traces, skills search and routing.
import { DATA } from './data.js';

const doc = document;
const root = doc.documentElement;
root.classList.add('js');

const $ = (s, el = doc) => el.querySelector(s);
const $$ = (s, el = doc) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const wrapPi = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pad = n => String(n).padStart(2, '0');
const fmt = n => Math.round(n).toLocaleString('en-US');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none), (pointer: coarse)').matches;
let mobile = innerWidth < 860;
if (touch) root.classList.add('touch');

/* ───────────────────────── data ───────────────────────── */

const P = DATA.profile, MAP = DATA.map, CR = DATA.credentials, AI = DATA.ai, SK = DATA.skills;
const PROJ = DATA.projects.projects, PERS = DATA.projects.personal;
const hubs = Object.fromEntries(MAP.hubs.map(h => [h.id, h]));
const projBy = new Map(PROJ.map(p => [p.slug, p]));
const persBy = new Map(PERS.map(p => [p.slug, p]));
const roles = DATA.career.employers.flatMap(e => e.roles.map(r => ({ ...r, employer: e.name, employerContext: e.context })));
const roleBy = new Map(roles.map(r => [r.id, r]));
const skills = SK.categories.flatMap(c => c.skills.map(s => ({
  name: s[0], level: s[1], cat: c.id, catName: c.name,
  proofs: String(s[2] || '').split(',').map(x => x.trim()).filter(Boolean),
})));
skills.forEach((s, i) => (s.idx = i));
const hubOrder = ['ai', 'people', 'security', 'enterprise', 'industrial', 'outcomes'].filter(id => hubs[id]);
const SHORT = { ai: 'AI', people: 'People', security: 'Security', enterprise: 'Enterprise', industrial: 'Industrial', outcomes: 'Outcomes' };
const TIER = { flagship: 'Flagship', case: 'Case study', library: 'Delivered' };
const KIND = DATA.career.legend || {};
const TRAINING = CR.groups.reduce((a, g) => a + g.items.length, 0);

const CH = [
  { key: 'hero', nav: 'Intro' },
  { key: 'career', nav: 'Career' },
  ...hubOrder.map(id => ({ key: id, nav: SHORT[id] || hubs[id].name, hub: id })),
  { key: 'traces', nav: 'Traces' },
  { key: 'skills', nav: 'Skills' },
  { key: 'credentials', nav: 'Credentials' },
  { key: 'contact', nav: 'Contact' },
];
const chIndex = key => CH.findIndex(c => c.key === key);

const yearsLabel = d => {
  const ys = String(d).match(/\d{4}/g) || [];
  const now = /present/i.test(d);
  return ys.length ? `${ys[0]} — ${now ? 'Now' : ys[1] || ys[0]}` : d;
};
const nodeTitle = id => {
  const [t, k] = id.split(':');
  if (t === 'proj') return projBy.get(k)?.title;
  if (t === 'pers') return persBy.get(k)?.title;
  if (t === 'role') return roleBy.get(k)?.title;
  if (t === 'hub') return hubs[k]?.name;
  if (t === 'core') return P.name;
  return '';
};
const proofNodeId = slug => (projBy.has(slug) ? 'proj:' + slug : persBy.has(slug) ? 'pers:' + slug : null);
const orderedProjects = id => {
  const h = hubs[id];
  const rank = p => (h.proof.includes(p.slug) ? -10 + h.proof.indexOf(p.slug) : { flagship: 0, case: 1, library: 2 }[p.tier]);
  return PROJ.filter(p => p.pillars.includes(id)).sort((a, b) => rank(a) - rank(b));
};
const chapterOfNode = id => {
  const [t, k] = id.split(':');
  if (t === 'proj') return hubOrder.find(h => hubs[h].proof.includes(k)) || projBy.get(k)?.pillars.find(x => hubs[x]) || 'outcomes';
  if (t === 'pers') return 'ai';
  if (t === 'role' || t === 'core') return 'career';
  if (t === 'hub') return k;
  if (t === 'skill' || t === 'cat') return 'skills';
  if (t === 'evt') return 'credentials';
  return null;
};
const hrefToAttrs = href => {
  const m = String(href).match(/projects\/(?:#)?([a-z0-9-]+)/);
  if (m && proofNodeId(m[1])) return `data-open="${proofNodeId(m[1])}" data-node="${proofNodeId(m[1])}"`;
  const r = String(href).match(/career\/#([a-z0-9-]+)/);
  if (r && roleBy.has(r[1])) return `data-open="role:${r[1]}" data-node="role:${r[1]}"`;
  if (/^career/.test(href)) return 'data-go="career"';
  if (/^ai/.test(href)) return 'data-go="ai"';
  return '';
};
const emTitle = line => {
  const s = String(line).trim();
  const i = s.indexOf(',');
  if (i > 0) return `${esc(s.slice(0, i + 1))} <em>${esc(s.slice(i + 1).trim())}</em>`;
  const w = s.split(' ');
  const k = Math.max(1, w.length - 3);
  return `${esc(w.slice(0, k).join(' '))} <em>${esc(w.slice(k).join(' '))}</em>`;
};
const stageClass = s => ({ live: 'live', 'test release': 'test', prototype: 'proto', concept: 'concept', academic: 'academic' }[String(s).toLowerCase()] || 'concept');

/* ───────────────────────── panels ───────────────────────── */

const kicker = (i, text) => `<p class="kicker"><span class="k-num">${pad(i)}</span><span class="k-rule"></span><span>${esc(text)}</span></p>`;
const projRow = p => `<li><button class="row" data-open="proj:${p.slug}" data-node="proj:${p.slug}"><span class="row-k">${esc(TIER[p.tier])}</span><span class="row-t">${esc(p.title)}</span><span class="row-m">${esc(p.key)}</span><i class="row-go" aria-hidden="true"></i></button></li>`;

function heroPanel() {
  const words = P.name.split(' ').map(w => `<span class="w"><span>${esc(w)}</span></span>`).join(' ');
  const stats = [
    { n: 12, label: 'years in IT, seven in leadership', go: 'career' },
    { n: 4, label: 'international sites led', go: 'people' },
    { n: 300, pre: '~', label: 'employees trained on Copilot', go: 'ai' },
    { n: 1000, suf: '+', label: 'devices brought under control', go: 'security' },
  ];
  return `
    <p class="kicker hero-k"><span class="pulse" aria-hidden="true"></span>${esc(P.current_title)}<span class="dot">·</span>${esc(P.location)}</p>
    <h1 class="display" aria-label="${esc(P.name)}">${words}</h1>
    <p class="hero-lead">${esc(P.headline)}.</p>
    <div class="stats">${stats.map(s => `<button class="stat" data-go="${s.go}"><b data-count="${s.n}" data-pre="${s.pre || ''}" data-suf="${s.suf || ''}">${s.pre || ''}0${s.suf || ''}</b><span>${esc(s.label)}</span></button>`).join('')}</div>
    <div class="cta"><button class="btn btn-brass" data-go="career">Enter the network <i aria-hidden="true">↓</i></button><a class="btn btn-line" href="Ali-Alzahrani-CV.pdf" download>Download CV</a></div>
    <p class="hint"><span>Scroll to travel</span><span>Drag to orbit</span><span>Click any node</span></p>`;
}

function careerPanel(i) {
  const list = [...roles].sort((a, b) => b.start - a.start);
  return `${kicker(i, 'Career')}
    <h2 class="title">Twelve years. Five roles. <em>One direction.</em></h2>
    <p class="lead">${esc(P.value)}</p>
    <ol class="rows">${list.map(r => `<li><button class="row" data-open="role:${r.id}" data-node="role:${r.id}" data-role="${r.id}"><span class="row-k">${esc(yearsLabel(r.dates))}</span><span class="row-t">${esc(r.title)}</span><span class="row-m">${esc(r.employer)}</span><i class="row-go" aria-hidden="true"></i></button></li>`).join('')}</ol>
    <blockquote class="quote"><p>“${esc(P.own_words)}”</p></blockquote>`;
}

function hubPanel(i, id) {
  const h = hubs[id];
  const list = orderedProjects(id);
  const proof = list.filter(p => h.proof.includes(p.slug));
  const more = list.filter(p => !h.proof.includes(p.slug));
  let extra = '';
  if (id === 'ai') {
    extra = `<p class="sub-h">Personal builds <span>${PERS.length}</span></p><div class="chips">${PERS.map(p => `<button class="chip chip-p" data-open="pers:${p.slug}" data-node="pers:${p.slug}"><i class="st st-${stageClass(p.stage)}"></i>${esc(p.title.split(':')[0])}<small>${esc(p.stage)}</small></button>`).join('')}</div>`;
  }
  if (id === 'people') {
    extra = `<p class="sub-h">How I work</p><div class="chips">${P.traits.map((t, k) => `<button class="chip" data-open="trait:${k}" ${hrefToAttrs(t.href).replace(/data-open="[^"]*"/, '')}>${esc(t.name)}</button>`).join('')}</div>`;
  }
  if (id === 'outcomes') {
    extra = `<p class="sub-h">In numbers</p><div class="bento">${P.bento.map(b => `<button class="metric" ${hrefToAttrs(b.href)}><b>${esc(b.fig)}</b><span>${esc(b.label)}</span></button>`).join('')}</div>`;
  }
  return `${kicker(i, h.name)}
    <h2 class="title">${emTitle(h.line)}</h2>
    ${id === 'ai' ? `<p class="lead">${esc(AI.intro)}</p>` : ''}
    <ul class="does">${h.does.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
    <div class="decision"><span>A decision I make</span><p>${esc(h.decision)}</p></div>
    ${id === 'outcomes' ? '' : `<p class="sub-h">Proof <span>${proof.length}</span></p><ul class="rows">${proof.map(projRow).join('')}</ul>`}
    ${more.length && id !== 'outcomes' ? `<p class="sub-h">Also connected <span>${more.length}</span></p><div class="chips">${more.map(p => `<button class="chip" data-open="proj:${p.slug}" data-node="proj:${p.slug}">${esc(p.title)}</button>`).join('')}</div>` : ''}
    ${extra}`;
}

function tracesPanel(i) {
  return `${kicker(i, 'Problem traces')}
    <h2 class="title">Follow a problem <em>through the network.</em></h2>
    <p class="lead">Four real problems. Watch each one travel through the capabilities it needed, from the first signal to a business outcome.</p>
    <div class="trace-tabs" role="tablist">${MAP.traces.map((t, k) => `<button class="trace-tab" role="tab" data-trace="${t.id}"><span>${pad(k + 1)}</span>${esc(t.label)}</button>`).join('')}</div>
    <div class="trace-body" id="trace-body" aria-live="polite"></div>`;
}

function skillsPanel(i) {
  const counts = {};
  skills.forEach(s => (counts[s.level] = (counts[s.level] || 0) + 1));
  return `${kicker(i, 'Skills')}
    <h2 class="title">${skills.length} skills, <em>each one a star.</em></h2>
    <p class="lead">Every point in the outer shell is a real skill, grouped into ${SK.categories.length} families. Hover a star to see how I used it and the work that proves it.</p>
    <label class="search"><span class="sr">Find a skill</span><input id="skill-q" type="search" placeholder="Find a skill: Intune, negotiation, Zabbix…" autocomplete="off" spellcheck="false"></label>
    <div id="skill-results" class="results"></div>
    <div class="legend">${Object.entries(SK.levels).map(([k, v]) => `<span class="lg lg-${k}"><i></i>${esc(v)}<b>${counts[k] || 0}</b></span>`).join('')}</div>
    <div class="chips cats">${SK.categories.map(c => `<button class="chip" data-cat="${c.id}">${esc(c.name)}<small>${c.skills.length}</small></button>`).join('')}</div>`;
}

function credPanel(i) {
  const row = x => `<li class="cred"><span class="badge b-${esc(x.kind || 'done')}">${esc(x.status)}</span><b>${esc(x.title)}</b><span>${esc(x.org)}</span>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</li>`;
  return `${kicker(i, 'Credentials')}
    <h2 class="title">Learning that <em>never stopped.</em></h2>
    <p class="sub-h">Qualifications</p><ul class="creds">${CR.qualifications.map(row).join('')}</ul>
    <p class="sub-h">Education</p><ul class="creds">${CR.education.map(row).join('')}</ul>
    <p class="sub-h">Awards</p><div class="chips">${CR.awards.map(a => `<span class="chip chip-static">${esc(a.title)}<small>${esc(a.org)}, ${esc(String(a.detail).replace(/\.$/, ''))}</small></span>`).join('')}</div>
    <div class="cta"><button class="btn btn-line" data-open="training">All ${TRAINING} courses and programmes</button><button class="btn btn-line" data-open="journey">The journey so far</button></div>
    <p class="fine">${esc(CR.standards_note)}</p>`;
}

function contactPanel(i) {
  return `${kicker(i, 'Contact')}
    <h2 class="title title-xl">Let’s <em>talk.</em></h2>
    <p class="lead">I’m open to conversations with recruiters, technology leaders and collaborators. Email is the best way to reach me.</p>
    <div class="links">
      <div class="big"><a href="mailto:${esc(P.email)}"><span>Email</span>${esc(P.email)}</a><button class="copy" data-copy="${esc(P.email)}">Copy</button></div>
      <div class="big"><a href="${esc(P.linkedin)}" target="_blank" rel="noopener"><span>LinkedIn</span>${esc(P.linkedin_label)}</a></div>
      <div class="big"><a href="Ali-Alzahrani-CV.pdf" download><span>CV</span>Download the PDF</a></div>
    </div>
    <dl class="facts">
      <div><dt>Based in</dt><dd>${esc(P.location)}</dd></div>
      <div><dt>Languages</dt><dd>${P.languages.map(l => `${esc(l.name)} <small>${esc(l.level)}</small>`).join('<br>')}</dd></div>
      <div><dt>References</dt><dd>${esc(DATA.career.references)}</dd></div>
    </dl>
    <p class="foot">© ${new Date().getFullYear()} ${esc(P.name)}. Every node on this page is real work.</p>`;
}

function panelHTML(c, i) {
  if (c.key === 'hero') return heroPanel();
  if (c.key === 'career') return careerPanel(i);
  if (c.hub) return hubPanel(i, c.hub);
  if (c.key === 'traces') return tracesPanel(i);
  if (c.key === 'skills') return skillsPanel(i);
  if (c.key === 'credentials') return credPanel(i);
  if (c.key === 'contact') return contactPanel(i);
  return '';
}

/* ───────────────────────── cards ───────────────────────── */

const sec = (t, body) => (body ? `<section><h4>${t}</h4>${body}</section>` : '');

function projectCard(slug) {
  const p = projBy.get(slug);
  if (!p) return null;
  const role = roleBy.get(p.role_id);
  return `
    <p class="kicker">${esc(TIER[p.tier])}<span class="dot">·</span>${esc(p.where)}</p>
    <h3 class="card-title">${esc(p.title)}</h3>
    <div class="card-meta"><span class="key">${esc(p.key)}</span><span>My role: <b>${esc(p.my_role)}</b></span>${role ? `<button class="link" data-open="role:${role.id}">${esc(role.title)}, ${esc(yearsLabel(role.dates))}</button>` : ''}<span class="status">${esc(p.status)}</span></div>
    <p class="card-lead">${esc(p.summary)}</p>
    ${sec('The challenge', p.challenge && `<p>${esc(p.challenge)}</p>`)}
    ${sec('My responsibility', p.responsibility && `<p>${esc(p.responsibility)}</p>`)}
    ${sec('Decisions I made', p.decisions && `<ol class="decisions">${p.decisions.map(d => `<li>${esc(d)}</li>`).join('')}</ol>`)}
    ${sec('What I did', p.solution && `<p>${esc(p.solution)}</p>`)}
    ${sec('The result', p.result && `<p class="result">${esc(p.result)}</p>`)}
    ${sec('Skills used', p.skills && `<div class="chips">${p.skills.map(s => `<button class="chip chip-s" data-skill="${esc(s)}">${esc(s)}</button>`).join('')}</div>`)}
    ${sec('Connected hubs', `<div class="chips">${p.pillars.filter(h => hubs[h]).map(h => `<button class="chip" data-go="${h}">${esc(hubs[h].name)}</button>`).join('')}</div>`)}`;
}

function personalCard(slug) {
  const p = persBy.get(slug);
  if (!p) return null;
  return `
    <p class="kicker">${esc(p.category)}<span class="dot">·</span><i class="st st-${stageClass(p.stage)}"></i>${esc(p.stage)}</p>
    <h3 class="card-title">${esc(p.title)}</h3>
    <div class="card-meta"><span class="status">${esc(p.status)}</span></div>
    <p class="card-lead">${esc(p.summary)}</p>
    ${sec('My role', `<p>${esc(p.role)}</p>`)}
    ${sec('Decisions', p.decisions?.length && `<ol class="decisions">${p.decisions.map(d => `<li>${esc(d)}</li>`).join('')}</ol>`)}
    ${sec('What it covers', p.contributions?.length && `<div class="chips">${p.contributions.map(c => `<span class="chip chip-static">${esc(c)}</span>`).join('')}</div>`)}
    ${sec('Technologies', p.technologies?.length && `<div class="chips">${p.technologies.map(c => `<span class="chip chip-static">${esc(c)}</span>`).join('')}</div>`)}
    ${p.note ? `<p class="fine">${esc(p.note)}</p>` : ''}`;
}

function roleCard(id) {
  const r = roleBy.get(id);
  if (!r) return null;
  const cases = PROJ.filter(p => p.role_id === id);
  return `
    <p class="kicker">${esc(r.employer)}<span class="dot">·</span>${esc(r.dates)}</p>
    <h3 class="card-title">${esc(r.title)}</h3>
    <p class="card-lead">${esc(r.summary)}</p>
    ${r.groups.map(g => `<section><h4>${esc(g.name)}</h4><ul class="items">${g.items.map(([k, t]) => `<li><span class="tag tag-${esc(k)}">${esc(KIND[k] || k)}</span><span>${esc(t)}</span></li>`).join('')}</ul></section>`).join('')}
    ${cases.length ? sec('Work from this role', `<div class="chips">${cases.map(p => `<button class="chip" data-open="proj:${p.slug}" data-node="proj:${p.slug}">${esc(p.title)}</button>`).join('')}</div>`) : ''}`;
}

function traitCard(k) {
  const t = P.traits[+k];
  if (!t) return null;
  const m = String(t.href).match(/projects\/([a-z0-9-]+)/);
  const slug = m && projBy.has(m[1]) ? m[1] : null;
  return `
    <p class="kicker">How I work</p>
    <h3 class="card-title">${esc(t.name)}</h3>
    <p class="card-lead">${esc(t.text)}</p>
    ${slug ? `<button class="btn btn-brass" data-open="proj:${slug}" data-node="proj:${slug}">${esc(t.link)} <i aria-hidden="true">→</i></button>` : `<button class="btn btn-line" data-go="${/ai/.test(t.href) ? 'ai' : 'career'}">${esc(t.link)}</button>`}
    ${sec('How I work, day to day', `<ul class="items plain">${P.how_i_work.map(x => `<li><span>${esc(x)}</span></li>`).join('')}</ul>`)}`;
}

function trainingCard() {
  return `
    <p class="kicker">Credentials<span class="dot">·</span>${TRAINING} courses and programmes</p>
    <h3 class="card-title">Training and development</h3>
    ${CR.groups.map(g => `<section><h4>${esc(g.name)}</h4><ul class="items">${g.items.map(x => `<li><span class="tag">${esc(x.status)}</span><span><b>${esc(x.title)}</b><br><small>${esc(x.org)}${x.detail ? ' · ' + esc(x.detail) : ''}</small></span></li>`).join('')}</ul></section>`).join('')}
    ${sec('Learning now', `<ul class="items plain">${AI.learning.map(x => `<li><span>${esc(x)}</span></li>`).join('')}</ul>`)}
    ${sec('Affiliations', `<div class="chips">${CR.affiliations.map(a => `<span class="chip chip-static">${esc(a)}</span>`).join('')}</div>`)}`;
}

function journeyCard() {
  return `
    <p class="kicker">Career<span class="dot">·</span>The journey so far</p>
    <h3 class="card-title">From scholarship to regional leadership</h3>
    ${P.journey.map(j => `<p class="para">${esc(j)}</p>`).join('')}
    ${sec('What I bring', `<ul class="items plain">${P.contribution.map(c => `<li><span><b>${esc(c.title)}.</b> ${esc(c.text)}</span></li>`).join('')}</ul>`)}`;
}

function indexCard() {
  const groups = hubOrder.map(h => {
    const list = PROJ.filter(p => chapterOfNode('proj:' + p.slug) === h);
    return list.length ? `<section><h4>${esc(hubs[h].name)} <small>${list.length}</small></h4><ul class="rows">${list.map(projRow).join('')}</ul></section>` : '';
  }).join('');
  return `
    <p class="kicker">Index<span class="dot">·</span>${PROJ.length} projects and ${PERS.length} personal builds</p>
    <h3 class="card-title">All work</h3>
    ${groups}
    <section><h4>Personal builds <small>${PERS.length}</small></h4><div class="chips">${PERS.map(p => `<button class="chip chip-p" data-open="pers:${p.slug}" data-node="pers:${p.slug}"><i class="st st-${stageClass(p.stage)}"></i>${esc(p.title.split(':')[0])}<small>${esc(p.stage)}</small></button>`).join('')}</div></section>`;
}

/* ───────────────────────── DOM ───────────────────────── */

const canvas = $('#gl');
const story = $('#story');
const rail = $('#rail');
const labelsEl = $('#labels');
const tip = $('#tip');
const card = $('#card');
const cardBody = $('#card-body');
const plate = $('#plate');
const cursor = $('#cursor');
const svg = $('#leaders');

function buildDOM() {
  story.innerHTML = CH.map((c, i) => `<section class="ch ch-${c.key}" id="${c.key}" data-i="${i}" aria-label="${esc(c.nav)}"><div class="panel${c.key === 'hero' ? ' panel-hero' : ''}">${panelHTML(c, i)}</div></section>`).join('');
  rail.innerHTML = `<span class="rail-track" aria-hidden="true"><i></i></span>` + CH.map((c, i) => `<button class="rail-i" data-go="${c.key}" aria-label="${esc(c.nav)}"><span class="rail-n">${pad(i)}</span><span class="rail-l">${esc(c.nav)}</span></button>`).join('');
  $('#idx-count').textContent = PROJ.length + PERS.length;
}

/* ───────────────────────── state ───────────────────────── */

const S = {
  s: 0, chapter: -1, card: null, cardNode: null, hoverCanvas: null, hoverDom: null, hoverDomEl: null,
  ptr: { x: innerWidth / 2, y: innerHeight / 2, on: false, overCanvas: false, down: false, moved: 0, lx: 0, ly: 0, sx: 0, sy: 0 },
  trace: { id: null, t: 0, u: 0, playing: false },
  skillQ: '', skillCat: null, ready: false,
};
let world = null, lenis = null;
let panels = [], centers = [], goals = [];
const labels = new Map();

/* ───────────────────────── scroll ───────────────────────── */

function measure() {
  const vh = innerHeight;
  const secs = $$('.ch', story);
  panels = secs.map(s => s.querySelector('.panel'));
  const max = Math.max(1, doc.documentElement.scrollHeight - vh);
  centers = secs.map((s, i) => (i === 0 ? 0 : i === secs.length - 1 ? max : clamp(s.offsetTop + (s.offsetHeight - vh) / 2, 0, max)));
  for (let i = 1; i < centers.length; i++) centers[i] = Math.max(centers[i], centers[i - 1] + 1);
  panels.forEach(p => {
    p.classList.toggle('scrolls', p.scrollHeight > p.clientHeight + 4);
    if (p.scrollHeight > p.clientHeight + 4) p.setAttribute('data-lenis-prevent', '');
    else p.removeAttribute('data-lenis-prevent');
  });
  if (world) goals = CH.map(c => world.chapterGoal(c.key));
}

function sOf(y) {
  const n = centers.length;
  if (y <= centers[0]) return 0;
  for (let i = 0; i < n - 1; i++) if (y < centers[i + 1]) return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
  return n - 1;
}

function goTo(key, { instant = false } = {}) {
  const i = chIndex(key);
  if (i < 0 || !centers.length) return;
  const y = centers[i];
  if (lenis) lenis.scrollTo(y, instant ? { immediate: true, force: true } : { duration: clamp((Math.abs(y - scrollY) / innerHeight) * 0.32, 1.0, 2.6), easing: easeInOut, force: true });
  else window.scrollTo({ top: y, behavior: instant || reduced ? 'auto' : 'smooth' });
}

const dwell = (f, d = 0.24) => (f <= d ? 0 : f >= 1 - d ? 1 : easeInOut((f - d) / (1 - 2 * d)));

function cameraFromScroll(s) {
  const n = CH.length;
  const i = Math.min(n - 2, Math.floor(s)), f = clamp(s - i), e = dwell(f);
  const A = goals[i], B = goals[i + 1];
  const g = {
    target: A.target.clone().lerp(B.target, e),
    dist: lerp(A.dist, B.dist, e) * (1 + Math.sin(Math.PI * e) * 0.14),
    yaw: A.yaw + wrapPi(B.yaw - A.yaw) * e,
    pitch: lerp(A.pitch, B.pitch, e),
    shiftX: lerp(A.shiftX, B.shiftX, e),
    shiftY: lerp(A.shiftY, B.shiftY, e),
    auto: e < 0.5 ? A.auto : B.auto,
  };
  const key = CH[Math.round(s)].key;
  if (key === 'skills' && S.skillCat && world) {
    const c = world.get('cat:' + S.skillCat);
    if (c) {
      const p = c.pos;
      g.yaw = Math.atan2(p.x, p.z);
      g.pitch = clamp(Math.asin(p.y / p.length()) * 0.9, -0.9, 0.9);
      g.dist = mobile ? 40 : 30;
      g.target.copy(p).multiplyScalar(0.45);
      g.auto = 0;
    }
  }
  if (S.cardNode && world) return world.focusGoal(S.cardNode, g);
  return g;
}

/* ───────────────────────── chapters ───────────────────────── */

function onChapter(i) {
  const prev = S.chapter;
  S.chapter = i;
  const c = CH[i];
  $$('.rail-i', rail).forEach((b, k) => b.classList.toggle('on', k === i));
  $('#tick-n').textContent = pad(i);
  $('#tick-l').textContent = c.key === 'hero' ? 'Introduction' : c.hub ? hubs[c.hub].name : c.nav;
  root.dataset.chapter = c.key;
  if (S.card && prev !== -1) closeCard({ push: false, silent: true });
  if (S.pendingCard && chapterOfNode(S.pendingCard) === c.key) { const id = S.pendingCard; S.pendingCard = null; setTimeout(() => openCard(id, { push: false }), 300); }
  if (world) {
    world.setFocus({ chapter: c.key, hub: c.hub || null, trace: null, roleHover: null, skills: c.key === 'skills' ? skillFocus() : null });
    world.showFact(c.hub || null);
    world.resetDrag();
  }
  if (c.key === 'traces') { if (!S.trace.id) selectTrace(MAP.traces[0].id); S.trace.playing = !reduced || S.trace.playing; }
  else S.trace.playing = false;
  if (S.ready && prev !== -1 && !S.card && !S.pendingCard) {
    const h = c.key === 'hero' ? location.pathname + location.search : '#' + c.key;
    history.replaceState(null, '', h);
  }
}

function updatePanels(s) {
  const cardDim = S.card ? (mobile ? 0 : 0.14) : 1;
  panels.forEach((p, i) => {
    const d = s - i, a = Math.abs(d);
    let v = 1 - ss(0.2, 0.47, a);
    v *= cardDim;
    if (!S.ready) v = 0;
    const y = (mobile ? -26 : -46) * d;
    const key = v.toFixed(3) + '|' + y.toFixed(1);
    if (p._k === key) return;
    p._k = key;
    p.style.opacity = v;
    p.style.setProperty('--py', y.toFixed(1) + 'px');
    p.style.visibility = v < 0.01 ? 'hidden' : 'visible';
    p.classList.toggle('live', v > 0.55);
  });
  const n = CH.length - 1;
  rail.style.setProperty('--p', (s / n).toFixed(4));
}

/* ───────────────────────── labels ───────────────────────── */

function buildLabels() {
  const make = (e, cls, html) => {
    const el = doc.createElement('div');
    el.className = 'lbl ' + cls;
    el.innerHTML = '<div class="lb">' + html + '</div>';
    labelsEl.appendChild(el);
    labels.set(e.id, { el, e, o: 0, k: '' });
  };
  for (const e of world.registry) {
    if (e.type === 'hub') make(e, 'l-hub', `<span class="l-n">${pad(chIndex(e.hub))}</span><span class="l-t">${esc(hubs[e.hub].name)}</span>`);
    else if (e.type === 'core') make(e, 'l-core', `<span class="l-t">${esc(P.name)}</span><span class="l-s">Core</span>`);
    else if (e.type === 'proj') make(e, 'l-proj' + (e.tier === 'flagship' ? ' flag' : ''), `<span class="l-t">${esc(projBy.get(e.slug).title)}</span><span class="l-s">${esc(projBy.get(e.slug).key)}</span>`);
    else if (e.type === 'pers') { const p = persBy.get(e.slug); make(e, 'l-proj l-pers', `<span class="l-t">${esc(p.title.split(':')[0])}</span><span class="l-s">${esc(p.stage)}</span>`); }
    else if (e.type === 'role') { const r = roleBy.get(e.roleId); make(e, 'l-role', `<span class="l-s">${esc(yearsLabel(r.dates))}</span><span class="l-t">${esc(r.title)}</span>`); }
    else if (e.type === 'year') make(e, 'l-year', `${e.year}`);
    else if (e.type === 'band') make(e, 'l-band', esc(e.name));
    else if (e.type === 'cat') make(e, 'l-cat', `<span class="l-t">${esc(e.name)}</span><span class="l-s">${e.count}</span>`);
    else if (e.type === 'cap') make(e, 'l-cap', esc(e.label));
    else if (e.type === 'evt' && e.ev.kind !== 3) make(e, 'l-evt k' + e.ev.kind, `<span class="l-t">${esc(e.ev.kind === 4 ? 'Now' : e.ev.title)}</span>`);
  }
}

function labelGoal(e) {
  const c = CH[S.chapter] || CH[0];
  const key = c.key, hub = c.hub;
  const hov = currentHover();
  const sel = S.cardNode;
  if (!S.ready) return 0;
  switch (e.type) {
    case 'hub': return key === 'skills' ? 0.25 : sel ? 0.35 : key === 'traces' && S.trace.id ? (MAP.traces.find(x => x.id === S.trace.id).path.includes(e.hub) ? 1 : 0.3) : hub && hub !== e.hub ? 0.55 : 1;
    case 'core': return key === 'hero' || key === 'contact' || key === 'skills' ? 0 : hub ? 0.4 : 0.85;
    case 'proj': case 'pers': {
      if (hov === e.id || sel === e.id) return 1;
      if (sel) return 0;
      if (hub && e.pillars.includes(hub)) return e.type === 'pers' ? 0.9 : 1;
      if (key === 'outcomes' && e.tier === 'flagship') return 0.8;
      if (world.focus.roleHover && e.role === world.focus.roleHover) return 1;
      if (world.focus.skills?.proofs?.has(e.id)) return 1;
      return 0;
    }
    case 'role': return key === 'career' || hov === e.id || sel === e.id ? 1 : key === 'credentials' ? 0.5 : 0;
    case 'year': return key === 'career' || key === 'credentials' ? 0.9 : 0;
    case 'band': return key === 'credentials' || (key === 'career' && !/scholarship/i.test(e.name)) ? 0.8 : 0;
    case 'evt': return key === 'credentials' ? (e.ev.kind === 4 ? 1 : 0.9) : key === 'career' && e.ev.y >= 2014 && (e.ev.kind === 2 || e.ev.kind === 4) ? 0.8 : 0;
    case 'cat': return key === 'skills' ? (S.skillCat && S.skillCat !== e.cat ? 0.35 : 1) : 0;
    case 'cap': return hub && (e.ha === hub || e.hb === hub) && !sel ? 0.85 : key === 'traces' && S.trace.capHub && (e.ha === S.trace.capHub || e.hb === S.trace.capHub) ? 0.7 : 0;
  }
  return 0;
}

let panelBox = null;
const PRIO = { hub: 90, core: 85, cat: 70, role: 75, proj: 40, pers: 35, cap: 30, evt: 25, year: 20, band: 15 };
const placed = [];
function labelRect(L, e) {
  if (L.w === undefined) { L.w = L.el.firstElementChild.offsetWidth || 120; L.h = L.el.firstElementChild.offsetHeight || 16; }
  const w = L.w, h = L.h, x = e.sx, y = e.sy;
  switch (e.type) {
    case 'hub': return L.left ? [x - w - 26, y - h / 2, w, h] : [x + 24, y - h / 2, w, h];
    case 'proj': case 'pers': return L.left ? [x - w - 15, y - h / 2, w, h] : [x + 15, y - h / 2, w, h];
    case 'core': return [x - w / 2, y + 38, w, h];
    case 'role': return [x - w / 2, y + 10, w, h];
    case 'evt': return [x + 10, y - h / 2, w, h];
    default: return [x - w / 2, y - h / 2, w, h];
  }
}
const hit = (a, b, pad = 5) => a[0] < b[0] + b[2] + pad && a[0] + a[2] + pad > b[0] && a[1] < b[1] + b[3] + pad && a[1] + a[3] + pad > b[1];
function updateLabels(dt) {
  if (!world) return;
  const core = world.get('core');
  const pi = Math.round(S.s), pa = panels[pi];
  panelBox = pa && pa.style.visibility !== 'hidden' ? pa.getBoundingClientRect() : null;
  const hov = currentHover(), sel = S.cardNode;
  const hubKey = CH[S.chapter]?.hub;
  const list = [];
  for (const L of labels.values()) {
    const e = L.e;
    let g = labelGoal(e);
    if (!e.front || e.occ) g = 0;
    if (e.depth > 70 && e.type !== 'cat') g *= 0.5;
    if (e.sy < 72 || e.sy > innerHeight - (mobile ? 40 : 66)) g = 0;
    if (e.type === 'hub' || e.type === 'proj' || e.type === 'pers') {
      const left = e.sx > innerWidth - 230 || (e.sx < core.sx - 8 && e.sx > 260);
      if (L.left !== left) { L.left = left; L.el.classList.toggle('l-left', left); }
    }
    let pr = PRIO[e.type] || 10;
    if (e.type === 'hub' && e.hub === S.trace.capHub && CH[S.chapter]?.key === 'traces') pr = 900;
    if (e.id === hov || e.id === sel) pr = 1000;
    else if (e.type === 'proj' && hubKey && hubs[hubKey].proof.includes(e.slug)) pr = 60;
    else if (e.type === 'proj' && e.tier === 'flagship') pr = 50;
    L.g = g; L.pr = pr - e.depth * 0.01;
    if (g > 0.02) list.push(L);
  }
  list.sort((a, b) => b.pr - a.pr);
  placed.length = 0;
  if (!mobile) { const rr = rail.getBoundingClientRect(); placed.push([rr.left - 60, rr.top, rr.width + 60, rr.height]); }
  if (plateO > 0.2 && plate.firstElementChild.offsetWidth) {
    const r = plate.firstElementChild.getBoundingClientRect();
    placed.push([r.left, r.top, r.width, r.height]);
  }
  for (const L of list) {
    const r = labelRect(L, L.e);
    if (r[0] < 8 || r[0] + r[2] > innerWidth - 8) { L.g = 0; continue; }
    if (panelBox && L.pr < 1000 && hit(r, [panelBox.left, panelBox.top, panelBox.width, panelBox.height], 18)) { L.g *= 0.06; continue; }
    if (L.pr < 1000 && placed.some(p => hit(r, p))) { L.g = 0; continue; }
    placed.push(r);
  }
  for (const L of labels.values()) {
    const e = L.e, g = L.g || 0;
    L.o = damp(L.o, g, g > L.o ? 7 : 10, dt);
    const o = L.o < 0.01 ? 0 : L.o;
    const k = o ? `${e.sx.toFixed(1)},${e.sy.toFixed(1)},${o.toFixed(2)}` : '0';
    if (k === L.k) continue;
    L.k = k;
    if (!o) { L.el.style.opacity = 0; L.el.style.visibility = 'hidden'; continue; }
    L.el.style.visibility = 'visible';
    L.el.style.opacity = o;
    L.el.style.transform = `translate3d(${e.sx.toFixed(1)}px, ${e.sy.toFixed(1)}px, 0)`;
  }
}
/* ───────────────────────── hover, tooltip, cursor ───────────────────────── */

const currentHover = () => S.hoverDom || S.hoverCanvas;

function pickTypes() {
  const key = CH[S.chapter]?.key;
  const t = new Set(['hub', 'core', 'proj', 'pers', 'role']);
  if (key === 'skills') t.add('skill');
  if (key === 'career' || key === 'credentials') t.add('evt');
  return t;
}

function tipHTML(e) {
  const levelName = l => SK.levels[l] || l;
  switch (e.type) {
    case 'hub': return `<small>Hub · ${pad(chIndex(e.hub))}</small><b>${esc(hubs[e.hub].name)}</b><span>${esc(hubs[e.hub].line)}</span>`;
    case 'core': return `<small>Core</small><b>${esc(P.name)}</b><span>${esc(P.current_title)}</span>`;
    case 'proj': { const p = projBy.get(e.slug); return `<small>${esc(TIER[p.tier])} · ${esc(p.where)}</small><b>${esc(p.title)}</b><span>${esc(p.key)} · ${esc(p.my_role)}</span>`; }
    case 'pers': { const p = persBy.get(e.slug); return `<small>${esc(p.category)} · ${esc(p.stage)}</small><b>${esc(p.title)}</b><span>${esc(p.status)}</span>`; }
    case 'role': { const r = roleBy.get(e.roleId); return `<small>${esc(r.employer)} · ${esc(r.dates)}</small><b>${esc(r.title)}</b><span>${esc(r.summary)}</span>`; }
    case 'skill': {
      const s = skills[e.skill];
      const pr = s.proofs.map(proofNodeId).filter(Boolean).map(nodeTitle);
      return `<small>${esc(levelName(s.level))} · ${esc(s.catName)}</small><b>${esc(s.name)}</b>${pr.length ? `<span>Proven in: ${pr.map(esc).join(', ')}</span>` : ''}`;
    }
    case 'evt': { const v = e.ev; const k = ['Education', 'Qualification', 'Award', 'Training', 'Today'][v.kind]; return `<small>${k}</small><b>${esc(v.title)}</b><span>${esc([v.org, v.detail].filter(Boolean).join(' · '))}</span>`; }
  }
  return '';
}

let tipFor = null;
function updateTip() {
  const id = S.hoverCanvas;
  const e = id && world ? world.get(id) : null;
  if (!e || touch || S.ptr.down) { tip.classList.remove('on'); tipFor = null; return; }
  if (tipFor !== id) { tip.innerHTML = tipHTML(e); tipFor = id; }
  tip.classList.add('on');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = S.ptr.x + 22, y = S.ptr.y + 18;
  if (x + w > innerWidth - 12) x = S.ptr.x - w - 22;
  if (y + h > innerHeight - 12) y = S.ptr.y - h - 18;
  tip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

const cur = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2, s: 1 };
function updateCursor(dt) {
  if (touch) return;
  const e = S.hoverCanvas && world ? world.get(S.hoverCanvas) : null;
  const tx = e ? e.sx : S.ptr.x, ty = e ? e.sy : S.ptr.y;
  cur.rx = damp(cur.rx, tx, e ? 14 : 18, dt);
  cur.ry = damp(cur.ry, ty, e ? 14 : 18, dt);
  cursor.style.setProperty('--x', S.ptr.x + 'px');
  cursor.style.setProperty('--y', S.ptr.y + 'px');
  cursor.style.setProperty('--rx', cur.rx.toFixed(1) + 'px');
  cursor.style.setProperty('--ry', cur.ry.toFixed(1) + 'px');
  const mode = S.ptr.down && S.ptr.moved > 4 ? 'drag' : e ? 'node' : S.overUI ? 'ui' : 'idle';
  if (cursor.dataset.mode !== mode) {
    cursor.dataset.mode = mode;
    $('.c-l', cursor).textContent = mode === 'node' ? (e && (e.type === 'skill' || e.type === 'evt') ? 'View' : 'Open') : mode === 'drag' ? 'Orbit' : '';
  }
  cursor.classList.toggle('hide', !S.ptr.on);
}

/* ───────────────────────── leader lines ───────────────────────── */

const leaders = { a: { o: 0 }, b: { o: 0 } };
function leaderPath(x1, y1, x2, y2, dir) {
  const ex = x1 + dir * 36;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} H${ex.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
}
function setLeader(name, on, x1, y1, x2, y2, dir, dt) {
  const L = leaders[name];
  L.o = damp(L.o, on ? 1 : 0, on ? 9 : 12, dt);
  const path = $('#ld-' + name), dot = $('#ld-' + name + '-dot'), ring = $('#ld-' + name + '-ring');
  if (L.o < 0.01) { path.style.opacity = dot.style.opacity = ring.style.opacity = 0; return; }
  if (on) { L.x1 = x1; L.y1 = y1; L.x2 = x2; L.y2 = y2; L.dir = dir; }
  if (L.x1 === undefined) return;
  path.setAttribute('d', leaderPath(L.x1, L.y1, L.x2, L.y2, L.dir));
  const len = 36 + Math.hypot(L.x2 - (L.x1 + L.dir * 36), L.y2 - L.y1);
  path.style.strokeDasharray = `${len} ${len}`;
  path.style.strokeDashoffset = `${(1 - L.o) * len}`;
  path.style.opacity = L.o;
  dot.setAttribute('cx', L.x2); dot.setAttribute('cy', L.y2);
  ring.setAttribute('cx', L.x2); ring.setAttribute('cy', L.y2);
  dot.style.opacity = L.o; ring.style.opacity = L.o * 0.8;
}
function updateLeaders(dt) {
  if (!world) return;
  let on = false, x1, y1, x2, y2, dir = 1;
  if (S.hoverDom && S.hoverDomEl && !touch) {
    const e = world.get(S.hoverDom);
    if (e && e.front && !e.occ) {
      const r = S.hoverDomEl.getBoundingClientRect();
      const inCard = card.contains(S.hoverDomEl);
      dir = inCard ? -1 : 1;
      x1 = inCard ? r.left - 6 : r.right + 6; y1 = r.top + r.height / 2;
      x2 = e.sx; y2 = e.sy; on = r.bottom > 0 && r.top < innerHeight;
    }
  }
  setLeader('a', on, x1, y1, x2, y2, dir, dt);
  let on2 = false;
  if (S.cardNode && !mobile) {
    const e = world.get(S.cardNode);
    if (e && e.front) {
      const r = card.getBoundingClientRect();
      x1 = r.left - 6; y1 = r.top + 96; x2 = e.sx; y2 = e.sy; on2 = card.classList.contains('in');
    }
  }
  setLeader('b', on2, x1, y1, x2, y2, -1, dt);
}

/* ───────────────────────── fact plate ───────────────────────── */

const PLATES = {
  ai: { to: 300, pre: '~', label: 'employees trained on Microsoft Copilot', note: 'One particle per person, lit as they are trained.' },
  people: { to: 100, pre: '~', label: 'people moved to remote work, across seven departments', note: 'With one IT technician, during COVID-19. The business kept running.' },
  security: { to: 1000, suf: '+', label: 'devices brought back under control', note: 'From chaos to a registered lattice: unified models, recorded lifespans.' },
  enterprise: { to: 699, label: 'users moved to Exchange Online', note: 'Zero downtime. Every particle arrives.' },
  industrial: { to: 100, suf: '+', label: 'Cisco and N-Tron switches re-architected', note: 'A tangle becomes a documented topology, machine to core.' },
  outcomes: { to: 79, suf: '%', label: 'of reported issues resolved remotely at first line', note: 'Nine remote sites, more than 500 users, on time and within budget.' },
};
let plateHub = null, plateO = 0;
function updatePlate(dt) {
  const info = world ? world.factInfo() : null;
  const goal = info && !S.card && info.state !== 'out' && CH[S.chapter]?.hub === info.hub ? 1 : 0;
  plateO = damp(plateO, goal, goal ? 3 : 8, dt);
  if (plateO < 0.01) { plate.style.opacity = 0; plate.style.visibility = 'hidden'; return; }
  if (info && info.hub !== plateHub) {
    plateHub = info.hub;
    const c = PLATES[plateHub];
    plate.firstElementChild.innerHTML = `<b class="p-num"></b><span class="p-label">${esc(c.label)}</span><span class="p-note">${esc(c.note)}</span><span class="p-tag">Drawn with real counts</span>`;
  }
  const c = PLATES[plateHub];
  if (!c) return;
  const p = info ? info.p : 1;
  $('.p-num', plate).textContent = `${c.pre || ''}${fmt(c.to * p)}${c.suf || ''}`;
  const e = world.get('fact');
  plate.style.visibility = 'visible';
  plate.style.opacity = plateO;
  const ph = plate.firstElementChild.offsetHeight || 120, pw = (plate.firstElementChild.offsetWidth || 260) / 2;
  const x = clamp(e.sx, pw + 12, innerWidth - pw - (mobile ? 12 : 60)), y = clamp(e.sy, ph + (mobile ? 64 : 76), innerHeight - 120);
  plate.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
}

/* ───────────────────────── cards ───────────────────────── */

function openCard(id, { push = true } = {}) {
  const [t, k] = id.split(':');
  let html = null, node = null;
  if (t === 'proj') { html = projectCard(k); node = id; }
  else if (t === 'pers') { html = personalCard(k); node = id; }
  else if (t === 'role') { html = roleCard(k); node = id; }
  else if (t === 'trait') html = traitCard(k);
  else if (id === 'training') html = trainingCard();
  else if (id === 'journey') html = journeyCard();
  else if (id === 'index') html = indexCard();
  if (!html) return;
  S.card = id;
  S.cardNode = node && world && world.get(node) ? node : null;
  cardBody.innerHTML = html;
  card.hidden = false;
  card.scrollTop = 0;
  cardBody.scrollTop = 0;
  requestAnimationFrame(() => card.classList.add('in'));
  root.classList.add('card-open');
  if (world) world.setFocus({ selected: S.cardNode });
  setHoverDom(null);
  if (push) {
    const h = t === 'proj' || t === 'pers' ? '#project/' + k : t === 'role' ? '#role/' + k : id === 'index' ? '#projects' : null;
    if (h) history.pushState({ card: id }, '', h);
  }
  $('#card-close').focus({ preventScroll: true });
}

function closeCard({ push = true, silent = false } = {}) {
  if (!S.card) return;
  S.card = null;
  S.cardNode = null;
  card.classList.remove('in');
  root.classList.remove('card-open');
  setTimeout(() => { if (!S.card) card.hidden = true; }, 450);
  if (world) world.setFocus({ selected: null });
  if (push) {
    const c = CH[S.chapter];
    history.replaceState(null, '', c && c.key !== 'hero' ? '#' + c.key : location.pathname + location.search);
  }
}

/* ───────────────────────── traces ───────────────────────── */

const TRACE_DWELL = 2.0, TRACE_TRAVEL = 1.25;
function selectTrace(id) {
  const t = MAP.traces.find(x => x.id === id) || MAP.traces[0];
  S.trace.id = t.id;
  S.trace.t = 0;
  S.trace.u = 0;
  S.trace.playing = true;
  $$('.trace-tab').forEach(b => b.classList.toggle('on', b.dataset.trace === t.id));
  const body = $('#trace-body');
  body.innerHTML = `
    <p class="trace-problem"><span>The problem</span>${esc(t.problem)}</p>
    <ol class="trace-steps">${t.steps.map((s, k) => `<li data-step="${k}"><button><span class="ts-hub">${esc(hubs[t.path[k]]?.name || '')}</span><span class="ts-t">${esc(s)}</span></button></li>`).join('')}</ol>
    <div class="trace-ctl"><button class="btn btn-line" id="trace-play">Pause</button><button class="btn btn-brass" data-open="proj:${t.case}" data-node="proj:${t.case}">Open the case study <i aria-hidden="true">→</i></button></div>`;
}
function updateTrace(dt) {
  const tr = S.trace;
  const key = CH[S.chapter]?.key;
  if (key !== 'traces' || !tr.id) { if (world && world.focus.trace) world.setTrace(null); return; }
  const t = MAP.traces.find(x => x.id === tr.id);
  const n = t.path.length;
  const period = TRACE_DWELL + TRACE_TRAVEL;
  if (tr.playing) tr.t += dt;
  const total = (n - 1) * period + TRACE_DWELL + 1.6;
  if (tr.t > total && tr.playing) {
    const i = MAP.traces.indexOf(t);
    selectTrace(MAP.traces[(i + 1) % MAP.traces.length].id);
    return;
  }
  const k = Math.floor(tr.t / period), local = tr.t - k * period;
  tr.u = Math.min(n - 1, k + (k < n - 1 ? easeInOut(clamp((local - TRACE_DWELL) / TRACE_TRAVEL)) : 0));
  const step = Math.min(n - 1, Math.round(tr.u));
  tr.capHub = t.path[step];
  if (world) world.setTrace(t.path, tr.u);
  $$('.trace-steps li').forEach(li => {
    const s = +li.dataset.step;
    li.classList.toggle('on', s === step);
    li.classList.toggle('done', s < step);
  });
  const b = $('#trace-play');
  if (b) b.textContent = tr.playing ? 'Pause' : 'Play';
}

/* ───────────────────────── skills ───────────────────────── */

function skillFocus() {
  const q = S.skillQ.trim().toLowerCase();
  if (!q && !S.skillCat) return { proofs: new Set() };
  let list;
  if (q) list = skills.filter(s => s.name.toLowerCase().includes(q) || s.catName.toLowerCase().includes(q));
  else list = skills.filter(s => s.cat === S.skillCat);
  const proofs = new Set(list.flatMap(s => s.proofs.map(proofNodeId).filter(Boolean)));
  return q ? { matches: new Set(list.map(s => s.idx)), proofs } : { cat: S.skillCat, proofs };
}
function renderSkillResults() {
  const box = $('#skill-results');
  const q = S.skillQ.trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const list = skills.filter(s => s.name.toLowerCase().includes(q) || s.catName.toLowerCase().includes(q)).slice(0, 10);
  box.innerHTML = list.length
    ? list.map(s => {
      const pr = s.proofs.map(proofNodeId).filter(Boolean);
      return `<div class="res"><span class="lg lg-${s.level}"><i></i></span><b>${esc(s.name)}</b><small>${esc(SK.levels[s.level])} · ${esc(s.catName)}</small>${pr.map(id => `<button class="chip" data-open="${id}" data-node="${id}">${esc(nodeTitle(id))}</button>`).join('')}</div>`;
    }).join('')
    : `<p class="fine">No skill matches “${esc(S.skillQ)}”.</p>`;
}
function applySkills() {
  if (world && CH[S.chapter]?.key === 'skills') world.setFocus({ skills: skillFocus() });
  $$('.cats .chip').forEach(b => b.classList.toggle('on', b.dataset.cat === S.skillCat));
  renderSkillResults();
}

/* ───────────────────────── interaction ───────────────────────── */

function setHoverDom(id, el = null) {
  S.hoverDom = id;
  S.hoverDomEl = el;
  if (world) world.setFocus({ hover: currentHover(), roleHover: id && id.startsWith('role:') ? id.slice(5) : null });
}

function act(target) {
  const go = target.closest('[data-go]');
  const open = target.closest('[data-open]');
  const tr = target.closest('[data-trace]');
  const cat = target.closest('[data-cat]');
  const copy = target.closest('[data-copy]');
  const sk = target.closest('[data-skill]');
  const step = target.closest('.trace-steps li');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy).then(() => { copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy'), 1600); });
    return true;
  }
  if (open) { openCard(open.dataset.open); return true; }
  if (go) { if (S.card) closeCard(); goTo(go.dataset.go); return true; }
  if (tr) { selectTrace(tr.dataset.trace); return true; }
  if (step) { const k = +step.dataset.step; S.trace.t = k * (TRACE_DWELL + TRACE_TRAVEL); return true; }
  if (target.closest('#trace-play')) { S.trace.playing = !S.trace.playing; return true; }
  if (cat) { S.skillCat = S.skillCat === cat.dataset.cat ? null : cat.dataset.cat; S.skillQ = ''; const q = $('#skill-q'); if (q) q.value = ''; applySkills(); return true; }
  if (sk) { closeCard(); S.skillQ = sk.dataset.skill; S.skillCat = null; const q = $('#skill-q'); if (q) q.value = S.skillQ; goTo('skills'); setTimeout(applySkills, 50); return true; }
  return false;
}

function canvasClick() {
  const id = S.hoverCanvas;
  if (!id) { if (S.card) closeCard(); return; }
  const e = world.get(id);
  ripple(e.sx, e.sy);
  if (e.type === 'hub') { if (S.card) closeCard(); goTo(e.hub); }
  else if (e.type === 'core') { if (S.card) closeCard(); goTo('career'); }
  else if (e.type === 'proj' || e.type === 'pers' || e.type === 'role') openCard(id);
  else if (e.type === 'skill') {
    const s = skills[e.skill];
    S.skillQ = s.name; S.skillCat = null;
    const q = $('#skill-q'); if (q) q.value = s.name;
    applySkills();
  }
}

function ripple(x, y) {
  const r = doc.createElement('i');
  r.className = 'ripple';
  r.style.left = x + 'px';
  r.style.top = y + 'px';
  doc.body.appendChild(r);
  setTimeout(() => r.remove(), 900);
}

function bindEvents() {
  addEventListener('pointermove', e => {
    const p = S.ptr;
    p.x = e.clientX; p.y = e.clientY; p.on = true;
    p.overCanvas = e.target === canvas;
    S.overUI = !!e.target.closest('button, a, input, label');
    if (p.down) {
      const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
      p.moved += Math.abs(dx) + Math.abs(dy);
      if (p.moved > 4 && world) world.dragBy(dx, dy);
    }
    p.lx = e.clientX; p.ly = e.clientY;
    if (world) world.setPointer(p.x, p.y, true);
  }, { passive: true });
  doc.addEventListener('pointerleave', () => { S.ptr.on = false; S.hoverCanvas = null; if (world) world.setPointer(-9999, -9999, false); });
  canvas.addEventListener('pointerdown', e => {
    const p = S.ptr;
    p.down = true; p.moved = 0; p.lx = e.clientX; p.ly = e.clientY;
    p.x = e.clientX; p.y = e.clientY;
    if (touch && world) {
      world.setPointer(p.x, p.y, true);
      world.update(0);
      S.hoverCanvas = world.pick(p.x, p.y, pickTypes())?.id || null;
    }
  });
  addEventListener('pointerup', e => {
    const p = S.ptr;
    if (!p.down) return;
    p.down = false;
    if (world) world.dragEnd();
    if (p.moved <= 6 && e.target === canvas && world) canvasClick();
    if (touch) S.hoverCanvas = null;
  });
  addEventListener('pointercancel', () => { S.ptr.down = false; if (world) world.dragEnd(); });

  doc.addEventListener('click', e => {
    if (e.target === canvas) return;
    if (act(e.target)) e.preventDefault();
  });
  doc.addEventListener('mouseover', e => {
    const n = e.target.closest('[data-node]');
    if (n) setHoverDom(n.dataset.node, n);
  });
  doc.addEventListener('mouseout', e => {
    const n = e.target.closest('[data-node]');
    if (n && !n.contains(e.relatedTarget)) setHoverDom(null);
  });
  doc.addEventListener('focusin', e => {
    const n = e.target.closest('[data-node]');
    if (n) setHoverDom(n.dataset.node, n);
  });
  doc.addEventListener('input', e => {
    if (e.target.id === 'skill-q') { S.skillQ = e.target.value; S.skillCat = null; applySkills(); }
  });
  $('#card-close').addEventListener('click', () => closeCard());
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (S.card) closeCard(); else if (S.skillQ || S.skillCat) { S.skillQ = ''; S.skillCat = null; const q = $('#skill-q'); if (q) q.value = ''; applySkills(); } }
  });
  addEventListener('popstate', () => route(location.hash, false));
  addEventListener('hashchange', () => route(location.hash, false));
  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      mobile = innerWidth < 860;
      root.classList.toggle('mobile', mobile);
      if (world) world.resize(innerWidth, innerHeight, mobile);
      labels.forEach(L => (L.w = undefined));
      measure();
    }, 120);
  });
}

function route(hash, instant) {
  const h = decodeURIComponent(String(hash || '').replace(/^#/, ''));
  if (!h) return;
  const [kind, id] = h.split('/');
  if (kind === 'project' && id) {
    const nid = proofNodeId(id);
    if (!nid) return;
    if (S.card === nid) return;
    const ch = chapterOfNode(nid);
    if (instant || CH[S.chapter]?.key === ch) { goTo(ch, { instant }); setTimeout(() => openCard(nid, { push: false }), 60); }
    else { S.pendingCard = nid; goTo(ch); }
    return;
  }
  if (kind === 'role' && roleBy.has(id)) {
    if (instant || CH[S.chapter]?.key === 'career') { goTo('career', { instant }); setTimeout(() => openCard('role:' + id, { push: false }), 60); }
    else { S.pendingCard = 'role:' + id; goTo('career'); }
    return;
  }
  if (kind === 'trace') { goTo('traces', { instant }); selectTrace(id); return; }
  if (kind === 'projects') { openCard('index', { push: false }); return; }
  if (chIndex(kind) >= 0) {
    if (S.card) closeCard({ push: false });
    if (CH[S.chapter]?.key !== kind) goTo(kind, { instant });
  }
}

/* ───────────────────────── HUD ───────────────────────── */

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
let hudT = 0;
function updateHud(dt) {
  hudT += dt;
  if (hudT < 0.1) return;
  hudT = 0;
  $('#hud-time').textContent = clock.format(new Date());
  if (!world) return;
  const b = ((world.cam.yaw * 180) / Math.PI % 360 + 360) % 360;
  $('#hud-brg').textContent = String(Math.round(b)).padStart(3, '0') + '°';
  $('#hud-rng').textContent = world.cam.dist.toFixed(1);
}

/* ───────────────────────── loop ───────────────────────── */

let last = performance.now();
const perf = { acc: 0, n: 0, checks: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  if (lenis) lenis.raf(now);
  step(dt);
}

function step(dt) {
  const s = sOf(window.scrollY);
  S.s = s;
  const ci = clamp(Math.round(s), 0, CH.length - 1);
  if (ci !== S.chapter) onChapter(ci);
  updatePanels(s);
  updateTrace(dt);
  if (world) {
    if (goals.length) world.setCameraGoal(cameraFromScroll(s));
    const hv = S.ptr.on && S.ptr.overCanvas && !S.ptr.down && S.ready ? world.pick(S.ptr.x, S.ptr.y, pickTypes())?.id || null : touch ? S.hoverCanvas : null;
    if (hv !== S.hoverCanvas && !touch) S.hoverCanvas = hv;
    world.setFocus({ hover: currentHover() });
    world.update(dt);
    world.render();
    updateLabels(dt);
    updateLeaders(dt);
    updatePlate(dt);
    if (S.ready && perf.checks < 4) {
      perf.acc += dt; perf.n++;
      if (perf.n >= 120) {
        const avg = perf.acc / perf.n;
        perf.acc = 0; perf.n = 0; perf.checks++;
        if (avg > 1 / 40 && world.dpr > 1) world.setDpr(Math.max(1, world.dpr - 0.35));
      }
    }
  }
  updateTip();
  updateCursor(dt);
  updateHud(dt);
}

/* ───────────────────────── boot ───────────────────────── */

const ld = { pct: 0, goal: 0, el: $('#ld-pct'), bar: $('#ld-bar'), step: $('#ld-step') };
function loadStep(goal, text) {
  ld.goal = Math.max(ld.goal, goal);
  if (text) ld.step.textContent = text;
}
function loaderTick() {
  ld.pct = Math.min(ld.goal, ld.pct + Math.max(0.6, (ld.goal - ld.pct) * 0.12));
  ld.el.textContent = String(Math.round(ld.pct)).padStart(3, '0');
  ld.bar.style.transform = `scaleX(${(ld.pct / 100).toFixed(3)})`;
  if (!S.ready) requestAnimationFrame(loaderTick);
}

function countUp() {
  $$('[data-count]').forEach((el, k) => {
    const to = +el.dataset.count, pre = el.dataset.pre || '', suf = el.dataset.suf || '';
    const t0 = performance.now() + 500 + k * 120, dur = reduced || root.classList.contains('og') ? 1 : 1600;
    const tick = now => {
      const p = dur <= 1 ? 1 : clamp((now - t0) / dur);
      el.textContent = pre + fmt(to * (1 - Math.pow(1 - p, 3))) + suf;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function tier() {
  if (touch || innerWidth < 860) return 'low';
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  return mem <= 4 || cores <= 4 ? 'mid' : 'high';
}

async function boot() {
  window.__netBooted = true;
  root.classList.toggle('mobile', mobile);
  requestAnimationFrame(loaderTick);
  loadStep(12, 'Reading the CV data');
  buildDOM();
  bindEvents();
  loadStep(24, `Placing ${PROJ.length + PERS.length + roles.length + hubOrder.length + 1} nodes`);
  const fonts = Promise.race([doc.fonts?.ready || Promise.resolve(), new Promise(r => setTimeout(r, 2200))]);
  try {
    const gl = doc.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const mod = await import('./world.js');
    loadStep(62, 'Linking capabilities');
    world = new mod.World(canvas, DATA, { tier: tier(), reduced, mobile });
    const st = world.stats;
    $('#hud-nodes').textContent = st.nodes;
    $('#hud-links').textContent = st.links;
    $('#hud-particles').textContent = fmt(st.particles);
    loadStep(80, `Seeding ${fmt(st.particles)} particles`);
    buildLabels();
    window.__net = { world, S, CH, goTo, openCard, closeCard, tick: (sec = 1, dt = 0.05) => { for (let k = 0; k < sec / dt; k++) step(dt); }, get centers() { return centers; }, get lenis() { return lenis; } };
    await Promise.race([world.warm(), new Promise(r => setTimeout(r, 2500))]);
    loadStep(94, 'Compiling light');
  } catch (err) {
    console.warn('3D unavailable, continuing without it:', err);
    world = null;
    root.classList.add('no-gl');
  }
  if (!reduced && !touch) {
    try {
      const mod = await Promise.race([import('https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.mjs'), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 1800))]);
      const L = mod.default || mod.Lenis;
      lenis = new L({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true });
    } catch (e) { lenis = null; }
  }
  await fonts;
  loadStep(100, 'Ready');
  ld.pct = 100; ld.el.textContent = '100'; ld.bar.style.transform = 'scaleX(1)';
  measure();
  const og = new URLSearchParams(location.search).has('og');
  if (og) root.classList.add('og');
  const deep = og || (location.hash && location.hash.length > 1);
  if (deep) route(location.hash, true);
  await new Promise(r => setTimeout(r, reduced ? 50 : 420));
  root.classList.add('loaded');
  if (world) {
    world.startIntro(deep || reduced);
    world.update(0.016);
    if (og) { world.setCameraGoal(cameraFromScroll(0)); for (let k = 0; k < 90; k++) world.update(0.1); }
  }
  setTimeout(() => {
    S.ready = true;
    root.classList.add('ready');
    countUp();
  }, deep || reduced ? 100 : 1100);
  requestAnimationFrame(frame);
}

boot();
