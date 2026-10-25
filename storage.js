// storage.js – lokale Spielstände und Einstellungen (localStorage, mit Schutz gegen Ausfälle).
// Spielstand-Version 3: zusätzlich Bestellungen, Tage/Uhr, Ausbau, gebaute PCs, Aufträge, Verkäufe, Tutorial.
// Version 2 (Phase 2: Lager und Finanzverlauf) und Version 1 (Phase 1) werden beim Laden automatisch übernommen.
// Die eigentliche Prüfung der Inhalte übernehmen die bind()-Funktionen der Module (sie bereinigen beschädigte Werte).
'use strict';

const GameStorage = (() => {
  const SAVE_KEY = 'cst.save.v1'; // Schlüsselname bleibt gleich, damit Spielstände aus Phase 1 und 2 gefunden werden
  const BACKUP_KEY = 'cst.save.backup';
  const SETTINGS_KEY = 'cst.settings.v1';
  const SAVE_VERSION = 3;
  let memory = {}; // Notfall-Speicher, falls localStorage nicht verfügbar ist
  let persistent = true;

  function getRaw(key) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? null : v;
    } catch (e) {
      persistent = false;
      return key in memory ? memory[key] : null;
    }
  }
  function setRaw(key, value) {
    memory[key] = value;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      persistent = false;
      return false;
    }
  }
  function removeRaw(key) {
    delete memory[key];
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      persistent = false;
    }
  }
  function parse(raw) {
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // Bringt einen Spielstand auf die aktuelle Version. Gibt null zurück, wenn er unbrauchbar ist.
  function migrate(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    let out = Object.assign({}, s);
    if (out.version === 1) {
      out = Object.assign(out, { version: 2, inventory: {}, ledger: [], migratedFrom: 1 });
    }
    if (out.version === 2) {
      // Version 2 -> 3: neue Felder starten leer; die Module füllen sie beim Binden mit sicheren Standardwerten.
      // Geld, Lager und Finanzverlauf aus Version 2 bleiben unverändert erhalten.
      out = Object.assign(out, { version: 3, clock: 0, orders: [], pcs: [], jobs: [], sales: [], upgrades: {}, migratedFrom: out.migratedFrom || 2 });
    }
    if (out.version !== SAVE_VERSION) return null; // unbekannte (z. B. neuere) Version: nicht anfassen
    if (typeof out.money !== 'number' || !Number.isFinite(out.money) || out.money < 0) return null;
    return out;
  }

  const defaultSettings = { sensitivity: 5, invertY: false, quality: 'normal', sound: true, volume: 7 };

  return {
    SAVE_VERSION,
    isPersistent: () => persistent,

    // Lädt den Spielstand. Ist die Hauptdatei beschädigt, wird die Sicherungskopie benutzt (recovered = true).
    loadSave() {
      const raw = getRaw(SAVE_KEY);
      if (raw === null) return null;
      const main = migrate(parse(raw));
      if (main) return main;
      const backup = migrate(parse(getRaw(BACKUP_KEY)));
      if (backup) {
        backup.recovered = true;
        return backup;
      }
      return null;
    },

    writeSave(data) {
      const previous = getRaw(SAVE_KEY);
      const obj = Object.assign({}, data, { version: SAVE_VERSION, savedAt: Date.now() });
      delete obj.migratedFrom;
      delete obj.recovered;
      const ok = setRaw(SAVE_KEY, JSON.stringify(obj));
      // Letzten gültigen Stand als Sicherung behalten
      if (ok && previous !== null && migrate(parse(previous))) setRaw(BACKUP_KEY, previous);
      return ok;
    },

    // Entfernt den aktuellen Spielstand, behält ihn aber noch als Sicherungskopie.
    deleteSave() {
      const raw = getRaw(SAVE_KEY);
      if (raw !== null && migrate(parse(raw))) setRaw(BACKUP_KEY, raw);
      removeRaw(SAVE_KEY);
    },

    loadSettings() {
      const s = parse(getRaw(SETTINGS_KEY));
      return Object.assign({}, defaultSettings, s && typeof s === 'object' ? s : {});
    },
    writeSettings(s) {
      return setRaw(SETTINGS_KEY, JSON.stringify(s));
    },

    // Export als Text, damit man den Spielstand sichern oder auf ein anderes Gerät kopieren kann
    exportSave() {
      const s = this.loadSave();
      return s ? JSON.stringify(s) : '';
    },
    importSave(text) {
      const s = migrate(parse(text));
      if (!s) return false;
      return this.writeSave(s);
    },
  };
})();

if (typeof window !== 'undefined') window.GameStorage = GameStorage;
if (typeof module !== 'undefined') module.exports = GameStorage;
