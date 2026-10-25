// engine.js – kleiner WebGL2-Renderer ohne externe Bibliotheken.
// Zeichnet beleuchtete Quader (Boxen) mit Nebel, Deckenlampen als Punktlichtern, farbigen Zusatzlichtern (RGB-Gehäuse,
// Bildschirme), einfachen Glanzlichtern und prozeduralen Oberflächenmustern (Fliesen, Teppich, Holz, Metall).
// Alles wird im Shader berechnet: keine Texturdateien nötig, geringer Speicherbedarf für mobile Geräte.
'use strict';

const Mat4 = {
  identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },
  perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  // Kamera-Matrix aus Position, Blickrichtung (yaw/pitch)
  view(px, py, pz, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Rechts, Hoch, Vorwärts (Vorwärts zeigt nach -Z bei yaw = 0)
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    const rx = cy, ry = 0, rz = -sy;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    // Sicherstellen, dass "Hoch" nach oben zeigt
    const s = uy < 0 ? -1 : 1;
    const Ux = ux * s, Uy = uy * s, Uz = uz * s;
    return new Float32Array([
      rx, Ux, -fx, 0,
      ry, Uy, -fy, 0,
      rz, Uz, -fz, 0,
      -(rx * px + ry * py + rz * pz),
      -(Ux * px + Uy * py + Uz * pz),
      (fx * px + fy * py + fz * pz),
      1,
    ]);
  },
  // Modell-Matrix: Skalierung, Drehung um Y, Verschiebung
  model(x, y, z, sx, sy, sz, rotY) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return new Float32Array([
      c * sx, 0, -s * sx, 0,
      0, sy, 0, 0,
      s * sz, 0, c * sz, 0,
      x, y, z, 1,
    ]);
  },
};

const MAX_ACCENTS = 8;

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uRotY;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  float c = cos(uRotY), s = sin(uRotY);
  vNormal = vec3(c * aNormal.x + s * aNormal.z, aNormal.y, -s * aNormal.x + c * aNormal.z);
  gl_Position = uViewProj * world;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform float uEmissive;
uniform float uShine;
uniform int uPat;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform int uAccentCount;
uniform vec4 uAccentPos[${MAX_ACCENTS}];
uniform vec3 uAccentCol[${MAX_ACCENTS}];
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Deckenlampen: die der Kamera nächsten Lampen werden vom Programm übergeben (weniger bei niedriger Qualität)
uniform vec3 uLamps[9];
uniform int uLampCount;

void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 base = uColor;

  // Oberflächenmuster
  float pat = 1.0;
  if (uPat == 1) { // Fliesen
    vec2 g = vWorld.xz * 0.8;
    vec2 f = fract(g);
    float line = step(f.x, 0.03) + step(f.y, 0.03);
    pat = (1.0 - 0.16 * min(line, 1.0)) * (0.95 + 0.07 * hash(floor(g)));
  } else if (uPat == 2) { // Teppich
    pat = 0.88 + 0.22 * hash(floor(vWorld.xz * 60.0));
  } else if (uPat == 3) { // Holz
    float w = sin(vWorld.x * 22.0 + sin(vWorld.z * 7.0 + vWorld.y * 5.0) * 1.5 + hash(floor(vWorld.zx * 3.0)) * 3.0);
    pat = 0.9 + 0.1 * w;
  } else if (uPat == 4) { // gebürstetes Metall
    pat = 0.92 + 0.08 * hash(vec2(floor(vWorld.x * 90.0 + vWorld.z * 90.0), floor(vWorld.y * 4.0)));
  } else if (uPat == 5) { // Wandpaneele
    vec2 g = vec2(vWorld.x + vWorld.z, vWorld.y) * vec2(0.9, 1.0);
    float l = step(fract(g.x), 0.015);
    pat = 1.0 - 0.1 * l;
  }
  base *= pat;

  vec3 sun = normalize(vec3(0.35, 0.9, 0.25));
  float diffuse = max(dot(n, sun), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float fill = max(dot(n, normalize(vec3(-0.6, 0.2, -0.5))), 0.0) * 0.25;
  float bounce = max(-n.y, 0.0) * 0.55;
  vec3 light = vec3(0.30, 0.32, 0.38) * hemi + vec3(0.55, 0.54, 0.5) * diffuse + vec3(0.2, 0.22, 0.3) * fill + vec3(0.5, 0.52, 0.56) * bounce;

  // Punktlichter der Deckenlampen (weiche Abnahme) und Glanz
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    if (i >= uLampCount) break;
    vec3 L = uLamps[i] - vWorld;
    float d = length(L);
    L /= d;
    float att = 1.0 / (1.0 + 0.09 * d * d);
    float nl = max(dot(n, L), 0.0);
    light += vec3(0.62, 0.6, 0.55) * nl * att * 0.55;
    if (uShine > 0.0) {
      vec3 H = normalize(L + V);
      spec += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, H), 0.0), 36.0) * att * uShine;
    }
  }
  // Farbige Zusatzlichter (RGB, Bildschirme)
  vec3 accent = vec3(0.0);
  for (int i = 0; i < ${MAX_ACCENTS}; i++) {
    if (i >= uAccentCount) break;
    vec3 L = uAccentPos[i].xyz - vWorld;
    float d = length(L);
    float r = uAccentPos[i].w;
    float att = max(0.0, 1.0 - d / r);
    att *= att;
    float nl = 0.35 + 0.65 * max(dot(n, L / d), 0.0);
    accent += uAccentCol[i] * att * nl;
  }

  // Dunkler Übergang am Boden (einfache Raumabschattung)
  float ao = mix(0.74, 1.0, smoothstep(0.0, 0.45, vWorld.y));
  vec3 col = base * light * ao + base * uEmissive + spec * 0.6 + accent * (0.35 + 0.65 * base);
  col = vec3(1.0) - exp(-col * 1.45); // weiche Abblendung, damit helle Lampenbereiche nicht ausbrennen
  float d = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-uFogDensity * d * d);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

// Schilder: Rechtecke mit einer Textur, die aus einer 2D-Zeichenfläche (Text) erzeugt wird
const SIGN_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec2 vUV;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vUV = aUV;
  gl_Position = uViewProj * world;
}`;

const SIGN_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uGlow;
out vec4 outColor;
void main() {
  vec3 col = texture(uTex, vUV).rgb * uGlow;
  col = vec3(1.0) - exp(-col * 1.45);
  float d = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-uFogDensity * d * d);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt.');
    this.gl = gl;
    // Auf dem iPhone kann der Browser die Grafik im Hintergrund verwerfen: dann nicht weiterzeichnen und dem Spiel Bescheid geben
    this.contextLost = false;
    this.onContextRestored = null;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; if (this.onContextRestored) this.onContextRestored(); });
    this.program = this._program(VERT, FRAG);
    gl.useProgram(this.program);
    this.u = {};
    for (const n of ['uViewProj', 'uModel', 'uRotY', 'uColor', 'uEmissive', 'uShine', 'uPat', 'uCamPos', 'uFogColor', 'uFogDensity', 'uAccentCount', 'uTime', 'uLampCount']) {
      this.u[n] = gl.getUniformLocation(this.program, n);
    }
    this.u.uLamps = gl.getUniformLocation(this.program, 'uLamps[0]');
    this.u.uAccentPos = gl.getUniformLocation(this.program, 'uAccentPos[0]');
    this.u.uAccentCol = gl.getUniformLocation(this.program, 'uAccentCol[0]');
    this._buildCube();
    this._buildSigns();
    this.signs = [];
    this.clearColor = [0.62, 0.7, 0.82];
    this.fogDensity = 0.0016;
    this.fov = (68 * Math.PI) / 180;
    this.pixelRatioCap = 2;
    this.accents = []; // [{ x, y, z, radius, r, g, b }]
    this.lightLevel = 2; // 0 = keine Zusatzlichter, 1 = wenige, 2 = alle
    this.drawCalls = 0;
    this.lamps = [];
    for (const lx of [-4.5, 0, 4.5]) for (const lz of [-3.5, 0, 3.5]) this.lamps.push([lx, 3.1, lz]);
    this.lampBuf = new Float32Array(27);
    this.accentPos = new Float32Array(MAX_ACCENTS * 4);
    this.accentCol = new Float32Array(MAX_ACCENTS * 3);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.resize();
  }

  _program(vs, fs) {
    const gl = this.gl;
    const make = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('Shader-Fehler: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Programm-Fehler: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  _buildCube() {
    const gl = this.gl;
    // Einheitswürfel von -0.5 bis 0.5, 6 Seiten, je 4 Ecken (Gegen-Uhrzeigersinn von außen gesehen)
    const faces = [
      { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
      { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
      { n: [1, 0, 0], v: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
      { n: [-1, 0, 0], v: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, 1, 0], v: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
      { n: [0, -1, 0], v: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
    ];
    const data = [];
    const idx = [];
    faces.forEach((f, i) => {
      f.v.forEach((p) => data.push(p[0], p[1], p[2], f.n[0], f.n[1], f.n[2]));
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.indexCount = idx.length;
  }

  _buildSigns() {
    const gl = this.gl;
    this.signProgram = this._program(SIGN_VERT, SIGN_FRAG);
    this.su = {};
    for (const n of ['uViewProj', 'uModel', 'uTex', 'uCamPos', 'uFogColor', 'uFogDensity', 'uGlow']) this.su[n] = gl.getUniformLocation(this.signProgram, n);
    // Rechteck (Breite 1, Höhe 1) in der x-y-Ebene, schaut nach +z
    const data = new Float32Array([
      -0.5, -0.5, 0, 0, 0,
      0.5, -0.5, 0, 1, 0,
      0.5, 0.5, 0, 1, 1,
      -0.5, 0.5, 0, 0, 1,
    ]);
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(this.vao);
  }

  // Schild hinzufügen: spec = { text, x, y, z, w, h, rot, bg, fg, glow }. rot=0 schaut nach +z, π/2 nach +x, π nach -z, -π/2 nach -x.
  addSign(spec) {
    const gl = this.gl;
    const pxW = 512, pxH = Math.max(64, Math.round(512 * (spec.h / spec.w)));
    const cv = document.createElement('canvas');
    cv.width = pxW; cv.height = pxH;
    const g = cv.getContext('2d');
    g.fillStyle = spec.bg || '#12345c';
    g.fillRect(0, 0, pxW, pxH);
    g.strokeStyle = spec.fg || '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(6, 6, pxW - 12, pxH - 12);
    let size = Math.floor(pxH * 0.56);
    g.font = '800 ' + size + 'px -apple-system, "Helvetica Neue", Arial, sans-serif';
    while (g.measureText(spec.text).width > pxW - 40 && size > 10) { size -= 2; g.font = '800 ' + size + 'px -apple-system, "Helvetica Neue", Arial, sans-serif'; }
    g.fillStyle = spec.fg || '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(spec.text, pxW / 2, pxH / 2 + size * 0.04);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Zeichenfläche hat die erste Zeile oben
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.signs.push({ tex, x: spec.x, y: spec.y, z: spec.z, w: spec.w, h: spec.h, rot: spec.rot || 0, glow: spec.glow || 1.0 });
  }

  _drawSigns(cam, viewProj, c) {
    if (!this.signs.length) return;
    const gl = this.gl;
    gl.useProgram(this.signProgram);
    gl.bindVertexArray(this.quadVao);
    gl.uniformMatrix4fv(this.su.uViewProj, false, viewProj);
    gl.uniform3f(this.su.uCamPos, cam.x, cam.y, cam.z);
    gl.uniform3f(this.su.uFogColor, c[0], c[1], c[2]);
    gl.uniform1f(this.su.uFogDensity, this.fogDensity);
    gl.uniform1i(this.su.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const s of this.signs) {
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.uniformMatrix4fv(this.su.uModel, false, Mat4.model(s.x, s.y, s.z, s.w, s.h, 1, s.rot));
      gl.uniform1f(this.su.uGlow, s.glow);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
  }

  setQualityScale(scale) {
    this.pixelRatioCap = scale;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / h;
  }

  // Die nächsten Deckenlampen wählen: niedrig 3, mittel 6, hoch 9 (spart Rechenzeit auf dem Handy)
  _uploadLamps(cam) {
    const n = this.lightLevel === 0 ? 3 : this.lightLevel === 1 ? 5 : 9;
    const sorted = this.lamps.slice().sort((a, b) => Math.hypot(a[0] - cam.x, a[2] - cam.z) - Math.hypot(b[0] - cam.x, b[2] - cam.z));
    for (let i = 0; i < n; i++) this.lampBuf.set(sorted[i], i * 3);
    this.gl.uniform1i(this.u.uLampCount, n);
    this.gl.uniform3fv(this.u.uLamps, this.lampBuf);
  }

  _uploadAccents(cam) {
    let list = this.accents;
    if (this.lightLevel === 0) list = [];
    else {
      // Die nächsten Lichter zuerst; bei niedriger Qualität nur wenige
      const limit = this.lightLevel === 1 ? 3 : MAX_ACCENTS;
      list = list.slice().sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z)).slice(0, limit);
    }
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      this.accentPos.set([a.x, a.y, a.z, a.radius], i * 4);
      this.accentCol.set([a.r, a.g, a.b], i * 3);
    }
    const gl = this.gl;
    gl.uniform1i(this.u.uAccentCount, n);
    if (n) {
      gl.uniform4fv(this.u.uAccentPos, this.accentPos);
      gl.uniform3fv(this.u.uAccentCol, this.accentCol);
    }
  }

  // boxes: Liste von { x, y, z, w, h, d, rot, color:[r,g,b], emissive, shine, pat, hidden }
  // extra: weitere Boxen (z. B. Kunden), die zusätzlich gezeichnet werden
  render(cam, boxes, extra, time) {
    if (this.contextLost) return;
    const gl = this.gl;
    const c = this.clearColor;
    gl.clearColor(c[0], c[1], c[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Im Hochformat den vertikalen Winkel vergrößern, damit das horizontale Sichtfeld nicht zu schmal wird
    let fovY = this.fov;
    if (this.aspect < 1) fovY = Math.min(2 * Math.atan(Math.tan(this.fov / 2) / this.aspect), (105 * Math.PI) / 180);
    const proj = Mat4.perspective(fovY, this.aspect, 0.05, 120);
    const view = Mat4.view(cam.x, cam.y, cam.z, cam.yaw, cam.pitch);
    gl.uniformMatrix4fv(this.u.uViewProj, false, Mat4.multiply(proj, view));
    gl.uniform3f(this.u.uCamPos, cam.x, cam.y, cam.z);
    gl.uniform3f(this.u.uFogColor, c[0], c[1], c[2]);
    gl.uniform1f(this.u.uFogDensity, this.fogDensity);
    gl.uniform1f(this.u.uTime, time || 0);
    this._uploadLamps(cam);
    this._uploadAccents(cam);
    gl.bindVertexArray(this.vao);
    let calls = 0;
    // Einfaches Aussortieren: Quader, die ganz hinter der Kamera liegen, werden nicht gezeichnet (spart Rechenzeit)
    const cp = Math.cos(cam.pitch), fwx = -Math.sin(cam.yaw) * cp, fwy = Math.sin(cam.pitch), fwz = -Math.cos(cam.yaw) * cp;
    const draw = (b) => {
      if (b.hidden) return;
      const rad = 0.5 * Math.sqrt(b.w * b.w + b.h * b.h + b.d * b.d);
      if ((b.x - cam.x) * fwx + (b.y - cam.y) * fwy + (b.z - cam.z) * fwz < -rad) return;
      const rot = b.rot || 0;
      gl.uniformMatrix4fv(this.u.uModel, false, Mat4.model(b.x, b.y, b.z, b.w, b.h, b.d, rot));
      gl.uniform1f(this.u.uRotY, rot);
      gl.uniform3f(this.u.uColor, b.color[0], b.color[1], b.color[2]);
      gl.uniform1f(this.u.uEmissive, b.emissive || 0);
      gl.uniform1f(this.u.uShine, b.shine || 0);
      gl.uniform1i(this.u.uPat, b.pat || 0);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
      calls++;
    };
    for (let i = 0; i < boxes.length; i++) draw(boxes[i]);
    if (extra) for (let i = 0; i < extra.length; i++) draw(extra[i]);
    this._drawSigns(cam, Mat4.multiply(proj, view), c);
    calls += this.signs.length;
    this.drawCalls = calls;
  }
}

window.Renderer = Renderer;
