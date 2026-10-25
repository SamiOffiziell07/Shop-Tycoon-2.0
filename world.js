// world.js – Aufbau des 3D-Ladens: Boxen, Kollisionen, interaktive Objekte, Ausbau-Gruppen und Werkbank-PC.
'use strict';

function hex(h) {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

function buildWorld() {
  const boxes = [];
  const colliders = []; // { minX, maxX, minZ, maxZ, group? }
  const interactables = []; // { id, x, z, radius, label }
  const named = {}; // Boxen, die sich zur Laufzeit ändern (Bildschirme, LEDs, Werkbank-PC)
  const groups = {}; // Ausbau-Gruppen: Name -> Boxen (ein-/ausblendbar)
  const groupOn = {};
  let curGroup = null;

  // Hilfsfunktion: Box mittig bei (x, y, z) mit Größe (w, h, d)
  function add(x, y, z, w, h, d, color, opts) {
    const b = Object.assign({ x, y, z, w, h, d, rot: 0, color: hex(color), emissive: 0, shine: 0, pat: 0 }, opts || {});
    if (curGroup) { b.hidden = true; groups[curGroup].push(b); }
    boxes.push(b);
    return b;
  }
  // Box, die auf dem Boden steht, inkl. Kollision
  function solid(x, z, w, d, h, color, opts) {
    add(x, h / 2, z, w, h, d, color, opts);
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    if (curGroup) c.group = curGroup;
    colliders.push(c);
  }
  function group(name, fn) {
    groups[name] = [];
    groupOn[name] = false;
    curGroup = name;
    fn();
    curGroup = null;
  }

  const W = 16, D = 12, H = 3.2; // Raumgröße in Metern
  const hx = W / 2, hz = D / 2;

  // Boden, Teppich, Decke
  add(0, -0.05, 0, W, 0.1, D, 0x6a7380, { pat: 1, shine: 0.35 });
  add(0, 0.01, 0.5, 3.2, 0.02, 10.5, 0x2c4f7c, { pat: 2 });
  add(0, H + 0.05, 0, W, 0.1, D, 0xe8eaee);

  // Wände (dünne Quader)
  add(0, H / 2, -hz - 0.05, W + 0.2, H, 0.1, 0xd9dde3, { pat: 5 });
  add(0, H / 2, hz + 0.05, W + 0.2, H, 0.1, 0xd9dde3, { pat: 5 });
  add(-hx - 0.05, H / 2, 0, 0.1, H, D + 0.2, 0xd9dde3, { pat: 5 });
  add(hx + 0.05, H / 2, 0, 0.1, H, D + 0.2, 0xd9dde3, { pat: 5 });
  // Sockelleiste
  add(0, 0.08, -hz + 0.02, W, 0.16, 0.04, 0x3b4048);
  add(0, 0.08, hz - 0.02, W, 0.16, 0.04, 0x3b4048);
  add(-hx + 0.02, 0.08, 0, 0.04, 0.16, D, 0x3b4048);
  add(hx - 0.02, 0.08, 0, 0.04, 0.16, D, 0x3b4048);
  // Deckenbalken
  for (const bx of [-6, -2, 2, 6]) add(bx, H - 0.08, 0, 0.18, 0.16, D, 0xcfd3da);
  // Farbiger Streifen an der Nordwand + Schild (Farbe ändert sich mit der Ladenstufe)
  add(0, 2.55, -hz + 0.03, 12, 0.5, 0.04, 0x1f6fd1);
  named.sign = add(0, 2.55, -hz + 0.06, 5.2, 0.3, 0.03, 0xf2f5fa, { emissive: 0.25 });
  named.stripe = boxes[boxes.length - 2];
  // Eingangstür (Südwand)
  add(5, 1.1, hz - 0.03, 1.3, 2.2, 0.06, 0x2a8a91, { shine: 0.5 });
  add(5, 1.1, hz - 0.07, 0.9, 1.6, 0.04, 0xa6dfe6, { emissive: 0.3 });
  // Schaufenster daneben (Südwand)
  add(1.8, 1.4, hz - 0.04, 3.0, 1.6, 0.05, 0x9fd3e8, { emissive: 0.22, shine: 0.7 });
  add(1.8, 0.55, hz - 0.1, 3.0, 0.1, 0.12, 0x444a54);

  // Deckenlampen
  for (const lx of [-4.5, 0, 4.5]) {
    for (const lz of [-3.5, 0, 3.5]) {
      add(lx, H - 0.03, lz, 1.6, 0.06, 0.5, 0xffffff, { emissive: 0.9 });
    }
  }

  // ---------- Regale (Westwand), Hardware-Ausstellung ----------
  const shelfCartons = []; // Kartons im Regal: je nach Lagerbestand sichtbar (siehe setShelfFill)
  const shelfColors = [0xe05a47, 0x3aa86b, 0x4b7bd6, 0xe0b13a, 0x8a5ad6, 0x35b8c4];
  for (let i = 0; i < 3; i++) {
    const z = -3.8 + i * 3.4;
    const x = -hx + 0.45;
    solid(x, z, 0.8, 2.6, 0.06, 0x555b66); // Fuß (Kollision für das ganze Regal)
    colliders[colliders.length - 1].minX = x - 0.4;
    add(x, 1.05, z, 0.8, 2.1, 0.05, 0x40454f);
    add(x - 0.37, 1.05, z, 0.04, 2.1, 2.6, 0x4a505b);
    for (let row = 0; row < 4; row++) {
      const y = 0.3 + row * 0.55;
      add(x, y, z, 0.8, 0.04, 2.6, 0x6b7380, { shine: 0.3, pat: 4 });
      // Verpackungen (Kartons) auf dem Regalboden
      for (let k = 0; k < 6; k++) {
        const c = shelfColors[(k + row + i) % shelfColors.length];
        const bh = 0.18 + ((k * 7 + row * 3) % 4) * 0.04;
        const carton = add(x + 0.08, y + 0.02 + bh / 2, z - 1.05 + k * 0.42, 0.45, bh, 0.34, c);
        const label = add(x + 0.31, y + 0.02 + bh / 2, z - 1.05 + k * 0.42, 0.01, bh * 0.45, 0.22, 0xf4f6fa); // Etikett
        shelfCartons.push([carton, label]);
      }
    }
    // Kategorie-Schild über dem Regal
    add(x + 0.38, 2.28, z, 0.03, 0.2, 1.6, [0x3a7bd5, 0x34a853, 0xe0a030][i], { emissive: 0.4 });
    interactables.push({ id: 'shelf', x: x + 0.9, z, radius: 1.9, label: 'Hardware einkaufen' });
  }

  // ---------- Verkaufstresen (Ostseite, vorne) ----------
  solid(5.2, 2.6, 3.4, 0.9, 1.05, 0x2f3a4a, { pat: 5 });
  add(5.2, 1.08, 2.6, 3.5, 0.06, 1.0, 0xcfd5de, { shine: 0.8 });
  add(5.9, 1.3, 2.55, 0.5, 0.4, 0.35, 0x20242b); // Kassenterminal
  named.till = add(5.9, 1.5, 2.45, 0.42, 0.26, 0.04, 0x39d0ff, { emissive: 0.6 });
  add(4.3, 1.12, 2.6, 0.34, 0.02, 0.5, 0xf2c94c, { emissive: 0.3 }); // Geldfach
  interactables.push({ id: 'counter', x: 4.6, z: 4.6, radius: 2.6, label: 'Kasse bedienen' });

  // ---------- Ausstellungs-PCs mit Monitoren (Ostwand) ----------
  named.showcase = [];
  for (let i = 0; i < 3; i++) {
    const z = -4.2 + i * 1.7;
    solid(hx - 0.6, z, 0.9, 1.3, 0.78, 0x8b6b47, { pat: 3 });
    add(hx - 0.6, 0.82, z, 0.94, 0.04, 1.34, 0xb08d62, { pat: 3, shine: 0.3 });
    add(hx - 0.38, 1.15, z, 0.05, 0.68, 1.0, 0x16191f); // Monitor-Rahmen
    const screen = add(hx - 0.42, 1.15, z, 0.03, 0.6, 0.9, 0x233a5c, { emissive: 0.0, shine: 0.5 });
    named['screen' + i] = screen;
    add(hx - 0.5, 0.96, z, 0.14, 0.18, 0.14, 0x16191f); // Monitorfuß
    // Ausstellungs-PC: kleines Gehäuse mit RGB-Streifen
    add(hx - 0.7, 0.99, z - 0.45, 0.24, 0.34, 0.2, 0x20242b, { shine: 0.5 });
    const strip = add(hx - 0.7, 0.99, z - 0.345, 0.02, 0.26, 0.01, 0x35e0ff, { emissive: 0 });
    named.showcase.push({ screen, strip, z });
    interactables.push({ id: 'screen' + i, x: hx - 1.6, z, radius: 1.5, label: 'Bildschirm an/aus' });
  }

  // ---------- Werkbank (Mitte hinten) mit offenem PC-Gehäuse ----------
  const bx = 0, bz = -3.6;
  solid(bx, bz, 4.2, 1.4, 0.88, 0x6e7885, { pat: 4 });
  add(bx, 0.9, bz, 4.3, 0.06, 1.5, 0xa4adb9, { shine: 0.7 });
  add(bx, 0.98, bz + 0.55, 4.0, 0.02, 0.3, 0x2a2f38); // Antistatik-Matte
  // Offenes Gehäuse: Boden, Rückwand, Seitenteile, Oberseite (Seite zum Spieler offen)
  const cx = 0, cz = bz, cy = 0.93;
  const pc = (named.pc = {});
  pc.base = add(cx, cy + 0.01, cz, 0.9, 0.04, 0.48, 0x3a404c, { shine: 0.3 });
  pc.back = add(cx, cy + 0.34, cz - 0.23, 0.9, 0.7, 0.03, 0x474e5c, { shine: 0.3 });
  pc.left = add(cx - 0.44, cy + 0.34, cz, 0.03, 0.7, 0.48, 0x3a404c, { shine: 0.3 });
  pc.right = add(cx + 0.44, cy + 0.34, cz, 0.03, 0.7, 0.48, 0x3a404c, { shine: 0.3 });
  pc.top = add(cx, cy + 0.69, cz, 0.9, 0.03, 0.48, 0x3a404c, { shine: 0.3 });
  // Mainboard (grün) mit Sockel, RAM, Grafikkarte, Kühler, Netzteil
  pc.mb = add(cx + 0.02, cy + 0.34, cz - 0.2, 0.62, 0.52, 0.015, 0x2f9a4e);
  pc.cpu = add(cx - 0.05, cy + 0.42, cz - 0.185, 0.1, 0.1, 0.02, 0xc9ced6); // CPU
  pc.cooler = add(cx - 0.05, cy + 0.42, cz - 0.16, 0.14, 0.14, 0.05, 0x7b8594, { shine: 0.5 }); // Kühlerblock
  pc.coolerFan = add(cx - 0.05, cy + 0.42, cz - 0.12, 0.12, 0.12, 0.02, 0x15181d); // Lüfter
  named.fan = pc.coolerFan;
  pc.aio = add(cx - 0.3, cy + 0.6, cz - 0.1, 0.34, 0.07, 0.12, 0x20242b); // Radiator (AiO), standardmäßig verborgen
  pc.aio.hidden = true;
  pc.ram = [];
  for (let r = 0; r < 4; r++) {
    pc.ram.push(add(cx + 0.14 + r * 0.03, cy + 0.44, cz - 0.17, 0.018, 0.2, 0.03, r % 2 ? 0x2d6cdf : 0x3b82f6)); // RAM
  }
  pc.gpu = add(cx - 0.02, cy + 0.2, cz - 0.1, 0.5, 0.07, 0.22, 0x23262d, { shine: 0.5 }); // Grafikkarte
  pc.gpuLed = add(cx - 0.02, cy + 0.2, cz + 0.0, 0.5, 0.02, 0.02, 0xff4d6d, { emissive: 0.0 }); // GPU-LED-Leiste
  named.led = pc.gpuLed;
  pc.psu = add(cx + 0.2, cy + 0.07, cz - 0.04, 0.34, 0.12, 0.36, 0x2f3540); // Netzteil
  pc.cable = add(cx + 0.3, cy + 0.2, cz - 0.1, 0.03, 0.2, 0.03, 0xe0b13a); // Kabelbündel
  pc.ssd = add(cx + 0.28, cy + 0.34, cz - 0.185, 0.14, 0.01, 0.04, 0x8ca0c0, { emissive: 0.1 }); // M.2/SSD
  pc.fans = [];
  for (let f = 0; f < 4; f++) {
    pc.fans.push(add(cx - 0.425, cy + 0.14 + f * 0.14, cz + 0.02 - 0.0, 0.02, 0.12, 0.12, 0x15181d)); // Gehäuselüfter links
  }
  pc.glow = add(cx, cy + 0.68, cz + 0.2, 0.84, 0.012, 0.012, 0x35e0ff, { emissive: 0 }); // RGB-Streifen
  // Werkzeug auf der Bank
  add(-1.4, 0.95, bz + 0.45, 0.22, 0.04, 0.06, 0xd9453a); // Schraubendreher
  add(-1.1, 0.94, bz + 0.45, 0.14, 0.03, 0.1, 0x2d2f33); // Pinzette
  add(1.4, 0.96, bz + 0.1, 0.34, 0.06, 0.22, 0x36393f); // Teilebox
  add(1.4, 1.0, bz + 0.1, 0.3, 0.03, 0.18, 0xf2c94c);
  interactables.push({ id: 'bench', x: bx, z: bz + 1.7, radius: 2.0, label: 'Werkbank benutzen' });

  // Hocker an der Werkbank
  solid(-2.6, -2.2, 0.4, 0.4, 0.55, 0x394152);

  // ---------- Büro-Schreibtisch (Nordwand, links) ----------
  solid(-4.5, -5.35, 1.8, 0.7, 0.75, 0x8b6b47, { pat: 3 });
  add(-4.5, 0.77, -5.35, 1.84, 0.04, 0.74, 0xb08d62, { pat: 3, shine: 0.3 });
  add(-4.5, 1.12, -5.55, 0.7, 0.4, 0.04, 0x16191f);
  named.officeScreen = add(-4.5, 1.12, -5.52, 0.62, 0.33, 0.01, 0x39d0ff, { emissive: 0.5 });
  add(-4.5, 0.82, -5.5, 0.1, 0.1, 0.1, 0x16191f);
  add(-4.5, 0.795, -5.2, 0.42, 0.015, 0.14, 0x2a2f38); // Tastatur
  add(-5.2, 0.9, -5.4, 0.3, 0.18, 0.04, 0xf2f5fa); // Ordner
  interactables.push({ id: 'office', x: -4.5, z: -4.2, radius: 1.8, label: 'Büro: Bestellungen & Finanzen' });

  // Lieferungsstapel nahe der Tür (erscheint nach Lieferungen)
  named.deliveries = [];
  for (let i = 0; i < 4; i++) {
    const b = add(7.0 - (i % 2) * 0.55, 0.22 + Math.floor(i / 2) * 0.4, 5.0 + (i % 2) * 0.1, 0.5, 0.4, 0.45, i % 2 ? 0xb88a50 : 0xc79a5d);
    add(7.0 - (i % 2) * 0.55, 0.22 + Math.floor(i / 2) * 0.4 + 0.2, 5.0 + (i % 2) * 0.1, 0.5, 0.012, 0.12, 0xe8d8b0);
    b.hidden = true;
    boxes[boxes.length - 1].hidden = true;
    named.deliveries.push([b, boxes[boxes.length - 1]]);
  }

  // Zierpflanze
  solid(-6.4, 5.2, 0.5, 0.5, 0.55, 0x8a5a3c);
  add(-6.4, 0.9, 5.2, 0.55, 0.7, 0.55, 0x3e9b52);

  // ---------- Ausbau-Gruppen (erscheinen nach dem Kauf) ----------
  group('shelves', () => {
    solid(-3.0, 5.55, 2.8, 0.5, 0.06, 0x555b66);
    add(-3.0, 1.0, 5.78, 2.8, 2.0, 0.04, 0x40454f);
    for (let row = 0; row < 3; row++) {
      add(-3.0, 0.4 + row * 0.55, 5.55, 2.8, 0.04, 0.5, 0x6b7380, { shine: 0.3 });
      for (let k = 0; k < 7; k++) {
        const bh = 0.2 + ((k + row) % 3) * 0.04;
        add(-4.1 + k * 0.37, 0.43 + row * 0.55 + bh / 2, 5.55, 0.3, bh, 0.34, shelfColors[(k * 2 + row) % shelfColors.length]);
      }
    }
  });
  group('storage1', () => {
    solid(3.6, -5.55, 1.6, 0.5, 1.8, 0x39424f);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) add(3.1 + k * 0.33, 0.45 + row * 0.6, -5.3, 0.28, 0.35, 0.02, 0xc79a5d);
  });
  group('storage2', () => {
    solid(5.4, -5.55, 1.6, 0.5, 1.8, 0x39424f);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) add(4.9 + k * 0.33, 0.45 + row * 0.6, -5.3, 0.28, 0.35, 0.02, 0xb88a50);
  });
  group('storage3', () => {
    solid(4.5, -4.75, 1.5, 0.45, 2.2, 0x2f3a4a);
    for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) add(4.05 + k * 0.3, 0.4 + row * 0.55, -4.53, 0.25, 0.32, 0.02, 0xd0a560);
  });
  group('counter2', () => {
    add(4.4, 1.3, 2.55, 0.5, 0.4, 0.35, 0x20242b);
    add(4.4, 1.5, 2.45, 0.42, 0.26, 0.04, 0x39d0ff, { emissive: 0.6 });
  });
  group('ambiente', () => {
    for (const z of [-4, 0, 4]) add(-7.88, 2.6, z, 0.06, 0.1, 2.0, 0xffd9a0, { emissive: 1.0 });
    solid(7.2, 4.4, 0.5, 0.5, 0.55, 0x8a5a3c);
    add(7.2, 0.9, 4.4, 0.55, 0.7, 0.55, 0x3e9b52);
  });
  group('tester', () => {
    add(1.0, 1.0, bz + 0.5, 0.28, 0.1, 0.18, 0x20242b);
    add(1.0, 1.06, bz + 0.5, 0.2, 0.02, 0.1, 0x35e0ff, { emissive: 0.7 });
  });
  group('tools1', () => {
    add(-1.9, 1.6, -hz + 0.05, 1.2, 0.8, 0.03, 0x40454f); // Werkzeugwand
    for (let k = 0; k < 5; k++) add(-2.3 + k * 0.2, 1.6, -hz + 0.08, 0.05, 0.4, 0.02, [0xd9453a, 0xf2c94c, 0x35b8c4, 0xd9453a, 0x8a5ad6][k]);
  });
  group('tools2', () => {
    add(1.9, 1.6, -hz + 0.05, 1.2, 0.8, 0.03, 0x40454f);
    for (let k = 0; k < 5; k++) add(1.5 + k * 0.2, 1.6, -hz + 0.08, 0.05, 0.4, 0.02, [0x3aa86b, 0xe0b13a, 0x4b7bd6, 0xd9453a, 0x35b8c4][k]);
  });
  group('marketing1', () => {
    add(1.0, 1.5, hz - 0.11, 0.7, 0.9, 0.02, 0xf2c94c, { emissive: 0.3 });
    add(1.0, 1.7, hz - 0.12, 0.5, 0.1, 0.01, 0x1f6fd1);
  });
  group('marketing2', () => {
    add(2.6, 1.5, hz - 0.11, 0.7, 0.9, 0.02, 0x35b8c4, { emissive: 0.3 });
    add(0, 2.9, hz - 0.05, 6.0, 0.2, 0.04, 0x1f6fd1, { emissive: 0.5 });
  });
  group('expand', () => {
    add(0, 0.015, 3.5, 5.0, 0.01, 1.4, 0x1f6fd1, { pat: 2 });
    add(-6.9, 2.6, 4.9, 0.04, 0.5, 2.0, 0x35b8c4, { emissive: 0.7 });
  });

  // ---------- Beschilderung (Texturen entstehen im Renderer aus dem Text) ----------
  // Aufhängung des Kassenschilds
  for (const sx of [-0.7, 0.7]) add(5.2 + sx, 2.95, 2.19, 0.02, 0.55, 0.02, 0x20242b);
  const signs = [
    { text: 'COMPUTER SHOP TYCOON', x: 0, y: 2.55, z: -hz + 0.082, w: 5.2, h: 0.3, rot: 0, bg: '#0f2a4d', fg: '#ffffff', glow: 1.0 },
    { text: 'HARDWARE-EINKAUF', x: -hx + 0.07, y: 2.78, z: -0.4, w: 3.2, h: 0.55, rot: Math.PI / 2, bg: '#14532d', fg: '#ffffff', glow: 1.0 },
    { text: 'WERKBANK', x: 0, y: 2.05, z: -hz + 0.07, w: 1.8, h: 0.42, rot: 0, bg: '#7c3a0a', fg: '#ffffff', glow: 1.0 },
    { text: 'BÜRO', x: -4.5, y: 2.15, z: -hz + 0.07, w: 1.3, h: 0.4, rot: 0, bg: '#4c1d95', fg: '#ffffff', glow: 1.0 },
    { text: 'KASSE', x: 5.2, y: 2.45, z: 2.2, w: 1.5, h: 0.42, rot: 0, bg: '#854d0e', fg: '#ffffff', glow: 1.0 },
    { text: 'KASSE', x: 5.2, y: 2.45, z: 2.18, w: 1.5, h: 0.42, rot: Math.PI, bg: '#854d0e', fg: '#ffffff', glow: 1.0 },
    { text: 'AUSSTELLUNG', x: hx - 0.07, y: 2.3, z: -2.5, w: 2.2, h: 0.46, rot: -Math.PI / 2, bg: '#0c4a6e', fg: '#ffffff', glow: 1.0 },
    { text: 'GEÖFFNET', x: 5, y: 2.45, z: hz - 0.08, w: 1.2, h: 0.3, rot: Math.PI, bg: '#14532d', fg: '#bbf7d0', glow: 1.0 },
  ];

  // Schaufenster-Plakate zeigen Ausbau nur nach dem Kauf; Sichtbarkeit setzt setUpgrades
  function setUpgrades(up) {
    for (const g of Object.keys(groups)) {
      const on = !!(up && up[g]);
      groupOn[g] = on;
      for (const b of groups[g]) b.hidden = !on;
    }
  }

  // Reihenfolge, in der Kartons verschwinden, wenn das Lager leerer wird (fest gemischt, damit es natürlich aussieht)
  const hideOrder = shelfCartons.map((_, i) => i);
  let hs = 12345;
  for (let i = hideOrder.length - 1; i > 0; i--) {
    hs = (hs * 1664525 + 1013904223) % 4294967296;
    const j = hs % (i + 1);
    [hideOrder[i], hideOrder[j]] = [hideOrder[j], hideOrder[i]];
  }
  // fill 0..1: Anteil der gefüllten Regalplätze (mindestens ein Sockel an Kartons bleibt sichtbar, damit der Laden nie leer wirkt)
  function setShelfFill(fill) {
    const total = shelfCartons.length;
    const show = Math.max(14, Math.min(total, Math.round(14 + fill * (total - 14))));
    for (let k = 0; k < total; k++) {
      const hidden = k >= show;
      const pair = shelfCartons[hideOrder[k]];
      pair[0].hidden = hidden;
      pair[1].hidden = hidden;
    }
  }

  return {
    boxes,
    setShelfFill,
    colliders,
    interactables,
    named,
    signs,
    groups,
    groupOn,
    setUpgrades,
    bounds: { minX: -hx + 0.35, maxX: hx - 0.35, minZ: -hz + 0.35, maxZ: hz - 0.35 },
    start: { x: 0.0, z: 4.6, yaw: 0 },
  };
}

window.buildWorld = buildWorld;
