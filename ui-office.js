// ui-office.js – Büro-Reiter: Bestellungen, Aufträge, Finanzen und Ausbau.
// Nur Anzeige und Bedienung; die Regeln liegen in suppliers.js, jobs.js, progression.js und economy.js.
'use strict';

const OfficeUI = (() => {
  const { h, eur, nf, duration, bar, chip, clear } = UI;
  const nfInt = (n) => n.toLocaleString('de-DE');

  let jobPick = null; // Auftrag, für den gerade ein PC ausgewählt wird
  let flash = null; // { kind, text } letzte Rückmeldung

  function setFlash(kind, text) { flash = text ? { kind, text } : null; }
  function flashBox() { return flash ? h('div', 'msg ' + flash.kind, flash.text) : null; }
  function section(title) { return h('div', 'subhead', title); }

  // ---------- Bestellungen ----------
  function renderOrders(el, ctx) {
    const s = ctx.state;
    clear(el);
    const open = Procurement.openOrders(s);
    const sum = h('div', 'sumline');
    sum.appendChild(h('span', '', 'Offene Bestellungen: ' + open.length));
    sum.appendChild(h('span', '', 'Teile unterwegs: ' + Procurement.incomingTotal(s)));
    sum.appendChild(h('span', '', 'Lagerplatz frei: ' + Math.max(0, Inventory.capacity() - Inventory.totalPieces() - Procurement.incomingTotal(s))));
    el.appendChild(sum);
    const fb = flashBox();
    if (fb) el.appendChild(fb);
    if (!s.orders.length) {
      const e = h('div', 'empty', 'Noch keine Bestellungen. Öffne den Einkauf, wähle einen Lieferanten und bestelle Hardware.');
      const b = h('button', 'btn primary', 'Zum Einkauf');
      b.addEventListener('click', () => ctx.goto('shop'));
      e.appendChild(b);
      el.appendChild(e);
      return;
    }
    const list = s.orders.slice().sort((a, b) => (Procurement.isOpen(b) ? 1 : 0) - (Procurement.isOpen(a) ? 1 : 0) || b.id - a.id);
    for (const o of list) {
      const sup = Procurement.supplier(o.supplier);
      const card = h('div', 'card2 order ' + o.status);
      const head = h('div', 'c2-head');
      head.appendChild(h('b', '', 'Bestellung #' + o.id + ' · ' + sup.short));
      head.appendChild(chip(Procurement.STATUS_TEXT[o.status], 'st-' + o.status));
      card.appendChild(head);
      for (const l of o.lines) {
        const it = HardwareDB.get(l.id);
        card.appendChild(h('div', 'c2-line', l.qty + '× ' + (it ? it.name : l.id) + ' · ' + eur(l.unit) + ' je Stück'));
      }
      card.appendChild(h('div', 'c2-line dim', 'Waren ' + eur(o.subtotal) + ' + Versand ' + eur(o.shipping) + ' = ' + eur(o.total)));
      if (Procurement.isOpen(o)) {
        const total = Math.max(1, o.eta - o.placedAt);
        const pct = ((s.clock - o.placedAt) / total) * 100;
        const prog = bar(pct, 'ord');
        prog.dataset.placed = o.placedAt; prog.dataset.eta = o.eta;
        card.appendChild(prog);
        const eta = h('div', 'c2-eta');
        eta.dataset.eta = String(o.eta);
        eta.dataset.oid = String(o.id);
        eta.dataset.status = o.status;
        eta.textContent = o.status === 'wartet' ? 'Lager voll – die Ware wartet auf freien Platz.' : 'Ankunft in ' + duration(Procurement.remaining(s, o));
        card.appendChild(eta);
        if (o.status === 'bestellt') {
          const c = h('button', 'btn small', 'Stornieren (Versand ' + eur(o.shipping) + ' wird nicht erstattet)');
          c.addEventListener('click', () => {
            const r = Procurement.cancel(s, o.id);
            if (r.ok) { setFlash('ok', '✓ Bestellung #' + o.id + ' storniert. Erstattet: ' + eur(r.refund) + '.'); ctx.cb.onChangeMoney && ctx.cb.onChangeMoney(); }
            else setFlash('err', '✗ ' + r.message);
            ctx.onChange();
          });
          card.appendChild(c);
        }
      } else if (o.status === 'geliefert') {
        card.appendChild(h('div', 'c2-line dim', 'Ware ist im Lager.'));
      }
      el.appendChild(card);
    }
  }

  // ---------- Aufträge ----------
  function reqList(job) {
    const lines = Jobs.reqLines(job.req);
    const ul = h('ul', 'reqs');
    for (const l of lines) ul.appendChild(h('li', '', l));
    return lines.length ? ul : null;
  }

  function renderJobs(el, ctx) {
    const s = ctx.state;
    clear(el);
    const active = Jobs.active(s);
    const sum = h('div', 'sumline');
    sum.appendChild(h('span', '', 'Laufende Aufträge: ' + active.length + ' von ' + Progress.jobSlots(s)));
    sum.appendChild(h('span', '', 'Erledigt: ' + s.salesStats.jobsDone));
    sum.appendChild(h('span', '', 'Verpasst: ' + s.salesStats.jobsFailed));
    el.appendChild(sum);
    const fb = flashBox();
    if (fb) el.appendChild(fb);

    if (jobPick) {
      renderJobPick(el, ctx);
      return;
    }
    if (!active.length) {
      el.appendChild(h('div', 'empty', 'Keine laufenden Aufträge. Kunden an der Kasse bieten dir Aufträge an: PC-Bau, Reparaturen und Aufrüstungen.'));
    }
    for (const job of active) {
      const card = h('div', 'card2 job');
      const head = h('div', 'c2-head');
      head.appendChild(h('b', '', job.title));
      head.appendChild(chip(Jobs.KIND_TEXT[job.kind], 'k-' + job.kind));
      card.appendChild(head);
      card.appendChild(h('div', 'c2-line', job.text));
      const rl = reqList(job);
      if (rl) card.appendChild(rl);
      const rw = job.kind === 'preorder' ? 'Restbetrag bei Abholung: ' + eur(Economy.round2(job.reward - job.deposit)) : (job.kind === 'build' ? 'Bezahlung: ' : 'Gebühr: ') + eur(job.reward) + (job.kind === 'repair' || job.kind === 'upgrade' ? ' + neue Teile' : '');
      card.appendChild(h('div', 'c2-line strong', rw));
      const left = job.deadline - s.clock;
      const dl = h('div', 'c2-eta' + (left < 60 ? ' urgent' : ''));
      dl.dataset.deadline = String(job.deadline);
      dl.textContent = 'Frist: noch ' + duration(left);
      card.appendChild(dl);
      if (job.kind === 'preorder') {
        const reserved = Inventory.reservations().some((r) => r.tag === 'job:' + job.id);
        card.appendChild(h('div', 'c2-line dim', reserved ? '✓ Das Teil ist im Lager zurückgelegt.' : 'Bestelle das Teil im Einkauf – sobald es im Lager ist, wird es zurückgelegt.'));
      }
      const actions = h('div', 'c2-actions');
      if (job.pcId) {
        const wb = h('button', 'btn small', '🔧 Zur Werkbank');
        wb.addEventListener('click', () => ctx.cb.openBench && ctx.cb.openBench(job.pcId));
        actions.appendChild(wb);
      }
      const hand = h('button', 'btn small primary', job.kind === 'preorder' ? 'Ware übergeben' : job.kind === 'build' ? 'PC abgeben …' : 'Reparatur abgeben');
      hand.addEventListener('click', () => {
        if (job.kind === 'build') { jobPick = job.id; setFlash(null); ctx.onChange(); return; }
        finishJob(ctx, job, null);
      });
      actions.appendChild(hand);
      const ab = h('button', 'btn small ghost', 'Abbrechen');
      ab.addEventListener('click', () => UI.confirm('Auftrag „' + job.title + '“ wirklich abbrechen? Das kostet Ruf' + (job.kind === 'preorder' ? ' und die Anzahlung geht zurück an den Kunden.' : '.'), 'Auftrag abbrechen', () => {
        const r = Jobs.abort(s, job.id);
        setFlash(r.ok ? 'ok' : 'err', r.ok ? 'Auftrag abgebrochen.' : '✗ ' + r.message);
        ctx.cb.onChangeMoney && ctx.cb.onChangeMoney();
        ctx.onChange();
      }, 'Behalten'));
      actions.appendChild(ab);
      card.appendChild(actions);
      el.appendChild(card);
    }

    const done = s.jobs.filter((j) => j.status !== 'angenommen').slice(-6).reverse();
    if (done.length) {
      el.appendChild(section('Abgeschlossen'));
      for (const j of done) {
        const row = h('div', 'c2-line dim', Jobs.STATUS_TEXT[j.status] + ' · ' + j.title + (j.result ? ' · ' + j.result : ''));
        el.appendChild(row);
      }
    }
    if (s.reviews.length) {
      el.appendChild(section('Kundenstimmen'));
      for (const r of s.reviews.slice(-5).reverse()) {
        el.appendChild(h('div', 'review', '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) + '  „' + r.text + '“ – ' + r.who));
      }
    }
  }

  function renderJobPick(el, ctx) {
    const s = ctx.state;
    const job = Jobs.byId(s, jobPick);
    if (!job || job.status !== 'angenommen') { jobPick = null; renderJobs(el, ctx); return; }
    const back = h('button', 'shop-btn', '← Zurück zu den Aufträgen');
    back.addEventListener('click', () => { jobPick = null; ctx.onChange(); });
    el.appendChild(back);
    el.appendChild(h('div', 'det-name', 'PC abgeben: ' + job.title));
    const rl = reqList(job);
    if (rl) el.appendChild(rl);
    const mine = s.pcs.filter((p) => p.origin === 'eigen');
    if (!mine.length) el.appendChild(h('div', 'empty', 'Du hast keinen eigenen PC. Baue einen an der Werkbank (Mitte hinten) und teste ihn.'));
    for (const pc of mine) {
      const ev = Jobs.evaluate(job, pc);
      const card = h('div', 'card2 ' + (ev.ok ? 'goodpc' : 'badpc'));
      const head = h('div', 'c2-head');
      head.appendChild(h('b', '', pc.name));
      head.appendChild(chip(ev.ok ? 'Erfüllt alle Wünsche' : 'Passt nicht', ev.ok ? 'st-geliefert' : 'st-storniert'));
      card.appendChild(head);
      if (pc.report && pc.report.bench) card.appendChild(h('div', 'c2-line', 'Gaming ' + pc.report.bench.gaming + ' · Büro ' + pc.report.bench.office + ' · ' + pc.report.bench.ramGB + ' GB RAM · ' + UI.storageText(pc.report.bench.totalStorageGB)));
      for (const p of ev.problems) card.appendChild(h('div', 'c2-line bad', '• ' + p));
      const b = h('button', 'btn small' + (ev.ok ? ' primary' : ''), ev.ok ? 'Diesen PC abgeben' : 'Trotzdem versuchen');
      b.addEventListener('click', () => finishJob(ctx, job, pc.id));
      card.appendChild(b);
      el.appendChild(card);
    }
  }

  function finishJob(ctx, job, pcId) {
    const r = Jobs.complete(ctx.state, job.id, pcId);
    if (r.ok) {
      jobPick = null;
      setFlash('ok', '✓ Auftrag erledigt! Bezahlt: ' + eur(r.paid) + ' (Gewinn ca. ' + eur(r.profit) + '). Bewertung: ' + '★'.repeat(r.stars) + '. Ruf +' + r.repGain + '.');
      ctx.cb.onJobDone && ctx.cb.onJobDone(r);
    } else {
      setFlash('err', '✗ ' + r.message);
      ctx.cb.onFailure && ctx.cb.onFailure(r);
    }
    ctx.onChange();
  }

  // ---------- Finanzen ----------
  function renderFinance(el, ctx) {
    const s = ctx.state;
    clear(el);
    const lvl = Progress.level(s);
    const next = Progress.nextLevel(s);
    const lc = h('div', 'card2');
    lc.appendChild(h('div', 'c2-head', ''));
    lc.firstChild.appendChild(h('b', '', 'Ladenstufe ' + lvl.level + ' · ' + lvl.name));
    lc.firstChild.appendChild(chip('★ ' + s.rep, 'st-bestellt'));
    if (next) {
      const span = next.rep - lvl.rep;
      lc.appendChild(bar(((s.rep - lvl.rep) / span) * 100, 'lvl'));
      const unlocks = Procurement.SUPPLIERS.filter((x) => x.level === next.level).map((x) => x.name);
      lc.appendChild(h('div', 'c2-line dim', 'Noch ' + (next.rep - s.rep) + ' Ruf bis „' + next.name + '“.' + (unlocks.length ? ' Schaltet frei: ' + unlocks.join(', ') + '.' : '') + ' Neue Kundentypen und anspruchsvollere Aufträge kommen dazu.'));
    } else {
      lc.appendChild(h('div', 'c2-line dim', 'Höchste Ladenstufe erreicht.'));
    }
    el.appendChild(lc);

    const tiles = h('div', 'tiles');
    const tile = (label, value, cls) => { const t = h('div', 'tile ' + (cls || '')); t.appendChild(h('span', '', label)); t.appendChild(h('b', '', value)); return t; };
    const today = Economy.dayStats(s.day);
    tiles.appendChild(tile('Kontostand', eur(s.money)));
    tiles.appendChild(tile('Lagerwert (Einkauf)', eur(Inventory.totalValue())));
    tiles.appendChild(tile('Heute: Einnahmen', eur(today.income), 'plus'));
    tiles.appendChild(tile('Heute: Ausgaben', eur(today.expense), 'minus'));
    tiles.appendChild(tile('Heute: Ergebnis', (today.profit >= 0 ? '+' : '') + eur(today.profit), today.profit >= 0 ? 'plus' : 'minus'));
    const rent = Progress.rentPerDay(s);
    tiles.appendChild(tile('Miete pro Tag', eur(rent)));
    el.appendChild(tiles);
    const evNow = Progress.currentEvent(s);
    el.appendChild(h('div', 'c2-line' + (evNow ? ' strong' : ' dim'), evNow ? '📣 Heute: ' + evNow.name + ' – ' + evNow.desc : 'Heute gibt es kein besonderes Ereignis.'));
    el.appendChild(h('div', 'c2-line dim', 'Nächste Mietabbuchung in ' + duration(Progress.DAY_SECONDS - Progress.dayTime(s)) + ' (Tagesende ' + UI.clockText(Progress.DAY_SECONDS) + ' Uhr im Spiel).'));
    if (s.arrears > 0) {
      const ar = h('div', 'msg err', 'Mietrückstand: ' + eur(s.arrears) + '. Solange Rückstand besteht, sinkt täglich dein Ruf.');
      const pay = h('button', 'btn small primary', 'Rückstand bezahlen');
      pay.addEventListener('click', () => {
        const r = Progress.payArrears(s);
        setFlash(r.ok ? 'ok' : 'err', r.ok ? '✓ ' + eur(r.paid) + ' bezahlt. Offen: ' + eur(r.left) + '.' : '✗ ' + r.message);
        ctx.cb.onChangeMoney && ctx.cb.onChangeMoney();
        ctx.onChange();
      });
      ar.appendChild(pay);
      el.appendChild(ar);
    }
    // Notfall-Kleinkredit
    const loan = h('div', 'card2');
    loan.appendChild(h('div', 'c2-head', ''));
    loan.firstChild.appendChild(h('b', '', 'Notfall-Kleinkredit'));
    if (s.debt > 0) {
      loan.appendChild(h('div', 'c2-line', 'Offene Schuld: ' + eur(s.debt) + '. Es werden täglich bis zu ' + eur(Progress.LOAN.rate) + ' automatisch abgebucht, sobald die Miete bezahlt ist.'));
      const rb = h('button', 'btn small', 'Jetzt zurückzahlen');
      rb.addEventListener('click', () => {
        const r = Progress.repayLoan(s);
        setFlash(r.ok ? 'ok' : 'err', r.ok ? '✓ ' + eur(r.paid) + ' zurückgezahlt. Offen: ' + eur(r.left) + '.' : '✗ ' + r.message);
        ctx.cb.onChangeMoney && ctx.cb.onChangeMoney();
        ctx.onChange();
      });
      loan.appendChild(rb);
    } else {
      loan.appendChild(h('div', 'c2-line dim', 'Wenn dein Kontostand unter ' + eur(Progress.LOAN.maxMoney) + ' fällt und du nicht weiterkommst: ' + eur(Progress.LOAN.amount) + ' sofort, Rückzahlung ' + eur(Progress.LOAN.repay) + ' (10 % Gebühr) in Tagesraten.'));
      const can = Progress.canTakeLoan(s);
      const lb = h('button', 'btn small' + (can.ok ? ' primary' : ''), can.ok ? eur(Progress.LOAN.amount) + ' Kredit aufnehmen' : can.message);
      lb.disabled = !can.ok;
      lb.classList.toggle('disabled', !can.ok);
      lb.addEventListener('click', () => {
        const r = Progress.takeLoan(s);
        setFlash(r.ok ? 'ok' : 'err', r.ok ? '✓ ' + eur(r.amount) + ' erhalten. Zurückzuzahlen: ' + eur(r.debt) + '.' : '✗ ' + r.message);
        ctx.cb.onChangeMoney && ctx.cb.onChangeMoney();
        ctx.onChange();
      });
      loan.appendChild(lb);
    }
    el.appendChild(loan);
    // Familienhilfe nur in einer echten Notlage (kein Geld, keine Ware, keine PCs, nichts unterwegs)
    if (Progress.isStranded(s)) {
      const help = h('div', 'card2');
      help.appendChild(h('div', 'c2-head', ''));
      help.firstChild.appendChild(h('b', '', 'Notlage: Familienhilfe'));
      help.appendChild(h('div', 'c2-line', 'Du hast weder Geld noch Ware noch PCs. Deine Familie leiht dir einmalig ' + eur(300) + ' (alle 5 Tage möglich). Das kostet etwas Ruf (−3).'));
      const can = Progress.canAskFamily(s);
      const fbtn = h('button', 'btn small' + (can.ok ? ' primary' : ''), can.ok ? eur(300) + ' annehmen' : can.message);
      fbtn.disabled = !can.ok;
      fbtn.classList.toggle('disabled', !can.ok);
      fbtn.addEventListener('click', () => {
        const r = Progress.askFamily(s);
        setFlash(r.ok ? 'ok' : 'err', r.ok ? '✓ ' + eur(r.amount) + ' erhalten. Kaufe davon Ware und bediene Kunden.' : '✗ ' + r.message);
        ctx.cb.onChangeMoney && ctx.cb.onChangeMoney();
        ctx.onChange();
      });
      help.appendChild(fbtn);
      el.appendChild(help);
    }
    const fb = flashBox();
    if (fb) el.appendChild(fb);

    // Verlauf der letzten 7 Tage
    el.appendChild(section('Letzte 7 Tage'));
    const chart = h('div', 'chart');
    const days = [];
    for (let d = Math.max(1, s.day - 6); d <= s.day; d++) days.push(d);
    const maxV = Math.max(50, ...days.map((d) => Math.max(Economy.dayStats(d).income, Economy.dayStats(d).expense)));
    for (const d of days) {
      const st = Economy.dayStats(d);
      const col = h('div', 'ch-col');
      const bars = h('div', 'ch-bars');
      const inc = h('div', 'ch-bar inc'); inc.style.height = Math.round((st.income / maxV) * 100) + '%'; inc.title = 'Einnahmen ' + eur(st.income);
      const exp = h('div', 'ch-bar exp'); exp.style.height = Math.round((st.expense / maxV) * 100) + '%'; exp.title = 'Ausgaben ' + eur(st.expense);
      bars.appendChild(inc); bars.appendChild(exp);
      col.appendChild(bars);
      col.appendChild(h('small', '', 'Tag ' + d));
      col.appendChild(h('small', st.profit >= 0 ? 'plus' : 'minus', (st.profit >= 0 ? '+' : '') + nfInt(Math.round(st.profit))));
      chart.appendChild(col);
    }
    el.appendChild(chart);
    el.appendChild(h('div', 'legend', '■ Einnahmen   ■ Ausgaben  (Zahl darunter: Ergebnis in €)'));

    // Aufschlüsselung (gesamt, letzte 60 Tage)
    el.appendChild(section('Aufschlüsselung'));
    const cats = {};
    for (const k of Object.keys(s.stats.byDay)) {
      for (const c of Object.keys(s.stats.byDay[k].cats)) cats[c] = (cats[c] || 0) + s.stats.byDay[k].cats[c];
    }
    const keys = Object.keys(cats).sort((a, b) => cats[b] - cats[a]);
    if (!keys.length) el.appendChild(h('div', 'c2-line dim', 'Noch keine Buchungen.'));
    for (const k of keys) {
      const row = h('div', 'frow');
      row.appendChild(h('span', '', Economy.CATEGORY_NAMES[k] || k));
      row.appendChild(h('b', cats[k] >= 0 ? 'plus' : 'minus', (cats[k] >= 0 ? '+' : '') + eur(Economy.round2(cats[k]))));
      el.appendChild(row);
    }
    const tot = Economy.totals();
    el.appendChild(h('div', 'c2-line dim', 'Gesamt seit Spielbeginn: Einnahmen ' + eur(tot.income) + ', Ausgaben ' + eur(tot.expense) + ', Ergebnis ' + eur(tot.profit) + '.'));

    // Verkaufsverlauf
    el.appendChild(section('Verkaufsverlauf (letzte 12)'));
    const sales = s.sales.slice(-12).reverse();
    if (!sales.length) el.appendChild(h('div', 'c2-line dim', 'Noch nichts verkauft.'));
    for (const x of sales) {
      const row = h('div', 'frow');
      row.appendChild(h('span', '', 'Tag ' + x.day + ' · ' + x.what + (x.who ? ' · ' + x.who : '')));
      const profit = Economy.round2(x.price - x.cost);
      row.appendChild(h('b', '', eur(x.price) + ' (' + (profit >= 0 ? '+' : '') + eur(profit) + ')'));
      el.appendChild(row);
    }
    // Buchungen
    el.appendChild(section('Letzte Buchungen'));
    const led = s.ledger.slice(-10).reverse();
    for (const e of led) {
      const row = h('div', 'frow');
      row.appendChild(h('span', '', 'Tag ' + e.day + ' · ' + e.reason));
      row.appendChild(h('b', e.amount >= 0 ? 'plus' : 'minus', (e.amount >= 0 ? '+' : '') + eur(e.amount)));
      el.appendChild(row);
    }
    const st = h('div', 'c2-line dim', 'Statistik: ' + s.salesStats.count + ' Verkäufe (davon ' + s.salesStats.pcCount + ' PCs), ' + s.salesStats.jobsDone + ' Aufträge erledigt, ' + s.salesStats.walkouts + ' Kunden ohne Kauf.');
    el.appendChild(st);
  }

  // ---------- Ausbau ----------
  function renderUpgrades(el, ctx) {
    const s = ctx.state;
    clear(el);
    const fb = flashBox();
    if (fb) el.appendChild(fb);
    el.appendChild(h('div', 'c2-line dim', 'Ausbau kostet einmalig Geld und erhöht teilweise die tägliche Miete (Unterhalt). Neue Stufen schaltest du durch Ruf frei.'));
    for (const u of Progress.UPGRADES) {
      const owned = Progress.has(s, u.id);
      const can = Progress.canBuyUpgrade(s, u.id);
      const card = h('div', 'card2 upg' + (owned ? ' owned' : ''));
      const head = h('div', 'c2-head');
      head.appendChild(h('b', '', u.name));
      head.appendChild(owned ? chip('Gebaut', 'st-geliefert') : chip(eur(u.cost), can.ok ? 'st-bestellt' : 'st-storniert'));
      card.appendChild(head);
      card.appendChild(h('div', 'c2-line', u.desc));
      if (u.upkeep) card.appendChild(h('div', 'c2-line dim', 'Unterhalt: +' + eur(u.upkeep) + ' pro Tag.'));
      if (!owned) {
        const b = h('button', 'btn small' + (can.ok ? ' primary' : ''), can.ok ? 'Kaufen für ' + eur(u.cost) : can.message);
        b.disabled = !can.ok;
        b.classList.toggle('disabled', !can.ok);
        b.addEventListener('click', () => {
          const r = Progress.buyUpgrade(s, u.id);
          if (r.ok) { setFlash('ok', '✓ „' + u.name + '“ gebaut.'); ctx.cb.onUpgrade && ctx.cb.onUpgrade(r); }
          else { setFlash('err', '✗ ' + r.message); ctx.cb.onFailure && ctx.cb.onFailure(r); }
          ctx.onChange();
        });
        card.appendChild(b);
      }
      el.appendChild(card);
    }
  }

  // ---------- Ziele ----------
  function renderGoals(el, ctx) {
    const s = ctx.state;
    clear(el);
    const total = Achievements.LIST.length;
    const done = Achievements.LIST.filter((a) => Achievements.done(s, a.id)).length;
    el.appendChild(h('div', 'c2-line dim', 'Ziele geben kleine Prämien und führen dich durch das Spiel. Erreicht: ' + done + ' von ' + total + '.'));
    el.appendChild(bar((done / total) * 100, 'lvl'));
    const list = Achievements.LIST.slice().sort((a, b) => (Achievements.done(s, a.id) ? 1 : 0) - (Achievements.done(s, b.id) ? 1 : 0));
    for (const a of list) {
      const ok = Achievements.done(s, a.id);
      const pr = Achievements.progress(s, a);
      const card = h('div', 'card2' + (ok ? ' owned' : ''));
      const head = h('div', 'c2-head');
      head.appendChild(h('b', '', (ok ? '✓ ' : '') + a.name));
      head.appendChild(ok ? chip('Tag ' + s.achievements[a.id], 'st-geliefert') : chip(a.money ? eur(a.money) + (a.rep ? ' + ★' + a.rep : '') : '★' + a.rep, 'st-bestellt'));
      card.appendChild(head);
      card.appendChild(h('div', 'c2-line', a.desc));
      if (!ok && a.target > 1) {
        card.appendChild(bar((pr.cur / pr.target) * 100, ''));
        card.appendChild(h('div', 'c2-line dim', nfInt(pr.cur) + ' von ' + nfInt(pr.target)));
      }
      el.appendChild(card);
    }
  }

  return {
    render(tab, el, ctx) {
      const keep = el.scrollTop;
      if (tab === 'orders') renderOrders(el, ctx);
      else if (tab === 'jobs') renderJobs(el, ctx);
      else if (tab === 'finance') renderFinance(el, ctx);
      else if (tab === 'upgrades') renderUpgrades(el, ctx);
      else if (tab === 'goals') renderGoals(el, ctx);
      el.scrollTop = keep;
    },
    // Aktualisiert nur die laufenden Zähler, ohne die Seite neu zu bauen (Scroll bleibt erhalten)
    update(tab, el, s) {
      if (!s) return;
      el.querySelectorAll('[data-eta]').forEach((n) => {
        if (n.classList.contains('c2-eta')) {
          const o = s.orders.find((x) => String(x.id) === n.dataset.oid && Procurement.isOpen(x));
          if (!o) { n.textContent = 'Geliefert'; return; }
          if (o.status !== n.dataset.status) { n.dataset.status = o.status; }
          n.textContent = o.status === 'wartet' ? 'Lager voll – die Ware wartet auf freien Platz.' : 'Ankunft in ' + duration(Procurement.remaining(s, o));
        } else if (n.classList.contains('bar')) {
          const pl = Number(n.dataset.placed), eta = Number(n.dataset.eta);
          n.firstChild.style.width = Math.max(0, Math.min(100, ((s.clock - pl) / Math.max(1, eta - pl)) * 100)) + '%';
        }
      });
      el.querySelectorAll('[data-deadline]').forEach((n) => {
        const left = Number(n.dataset.deadline) - s.clock;
        n.textContent = 'Frist: noch ' + duration(left);
        n.classList.toggle('urgent', left < 60);
      });
    },
    resetPick() { jobPick = null; setFlash(null); },
  };
})();

window.OfficeUI = OfficeUI;
