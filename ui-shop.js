// ui-shop.js – Büro-Oberfläche: Einkauf (mit Lieferanten und Warenkorb) und Lager.
// Die übrigen Reiter (Bestellungen, Aufträge, Finanzen, Ausbau) zeichnet OfficeUI (ui-office.js).
// Zeigt nur an und ruft Procurement/Inventory auf; die Spielregeln liegen in suppliers.js, economy.js und inventory.js.
'use strict';

const ShopUI = (() => {
  const { h, eur, nf, duration, icon, specTable, dataState, SUMMARY, clear } = UI;
  let els = null;
  let cb = { onClose() {}, onOrder() {}, onFailure() {}, getState: () => null, onChange() {} };
  let tab = 'shop'; // 'shop' | 'stock' | 'orders' | 'jobs' | 'finance' | 'upgrades'
  let supplier = 'lokal';
  let cat = 'all';
  let selectedId = null;
  let qty = 1;
  let view = 'detail'; // 'detail' | 'cart'
  let message = null; // { kind: 'ok' | 'err', text }
  let sortBy = 'price';
  let brand = 'all';
  let onlyAvail = false;
  let tickTimer = 0;
  const carts = {}; // Lieferant -> { produktId: Menge }

  const S = () => cb.getState();
  const PAGE_TABS = ['orders', 'jobs', 'finance', 'upgrades', 'goals'];

  function cartOf(sup) { return carts[sup] || (carts[sup] = {}); }
  function cartLines(sup) { return Object.keys(cartOf(sup)).map((id) => ({ id, qty: cartOf(sup)[id] })); }

  function setMessage(kind, text) { message = text ? { kind, text } : null; }
  function showDetailMode(on) { els.panel.classList.toggle('show-detail', !!on); }

  function perfScore(it) {
    if (it.perf) return Math.max.apply(null, Object.values(it.perf));
    return it.tier * 20;
  }

  // ---------- Daten für Liste ----------
  function visibleItems() {
    if (tab === 'stock') return Inventory.all().filter((r) => cat === 'all' || r.item.category === cat).map((r) => r.item);
    let src = cat === 'all' ? HardwareDB.all() : HardwareDB.list(cat);
    if (brand !== 'all') src = src.filter((i) => i.brand === brand);
    if (onlyAvail) src = src.filter((i) => Procurement.offer(S(), supplier, i.id).available);
    return src;
  }
  function sorted(items) {
    const order = HardwareDB.CATEGORIES;
    const byCat = (a, b) => order.indexOf(a.category) - order.indexOf(b.category);
    const price = (it) => (tab === 'shop' ? Procurement.price(supplier, it.id, S()) : it.buyPrice);
    const arr = items.slice();
    if (sortBy === 'price') arr.sort((a, b) => byCat(a, b) || price(a) - price(b));
    else if (sortBy === 'priceDesc') arr.sort((a, b) => byCat(a, b) || price(b) - price(a));
    else if (sortBy === 'perf') arr.sort((a, b) => byCat(a, b) || perfScore(b) - perfScore(a));
    else if (sortBy === 'name') arr.sort((a, b) => byCat(a, b) || a.name.localeCompare(b.name, 'de'));
    else if (sortBy === 'stock') arr.sort((a, b) => Inventory.count(b.id) - Inventory.count(a.id) || byCat(a, b));
    else arr.sort((a, b) => {
      const oa = Procurement.offer(S(), supplier, a.id).stock, ob = Procurement.offer(S(), supplier, b.id).stock;
      return ob - oa || byCat(a, b);
    });
    return arr;
  }

  // ---------- Aktionen ----------
  function selectItem(id) {
    selectedId = id;
    qty = 1;
    view = 'detail';
    setMessage(null);
    renderList();
    renderDetail();
    renderCartBar();
    showDetailMode(true);
    els.detail.scrollTop = 0;
  }
  function setTab(t) {
    tab = t;
    cat = 'all';
    selectedId = null;
    qty = 1;
    view = 'detail';
    brand = 'all';
    setMessage(null);
    showDetailMode(false);
    render();
    cb.onChange && cb.onChange(t);
  }
  function setCategory(c) {
    cat = c;
    selectedId = null;
    qty = 1;
    setMessage(null);
    showDetailMode(false);
    render();
  }
  function setSupplier(id) {
    supplier = id;
    qty = 1;
    setMessage(null);
    render();
    if (selectedId) showDetailMode(true);
  }

  function addToCart() {
    const it = HardwareDB.get(selectedId);
    if (!it) return;
    const offer = Procurement.offer(S(), supplier, it.id);
    if (!offer.listed || !offer.available) {
      setMessage('err', '✗ ' + (offer.reason || 'Nicht lieferbar') + '.');
      cb.onFailure();
      renderDetail(true);
      return;
    }
    const c = cartOf(supplier);
    const have = c[it.id] || 0;
    const next = Math.min(have + qty, offer.stock);
    if (next === have) {
      setMessage('err', '✗ Mehr als ' + offer.stock + ' Stück sind bei diesem Lieferanten heute nicht lieferbar.');
      cb.onFailure();
    } else {
      c[it.id] = next;
      setMessage('ok', '✓ ' + (next - have) + '× im Warenkorb. Insgesamt ' + next + ' Stück.');
      UI.sound('click');
    }
    renderCartBar();
    renderDetail(true);
  }

  function setLineQty(id, q) {
    const c = cartOf(supplier);
    const offer = Procurement.offer(S(), supplier, id);
    if (q <= 0) delete c[id];
    else c[id] = Math.min(q, Math.max(1, offer.stock));
    renderCartView();
    renderCartBar();
  }

  function addSet(set) {
    const c = cartOf(supplier);
    let added = 0;
    const skipped = [];
    for (const id of set.parts) {
      const offer = Procurement.offer(S(), supplier, id);
      if (offer.listed && offer.available) {
        const have = c[id] || 0;
        if (have < offer.stock) { c[id] = have + 1; added++; }
      } else {
        skipped.push(HardwareDB.get(id).name + ' (' + (offer.reason || 'nicht lieferbar') + ')');
      }
    }
    setMessage(added ? 'ok' : 'err', added ? '✓ ' + added + ' Teile des Sets liegen im Warenkorb.' + (skipped.length ? ' Nicht lieferbar bei diesem Lieferanten: ' + skipped.join(', ') + '.' : '') : '✗ Dieses Set ist bei diesem Lieferanten nicht lieferbar. Wähle „Eckhardt Computerhandel“.');
    renderCartView();
    renderCartBar();
  }

  function placeOrder() {
    const lines = cartLines(supplier);
    const result = Procurement.place(S(), supplier, lines);
    if (result.ok) {
      carts[supplier] = {};
      const sup = Procurement.supplier(supplier);
      setMessage('ok', '✓ Bestellung #' + result.order.id + ' bei ' + sup.short + ' aufgegeben (' + eur(result.total) + '). Lieferung in ca. ' + duration(result.seconds) + '. Du findest sie unter „Bestellungen“.');
      cb.onOrder(result);
    } else {
      setMessage('err', '✗ ' + result.message + ' Es wurde nichts abgebucht.');
      cb.onFailure(result);
    }
    renderHeader();
    renderList();
    renderCartView();
    renderCartBar();
  }

  // ---------- Darstellung ----------
  function renderHeader() {
    els.money.textContent = '€ ' + nf(Economy.balance());
    els.badge.textContent = String(Inventory.totalPieces());
    const s = S();
    const open = s ? Procurement.openOrders(s).length : 0;
    els.ordersBadge.textContent = String(open);
    els.ordersBadge.classList.toggle('hidden', open === 0);
    const jobs = s ? Jobs.active(s).length : 0;
    els.jobsBadge.textContent = String(jobs);
    els.jobsBadge.classList.toggle('hidden', jobs === 0);
    for (const [name, el] of Object.entries(els.tabs)) {
      el.classList.toggle('active', tab === name);
      el.setAttribute('aria-selected', tab === name);
    }
    els.supBar.classList.toggle('hidden', tab !== 'shop');
    const isPage = PAGE_TABS.includes(tab);
    els.cats.classList.toggle('hidden', isPage);
    els.body.classList.toggle('hidden', isPage);
    els.page.classList.toggle('hidden', !isPage);
  }

  function renderSuppliers() {
    clear(els.supBar);
    if (tab !== 'shop') return;
    const s = S();
    for (const sup of Procurement.SUPPLIERS) {
      const unlocked = Procurement.unlocked(s, sup.id);
      const b = h('button', 'sup' + (sup.id === supplier ? ' active' : '') + (unlocked ? '' : ' locked'));
      b.appendChild(h('b', '', sup.short));
      b.appendChild(h('small', '', unlocked ? duration(sup.delivery) + ' · Versand ' + eur(sup.shipping) : '🔒 ab Stufe ' + sup.level));
      b.addEventListener('click', () => {
        if (!unlocked) { setMessage('err', '✗ ' + sup.name + ' liefert erst ab Ladenstufe ' + sup.level + ' (' + Progress.LEVELS[sup.level - 1].name + ').'); UI.notify(message.text, 'err'); return; }
        setSupplier(sup.id);
      });
      els.supBar.appendChild(b);
    }
    const sup = Procurement.supplier(supplier);
    const evToday = Progress.currentEvent(s);
    if (evToday) els.supBar.appendChild(h('div', 'eventnote', '📣 Heute: ' + evToday.name + ' – ' + evToday.desc));
    const note = h('div', 'supnote', sup.name + ': ' + sup.desc + ' Preise ' + (sup.priceMult === 1 ? 'normal' : sup.priceMult > 1 ? '+' + Math.round((sup.priceMult - 1) * 100) + ' %' : '−' + Math.round((1 - sup.priceMult) * 100) + ' %') + '.');
    els.supBar.appendChild(note);
  }

  function renderCats() {
    clear(els.cats);
    const add = (key, label, count) => {
      const b = h('button', 'cat' + (cat === key ? ' active' : ''), label);
      if (count !== undefined) b.appendChild(h('small', '', String(count)));
      b.addEventListener('click', () => setCategory(key));
      els.cats.appendChild(b);
    };
    const countFor = (c) => (tab === 'stock' ? Inventory.byCategory(c).reduce((s, r) => s + r.count, 0) : HardwareDB.list(c).length);
    add('all', 'Alle', tab === 'stock' ? Inventory.totalPieces() : HardwareDB.count());
    for (const c of HardwareDB.CATEGORIES) {
      const n = countFor(c);
      if (tab === 'stock' && n === 0 && cat !== c) continue;
      add(c, HardwareDB.CATEGORY_NAMES[c], n);
    }
  }

  function renderToolbar() {
    const bar = h('div', 'toolbar');
    const sort = h('select', 'tsel');
    sort.setAttribute('aria-label', 'Sortierung');
    const opts = tab === 'shop'
      ? [['price', 'Preis aufsteigend'], ['priceDesc', 'Preis absteigend'], ['perf', 'Leistung'], ['name', 'Name'], ['avail', 'Verfügbarkeit']]
      : [['price', 'Preis aufsteigend'], ['priceDesc', 'Preis absteigend'], ['perf', 'Leistung'], ['name', 'Name'], ['stock', 'Bestand']];
    for (const [v, t] of opts) { const o = h('option', '', t); o.value = v; if (v === sortBy) o.selected = true; sort.appendChild(o); }
    sort.addEventListener('change', () => { sortBy = sort.value; renderList(); });
    bar.appendChild(sort);
    // Herstellerfilter
    const brands = Array.from(new Set((cat === 'all' ? HardwareDB.all() : HardwareDB.list(cat)).map((i) => i.brand))).sort((a, b) => a.localeCompare(b, 'de'));
    const bsel = h('select', 'tsel');
    bsel.setAttribute('aria-label', 'Hersteller');
    const o0 = h('option', '', 'Alle Hersteller'); o0.value = 'all'; bsel.appendChild(o0);
    for (const b of brands) { const o = h('option', '', b); o.value = b; if (b === brand) o.selected = true; bsel.appendChild(o); }
    bsel.addEventListener('change', () => { brand = bsel.value; renderList(); });
    if (tab === 'shop') bar.appendChild(bsel);
    if (tab === 'shop') {
      const lab = h('label', 'tcheck');
      const cbx = h('input'); cbx.type = 'checkbox'; cbx.checked = onlyAvail;
      cbx.addEventListener('change', () => { onlyAvail = cbx.checked; renderList(); });
      lab.appendChild(cbx); lab.appendChild(document.createTextNode(' nur lieferbar'));
      bar.appendChild(lab);
      const cartBtn = h('button', 'tbtn', '🧰 Sets & Warenkorb');
      cartBtn.addEventListener('click', () => { view = 'cart'; selectedId = selectedId; renderCartView(); showDetailMode(true); });
      bar.appendChild(cartBtn);
    }
    return bar;
  }

  function renderList() {
    const keep = els.list.scrollTop;
    clear(els.list);
    els.list.appendChild(renderToolbar());
    const items = sorted(visibleItems());
    const s = S();
    if (!items.length) {
      const box = h('div', 'empty');
      if (tab === 'stock') {
        box.appendChild(h('div', '', Inventory.totalPieces() === 0 ? 'Dein Lager ist leer. Bestelle Hardware im Einkauf.' : 'In dieser Kategorie liegt nichts im Lager.'));
        const b = h('button', 'btn primary', 'Zum Einkauf');
        b.addEventListener('click', () => setTab('shop'));
        box.appendChild(b);
      } else {
        box.appendChild(h('div', '', 'Keine Produkte für diese Auswahl.'));
      }
      els.list.appendChild(box);
      return;
    }
    for (const it of items) {
      const row = h('button', 'row-item' + (it.id === selectedId && view === 'detail' ? ' selected' : ''));
      row.appendChild(icon(it, 'row-ico'));
      const main = h('div', 'row-main');
      main.appendChild(h('div', 'row-name', it.name));
      main.appendChild(h('div', 'row-sub', SUMMARY[it.category] ? SUMMARY[it.category](it.specs) : ''));
      row.appendChild(main);
      const side = h('div', 'row-side');
      const n = Inventory.count(it.id);
      if (tab === 'shop') {
        const offer = Procurement.offer(s, supplier, it.id);
        if (!offer.listed) row.classList.add('dim');
        side.appendChild(h('div', '', offer.listed ? eur(offer.price) : '–'));
        const st = h('span', 'stock' + (offer.available ? '' : ' none'), offer.listed ? (offer.available ? 'heute ' + offer.stock + '×' : 'ausverkauft') : 'nicht im Sortiment');
        side.appendChild(st);
        if (n) side.appendChild(h('span', 'stock', 'Lager: ' + n));
      } else {
        side.appendChild(h('div', '', n + '×'));
        const r = Inventory.reserved(it.id);
        side.appendChild(h('span', 'stock' + (r ? '' : ' none'), r ? r + ' reserviert' : eur(it.sellPrice)));
      }
      row.appendChild(side);
      row.addEventListener('click', () => selectItem(it.id));
      els.list.appendChild(row);
    }
    els.list.scrollTop = keep;
  }

  function supplierTable(it) {
    const s = S();
    const wrap = h('div', 'suptable');
    wrap.appendChild(h('div', 'subhead', 'Lieferanten im Vergleich'));
    for (const sup of Procurement.SUPPLIERS) {
      const unlocked = Procurement.unlocked(s, sup.id);
      const offer = Procurement.offer(s, sup.id, it.id);
      const row = h('button', 'suprow' + (sup.id === supplier ? ' active' : '') + (!unlocked || !offer.listed ? ' dim' : ''));
      row.appendChild(h('span', 'sn', sup.short));
      row.appendChild(h('span', 'sp', !unlocked ? '🔒 Stufe ' + sup.level : offer.listed ? eur(offer.price) : 'nicht im Sortiment'));
      row.appendChild(h('span', 'ss', !unlocked || !offer.listed ? '' : (offer.available ? offer.stock + ' heute · ' : 'ausverkauft · ') + duration(sup.delivery)));
      row.addEventListener('click', () => { if (unlocked) setSupplier(sup.id); });
      wrap.appendChild(row);
    }
    return wrap;
  }

  function renderDetail(keepScroll) {
    if (view === 'cart' && tab === 'shop') { renderCartView(); return; }
    const prevScroll = els.detail.scrollTop;
    clear(els.detail);
    const it = selectedId ? HardwareDB.get(selectedId) : null;
    if (!it) {
      els.detail.appendChild(h('div', 'empty', tab === 'stock' ? 'Wähle links ein Teil, um Details zu sehen.' : 'Wähle links eine Komponente, um Details zu sehen.'));
      return;
    }
    const s = S();
    const inner = h('div', 'det-inner');
    const back = h('button', 'shop-btn back-list', '← Zur Liste');
    back.addEventListener('click', () => showDetailMode(false));
    els.detail.appendChild(back);

    const top = h('div', 'det-top');
    top.appendChild(icon(it, 'det-ico'));
    const t = h('div');
    t.appendChild(h('div', 'det-name', it.name));
    t.appendChild(h('div', 'det-brand', it.brand + ' · ' + HardwareDB.CATEGORY_NAMES[it.category]));
    top.appendChild(t);
    inner.appendChild(top);

    const n = Inventory.count(it.id);
    const r = Inventory.reserved(it.id);
    const inc = Procurement.incoming(s, it.id);
    const stockLine = 'Im Lager: ' + n + ' Stück' + (r ? ' (davon ' + r + ' reserviert)' : '') + (inc ? ' · Unterwegs: ' + inc : '') + (n ? ' · Wert ' + eur(n * it.buyPrice) : '');
    inner.appendChild(h('div', 'stocknow', stockLine));
    inner.appendChild(h('p', 'det-desc', it.desc));
    inner.appendChild(specTable(it));

    const prices = h('div', 'prices');
    const buyAt = tab === 'shop' ? Procurement.price(supplier, it.id, s) : it.buyPrice;
    const supLabel = tab === 'shop' ? 'Einkauf (' + Procurement.supplier(supplier).short + ')' : 'Listen-Einkaufspreis';
    const p1 = h('div', 'price-box'); p1.appendChild(h('span', '', supLabel)); p1.appendChild(h('b', '', eur(buyAt)));
    const p2 = h('div', 'price-box'); p2.appendChild(h('span', '', 'Verkauf im Laden')); p2.appendChild(h('b', '', eur(it.sellPrice)));
    const gain = Shop.margin(it, buyAt);
    const p3 = h('div', 'price-box'); p3.appendChild(h('span', '', 'Gewinn je Stück')); p3.appendChild(h('b', gain >= 0 ? 'plus' : 'minus', (gain >= 0 ? '+' : '') + eur(gain)));
    prices.appendChild(p1); prices.appendChild(p2); prices.appendChild(p3);
    inner.appendChild(prices);
    inner.appendChild(h('p', 'pricenote', 'Spielpreise, keine aktuellen Marktpreise. Leistungswerte sind Spielwerte, keine Messwerte. Der Verkaufspreis ist der Listenpreis; du kannst an der Kasse einen anderen Preis verlangen.'));
    if (tab === 'shop') inner.appendChild(supplierTable(it));
    inner.appendChild(dataState(it));
    els.detail.appendChild(inner);

    const bar = h('div', 'buybar');
    if (tab === 'stock') {
      const again = h('button', 'buy-btn secondary', 'Im Einkauf nachbestellen');
      again.addEventListener('click', () => {
        tab = 'shop'; cat = it.category; selectedId = it.id; qty = 1; view = 'detail'; setMessage(null);
        render(); showDetailMode(true);
      });
      bar.appendChild(again);
      els.detail.appendChild(bar);
      if (keepScroll) els.detail.scrollTop = prevScroll;
      return;
    }

    const offer = Procurement.offer(s, supplier, it.id);
    const sup = Procurement.supplier(supplier);
    const row = h('div', 'qty-row');
    const minus = h('button', 'qbtn', '−'); minus.setAttribute('aria-label', 'Menge verringern');
    const val = h('div', 'qval', String(qty));
    const plus = h('button', 'qbtn', '+'); plus.setAttribute('aria-label', 'Menge erhöhen');
    const total = h('div', 'total');
    const buy = h('button', 'buy-btn');
    const maxQ = Math.max(1, Math.min(Procurement.MAX_LINE_QTY, offer.stock || 1));
    const refresh = () => {
      qty = Math.max(1, Math.min(maxQ, qty));
      val.textContent = String(qty);
      total.textContent = offer.listed ? eur((offer.price || 0) * qty) : '–';
      buy.textContent = !offer.listed ? 'Nicht im Sortiment' : !offer.available ? 'Heute ausverkauft' : 'In den Warenkorb · ' + qty + '×';
      buy.disabled = !offer.listed || !offer.available;
      buy.classList.toggle('disabled', buy.disabled);
      row.querySelectorAll('.qchip').forEach((c) => c.classList.toggle('active', Number(c.dataset.q) === qty));
    };
    minus.addEventListener('click', () => { qty--; refresh(); });
    plus.addEventListener('click', () => { qty++; refresh(); });
    row.appendChild(minus); row.appendChild(val); row.appendChild(plus);
    for (const q of [1, 5, 10]) {
      const c = h('button', 'qchip', '×' + q); c.dataset.q = String(q);
      c.addEventListener('click', () => { qty = q; refresh(); });
      row.appendChild(c);
    }
    row.appendChild(total);
    bar.appendChild(row);
    bar.appendChild(h('div', 'delivnote', 'Lieferzeit bei ' + sup.short + ': ca. ' + duration(sup.delivery) + ' · Versand ' + eur(sup.shipping) + ' je Bestellung.'));
    buy.addEventListener('click', addToCart);
    bar.appendChild(buy);
    if (message) bar.appendChild(h('div', 'msg ' + message.kind, message.text));
    els.detail.appendChild(bar);
    refresh();
    if (keepScroll) els.detail.scrollTop = prevScroll;
  }

  function renderCartView() {
    if (tab !== 'shop') return;
    clear(els.detail);
    const s = S();
    const sup = Procurement.supplier(supplier);
    const inner = h('div', 'det-inner');
    const back = h('button', 'shop-btn back-list', '← Zur Liste');
    back.addEventListener('click', () => showDetailMode(false));
    els.detail.appendChild(back);
    inner.appendChild(h('div', 'det-name', 'Warenkorb · ' + sup.name));
    const lines = cartLines(supplier);
    if (!lines.length) inner.appendChild(h('p', 'det-desc', 'Der Warenkorb ist leer. Wähle links ein Produkt oder nimm ein fertiges Set.'));
    let pieces = 0;
    for (const l of lines) {
      const it = HardwareDB.get(l.id);
      const offer = Procurement.offer(s, supplier, l.id);
      const row = h('div', 'cartline');
      const nm = h('div', 'cl-name', it.name);
      nm.appendChild(h('small', '', eur(offer.price || 0) + ' je Stück' + (offer.available ? '' : ' · nicht mehr lieferbar')));
      row.appendChild(nm);
      const minus = h('button', 'qbtn small', '−'); minus.addEventListener('click', () => setLineQty(l.id, l.qty - 1));
      const plus = h('button', 'qbtn small', '+'); plus.addEventListener('click', () => setLineQty(l.id, l.qty + 1));
      row.appendChild(minus); row.appendChild(h('div', 'qval', String(l.qty))); row.appendChild(plus);
      const del = h('button', 'qbtn small', '✕'); del.setAttribute('aria-label', 'Entfernen'); del.addEventListener('click', () => setLineQty(l.id, 0));
      row.appendChild(del);
      inner.appendChild(row);
      pieces += l.qty;
    }
    const q = lines.length ? Procurement.quote(s, supplier, lines) : null;
    if (q) {
      const sum = h('div', 'cartsum');
      sum.appendChild(h('div', '', 'Waren: ' + eur(q.subtotal)));
      sum.appendChild(h('div', '', 'Versand: ' + eur(q.shipping)));
      sum.appendChild(h('b', '', 'Gesamt: ' + eur(q.total)));
      sum.appendChild(h('div', 'small', 'Lieferung ca. ' + duration(sup.delivery) + ' nach der Bestellung. Das Geld wird sofort abgebucht.'));
      const room = Inventory.capacity() - Inventory.totalPieces() - Procurement.incomingTotal(s);
      sum.appendChild(h('div', 'small', 'Lagerplatz: ' + Math.max(0, room) + ' Stück frei (nach allen offenen Bestellungen), dieser Warenkorb: ' + pieces + ' Stück.'));
      inner.appendChild(sum);
    }
    inner.appendChild(h('div', 'subhead', 'Fertige Teile-Sets'));
    for (const set of Shop.SETS) {
      const b = h('button', 'setbtn');
      b.appendChild(h('b', '', set.name));
      b.appendChild(h('small', '', set.desc));
      const priceSum = set.parts.reduce((a, id) => a + (Procurement.price(supplier, id, s) || 0), 0);
      b.appendChild(h('small', '', set.parts.length + ' Teile · ca. ' + eur(Economy.round2(priceSum)) + ' bei ' + sup.short));
      b.addEventListener('click', () => addSet(set));
      inner.appendChild(b);
    }
    els.detail.appendChild(inner);
    const bar = h('div', 'buybar');
    const order = h('button', 'buy-btn', lines.length ? 'Jetzt bestellen · ' + eur(q ? q.total : 0) : 'Warenkorb ist leer');
    order.disabled = !lines.length;
    order.classList.toggle('disabled', !lines.length);
    order.addEventListener('click', placeOrder);
    bar.appendChild(order);
    if (lines.length) {
      const clr = h('button', 'buy-btn secondary', 'Warenkorb leeren');
      clr.addEventListener('click', () => { carts[supplier] = {}; setMessage(null); renderCartView(); renderCartBar(); });
      bar.appendChild(clr);
    }
    if (message) bar.appendChild(h('div', 'msg ' + message.kind, message.text));
    els.detail.appendChild(bar);
  }

  function renderCartBar() {
    const lines = tab === 'shop' ? cartLines(supplier) : [];
    els.cartBar.classList.toggle('hidden', !lines.length);
    clear(els.cartBar);
    if (!lines.length) return;
    const s = S();
    const q = Procurement.quote(s, supplier, lines);
    const pieces = lines.reduce((a, l) => a + l.qty, 0);
    els.cartBar.appendChild(h('span', 'cb-text', '🛒 ' + pieces + ' Teile · ' + (q ? eur(q.total) : '–')));
    const view1 = h('button', 'tbtn', 'Ansehen');
    view1.addEventListener('click', () => { view = 'cart'; renderCartView(); showDetailMode(true); });
    els.cartBar.appendChild(view1);
  }

  function render() {
    renderHeader();
    renderSuppliers();
    if (PAGE_TABS.includes(tab)) {
      OfficeUI.render(tab, els.page, { state: S(), onChange: refresh, notify: UI.notify, goto: (t, opts) => setTab(t), cb });
      renderCartBar();
      return;
    }
    renderCats();
    renderList();
    renderDetail();
    renderCartBar();
  }

  function refresh() {
    if (!els) return;
    renderHeader();
    if (PAGE_TABS.includes(tab)) {
      OfficeUI.render(tab, els.page, { state: S(), onChange: refresh, notify: UI.notify, goto: (t) => setTab(t), cb });
    } else {
      // Neu zeichnen, aber die Bildlaufposition der Liste und der Details behalten (z. B. bei einer Lieferung im Hintergrund)
      renderSuppliers();
      renderCats();
      renderList();
      renderDetail(true);
      renderCartBar();
    }
  }

  // ---------- Öffentliche Funktionen ----------
  function init(callbacks) {
    cb = Object.assign(cb, callbacks || {});
    els = {
      panel: document.getElementById('shopPanel'),
      money: document.getElementById('shopMoney'),
      badge: document.getElementById('stockBadge'),
      ordersBadge: document.getElementById('ordersBadge'),
      jobsBadge: document.getElementById('jobsBadge'),
      tabs: {
        shop: document.getElementById('tabShop'), stock: document.getElementById('tabStock'), orders: document.getElementById('tabOrders'),
        jobs: document.getElementById('tabJobs'), finance: document.getElementById('tabFinance'), upgrades: document.getElementById('tabUpgrades'), goals: document.getElementById('tabGoals'),
      },
      supBar: document.getElementById('supBar'),
      cats: document.getElementById('shopCats'),
      body: document.querySelector('#shopPanel .shop-body'),
      list: document.getElementById('shopList'),
      detail: document.getElementById('shopDetail'),
      page: document.getElementById('pageBody'),
      cartBar: document.getElementById('cartBar'),
    };
    document.getElementById('shopClose').addEventListener('click', () => { close(); cb.onClose(); });
    for (const [name, el] of Object.entries(els.tabs)) el.addEventListener('click', () => setTab(name));
  }

  function open(startTab, itemId) {
    tab = ['shop', 'stock', 'orders', 'jobs', 'finance', 'upgrades', 'goals'].includes(startTab) ? startTab : 'shop';
    cat = 'all';
    brand = 'all';
    selectedId = itemId && HardwareDB.has(itemId) ? itemId : null;
    qty = 1;
    view = 'detail';
    // Lieferant: freigeschalteten wählen
    if (!Procurement.unlocked(S(), supplier)) supplier = 'lokal';
    setMessage(null);
    els.panel.classList.remove('hidden');
    showDetailMode(!!selectedId);
    render();
    if (tab === 'shop') cb.onShopOpened && cb.onShopOpened();
  }

  function close() {
    els.panel.classList.add('hidden');
  }

  // Wird regelmäßig aufgerufen, damit Zähler (Lieferzeit, Fristen) laufen
  function tick(dt) {
    if (!els || els.panel.classList.contains('hidden')) return;
    tickTimer += dt;
    if (tickTimer < 0.5) return;
    tickTimer = 0;
    renderHeader();
    if (tab === 'orders' || tab === 'jobs') OfficeUI.update(tab, els.page, S());
    if (tab === 'shop') { /* Warenkorb bleibt unverändert */ }
  }

  return {
    init, open, close, refresh, tick,
    isOpen: () => els && !els.panel.classList.contains('hidden'),
    currentTab: () => tab,
    hasCart: () => cartLines(supplier).length > 0,
  };
})();

window.ShopUI = ShopUI;
