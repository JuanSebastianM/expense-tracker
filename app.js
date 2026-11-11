/* Gastos: state, data loading and rendering. Every string that comes from the spreadsheet is set with textContent.
   On-screen copy is Spanish (Colombia). */
(function () {
  'use strict';
  var G = window.Gastos;
  var STORAGE_ACCESS = 'gastos:access';
  var STORAGE_CACHE = 'gastos:cache';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var state = {
    mode: 'setup',          // setup | live | demo
    access: null,           // { u, k } from the access code
    data: null,             // internal data (see G.fromApi / G.demoData)
    savedAt: 0,             // when the data arrived (ms)
    offline: false,
    error: null,            // { type, text } when there is nothing to show
    loading: false,
    cycle: null,
    view: 'summary',
    showTable: false,
    filter: 'all',
    expanded: {},
    activeDay: -1
  };

  // ---------- DOM helpers ----------
  function byId(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function today() { return G.localDate(new Date()); }

  /** Status glyph: check, exclamation, cross or "i". Color never stands alone: there is always text beside it. */
  function glyph(tone) {
    var s = svgEl('svg', { viewBox: '0 0 20 20', 'class': 'glyph ' + tone, 'aria-hidden': 'true' });
    s.appendChild(svgEl('circle', { cx: 10, cy: 10, r: 10, 'class': 'bg' }));
    if (tone === 'good') s.appendChild(svgEl('path', { d: 'M5.8 10.4l2.9 2.9 5.5-6', 'class': 'mark' }));
    else if (tone === 'bad') s.appendChild(svgEl('path', { d: 'M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4', 'class': 'mark' }));
    else if (tone === 'warn') {
      s.appendChild(svgEl('path', { d: 'M10 5.2v6', 'class': 'mark' }));
      s.appendChild(svgEl('circle', { cx: 10, cy: 14.6, r: 1.3, 'class': 'dot' }));
    } else {
      s.appendChild(svgEl('circle', { cx: 10, cy: 5.9, r: 1.3, 'class': 'dot' }));
      s.appendChild(svgEl('path', { d: 'M10 9.2v5.6', 'class': 'mark' }));
    }
    return s;
  }
  // Screen-reader prefix for each tone (Spanish, read aloud).
  var TONE_LABEL = { good: 'Bien', warn: 'Atención', bad: 'Se pasó', info: 'Dato' };

  // ---------- Storage (always in try/catch: private Safari can throw) ----------
  function load(key) {
    try { var t = localStorage.getItem(key); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
  /** The cache keeps the raw script response; it goes through the same adapter when read. */
  function loadCache() {
    var c = load(STORAGE_CACHE);
    if (!c || !G.isValidResponse(c.response)) return null;
    return { data: G.fromApi(c.response), savedAt: c.savedAt || 0 };
  }

  // ---------- Fetching the data ----------
  function failure(type, detail) { var e = new Error(type); e.type = type; e.detail = detail; return e; }
  /** Resolves with the raw script response (wire format). */
  function fetchData(access) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    // No Content-Type header: the browser sends text/plain and there is no CORS preflight.
    return fetch(access.u, {
      method: 'POST',
      body: G.apiRequestBody(access.k),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw failure('http', res.status);
      return res.text();
    }).then(function (txt) {
      var r;
      try { r = JSON.parse(txt); } catch (e) { throw failure('format'); }
      if (r && r.ok === false) throw failure(G.isKeyError(r) ? 'key' : 'server', r.error);
      if (!G.isValidResponse(r)) throw failure('format');
      return r;
    }, function (e) {
      if (e && e.type) throw e;
      throw failure('network', e && e.message);
    }).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  function failureText(e) {
    switch (e && e.type) {
      case 'key': return 'Ese código ya no sirve. Pide uno nuevo.';
      case 'network': return 'No hay conexión o la hoja no respondió. Revisa el internet e inténtalo otra vez.';
      case 'http': return 'La hoja respondió con un error (código ' + e.detail + '). Inténtalo otra vez en un rato.';
      case 'server': return 'La hoja respondió con un error: ' + e.detail;
      default: return 'La hoja respondió algo que la app no entiende. Revisa que la app web esté implementada para «Cualquier persona».';
    }
  }

  // ---------- Start-up ----------
  function start() {
    state.access = load(STORAGE_ACCESS);
    if (state.access && !G.decodeAccessCode(encodeAccess(state.access))) state.access = null;
    var cache = state.access ? loadCache() : null;
    if (cache) { state.data = cache.data; state.savedAt = cache.savedAt; }

    bindEvents();
    if (/^#demo\b/.test(location.hash)) { enterDemo(); return; }
    if (state.access) {
      state.mode = 'live';
      render();
      refresh();
    } else {
      showSetup();
    }
  }
  function encodeAccess(a) {
    var b = new TextEncoder().encode(JSON.stringify({ u: a.u, k: a.k }));
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function refresh() {
    if (state.mode === 'demo') { state.data = G.demoData(today()); state.savedAt = Date.now(); render(); return Promise.resolve(); }
    if (!state.access || state.loading) return Promise.resolve();
    state.loading = true;
    renderUpdated();
    var access = state.access;
    return fetchData(access).then(function (response) {
      if (state.access !== access || state.mode !== 'live') return;
      state.data = G.fromApi(response); state.savedAt = Date.now(); state.offline = false; state.error = null;
      save(STORAGE_CACHE, { response: response, savedAt: state.savedAt });
    }, function (e) {
      if (state.access !== access || state.mode !== 'live') return;
      if (e.type === 'key') {
        remove(STORAGE_ACCESS); remove(STORAGE_CACHE);
        state.access = null; state.data = null;
        showSetup(failureText(e));
        return;
      }
      if (state.data) { state.offline = true; state.error = null; }
      else state.error = { type: e.type, text: failureText(e) };
    }).then(function () {
      state.loading = false;
      if (state.mode === 'live') render();
    });
  }

  // ---------- Setup (access code) ----------
  function showSetup(message) {
    state.mode = 'setup';
    byId('main-app').hidden = true;
    byId('setup').hidden = false;
    document.title = 'Gastos';
    setupMessage(message || '');
    var b = byId('enter-button'); b.disabled = false; b.textContent = 'Entrar';
  }
  function setupMessage(text) {
    var m = byId('code-error');
    clear(m);
    m.hidden = !text;
    if (text) { m.appendChild(glyph('bad')); m.appendChild(el('p', null, text)); }
  }
  function submitCode(ev) {
    ev.preventDefault();
    var access = G.decodeAccessCode(byId('access-code').value);
    if (!access) {
      setupMessage('Ese código no se ve completo. Cópialo otra vez desde la pestaña App de la hoja.');
      byId('access-code').focus();
      return;
    }
    var b = byId('enter-button');
    b.disabled = true; b.textContent = 'Revisando el código…';
    setupMessage('');
    fetchData(access).then(function (response) {
      if (state.mode !== 'setup') return;
      state.access = access; state.data = G.fromApi(response); state.savedAt = Date.now(); state.offline = false; state.error = null;
      save(STORAGE_ACCESS, access);
      save(STORAGE_CACHE, { response: response, savedAt: state.savedAt });
      byId('access-code').value = '';
      state.mode = 'live'; state.cycle = null; state.view = 'summary';
      render();
    }, function (e) {
      b.disabled = false; b.textContent = 'Entrar';
      setupMessage(failureText(e));
    });
  }

  // ---------- Demo ----------
  function enterDemo() {
    state.mode = 'demo'; state.cycle = null; state.view = 'summary'; state.expanded = {}; state.filter = 'all';
    state.data = G.demoData(today()); state.savedAt = Date.now(); state.offline = false; state.error = null;
    if (!/^#demo\b/.test(location.hash)) { try { history.replaceState(null, '', '#demo'); } catch (e) { /* ignore */ } }
    render();
  }
  function leaveDemo() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    state.cycle = null; state.expanded = {}; state.view = 'summary';
    var cache = state.access ? loadCache() : null;
    state.data = cache ? cache.data : null;
    state.savedAt = cache ? cache.savedAt : 0;
    if (state.access) { state.mode = 'live'; render(); refresh(); } else { state.data = null; showSetup(); }
  }

  // ---------- Rendering ----------
  function cutoffDay() { return (state.data && state.data.config && Number(state.data.config.cutoffDay)) || 25; }
  function currentCycle() { return G.cycle(today(), cutoffDay()); }
  function firstDate() {
    var f = null;
    ((state.data && state.data.transactions) || []).forEach(function (t) { if (t.date && (!f || t.date < f)) f = t.date; });
    return f;
  }

  function render() {
    byId('setup').hidden = true;
    byId('main-app').hidden = false;
    var current = currentCycle();
    if (!state.cycle || state.cycle.start > current.start) state.cycle = current;
    var isCurrent = state.cycle.start === current.start;
    var first = firstDate();

    byId('cycle-label').textContent = state.data ? state.cycle.label : 'Gastos';
    byId('prev-cycle').disabled = !state.data || !first || state.cycle.start <= first;
    byId('next-cycle').disabled = !state.data || isCurrent;
    byId('prev-cycle').setAttribute('aria-label', 'Ciclo anterior');
    byId('next-cycle').setAttribute('aria-label', isCurrent ? 'Ciclo siguiente (este es el ciclo actual)' : 'Ciclo siguiente');
    document.title = state.data ? 'Gastos · ' + state.cycle.label : 'Gastos';

    renderNotices();
    renderUpdated();

    var s = state.data ? G.summary(state.data, state.cycle, today()) : null;
    renderHeadline(s);
    renderSummary(s);
    renderCategories(s);
    renderTransactions(s);
    switchView(state.view, false);
  }

  function renderUpdated() {
    var t;
    if (state.mode === 'demo') t = '';
    else if (state.loading) t = 'Actualizando…';
    else if (!state.savedAt) t = '';
    else {
      var min = Math.floor((Date.now() - state.savedAt) / 60000);
      if (min < 1) t = 'Actualizado hace un momento';
      else if (min < 60) t = 'Actualizado hace ' + min + ' min';
      else if (min < 24 * 60) t = 'Actualizado hace ' + Math.floor(min / 60) + ' h';
      else t = 'Actualizado el ' + G.shortDay(G.localDate(new Date(state.savedAt)));
    }
    byId('updated').textContent = t;
    var b = byId('refresh-button');
    b.disabled = state.loading;
    b.setAttribute('aria-busy', state.loading ? 'true' : 'false');
  }

  function dayAndTime(ms) {
    var d = new Date(ms);
    return G.shortDay(G.localDate(d)) + ', ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function renderNotices() {
    var c = byId('notices');
    clear(c);
    function notice(tone, text, buttonText, action) {
      var n = el('div', 'notice');
      var w = el('div', 'wrap');
      w.appendChild(glyph(tone));
      w.appendChild(el('p', null, text));
      if (buttonText) {
        var b = el('button', 'text-button', buttonText);
        b.type = 'button';
        b.addEventListener('click', action);
        w.appendChild(b);
      }
      n.appendChild(w);
      c.appendChild(n);
    }
    if (state.mode === 'demo') notice('info', 'Estás viendo datos de ejemplo.', 'Salir de la demo', leaveDemo);
    else if (state.offline && state.data) notice('warn', 'Sin conexión. Datos de ' + dayAndTime(state.savedAt) + '.', 'Reintentar', function () { refresh(); });
  }

  function renderHeadline(s) {
    var h = byId('headline');
    clear(h);
    var sentences;
    if (s) sentences = G.headline(s);
    else if (state.error) sentences = ['No se pudieron traer los gastos.'];
    else sentences = ['Trayendo los gastos…'];
    sentences.forEach(function (f) { h.appendChild(el('p', null, f)); });
  }

  // ----- Summary view -----
  function renderSummary(s) {
    var v = byId('view-summary');
    clear(v);
    if (!s) { v.appendChild(noDataState()); return; }

    // Meter
    var block = el('section', 'block');
    block.setAttribute('aria-label', 'Gastado frente al presupuesto');
    var m = el('div', 'meter');
    var pct = s.budget > 0 ? Math.round(s.total / s.budget * 100) : 0;
    m.appendChild(track(s.total, s.budget, pct + '% del presupuesto gastado'));
    m.appendChild(el('span', 'pct', pct + '%'));
    var line = G.formatPesos(s.total) + ' de ' + G.formatPesos(s.budget);
    if (s.isCurrent) line += ' · día ' + (s.daysElapsed + 1) + ' de ' + s.cycle.days;
    else if (s.isPast) line += ' · ciclo cerrado';
    m.appendChild(el('p', 'secondary figure', line));
    block.appendChild(m);
    v.appendChild(block);

    // Day by day
    var daySection = el('section');
    var head = el('div', 'section-head');
    var h = el('h2', null, 'Día a día'); h.id = 'day-title';
    head.appendChild(h);
    var toggle = el('button', 'text-button', state.showTable ? 'Ver como gráfico' : 'Ver como tabla');
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', state.showTable ? 'true' : 'false');
    toggle.addEventListener('click', function () {
      state.showTable = !state.showTable; state.activeDay = -1; renderSummary(s);
      var b = document.querySelector('#view-summary .section-head .text-button'); if (b) b.focus();
    });
    head.appendChild(toggle);
    daySection.appendChild(head);
    if (state.showTable) daySection.appendChild(dayTable(s));
    else {
      var chart = el('div', 'chart');
      chart.id = 'chart';
      daySection.appendChild(chart);
    }
    v.appendChild(daySection);

    // What to know
    var list = G.insights(s);
    var sec = el('section');
    sec.appendChild(el('h2', null, 'Lo que hay que saber'));
    var ul = el('ul', 'insights');
    if (!list.length) {
      var li0 = el('li');
      li0.appendChild(glyph('info'));
      li0.appendChild(el('p', null, s.spendingCount ? 'No hay nada más que contar por ahora.' : 'Cuando lleguen los primeros gastos, aquí aparecerá lo importante.'));
      ul.appendChild(li0);
    }
    list.forEach(function (f) {
      var li = el('li');
      li.appendChild(glyph(f.tone));
      var p = el('p');
      p.appendChild(el('span', 'sr', TONE_LABEL[f.tone] + ': '));
      p.appendChild(document.createTextNode(f.text));
      li.appendChild(p);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    v.appendChild(sec);

    if (!state.showTable) {
      byId('chart')._summary = s;
      drawChart();
    }
  }

  function track(value, limit, label) {
    var t = el('div', 'track');
    t.setAttribute('role', 'img');
    t.setAttribute('aria-label', label);
    var scale = Math.max(value, limit) || 1;
    var f = el('div', 'fill');
    var width = Math.max(0, Math.min(1, value / scale)) * 100;
    if (value > 0 && width < 1.5) width = 1.5;
    f.style.width = width + '%';
    t.appendChild(f);
    if (value > limit && limit > 0) {
      var tick = el('div', 'limit-tick');
      tick.style.left = (limit / scale * 100) + '%';
      t.appendChild(tick);
    }
    return t;
  }

  function dayTable(s) {
    var t = el('table', 'day-table');
    t.appendChild(el('caption', 'sr', 'Gasto por día del ciclo ' + s.cycle.label));
    var thead = el('thead'); var tr = el('tr');
    var a = el('th', null, 'Día'); a.scope = 'col';
    var b = el('th', null, 'Gastado'); b.scope = 'col';
    tr.appendChild(a); tr.appendChild(b); thead.appendChild(tr); t.appendChild(thead);
    var tbody = el('tbody');
    s.series.filter(function (d) { return !d.future; }).slice().reverse().forEach(function (d) {
      var row = el('tr', d.total ? '' : 'zero');
      if (d.date === s.today) row.className += ' is-today';
      row.appendChild(el('td', null, G.capitalize(G.relativeDay(d.date, s.today))));
      row.appendChild(el('td', null, G.formatPesos(d.total)));
      tbody.appendChild(row);
    });
    if (!tbody.firstChild) {
      var r0 = el('tr'); var c0 = el('td', null, 'Este ciclo todavía no empieza.'); c0.colSpan = 2; r0.appendChild(c0); tbody.appendChild(r0);
    }
    t.appendChild(tbody);
    return t;
  }

  // ----- Column chart, drawn by hand -----
  function drawChart() {
    var container = byId('chart');
    if (!container || !container._summary) return;
    var s = container._summary;
    var width = Math.floor(container.clientWidth);
    if (width < 50) return;
    clear(container);
    var TOP = 26, PLOT_HEIGHT = 140, AXIS_BAND = 30;
    var base = TOP + PLOT_HEIGHT;
    var n = s.series.length;
    var slot = width / n;
    var bw = Math.max(2, Math.min(24, slot - 2));
    var max = 0, iMax = -1, iToday = -1;
    s.series.forEach(function (d, i) {
      if (d.total > max) { max = d.total; iMax = i; }
      if (d.date === s.today) iToday = i;
    });

    var svg = svgEl('svg', { width: width, height: base + AXIS_BAND, viewBox: '0 0 ' + width + ' ' + (base + AXIS_BAND), role: 'group',
      'aria-label': 'Gasto por día del ciclo ' + s.cycle.label + '. Usa las flechas para recorrer los días.' });
    var pastDays = [];

    s.series.forEach(function (d, i) {
      var x0 = i * slot;
      var g = svgEl('g', { 'class': 'day' });
      g.appendChild(svgEl('rect', { x: x0, y: 0, width: slot, height: base, 'class': 'day-bg' }));
      if (d.total > 0) {
        var h = Math.max(2, d.total / max * PLOT_HEIGHT);
        var x = x0 + (slot - bw) / 2;
        var r = Math.min(4, bw / 2, h);
        var y = base - h;
        g.appendChild(svgEl('path', { 'class': 'column',
          d: 'M' + x + ',' + base + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
             'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + 'V' + base + 'Z' }));
      }
      svg.appendChild(g);
      if (!d.future) pastDays.push({ i: i, g: g, d: d });
    });

    // Axis: one hairline, plus a tick for today
    svg.appendChild(svgEl('line', { x1: 0, x2: width, y1: base + 0.5, y2: base + 0.5, 'class': 'axis' }));
    if (iToday >= 0) {
      var xt = Math.round((iToday + 0.5) * slot) + 0.5;
      svg.appendChild(svgEl('line', { x1: xt, x2: xt, y1: base, y2: base + 5, 'class': 'today-tick' }));
    }

    // Axis labels: first day, today and last day (without overlapping)
    var CHAR_W = 7.2;
    var labels = [];
    function addLabel(text, x, anchor, className, priority) {
      var w = text.length * CHAR_W;
      var left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      labels.push({ text: text, x: x, anchor: anchor, className: className, a: left, b: left + w, p: priority });
    }
    if (iToday >= 0) {
      var xc = (iToday + 0.5) * slot, wt = 3 * CHAR_W;
      xc = Math.max(wt / 2, Math.min(width - wt / 2, xc));
      addLabel('hoy', xc, 'middle', 'today', 0);
    }
    addLabel(G.shortDate(s.series[0].date), 0, 'start', '', 1);
    addLabel(G.shortDate(s.series[n - 1].date), width, 'end', '', 1);
    var placed = [];
    labels.sort(function (a, b) { return a.p - b.p; }).forEach(function (l) {
      var overlaps = placed.some(function (o) { return l.a < o.b + 8 && o.a < l.b + 8; });
      if (!overlaps) placed.push(l);
    });
    placed.forEach(function (l) {
      var t = svgEl('text', { x: l.x, y: base + 22, 'text-anchor': l.anchor, 'class': l.className });
      t.textContent = l.text;
      svg.appendChild(t);
    });

    // Value of the highest column, on its cap
    if (iMax >= 0) {
      var tv = G.formatPesos(max);
      var wv = tv.length * 7.6;
      var xv = Math.max(wv / 2, Math.min(width - wv / 2, (iMax + 0.5) * slot));
      var tx = svgEl('text', { x: xv, y: TOP - 8, 'text-anchor': 'middle', 'class': 'value' });
      tx.id = 'max-value';
      tx.textContent = tv;
      svg.appendChild(tx);
    }

    // Hit targets: the full height of the day, wider than the column
    var hits = [];
    pastDays.forEach(function (p, k) {
      var hit = svgEl('rect', { x: p.i * slot, y: 0, width: slot, height: base + AXIS_BAND, 'class': 'hit',
        role: 'img', tabindex: -1,
        'aria-label': G.shortDay(p.d.date) + ': ' + G.formatPesos(p.d.total) + (p.d.transactions.length ? ', ' + p.d.transactions.length + (p.d.transactions.length === 1 ? ' movimiento' : ' movimientos') : '') });
      hits.push(hit);
      svg.appendChild(hit);
      hit.addEventListener('pointerenter', function (ev) { if (ev.pointerType === 'mouse') activate(k); });
      hit.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') deactivate(); });
      hit.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType !== 'mouse') { ev.stopPropagation(); if (state.activeDay === k) deactivate(); else activate(k); }
      });
      hit.addEventListener('focus', function () { activate(k); });
      hit.addEventListener('blur', function () { deactivate(); });
      hit.addEventListener('keydown', function (ev) {
        var nk = k;
        if (ev.key === 'ArrowRight') nk = Math.min(hits.length - 1, k + 1);
        else if (ev.key === 'ArrowLeft') nk = Math.max(0, k - 1);
        else if (ev.key === 'Home') nk = 0;
        else if (ev.key === 'End') nk = hits.length - 1;
        else if (ev.key === 'Escape') { deactivate(); return; }
        else return;
        ev.preventDefault();
        hits[k].setAttribute('tabindex', '-1');
        hits[nk].setAttribute('tabindex', '0');
        hits[nk].focus();
      });
    });
    // A single tab stop: today (or the last day with data)
    if (hits.length) hits[hits.length - 1].setAttribute('tabindex', '0');

    container.appendChild(svg);
    if (max === 0) container.appendChild(el('p', 'chart-empty', s.isCurrent || s.isPast ? 'Sin gastos en este ciclo todavía.' : 'Este ciclo todavía no empieza.'));

    var tip = el('div', 'tooltip');
    tip.setAttribute('role', 'tooltip');
    tip.id = 'day-tooltip';
    tip.hidden = true;
    container.appendChild(tip);

    function activate(k) {
      deactivate();
      var p = pastDays[k];
      if (!p) return;
      state.activeDay = k;
      p.g.setAttribute('class', 'day active');
      clear(tip);
      tip.appendChild(el('div', 'tt-value', G.formatPesos(p.d.total)));
      tip.appendChild(el('div', 'tt-date', G.capitalize(G.relativeDay(p.d.date, s.today)) + (p.d.date === s.today ? ', ' + G.shortDay(p.d.date) : '')));
      if (p.d.transactions.length) {
        var ul = el('ul');
        p.d.transactions.slice(0, 3).forEach(function (t) {
          var li = el('li');
          li.appendChild(el('span', null, G.cleanMerchant(t.merchant) || t.category));
          li.appendChild(el('span', null, G.formatPesos(t.amount)));
          ul.appendChild(li);
        });
        tip.appendChild(ul);
        var rest = p.d.transactions.length - 3;
        if (rest > 0) tip.appendChild(el('span', 'tt-more', 'y ' + rest + ' más'));
      } else {
        tip.appendChild(el('span', 'tt-more', 'Sin gastos este día'));
      }
      tip.hidden = false;
      container.classList.add('has-tooltip');
      var w = container.clientWidth;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var cx = (p.i + 0.5) * slot;
      var x = Math.max(0, Math.min(w - tw, cx - tw / 2));
      var columnTop = p.d.total > 0 ? base - Math.max(2, p.d.total / max * PLOT_HEIGHT) : base;
      var y = columnTop - th - 10;
      if (y < -th + 20) y = 4;
      tip.style.left = x + 'px';
      tip.style.top = Math.max(-th + 24, y) + 'px';
      hits[k].setAttribute('aria-describedby', 'day-tooltip');
    }
    function deactivate() {
      if (state.activeDay >= 0 && pastDays[state.activeDay]) {
        pastDays[state.activeDay].g.setAttribute('class', 'day');
        hits[state.activeDay].removeAttribute('aria-describedby');
      }
      state.activeDay = -1;
      tip.hidden = true;
      container.classList.remove('has-tooltip');
    }
    container._deactivate = deactivate;
  }

  // ----- Categories view -----
  function lineStatus(l) {
    if (l.group === 'fixed' && l.paid && l.status !== 'over') return { tone: 'good', text: 'Pagado' };
    if (l.status === 'over') return { tone: 'bad', text: 'Se pasó por ' + G.formatPesos(l.spent - l.amount) };
    if (l.status === 'no-payments') return { tone: 'info', text: l.group === 'fixed' ? 'Sin pagos todavía' : 'Sin gastos todavía · quedan ' + G.formatPesos(l.amount) };
    if (l.status === 'close') return { tone: 'warn', text: 'Quedan ' + G.formatPesos(l.remaining) + ' · va en ' + l.pct + '%' };
    return { tone: 'info', text: 'Quedan ' + G.formatPesos(l.remaining) };
  }

  function renderCategories(s) {
    var v = byId('view-categories');
    clear(v);
    if (!s) { v.appendChild(noDataState()); return; }
    if (!s.spendingCount) {
      var e = el('div', 'state');
      e.appendChild(el('p', null, 'Aún no hay gastos en este ciclo. Este es el presupuesto con el que arranca.'));
      v.appendChild(e);
    }
    var outings = s.lines.filter(function (l) { return l.group === 'outings'; });
    var fixed = s.lines.filter(function (l) { return l.group === 'fixed'; });
    if (outings.length) v.appendChild(categoryGroup('Salidas y gustos', 'outings', outings, s));
    if (fixed.length) v.appendChild(categoryGroup('Gastos fijos', 'fixed', fixed, s));
    var others = s.unbudgeted.map(function (u) {
      return { id: 'unbudgeted:' + u.name, name: u.name, spent: u.spent, transactions: u.transactions, unbudgeted: true };
    });
    if (s.uncategorized.count) {
      others.push({ id: 'uncategorized', name: G.CATEGORY_UNCATEGORIZED, spent: s.uncategorized.total, transactions: s.uncategorized.transactions, unbudgeted: true, uncategorized: true });
    }
    if (others.length) v.appendChild(categoryGroup('Sin presupuesto', 'other', others, s));
    if (!s.lines.length && !others.length) {
      var e2 = el('div', 'state');
      e2.appendChild(el('p', null, 'La hoja no tiene líneas de presupuesto todavía. Cuando las tenga, aparecerán aquí.'));
      v.appendChild(e2);
    }
  }

  function categoryGroup(title, id, rows, s) {
    var sec = el('section', 'group');
    var h = el('h2', null, title);
    h.id = 'group-' + id;
    sec.appendChild(h);
    if (id === 'outings' && s.outings.budget > 0) {
      sec.appendChild(el('p', 'secondary figure group-note', G.formatPesos(s.outings.spent) + ' de ' + G.formatPesos(s.outings.budget) +
        (s.outings.remaining >= 0 ? ' · quedan ' + G.formatPesos(s.outings.remaining) : ' · se pasó por ' + G.formatPesos(-s.outings.remaining))));
    } else if (id === 'fixed') {
      var paidCount = rows.filter(function (l) { return l.paid; }).length;
      sec.appendChild(el('p', 'secondary group-note', paidCount + ' de ' + rows.length + ' pagados'));
    } else if (id === 'other') {
      sec.appendChild(el('p', 'secondary group-note', 'Cuentan en el total, pero no tienen una línea en el presupuesto.'));
    }
    var ul = el('ul', 'rows');
    ul.setAttribute('aria-labelledby', h.id);
    rows.forEach(function (l, i) {
      var key = l.id || (id + ':' + l.name);
      var li = el('li', 'row');
      var b = el('button', 'row-button');
      b.type = 'button';
      var isOpen = !!state.expanded[key];
      b.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      var panelId = 'tx-' + id + '-' + i;
      b.setAttribute('aria-controls', panelId);

      var head = el('span', 'row-head');
      var name = el('span', 'row-name');
      var short = l.shortName || l.name;
      name.appendChild(document.createTextNode(short));
      var detail = (l.name || '').slice(short.length).trim();
      if (detail) { name.appendChild(document.createTextNode(' ')); name.appendChild(el('span', 'detail', detail)); }
      head.appendChild(name);
      var figure = el('span', 'row-figure');
      figure.appendChild(document.createTextNode(G.formatPesos(l.spent)));
      if (!l.unbudgeted) figure.appendChild(el('span', 'of', ' de ' + G.formatPesos(l.amount)));
      head.appendChild(figure);
      b.appendChild(head);

      if (!l.unbudgeted) b.appendChild(track(l.spent, l.amount, l.pct + '% de ' + G.formatPesos(l.amount)));

      var statusRow = el('span', 'row-status');
      var info = l.unbudgeted
        ? { tone: l.uncategorized ? 'warn' : 'info', text: l.transactions.length + (l.transactions.length === 1 ? ' movimiento' : ' movimientos') + (l.uncategorized ? ' por clasificar' : '') }
        : lineStatus(l);
      statusRow.appendChild(glyph(info.tone));
      statusRow.appendChild(el('span', null, info.text));
      var chevron = svgEl('svg', { viewBox: '0 0 20 20', 'class': 'chevron', 'aria-hidden': 'true' });
      chevron.appendChild(svgEl('path', { d: 'M5.5 8l4.5 4.5L14.5 8', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      statusRow.appendChild(chevron);
      b.appendChild(statusRow);
      li.appendChild(b);

      var panel = el('div', 'row-transactions');
      panel.id = panelId;
      panel.hidden = !isOpen;
      if (isOpen) fillPanel(panel, l.transactions, s);
      b.addEventListener('click', function () {
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        state.expanded[key] = open;
        if (open) { clear(panel); fillPanel(panel, l.transactions, s); }
        panel.hidden = !open;
      });
      li.appendChild(panel);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }
  function fillPanel(panel, transactions, s) {
    if (!transactions.length) { panel.appendChild(el('p', 'secondary empty', 'Sin movimientos en este ciclo.')); return; }
    var ul = el('ul');
    transactions.forEach(function (t) { ul.appendChild(transactionRow(t, s, true)); });
    panel.appendChild(ul);
  }

  // ----- Transactions view -----
  function transactionRow(t, s, withDate) {
    var counts = G.isSpending(t);
    var li = el('li', 'tx' + (counts ? '' : ' excluded'));
    var line1 = el('div', 'tx-line1');
    line1.appendChild(el('span', 'tx-merchant', G.cleanMerchant(t.merchant) || '(sin nombre)'));
    line1.appendChild(el('span', 'tx-amount', G.formatPesos(t.amount)));
    li.appendChild(line1);
    var line2 = el('div', 'tx-line2');
    line2.appendChild(el('span', 'chip', t.category));
    if (!counts) line2.appendChild(el('span', 'not-counted', 'no cuenta'));
    var meta = [];
    if (withDate) meta.push(G.relativeDay(t.date, s.today));
    if (t.time) meta.push(t.time);
    if (t.product) meta.push(t.product);
    if (meta.length) line2.appendChild(el('span', 'tx-meta', meta.join(' · ')));
    li.appendChild(line2);
    return li;
  }

  function renderTransactions(s) {
    var v = byId('view-transactions');
    clear(v);
    if (!s) { v.appendChild(noDataState()); return; }
    var sec = el('section');
    var filters = el('div', 'filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filtrar movimientos');
    [['all', 'Todos'], ['uncategorized', 'Sin categoría' + (s.uncategorized.count ? ' (' + s.uncategorized.count + ')' : '')]].forEach(function (f, idx) {
      var b = el('button', 'filter-chip', f[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', state.filter === f[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.filter = f[0]; renderTransactions(s);
        var nb = document.querySelectorAll('#view-transactions .filter-chip')[idx]; if (nb) nb.focus();
      });
      filters.appendChild(b);
    });
    sec.appendChild(filters);

    var list = s.transactions.filter(function (t) { return state.filter === 'all' || t.category === G.CATEGORY_UNCATEGORIZED; });
    if (!list.length) {
      var e = el('div', 'state');
      e.appendChild(el('p', null, state.filter === 'uncategorized' ? 'No hay movimientos sin categoría en este ciclo.' : 'No hay movimientos en este ciclo.'));
      if (s.partial && s.since > s.cycle.end) e.appendChild(el('p', 'secondary', 'El registro empezó el ' + G.shortDay(s.since) + '.'));
      sec.appendChild(e);
    }
    var days = [];
    var byDay = {};
    list.forEach(function (t) {
      if (!byDay[t.date]) { byDay[t.date] = []; days.push(t.date); }
      byDay[t.date].push(t);
    });
    days.forEach(function (d) {
      var g = el('section', 'day-group');
      var head = el('div', 'day-head');
      head.appendChild(el('h3', null, G.capitalize(G.relativeDay(d, s.today))));
      var dayTotal = byDay[d].filter(G.isSpending).reduce(function (sum, t) { return sum + t.amount; }, 0);
      var c = el('span', 'figure', G.formatPesos(dayTotal));
      c.setAttribute('aria-label', 'Total del día ' + G.formatPesos(dayTotal));
      head.appendChild(c);
      g.appendChild(head);
      var ul = el('ul');
      byDay[d].forEach(function (t) { ul.appendChild(transactionRow(t, s, false)); });
      g.appendChild(ul);
      sec.appendChild(g);
    });
    v.appendChild(sec);
  }

  function noDataState() {
    var e = el('div', 'state');
    if (state.error) {
      e.appendChild(el('p', null, state.error.text));
      var b = el('button', 'button button-primary', 'Reintentar');
      b.type = 'button';
      b.addEventListener('click', function () { state.error = null; render(); refresh(); });
      e.appendChild(b);
    } else {
      e.appendChild(el('p', 'secondary', 'Trayendo los gastos de la hoja. La primera vez puede tardar unos segundos.'));
    }
    return e;
  }

  // ---------- Tabs ----------
  var VIEWS = ['summary', 'categories', 'transactions'];
  function switchView(view, focus) {
    state.view = view;
    VIEWS.forEach(function (n) {
      var tab = byId('tab-' + n), panel = byId('view-' + n);
      var selected = n === view;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    });
    byId('hero').classList.toggle('hero-compact', view !== 'summary');
    if (view === 'summary' && !state.showTable) drawChart();
    if (focus) byId('tab-' + view).focus();
  }

  // ---------- Settings ----------
  function openSettings() {
    var d = byId('settings');
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    byId('install-help').hidden = standalone;
    byId('option-demo').textContent = state.mode === 'demo' ? 'Salir de la demo' : 'Ver la demo';
    byId('option-code').textContent = state.access ? 'Cambiar el código de acceso' : 'Poner un código de acceso';
    requestVersion();
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function closeSettings() {
    var d = byId('settings');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
  }
  /** The version lives only in sw.js; ask the active service worker for it. */
  function requestVersion() {
    var v = byId('version');
    v.textContent = 'Versión: sin instalar';
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    try {
      var channel = new MessageChannel();
      channel.port1.onmessage = function (e) { if (e.data && e.data.version) v.textContent = 'Versión ' + e.data.version; };
      navigator.serviceWorker.controller.postMessage({ type: 'version' }, [channel.port2]);
    } catch (e) { /* ignore */ }
  }

  // ---------- Events ----------
  function bindEvents() {
    byId('code-form').addEventListener('submit', submitCode);
    byId('demo-button').addEventListener('click', enterDemo);
    byId('prev-cycle').addEventListener('click', function () {
      state.cycle = G.previousCycle(state.cycle, cutoffDay()); state.expanded = {}; render();
    });
    byId('next-cycle').addEventListener('click', function () {
      state.cycle = G.nextCycle(state.cycle, cutoffDay()); state.expanded = {}; render();
    });
    byId('refresh-button').addEventListener('click', function () { refresh(); });
    byId('settings-button').addEventListener('click', openSettings);
    byId('close-settings').addEventListener('click', closeSettings);
    byId('settings').addEventListener('click', function (e) { if (e.target === byId('settings')) closeSettings(); });
    byId('option-code').addEventListener('click', function () {
      closeSettings();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      showSetup();
      byId('access-code').focus();
    });
    byId('option-demo').addEventListener('click', function () {
      closeSettings();
      if (state.mode === 'demo') leaveDemo(); else enterDemo();
    });
    VIEWS.forEach(function (n, i) {
      var t = byId('tab-' + n);
      t.addEventListener('click', function () { switchView(n, false); window.scrollTo(0, 0); });
      t.addEventListener('keydown', function (e) {
        var j = i;
        if (e.key === 'ArrowRight') j = (i + 1) % 3;
        else if (e.key === 'ArrowLeft') j = (i + 2) % 3;
        else return;
        e.preventDefault();
        switchView(VIEWS[j], true);
      });
    });
    // Tapping outside the chart closes the tooltip
    document.addEventListener('pointerdown', function (e) {
      var c = byId('chart');
      if (c && c._deactivate && !c.contains(e.target)) c._deactivate();
    });
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      if (state.view === 'summary') drawChart();
    });
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var redraw = function () { if (state.view === 'summary') drawChart(); };
      if (mq.addEventListener) mq.addEventListener('change', redraw); else if (mq.addListener) mq.addListener(redraw);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || state.mode === 'setup') return;
      if (state.mode === 'demo') { if (state.data && state.data.generatedAt.slice(0, 10) !== today()) refresh(); return; }
      if (Date.now() - state.savedAt > 5 * 60000) refresh(); else render();
    });
    window.addEventListener('hashchange', function () {
      if (/^#demo\b/.test(location.hash) && state.mode !== 'demo') enterDemo();
    });
    setInterval(function () { if (state.mode !== 'setup') renderUpdated(); }, 60000);
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* no service worker */ }); });
  }

  start();
})();
