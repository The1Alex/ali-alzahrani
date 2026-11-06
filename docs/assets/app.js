/* Progressive enhancement only. Every piece of content is in the HTML. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Scroll reveal */
  if (!reduced && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.pcard, .traits > li, .contrib > li, .caps > li, .ai-rows > li');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (t) { t.classList.add('reveal'); io.observe(t); });
  }

  /* Close the mobile menu when a link is chosen */
  var menu = document.querySelector('.menu');
  if (menu) {
    menu.addEventListener('click', function (ev) { if (ev.target.closest('a')) menu.removeAttribute('open'); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && menu.open) { menu.removeAttribute('open'); menu.querySelector('summary').focus(); }
    });
  }

  /* Copy email */
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    if (!navigator.clipboard) return;
    b.hidden = false;
    var label = b.textContent;
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(b.dataset.copy).then(function () {
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = label; }, 1800);
      }, function () { b.textContent = 'Copy failed. Please select the address above.'; });
    });
  });

  /* Solution Map */
  var stage = document.querySelector('[data-map]');
  if (stage) initMap(stage);

  function initMap(stage) {
    var root = document.getElementById('solution-map');
    root.classList.add('map-live');
    var hubs = Array.prototype.slice.call(root.querySelectorAll('.hub'));
    var panels = root.querySelectorAll('[data-panel]');
    var tracePanels = root.querySelectorAll('[data-trace-panel]');
    var traceBtns = root.querySelectorAll('[data-trace]');
    var lines = root.querySelectorAll('.map-lines line');
    var traceLine = root.querySelector('.map-trace');
    var timers = [];
    var pos = {};
    hubs.forEach(function (h) {
      pos[h.dataset.hub] = [parseFloat(h.style.getPropertyValue('--x')) * 10, parseFloat(h.style.getPropertyValue('--y')) * 6];
    });

    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function clearState() {
      clearTimers();
      panels.forEach(function (p) { p.classList.remove('on'); });
      tracePanels.forEach(function (p) { p.classList.remove('on'); });
      hubs.forEach(function (h) { h.classList.remove('on', 'near', 'lit'); h.removeAttribute('aria-current'); });
      lines.forEach(function (l) { l.classList.remove('on'); });
      traceBtns.forEach(function (b) { b.removeAttribute('aria-current'); });
      traceLine.classList.remove('run');
      traceLine.setAttribute('points', '');
    }

    function selectHub(id, opts) {
      clearState();
      var panel = root.querySelector('[data-panel="' + id + '"]');
      if (!panel) return;
      panel.classList.add('on');
      var near = {};
      lines.forEach(function (l) {
        if (l.dataset.a === id || l.dataset.b === id) {
          l.classList.add('on');
          near[l.dataset.a === id ? l.dataset.b : l.dataset.a] = true;
        }
      });
      hubs.forEach(function (h) {
        if (h.dataset.hub === id) { h.classList.add('on'); h.setAttribute('aria-current', 'true'); }
        else if (near[h.dataset.hub]) h.classList.add('near');
      });
      if (opts && opts.history) history.replaceState(null, '', '#hub-' + id);
      if (opts && opts.reveal) reveal(panel);
    }

    function selectTrace(id, opts) {
      clearState();
      var panel = root.querySelector('[data-trace-panel="' + id + '"]');
      if (!panel) return;
      panel.classList.add('on');
      root.querySelector('[data-trace="' + id + '"]').setAttribute('aria-current', 'true');
      var path = panel.dataset.path.split(',');
      traceLine.setAttribute('points', path.map(function (p) { return pos[p].join(','); }).join(' '));
      void traceLine.getBoundingClientRect();
      traceLine.classList.add('run');
      var steps = panel.querySelectorAll('.trace-steps li');
      steps.forEach(function (s) { s.classList.remove('now'); });
      function light(i) {
        steps.forEach(function (s, n) { s.classList.toggle('now', n === i); });
        hubs.forEach(function (h) {
          h.classList.toggle('lit', path.slice(0, i + 1).indexOf(h.dataset.hub) > -1);
          h.classList.toggle('on', h.dataset.hub === path[i]);
        });
      }
      if (reduced) {
        hubs.forEach(function (h) { h.classList.toggle('lit', path.indexOf(h.dataset.hub) > -1); });
      } else {
        path.forEach(function (_, i) { timers.push(setTimeout(function () { light(i); }, i * 1500)); });
      }
      if (opts && opts.history) history.replaceState(null, '', '#trace-' + id);
      if (opts && opts.reveal) reveal(panel);
    }

    /* On narrow screens the panel sits below the map, so bring it into view */
    function reveal(panel) {
      if (window.innerWidth >= 960) return;
      panel.scrollIntoView({ block: 'nearest' });
    }

    hubs.forEach(function (h, i) {
      h.addEventListener('click', function (ev) {
        ev.preventDefault();
        selectHub(h.dataset.hub, { history: true, reveal: true });
      });
      h.addEventListener('keydown', function (ev) {
        var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
        if (!d) return;
        ev.preventDefault();
        var next = hubs[(i + d + hubs.length) % hubs.length];
        next.focus();
        selectHub(next.dataset.hub, { history: true });
      });
    });

    root.addEventListener('click', function (ev) {
      var conn = ev.target.closest('[data-hub-link]');
      if (conn) {
        ev.preventDefault();
        selectHub(conn.dataset.hubLink, { history: true });
        var target = root.querySelector('.hub[data-hub="' + conn.dataset.hubLink + '"]');
        if (target) target.focus({ preventScroll: true });
        return;
      }
      var t = ev.target.closest('[data-trace]');
      if (t) {
        ev.preventDefault();
        selectTrace(t.dataset.trace, { history: true, reveal: true });
      }
    });

    function fromHash() {
      var h = location.hash;
      if (h.indexOf('#hub-') === 0) { selectHub(h.slice(5)); return true; }
      if (h.indexOf('#trace-') === 0) { selectTrace(h.slice(7)); return true; }
      return false;
    }
    if (!fromHash()) selectHub('outcomes');
    window.addEventListener('hashchange', fromHash);
  }

  /* Career: open the role that a link points to, and expand or collapse all */
  var roles = document.querySelectorAll('.role');
  if (roles.length) {
    var openTarget = function () {
      var t = location.hash && document.getElementById(location.hash.slice(1));
      if (t && t.tagName === 'DETAILS') { t.open = true; t.scrollIntoView(); }
    };
    openTarget();
    window.addEventListener('hashchange', openTarget);
    var toggle = document.querySelector('[data-toggle-roles]');
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', function () {
        var anyOpen = Array.prototype.some.call(roles, function (r) { return r.open; });
        roles.forEach(function (r) { r.open = !anyOpen; });
        toggle.textContent = anyOpen ? 'Expand all roles' : 'Collapse all roles';
      });
    }
  }

  /* Skills directory */
  var search = document.getElementById('skill-search');
  if (search) {
    var chips = document.querySelectorAll('.chip');
    var cats = document.querySelectorAll('.skill-cat');
    var countEl = document.querySelector('[data-count]');
    var empty = document.querySelector('[data-empty]');
    var clearBtn = document.querySelector('[data-clear]');
    var chipWrap = document.querySelector('[data-chips]');
    var cat = 'all';
    search.disabled = false;
    chipWrap.hidden = false;

    var apply = function (fromUser) {
      var q = search.value.trim().toLowerCase();
      var words = q ? q.split(/\s+/) : [];
      var shown = 0;
      cats.forEach(function (section) {
        var inCat = cat === 'all' || section.dataset.category === cat;
        var n = 0;
        section.querySelectorAll('.skill').forEach(function (s) {
          var hay = s.dataset.name;
          var match = inCat && words.every(function (w) { return hay.indexOf(w) > -1; });
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
})();
