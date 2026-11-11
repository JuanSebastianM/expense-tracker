// Tests for logic.js with node:assert. Usage: node app/tests/logic.test.js
// The file re-runs itself under several time zones and requires identical results.
'use strict';
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const G = require(path.join(__dirname, '..', 'logic.js'));

let testCount = 0;
function test(name, fn) {
  try { fn(); } catch (e) { e.message = name + ': ' + e.message; throw e; }
  testCount++;
}
const texts = (list) => list.map((f) => f.text);
const keys = (list) => list.map((f) => f.key);

// ---------- Formatting ----------
test('formatPesos', () => {
  assert.strictEqual(G.formatPesos(0), '$0');
  assert.strictEqual(G.formatPesos(999), '$999');
  assert.strictEqual(G.formatPesos(1000), '$1.000');
  assert.strictEqual(G.formatPesos(1240000), '$1.240.000');
  assert.strictEqual(G.formatPesos(12345678901), '$12.345.678.901');
  assert.strictEqual(G.formatPesos(36200.4), '$36.200');
  assert.strictEqual(G.formatPesos(18900.5), '$18.901');
  assert.strictEqual(G.formatPesos(-30000), '-$30.000');
  assert.strictEqual(G.formatPesos('abc'), '$0');
  assert.strictEqual(G.formatPesos(null), '$0');
});

test('shortDay / relativeDay / shortDate', () => {
  assert.strictEqual(G.shortDay('2026-11-11'), 'mié 11 nov');
  assert.strictEqual(G.shortDay('2026-10-25'), 'dom 25 oct');
  assert.strictEqual(G.shortDay('2027-01-01'), 'vie 1 ene');
  assert.strictEqual(G.shortDay('2028-02-29'), 'mar 29 feb');
  assert.strictEqual(G.relativeDay('2026-11-11', '2026-11-11'), 'hoy');
  assert.strictEqual(G.relativeDay('2026-11-10', '2026-11-11'), 'ayer');
  assert.strictEqual(G.relativeDay('2026-12-31', '2027-01-01'), 'ayer');
  assert.strictEqual(G.relativeDay('2026-11-09', '2026-11-11'), 'lun 9 nov');
  assert.strictEqual(G.shortDate('2026-03-01'), '1 mar');
});

test('cleanMerchant', () => {
  assert.strictEqual(G.cleanMerchant('DOMICILIOS YA*DL'), 'Domicilios Ya');
  assert.strictEqual(G.cleanMerchant('PASARELA*FIBRA  HOGAR'), 'Pasarela · Fibra Hogar');
  assert.strictEqual(G.cleanMerchant('EMPRESA DE AGUAS DEL VALLE'), 'Empresa de Aguas del Valle');
  assert.strictEqual(G.cleanMerchant('STREAMPLUS DL'), 'Streamplus DL');
  assert.strictEqual(G.cleanMerchant('RESTAURANTE MAR Y TIERRA'), 'Restaurante Mar y Tierra');
  assert.strictEqual(G.cleanMerchant('Cuenta *12345678901'), 'Cuenta *12345678901');
  assert.strictEqual(G.cleanMerchant('EDS EL PUENTE LA 80'), 'Eds el Puente la 80');
  assert.strictEqual(G.cleanMerchant('  Tienda   de la esquina '), 'Tienda de la esquina');
  assert.strictEqual(G.cleanMerchant('(sin identificar)'), '(sin identificar)');
  assert.strictEqual(G.cleanMerchant(''), '');
  assert.strictEqual(G.cleanMerchant(null), '');
});

test('shortName', () => {
  assert.strictEqual(G.shortName('Restaurantes (4 al mes)'), 'Restaurantes');
  assert.strictEqual(G.shortName('Energía (Confirmar)'), 'Energía');
  assert.strictEqual(G.shortName('Carro - cuota banco'), 'Carro - cuota banco');
  assert.strictEqual(G.shortName('(solo paréntesis)'), '(solo paréntesis)');
});

// ---------- Cycle ----------
test('cycle: boundaries, month lengths and year change', () => {
  const c = (f, d) => { const x = G.cycle(f, d); return [x.start, x.end, x.days, x.label]; };
  assert.deepStrictEqual(c('2026-11-24', 25), ['2026-10-25', '2026-11-24', 31, '25 oct – 24 nov']);
  assert.deepStrictEqual(c('2026-11-25', 25), ['2026-11-25', '2026-12-24', 30, '25 nov – 24 dic']);
  assert.deepStrictEqual(c('2026-11-11', 25), ['2026-10-25', '2026-11-24', 31, '25 oct – 24 nov']);
  assert.deepStrictEqual(c('2026-12-25', 25), ['2026-12-25', '2027-01-24', 31, '25 dic – 24 ene']);
  assert.deepStrictEqual(c('2026-12-31', 25), ['2026-12-25', '2027-01-24', 31, '25 dic – 24 ene']);
  assert.deepStrictEqual(c('2027-01-01', 25), ['2026-12-25', '2027-01-24', 31, '25 dic – 24 ene']);
  assert.deepStrictEqual(c('2027-01-24', 25), ['2026-12-25', '2027-01-24', 31, '25 dic – 24 ene']);
  assert.deepStrictEqual(c('2027-01-25', 25), ['2027-01-25', '2027-02-24', 31, '25 ene – 24 feb']);
  assert.deepStrictEqual(c('2027-02-24', 25), ['2027-01-25', '2027-02-24', 31, '25 ene – 24 feb']);
  assert.deepStrictEqual(c('2027-02-25', 25), ['2027-02-25', '2027-03-24', 28, '25 feb – 24 mar']);
  assert.deepStrictEqual(c('2028-02-25', 25), ['2028-02-25', '2028-03-24', 29, '25 feb – 24 mar']);
  assert.deepStrictEqual(c('2027-03-24', 25), ['2027-02-25', '2027-03-24', 28, '25 feb – 24 mar']);
  // Cutoff day 1 and 31 (clamped in short months)
  assert.deepStrictEqual(c('2026-11-11', 1), ['2026-11-01', '2026-11-30', 30, '1 nov – 30 nov']);
  assert.deepStrictEqual(c('2027-02-27', 31), ['2027-01-31', '2027-02-27', 28, '31 ene – 27 feb']);
  assert.deepStrictEqual(c('2027-02-28', 31), ['2027-02-28', '2027-03-30', 31, '28 feb – 30 mar']);
});

test('previousCycle / nextCycle', () => {
  const c = G.cycle('2027-01-10', 25);
  const a = G.previousCycle(c, 25), s = G.nextCycle(c, 25);
  assert.deepStrictEqual([a.start, a.end], ['2026-11-25', '2026-12-24']);
  assert.deepStrictEqual([s.start, s.end], ['2027-01-25', '2027-02-24']);
  // 24 cycles back and forth land on the same cycle, contiguous with no gaps
  let x = c;
  for (let i = 0; i < 24; i++) { const p = G.previousCycle(x, 25); assert.strictEqual(G.addDays(p.end, 1), x.start); x = p; }
  for (let i = 0; i < 24; i++) x = G.nextCycle(x, 25);
  assert.deepStrictEqual(x, c);
});

test('localDate uses the local date, not UTC', () => {
  assert.strictEqual(G.localDate(new Date(2026, 10, 11, 23, 30)), '2026-11-11');
  assert.strictEqual(G.localDate(new Date(2026, 10, 11, 0, 5)), '2026-11-11');
});

// ---------- Matching ----------
test('matchBudgetLines', () => {
  const lines = [
    { name: 'Energía (Confirmar)' }, { name: 'Restaurantes (6 al mes)' }, { name: 'Carro - cuota banco' },
    { name: 'Carro - mantenimiento preventivo (cada 6 meses)' }, { name: 'Mascota (incluye veterinaria)' },
    { name: 'Odontóloga' }, { name: 'Arriendo ' }, { name: 'Carro' }, { name: '' },
  ];
  const m = G.matchBudgetLines(lines, ['Energia', 'Restaurantes', 'Carro - cuota banco', 'Carro - mantenimiento',
    'Mascota', 'Odontologa', 'arriendo', 'Carro - gasolina', 'Otros', 'Ingreso', 'No contar', 'Sin categoría', 'Restaurantes y bares (todos)']);
  assert.strictEqual(m['Energia'], 0);
  assert.strictEqual(m['Restaurantes'], 1);
  assert.strictEqual(m['Carro - cuota banco'], 2, 'exact beats the shorter "Carro"');
  assert.strictEqual(m['Carro - mantenimiento'], 3);
  assert.strictEqual(m['Mascota'], 4);
  assert.strictEqual(m['Odontologa'], 5, 'accents ignored');
  assert.strictEqual(m['arriendo'], 6, 'case and spaces ignored');
  assert.strictEqual(m['Carro - gasolina'], 7, 'reverse prefix: category starts with the line name');
  assert.strictEqual(m['Otros'], -1);
  assert.strictEqual(m['Ingreso'], -1);
  assert.strictEqual(m['No contar'], -1);
  assert.strictEqual(m['Sin categoría'], -1);
  assert.strictEqual(m['Restaurantes y bares (todos)'], -1);
});

// ---------- Fixture: a response in the script's wire format ----------
function wireFixture() {
  const M = (fecha, hora, categoria, monto, comercio, tipo) => ({ fecha, hora, banco: 'Banco X', tipo: tipo || 'Compra',
    monto, comercio, producto: 'Tarjeta *0000', categoria });
  return {
    ok: true,
    generado: '2026-11-11T16:40:05-05:00',
    config: { diaCorte: 25, tarjetas: [{ nombre: 'Tarjeta A', dia: 17 }, { nombre: 'Tarjeta B', dia: 1 }] },
    presupuesto: {
      ingreso: 4000000, ahorroMeta: 1000000, presupuesto: 2500000,
      lineas: [
        { nombre: 'Arriendo', monto: 1000000, grupo: 'fijo' },
        { nombre: 'Energía (Confirmar)', monto: 200000, grupo: 'fijo' },
        { nombre: 'Streaming', monto: 20000, grupo: 'fijo' },
        { nombre: 'Mercado', monto: 500000, grupo: 'fijo' },
        { nombre: 'Restaurantes (6 al mes)', monto: 300000, grupo: 'salidas' },
        { nombre: 'Eventos (cine)', monto: 200000, grupo: 'salidas' },
      ],
    },
    categorias: ['Arriendo', 'Energía', 'Streaming', 'Mercado', 'Restaurantes', 'Eventos', 'Otros', 'Ingreso', 'No contar', 'Sin categoría'],
    movimientos: [
      M('2026-10-20', '10:00', 'Mercado', 50000, 'TIENDA'),
      M('2026-10-25', '08:00', 'Arriendo', 1000000, 'ARRENDAMIENTOS SOL', 'Transferencia'),
      M('2026-10-25', '09:00', 'Ingreso', 4000000, 'EMPRESA', 'Ingreso'),
      M('2026-10-28', '03:20', 'Streaming', 19000, 'STREAMPLUS DL'),
      M('2026-11-01', '22:18', 'Energía', 230000, 'EMPRESA DE ENERGIA'),
      M('2026-11-02', '20:00', 'Restaurantes', 280000, 'DOMICILIOS YA*DL'),
      M('2026-11-03', '12:00', 'Otros', 70000, 'DEVOLUCION', 'Ingreso'),
      M('2026-11-05', '10:00', 'Mercado', 120000, 'EXITO'),
      M('2026-11-05', '11:00', 'Otros', 40000, 'FERRETERIA'),
      M('2026-11-10', '09:00', 'Sin categoría', 15000, 'TIENDA X'),
      M('2026-11-11', '16:39', '', 25000, 'TIENDA Y'),
      M('2026-11-11', '17:00', 'No contar', 300000, 'Cuenta *0000', 'Transferencia'),
      M('2026-11-25', '10:00', 'Mercado', 99999, 'EXITO'),
    ],
  };
}
const fixture = () => G.fromApi(wireFixture());
const TODAY = '2026-11-11';
const C = G.cycle(TODAY, 25);

// ---------- Wire adapter ----------
test('fromApi maps the wire format to internal names', () => {
  const d = fixture();
  assert.strictEqual(d.generatedAt, '2026-11-11T16:40:05-05:00');
  assert.strictEqual(d.isDemo, false);
  assert.deepStrictEqual(d.config, { cutoffDay: 25, cards: [{ name: 'Tarjeta A', day: 17 }, { name: 'Tarjeta B', day: 1 }] });
  assert.deepStrictEqual([d.budget.income, d.budget.savingsGoal, d.budget.total], [4000000, 1000000, 2500000]);
  assert.deepStrictEqual(d.budget.lines[1], { name: 'Energía (Confirmar)', amount: 200000, group: 'fixed' });
  assert.deepStrictEqual(d.budget.lines[4], { name: 'Restaurantes (6 al mes)', amount: 300000, group: 'outings' });
  assert.strictEqual(d.categories.length, 10);
  assert.deepStrictEqual(d.transactions[1], { date: '2026-10-25', time: '08:00', bank: 'Banco X', type: 'Transferencia',
    amount: 1000000, merchant: 'ARRENDAMIENTOS SOL', product: 'Tarjeta *0000', category: 'Arriendo' });
  assert.strictEqual(d.transactions[10].category, 'Sin categoría', 'empty category becomes Sin categoría');
  assert.strictEqual(G.isValidData(d), true);
  // Missing pieces do not throw
  const empty = G.fromApi({ ok: true });
  assert.deepStrictEqual(empty.budget, { income: 0, savingsGoal: 0, total: 0, lines: [] });
  assert.strictEqual(empty.config.cutoffDay, 25);
  assert.deepStrictEqual(empty.transactions, []);
});

test('apiRequestBody / isKeyError', () => {
  assert.strictEqual(G.apiRequestBody('k1'), '{"accion":"datos","clave":"k1"}');
  assert.strictEqual(G.isKeyError({ ok: false, error: 'clave' }), true);
  assert.strictEqual(G.isKeyError({ ok: false, error: 'boom' }), false);
  assert.strictEqual(G.isKeyError(wireFixture()), false);
});

test('isValidResponse', () => {
  assert.strictEqual(G.isValidResponse(wireFixture()), true);
  assert.strictEqual(G.isValidResponse({ ok: false, error: 'clave' }), false);
  assert.strictEqual(G.isValidResponse({ ok: true }), false);
  assert.strictEqual(G.isValidResponse(null), false);
  assert.strictEqual(G.isValidData(null), false);
});

// ---------- Summary ----------
test('summary: every field', () => {
  const r = G.summary(fixture(), C, TODAY);
  assert.strictEqual(r.total, 1729000);
  assert.strictEqual(r.budget, 2500000);
  assert.strictEqual(r.available, 771000);
  assert.strictEqual(r.daysElapsed, 17);
  assert.strictEqual(r.daysLeft, 14);
  assert.strictEqual(r.daysElapsed + r.daysLeft, C.days);
  assert.strictEqual(r.isCurrent, true);
  assert.strictEqual(r.isPast, false);
  assert.strictEqual(r.spendingCount, 8);
  const L = Object.fromEntries(r.lines.map((l) => [l.shortName, [l.spent, l.amount, l.remaining, l.pct, l.status, l.paid]]));
  assert.deepStrictEqual(L, {
    Arriendo: [1000000, 1000000, 0, 100, 'close', true],
    'Energía': [230000, 200000, -30000, 115, 'over', true],
    Streaming: [19000, 20000, 1000, 95, 'close', true],
    Mercado: [120000, 500000, 380000, 24, 'on-track', false],
    Restaurantes: [280000, 300000, 20000, 93, 'close', false],
    Eventos: [0, 200000, 200000, 0, 'no-payments', false],
  });
  assert.strictEqual(r.lines[1].name, 'Energía (Confirmar)');
  assert.strictEqual(r.lines[3].transactions.length, 1, 'only this cycle');
  assert.deepStrictEqual(r.unbudgeted.map((s) => [s.name, s.spent, s.transactions.length]), [['Otros', 40000, 1]]);
  assert.deepStrictEqual([r.uncategorized.count, r.uncategorized.total], [2, 40000]);
  assert.strictEqual(r.uncategorized.transactions[0].merchant, 'TIENDA Y', 'empty category treated as Sin categoría, newest first');
  assert.deepStrictEqual(r.outings, { budget: 500000, spent: 280000, remaining: 220000, perDay: 15714 });
  assert.strictEqual(r.projection, 1729000 + 1000 + 380000 + 20000 + 200000);
  assert.strictEqual(r.projectedSavings, 4000000 - 2330000);
  assert.strictEqual(r.savingsGoal, 1000000);
  assert.strictEqual(r.meetsGoal, true);
  assert.strictEqual(r.series.length, 31);
  assert.deepStrictEqual([r.series[0].date, r.series[0].total, r.series[0].future], ['2026-10-25', 1000000, false]);
  assert.deepStrictEqual([r.series[17].date, r.series[17].total, r.series[17].future], ['2026-11-11', 25000, false]);
  assert.deepStrictEqual([r.series[18].date, r.series[18].future], ['2026-11-12', true]);
  assert.strictEqual(r.series[30].date, '2026-11-24');
  assert.strictEqual(r.series[11].total, 160000);
  assert.deepStrictEqual(r.series[11].transactions.map((t) => t.amount), [120000, 40000], 'largest first');
  assert.strictEqual(r.series.reduce((s, d) => s + d.total, 0), r.total);
  assert.strictEqual(r.largest.merchant, 'ARRENDAMIENTOS SOL');
  assert.strictEqual(r.partial, false);
  assert.strictEqual(r.since, null);
  assert.deepStrictEqual(r.cards, [
    { name: 'Tarjeta A', date: '2026-11-17', days: 6 },
    { name: 'Tarjeta B', date: '2026-12-01', days: 20 },
  ]);
  assert.strictEqual(r.transactions.length, 11, 'all rows of the cycle, including excluded ones');
  assert.strictEqual(r.transactions[0].time, '17:00', 'newest first');
});

test('insights and headline for the fixture', () => {
  const r = G.summary(fixture(), C, TODAY);
  const list = G.insights(r);
  assert.deepStrictEqual(texts(list), [
    'Si lo que falta sale según el presupuesto, ahorrarían $1.670.000 este ciclo. La meta es $1.000.000.',
    'Para salidas y gustos quedan $220.000 de $500.000: unos $15.714 por día hasta el 24.',
    'Energía ya se pasó por $30.000.',
    'Restaurantes va en 93% de su presupuesto.',
    'Ya aparecen pagados 3 de 4 gastos fijos. Faltan: Mercado.',
    'Hay 2 movimientos sin categoría por $40.000. Mientras no la tengan, no entran en ningún presupuesto.',
    'La compra más grande fue Arrendamientos Sol: $1.000.000 el dom 25 oct.',
    'La tarjeta A vence el mar 17 nov (en 6 días).',
  ]);
  assert.deepStrictEqual(list.map((f) => f.tone), ['good', 'good', 'bad', 'warn', 'info', 'warn', 'info', 'warn']);
  for (const f of list) assert.ok(['good', 'warn', 'bad', 'info'].includes(f.tone));
  assert.deepStrictEqual(G.headline(r), ['Van $1.729.000 gastados de $2.500.000.', 'Quedan 14 días y $771.000 por gastar.']);
});

/** Summary after editing the wire fixture (so edits use the script's format). */
function withChanges(fn, today) {
  const w = wireFixture();
  fn(w);
  const t = today || TODAY;
  return G.summary(G.fromApi(w), G.cycle(t, 25), t);
}
const addTx = (w, categoria, monto, fecha) => w.movimientos.push({ fecha: fecha || '2026-11-06', hora: '1', tipo: 'Compra', monto, comercio: 'X', categoria });

test('rule 1: savings', () => {
  let r = withChanges((w) => { w.presupuesto.ahorroMeta = 2000000; });
  let f = G.insights(r).find((x) => x.key === 'savings');
  assert.strictEqual(f.tone, 'warn');
  assert.strictEqual(f.text, 'Si lo que falta sale según el presupuesto, ahorrarían $1.670.000 este ciclo. La meta es $2.000.000. Quedarían $330.000 por debajo.');
  r = withChanges((w) => { w.presupuesto.ingreso = 0; });
  assert.ok(!keys(G.insights(r)).includes('savings'), 'no income -> no savings sentence');
  r = withChanges((w) => { w.presupuesto.ingreso = 2000000; });
  f = G.insights(r).find((x) => x.key === 'savings');
  assert.strictEqual(f.tone, 'bad');
  assert.strictEqual(f.text, 'Si lo que falta sale según el presupuesto, gastarían $330.000 más de lo que entra este ciclo. La meta de ahorro es $1.000.000.');
  r = G.summary(fixture(), C, '2026-11-30');
  f = G.insights(r).find((x) => x.key === 'savings');
  assert.strictEqual(f.text, 'En este ciclo ahorraron $2.271.000. La meta era $1.000.000.');
});

test('rule 2: outings', () => {
  let r = withChanges((w) => addTx(w, 'Eventos', 300000, '2026-11-08'));
  let f = G.insights(r).find((x) => x.key === 'outings');
  assert.deepStrictEqual([f.tone, f.text], ['bad', 'Salidas y gustos ya se pasó por $80.000.']);
  r = withChanges((w) => { w.presupuesto.lineas = w.presupuesto.lineas.filter((l) => l.grupo !== 'salidas'); });
  assert.ok(!keys(G.insights(r)).includes('outings'));
  r = G.summary(fixture(), C, '2026-11-24');
  assert.strictEqual(G.insights(r).find((x) => x.key === 'outings').text, 'Para salidas y gustos quedan $220.000 de $500.000: unos $220.000 por día hasta el 24.');
  r = G.summary(fixture(), C, '2026-12-02');
  assert.strictEqual(r.outings.perDay, null, 'no per-day amount for a closed cycle');
  assert.strictEqual(G.insights(r).find((x) => x.key === 'outings').text, 'En salidas y gustos sobraron $220.000 de $500.000.');
});

test('rule 3: lines over budget, at most 3, most over first', () => {
  const r = withChanges((w) => {
    addTx(w, 'Mercado', 400000);      // over by 20000
    addTx(w, 'Streaming', 30000);     // over by 29000
    addTx(w, 'Restaurantes', 120000); // over by 100000
    addTx(w, 'Eventos', 210000);      // over by 10000
  });
  const list = G.insights(r).filter((x) => x.key === 'over');
  assert.deepStrictEqual(texts(list), ['Restaurantes ya se pasó por $100.000.', 'Energía ya se pasó por $30.000.', 'Streaming ya se pasó por $29.000.']);
  assert.ok(list.every((f) => f.tone === 'bad'));
  assert.ok(!G.insights(G.summary(fixture(), C, TODAY)).some((f) => f.key === 'over' && /Mercado/.test(f.text)));
});

test('rule 4: close to the limit, at most 2, paid fixed lines excluded', () => {
  const r = withChanges((w) => {
    addTx(w, 'Eventos', 180000);   // 90%
    addTx(w, 'Mercado', 330000);   // 450000 -> 90% but fixed and paid
  });
  const list = G.insights(r).filter((x) => x.key === 'close');
  assert.deepStrictEqual(texts(list), ['Restaurantes va en 93% de su presupuesto.', 'Eventos va en 90% de su presupuesto.']);
  const r2 = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.categoria !== 'Restaurantes'); });
  assert.ok(!keys(G.insights(r2)).includes('close'));
  // 85% is "close", 84% is not
  const r3 = withChanges((w) => { w.movimientos.find((m) => m.categoria === 'Restaurantes').monto = 255000; });
  assert.strictEqual(r3.lines[4].status, 'close');
  const r4 = withChanges((w) => { w.movimientos.find((m) => m.categoria === 'Restaurantes').monto = 252000; });
  assert.strictEqual(r4.lines[4].status, 'on-track');
});

test('rule 5: fixed expenses', () => {
  const r = withChanges((w) => {
    w.presupuesto.lineas.push({ nombre: 'Gimnasio', monto: 150000, grupo: 'fijo' }, { nombre: 'Seguro', monto: 90000, grupo: 'fijo' },
      { nombre: 'Agua', monto: 50000, grupo: 'fijo' });
  });
  assert.strictEqual(G.insights(r).find((x) => x.key === 'fixed').text,
    'Ya aparecen pagados 3 de 7 gastos fijos. Faltan: Mercado, Gimnasio, Seguro y 1 más.');
  const r2 = withChanges((w) => addTx(w, 'Mercado', 460000));
  assert.strictEqual(G.insights(r2).find((x) => x.key === 'fixed').text, 'Ya aparecen pagados los 4 gastos fijos.');
  const r3 = withChanges((w) => { w.movimientos = []; });
  assert.strictEqual(G.insights(r3).find((x) => x.key === 'fixed').text, 'Aún no aparece pagado ninguno de los 4 gastos fijos. Faltan: Arriendo, Mercado, Energía y 1 más.');
  const r4 = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.categoria !== 'Arriendo' && m.categoria !== 'Streaming'); });
  assert.strictEqual(G.insights(r4).find((x) => x.key === 'fixed').text, 'Ya aparece pagado 1 de 4 gastos fijos. Faltan: Arriendo, Mercado y Streaming.');
  const r6 = G.summary(fixture(), C, '2026-12-01');
  assert.strictEqual(G.insights(r6).find((x) => x.key === 'fixed').text, 'Aparecieron pagados 3 de 4 gastos fijos. No aparecieron: Mercado.');
  const r5 = withChanges((w) => { w.presupuesto.lineas = w.presupuesto.lineas.filter((l) => l.grupo !== 'fijo'); });
  assert.ok(!keys(G.insights(r5)).includes('fixed'));
});

test('rule 6: uncategorized', () => {
  const r = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.comercio !== 'TIENDA X'); });
  assert.strictEqual(G.insights(r).find((x) => x.key === 'uncategorized').text,
    'Hay 1 movimiento sin categoría por $25.000. Mientras no la tenga, no entra en ningún presupuesto.');
  const r2 = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.categoria && m.categoria !== 'Sin categoría'); });
  assert.ok(!keys(G.insights(r2)).includes('uncategorized'));
  assert.strictEqual(r2.total, 1729000 - 40000, 'uncategorized rows count in the total');
});

test('rule 7: largest purchase', () => {
  const r = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.categoria !== 'Arriendo'); });
  assert.strictEqual(G.insights(r).find((x) => x.key === 'largest').text, 'La compra más grande fue Domicilios Ya: $280.000 el lun 2 nov.');
  const r2 = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.categoria === 'No contar' || m.categoria === 'Ingreso' || m.tipo === 'Ingreso'); });
  assert.ok(!keys(G.insights(r2)).includes('largest'));
  assert.strictEqual(r2.largest, null);
});

test('rule 8: cards', () => {
  let r = G.summary(fixture(), C, '2026-11-17');
  assert.deepStrictEqual(texts(G.insights(r).filter((x) => x.key === 'card')), ['La tarjeta A vence hoy.']);
  r = G.summary(fixture(), C, '2026-11-24');
  assert.deepStrictEqual(texts(G.insights(r).filter((x) => x.key === 'card')), ['La tarjeta B vence el mar 1 dic (en 7 días).']);
  r = G.summary(fixture(), C, '2026-11-09');
  assert.deepStrictEqual(texts(G.insights(r).filter((x) => x.key === 'card')), []);
  r = G.summary(fixture(), C, '2026-11-16');
  assert.deepStrictEqual(texts(G.insights(r).filter((x) => x.key === 'card')), ['La tarjeta A vence el mar 17 nov (en 1 día).']);
  // Day 31 in a 30-day month falls on the 30th; a closed cycle says nothing about cards
  r = withChanges((w) => { w.config.tarjetas = [{ nombre: 'Visa', dia: 31 }]; }, '2026-11-24');
  assert.deepStrictEqual(r.cards, [{ name: 'Visa', date: '2026-11-30', days: 6 }]);
  assert.deepStrictEqual(texts(G.insights(r).filter((x) => x.key === 'card')), ['La Visa vence el lun 30 nov (en 6 días).']);
  r = G.summary(fixture(), C, '2026-12-10');
  assert.ok(!keys(G.insights(r)).includes('card'));
});

test('rule 9: partial cycle', () => {
  const r = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.fecha >= '2026-10-28'); });
  assert.strictEqual(r.partial, true);
  assert.strictEqual(r.since, '2026-10-28');
  const list = G.insights(r);
  assert.strictEqual(list[list.length - 1].text, 'El registro empezó el mié 28 oct. Lo gastado antes no aparece.');
  assert.ok(!keys(list).includes('savings'), 'no savings claim when tracking began mid-cycle');
  // Tracking started exactly on the cycle start -> not partial
  const r2 = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.fecha >= '2026-10-25'); });
  assert.strictEqual(r2.partial, false);
  assert.ok(!keys(G.insights(r2)).includes('partial'));
});

test('headline: empty, over budget, closed cycle', () => {
  const empty = withChanges((w) => { w.movimientos = []; });
  assert.deepStrictEqual(G.headline(empty), ['Aún no hay gastos en este ciclo.']);
  assert.strictEqual(empty.series.length, 31);
  assert.strictEqual(empty.lines.length, 6, 'budget lines still there');
  const onlyExcluded = withChanges((w) => { w.movimientos = w.movimientos.filter((m) => m.categoria === 'No contar' || m.categoria === 'Ingreso' || m.tipo === 'Ingreso'); });
  assert.deepStrictEqual(G.headline(onlyExcluded), ['Aún no hay gastos en este ciclo.']);
  const over = withChanges((w) => addTx(w, 'Otros', 1000000, '2026-11-09'));
  assert.deepStrictEqual(G.headline(over), ['Van $2.729.000 gastados de $2.500.000.', 'Se pasaron por $229.000.']);
  const lastDay = G.summary(fixture(), C, '2026-11-24');
  assert.deepStrictEqual(G.headline(lastDay), ['Van $1.729.000 gastados de $2.500.000.', 'Queda 1 día y $771.000 por gastar.']);
  const closed = G.summary(fixture(), C, '2026-11-25');
  assert.strictEqual(closed.isCurrent, false);
  assert.deepStrictEqual([closed.daysElapsed, closed.daysLeft], [31, 0]);
  assert.deepStrictEqual(G.headline(closed), ['Se gastaron $1.729.000 de $2.500.000.', 'Cerró $771.000 por debajo del presupuesto.']);
  assert.ok(closed.series.every((d) => !d.future));
  const closedOver = withChanges((w) => addTx(w, 'Otros', 1000000, '2026-11-09'), '2026-12-01');
  assert.strictEqual(closedOver.cycle.start, '2026-11-25', 'withChanges uses the cycle of its own date');
  const closedOverOct = G.summary(G.fromApi((() => { const w = wireFixture(); addTx(w, 'Otros', 1000000, '2026-11-09'); return w; })()), C, '2026-12-01');
  assert.deepStrictEqual(G.headline(closedOverOct)[1], 'Cerró $229.000 por encima.');
  const emptyClosed = G.summary({ budget: {}, transactions: [] }, C, '2027-01-01');
  assert.deepStrictEqual(G.headline(emptyClosed), ['No hay gastos registrados en este ciclo.']);
  assert.deepStrictEqual(G.insights(emptyClosed), []);
});

test('summary tolerates incomplete data', () => {
  const r = G.summary({}, C, TODAY);
  assert.strictEqual(r.total, 0);
  assert.deepStrictEqual(r.lines, []);
  assert.deepStrictEqual(G.insights(r), []);
  const r2 = G.summary({ budget: { lines: [{ name: 'A', amount: 100, group: 'fixed' }] },
    transactions: [{ date: 'bad' }, { date: '2026-11-01', amount: '50', category: 'A', type: 'Compra' }] }, C, TODAY);
  assert.strictEqual(r2.budget, 100, 'budget falls back to the sum of lines');
  assert.strictEqual(r2.total, 50);
});

// ---------- Access code ----------
test('decodeAccessCode', () => {
  const code = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
  const U = 'https://script.google.com/macros/s/PRUEBA_abc-123/exec';
  assert.deepStrictEqual(G.decodeAccessCode(code({ u: U, k: 'abc' })), { u: U, k: 'abc' });
  const padded = Buffer.from(JSON.stringify({ u: U, k: 'ab' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  assert.deepStrictEqual(G.decodeAccessCode(padded), { u: U, k: 'ab' });
  const long = code({ u: U, k: 'x'.repeat(64) });
  assert.deepStrictEqual(G.decodeAccessCode('  ' + long.slice(0, 20) + '\n' + long.slice(20) + ' \n'), { u: U, k: 'x'.repeat(64) }, 'whitespace from pasting');
  assert.strictEqual(G.decodeAccessCode(code({ u: 'https://evil.example/macros/s/x/exec', k: 'a' })), null);
  assert.strictEqual(G.decodeAccessCode(code({ u: 'http://script.google.com/macros/s/x/exec', k: 'a' })), null);
  assert.strictEqual(G.decodeAccessCode(code({ u: 'https://script.google.com/macros/s/x/dev', k: 'a' })), null);
  assert.strictEqual(G.decodeAccessCode(code({ u: 'https://script.google.com/macros/s/x/exec?y=1/exec', k: 'a' })), null);
  assert.strictEqual(G.decodeAccessCode(code({ u: U, k: '' })), null);
  assert.strictEqual(G.decodeAccessCode(code({ u: U, k: 5 })), null);
  assert.strictEqual(G.decodeAccessCode(code({ u: U })), null);
  assert.strictEqual(G.decodeAccessCode(code([U, 'k'])), null);
  assert.strictEqual(G.decodeAccessCode('esto no es un código'), null);
  assert.strictEqual(G.decodeAccessCode('aGVsbG8'), null);
  assert.strictEqual(G.decodeAccessCode(''), null);
  assert.strictEqual(G.decodeAccessCode(null), null);
});

// ---------- Demo ----------
test('demoData: every day of two years looks lived-in', () => {
  let d = '2026-01-01';
  for (let i = 0; i < 731; i++, d = G.addDays(d, 1)) {
    const data = G.demoData(d);
    assert.strictEqual(G.isValidData(data), true);
    assert.strictEqual(data.isDemo, true);
    const c = G.cycle(d, data.config.cutoffDay);
    const r = G.summary(data, c, d);
    assert.ok(r.isCurrent, d);
    assert.ok(r.daysElapsed >= 17 && r.daysElapsed <= 20, d + ' ' + r.daysElapsed);
    assert.ok(r.lines.filter((l) => l.status === 'over').length >= 2, d + ' over');
    assert.ok(r.lines.some((l) => l.status === 'close' && !l.paid), d + ' close');
    assert.ok(r.lines.some((l) => l.group === 'fixed' && !l.paid), d + ' pending fixed');
    assert.strictEqual(r.uncategorized.count, 2, d);
    assert.strictEqual(r.transactions.filter((t) => t.category === 'No contar').length, 1, d);
    assert.ok(r.unbudgeted.length >= 1, d);
    assert.ok(r.cards[0].days <= 7, d + ' card due soon');
    const p = G.summary(data, G.previousCycle(c, data.config.cutoffDay), d);
    assert.ok(p.isPast && p.partial && p.spendingCount > 5, d + ' previous cycle');
    assert.ok(data.transactions.every((t) => t.date <= d), d + ' nothing in the future');
  }
  const demo = G.demoData(TODAY);
  const list = G.insights(G.summary(demo, G.cycle(TODAY, demo.config.cutoffDay), TODAY));
  for (const k of ['savings', 'outings', 'over', 'close', 'fixed', 'uncategorized', 'largest', 'card']) assert.ok(keys(list).includes(k), k);
});

// ---------- Fingerprint to compare time zones ----------
function fingerprint() {
  const out = [];
  let d = '2026-01-01';
  for (let i = 0; i < 400; i += 7, d = G.addDays(d, 7)) {
    const data = G.demoData(d);
    const r = G.summary(data, G.cycle(d, data.config.cutoffDay), d);
    out.push(G.headline(r).join(' '), texts(G.insights(r)).join(' '), r.series.map((s) => s.date + ':' + s.total).join(','));
  }
  out.push(JSON.stringify(G.summary(fixture(), C, TODAY), (k, v) => (v === Infinity ? 'inf' : v)));
  return require('node:crypto').createHash('sha256').update(out.join('\n')).digest('hex');
}

const hash = fingerprint();
if (process.env.GASTOS_CHILD) {
  process.stdout.write(hash);
} else {
  const zones = ['America/Bogota', 'UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata'];
  const hashes = zones.map((tz) => execFileSync(process.execPath, [__filename], { env: { ...process.env, TZ: tz, GASTOS_CHILD: '1' } }).toString());
  zones.forEach((tz, i) => assert.strictEqual(hashes[i], hash, 'different result under TZ=' + tz));
  console.log('logic.test.js: ' + testCount + ' tests ok (TZ=' + (process.env.TZ || 'system') + '); identical results in ' + zones.join(', '));
}
