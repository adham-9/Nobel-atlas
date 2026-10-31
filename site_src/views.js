/* ============================================================
   Nobel Atlas — views, filters, tables, modal
   ============================================================ */
(function () {
  'use strict';

  const N = window.NA;
  const state = N.state;
  const R = N.R;
  const PAL = N.PAL;
  const CATS = N.CATS;
  const TYPES = N.TYPES;
  const WORLD = N.WORLD;
  const esc = N.esc;
  const fmtInt = N.fmtInt;
  const money = N.money;
  const pct = N.pct;
  const isNum = N.isNum;
  const catColor = N.catColor;
  const typeColor = N.typeColor;
  const shortCat = function (c) { return N.CAT_SHORT[c] || c; };

  const $ = function (id) { return document.getElementById(id); };
  const CAT_VAR = {
    'Physics': '--c-physics', 'Chemistry': '--c-chemistry', 'Physiology or Medicine': '--c-medicine',
    'Literature': '--c-literature', 'Peace': '--c-peace', 'Economic Sciences': '--c-econ'
  };
  const TYPE_VAR = { 'Male': '--c-male', 'Female': '--c-female', 'Organization': '--c-org' };

  /* ============================ overview ============================ */
  function kpi(v, label, sub) {
    return '<div class="kpi"><b>' + v + '</b><span>' + label + '</span>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  }

  function renderOverview() {
    const d = N.data();
    const f = N.facts(d);
    const filtered = d.length !== R.length;

    $('kpis').innerHTML = [
      kpi(fmtInt(f.rows), 'Laureate records', filtered ? 'in current selection' : 'full dataset'),
      kpi(fmtInt(f.prizes), 'Prizes', 'distinct year + field'),
      kpi(f.cats, 'Fields', 'categories represented'),
      kpi(f.countries, 'Birth countries', 'modern borders'),
      kpi(f.meanAge == null ? '—' : f.meanAge.toFixed(1), 'Mean age', 'at the time of award'),
      kpi(fmtInt(f.female), 'Women', f.femalePct.toFixed(1) + '% of individuals'),
      kpi(fmtInt(f.orgs), 'Organisations', f.orgPct.toFixed(1) + '% of records'),
      kpi(fmtInt(f.insts), 'Institutions', 'recorded at the award'),
      kpi(money(f.pool), 'Prize pool', 'inflation-adjusted'),
      kpi(f.migPct.toFixed(0) + '%', 'Worked abroad', f.migrants + ' of ' + f.migN + ' known')
    ].join('');

    /* --- awards per year --- */
    const years = [];
    for (let y = state.y0; y <= state.y1; y++) years.push(y);
    const byYear = N.groupBy(d, 'y');
    const yearRows = years.map(function (y) {
      const list = byYear.get(y) || [];
      const cats = new Set(list.map(function (r) { return r.c; }));
      return { label: String(y), value: cats.size };
    });
    N.comboYear($('c-year'), yearRows, { height: 330 });

    const busiest = yearRows.slice().sort(function (a, b) { return b.value - a.value; })[0];
    if (busiest && busiest.value) {
      const peak = yearRows.filter(function (r) { return r.value === busiest.value; });
      let peakText;
      if (peak.length > 4) {
        peakText = 'A high of <b>' + busiest.value + '</b> prizes was reached in <b>' + peak.length + '</b> different years, including <b>' +
          peak.slice(0, 3).map(function (r) { return r.label; }).join(', ') + '</b>.';
      } else if (peak.length > 1) {
        peakText = 'The busiest years are <b>' + peak.map(function (r) { return r.label; }).join(', ') + '</b> with <b>' +
          busiest.value + '</b> prizes each.';
      } else {
        peakText = 'The busiest year is <b>' + busiest.label + '</b> with <b>' + busiest.value + '</b> ' +
          (busiest.value === 1 ? 'prize' : 'prizes') + '.';
      }
      N.setNote('tk-year', peakText + ' Across the whole selection there are <b>' + fmtInt(f.prizes) +
        '</b> prizes and <b>' + fmtInt(f.rows) + '</b> laureate records.');
    } else {
      N.setNote('tk-year', 'No prizes in this selection.');
    }

    /* --- winner type --- */
    const byType = N.groupBy(d, 't');
    const typeItems = TYPES.map(function (t) {
      return { label: t, value: (byType.get(t) || []).length, color: typeColor(t) };
    }).filter(function (i) { return i.value > 0; });
    N.donut($('c-type'), typeItems, {
      height: 330, centerLabel: 'laureates',
      onClick: function (it) { toggleType(it.label); }
    });
    N.setNote('tk-type', f.orgs
      ? 'Organisations are <b>' + pct(f.orgs, f.rows) + '%</b> of the selection and win <b>' +
        (N.groupBy(d, 't').get('Organization') || []).filter(function (r) { return r.c === 'Peace'; }).length +
        '</b> of the Peace prizes. Among individuals, <b>' + f.femalePct.toFixed(1) + '%</b> are women.'
      : 'No organisations in this selection — it contains individuals only.');

    /* --- categories --- */
    const byCat = N.groupBy(d, 'c');
    const catRows = CATS.filter(function (c) { return byCat.has(c); }).map(function (c) {
      return { label: c, value: byCat.get(c).length, color: catColor(c), key: c };
    }).sort(function (a, b) { return b.value - a.value; });
    N.hBar($('c-cat'), catRows, {
      height: 300, tipLabel: 'Laureates', labelW: 172,
      onClick: function (r) { toggleCat(r.key); }
    });
    const topCat = catRows[0];
    N.setNote('tk-cat', topCat
      ? '<b>' + topCat.label + '</b> is the largest field in this selection with <b>' + topCat.value +
        '</b> laureates (' + pct(topCat.value, f.rows) + '%). Click a bar to add or remove that field as a filter.'
      : 'No categories in this selection.');

    /* --- countries --- */
    const byCountry = N.groupBy(d, 'bc');
    const countryRows = Array.from(byCountry.entries())
      .map(function (e) { return { label: e[0], value: e[1].length, key: e[0], color: N.PAL.accent }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 12);
    N.hBar($('c-country'), countryRows, {
      height: 300, tipLabel: 'Laureates', labelW: 148,
      onClick: function (r) { setCountry(r.key); }
    });
    const top = countryRows[0];
    N.setNote('tk-country', top
      ? '<b>' + esc(top.label) + '</b> leads with <b>' + top.value + '</b> laureates born there (' +
        pct(top.value, f.rows) + '% of the selection). ' + f.countries + ' countries appear in total.'
      : 'No birth countries in this selection.');

    /* --- findings --- */
    const findings = [];
    findings.push('Between <b>' + state.y0 + '</b> and <b>' + state.y1 + '</b> the dataset holds <b>' +
      fmtInt(f.rows) + '</b> laureate records across <b>' + fmtInt(f.prizes) + '</b> prizes — an average of ' +
      (f.prizes ? (f.rows / f.prizes).toFixed(1) : '0') + ' laureates per prize.');

    const byDec = N.groupBy(d, 'dec');
    const decPrizes = Array.from(byDec.entries()).map(function (e) {
      return { dec: +e[0], n: new Set(e[1].map(function (r) { return r.y + '|' + r.c; })).size };
    }).sort(function (a, b) { return b.n - a.n; });
    if (decPrizes.length) {
      findings.push('The busiest decade is the <b>' + decPrizes[0].dec + 's</b> with <b>' + decPrizes[0].n + '</b> prizes; the quietest is the <b>' +
        decPrizes[decPrizes.length - 1].dec + 's</b> with <b>' + decPrizes[decPrizes.length - 1].n + '</b>.');
    }

    if (f.individuals) {
      findings.push('Women are <b>' + f.femalePct.toFixed(1) + '%</b> of individual laureates (' + f.female + ' of ' + f.individuals +
        '). Organisations make up the rest of the non-individual records (' + f.orgs + ').');
    }

    const catAges = CATS.map(function (c) {
      const ages = (byCat.get(c) || []).map(function (r) { return r.age; }).filter(isNum);
      return ages.length > 2 ? { c: c, mean: N.mean(ages), n: ages.length } : null;
    }).filter(Boolean).sort(function (a, b) { return b.mean - a.mean; });
    if (catAges.length === 1) {
      findings.push('In <b>' + catAges[0].c + '</b> the mean age at award is <b>' + catAges[0].mean.toFixed(1) +
        '</b> years (' + catAges[0].n + ' laureates with a known birth year). Add another field to compare ages.');
    } else if (catAges.length > 1) {
      findings.push('<b>' + catAges[0].c + '</b> laureates are the oldest on average (<b>' + catAges[0].mean.toFixed(1) +
        '</b> years), while <b>' + catAges[catAges.length - 1].c + '</b> laureates are the youngest (<b>' +
        catAges[catAges.length - 1].mean.toFixed(1) + '</b>).');
    }

    const shared = d.filter(function (r) { return r.collab; }).length;
    findings.push('<b>' + pct(shared, f.rows) + '%</b> of laureates in this selection shared their prize with at least one other person.');
    if (f.migN) {
      findings.push('<b>' + f.migPct.toFixed(0) + '%</b> of laureates with a known affiliation worked outside their birth country (' +
        f.migrants + ' of ' + f.migN + ').');
    }

    $('ov-insights').innerHTML = findings.map(function (t, i) {
      return '<li><span class="n">' + (i + 1) + '</span><div>' + t + '</div></li>';
    }).join('');
  }

  /* ============================ time ============================ */
  function renderTime() {
    const d = N.data();
    const f = N.facts(d);

    const byDec = N.groupBy(d, 'dec');
    const decs = Array.from(byDec.keys()).map(Number).sort(function (a, b) { return a - b; });
    const decRows = decs.map(function (dec) {
      const list = byDec.get(dec) || [];
      const prizes = new Set(list.map(function (r) { return r.y + '|' + r.c; })).size;
      return { label: dec + 's', value: prizes, key: dec, extra: '<span class="t-k">Laureates:</span> <b>' + list.length + '</b>' };
    });
    N.vBar($('c-decade'), decRows, {
      height: 300, tipLabel: 'Prizes', metric: 'count',
      onClick: function (r) { setYears(r.key, r.key + 9); }
    });
    if (decRows.length) {
      const peak = decRows.slice().sort(function (a, b) { return b.value - a.value; })[0];
      const first = decRows[0], last = decRows[decRows.length - 1];
      N.setNote('tk-decade', 'Prizes peaked in the <b>' + peak.label + '</b> (<b>' + peak.value + '</b>). ' +
        'From the ' + first.label + ' to the ' + last.label + ' the number of prizes grew from <b>' + first.value + '</b> to <b>' +
        last.value + '</b>. Click a bar to zoom the whole page to that decade.');
    }

    /* collaboration */
    const collabSeries = [
      { name: 'Solo winner', color: N.PAL.type.Male, values: [] },
      { name: 'Shared prize', color: N.PAL.gold, values: [] }
    ];
    decs.forEach(function (dec) {
      const list = byDec.get(dec) || [];
      collabSeries[0].values.push(list.filter(function (r) { return !r.collab; }).length);
      collabSeries[1].values.push(list.filter(function (r) { return r.collab; }).length);
    });
    N.stackedBars($('c-collab'), { cats: decs.map(function (x) { return x + 's'; }), series: collabSeries, pct: true, height: 300, legend: true });
    if (decs.length) {
      const lastList = byDec.get(decs[decs.length - 1]) || [];
      const sh = pct(lastList.filter(function (r) { return r.collab; }).length, lastList.length);
      N.setNote('tk-collab', 'In the <b>' + decs[decs.length - 1] + 's</b>, <b>' + sh +
        '%</b> of laureates shared their prize. The shift from solo to team science is one of the clearest trends in the data.');
    }

    /* share dilution */
    const shareMap = { '1': '1/1 (sole)', '1/2': '1/2', '1/3': '1/3', '1/4': '1/4' };
    const shareNames = ['1/1 (sole)', '1/2', '1/3', '1/4'];
    const shareSeries = shareNames.map(function (s) { return { name: s, color: N.PAL.share[s], values: [] }; });
    decs.forEach(function (dec) {
      const list = byDec.get(dec) || [];
      shareNames.forEach(function (s, si) {
        shareSeries[si].values.push(list.filter(function (r) { return shareMap[r.p] === s; }).length);
      });
    });
    N.stackedBars($('c-share'), { cats: decs.map(function (x) { return x + 's'; }), series: shareSeries, pct: true, height: 300, legend: true });
    const soleShare = pct(d.filter(function (r) { return r.p === '1'; }).length, f.rows);
    N.setNote('tk-share', 'Only <b>' + soleShare + '%</b> of records are sole winners. The Nobel statutes cap a prize at three laureates, which is why <b>1/3</b> is the most a shared prize can be split.');

    /* age trend */
    const catSeries = CATS.map(function (c) {
      return { name: shortCat(c), color: catColor(c), values: decs.map(function (dec) {
        const ages = (byDec.get(dec) || []).filter(function (r) { return r.c === c; }).map(function (r) { return r.age; }).filter(isNum);
        return ages.length > 1 ? N.mean(ages) : null;
      }) };
    }).filter(function (s) { return s.values.some(isNum); });
    N.lineChart($('c-agetrend'), {
      xs: decs, series: catSeries, height: 300, legend: true, zero: false, metric: 'meanAge',
      xFmt: function (x) { return x + 's'; }
    });
    const allAges = d.map(function (r) { return r.age; }).filter(isNum);
    if (allAges.length) {
      const first = allAges.filter(function (v, i) { return true; });
      N.setNote('tk-agetrend', 'The median laureate is <b>' + N.quantile(allAges, 0.5).toFixed(0) +
        '</b> years old at the award. Economics and Literature are consistently the oldest fields, Physics the youngest.');
    }

    N.histogram($('c-agehist'), allAges, { height: 300, median: allAges.length ? N.quantile(allAges, 0.5) : null });
    if (allAges.length) {
      N.setNote('tk-agehist', 'Ages run from <b>' + Math.min.apply(null, allAges).toFixed(0) + '</b> to <b>' +
        Math.max.apply(null, allAges).toFixed(0) + '</b>, with a mean of <b>' + N.mean(allAges).toFixed(1) + '</b> and a median of <b>' +
        N.quantile(allAges, 0.5).toFixed(0) + '</b>. Half of all laureates are between ' +
        N.quantile(allAges, 0.25).toFixed(0) + ' and ' + N.quantile(allAges, 0.75).toFixed(0) + '.');
    }

    /* prize value */
    const prizeRows = decs.map(function (dec) {
      const list = byDec.get(dec) || [];
      const seen = new Set(), vals = [];
      list.forEach(function (r) {
        const k = r.y + '|' + r.c;
        if (!seen.has(k) && isNum(r.padj)) { seen.add(k); vals.push(r.padj); }
      });
      return { label: dec + 's', value: vals.length ? N.mean(vals) : null, label2: vals.length ? money(N.mean(vals)) : '—' };
    }).filter(function (r) { return isNum(r.value); });
    N.vBar($('c-prize'), prizeRows, { height: 300, metric: 'meanPrize', tipLabel: 'Mean prize (adjusted)', rotate: false });
    if (prizeRows.length) {
      const hi = prizeRows.slice().sort(function (a, b) { return b.value - a.value; })[0];
      N.setNote('tk-prize', 'The average prize is worth most in the <b>' + hi.label + '</b> (<b>' + money(hi.value) +
        '</b> adjusted). Nominal amounts look smaller in early decades, but adjusted for inflation the prize has stayed in the same order of magnitude.');
    }
  }

  /* ============================ geography ============================ */
  function renderGeo() {
    const d = N.data();
    const f = N.facts(d);

    const byCountry = N.groupBy(d, 'bc');
    const topCountries = Array.from(byCountry.entries())
      .map(function (e) { return { label: e[0], value: e[1].length, key: e[0], color: N.PAL.accent }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 15);
    N.hBar($('c-geo-top'), topCountries, {
      height: 430, tipLabel: 'Laureates', labelW: 150,
      onClick: function (r) { setCountry(r.key); }
    });
    if (topCountries.length) {
      const sum = topCountries.reduce(function (s, r) { return s + r.value; }, 0);
      N.setNote('tk-geo-top', 'The top 15 countries account for <b>' + pct(sum, f.rows) + '%</b> of laureates in this selection. <b>' +
        esc(topCountries[0].label) + '</b> alone accounts for <b>' + pct(topCountries[0].value, f.rows) + '%</b>.');
    }

    /* map */
    const neCount = new Map();
    byCountry.forEach(function (list, country) {
      const ne = (WORLD.alias && WORLD.alias[country]) || country;
      neCount.set(ne, (neCount.get(ne) || 0) + list.length);
    });
    N.worldMap($('c-map'), neCount, {
      label: WORLD.label || {},
      onClick: function (ne) {
        const back = (WORLD.click && WORLD.click[ne]) || ne;
        if (byCountry.has(back)) setCountry(back);
      }
    });
    const maxNe = Math.max.apply(null, Array.from(neCount.values()).concat([1]));
    $('map-legend').innerHTML =
      '<span>fewer</span><span style="flex:1;max-width:150px;height:8px;border-radius:4px;background:linear-gradient(90deg,' +
      N.PAL.surface3 + ',' + N.PAL.accent + ')"></span><span>' + maxNe + ' laureates</span>' +
      '<span style="margin-left:auto">Click a country to filter</span>';

    /* country × category */
    const top10 = topCountries.slice(0, 10).map(function (r) { return r.label; });
    const catsPresent = CATS.filter(function (c) { return N.groupBy(d, 'c').has(c); });
    N.heatmap($('c-countrycat'), {
      rows: top10, cols: catsPresent, height: 420, legend: true,
      val: function (row, col) {
        const list = byCountry.get(row) || [];
        return list.filter(function (r) { return r.c === col; }).length;
      },
      colFmt: function (c) { return shortCat(c); }
    });
    if (top10.length && catsPresent.length) {
      const topRow = top10[0];
      const list = byCountry.get(topRow) || [];
      const best = catsPresent.map(function (c) { return { c: c, n: list.filter(function (r) { return r.c === c; }).length }; })
        .sort(function (a, b) { return b.n - a.n; })[0];
      N.setNote('tk-countrycat', '<b>' + esc(topRow) + '</b> laureates concentrate in <b>' + shortCat(best.c) + '</b> (' +
        best.n + '). The Peace and Literature columns are spread more evenly across countries than the science columns.');
    }

    /* country × decade */
    const decs = Array.from(new Set(d.map(function (r) { return r.dec; }))).sort(function (a, b) { return a - b; });
    N.heatmap($('c-countrydec'), {
      rows: top10, cols: decs, height: 420, legend: true,
      val: function (row, dec) {
        const list = byCountry.get(row) || [];
        return list.filter(function (r) { return r.dec === dec; }).length;
      },
      colFmt: function (c) { return c + 's'; }
    });
    N.setNote('tk-countrydec', 'The United States is almost invisible before 1930 and dominates after 1945 — a direct consequence of the post-war research economy. European countries peak earlier and then flatten.');

    /* brain drain */
    const byAff = N.groupBy(d, 'ac');
    const names = new Set();
    byCountry.forEach(function (_, k) { names.add(k); });
    byAff.forEach(function (_, k) { names.add(k); });
    const drainRows = Array.from(names).map(function (k) {
      const b = (byCountry.get(k) || []).length;
      const a = (byAff.get(k) || []).length;
      return { label: k, birth: b, aff: a, net: a - b, total: b + a };
    }).sort(function (x, y) { return y.total - x.total; }).slice(0, 12);

    N.groupedHBar($('c-drain'), {
      cats: drainRows.map(function (r) { return r.label; }),
      series: [
        { name: 'Born there', color: N.PAL.surface3 === N.PAL.surface ? N.PAL.muted : N.PAL.type.Male, values: drainRows.map(function (r) { return r.birth; }) },
        { name: 'Working there', color: N.PAL.gold, values: drainRows.map(function (r) { return r.aff; }) }
      ],
      height: 380, rowH: 26
    });
    const gain = drainRows.slice().sort(function (a, b) { return b.net - a.net; })[0];
    N.setNote('tk-drain', gain
      ? 'The clearest magnet is <b>' + esc(gain.label) + '</b>: <b>' + gain.aff + '</b> laureates work there versus <b>' + gain.birth +
        '</b> born there (net <b>' + (gain.net > 0 ? '+' : '') + gain.net + '</b>).'
      : 'No affiliation data in this selection.');

    /* net */
    const netRows = drainRows.slice().sort(function (a, b) { return b.net - a.net; });
    const topGain = netRows.slice(0, 6);
    const topLoss = netRows.slice(-6).reverse();
    const combined = topGain.concat(topLoss.filter(function (r) { return topGain.indexOf(r) === -1; }));
    N.divBar($('c-net'), combined.map(function (r) {
      return { label: r.label, value: r.net, extra: '<span class="t-k">born:</span> <b>' + r.birth + '</b> · <span class="t-k">working:</span> <b>' + r.aff + '</b>' };
    }), { height: 330 });
    N.setNote('tk-net', 'Positive means the country imports scientific talent; negative means it exports it. Only countries with a recorded affiliation are counted, so the totals cover <b>' + f.migN + '</b> of <b>' + f.rows + '</b> records.');

    /* migration by decade */
    const migRows = decs.map(function (dec) {
      const list = (N.groupBy(d, 'dec').get(dec) || []).filter(function (r) { return r.mig === true || r.mig === false; });
      const mig = list.filter(function (r) { return r.mig; }).length;
      return { label: dec + 's', value: list.length ? 100 * mig / list.length : null, label2: list.length ? Math.round(100 * mig / list.length) + '%' : '—', extra: '<span class="t-k">n:</span> <b>' + list.length + '</b>' };
    }).filter(function (r) { return isNum(r.value); });
    N.lineChart($('c-mig'), {
      xs: migRows.map(function (r) { return r.label; }),
      series: [{ name: 'Share working abroad', color: N.PAL.type.Female, values: migRows.map(function (r) { return r.value; }) }],
      height: 300, numeric: false, metric: 'femaleShare', yFmt: function (v) { return Math.round(v) + '%'; }
    });
    if (migRows.length) {
      const avg = N.mean(migRows.map(function (r) { return r.value; }));
      N.setNote('tk-mig', 'On average <b>' + avg.toFixed(0) + '%</b> of laureates with a known affiliation worked outside their birth country. The rate is noisy because some decades have few records, but it never falls near zero.');
    }

    const affRows = Array.from(byAff.entries())
      .map(function (e) { return { label: e[0], value: e[1].length, color: N.PAL.gold }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 15);
    N.hBar($('c-aff'), affRows, { height: 430, tipLabel: 'Laureates', labelW: 140 });
    N.setNote('tk-aff', affRows.length
      ? '<b>' + esc(affRows[0].label) + '</b> hosts the most laureates at the time of the award (<b>' + affRows[0].value +
        '</b>), followed by <b>' + esc(affRows[1] ? affRows[1].label : '—') + '</b>. This is the pull side of the brain drain.'
      : 'No affiliation data in this selection.');

    /* migration corridors */
    const flows = new Map();
    d.forEach(function (r) {
      if (!r.bc || !r.ac || r.bc === r.ac) return;
      const k = r.bc + '→' + r.ac;
      flows.set(k, (flows.get(k) || 0) + 1);
    });
    const flowRows = Array.from(flows.entries())
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
      .slice(0, 10)
      .map(function (e) {
        const parts = e[0].split('→');
        return { label: parts[0] + ' → ' + parts[1], value: e[1], color: N.PAL.gold };
      });
    N.hBar($('c-corridors'), flowRows, { height: 300, tipLabel: 'Laureates', labelW: 168 });
    N.setNote('tk-corridors', flowRows.length
      ? 'The single busiest route is <b>' + esc(flowRows[0].label) + '</b> with <b>' + flowRows[0].value +
        '</b> laureates. European-born laureates moving to US institutions dominate the top of this list.'
      : 'No laureates moved between countries in this selection.');
  }

  /* ============================ who wins ============================ */
  function renderWho() {
    const d = N.data();
    const f = N.facts(d);

    const byCat = N.groupBy(d, 'c');
    const catsPresent = CATS.filter(function (c) { return byCat.has(c); });
    const typeSeries = TYPES.map(function (t) {
      return { name: t, color: typeColor(t), values: catsPresent.map(function (c) {
        return (byCat.get(c) || []).filter(function (r) { return r.t === t; }).length;
      }) };
    }).filter(function (s) { return s.values.some(function (v) { return v > 0; }); });
    N.stackedBars($('c-cattype'), {
      cats: catsPresent.map(shortCat), series: typeSeries, pct: false, height: 330, legend: true
    });
    const peaceOrgs = d.filter(function (r) { return r.t === 'Organization' && r.c === 'Peace'; }).length;
    N.setNote('tk-cattype', f.orgs
      ? '<b>' + pct(peaceOrgs, f.orgs) + '%</b> of organisations in this selection won Peace (' + peaceOrgs + ' of ' + f.orgs +
        '). Physics, Chemistry and Economics are almost entirely male.'
      : 'No organisations in this selection.');

    /* female share by decade */
    const byDec = N.groupBy(d.filter(function (r) { return r.ind; }), 'dec');
    const decs = Array.from(byDec.keys()).map(Number).sort(function (a, b) { return a - b; });
    const femVals = decs.map(function (dec) {
      const list = byDec.get(dec) || [];
      const fem = list.filter(function (r) { return r.t === 'Female'; }).length;
      return list.length ? 100 * fem / list.length : null;
    });
    N.lineChart($('c-female'), {
      xs: decs.map(function (x) { return x + 's'; }),
      series: [{ name: 'Women (% of individual laureates)', color: N.PAL.type.Female, values: femVals }],
      height: 330, numeric: false, metric: 'femaleShare', yFmt: function (v) { return Math.round(v) + '%'; }
    });
    if (decs.length) {
      const first = femVals.find(function (v) { return isNum(v); });
      const last = femVals[femVals.length - 1];
      N.setNote('tk-female', 'The share of women rose from <b>' + (isNum(first) ? first.toFixed(1) : '0') + '%</b> in the ' +
        decs[0] + 's to <b>' + (isNum(last) ? last.toFixed(1) : '0') + '%</b> in the ' + decs[decs.length - 1] +
        's — progress, but still far from parity. The first woman laureate was Marie Curie in 1903.');
    }

    /* age box */
    const groups = catsPresent.map(function (c) {
      const vals = (byCat.get(c) || []).map(function (r) { return r.age; }).filter(isNum);
      return { label: shortCat(c), full: c, color: catColor(c), values: vals };
    }).filter(function (g) { return g.values.length; });
    N.boxPlot($('c-agebox'), groups, { height: 360 });
    const means = groups.map(function (g) { return { label: g.full, m: N.mean(g.values) }; }).sort(function (a, b) { return b.m - a.m; });
    if (means.length) {
      N.setNote('tk-agebox', 'Oldest on average: <b>' + means[0].label + '</b> (' + means[0].m.toFixed(1) + ' years). Youngest: <b>' +
        means[means.length - 1].label + '</b> (' + means[means.length - 1].m.toFixed(1) + '). Peace has the widest spread, thanks to activists awarded young.');
    }

    /* age table */
    const tb = $('age-table').querySelector('tbody');
    tb.innerHTML = groups.map(function (g) {
      const v = g.values.slice().sort(function (a, b) { return a - b; });
      return '<tr><td>' + esc(g.label) + '</td><td class="num">' + v.length + '</td><td class="num">' + N.mean(v).toFixed(1) +
        '</td><td class="num">' + N.quantile(v, 0.5).toFixed(0) + '</td><td class="num">' + v[0].toFixed(0) + '</td><td class="num">' +
        v[v.length - 1].toFixed(0) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No age data for this selection.</td></tr>';

    /* institutions */
    const byInst = N.groupBy(d, 'inst');
    const instRows = Array.from(byInst.entries())
      .map(function (e) { return { label: e[0], value: e[1].length, color: N.PAL.type.Female }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 15);
    N.hBar($('c-inst'), instRows, { height: 430, tipLabel: 'Laureates', labelW: 205 });
    N.setNote('tk-inst', instRows.length
      ? '<b>' + esc(instRows[0].label) + '</b> tops the list with <b>' + instRows[0].value +
        '</b> laureates, followed by <b>' + esc(instRows[1] ? instRows[1].label : '—') + '</b> (' + (instRows[1] ? instRows[1].value : 0) +
        '). A handful of US and UK institutions dominate the whole record.'
      : 'No institutions recorded in this selection.');

    /* repeat winners */
    const byName = N.groupBy(d, 'n');
    const reps = Array.from(byName.entries()).filter(function (e) { return e[1].length > 1; })
      .sort(function (a, b) { return b[1].length - a[1].length; }).slice(0, 8);
    $('repeat').innerHTML = reps.length
      ? reps.map(function (e) {
        return '<li><span class="n">' + e[1].length + '</span><div><b>' + esc(e[0]) + '</b><br>' +
          e[1].sort(function (a, b) { return a.y - b.y; }).map(function (r) { return r.y + ' · ' + shortCat(r.c); }).join(' &nbsp;·&nbsp; ') +
          '</div></li>';
      }).join('')
      : '<li><span class="n">0</span><div>No repeat winners in this selection.</div></li>';
  }

  /* ============================ laureates table ============================ */
  function sortRecords(rows) {
    const k = state.sortKey, dir = state.sortDir;
    return rows.slice().sort(function (a, b) {
      let x = a[k], y = b[k];
      if (k === 'age') { x = isNum(x) ? x : -1; y = isNum(y) ? y : -1; }
      if (typeof x === 'string' || typeof y === 'string') {
        return dir * String(x == null ? '' : x).localeCompare(String(y == null ? '' : y));
      }
      return dir * ((x == null ? -1 : x) - (y == null ? -1 : y));
    });
  }

  let pageRows = [];
  function renderPeople() {
    const d = N.data();
    $('l-count').textContent = fmtInt(d.length);
    const sorted = sortRecords(d);
    const per = state.per;
    const pages = Math.max(1, Math.ceil(sorted.length / per));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    pageRows = sorted.slice(state.page * per, state.page * per + per);
    const tb = $('l-table').querySelector('tbody');
    tb.innerHTML = pageRows.length ? pageRows.map(function (r, i) {
      return '<tr data-idx="' + i + '">' +
        '<td class="tname">' + esc(r.n) + '</td>' +
        '<td class="num">' + r.y + '</td>' +
        '<td><span class="badge"><span class="dot" style="background:' + catColor(r.c) + '"></span>' + esc(shortCat(r.c)) + '</span></td>' +
        '<td><span class="badge"><span class="dot" style="background:' + typeColor(r.t) + '"></span>' + esc(r.t) + '</span></td>' +
        '<td class="num">' + (isNum(r.age) ? r.age.toFixed(0) : '—') + '</td>' +
        '<td>' + esc(r.bc || '—') + '</td>' +
        '<td>' + esc(r.inst || '—') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="7" class="empty">No records match the current filters.</td></tr>';

    $('l-range').textContent = sorted.length
      ? (state.page * per + 1) + '–' + Math.min(sorted.length, (state.page + 1) * per) + ' of ' + fmtInt(sorted.length)
      : '0 of 0';
    $('l-prev').disabled = state.page === 0;
    $('l-next').disabled = state.page >= pages - 1;
    $('l-prev').style.opacity = state.page === 0 ? 0.45 : 1;
    $('l-next').style.opacity = state.page >= pages - 1 ? 0.45 : 1;
    document.querySelectorAll('#l-table thead th').forEach(function (th) {
      const arrow = th.querySelector('.arrow');
      if (!arrow) return;
      arrow.textContent = th.dataset.key === state.sortKey ? (state.sortDir > 0 ? '▲' : '▼') : '';
    });
  }

  /* ============================ explore ============================ */
  const COLS = {
    n: { label: 'Name', get: function (r) { return r.n; } },
    y: { label: 'Year', get: function (r) { return r.y; } },
    c: { label: 'Category', get: function (r) { return r.c; } },
    t: { label: 'Winner type', get: function (r) { return r.t; } },
    age: { label: 'Age', get: function (r) { return isNum(r.age) ? r.age.toFixed(0) : ''; } },
    bc: { label: 'Birth country', get: function (r) { return r.bc; } },
    city: { label: 'Birth city', get: function (r) { return r.city; } },
    ac: { label: 'Affiliation country', get: function (r) { return r.ac; } },
    inst: { label: 'Institution', get: function (r) { return r.inst; } },
    p: { label: 'Prize share', get: function (r) { return r.p; } },
    nw: { label: 'Co-winners', get: function (r) { return r.nw; } },
    padj: { label: 'Prize (adj. USD)', get: function (r) { return isNum(r.padj) ? Math.round(r.padj) : ''; } },
    mot: { label: 'Citation', get: function (r) { return r.mot; } }
  };
  const COL_ORDER = Object.keys(COLS);

  const X_LABEL = {
    y: 'Award year', decade: 'Decade', c: 'Category', t: 'Winner type', bct: 'Birth continent',
    bc: 'Birth country', ac: 'Affiliation country', inst: 'Institution', p: 'Prize share'
  };
  const Y_LABEL = {
    count: 'Number of laureates', meanAge: 'Mean age', medianAge: 'Median age',
    sumPrize: 'Total prize value (adjusted)', meanPrize: 'Mean prize value (adjusted)', femaleShare: 'Share of women'
  };

  function groupLabel(key, v) {
    if (key === 'decade') return v + 's';
    if (key === 'y') return String(v);
    if (key === 'c') return v;
    if (key === 't') return v;
    if (key === 'p') return v;
    if (key === 'inst') return String(v).length > 38 ? String(v).slice(0, 37) + '…' : String(v);
    return String(v);
  }
  function groupColor(key, v) {
    if (key === 'c') return catColor(v);
    if (key === 't') return typeColor(v);
    if (key === 'p') return N.PAL.share[v] || N.PAL.accent;
    return N.PAL.accent;
  }

  function renderExplore() {
    const d = N.data();
    const b = state.build;
    const groups = N.groupBy(d, b.x);
    let rows = [];
    groups.forEach(function (list, k) {
      const v = N.metricOf(list, b.y);
      if (v == null || !isFinite(v)) return;
      rows.push({ label: groupLabel(b.x, k), key: k, value: v, n: list.length, color: groupColor(b.x, k) });
    });
    const numericX = b.x === 'y' || b.x === 'decade';
    if (numericX) rows.sort(function (a, c) { return a.key - c.key; });
    else rows.sort(function (a, c) { return c.value - a.value; });
    if (!numericX && rows.length > b.topn) rows = rows.slice(0, b.topn);

    const host = $('c-build');
    const yFmt = function (v) { return N.fmtNum(v, b.y); };
    const metricLabel = Y_LABEL[b.y];
    const barH = Math.min(420, Math.max(240, rows.length * 32 + 60));
    if (!rows.length) {
      N.empty(host, 'No data for this combination. Try another metric — some fields have no ages or prize values.');
    } else if (b.type === 'hbar') {
      N.hBar(host, rows.map(function (r) { return { label: r.label, value: r.value, color: r.color, extra: '<span class="t-k">records:</span> <b>' + r.n + '</b>' }; }),
        { height: barH, metric: b.y, tipLabel: metricLabel });
    } else if (b.type === 'vbar') {
      N.vBar(host, rows, { height: 380, metric: b.y, tipLabel: metricLabel });
    } else if (b.type === 'donut') {
      N.donut(host, rows.map(function (r) { return { label: r.label, value: r.value, color: r.color }; }), { height: 380, centerLabel: metricLabel });
    } else {
      N.lineChart(host, {
        xs: rows.map(function (r) { return numericX ? r.key : r.label; }),
        series: [{ name: metricLabel, color: N.PAL.accent, values: rows.map(function (r) { return r.value; }) }],
        height: 380, numeric: numericX, metric: b.y, area: b.type === 'area',
        yFmt: yFmt, xFmt: b.x === 'decade' ? function (v) { return v + 's'; } : null
      });
    }

    const top = rows.slice().sort(function (a, c) { return c.value - a.value; })[0];
    N.setNote('tk-build', top
      ? 'Highest <b>' + metricLabel.toLowerCase() + '</b>: <b>' + esc(top.label) + '</b> (' + yFmt(top.value) + ', from ' + top.n +
        ' records). ' + rows.length + ' groups shown' + (rows.length > b.topn ? ' (top ' + b.topn + ')' : '') + '.'
      : '');

    /* table */
    const cols = state.cols.filter(function (c) { return COLS[c]; });
    const head = $('build-table').querySelector('thead');
    head.innerHTML = '<tr>' + cols.map(function (c) {
      return '<th class="' + (c === 'age' || c === 'y' || c === 'nw' || c === 'padj' ? 'num' : '') + '">' + COLS[c].label + '</th>';
    }).join('') + '</tr>';
    const sorted = d.slice().sort(function (x, y) { return y.y - x.y; }).slice(0, 500);
    const tb = $('build-table').querySelector('tbody');
    tb.innerHTML = sorted.length ? sorted.map(function (r) {
      return '<tr>' + cols.map(function (c) {
        const v = COLS[c].get(r);
        const num = c === 'age' || c === 'y' || c === 'nw' || c === 'padj';
        return '<td class="' + (num ? 'num' : '') + '">' + esc(v == null ? '—' : v) + '</td>';
      }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + Math.max(1, cols.length) + '" class="empty">No records match the current filters.</td></tr>';
    $('build-count').innerHTML = 'Showing <b>' + Math.min(500, d.length) + '</b> of <b>' + fmtInt(d.length) + '</b> records · ' + cols.length + ' columns';
  }

  /* ============================ csv ============================ */
  function csvText(rows, cols) {
    const head = cols.map(function (c) { return COLS[c].label; });
    const lines = [head.map(quote).join(',')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { return quote(COLS[c].get(r)); }).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }
  function quote(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function download(name, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  /* ============================ modal ============================ */
  function openModal(r) {
    const peers = R.filter(function (x) { return x.y === r.y && x.c === r.c; });
    const others = R.filter(function (x) { return x.n === r.n && !(x.y === r.y && x.c === r.c); });
    const links = [];
    if (r.link) links.push('<a class="btn" href="' + esc(r.link) + '" target="_blank" rel="noopener">🔗 Prize page</a>');
    if (r.llink) links.push('<a class="btn" href="' + esc(r.llink) + '" target="_blank" rel="noopener">👤 Laureate page</a>');

    const kv = [
      ['Award year', r.y],
      ['Category', r.c],
      ['Winner type', r.t],
      ['Age at award', isNum(r.age) ? r.age.toFixed(0) + ' years' : '—'],
      ['Born', r.place || r.bc || '—'],
      ['Birth date', r.born || '—'],
      ['Died', r.died || '—'],
      ['Institution at award', r.inst || '—'],
      ['Affiliation', r.aff || '—'],
      ['Prize share', r.p || '—'],
      ['Co-winners', r.nw],
      ['Prize value (nominal)', money(r.pa)],
      ['Prize value (adjusted)', money(r.padj)],
      ['Prize status', r.status || '—']
    ];

    $('modal-body').innerHTML =
      '<h3 id="modal-title">' + esc(r.n) + '</h3>' +
      '<p class="sub">' + esc(r.full && r.full !== r.n ? r.full : (r.org ? 'Organisation' : 'Laureate')) + ' · Nobel Prize ' + r.y + '</p>' +
      '<div class="pills">' +
      '<span class="badge"><span class="dot" style="background:' + catColor(r.c) + '"></span>' + esc(r.c) + '</span>' +
      '<span class="badge"><span class="dot" style="background:' + typeColor(r.t) + '"></span>' + esc(r.t) + '</span>' +
      (isNum(r.age) ? '<span class="badge">Age ' + r.age.toFixed(0) + '</span>' : '') +
      (r.bc ? '<span class="badge">📍 ' + esc(r.bc) + '</span>' : '') +
      (r.collab ? '<span class="badge">Shared prize</span>' : '<span class="badge">Sole winner</span>') +
      '</div>' +
      '<dl class="kv">' + kv.map(function (p) {
        return '<div><dt>' + p[0] + '</dt><dd>' + esc(p[1]) + '</dd></div>';
      }).join('') + '</dl>' +
      (r.mot ? '<div class="quote">“' + esc(r.mot) + '”</div>' : '') +
      '<div class="row" style="margin-top:16px">' +
      links.join('') +
      '<button class="btn" data-filter="country">Filter by ' + esc(r.bc || 'country') + '</button>' +
      '<button class="btn" data-filter="category">Filter by ' + esc(shortCat(r.c)) + '</button>' +
      '</div>' +
      (peers.length > 1 ? '<h4>Shared the same prize</h4><div class="table-wrap"><table><tbody>' +
        peers.map(function (p) {
          return '<tr><td class="tname">' + esc(p.n) + '</td><td>' + esc(p.bc || '—') + '</td><td>' + esc(p.p || '') +
            '</td><td>' + esc(p.inst || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
      (others.length ? '<h4>Other Nobel Prizes</h4><div class="table-wrap"><table><tbody>' +
        others.map(function (p) {
          return '<tr><td>' + p.y + '</td><td>' + esc(p.c) + '</td><td>' + esc(p.mot || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '');

    $('modal').classList.add('open');
    $('modal').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const body = $('modal-body');
    const cBtn = body.querySelector('[data-filter="country"]');
    const kBtn = body.querySelector('[data-filter="category"]');
    if (cBtn) cBtn.addEventListener('click', function () { closeModal(); if (r.bc) setCountry(r.bc); });
    if (kBtn) kBtn.addEventListener('click', function () { closeModal(); toggleCat(r.c); });
  }
  function closeModal() {
    $('modal').classList.remove('open');
    $('modal').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ============================ filter plumbing ============================ */
  function invalidateAll() {
    N.invalidate();
    state.page = 0;
    syncFilterUI();
    render();
  }
  function toggleCat(c) {
    if (state.cats.has(c)) state.cats.delete(c); else state.cats.add(c);
    invalidateAll();
  }
  function toggleType(t) {
    if (state.types.has(t)) state.types.delete(t); else state.types.add(t);
    invalidateAll();
  }
  function setCountry(c) {
    state.country = state.country === c ? '' : c;
    invalidateAll();
  }
  function setYears(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    state.y0 = Math.max(N.YEARS[0], lo);
    state.y1 = Math.min(N.YEARS[1], hi);
    invalidateAll();
  }

  function buildChips() {
    const catBox = $('chips-cat');
    catBox.innerHTML = CATS.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' + state.cats.has(c) + '">' +
        '<span class="dot" style="background:var(' + CAT_VAR[c] + ')"></span>' + esc(c) + '</button>';
    }).join('');
    const typeBox = $('chips-type');
    typeBox.innerHTML = TYPES.map(function (t) {
      return '<button class="chip" type="button" data-type="' + esc(t) + '" aria-pressed="' + state.types.has(t) + '">' +
        '<span class="dot" style="background:var(' + TYPE_VAR[t] + ')"></span>' + esc(t) + '</button>';
    }).join('');
  }

  function syncFilterUI() {
    $('y0').value = state.y0;
    $('y1').value = state.y1;
    $('yrLabel').textContent = state.y0 + ' – ' + state.y1;
    $('sel-cont').value = state.cont;
    $('sel-country').value = state.country;
    $('q').value = state.q;
    document.querySelectorAll('#chips-cat .chip').forEach(function (b) {
      b.setAttribute('aria-pressed', String(state.cats.has(b.dataset.cat)));
    });
    document.querySelectorAll('#chips-type .chip').forEach(function (b) {
      b.setAttribute('aria-pressed', String(state.types.has(b.dataset.type)));
    });
    const n = N.data().length;
    $('fcount').textContent = fmtInt(n) + ' of ' + fmtInt(R.length) + ' records';
  }

  const renderers = {
    overview: renderOverview,
    time: renderTime,
    geo: renderGeo,
    who: renderWho,
    people: renderPeople,
    explore: renderExplore
  };
  function render() {
    syncFilterUI();
    const fn = renderers[state.tab];
    if (fn) fn();
  }

  let rt = null;
  function schedule() {
    if (rt) clearTimeout(rt);
    rt = setTimeout(function () { rt = null; render(); }, 60);
  }

  function setTab(tab, scroll) {
    state.tab = tab;
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    document.querySelectorAll('.tab').forEach(function (s) {
      s.classList.toggle('active', s.id === 'tab-' + tab);
    });
    try { history.replaceState(null, '', '#' + tab); } catch (e) { /* ignore */ }
    render();
    if (scroll !== false) {
      const top = $('tab-' + tab).getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  /* ============================ init ============================ */
  function init() {
    N.refreshPal();
    try {
      const qTheme = (location.search.match(/theme=(dark|light)/) || [])[1];
      const saved = qTheme || localStorage.getItem('na-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch (e) { /* ignore */ }
    N.refreshPal();

    /* selects */
    const conts = Array.from(new Set(R.map(function (r) { return r.bct; }).filter(Boolean))).sort();
    $('sel-cont').innerHTML = '<option value="">All continents</option>' +
      conts.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    const countries = Array.from(new Set(R.map(function (r) { return r.bc; }).filter(Boolean))).sort();
    $('sel-country').innerHTML = '<option value="">All countries</option>' +
      countries.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');

    buildChips();

    /* hero + footer stats */
    const f0 = N.facts(R);
    $('hs-rows').textContent = fmtInt(f0.rows);
    $('hs-prizes').textContent = fmtInt(f0.prizes);
    $('hs-countries').textContent = fmtInt(f0.countries);
    $('hs-years').textContent = N.YEARS[0] + '–' + N.YEARS[1];

    /* tabs */
    $('tabs').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-tab]');
      if (b) setTab(b.dataset.tab);
    });

    /* chips */
    $('chips-cat').addEventListener('click', function (e) {
      const b = e.target.closest('.chip');
      if (b) toggleCat(b.dataset.cat);
    });
    $('chips-type').addEventListener('click', function (e) {
      const b = e.target.closest('.chip');
      if (b) toggleType(b.dataset.type);
    });

    /* years */
    function yearInput(which) {
      const v = +which.value;
      if (which.id === 'y0') {
        state.y0 = Math.min(v, state.y1);
        which.value = state.y0;
      } else {
        state.y1 = Math.max(v, state.y0);
        which.value = state.y1;
      }
      $('yrLabel').textContent = state.y0 + ' – ' + state.y1;
      N.invalidate();
      schedule();
    }
    $('y0').addEventListener('input', function () { yearInput(this); });
    $('y1').addEventListener('input', function () { yearInput(this); });

    /* selects */
    $('sel-cont').addEventListener('change', function () { state.cont = this.value; invalidateAll(); });
    $('sel-country').addEventListener('change', function () { state.country = this.value; invalidateAll(); });

    /* search */
    let qt = null;
    $('q').addEventListener('input', function () {
      const v = this.value;
      if (qt) clearTimeout(qt);
      qt = setTimeout(function () { state.q = v; invalidateAll(); }, 220);
    });

    /* reset */
    $('reset').addEventListener('click', function () {
      state.y0 = N.YEARS[0]; state.y1 = N.YEARS[1];
      state.cats.clear();
      state.types = new Set(TYPES);
      state.cont = ''; state.country = ''; state.q = '';
      state.page = 0;
      state.sortKey = 'y'; state.sortDir = -1;
      invalidateAll();
    });

    /* theme */
    $('theme').addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', cur);
      try { localStorage.setItem('na-theme', cur); } catch (e) { /* ignore */ }
      N.refreshPal();
      render();
    });

    /* table sorting + row click */
    $('l-table').querySelector('thead').addEventListener('click', function (e) {
      const th = e.target.closest('th[data-key]');
      if (!th) return;
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDir *= -1;
      else { state.sortKey = k; state.sortDir = k === 'y' || k === 'age' ? -1 : 1; }
      state.page = 0;
      renderPeople();
    });
    $('l-table').querySelector('tbody').addEventListener('click', function (e) {
      const tr = e.target.closest('tr[data-idx]');
      if (!tr) return;
      const r = pageRows[+tr.dataset.idx];
      if (r) openModal(r);
    });
    $('l-prev').addEventListener('click', function () { state.page = Math.max(0, state.page - 1); renderPeople(); });
    $('l-next').addEventListener('click', function () { state.page += 1; renderPeople(); });
    $('l-per').addEventListener('change', function () { state.per = +this.value; state.page = 0; renderPeople(); });
    $('l-csv').addEventListener('click', function () {
      download('nobel_selection.csv', csvText(N.data(), COL_ORDER));
    });

    /* explore controls */
    $('x-sel').addEventListener('change', function () { state.build.x = this.value; renderExplore(); });
    $('y-sel').addEventListener('change', function () { state.build.y = this.value; renderExplore(); });
    $('type-sel').addEventListener('change', function () { state.build.type = this.value; renderExplore(); });
    $('topn').addEventListener('input', function () {
      state.build.topn = +this.value;
      $('topn-val').textContent = this.value;
      renderExplore();
    });

    /* column chips */
    $('col-chips').innerHTML = COL_ORDER.map(function (c) {
      return '<button class="chip" type="button" data-col="' + c + '" aria-pressed="' + (state.cols.indexOf(c) >= 0) + '">' + COLS[c].label + '</button>';
    }).join('');
    $('col-chips').addEventListener('click', function (e) {
      const b = e.target.closest('.chip');
      if (!b) return;
      const c = b.dataset.col;
      const i = state.cols.indexOf(c);
      if (i >= 0) { if (state.cols.length > 1) state.cols.splice(i, 1); }
      else state.cols.push(c);
      b.setAttribute('aria-pressed', String(state.cols.indexOf(c) >= 0));
      renderExplore();
    });
    $('dl-csv').addEventListener('click', function () {
      download('nobel_table.csv', csvText(N.data(), state.cols.filter(function (c) { return COLS[c]; })));
    });

    /* modal close */
    $('modal').addEventListener('click', function (e) {
      if (e.target.dataset.close || e.target.id === 'modal-close' || e.target.id === 'modal') closeModal();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    /* resize */
    let rz = null;
    window.addEventListener('resize', function () {
      if (rz) clearTimeout(rz);
      rz = setTimeout(function () { render(); }, 160);
    });

    /* keyboard: number keys switch tabs */
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
      const order = ['overview', 'time', 'geo', 'who', 'people', 'explore'];
      const i = parseInt(e.key, 10);
      if (i >= 1 && i <= 6) setTab(order[i - 1]);
    });

    const startTab = (location.hash || '').replace(/^#/, '');
    if (renderers[startTab]) {
      state.tab = startTab;
      document.querySelectorAll('#tabs button').forEach(function (b) {
        b.setAttribute('aria-selected', String(b.dataset.tab === startTab));
      });
      document.querySelectorAll('.tab').forEach(function (s) {
        s.classList.toggle('active', s.id === 'tab-' + startTab);
      });
    }

    syncFilterUI();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
