// sim.js – simulierter PC-Start, Diagnose und Benchmark.
// Alle Werte sind Spielwerte aus den Spieldaten (perf, specs), KEINE echten Messungen von Hardware.
// Defekte eines PCs stehen in pc.defects als { "slot:produktId": art }, art = 'defekt' | 'locker' | 'staub'.
//   defekt = Teil muss ersetzt werden, locker = Teil neu einsetzen, staub = Kühlung reinigen.
'use strict';

const Sim = (() => {
  const get = (id) => HardwareDB.get(id);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const KIND_TEXT = { defekt: 'defekt', locker: 'sitzt nicht richtig', staub: 'ist verstaubt' };

  function defectOf(pc, slot) {
    const id = pc.parts[slot];
    return id ? pc.defects[slot + ':' + id] || null : null;
  }
  function ssdDefect(pc) {
    return pc.parts.ssd.some((id) => pc.defects['ssd:' + id] === 'defekt');
  }

  // Erster Fehler beim Start und Liste der Schritte. Jeder Schritt: { text, status: 'ok' | 'warn' | 'fail' }
  function boot(pc) {
    const p = pc.parts;
    const steps = [];
    const ok = (text) => steps.push({ text, status: 'ok' });
    const warn = (text) => steps.push({ text, status: 'warn' });
    const fail = (text, code, slot) => {
      steps.push({ text, status: 'fail' });
      return { ok: false, steps, failCode: code, failSlot: slot || null };
    };
    const psu = p.psu && get(p.psu);
    const mb = p.mainboard && get(p.mainboard);
    const cpu = p.cpu && get(p.cpu);
    const ram = p.ram && get(p.ram);
    const gpu = p.gpu && get(p.gpu);
    const cooler = p.cooler && get(p.cooler);

    if (!p.case) return fail('Gehäuse: Es ist kein Gehäuse vorhanden. Der Aufbau liegt offen auf dem Tisch.', 'no-case', 'case');
    if (!psu) return fail('Netzteil: Es ist kein Netzteil eingebaut. Der PC bleibt komplett aus.', 'no-psu', 'psu');
    const d = defectOf(pc, 'psu');
    if (d === 'defekt') return fail('Netzteil: Keine stabile Spannung. Das Netzteil ist defekt.', 'bad-psu', 'psu');
    if (d === 'locker') return fail('Netzteil: Das Stromkabel zum Mainboard sitzt nicht richtig. Der PC bleibt aus.', 'loose-psu', 'psu');
    ok('Netzteil: ' + psu.specs.wattage + ' W, Spannungen stabil.');

    if (!mb) return fail('Mainboard: Es ist kein Mainboard eingebaut. Nichts startet.', 'no-mb', 'mainboard');
    if (defectOf(pc, 'mainboard') === 'defekt') return fail('Mainboard: Keine Reaktion, keine Diagnose-LED. Das Mainboard ist defekt.', 'bad-mb', 'mainboard');
    ok('Mainboard (' + mb.specs.chipset + '): Selbsttest bestanden.');

    if (!cpu) return fail('Prozessor: Kein Prozessor erkannt. Die CPU-LED leuchtet dauerhaft.', 'no-cpu', 'cpu');
    if (defectOf(pc, 'cpu') === 'defekt') return fail('Prozessor: Wird nicht erkannt. Die CPU-LED leuchtet, der Prozessor ist defekt.', 'bad-cpu', 'cpu');
    if (defectOf(pc, 'cpu') === 'locker') return fail('Prozessor: Kontaktproblem. Der Prozessor sitzt nicht richtig im Sockel.', 'loose-cpu', 'cpu');
    if (Builder.needsBiosUpdate(p) && !pc.bios) {
      return fail('Prozessor: Das BIOS erkennt ' + cpu.name + ' nicht. Ein BIOS-Update ist nötig.', 'bios', 'mainboard');
    }
    ok('Prozessor: ' + cpu.name + ' erkannt.');

    if (!cooler) return fail('Kühlung: Kein CPU-Kühler eingebaut. Die Schutzschaltung stoppt den Start nach wenigen Sekunden.', 'no-cooler', 'cooler');
    if (defectOf(pc, 'cooler') === 'defekt') return fail('Kühlung: Der Kühlerlüfter dreht nicht. Der PC schaltet sich zum Schutz ab.', 'bad-cooler', 'cooler');
    ok('Kühlung: ' + cooler.name + ' läuft.');

    if (!ram) return fail('Arbeitsspeicher: Kein Speicher erkannt. Piepcode: drei lange Töne.', 'no-ram', 'ram');
    if (defectOf(pc, 'ram') === 'locker') return fail('Arbeitsspeicher: Riegel sitzen nicht richtig. Piepcode: drei lange Töne.', 'loose-ram', 'ram');
    if (defectOf(pc, 'ram') === 'defekt') return fail('Arbeitsspeicher: Der Speichertest meldet Fehler. Ein Riegel ist defekt.', 'bad-ram', 'ram');
    ok('Arbeitsspeicher: ' + ram.specs.capacityGB + ' GB ' + ram.specs.memType + '-' + ram.specs.speedMTs + ' erkannt.');

    const gpuLoose = defectOf(pc, 'gpu') === 'locker';
    if (!gpu && !cpu.specs.igpu) return fail('Bildausgabe: Kein Bildsignal. Es gibt weder eine Grafikkarte noch eine integrierte Grafik.', 'no-gpu', 'gpu');
    if (gpu && gpuLoose) return fail('Bildausgabe: Kein Bildsignal. Die Grafikkarte sitzt nicht richtig im Steckplatz.', 'loose-gpu', 'gpu');
    if (gpu && defectOf(pc, 'gpu') === 'defekt') return fail('Bildausgabe: Bildfehler und Streifen, danach schwarzes Bild. Die Grafikkarte ist defekt.', 'bad-gpu', 'gpu');
    if (gpu) ok('Grafik: ' + gpu.name + ' (' + gpu.specs.vramGB + ' GB) erkannt.');
    else warn('Grafik: Nur die integrierte Grafik des Prozessors ist aktiv (für Spiele kaum geeignet).');

    if (!p.ssd.length) return fail('Speicher: Kein Startlaufwerk gefunden. „No bootable device“-Meldung.', 'no-ssd', 'ssd');
    if (ssdDefect(pc)) return fail('Speicher: Ein Laufwerk wird nicht zuverlässig erkannt und liefert Lesefehler. Es ist defekt.', 'bad-ssd', 'ssd');
    if (pc.parts.ssd.some((id) => pc.defects['ssd:' + id] === 'locker')) return fail('Speicher: Ein Laufwerk sitzt nicht richtig. Es wird nicht erkannt.', 'loose-ssd', 'ssd');
    ok('Speicher: ' + p.ssd.map((id) => get(id).name).join(', ') + ' erkannt.');

    ok('Betriebssystem startet. Der PC läuft.');
    return { ok: true, steps, failCode: null, failSlot: null };
  }

  // Alle erkennbaren Probleme eines PCs (für Messgerät): [{ code, slot, text, fix }]
  // fix: 'ersetzen' | 'neu-einsetzen' | 'reinigen' | 'bios' | 'einbauen'
  function problems(pc) {
    const out = [];
    const p = pc.parts;
    const names = Builder.SLOT_NAMES;
    for (const slot of ['case', 'mainboard', 'cpu', 'ram', 'psu']) {
      if (!p[slot]) out.push({ code: 'missing', slot, text: names[slot] + ' fehlt.', fix: 'einbauen' });
    }
    if (!p.cooler) out.push({ code: 'missing', slot: 'cooler', text: 'CPU-Kühler fehlt.', fix: 'einbauen' });
    if (!p.ssd.length) out.push({ code: 'missing', slot: 'ssd', text: 'Kein Speicherlaufwerk eingebaut.', fix: 'einbauen' });
    const cpu = p.cpu && get(p.cpu);
    if (!p.gpu && !(cpu && cpu.specs.igpu)) out.push({ code: 'missing', slot: 'gpu', text: 'Keine Bildausgabe: weder Grafikkarte noch integrierte Grafik.', fix: 'einbauen' });
    if (Builder.needsBiosUpdate(p) && !pc.bios) out.push({ code: 'bios', slot: 'mainboard', text: 'Das BIOS ist zu alt für den Prozessor.', fix: 'bios' });
    for (const key of Object.keys(pc.defects)) {
      const [slot, id] = key.split(':');
      const item = get(id);
      const present = slot === 'ssd' ? p.ssd.includes(id) : p[slot] === id;
      if (!item || !present) continue;
      const kind = pc.defects[key];
      const fix = kind === 'defekt' ? 'ersetzen' : kind === 'locker' ? 'neu-einsetzen' : 'reinigen';
      out.push({ code: kind, slot, id, text: item.name + ' ' + KIND_TEXT[kind] + '.', fix });
    }
    return out;
  }

  // Spielwerte für Leistung, Temperatur und Stromverbrauch. Voraussetzung: der PC startet (boot.ok).
  function benchmark(pc) {
    const p = pc.parts;
    const cpu = get(p.cpu);
    const gpu = p.gpu ? get(p.gpu) : null;
    const ram = get(p.ram);
    const cooler = p.cooler ? get(p.cooler) : null;
    const cs = get(p.case);
    const ssds = p.ssd.map(get);
    const psu = get(p.psu);

    // --- Kühlung und Temperatur ---
    const dusty = pc.defects['cooler:' + p.cooler] === 'staub' || Object.keys(pc.defects).some((k) => k.startsWith('case:') && pc.defects[k] === 'staub');
    const caseAir = cs.perf && cs.perf.airflow ? cs.perf.airflow : 60;
    const fanBonus = p.fan.reduce((a, id) => a + ((get(id).perf && get(id).perf.airflow) || 50), 0) * 0.0012;
    const airFactor = 0.85 + (caseAir / 100) * 0.3 + fanBonus;
    const coolPerf = cooler && cooler.perf && cooler.perf.cooling ? cooler.perf.cooling : 50;
    const capacityW = (60 + coolPerf * 2.4) * airFactor * (dusty ? 0.6 : 1);
    const cpuHeatW = (cpu.specs.maxPowerW || cpu.specs.tdpW || 65) * 0.85;
    const cpuTemp = Math.round(clamp(32 + (cpuHeatW / capacityW) * 55, 30, 105));
    const throttle = cpuTemp > 92 ? clamp(1 - (cpuTemp - 92) * 0.02, 0.5, 1) : 1;
    const gpuTemp = gpu ? Math.round(clamp(38 + (gpu.specs.tgpW * 0.09) / (0.5 + airFactor * 0.5), 35, 100)) : null;

    // --- Leistung ---
    const cpuG = cpu.perf ? cpu.perf.gaming : 30;
    const cpuM = cpu.perf ? cpu.perf.multi : 30;
    const gpuScore = gpu ? (gpu.perf ? gpu.perf.gaming : 30) : 6; // integrierte Grafik: sehr niedrig
    const capF = ram.specs.capacityGB >= 32 ? 1 : ram.specs.capacityGB >= 16 ? 0.96 : 0.82;
    const speedF = 0.97 + 0.03 * Math.min(1, ram.specs.speedMTs / (ram.specs.memType === 'DDR5' ? 6000 : 3600));
    const chanF = ram.specs.modules >= 2 ? 1 : 0.92;
    const ramF = capF * speedF * chanF;
    const bestRead = Math.max.apply(null, ssds.map((s) => s.specs.readMBs || 500));
    const storageScore = Math.round(clamp(40 + bestRead / 125, 40, 100));
    const totalStorageGB = ssds.reduce((a, s) => a + (s.specs.capacityGB || 0), 0);

    const gamingRaw = 0.7 * gpuScore + 0.3 * cpuG * throttle;
    const gaming = Math.round(clamp(gamingRaw * ramF, 1, 100));
    const office = Math.round(clamp((0.55 * cpuM * throttle + 0.2 * cpuG * throttle + 0.15 * storageScore + 0.1 * Math.min(100, ram.specs.capacityGB * 2)) * (0.9 + 0.1 * ramF), 1, 100));
    const total = Math.round(0.6 * gaming + 0.4 * office);
    const fps = Math.round(gaming * 1.9);

    // --- Strom ---
    const loadW = Math.round(cpuHeatW / 0.85 + (gpu ? gpu.specs.tgpW : 0) + 45 + ssds.length * 6 + p.fan.length * 3);
    const idleW = Math.round(35 + (cpu.specs.tdpW || 65) * 0.12 + (gpu ? gpu.specs.tgpW * 0.06 : 0));
    const crash = loadW > psu.specs.wattage;

    const notes = [];
    if (crash) notes.push('Unter Volllast schaltet das Netzteil ab (' + loadW + ' W Bedarf bei ' + psu.specs.wattage + ' W Leistung). Stärkeres Netzteil einbauen.');
    if (throttle < 1) notes.push('Der Prozessor wird zu heiß (' + cpuTemp + ' °C) und drosselt. Besserer Kühler oder mehr Gehäuselüfter helfen.');
    if (dusty) notes.push('Die Kühlung ist verstaubt und leistet nur einen Teil. Reinigen verbessert die Temperaturen.');
    if (gpu && gpuScore > cpuG + 35) notes.push('Der Prozessor bremst die Grafikkarte aus.');
    if (gpu && cpuG > gpuScore + 40) notes.push('Die Grafikkarte ist deutlich schwächer als der Prozessor.');
    if (!gpu) notes.push('Ohne Grafikkarte sind Spiele nur sehr eingeschränkt möglich.');
    if (ram.specs.capacityGB < 16) notes.push('Mit unter 16 GB Arbeitsspeicher fühlt sich der PC bei Spielen und Multitasking langsam an.');
    if (ram.specs.modules < 2) notes.push('Nur ein Speicherriegel: Dual-Channel fehlt, das kostet etwas Leistung.');

    return {
      crash, gaming, office, total, fps, storageScore, totalStorageGB,
      cpuTemp, gpuTemp, throttle: Math.round(throttle * 100), idleW, loadW,
      psuLoadPct: Math.round((loadW / psu.specs.wattage) * 100), ramGB: ram.specs.capacityGB, notes,
      label: 'Spielsimulation – keine echten Messwerte',
    };
  }

  // Kompletter Testlauf: Start -> (bei Erfolg) Benchmark. Speichert den Bericht im PC.
  function test(pc, clock, withTester) {
    const b = boot(pc);
    const res = { clock: clock || 0, boot: b, bench: null, problems: withTester ? problems(pc) : null, ok: false, tester: !!withTester };
    if (b.ok) {
      res.bench = benchmark(pc);
      res.ok = !res.bench.crash;
    }
    pc.report = {
      clock: res.clock, bootOk: b.ok, failCode: b.failCode, ok: res.ok,
      bench: res.bench, steps: b.steps, tester: !!withTester,
    };
    return res;
  }

  // Behebt ein Problem mit dem passenden Handgriff. Gibt { ok, message } zurück.
  function fix(pc, kind, slot, id) {
    if (kind === 'bios') {
      if (!Builder.needsBiosUpdate(pc.parts)) return { ok: false, message: 'Ein BIOS-Update ist hier nicht nötig.' };
      pc.bios = true;
      pc.report = null;
      return { ok: true, message: 'BIOS aktualisiert. Der Prozessor wird jetzt erkannt.' };
    }
    const key = slot + ':' + id;
    const cur = pc.defects[key];
    if (kind === 'neu-einsetzen' && cur === 'locker') {
      delete pc.defects[key];
      pc.report = null;
      return { ok: true, message: Builder.SLOT_NAMES[slot] + ' neu eingesetzt und festgedrückt.' };
    }
    if (kind === 'reinigen' && cur === 'staub') {
      delete pc.defects[key];
      pc.report = null;
      return { ok: true, message: 'Kühlung gereinigt und neue Wärmeleitpaste aufgetragen.' };
    }
    return { ok: false, message: 'Das behebt dieses Problem nicht.' };
  }

  return { boot, problems, benchmark, test, fix, KIND_TEXT, defectOf };
})();

if (typeof window !== 'undefined') window.Sim = Sim;
if (typeof module !== 'undefined') module.exports = Sim;
