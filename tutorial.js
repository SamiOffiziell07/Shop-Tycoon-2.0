// tutorial.js – kurze Einführung in Schritten. Jeder Schritt ist erledigt, sobald das passende Ereignis eintritt.
// Der Spielstand merkt sich den Fortschritt (state.tutorial). Überspringen ist jederzeit möglich.
'use strict';

const Tutorial = (() => {
  const STEPS = [
    { id: 'shop', event: 'shopOpened', title: '1/7 · Hardware einkaufen', text: 'Gehe zum Regal an der linken Wand oder tippe oben auf 🛒 und öffne den Einkauf.' },
    { id: 'order', event: 'orderPlaced', title: '2/7 · Teile bestellen', text: 'Wähle einen Lieferanten, lege Teile in den Warenkorb und bestelle. Tipp: Das „Starter-Set“ enthält einen kompletten Büro-PC.' },
    { id: 'delivery', event: 'delivered', title: '3/7 · Lieferung abwarten', text: 'Die Ware kommt nach der Lieferzeit ins Lager (siehe „Bestellungen“). Schau dich solange um und bediene Kunden an der Kasse.' },
    { id: 'build', event: 'pcBuilt', title: '4/7 · PC zusammenbauen', text: 'Gehe zur Werkbank in der Mitte hinten. Wähle die Teile aus deinem Lager; unverträgliche Teile werden gesperrt und erklärt.' },
    { id: 'test', event: 'pcTested', title: '5/7 · PC testen', text: 'Starte den fertigen PC an der Werkbank. Der Test zeigt Fehler und Leistungswerte (Spielsimulation).' },
    { id: 'sell', event: 'sold', title: '6/7 · Verkaufen', text: 'Bediene Kunden an der Kasse: Verkaufe passende Teile oder getestete PCs und nimm Aufträge an. Der Preis bestimmt, ob der Kunde kauft.' },
    { id: 'upgrade', event: 'upgraded', title: '7/7 · Laden ausbauen', text: 'Öffne im Büro (☰) den Reiter „Ausbau“ und investiere in Lager, Werbung oder Werkzeug.' },
  ];

  function clean(t) {
    const done = t && typeof t.done === 'object' && t.done ? t.done : {};
    const out = { done: {}, finished: !!(t && t.finished), skipped: !!(t && t.skipped) };
    for (const st of STEPS) if (done[st.id] === true) out.done[st.id] = true;
    return out;
  }

  return {
    STEPS,
    bind(s) { s.tutorial = clean(s.tutorial); },
    // Aktueller Schritt oder null
    current(s) {
      if (s.tutorial.finished || s.tutorial.skipped) return null;
      return STEPS.find((st) => !s.tutorial.done[st.id]) || null;
    },
    // Ereignis melden. Gibt true zurück, wenn dadurch ein Schritt erledigt wurde.
    event(s, name) {
      if (s.tutorial.finished || s.tutorial.skipped) return false;
      let changed = false;
      for (const st of STEPS) {
        if (st.event === name && !s.tutorial.done[st.id]) { s.tutorial.done[st.id] = true; changed = true; }
      }
      if (changed && !this.current(s)) s.tutorial.finished = true;
      return changed;
    },
    skip(s) { s.tutorial.skipped = true; },
    restart(s) { s.tutorial = { done: {}, finished: false, skipped: false }; },
    progress(s) { return STEPS.filter((st) => s.tutorial.done[st.id]).length; },
  };
})();

if (typeof window !== 'undefined') window.Tutorial = Tutorial;
if (typeof module !== 'undefined') module.exports = Tutorial;
