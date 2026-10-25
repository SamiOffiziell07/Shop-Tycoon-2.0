// suppliers.js – Lieferanten, Bestellungen und Lieferungen (state.orders).
// Alle Lieferanten sind erfundene Spielfirmen (keine echten Unternehmen, keine Partnerschaften).
// Ablauf: Bestellung aufgeben (Geld sofort abbuchen) -> bestellt -> unterwegs -> geliefert (Ware ins Lager).
// Lieferzeiten laufen in Spielzeit-Sekunden (state.clock) und nur, während das Spiel läuft.
'use strict';

const Procurement = (() => {
  const SUPPLIERS = [
    { id: 'lokal', name: 'Eckhardt Computerhandel', short: 'Eckhardt', priceMult: 1.1, delivery: 45, shipping: 4, tierMax: 3, level: 1, stockMult: 0.6, minOrder: 0,
      desc: 'Händler um die Ecke: etwas teurer, dafür kommt die Ware schnell. Begrenzter Vorrat.' },
    { id: 'nord', name: 'NordComp Großhandel', short: 'NordComp', priceMult: 0.93, delivery: 240, shipping: 15, tierMax: 3, level: 1, stockMult: 1.6, minOrder: 150,
      desc: 'Günstige Preise und große Mengen, aber lange Lieferzeit und Mindestbestellwert 150 €.' },
    { id: 'bitwelt', name: 'BitWelt Distribution', short: 'BitWelt', priceMult: 1.0, delivery: 110, shipping: 9, tierMax: 4, level: 2, stockMult: 1.0, minOrder: 0,
      desc: 'Zuverlässiger Allrounder mit breitem Sortiment bis zur gehobenen Klasse.' },
    { id: 'blitz', name: 'BlitzVersand Express', short: 'BlitzVersand', priceMult: 1.25, delivery: 20, shipping: 12, tierMax: 4, level: 2, stockMult: 0.5, minOrder: 0,
      desc: 'Expresslieferung in wenigen Sekunden – dafür deutlich teurer und nur kleine Mengen.' },
    { id: 'premium', name: 'Premium Parts AG', short: 'Premium Parts', priceMult: 1.04, delivery: 150, shipping: 25, tierMax: 5, level: 3, stockMult: 0.7, minOrder: 0,
      desc: 'Spezialist für Spitzenhardware aller Stufen. Knappe Stückzahlen.' },
  ];
  const BASE_STOCK = { 1: 24, 2: 14, 3: 8, 4: 4, 5: 2 };
  const STATUS_TEXT = { bestellt: 'Bestellt', unterwegs: 'Unterwegs', geliefert: 'Geliefert', storniert: 'Storniert', wartet: 'Wartet auf Lagerplatz' };
  const HISTORY_LIMIT = 30;
  const MAX_LINE_QTY = 99;

  // Gleichmäßig verteilter Pseudozufall 0..1 aus einem Text (immer gleiches Ergebnis für gleiche Eingabe)
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return ((h >>> 0) % 100000) / 100000;
  }

  const supplierById = (id) => SUPPLIERS.find((s) => s.id === id) || null;
  const round2 = (x) => Math.round(x * 100) / 100;
  const isOpen = (o) => o.status === 'bestellt' || o.status === 'unterwegs' || o.status === 'wartet';

  function sanitizeOrders(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const o of raw) {
      if (!o || !Number.isInteger(o.id) || seen.has(o.id) || !supplierById(o.supplier) || !Array.isArray(o.lines)) continue;
      if (!STATUS_TEXT[o.status] || !Number.isFinite(o.placedAt) || !Number.isFinite(o.eta) || !Number.isFinite(o.total)) continue;
      const lines = o.lines.filter((l) => l && typeof l.id === 'string' && Number.isInteger(l.qty) && l.qty >= 1 && Number.isFinite(l.unit));
      if (!lines.length) continue;
      seen.add(o.id);
      out.push({
        id: o.id, supplier: o.supplier, lines: lines.map((l) => ({ id: l.id, qty: l.qty, unit: l.unit })),
        subtotal: Number.isFinite(o.subtotal) ? o.subtotal : o.total, shipping: Number.isFinite(o.shipping) ? o.shipping : 0,
        total: o.total, placedAt: o.placedAt, eta: o.eta, status: o.status, deliveredAt: Number.isFinite(o.deliveredAt) ? o.deliveredAt : null,
      });
    }
    return out;
  }

  function pruneHistory(s) {
    const done = s.orders.filter((o) => !isOpen(o));
    if (done.length > HISTORY_LIMIT) {
      const drop = new Set(done.slice(0, done.length - HISTORY_LIMIT).map((o) => o.id));
      s.orders = s.orders.filter((o) => !drop.has(o.id));
    }
  }

  function usedToday(s, supId, itemId) {
    if (!s.supplyUsed || s.supplyUsed.day !== s.day) return 0;
    return (s.supplyUsed.used[supId + '|' + itemId]) || 0;
  }

  return {
    SUPPLIERS,
    STATUS_TEXT,
    MAX_LINE_QTY,
    supplier: supplierById,
    isOpen,

    bind(s) {
      s.orders = sanitizeOrders(s.orders);
      const maxId = s.orders.reduce((m, o) => Math.max(m, o.id), 0);
      s.nextOrderId = Number.isInteger(s.nextOrderId) && s.nextOrderId > maxId ? s.nextOrderId : maxId + 1;
      const u = s.supplyUsed;
      if (!u || typeof u !== 'object' || !u.used || typeof u.used !== 'object' || !Number.isInteger(u.day)) s.supplyUsed = { day: s.day || 1, used: {} };
    },

    // Ist der Lieferant für diese Ladenstufe freigeschaltet?
    unlocked(s, supId) {
      const sup = supplierById(supId);
      return !!sup && Progress.level(s).level >= sup.level;
    },

    // Tagesvorrat des Lieferanten für ein Produkt (0 = ausverkauft)
    stockToday(s, supId, itemId) {
      const sup = supplierById(supId);
      const item = HardwareDB.get(itemId);
      if (!sup || !item) return 0;
      if (item.tier > sup.tierMax) return 0;
      const day = s.day;
      if (hash01('out|' + supId + '|' + itemId + '|' + day) < 0.1) return 0; // an manchen Tagen nicht lieferbar
      const base = BASE_STOCK[item.tier] || 4;
      const cap = Math.max(1, Math.round(base * sup.stockMult * (0.6 + 0.8 * hash01('cap|' + supId + '|' + itemId + '|' + day))));
      return Math.max(0, cap - usedToday(s, supId, itemId));
    },

    // s ist optional: mit Spielstand wirkt das Tagesereignis (Preisaktion oder Knappheit) auf den Preis
    price(supId, itemId, s) {
      const sup = supplierById(supId);
      const item = HardwareDB.get(itemId);
      if (!sup || !item) return null;
      let m = sup.priceMult;
      const ev = s ? Progress.currentEvent(s) : null;
      if (ev && ev.priceMult && ev.cats.includes(item.category)) m *= ev.priceMult;
      return round2(item.buyPrice * m);
    },

    // Angebot eines Lieferanten für ein Produkt: { listed, available, stock, price, reason }
    offer(s, supId, itemId) {
      const sup = supplierById(supId);
      const item = HardwareDB.get(itemId);
      if (!sup || !item) return { listed: false, available: false, stock: 0, price: null, reason: 'Unbekannt' };
      if (item.tier > sup.tierMax) return { listed: false, available: false, stock: 0, price: null, reason: 'Nicht im Sortiment' };
      const stock = this.stockToday(s, supId, itemId);
      return { listed: true, available: stock > 0, stock, price: this.price(supId, itemId, s), reason: stock > 0 ? '' : 'Heute ausverkauft' };
    },

    // Menge, die in offenen Bestellungen unterwegs ist
    incoming(s, itemId) {
      let n = 0;
      for (const o of s.orders) if (isOpen(o)) for (const l of o.lines) if (l.id === itemId) n += l.qty;
      return n;
    },
    incomingTotal(s) {
      let n = 0;
      for (const o of s.orders) if (isOpen(o)) for (const l of o.lines) n += l.qty;
      return n;
    },
    openOrders: (s) => s.orders.filter(isOpen),

    // Preis einer Bestellung. lines: [{ id, qty }]
    quote(s, supId, lines) {
      const sup = supplierById(supId);
      if (!sup || !Array.isArray(lines) || !lines.length) return null;
      let subtotal = 0;
      let pieces = 0;
      for (const l of lines) {
        const p = this.price(supId, l.id, s);
        if (p === null || !Number.isInteger(l.qty) || l.qty < 1) return null;
        subtotal += p * l.qty;
        pieces += l.qty;
      }
      subtotal = round2(subtotal);
      const total = round2(subtotal + sup.shipping);
      return { subtotal, shipping: sup.shipping, total, pieces, seconds: sup.delivery };
    },

    // Bestellung aufgeben – alles oder nichts. Das Geld wird sofort abgebucht, die Ware kommt später.
    place(s, supId, lines) {
      const fail = (code, message, extra) => Object.assign({ ok: false, code, message }, extra || {});
      const sup = supplierById(supId);
      if (!sup) return fail('unknown-supplier', 'Diesen Lieferanten gibt es nicht.');
      if (!this.unlocked(s, supId)) return fail('locked', sup.short + ' liefert erst ab Ladenstufe ' + sup.level + '.');
      if (!Array.isArray(lines) || !lines.length) return fail('empty', 'Der Warenkorb ist leer.');
      // Gleiche Produkte zusammenfassen
      const merged = new Map();
      for (const l of lines) {
        if (!l || typeof l.id !== 'string' || !HardwareDB.has(l.id)) return fail('unknown-item', 'Eine Komponente im Warenkorb gibt es nicht.');
        if (!Number.isInteger(l.qty) || l.qty < 1) return fail('bad-qty', 'Bitte gültige Stückzahlen wählen (ganze Zahl ab 1).');
        merged.set(l.id, (merged.get(l.id) || 0) + l.qty);
      }
      const clean = [];
      for (const [id, qty] of merged) {
        const item = HardwareDB.get(id);
        const offer = this.offer(s, supId, id);
        if (!offer.listed) return fail('not-listed', sup.short + ' führt „' + item.name + '“ nicht.');
        if (qty > MAX_LINE_QTY) return fail('bad-qty', 'Pro Position sind höchstens ' + MAX_LINE_QTY + ' Stück möglich.');
        if (offer.stock <= 0) return fail('sold-out', '„' + item.name + '“ ist bei ' + sup.short + ' heute ausverkauft.');
        if (qty > offer.stock) return fail('stock', 'Von „' + item.name + '“ hat ' + sup.short + ' heute nur noch ' + offer.stock + ' Stück.');
        clean.push({ id, qty, unit: offer.price });
      }
      const q = this.quote(s, supId, clean);
      if (q.subtotal < sup.minOrder) return fail('min-order', 'Mindestbestellwert bei ' + sup.short + ': ' + Economy.format(sup.minOrder) + ' €.');
      // Lagerplatz: vorhandene Ware + schon bestellte Ware + diese Bestellung
      const room = Inventory.capacity() - Inventory.totalPieces() - this.incomingTotal(s);
      if (q.pieces > room) {
        return fail('capacity', 'Dafür ist im Lager nicht genug Platz (frei, inklusive bereits bestellter Ware: ' + Math.max(0, room) + ' Stück). Baue das Lager aus oder verkaufe Ware.');
      }
      if (!Economy.canAfford(q.total)) {
        return fail('no-money', 'Nicht genug Geld: Es fehlen ' + Economy.format(round2(q.total - Economy.balance())) + ' €.', { missing: round2(q.total - Economy.balance()), total: q.total });
      }
      const id = s.nextOrderId;
      const paid = Economy.spend(q.total, 'Bestellung #' + id + ' bei ' + sup.short, 'einkauf', { tx: 'order:' + id });
      if (!paid.ok) return fail(paid.code, paid.message, { total: q.total });
      s.nextOrderId = id + 1;
      // Lieferzeit leicht schwankend (±10 %), aber pro Bestellung fest
      const evt = Progress.currentEvent(s);
      const dur = Math.round(sup.delivery * (0.9 + 0.2 * hash01('eta|' + id)) * (evt && evt.delivery ? evt.delivery : 1));
      const order = { id, supplier: supId, lines: clean, subtotal: q.subtotal, shipping: q.shipping, total: q.total, placedAt: s.clock, eta: s.clock + dur, status: 'bestellt', deliveredAt: null };
      s.orders.push(order);
      if (s.supplyUsed.day !== s.day) s.supplyUsed = { day: s.day, used: {} };
      for (const l of clean) {
        const key = supId + '|' + l.id;
        s.supplyUsed.used[key] = (s.supplyUsed.used[key] || 0) + l.qty;
      }
      pruneHistory(s);
      return { ok: true, order, total: q.total, seconds: dur };
    },

    // Storno ist nur möglich, solange die Ware noch nicht versandt wurde. Der Versand bleibt berechnet.
    cancel(s, orderId) {
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) return { ok: false, code: 'unknown', message: 'Bestellung nicht gefunden.' };
      if (o.status !== 'bestellt') return { ok: false, code: 'status', message: 'Diese Bestellung ist bereits unterwegs oder abgeschlossen.' };
      const refund = round2(o.total - o.shipping);
      o.status = 'storniert';
      const r = Economy.earn(refund, 'Storno Bestellung #' + o.id, 'einkauf', { tx: 'cancel:' + o.id });
      if (!r.ok && r.code !== 'duplicate') {
        o.status = 'bestellt'; // Rückbuchung fehlgeschlagen: nichts verändern
        return { ok: false, code: r.code, message: r.message };
      }
      // Tagesvorrat wieder freigeben
      if (s.supplyUsed && s.supplyUsed.day === s.day) {
        for (const l of o.lines) {
          const key = o.supplier + '|' + l.id;
          if (s.supplyUsed.used[key]) s.supplyUsed.used[key] = Math.max(0, s.supplyUsed.used[key] - l.qty);
        }
      }
      return { ok: true, refund, fee: o.shipping };
    },

    // Wird regelmäßig aufgerufen: aktualisiert Status und liefert fällige Bestellungen aus.
    // Gibt die Liste der gerade gelieferten Bestellungen zurück.
    tick(s) {
      const delivered = [];
      for (const o of s.orders) {
        if (!isOpen(o)) continue;
        if (s.clock < o.eta) {
          const total = Math.max(1, o.eta - o.placedAt);
          o.status = s.clock - o.placedAt >= total * 0.2 ? 'unterwegs' : 'bestellt';
          continue;
        }
        const pieces = o.lines.reduce((a, l) => a + l.qty, 0);
        if (Inventory.freeSpace() < pieces) {
          o.status = 'wartet';
          continue;
        }
        // Erst Status setzen, dann einlagern: eine Bestellung kann so nie zweimal ausgeliefert werden
        o.status = 'geliefert';
        o.deliveredAt = s.clock;
        for (const l of o.lines) {
          const r = Inventory.add(l.id, l.qty);
          if (!r.ok) {
            // Sollte nach der Platzprüfung nicht vorkommen; Zustand sauber zurücknehmen
            for (const done of o.lines) {
              if (done === l) break;
              Inventory.take(done.id, done.qty);
            }
            o.status = 'wartet';
            o.deliveredAt = null;
            break;
          }
        }
        if (o.status === 'geliefert') delivered.push(o);
      }
      if (delivered.length) pruneHistory(s);
      return delivered;
    },

    // Verbleibende Sekunden bis zur Lieferung
    remaining(s, o) {
      return Math.max(0, Math.ceil(o.eta - s.clock));
    },
    formatDuration(sec) {
      const t = Math.max(0, Math.round(sec));
      const m = Math.floor(t / 60);
      const r = t % 60;
      return m + ':' + (r < 10 ? '0' : '') + r + ' min';
    },
    sanitizeOrders,
    hash01,
  };
})();

if (typeof window !== 'undefined') window.Procurement = Procurement;
if (typeof module !== 'undefined') module.exports = Procurement;
