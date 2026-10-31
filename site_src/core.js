/* ============================================================
   Nobel Atlas — core: data, state, chart primitives
   ============================================================ */
window.NA = (function () {
  'use strict';

  /* ---------------- data ---------------- */
  const RAW = window.__NOBEL__ || { records: [], world: { paths: {}, alias: {}, extra: {} } };
  const WORLD = RAW.world || { paths: {}, alias: {}, extra: {} };
  const CATS = ['Physics', 'Chemistry', 'Physiology or Medicine', 'Literature', 'Peace', 'Economic Sciences'];
  const TYPES = ['Male', 'Female', 'Organization'];
  const CAT_SHORT = {
    'Physics': 'Physics',
    'Chemistry': 'Chemistry',
    'Physiology or Medicine': 'Medicine',
    'Literature': 'Literature',
    'Peace': 'Peace',
    'Economic Sciences': 'Economics'
  };

  const R = (RAW.records || []).map(function (r) {
    r.dec = Math.floor(r.y / 10) * 10;
    r.collab = r.nw > 1;
    r.ind = r.t !== 'Organization';
    r.mapc = (WORLD.alias && WORLD.alias[r.bc]) || r.bc;
    r._s = [r.n, r.inst, r.city, r.bc, r.ac, r.mot, r.c, r.full, r.org, r.aff, r.place]
      .filter(Boolean).join(' ').toLowerCase();
    return r;
  });

  const YEARS = R.reduce(function (a, r) { return [Math.min(a[0], r.y), Math.max(a[1], r.y)]; }, [9999, 0]);

  /* ---------------- state ---------------- */
  const state = {
    y0: YEARS[0],
    y1: YEARS[1],
    cats: new Set(),
    types: new Set(TYPES),
    cont: '',
    country: '',
    q: '',
    tab: 'overview',
    sortKey: 'y',
    sortDir: -1,
    page: 0,
    per: 25,
    cols: ['n', 'y', 'c', 't', 'age', 'bc', 'inst'],
    build: { x: 'c', y: 'count', type: 'hbar', topn: 15 }
  };

  let _cache = null;
  function invalidate() { _cache = null; }

  function data() {
    if (_cache) return _cache;
    const st = state;
    const q = st.q.trim().toLowerCase();
    _cache = R.filter(function (r) {
      if (r.y < st.y0 || r.y > st.y1) return false;
      if (st.cats.size && !st.cats.has(r.c)) return false;
      if (!st.types.has(r.t)) return false;
      if (st.cont && r.bct !== st.cont) return false;
      if (st.country && r.bc !== st.country) return false;
      if (q && r._s.indexOf(q) === -1) return false;
      return true;
    });
    return _cache;
  }

  function facts(d) {
    const prizes = new Set();
    let pool = 0;
    for (const r of d) {
      const k = r.y + '|' + r.c;
      if (!prizes.has(k)) { prizes.add(k); pool += r.padj || 0; }
    }
    const ind = d.filter(function (r) { return r.ind; });
    const female = ind.filter(function (r) { return r.t === 'Female'; }).length;
    const ages = d.map(function (r) { return r.age; }).filter(isNum);
    const countries = new Set(), insts = new Set(), mig = [];
    for (const r of d) {
      if (r.bc) countries.add(r.bc);
      if (r.inst) insts.add(r.inst);
      if (r.mig === true || r.mig === false) mig.push(r.mig);
    }
    return {
      rows: d.length,
      prizes: prizes.size,
      pool: pool,
      cats: new Set(d.map(function (r) { return r.c; })).size,
      countries: countries.size,
      insts: insts.size,
      individuals: ind.length,
      female: female,
      femalePct: ind.length ? (100 * female / ind.length) : 0,
      orgs: d.length - ind.length,
      orgPct: d.length ? (100 * (d.length - ind.length) / d.length) : 0,
      meanAge: ages.length ? mean(ages) : null,
      medianAge: ages.length ? quantile(ages, 0.5) : null,
      migrants: mig.filter(Boolean).length,
      migN: mig.length,
      migPct: mig.length ? (100 * mig.filter(Boolean).length / mig.length) : 0
    };
  }

  /* ---------------- palette ---------------- */
  const PAL = {};
  function refreshPal() {
    const s = getComputedStyle(document.documentElement);
    const g = function (k) { return s.getPropertyValue(k).trim(); };
    PAL.ink = g('--ink'); PAL.ink2 = g('--ink2'); PAL.muted = g('--muted');
    PAL.line = g('--line'); PAL.grid = g('--grid');
    PAL.surface = g('--surface'); PAL.surface2 = g('--surface2'); PAL.surface3 = g('--surface3');
    PAL.gold = g('--gold'); PAL.accent = g('--accent'); PAL.bg = g('--bg');
    PAL.cat = {
      'Physics': g('--c-physics'),
      'Chemistry': g('--c-chemistry'),
      'Physiology or Medicine': g('--c-medicine'),
      'Literature': g('--c-literature'),
      'Peace': g('--c-peace'),
      'Economic Sciences': g('--c-econ')
    };
    PAL.type = { 'Male': g('--c-male'), 'Female': g('--c-female'), 'Organization': g('--c-org') };
    PAL.share = {
      '1/1 (sole)': g('--c-physics'),
      '1/2': g('--c-chemistry'),
      '1/3': g('--c-medicine'),
      '1/4': g('--c-peace')
    };
  }
  function catColor(c) { return PAL.cat[c] || PAL.accent; }
  function typeColor(t) { return PAL.type[t] || PAL.muted; }

  /* ---------------- helpers ---------------- */
  const NF = new Intl.NumberFormat('en-US');
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function quantile(arr, p) {
    const a = arr.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    const pos = (a.length - 1) * p, base = Math.floor(pos), rest = pos - base;
    return a[base + 1] !== undefined ? a[base] + rest * (a[base + 1] - a[base]) : a[base];
  }
  function fmtInt(v) { return NF.format(Math.round(v)); }
  function money(v) {
    if (!isNum(v)) return '—';
    if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(v) >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
    return '$' + Math.round(v);
  }
  function fmtNum(v, metric) {
    if (!isNum(v)) return '—';
    if (metric === 'sumPrize' || metric === 'meanPrize') return money(v);
    if (metric === 'femaleShare') return Math.round(v) + '%';
    if (metric === 'meanAge' || metric === 'medianAge') return v.toFixed(1);
    return fmtInt(v);
  }
  function fmtAxis(v, metric) {
    if (metric === 'sumPrize' || metric === 'meanPrize') return money(v);
    if (metric === 'femaleShare') return Math.round(v) + '%';
    if (metric === 'meanAge' || metric === 'medianAge') return String(Math.round(v));
    return Math.abs(v) >= 1000 ? (v / 1000) + 'k' : String(Math.round(v * 10) / 10);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function truncate(s, px, size) {
    const max = Math.floor(px / (size * 0.56));
    if (s.length <= max) return s;
    return s.slice(0, Math.max(1, max - 1)) + '…';
  }
  function setNote(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : 0; }

  /* ---------------- tooltip ---------------- */
  const tipEl = document.getElementById('tip');
  let tipShown = false;
  function tipShow(html, ev) {
    tipEl.innerHTML = html;
    tipEl.classList.add('on');
    tipShown = true;
    tipMove(ev);
  }
  function tipMove(ev) {
    if (!tipShown) return;
    const r = tipEl.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > window.innerWidth - 10) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 10) y = ev.clientY - r.height - 14;
    tipEl.style.left = Math.max(8, x) + 'px';
    tipEl.style.top = Math.max(8, y) + 'px';
  }
  function tipHide() { tipEl.classList.remove('on'); tipShown = false; }
  function bindTip(node, html) {
    node.addEventListener('mouseenter', function (e) { tipShow(typeof html === 'function' ? html() : html, e); });
    node.addEventListener('mousemove', tipMove);
    node.addEventListener('mouseleave', tipHide);
  }

  /* ---------------- svg helpers ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const REDUCE = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();
  function S(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }
    return n;
  }
  function T(x, y, text, attrs) {
    const t = S('text', Object.assign({ x: x, y: y }, attrs || {}));
    t.textContent = text;
    return t;
  }
  function empty(host, msg) {
    host.innerHTML = '<div class="empty">' + esc(msg || 'No records match the current filters. Try widening the year range or clearing a filter.') + '</div>';
  }
  function frame(host, height) {
    host.innerHTML = '';
    const W = Math.max(260, Math.round(host.clientWidth || (host.parentElement ? host.parentElement.clientWidth : 640) || 640));
    const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + height, width: '100%', height: height, role: 'img' });
    host.appendChild(svg);
    return { svg: svg, W: W, H: height };
  }
  function niceScale(lo, hi, count) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi === lo) hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.5);
    const raw = (hi - lo) / Math.max(1, count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    step *= mag;
    const sLo = Math.floor(lo / step) * step;
    const sHi = Math.ceil(hi / step) * step;
    const ticks = [];
    const n = Math.round((sHi - sLo) / step);
    for (let i = 0; i <= n; i++) ticks.push(+(sLo + i * step).toFixed(10));
    return { lo: sLo, hi: sHi, ticks: ticks };
  }
  function hex2rgb(h) {
    h = String(h).trim();
    if (h.indexOf('rgb') === 0) {
      const m = h.match(/[\d.]+/g);
      return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
    }
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function drawLegend(svg, items, W, y, startX) {
    let x = startX || 0, row = y;
    const size = 9;
    items.forEach(function (it) {
      const w = size + 5 + String(it.name).length * 6.2 + 16;
      if (x + w > W - 4) { x = startX || 0; row += 17; }
      svg.appendChild(S('rect', { x: x, y: row - size + 2, width: size, height: size, rx: 2, fill: it.color }));
      svg.appendChild(T(x + size + 5, row, it.name, { fill: PAL.muted, 'font-size': 11 }));
      x += w;
    });
    return row + 16;
  }

  /* ---------------- charts ---------------- */
  function hBar(host, rows, o) {
    o = o || {};
    rows = rows.filter(function (r) { return r && isNum(r.value); });
    if (!rows.length) return empty(host, o.empty);
    const W = Math.max(260, Math.round(host.clientWidth || 640));
    const rowH = o.rowH || 27;
    const padT = 6, padB = 24;
    const H = o.height || (padT + padB + rows.length * rowH);
    const labelSize = o.labelSize || 12;
    const maxLabel = rows.reduce(function (m, r) { return Math.max(m, String(r.label).length); }, 0);
    const labelW = o.labelW || Math.min(210, Math.max(70, maxLabel * labelSize * 0.56 + 12));
    const padL = labelW + 10, padR = o.padR || 58;
    const svg = frame(host, H).svg;
    const maxV = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0]));
    const sc = niceScale(0, maxV, 4);
    const X = function (v) { return padL + (v - sc.lo) / (sc.hi - sc.lo || 1) * (W - padL - padR); };
    const innerH = H - padT - padB;
    const rh = Math.min(rowH, innerH / Math.max(1, rows.length));
    const topOffset = padT + Math.max(0, (innerH - rows.length * rh) / 2);
    sc.ticks.forEach(function (t) {
      const gx = X(t);
      svg.appendChild(S('line', { x1: gx, x2: gx, y1: padT, y2: H - padB, stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(gx, H - padB + 15, fmtAxis(t, o.metric), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'middle' }));
    });
    rows.forEach(function (r, i) {
      const y = topOffset + i * rh + rh * 0.17;
      const h = Math.max(7, rh * 0.66);
      const w = Math.max(2, X(r.value) - padL);
      const fill = r.color || PAL.accent;
      const rect = S('rect', { x: padL, y: y, width: w, height: h, rx: Math.min(4, h / 2), fill: fill });
      svg.appendChild(rect);
      if (!REDUCE) {
        const anim = S('animate', { attributeName: 'width', from: 0, to: w, dur: '0.5s', fill: 'freeze', calcMode: 'spline', keySplines: '0.2 0.7 0.3 1', keyTimes: '0;1' });
        rect.appendChild(anim);
      }
      svg.appendChild(T(padL + w + 6, y + h / 2 + 3.8, r.label2 || fmtNum(r.value, o.metric), { fill: PAL.ink2, 'font-size': 11.5, 'font-weight': 600 }));
      svg.appendChild(T(padL - 8, y + h / 2 + 4, truncate(String(r.label), labelW, labelSize), { fill: PAL.ink, 'font-size': labelSize, 'text-anchor': 'end' }));
      const hit = S('rect', { x: 0, y: topOffset + i * rh, width: W, height: rh, fill: 'transparent' });
      if (o.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', function () { o.onClick(r); }); }
      bindTip(hit, function () {
        return '<b>' + esc(r.label) + '</b><br><span class="t-k">' + esc(o.tipLabel || 'Value') + ':</span> <b>' +
          esc(r.label2 || fmtNum(r.value, o.metric)) + '</b>' + (r.extra ? '<br>' + r.extra : '');
      });
      svg.appendChild(hit);
    });
  }

  function vBar(host, rows, o) {
    o = o || {};
    rows = rows.filter(function (r) { return r && isNum(r.value); });
    if (!rows.length) return empty(host, o.empty);
    const W = Math.max(260, Math.round(host.clientWidth || 640));
    const H = o.height || 300;
    const rotate = o.rotate != null ? o.rotate : (rows.length > 7 || rows.some(function (r) { return String(r.label).length > 8; }));
    const padL = o.padL || 44, padR = 12, padT = o.padT || 16;
    const padB = rotate ? 58 : 30;
    const svg = frame(host, H).svg;
    const maxV = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0]));
    const sc = niceScale(o.zero === false ? Math.min.apply(null, rows.map(function (r) { return r.value; })) : 0, maxV, 4);
    const Y = function (v) { return H - padB - (v - sc.lo) / (sc.hi - sc.lo || 1) * (H - padT - padB); };
    const band = (W - padL - padR) / rows.length;
    const bw = Math.min(o.barW || 46, band * 0.66);
    sc.ticks.forEach(function (t) {
      const gy = Y(t);
      svg.appendChild(S('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(padL - 8, gy + 3.5, fmtAxis(t, o.metric), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'end' }));
    });
    rows.forEach(function (r, i) {
      const cx = padL + band * (i + 0.5);
      const h = Math.max(1.5, H - padB - Y(r.value));
      const rect = S('rect', { x: cx - bw / 2, y: H - padB - h, width: bw, height: h, rx: Math.min(4, bw / 2), fill: r.color || PAL.accent });
      svg.appendChild(rect);
      if (band > 34 && o.valueLabels !== false) {
        svg.appendChild(T(cx, Y(r.value) - 6, r.label2 || fmtNum(r.value, o.metric), { fill: PAL.ink2, 'font-size': 11, 'font-weight': 600, 'text-anchor': 'middle' }));
      }
      const lab = T(cx, H - padB + 15, String(r.label), {
        fill: PAL.muted, 'font-size': 11, 'text-anchor': rotate ? 'end' : 'middle'
      });
      if (rotate) lab.setAttribute('transform', 'rotate(-32 ' + cx + ' ' + (H - padB + 15) + ')');
      svg.appendChild(lab);
      const hit = S('rect', { x: cx - band / 2, y: padT, width: band, height: H - padT - padB, fill: 'transparent' });
      if (o.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', function () { o.onClick(r); }); }
      bindTip(hit, function () {
        return '<b>' + esc(r.label) + '</b><br><span class="t-k">' + esc(o.tipLabel || 'Value') + ':</span> <b>' +
          esc(r.label2 || fmtNum(r.value, o.metric)) + '</b>' + (r.extra ? '<br>' + r.extra : '');
      });
      svg.appendChild(hit);
    });
  }

  function stackedBars(host, o) {
    const cats = o.cats, series = o.series.filter(function (s) { return s.values.some(function (v) { return v > 0; }); });
    if (!cats.length || !series.length) return empty(host, o.empty);
    const W = Math.max(260, Math.round(host.clientWidth || 640));
    const H = o.height || 300;
    const padL = 42, padR = 12, padT = o.legend ? 34 : 16, padB = 34;
    const svg = frame(host, H).svg;
    if (o.legend) drawLegend(svg, series.map(function (s) { return { name: s.name, color: s.color }; }), W, 14, padL);
    const totals = cats.map(function (_, i) {
      return series.reduce(function (s, se) { return s + (se.values[i] || 0); }, 0);
    });
    const maxV = o.pct ? 100 : Math.max.apply(null, totals.concat([1]));
    const sc = niceScale(0, maxV, 4);
    const Y = function (v) { return H - padB - (v - sc.lo) / (sc.hi - sc.lo || 1) * (H - padT - padB); };
    const band = (W - padL - padR) / cats.length;
    const bw = Math.min(o.barW || 52, band * 0.7);
    sc.ticks.forEach(function (t) {
      const gy = Y(t);
      svg.appendChild(S('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(padL - 8, gy + 3.5, o.pct ? Math.round(t) + '%' : fmtAxis(t, o.metric), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'end' }));
    });
    cats.forEach(function (c, i) {
      const cx = padL + band * (i + 0.5);
      let acc = 0;
      const total = totals[i];
      series.forEach(function (s) {
        const v = s.values[i] || 0;
        if (v <= 0) return;
        const vv = o.pct ? (v / (total || 1)) * 100 : v;
        const y0 = Y(acc), y1 = Y(acc + vv);
        const rect = S('rect', { x: cx - bw / 2, y: y1, width: bw, height: Math.max(0.5, y0 - y1), fill: s.color });
        svg.appendChild(rect);
        const share = total ? Math.round(1000 * v / total) / 10 : 0;
        bindTip(rect, '<b>' + esc(c) + '</b><br><span class="t-dot" style="background:' + s.color + '"></span>' + esc(s.name) +
          ': <b>' + fmtInt(v) + '</b> (' + share + '%)');
        acc += vv;
      });
      svg.appendChild(T(cx, H - padB + 15, String(c), { fill: PAL.muted, 'font-size': 11, 'text-anchor': 'middle' }));
      const hit = S('rect', { x: cx - band / 2, y: padT, width: band, height: H - padT - padB, fill: 'transparent' });
      if (o.onClick) { hit.style.cursor = 'pointer'; hit.addEventListener('click', function () { o.onClick(c); }); }
      bindTip(hit, function () {
        const parts = series.map(function (s) {
          const v = s.values[i] || 0;
          return '<span class="t-row"><span class="t-dot" style="background:' + s.color + '"></span>' + esc(s.name) + ': <b>' +
            fmtInt(v) + '</b> (' + (total ? Math.round(1000 * v / total) / 10 : 0) + '%)</span>';
        });
        return '<b>' + esc(c) + '</b><br>' + parts.join('');
      });
      svg.appendChild(hit);
    });
  }

  function lineChart(host, o) {
    const xs = o.xs, series = (o.series || []).filter(function (s) { return s.values.some(isNum); });
    if (!xs.length || !series.length) return empty(host, o.empty);
    const W = Math.max(260, Math.round(host.clientWidth || 640));
    const H = o.height || 300;
    const padL = o.padL || 46, padR = 14, padT = o.legend ? 34 : 18, padB = 34;
    const svg = frame(host, H).svg;
    if (o.legend && series.length > 1) drawLegend(svg, series.map(function (s) { return { name: s.name, color: s.color }; }), W, 14, padL);
    const numeric = o.numeric !== false && xs.every(isNum);
    const xMin = numeric ? Math.min.apply(null, xs) : 0;
    const xMax = numeric ? Math.max.apply(null, xs) : xs.length - 1;
    const X = numeric
      ? function (v) { return padL + (xs.length === 1 ? 0.5 : (v - xMin) / (xMax - xMin || 1)) * (W - padL - padR); }
      : function (i) { return padL + (i + 0.5) * (W - padL - padR) / xs.length; };
    const vals = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (isNum(v)) vals.push(v); }); });
    const lo = o.zero === false ? Math.min.apply(null, vals) : 0;
    const sc = niceScale(lo, Math.max.apply(null, vals.concat([1])), 4);
    const Y = function (v) { return H - padB - (v - sc.lo) / (sc.hi - sc.lo || 1) * (H - padT - padB); };
    sc.ticks.forEach(function (t) {
      const gy = Y(t);
      svg.appendChild(S('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(padL - 8, gy + 3.5, o.yFmt ? o.yFmt(t) : fmtAxis(t, o.metric), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'end' }));
    });
    const step = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor((W - padL - padR) / 54))));
    xs.forEach(function (x, i) {
      if (i % step !== 0 && i !== xs.length - 1) return;
      const px = X(numeric ? x : i);
      svg.appendChild(T(px, H - padB + 15, o.xFmt ? o.xFmt(x) : String(x), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'middle' }));
    });
    series.forEach(function (s) {
      let d = '', pen = false;
      s.values.forEach(function (v, i) {
        if (!isNum(v)) { pen = false; return; }
        const px = X(numeric ? xs[i] : i), py = Y(v);
        d += (pen ? 'L' : 'M') + px + ',' + py;
        pen = true;
      });
      if (o.area) {
        const first = s.values.findIndex(isNum);
        let last = -1;
        s.values.forEach(function (v, i) { if (isNum(v)) last = i; });
        if (first >= 0) {
          let ad = d + 'L' + X(numeric ? xs[last] : last) + ',' + Y(sc.lo) + 'L' + X(numeric ? xs[first] : first) + ',' + Y(sc.lo) + 'Z';
          svg.appendChild(S('path', { d: ad, fill: s.color, opacity: 0.13 }));
        }
      }
      svg.appendChild(S('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': o.width || 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (o.markers !== false) {
        s.values.forEach(function (v, i) {
          if (!isNum(v)) return;
          svg.appendChild(S('circle', { cx: X(numeric ? xs[i] : i), cy: Y(v), r: 3.1, fill: PAL.surface, stroke: s.color, 'stroke-width': 2 }));
        });
      }
    });
    // hover layer
    const hover = S('rect', { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB, fill: 'transparent' });
    const vline = S('line', { x1: 0, x2: 0, y1: padT, y2: H - padB, stroke: PAL.muted, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
    svg.appendChild(vline);
    svg.appendChild(hover);
    hover.addEventListener('mousemove', function (ev) {
      const rect = svg.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (W / rect.width);
      let idx = 0, best = Infinity;
      xs.forEach(function (x, i) {
        const d = Math.abs(X(numeric ? x : i) - px);
        if (d < best) { best = d; idx = i; }
      });
      const gx = X(numeric ? xs[idx] : idx);
      vline.setAttribute('x1', gx); vline.setAttribute('x2', gx); vline.setAttribute('opacity', 0.5);
      const rows = series.map(function (s) {
        return '<span class="t-row"><span class="t-dot" style="background:' + s.color + '"></span>' + esc(s.name) + ': <b>' +
          (isNum(s.values[idx]) ? (o.yFmt ? o.yFmt(s.values[idx]) : fmtNum(s.values[idx], o.metric)) : '—') + '</b></span>';
      });
      tipShow('<b>' + esc(o.xFmt ? o.xFmt(xs[idx]) : xs[idx]) + '</b><br>' + rows.join(''), ev);
    });
    hover.addEventListener('mouseleave', function () { vline.setAttribute('opacity', 0); tipHide(); });
  }

  function donut(host, items, o) {
    o = o || {};
    items = items.filter(function (i) { return i.value > 0; });
    if (!items.length) return empty(host, o.empty);
    const W = Math.max(260, Math.round(host.clientWidth || 640));
    const H = o.height || 300;
    const svg = frame(host, H).svg;
    const total = items.reduce(function (s, i) { return s + i.value; }, 0);
    const side = W > 460;
    const cx = side ? Math.min(W * 0.3, H * 0.52) : W / 2;
    const cy = side ? H / 2 : Math.min(H * 0.42, H - 60);
    const r = side ? Math.min(H * 0.36, W * 0.24) : Math.min(H * 0.32, W * 0.3);
    const r0 = r * 0.62;
    let a = -Math.PI / 2;
    items.forEach(function (it) {
      const ang = (it.value / total) * Math.PI * 2;
      const a1 = a + ang;
      const path = arcPath(cx, cy, r0, r, a, a1);
      const p = S('path', { d: path, fill: it.color, stroke: PAL.surface, 'stroke-width': 1.5 });
      svg.appendChild(p);
      p.style.transition = 'opacity .15s';
      p.addEventListener('mouseenter', function () { p.style.opacity = 0.8; });
      p.addEventListener('mouseleave', function () { p.style.opacity = 1; });
      bindTip(p, '<b>' + esc(it.label) + '</b><br><span class="t-k">Laureates:</span> <b>' + fmtInt(it.value) +
        '</b><br><span class="t-k">Share:</span> <b>' + pct(it.value, total) + '%</b>');
      if (o.onClick) { p.style.cursor = 'pointer'; p.addEventListener('click', function () { o.onClick(it); }); }
      a = a1;
    });
    svg.appendChild(T(cx, cy - 2, fmtInt(total), { fill: PAL.ink, 'font-size': 24, 'font-weight': 700, 'text-anchor': 'middle' }));
    svg.appendChild(T(cx, cy + 16, o.centerLabel || 'laureates', { fill: PAL.muted, 'font-size': 11, 'text-anchor': 'middle' }));
    if (side) {
      const lx = Math.max(W * 0.56, cx + r + 34);
      let y = cy - items.length * 11 + 6;
      items.forEach(function (it) {
        svg.appendChild(S('rect', { x: lx, y: y - 9, width: 9, height: 9, rx: 2, fill: it.color }));
        svg.appendChild(T(lx + 15, y, it.label, { fill: PAL.ink2, 'font-size': 12 }));
        svg.appendChild(T(lx + 15, y + 13, fmtInt(it.value) + ' · ' + pct(it.value, total) + '%', { fill: PAL.muted, 'font-size': 11 }));
        y += 34;
      });
    } else {
      let x = 12, y = H - 26;
      items.forEach(function (it) {
        const w = it.label.length * 6 + 40;
        if (x + w > W - 6) { x = 12; y -= 17; }
        svg.appendChild(S('rect', { x: x, y: y - 9, width: 9, height: 9, rx: 2, fill: it.color }));
        svg.appendChild(T(x + 14, y, it.label + ' ' + pct(it.value, total) + '%', { fill: PAL.muted, 'font-size': 11 }));
        x += w;
      });
    }
  }
  function arcPath(cx, cy, r0, r1, a0, a1) {
    const P = function (r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const p0 = P(r1, a0), p1 = P(r1, a1), p2 = P(r0, a1), p3 = P(r0, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return 'M' + p0[0] + ',' + p0[1] + 'A' + r1 + ',' + r1 + ' 0 ' + large + ' 1 ' + p1[0] + ',' + p1[1] +
      'L' + p2[0] + ',' + p2[1] + 'A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + p3[0] + ',' + p3[1] + 'Z';
  }

  function heatmap(host, o) {
    const rows = o.rows, cols = o.cols;
    if (!rows.length || !cols.length) return empty(host, o.empty);
    const W = Math.max(280, Math.round(host.clientWidth || 640));
    const H = o.height || 380;
    const labelW = o.labelW || Math.min(150, Math.max(70, rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0) * 6.2 + 10));
    const padL = labelW + 8, padR = 6, padT = o.legend ? 26 : 6, padB = 42;
    const svg = frame(host, H).svg;
    const cw = (W - padL - padR) / cols.length;
    const rh = (H - padT - padB) / rows.length;
    let maxV = 1;
    rows.forEach(function (r) { cols.forEach(function (c) { const v = o.val(r, c); if (v > maxV) maxV = v; }); });
    const low = PAL.surface3, high = PAL.accent;
    rows.forEach(function (r, ri) {
      svg.appendChild(T(padL - 8, padT + ri * rh + rh / 2 + 4, truncate(r, labelW, 11.5), { fill: PAL.ink, 'font-size': 11.5, 'text-anchor': 'end' }));
      cols.forEach(function (c, ci) {
        const v = o.val(r, c) || 0;
        const t = Math.pow(v / maxV, 0.65);
        const fill = v ? mix(low, high, 0.1 + 0.9 * t) : PAL.surface2;
        const rect = S('rect', {
          x: padL + ci * cw + 1, y: padT + ri * rh + 1,
          width: Math.max(1, cw - 2), height: Math.max(1, rh - 2), rx: 3, fill: fill
        });
        svg.appendChild(rect);
        if (cw > 24 && rh > 16 && v) {
          svg.appendChild(T(padL + ci * cw + cw / 2, padT + ri * rh + rh / 2 + 4, String(v), {
            fill: t > 0.55 ? '#fff' : PAL.ink, 'font-size': 10.5, 'text-anchor': 'middle', 'font-weight': 600
          }));
        }
        bindTip(rect, '<b>' + esc(r) + '</b> × ' + esc(c) + '<br><span class="t-k">Laureates:</span> <b>' + fmtInt(v) + '</b>');
      });
    });
    cols.forEach(function (c, ci) {
      const x = padL + ci * cw + cw / 2;
      const lab = T(x, H - padB + 16, o.colFmt ? o.colFmt(c) : String(c), {
        fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'end'
      });
      lab.setAttribute('transform', 'rotate(-32 ' + x + ' ' + (H - padB + 16) + ')');
      svg.appendChild(lab);
    });
    if (o.legend) {
      const gid = 'hg' + Math.random().toString(36).slice(2, 7);
      const defs = S('defs');
      const lg = S('linearGradient', { id: gid, x1: '0', x2: '1', y1: '0', y2: '0' });
      lg.appendChild(S('stop', { offset: '0%', 'stop-color': low }));
      lg.appendChild(S('stop', { offset: '100%', 'stop-color': high }));
      defs.appendChild(lg);
      svg.appendChild(defs);
      const gw = 84, gx = W - padR - gw - 42;
      svg.appendChild(T(gx - 6, 14, 'fewer', { fill: PAL.muted, 'font-size': 10, 'text-anchor': 'end' }));
      svg.appendChild(S('rect', { x: gx, y: 5, width: gw, height: 8, rx: 4, fill: 'url(#' + gid + ')' }));
      svg.appendChild(T(gx + gw + 6, 14, 'more', { fill: PAL.muted, 'font-size': 10 }));
    }
  }

  function histogram(host, values, o) {
    o = o || {};
    values = values.filter(isNum);
    if (!values.length) return empty(host, o.empty);
    const bins = o.bins || 24;
    const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    const w = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    values.forEach(function (v) { counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++; });
    const W = Math.max(280, Math.round(host.clientWidth || 640));
    const H = o.height || 300;
    const padL = 38, padR = 12, padT = 14, padB = 32;
    const svg = frame(host, H).svg;
    const sc = niceScale(0, Math.max.apply(null, counts.concat([1])), 4);
    const Y = function (v) { return H - padB - (v - sc.lo) / (sc.hi - sc.lo || 1) * (H - padT - padB); };
    sc.ticks.forEach(function (t) {
      svg.appendChild(S('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(padL - 8, Y(t) + 3.5, String(Math.round(t)), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'end' }));
    });
    const band = (W - padL - padR) / bins;
    const col = o.color || PAL.accent;
    counts.forEach(function (c, i) {
      const h = Math.max(0.8, H - padB - Y(c));
      const rect = S('rect', { x: padL + i * band + 0.6, y: H - padB - h, width: Math.max(1, band - 1.2), height: h, rx: 2, fill: col, opacity: 0.85 });
      svg.appendChild(rect);
      bindTip(rect, '<b>' + Math.round(lo + i * w) + '–' + Math.round(lo + (i + 1) * w) + ' years</b><br><span class="t-k">Laureates:</span> <b>' + c + '</b>');
    });
    const every = Math.max(1, Math.ceil(bins / 8));
    counts.forEach(function (c, i) {
      if (i % every !== 0) return;
      svg.appendChild(T(padL + i * band, H - padB + 15, String(Math.round(lo + i * w)), { fill: PAL.muted, 'font-size': 10, 'text-anchor': 'middle' }));
    });
    const med = o.median;
    if (isNum(med)) {
      const px = padL + ((med - lo) / (w || 1)) * band;
      svg.appendChild(S('line', { x1: px, x2: px, y1: padT, y2: H - padB, stroke: PAL.gold, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
      svg.appendChild(T(Math.min(px + 5, W - 60), padT + 10, 'median ' + med.toFixed(0), { fill: PAL.gold, 'font-size': 10.5, 'font-weight': 600 }));
    }
  }

  function boxPlot(host, groups, o) {
    o = o || {};
    groups = groups.filter(function (g) { return g.values.length; });
    if (!groups.length) return empty(host, o.empty);
    const W = Math.max(280, Math.round(host.clientWidth || 640));
    const H = o.height || (groups.length * 40 + 40);
    const labelW = 96, padL = labelW + 12, padR = 18, padT = 10, padB = 30;
    const svg = frame(host, H).svg;
    const all = [];
    groups.forEach(function (g) { g.values.forEach(function (v) { all.push(v); }); });
    const sc = niceScale(Math.min.apply(null, all), Math.max.apply(null, all), 4);
    const X = function (v) { return padL + (v - sc.lo) / (sc.hi - sc.lo || 1) * (W - padL - padR); };
    sc.ticks.forEach(function (t) {
      svg.appendChild(S('line', { x1: X(t), x2: X(t), y1: padT, y2: H - padB, stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(X(t), H - padB + 15, String(Math.round(t)), { fill: PAL.muted, 'font-size': 10.5, 'text-anchor': 'middle' }));
    });
    const rh = (H - padT - padB) / groups.length;
    groups.forEach(function (g, i) {
      const y = padT + i * rh + rh / 2;
      const vals = g.values.slice().sort(function (a, b) { return a - b; });
      const q1 = quantile(vals, 0.25), med = quantile(vals, 0.5), q3 = quantile(vals, 0.75);
      const iqr = q3 - q1;
      const loW = Math.max(Math.min.apply(null, vals), q1 - 1.5 * iqr);
      const hiW = Math.min(Math.max.apply(null, vals), q3 + 1.5 * iqr);
      const col = g.color || PAL.accent;
      svg.appendChild(T(padL - 10, y + 4, truncate(g.short || g.label, labelW, 11.5), { fill: PAL.ink, 'font-size': 11.5, 'text-anchor': 'end' }));
      svg.appendChild(S('line', { x1: X(loW), x2: X(hiW), y1: y, y2: y, stroke: col, 'stroke-width': 1.6, opacity: 0.75 }));
      [loW, hiW].forEach(function (v) {
        svg.appendChild(S('line', { x1: X(v), x2: X(v), y1: y - 7, y2: y + 7, stroke: col, 'stroke-width': 1.6, opacity: 0.75 }));
      });
      const box = S('rect', { x: X(q1), y: y - 10, width: Math.max(2, X(q3) - X(q1)), height: 20, rx: 4, fill: col, opacity: 0.32, stroke: col, 'stroke-width': 1.2 });
      svg.appendChild(box);
      svg.appendChild(S('line', { x1: X(med), x2: X(med), y1: y - 10, y2: y + 10, stroke: col, 'stroke-width': 2.4 }));
      vals.forEach(function (v) {
        if (v < loW || v > hiW) svg.appendChild(S('circle', { cx: X(v), cy: y, r: 1.9, fill: col, opacity: 0.5 }));
      });
      const hit = S('rect', { x: padL, y: y - rh / 2, width: W - padL - padR, height: rh, fill: 'transparent' });
      bindTip(hit, '<b>' + esc(g.full || g.label) + '</b><br><span class="t-k">n:</span> <b>' + vals.length +
        '</b><br><span class="t-k">median:</span> <b>' + med.toFixed(0) + '</b><br><span class="t-k">Q1–Q3:</span> <b>' +
        q1.toFixed(0) + '–' + q3.toFixed(0) + '</b><br><span class="t-k">range:</span> <b>' + vals[0].toFixed(0) + '–' + vals[vals.length - 1].toFixed(0) + '</b>');
      svg.appendChild(hit);
    });
  }

  function divBar(host, rows, o) {
    o = o || {};
    if (!rows.length) return empty(host, o.empty);
    const W = Math.max(280, Math.round(host.clientWidth || 640));
    const rowH = 27, padT = 6, padB = 24;
    const H = o.height || (padT + padB + rows.length * rowH);
    const maxLabel = rows.reduce(function (m, r) { return Math.max(m, String(r.label).length); }, 0);
    const labelW = Math.min(160, Math.max(64, maxLabel * 6.4 + 12));
    const padL = labelW + 10, padR = 52;
    const svg = frame(host, H).svg;
    const maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    const sc = niceScale(-maxAbs, maxAbs, 4);
    const X = function (v) { return padL + (v - sc.lo) / (sc.hi - sc.lo || 1) * (W - padL - padR); };
    const zero = X(0);
    sc.ticks.forEach(function (t) {
      svg.appendChild(S('line', { x1: X(t), x2: X(t), y1: padT, y2: H - padB, stroke: t === 0 ? PAL.line : PAL.grid, 'stroke-width': t === 0 ? 1.4 : 1 }));
      svg.appendChild(T(X(t), H - padB + 15, (t > 0 ? '+' : '') + Math.round(t), { fill: PAL.muted, 'font-size': 10, 'text-anchor': 'middle' }));
    });
    const rh = Math.min(rowH, (H - padT - padB) / rows.length);
    rows.forEach(function (r, i) {
      const y = padT + i * rh + rh * 0.18;
      const h = Math.max(7, rh * 0.64);
      const x0 = Math.min(zero, X(r.value)), w = Math.max(2, Math.abs(X(r.value) - zero));
      const col = r.value >= 0 ? (o.posColor || PAL.type.Male) : (o.negColor || PAL.type.Female);
      const rect = S('rect', { x: x0, y: y, width: w, height: h, rx: 3, fill: col, opacity: 0.9 });
      svg.appendChild(rect);
      svg.appendChild(T(padL - 8, y + h / 2 + 4, truncate(String(r.label), labelW, 12), { fill: PAL.ink, 'font-size': 12, 'text-anchor': 'end' }));
      svg.appendChild(T(r.value >= 0 ? X(r.value) + 6 : X(r.value) - 6, y + h / 2 + 4, (r.value > 0 ? '+' : '') + fmtInt(r.value), {
        fill: PAL.ink2, 'font-size': 11.5, 'font-weight': 600, 'text-anchor': r.value >= 0 ? 'start' : 'end'
      }));
      const hit = S('rect', { x: 0, y: padT + i * rh, width: W, height: rh, fill: 'transparent' });
      bindTip(hit, '<b>' + esc(r.label) + '</b><br><span class="t-k">net laureates:</span> <b>' + (r.value > 0 ? '+' : '') + fmtInt(r.value) + '</b>' +
        (r.extra ? '<br>' + r.extra : ''));
      svg.appendChild(hit);
    });
  }

  function groupedHBar(host, o) {
    const cats = o.cats, series = o.series;
    if (!cats.length) return empty(host, o.empty);
    const W = Math.max(280, Math.round(host.clientWidth || 640));
    const rowH = o.rowH || 30;
    const padT = 6, padB = 34;
    const H = o.height || (padT + padB + cats.length * rowH + 26);
    const maxLabel = cats.reduce(function (m, c) { return Math.max(m, String(c).length); }, 0);
    const labelW = Math.min(170, Math.max(64, maxLabel * 6.3 + 12));
    const padL = labelW + 10, padR = 52;
    const svg = frame(host, H).svg;
    let maxV = 1;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > maxV) maxV = v; }); });
    const sc = niceScale(0, maxV, 4);
    const X = function (v) { return padL + (v - sc.lo) / (sc.hi - sc.lo || 1) * (W - padL - padR); };
    sc.ticks.forEach(function (t) {
      svg.appendChild(S('line', { x1: X(t), x2: X(t), y1: padT, y2: H - padB - 20, stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(X(t), H - padB - 20 + 13, String(Math.round(t)), { fill: PAL.muted, 'font-size': 10, 'text-anchor': 'middle' }));
    });
    const rh = Math.min(rowH, (H - padT - padB - 20) / cats.length);
    cats.forEach(function (c, i) {
      const y = padT + i * rh;
      svg.appendChild(T(padL - 8, y + rh / 2 + 4, truncate(String(c), labelW, 11.5), { fill: PAL.ink, 'font-size': 11.5, 'text-anchor': 'end' }));
      const bh = Math.max(5, (rh - 8) / series.length - 2);
      series.forEach(function (s, si) {
        const v = s.values[i] || 0;
        const by = y + 4 + si * (bh + 2);
        const rect = S('rect', { x: padL, y: by, width: Math.max(1.5, X(v) - padL), height: bh, rx: 2, fill: s.color });
        svg.appendChild(rect);
        bindTip(rect, '<b>' + esc(c) + '</b><br><span class="t-dot" style="background:' + s.color + '"></span>' + esc(s.name) + ': <b>' + fmtInt(v) + '</b>');
      });
      const hit = S('rect', { x: 0, y: y, width: W, height: rh, fill: 'transparent' });
      bindTip(hit, '<b>' + esc(c) + '</b><br>' + series.map(function (s) {
        return '<span class="t-row"><span class="t-dot" style="background:' + s.color + '"></span>' + esc(s.name) + ': <b>' + fmtInt(s.values[i] || 0) + '</b></span>';
      }).join(''));
      svg.appendChild(hit);
    });
    drawLegend(svg, series.map(function (s) { return { name: s.name, color: s.color }; }), W, H - 9, padL);
  }

  function comboYear(host, rows, o) {
    o = o || {};
    if (!rows.length) return empty(host, o.empty);
    const W = Math.max(280, Math.round(host.clientWidth || 640));
    const H = o.height || 330;
    const padL = 40, padR = 44, padT = 30, padB = 30;
    const svg = frame(host, H).svg;
    drawLegend(svg, [{ name: 'Prizes per year', color: mix(PAL.surface, PAL.accent, 0.3) }, { name: 'Cumulative', color: PAL.gold }], W, 14, padL);
    const sc = niceScale(0, Math.max.apply(null, rows.map(function (r) { return r.value; })), 4);
    const Y = function (v) { return H - padB - (v - sc.lo) / (sc.hi - sc.lo || 1) * (H - padT - padB); };
    const cum = [];
    let acc = 0;
    rows.forEach(function (r) { acc += r.value; cum.push(acc); });
    const sc2 = niceScale(0, acc, 4);
    const Y2 = function (v) { return H - padB - (v - sc2.lo) / (sc2.hi - sc2.lo || 1) * (H - padT - padB); };
    sc.ticks.forEach(function (t) {
      svg.appendChild(S('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), stroke: PAL.grid, 'stroke-width': 1 }));
      svg.appendChild(T(padL - 8, Y(t) + 3.5, String(Math.round(t)), { fill: PAL.muted, 'font-size': 10, 'text-anchor': 'end' }));
    });
    sc2.ticks.forEach(function (t) {
      svg.appendChild(T(W - padR + 8, Y2(t) + 3.5, String(Math.round(t)), { fill: PAL.gold, 'font-size': 10 }));
    });
    const band = (W - padL - padR) / rows.length;
    const bw = Math.max(1.5, band * 0.62);
    rows.forEach(function (r, i) {
      const x = padL + band * (i + 0.5);
      const h = Math.max(0.8, H - padB - Y(r.value));
      const rect = S('rect', { x: x - bw / 2, y: H - padB - h, width: bw, height: h, fill: mix(PAL.surface, PAL.accent, 0.3) });
      svg.appendChild(rect);
      const hit = S('rect', { x: x - band / 2, y: padT, width: band, height: H - padT - padB, fill: 'transparent' });
      bindTip(hit, '<b>' + r.label + '</b><br><span class="t-k">Prizes:</span> <b>' + r.value + '</b><br><span class="t-k">Cumulative:</span> <b>' + cum[i] + '</b>');
      svg.appendChild(hit);
    });
    let d = '';
    rows.forEach(function (r, i) {
      const x = padL + band * (i + 0.5);
      d += (i ? 'L' : 'M') + x + ',' + Y2(cum[i]);
    });
    svg.appendChild(S('path', { d: d, fill: 'none', stroke: PAL.gold, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
    const step = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor((W - padL - padR) / 46))));
    rows.forEach(function (r, i) {
      if (i % step !== 0 && i !== rows.length - 1) return;
      const x = padL + band * (i + 0.5);
      svg.appendChild(T(x, H - padB + 15, r.label, { fill: PAL.muted, 'font-size': 10, 'text-anchor': 'middle' }));
    });
  }

  function worldMap(host, values, o) {
    o = o || {};
    host.innerHTML = '';
    host.style.height = 'auto';
    host.style.display = 'flex';
    host.style.alignItems = 'center';
    host.style.justifyContent = 'center';
    const paths = WORLD.paths || {};
    const names = Object.keys(paths);
    if (!names.length) return empty(host, 'Map data unavailable.');
    const svg = S('svg', { viewBox: '0 0 1000 394', width: '100%', role: 'img', 'aria-label': 'World map of laureate birth countries' });
    svg.style.display = 'block';
    svg.style.height = 'auto';
    host.appendChild(svg);
    svg.appendChild(S('rect', { x: 0, y: 0, width: 1000, height: 394, fill: 'transparent' }));
    let maxV = 1;
    values.forEach(function (v) { if (v > maxV) maxV = v; });
    const low = PAL.surface3, high = PAL.accent;
    names.forEach(function (name) {
      const v = values.get(name) || 0;
      const t = v ? Math.pow(v / maxV, 0.55) : 0;
      const fill = v ? mix(low, high, 0.18 + 0.82 * t) : low;
      const p = S('path', { d: paths[name], fill: fill, stroke: PAL.surface, 'stroke-width': 0.55 });
      p.style.transition = 'fill .2s';
      if (v) {
        bindTip(p, '<b>' + esc((o.label && o.label[name]) || name) + '</b><br><span class="t-k">Laureates born there:</span> <b>' + fmtInt(v) + '</b>');
        p.style.cursor = 'pointer';
        p.addEventListener('mouseenter', function () { p.setAttribute('stroke', PAL.gold); p.setAttribute('stroke-width', 1.4); });
        p.addEventListener('mouseleave', function () { p.setAttribute('stroke', PAL.surface); p.setAttribute('stroke-width', 0.55); });
        if (o.onClick) p.addEventListener('click', function () { o.onClick(name); });
      }
      svg.appendChild(p);
    });
    // small states that are not on the 110m map
    const extra = WORLD.extra || {};
    Object.keys(extra).forEach(function (name) {
      const c = extra[name];
      const v = values.get(name) || 0;
      const x = (c[0] + 180) / 360 * 1000, y = (84 - c[1]) / 142 * 394;
      const r = 2.4 + 4 * Math.sqrt(v / maxV);
      const dot = S('circle', { cx: x, cy: y, r: v ? r : 1.6, fill: v ? mix(low, high, 0.5 + 0.5 * Math.pow(v / maxV, 0.55)) : low, stroke: PAL.surface, 'stroke-width': 0.8 });
      if (v) {
        bindTip(dot, '<b>' + esc(name) + '</b><br><span class="t-k">Laureates born there:</span> <b>' + fmtInt(v) + '</b>');
        dot.style.cursor = 'pointer';
        if (o.onClick) dot.addEventListener('click', function () { o.onClick(name); });
      }
      svg.appendChild(dot);
    });
  }

  /* ---------------- aggregation ---------------- */
  function groupBy(rows, key) {
    const m = new Map();
    for (const r of rows) {
      const k = r[key];
      if (k == null || k === '') continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }
  function metricOf(list, metric) {
    if (metric === 'count') return list.length;
    if (metric === 'meanAge' || metric === 'medianAge') {
      const ages = list.map(function (r) { return r.age; }).filter(isNum);
      if (!ages.length) return null;
      return metric === 'meanAge' ? mean(ages) : quantile(ages, 0.5);
    }
    if (metric === 'sumPrize' || metric === 'meanPrize') {
      const seen = new Set();
      let sum = 0;
      for (const r of list) {
        const k = r.y + '|' + r.c;
        if (!seen.has(k)) { seen.add(k); sum += r.padj || 0; }
      }
      return metric === 'sumPrize' ? sum : (seen.size ? sum / seen.size : null);
    }
    if (metric === 'femaleShare') {
      const ind = list.filter(function (r) { return r.ind; });
      return ind.length ? 100 * ind.filter(function (r) { return r.t === 'Female'; }).length / ind.length : null;
    }
    return list.length;
  }

  return {
    RAW: RAW, WORLD: WORLD, R: R, CATS: CATS, TYPES: TYPES, CAT_SHORT: CAT_SHORT,
    YEARS: YEARS, state: state, data: data, facts: facts, invalidate: invalidate,
    PAL: PAL, refreshPal: refreshPal, catColor: catColor, typeColor: typeColor,
    fmtInt: fmtInt, money: money, fmtNum: fmtNum, fmtAxis: fmtAxis, esc: esc,
    mean: mean, quantile: quantile, pct: pct, isNum: isNum, setNote: setNote,
    groupBy: groupBy, metricOf: metricOf,
    hBar: hBar, vBar: vBar, stackedBars: stackedBars, lineChart: lineChart, donut: donut,
    heatmap: heatmap, histogram: histogram, boxPlot: boxPlot, divBar: divBar,
    groupedHBar: groupedHBar, comboYear: comboYear, worldMap: worldMap,
    empty: empty, bindTip: bindTip, tipHide: tipHide
  };
})();
