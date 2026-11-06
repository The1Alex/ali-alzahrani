/* Motion and interaction. Everything is progressive enhancement: all the content is in the HTML. */
(function () {
  'use strict';
  var d = document;
  var motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = motionPreference.matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var all = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };

  /* ---------- A single scroll loop ---------- */
  var scrubs = [];
  var queued = false;
  function frame() {
    queued = false;
    if (reduced) return;
    var vh = innerHeight;
    for (var i = 0; i < scrubs.length; i++) {
      var r = scrubs[i].el.getBoundingClientRect();
      if (r.bottom > -vh && r.top < vh * 2) scrubs[i].fn(r, vh);
    }
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  addEventListener('load', queue);

  /* ---------- Reveal on scroll ---------- */
  if (!reduced && 'IntersectionObserver' in window) {
    var targets = all('.rv, .tile, .pcard, .library li, .cred, .wp');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
        var c = en.target.querySelector('[data-count]');
        if (c) countUp(c);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(function (t, i) {
      if (t.getBoundingClientRect().top < innerHeight * 0.92) return;
      t.classList.add('hide');
      var sibs = t.parentElement ? Array.prototype.indexOf.call(t.parentElement.children, t) : 0;
      t.style.setProperty('--d', Math.min(sibs, 5) * 60 + 'ms');
      io.observe(t);
    });
  }

  function countUp(el) {
    var end = parseFloat(el.dataset.count);
    var pre = el.dataset.pre || '';
    var suf = el.dataset.suf || '';
    var start = performance.now();
    var dur = 1100;
    (function step(now) {
      var t = reduced ? 1 : clamp((now - start) / dur, 0, 1);
      var v = Math.round(end * (1 - Math.pow(1 - t, 3)));
      el.textContent = pre + v.toLocaleString('en-US') + suf;
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ---------- Philosophy: the sentence lights up word by word ---------- */
  var phil = d.querySelector('[data-phil]');
  if (phil) {
    var words = all('.w', phil);
    phil.classList.toggle('pin', !reduced);
    var lit = -1;
    scrubs.push({ el: phil, fn: function (r, vh) {
      var p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
      var n = Math.round(clamp(p / 0.85, 0, 1) * words.length);
      if (n === lit) return;
      lit = n;
      words.forEach(function (w, i) { w.classList.toggle('on', i < n); });
    } });
  }

  /* ---------- AI rows: the one in the middle of the screen is in focus ---------- */
  var aiRows = d.querySelector('[data-ai-rows]');
  if (aiRows && 'IntersectionObserver' in window) {
    aiRows.classList.toggle('focus', !reduced && innerWidth > 1000);
    var aio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('on', en.isIntersecting); });
    }, { rootMargin: '-38% 0px -38% 0px' });
    all('.ai-row', aiRows).forEach(function (r) { aio.observe(r); });
  }

  /* ---------- Work: cards stack, the one beneath settles back ---------- */
  var stackEl = d.querySelector('[data-stack]');
  if (stackEl) {
    var cards = all('[data-scard]', stackEl);
    stackEl.classList.toggle('live', !reduced);
    cards.forEach(function (card, i) {
      var next = cards[i + 1];
      if (!next) return;
      scrubs.push({ el: next, fn: function (r, vh) {
        var top = parseFloat(getComputedStyle(next).top) || 0;
        var p = clamp(1 - (r.top - top) / (vh * 0.8), 0, 1);
        card.style.setProperty('--s', (1 - p * 0.05).toFixed(4));
      } });
    });
  }

  /* ---------- Story: one problem, one sentence at a time ---------- */
  var story = d.querySelector('[data-story]');
  if (story) {
    var panels = all('[data-story-panel]', story);
    var btns = all('[data-story-btn]', story);
    {
      var active = 0;
      var setActive = function (i) {
        active = i;
        panels.forEach(function (p, n) { p.classList.toggle('on', n === i); });
        btns.forEach(function (b, n) { b.setAttribute('aria-pressed', String(n === i)); });
        story.style.setProperty('--n', all('.story-steps > li', panels[i]).length);
      };
      story.classList.toggle('pin', !reduced);
      d.querySelector('[data-story-pills]').hidden = reduced;
      setActive(0);
      var drawStory = function (r, vh) {
        var p = clamp(-r.top / Math.max(1, r.height - vh), 0, 0.9999);
        var panel = panels[active];
        var steps = all('.story-steps > li', panel);
        var n = steps.length;
        var idx = Math.floor(p * n);
        steps.forEach(function (s, i) { s.classList.toggle('on', i === idx); });
        all('.course-wps > li', panel).forEach(function (w, i) { w.classList.toggle('on', i <= idx); });
        panel.querySelector('.course-fill').style.transform = 'scaleX(' + clamp(p * n / (n - 1), 0, 1).toFixed(4) + ')';
        panel.classList.toggle('done', idx === n - 1);
      };
      scrubs.push({ el: story, fn: drawStory });
      btns.forEach(function (b, i) {
        b.addEventListener('click', function () {
          setActive(i);
          scrollTo(0, story.getBoundingClientRect().top + pageYOffset);
          queue();
        });
      });
    }
  }

  /* ---------- Areas: a segmented control ---------- */
  var areasEl = d.querySelector('[data-areas]');
  if (areasEl) {
    var segWrap = d.querySelector('[data-seg-wrap]');
    var tabs = all('[data-area]', segWrap);
    var thumb = segWrap.querySelector('.seg-thumb');
    var areaPanels = all('[data-area-panel]', areasEl);
    segWrap.hidden = false;
    areasEl.classList.add('live');
    var moveThumb = function (tab) {
      thumb.style.width = tab.offsetWidth + 'px';
      thumb.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
    };
    var selectArea = function (id, focus) {
      tabs.forEach(function (t) {
        var on = t.dataset.area === id;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) {
          moveThumb(t);
          var seg = t.parentElement;
          if (seg.scrollWidth > seg.clientWidth) seg.scrollLeft = t.offsetLeft - (seg.clientWidth - t.offsetWidth) / 2;
          if (focus) t.focus({ preventScroll: true });
        }
      });
      areaPanels.forEach(function (p) { p.classList.toggle('on', p.dataset.areaPanel === id); });
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectArea(t.dataset.area); });
      t.addEventListener('keydown', function (ev) {
        var k = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
        if (ev.key === 'Home') k = -i;
        if (ev.key === 'End') k = tabs.length - 1 - i;
        if (k === undefined) return;
        ev.preventDefault();
        selectArea(tabs[(i + k + tabs.length) % tabs.length].dataset.area, true);
      });
    });
    areasEl.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-area-link]');
      if (!a) return;
      ev.preventDefault();
      selectArea(a.dataset.areaLink, true);
    });
    selectArea(tabs[0].dataset.area);
    addEventListener('resize', function () {
      var cur = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
      if (cur) moveThumb(cur);
    });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () {
      var cur = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
      if (cur) moveThumb(cur);
    });
  }

  /* ---------- Course lines that draw as you read ---------- */
  all('[data-route], [data-case]').forEach(function (line) {
    var fill = line.querySelector('.route-fill, .case-fill');
    var wps = all('.wp', line);
    if (reduced) { fill.style.transform = 'scaleY(1)'; wps.forEach(function (w) { w.classList.add('reached'); }); }
    scrubs.push({ el: line, fn: function (r, vh) {
      var p = clamp((vh * 0.62 - r.top) / r.height, 0, 1);
      fill.style.transform = 'scaleY(' + p.toFixed(4) + ')';
      wps.forEach(function (w) {
        var top = w.offsetTop / r.height;
        w.classList.toggle('reached', p >= top);
      });
    } });
  });

  /* Respect preference changes without requiring a reload. */
  function updateMotion() {
    reduced = motionPreference.matches;
    [phil, story].forEach(function (el) { if (el) el.classList.toggle('pin', !reduced); });
    if (stackEl) stackEl.classList.toggle('live', !reduced);
    if (aiRows && 'IntersectionObserver' in window) aiRows.classList.toggle('focus', !reduced && innerWidth > 1000);
    if (story) {
      var pills = d.querySelector('[data-story-pills]');
      var moveFocus = reduced && pills.contains(d.activeElement);
      pills.hidden = reduced;
      if (moveFocus) {
        panels[active].tabIndex = -1;
        panels[active].focus({ preventScroll: true });
      }
    }
    if (reduced) {
      if (io) io.disconnect();
      all('.hide').forEach(function (el) { el.classList.remove('hide'); el.classList.add('in'); });
      all('[data-scard]').forEach(function (el) { el.style.removeProperty('--s'); });
      all('.route-fill, .case-fill').forEach(function (el) { el.style.transform = 'scaleY(1)'; });
      all('.wp').forEach(function (el) { el.classList.add('reached'); });
    }
    queue();
  }
  motionPreference.addEventListener('change', updateMotion);
  addEventListener('resize', function () {
    if (aiRows && 'IntersectionObserver' in window) aiRows.classList.toggle('focus', !reduced && innerWidth > 1000);
  });

  /* ---------- Menu ---------- */
  var menu = d.querySelector('.menu');
  if (menu) {
    var smallScreen = matchMedia('(max-width: 860px)');
    var menuSummary = menu.querySelector('summary');
    var menuBackground = all('main, .foot, .skip, .wordmark, .nav-wide');
    var backgroundState = [];
    var menuActive = false;
    function syncMenu() {
      if (!smallScreen.matches) menu.open = false;
      var open = menu.open;
      d.documentElement.classList.toggle('menu-open', open);
      if (open === menuActive) return;
      menuActive = open;
      if (open) {
        backgroundState = menuBackground.map(function (el) { return el.inert; });
        menuBackground.forEach(function (el) { el.inert = true; });
        if (!menu.contains(d.activeElement)) menuSummary.focus({ preventScroll: true });
      } else {
        menuBackground.forEach(function (el, i) { el.inert = backgroundState[i]; });
        if (menu.contains(d.activeElement) || !smallScreen.matches) {
          (smallScreen.matches ? menuSummary : d.querySelector('.wordmark')).focus({ preventScroll: true });
        }
      }
    }
    function closeMenu() { menu.open = false; syncMenu(); }
    menu.addEventListener('toggle', syncMenu);
    smallScreen.addEventListener('change', syncMenu);
    menu.addEventListener('click', function (ev) { if (ev.target.closest('a')) closeMenu(); });
    d.addEventListener('keydown', function (ev) {
      if (!menu.open) return;
      if (ev.key === 'Escape') { ev.preventDefault(); closeMenu(); return; }
      if (ev.key !== 'Tab') return;
      var links = all('summary, a[href]', menu);
      var first = links[0];
      var last = links[links.length - 1];
      if (ev.shiftKey && d.activeElement === first) {
        ev.preventDefault(); last.focus();
      } else if (!ev.shiftKey && d.activeElement === last) {
        ev.preventDefault(); first.focus();
      }
    });
    syncMenu();
  }

  /* ---------- Copy email ---------- */
  all('[data-copy]').forEach(function (b) {
    if (!navigator.clipboard) return;
    b.hidden = false;
    var label = b.textContent;
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(b.dataset.copy).then(function () {
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = label; }, 1800);
      }, function () { b.textContent = 'Copy failed'; });
    });
  });

  /* ---------- Career ---------- */
  var roles = all('.role');
  if (roles.length) {
    var openTarget = function () {
      var t = location.hash && d.getElementById(location.hash.slice(1));
      if (t && t.tagName === 'DETAILS') { t.open = true; t.scrollIntoView(); }
    };
    openTarget();
    addEventListener('hashchange', openTarget);
    var toggle = d.querySelector('[data-toggle-roles]');
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', function () {
        var anyOpen = roles.some(function (r) { return r.open; });
        roles.forEach(function (r) { r.open = !anyOpen; });
        toggle.textContent = anyOpen ? 'Expand all roles' : 'Collapse all roles';
      });
    }
  }

  /* ---------- Skills directory ---------- */
  var search = d.getElementById('skill-search');
  if (search) {
    var chips = all('.chip');
    var cats = all('.skill-cat');
    var countEl = d.querySelector('[data-count]');
    var empty = d.querySelector('[data-empty]');
    var clearBtn = d.querySelector('[data-clear]');
    var chipWrap = d.querySelector('[data-chips]');
    var cat = 'all';
    search.disabled = false;
    chipWrap.hidden = false;
    var apply = function (fromUser) {
      var q = search.value.trim().toLowerCase();
      var terms = q ? q.split(/\s+/) : [];
      var shown = 0;
      cats.forEach(function (section) {
        var inCat = cat === 'all' || section.dataset.category === cat;
        var n = 0;
        all('.skill', section).forEach(function (s) {
          var match = inCat && terms.every(function (w) { return s.dataset.name.indexOf(w) > -1; });
          s.hidden = !match;
          if (match) n++;
        });
        section.hidden = n === 0;
        var cn = section.querySelector('.count');
        if (cn) cn.textContent = n;
        shown += n;
      });
      countEl.textContent = shown + (shown === 1 ? ' skill' : ' skills');
      empty.hidden = shown !== 0;
      if (fromUser) {
        var url = new URL(location.href);
        if (q) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
        history.replaceState(null, '', url);
      }
    };
    search.addEventListener('input', function () { apply(true); });
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        cat = c.dataset.cat;
        chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        apply(false);
      });
    });
    clearBtn.addEventListener('click', function () {
      search.value = ''; cat = 'all';
      chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.cat === 'all')); });
      apply(true); search.focus();
    });
    var initial = new URLSearchParams(location.search).get('q');
    if (initial) { search.value = initial; apply(false); }
  }

  frame();
})();
