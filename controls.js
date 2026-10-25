// controls.js – Touch-Steuerung (virtueller Joystick links, Umsehen rechts) plus Tastatur/Maus zum Testen.
'use strict';

class Controls {
  constructor(opts) {
    this.joyZone = opts.joyZone; // Element: linke Bildschirmhälfte
    this.lookZone = opts.lookZone; // Element: rechte Bildschirmhälfte
    this.joyBase = opts.joyBase;
    this.joyKnob = opts.joyKnob;
    this.onInteract = opts.onInteract || (() => {});
    this.lookSensitivity = 0.0052; // Radiant pro Pixel
    this.invertY = false;
    this.enabled = true;

    this.move = { x: 0, y: 0 }; // x = seitlich, y = vorwärts (+1)
    this.lookDX = 0;
    this.lookDY = 0;
    this.keys = {};
    this.joyId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.joyRadius = 56;
    this.lookId = null;
    this.lookLast = { x: 0, y: 0 };

    this._bindTouch();
    this._bindKeyboardMouse();
  }

  _bindTouch() {
    const jz = this.joyZone;
    const lz = this.lookZone;

    jz.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType === 'mouse' || this.joyId !== null) return;
      this.joyId = e.pointerId;
      jz.setPointerCapture(e.pointerId);
      this.joyCenter = { x: e.clientX, y: e.clientY };
      this.joyBase.style.display = 'block';
      this.joyBase.style.left = e.clientX + 'px';
      this.joyBase.style.top = e.clientY + 'px';
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      e.preventDefault();
    });
    jz.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      let dx = e.clientX - this.joyCenter.x;
      let dy = e.clientY - this.joyCenter.y;
      const len = Math.hypot(dx, dy);
      if (len > this.joyRadius) {
        dx = (dx / len) * this.joyRadius;
        dy = (dy / len) * this.joyRadius;
      }
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / this.joyRadius;
      const ny = dy / this.joyRadius;
      const dead = 0.12;
      const mag = Math.hypot(nx, ny);
      if (mag < dead) {
        this.move.x = 0;
        this.move.y = 0;
      } else {
        this.move.x = nx;
        this.move.y = -ny;
      }
      e.preventDefault();
    });
    const endJoy = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.move.x = 0;
      this.move.y = 0;
      this.joyBase.style.display = 'none';
    };
    jz.addEventListener('pointerup', endJoy);
    jz.addEventListener('pointercancel', endJoy);

    lz.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType === 'mouse' || this.lookId !== null) return;
      this.lookId = e.pointerId;
      lz.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    lz.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.lookDX += e.clientX - this.lookLast.x;
      this.lookDY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    const endLook = (e) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    lz.addEventListener('pointerup', endLook);
    lz.addEventListener('pointercancel', endLook);

    // Browser-Gesten (Zoomen, Kontextmenü) in den Spielbereichen unterdrücken
    for (const el of [jz, lz]) {
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    }
  }

  _bindKeyboardMouse() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyE' || e.code === 'Space') this.onInteract();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    // Maus (nur Desktop-Test): Ziehen mit gedrückter Taste dreht die Kamera
    let dragging = false;
    let last = { x: 0, y: 0 };
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      this.lookZone.setPointerCapture(e.pointerId);
    });
    this.lookZone.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerType !== 'mouse') return;
      this.lookDX += e.clientX - last.x;
      this.lookDY += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
    });
    this.lookZone.addEventListener('pointerup', () => (dragging = false));
    this.lookZone.addEventListener('pointercancel', () => (dragging = false));
  }

  // Liefert Bewegungsvektor (x seitlich, y vorwärts) inkl. Tastatur
  getMove() {
    let x = this.move.x;
    let y = this.move.y;
    if (this.keys.KeyW || this.keys.ArrowUp) y += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) y -= 1;
    if (this.keys.KeyD) x += 1;
    if (this.keys.KeyA) x -= 1;
    if (this.keys.ArrowLeft) this.lookDX -= 6;
    if (this.keys.ArrowRight) this.lookDX += 6;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // Abgeholte Blickänderung seit dem letzten Aufruf (in Radiant)
  consumeLook() {
    const dyaw = this.lookDX * this.lookSensitivity;
    const dpitch = this.lookDY * this.lookSensitivity * (this.invertY ? -1 : 1);
    this.lookDX = 0;
    this.lookDY = 0;
    return { dyaw, dpitch };
  }

  // Alles zurücksetzen, z. B. beim Pausieren
  reset() {
    this.move.x = this.move.y = 0;
    this.lookDX = this.lookDY = 0;
    this.keys = {};
    this.joyId = null;
    this.lookId = null;
    this.joyBase.style.display = 'none';
  }
}

window.Controls = Controls;
