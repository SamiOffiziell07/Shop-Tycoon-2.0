// jobs.js – Kundenaufträge: PC-Neubau, Reparatur, Aufrüstung und Vorbestellungen (state.jobs).
// Ein Auftrag wird von einem Kunden an der Kasse angeboten (Jobs.generate), vom Spieler angenommen (Jobs.accept)
// und mit einem passenden, getesteten PC abgeschlossen (Jobs.complete). Abgelaufene Aufträge kosten Ruf.
// Aufträge, Kunden-PCs und Reservierungen werden im Spielstand gespeichert.
'use strict';

const Jobs = (() => {
  let rng = Math.random;
  const MAX_JOBS = 30;
  const round2 = (x) => Math.round(x * 100) / 100;
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const between = (a, b) => a + rng() * (b - a);
  const STATUS_TEXT = { angenommen: 'Offen', erledigt: 'Erledigt', abgelaufen: 'Abgelaufen', abgebrochen: 'Abgebrochen' };
  const KIND_TEXT = { build: 'PC-Bau', repair: 'Reparatur', upgrade: 'Aufrüstung', preorder: 'Vorbestellung' };

  const BUILD_TEMPLATES = [
    { tier: 1, label: 'Büro-PC', budget: [760, 900], req: { minOffice: 30, minRamGB: 16, minStorageGB: 500, needGpu: false }, usage: 'für Büro und Internet' },
    { tier: 1, label: 'Einsteiger-Gaming-PC', budget: [950, 1150], req: { minGaming: 34, minRamGB: 16, minStorageGB: 500, needGpu: true }, usage: 'für den Einstieg ins Gaming' },
    { tier: 2, label: 'Gaming-PC', budget: [1250, 1550], req: { minGaming: 48, minRamGB: 16, minStorageGB: 1000, needGpu: true }, usage: 'für aktuelle Spiele in Full HD' },
    { tier: 3, label: 'Gaming- und Streaming-PC', budget: [1750, 2250], req: { minGaming: 58, minOffice: 45, minRamGB: 32, minStorageGB: 1000, needGpu: true }, usage: 'zum Spielen und Streamen' },
    { tier: 4, label: 'High-End-Gaming-PC', budget: [2500, 3100], req: { minGaming: 72, minRamGB: 32, minStorageGB: 1000, needGpu: true }, usage: 'für maximale Details in hoher Auflösung' },
    { tier: 5, label: 'Workstation für Profis', budget: [3000, 3900], req: { minGaming: 78, minOffice: 70, minRamGB: 64, minStorageGB: 2000, needGpu: true }, usage: 'für Videoschnitt und 3D-Arbeit' },
  ];

  function sanitizeJob(j) {
    if (!j || !Number.isInteger(j.id) || !KIND_TEXT[j.kind] || !STATUS_TEXT[j.status]) return null;
    if (!Number.isFinite(j.deadline) || !Number.isFinite(j.reward) || j.reward < 0) return null;
    const req = j.req && typeof j.req === 'object' ? j.req : {};
    const clean = {
      id: j.id, kind: j.kind, status: j.status,
      customer: typeof j.customer === 'string' ? j.customer.slice(0, 40) : 'Kunde',
      title: typeof j.title === 'string' ? j.title.slice(0, 80) : KIND_TEXT[j.kind],
      text: typeof j.text === 'string' ? j.text.slice(0, 400) : '',
      req: {}, reward: j.reward, deadline: j.deadline, createdAt: Number.isFinite(j.createdAt) ? j.createdAt : 0,
      pcId: Number.isInteger(j.pcId) ? j.pcId : null,
      itemId: typeof j.itemId === 'string' && HardwareDB.has(j.itemId) ? j.itemId : null,
      deposit: Number.isFinite(j.deposit) && j.deposit >= 0 ? j.deposit : 0,
      result: typeof j.result === 'string' ? j.result : '',
      partsCap: Number.isFinite(j.partsCap) && j.partsCap >= 0 ? j.partsCap : 0,
      warranty: j.warranty === true,
    };
    for (const k of ['minGaming', 'minOffice', 'minRamGB', 'minStorageGB']) if (Number.isFinite(req[k])) clean.req[k] = req[k];
    for (const k of ['needGpu', 'rgb']) if (typeof req[k] === 'boolean') clean.req[k] = req[k];
    for (const k of ['cpuBrand', 'gpuBrand']) if (typeof req[k] === 'string') clean.req[k] = req[k];
    if (Array.isArray(req.mustHave)) clean.req.mustHave = req.mustHave.filter((id) => typeof id === 'string' && HardwareDB.has(id)).slice(0, 3);
    if (clean.kind === 'preorder' && !clean.itemId) return null;
    return clean;
  }

  // Zufälliger, kompatibler und vollständiger PC bis zur Teilestufe maxTier (für Kunden-PCs und Tests)
  function randomBuild(maxTier, opts) {
    const o = opts || {};
    // Gehäuse beginnen erst bei Stufe 2; sie zählen deshalb eine Stufe großzügiger
    const list = (cat) => HardwareDB.list(cat).filter((i) => i.tier <= (cat === 'case' ? Math.max(2, maxTier) : maxTier));
    for (let attempt = 0; attempt < 80; attempt++) {
      const cpu = pick(list('cpu'));
      const mbs = list('mainboard').filter((m) => m.specs.socket === cpu.specs.socket && cpu.specs.memTypes.includes(m.specs.memType));
      if (!mbs.length) continue;
      const mb = pick(mbs);
      const rams = list('ram').filter((r) => r.specs.memType === mb.specs.memType);
      const cases = list('case').filter((c) => c.specs.formFactors.includes(mb.specs.formFactor));
      const coolers = list('cooler').filter((c) => c.specs.sockets.includes(cpu.specs.socket));
      const gpus = list('gpu');
      const ssds = list('ssd');
      const psus = list('psu');
      if (!rams.length || !cases.length || !coolers.length || !ssds.length || !psus.length) continue;
      const parts = Builder.emptyParts();
      parts.cpu = cpu.id; parts.mainboard = mb.id; parts.ram = pick(rams).id; parts.case = pick(cases).id;
      parts.cooler = pick(coolers).id; parts.ssd = [pick(ssds).id];
      if (o.gpu !== false && gpus.length) parts.gpu = pick(gpus).id;
      // Netzteil: passt ausreichend und hat genügend Anschlüsse
      const fit = psus.filter((p) => {
        const t = Object.assign({}, parts, { psu: p.id });
        return Builder.check(t).errors.length === 0 && p.specs.wattage >= Builder.powerDraw(t) * 1.15;
      });
      if (!fit.length) continue;
      parts.psu = pick(fit).id;
      const res = Builder.check(parts);
      if (res.errors.length === 0 && res.missing.length === 0) return parts;
    }
    return null;
  }

  function levelNum(s) { return Progress.level(s).level; }
  // Bester erreichbarer Gaming-Wert, wenn nur Grafikkarte (und eventuell Netzteil) getauscht werden und die Kosten unter der Grenze bleiben
  function bestUpgradeGaming(parts, supTier, cap) {
    let best = 0;
    const psus = [null].concat(HardwareDB.list('psu').filter((p) => p.tier <= supTier));
    for (const g of HardwareDB.list('gpu')) {
      if (g.tier > supTier || g.sellPrice > cap) continue;
      for (const psu of psus) {
        const cost = g.sellPrice + (psu ? psu.sellPrice : 0);
        if (cost > cap) continue;
        const trial = Builder.cleanParts(parts);
        trial.gpu = g.id;
        if (psu) trial.psu = psu.id;
        if (Builder.check(trial).errors.length) continue;
        const b = Sim.benchmark({ id: 0, parts: trial, defects: {}, bios: true });
        if (!b.crash && b.gaming > best) best = b.gaming;
      }
    }
    return best;
  }
  // Verkaufswert aller Teile eines PCs (Grundlage für die Obergrenze der berechenbaren Ersatzteile)
  function sellValue(parts) {
    let v = 0;
    for (const x of Builder.partList(Builder.cleanParts(parts))) v += HardwareDB.get(x.id).sellPrice;
    return v;
  }
  // Vorbestellte Ware wird im Lager zurückgelegt (reserviert), sobald sie da ist
  function isReserved(job) {
    return Inventory.reservations().some((r) => r.tag === 'job:' + job.id);
  }

  // Anforderungen als lesbare Liste
  function reqLines(req) {
    const out = [];
    if (req.minGaming) out.push('Gaming-Wert mindestens ' + req.minGaming);
    if (req.minOffice) out.push('Büro-/Multicore-Wert mindestens ' + req.minOffice);
    if (req.minRamGB) out.push('mindestens ' + req.minRamGB + ' GB Arbeitsspeicher');
    if (req.minStorageGB) out.push('mindestens ' + (req.minStorageGB >= 1000 ? req.minStorageGB / 1000 + ' TB' : req.minStorageGB + ' GB') + ' Speicher');
    if (req.needGpu === true) out.push('eigene Grafikkarte');
    if (req.cpuBrand) out.push('Prozessor von ' + req.cpuBrand);
    if (req.gpuBrand) out.push('Grafikkarte von ' + req.gpuBrand);
    if (req.rgb) out.push('mindestens ein RGB-Lüfter');
    if (req.mustHave && req.mustHave.length) for (const id of req.mustHave) out.push('verbaut: ' + (HardwareDB.get(id) ? HardwareDB.get(id).name : id));
    return out;
  }

  // Prüft, ob ein PC einen Auftrag erfüllt. Gibt { ok, problems:[text], margin } zurück (margin: Übererfüllung 0..1).
  function evaluate(job, pc) {
    const problems = [];
    if (!pc) return { ok: false, problems: ['Kein PC gewählt.'], margin: 0 };
    const rep = pc.report;
    if (!rep) problems.push('Der PC wurde noch nicht getestet. Starte ihn an der Werkbank.');
    else if (!rep.bootOk) problems.push('Der PC startet nicht.');
    else if (!rep.ok || !rep.bench) problems.push('Der Testlauf ist nicht bestanden (Absturz unter Last).');
    if (Object.keys(pc.defects).some((k) => {
      const [slot, id] = k.split(':');
      return slot === 'ssd' ? pc.parts.ssd.includes(id) : pc.parts[slot] === id;
    })) problems.push('Am PC sind noch Defekte vorhanden.');
    if (Builder.needsBiosUpdate(pc.parts) && !pc.bios) problems.push('Das BIOS muss noch aktualisiert werden.');
    let margin = 1;
    const b = rep && rep.bench;
    const r = job.req;
    if (b) {
      const m = (have, need) => { if (have < need) problems.push('Zu wenig Leistung (Wert ' + have + ', verlangt ' + need + ').'); else margin = Math.min(margin, (have - need) / Math.max(1, need)); };
      if (r.minGaming) m(b.gaming, r.minGaming);
      if (r.minOffice) m(b.office, r.minOffice);
      if (r.minRamGB) { if (b.ramGB < r.minRamGB) problems.push('Zu wenig Arbeitsspeicher (' + b.ramGB + ' GB, verlangt ' + r.minRamGB + ' GB).'); }
      if (r.minStorageGB) { if (b.totalStorageGB < r.minStorageGB) problems.push('Zu wenig Speicherplatz (' + b.totalStorageGB + ' GB, verlangt ' + r.minStorageGB + ' GB).'); }
    }
    if (r.needGpu === true && !pc.parts.gpu) problems.push('Der Kunde möchte eine eigene Grafikkarte.');
    if (r.cpuBrand && pc.parts.cpu && HardwareDB.get(pc.parts.cpu).brand !== r.cpuBrand) problems.push('Der Kunde möchte einen Prozessor von ' + r.cpuBrand + '.');
    if (r.gpuBrand && pc.parts.gpu && HardwareDB.get(pc.parts.gpu).brand !== r.gpuBrand) problems.push('Der Kunde möchte eine Grafikkarte von ' + r.gpuBrand + '.');
    if (r.rgb && !pc.parts.fan.some((id) => HardwareDB.get(id).specs.rgb)) problems.push('Der Kunde möchte mindestens einen RGB-Lüfter.');
    if (r.mustHave) {
      const built = Builder.partList(pc.parts).map((x) => x.id);
      for (const id of r.mustHave) if (!built.includes(id)) problems.push('Der Kunde besteht auf: ' + (HardwareDB.get(id) ? HardwareDB.get(id).name : id) + '.');
    }
    return { ok: problems.length === 0, problems, margin: Math.max(0, margin) };
  }

  const NAMES = ['Anna', 'Ben', 'Clara', 'David', 'Elif', 'Felix', 'Greta', 'Hannes', 'Ines', 'Jonas', 'Kerstin', 'Lars', 'Mara', 'Niklas', 'Olga', 'Paul', 'Rosa', 'Sven', 'Tamara', 'Uwe', 'Vera', 'Yusuf', 'Zoe', 'Mehmet', 'Sofia', 'Tobias', 'Lena', 'Murat'];
  const SURNAMES = ['Bauer', 'Schmidt', 'Keller', 'Yilmaz', 'Wagner', 'Hoffmann', 'Weber', 'Fischer', 'Lange', 'Krüger', 'Richter', 'Braun', 'Vogel', 'Neumann', 'Koch', 'Schulz'];
  const randomName = () => pick(NAMES) + ' ' + pick(SURNAMES);

  return {
    MAX_JOBS, STATUS_TEXT, KIND_TEXT, BUILD_TEMPLATES,
    setRng(fn) { rng = typeof fn === 'function' ? fn : Math.random; },
    randomBuild, evaluate, reqLines, randomName,

    bind(s) {
      s.jobs = Array.isArray(s.jobs) ? s.jobs.map(sanitizeJob).filter(Boolean).slice(-MAX_JOBS) : [];
      const maxId = s.jobs.reduce((m, j) => Math.max(m, j.id), 0);
      s.nextJobId = Number.isInteger(s.nextJobId) && s.nextJobId > maxId ? s.nextJobId : maxId + 1;
      s.sales = Array.isArray(s.sales)
        ? s.sales.filter((x) => x && Number.isFinite(x.price) && typeof x.what === 'string').slice(-100).map((x) => ({
          t: Number.isFinite(x.t) ? x.t : 0, day: Number.isInteger(x.day) ? x.day : 1, what: x.what.slice(0, 80), price: x.price,
          cost: Number.isFinite(x.cost) ? x.cost : 0, who: typeof x.who === 'string' ? x.who.slice(0, 40) : '', kind: typeof x.kind === 'string' ? x.kind : 'verkauf',
        }))
        : [];
      s.reviews = Array.isArray(s.reviews)
        ? s.reviews.filter((x) => x && typeof x.text === 'string' && Number.isFinite(x.stars)).slice(-20).map((x) => ({
          stars: Math.max(1, Math.min(5, Math.round(x.stars))), text: x.text.slice(0, 200), who: typeof x.who === 'string' ? x.who.slice(0, 40) : '', day: Number.isInteger(x.day) ? x.day : 1,
        }))
        : [];
      // Verkaufte PCs: Kunden kommen später für Aufrüstungen oder Garantiefälle zurück
      s.soldPcs = Array.isArray(s.soldPcs)
        ? s.soldPcs.filter((x) => x && Number.isInteger(x.day) && typeof x.who === 'string').slice(-8).map((x) => ({ day: x.day, who: x.who.slice(0, 40), parts: Builder.cleanParts(x.parts) }))
        : [];
      const st = s.salesStats && typeof s.salesStats === 'object' ? s.salesStats : {};
      s.salesStats = {
        count: Number.isInteger(st.count) && st.count >= 0 ? st.count : 0,
        pcCount: Number.isInteger(st.pcCount) && st.pcCount >= 0 ? st.pcCount : 0,
        jobsDone: Number.isInteger(st.jobsDone) && st.jobsDone >= 0 ? st.jobsDone : 0,
        jobsFailed: Number.isInteger(st.jobsFailed) && st.jobsFailed >= 0 ? st.jobsFailed : 0,
        walkouts: Number.isInteger(st.walkouts) && st.walkouts >= 0 ? st.walkouts : 0,
      };
    },

    active: (s) => s.jobs.filter((j) => j.status === 'angenommen'),
    byId: (s, id) => s.jobs.find((j) => j.id === id) || null,
    freeSlots: (s) => Math.max(0, Progress.jobSlots(s) - s.jobs.filter((j) => j.status === 'angenommen').length),

    recordSale(s, what, price, cost, who, kind) {
      s.sales.push({ t: s.clock, day: s.day, what, price, cost, who, kind: kind || 'verkauf' });
      if (s.sales.length > 100) s.sales.splice(0, s.sales.length - 100);
    },
    addReview(s, stars, text, who) {
      s.reviews.push({ stars, text, who, day: s.day });
      if (s.reviews.length > 20) s.reviews.splice(0, s.reviews.length - 20);
    },

    // Erzeugt ein Auftragsangebot (noch nicht gespeichert). kind: 'build' | 'repair' | 'upgrade' (optional)
    // opts.soldParts: Teile eines früher verkauften PCs (Rückkehr eines Kunden); opts.warranty: kostenlose Garantiereparatur
    generate(s, kind, customerName, opts) {
      const o = opts || {};
      const lvl = levelNum(s);
      const tester = Progress.hasTester(s);
      let k = kind;
      if (!k) {
        const roll = rng();
        k = roll < 0.5 ? 'build' : roll < 0.8 ? 'repair' : 'upgrade';
      }
      const who = customerName || randomName();
      const base = { id: 0, status: 'angebot', customer: who, createdAt: s.clock, req: {}, pcId: null, itemId: null, deposit: 0, result: '' };
      if (k === 'build') {
        const options = BUILD_TEMPLATES.filter((t) => t.tier <= lvl);
        const t = pick(options);
        const req = Object.assign({}, t.req);
        let budget = between(t.budget[0], t.budget[1]);
        if (rng() < 0.22) { req.cpuBrand = pick(['AMD', 'Intel']); budget *= 1.04; }
        // Manchmal besteht der Kunde auf einer bestimmten Grafikkarte (zum Preisrahmen passend)
        if (req.needGpu && t.tier >= 2 && rng() < 0.2) {
          const gpus = HardwareDB.list('gpu').filter((g) => g.tier >= t.tier - 1 && g.tier <= t.tier + 1 && g.sellPrice <= budget * 0.4);
          if (gpus.length) { req.mustHave = [pick(gpus).id]; budget *= 1.05; }
        }
        if (req.needGpu && !req.mustHave && rng() < 0.22) { req.gpuBrand = pick(['NVIDIA', 'AMD']); budget *= 1.04; }
        if (t.tier >= 2 && rng() < 0.15) { req.rgb = true; budget *= 1.03; }
        const reward = Math.round(budget / 10) * 10;
        const deadline = s.clock + 420 + 150 * t.tier;
        return Object.assign(base, {
          kind: 'build', title: t.label + ' für ' + who, reward, deadline, req,
          text: 'Ich brauche einen ' + t.label + ' ' + t.usage + '. Mein Budget liegt bei ' + Economy.format(reward) + ' €.' + (req.mustHave ? ' Es muss unbedingt eine ' + HardwareDB.get(req.mustHave[0]).name + ' verbaut sein.' : '') + ' Liefern Sie bitte einen getesteten PC mit Testbericht.',
        });
      }
      // Reparatur und Aufrüstung brauchen einen Kunden-PC
      const maxTier = Math.max(1, Math.min(4, lvl));
      const parts = o.soldParts ? Builder.cleanParts(o.soldParts) : randomBuild(maxTier);
      if (!parts) return null;
      const pcBase = Builder.cost(parts);
      if (k === 'repair') {
        const complex = tester && rng() < 0.4 + 0.1 * lvl;
        const defects = complex ? 2 : 1;
        const fee = o.warranty ? 0 : Math.round((45 + 12 * lvl + defects * 20) * Progress.repairFeeMultiplier(s));
        if (o.warranty) {
          return Object.assign(base, {
            kind: 'repair', title: 'Garantiefall: PC von ' + who, reward: 0, warranty: true, deadline: s.clock + 480,
            text: 'Der PC, den ich bei Ihnen gekauft habe, macht Probleme. Bitte reparieren Sie ihn kostenlos (Garantie). Das kostet Sie die Ersatzteile, bringt aber einen guten Ruf.',
            customerPc: { parts, defects: 1, base: pcBase, bios: true },
          });
        }
        return Object.assign(base, {
          kind: 'repair', title: 'Reparatur für ' + who, reward: fee, deadline: s.clock + 360 + 90 * defects,
          text: 'Mein PC macht Probleme. Bitte finden Sie den Fehler und reparieren Sie ihn. Gebühr: ' + Economy.format(fee) + ' € plus neue Teile zum Verkaufspreis (höchstens ' + Economy.format(Math.round(sellValue(parts) * 0.6)) + ' €).',
          partsCap: Math.round(sellValue(parts) * 0.6),
          customerPc: { parts, defects: defects, base: pcBase, bios: !!o.soldParts },
        });
      }
      // Aufrüstung: Kunde will mehr Spieleleistung
      parts.gpu = parts.gpu || null;
      const baseTest = (() => {
        const tmp = { id: 0, parts, defects: {}, bios: Builder.needsBiosUpdate(parts) };
        const t = Sim.boot(tmp);
        if (!t.ok) { tmp.bios = true; }
        return Sim.boot(tmp).ok ? Sim.benchmark(tmp) : null;
      })();
      if (!baseTest) return null;
      // Das Ziel muss mit einer bezahlbaren Grafikkarte (und ggf. neuem Netzteil) erreichbar sein
      const cap = Math.round(sellValue(parts) * 1.2);
      const best = bestUpgradeGaming(parts, lvl >= 3 ? 5 : lvl >= 2 ? 4 : 3, cap);
      if (best - baseTest.gaming < 10) return null;
      const target = Math.min(best, Math.round(baseTest.gaming + Math.max(8, (best - baseTest.gaming) * (0.5 + rng() * 0.25))));
      const fee = Math.round((70 + 15 * lvl) * Progress.repairFeeMultiplier(s));
      return Object.assign(base, {
        kind: 'upgrade', title: 'Aufrüstung für ' + who, reward: fee, deadline: s.clock + 480,
        req: { minGaming: target },
        text: 'Mein PC ist in Spielen zu langsam (aktueller Gaming-Wert ' + baseTest.gaming + '). Er soll auf mindestens ' + target + ' kommen. Gebühr: ' + Economy.format(fee) + ' € plus neue Teile zum Verkaufspreis (höchstens ' + Economy.format(Math.round(sellValue(parts) * 1.2)) + ' €).',
        partsCap: Math.round(sellValue(parts) * 1.2),
        customerPc: { parts, defects: 0, base: pcBase, bios: true },
      });
    },

    // Nimmt ein Angebot an: speichert den Auftrag und legt bei Reparaturen/Aufrüstungen den Kunden-PC an.
    accept(s, offer) {
      if (!offer) return { ok: false, code: 'none', message: 'Kein Auftrag.' };
      if (this.freeSlots(s) < 1) return { ok: false, code: 'slots', message: 'Alle Auftragsplätze sind belegt. Erledige zuerst einen Auftrag oder baue die Werkstatt aus.' };
      if (offer.kind === 'repair' || offer.kind === 'upgrade') {
        if (s.pcs.length >= Builder.MAX_PCS + 10) return { ok: false, code: 'too-many', message: 'In der Werkstatt ist kein Platz für einen weiteren PC.' };
      }
      const id = s.nextJobId++;
      const job = sanitizeJob(Object.assign({}, offer, { id, status: 'angenommen' }));
      if (!job) return { ok: false, code: 'bad', message: 'Der Auftrag ist ungültig.' };
      if (offer.kind === 'repair' || offer.kind === 'upgrade') {
        const cp = offer.customerPc;
        const pcId = s.nextPcId++;
        const pc = {
          id: pcId, name: 'PC von ' + offer.customer, parts: Builder.cleanParts(cp.parts), defects: {}, bios: !!cp.bios || !Builder.needsBiosUpdate(cp.parts),
          origin: 'kunde', jobId: id, symptom: '', builtAt: s.clock, report: null, unitCost: 0, added: [],
        };
        if (offer.kind === 'repair') this.injectDefects(pc, cp.defects);
        const boot = Sim.boot(pc);
        pc.symptom = offer.kind === 'repair' ? (boot.ok ? 'Der PC läuft nur unzuverlässig; die Ursache ist nicht sofort sichtbar.' : boot.steps[boot.steps.length - 1].text) : 'Der PC läuft, ist aber zu langsam.';
        s.pcs.push(pc);
        job.pcId = pcId;
        job.text += ' (Beobachtung: ' + pc.symptom + ')';
      }
      s.jobs.push(job);
      if (s.jobs.length > MAX_JOBS) {
        const drop = s.jobs.find((j) => j.status !== 'angenommen');
        if (drop) s.jobs.splice(s.jobs.indexOf(drop), 1);
      }
      return { ok: true, job };
    },

    // Defekte in einen Kunden-PC einbauen (zufällig, aber immer behebbar)
    injectDefects(pc, count) {
      const p = pc.parts;
      const options = [];
      options.push(['ram', p.ram, 'locker']);
      if (p.gpu) options.push(['gpu', p.gpu, 'locker']);
      options.push(['cooler', p.cooler, 'staub']);
      options.push(['psu', p.psu, 'defekt']);
      options.push(['ssd', p.ssd[0], 'defekt']);
      if (p.gpu) options.push(['gpu', p.gpu, 'defekt']);
      options.push(['ram', p.ram, 'defekt']);
      const used = new Set();
      let n = 0;
      let guard = 0;
      while (n < count && guard++ < 30) {
        const o = pick(options);
        const slotKey = o[0];
        if (used.has(slotKey)) continue;
        used.add(slotKey);
        pc.defects[o[0] + ':' + o[1]] = o[2];
        n++;
      }
      // Staub allein lässt den PC noch starten – dann ein zweiter, sichtbarer Fehler
      if (n === 1 && Object.values(pc.defects)[0] === 'staub' && p.ram) pc.defects['ram:' + p.ram] = 'locker';
    },

    // Prüft einen laufenden Auftrag für einen PC (Abgabe-Check)
    check(s, jobId, pcId) {
      const job = this.byId(s, jobId);
      if (!job || job.status !== 'angenommen') return { ok: false, problems: ['Auftrag nicht gefunden oder bereits abgeschlossen.'], margin: 0 };
      if (job.kind === 'preorder') {
        const have = isReserved(job) || Inventory.has(job.itemId, 1);
        return { ok: have, problems: have ? [] : ['Das bestellte Teil liegt noch nicht im Lager.'], margin: 0 };
      }
      const pc = s.pcs.find((p) => p.id === (job.pcId || pcId));
      if ((job.kind === 'repair' || job.kind === 'upgrade') && pc && pc.jobId !== job.id) return { ok: false, problems: ['Dieser PC gehört nicht zum Auftrag.'], margin: 0 };
      if (job.kind === 'build' && pc && pc.origin === 'kunde') return { ok: false, problems: ['Das ist der PC eines anderen Kunden.'], margin: 0 };
      const ev = evaluate(job, pc);
      if (job.kind === 'repair' && pc && ev.problems.length === 0) {
        // Reparatur: nur Start und Defektfreiheit zählen
      }
      return ev;
    },

    // Schließt den Auftrag ab und zahlt aus. Nie doppelt: der Status wechselt zuerst.
    complete(s, jobId, pcId) {
      const job = this.byId(s, jobId);
      if (!job) return { ok: false, code: 'unknown', message: 'Auftrag nicht gefunden.' };
      if (job.status !== 'angenommen') return { ok: false, code: 'closed', message: 'Dieser Auftrag ist bereits abgeschlossen.' };
      const ev = this.check(s, jobId, pcId);
      if (!ev.ok) return { ok: false, code: 'requirements', message: ev.problems[0], problems: ev.problems };
      let pay = job.reward;
      let cost = 0;
      let what = job.title;
      if (job.kind === 'preorder') {
        const item = HardwareDB.get(job.itemId);
        const t = isReserved(job) ? Inventory.consume('job:' + job.id) : Inventory.take(job.itemId, 1);
        if (!t.ok) return { ok: false, code: 'stock', message: t.message };
        pay = round2(job.reward - job.deposit);
        cost = item.buyPrice;
        what = 'Vorbestellung: ' + item.name;
      } else {
        const pcIdx = s.pcs.findIndex((p) => p.id === (job.pcId || pcId));
        const pc = s.pcs[pcIdx];
        if (job.kind === 'build') {
          cost = pc.unitCost || Builder.cost(pc.parts);
        } else {
          // Teile, die der Spieler eingebaut hat, werden zum Verkaufspreis abgerechnet
          const added = Array.isArray(pc.added) ? pc.added : [];
          let parts = 0;
          for (const id of added) { const it = HardwareDB.get(id); if (it) { parts += it.sellPrice; cost += it.buyPrice; } }
          const billed = job.warranty ? 0 : job.partsCap > 0 ? Math.min(parts, job.partsCap) : parts;
          pay = round2(job.reward + billed);
        }
        s.pcs.splice(pcIdx, 1);
      }
      job.status = 'erledigt';
      const cat = job.kind === 'repair' || job.kind === 'upgrade' ? 'reparatur' : 'auftrag';
      const r = pay > 0 ? Economy.earn(pay, 'Auftrag: ' + what, cat, { tx: 'job:' + job.id }) : { ok: true };
      if (!r.ok && r.code !== 'duplicate') {
        job.status = 'angenommen';
        return { ok: false, code: r.code, message: r.message };
      }
      job.result = job.warranty ? 'Garantiefall gelöst' : 'Bezahlt: ' + Economy.format(pay) + ' €';
      const stars = ev.margin >= 0.15 || job.kind === 'repair' ? 5 : 4;
      const repGain = job.warranty ? 6 : (job.kind === 'build' ? 4 + (job.req.minGaming ? Math.round(job.req.minGaming / 25) : 0) : job.kind === 'preorder' ? 2 : 3) + (stars === 5 ? 1 : 0);
      const rep = Progress.addRep(s, repGain);
      s.salesStats.jobsDone++;
      this.recordSale(s, what, pay, cost, job.customer, job.kind);
      this.addReview(s, stars, stars === 5 ? 'Perfekt erledigt, gerne wieder!' : 'Gute Arbeit, alles wie vereinbart.', job.customer);
      return { ok: true, job, paid: pay, profit: round2(pay - cost), repGain, stars, rep };
    },

    // Vorbestellung: Kunde zahlt 20 % an, holt die Ware später ab
    createPreorder(s, itemId, price, customer) {
      const item = HardwareDB.get(itemId);
      if (!item) return { ok: false, code: 'unknown', message: 'Unbekanntes Teil.' };
      if (this.freeSlots(s) < 1) return { ok: false, code: 'slots', message: 'Alle Auftragsplätze sind belegt.' };
      const id = s.nextJobId;
      const deposit = round2(price * 0.2);
      const paid = Economy.earn(deposit, 'Anzahlung ' + customer + ': ' + item.name, 'verkauf', { tx: 'pre:' + id });
      if (!paid.ok) return { ok: false, code: paid.code, message: paid.message };
      s.nextJobId = id + 1;
      const job = sanitizeJob({
        id, kind: 'preorder', status: 'angenommen', customer, title: 'Vorbestellung: ' + item.name,
        text: customer + ' möchte „' + item.name + '“ abholen. Preis ' + Economy.format(price) + ' €, davon ' + Economy.format(deposit) + ' € bereits angezahlt.',
        reward: price, deadline: s.clock + 600, createdAt: s.clock, itemId, deposit, req: {},
      });
      s.jobs.push(job);
      return { ok: true, job, deposit };
    },

    // Abgelaufene Aufträge schließen: Ruf sinkt, Kunden-PCs werden abgeholt, Anzahlungen zurückgezahlt
    tick(s) {
      const events = [];
      for (const job of s.jobs) {
        if (job.status === 'angenommen' && job.kind === 'preorder' && !isReserved(job) && Inventory.available(job.itemId) >= 1) {
          if (Inventory.reserve('job:' + job.id, job.itemId, 1).ok) events.push({ type: 'reserved', job });
        }
        if (job.status !== 'angenommen' || s.clock <= job.deadline) continue;
        job.status = 'abgelaufen';
        Inventory.release('job:' + job.id);
        let refund = 0;
        if (job.kind === 'preorder' && job.deposit > 0) {
          const r = Economy.spendUpTo(job.deposit, 'Anzahlung zurück: ' + job.title, 'gebuehr');
          refund = r.paid;
        }
        if (job.pcId) {
          const i = s.pcs.findIndex((p) => p.id === job.pcId && p.origin === 'kunde');
          if (i >= 0) s.pcs.splice(i, 1);
        }
        const rep = Progress.addRep(s, job.kind === 'preorder' ? -2 : job.warranty ? -6 : -4);
        s.salesStats.jobsFailed++;
        this.addReview(s, 1, 'Zu langsam, das hat viel zu lange gedauert.', job.customer);
        job.result = 'Frist verpasst';
        events.push({ type: 'expired', job, refund, rep });
      }
      return events;
    },

    // Auftrag abbrechen (nur wenn der Spieler es wirklich will): Strafe wie bei Fristablauf, aber milder
    abort(s, jobId) {
      const job = this.byId(s, jobId);
      if (!job || job.status !== 'angenommen') return { ok: false, code: 'closed', message: 'Dieser Auftrag läuft nicht mehr.' };
      job.status = 'abgebrochen';
      Inventory.release('job:' + job.id);
      if (job.kind === 'preorder' && job.deposit > 0) Economy.spendUpTo(job.deposit, 'Anzahlung zurück: ' + job.title, 'gebuehr');
      if (job.pcId) {
        const i = s.pcs.findIndex((p) => p.id === job.pcId && p.origin === 'kunde');
        if (i >= 0) s.pcs.splice(i, 1);
      }
      const rep = Progress.addRep(s, -3);
      s.salesStats.jobsFailed++;
      job.result = 'Abgebrochen';
      return { ok: true, rep };
    },
    sanitizeJob,
  };
})();

if (typeof window !== 'undefined') window.Jobs = Jobs;
if (typeof module !== 'undefined') module.exports = Jobs;
