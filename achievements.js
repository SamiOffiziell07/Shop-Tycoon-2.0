// achievements.js – Ziele und Erfolge: langfristige Aufgaben mit kleinen Prämien (Geld und Ruf).
// Der Spielstand merkt sich freigeschaltete Ziele (state.achievements = { id: Tag }) und Zähler (state.counters).
// Prämien sind absichtlich klein, damit sie die Wirtschaft nicht aushebeln; jede Prämie wird nur einmal gebucht.
'use strict';

const Achievements = (() => {
  const c = (s, k) => (s.counters && s.counters[k]) || 0;
  const LIST = [
    { id: 'first-order', name: 'Erste Bestellung', desc: 'Gib deine erste Bestellung bei einem Lieferanten auf.', money: 25, rep: 0, cur: (s) => Math.min(1, s.nextOrderId - 1), target: 1 },
    { id: 'first-delivery', name: 'Post ist da', desc: 'Erhalte deine erste Lieferung im Lager.', money: 25, rep: 0, cur: (s) => Math.min(1, s.orders.filter((o) => o.status === 'geliefert').length + c(s, 'deliveries')), target: 1 },
    { id: 'first-build', name: 'Selbst ist der Techniker', desc: 'Baue deinen ersten PC an der Werkbank zusammen.', money: 50, rep: 1, cur: (s) => Math.min(1, c(s, 'built')), target: 1 },
    { id: 'first-test', name: 'Läuft!', desc: 'Starte einen selbstgebauten PC erfolgreich und lass einen Benchmark laufen.', money: 50, rep: 1, cur: (s) => Math.min(1, c(s, 'testedOk')), target: 1 },
    { id: 'first-sale', name: 'Erster Verkauf', desc: 'Verkaufe etwas an einen Kunden.', money: 50, rep: 1, cur: (s) => Math.min(1, s.salesStats.count), target: 1 },
    { id: 'first-pc-sale', name: 'Fertig-PC verkauft', desc: 'Verkaufe einen kompletten, getesteten PC.', money: 100, rep: 2, cur: (s) => Math.min(1, s.salesStats.pcCount), target: 1 },
    { id: 'sales-25', name: 'Stammkundschaft', desc: 'Erreiche 25 Verkäufe.', money: 150, rep: 3, cur: (s) => Math.min(25, s.salesStats.count), target: 25 },
    { id: 'sales-100', name: 'Verkaufsprofi', desc: 'Erreiche 100 Verkäufe.', money: 500, rep: 8, cur: (s) => Math.min(100, s.salesStats.count), target: 100 },
    { id: 'first-job', name: 'Auftrag erledigt', desc: 'Schließe deinen ersten Kundenauftrag ab.', money: 100, rep: 2, cur: (s) => Math.min(1, s.salesStats.jobsDone), target: 1 },
    { id: 'repair-5', name: 'Reparatur-Held', desc: 'Repariere 5 Kunden-PCs.', money: 300, rep: 4, cur: (s) => Math.min(5, c(s, 'repairs')), target: 5 },
    { id: 'jobs-10', name: 'Zuverlässiger Dienstleister', desc: 'Schließe 10 Kundenaufträge ab.', money: 400, rep: 5, cur: (s) => Math.min(10, s.salesStats.jobsDone), target: 10 },
    { id: 'first-upgrade', name: 'Investition', desc: 'Kaufe deinen ersten Ausbau.', money: 0, rep: 2, cur: (s) => Math.min(1, Object.keys(s.upgrades).length), target: 1 },
    { id: 'big-fish', name: 'Großer Fisch', desc: 'Verkaufe einen PC für mindestens 2.000 €.', money: 250, rep: 4, cur: (s) => (s.sales.some((x) => x.kind === 'pc' && x.price >= 2000) || c(s, 'bigPc') > 0 ? 1 : 0), target: 1 },
    { id: 'good-day', name: 'Guter Tag', desc: 'Erziele an einem Tag mehr als 500 € Gewinn (Einnahmen minus Ausgaben).', money: 200, rep: 3, cur: (s) => Math.min(1, c(s, 'goodDay')), target: 1 },
    { id: 'level-2', name: 'Kleiner Fachhandel', desc: 'Erreiche Ladenstufe 2.', money: 200, rep: 0, cur: (s) => Math.min(2, Progress.level(s).level), target: 2 },
    { id: 'level-3', name: 'Etabliertes Computerhaus', desc: 'Erreiche Ladenstufe 3.', money: 500, rep: 0, cur: (s) => Math.min(3, Progress.level(s).level), target: 3 },
    { id: 'level-4', name: 'Regionaler Marktführer', desc: 'Erreiche Ladenstufe 4.', money: 1000, rep: 0, cur: (s) => Math.min(4, Progress.level(s).level), target: 4 },
    { id: 'level-5', name: 'Computer-Imperium', desc: 'Erreiche die höchste Ladenstufe 5.', money: 2500, rep: 0, cur: (s) => Math.min(5, Progress.level(s).level), target: 5 },
    { id: 'rich', name: 'Gut gefüllte Kasse', desc: 'Besitze mindestens 10.000 € auf dem Konto.', money: 0, rep: 5, cur: (s) => Math.min(10000, Math.floor(s.money)), target: 10000 },
    { id: 'all-upgrades', name: 'Voll ausgebaut', desc: 'Kaufe alle Ausbauten.', money: 1500, rep: 10, cur: (s) => Object.keys(s.upgrades).length, target: Progress.UPGRADES.length },
  ];

  return {
    LIST,
    bind(s) {
      const a = {};
      if (s.achievements && typeof s.achievements === 'object') {
        for (const x of LIST) if (Number.isInteger(s.achievements[x.id]) && s.achievements[x.id] >= 1) a[x.id] = s.achievements[x.id];
      }
      s.achievements = a;
      const cn = s.counters && typeof s.counters === 'object' ? s.counters : {};
      s.counters = {};
      for (const k of ['built', 'testedOk', 'repairs', 'deliveries', 'bigPc', 'goodDay']) s.counters[k] = Number.isInteger(cn[k]) && cn[k] >= 0 ? cn[k] : 0;
    },
    // Tagesabschluss: Gewinn über 500 € merken (Einnahmen minus Ausgaben inklusive Miete)
    dayEnded(s, ev) {
      if (ev.income - ev.expense - ev.paid >= 500) s.counters.goodDay = 1;
    },
    count(s, key, n) { s.counters[key] = (s.counters[key] || 0) + (n === undefined ? 1 : n); },
    done: (s, id) => !!s.achievements[id],
    progress(s, a) { return { cur: Math.min(a.target, Math.max(0, a.cur(s))), target: a.target }; },
    // Prüft alle Ziele und schaltet erfüllte frei. Gibt die neu freigeschalteten zurück.
    check(s) {
      const fresh = [];
      for (const a of LIST) {
        if (s.achievements[a.id]) continue;
        if (a.cur(s) < a.target) continue;
        s.achievements[a.id] = s.day;
        if (a.money > 0) Economy.earn(a.money, 'Prämie: ' + a.name, 'praemie', { tx: 'ach:' + a.id });
        let rep = null;
        if (a.rep > 0) rep = Progress.addRep(s, a.rep);
        fresh.push({ a, rep });
      }
      return fresh;
    },
  };
})();

if (typeof window !== 'undefined') window.Achievements = Achievements;
if (typeof module !== 'undefined') module.exports = Achievements;
