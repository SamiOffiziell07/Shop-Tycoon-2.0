// ui-counter.js – Kasse: Kunden bedienen (Teile verkaufen, PCs verkaufen, Aufträge annehmen, vorbestellen).
// Zeigt nur an und ruft Customers/Jobs auf; die Regeln liegen in customers.js und jobs.js.
'use strict';

const CounterUI = (() => {
  const { h, eur, duration, bar, chip, clear, icon, SUMMARY } = UI;
  let els = null;
  let cb = { getState: () => null, onClose() {}, onSold() {}, onJobAccepted() {}, onChange() {}, onFailure() {}, openShop() {}, openBench() {} };
  let selected = null; // { kind:'part', itemId } | { kind:'pc', pcId }
  let price = 0;
  let result = null; // letzte Antwort { kind, text }
  let lastCustomerId = null;

  const S = () => cb.getState();

  function interestText(ev) {
    if (ev.p <= 0) return ['kein Interesse', 'minus', ev.reason];
    if (ev.p >= 0.75) return ['hoch', 'plus', ''];
    if (ev.p >= 0.4) return ['mittel', '', ev.reason];
    return ['gering', 'minus', ev.reason];
  }

  function customerCard(c) {
    const card = h('div', 'card2 cust');
    const head = h('div', 'c2-head');
    head.appendChild(h('b', '', c.name));
    head.appendChild(chip(c.typeName, 'st-bestellt'));
    card.appendChild(head);
    card.appendChild(h('div', 'speech', '„' + Customers.describeWant(c) + '“'));
    const pat = Math.max(0, c.patienceLeft / c.patience) * 100;
    card.appendChild(h('div', 'c2-line dim', 'Geduld'));
    card.appendChild(bar(pat, pat > 50 ? 'good' : pat > 25 ? 'warn' : 'bad'));
    return card;
  }

  function priceControls(c, fair, cost, offerBase) {
    const wrap = h('div', 'pricectl');
    const min = Math.max(1, Math.round(fair * 0.6));
    const max = Math.round(fair * 1.7);
    const label = h('div', 'pc-label');
    const slider = h('input'); slider.type = 'range'; slider.min = String(min); slider.max = String(max); slider.step = '1'; slider.value = String(Math.round(price));
    slider.setAttribute('aria-label', 'Verkaufspreis');
    const info = h('div', 'pc-info');
    const refresh = () => {
      price = Number(slider.value);
      const ev = Customers.evaluate(S(), c, Object.assign({ price }, offerBase));
      const [txt, cls, why] = interestText(ev);
      label.textContent = 'Preis: ' + eur(price) + ' (Listenpreis ' + eur(fair) + ')';
      clear(info);
      const profit = Economy.round2(price - cost);
      info.appendChild(h('span', '', 'Gewinn: '));
      info.appendChild(h('b', profit >= 0 ? 'plus' : 'minus', (profit >= 0 ? '+' : '') + eur(profit)));
      info.appendChild(h('span', '', ' · Kaufinteresse: '));
      info.appendChild(h('b', cls, txt));
      if (why) info.appendChild(h('div', 'small', why));
    };
    slider.addEventListener('input', refresh);
    const row = h('div', 'pc-btns');
    for (const [txt, mult] of [['Rabatt −10 %', 0.9], ['Listenpreis', 1], ['Aufschlag +10 %', 1.1]]) {
      const b = h('button', 'qchip', txt);
      b.addEventListener('click', () => { slider.value = String(Math.round(fair * mult)); refresh(); });
      row.appendChild(b);
    }
    wrap.appendChild(label);
    wrap.appendChild(slider);
    wrap.appendChild(row);
    wrap.appendChild(info);
    refresh();
    return wrap;
  }

  function renderPart(el, c) {
    const s = S();
    const w = c.want;
    const wanted = HardwareDB.get(w.itemId);
    const rows = Customers.stockOptions(s, c);
    const exactInStock = rows.some((r) => r.exact);
    if (w.advice) el.appendChild(h('div', 'c2-line dim', 'Beratungskunde: Empfiehl ein passendes Teil. Alles ab Leistungsstufe ' + w.tier + ' im Budget gefällt dem Kunden; zu schwache Teile weniger.'));
    el.appendChild(h('div', 'subhead', 'Aus deinem Lager anbieten'));
    if (!rows.length) {
      el.appendChild(h('div', 'empty', 'Du hast nichts in der Kategorie „' + HardwareDB.CATEGORY_NAMES[w.cat] + '“ im Lager.'));
    }
    for (const r of rows) {
      const it = r.item;
      const row = h('button', 'row-item' + (selected && selected.itemId === it.id ? ' selected' : ''));
      row.appendChild(icon(it, 'row-ico'));
      const main = h('div', 'row-main');
      main.appendChild(h('div', 'row-name', it.name));
      main.appendChild(h('div', 'row-sub', (r.exact ? (w.advice ? '✓ passt zum Wunsch · ' : '✓ genau das Gewünschte · ') : 'Alternative · ') + SUMMARY[it.category](it.specs)));
      row.appendChild(main);
      const side = h('div', 'row-side', eur(it.sellPrice));
      side.appendChild(h('span', 'stock', r.count + '× frei'));
      row.appendChild(side);
      row.addEventListener('click', () => { selected = { kind: 'part', itemId: it.id }; price = it.sellPrice; result = null; render(); });
      el.appendChild(row);
    }
    if (selected && selected.kind === 'part') {
      const it = HardwareDB.get(selected.itemId);
      if (it && Inventory.available(it.id) >= 1) {
        el.appendChild(priceControls(c, it.sellPrice, it.buyPrice, { kind: 'part', itemId: it.id }));
        const offer = h('button', 'buy-btn', 'Angebot machen: ' + it.name + ' für ' + eur(price));
        offer.addEventListener('click', () => {
          const r = Customers.sell(s, c, { kind: 'part', itemId: it.id, price });
          handleSellResult(r);
        });
        el.appendChild(offer);
      }
    }
    const acts = h('div', 'c2-actions');
    if (!exactInStock) {
      const pre = h('button', 'btn', 'Vorbestellen lassen (20 % Anzahlung)');
      pre.addEventListener('click', () => {
        const r = Customers.preorder(s, c);
        if (r.ok) {
          result = { kind: 'ok', text: '✓ Vorbestellung angenommen: „' + wanted.name + '“. Anzahlung ' + eur(r.job.deposit) + ' erhalten. Bestelle das Teil, bevor die Frist abläuft (' + duration(r.job.deadline - s.clock) + ').' };
          cb.onChange(); cb.onSold && cb.onSold(null);
        } else { result = { kind: 'err', text: '✗ ' + r.message }; cb.onFailure(r); }
        selected = null;
        render();
      });
      acts.appendChild(pre);
      const shop = h('button', 'btn ghost', 'Teil im Einkauf bestellen');
      shop.addEventListener('click', () => cb.openShop(w.itemId));
      acts.appendChild(shop);
    }
    el.appendChild(acts);
  }

  function renderPc(el, c) {
    const s = S();
    const pcs = Customers.sellablePcs(s);
    el.appendChild(h('div', 'subhead', 'Getestete PCs in deiner Werkstatt'));
    if (!pcs.length) {
      const e = h('div', 'empty', 'Du hast keinen fertigen, getesteten PC. Baue und teste einen PC an der Werkbank.');
      const b = h('button', 'btn primary', 'Zur Werkbank');
      b.addEventListener('click', () => cb.openBench());
      e.appendChild(b);
      el.appendChild(e);
    }
    for (const pc of pcs) {
      const b = pc.report.bench;
      const fair = Builder.suggestedPrice(pc.parts);
      const row = h('button', 'row-item' + (selected && selected.pcId === pc.id ? ' selected' : ''));
      const main = h('div', 'row-main');
      main.appendChild(h('div', 'row-name', pc.name));
      main.appendChild(h('div', 'row-sub', 'Gaming ' + b.gaming + ' · Büro ' + b.office + ' · ' + b.ramGB + ' GB · ' + UI.storageText(b.totalStorageGB)));
      row.appendChild(main);
      row.appendChild(h('div', 'row-side', eur(fair)));
      row.addEventListener('click', () => { selected = { kind: 'pc', pcId: pc.id }; price = fair; result = null; render(); });
      el.appendChild(row);
    }
    if (selected && selected.kind === 'pc') {
      const pc = s.pcs.find((p) => p.id === selected.pcId);
      if (pc && pc.report && pc.report.ok) {
        el.appendChild(priceControls(c, Builder.suggestedPrice(pc.parts), pc.unitCost || Builder.cost(pc.parts), { kind: 'pc', pcId: pc.id }));
        const offer = h('button', 'buy-btn', 'Angebot machen: ' + pc.name + ' für ' + eur(price));
        offer.addEventListener('click', () => handleSellResult(Customers.sell(s, c, { kind: 'pc', pcId: pc.id, price })));
        el.appendChild(offer);
      }
    }
  }

  function renderJob(el, c) {
    const s = S();
    const job = c.want.job;
    const card = h('div', 'card2 job');
    const head = h('div', 'c2-head');
    head.appendChild(h('b', '', job.title));
    head.appendChild(chip(Jobs.KIND_TEXT[job.kind], 'k-' + job.kind));
    card.appendChild(head);
    const rl = Jobs.reqLines(job.req);
    if (rl.length) { const ul = h('ul', 'reqs'); rl.forEach((l) => ul.appendChild(h('li', '', l))); card.appendChild(ul); }
    card.appendChild(h('div', 'c2-line strong', (job.kind === 'build' ? 'Bezahlung: ' : 'Gebühr: ') + eur(job.reward) + (job.kind === 'repair' || job.kind === 'upgrade' ? ' + neue Teile' : '')));
    card.appendChild(h('div', 'c2-line dim', 'Frist: ' + duration(job.deadline - s.clock) + ' ab jetzt. Freie Auftragsplätze: ' + Jobs.freeSlots(s) + '.'));
    el.appendChild(card);
    const acts = h('div', 'c2-actions');
    const yes = h('button', 'buy-btn', 'Auftrag annehmen');
    yes.disabled = Jobs.freeSlots(s) < 1;
    yes.classList.toggle('disabled', yes.disabled);
    if (yes.disabled) yes.textContent = 'Keine freien Auftragsplätze';
    yes.addEventListener('click', () => {
      const r = Customers.acceptJob(s, c);
      if (r.ok) { result = { kind: 'ok', text: '✓ Auftrag angenommen: ' + r.job.title + '. Du findest ihn im Büro unter „Aufträge“' + (r.job.pcId ? ' und den Kunden-PC an der Werkbank unter „Meine PCs“.' : '.') }; cb.onJobAccepted(r); }
      else { result = { kind: 'err', text: '✗ ' + r.message }; cb.onFailure(r); }
      render();
    });
    acts.appendChild(yes);
    const no = h('button', 'btn ghost', 'Ablehnen');
    no.addEventListener('click', () => { Customers.declineJob(s, c); result = { kind: 'info', text: 'Du hast den Auftrag abgelehnt.' }; cb.onChange(); render(); });
    acts.appendChild(no);
    el.appendChild(acts);
  }

  function handleSellResult(r) {
    const s = S();
    if (!r.ok) { result = { kind: 'err', text: '✗ ' + r.message }; cb.onFailure(r); render(); return; }
    if (r.sold) {
      result = { kind: 'ok', text: '✓ Verkauft: ' + r.what + ' für ' + eur(r.price) + ' (Gewinn ' + eur(r.profit) + '). Bewertung ' + '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars) + ' – „' + r.text + '“' };
      selected = null;
      cb.onSold(r);
    } else {
      result = { kind: 'err', text: '✗ ' + r.message };
      cb.onFailure(r);
    }
    cb.onChange();
    render();
  }

  function render() {
    if (!els) return;
    const s = S();
    els.money.textContent = '€ ' + UI.nf(Economy.balance());
    const keep = els.body.scrollTop;
    clear(els.body);
    const c = Customers.front();
    if ((c ? c.id : null) !== lastCustomerId) {
      // anderer Kunde an der Kasse: Auswahl zurücksetzen, die Meldung zum letzten Verkauf bleibt stehen
      selected = null;
      if (!(result && result.kind === 'ok')) result = null;
      lastCustomerId = c ? c.id : null;
    }

    const sum = h('div', 'sumline');
    sum.appendChild(h('span', '', 'Kunden im Laden: ' + Customers.list.length));
    sum.appendChild(h('span', '', 'In der Schlange: ' + Customers.waiting()));
    sum.appendChild(h('span', '', 'Ruf ★ ' + s.rep));
    els.body.appendChild(sum);
    if (result) els.body.appendChild(h('div', 'msg ' + (result.kind === 'ok' ? 'ok' : result.kind === 'err' ? 'err' : 'info'), result.text));
    if (!c) {
      const open = Progress.dayTime(s) < Progress.DAY_SECONDS * 0.85;
      els.body.appendChild(h('div', 'empty', open ? 'Gerade wartet niemand an der Kasse. Kunden kommen durch die Tür (rechts unten) und stöbern erst im Laden.' : 'Der Laden hat Feierabend – bis zum Tagesende kommen keine neuen Kunden mehr.'));
      const tipp = h('div', 'pricenote', 'Tipp: Gute Preise und kurze Wartezeiten machen zufriedene Kunden und steigern deinen Ruf.');
      els.body.appendChild(tipp);
      return;
    }
    els.body.appendChild(customerCard(c));
    if (c.want.kind === 'part') renderPart(els.body, c);
    else if (c.want.kind === 'pc') renderPc(els.body, c);
    else renderJob(els.body, c);
    if (c.want.kind !== 'job') {
      const bye = h('button', 'btn small ghost', 'Kunden verabschieden');
      bye.addEventListener('click', () => {
        const r = Customers.dismiss(s, c);
        result = { kind: 'info', text: 'Der Kunde geht.' + (r.rep && r.rep.delta < 0 ? ' (Ruf ' + r.rep.delta + ', du hättest helfen können.)' : '') };
        selected = null; cb.onChange(); render();
      });
      els.body.appendChild(bye);
    }
    els.body.scrollTop = keep;
  }

  function init(callbacks) {
    cb = Object.assign(cb, callbacks || {});
    els = { panel: document.getElementById('counterPanel'), money: document.getElementById('counterMoney'), body: document.getElementById('counterBody') };
    document.getElementById('counterClose').addEventListener('click', () => { close(); cb.onClose(); });
  }
  function open() {
    selected = null; result = null; lastCustomerId = null;
    els.panel.classList.remove('hidden');
    render();
  }
  function close() { els.panel.classList.add('hidden'); }
  return { init, open, close, refresh: render, isOpen: () => els && !els.panel.classList.contains('hidden'), servingId: () => { const c = Customers.front(); return c ? c.id : null; } };
})();

window.CounterUI = CounterUI;
