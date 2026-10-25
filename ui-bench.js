// ui-bench.js – Werkbank: PC zusammenbauen (mit Kompatibilitätsprüfung), starten, testen, reparieren.
// Zeigt nur an und ruft Builder/Sim auf; die Regeln liegen in builder.js und sim.js.
'use strict';

const BenchUI = (() => {
  const { h, eur, duration, bar, chip, clear, icon, SUMMARY } = UI;
  let els = null;
  let cb = { getState: () => null, onClose() {}, onBuilt() {}, onTested() {}, onChange() {}, onRunning() {}, onSelect() {}, openShop() {}, openJobs() {}, onFailure() {} };
  let tab = 'build'; // 'build' | 'pcs'
  let chooser = null; // { mode: 'draft' | 'swap', slot, pcId?, oldId? }
  let selectedPc = null;
  let message = null;
  let anim = null; // laufende Testanimation { timers: [], pcId }
  let pcName = '';

  const S = () => cb.getState();
  const slotName = (slot) => Builder.SLOT_NAMES[slot];
  function setMessage(kind, text) { message = text ? { kind, text } : null; }
  function msgBox() { return message ? h('div', 'msg ' + message.kind, message.text) : null; }

  // Beendet eine laufende Testanimation sofort (Ergebnis wird trotzdem gewertet)
  function cancelAnim() {
    if (!anim) return;
    const a = anim;
    a.timers.forEach(clearTimeout);
    if (a.finish) a.finish();
    else { anim = null; cb.onRunning(false); }
  }

  // ---------- Gemeinsame Teile ----------
  function partName(id) { const it = HardwareDB.get(id); return it ? it.name : id; }

  function checkBox(res, opts) {
    const box = h('div', 'checkbox');
    if (!res.errors.length && !res.warnings.length && !res.missing.length) {
      box.appendChild(h('div', 'chk ok', '✓ Alles passt zusammen und der PC ist vollständig.'));
    }
    for (const e of res.errors) box.appendChild(h('div', 'chk err', '✗ ' + e));
    for (const w of res.warnings) box.appendChild(h('div', 'chk warn', '⚠ ' + w));
    if (res.missing.length) {
      const names = res.missing.map((m) => slotName(m)).join(', ');
      box.appendChild(h('div', 'chk info', 'ℹ Es fehlt noch: ' + names + '. Ohne diese Teile startet der PC nicht.'));
    }
    return box;
  }

  function powerBar(res, parts) {
    const psu = parts.psu ? HardwareDB.get(parts.psu) : null;
    const wrap = h('div', 'powerbar');
    if (psu) {
      const pct = Math.round((res.power / psu.specs.wattage) * 100);
      wrap.appendChild(h('div', 'c2-line', 'Geschätzter Strombedarf: ' + res.power + ' W von ' + psu.specs.wattage + ' W (' + pct + ' %)'));
      wrap.appendChild(bar(pct, pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'good'));
    } else {
      wrap.appendChild(h('div', 'c2-line', 'Geschätzter Strombedarf: ' + res.power + ' W (noch kein Netzteil gewählt)'));
    }
    return wrap;
  }

  // ---------- Auswahlliste ----------
  function renderChooser(el) {
    const s = S();
    const slot = chooser.slot;
    const wrap = h('div', 'chooser');
    const head = h('div', 'c2-head');
    head.appendChild(h('b', '', slotName(slot) + (chooser.mode === 'swap' ? ' ersetzen' : ' wählen')));
    const cancel = h('button', 'btn small ghost', 'Abbrechen');
    cancel.addEventListener('click', () => { chooser = null; render(); });
    head.appendChild(cancel);
    wrap.appendChild(head);
    let base;
    if (chooser.mode === 'swap') {
      const pc = s.pcs.find((p) => p.id === chooser.pcId);
      base = Builder.cleanParts(pc.parts);
      if (Builder.MULTI_SLOTS[slot]) { const i = base[slot].indexOf(chooser.oldId); if (i >= 0) base[slot].splice(i, 1); }
      else base[slot] = null;
    } else {
      base = Builder.cleanParts(s.draft);
    }
    // schon im Entwurf verwendete Stücke zählen
    const usedInDraft = {};
    if (chooser.mode === 'draft') for (const { id } of Builder.partList(base)) usedInDraft[id] = (usedInDraft[id] || 0) + 1;
    const rows = Inventory.byCategory(slot).filter((r) => r.item.category === slot);
    if (!rows.length) {
      const e = h('div', 'empty', 'Im Lager liegt kein Teil dieser Art. Bestelle es im Einkauf.');
      const b = h('button', 'btn primary', 'Zum Einkauf');
      b.addEventListener('click', () => cb.openShop(slot));
      e.appendChild(b);
      wrap.appendChild(e);
    }
    rows.sort((a, b) => a.item.buyPrice - b.item.buyPrice);
    for (const r of rows) {
      const it = r.item;
      const freeCount = Inventory.available(it.id) - (usedInDraft[it.id] || 0);
      const comp = Builder.checkAdd(base, slot, it.id);
      const ok = comp.ok && freeCount >= 1;
      const row = h('button', 'row-item' + (ok ? '' : ' dim'));
      row.appendChild(icon(it, 'row-ico'));
      const main = h('div', 'row-main');
      main.appendChild(h('div', 'row-name', it.name));
      main.appendChild(h('div', 'row-sub', SUMMARY[it.category](it.specs)));
      if (!comp.ok) main.appendChild(h('div', 'row-why', '✗ ' + comp.reason));
      else if (freeCount < 1) main.appendChild(h('div', 'row-why', 'Schon verplant oder reserviert'));
      row.appendChild(main);
      row.appendChild(h('div', 'row-side', freeCount + '× frei'));
      row.addEventListener('click', () => {
        if (!ok) { UI.notify(!comp.ok ? comp.reason : 'Nicht mehr frei.', 'err'); cb.onFailure(); return; }
        pickPart(it.id);
      });
      wrap.appendChild(row);
    }
    el.appendChild(wrap);
  }

  function pickPart(id) {
    const s = S();
    if (chooser.mode === 'draft') {
      const d = Builder.cleanParts(s.draft);
      if (Builder.MULTI_SLOTS[chooser.slot]) d[chooser.slot].push(id);
      else d[chooser.slot] = id;
      s.draft = d;
      setMessage(null);
      chooser = null;
      cb.onChange();
      render();
    } else {
      const r = Builder.swapPart(s, chooser.pcId, chooser.slot, id, chooser.oldId);
      if (r.ok) {
        setMessage('ok', '✓ ' + partName(id) + ' eingebaut.' + (r.old ? ' Das alte Teil (' + partName(r.old) + ') wurde ' + (r.scrapped ? 'entsorgt (defekt).' : 'ausgebaut.') : ''));
        UI.sound('ok');
      } else { setMessage('err', '✗ ' + r.message); cb.onFailure(r); }
      chooser = null;
      cb.onChange();
      render();
    }
  }

  // ---------- Reiter: Zusammenbauen ----------
  function renderBuild(el) {
    const s = S();
    const draft = Builder.cleanParts(s.draft);
    s.draft = draft;
    const res = Builder.check(draft);
    const intro = h('div', 'c2-line dim', 'Wähle Bauteile aus deinem Lager. Unverträgliche Teile werden gesperrt und erklärt. Beim Zusammenbauen werden die Teile aus dem Lager entnommen.');
    el.appendChild(intro);
    if (Inventory.totalPieces() === 0 && !Builder.partList(draft).length) {
      const e = h('div', 'empty', 'Dein Lager ist leer. Bestelle Teile im Einkauf – oder nimm ein fertiges Starter-Set.');
      const b = h('button', 'btn primary', 'Zum Einkauf');
      b.addEventListener('click', () => cb.openShop());
      e.appendChild(b);
      el.appendChild(e);
    }
    const mb = msgBox();
    if (mb) el.appendChild(mb);
    const auto = h('button', 'btn small', '✨ Passende Teile aus dem Lager vorschlagen');
    auto.addEventListener('click', () => {
      const r = Builder.autoFill(s.draft);
      s.draft = r.parts;
      if (!r.added.length) setMessage('info', 'ℹ Es wurde nichts ergänzt. Entweder ist alles gewählt, oder es passt nichts mehr aus dem Lager.' + (r.missing.length ? ' Es fehlt: ' + r.missing.map(slotName).join(', ') + '.' : ''));
      else setMessage(r.missing.length ? 'info' : 'ok', (r.missing.length ? 'ℹ ' : '✓ ') + r.added.length + ' Teile ergänzt.' + (r.missing.length ? ' Dazu passt im Lager nichts für: ' + r.missing.map(slotName).join(', ') + '.' : ' Prüfe das Ergebnis und baue den PC zusammen.'));
      UI.sound('ok');
      cb.onChange();
      render();
    });
    el.appendChild(auto);
    const slots = h('div', 'slots');
    for (const slot of Builder.SLOT_ORDER) {
      const multi = Builder.MULTI_SLOTS[slot];
      const ids = multi ? draft[slot] : (draft[slot] ? [draft[slot]] : []);
      const row = h('div', 'slot' + (ids.length ? ' filled' : ''));
      row.appendChild(h('div', 'slot-name', slotName(slot)));
      const body = h('div', 'slot-body');
      for (const id of ids) {
        const it = HardwareDB.get(id);
        const line = h('div', 'slot-part');
        line.appendChild(h('span', '', it.name));
        const short = Inventory.available(id) < ids.filter((x) => x === id).length;
        if (short) line.appendChild(h('small', 'bad', ' nicht mehr im Lager'));
        const x = h('button', 'xbtn', '✕'); x.setAttribute('aria-label', 'Entfernen');
        x.addEventListener('click', () => {
          const d = Builder.cleanParts(s.draft);
          if (multi) d[slot].splice(d[slot].indexOf(id), 1); else d[slot] = null;
          s.draft = d; setMessage(null); cb.onChange(); render();
        });
        line.appendChild(x);
        body.appendChild(line);
      }
      const canAdd = multi ? ids.length < multi : !ids.length;
      if (canAdd) {
        const n = Inventory.byCategory(slot).reduce((a, r) => a + r.count, 0);
        const b = h('button', 'btn small', n ? (multi && ids.length ? '+ weiteres wählen' : 'Wählen') + ' (' + n + ' im Lager)' : 'Kein Teil im Lager');
        b.addEventListener('click', () => { chooser = { mode: 'draft', slot }; setMessage(null); render(); });
        body.appendChild(b);
      }
      row.appendChild(body);
      slots.appendChild(row);
    }
    el.appendChild(slots);
    el.appendChild(checkBox(res));
    el.appendChild(powerBar(res, draft));
    const cost = Builder.cost(draft);
    if (cost > 0) {
      const info = h('div', 'sumline');
      info.appendChild(h('span', '', 'Teilekosten: ' + eur(cost)));
      info.appendChild(h('span', '', 'Empf. Verkaufspreis: ' + eur(Builder.suggestedPrice(draft))));
      el.appendChild(info);
    }
    const name = h('input', 'nameinput'); name.type = 'text'; name.maxLength = 30; name.placeholder = 'Name des PCs (optional)'; name.value = pcName;
    name.setAttribute('aria-label', 'Name des PCs');
    name.addEventListener('input', () => { pcName = name.value; });
    el.appendChild(name);
    const parts = Builder.partList(draft);
    const buildBtn = h('button', 'buy-btn', 'PC zusammenbauen');
    const short = Builder.shortages(draft);
    const blocked = !parts.length || res.errors.length || !draft.case || !draft.mainboard || short.length;
    buildBtn.disabled = !!blocked;
    buildBtn.classList.toggle('disabled', !!blocked);
    if (blocked) {
      buildBtn.textContent = !parts.length ? 'Wähle zuerst Bauteile' : res.errors.length ? 'Unverträgliche Teile – Zusammenbau gesperrt' : !draft.case || !draft.mainboard ? 'Gehäuse und Mainboard sind nötig' : 'Teile fehlen im Lager';
    }
    buildBtn.addEventListener('click', () => {
      const r = Builder.assemble(s, draft, pcName);
      if (r.ok) {
        s.draft = Builder.emptyParts();
        pcName = '';
        setMessage('ok', '✓ „' + r.pc.name + '“ ist zusammengebaut. Starte ihn unter „Meine PCs“, um ihn zu testen.');
        selectedPc = r.pc.id;
        cb.onBuilt(r.pc);
        tab = 'pcs';
      } else { setMessage('err', '✗ ' + r.message); cb.onFailure(r); }
      cb.onChange();
      render();
    });
    el.appendChild(buildBtn);
    if (parts.length) {
      const clr = h('button', 'btn small ghost', 'Auswahl leeren');
      clr.addEventListener('click', () => { s.draft = Builder.emptyParts(); setMessage(null); cb.onChange(); render(); });
      el.appendChild(clr);
    }
  }

  // ---------- Reiter: Meine PCs ----------
  function pcStatus(pc) {
    if (anim && anim.pcId === pc.id) return ['Test läuft …', 'st-bestellt'];
    if (pc.origin === 'kunde' && !pc.report) return ['Kundenauftrag', 'st-bestellt'];
    if (!pc.report) return ['Ungetestet', 'st-wartet'];
    if (!pc.report.bootOk) return ['Startet nicht', 'st-storniert'];
    if (!pc.report.ok) return ['Absturz unter Last', 'st-storniert'];
    return ['Läuft · Wert ' + pc.report.bench.total, 'st-geliefert'];
  }

  function reportView(pc, live) {
    const rep = pc.report;
    const wrap = h('div', 'report');
    if (!rep) { wrap.appendChild(h('div', 'c2-line dim', 'Noch kein Testbericht. Starte den PC, um ihn zu prüfen.')); return wrap; }
    wrap.appendChild(h('div', 'subhead', 'Startvorgang'));
    const steps = live != null ? rep.steps.slice(0, live) : rep.steps;
    for (const st of steps) wrap.appendChild(h('div', 'chk ' + (st.status === 'ok' ? 'ok' : st.status === 'warn' ? 'warn' : 'err'), (st.status === 'ok' ? '✓ ' : st.status === 'warn' ? '⚠ ' : '✗ ') + st.text));
    if (live != null && live < rep.steps.length) { wrap.appendChild(h('div', 'chk info', '… Startvorgang läuft'));
      return wrap; }
    if (!rep.bootOk) {
      wrap.appendChild(h('div', 'chk info', 'Der PC startet nicht. Prüfe das Teil, das im letzten Schritt gemeldet wird, und teste erneut.'));
      return wrap;
    }
    const b = rep.bench;
    wrap.appendChild(h('div', 'subhead', 'Benchmark (Spielsimulation)'));
    const rowBar = (label, value, max, text) => {
      const r = h('div', 'brow');
      r.appendChild(h('span', 'bl', label));
      r.appendChild(bar((value / max) * 100, value / max > 0.7 ? 'good' : value / max > 0.4 ? 'warn' : 'bad'));
      r.appendChild(h('b', '', text || String(value)));
      return r;
    };
    wrap.appendChild(rowBar('Gaming', b.gaming, 100, b.gaming + ' (≈ ' + b.fps + ' FPS)'));
    wrap.appendChild(rowBar('Büro / Kreativ', b.office, 100));
    wrap.appendChild(rowBar('Gesamtwert', b.total, 100));
    wrap.appendChild(rowBar('Speicher', b.storageScore, 100, b.storageScore + ' · ' + UI.storageText(b.totalStorageGB)));
    const t = h('div', 'tiles');
    const tile = (label, value, cls) => { const e = h('div', 'tile ' + (cls || '')); e.appendChild(h('span', '', label)); e.appendChild(h('b', '', value)); return e; };
    t.appendChild(tile('CPU-Temperatur', b.cpuTemp + ' °C', b.cpuTemp > 90 ? 'minus' : b.cpuTemp > 80 ? '' : 'plus'));
    if (b.gpuTemp !== null) t.appendChild(tile('GPU-Temperatur', b.gpuTemp + ' °C', b.gpuTemp > 85 ? 'minus' : ''));
    t.appendChild(tile('Leerlauf', b.idleW + ' W'));
    t.appendChild(tile('Volllast', b.loadW + ' W (' + b.psuLoadPct + ' % vom Netzteil)', b.psuLoadPct > 100 ? 'minus' : ''));
    t.appendChild(tile('Takt-Drosselung', b.throttle < 100 ? 'auf ' + b.throttle + ' %' : 'keine', b.throttle < 100 ? 'minus' : 'plus'));
    wrap.appendChild(t);
    if (b.crash) wrap.appendChild(h('div', 'chk err', '✗ Absturz unter Volllast: Das Netzteil reicht nicht aus.'));
    for (const n of b.notes) wrap.appendChild(h('div', 'chk warn', '⚠ ' + n));
    wrap.appendChild(h('div', 'pricenote', b.label + '. Alle Werte sind Spielwerte und keine Messungen echter Hardware.'));
    return wrap;
  }

  function partsList(pc, s) {
    const wrap = h('div', 'pcparts');
    const tester = Progress.hasTester(s);
    const probs = tester ? Sim.problems(pc) : [];
    for (const slot of Builder.SLOT_ORDER) {
      const multi = Builder.MULTI_SLOTS[slot];
      const ids = multi ? pc.parts[slot] : (pc.parts[slot] ? [pc.parts[slot]] : []);
      if (!ids.length && !multi) {
        const r = h('div', 'pcpart missing');
        r.appendChild(h('span', 'pn', slotName(slot)));
        r.appendChild(h('span', 'pv', '— fehlt —'));
        const b = h('button', 'btn small', 'Einbauen');
        b.addEventListener('click', () => { chooser = { mode: 'swap', slot, pcId: pc.id, oldId: null }; render(); });
        r.appendChild(b);
        wrap.appendChild(r);
        continue;
      }
      for (const id of ids) {
        const r = h('div', 'pcpart');
        r.appendChild(h('span', 'pn', slotName(slot)));
        const label = h('span', 'pv', partName(id));
        const prob = probs.find((p) => p.slot === slot && p.id === id);
        if (prob) { label.appendChild(h('small', 'bad', ' – ' + prob.text)); }
        r.appendChild(label);
        const acts = h('div', 'pcacts');
        const reseat = h('button', 'btn small', 'Neu einsetzen');
        reseat.addEventListener('click', () => {
          const res = Sim.fix(pc, 'neu-einsetzen', slot, id);
          setMessage(res.ok ? 'ok' : 'info', res.ok ? '✓ ' + res.message : 'ℹ ' + slotName(slot) + ' saß schon fest. Hier war kein Fehler.');
          UI.sound(res.ok ? 'ok' : 'click');
          cb.onChange(); render();
        });
        acts.appendChild(reseat);
        if (slot === 'cooler' || slot === 'case') {
          const clean = h('button', 'btn small', 'Reinigen');
          clean.addEventListener('click', () => {
            const res = Sim.fix(pc, 'reinigen', 'cooler', pc.parts.cooler);
            setMessage(res.ok ? 'ok' : 'info', res.ok ? '✓ ' + res.message : 'ℹ Die Kühlung war sauber.');
            UI.sound(res.ok ? 'ok' : 'click');
            cb.onChange(); render();
          });
          if (slot === 'cooler') acts.appendChild(clean);
        }
        const rep = h('button', 'btn small', 'Ersetzen');
        rep.addEventListener('click', () => { chooser = { mode: 'swap', slot, pcId: pc.id, oldId: id }; setMessage(null); render(); });
        acts.appendChild(rep);
        const out = h('button', 'btn small ghost', 'Ausbauen');
        out.addEventListener('click', () => {
          const res = Builder.removePart(s, pc.id, slot, id);
          setMessage(res.ok ? 'ok' : 'err', res.ok ? '✓ ' + partName(id) + ' ausgebaut' + (res.scrapped ? ' (entsorgt).' : pc.origin === 'kunde' ? ' (geht an den Kunden zurück).' : ' und ins Lager gelegt.') : '✗ ' + res.message);
          cb.onChange(); render();
        });
        acts.appendChild(out);
        r.appendChild(acts);
        wrap.appendChild(r);
      }
      if (multi && ids.length < multi) {
        const r = h('div', 'pcpart missing');
        r.appendChild(h('span', 'pn', slotName(slot)));
        r.appendChild(h('span', 'pv', ids.length ? '' : '— leer —'));
        const b = h('button', 'btn small', 'Hinzufügen');
        b.addEventListener('click', () => { chooser = { mode: 'swap', slot, pcId: pc.id, oldId: null }; render(); });
        r.appendChild(b);
        wrap.appendChild(r);
      }
    }
    return wrap;
  }

  function runTest(pc) {
    const s = S();
    cancelAnim();
    const res = Sim.test(pc, s.clock, Progress.hasTester(s));
    const steps = res.boot.steps;
    const speed = Progress.testSpeed(s);
    anim = { timers: [], pcId: pc.id, shown: 0 };
    cb.onRunning(true, pc);
    UI.sound('boot');
    const total = steps.length;
    const stepMs = 520 * speed;
    const showAt = (n) => {
      if (!anim || anim.pcId !== pc.id) return;
      anim.shown = n;
      if (n > 0) UI.sound(steps[n - 1].status === 'fail' ? 'bootFail' : 'boot');
      render();
    };
    const finish = () => {
      if (!anim || anim.pcId !== pc.id) return;
      anim.timers.forEach(clearTimeout);
      anim = null;
      cb.onRunning(res.boot.ok, pc);
      UI.sound(res.ok ? 'bootOk' : 'bootFail');
      cb.onTested(pc, res);
      cb.onChange();
      render();
    };
    anim.finish = finish;
    for (let i = 1; i <= total; i++) anim.timers.push(setTimeout(() => showAt(i), i * stepMs));
    anim.timers.push(setTimeout(finish, (total + 1) * stepMs));
    render();
  }

  function renderPcs(el) {
    const s = S();
    const mb = msgBox();
    if (mb) el.appendChild(mb);
    if (!s.pcs.length) {
      const e = h('div', 'empty', 'Du hast noch keinen PC. Baue einen unter „PC zusammenbauen“ oder nimm einen Reparaturauftrag an.');
      const b = h('button', 'btn primary', 'PC zusammenbauen');
      b.addEventListener('click', () => { tab = 'build'; render(); });
      e.appendChild(b);
      el.appendChild(e);
      return;
    }
    if (!s.pcs.some((p) => p.id === selectedPc)) selectedPc = s.pcs[0].id;
    const sel = h('div', 'pcsel');
    for (const pc of s.pcs) {
      const [t, cls] = pcStatus(pc);
      const b = h('button', 'pcchip' + (pc.id === selectedPc ? ' active' : ''));
      b.appendChild(h('b', '', pc.name));
      b.appendChild(chip(t, cls));
      b.addEventListener('click', () => { if (anim) return; selectedPc = pc.id; setMessage(null); render(); });
      sel.appendChild(b);
    }
    el.appendChild(sel);
    const pc = s.pcs.find((p) => p.id === selectedPc);
    cb.onSelect(pc);
    const card = h('div', 'card2');
    const head = h('div', 'c2-head');
    head.appendChild(h('b', '', pc.name));
    const [t, cls] = pcStatus(pc);
    head.appendChild(chip(t, cls));
    card.appendChild(head);
    if (pc.origin === 'kunde') {
      const job = Jobs.byId(s, pc.jobId);
      card.appendChild(h('div', 'c2-line', 'Beobachtung des Kunden: ' + (pc.symptom || '–')));
      if (job) card.appendChild(h('div', 'c2-line dim', job.title + ' · Frist noch ' + duration(job.deadline - s.clock) + ' · Teile, die du einbaust, werden dem Kunden zum Verkaufspreis berechnet.'));
    } else {
      card.appendChild(h('div', 'c2-line dim', 'Teilekosten ' + eur(pc.unitCost || Builder.cost(pc.parts)) + ' · Empf. Verkaufspreis ' + eur(Builder.suggestedPrice(pc.parts))));
    }
    el.appendChild(card);
    const actions = h('div', 'c2-actions');
    const start = h('button', 'btn primary', anim ? 'Test läuft …' : '▶ Einschalten & testen');
    start.disabled = !!anim;
    start.addEventListener('click', () => { setMessage(null); runTest(pc); });
    actions.appendChild(start);
    const tools = h('button', 'btn', 'BIOS aktualisieren');
    tools.disabled = !!anim;
    tools.addEventListener('click', () => {
      const r = Sim.fix(pc, 'bios');
      setMessage(r.ok ? 'ok' : 'info', r.ok ? '✓ ' + r.message : 'ℹ ' + r.message);
      UI.sound(r.ok ? 'ok' : 'click');
      cb.onChange(); render();
    });
    actions.appendChild(tools);
    if (pc.origin === 'kunde' && pc.jobId) {
      const hand = h('button', 'btn', 'Auftrag abgeben …');
      hand.addEventListener('click', () => cb.openJobs());
      actions.appendChild(hand);
    }
    if (pc.origin !== 'kunde') {
      const dis = h('button', 'btn ghost', 'Zerlegen');
      dis.disabled = !!anim;
      dis.addEventListener('click', () => UI.confirm('„' + pc.name + '“ zerlegen? Alle intakten Teile kommen zurück ins Lager.', 'Zerlegen', () => {
        const r = Builder.disassemble(s, pc.id);
        setMessage(r.ok ? 'ok' : 'err', r.ok ? '✓ Zerlegt. ' + r.returned + ' Teile liegen wieder im Lager.' + (r.scrapped ? ' ' + r.scrapped + ' defekte Teile entsorgt.' : '') : '✗ ' + r.message);
        cb.onChange(); render();
      }));
      actions.appendChild(dis);
    }
    el.appendChild(actions);
    const live = anim && anim.pcId === pc.id ? anim.shown : null;
    if (live !== null && pc.report) el.appendChild(reportView(pc, live));
    else if (!anim) el.appendChild(reportView(pc, null));
    if (Progress.hasTester(s)) {
      const probs = Sim.problems(pc);
      const box = h('div', 'checkbox');
      box.appendChild(h('div', 'subhead', 'Diagnose-Messgerät'));
      if (!probs.length) box.appendChild(h('div', 'chk ok', '✓ Keine Probleme gefunden.'));
      for (const p of probs) box.appendChild(h('div', 'chk err', '✗ ' + p.text + ' Empfehlung: ' + ({ ersetzen: 'Teil ersetzen', 'neu-einsetzen': 'Teil neu einsetzen', reinigen: 'Kühlung reinigen', bios: 'BIOS aktualisieren', einbauen: 'Teil einbauen' })[p.fix] + '.'));
      el.appendChild(box);
    } else {
      el.appendChild(h('div', 'pricenote', 'Tipp: Mit dem „Diagnose-Messgerät“ (Ausbau) siehst du alle Fehler auf einen Blick. Ohne Messgerät musst du Teile prüfen: Neu einsetzen, Reinigen oder Ersetzen.'));
    }
    el.appendChild(h('div', 'subhead', 'Bauteile'));
    el.appendChild(partsList(pc, s));
  }

  // ---------- Rahmen ----------
  function render() {
    if (!els) return;
    const s = S();
    els.money.textContent = '€ ' + UI.nf(Economy.balance());
    els.tabBuild.classList.toggle('active', tab === 'build');
    els.tabPcs.classList.toggle('active', tab === 'pcs');
    els.badge.textContent = String(s.pcs.length);
    els.badge.classList.toggle('hidden', !s.pcs.length);
    const keep = els.body.scrollTop;
    clear(els.body);
    if (chooser) renderChooser(els.body);
    else if (tab === 'build') renderBuild(els.body);
    else renderPcs(els.body);
    els.body.scrollTop = keep;
  }

  function init(callbacks) {
    cb = Object.assign(cb, callbacks || {});
    els = {
      panel: document.getElementById('benchPanel'),
      money: document.getElementById('benchMoney'),
      tabBuild: document.getElementById('tabBuild'),
      tabPcs: document.getElementById('tabPcs'),
      badge: document.getElementById('pcsBadge'),
      body: document.getElementById('benchBody'),
    };
    document.getElementById('benchClose').addEventListener('click', () => { close(); cb.onClose(); });
    els.tabBuild.addEventListener('click', () => { if (anim) return; tab = 'build'; chooser = null; setMessage(null); render(); });
    els.tabPcs.addEventListener('click', () => { tab = 'pcs'; chooser = null; setMessage(null); render(); });
  }
  function open(startTab, pcId) {
    tab = startTab === 'pcs' ? 'pcs' : 'build';
    chooser = null;
    setMessage(null);
    if (pcId) { selectedPc = pcId; tab = 'pcs'; }
    els.panel.classList.remove('hidden');
    render();
  }
  function close() {
    cancelAnim();
    els.panel.classList.add('hidden');
  }

  return { init, open, close, refresh: render, isOpen: () => els && !els.panel.classList.contains('hidden'), selected: () => selectedPc, isTesting: () => !!anim };
})();

window.BenchUI = BenchUI;
