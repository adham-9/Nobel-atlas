/* ============================================================
   Nobel Atlas — chat assistant (client-side, data-grounded)
   ============================================================ */
(function () {
  'use strict';

  const N = window.NA;
  const R = N.R;
  const esc = N.esc;
  const fmtInt = N.fmtInt;
  const money = N.money;
  const pct = N.pct;
  const isNum = N.isNum;

  let useFilters = false;
  function recs() {
    if (useFilters) {
      const d = N.data();
      if (d.length) return d;
    }
    return R;
  }

  /* ---------------- language helpers ---------------- */
  function norm(s) {
    return (' ' + String(s).toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim() + ' ');
  }
  const CAT_RE = [
    { key: 'Physics', re: /\b(physics|physicist|physical)\b/ },
    { key: 'Chemistry', re: /\b(chemistry|chemist|chemical)\b/ },
    { key: 'Physiology or Medicine', re: /\b(medicine|medical|physiology|physiological|biology|biologist)\b/ },
    { key: 'Literature', re: /\b(literature|literary|writer|poet|novel)\b/ },
    { key: 'Peace', re: /\b(peace|peaceful)\b/ },
    { key: 'Economic Sciences', re: /\b(economics?|economy|economist)\b/ }
  ];
  const STATS_RE = /\b(how many|how much|which|most|least|fewest|average|mean|median|total|share|percent|percentage|oldest|youngest|first|last|trend|compare|versus|vs|rate|ratio|count|number)\b/;
  const ALIAS = [
    ['united states of america', 'USA'], ['united states', 'USA'], ['america', 'USA'], ['usa', 'USA'], ['u s a', 'USA'],
    ['great britain', 'United Kingdom'], ['united kingdom', 'United Kingdom'], ['britain', 'United Kingdom'],
    ['england', 'United Kingdom'], ['scotland', 'United Kingdom'], ['uk', 'United Kingdom'],
    ['holland', 'the Netherlands'], ['netherlands', 'the Netherlands'],
    ['south korea', 'South Korea'], ['korea', 'South Korea'],
    ['russia', 'Russia'], ['ussr', 'Russia'], ['soviet union', 'Russia'],
    ['czechia', 'Czech Republic'], ['czech republic', 'Czech Republic'],
    ['persia', 'Iran'], ['iran', 'Iran'], ['burma', 'Myanmar'], ['myanmar', 'Myanmar'],
    ['turkey', 'Turkey'], ['denmark', 'Denmark']
  ];
  const COUNTRY_LIST = Array.from(new Set(R.map(function (r) { return r.bc; }).filter(Boolean)));
  const COUNTRY_NORM = COUNTRY_LIST.map(function (c) { return { name: c, p: norm(c) }; });

  function findCountry(s) {
    const q = ' ' + s + ' ';
    const cands = [];
    ALIAS.forEach(function (a) { cands.push({ p: ' ' + a[0] + ' ', c: a[1] }); });
    COUNTRY_NORM.forEach(function (c) { cands.push({ p: c.p, c: c.name }); });
    cands.sort(function (a, b) { return b.p.length - a.p.length; });
    for (let i = 0; i < cands.length; i++) {
      if (q.indexOf(cands[i].p) !== -1) return cands[i].c;
    }
    return null;
  }

  const INST_STOP = ['university', 'institute', 'college', 'national', 'center', 'centre', 'laboratory',
    'research', 'school', 'academy', 'foundation', 'hospital', 'technology', 'sciences', 'science',
    'state', 'physics', 'chemistry', 'medicine', 'molecular', 'biology', 'medical', 'international',
    'royal', 'german', 'american', 'french', 'british', 'institut', 'carnegie', 'society'];
  const INSTS = Array.from(new Set(R.map(function (r) { return r.inst; }).filter(Boolean)));

  function findInst(s) {
    const q = ' ' + s + ' ';
    let soft = null;
    for (let i = 0; i < INSTS.length; i++) {
      const inst = INSTS[i];
      const n = norm(inst).trim();
      if (!n) continue;
      if (q.indexOf(' ' + n + ' ') !== -1) return inst;
      const toks = n.split(' ').filter(function (t) { return t.length >= 5 && INST_STOP.indexOf(t) === -1; });
      if (toks.some(function (t) { return q.indexOf(' ' + t + ' ') !== -1; })) {
        if (!soft) soft = inst;
      }
    }
    return soft;
  }

  /* ---------------- people index ---------------- */
  const PEOPLE = (function () {
    const m = new Map();
    R.forEach(function (r) {
      if (!r.n) return;
      if (!m.has(r.n)) m.set(r.n, []);
      m.get(r.n).push(r);
    });
    return Array.from(m.entries()).map(function (e) {
      const n = norm(e[0]).trim();
      return { name: e[0], recs: e[1].sort(function (a, b) { return a.y - b.y; }), p: n, toks: n.split(' ').filter(Boolean) };
    });
  })();

  function findPeople(s) {
    const q = ' ' + s + ' ';
    const out = [];
    PEOPLE.forEach(function (p) {
      let score = 0;
      if (q.indexOf(' ' + p.p + ' ') !== -1) score = 3;
      else {
        const toks = p.toks.filter(function (t) { return t.length > 2; });
        const hits = toks.filter(function (t) { return q.indexOf(' ' + t + ' ') !== -1; });
        if (!hits.length) return;
        if (toks.length >= 2 && hits.length === toks.length) score = 2.4;
        else if (toks.length >= 2 && hits.length === 1 && hits[0].length >= 4) score = 1.6;
        else if (toks.length === 1 && hits.length === 1 && toks[0].length >= 4) score = 1.3;
      }
      if (score) out.push({ p: p, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || a.p.name.localeCompare(b.p.name); });
    return out;
  }

  /* ---------------- formatting ---------------- */
  function table(head, rows) {
    return '<table class="chat-t"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          return '<td' + (i === 0 ? '' : ' class="num"') + '>' + c + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function searchBtn(name) {
    return '<button class="chat-link" data-search="' + esc(name) + '">Open ' + esc(name) + ' in the table →</button>';
  }
  function years(r) {
    return r.recs.map(function (x) { return x.y; }).join(', ');
  }

  /* ---------------- answer handlers ---------------- */
  function aHello() {
    return '<p>Hello 👋 I can answer questions about the Nobel Prize record in this page — <b>950 laureates, 597 prizes, 1901–2019</b>.</p>' +
      '<p>Try: <i>Who won Physics in 1969?</i> · <i>Which country has the most laureates?</i> · <i>How many women have won?</i> · <i>Who is the youngest laureate?</i></p>';
  }

  function aHelp() {
    return '<p>I answer from the same cleaned dataset that powers the charts. I understand questions about:</p>' +
      '<ul class="chat-ul">' +
      '<li><b>People</b> — “Tell me about Marie Curie”, “When did Einstein win?”</li>' +
      '<li><b>Years &amp; fields</b> — “Who won Chemistry in 2004?”, “How many Physics prizes are there?”</li>' +
      '<li><b>Places</b> — “How many laureates were born in Japan?”, “Which country has the most?”</li>' +
      '<li><b>Patterns</b> — “How many women have won?”, “What is the average age?”, “Brain drain?”, “Prize money?”</li>' +
      '</ul>' +
      '<p>I also explain terms: <i>portion</i>, <i>adjusted prize value</i>, <i>brain drain</i>.</p>';
  }

  function aProfile(p) {
    const r = p.recs[0];
    const multiple = p.recs.length > 1;
    let html = '<p><b>' + esc(p.name) + '</b>' + (r.org ? ' — organisation' : '') + '. ' +
      (multiple ? 'Won <b>' + p.recs.length + '</b> Nobel Prizes: ' : 'Won the <b>' + esc(r.c) + '</b> prize in <b>' + r.y + '</b>. ') +
      (multiple ? p.recs.map(function (x) { return x.c + ' ' + x.y; }).join(', ') + '.' : '') + '</p>';

    html += table(['Prize', 'Detail'], [
      ['Field', esc(r.c)],
      ['Year', r.y],
      ['Age at award', isNum(r.age) ? r.age.toFixed(0) + ' years' : '—'],
      ['Born', esc(r.place || r.bc || '—')],
      ['Institution', esc(r.inst || '—')],
      ['Share of prize', esc(r.p || '—')],
      ['Co-winners', r.nw]
    ]);
    if (r.mot) html += '<p class="chat-quote">“' + esc(r.mot) + '”</p>';
    html += '<p>' + searchBtn(p.name) + '</p>';
    return html;
  }

  function aAmbiguous(list, q) {
    const top = list.slice(0, 6);
    return '<p>I found ' + list.length + ' possible matches. Did you mean:</p>' + table(['Name', 'Prize'], top.map(function (x) {
      const r = x.p.recs[0];
      return [esc(x.p.name), esc(r.c + ' ' + r.y)];
    })) + '<p class="chat-hint">Tip: include the full name, e.g. “Marie Curie”.</p>';
  }

  function aYear(y, cats) {
    const d = recs();
    let list = d.filter(function (r) { return r.y === y; });
    if (cats.length) list = list.filter(function (r) { return cats.indexOf(r.c) !== -1; });
    if (!list.length) {
      return '<p>No prize in <b>' + y + '</b>' + (cats.length ? ' in ' + cats.join(' / ') : '') + ' appears in the dataset. ' +
        'Some years had no award — for example, the Nobel Prize was not awarded during parts of both World Wars.</p>';
    }
    const catsFound = Array.from(new Set(list.map(function (r) { return r.c; })));
    const prizeCount = catsFound.length;
    let html = '<p>In <b>' + y + '</b> there ' +
      (prizeCount === 1 ? 'was <b>1</b> prize' : 'were <b>' + prizeCount + '</b> prizes') +
      ', awarded to <b>' + list.length + '</b> laureate' + (list.length === 1 ? '' : 's') + ':</p>';
    html += table(['Name', 'Field', 'Share'], list.map(function (r) {
      return [esc(r.n), esc(r.c), esc(r.p || '')];
    }));
    html += '<p>' + searchBtn(list[0].n) + '</p>';
    return html;
  }

  function aCategory(c) {
    const d = recs();
    const list = d.filter(function (r) { return r.c === c; });
    if (!list.length) return '<p>No <b>' + esc(c) + '</b> records in this selection.</p>';
    const prizes = new Set(list.map(function (r) { return r.y; })).size;
    const ind = list.filter(function (r) { return r.ind; });
    const women = list.filter(function (r) { return r.t === 'Female'; }).length;
    const ages = list.map(function (r) { return r.age; }).filter(isNum);
    const ys = list.map(function (r) { return r.y; });
    const countries = new Set(list.map(function (r) { return r.bc; }).filter(Boolean));
    let html = '<p><b>' + esc(c) + '</b> is one of the six Nobel fields. In the dataset it has <b>' + fmtInt(list.length) +
      '</b> laureates across <b>' + prizes + '</b> prizes (' + pct(list.length, d.length) + '% of all records).</p>';
    html += table(['Measure', 'Value'], [
      ['First award', Math.min.apply(null, ys)],
      ['Most recent', Math.max.apply(null, ys)],
      ['Women', women + ' of ' + ind.length + ' individuals (' + pct(women, ind.length) + '%)'],
      ['Mean age', ages.length ? N.mean(ages).toFixed(1) + ' years' : '—'],
      ['Median age', ages.length ? N.quantile(ages, 0.5).toFixed(0) + ' years' : '—'],
      ['Birth countries', countries.size]
    ]);
    html += '<p class="chat-hint">Ask “who won ' + esc(c.toLowerCase()) + ' in 2004” for a specific year.</p>';
    return html;
  }

  function aCountry(c) {
    const d = recs();
    const born = d.filter(function (r) { return r.bc === c; });
    const aff = d.filter(function (r) { return r.ac === c; });
    if (!born.length && !aff.length) return '<p>I have no records for <b>' + esc(c) + '</b> in this selection.</p>';
    const byCat = new Map();
    born.forEach(function (r) { byCat.set(r.c, (byCat.get(r.c) || 0) + 1); });
    const topCat = Array.from(byCat.entries()).sort(function (a, b) { return b[1] - a[1]; })[0];
    const ys = born.map(function (r) { return r.y; });
    let html = '<p><b>' + esc(c) + '</b>: <b>' + born.length + '</b> laureates were born there (' + pct(born.length, d.length) +
      '% of the selection).</p>';
    const rows = [
      ['Born there', born.length],
      ['Affiliated there at award', aff.length],
      ['Net', (aff.length - born.length > 0 ? '+' : '') + (aff.length - born.length)]
    ];
    if (born.length) {
      rows.push(['First / latest award', Math.min.apply(null, ys) + ' / ' + Math.max.apply(null, ys)]);
      if (topCat) rows.push(['Strongest field', esc(topCat[0]) + ' (' + topCat[1] + ')']);
      const women = born.filter(function (r) { return r.t === 'Female'; }).length;
      const ind = born.filter(function (r) { return r.ind; }).length;
      if (ind) rows.push(['Women', women + ' of ' + ind + ' (' + pct(women, ind) + '%)']);
    }
    html += table(['Measure', 'Value'], rows);
    if (born.length > 1) {
      const sample = born.slice().sort(function (a, b) { return a.y - b.y; }).slice(0, 5);
      html += '<p><b>Earliest laureates born there:</b> ' + sample.map(function (r) { return esc(r.n) + ' (' + r.y + ')'; }).join(', ') + '.</p>';
    }
    return html;
  }

  function aWomen(cats) {
    const d = recs();
    let list = d.filter(function (r) { return r.ind; });
    if (cats.length) list = list.filter(function (r) { return cats.indexOf(r.c) !== -1; });
    const women = list.filter(function (r) { return r.t === 'Female'; });
    if (!women.length) return '<p>No women in this selection.</p>';
    const first = women.slice().sort(function (a, b) { return a.y - b.y; })[0];
    const byCat = new Map();
    list.forEach(function (r) {
      if (!byCat.has(r.c)) byCat.set(r.c, { n: 0, f: 0 });
      const o = byCat.get(r.c);
      o.n++;
      if (r.t === 'Female') o.f++;
    });
    const rows = Array.from(byCat.entries()).sort(function (a, b) { return b[1].f - a[1].f; }).map(function (e) {
      return [esc(e[0]), e[1].f, pct(e[1].f, e[1].n) + '%'];
    });
    return '<p><b>' + women.length + '</b> of <b>' + list.length + '</b> individual laureates are women — <b>' +
      pct(women.length, list.length) + '%</b>.</p>' +
      '<p>The first was <b>' + esc(first.n) + '</b> (' + esc(first.c) + ', ' + first.y + ').</p>' +
      table(['Field', 'Women', 'Share of field'], rows);
  }

  function aAge(cats) {
    const d = recs();
    let list = d;
    if (cats.length) list = list.filter(function (r) { return cats.indexOf(r.c) !== -1; });
    const withAge = list.filter(function (r) { return isNum(r.age); });
    if (!withAge.length) return '<p>No age data in this selection.</p>';
    const ages = withAge.map(function (r) { return r.age; });
    const youngest = withAge.slice().sort(function (a, b) { return a.age - b.age; })[0];
    const oldest = withAge.slice().sort(function (a, b) { return b.age - a.age; })[0];
    return '<p>Across <b>' + withAge.length + '</b> laureates with a known birth year, the mean age at award is <b>' +
      N.mean(ages).toFixed(1) + '</b> and the median is <b>' + N.quantile(ages, 0.5).toFixed(0) + '</b>.</p>' +
      table(['Measure', 'Value'], [
        ['Youngest', esc(youngest.n) + ' — ' + youngest.age.toFixed(0) + ' (' + esc(youngest.c) + ' ' + youngest.y + ')'],
        ['Oldest', esc(oldest.n) + ' — ' + oldest.age.toFixed(0) + ' (' + esc(oldest.c) + ' ' + oldest.y + ')'],
        ['Middle 50%', N.quantile(ages, 0.25).toFixed(0) + '–' + N.quantile(ages, 0.75).toFixed(0) + ' years'],
        ['Age range', Math.min.apply(null, ages).toFixed(0) + '–' + Math.max.apply(null, ages).toFixed(0)]
      ]);
  }

  function aExtreme(kind, cats) {
    const d = recs();
    let list = d.filter(function (r) { return isNum(r.age); });
    if (cats.length) list = list.filter(function (r) { return cats.indexOf(r.c) !== -1; });
    if (!list.length) return '<p>No age data for that selection.</p>';
    list.sort(function (a, b) { return kind === 'youngest' ? a.age - b.age : b.age - a.age; });
    const top = list.slice(0, 5);
    const label = kind === 'youngest' ? 'youngest' : 'oldest';
    return '<p>The <b>' + label + '</b> laureates' + (cats.length ? ' in ' + esc(cats[0]) : '') + ':</p>' +
      table(['Name', 'Age', 'Prize'], top.map(function (r) {
        return [esc(r.n), r.age.toFixed(0), esc(r.c + ' ' + r.y)];
      })) + '<p>' + searchBtn(top[0].n) + '</p>';
  }

  function aMoney() {
    const d = recs();
    const seen = new Map();
    d.forEach(function (r) { if (isNum(r.padj)) seen.set(r.y + '|' + r.c, r.padj); });
    const vals = Array.from(seen.values());
    if (!vals.length) return '<p>No prize values in this selection.</p>';
    const byYear = new Map();
    seen.forEach(function (v, k) { byYear.set(+k.split('|')[0], v); });
    const ys = Array.from(byYear.keys()).sort(function (a, b) { return a - b; });
    const first = byYear.get(ys[0]), last = byYear.get(ys[ys.length - 1]);
    const maxY = ys.slice().sort(function (a, b) { return byYear.get(b) - byYear.get(a); })[0];
    return '<p>The Nobel Prize is a fixed sum in Swedish kronor, converted here to <b>inflation-adjusted USD</b>.</p>' +
      table(['Measure', 'Value'], [
        ['First year in data', ys[0] + ' — ' + money(first)],
        ['Latest year', ys[ys.length - 1] + ' — ' + money(last)],
        ['Highest adjusted value', maxY + ' — ' + money(byYear.get(maxY))],
        ['Lowest adjusted value', money(Math.min.apply(null, vals))],
        ['Mean adjusted value', money(N.mean(vals))]
      ]) +
      '<p class="chat-hint">The value is per prize, not per laureate. A shared prize is split between winners.</p>';
  }

  function aMigration() {
    const d = recs();
    const known = d.filter(function (r) { return r.mig === true || r.mig === false; });
    const movers = known.filter(function (r) { return r.mig; });
    const birth = new Map(), aff = new Map();
    d.forEach(function (r) {
      if (r.bc) birth.set(r.bc, (birth.get(r.bc) || 0) + 1);
      if (r.ac) aff.set(r.ac, (aff.get(r.ac) || 0) + 1);
    });
    const names = new Set([].concat(Array.from(birth.keys()), Array.from(aff.keys())));
    const net = Array.from(names).map(function (k) {
      return { k: k, v: (aff.get(k) || 0) - (birth.get(k) || 0) };
    }).sort(function (a, b) { return b.v - a.v; });
    const gain = net.slice(0, 3);
    const loss = net.slice(-3).reverse();
    const flows = new Map();
    movers.forEach(function (r) {
      const k = r.bc + '→' + r.ac;
      flows.set(k, (flows.get(k) || 0) + 1);
    });
    const topFlows = Array.from(flows.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4);
    return '<p><b>Brain drain:</b> of the <b>' + known.length + '</b> laureates with a recorded affiliation, <b>' + movers.length +
      '</b> (' + pct(movers.length, known.length) + '%) worked outside their birth country.</p>' +
      '<p><b>Net gains:</b> ' + gain.map(function (g) { return esc(g.k) + ' (' + (g.v > 0 ? '+' : '') + g.v + ')'; }).join(', ') + '.<br>' +
      '<b>Net losses:</b> ' + loss.map(function (g) { return esc(g.k) + ' (' + g.v + ')'; }).join(', ') + '.</p>' +
      '<p><b>Busiest corridors:</b> ' + topFlows.map(function (f) { return esc(f[0].replace('→', ' → ')) + ' (' + f[1] + ')'; }).join(', ') + '.</p>' +
      '<p class="chat-hint">253 records have no affiliation, so they cannot be classified.</p>';
  }

  function aCollab() {
    const d = recs();
    const shared = d.filter(function (r) { return r.collab; }).length;
    const byDec = new Map();
    d.forEach(function (r) {
      if (!byDec.has(r.dec)) byDec.set(r.dec, { n: 0, s: 0 });
      const o = byDec.get(r.dec);
      o.n++;
      if (r.collab) o.s++;
    });
    const decs = Array.from(byDec.keys()).sort(function (a, b) { return a - b; });
    const rows = decs.map(function (dec) {
      const o = byDec.get(dec);
      return [dec + 's', o.s + ' of ' + o.n, pct(o.s, o.n) + '%'];
    });
    return '<p><b>' + pct(shared, d.length) + '%</b> of laureates shared their prize with at least one other person.</p>' +
      table(['Decade', 'Shared', 'Share'], rows);
  }

  function aRepeat() {
    const d = recs();
    const m = new Map();
    d.forEach(function (r) { if (r.n) { if (!m.has(r.n)) m.set(r.n, []); m.get(r.n).push(r); } });
    const reps = Array.from(m.entries()).filter(function (e) { return e[1].length > 1; })
      .sort(function (a, b) { return b[1].length - a[1].length || a[1][0].y - b[1][0].y; });
    if (!reps.length) return '<p>No repeat winners in this selection.</p>';
    return '<p>Only <b>' + reps.length + '</b> names won more than once in this selection. Winning twice is extremely rare:</p>' +
      table(['Name', 'Prizes'], reps.slice(0, 10).map(function (e) {
        return [esc(e[0]), e[1].map(function (r) { return esc(r.c) + ' ' + r.y; }).join('<br>')];
      }));
  }

  function aInstitution(inst) {
    const d = recs();
    const list = d.filter(function (r) { return r.inst === inst; });
    if (!list.length) return '<p>No laureates with <b>' + esc(inst) + '</b> as their affiliation in this selection.</p>';
    const ys = list.map(function (r) { return r.y; });
    const cats = new Map();
    list.forEach(function (r) { cats.set(r.c, (cats.get(r.c) || 0) + 1); });
    const top = Array.from(cats.entries()).sort(function (a, b) { return b[1] - a[1]; })[0];
    return '<p><b>' + esc(inst) + '</b> hosted <b>' + list.length + '</b> laureates at the time of their award (' +
      Math.min.apply(null, ys) + '–' + Math.max.apply(null, ys) + ').</p>' +
      table(['Name', 'Prize'], list.slice().sort(function (a, b) { return a.y - b.y; }).slice(0, 8).map(function (r) {
        return [esc(r.n), esc(r.c + ' ' + r.y)];
      })) + (top ? '<p>Most of them won <b>' + esc(top[0]) + '</b> (' + top[1] + ').</p>' : '');
  }

  function aTopCountries() {
    const d = recs();
    const m = new Map();
    d.forEach(function (r) { if (r.bc) m.set(r.bc, (m.get(r.bc) || 0) + 1); });
    const rows = Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
    return '<p>Countries with the most laureates <b>born</b> there (modern borders):</p>' +
      table(['Country', 'Laureates', 'Share'], rows.map(function (e) {
        return [esc(e[0]), e[1], pct(e[1], d.length) + '%'];
      }));
  }

  function aTopInst() {
    const d = recs();
    const m = new Map();
    d.forEach(function (r) { if (r.inst) m.set(r.inst, (m.get(r.inst) || 0) + 1); });
    const rows = Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
    return '<p>Institutions with the most laureates at the time of the award:</p>' +
      table(['Institution', 'Laureates'], rows.map(function (e) { return [esc(e[0]), e[1]]; }));
  }

  function aTopCats() {
    const d = recs();
    const m = new Map();
    d.forEach(function (r) { m.set(r.c, (m.get(r.c) || 0) + 1); });
    const rows = Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1]; });
    return '<p>Laureates per field:</p>' + table(['Field', 'Laureates', 'Share'], rows.map(function (e) {
      return [esc(e[0]), e[1], pct(e[1], d.length) + '%'];
    }));
  }

  function aTotals() {
    const d = recs();
    const f = N.facts(d);
    return '<p>The selection covers <b>' + N.YEARS[0] + '–' + N.YEARS[1] + '</b> with <b>' + fmtInt(f.rows) +
      '</b> laureate records and <b>' + fmtInt(f.prizes) + '</b> prizes, in <b>' + f.cats + '</b> fields and <b>' +
      f.countries + '</b> birth countries.</p>' +
      table(['Measure', 'Value'], [
        ['Individuals', f.individuals],
        ['Women', f.female + ' (' + f.femalePct.toFixed(1) + '%)'],
        ['Organisations', f.orgs],
        ['Mean age', f.meanAge == null ? '—' : f.meanAge.toFixed(1) + ' years'],
        ['Institutions', f.insts],
        ['Shared prizes', pct(d.filter(function (r) { return r.collab; }).length, d.length) + '%']
      ]);
  }

  function aGlossary(s) {
    if (/\bportion\b|\bshare\b|\b1 3\b|\bthird\b|\bhalf\b/.test(s) && !/how many/.test(s)) {
      return '<p><b>Portion</b> is the laureate’s share of the prize money. <b>1/1</b> means they won alone, <b>1/2</b> means the prize was split in two, ' +
        '<b>1/3</b> in three. The Nobel statutes allow at most three laureates per prize, and a share can also be split as 1/2 + 1/4 + 1/4.</p>';
    }
    if (/adjust|inflation|worth|money|value|usd|dollar/.test(s)) {
      return aMoney();
    }
    if (/brain drain|migrat|immigra|abroad|move/.test(s)) {
      return aMigration();
    }
    return null;
  }

  function aSearch(s) {
    const q = s.trim();
    if (q.length < 3) return null;
    const d = recs();
    const hits = d.filter(function (r) { return r._s.indexOf(q) !== -1; });
    if (!hits.length) return null;
    const rows = hits.slice(0, 6).map(function (r) {
      return [esc(r.n), esc(r.c), r.y];
    });
    return '<p>I found <b>' + hits.length + '</b> records matching “' + esc(q) + '”' +
      (hits.length > 6 ? ' (showing 6)' : '') + ':</p>' + table(['Name', 'Field', 'Year'], rows);
  }

  /* ---------------- router ---------------- */
  function answer(text) {
    const raw = String(text || '').trim();
    const s = norm(raw);
    if (!raw) return aHelp();
    if (/^(hi|hello|hey|good morning|good evening|salam|hola)\b/.test(s.trim()) || /^(hi|hello|hey)$/.test(s.trim())) return aHello();
    if (/\b(help|what can you|how do i use|examples?|what do you know)\b/.test(s)) return aHelp();
    if (/^(thanks|thank you|thx|great|nice|cool)\b/.test(s.trim())) return '<p>You’re welcome. Ask me anything else about the Nobel record 🙂</p>';

    const cats = CAT_RE.filter(function (c) { return c.re.test(s); }).map(function (c) { return c.key; });
    const yearM = s.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearM ? +yearM[1] : null;
    const country = findCountry(s);
    const inst = findInst(s);
    const wantsWho = /\b(who|whom|list|name|names|show)\b/.test(s);
    const wantsCount = /\b(how many|how much|count|number|total)\b/.test(s);
    const wantsTop = /\b(most|top|highest|largest|leading|rank)\b/.test(s);

    /* compare two people */
    if (/\b(compare|versus|vs)\b/.test(s)) {
      const parts = raw.split(/\b(?:vs\.?|versus|and|with)\b/i);
      const found = [];
      parts.forEach(function (part) {
        const f = findPeople(norm(part));
        if (f.length && f[0].score >= 1.6) found.push(f[0].p);
      });
      if (found.length >= 2) {
        return '<p><b>' + esc(found[0].name) + '</b> vs <b>' + esc(found[1].name) + '</b>:</p>' +
          table(['Measure', esc(found[0].name), esc(found[1].name)], [
            ['Field', esc(found[0].recs[0].c), esc(found[1].recs[0].c)],
            ['Year', years(found[0]), years(found[1])],
            ['Age', isNum(found[0].recs[0].age) ? found[0].recs[0].age.toFixed(0) : '—', isNum(found[1].recs[0].age) ? found[1].recs[0].age.toFixed(0) : '—'],
            ['Born', esc(found[0].recs[0].bc || '—'), esc(found[1].recs[0].bc || '—')],
            ['Institution', esc(found[0].recs[0].inst || '—'), esc(found[1].recs[0].inst || '—')],
            ['Prize (adj.)', money(found[0].recs[0].padj), money(found[1].recs[0].padj)]
          ]);
      }
    }

    /* glossary terms */
    if (!year && !country && !cats.length) {
      const g = aGlossary(s);
      if (g) return g;
    }

    /* specific year */
    if (year) return aYear(year, cats);

    /* people */
    const people = findPeople(s);
    if (people.length) {
      const strong = people[0].score >= 2.4 || (!STATS_RE.test(s) && people[0].score >= 1.5);
      if (strong) {
        if (people.length > 1 && people[1].score === people[0].score && people[1].p.name !== people[0].p.name) {
          return aAmbiguous(people.filter(function (x) { return x.score >= people[0].score - 0.2; }), raw);
        }
        return aProfile(people[0].p);
      }
      if (!STATS_RE.test(s) && people[0].score >= 1.3) {
        return aAmbiguous(people.slice(0, 6), raw);
      }
    }

    /* institutions */
    if (inst && (wantsCount || wantsWho || wantsTop || /\b(laureates?|winners?|won)\b/.test(s))) {
      return aInstitution(inst);
    }

    /* countries */
    if (country) {
      if (wantsWho && !wantsCount) {
        const list = recs().filter(function (r) { return r.bc === country; }).sort(function (a, b) { return a.y - b.y; });
        if (list.length) {
          return '<p>Laureates born in <b>' + esc(country) + '</b> (' + list.length + '):</p>' +
            table(['Name', 'Prize'], list.slice(0, 8).map(function (r) { return [esc(r.n), esc(r.c + ' ' + r.y)]; }));
        }
      }
      return aCountry(country);
    }

    /* top lists */
    if (wantsTop) {
      if (/\b(institution|university|universities|lab|laboratory|institute)\b/.test(s)) return aTopInst();
      if (/\b(countr(y|ies)|nation|born|birth)\b/.test(s)) return aTopCountries();
      if (/\b(categor|field|discipline|subject)\b/.test(s)) return aTopCats();
      if (/\b(prize|won|winner)\b/.test(s)) return aRepeat();
    }

    /* gender */
    if (/\b(women|woman|female|females|gender)\b/.test(s)) return aWomen(cats);

    /* age */
    if (/\byoungest\b|\bthe youngest\b/.test(s)) return aExtreme('youngest', cats);
    if (/\boldest\b/.test(s)) return aExtreme('oldest', cats);
    if (/\bage\b|\bhow old\b/.test(s)) return aAge(cats);

    /* money */
    if (/\b(money|prize amount|worth|value|usd|dollar|inflation|adjusted|amount)\b/.test(s)) return aMoney();

    /* migration */
    if (/\b(brain drain|migrat|immigra|abroad|emigrat)\b/.test(s)) return aMigration();

    /* collaboration */
    if (/\b(collaborat|team|shared|share the prize|alone|solo)\b/.test(s)) return aCollab();

    /* repeat winners */
    if (/\b(twice|more than once|multiple|repeat|again)\b/.test(s)) return aRepeat();

    /* categories */
    if (cats.length) {
      if (cats.length > 1 && (wantsCount || /\b(combined|together)\b/.test(s))) {
        const d = recs().filter(function (r) { return cats.indexOf(r.c) !== -1; });
        const f = N.facts(d);
        return '<p>Combined, <b>' + cats.map(function (c) { return esc(c); }).join(' + ') + '</b> account for <b>' +
          fmtInt(f.rows) + '</b> laureates and <b>' + fmtInt(f.prizes) + '</b> prizes (' + pct(f.rows, recs().length) + '% of records).</p>' +
          table(['Field', 'Laureates'], cats.map(function (c) {
            return [esc(c), d.filter(function (r) { return r.c === c; }).length];
          }));
      }
      return aCategory(cats[0]);
    }

    /* totals */
    if (wantsCount || /\b(total|dataset|overall|summary|overview)\b/.test(s)) return aTotals();

    /* free search */
    const found = aSearch(s);
    if (found) return found;

    return '<p>I’m not sure how to answer that one yet. I’m a data assistant — I answer from the Nobel dataset rather than general knowledge.</p>' +
      '<p>Try one of these:</p><ul class="chat-ul">' +
      '<li>“Who won Physics in 1969?”</li>' +
      '<li>“How many women have won in Chemistry?”</li>' +
      '<li>“Which country has the most laureates?”</li>' +
      '<li>“Tell me about Marie Curie”</li>' +
      '<li>“What is the average age?”</li>' +
      '</ul>';
  }

  /* ---------------- UI ---------------- */
  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat');
  const logEl = document.getElementById('chat-log');
  const chipsEl = document.getElementById('chat-chips');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const closeBtn = document.getElementById('chat-close');
  const filterToggle = document.getElementById('chat-filter');
  if (!fab || !panel) return;

  const SUGGESTIONS = [
    'Who won Physics in 1969?',
    'Which country has the most laureates?',
    'How many women have won?',
    'Who is the youngest laureate?',
    'Tell me about Marie Curie',
    'What is the average age?',
    'Explain brain drain',
    'Which institution has the most laureates?',
    'How much is the prize worth?',
    'Who won twice?'
  ];

  function renderChips() {
    chipsEl.innerHTML = SUGGESTIONS.map(function (q) {
      return '<button class="chat-chip" type="button">' + esc(q) + '</button>';
    }).join('');
  }

  function add(role, html) {
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    el.innerHTML = (role === 'bot' ? '<span class="msg-avatar">N</span>' : '') +
      '<div class="msg-body">' + html + '</div>';
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    return el;
  }

  let busy = false;
  function send(text) {
    const q = String(text || '').trim();
    if (!q || busy) return;
    busy = true;
    input.value = '';
    add('user', esc(q));
    const typing = add('bot', '<span class="typing"><i></i><i></i><i></i></span>');
    const delay = 220 + Math.min(600, q.length * 8);
    setTimeout(function () {
      let html;
      try {
        html = answer(q);
      } catch (e) {
        html = '<p>Something went wrong while reading the data. Try rephrasing the question.</p>';
      }
      typing.querySelector('.msg-body').innerHTML = html;
      logEl.scrollTop = logEl.scrollHeight;
      busy = false;
    }, delay);
  }

  function openChat() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    fab.classList.add('hidden');
    if (!logEl.childElementCount) {
      add('bot', '<p>Hi! I’m the <b>Nobel Assistant</b>. Ask me anything about the prize — people, years, countries, records or trends.</p>' +
        '<p class="chat-hint">I answer from this dataset: 950 laureates, 597 prizes, 1901–2019. No internet needed.</p>');
    }
    setTimeout(function () { input.focus(); }, 120);
  }
  function closeChat() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    fab.classList.remove('hidden');
  }

  fab.addEventListener('click', openChat);
  const heroAsk = document.getElementById('hero-ask');
  if (heroAsk) heroAsk.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    send(input.value);
  });

  chipsEl.addEventListener('click', function (e) {
    const b = e.target.closest('.chat-chip');
    if (b) send(b.textContent);
  });

  logEl.addEventListener('click', function (e) {
    const b = e.target.closest('[data-search]');
    if (!b) return;
    const name = b.getAttribute('data-search');
    const q = document.getElementById('q');
    q.value = name;
    q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-tab="people"]').click();
    closeChat();
  });

  if (filterToggle) {
    filterToggle.addEventListener('change', function () {
      useFilters = this.checked;
      add('bot', useFilters
        ? '<p>OK — answers now use only the <b>current filter selection</b> (' + fmtInt(N.data().length) + ' records).</p>'
        : '<p>OK — answers now use the <b>full dataset</b> (' + fmtInt(R.length) + ' records).</p>');
    });
  }

  renderChips();
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) closeChat();
  });
})();
