// builder.js – PC-Zusammenbau: Bauteil-Plätze, Kompatibilitätsprüfung und Verwaltung der gebauten PCs (state.pcs).
// Ein PC ist { id, name, parts, defects, bios, origin, ... }. parts = { cpu, mainboard, gpu, ram, psu, cooler, case, ssd:[...], fan:[...] }
// (Werte sind Produkt-IDs aus HardwareDB). Bauteile kommen aus dem Lager und gehen beim Zusammenbau dorthin zurück, wenn man zerlegt.
// Die Kompatibilitätsregeln beruhen auf den technischen Daten der Datenbank. Fehlende Angaben werden nie erfunden:
// Regeln, die ein Feld brauchen, das ein Produkt nicht hat, werden übersprungen.
'use strict';

const Builder = (() => {
  const SINGLE_SLOTS = ['case', 'mainboard', 'cpu', 'cooler', 'ram', 'gpu', 'psu'];
  const MULTI_SLOTS = { ssd: 3, fan: 4 };
  const SLOT_ORDER = ['case', 'mainboard', 'cpu', 'cooler', 'ram', 'gpu', 'ssd', 'psu', 'fan'];
  const SLOT_NAMES = {
    case: 'Gehäuse', mainboard: 'Mainboard', cpu: 'Prozessor', cooler: 'CPU-Kühler', ram: 'Arbeitsspeicher',
    gpu: 'Grafikkarte', ssd: 'Speicher (SSD)', psu: 'Netzteil', fan: 'Zusatzlüfter',
  };
  const MAX_PCS = 40;
  const BIOS_NOTE = 'Spielregel: Mainboards mit dem Chipsatz H610 brauchen für Intel-Prozessoren der 14. Generation ein BIOS-Update.';

  const get = (id) => HardwareDB.get(id);
  const emptyParts = () => ({ case: null, mainboard: null, cpu: null, cooler: null, ram: null, gpu: null, ssd: [], psu: null, fan: [] });

  function cleanParts(raw) {
    const p = emptyParts();
    if (!raw || typeof raw !== 'object') return p;
    for (const slot of SINGLE_SLOTS) {
      const id = raw[slot];
      if (typeof id === 'string' && HardwareDB.has(id) && get(id).category === slot) p[slot] = id;
    }
    for (const slot of Object.keys(MULTI_SLOTS)) {
      const arr = Array.isArray(raw[slot]) ? raw[slot] : [];
      p[slot] = arr.filter((id) => typeof id === 'string' && HardwareDB.has(id) && get(id).category === slot).slice(0, MULTI_SLOTS[slot]);
    }
    return p;
  }

  function partList(parts) {
    const out = [];
    for (const slot of SLOT_ORDER) {
      if (MULTI_SLOTS[slot]) for (const id of parts[slot]) out.push({ slot, id });
      else if (parts[slot]) out.push({ slot, id: parts[slot] });
    }
    return out;
  }

  // 14. Generation (Spielregel für das BIOS-Update): i5-14600K, i7-14700K, i9-14900K
  function isGen14(cpu) {
    return !!cpu && /i[3579]-14\d{3}/i.test(cpu.name);
  }
  function needsBiosUpdate(parts) {
    const cpu = parts.cpu && get(parts.cpu);
    const mb = parts.mainboard && get(parts.mainboard);
    return !!(cpu && mb && isGen14(cpu) && /H610/i.test(mb.specs.chipset || ''));
  }

  // Schätzt den Strombedarf des Systems in Watt (Spielwert)
  function powerDraw(parts) {
    let w = 45; // Mainboard, Speicher, Lüfter
    const cpu = parts.cpu && get(parts.cpu);
    const gpu = parts.gpu && get(parts.gpu);
    if (cpu) w += cpu.specs.maxPowerW || cpu.specs.tdpW || 65;
    if (gpu) w += gpu.specs.tgpW || 150;
    w += (parts.ssd.length || 0) * 6 + (parts.fan.length || 0) * 3;
    return Math.round(w);
  }

  // Prüft eine (auch unvollständige) Zusammenstellung.
  // Ergebnis: { errors: [text], warnings: [text], missing: [slot], power }
  // errors = unmögliche Kombination (kann nicht gebaut werden), missing = fehlende wichtige Teile (PC startet nicht).
  function check(partsIn) {
    const parts = cleanParts(partsIn);
    const errors = [];
    const warnings = [];
    const cpu = parts.cpu && get(parts.cpu);
    const mb = parts.mainboard && get(parts.mainboard);
    const gpu = parts.gpu && get(parts.gpu);
    const ram = parts.ram && get(parts.ram);
    const psu = parts.psu && get(parts.psu);
    const cooler = parts.cooler && get(parts.cooler);
    const cs = parts.case && get(parts.case);
    const power = powerDraw(parts);

    if (cpu && mb && cpu.specs.socket !== mb.specs.socket) {
      errors.push('Der Prozessor (Sockel ' + cpu.specs.socket + ') passt nicht auf das Mainboard (Sockel ' + mb.specs.socket + ').');
    }
    if (cpu && mb && cpu.specs.socket === mb.specs.socket && Array.isArray(cpu.specs.memTypes) && !cpu.specs.memTypes.includes(mb.specs.memType)) {
      errors.push('Der Prozessor unterstützt keinen ' + mb.specs.memType + '-Speicher.');
    }
    if (ram && mb && ram.specs.memType !== mb.specs.memType) {
      errors.push('Der Speicher (' + ram.specs.memType + ') passt nicht zum Mainboard (' + mb.specs.memType + ').');
    }
    if (ram && cpu && Array.isArray(cpu.specs.memTypes) && !cpu.specs.memTypes.includes(ram.specs.memType) && !(mb && ram.specs.memType !== mb.specs.memType)) {
      errors.push('Der Prozessor unterstützt keinen ' + ram.specs.memType + '-Speicher.');
    }
    if (ram && mb) {
      if (ram.specs.modules > mb.specs.ramSlots) errors.push('Das Mainboard hat nur ' + mb.specs.ramSlots + ' Speicherplätze, das Kit braucht ' + ram.specs.modules + '.');
      if (ram.specs.capacityGB > mb.specs.maxRamGB) errors.push('Das Mainboard unterstützt höchstens ' + mb.specs.maxRamGB + ' GB Arbeitsspeicher.');
    }
    if (mb && cs && !cs.specs.formFactors.includes(mb.specs.formFactor)) {
      errors.push('Das Mainboard (' + mb.specs.formFactor + ') passt nicht ins Gehäuse (unterstützt: ' + cs.specs.formFactors.join(', ') + ').');
    }
    if (gpu && cs && Number.isFinite(gpu.specs.lengthMM) && gpu.specs.lengthMM > cs.specs.maxGpuMM) {
      errors.push('Die Grafikkarte ist mit ' + gpu.specs.lengthMM + ' mm zu lang für das Gehäuse (max. ' + cs.specs.maxGpuMM + ' mm).');
    }
    if (cooler && cpu && Array.isArray(cooler.specs.sockets) && !cooler.specs.sockets.includes(cpu.specs.socket)) {
      errors.push('Der Kühler unterstützt den Sockel ' + cpu.specs.socket + ' nicht.');
    }
    if (cooler && cs) {
      if (cooler.specs.heightMM && cooler.specs.heightMM > cs.specs.maxCoolerMM) {
        errors.push('Der Kühler ist mit ' + cooler.specs.heightMM + ' mm zu hoch für das Gehäuse (max. ' + cs.specs.maxCoolerMM + ' mm).');
      }
      if (cooler.specs.radiatorMM) {
        const rads = Object.values(cs.specs.radiators || {});
        if (!rads.some((r) => r >= cooler.specs.radiatorMM)) {
          errors.push('Im Gehäuse ist kein Platz für einen ' + cooler.specs.radiatorMM + ' mm Radiator.');
        }
      }
    }
    if (psu) {
      if (gpu && Number.isFinite(gpu.specs.pcie8) && gpu.specs.pcie8 > psu.specs.pcie8) {
        errors.push('Das Netzteil hat nur ' + psu.specs.pcie8 + ' PCIe-8-Pin-Anschlüsse, die Grafikkarte braucht ' + gpu.specs.pcie8 + '.');
      }
      if (cpu && psu.specs.eps8 < 1) errors.push('Dem Netzteil fehlt der EPS-Anschluss für den Prozessor.');
      const sataNeeded = parts.ssd.filter((id) => get(id).specs.bus === 'sata').length;
      if (sataNeeded > psu.specs.sata) errors.push('Das Netzteil hat zu wenige SATA-Stromanschlüsse.');
    }
    if (mb) {
      const m2 = parts.ssd.filter((id) => get(id).specs.bus === 'm2').length;
      const sata = parts.ssd.filter((id) => get(id).specs.bus === 'sata').length;
      if (m2 > mb.specs.m2Slots) errors.push('Das Mainboard hat nur ' + mb.specs.m2Slots + ' M.2-Steckplätze.');
      if (sata > mb.specs.sataPorts) errors.push('Das Mainboard hat nur ' + mb.specs.sataPorts + ' SATA-Ports.');
    }

    // Hinweise (kein Fehler, aber relevant)
    if (psu && power * 1.2 > psu.specs.wattage && power <= psu.specs.wattage) {
      warnings.push('Das Netzteil (' + psu.specs.wattage + ' W) hat wenig Reserve bei geschätzt ' + power + ' W Bedarf.');
    }
    if (psu && power > psu.specs.wattage) {
      warnings.push('Das Netzteil (' + psu.specs.wattage + ' W) ist zu schwach: geschätzter Bedarf ' + power + ' W. Der PC wird unter Last ausgehen.');
    }
    if (psu && gpu && gpu.specs.psuRecW && psu.specs.wattage < gpu.specs.psuRecW) {
      warnings.push('Für diese Grafikkarte werden mindestens ' + gpu.specs.psuRecW + ' W Netzteilleistung empfohlen.');
    }
    if (cpu && mb && needsBiosUpdate(parts)) {
      warnings.push('BIOS-Update nötig: Dieses Mainboard erkennt den Prozessor erst nach einem Update. (' + BIOS_NOTE + ')');
    }
    if (cooler && cpu && cooler.perf && cpu.specs.maxPowerW > 150 && cooler.perf.cooling < 75) {
      warnings.push('Der Kühler ist für diesen starken Prozessor knapp bemessen. Mit Drosselung ist zu rechnen.');
    }
    if (gpu && ram && ram.specs.capacityGB < 16) warnings.push('Für Spiele sind mindestens 16 GB Arbeitsspeicher sinnvoll.');

    const missing = [];
    for (const slot of ['case', 'mainboard', 'cpu', 'ram', 'psu']) if (!parts[slot]) missing.push(slot);
    if (!parts.cooler) missing.push('cooler');
    if (!parts.ssd.length) missing.push('ssd');
    if (!gpu && !(cpu && cpu.specs.igpu)) missing.push('gpu');
    return { errors, warnings, missing, power, parts };
  }

  // Prüft, ob ein einzelnes Bauteil zur bisherigen Auswahl passt (für die Auswahlliste). { ok, reason }
  function checkAdd(partsIn, slot, id) {
    const parts = cleanParts(partsIn);
    const item = get(id);
    if (!item || item.category !== slot) return { ok: false, reason: 'Unbekanntes Teil.' };
    const trial = cleanParts(parts);
    if (MULTI_SLOTS[slot]) {
      if (trial[slot].length >= MULTI_SLOTS[slot]) return { ok: false, reason: 'Alle Plätze belegt.' };
      trial[slot].push(id);
    } else {
      trial[slot] = id;
    }
    // Vor und nach dem Einsetzen vergleichen: nur NEUE Fehler zählen
    const before = new Set(check(parts).errors);
    const after = check(trial).errors.filter((e) => !before.has(e));
    return after.length ? { ok: false, reason: after[0] } : { ok: true, reason: '' };
  }

  function sanitizePcs(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const p of raw) {
      if (!p || !Number.isInteger(p.id) || seen.has(p.id)) continue;
      seen.add(p.id);
      const defects = {};
      if (p.defects && typeof p.defects === 'object') {
        for (const k of Object.keys(p.defects)) if (typeof p.defects[k] === 'string') defects[k] = p.defects[k];
      }
      const rep = p.report && typeof p.report === 'object' ? p.report : null;
      out.push({
        id: p.id,
        name: typeof p.name === 'string' && p.name ? p.name.slice(0, 40) : 'PC #' + p.id,
        parts: cleanParts(p.parts),
        defects,
        bios: p.bios === true,
        origin: p.origin === 'kunde' ? 'kunde' : 'eigen',
        jobId: Number.isInteger(p.jobId) ? p.jobId : null,
        symptom: typeof p.symptom === 'string' ? p.symptom : '',
        builtAt: Number.isFinite(p.builtAt) ? p.builtAt : 0,
        report: rep,
        unitCost: Number.isFinite(p.unitCost) ? p.unitCost : 0,
        added: Array.isArray(p.added) ? p.added.filter((id) => typeof id === 'string' && HardwareDB.has(id)).slice(-20) : [],
      });
    }
    return out.slice(0, 200);
  }

  return {
    SINGLE_SLOTS,
    MULTI_SLOTS,
    SLOT_ORDER,
    SLOT_NAMES,
    MAX_PCS,
    BIOS_NOTE,
    emptyParts,
    cleanParts,
    partList,
    check,
    checkAdd,
    powerDraw,
    needsBiosUpdate,
    sanitizePcs,

    bind(s) {
      s.pcs = sanitizePcs(s.pcs);
      const maxId = s.pcs.reduce((m, p) => Math.max(m, p.id), 0);
      s.nextPcId = Number.isInteger(s.nextPcId) && s.nextPcId > maxId ? s.nextPcId : maxId + 1;
      s.draft = cleanParts(s.draft);
      // Entwurf nutzt nur Teile, die es wirklich gibt: Teile im Entwurf bleiben im Lager (werden erst beim Zusammenbau entnommen)
    },

    // Wert aller Teile eines PCs zu Einkaufspreisen
    cost(parts) {
      let c = 0;
      for (const { id } of partList(cleanParts(parts))) c += get(id).buyPrice;
      return Math.round(c * 100) / 100;
    },
    // Empfohlener Verkaufspreis = Summe der Verkaufspreise der Teile plus Montageaufschlag
    suggestedPrice(parts) {
      let c = 0;
      for (const { id } of partList(cleanParts(parts))) c += get(id).sellPrice;
      return Math.round(c * 1.04);
    },

    // Schlägt passende Teile aus dem freien Lagerbestand vor und füllt leere Plätze des Entwurfs.
    // Bereits gewählte Teile bleiben. Gibt { parts, added, missing } zurück (missing = Plätze ohne passendes Lagerteil).
    // Es wird der günstigste passende Posten je Platz gewählt; das Netzteil ist ausreichend dimensioniert.
    autoFill(partsIn) {
      const parts = cleanParts(partsIn);
      const used = {};
      for (const { id } of partList(parts)) used[id] = (used[id] || 0) + 1;
      const free = (id) => Inventory.available(id) - (used[id] || 0);
      const candidates = (slot) => Inventory.byCategory(slot).map((r) => r.item).filter((it) => free(it.id) > 0).sort((a, b) => a.buyPrice - b.buyPrice);
      const added = [];
      const missing = [];
      const take = (slot, filter) => {
        for (const it of candidates(slot)) {
          if (!checkAdd(parts, slot, it.id).ok) continue;
          if (filter && !filter(it)) continue;
          if (MULTI_SLOTS[slot]) parts[slot].push(it.id); else parts[slot] = it.id;
          used[it.id] = (used[it.id] || 0) + 1;
          added.push(it.id);
          return true;
        }
        missing.push(slot);
        return false;
      };
      if (!parts.case) take('case');
      if (!parts.mainboard) take('mainboard');
      if (!parts.cpu) take('cpu');
      if (!parts.ram) take('ram');
      if (!parts.cooler) take('cooler');
      const cpu = parts.cpu && get(parts.cpu);
      if (!parts.gpu && !(cpu && cpu.specs.igpu)) take('gpu');
      if (!parts.ssd.length) take('ssd');
      if (!parts.psu) {
        const need = powerDraw(parts) * 1.2;
        if (!take('psu', (it) => it.specs.wattage >= need)) {
          missing.pop();
          take('psu'); // notfalls das stärkste passende, auch wenn die Reserve knapp ist
        }
      }
      return { parts, added, missing: Array.from(new Set(missing)) };
    },

    // Fehlt dem Lager etwas für den Entwurf? [{ id, need, have }]
    shortages(parts) {
      const need = {};
      for (const { id } of partList(cleanParts(parts))) need[id] = (need[id] || 0) + 1;
      const out = [];
      for (const id of Object.keys(need)) {
        const have = Inventory.available(id);
        if (have < need[id]) out.push({ id, need: need[id], have });
      }
      return out;
    },

    // Baut den PC: entnimmt die Teile aus dem Lager (alles oder nichts).
    assemble(s, partsIn, name) {
      const fail = (code, message) => ({ ok: false, code, message });
      const parts = cleanParts(partsIn);
      const list = partList(parts);
      if (!list.length) return fail('empty', 'Wähle zuerst Bauteile aus.');
      if (!parts.case) return fail('no-case', 'Ohne Gehäuse lässt sich kein PC zusammenbauen.');
      if (!parts.mainboard) return fail('no-mb', 'Ohne Mainboard lässt sich kein PC zusammenbauen.');
      if (s.pcs.length >= MAX_PCS) return fail('too-many', 'Du hast schon ' + MAX_PCS + ' PCs. Verkaufe oder zerlege zuerst einen.');
      const res = check(parts);
      if (res.errors.length) return fail('incompatible', res.errors[0]);
      const short = this.shortages(parts);
      if (short.length) return fail('stock', 'Im Lager fehlt: ' + HardwareDB.get(short[0].id).name + '.');
      // Alles entnehmen; bei einem Fehler alles zurücklegen
      const taken = [];
      for (const { id } of list) {
        const r = Inventory.take(id, 1);
        if (!r.ok) {
          for (const t of taken) Inventory.add(t, 1);
          return fail('stock', r.message);
        }
        taken.push(id);
      }
      const id = s.nextPcId++;
      const pc = {
        id, name: (name && String(name).trim().slice(0, 40)) || 'PC #' + id, parts, defects: {}, bios: false, origin: 'eigen',
        jobId: null, symptom: '', builtAt: s.clock, report: null, unitCost: this.cost(parts), added: [],
      };
      s.pcs.push(pc);
      return { ok: true, pc };
    },

    // Zerlegt einen PC: Teile (außer defekten) kommen zurück ins Lager. Defekte Teile werden entsorgt.
    disassemble(s, pcId) {
      const idx = s.pcs.findIndex((p) => p.id === pcId);
      if (idx < 0) return { ok: false, code: 'unknown', message: 'PC nicht gefunden.' };
      const pc = s.pcs[idx];
      if (pc.origin === 'kunde') return { ok: false, code: 'customer', message: 'Das ist der PC eines Kunden und darf nicht zerlegt werden.' };
      const list = partList(pc.parts).filter(({ slot, id }) => !pc.defects[slot + ':' + id]);
      if (Inventory.freeSpace() < list.length) return { ok: false, code: 'capacity', message: 'Im Lager ist nicht genug Platz für die Teile.' };
      for (const { id } of list) Inventory.add(id, 1);
      s.pcs.splice(idx, 1);
      return { ok: true, returned: list.length, scrapped: partList(pc.parts).length - list.length };
    },

    // Tauscht ein Teil in einem vorhandenen PC (Reparatur/Aufrüstung). Das neue Teil kommt aus dem Lager,
    // das alte Teil geht (wenn intakt) zurück ins Lager. oldId bestimmt bei Mehrfach-Plätzen das alte Teil.
    swapPart(s, pcId, slot, newId, oldId) {
      const pc = s.pcs.find((p) => p.id === pcId);
      if (!pc) return { ok: false, code: 'unknown', message: 'PC nicht gefunden.' };
      const item = get(newId);
      if (!item || item.category !== slot) return { ok: false, code: 'bad-part', message: 'Dieses Teil passt nicht in den Steckplatz.' };
      const trial = cleanParts(pc.parts);
      let old = null;
      if (MULTI_SLOTS[slot]) {
        const i = oldId ? trial[slot].indexOf(oldId) : -1;
        if (i >= 0) { old = trial[slot][i]; trial[slot][i] = newId; }
        else if (trial[slot].length < MULTI_SLOTS[slot]) trial[slot].push(newId);
        else return { ok: false, code: 'full', message: 'Alle Plätze sind belegt. Wähle ein Teil zum Ersetzen.' };
      } else {
        old = trial[slot];
        trial[slot] = newId;
      }
      const res = check(trial);
      const before = new Set(check(pc.parts).errors);
      const newErrors = res.errors.filter((e) => !before.has(e));
      if (newErrors.length) return { ok: false, code: 'incompatible', message: newErrors[0] };
      if (Inventory.available(newId) < 1) return { ok: false, code: 'stock', message: 'Dieses Teil ist nicht im Lager.' };
      const oldDefect = old ? pc.defects[slot + ':' + old] : null;
      // Altteile eines Kunden-PCs gehören dem Kunden und kommen nicht ins eigene Lager
      const oldReturns = old && !oldDefect && pc.origin !== 'kunde';
      // Platz im Lager: neues Teil geht raus (frei), altes kommt zurück (+1 -1 = ausgeglichen)
      const taken = Inventory.take(newId, 1);
      if (!taken.ok) return { ok: false, code: 'stock', message: taken.message };
      if (oldReturns) {
        const back = Inventory.add(old, 1);
        if (!back.ok) {
          Inventory.add(newId, 1);
          return { ok: false, code: 'capacity', message: back.message };
        }
      }
      pc.parts = trial;
      if (old) delete pc.defects[slot + ':' + old];
      pc.report = null; // nach dem Umbau muss neu getestet werden
      if (slot === 'mainboard' || slot === 'cpu') pc.bios = false;
      if (pc.origin !== 'kunde') pc.unitCost = this.cost(pc.parts);
      else pc.added = (pc.added || []).concat([newId]).slice(-20); // wird dem Kunden zum Verkaufspreis berechnet
      return { ok: true, old, scrapped: !!oldDefect };
    },

    // Nimmt ein Teil heraus (z. B. defektes RAM entfernen)
    removePart(s, pcId, slot, id) {
      const pc = s.pcs.find((p) => p.id === pcId);
      if (!pc) return { ok: false, code: 'unknown', message: 'PC nicht gefunden.' };
      const parts = cleanParts(pc.parts);
      if (MULTI_SLOTS[slot]) {
        const i = parts[slot].indexOf(id);
        if (i < 0) return { ok: false, code: 'none', message: 'Dieses Teil ist nicht eingebaut.' };
        parts[slot].splice(i, 1);
      } else {
        if (parts[slot] !== id) return { ok: false, code: 'none', message: 'Dieses Teil ist nicht eingebaut.' };
        parts[slot] = null;
      }
      const defect = pc.defects[slot + ':' + id];
      const toStock = !defect && pc.origin !== 'kunde';
      if (toStock && Inventory.freeSpace() < 1) return { ok: false, code: 'capacity', message: 'Im Lager ist kein Platz.' };
      if (toStock) Inventory.add(id, 1);
      delete pc.defects[slot + ':' + id];
      pc.parts = parts;
      pc.report = null;
      if (slot === 'mainboard' || slot === 'cpu') pc.bios = false;
      return { ok: true, scrapped: !!defect };
    },
  };
})();

if (typeof window !== 'undefined') window.Builder = Builder;
if (typeof module !== 'undefined') module.exports = Builder;
