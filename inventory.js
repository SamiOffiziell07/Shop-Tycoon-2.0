// inventory.js – das EINZIGE Lager des Spiels: Anzahl je Komponenten-ID (state.inventory = { id: Anzahl }).
// Einkauf/Lieferungen legen ein, der PC-Zusammenbau und der Verkauf entnehmen.
// Reservierungen (state.reservations = [{ tag, id, qty }]) halten Ware für einen Kunden zurück:
// reservierte Stücke zählen weiter zum Bestand, sind aber nicht "verfügbar".
// Das Lager hat eine Kapazität in Stück (Ausbau-Stufe), siehe setCapacityFn.
'use strict';

const Inventory = (() => {
  const MAX_PER_ITEM = 999;
  const DEFAULT_CAPACITY = 60;
  let state = null;
  let db = null; // HardwareDB, wird über setDatabase gesetzt (Browser: globale Variable)
  let capacityFn = () => DEFAULT_CAPACITY;

  function getDb() {
    if (db) return db;
    if (typeof HardwareDB !== 'undefined') return HardwareDB;
    return null;
  }

  const validQty = (n) => Number.isInteger(n) && n >= 1;

  // Bereinigt einen geladenen Lagerbestand: nur gültige ganze Zahlen >= 1 bleiben erhalten.
  // Unbekannte Produkte werden nur entfernt, wenn die Datenbank vollständig geladen ist (sonst gehen bei fehlenden Dateien Spielstände verloren).
  function sanitize(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const d = getDb();
    const prune = !!(d && d.complete && d.complete());
    for (const id of Object.keys(raw)) {
      const n = raw[id];
      if (prune && !d.has(id)) continue;
      if (typeof id === 'string' && Number.isInteger(n) && n >= 1) out[id] = Math.min(n, MAX_PER_ITEM);
    }
    return out;
  }

  function sanitizeReservations(raw, inv) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    const used = {};
    for (const r of raw) {
      if (!r || typeof r.tag !== 'string' || typeof r.id !== 'string' || !validQty(r.qty)) continue;
      const have = (inv[r.id] || 0) - (used[r.id] || 0);
      const q = Math.min(r.qty, have);
      if (q < 1) continue; // Reservierung ohne Ware verfällt
      used[r.id] = (used[r.id] || 0) + q;
      out.push({ tag: r.tag, id: r.id, qty: q });
    }
    return out;
  }

  function requireBound() {
    if (!state) throw new Error('Inventory ist nicht mit einem Spielstand verbunden');
  }

  function reservedOf(id) {
    let n = 0;
    for (const r of state.reservations) if (r.id === id) n += r.qty;
    return n;
  }

  function total() {
    let n = 0;
    for (const id of Object.keys(state.inventory)) n += state.inventory[id];
    return n;
  }

  return {
    MAX_PER_ITEM,
    DEFAULT_CAPACITY,
    setDatabase(d) {
      db = d;
    },
    setCapacityFn(fn) {
      capacityFn = typeof fn === 'function' ? fn : () => DEFAULT_CAPACITY;
    },
    bind(s) {
      state = s;
      state.inventory = sanitize(state.inventory);
      state.reservations = sanitizeReservations(state.reservations, state.inventory);
    },
    sanitize,
    capacity() {
      requireBound();
      return capacityFn(state);
    },
    // Stückzahl im Lager (inklusive reservierter Ware)
    count(id) {
      requireBound();
      return state.inventory[id] || 0;
    },
    reserved(id) {
      requireBound();
      return reservedOf(id);
    },
    // Frei verfügbare Stückzahl (Bestand minus Reservierungen)
    available(id) {
      requireBound();
      return (state.inventory[id] || 0) - reservedOf(id);
    },
    has(id, qty) {
      requireBound();
      const q = qty === undefined ? 1 : qty;
      return validQty(q) && this.available(id) >= q;
    },
    // Freier Platz im Lager in Stück
    freeSpace() {
      requireBound();
      return Math.max(0, capacityFn(state) - total());
    },
    // Legt Ware ein. Gibt { ok } zurück; ändert nichts bei ungültigen Eingaben.
    add(id, qty) {
      requireBound();
      const d = getDb();
      if (typeof id !== 'string' || (d && !d.has(id))) return { ok: false, code: 'unknown-item', message: 'Unbekannte Komponente.' };
      if (!validQty(qty)) return { ok: false, code: 'bad-qty', message: 'Ungültige Stückzahl.' };
      const next = (state.inventory[id] || 0) + qty;
      if (next > MAX_PER_ITEM) return { ok: false, code: 'stock-full', message: 'Lager für diese Komponente voll (max. ' + MAX_PER_ITEM + ').' };
      if (total() + qty > capacityFn(state)) return { ok: false, code: 'capacity', message: 'Das Lager ist voll (Kapazität ' + capacityFn(state) + ' Stück).' };
      state.inventory[id] = next;
      return { ok: true, count: next };
    },
    // Entnimmt freie Ware (z. B. für den PC-Zusammenbau). Der Bestand wird nie negativ;
    // reservierte Stücke bleiben unangetastet.
    take(id, qty) {
      requireBound();
      if (typeof id !== 'string') return { ok: false, code: 'unknown-item', message: 'Unbekannte Komponente.' };
      if (!validQty(qty)) return { ok: false, code: 'bad-qty', message: 'Ungültige Stückzahl.' };
      const have = state.inventory[id] || 0;
      const free = have - reservedOf(id);
      if (free < qty) {
        return { ok: false, code: 'not-enough', message: free < have ? 'Nicht genug freier Bestand (der Rest ist reserviert).' : 'Nicht genug Bestand im Lager.', have: free };
      }
      const left = have - qty;
      if (left === 0) delete state.inventory[id];
      else state.inventory[id] = left;
      return { ok: true, count: left };
    },
    // Reserviert freie Ware unter einem Kennzeichen (tag), z. B. "kunde:12".
    reserve(tag, id, qty) {
      requireBound();
      if (typeof tag !== 'string' || !tag) return { ok: false, code: 'bad-tag', message: 'Ungültige Reservierung.' };
      if (!validQty(qty)) return { ok: false, code: 'bad-qty', message: 'Ungültige Stückzahl.' };
      if (this.available(id) < qty) return { ok: false, code: 'not-enough', message: 'Nicht genug freier Bestand.' };
      const ex = state.reservations.find((r) => r.tag === tag && r.id === id);
      if (ex) ex.qty += qty;
      else state.reservations.push({ tag, id, qty });
      return { ok: true };
    },
    // Hebt alle Reservierungen eines Kennzeichens auf.
    release(tag) {
      requireBound();
      const before = state.reservations.length;
      state.reservations = state.reservations.filter((r) => r.tag !== tag);
      return before - state.reservations.length;
    },
    // Entnimmt die unter dem Kennzeichen reservierte Ware endgültig (Verkauf an den Kunden).
    consume(tag) {
      requireBound();
      const mine = state.reservations.filter((r) => r.tag === tag);
      if (!mine.length) return { ok: false, code: 'none', message: 'Keine Reservierung vorhanden.' };
      for (const r of mine) if ((state.inventory[r.id] || 0) < r.qty) return { ok: false, code: 'not-enough', message: 'Bestand reicht nicht mehr.' };
      for (const r of mine) {
        const left = state.inventory[r.id] - r.qty;
        if (left === 0) delete state.inventory[r.id];
        else state.inventory[r.id] = left;
      }
      state.reservations = state.reservations.filter((r) => r.tag !== tag);
      return { ok: true, items: mine.map((r) => ({ id: r.id, qty: r.qty })) };
    },
    reservations() {
      requireBound();
      return state.reservations.map((r) => Object.assign({}, r));
    },
    // Alle Lagerposten mit bekannten Produkten: [{ id, count, reserved, item }]
    all() {
      requireBound();
      const d = getDb();
      const rows = [];
      for (const id of Object.keys(state.inventory)) {
        const item = d ? d.get(id) : null;
        if (item) rows.push({ id, count: state.inventory[id], reserved: reservedOf(id), item });
      }
      return rows;
    },
    byCategory(cat) {
      return this.all().filter((r) => r.item.category === cat);
    },
    totalPieces() {
      requireBound();
      return total();
    },
    // Wert des Lagers zu Einkaufspreisen
    totalValue() {
      return this.all().reduce((s, r) => s + r.count * r.item.buyPrice, 0);
    },
  };
})();

if (typeof window !== 'undefined') window.Inventory = Inventory;
if (typeof module !== 'undefined') module.exports = Inventory;
