// ui-common.js – gemeinsame Hilfen für alle Oberflächen: Elemente bauen, Zahlenformate, Produktdarstellung, Bestätigungsdialog.
// Nur Anzeige – keine Spielregeln.
'use strict';

const UI = (() => {
  const nf = (n) => Economy.format(n);
  const eur = (n) => nf(n) + ' €';
  const num = (n) => n.toLocaleString('de-DE');

  function h(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Dauer in Sekunden als "m:ss min"
  function duration(sec) {
    const t = Math.max(0, Math.round(sec));
    const m = Math.floor(t / 60);
    const r = t % 60;
    return m + ':' + (r < 10 ? '0' : '') + r + ' min';
  }

  // Uhrzeit im Spiel: ein Tag dauert 12 Stunden (08:00 bis 20:00)
  function clockText(dayTime) {
    const frac = Math.max(0, Math.min(1, dayTime / Progress.DAY_SECONDS));
    const mins = Math.floor(frac * 12 * 60);
    const hh = 8 + Math.floor(mins / 60);
    const mm = mins % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function bar(pct, cls) {
    const wrap = h('div', 'bar ' + (cls || ''));
    const fill = h('div', 'bar-fill');
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    wrap.appendChild(fill);
    return wrap;
  }

  function chip(text, cls) {
    return h('span', 'pill ' + (cls || ''), text);
  }

  function clear(el) { el.textContent = ''; }

  // ---------- Darstellung der Hardwaredaten ----------
  const FIELD_LABELS = {
    maxPowerW: 'max. Leistungsaufnahme', baseGHz: 'Basistakt', boostGHz: 'Maximaltakt', tgpW: 'Leistungsaufnahme',
    lengthMM: 'Länge', slots: 'Slotbreite', pcie8: 'Stromanschlüsse', heightMM: 'Bauhöhe', sockets: 'Sockel',
    maxCoolerMM: 'max. Kühlerhöhe', radiators: 'Radiatorplätze', fansIncluded: 'Lüfteranzahl', eps8: 'EPS-Anschlüsse',
    hvhpwr: '16-Pin-Anschluss', standard: 'ATX-Standard', sataPorts: 'SATA-Ports', sata: 'SATA-Anschlüsse', maxRPM: 'max. Drehzahl',
    m2Slots: 'M.2-Steckplätze', writeMBs: 'Schreibgeschwindigkeit',
  };
  const VERIFIED_TEXT = {
    geprueft: 'Datenstatus: Produktname und Eckdaten anhand einer Quelle geprüft.',
    teilweise: 'Datenstatus: teilweise geprüft, einzelne Angaben sind Spielwerte oder unsicher.',
    ungeprueft: 'Datenstatus: nicht einzeln geprüft. Name und Daten beruhen auf allgemeinem Herstellerwissen und können abweichen.',
  };
  function radiatorText(r) {
    const names = { front: 'vorn', top: 'oben', rear: 'hinten', bottom: 'unten' };
    const parts = Object.keys(r || {}).map((k) => (names[k] || k) + ' ' + r[k] + ' mm');
    return parts.length ? parts.join(', ') : 'keine bekannt';
  }
  function storageText(gb) { return gb >= 1000 ? num(gb / 1000) + ' TB' : num(gb) + ' GB'; }

  const SPEC_ROWS = {
    cpu: (s) => [
      ['Sockel', s.socket],
      ['Kerne / Threads', (s.pCores ? s.cores + ' (' + s.pCores + 'P+' + s.eCores + 'E)' : s.cores) + ' / ' + s.threads],
      ['Takt', num(s.baseGHz) + ' – ' + num(s.boostGHz) + ' GHz'],
      ['Leistung (TDP)', s.tdpW + ' W' + (s.maxPowerW ? ', max. ' + s.maxPowerW + ' W' : '')],
      ['Arbeitsspeicher', s.memTypes.join(' / ')],
      ['Integrierte Grafik', s.igpu ? 'Ja' : 'Nein'],
    ],
    gpu: (s) => [
      ['Videospeicher', s.vramGB + ' GB ' + s.vramType],
      ['Leistungsaufnahme', s.tgpW + ' W'],
      ['Länge', s.lengthMM + ' mm'],
      ['Bauweise', num(s.slots) + ' Slots'],
      ['Stromanschlüsse', s.pcie8 + '× 8-Pin PCIe'],
      ['Empf. Netzteil', s.psuRecW + ' W'],
    ],
    mainboard: (s) => [
      ['Sockel', s.socket],
      ['Chipsatz', s.chipset],
      ['Formfaktor', s.formFactor],
      ['Arbeitsspeicher', s.memType + ', ' + s.ramSlots + ' Slots, max. ' + s.maxRamGB + ' GB'],
      ['M.2-Steckplätze', String(s.m2Slots)],
      ['SATA-Ports', String(s.sataPorts)],
      ['WLAN', s.wifi ? 'Ja' : 'Nein'],
    ],
    ram: (s) => [
      ['Typ', s.memType],
      ['Kapazität', s.capacityGB + ' GB (' + s.modules + '×' + s.capacityGB / s.modules + ' GB)'],
      ['Geschwindigkeit', s.memType + '-' + s.speedMTs],
      ['Latenz', 'CL' + s.cl],
    ],
    ssd: (s) => [
      ['Kapazität', storageText(s.capacityGB)],
      ['Schnittstelle', s.interface],
      ['Format', s.formFactor],
      ['Lesen / Schreiben', num(s.readMBs) + ' / ' + num(s.writeMBs) + ' MB/s'],
    ],
    psu: (s) => [
      ['Leistung', s.wattage + ' W'],
      ['Effizienz', s.efficiency],
      ['Standard', s.standard],
      ['Kabel', s.modular === 'voll' ? 'voll modular' : 'fest verbunden'],
      ['Anschlüsse', 'EPS ' + s.eps8 + '×, PCIe 8-Pin ' + s.pcie8 + '×, 16-Pin ' + s.hvhpwr + '×, SATA ' + s.sata + '×'],
    ],
    cooler: (s) => [
      ['Typ', s.type],
      [s.heightMM ? 'Bauhöhe' : 'Radiator', s.heightMM ? s.heightMM + ' mm' : s.radiatorMM + ' mm'],
      ['Sockel', s.sockets.join(', ')],
      ['Lüfter', s.fans + '×'],
    ],
    case: (s) => [
      ['Mainboards', s.formFactors.join(', ')],
      ['Max. Grafikkartenlänge', s.maxGpuMM + ' mm'],
      ['Max. Kühlerhöhe', s.maxCoolerMM + ' mm'],
      ['Radiatoren', radiatorText(s.radiators)],
      ['Lüfter inklusive', s.fansIncluded + '× ' + s.fanSizeMM + ' mm'],
    ],
    fan: (s) => [
      ['Größe', s.sizeMM + ' mm'],
      ['Max. Drehzahl', num(s.maxRPM) + ' U/min'],
      ['RGB-Beleuchtung', s.rgb ? 'Ja' : 'Nein'],
    ],
  };
  const SUMMARY = {
    cpu: (s) => s.socket + ' · ' + s.cores + ' Kerne · bis ' + num(s.boostGHz) + ' GHz',
    gpu: (s) => s.vramGB + ' GB ' + s.vramType + ' · ' + s.tgpW + ' W',
    mainboard: (s) => s.socket + ' · ' + s.chipset.replace(/^(AMD|Intel) /, '') + ' · ' + s.formFactor + ' · ' + s.memType,
    ram: (s) => s.capacityGB + ' GB · ' + s.memType + '-' + s.speedMTs + ' · CL' + s.cl,
    ssd: (s) => storageText(s.capacityGB) + ' · ' + (s.bus === 'm2' ? 'NVMe' : 'SATA') + ' · ' + num(s.readMBs) + ' MB/s',
    psu: (s) => s.wattage + ' W · ' + s.efficiency.replace('80 PLUS ', ''),
    cooler: (s) => (s.heightMM ? 'Luft · ' + s.heightMM + ' mm hoch' : 'AiO · ' + s.radiatorMM + ' mm Radiator'),
    case: (s) => s.formFactors[0] + ' · GPU bis ' + s.maxGpuMM + ' mm',
    fan: (s) => s.sizeMM + ' mm · ' + num(s.maxRPM) + ' U/min' + (s.rgb ? ' · RGB' : ''),
  };
  const PERF_LABELS = { gaming: 'Gaming', multi: 'Multi-Core', cooling: 'Kühlung', airflow: 'Luftstrom' };

  // Platzhaltergrafiken (einfache Symbole je Kategorie, keine Produktfotos)
  const ICONS = {
    cpu: '<rect x="18" y="18" width="28" height="28" rx="3" fill="#cdd5e2"/><rect x="24" y="24" width="16" height="16" rx="2" fill="#7b8594"/><g stroke="#cdd5e2" stroke-width="3">' +
      [22, 28, 34, 40].map((v) => `<path d="M${v} 18V10M${v} 46v8M18 ${v}h-8M46 ${v}h8"/>`).join('') + '</g>',
    gpu: '<rect x="6" y="20" width="52" height="24" rx="3" fill="#2f3540"/><circle cx="22" cy="32" r="8" fill="#161a21"/><circle cx="42" cy="32" r="8" fill="#161a21"/><circle cx="22" cy="32" r="3" fill="#8ca0c0"/><circle cx="42" cy="32" r="3" fill="#8ca0c0"/><rect x="8" y="44" width="30" height="4" fill="#d9b44a"/>',
    mainboard: '<rect x="10" y="10" width="44" height="44" rx="3" fill="#2f9a4e"/><rect x="18" y="18" width="14" height="14" fill="#cdd5e2"/><g fill="#1d1f26">' +
      [0, 1, 2, 3].map((i) => `<rect x="${38 + i * 4}" y="14" width="2.5" height="22"/>`).join('') + '</g><rect x="16" y="42" width="30" height="4" fill="#161a21"/>',
    ram: '<rect x="6" y="22" width="52" height="20" rx="2" fill="#2d6cdf"/><g fill="#161a21">' +
      [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${12 + i * 7}" y="26" width="5" height="9"/>`).join('') + '</g><rect x="6" y="42" width="52" height="3" fill="#d9b44a"/>',
    ssd: '<rect x="6" y="24" width="52" height="16" rx="2" fill="#3a4150"/><rect x="40" y="27" width="14" height="10" fill="#8ca0c0"/><rect x="8" y="27" width="6" height="10" fill="#d9b44a"/>',
    psu: '<rect x="10" y="16" width="44" height="32" rx="3" fill="#2f3540"/><circle cx="32" cy="32" r="11" fill="#161a21"/><circle cx="32" cy="32" r="4" fill="#8ca0c0"/><rect x="14" y="20" width="8" height="3" fill="#d9b44a"/>',
    cooler: '<rect x="14" y="8" width="36" height="40" rx="2" fill="#7b8594"/><g stroke="#2f3540" stroke-width="1.5">' +
      [0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M14 ${14 + i * 5}h36"/>`).join('') + '</g><rect x="22" y="48" width="20" height="8" fill="#b87333"/>',
    case: '<rect x="14" y="6" width="36" height="52" rx="3" fill="#2b2f36"/><rect x="18" y="10" width="28" height="44" rx="2" fill="#161a21"/><circle cx="32" cy="22" r="6" fill="#3a4150"/><circle cx="32" cy="42" r="6" fill="#3a4150"/>',
    fan: '<circle cx="32" cy="32" r="24" fill="#2f3540"/><g fill="#8ca0c0">' +
      [0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a} 32 32)" d="M32 32C28 20 32 10 38 12 40 20 36 28 32 32Z"/>`).join('') + '</g><circle cx="32" cy="32" r="5" fill="#161a21"/>',
  };
  const BRAND_COLORS = { NVIDIA: '#76b900', AMD: '#ed1c24', Intel: '#0071c5', Corsair: '#f0c814', ASUS: '#2a6fd6', MSI: '#e6362d', Gigabyte: '#e87722', ASRock: '#2e5fa8', Noctua: '#a9835a', Samsung: '#1428a0', Kingston: '#c8102e', Arctic: '#1b9ad6', 'be quiet!': '#c8a24a', Seasonic: '#d4202b' };

  function icon(item, cls) {
    const wrap = h('div', cls);
    const accent = BRAND_COLORS[item.brand] || '#8ca0c0';
    wrap.innerHTML = '<svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="Platzhaltergrafik">' + (ICONS[item.category] || '') + `<rect x="2" y="60" width="60" height="3" rx="1.5" fill="${accent}"/></svg>`;
    wrap.title = 'Platzhaltergrafik, kein Produktfoto';
    return wrap;
  }

  // Detailtabelle eines Produkts (technische Daten und Spielwerte)
  function specTable(it) {
    const table = h('table', 'specs');
    for (const [label, value] of (SPEC_ROWS[it.category] ? SPEC_ROWS[it.category](it.specs) : [])) {
      const tr = h('tr');
      tr.appendChild(h('td', '', label));
      tr.appendChild(h('td', '', String(value)));
      table.appendChild(tr);
    }
    if (it.perf) {
      const tr = h('tr');
      tr.appendChild(h('td', '', 'Spielwert'));
      tr.appendChild(h('td', '', Object.keys(it.perf).map((k) => (PERF_LABELS[k] || k) + ' ' + it.perf[k] + '/100').join(' · ')));
      table.appendChild(tr);
    }
    return table;
  }
  function dataState(it) {
    const ds = h('div', 'datastate' + (it.verified === 'geprueft' ? ' ok' : ''));
    let text = VERIFIED_TEXT[it.verified] || VERIFIED_TEXT.ungeprueft;
    if (it.unsure && it.unsure.length) text += ' Unsicher: ' + it.unsure.map((k) => FIELD_LABELS[k] || k).join(', ') + '.';
    if (it.note) text += ' ' + it.note;
    if (it.source) text += ' Quelle: ' + it.source + '.';
    ds.textContent = text;
    return ds;
  }

  // ---------- Bestätigungsdialog (statt window.confirm, funktioniert überall gleich) ----------
  let confirmEl = null;
  function confirmDialog(text, yesLabel, onYes, noLabel) {
    if (!confirmEl) {
      confirmEl = h('div', 'overlay confirm hidden');
      confirmEl.style.zIndex = '200';
      document.body.appendChild(confirmEl);
    }
    clear(confirmEl);
    const card = h('div', 'card');
    card.appendChild(h('p', '', text));
    const yes = h('button', 'btn primary', yesLabel || 'Ja');
    const no = h('button', 'btn ghost', noLabel || 'Abbrechen');
    yes.addEventListener('click', () => { confirmEl.classList.add('hidden'); onYes(); });
    no.addEventListener('click', () => confirmEl.classList.add('hidden'));
    card.appendChild(yes);
    card.appendChild(no);
    confirmEl.appendChild(card);
    confirmEl.classList.remove('hidden');
  }

  return {
    nf, eur, num, h, duration, clockText, bar, chip, clear,
    FIELD_LABELS, SPEC_ROWS, SUMMARY, PERF_LABELS, icon, specTable, dataState, storageText,
    confirm: confirmDialog,
    // wird von game.js gesetzt
    notify: (text, kind) => {},
    sound: (name) => {},
  };
})();

if (typeof window !== 'undefined') window.UI = UI;
