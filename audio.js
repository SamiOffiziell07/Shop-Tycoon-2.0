// audio.js – einfache Klänge per Web Audio (keine Audiodateien nötig): Bestätigung, Fehler, Kasse, Lieferung,
// Türglocke, PC-Start und ein leises Lüfterrauschen an der Werkbank. Lautstärke und Ein/Aus kommen aus den Einstellungen.
'use strict';

const Sfx = (() => {
  let ctx = null;
  let master = null;
  let getSettings = () => ({ sound: true, volume: 7 });
  let fan = null;

  function volume() {
    const s = getSettings();
    if (!s.sound) return 0;
    const v = Number.isFinite(s.volume) ? s.volume : 7;
    return Math.max(0, Math.min(10, v)) / 10;
  }
  function ensure() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      master.gain.value = volume() * 0.9;
      return true;
    } catch (e) {
      return false; // Ton ist optional
    }
  }
  // Einzelner Ton: Frequenz, Dauer, Wellenform, Startverzögerung, Lautstärke
  function tone(freq, dur, type, delay, gain) {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  const SOUNDS = {
    click() { tone(520, 0.05, 'triangle', 0, 0.1); },
    ok() { tone(660, 0.1, 'triangle'); tone(880, 0.14, 'triangle', 0.09); },
    error() { tone(200, 0.18, 'square', 0, 0.12); tone(150, 0.22, 'square', 0.12, 0.12); },
    coin() { tone(988, 0.08, 'square', 0, 0.09); tone(1319, 0.28, 'square', 0.07, 0.09); },
    sale() { tone(784, 0.1, 'triangle'); tone(988, 0.1, 'triangle', 0.09); tone(1319, 0.3, 'triangle', 0.18); },
    buy() { tone(440, 0.08, 'triangle'); tone(554, 0.1, 'triangle', 0.07); },
    delivery() { tone(1046, 0.5, 'sine', 0, 0.16); tone(1568, 0.7, 'sine', 0.05, 0.1); },
    door() { tone(784, 0.25, 'sine', 0, 0.1); tone(587, 0.35, 'sine', 0.2, 0.1); },
    boot() { tone(900, 0.09, 'square', 0, 0.07); },
    bootFail() { tone(300, 0.35, 'sawtooth', 0, 0.09); tone(300, 0.35, 'sawtooth', 0.5, 0.09); tone(300, 0.35, 'sawtooth', 1.0, 0.09); },
    bootOk() { tone(523, 0.1, 'triangle'); tone(659, 0.1, 'triangle', 0.1); tone(784, 0.1, 'triangle', 0.2); tone(1046, 0.3, 'triangle', 0.3); },
    levelUp() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.11, 0.14)); },
    toggle() { tone(740, 0.12, 'triangle'); },
  };

  return {
    init(settingsGetter) { getSettings = settingsGetter; },
    unlock() { ensure(); },
    play(name) {
      if (volume() === 0) return;
      if (!ensure()) return;
      const f = SOUNDS[name];
      if (f) { try { f(); } catch (e) { /* ignorieren */ } }
    },
    // Lüfterrauschen (leises, gefiltertes Rauschen), solange ein PC an der Werkbank läuft
    startFan() {
      if (fan || volume() === 0 || !ensure()) return;
      try {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 420;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        src.connect(f).connect(g).connect(master);
        src.start();
        fan = { src, g };
      } catch (e) { fan = null; }
    },
    stopFan() {
      if (!fan) return;
      try { fan.src.stop(); } catch (e) { /* ignorieren */ }
      fan = null;
    },
    setVolumeNow() { if (master) master.gain.value = volume() * 0.9; },
  };
})();

if (typeof window !== 'undefined') window.Sfx = Sfx;
