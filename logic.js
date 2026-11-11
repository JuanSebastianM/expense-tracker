/* Gastos: pure logic (no DOM). Used by the page (window.Gastos) and by Node (module.exports).
   All dates are local 'yyyy-MM-dd' strings. They are never built with new Date(string):
   the parts are split and days are counted with Date.UTC, which does not depend on the time zone.
   User-facing text is Spanish (Colombia); identifiers and comments are English. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Gastos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 86400000;
  // Month and weekday abbreviations shown on screen (Spanish).
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  // Special category and type values written by the spreadsheet script (data values, kept as they are).
  var CATEGORY_EXCLUDED = 'No contar';
  var CATEGORY_INCOME = 'Ingreso';
  var CATEGORY_UNCATEGORIZED = 'Sin categoría';
  var TYPE_INCOME = 'Ingreso';

  // ---------- Dates ----------
  function dateParts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function makeDate(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  /** Day number (days since 1970-01-01) of a 'yyyy-MM-dd' date. */
  function dayNumber(iso) {
    var p = dateParts(iso);
    return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS) : NaN;
  }
  function fromDayNumber(n) {
    var f = new Date(n * DAY_MS);
    return makeDate(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  function addDays(iso, n) { return fromDayNumber(dayNumber(iso) + n); }
  function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }
  /** Local calendar date of a Date object (used for "today"). */
  function localDate(d) { return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function weekday(iso) { return new Date(dayNumber(iso) * DAY_MS).getUTCDay(); }

  // ---------- Formatting ----------
  /** 1240000 -> "$1.240.000" (es-CO grouping done by hand so Node and Safari agree). */
  function formatPesos(n) {
    n = Math.round(Number(n) || 0);
    var negative = n < 0;
    var s = String(Math.abs(n));
    var out = '';
    while (s.length > 3) {
      out = '.' + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    return (negative ? '-$' : '$') + s + out;
  }
  /** '2026-03-01' -> '1 mar' */
  function shortDate(iso) {
    var p = dateParts(iso);
    return p ? p.d + ' ' + MONTHS[p.m - 1] : '';
  }
  /** '2026-11-11' -> 'mié 11 nov' */
  function shortDay(iso) {
    var p = dateParts(iso);
    return p ? WEEKDAYS[weekday(iso)] + ' ' + p.d + ' ' + MONTHS[p.m - 1] : '';
  }
  /** 'hoy' / 'ayer' / 'mié 11 nov' */
  function relativeDay(date, today) {
    var d = daysBetween(date, today);
    if (d === 0) return 'hoy';
    if (d === 1) return 'ayer';
    return shortDay(date);
  }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Spanish connector words kept lowercase when title-casing merchant names.
  var LOWERCASE_WORDS = { de: 1, del: 1, la: 1, las: 1, el: 1, los: 1, y: 1, en: 1, e: 1 };
  /** 'DOMICILIOS YA*DL' -> 'Domicilios Ya'; 'PASARELA*FIBRA  HOGAR' -> 'Pasarela · Fibra Hogar'. */
  function cleanMerchant(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    // Pieces separated by "*" (but not "*1234", which is an account number). Short pieces
    // such as "DL" or "CO" are payment-processor codes that mean nothing to the reader.
    var pieces = s.split(/\s*\*(?!\d)\s*/).filter(function (t) { return t; });
    var longPieces = pieces.filter(function (t) { return t.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length > 3; });
    if (longPieces.length) pieces = longPieces;
    s = pieces.join(' · ');
    var letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
    var upper = s.replace(/[^A-ZÀ-ÖØ-Þ]/g, '');
    if (letters.length >= 3 && upper.length / letters.length > 0.7) {
      var i = 0;
      s = s.split(' ').map(function (w) {
        var first = i++ === 0;
        if (/\d/.test(w)) return w;
        var bare = w.replace(/[^A-Za-zÀ-ÿ]/g, '');
        // Acronyms without vowels (DL) stay uppercase
        if (bare.length >= 2 && bare.length <= 4 && !/[AEIOUÁÉÍÓÚaeiouáéíóú]/.test(bare)) return w;
        var lower = w.toLowerCase();
        if (!first && LOWERCASE_WORDS[lower]) return lower;
        return lower.replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/, function (_, a, b) { return a + b.toUpperCase(); });
      }).join(' ');
    }
    return s;
  }
  /** 'Restaurantes (4 al mes)' -> 'Restaurantes'. */
  function shortName(name) {
    var s = String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    return s || String(name || '').trim();
  }
  function plural(n, one, many) { return n === 1 ? one : many; }
  /** ['A', 'B', 'C'] -> 'A, B y C' */
  function joinList(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
  }

  // ---------- Pay cycle ----------
  function cutoffIn(y, m, cutoffDay) { return makeDate(y, m, Math.min(cutoffDay, daysInMonth(y, m))); }
  /** The cycle containing 'date': starts on the cutoff day and ends the day before the next cutoff. */
  function cycle(date, cutoffDay) {
    cutoffDay = Math.max(1, Math.min(31, Math.floor(Number(cutoffDay) || 1)));
    var p = dateParts(date);
    var y = p.y, m = p.m;
    var start = cutoffIn(y, m, cutoffDay);
    if (date < start) {
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
      start = cutoffIn(y, m, cutoffDay);
    }
    var ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny += 1; }
    var end = addDays(cutoffIn(ny, nm, cutoffDay), -1);
    return {
      start: start,
      end: end,
      days: daysBetween(start, end) + 1,
      label: shortDate(start) + ' – ' + shortDate(end)
    };
  }
  function previousCycle(c, cutoffDay) { return cycle(addDays(c.start, -1), cutoffDay); }
  function nextCycle(c, cutoffDay) { return cycle(addDays(c.end, 1), cutoffDay); }

  // ---------- Categories and budget lines ----------
  function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  /**
   * Each category goes to the line whose normalized name starts with the category's (or the reverse).
   * The longest match wins. Returns { category: line index } (-1 when none).
   */
  function matchBudgetLines(lines, categories) {
    var lineNames = (lines || []).map(function (l) { return normalize(l.name); });
    var out = {};
    (categories || []).forEach(function (cat) {
      var c = normalize(cat);
      var best = -1, bestLength = 0;
      if (c && cat !== CATEGORY_EXCLUDED && cat !== CATEGORY_INCOME && cat !== CATEGORY_UNCATEGORIZED) {
        for (var i = 0; i < lineNames.length; i++) {
          var l = lineNames[i];
          if (!l) continue;
          if (l.indexOf(c) === 0 || c.indexOf(l) === 0) {
            var n = Math.min(l.length, c.length);
            if (n > bestLength) { bestLength = n; best = i; }
          }
        }
      }
      out[cat] = best;
    });
    return out;
  }

  function isSpending(t) {
    return t.category !== CATEGORY_EXCLUDED && t.category !== CATEGORY_INCOME && t.type !== TYPE_INCOME;
  }
  function byAmount(a, b) { return b.amount - a.amount; }
  function newestFirst(a, b) {
    var ka = a.date + ' ' + (a.time || ''), kb = b.date + ' ' + (b.time || '');
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  }

  /** Next date (today or later) that falls on day 'day' of a month. */
  function nextMonthDay(today, day) {
    var p = dateParts(today);
    var y = p.y, m = p.m;
    for (var k = 0; k < 3; k++) {
      var f = makeDate(y, m, Math.min(day, daysInMonth(y, m)));
      if (f >= today) return f;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return null;
  }

  // ---------- Wire adapter (the only place that knows the script's Spanish keys) ----------
  /** True when a response from the spreadsheet script has the shape of the data contract. */
  function isValidResponse(r) {
    return !!(r && r.ok === true && r.presupuesto && Array.isArray(r.movimientos) && r.config);
  }
  /** Turns the script's response ({ ok, generado, config, presupuesto, categorias, movimientos }) into internal data. */
  function fromApi(r) {
    r = r || {};
    var config = r.config || {};
    var budget = r.presupuesto || {};
    return {
      generatedAt: String(r.generado || ''),
      isDemo: false,
      config: {
        cutoffDay: Number(config.diaCorte) || 25,
        cards: (config.tarjetas || []).map(function (t) { return { name: String(t.nombre || ''), day: Number(t.dia) || 1 }; })
      },
      budget: {
        income: Number(budget.ingreso) || 0,
        savingsGoal: Number(budget.ahorroMeta) || 0,
        total: Number(budget.presupuesto) || 0,
        lines: (budget.lineas || []).map(function (l) {
          return { name: String(l.nombre || ''), amount: Number(l.monto) || 0, group: l.grupo === 'salidas' ? 'outings' : 'fixed' };
        })
      },
      categories: (r.categorias || []).map(String),
      transactions: (r.movimientos || []).map(function (m) {
        return {
          date: String(m.fecha || ''), time: String(m.hora || ''), bank: String(m.banco || ''), type: String(m.tipo || ''),
          amount: Number(m.monto) || 0, merchant: String(m.comercio || ''), product: String(m.producto || ''),
          category: String(m.categoria || '').trim() || CATEGORY_UNCATEGORIZED
        };
      })
    };
  }
  /** Body of the data request, in the script's wire format: {"accion":"datos","clave":<key>}. */
  function apiRequestBody(key) {
    return JSON.stringify({ accion: 'datos', clave: String(key) });
  }
  /** True when a failed response means the key is wrong ({ ok: false, error: 'clave' }). */
  function isKeyError(r) {
    return !!(r && r.ok === false && r.error === 'clave');
  }
  /** Checks internal data (from fromApi or demoData). */
  function isValidData(d) {
    return !!(d && d.config && d.budget && Array.isArray(d.budget.lines) && Array.isArray(d.transactions));
  }

  // ---------- Cycle summary ----------
  function summary(data, c, today) {
    data = data || {};
    var budget = data.budget || {};
    var budgetLines = budget.lines || [];
    var all = (data.transactions || []).map(function (t) {
      return {
        date: String(t.date || ''), time: String(t.time || ''), bank: t.bank || '', type: t.type || '',
        amount: Number(t.amount) || 0, merchant: t.merchant || '', product: t.product || '',
        category: String(t.category || '').trim() || CATEGORY_UNCATEGORIZED
      };
    }).filter(function (t) { return dateParts(t.date); });

    var inCycle = all.filter(function (t) { return t.date >= c.start && t.date <= c.end; });
    var spending = inCycle.filter(isSpending);
    var total = spending.reduce(function (s, t) { return s + t.amount; }, 0);

    var budgetTotal = Number(budget.total) || 0;
    if (!(budgetTotal > 0)) budgetTotal = budgetLines.reduce(function (s, l) { return s + (Number(l.amount) || 0); }, 0);
    var isCurrent = today >= c.start && today <= c.end;
    var isPast = today > c.end;
    var daysElapsed = isCurrent ? daysBetween(c.start, today) : (isPast ? c.days : 0);
    var daysLeft = isCurrent ? daysBetween(today, c.end) + 1 : (isPast ? 0 : c.days);

    // Match every category that appears (official list + the ones on transactions)
    var categoryNames = (data.categories || []).slice();
    spending.forEach(function (t) { if (categoryNames.indexOf(t.category) < 0) categoryNames.push(t.category); });
    var lineOf = matchBudgetLines(budgetLines, categoryNames);

    var lines = budgetLines.map(function (l) {
      return { name: String(l.name), shortName: shortName(l.name), group: l.group === 'outings' ? 'outings' : 'fixed',
               amount: Number(l.amount) || 0, spent: 0, transactions: [] };
    });
    var unbudgetedMap = {};
    var uncategorized = { count: 0, total: 0, transactions: [] };
    spending.forEach(function (t) {
      if (t.category === CATEGORY_UNCATEGORIZED) {
        uncategorized.count += 1; uncategorized.total += t.amount; uncategorized.transactions.push(t);
        return;
      }
      var i = lineOf[t.category];
      if (i >= 0) { lines[i].spent += t.amount; lines[i].transactions.push(t); return; }
      if (!unbudgetedMap[t.category]) unbudgetedMap[t.category] = { name: t.category, spent: 0, transactions: [] };
      unbudgetedMap[t.category].spent += t.amount;
      unbudgetedMap[t.category].transactions.push(t);
    });
    lines.forEach(function (l) {
      l.remaining = l.amount - l.spent;
      l.pct = l.amount > 0 ? Math.round(l.spent / l.amount * 100) : (l.spent > 0 ? 100 : 0);
      var ratio = l.amount > 0 ? l.spent / l.amount : (l.spent > 0 ? Infinity : 0);
      l.status = l.spent <= 0 ? 'no-payments' : ratio > 1 ? 'over' : ratio >= 0.85 ? 'close' : 'on-track';
      l.paid = l.group === 'fixed' && l.amount > 0 && l.spent >= 0.9 * l.amount;
      l.transactions.sort(newestFirst);
    });
    var unbudgeted = Object.keys(unbudgetedMap).map(function (k) { unbudgetedMap[k].transactions.sort(newestFirst); return unbudgetedMap[k]; })
      .sort(function (a, b) { return b.spent - a.spent; });
    uncategorized.transactions.sort(newestFirst);

    var outingLines = lines.filter(function (l) { return l.group === 'outings'; });
    var outings = {
      budget: outingLines.reduce(function (s, l) { return s + l.amount; }, 0),
      spent: outingLines.reduce(function (s, l) { return s + l.spent; }, 0)
    };
    outings.remaining = outings.budget - outings.spent;
    outings.perDay = (isCurrent && outings.remaining > 0 && daysLeft > 0) ? Math.floor(outings.remaining / daysLeft) : null;

    // Projection: spent so far plus what is left on each line. A closed cycle has nothing left to spend.
    var pending = isPast ? 0 : lines.reduce(function (s, l) { return s + Math.max(0, l.amount - l.spent); }, 0);
    var projection = total + pending;
    var income = Number(budget.income) || 0;
    var savingsGoal = Number(budget.savingsGoal) || 0;

    var byDay = {};
    spending.forEach(function (t) { (byDay[t.date] = byDay[t.date] || []).push(t); });
    var series = [];
    for (var k = 0; k < c.days; k++) {
      var day = addDays(c.start, k);
      var ts = (byDay[day] || []).slice().sort(byAmount);
      series.push({ date: day, total: ts.reduce(function (s, t) { return s + t.amount; }, 0),
                    future: day > today, transactions: ts });
    }

    var largest = null;
    spending.forEach(function (t) { if (!largest || t.amount > largest.amount) largest = t; });

    var firstDate = null;
    all.forEach(function (t) { if (!firstDate || t.date < firstDate) firstDate = t.date; });
    var partial = !!firstDate && firstDate > c.start;

    var cards = ((data.config && data.config.cards) || []).map(function (card) {
      var due = nextMonthDay(today, Number(card.day) || 1);
      return { name: String(card.name || ''), date: due, days: daysBetween(today, due) };
    }).sort(function (a, b) { return a.days - b.days; });

    return {
      cycle: c, today: today,
      total: total, budget: budgetTotal, available: budgetTotal - total,
      daysElapsed: daysElapsed, daysLeft: daysLeft,
      isCurrent: isCurrent, isPast: isPast,
      income: income, savingsGoal: savingsGoal,
      lines: lines, unbudgeted: unbudgeted, uncategorized: uncategorized, outings: outings,
      projection: projection, projectedSavings: income - projection,
      meetsGoal: income - projection >= savingsGoal,
      series: series, largest: largest,
      partial: partial, since: partial ? firstDate : null,
      cards: cards,
      transactions: inCycle.slice().sort(newestFirst),
      spendingCount: spending.length
    };
  }

  // ---------- Insights (the plain-language sentences) ----------
  function insights(s) {
    var out = [];
    var endDay = dateParts(s.cycle.end).d;

    // 1. Savings. If tracking began mid-cycle the computed savings would be false: say nothing.
    if (s.income > 0 && !(s.partial && s.since <= s.cycle.end)) {
      var x = s.projectedSavings, y = s.savingsGoal;
      if (s.isPast) {
        if (x >= 0) {
          out.push({ tone: x >= y ? 'good' : 'warn', key: 'savings',
            text: 'En este ciclo ahorraron ' + formatPesos(x) + '. La meta era ' + formatPesos(y) + '.' +
                  (x >= y ? '' : ' Faltaron ' + formatPesos(y - x) + '.') });
        } else {
          out.push({ tone: 'bad', key: 'savings',
            text: 'En este ciclo gastaron ' + formatPesos(-x) + ' más de lo que entró. La meta de ahorro era ' + formatPesos(y) + '.' });
        }
      } else if (x >= 0) {
        out.push({ tone: x >= y ? 'good' : 'warn', key: 'savings',
          text: 'Si lo que falta sale según el presupuesto, ahorrarían ' + formatPesos(x) + ' este ciclo. La meta es ' + formatPesos(y) + '.' +
                (x >= y ? '' : ' Quedarían ' + formatPesos(y - x) + ' por debajo.') });
      } else {
        out.push({ tone: 'bad', key: 'savings',
          text: 'Si lo que falta sale según el presupuesto, gastarían ' + formatPesos(-x) + ' más de lo que entra este ciclo. La meta de ahorro es ' + formatPesos(y) + '.' });
      }
    }

    // 2. Outings and treats
    var o = s.outings;
    if (o.budget > 0) {
      if (o.remaining < 0) {
        out.push({ tone: 'bad', key: 'outings', text: 'Salidas y gustos ya se pasó por ' + formatPesos(-o.remaining) + '.' });
      } else if (s.isPast) {
        out.push({ tone: 'good', key: 'outings', text: 'En salidas y gustos sobraron ' + formatPesos(o.remaining) + ' de ' + formatPesos(o.budget) + '.' });
      } else {
        out.push({ tone: o.remaining > 0 ? 'good' : 'warn', key: 'outings',
          text: 'Para salidas y gustos quedan ' + formatPesos(o.remaining) + ' de ' + formatPesos(o.budget) +
                (o.perDay ? ': unos ' + formatPesos(o.perDay) + ' por día hasta el ' + endDay + '.' : '.') });
      }
    }

    // 3. Lines over budget (at most 3, most over first)
    s.lines.filter(function (l) { return l.status === 'over'; })
      .sort(function (a, b) { return (b.spent - b.amount) - (a.spent - a.amount); })
      .slice(0, 3)
      .forEach(function (l) {
        out.push({ tone: 'bad', key: 'over', text: l.shortName + ' ya se pasó por ' + formatPesos(l.spent - l.amount) + '.' });
      });

    // 4. Lines close to the limit (at most 2). A fixed expense already paid is not a warning.
    if (!s.isPast) {
      s.lines.filter(function (l) { return l.status === 'close' && !l.paid; })
        .sort(function (a, b) { return b.pct - a.pct; })
        .slice(0, 2)
        .forEach(function (l) {
          out.push({ tone: 'warn', key: 'close', text: l.shortName + ' va en ' + l.pct + '% de su presupuesto.' });
        });
    }

    // 5. Fixed expenses
    var fixed = s.lines.filter(function (l) { return l.group === 'fixed' && l.amount > 0; });
    if (fixed.length) {
      var paid = fixed.filter(function (l) { return l.paid; });
      var missing = fixed.filter(function (l) { return !l.paid; }).sort(function (a, b) { return b.amount - a.amount; });
      var t = paid.length === fixed.length
        ? (s.isPast ? 'Aparecieron pagados los ' : 'Ya aparecen pagados los ') + fixed.length + ' gastos fijos.'
        : paid.length === 0
          ? (s.isPast ? 'No apareció pagado ninguno de los ' : 'Aún no aparece pagado ninguno de los ') + fixed.length + ' gastos fijos.'
          : (s.isPast ? plural(paid.length, 'Apareció pagado', 'Aparecieron pagados')
                      : 'Ya ' + plural(paid.length, 'aparece pagado', 'aparecen pagados')) +
            ' ' + paid.length + ' de ' + fixed.length + ' gastos fijos.';
      if (missing.length) {
        var names = missing.slice(0, 3).map(function (l) { return l.shortName; });
        var rest = missing.length - names.length;
        t += ' ' + (s.isPast ? 'No aparecieron: ' : 'Faltan: ') +
             (rest > 0 ? names.join(', ') + ' y ' + rest + ' más' : joinList(names)) + '.';
      }
      out.push({ tone: 'info', key: 'fixed', text: t });
    }

    // 6. Uncategorized
    if (s.uncategorized.count > 0) {
      var n = s.uncategorized.count;
      out.push({ tone: 'warn', key: 'uncategorized',
        text: 'Hay ' + n + ' ' + plural(n, 'movimiento', 'movimientos') + ' sin categoría por ' + formatPesos(s.uncategorized.total) +
              '. Mientras no la ' + plural(n, 'tenga', 'tengan') + ', no ' + plural(n, 'entra', 'entran') + ' en ningún presupuesto.' });
    }

    // 7. Largest purchase
    if (s.largest) {
      out.push({ tone: 'info', key: 'largest',
        text: 'La compra más grande fue ' + (cleanMerchant(s.largest.merchant) || s.largest.category) + ': ' +
              formatPesos(s.largest.amount) + ' el ' + shortDay(s.largest.date) + '.' });
    }

    // 8. Cards due within 7 days (current cycle only)
    if (s.isCurrent) {
      s.cards.filter(function (card) { return card.date && card.days >= 0 && card.days <= 7; }).forEach(function (card) {
        var name = card.name.replace(/^Tarjeta\b/, 'tarjeta');
        out.push({ tone: 'warn', key: 'card',
          text: card.days === 0 ? 'La ' + name + ' vence hoy.'
            : 'La ' + name + ' vence el ' + shortDay(card.date) + ' (en ' + card.days + ' ' + plural(card.days, 'día', 'días') + ').' });
      });
    }

    // 9. Partial cycle
    if (s.partial && s.since <= s.cycle.end) {
      out.push({ tone: 'info', key: 'partial', text: 'El registro empezó el ' + shortDay(s.since) + '. Lo gastado antes no aparece.' });
    }
    return out;
  }

  /** The headline: one or two sentences. */
  function headline(s) {
    if (!s.spendingCount) {
      if (s.isPast) return ['No hay gastos registrados en este ciclo.'];
      return ['Aún no hay gastos en este ciclo.'];
    }
    var t = ['Van ' + formatPesos(s.total) + ' gastados de ' + formatPesos(s.budget) + '.'];
    if (s.isPast) {
      t[0] = 'Se gastaron ' + formatPesos(s.total) + ' de ' + formatPesos(s.budget) + '.';
      t.push(s.available >= 0 ? 'Cerró ' + formatPesos(s.available) + ' por debajo del presupuesto.'
                              : 'Cerró ' + formatPesos(-s.available) + ' por encima.');
    } else if (s.available >= 0) {
      t.push((s.daysLeft === 1 ? 'Queda 1 día' : 'Quedan ' + s.daysLeft + ' días') +
             ' y ' + formatPesos(s.available) + ' por gastar.');
    } else {
      t.push('Se pasaron por ' + formatPesos(-s.available) + '.');
    }
    return t;
  }

  // ---------- Access code ----------
  /** 'eyJ1Ijo...' -> { u, k } (web-app URL and key), or null when it is not usable. */
  function decodeAccessCode(text) {
    var s = String(text || '').replace(/\s+/g, '').replace(/=+$/, '');
    if (!s || /[^A-Za-z0-9_-]/.test(s)) return null;
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var obj;
    try {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (e) { return null; }
    if (!obj || typeof obj !== 'object') return null;
    var u = obj.u, k = obj.k;
    if (typeof u !== 'string' || typeof k !== 'string' || !k) return null;
    if (u.indexOf('https://script.google.com/macros/s/') !== 0 || !/\/exec$/.test(u)) return null;
    if (/[\s?#]/.test(u)) return null;
    return { u: u, k: k };
  }

  // ---------- Demo data (invented) ----------
  function seededRandom(seed) {
    var x = seed >>> 0;
    return function () {
      x = (x + 0x6D2B79F5) >>> 0;
      var t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /**
   * An invented household, in the internal shape. The cutoff day is chosen so that "today"
   * lands about 17 days into the cycle, so the demo always looks lived-in whatever the date.
   */
  function demoData(today) {
    var cutoffDay = dateParts(addDays(today, -17)).d;
    if (cutoffDay > 28) cutoffDay = 28;
    var c = cycle(today, cutoffDay);
    var prev = previousCycle(c, cutoffDay);
    var elapsed = daysBetween(c.start, today);
    var card1Day = dateParts(addDays(today, 3)).d, card2Day = dateParts(addDays(today, 19)).d;

    var lines = [
      { name: 'Vivienda', amount: 2000000, group: 'fixed' },
      { name: 'Supermercado', amount: 900000, group: 'fixed' },
      { name: 'Transporte (bus y taxis)', amount: 400000, group: 'fixed' },
      { name: 'Seguro de salud', amount: 350000, group: 'fixed' },
      { name: 'Servicios públicos (Confirmar)', amount: 250000, group: 'fixed' },
      { name: 'Gimnasio', amount: 180000, group: 'fixed' },
      { name: 'Internet y celular', amount: 150000, group: 'fixed' },
      { name: 'Mascota', amount: 150000, group: 'fixed' },
      { name: 'Suscripciones', amount: 60000, group: 'fixed' },
      { name: 'Comidas fuera (6 al mes)', amount: 600000, group: 'outings' },
      { name: 'Planes y paseos', amount: 500000, group: 'outings' },
      { name: 'Compras personales', amount: 400000, group: 'outings' }
    ];
    var categories = ['Vivienda', 'Supermercado', 'Transporte', 'Seguro de salud', 'Servicios públicos', 'Gimnasio',
      'Internet y celular', 'Mascota', 'Suscripciones', 'Comidas fuera', 'Planes y paseos', 'Compras personales',
      'Regalos', 'Otros', CATEGORY_INCOME, CATEGORY_EXCLUDED, CATEGORY_UNCATEGORIZED];
    var BANK_A = 'Banco Andino', BANK_P = 'Banco Pacífico';
    var CREDIT_A = 'Andino T. Crédito *0000', SAVINGS_A = 'Andino Ahorros *0000', CREDIT_P = 'Pacífico T. Crédito *0000';

    // [day of cycle (0 = start), category, amount, merchant, type, product, bank]
    var current = [
      [0, CATEGORY_INCOME, 8000000, 'PAGO NOMINA EMPRESA', TYPE_INCOME, SAVINGS_A, BANK_A],
      [0, 'Vivienda', 2000000, 'ARRENDAMIENTOS EL SOL', 'Transferencia', SAVINGS_A, BANK_A],
      [1, 'Supermercado', 312400, 'SUPERMERCADO LA COLINA', 'Compra', CREDIT_A, BANK_A],
      [1, 'Suscripciones', 26900, 'STREAMPLUS DL', 'Compra', CREDIT_P, BANK_P],
      [2, 'Comidas fuera', 84000, 'ARROCERIA LA PLAZA', 'Compra', CREDIT_P, BANK_P],
      [3, 'Transporte', 18500, 'TAXI CIUDAD*CO', 'Compra', CREDIT_A, BANK_A],
      [3, 'Internet y celular', 148000, 'FIBRA HOGAR SAS', 'Pago', SAVINGS_A, BANK_A],
      [4, 'Seguro de salud', 350000, 'SALUD PLUS', 'Pago', SAVINGS_A, BANK_A],
      [5, 'Comidas fuera', 132000, 'DOMICILIOS YA*DL', 'Compra', CREDIT_P, BANK_P],
      [5, 'Gimnasio', 180000, 'GIMNASIO MOVER', 'Compra', CREDIT_A, BANK_A],
      [6, 'Planes y paseos', 210000, 'CINE ESTRELLA', 'Compra', CREDIT_A, BANK_A],
      [7, 'Transporte', 42000, 'GASOLINERA EL PUENTE', 'Compra', CREDIT_A, BANK_A],
      [7, CATEGORY_EXCLUDED, 500000, 'Cuenta *0000', 'Transferencia', SAVINGS_A, BANK_A],
      [8, 'Supermercado', 268900, 'SUPERMERCADO LA COLINA', 'Compra', CREDIT_A, BANK_A],
      [8, 'Compras personales', 95000, 'LIBRERIA EL FARO', 'Compra', CREDIT_P, BANK_P],
      [9, 'Comidas fuera', 156000, 'RESTAURANTE MAR Y TIERRA', 'Compra', CREDIT_P, BANK_P],
      [10, CATEGORY_UNCATEGORIZED, 64000, 'TIENDA NATURAL*DL', 'Compra', CREDIT_A, BANK_A],
      [10, 'Otros', 48000, 'FERRETERIA CENTRAL', 'Compra', CREDIT_A, BANK_A],
      [11, 'Supermercado', 254300, 'MERCADO DEL BARRIO', 'Compra', SAVINGS_A, BANK_A],
      [12, 'Planes y paseos', 248000, 'PARQUE DE AVENTURA', 'Compra', CREDIT_A, BANK_A],
      [12, 'Comidas fuera', 118000, 'PANADERIA SAN JOSE', 'Compra', CREDIT_P, BANK_P],
      [13, 'Transporte', 26000, 'TAXI CIUDAD*CO', 'Compra', CREDIT_A, BANK_A],
      [14, 'Comidas fuera', 176000, 'DOMICILIOS YA*DL', 'Compra', CREDIT_P, BANK_P],
      [14, 'Regalos', 120000, 'DETALLES Y FLORES', 'Compra', CREDIT_P, BANK_P],
      [15, CATEGORY_UNCATEGORIZED, 47500, 'PAGOS EN LINEA*TIENDA VERDE', 'Compra', CREDIT_A, BANK_A],
      [16, 'Supermercado', 98200, 'SUPERMERCADO LA COLINA', 'Compra', CREDIT_A, BANK_A],
      [17, 'Comidas fuera', 62000, 'CAFE DEL PARQUE', 'Compra', CREDIT_P, BANK_P]
    ];
    // Previous cycle (tracking started a few days after it began)
    var previous = [
      [4, 'Supermercado', 280000, 'SUPERMERCADO LA COLINA', 'Compra', CREDIT_A, BANK_A],
      [5, 'Servicios públicos', 236000, 'AGUAS Y LUZ', 'Pago', SAVINGS_A, BANK_A],
      [6, 'Comidas fuera', 92000, 'ARROCERIA LA PLAZA', 'Compra', CREDIT_P, BANK_P],
      [8, 'Gimnasio', 180000, 'GIMNASIO MOVER', 'Compra', CREDIT_A, BANK_A],
      [9, 'Mascota', 138000, 'VETERINARIA PATITAS', 'Compra', CREDIT_A, BANK_A],
      [11, 'Supermercado', 301000, 'MERCADO DEL BARRIO', 'Compra', SAVINGS_A, BANK_A],
      [13, 'Planes y paseos', 160000, 'CINE ESTRELLA', 'Compra', CREDIT_A, BANK_A],
      [15, 'Comidas fuera', 140000, 'DOMICILIOS YA*DL', 'Compra', CREDIT_P, BANK_P],
      [16, 'Internet y celular', 148000, 'FIBRA HOGAR SAS', 'Pago', SAVINGS_A, BANK_A],
      [18, 'Supermercado', 245000, 'SUPERMERCADO LA COLINA', 'Compra', CREDIT_A, BANK_A],
      [20, 'Compras personales', 210000, 'ALMACEN LA MODA', 'Compra', CREDIT_P, BANK_P],
      [22, 'Transporte', 120000, 'GASOLINERA EL PUENTE', 'Compra', CREDIT_A, BANK_A],
      [24, 'Comidas fuera', 180000, 'RESTAURANTE MAR Y TIERRA', 'Compra', CREDIT_P, BANK_P],
      [26, 'Suscripciones', 26900, 'STREAMPLUS DL', 'Compra', CREDIT_P, BANK_P],
      [27, 'Otros', 75000, 'FERRETERIA CENTRAL', 'Compra', CREDIT_A, BANK_A]
    ];
    var random = seededRandom(7);
    function row(base, maxDay, f) {
      var day = Math.min(f[0], maxDay);
      var h = 7 + Math.floor(random() * 14), mi = Math.floor(random() * 60);
      return { date: addDays(base, day), time: pad2(h) + ':' + pad2(mi), bank: f[6], type: f[4], amount: f[2],
               merchant: f[3], product: f[5], category: f[1] };
    }
    var transactions = previous.filter(function (f) { return f[0] < prev.days; }).map(function (f) { return row(prev.start, prev.days - 1, f); })
      .concat(current.map(function (f) { return row(c.start, elapsed, f); }));
    transactions.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
    return {
      generatedAt: today + 'T08:00:00-05:00',
      isDemo: true,
      config: { cutoffDay: cutoffDay, cards: [{ name: 'Tarjeta Andino', day: card1Day }, { name: 'Tarjeta Pacífico', day: card2Day }] },
      budget: { income: 8000000, savingsGoal: 1600000, total: 6400000, lines: lines },
      categories: categories,
      transactions: transactions
    };
  }

  return {
    // dates
    dateParts: dateParts, dayNumber: dayNumber, addDays: addDays, daysBetween: daysBetween, localDate: localDate,
    daysInMonth: daysInMonth,
    // formatting
    formatPesos: formatPesos, shortDay: shortDay, shortDate: shortDate, relativeDay: relativeDay, capitalize: capitalize,
    cleanMerchant: cleanMerchant, shortName: shortName,
    // cycle and calculations
    cycle: cycle, previousCycle: previousCycle, nextCycle: nextCycle,
    normalize: normalize, matchBudgetLines: matchBudgetLines, isSpending: isSpending,
    summary: summary, insights: insights, headline: headline,
    // access and data
    decodeAccessCode: decodeAccessCode, isValidResponse: isValidResponse, fromApi: fromApi, isValidData: isValidData,
    apiRequestBody: apiRequestBody, isKeyError: isKeyError,
    demoData: demoData,
    CATEGORY_EXCLUDED: CATEGORY_EXCLUDED, CATEGORY_INCOME: CATEGORY_INCOME, CATEGORY_UNCATEGORIZED: CATEGORY_UNCATEGORIZED,
    TYPE_INCOME: TYPE_INCOME
  };
});
