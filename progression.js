// progression.js – Spieltag, Miete, Ruf, Ladenstufen und Ausbau (Upgrades).
// Reine Spiellogik ohne Oberfläche. Geld läuft immer über Economy, Ware über Inventory.
'use strict';

const Progress = (() => {
  const DAY_SECONDS = 300; // ein Spieltag = 5 Minuten Spielzeit
  const LEVELS = [
    { level: 1, name: 'Hinterzimmer-Laden', rep: 0 },
    { level: 2, name: 'Kleiner Fachhandel', rep: 25 },
    { level: 3, name: 'Etabliertes Computerhaus', rep: 80 },
    { level: 4, name: 'Regionaler Marktführer', rep: 200 },
    { level: 5, name: 'Computer-Imperium', rep: 420 },
  ];

  // Ausbau: Kosten, Mindeststufe, Voraussetzung, laufende Kosten pro Tag (upkeep)
  const UPGRADES = [
    { id: 'storage1', name: 'Lagerregale erweitern', desc: 'Mehr Platz im Lager: +40 Stück Kapazität.', cost: 400, level: 1, upkeep: 4 },
    { id: 'marketing1', name: 'Schaufenster-Werbung', desc: 'Mehr Laufkundschaft: etwa 25 % mehr Kunden.', cost: 600, level: 1, upkeep: 10 },
    { id: 'tools1', name: 'Profi-Werkzeugset', desc: 'Schnelleres Testen, ein zusätzlicher Auftragsplatz und bessere Reparaturgebühren.', cost: 700, level: 1, upkeep: 0 },
    { id: 'counter2', name: 'Zweite Kasse', desc: 'Längere Warteschlange möglich, Kunden warten etwas geduldiger.', cost: 1200, level: 2, upkeep: 8 },
    { id: 'shelves', name: 'Zusatzregale im Verkaufsraum', desc: 'Mehr Auswahl sichtbar: Kunden kaufen öfter einzelne Teile und es kommen etwas mehr Kunden.', cost: 1000, level: 2, upkeep: 4 },
    { id: 'tester', name: 'Diagnose-Messgerät', desc: 'Schaltet anspruchsvolle Reparaturaufträge frei und zeigt bei Fehlern genauere Hinweise.', cost: 900, level: 2, upkeep: 0 },
    { id: 'ambiente', name: 'Beleuchtung & Dekoration', desc: 'Angenehmeres Ladenklima: Kunden warten länger und zahlen eher einen fairen Aufpreis.', cost: 800, level: 2, upkeep: 6 },
    { id: 'storage2', name: 'Lagerraum anmieten', desc: 'Zusätzlicher Raum: +80 Stück Kapazität.', cost: 1500, level: 2, requires: 'storage1', upkeep: 12 },
    { id: 'marketing2', name: 'Online-Shop-Auftritt', desc: 'Noch mehr Kunden (etwa +50 % gegenüber dem Start) und anspruchsvollere Aufträge.', cost: 2500, level: 3, requires: 'marketing1', upkeep: 15 },
    { id: 'storage3', name: 'Hochregallager', desc: 'Großes Lager: +160 Stück Kapazität.', cost: 4500, level: 3, requires: 'storage2', upkeep: 18 },
    { id: 'tools2', name: 'Werkstatt-Ausbau', desc: 'Noch ein Auftragsplatz und höhere Reparaturgebühren.', cost: 3000, level: 3, requires: 'tools1', upkeep: 10 },
    { id: 'expand', name: 'Ladenerweiterung', desc: 'Größere Verkaufsfläche: mehr Kunden gleichzeitig, mehr Laufkundschaft, anspruchsvolle Großkunden.', cost: 8000, level: 4, requires: 'counter2', upkeep: 30 },
  ];

  // Tagesereignisse: sorgen für Abwechslung (Preise, Kundenzahl, Lieferzeit, Kundenmix). Sie hängen nur vom Tag ab und sind damit reproduzierbar.
  const EVENTS = [
    { id: 'gpu-sale', name: 'Grafikkarten-Aktion', desc: 'Alle Lieferanten senken heute die Preise für Grafikkarten um 12 %.', cats: ['gpu'], priceMult: 0.88 },
    { id: 'ram-shortage', name: 'Speicher-Knappheit', desc: 'Arbeitsspeicher und SSDs kosten heute 15 % mehr.', cats: ['ram', 'ssd'], priceMult: 1.15 },
    { id: 'rush', name: 'Kundenansturm', desc: 'Schönes Wetter und Werbung: heute kommen etwa 50 % mehr Kunden.', traffic: 1.5 },
    { id: 'rain', name: 'Regentag', desc: 'Es regnet in Strömen: heute kommen nur etwa 70 % der Kunden.', traffic: 0.7 },
    { id: 'strike', name: 'Lieferverzögerung', desc: 'Streik bei den Paketdiensten: neue Bestellungen brauchen heute 40 % länger.', delivery: 1.4 },
    { id: 'gamers', name: 'Gamer-Tag', desc: 'Ein Turnier in der Nähe: heute kommen mehr Gamer und Streamerinnen.', typeBoost: { gamer: 3, streamer: 2 } },
    { id: 'students', name: 'Schüler-Tag', desc: 'Schulfrei: heute kommen mehr Schüler und Bastler.', typeBoost: { schueler: 3, bastler: 2 } },
  ];
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return ((h >>> 0) % 100000) / 100000;
  }
  function eventForDay(day) {
    if (!Number.isInteger(day) || day < 3) return null; // die ersten Tage laufen ohne Ereignis
    if (hash01('ev|' + day) >= 0.45) return null;
    return EVENTS[Math.floor(hash01('ev2|' + day) * EVENTS.length) % EVENTS.length];
  }

  // Notfall-Kleinkredit: verhindert, dass man ohne Geld und Ware nicht mehr weiterkommt. Rückzahlung in Tagesraten.
  const LOAN = { amount: 500, repay: 550, rate: 100, maxMoney: 300 };

  function levelOf(rep) {
    let cur = LEVELS[0];
    for (const l of LEVELS) if (rep >= l.rep) cur = l;
    return cur;
  }

  const has = (s, id) => !!(s.upgrades && s.upgrades[id]);

  function dayOf(clock) {
    return Math.floor(Math.max(0, clock) / DAY_SECONDS) + 1;
  }

  return {
    DAY_SECONDS,
    LEVELS,
    EVENTS,
    eventForDay,
    currentEvent: (s) => eventForDay(s.day),
    UPGRADES,
    upgradeById: (id) => UPGRADES.find((u) => u.id === id) || null,
    has,

    // Verbindet/bereinigt die Felder des Spielstands
    bind(s) {
      s.clock = Number.isFinite(s.clock) && s.clock >= 0 ? s.clock : 0;
      s.day = dayOf(s.clock);
      s.rep = Number.isFinite(s.rep) && s.rep >= 0 ? Math.floor(s.rep) : 0;
      s.arrears = Number.isFinite(s.arrears) && s.arrears >= 0 ? Math.round(s.arrears * 100) / 100 : 0;
      s.lastHelpDay = Number.isInteger(s.lastHelpDay) && s.lastHelpDay >= 0 ? s.lastHelpDay : 0;
      s.debt = Number.isFinite(s.debt) && s.debt >= 0 ? Math.min(Math.round(s.debt * 100) / 100, LOAN.repay * 10) : 0;
      const up = {};
      if (s.upgrades && typeof s.upgrades === 'object') {
        for (const u of UPGRADES) if (s.upgrades[u.id] === true) up[u.id] = true;
      }
      s.upgrades = up;
      s.maxLevel = Math.max(Number.isInteger(s.maxLevel) ? s.maxLevel : 1, levelOf(s.rep).level);
    },

    level: (s) => levelOf(s.rep),
    nextLevel(s) {
      const cur = levelOf(s.rep);
      return LEVELS.find((l) => l.level === cur.level + 1) || null;
    },
    dayOf,
    dayTime: (s) => s.clock % DAY_SECONDS,

    // Ruf ändern (nie unter 0). Gibt zurück, ob eine neue Ladenstufe erreicht wurde.
    addRep(s, n) {
      const before = levelOf(s.rep).level;
      s.rep = Math.max(0, Math.round(s.rep + n));
      const after = levelOf(s.rep).level;
      let levelUp = null;
      if (after > s.maxLevel) {
        s.maxLevel = after;
        levelUp = LEVELS.find((l) => l.level === after);
      }
      return { rep: s.rep, delta: n, levelUp, levelDown: after < before };
    },

    // ---- Auswirkungen des Ausbaus ----
    storageCapacity(s) {
      return 60 + (has(s, 'storage1') ? 40 : 0) + (has(s, 'storage2') ? 80 : 0) + (has(s, 'storage3') ? 160 : 0);
    },
    trafficMultiplier(s) {
      let m = 1 + 0.12 * (levelOf(s.rep).level - 1);
      if (has(s, 'marketing1')) m += 0.25;
      if (has(s, 'marketing2')) m += 0.25;
      if (has(s, 'shelves')) m += 0.1;
      if (has(s, 'expand')) m += 0.3;
      const ev = eventForDay(s.day);
      if (ev && ev.traffic) m *= ev.traffic;
      return m;
    },
    maxCustomers: (s) => 3 + (has(s, 'counter2') ? 1 : 0) + (has(s, 'expand') ? 2 : 0),
    queueSize: (s) => 2 + (has(s, 'counter2') ? 2 : 0) + (has(s, 'expand') ? 1 : 0),
    patienceMultiplier: (s) => 1 + (has(s, 'counter2') ? 0.15 : 0) + (has(s, 'ambiente') ? 0.2 : 0),
    jobSlots: (s) => 2 + (has(s, 'tools1') ? 1 : 0) + (has(s, 'tools2') ? 1 : 0) + (levelOf(s.rep).level >= 4 ? 1 : 0),
    repairFeeMultiplier: (s) => 1 + (has(s, 'tools1') ? 0.1 : 0) + (has(s, 'tools2') ? 0.1 : 0),
    testSpeed: (s) => (has(s, 'tools1') ? 0.7 : 1), // Faktor für die Dauer des Testlaufs
    // Kunden akzeptieren etwas höhere Preise: Ambiente und eingeschaltete Ausstellungs-PCs (je 1,5 %)
    priceTolerance: (s) => (has(s, 'ambiente') ? 0.06 : 0) + 0.015 * (Array.isArray(s.screens) ? s.screens.filter(Boolean).length : 0),
    hasTester: (s) => has(s, 'tester'),

    // Tägliche Fixkosten: Miete wächst mit der Ladenstufe, dazu laufende Kosten des Ausbaus
    rentPerDay(s) {
      const lvl = levelOf(s.rep).level;
      let r = 30 + 20 * (lvl - 1);
      for (const u of UPGRADES) if (has(s, u.id)) r += u.upkeep;
      return r;
    },

    // Kann der Ausbau gekauft werden? { ok, code, message }
    canBuyUpgrade(s, id) {
      const u = UPGRADES.find((x) => x.id === id);
      if (!u) return { ok: false, code: 'unknown', message: 'Diesen Ausbau gibt es nicht.' };
      if (has(s, id)) return { ok: false, code: 'owned', message: 'Bereits gebaut.' };
      if (levelOf(s.rep).level < u.level) {
        const l = LEVELS.find((x) => x.level === u.level);
        return { ok: false, code: 'level', message: 'Erst ab Ladenstufe ' + u.level + ' (' + l.name + ').' };
      }
      if (u.requires && !has(s, u.requires)) {
        return { ok: false, code: 'requires', message: 'Zuerst nötig: ' + UPGRADES.find((x) => x.id === u.requires).name + '.' };
      }
      if (!Economy.canAfford(u.cost)) return { ok: false, code: 'no-money', message: 'Nicht genug Geld: Es fehlen ' + Economy.format(Economy.round2(u.cost - Economy.balance())) + ' €.' };
      return { ok: true };
    },
    buyUpgrade(s, id) {
      const can = this.canBuyUpgrade(s, id);
      if (!can.ok) return can;
      const u = UPGRADES.find((x) => x.id === id);
      const paid = Economy.spend(u.cost, 'Ausbau: ' + u.name, 'ausbau');
      if (!paid.ok) return { ok: false, code: paid.code, message: paid.message };
      s.upgrades[id] = true;
      return { ok: true, upgrade: u };
    },

    // Lässt die Spielzeit laufen. Gibt Ereignisse zurück (Tagesende mit Miete).
    tick(s, dt) {
      const events = [];
      if (!(dt > 0) || !Number.isFinite(dt)) return events;
      const dayBefore = s.day;
      s.clock += dt;
      const dayNow = dayOf(s.clock);
      for (let d = dayBefore; d < dayNow; d++) events.push(this.endOfDay(s, d));
      s.day = dayNow;
      return events;
    },

    // Tagesabschluss: Miete (und eventuelle Rückstände) bezahlen
    endOfDay(s, day) {
      const rent = this.rentPerDay(s);
      const due = Economy.round2(rent + s.arrears);
      const stats = Economy.dayStats(day);
      const r = Economy.spendUpTo(due, 'Miete & Nebenkosten (Tag ' + day + ')', 'miete');
      s.arrears = r.shortfall;
      let repChange = null;
      if (r.shortfall > 0) repChange = this.addRep(s, -2);
      let loanPaid = 0;
      if (s.debt > 0 && r.shortfall === 0) {
        const lr = Economy.spendUpTo(Math.min(s.debt, LOAN.rate), 'Kreditrate', 'gebuehr');
        s.debt = Economy.round2(s.debt - lr.paid);
        loanPaid = lr.paid;
      }
      return { type: 'dayEnd', day, rent, paid: r.paid, shortfall: r.shortfall, income: stats.income, expense: stats.expense, repChange, loanPaid };
    },

    // ---- Kleinkredit ----
    LOAN,
    canTakeLoan(s) {
      if (s.debt > 0) return { ok: false, code: 'debt', message: 'Du hast noch einen offenen Kredit (' + Economy.format(s.debt) + ' €).' };
      if (s.money >= LOAN.maxMoney) return { ok: false, code: 'rich', message: 'Der Kredit ist nur bei einem Kontostand unter ' + Economy.format(LOAN.maxMoney) + ' € möglich.' };
      return { ok: true };
    },
    takeLoan(s) {
      const can = this.canTakeLoan(s);
      if (!can.ok) return can;
      const r = Economy.earn(LOAN.amount, 'Kleinkredit aufgenommen', 'sonstiges');
      if (!r.ok) return { ok: false, code: r.code, message: r.message };
      s.debt = LOAN.repay;
      return { ok: true, amount: LOAN.amount, debt: s.debt };
    },
    // Kredit vorzeitig zurückzahlen (soweit das Geld reicht)
    repayLoan(s) {
      if (s.debt <= 0) return { ok: false, code: 'none', message: 'Du hast keinen offenen Kredit.' };
      const r = Economy.spendUpTo(s.debt, 'Kredit zurückgezahlt', 'gebuehr');
      if (r.paid <= 0) return { ok: false, code: 'no-money', message: 'Kein Geld verfügbar.' };
      s.debt = r.shortfall;
      return { ok: true, paid: r.paid, left: s.debt };
    },

    // ---- Notlage: kein Geld, keine Ware, keine PCs, nichts unterwegs ----
    isStranded(s) {
      return s.money < 60 && Inventory.totalPieces() === 0 && Procurement.incomingTotal(s) === 0 && !s.pcs.some((p) => p.origin === 'eigen');
    },
    canAskFamily(s) {
      if (!this.isStranded(s)) return { ok: false, code: 'not-stranded', message: 'Du hast noch Geld oder Ware – Hilfe gibt es nur in einer echten Notlage.' };
      if (s.lastHelpDay > 0 && s.day - s.lastHelpDay < 5) return { ok: false, code: 'recent', message: 'Die Familie hat dir gerade erst geholfen. Versuche es in ' + (5 - (s.day - s.lastHelpDay)) + ' Tagen wieder.' };
      return { ok: true };
    },
    askFamily(s) {
      const can = this.canAskFamily(s);
      if (!can.ok) return can;
      const r = Economy.earn(300, 'Familienhilfe', 'sonstiges');
      if (!r.ok) return { ok: false, code: r.code, message: r.message };
      s.lastHelpDay = s.day;
      const rep = this.addRep(s, -3);
      return { ok: true, amount: 300, rep };
    },

    // Rückstand sofort begleichen (soweit das Geld reicht)
    payArrears(s) {
      if (s.arrears <= 0) return { ok: false, code: 'none', message: 'Es gibt keine offenen Rückstände.' };
      const r = Economy.spendUpTo(s.arrears, 'Mietrückstand beglichen', 'miete');
      if (r.paid <= 0) return { ok: false, code: 'no-money', message: 'Kein Geld verfügbar.' };
      s.arrears = r.shortfall;
      return { ok: true, paid: r.paid, left: s.arrears };
    },
  };
})();

if (typeof window !== 'undefined') window.Progress = Progress;
if (typeof module !== 'undefined') module.exports = Progress;
