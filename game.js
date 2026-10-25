// game.js – Spielschleife, Menüs, Interaktionen, Speichern. Verbindet alle Module (Phase 3).
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const EYE_HEIGHT = 1.6;
  const PLAYER_RADIUS = 0.3;
  const WALK_SPEED = 2.7;
  const AUTOSAVE_SECONDS = 20;
  const TIME_MODES = ['playing', 'shop', 'bench', 'counter']; // in diesen Zuständen läuft die Spielzeit

  let renderer, world, controls;
  let settings = GameStorage.loadSettings();
  let state = null; // laufender Spielstand
  let mode = 'menu'; // 'menu' | 'playing' | 'paused' | 'info' | 'shop' | 'bench' | 'counter'
  let dataStatus = { loaded: 0, warnings: [], missing: [], done: false };
  let lastTime = 0;
  let autosaveTimer = 0;
  let currentTarget = null;
  let offlineReady = false;
  let hudTimer = 0;
  let goalTimer = 0;
  let lastShelfUpdate = -10;
  let dayOpen = false; // Tagesabschluss offen (Zeit steht)
  const pendingDays = [];
  let benchPc = null; // PC, der auf der Werkbank im 3D-Laden gezeigt wird
  let benchRunning = false;
  let customerBoxes = [];

  // ---------- Hilfsfunktionen ----------
  function newState() {
    return {
      money: Economy.START_MONEY,
      ledger: [],
      inventory: {},
      rep: 0,
      playTime: 0,
      screens: [false, false, false],
      benchLed: false,
      player: { x: world.start.x, z: world.start.z, yaw: world.start.yaw, pitch: 0 },
    };
  }

  const fmtMoney = (v) => Economy.format(v);

  // Verbindet alle Systeme mit dem laufenden Spielstand (bereinigt dabei auch beschädigte Werte). Reihenfolge ist wichtig.
  function bindSystems() {
    Progress.bind(state);
    Economy.bind(state);
    Inventory.bind(state);
    Procurement.bind(state);
    Builder.bind(state);
    Jobs.bind(state);
    Tutorial.bind(state);
    Achievements.bind(state);
    state.nextSaleId = Number.isInteger(state.nextSaleId) && state.nextSaleId >= 1 ? state.nextSaleId : 1;
  }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  // Meldungen laufen nacheinander durch eine kleine Warteschlange
  const toastQueue = [];
  let toastBusy = false;
  function toast(text, kind) {
    if (toastQueue.length > 4) toastQueue.shift();
    toastQueue.push({ text, kind: kind || 'ok' });
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    const item = toastQueue.shift();
    if (!item) { toastBusy = false; return; }
    toastBusy = true;
    const t = $('toast');
    t.textContent = item.text;
    t.className = item.kind === 'err' ? 'err' : item.kind === 'info' ? 'info' : '';
    setTimeout(() => {
      t.classList.add('hidden');
      setTimeout(nextToast, 120);
    }, item.kind === 'err' ? 3200 : 2500);
  }
  UI.notify = toast;
  UI.sound = (n) => Sfx.play(n);

  function applySettings() {
    controls.lookSensitivity = 0.0025 + settings.sensitivity * 0.0005;
    controls.invertY = !!settings.invertY;
    const cap = { low: 1, normal: 1.5, high: 2 }[settings.quality] || 1.5;
    renderer.setQualityScale(cap);
    renderer.lightLevel = { low: 0, normal: 1, high: 2 }[settings.quality];
    if (renderer.lightLevel === undefined) renderer.lightLevel = 1;
    Sfx.setVolumeNow();
  }

  // ---------- Welt-Zustand auf Objekte anwenden ----------
  function applyWorldState() {
    for (let i = 0; i < 3; i++) {
      const s = world.named['screen' + i];
      if (state && state.screens[i]) {
        s.color = hex(0x4aa8ff);
        s.emissive = 0.9;
      } else {
        s.color = hex(0x0a0c10);
        s.emissive = 0;
      }
    }
    if (state) {
      world.setUpgrades(state.upgrades);
      const lvl = Progress.level(state).level;
      const palette = [0x1f6fd1, 0x1f9d6b, 0xd18a1f, 0xc2417a, 0x7a3bd1];
      world.named.stripe.color = hex(palette[Math.min(4, lvl - 1)]);
    } else {
      world.setUpgrades({});
    }
  }

  // Werkbank-PC im 3D-Laden: zeigt die Teile des gewählten PCs
  const CASE_COLORS = {
    'case-corsair-4000d-airflow': 0x1d2026, 'case-lian-li-lancool-216': 0x2d3036, 'case-nzxt-h5-flow': 0xdfe3ea,
    'case-fractal-design-north': 0x6a4e38, 'case-fractal-design-pop-mini-air': 0x3a424e,
  };
  const MB_COLORS = { ASUS: 0x2b2f38, MSI: 0x1a1a1a, Gigabyte: 0x2f3a46, ASRock: 0x2a2f45 };
  const RAM_COLORS = { Corsair: 0xe0b13a, Kingston: 0xc8102e };
  const GPU_COLORS = { NVIDIA: 0x1d2a1d, AMD: 0x2a1a1a };

  // Regenbogenfarbe (Farbton 0..1) für RGB-Beleuchtung
  function hueRgb(hu) {
    const f = (n) => { const k = (n + hu * 12) % 12; return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [Math.max(0.12, f(0)), Math.max(0.12, f(8)), Math.max(0.12, f(4))];
  }

  function applyBenchPc(pc, running, time) {
    const p = world.named.pc;
    const showDemo = !pc;
    const parts = pc ? pc.parts : null;
    const get = (id) => (id ? HardwareDB.get(id) : null);
    const cs = showDemo ? null : get(parts.case);
    const mb = showDemo ? null : get(parts.mainboard);
    const cpu = showDemo ? null : get(parts.cpu);
    const ram = showDemo ? null : get(parts.ram);
    const gpu = showDemo ? null : get(parts.gpu);
    const psu = showDemo ? null : get(parts.psu);
    const cooler = showDemo ? null : get(parts.cooler);
    const caseCol = cs ? (CASE_COLORS[cs.id] || 0x30343c) : 0x3a404c;
    for (const key of ['base', 'left', 'right', 'top']) p[key].color = hex(caseCol);
    p.back.color = hex(cs ? caseCol : 0x474e5c);
    const col = hueRgb((time * 0.15) % 1);
    if (showDemo) {
      p.mb.hidden = p.cpu.hidden = p.cooler.hidden = p.coolerFan.hidden = p.gpu.hidden = p.gpuLed.hidden = p.psu.hidden = p.cable.hidden = false;
      p.aio.hidden = true;
      p.ssd.hidden = false;
      p.ram.forEach((r, i) => { r.hidden = false; });
      p.fans.forEach((f) => { f.hidden = true; });
      p.mb.color = hex(0x2f9a4e);
      p.cooler.h = 0.14; p.cooler.w = 0.14; p.cooler.color = hex(0x7b8594);
      p.ram.forEach((r, i) => { r.color = hex(i % 2 ? 0x2d6cdf : 0x3b82f6); });
      p.gpu.color = hex(0x23262d); p.gpuLed.w = 0.5;
      p.gpu.w = 0.5; p.gpu.h = 0.07;
      const on = state && state.benchLed;
      p.gpuLed.color = on ? hex(0xff4d6d) : hex(0x401820); p.gpuLed.emissive = on ? 1.2 : 0;
      p.coolerFan.color = on ? hex(0x35e0ff) : hex(0x15181d); p.coolerFan.emissive = on ? 0.8 : 0;
      p.glow.emissive = 0; p.glow.hidden = true;
      return;
    }
    p.glow.hidden = !cs;
    p.mb.hidden = !mb;
    if (mb) p.mb.color = hex(MB_COLORS[mb.brand] || 0x2f9a4e);
    p.cpu.hidden = !cpu || !mb;
    const hasCooler = !!cooler && !!mb;
    const aio = !!(cooler && cooler.specs.radiatorMM);
    p.cooler.hidden = !hasCooler;
    p.coolerFan.hidden = !hasCooler;
    p.aio.hidden = !(hasCooler && aio);
    if (cooler && !aio) {
      const hh = (cooler.specs.heightMM || 155) / 155;
      p.cooler.h = 0.14 * hh; p.cooler.w = 0.14; p.cooler.color = hex(cooler.brand === 'Noctua' ? 0xa9835a : 0x7b8594);
    } else if (aio) {
      p.cooler.h = 0.07; p.cooler.w = 0.08; p.cooler.color = hex(0x20242b);
    }
    const nr = ram ? Math.min(4, ram.specs.modules) : 0;
    p.ram.forEach((r, i) => { r.hidden = !(mb && i < nr); if (ram) r.color = hex(RAM_COLORS[ram.brand] || 0x3b82f6); });
    p.gpu.hidden = !gpu || !mb;
    p.gpuLed.hidden = !gpu || !mb;
    if (gpu) {
      p.gpu.w = Math.max(0.3, Math.min(0.58, (gpu.specs.lengthMM || 250) / 600));
      p.gpu.h = gpu.specs.slots >= 3 ? 0.1 : 0.07;
      p.gpu.color = hex(GPU_COLORS[gpu.brand] || 0x23262d);
      p.gpuLed.w = p.gpu.w;
    }
    p.psu.hidden = !psu;
    p.cable.hidden = !psu || !mb;
    p.ssd.hidden = !(parts.ssd.length && mb);
    const nf = parts.fan.length + (cs ? Math.min(2, cs.specs.fansIncluded || 0) : 0);
    p.fans.forEach((f, i) => { f.hidden = !(cs && i < nf); });
    // Beleuchtung und Lüfter nur, wenn der PC läuft
    const on = running;
    const rgbFan = parts.fan.some((id) => get(id).specs.rgb);
    p.coolerFan.color = on ? hex(0x35e0ff) : hex(0x15181d);
    p.coolerFan.emissive = on ? 0.4 + 0.3 * Math.sin(time * 14) : 0;
    p.gpuLed.color = on ? col : hex(0x30181c);
    p.gpuLed.emissive = on ? 1.1 : 0;
    p.glow.color = on ? col : hex(0x1c2026);
    p.glow.emissive = on ? (rgbFan ? 1.4 : 0.6) : 0;
    p.fans.forEach((f, i) => { f.color = on ? (rgbFan ? col : hex(0x2a3038)) : hex(0x15181d); f.emissive = on && rgbFan ? 1.0 : 0; });
  }

  function updateAccentLights(time) {
    const lights = [];
    for (let i = 0; i < 3; i++) {
      if (state && state.screens[i]) {
        const sc = world.named.showcase[i];
        lights.push({ x: 7.0, y: 1.2, z: sc.z, radius: 2.6, r: 0.25, g: 0.5, b: 0.9 });
      }
    }
    if (benchRunning) {
      const c = hueRgb((time * 0.15) % 1);
      lights.push({ x: 0, y: 1.5, z: -3.2, radius: 3.4, r: c[0] * 0.9, g: c[1] * 0.9, b: c[2] * 0.9 });
    } else if (state && state.benchLed && !benchPc) {
      lights.push({ x: 0, y: 1.4, z: -3.3, radius: 2.6, r: 0.9, g: 0.2, b: 0.4 });
    }
    lights.push({ x: 5.9, y: 1.5, z: 2.9, radius: 2.4, r: 0.15, g: 0.45, b: 0.6 }); // Kassenbildschirm
    lights.push({ x: -4.5, y: 1.3, z: -5.0, radius: 2.4, r: 0.15, g: 0.45, b: 0.6 }); // Büro-Bildschirm
    renderer.accents = lights;
  }

  function updateWorldVisuals(dt, now) {
    const time = now / 1000;
    // Ausstellungs-PCs: RGB nur wenn der Bildschirm läuft
    for (let i = 0; i < 3; i++) {
      const sc = world.named.showcase[i];
      const on = state && state.screens[i];
      sc.strip.emissive = on ? 1.1 : 0;
      sc.strip.color = on ? hex(0x35e0ff) : hex(0x10242c);
      if (on) { const k = (Math.sin(time * 2 + i) + 1) / 2; sc.strip.color = [0.2 + 0.6 * k, 0.5, 1.0 - 0.5 * k]; }
    }
    // Werkbank-PC
    if (state) {
      if (benchPc && !state.pcs.includes(benchPc)) { benchPc = null; benchRunning = false; }
      applyBenchPc(benchPc, benchRunning, time);
      if (time - lastShelfUpdate > 0.5) { lastShelfUpdate = time; world.setShelfFill(Inventory.totalPieces() / Math.max(1, Inventory.capacity())); }
      // Lieferstapel zeigen, wenn Ware frisch geliefert wurde
      let fresh = 0;
      for (const o of state.orders) if (o.status === 'geliefert' && o.deliveredAt !== null && state.clock - o.deliveredAt < 90) fresh += o.lines.length;
      world.named.deliveries.forEach((pair, i) => { pair[0].hidden = pair[1].hidden = i >= Math.min(4, fresh); });
      world.named.officeScreen.emissive = 0.4 + 0.1 * Math.sin(time * 3);
    }
    // Kunden
    customerBoxes.length = 0;
    for (const c of Customers.list) {
      Customers.updateRig(c, time);
      for (const b of Customers.rigBoxes(c)) customerBoxes.push(b);
      // weicher Schatten unter der Figur
      let sh = c.shadow;
      if (!sh) sh = c.shadow = { x: 0, y: 0.012, z: 0, w: 0.55, h: 0.008, d: 0.4, rot: 0, color: hex(0x3d444e), emissive: 0, shine: 0, pat: 0 };
      sh.x = c.x; sh.z = c.z; sh.rot = c.yaw;
      customerBoxes.push(sh);
    }
    updateAccentLights(time);
  }

  // ---------- HUD ----------
  function updateHud() {
    if (!state) return;
    $('moneyValue').textContent = fmtMoney(state.money);
    const lvl = Progress.level(state);
    $('repValue').textContent = state.rep + ' · Stufe ' + lvl.level;
    $('dayValue').textContent = 'Tag ' + state.day + ' · ' + UI.clockText(Progress.dayTime(state)) + ' Uhr';
    const evToday = Progress.currentEvent(state);
    $('dayChip').title = evToday ? evToday.name + ': ' + evToday.desc : 'Tag und Uhrzeit';
    $('dayChip').classList.toggle('event', !!evToday);
    const ob = Procurement.openOrders(state).length + Jobs.active(state).length;
    $('officeBadge').textContent = String(ob);
    $('officeBadge').classList.toggle('hidden', ob === 0);
    // Tutorial
    const step = Tutorial.current(state);
    const showTut = !!step && mode === 'playing';
    $('tutorial').classList.toggle('hidden', !showTut);
    if (step) { $('tutTitle').textContent = step.title; $('tutText').textContent = step.text; }
    // Kunde an der Kasse
    const front = Customers.front();
    $('custChip').classList.toggle('hidden', !(front && mode === 'playing'));
    if (front) $('custChip').textContent = '🧑 Kunde wartet';
  }

  // ---------- Speichern ----------
  const SAVE_FIELDS = ['money', 'ledger', 'stats', 'txIds', 'inventory', 'reservations', 'rep', 'maxLevel', 'arrears', 'clock', 'playTime', 'upgrades',
    'debt', 'lastHelpDay', 'orders', 'nextOrderId', 'supplyUsed', 'pcs', 'nextPcId', 'draft', 'jobs', 'nextJobId', 'soldPcs', 'sales', 'reviews', 'salesStats', 'nextSaleId',
    'tutorial', 'achievements', 'counters', 'screens', 'benchLed', 'benchHintShown', 'player'];
  function saveGame() {
    if (!state) return false;
    const data = {};
    for (const k of SAVE_FIELDS) data[k] = state[k];
    return GameStorage.writeSave(data);
  }

  function restoreState(save) {
    const s = newState();
    for (const k of SAVE_FIELDS) if (k !== 'player' && k !== 'screens' && save[k] !== undefined) s[k] = save[k];
    if (typeof save.money === 'number') s.money = save.money;
    if (Array.isArray(save.screens)) s.screens = [0, 1, 2].map((i) => !!save.screens[i]);
    s.benchLed = !!save.benchLed;
    const p = save.player;
    if (p && isFinite(p.x) && isFinite(p.z) && isFinite(p.yaw) && isFinite(p.pitch)) {
      const b = world.bounds;
      s.player.x = Math.min(Math.max(p.x, b.minX), b.maxX);
      s.player.z = Math.min(Math.max(p.z, b.minZ), b.maxZ);
      s.player.yaw = p.yaw;
      s.player.pitch = Math.max(-1.3, Math.min(1.3, p.pitch));
      if (collides(s.player.x, s.player.z)) { s.player.x = world.start.x; s.player.z = world.start.z; }
    }
    return s;
  }

  // ---------- Kollision ----------
  function collides(x, z) {
    const b = world.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
    const r = PLAYER_RADIUS;
    for (const c of world.colliders) {
      if (c.group && !world.groupOn[c.group]) continue;
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  }

  function movePlayer(dt) {
    const p = state.player;
    const look = controls.consumeLook();
    p.yaw -= look.dyaw;
    p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - look.dpitch));
    const m = controls.getMove();
    if (m.x === 0 && m.y === 0) return;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const dx = (fx * m.y + rx * m.x) * WALK_SPEED * dt;
    const dz = (fz * m.y + rz * m.x) * WALK_SPEED * dt;
    if (!collides(p.x + dx, p.z)) p.x += dx;
    if (!collides(p.x, p.z + dz)) p.z += dz;
  }

  // ---------- Interaktion ----------
  function findTarget() {
    const p = state.player;
    let best = null;
    let bestD = Infinity;
    for (const it of world.interactables) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  function updatePrompt() {
    const t = findTarget();
    const label = t ? (t.id === 'counter' && Customers.front() ? 'Kasse bedienen – Kunde wartet!' : t.label) : null;
    if (t !== currentTarget || (t && $('prompt').textContent !== label)) {
      currentTarget = t;
      if (t) {
        $('prompt').textContent = label;
        show('prompt');
        show('useBtn');
      } else {
        hide('prompt');
        hide('useBtn');
      }
    }
  }

  function openInfo(title, text) {
    $('infoTitle').textContent = title;
    $('infoText').textContent = text;
    mode = 'info';
    controls.reset();
    show('infoPanel');
  }

  function leavePlaying() {
    controls.reset();
    hide('prompt');
    hide('useBtn');
    hide('tutorial');
    hide('custChip');
    currentTarget = null;
  }

  function interact() {
    if (mode !== 'playing' || !currentTarget) return;
    const id = currentTarget.id;
    if (id.startsWith('screen')) {
      const i = parseInt(id.slice(6), 10);
      state.screens[i] = !state.screens[i];
      applyWorldState();
      Sfx.play('toggle');
      toast(state.screens[i] ? 'Ausstellungs-PC eingeschaltet – das macht Kunden kaufbereiter' : 'Ausstellungs-PC ausgeschaltet', 'info');
    } else if (id === 'bench') {
      openBench();
    } else if (id === 'counter') {
      openCounter();
    } else if (id === 'shelf') {
      openOffice('shop');
    } else if (id === 'office') {
      openOffice('orders');
    }
  }

  // ---------- Panels ----------
  // Blendet beim Öffnen eines Vollbild-Fensters die Spielanzeige aus (sofort, nicht erst im nächsten Bild)
  function syncPanel() {
    document.body.classList.toggle('inpanel', mode === 'shop' || mode === 'bench' || mode === 'counter');
  }
  function openOffice(tab, itemId) {
    if (mode !== 'playing') return;
    if (!dataStatus.done) { toast('Hardwaredaten werden noch geladen …', 'info'); return; }
    leavePlaying();
    mode = 'shop';
    syncPanel();
    ShopUI.open(tab, itemId);
    Sfx.play('click');
  }
  function onOfficeClosed() {
    if (mode !== 'shop') return;
    mode = 'playing';
    syncPanel();
    controls.reset();
    updateHud();
    saveGame();
  }

  function openBench(pcId) {
    if (mode !== 'playing' && mode !== 'shop' && mode !== 'counter') return;
    if (!dataStatus.done) { toast('Hardwaredaten werden noch geladen …', 'info'); return; }
    if (mode === 'shop') ShopUI.close();
    if (mode === 'counter') CounterUI.close();
    leavePlaying();
    mode = 'bench';
    syncPanel();
    BenchUI.open(pcId ? 'pcs' : 'build', pcId);
  }
  function onBenchClosed() {
    if (mode !== 'bench') return;
    benchRunning = false;
    Sfx.stopFan();
    mode = 'playing';
    syncPanel();
    controls.reset();
    updateHud();
    saveGame();
  }

  function openCounter() {
    if (mode !== 'playing') return;
    leavePlaying();
    mode = 'counter';
    syncPanel();
    CounterUI.open();
  }
  function onCounterClosed() {
    if (mode !== 'counter') return;
    mode = 'playing';
    syncPanel();
    controls.reset();
    updateHud();
    saveGame();
  }

  // ---------- Ereignisse der Spielsysteme ----------
  function handleLevelUp(rep) {
    if (rep && rep.levelUp) {
      Sfx.play('levelUp');
      const unlocked = Procurement.SUPPLIERS.filter((s) => s.level === rep.levelUp.level).map((s) => s.short);
      toast('Ladenstufe ' + rep.levelUp.level + ': ' + rep.levelUp.name + '!' + (unlocked.length ? ' Neuer Lieferant: ' + unlocked.join(', ') + '.' : ''), 'info');
      applyWorldState();
    }
  }

  function handleDayEnd(ev) {
    Achievements.dayEnded(state, ev);
    pendingDays.push(ev);
    handleLevelUp(ev.repChange);
    showNextDay();
  }
  function showNextDay() {
    if (dayOpen || !pendingDays.length) return;
    if (mode === 'menu' || mode === 'paused') return;
    const ev = pendingDays.shift();
    dayOpen = true;
    controls.reset();
    $('dayTitle').textContent = 'Tagesabschluss – Tag ' + ev.day;
    const body = $('dayBody');
    UI.clear(body);
    const row = (a, b, cls) => { const r = UI.h('div', 'frow'); r.appendChild(UI.h('span', '', a)); r.appendChild(UI.h('b', cls || '', b)); body.appendChild(r); };
    row('Einnahmen', UI.eur(ev.income), 'plus');
    row('Ausgaben (Einkauf u. a.)', UI.eur(ev.expense), 'minus');
    row('Miete & Nebenkosten', '−' + UI.eur(ev.paid), 'minus');
    if (ev.loanPaid > 0) row('Kreditrate', '−' + UI.eur(ev.loanPaid), 'minus');
    const profit = Economy.round2(ev.income - ev.expense - ev.paid - (ev.loanPaid || 0));
    row('Ergebnis des Tages', (profit >= 0 ? '+' : '') + UI.eur(profit), profit >= 0 ? 'plus' : 'minus');
    row('Kontostand', UI.eur(state.money));
    row('Ruf', '★ ' + state.rep + ' · ' + Progress.level(state).name);
    if (ev.shortfall > 0) body.appendChild(UI.h('div', 'msg err', 'Die Miete konnte nicht vollständig bezahlt werden. Rückstand: ' + UI.eur(state.arrears) + '. Dein Ruf sinkt, bis du ihn bezahlst (Büro → Finanzen).'));
    const open = Procurement.openOrders(state).length;
    const jobs = Jobs.active(state).length;
    if (Progress.isStranded(state)) body.appendChild(UI.h('div', 'msg err', 'Du steckst fest: kein Geld, keine Ware, keine PCs. Im Büro unter „Finanzen“ gibt es einen Kleinkredit oder Familienhilfe.'));
    const nxt = Progress.eventForDay(ev.day + 1);
    if (nxt) body.appendChild(UI.h('div', 'msg info', 'Morgen: ' + nxt.name + ' – ' + nxt.desc));
    body.appendChild(UI.h('p', 'small', 'Offene Bestellungen: ' + open + ' · Laufende Aufträge: ' + jobs + '. Ein neuer Tag beginnt.'));
    show('dayPanel');
    Sfx.play('coin');
    saveGame();
  }

  // Ziele prüfen und neue Erfolge melden
  function checkGoals() {
    for (const f of Achievements.check(state)) {
      toast('Ziel erreicht: ' + f.a.name + (f.a.money ? ' (+' + UI.eur(f.a.money) + ')' : '') + (f.a.rep ? ' (Ruf +' + f.a.rep + ')' : ''), 'info');
      Sfx.play('levelUp');
      handleLevelUp(f.rep);
    }
  }

  // Spielzeit voranbringen: Tage, Lieferungen, Aufträge, Kunden
  function advance(dt) {
    const s = state;
    for (const ev of Progress.tick(s, dt)) handleDayEnd(ev);
    const delivered = Procurement.tick(s);
    for (const o of delivered) {
      const sup = Procurement.supplier(o.supplier);
      const n = o.lines.reduce((a, l) => a + l.qty, 0);
      toast('Lieferung #' + o.id + ' von ' + sup.short + ' ist da (' + n + ' Teile)', 'ok');
      Sfx.play('delivery');
      Tutorial.event(s, 'delivered');
      Achievements.count(s, 'deliveries');
    }
    if (delivered.length) { saveGame(); if (ShopUI.isOpen()) ShopUI.refresh(); if (BenchUI.isOpen()) BenchUI.refresh(); }
    for (const ev of Jobs.tick(s)) {
      if (ev.type === 'expired') {
        toast('Auftrag verpasst: ' + ev.job.title + ' (Ruf ' + ev.rep.delta + ')', 'err');
        Sfx.play('error');
        if (ShopUI.isOpen()) ShopUI.refresh();
      } else if (ev.type === 'reserved') {
        toast('Vorbestellung zurückgelegt: ' + HardwareDB.get(ev.job.itemId).name, 'info');
      }
    }
    const events = Customers.tick(s, dt, { open: Progress.dayTime(s) < Progress.DAY_SECONDS * 0.85, servingId: mode === 'counter' ? CounterUI.servingId() : null });
    let counterChanged = false;
    for (const e of events) {
      if (e.type === 'arrived') Sfx.play('door');
      else if (e.type === 'atCounter') { toast(e.c.name + ' wartet an der Kasse', 'info'); counterChanged = true; }
      else if (e.type === 'timeout') { toast(e.c.name + ' ist genervt gegangen' + (e.rep ? ' (Ruf ' + e.rep.delta + ')' : ''), 'err'); counterChanged = true; handleLevelUp(e.rep); }
      else if (e.type === 'crowded') toast('Ein Kunde ist wegen der Schlange wieder gegangen', 'info');
      else if (e.type === 'left') counterChanged = counterChanged || mode === 'counter';
    }
    if (counterChanged && CounterUI.isOpen()) CounterUI.refresh();
  }

  // ---------- Menüs ----------
  function refreshMainMenu() {
    const save = GameStorage.loadSave();
    const cont = $('continueBtn');
    if (save) {
      cont.classList.remove('hidden');
      const d = new Date(save.savedAt || Date.now());
      $('saveInfo').textContent = (save.recovered ? 'Sicherungskopie gefunden: ' : 'Gespeichert: ') + d.toLocaleString('de-DE') + ' · ' + fmtMoney(save.money) + ' €';
    } else {
      cont.classList.add('hidden');
      $('saveInfo').textContent = 'Noch kein Spielstand.';
    }
    $('saveInfo').textContent += offlineReady ? ' · Offline bereit ✓' : ' · Offline-Modus wird vorbereitet …';
    $('storageWarn').classList.toggle('hidden', GameStorage.isPersistent());
    const warn = $('dataWarn');
    if (dataStatus.done && (dataStatus.missing.length || dataStatus.loaded === 0)) {
      warn.textContent = 'Hardwaredaten unvollständig geladen (' + dataStatus.loaded + ' Produkte). Fehlende Dateien: ' + (dataStatus.missing.join(', ') || 'alle') + '. Der Shop zeigt nur, was geladen wurde.';
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  }

  function startGame(fromSave) {
    Sfx.unlock();
    const save = fromSave ? GameStorage.loadSave() : null;
    state = save ? restoreState(save) : newState();
    bindSystems();
    Customers.reset();
    pendingDays.length = 0;
    dayOpen = false;
    hide('dayPanel');
    benchPc = null;
    benchRunning = false;
    OfficeUI.resetPick();
    applyWorldState();
    updateHud();
    currentTarget = null;
    hide('prompt');
    hide('useBtn');
    ShopUI.close();
    BenchUI.close();
    CounterUI.close();
    hide('mainMenu');
    hide('pauseMenu');
    hide('settingsMenu');
    hide('infoPanel');
    show('hud');
    controls.reset();
    mode = 'playing';
    updateHud();
    autosaveTimer = 0;
    if (!save) saveGame();
    toast(save ? 'Spielstand geladen' : 'Willkommen in deinem Laden!', 'ok');
    const evNow = Progress.currentEvent(state);
    if (evNow) toast('Heute: ' + evNow.name + ' – ' + evNow.desc, 'info');
  }

  // Das Spiel erst starten, wenn die Hardwaredaten geladen sind (sonst würden Teile aus dem Spielstand als unbekannt verworfen)
  let dataPromise = Promise.resolve();
  function startAfterData(fromSave) {
    dataPromise.then(() => {
      if (fromSave && !HardwareDB.complete()) {
        toast('Hardwaredaten fehlen – dein Spielstand bleibt unverändert. Bitte Seite neu laden.', 'err');
        return;
      }
      startGame(fromSave);
    });
  }

  function pauseGame() {
    if (mode !== 'playing' && mode !== 'info') return;
    controls.reset();
    saveGame();
    mode = 'paused';
    hide('infoPanel');
    $('saveMsg').textContent = '';
    show('pauseMenu');
  }

  function resumeGame() {
    hide('pauseMenu');
    hide('settingsMenu');
    controls.reset();
    mode = 'playing';
    showNextDay();
  }

  let helpReturn = 'mainMenu';
  function openHelp(from) {
    helpReturn = from;
    hide(from);
    show('helpMenu');
    $('helpMenu').querySelector('.card').scrollTop = 0;
  }

  let settingsReturn = 'mainMenu';
  function openSettings(from) {
    settingsReturn = from;
    hide(from);
    $('setSens').value = settings.sensitivity;
    $('setInvert').checked = !!settings.invertY;
    $('setQuality').value = settings.quality;
    $('setSound').checked = !!settings.sound;
    $('setVolume').value = settings.volume;
    $('settingsMsg').textContent = '';
    $('saveText').value = '';
    $('tutRestart').classList.toggle('hidden', !state);
    show('settingsMenu');
  }
  function closeSettings() {
    hide('settingsMenu');
    show(settingsReturn);
  }
  function saveSettings() {
    settings.sensitivity = parseInt($('setSens').value, 10);
    settings.invertY = $('setInvert').checked;
    settings.quality = $('setQuality').value;
    settings.sound = $('setSound').checked;
    settings.volume = parseInt($('setVolume').value, 10);
    GameStorage.writeSettings(settings);
    applySettings();
  }

  function bindUi() {
    $('newBtn').addEventListener('click', () => {
      if (GameStorage.loadSave()) {
        UI.confirm('Neues Spiel starten? Dein gespeicherter Spielstand wird überschrieben.', 'Neues Spiel', () => { GameStorage.deleteSave(); startAfterData(false); });
        return;
      }
      startAfterData(false);
    });
    $('continueBtn').addEventListener('click', () => startAfterData(true));
    $('mainSettingsBtn').addEventListener('click', () => openSettings('mainMenu'));
    $('pauseBtn').addEventListener('click', () => pauseGame());
    $('resumeBtn').addEventListener('click', resumeGame);
    $('saveBtn').addEventListener('click', () => {
      const ok = saveGame();
      $('saveMsg').textContent = ok ? 'Gespeichert ✓' : 'Speichern nicht möglich (Browser blockiert Speicher).';
    });
    $('pauseSettingsBtn').addEventListener('click', () => openSettings('pauseMenu'));
    $('toMenuBtn').addEventListener('click', () => {
      saveGame();
      hide('pauseMenu');
      hide('hud');
      mode = 'menu';
      Sfx.stopFan();
      refreshMainMenu();
      show('mainMenu');
    });
    $('infoClose').addEventListener('click', () => {
      hide('infoPanel');
      controls.reset();
      mode = 'playing';
    });
    $('useBtn').addEventListener('click', interact);
    $('shopBtn').addEventListener('click', () => openOffice('shop'));
    $('stockBtn').addEventListener('click', () => openOffice('stock'));
    $('officeBtn').addEventListener('click', () => openOffice('orders'));
    $('custChip').addEventListener('click', openCounter);
    $('tutSkip').addEventListener('click', () => { Tutorial.skip(state); updateHud(); saveGame(); toast('Tutorial übersprungen. Du findest es in den Einstellungen wieder.', 'info'); });
    $('tutRestart').addEventListener('click', () => { if (!state) return; Tutorial.restart(state); $('settingsMsg').textContent = 'Tutorial startet neu.'; saveGame(); });
    $('dayClose').addEventListener('click', () => {
      hide('dayPanel');
      dayOpen = false;
      showNextDay();
    });
    $('settingsBack').addEventListener('click', closeSettings);
    $('mainHelpBtn').addEventListener('click', () => openHelp('mainMenu'));
    $('pauseHelpBtn').addEventListener('click', () => openHelp('pauseMenu'));
    $('helpBack').addEventListener('click', () => { hide('helpMenu'); show(helpReturn); });
    for (const id of ['setSens', 'setInvert', 'setQuality', 'setSound', 'setVolume']) {
      $(id).addEventListener('change', saveSettings);
    }
    $('exportBtn').addEventListener('click', () => {
      if (state) saveGame();
      const t = GameStorage.exportSave();
      $('saveText').value = t;
      $('settingsMsg').textContent = t ? 'Text markieren und kopieren.' : 'Es gibt noch keinen Spielstand.';
      if (t) { $('saveText').focus(); $('saveText').select(); }
    });
    $('importBtn').addEventListener('click', () => {
      const ok = GameStorage.importSave($('saveText').value.trim());
      $('settingsMsg').textContent = ok ? 'Spielstand geladen. Im Hauptmenü „Weiterspielen“ wählen.' : 'Der Text ist kein gültiger Spielstand.';
      if (ok) refreshMainMenu();
    });
  }

  // ---------- Hauptschleife ----------
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    renderer.resize();
    syncPanel();

    if (state && (mode === 'playing' || TIME_MODES.includes(mode))) {
      if (mode === 'playing') {
        movePlayer(dt);
        updatePrompt();
      }
      if (!dayOpen) {
        state.playTime += dt;
        advance(dt);
        autosaveTimer += dt;
        if (autosaveTimer >= AUTOSAVE_SECONDS) {
          autosaveTimer = 0;
          saveGame();
        }
      }
      ShopUI.tick(dt);
      hudTimer += dt;
      if (hudTimer > 0.25) { hudTimer = 0; updateHud(); }
      goalTimer += dt;
      if (goalTimer > 1) { goalTimer = 0; checkGoals(); }
    }
    if (state) updateWorldVisuals(dt, now);
    else customerBoxes.length = 0;

    const p = state ? state.player : { x: world.start.x, z: world.start.z, yaw: Math.sin(now / 6000) * 0.5, pitch: 0 };
    renderer.render({ x: p.x, y: EYE_HEIGHT, z: p.z, yaw: p.yaw, pitch: p.pitch }, world.boxes, customerBoxes, now / 1000);
  }

  // Lädt die Hardwaredaten (data-*.json). Fehlende oder fehlerhafte Dateien führen nur zu Hinweisen, das Spiel startet trotzdem.
  function loadHardwareData() {
    return HardwareDB.loadFromFiles((url) => fetch(url))
      .then((r) => {
        dataStatus = { loaded: r.loaded, warnings: r.warnings, missing: r.missing || [], done: true };
        if (r.warnings.length) console.warn('Hardwaredaten:', r.warnings.join(' | '));
      })
      .catch((e) => {
        dataStatus = { loaded: 0, warnings: [String(e)], missing: HardwareDB.CATEGORIES.slice(), done: true };
      })
      .then(() => {
        if (mode === 'menu') refreshMainMenu();
      });
  }

  // ---------- Start ----------
  function init() {
    try {
      renderer = new Renderer($('view'));
      world = buildWorld();
      for (const sg of world.signs) renderer.addSign(sg);
      // Grafik wurde vom Browser verworfen und ist wieder da: Stand sichern und die Seite neu laden (einfachster sicherer Weg)
      renderer.onContextRestored = () => { if (state) saveGame(); location.reload(); };
      Sfx.init(() => settings);
      Inventory.setCapacityFn(Progress.storageCapacity);
      controls = new Controls({
        joyZone: $('joyZone'),
        lookZone: $('lookZone'),
        joyBase: $('joyBase'),
        joyKnob: $('joyKnob'),
        onInteract: interact,
      });
      applySettings();
      bindUi();
      ShopUI.init({
        getState: () => state,
        onClose: onOfficeClosed,
        onShopOpened() { Tutorial.event(state, 'shopOpened'); updateHud(); },
        onOrder(result) {
          Tutorial.event(state, 'orderPlaced');
          updateHud(); saveGame(); Sfx.play('buy');
        },
        onFailure() { Sfx.play('error'); },
        onChangeMoney() { updateHud(); saveGame(); },
        onJobDone(r) {
          updateHud(); saveGame(); Sfx.play('sale'); Tutorial.event(state, 'sold'); handleLevelUp(r.rep);
          if (r.job.kind === 'repair') Achievements.count(state, 'repairs');
        },
        onUpgrade() { updateHud(); applyWorldState(); saveGame(); Sfx.play('levelUp'); Tutorial.event(state, 'upgraded'); },
        openBench: (pcId) => openBench(pcId),
      });
      BenchUI.init({
        getState: () => state,
        onClose: onBenchClosed,
        onBuilt() { Achievements.count(state, 'built'); Tutorial.event(state, 'pcBuilt'); updateHud(); saveGame(); Sfx.play('ok'); },
        onTested(pc, res) {
          Tutorial.event(state, 'pcTested');
          if (res.ok && pc.origin !== 'kunde') Achievements.count(state, 'testedOk');
          benchPc = pc;
          saveGame();
        },
        onChange() { updateHud(); saveGame(); },
        onRunning(on, pc) {
          benchRunning = !!on;
          if (pc) benchPc = pc;
          if (on) Sfx.startFan(); else Sfx.stopFan();
        },
        onSelect(pc) { if (pc && benchPc !== pc && !benchRunning) benchPc = pc; },
        onFailure() { Sfx.play('error'); },
        openShop(slot) {
          BenchUI.close(); benchRunning = false; Sfx.stopFan(); mode = 'playing'; openOffice('shop');
        },
        openJobs() {
          BenchUI.close(); mode = 'playing'; benchRunning = false; Sfx.stopFan(); openOffice('jobs');
        },
      });
      CounterUI.init({
        getState: () => state,
        onClose: onCounterClosed,
        onSold(r) {
          updateHud(); saveGame();
          if (r) { Sfx.play('sale'); Tutorial.event(state, 'sold'); handleLevelUp(r.rep); }
          else Sfx.play('coin');
        },
        onJobAccepted() { updateHud(); saveGame(); Sfx.play('ok'); },
        onChange() { updateHud(); saveGame(); },
        onFailure() { Sfx.play('error'); },
        openShop(itemId) { CounterUI.close(); mode = 'playing'; openOffice('shop', itemId); },
        openBench() { CounterUI.close(); mode = 'playing'; openBench(); },
      });
      dataPromise = loadHardwareData();
      refreshMainMenu();
      state = null;
      for (let i = 0; i < 3; i++) world.named['screen' + i].color = hex(0x0a0c10);
      applyBenchPc(null, false, 0);
      requestAnimationFrame(frame);
    } catch (err) {
      $('fatalText').textContent = String(err && err.message ? err.message : err);
      show('fatal');
      hide('mainMenu');
    }
  }

  // App wird verlassen oder unterbrochen: sicher speichern und pausieren
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (mode === 'playing' || mode === 'info') pauseGame();
    else if (mode === 'shop' || mode === 'bench' || mode === 'counter') saveGame();
  });
  window.addEventListener('pagehide', () => {
    if (state) saveGame();
  });
  window.addEventListener('orientationchange', () => setTimeout(() => renderer && renderer.resize(), 250));
  window.addEventListener('resize', () => renderer && renderer.resize());
  window.addEventListener('blur', () => {
    if (mode === 'playing') pauseGame();
  });

  // Doppeltippen-Zoom und Pinch-Gesten in Safari unterbinden
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Service Worker: macht das Spiel offline startbar
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.ready.then(() => {
        offlineReady = true;
        if (mode === 'menu') refreshMainMenu();
      });
    });
  }

  init();

  // Schnittstelle für automatische Tests (Browser-Testlauf); hat keinen Einfluss auf das Spiel
  window.CST = {
    state: () => state,
    mode: () => mode,
    advance: (sec) => { if (state) { for (let t = 0; t < sec; t += 0.5) advance(Math.min(0.5, sec - t)); } },
    openOffice, openBench, openCounter,
    startGame,
    save: saveGame,
    dataReady: () => dataStatus.done,
    benchPc: () => benchPc,
    setBench: (pc, running) => { benchPc = pc; benchRunning = !!running; },
    draws: () => renderer.drawCalls,
  };
})();
