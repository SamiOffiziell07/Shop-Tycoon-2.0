// economy.js – das EINZIGE Geldsystem des Spiels.
// Das Geld liegt im Spielstand-Objekt (state.money), wird aber ausschließlich über diese Funktionen verändert.
// Einkauf, Verkauf, Aufträge, Miete und Ausbau benutzen dieselben Funktionen.
// Jede Buchung hat eine Kategorie (cat). Daraus entsteht die Tagesstatistik (state.stats) für die Finanzübersicht.
// Mit opts.tx kann eine Buchung nur ein einziges Mal ausgeführt werden (Schutz gegen doppelte Buchungen).
'use strict';

const Economy = (() => {
  const START_MONEY = 2500;
  const LEDGER_LIMIT = 300;
  const TX_LIMIT = 400;
  const CATEGORY_NAMES = {
    einkauf: 'Wareneinkauf',
    verkauf: 'Verkauf',
    auftrag: 'Aufträge',
    reparatur: 'Reparaturen',
    miete: 'Miete & Nebenkosten',
    ausbau: 'Ausbau & Werkzeug',
    gebuehr: 'Gebühren & Strafen',
    praemie: 'Prämien für Ziele',
    sonstiges: 'Sonstiges',
  };
  let state = null;

  // Auf Cent runden, damit keine Fließkomma-Reste entstehen.
  const round2 = (x) => Math.round(x * 100) / 100;
  const validAmount = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

  function sanitizeLedger(l) {
    if (!Array.isArray(l)) return [];
    return l
      .filter((e) => e && Number.isFinite(e.amount) && typeof e.reason === 'string')
      .slice(-LEDGER_LIMIT)
      .map((e) => ({
        t: Number.isFinite(e.t) ? e.t : 0,
        amount: e.amount,
        reason: e.reason,
        balance: Number.isFinite(e.balance) ? e.balance : 0,
        cat: typeof e.cat === 'string' ? e.cat : 'sonstiges',
        day: Number.isInteger(e.day) && e.day >= 1 ? e.day : 1,
      }));
  }

  function sanitizeStats(s) {
    const out = { byDay: {}, totalIncome: 0, totalExpense: 0 };
    if (!s || typeof s !== 'object') return out;
    if (validAmount(s.totalIncome)) out.totalIncome = round2(s.totalIncome);
    if (validAmount(s.totalExpense)) out.totalExpense = round2(s.totalExpense);
    if (s.byDay && typeof s.byDay === 'object') {
      for (const k of Object.keys(s.byDay)) {
        const d = s.byDay[k];
        if (!/^\d+$/.test(k) || !d || typeof d !== 'object') continue;
        const cats = {};
        if (d.cats && typeof d.cats === 'object') {
          for (const c of Object.keys(d.cats)) if (Number.isFinite(d.cats[c])) cats[c] = round2(d.cats[c]);
        }
        out.byDay[k] = { income: validAmount(d.income) ? round2(d.income) : 0, expense: validAmount(d.expense) ? round2(d.expense) : 0, cats };
      }
    }
    return out;
  }

  // Verbindet das Geldsystem mit dem laufenden Spielstand (state.money, state.ledger, state.stats).
  function bind(s) {
    state = s;
    if (!validAmount(state.money)) state.money = START_MONEY;
    state.money = round2(state.money);
    state.ledger = sanitizeLedger(state.ledger);
    state.stats = sanitizeStats(state.stats);
    state.txIds = Array.isArray(state.txIds) ? state.txIds.filter((t) => typeof t === 'string').slice(-TX_LIMIT) : [];
  }

  function requireBound() {
    if (!state) throw new Error('Economy ist nicht mit einem Spielstand verbunden');
  }

  function day() {
    return Number.isInteger(state.day) && state.day >= 1 ? state.day : 1;
  }

  function record(amount, reason, cat) {
    const c = CATEGORY_NAMES[cat] ? cat : 'sonstiges';
    const d = day();
    state.ledger.push({ t: Date.now(), amount, reason, balance: state.money, cat: c, day: d });
    if (state.ledger.length > LEDGER_LIMIT) state.ledger.splice(0, state.ledger.length - LEDGER_LIMIT);
    const key = String(d);
    const rec = state.stats.byDay[key] || (state.stats.byDay[key] = { income: 0, expense: 0, cats: {} });
    if (amount >= 0) {
      rec.income = round2(rec.income + amount);
      state.stats.totalIncome = round2(state.stats.totalIncome + amount);
    } else {
      rec.expense = round2(rec.expense - amount);
      state.stats.totalExpense = round2(state.stats.totalExpense - amount);
    }
    rec.cats[c] = round2((rec.cats[c] || 0) + amount);
    // Nur die letzten 60 Tage behalten
    const keys = Object.keys(state.stats.byDay).map(Number).sort((a, b) => a - b);
    while (keys.length > 60) delete state.stats.byDay[String(keys.shift())];
  }

  function seenTx(tx) {
    return typeof tx === 'string' && state.txIds.includes(tx);
  }
  function markTx(tx) {
    if (typeof tx !== 'string') return;
    state.txIds.push(tx);
    if (state.txIds.length > TX_LIMIT) state.txIds.splice(0, state.txIds.length - TX_LIMIT);
  }

  return {
    START_MONEY,
    CATEGORY_NAMES,
    bind,
    balance() {
      requireBound();
      return state.money;
    },
    canAfford(amount) {
      requireBound();
      return validAmount(amount) && round2(amount) <= state.money;
    },
    // Zieht Geld ab. Verändert NICHTS, wenn der Betrag ungültig ist oder das Geld nicht reicht.
    spend(amount, reason, cat, opts) {
      requireBound();
      if (!validAmount(amount)) return { ok: false, code: 'bad-amount', message: 'Ungültiger Betrag.' };
      const tx = opts && opts.tx;
      if (seenTx(tx)) return { ok: false, code: 'duplicate', message: 'Diese Buchung wurde bereits ausgeführt.' };
      const a = round2(amount);
      if (a > state.money) {
        return { ok: false, code: 'no-money', message: 'Nicht genug Geld.', missing: round2(a - state.money) };
      }
      state.money = round2(state.money - a);
      record(-a, reason || 'Ausgabe', cat);
      markTx(tx);
      return { ok: true, balance: state.money };
    },
    // Zieht höchstens so viel ab, wie vorhanden ist (z. B. Miete). Gibt den fehlenden Rest zurück.
    spendUpTo(amount, reason, cat) {
      requireBound();
      if (!validAmount(amount)) return { ok: false, code: 'bad-amount', message: 'Ungültiger Betrag.' };
      const a = round2(amount);
      const pay = Math.min(a, state.money);
      if (pay > 0) {
        state.money = round2(state.money - pay);
        record(-pay, reason || 'Ausgabe', cat);
      }
      return { ok: true, paid: pay, shortfall: round2(a - pay), balance: state.money };
    },
    // Schreibt Geld gut (Verkauf, Erstattung, Auftrag ...).
    earn(amount, reason, cat, opts) {
      requireBound();
      if (!validAmount(amount)) return { ok: false, code: 'bad-amount', message: 'Ungültiger Betrag.' };
      const tx = opts && opts.tx;
      if (seenTx(tx)) return { ok: false, code: 'duplicate', message: 'Diese Buchung wurde bereits ausgeführt.' };
      const a = round2(amount);
      state.money = round2(state.money + a);
      record(a, reason || 'Einnahme', cat);
      markTx(tx);
      return { ok: true, balance: state.money };
    },
    ledger() {
      requireBound();
      return state.ledger.slice();
    },
    // Tagesübersicht: { income, expense, profit, cats }
    dayStats(d) {
      requireBound();
      const r = state.stats.byDay[String(d)] || { income: 0, expense: 0, cats: {} };
      return { income: r.income, expense: r.expense, profit: round2(r.income - r.expense), cats: Object.assign({}, r.cats) };
    },
    totals() {
      requireBound();
      return { income: state.stats.totalIncome, expense: state.stats.totalExpense, profit: round2(state.stats.totalIncome - state.stats.totalExpense) };
    },
    sanitizeLedger,
    sanitizeStats,
    round2,
    format(amount) {
      const v = Number.isFinite(amount) ? amount : 0;
      const hasCents = Math.abs(v - Math.round(v)) > 0.004;
      return v.toLocaleString('de-DE', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
    },
  };
})();

if (typeof window !== 'undefined') window.Economy = Economy;
if (typeof module !== 'undefined') module.exports = Economy;
