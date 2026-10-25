// hardware.js – Hardware-Datenbank: lädt die lokalen JSON-Dateien (data-*.json) und beantwortet Abfragen.
// Enthält KEINE Darstellung. Menüs formatieren die Daten selbst (ui-shop.js).
//
// Aufbau eines Produkts (siehe data-*.json):
//   id (stabil, eindeutig), category, brand, name, tier (1-5), buyPrice, sellPrice, desc,
//   specs  – strukturierte technische Daten; Phase 3 (PC-Zusammenbau) prüft die Kompatibilität daran,
//   perf   – Spielwerte 0-100 (keine Messwerte), verified – geprueft | teilweise | ungeprueft,
//   unsure – Felder, die nicht sicher bestätigt sind, note/source – Hinweise und Quelle.
'use strict';

const HardwareDB = (() => {
  const CATEGORIES = ['cpu', 'gpu', 'mainboard', 'ram', 'ssd', 'psu', 'cooler', 'case', 'fan'];
  const CATEGORY_NAMES = {
    cpu: 'Prozessoren',
    gpu: 'Grafikkarten',
    mainboard: 'Mainboards',
    ram: 'Arbeitsspeicher',
    ssd: 'SSDs',
    psu: 'Netzteile',
    cooler: 'CPU-Kühler',
    case: 'Gehäuse',
    fan: 'Gehäuselüfter',
  };

  let byId = new Map();
  let byCategory = {};
  let warnings = [];
  let complete = false; // true, wenn zu jeder Kategorie Produkte geladen wurden

  function reset() {
    byId = new Map();
    byCategory = {};
    for (const c of CATEGORIES) byCategory[c] = [];
    warnings = [];
    complete = false;
  }
  reset();

  // Gibt einen Fehlertext zurück oder null, wenn das Produkt gültig ist.
  function validate(it, expectedCategory) {
    if (!it || typeof it !== 'object') return 'kein Objekt';
    if (typeof it.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(it.id)) return 'ungültige ID';
    if (it.category !== expectedCategory) return 'Kategorie passt nicht zur Datei';
    if (typeof it.name !== 'string' || !it.name.trim()) return 'Name fehlt';
    if (!Number.isFinite(it.buyPrice) || it.buyPrice <= 0) return 'Einkaufspreis ungültig';
    if (!Number.isFinite(it.sellPrice) || it.sellPrice < 0) return 'Verkaufspreis ungültig';
    if (!it.specs || typeof it.specs !== 'object') return 'Technische Daten fehlen';
    return null;
  }

  // Nimmt die Inhalte der JSON-Dateien entgegen: [{ schema, category, items: [...] }, ...]
  function loadData(docs) {
    reset();
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items) || !CATEGORIES.includes(doc.category)) {
        warnings.push('Datendatei übersprungen: unbekanntes Format oder Kategorie');
        continue;
      }
      for (const it of doc.items) {
        const err = validate(it, doc.category);
        if (err) {
          warnings.push(`Produkt übersprungen (${it && it.id ? it.id : '?'}): ${err}`);
          continue;
        }
        if (byId.has(it.id)) {
          warnings.push(`Doppelte ID übersprungen: ${it.id}`);
          continue;
        }
        const clean = Object.assign({}, it, { tier: Number.isFinite(it.tier) ? it.tier : 1 });
        byId.set(clean.id, clean);
        byCategory[clean.category].push(clean);
      }
    }
    complete = CATEGORIES.every((c) => byCategory[c].length > 0);
    return { loaded: byId.size, warnings: warnings.slice(), complete };
  }

  // Lädt alle Datendateien über fetch. Fehlende Dateien führen nur zu Warnungen.
  async function loadFromFiles(fetchFn, prefix) {
    const docs = [];
    const missing = [];
    for (const cat of CATEGORIES) {
      try {
        const res = await fetchFn((prefix || '') + 'data-' + cat + '.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        docs.push(await res.json());
      } catch (e) {
        missing.push(cat);
      }
    }
    const result = loadData(docs);
    for (const m of missing) result.warnings.push('Datei data-' + m + '.json konnte nicht geladen werden');
    result.missing = missing;
    return result;
  }

  return {
    CATEGORIES,
    CATEGORY_NAMES,
    loadData,
    loadFromFiles,
    validate,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id) || null,
    list: (cat) => (byCategory[cat] || []).slice(),
    all: () => Array.from(byId.values()),
    count: () => byId.size,
    warnings: () => warnings.slice(),
    // Sind alle Kategorien vollständig geladen? Nur dann dürfen unbekannte Produkte aus Spielständen entfernt werden.
    complete: () => complete,
  };
})();

if (typeof window !== 'undefined') window.HardwareDB = HardwareDB;
if (typeof module !== 'undefined') module.exports = HardwareDB;
