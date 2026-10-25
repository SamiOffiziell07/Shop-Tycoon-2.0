// customers.js – Kunden im Laden: Ankunft, Bewegung, Wünsche, Kaufentscheidung, Verkauf und Bewertung.
// Reine Logik (keine Oberfläche). Die Kunden laufen als einfache Figuren aus Quadern durch den 3D-Laden.
// Kunden sind Teil der Wirtschaft: Sie kaufen Teile oder fertige PCs, bringen Aufträge mit oder gehen unzufrieden.
// Kaufentscheidung: Preis im Vergleich zum Wert, Budget, passendes Produkt, Wartezeit, Ladenstufe und Ausbau.
'use strict';

const Customers = (() => {
  let rng = Math.random;
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const between = (a, b) => a + rng() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const round2 = (x) => Math.round(x * 100) / 100;

  const DOOR = { x: 5.0, z: 5.55 };
  const HUB = { x: 2.2, z: 4.4 };
  const LANE = { x: 2.2, z: 0.2 };
  const SHELF_SPOTS = [{ x: -5.2, z: -3.8, yaw: Math.PI / 2 }, { x: -5.2, z: -0.4, yaw: Math.PI / 2 }, { x: -5.2, z: 3.0, yaw: Math.PI / 2 }];
  const SHOWCASE_SPOTS = [{ x: 6.0, z: -4.2, yaw: -Math.PI / 2 }, { x: 6.0, z: -2.5, yaw: -Math.PI / 2 }, { x: 6.0, z: -0.8, yaw: -Math.PI / 2 }];
  const QUEUE_SLOTS = [{ x: 5.0, z: 3.55 }, { x: 4.1, z: 3.75 }, { x: 3.2, z: 3.95 }, { x: 2.3, z: 3.95 }, { x: 1.4, z: 3.95 }];
  const WALK_SPEED = 1.15;

  // Kundentypen. catWeights: Gewichte der gesuchten Teilekategorien. job: Anteil an Auftragskunden.
  const TYPES = [
    { id: 'schueler', name: 'Schüler', level: 1, weight: 3, budget: [60, 260], tol: 1.0, patience: 75, maxTier: 2, pcChance: 0.02, jobChance: 0.1, jobKinds: ['repair'],
      catWeights: { ram: 3, ssd: 3, fan: 2, cooler: 2, cpu: 1 }, color: 0x4aa8ff },
    { id: 'buero', name: 'Büroangestellte', level: 1, weight: 3, budget: [150, 700], tol: 1.04, patience: 90, maxTier: 2, pcChance: 0.35, jobChance: 0.3, jobKinds: ['repair', 'build'],
      catWeights: { ssd: 3, ram: 3, psu: 1, case: 1 }, color: 0x9a7bd6, pcMin: { minOffice: 30 } },
    { id: 'gamer', name: 'Gamer', level: 1, weight: 3, budget: [200, 800], tol: 1.05, patience: 80, maxTier: 3, pcChance: 0.3, jobChance: 0.3, jobKinds: ['upgrade', 'build'],
      catWeights: { gpu: 4, cpu: 2, ram: 2, ssd: 1, cooler: 1 }, color: 0xe05a47, pcMin: { minGaming: 34 } },
    { id: 'bastler', name: 'Bastler', level: 1, weight: 2, budget: [120, 600], tol: 1.0, patience: 85, maxTier: 3, pcChance: 0.0, jobChance: 0.15, jobKinds: ['repair', 'upgrade'],
      catWeights: { mainboard: 3, case: 2, cooler: 2, psu: 2, fan: 2, ram: 1 }, color: 0x3aa86b },
    { id: 'streamer', name: 'Streamerin', level: 2, weight: 2, budget: [400, 1600], tol: 1.1, patience: 70, maxTier: 4, pcChance: 0.35, jobChance: 0.35, jobKinds: ['build', 'upgrade'],
      catWeights: { gpu: 3, cpu: 3, ram: 2, ssd: 2 }, color: 0xe0b13a, pcMin: { minGaming: 55, minOffice: 40 } },
    { id: 'enthusiast', name: 'Enthusiast', level: 3, weight: 2, budget: [700, 3000], tol: 1.18, patience: 60, maxTier: 5, pcChance: 0.35, jobChance: 0.35, jobKinds: ['build', 'upgrade'],
      catWeights: { gpu: 4, cpu: 3, mainboard: 2, ssd: 2, cooler: 2 }, color: 0x35b8c4, pcMin: { minGaming: 72 } },
    { id: 'firma', name: 'Firmenkunde', level: 4, weight: 1, budget: [1200, 5000], tol: 1.12, patience: 100, maxTier: 5, pcChance: 0.25, jobChance: 0.6, jobKinds: ['build', 'repair'],
      catWeights: { cpu: 2, ram: 3, ssd: 3, psu: 2 }, color: 0x58626f, pcMin: { minOffice: 55 } },
  ];
  const typeById = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

  const FIRST = ['Anna', 'Ben', 'Clara', 'David', 'Elif', 'Felix', 'Greta', 'Hannes', 'Ines', 'Jonas', 'Kerstin', 'Lars', 'Mara', 'Niklas', 'Olga', 'Paul', 'Rosa', 'Sven', 'Tamara', 'Uwe', 'Vera', 'Yusuf', 'Zoe', 'Mehmet', 'Sofia', 'Tobias', 'Lena', 'Murat'];
  const LAST = ['Bauer', 'Schmidt', 'Keller', 'Yilmaz', 'Wagner', 'Hoffmann', 'Weber', 'Fischer', 'Lange', 'Krüger', 'Richter', 'Braun', 'Vogel', 'Neumann', 'Koch', 'Schulz'];
  const SKIN = [0xf0c8a0, 0xd9a577, 0xb67b4f, 0x8a5a3c, 0xf5d5b8];
  const HAIR = [0x2b2118, 0x5a3b22, 0xc9a24a, 0x1a1a1a, 0x8a8a8a, 0x7a3b22];

  let nextCustomerId = 1;

  function availableTypes(s) {
    const lvl = Progress.level(s).level;
    return TYPES.filter((t) => t.level <= lvl);
  }
  function chooseType(s) {
    const list = availableTypes(s);
    const ev = Progress.currentEvent(s);
    const w = (t) => t.weight * (ev && ev.typeBoost && ev.typeBoost[t.id] ? ev.typeBoost[t.id] : 1);
    const total = list.reduce((a, t) => a + w(t), 0);
    let r = rng() * total;
    for (const t of list) { r -= w(t); if (r <= 0) return t; }
    return list[0];
  }
  function weightedPick(weights) {
    const keys = Object.keys(weights);
    const total = keys.reduce((a, k) => a + weights[k], 0);
    let r = rng() * total;
    for (const k of keys) { r -= weights[k]; if (r <= 0) return k; }
    return keys[0];
  }

  // Tests brauchen einen fertigen, funktionierenden PC im Lager
  function sellablePcs(s) {
    return s.pcs.filter((p) => p.origin === 'eigen' && p.report && p.report.ok && p.report.bench && !p.jobId);
  }

  // Erzeugt den Wunsch eines Kunden
  function makeWant(s, type, name) {
    const lvl = Progress.level(s).level;
    const tierCap = Math.min(type.maxTier, lvl + 1);
    const budget = Math.round(between(type.budget[0], type.budget[1]) * (1 + 0.15 * (lvl - 1)) / 5) * 5;
    // Rückkehrer: Ein Kunde, dem du einen PC verkauft hast, kommt für Garantie oder Aufrüstung wieder
    const recent = s.soldPcs.filter((x) => s.day - x.day <= 12);
    if (recent.length && rng() < 0.18) {
      const rec = pick(recent);
      const kind = rng() < 0.5 ? 'upgrade' : 'repair';
      const offer = Jobs.generate(s, kind, rec.who, { soldParts: rec.parts, warranty: kind === 'repair' });
      if (offer) {
        s.soldPcs.splice(s.soldPcs.indexOf(rec), 1);
        return { kind: 'job', job: offer, budget: offer.reward, returnName: rec.who };
      }
    }
    // Auftrag?
    if (rng() < type.jobChance) {
      const kind = pick(type.jobKinds);
      const offer = Jobs.generate(s, kind, name);
      if (offer) return { kind: 'job', job: offer, budget: offer.reward };
    }
    // Fertiger PC?
    if (rng() < type.pcChance && sellablePcs(s).length > 0) {
      const min = type.pcMin || {};
      const pcs = sellablePcs(s);
      const ref = pick(pcs);
      const fair = Builder.suggestedPrice(ref.parts);
      return { kind: 'pc', min: Object.assign({}, min), budget: Math.round(fair * between(0.95, 1.35)) };
    }
    // Einzelteil: Kunden greifen gern zu dem, was im Regal liegt (gut gefülltes Lager lockt Käufer an)
    let cat = weightedPick(type.catWeights);
    const shelf = [];
    for (const r of Inventory.all()) {
      const w = type.catWeights[r.item.category];
      if (w && r.item.tier <= tierCap && Inventory.available(r.item.id) > 0) shelf.push(r.item);
    }
    if (shelf.length && rng() < 0.55) {
      const it = pick(shelf);
      return { kind: 'part', cat: it.category, itemId: it.id, tier: it.tier, budget: Math.max(budget, Math.round(it.sellPrice * 1.1)), brand: it.brand, advice: rng() < 0.3 };
    }
    const items = HardwareDB.list(cat).filter((i) => i.tier <= tierCap);
    let pool = items.filter((i) => i.sellPrice <= budget * 1.1);
    if (!pool.length) pool = items.slice().sort((a, b) => a.sellPrice - b.sellPrice).slice(0, 2);
    if (!pool.length) return { kind: 'part', cat, itemId: HardwareDB.list(cat)[0].id, budget };
    const item = pick(pool);
    return { kind: 'part', cat, itemId: item.id, tier: item.tier, budget: Math.max(budget, Math.round(item.sellPrice * 1.05)), brand: item.brand, advice: rng() < 0.3 };
  }

  function newCustomer(s) {
    const type = chooseType(s);
    let name = pick(FIRST) + ' ' + pick(LAST);
    const want = makeWant(s, type, name);
    if (want.returnName) name = want.returnName;
    const patience = type.patience * Progress.patienceMultiplier(s);
    const c = {
      id: nextCustomerId++, type: type.id, typeName: type.name, name, want,
      x: DOOR.x, z: DOOR.z, yaw: Math.PI, path: [], stage: 'enter', timer: 0, browseSpot: null,
      patience, patienceLeft: patience, attempts: 0, phase: rng() * 6, speed: WALK_SPEED * between(0.9, 1.1),
      skin: pick(SKIN), hair: pick(HAIR), bodyColor: type.color, served: false, outcome: null, queuedAt: 0, rig: null,
    };
    // Weg zum Stöberort
    const spot = rng() < 0.6 ? pick(SHELF_SPOTS) : pick(SHOWCASE_SPOTS);
    c.browseSpot = spot;
    c.path = routeTo(c, spot);
    return c;
  }

  // Wegpunkte (einfach, aber hindernisfrei durch den Laden)
  function routeTo(c, target) {
    const pts = [];
    const east = target.x > 0 && target.z < 1.5; // Ausstellungs-PCs an der Ostwand
    pts.push({ x: HUB.x, z: HUB.z });
    if (east) pts.push({ x: LANE.x, z: LANE.z });
    pts.push({ x: target.x, z: target.z, yaw: target.yaw });
    return pts;
  }
  function routeToDoor(c) {
    const pts = [];
    if (c.x > 3 && c.z < 1.5) pts.push({ x: LANE.x, z: LANE.z });
    if (c.z < 3.2) pts.push({ x: HUB.x, z: HUB.z });
    pts.push({ x: DOOR.x, z: DOOR.z });
    return pts;
  }

  // ---- Kaufentscheidung ----
  function describeWant(c) {
    const w = c.want;
    if (w.kind === 'part') {
      const it = HardwareDB.get(w.itemId);
      if (w.advice) {
        return 'Ich brauche etwas aus der Kategorie „' + HardwareDB.CATEGORY_NAMES[w.cat] + '“ und lasse mich gern beraten. Mein Budget liegt bei etwa ' + Economy.format(w.budget) + ' €. Etwas in Richtung „' + it.name + '“ wäre schön.';
      }
      return 'Ich suche „' + it.name + '“. Mein Budget liegt bei etwa ' + Economy.format(w.budget) + ' €.';
    }
    if (w.kind === 'pc') {
      const parts = [];
      if (w.min.minGaming) parts.push('Gaming-Wert ab ' + w.min.minGaming);
      if (w.min.minOffice) parts.push('Büro-Wert ab ' + w.min.minOffice);
      return 'Ich möchte einen fertigen, getesteten PC kaufen' + (parts.length ? ' (' + parts.join(', ') + ')' : '') + '. Mein Budget liegt bei ' + Economy.format(w.budget) + ' €.';
    }
    return w.job.text;
  }

  function tolerance(s, c) {
    const t = typeById(c.type);
    return t.tol + Progress.priceTolerance(s) + 0.02 * (Progress.level(s).level - 1);
  }

  // Wahrscheinlichkeit, dass der Kunde das Angebot annimmt. offer: { kind:'part', itemId, price } | { kind:'pc', pcId, price }
  function evaluate(s, c, offer) {
    const w = c.want;
    const res = (p, reason, extra) => Object.assign({ p: clamp(p, 0, 1), reason, ratio: 0, match: 1 }, extra || {});
    if (!offer || !Number.isFinite(offer.price) || offer.price < 0) return res(0, 'Ungültiges Angebot.');
    if (w.kind === 'job') return res(0, 'Dieser Kunde bringt einen Auftrag mit.');
    let fair;
    let match = 1;
    if (offer.kind === 'part') {
      if (w.kind !== 'part') return res(0, 'Ich suche keine einzelnen Teile.');
      const it = HardwareDB.get(offer.itemId);
      if (!it) return res(0, 'Unbekanntes Teil.');
      if (it.category !== w.cat) return res(0, 'Ich suche ' + HardwareDB.CATEGORY_NAMES[w.cat] + ', nichts anderes.');
      fair = it.sellPrice;
      if (w.advice) {
        // Beratungskunde: jedes Teil der Kategorie ab der gewünschten Stufe passt (besser ist gern gesehen)
        match = it.tier >= w.tier ? 1 : it.tier === w.tier - 1 ? 0.6 : 0.3;
      } else if (it.id !== w.itemId) {
        const want = HardwareDB.get(w.itemId);
        const diff = Math.abs(it.tier - want.tier);
        match = diff === 0 ? 0.75 : diff === 1 ? (it.tier > want.tier ? 0.7 : 0.5) : 0.2;
        if (it.brand !== want.brand) match *= 0.85;
      }
    } else if (offer.kind === 'pc') {
      if (w.kind !== 'pc') return res(0, 'Ich suche keinen fertigen PC.');
      const pc = s.pcs.find((p) => p.id === offer.pcId);
      if (!pc || !pc.report || !pc.report.ok) return res(0, 'Der PC ist nicht getestet oder funktioniert nicht.');
      const b = pc.report.bench;
      if (w.min.minGaming && b.gaming < w.min.minGaming) return res(0, 'Das ist mir zu schwach für Spiele (Wert ' + b.gaming + ', ich brauche ' + w.min.minGaming + ').');
      if (w.min.minOffice && b.office < w.min.minOffice) return res(0, 'Das ist mir zu langsam für die Arbeit (Wert ' + b.office + ', ich brauche ' + w.min.minOffice + ').');
      fair = Builder.suggestedPrice(pc.parts);
    } else {
      return res(0, 'Unbekanntes Angebot.');
    }
    const ratio = fair > 0 ? offer.price / fair : 1;
    if (offer.price > w.budget * 1.05) return res(0, 'Das sprengt mein Budget.', { ratio, match });
    const tol = tolerance(s, c);
    const priceF = ratio <= tol ? 1 : Math.max(0, 1 - (ratio - tol) / 0.4);
    const waitF = 0.75 + 0.25 * clamp(c.patienceLeft / c.patience, 0, 1);
    const p = match * priceF * waitF;
    return res(p, priceF < 1 ? 'Der Preis ist mir zu hoch.' : match < 1 ? 'Naja, das ist nicht ganz das, was ich wollte.' : '', { ratio, match, priceF, fair });
  }

  const STAR_TEXT = {
    5: ['Super Beratung und ein fairer Preis, gerne wieder!', 'Genau das, was ich gesucht habe. Top Laden!', 'Schnell, freundlich und kompetent.'],
    4: ['Alles in Ordnung, ich komme wieder.', 'Gute Beratung, der Preis war okay.', 'Zufrieden, danke!'],
    3: ['Ganz okay, aber ein bisschen teuer.', 'Es hat etwas gedauert, aber alles passt.', 'Durchschnittlich.'],
    2: ['Der Preis war eher hoch und es dauerte lange.', 'Nicht ganz mein Fall, schade.'],
    1: ['Viel zu teuer und viel zu lange gewartet.', 'Sehr enttäuschend.'],
  };

  // Verkauf ausführen. Gibt { ok, sold, ... } zurück. roll: Zufallszahl 0..1 (für Tests steuerbar).
  function sell(s, c, offer, roll) {
    const fail = (code, message) => ({ ok: false, sold: false, code, message });
    if (!c || c.stage !== 'wait') return fail('not-serving', 'Der Kunde wird gerade nicht bedient.');
    if (c.served) return fail('done', 'Dieser Kunde wurde schon bedient.');
    const ev = evaluate(s, c, offer);
    c.attempts++;
    const r = roll === undefined ? rng() : roll;
    if (ev.p <= 0 || r >= ev.p) {
      const gone = c.attempts >= 3;
      if (gone) { c.outcome = 'no-deal'; startLeave(c); s.salesStats.walkouts++; }
      return { ok: true, sold: false, p: ev.p, reason: ev.reason || 'Hmm, ich überlege es mir noch.', leaves: gone,
        message: gone ? 'Dann gehe ich woanders hin. Auf Wiedersehen!' : (ev.reason || 'Das überzeugt mich nicht.') + ' Vielleicht ein anderes Angebot?' };
    }
    // Ware entnehmen und bezahlen: erst prüfen, dann buchen
    const saleId = s.nextSaleId = (Number.isInteger(s.nextSaleId) ? s.nextSaleId : 1) + 1;
    let what; let cost;
    if (offer.kind === 'part') {
      const it = HardwareDB.get(offer.itemId);
      if (!Inventory.has(offer.itemId, 1)) return fail('stock', 'Dieses Teil ist nicht (mehr) frei verfügbar.');
      what = it.name; cost = it.buyPrice;
    } else {
      const pc = s.pcs.find((p) => p.id === offer.pcId);
      if (!pc) return fail('stock', 'Dieser PC ist nicht mehr vorhanden.');
      what = pc.name + ' (' + Builder.partList(pc.parts).length + ' Teile)'; cost = pc.unitCost || Builder.cost(pc.parts);
    }
    const paid = Economy.earn(offer.price, 'Verkauf: ' + what, 'verkauf', { tx: 'sale:' + saleId });
    if (!paid.ok) return fail(paid.code, paid.message);
    if (offer.kind === 'part') Inventory.take(offer.itemId, 1);
    else {
      const idx = s.pcs.findIndex((p) => p.id === offer.pcId);
      s.soldPcs.push({ day: s.day, who: c.name, parts: Builder.cleanParts(s.pcs[idx].parts) });
      if (s.soldPcs.length > 8) s.soldPcs.shift();
      s.pcs.splice(idx, 1);
    }
    c.served = true;
    c.outcome = 'sold';
    // Zufriedenheit
    const priceSat = ev.ratio <= 1 ? 1 : Math.max(0.2, 1 - (ev.ratio - 1) * 1.6);
    const waitSat = 0.7 + 0.3 * clamp(c.patienceLeft / c.patience, 0, 1);
    const sat = clamp(priceSat * waitSat * (0.5 + 0.5 * ev.match), 0, 1);
    const stars = clamp(Math.round(1 + 4 * sat), 1, 5);
    const gain = stars >= 4 ? (offer.kind === 'pc' ? 4 : 2 + (offer.price >= 250 ? 1 : 0)) : stars === 3 ? 1 : stars === 1 ? -1 : 0;
    const rep = Progress.addRep(s, gain);
    const text = pick(STAR_TEXT[stars]);
    Jobs.recordSale(s, what, offer.price, cost, c.name, offer.kind === 'pc' ? 'pc' : 'teil');
    Jobs.addReview(s, stars, text, c.name);
    s.salesStats.count++;
    if (offer.kind === 'pc') s.salesStats.pcCount++;
    startLeave(c);
    return { ok: true, sold: true, price: offer.price, what, profit: round2(offer.price - cost), stars, text, repGain: gain, rep, message: stars >= 4 ? 'Gekauft! ' + text : 'Na gut, ich nehme es. ' + text };
  }

  function startLeave(c) {
    c.stage = 'leave';
    c.path = routeToDoor(c);
    c.served = true;
  }

  // Job-Kunde: Auftrag annehmen / ablehnen
  function acceptJob(s, c) {
    if (!c || c.stage !== 'wait' || c.want.kind !== 'job') return { ok: false, code: 'not-serving', message: 'Der Kunde bringt keinen Auftrag.' };
    const r = Jobs.accept(s, c.want.job);
    if (!r.ok) return r;
    c.outcome = 'job';
    startLeave(c);
    return { ok: true, job: r.job, message: 'Abgemacht! Ich verlasse mich auf Sie.' };
  }
  function declineJob(s, c) {
    if (!c || c.stage !== 'wait') return { ok: false };
    c.outcome = 'declined';
    startLeave(c);
    const rep = Progress.addRep(s, 0);
    return { ok: true, rep, message: 'Schade. Dann suche ich mir einen anderen Laden.' };
  }
  // Teil nicht vorrätig: Kunde bestellt vor (20 % Anzahlung, Abholung später)
  function preorder(s, c) {
    if (!c || c.stage !== 'wait' || c.want.kind !== 'part') return { ok: false, code: 'not-serving', message: 'Vorbestellung nicht möglich.' };
    const it = HardwareDB.get(c.want.itemId);
    const price = Math.min(it.sellPrice, c.want.budget);
    const r = Jobs.createPreorder(s, it.id, price, c.name);
    if (!r.ok) return r;
    c.outcome = 'preorder';
    startLeave(c);
    return { ok: true, job: r.job, message: 'Gut, ich komme wieder und hole es ab. Hier die Anzahlung.' };
  }
  // Höflich verabschieden (kein Verkauf möglich)
  function dismiss(s, c) {
    if (!c || c.stage !== 'wait') return { ok: false };
    const canHelp = c.want.kind === 'part' ? Inventory.available(c.want.itemId) > 0 : c.want.kind === 'pc' ? sellablePcs(s).length > 0 : true;
    c.outcome = 'dismissed';
    s.salesStats.walkouts++;
    const rep = canHelp ? Progress.addRep(s, -1) : Progress.addRep(s, 0);
    startLeave(c);
    return { ok: true, rep, message: 'Schade, dann gehe ich woanders hin.' };
  }

  // ---- Bewegung ----
  function stepToward(c, dt) {
    if (!c.path.length) return true;
    const t = c.path[0];
    const dx = t.x - c.x, dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = c.speed * dt;
    c.phase += dt * 7;
    if (d <= step) {
      c.x = t.x; c.z = t.z;
      if (Number.isFinite(t.yaw)) c.yaw = t.yaw;
      c.path.shift();
      return c.path.length === 0;
    }
    c.x += (dx / d) * step;
    c.z += (dz / d) * step;
    c.yaw = Math.atan2(-dx, -dz);
    return false;
  }

  return {
    TYPES, DOOR, QUEUE_SLOTS, STAR_TEXT,
    typeById,
    setRng(fn) { rng = typeof fn === 'function' ? fn : Math.random; },
    list: [],
    spawnTimer: 8,
    reset() { this.list = []; this.spawnTimer = 8; },

    describeWant, evaluate, sell, acceptJob, declineJob, preorder, dismiss, sellablePcs, newCustomer,

    // Die Person an der Kasse (vorderster wartender Kunde)
    front() { return this.list.find((c) => c.stage === 'wait') || null; },
    waiting() { return this.list.filter((c) => c.stage === 'queue' || c.stage === 'wait').length; },

    // Passende Angebote aus dem Lager für den Kundenwunsch (Teile)
    stockOptions(s, c) {
      const w = c.want;
      if (w.kind !== 'part') return [];
      const rows = [];
      for (const it of HardwareDB.list(w.cat)) {
        const n = Inventory.available(it.id);
        if (n < 1) continue;
        const ev = evaluate(s, c, { kind: 'part', itemId: it.id, price: it.sellPrice });
        rows.push({ item: it, count: n, p: ev.p, exact: w.advice ? (it.tier >= w.tier && it.sellPrice <= w.budget * 1.05) : it.id === w.itemId });
      }
      rows.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || b.p - a.p);
      return rows;
    },

    // Zeitschritt. dt in Sekunden. ctx: { open: bool, servingId: Kunde in Bedienung }. Gibt Ereignisse zurück.
    tick(s, dt, ctx) {
      const events = [];
      const open = ctx ? ctx.open !== false : true;
      const servingId = ctx ? ctx.servingId : null;
      // Spawn
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const traffic = Progress.trafficMultiplier(s);
        const quiet = s.salesStats.count === 0 && Inventory.totalPieces() === 0 && s.pcs.length === 0;
        this.spawnTimer = (30 / traffic) * between(0.7, 1.3) * (quiet ? 2.5 : 1);
        if (open && this.list.length < Progress.maxCustomers(s)) {
          const c = newCustomer(s);
          this.list.push(c);
          events.push({ type: 'arrived', c });
        }
      }
      const qMax = Progress.queueSize(s);
      for (const c of this.list) {
        if (c.stage === 'enter') {
          if (stepToward(c, dt)) { c.stage = 'browse'; c.timer = between(4, 9); }
        } else if (c.stage === 'browse') {
          c.timer -= dt;
          if (c.timer <= 0) {
            const inQueue = this.list.filter((x) => x.stage === 'queue' || x.stage === 'wait').length;
            if (inQueue >= qMax) {
              c.outcome = 'crowded';
              startLeave(c);
              c.served = false;
              events.push({ type: 'crowded', c });
            } else {
              c.stage = 'queue';
              c.queuedAt = s.clock;
            }
          }
        } else if (c.stage === 'queue' || c.stage === 'wait') {
          const order = this.list.filter((x) => x.stage === 'queue' || x.stage === 'wait').sort((a, b) => a.queuedAt - b.queuedAt || a.id - b.id);
          const idx = order.indexOf(c);
          const slot = QUEUE_SLOTS[Math.min(idx, QUEUE_SLOTS.length - 1)];
          if (c.stage === 'queue' && (!c.path.length || c.path[c.path.length - 1].x !== slot.x || c.path[c.path.length - 1].z !== slot.z)) {
            c.path = [{ x: slot.x, z: slot.z, yaw: 0 }];
          }
          stepToward(c, dt);
          const atSlot = Math.hypot(c.x - slot.x, c.z - slot.z) < 0.05;
          if (idx === 0 && atSlot && c.stage === 'queue') {
            c.stage = 'wait';
            c.yaw = 0;
            events.push({ type: 'atCounter', c });
          }
          // Geduld: an der Kasse voll, in der Schlange halb. Während der Bedienung langsamer.
          const rate = c.stage === 'wait' ? (c.id === servingId ? 0.3 : 1) : 0.5;
          c.patienceLeft -= dt * rate;
          if (c.patienceLeft <= 0) {
            c.outcome = 'timeout';
            startLeave(c);
            c.served = false;
            s.salesStats.walkouts++;
            const rep = s.day >= 2 ? Progress.addRep(s, -1) : null;
            const sound = c.want.kind === 'job' ? 'Der Auftrag ist verloren.' : '';
            Jobs.addReview(s, 2, 'Ich musste viel zu lange warten. ' + sound, c.name);
            events.push({ type: 'timeout', c, rep });
          }
        } else if (c.stage === 'leave') {
          if (stepToward(c, dt)) { c.stage = 'gone'; events.push({ type: 'left', c }); }
        }
      }
      // Fortgegangene entfernen
      this.list = this.list.filter((c) => c.stage !== 'gone');
      return events;
    },

    // Figur aus Quadern (für den Renderer): Liste von Boxen, wird jedes Bild an die Position angepasst.
    makeRig(c) {
      const hexc = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
      const mk = (w, h, d, col) => ({ x: 0, y: 0, z: 0, w, h, d, rot: 0, color: hexc(col), emissive: 0 });
      c.rig = {
        body: mk(0.4, 0.58, 0.24, c.bodyColor), head: mk(0.22, 0.24, 0.22, c.skin), hair: mk(0.24, 0.09, 0.24, c.hair),
        legL: mk(0.15, 0.62, 0.17, 0x2b3140), legR: mk(0.15, 0.62, 0.17, 0x2b3140),
        armL: mk(0.1, 0.5, 0.12, c.bodyColor), armR: mk(0.1, 0.5, 0.12, c.bodyColor),
      };
      return c.rig;
    },
    updateRig(c, time) {
      const r = c.rig || this.makeRig(c);
      const moving = c.path.length > 0 && (c.stage === 'enter' || c.stage === 'leave' || c.stage === 'queue');
      const sw = moving ? Math.sin(c.phase) : 0;
      const bob = moving ? Math.abs(Math.sin(c.phase)) * 0.03 : Math.sin(time * 2 + c.id) * 0.004;
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const place = (b, ox, oy, oz, along) => {
        b.x = c.x + rx * ox + fx * (oz + (along || 0));
        b.z = c.z + rz * ox + fz * (oz + (along || 0));
        b.y = oy + bob;
        b.rot = c.yaw;
      };
      place(r.legL, -0.09, 0.31, 0, sw * 0.18);
      place(r.legR, 0.09, 0.31, 0, -sw * 0.18);
      place(r.body, 0, 0.93, 0, 0);
      place(r.armL, -0.26, 0.93, 0, -sw * 0.14);
      place(r.armR, 0.26, 0.93, 0, sw * 0.14);
      place(r.head, 0, 1.36, 0, 0);
      place(r.hair, 0, 1.5, -0.01, 0);
    },
    rigBoxes(c) {
      const r = c.rig;
      return r ? [r.legL, r.legR, r.body, r.armL, r.armR, r.head, r.hair] : [];
    },
  };
})();

if (typeof window !== 'undefined') window.Customers = Customers;
if (typeof module !== 'undefined') module.exports = Customers;
