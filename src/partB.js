'use strict';
// ============================================================
//  Math
// ============================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  rotY: (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; },
};

// column-major 4x4 matrices (WGSL layout)
const M4 = {
  id: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, o = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  perspective(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = f / (n - f); m[11] = -1; m[14] = n * f / (n - f);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = 1 / (n - f);
    m[12] = (l + r) / (l - r); m[13] = (t + b) / (b - t); m[14] = n / (n - f); m[15] = 1;
    return m;
  },
  lookAt(e, c, up) {
    const z = V.norm(V.sub(e, c)), x = V.norm(V.cross(up, z)), y = V.cross(z, x), m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -V.dot(x, e); m[13] = -V.dot(y, e); m[14] = -V.dot(z, e); m[15] = 1;
    return m;
  },
  invert(a) {
    const o = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M4.id();
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  // in-place post-multiplying builders (m = m * X)
  translate(m, x, y, z) { m[12] += m[0] * x + m[4] * y + m[8] * z; m[13] += m[1] * x + m[5] * y + m[9] * z; m[14] += m[2] * x + m[6] * y + m[10] * z; m[15] += m[3] * x + m[7] * y + m[11] * z; return m; },
  scale(m, x, y = x, z = x) { for (let i = 0; i < 4; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; } return m; },
  rotX(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const y = m[4 + i], z = m[8 + i]; m[4 + i] = y * c + z * s; m[8 + i] = z * c - y * s; } return m; },
  rotY(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const x = m[i], z = m[8 + i]; m[i] = x * c - z * s; m[8 + i] = x * s + z * c; } return m; },
  rotZ(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const x = m[i], y = m[4 + i]; m[i] = x * c + y * s; m[4 + i] = y * c - x * s; } return m; },
  // basis from forward (+z) and up hints
  basis(m, pos, fwd, up) {
    const z = V.norm(fwd), x = V.norm(V.cross(up, z)), y = V.cross(z, x);
    m[0] = x[0]; m[1] = x[1]; m[2] = x[2]; m[3] = 0;
    m[4] = y[0]; m[5] = y[1]; m[6] = y[2]; m[7] = 0;
    m[8] = z[0]; m[9] = z[1]; m[10] = z[2]; m[11] = 0;
    m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
    return m;
  },
  apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  applyDir(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; },
};
const at = (x, y, z) => M4.translate(M4.id(), x, y, z);

// ============================================================
//  Noise
// ============================================================
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
function noise3(x, y, z) { return (vnoise(x + z * 1.7, y - z * 0.9) + vnoise(y + 3.1, z + x * 0.7)) * 0.5; }
let seedState = 12345;
const srand = () => { seedState = (seedState * 16807) % 2147483647; return seedState / 2147483647; };

// ============================================================
//  Mesh builder (pos, nrm, col per vertex; uint32 indices)
// ============================================================
class Mesh {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  get vcount() { return this.p.length / 3; }
  v(p, n, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2], c[3] || 0); return this.vcount - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // merge another mesh with transform and optional color override fn
  merge(o, m = null, colFn = null) {
    const base = this.vcount;
    for (let k = 0; k < o.vcount; k++) {
      let p = [o.p[k * 3], o.p[k * 3 + 1], o.p[k * 3 + 2]], n = [o.n[k * 3], o.n[k * 3 + 1], o.n[k * 3 + 2]];
      let c = [o.c[k * 4], o.c[k * 4 + 1], o.c[k * 4 + 2], o.c[k * 4 + 3]];
      if (m) {
        p = M4.apply(m, p);
        const s2 = [m[0] ** 2 + m[1] ** 2 + m[2] ** 2, m[4] ** 2 + m[5] ** 2 + m[6] ** 2, m[8] ** 2 + m[9] ** 2 + m[10] ** 2];
        n = V.norm(M4.applyDir(m, [n[0] / s2[0], n[1] / s2[1], n[2] / s2[2]]));
      }
      if (colFn) c = colFn(p, n, c);
      this.v(p, n, c);
    }
    for (const idx of o.i) this.i.push(idx + base);
    return this;
  }
  recomputeNormals() {
    const n = new Float32Array(this.p.length);
    for (let t = 0; t < this.i.length; t += 3) {
      const a = this.i[t] * 3, b = this.i[t + 1] * 3, c = this.i[t + 2] * 3;
      const u = [this.p[b] - this.p[a], this.p[b + 1] - this.p[a + 1], this.p[b + 2] - this.p[a + 2]];
      const w = [this.p[c] - this.p[a], this.p[c + 1] - this.p[a + 1], this.p[c + 2] - this.p[a + 2]];
      const f = V.cross(u, w);
      for (const k of [a, b, c]) { n[k] += f[0]; n[k + 1] += f[1]; n[k + 2] += f[2]; }
    }
    for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; this.n[k] = n[k] / l; this.n[k + 1] = n[k + 1] / l; this.n[k + 2] = n[k + 2] / l; }
    return this;
  }
}

function sphereMesh(seg = 24, ring = 16, col = [1, 1, 1], fn = null) {
  const m = new Mesh();
  for (let r = 0; r <= ring; r++) {
    const th = r / ring * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const ph = s / seg * TAU;
      const n = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
      let p = n.slice(), c = col;
      if (fn) { const o = fn(p, n); if (o.p) p = o.p; if (o.c) c = o.c; }
      m.v(p, n, c);
    }
  }
  for (let r = 0; r < ring; r++) for (let s = 0; s < seg; s++) {
    const a = r * (seg + 1) + s, b = a + seg + 1;
    m.tri(a, b, a + 1); m.tri(a + 1, b, b + 1);
  }
  if (fn) m.recomputeNormals();
  return m;
}
function icoMesh(sub = 2, col = [1, 1, 1], disp = null) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(V.norm);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (!cache.has(k)) { verts.push(V.norm(V.lerp(verts[a], verts[b], 0.5))); cache.set(k, verts.length - 1); } return cache.get(k); };
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  // flat-shaded (faceted, painterly look): unique verts per face
  const m = new Mesh();
  for (const f of faces) {
    const ps = f.map(i => { const v = verts[i]; const d = disp ? disp(v) : 1; return V.mul(v, d); });
    const n = V.norm(V.cross(V.sub(ps[1], ps[0]), V.sub(ps[2], ps[0])));
    const cs = ps.map(p => typeof col === 'function' ? col(p, n) : col);
    const a = m.v(ps[0], n, cs[0]), b = m.v(ps[1], n, cs[1]), c = m.v(ps[2], n, cs[2]);
    m.tri(a, b, c);
  }
  return m;
}
function cylMesh(seg, r0, r1, h, col, caps = true, colFn = null) {
  const m = new Mesh();
  const slope = (r0 - r1) / h;
  for (let k = 0; k <= 1; k++) for (let s = 0; s <= seg; s++) {
    const a = s / seg * TAU, r = k ? r1 : r0;
    const p = [Math.sin(a) * r, k * h, Math.cos(a) * r];
    const n = V.norm([Math.sin(a), slope, Math.cos(a)]);
    m.v(p, n, colFn ? colFn(p, n) : col);
  }
  for (let s = 0; s < seg; s++) { const a = s, b = s + seg + 1; m.tri(a, a + 1, b); m.tri(a + 1, b + 1, b); }
  if (caps) {
    for (const [y, r, up] of [[0, r0, -1], [h, r1, 1]]) {
      const c = m.v([0, y, 0], [0, up, 0], colFn ? colFn([0, y, 0], [0, up, 0]) : col);
      for (let s = 0; s <= seg; s++) { const a = s / seg * TAU; const p = [Math.sin(a) * r, y, Math.cos(a) * r]; m.v(p, [0, up, 0], colFn ? colFn(p, [0, up, 0]) : col); }
      for (let s = 0; s < seg; s++) up > 0 ? m.tri(c, c + 1 + s, c + 2 + s) : m.tri(c, c + 2 + s, c + 1 + s);
    }
  }
  return m;
}
function torusMesh(R, r, seg, side, col) {
  const m = new Mesh();
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * TAU;
    for (let j = 0; j <= side; j++) {
      const b = j / side * TAU;
      const n = [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
      const p = [(R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)];
      m.v(p, n, typeof col === 'function' ? col(p, n, a, b) : col);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
    const a = i * (side + 1) + j, b = a + side + 1;
    m.tri(a, a + 1, b); m.tri(a + 1, b + 1, b);
  }
  return m;
}
// material ids live in the 4th colour channel: 1 skin, 2 cloth, 3 leather, 4 steel, 5 gold, 6 eye, 7 hair, 8 foliage
const mc = (h, m) => [...hexToRgb(h), m];
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(c => Math.pow(c, 2.2)); }

// ------------- character + world meshes -------------
const COL = {
  skin: hexToRgb('#ffd7b0'), blush: hexToRgb('#ff9f8f'), hood: hexToRgb('#6d4aff'), hoodDark: hexToRgb('#3f25b8'), hoodLight: hexToRgb('#a58cff'),
  glove: hexToRgb('#fbf8ff'), cuff: hexToRgb('#6d4aff'), shoe: hexToRgb('#ff9d23'), sole: hexToRgb('#fff4e6'), lace: hexToRgb('#fff4e6'),
  hair: hexToRgb('#ffcf3a'), scarf: hexToRgb('#ff4d5e'), eye: hexToRgb('#ffffff'), pupil: hexToRgb('#1b1030'),
  foe: hexToRgb('#c2305e'), foeDark: hexToRgb('#5b1640'), foeBelly: hexToRgb('#ff8fb0'),
  grass: hexToRgb('#4f9636'), grass2: hexToRgb('#7fb84a'), rock: hexToRgb('#8d8780'), moss: hexToRgb('#6f9a3a'),
  sand: hexToRgb('#e6d3a0'), dirt: hexToRgb('#b88a5a'), trunk: hexToRgb('#7a5236'), leaf: hexToRgb('#4f9e3a'), leaf2: hexToRgb('#8fcf4a'),
  stone: hexToRgb('#b8ad9c'), stoneDark: hexToRgb('#857c6f'), rune: hexToRgb('#6ff7ff'), orb: hexToRgb('#ffe27a'),
};

function buildMeshes() {
  const M = {};
  M.sphere = sphereMesh(28, 18);
  // spark: a cut crystal (eight-sided, elongated, bevelled girdle) with a thin halo ring
  M.orb = (() => {
    const m = new Mesh(), N = 8, rows = [[1.9, 0], [0.55, 0.62], [0.35, 0.72], [-0.35, 0.72], [-0.55, 0.62], [-1.5, 0]];
    for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < N; k++) {
      const a0 = k / N * TAU, a1 = (k + 1) / N * TAU, [y0, r0] = rows[r], [y1, r1] = rows[r + 1];
      const p = [[Math.sin(a0) * r0, y0, Math.cos(a0) * r0], [Math.sin(a1) * r0, y0, Math.cos(a1) * r0], [Math.sin(a1) * r1, y1, Math.cos(a1) * r1], [Math.sin(a0) * r1, y1, Math.cos(a0) * r1]];
      const n = V.norm(V.cross(V.sub(p[2], p[0]), V.sub(p[1], p[3]))), sh = (k % 2 ? 0.7 : 1.0) * (r === 2 ? 1.15 : 1);
      const c = [sh, sh, sh, 5], i0 = m.v(p[0], n, c), i1 = m.v(p[1], n, c), i2 = m.v(p[2], n, c), i3 = m.v(p[3], n, c);
      m.tri(i0, i3, i1); m.tri(i1, i3, i2);
    }
    m.merge(transformed(torusMesh(1.35, 0.045, 40, 5, [1, 1, 1, 5]), M4.rotX(M4.id(), 0.35)));
    return m;
  })();
  // heart container: a puffy glossy heart from the classic parametric outline, framed by a gold rim
  M.heart = (() => {
    const h = new Mesh(), NT = 48, NR = 10, red = [...COL.scarf, 18];
    const outline = (t) => { const s = Math.sin(t); return [16 * s * s * s / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.1]; };
    for (const side of [1, -1]) {
      const base = h.vcount;
      for (let r = 0; r <= NR; r++) for (let k = 0; k <= NT; k++) {
        const u = r / NR, o = outline(k / NT * TAU), z = side * 0.34 * Math.sqrt(Math.max(0, 1 - u * u));
        const p = [o[0] * u, o[1] * u + 0.06 * (1 - u), z];
        const hl = 1 + 0.25 * Math.max(0, 1 - Math.hypot(p[0] + 0.3, p[1] - 0.35) / 0.35) * (side > 0 ? 1 : 0);
        h.v(p, [0, 0, side], [red[0] * hl, red[1] * hl, red[2] * hl, 18]);
      }
      for (let r = 0; r < NR; r++) for (let k = 0; k < NT; k++) { const a = base + r * (NT + 1) + k, b = a + NT + 1; if (side > 0) { h.tri(a, b, a + 1); h.tri(a + 1, b, b + 1); } else { h.tri(a, a + 1, b); h.tri(a + 1, b + 1, b); } }
    }
    h.recomputeNormals();
    for (let k = 0; k < NT; k++) { const a = outline(k / NT * TAU), b = outline((k + 1) / NT * TAU); h.merge(tubeMesh([a[0] * 1.02, a[1] * 1.02, 0], [b[0] * 1.02, b[1] * 1.02, 0], () => 0.05, () => [...COL.orb, 5], 6, 1)); }
    return h;
  })();

  // world props
  // trunk with root flare and three branches reaching into the crown (bark material 10)
  {
    const bark = [...COL.trunk, 10], barkDark = [...V.mul(COL.trunk, 0.7), 10];
    const t = new Mesh();
    t.merge(tubeMesh([0, -0.3, 0], [0, 3.1, 0], (u) => lerp(0.46, 0.22, Math.pow(u, 0.7)) + (u < 0.12 ? (0.12 - u) * 1.6 : 0), () => bark, 14, 10, [false, true]));
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + 0.5, y0 = 2.0 + k * 0.25;
      const end = [Math.sin(a) * 0.85, y0 + 0.9, Math.cos(a) * 0.85];
      t.merge(tubeMesh([Math.sin(a) * 0.12, y0, Math.cos(a) * 0.12], end, (u) => lerp(0.13, 0.04, u), () => barkDark, 8, 4));
    }
    // root buttresses spreading into the ground, and a couple of knots on the bark
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + 0.3, d = [Math.sin(a), 0, Math.cos(a)];
      t.merge(tubeMesh(V.add(V.mul(d, 0.28), [0, 0.55, 0]), V.add(V.mul(d, 0.95), [0, -0.12, 0]), (u) => lerp(0.17, 0.05, u), () => bark, 8, 6, [false, true]));
    }
    // gnarl the trunk: twist, lumpy girth and bark ridges in the geometry; moss creeping up one side from the base
    for (let k = 0; k < t.vcount; k++) {
      const x = t.p[k * 3], y = t.p[k * 3 + 1], z = t.p[k * 3 + 2], r = Math.hypot(x, z);
      if (r < 1e-4 || r > 1.2) continue;
      const a = Math.atan2(z, x) + y * 0.18, lump = 1 + 0.12 * noise3(x * 2.2, y * 1.4, z * 2.2) - 0.06 + 0.035 * Math.abs(Math.sin(a * 11 + noise3(x, y * 3, z) * 3));
      t.p[k * 3] = Math.cos(a) * r * lump; t.p[k * 3 + 2] = Math.sin(a) * r * lump;
      const moss = clamp((1.0 - y) / 1.2, 0, 1) * clamp(0.5 + Math.cos(a - 0.6) * 0.8, 0, 1) * (0.6 + 0.5 * noise3(x * 5, y * 5, z * 5));
      if (moss > 0.35) { const c = V.lerp([t.c[k * 4], t.c[k * 4 + 1], t.c[k * 4 + 2]], COL.moss, Math.min(1, (moss - 0.35) * 2)); t.c[k * 4] = c[0]; t.c[k * 4 + 1] = c[1]; t.c[k * 4 + 2] = c[2]; }
    }
    t.recomputeNormals();
    for (const [y, a] of [[1.1, 0.8], [1.9, 3.6]]) t.merge(ellipsoid([Math.sin(a) * 0.3, y, Math.cos(a) * 0.3], [0.07, 0.09, 0.05], (n0) => (n0[2] > 0.6 ? barkDark : bark), 10, 8));
    M.trunk = t;
    const tl = new Mesh();
    tl.merge(tubeMesh([0, -0.3, 0], [0, 3.1, 0], (u) => lerp(0.46, 0.22, Math.pow(u, 0.7)) + (u < 0.12 ? (0.12 - u) * 1.6 : 0), () => bark, 7, 4, [false, true]));
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.5, y0 = 2.0 + k * 0.25; tl.merge(tubeMesh([Math.sin(a) * 0.12, y0, Math.cos(a) * 0.12], [Math.sin(a) * 0.85, y0 + 0.9, Math.cos(a) * 0.85], (u) => lerp(0.13, 0.04, u), () => barkDark, 4, 1)); }
    M.trunk_lo = tl;
  }
  for (let v = 0; v < 3; v++) {
    // leafy crown: many smooth, lumpy clumps (foliage material 8)
    let sd0 = 11 + v * 97; const r = () => { sd0 = (sd0 * 16807) % 2147483647; return sd0 / 2147483647; };
    const cm = new Mesh(), lo = new Mesh(), n = 12 + v * 2;
    const lite = hexToRgb(['#8fcf4a', '#a4d45a', '#7cc04a'][v]), dark = hexToRgb(['#3d7a2c', '#4a8a2e', '#356f2a'][v]);
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, y = -0.35 + r() * 0.9, rr = (1 - Math.abs(y - 0.1) * 0.9) * (0.45 + r() * 0.35);
      const pos = [Math.sin(a) * rr, y, Math.cos(a) * rr], s = 0.36 + r() * 0.2, seed = r() * 50;
      const col = (n0) => {
        const up = smooth(-0.9, 0.9, n0[1] * 0.7 + (y + 0.35) * 0.6);
        return V.mul(V.lerp(dark, lite, up), 0.88 + 0.24 * hash2(k, 3)).concat([8]);
      }, lump = (q, n0) => V.mul(q, 0.8 + 0.3 * noise3(n0[0] * 2.3 + seed, n0[1] * 2.3, n0[2] * 2.3 - seed) + 0.12 * noise3(n0[0] * 8 + seed, n0[1] * 8, n0[2] * 8));
      cm.merge(ellipsoid(pos, [s, s * 0.82, s], col, 13, 9, lump));
      lo.merge(ellipsoid(pos, [s, s * 0.82, s], col, 7, 5, lump));
    }
    // canopyN_lo: the same crown with far fewer triangles, for distant trees, shadows and the water reflection
    M['canopy' + v] = cm; M['canopy' + v + '_lo'] = lo;
    // smooth weathered boulder with moss on top (stone material 11)
    M['rock' + v] = ellipsoid([0, 0, 0], [1, 1, 1], (n0, q) => {
      const moss = smooth(0.45, 0.8, n0[1] + 0.15 * noise3(n0[0] * 4 + sd, n0[1] * 4, n0[2] * 4));
      // dark cracks running through the rock and pale lichen speckle
      const crack = smooth(0.035, 0.0, Math.abs(noise3(n0[0] * 2.2 + sd * 2, n0[1] * 2.2, n0[2] * 2.2) - 0.5));
      const lichen = smooth(0.62, 0.7, noise3(n0[0] * 11 + sd, n0[1] * 11, n0[2] * 11)) * (1 - moss);
      let c = V.lerp(V.mul(COL.rock, 0.85 + 0.25 * noise3(n0[0] * 3 + sd, n0[1] * 3, n0[2] * 3)), COL.moss, moss * 0.9);
      c = V.lerp(c, V.mul(c, 0.45), crack * 0.8); c = V.lerp(c, [0.78, 0.8, 0.66], lichen * 0.5);
      return c.concat([moss > 0.5 ? 8 : 11]);
    }, 40, 28, (q, n0) => {
      // ridged noise gives chipped facets and edges instead of a smooth egg; cracks cut in slightly
      const ridge = 1 - Math.abs(noise3(n0[0] * 2.6 + sd, n0[1] * 2.6, n0[2] * 2.6) * 2 - 1);
      const crack = smooth(0.035, 0.0, Math.abs(noise3(n0[0] * 2.2 + sd * 2, n0[1] * 2.2, n0[2] * 2.2) - 0.5));
      return V.mul(q, 0.72 + 0.4 * noise3(n0[0] * 1.5 + sd, n0[1] * 1.5 + sd, n0[2] * 1.5) + 0.07 * ridge + 0.04 * noise3(n0[0] * 7, n0[1] * 7 + sd, n0[2] * 7) - 0.03 * crack);
    });
  }
  // floating island: rounded grassy top, layered rock underside, dangling roots
  {
    const isl = new Mesh();
    isl.merge(ellipsoid([0, -0.1, 0], [1.0, 0.16, 1.0], (n0) => V.mul(COL.grass, 0.85 + 0.3 * noise3(n0[0] * 6, 1, n0[2] * 6)).concat([12]), 36, 12,
      (q, n0) => { if (n0[1] < 0) q[1] *= 0.4; return q; }));
    const under = ellipsoid([0, -0.16, 0], [0.99, 1.45, 0.99], (n0, q) => {
      const depth = -q[1], band = 0.5 + 0.5 * Math.sin(depth * 14 + noise3(n0[0] * 3, n0[1] * 3, n0[2] * 3) * 3);
      return V.mul(V.lerp(COL.dirt, COL.rock, smooth(0.1, 0.8, depth)), 0.8 + 0.25 * band).concat([11]);
    }, 48, 30, (q, n0) => {
      if (n0[1] > 0) q[1] *= 0.05;
      // stepped strata shelves and rough rock facets
      const d = Math.max(0, -n0[1]), shelf = 1 - 0.09 * ((d * 5.5) % 1) * smooth(0.05, 0.2, d);
      const k = (0.85 + 0.3 * noise3(n0[0] * 2.5, n0[1] * 2.5, n0[2] * 2.5) + 0.08 * noise3(n0[0] * 8, n0[1] * 8, n0[2] * 8)) * shelf;
      q[0] *= k; q[2] *= k; q[1] *= 0.9 + 0.2 * noise3(n0[0] * 4, 3, n0[2] * 4); return q; });
    isl.merge(under);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + 0.3, r0 = 0.7 + 0.2 * Math.sin(k * 3.1);
      const p0 = [Math.sin(a) * r0, -0.3, Math.cos(a) * r0], p1 = [Math.sin(a) * r0 * 1.05, -0.75 - 0.2 * (k % 3), Math.cos(a) * r0 * 1.05], p2 = [Math.sin(a + 0.2) * r0 * 0.95, -1.1 - 0.25 * (k % 3), Math.cos(a + 0.2) * r0 * 0.95];
      isl.merge(tubeMesh(p0, p1, (u) => lerp(0.035, 0.022, u), () => [...V.mul(COL.trunk, 0.7), 10], 6, 3));
      isl.merge(tubeMesh(p1, p2, (u) => lerp(0.022, 0.006, u), () => [...V.mul(COL.trunk, 0.7), 10], 6, 3));
    }
    // stalactite shards under the rock, vines with leaves hanging from the grassy lip
    for (let k = 0; k < 6; k++) {
      const a = k * 2.4, r0 = 0.12 + 0.08 * (k % 3);
      isl.merge(cylMesh(6, 0.09 - (k % 2) * 0.03, 0.0, 0.35 + 0.15 * (k % 3), [...V.mul(COL.rock, 0.8), 11], false), M4.rotX(at(Math.sin(a) * r0, -1.25 - 0.05 * (k % 2), Math.cos(a) * r0), Math.PI));
    }
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU + 0.15, r0 = 0.93, len = 0.5 + 0.6 * ((k * 7) % 5) / 5;
      const pts = []; for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push([Math.sin(a) * r0 * (1 - 0.06 * t), -0.14 - len * t, Math.cos(a) * r0 * (1 - 0.06 * t) + Math.sin(t * 5 + k) * 0.03]); }
      for (let j = 0; j < 5; j++) {
        isl.merge(tubeMesh(pts[j], pts[j + 1], () => 0.016, () => [...V.mul(COL.grass, 0.7), 8], 5, 1));
        isl.merge(ellipsoid(V.add(pts[j + 1], [0.02, 0, 0]), [0.035, 0.012, 0.025], [...V.mul(COL.grass2, 0.9), 8], 6, 4));
      }
    }
    M.island = isl;
  }
  // grass tuft: a dense clump of thin tapered blades that arc outward, dark at the root and sunlit at the tips
  {
    const g = new Mesh(); let sd = 5; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU + rnd() * 0.5, r0 = 0.02 + rnd() * 0.06, h = 0.38 + rnd() * 0.42, lean = 0.12 + rnd() * 0.22, w = 0.018 + rnd() * 0.01;
      const d = [Math.sin(a), 0, Math.cos(a)], side = [Math.cos(a), 0, -Math.sin(a)], tone = 0.85 + rnd() * 0.3;
      const base = g.vcount, S = 3;
      for (let u = 0; u <= S; u++) {
        const t = u / S, p = V.add(V.mul(d, r0 + lean * t * t), [0, h * (t - 0.12 * t * t), 0]), ww = w * (1 - t * 0.92);
        const n = V.norm(V.add(V.mul(d, 0.6), [0, 1.2, 0]));
        const c = V.mul(V.lerp(V.mul(COL.grass, 0.68), COL.grass2, Math.pow(t, 0.7)), tone).concat([17]);
        g.v(V.add(p, V.mul(side, ww)), n, c); g.v(V.sub(p, V.mul(side, ww)), n, c);
      }
      for (let u = 0; u < S; u++) { const q = base + u * 2; g.tri(q, q + 1, q + 2); g.tri(q + 1, q + 3, q + 2); }
    }
    M.tuft = g;
  }
  {
    // wildflower: curved stem, two leaves, seven cupped petals round a domed centre (petal colour comes from the instance tint)
    const fl = new Mesh(), stemC = [...V.mul(COL.grass, 0.55), 17];
    const sp = [[0, 0, 0], [0.02, 0.15, 0.01], [0.03, 0.3, 0.0], [0.015, 0.43, -0.01]];
    for (let k = 0; k < 3; k++) fl.merge(tubeMesh(sp[k], sp[k + 1], () => 0.011, () => stemC, 6, 1));
    for (const [y, a] of [[0.12, 0.4], [0.22, 3.4]]) {
      const b0 = fl.vcount, d = [Math.sin(a), 0.35, Math.cos(a)], sd = [Math.cos(a), 0, -Math.sin(a)], base = [0.02, y, 0];
      for (let u = 0; u <= 4; u++) { const t = u / 4, w = 0.035 * Math.sin(t * Math.PI), p = V.add(base, V.add(V.mul(d, t * 0.16), [0, -0.04 * t * t, 0]));
        fl.v(V.add(p, V.mul(sd, w)), [0, 1, 0], stemC); fl.v(V.sub(p, V.mul(sd, w)), [0, 1, 0], stemC); }
      for (let u = 0; u < 4; u++) { const q = b0 + u * 2; fl.tri(q, q + 1, q + 2); fl.tri(q + 1, q + 3, q + 2); }
    }
    const top = sp[3];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, d = [Math.sin(a), 0, Math.cos(a)], sd = [Math.cos(a), 0, -Math.sin(a)], b0 = fl.vcount;
      for (let u = 0; u <= 4; u++) {
        const t = u / 4, w = 0.04 * Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.004, p = V.add(top, V.add(V.mul(d, 0.02 + t * 0.1), [0, 0.012 + 0.035 * t - 0.02 * t * t, 0]));
        const n = V.norm(V.add([0, 1, 0], V.mul(d, -0.3 * t)));
        fl.v(V.add(p, V.mul(sd, w)), n, [1, 1, 1, 17]); fl.v(V.sub(p, V.mul(sd, w)), n, [0.96, 0.96, 0.96, 17]);
      }
      for (let u = 0; u < 4; u++) { const q = b0 + u * 2; fl.tri(q, q + 1, q + 2); fl.tri(q + 1, q + 3, q + 2); }
    }
    fl.merge(ellipsoid(V.add(top, [0, 0.02, 0]), [0.028, 0.018, 0.028], (n0) => V.mul([1.0, 0.78, 0.2], 0.8 + 0.3 * Math.abs(Math.sin(n0[0] * 9) * Math.sin(n0[2] * 9))).concat([2]), 10, 6));
    M.flower = fl;
  }
  const stoneC = (y, shade = 1) => V.mul(V.lerp(COL.moss, COL.stone, smooth(0.0, 0.6, y)), shade).concat([11]);
  // fluted column with a moulded base, capital and abacus
  M.pillar = (() => {
    const p = new Mesh();
    const shaft = tubeMesh([0, 0.3, 0], [0, 3.9, 0], (t) => lerp(0.5, 0.43, t), (t) => stoneC(t * 3.6 + 0.3), 48, 18, [false, false]);
    for (let k = 0; k < shaft.vcount; k++) {
      const x = shaft.p[k * 3], z = shaft.p[k * 3 + 2], a = Math.atan2(x, z), f = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 8)), 3);
      shaft.p[k * 3] = x * f; shaft.p[k * 3 + 2] = z * f;
    }
    shaft.recomputeNormals();
    p.merge(shaft);
    p.merge(cylMesh(8, 0.74, 0.74, 0.22, stoneC(0, 0.85), true), M4.rotY(M4.id(), Math.PI / 8));
    p.merge(transformed(torusMesh(0.55, 0.07, 32, 8, stoneC(0.3, 0.9)), at(0, 0.28, 0)));
    p.merge(transformed(torusMesh(0.5, 0.05, 32, 8, stoneC(0.5, 0.9)), at(0, 0.4, 0)));
    p.merge(cylMesh(32, 0.44, 0.62, 0.3, stoneC(4, 0.95), true), at(0, 3.9, 0));
    p.merge(transformed(torusMesh(0.46, 0.05, 32, 8, [...COL.orb, 5]), at(0, 3.92, 0)));
    p.merge(cylMesh(4, 0.82, 0.82, 0.2, stoneC(4, 0.85), true), M4.rotY(at(0, 4.2, 0), Math.PI / 4));
    // weathering: stone everywhere, moss only in irregular patches that thin out as they climb; soot-dark streaks
    for (let k = 0; k < p.vcount; k++) {
      const x = p.p[k * 3], y = p.p[k * 3 + 1], z = p.p[k * 3 + 2];
      const mossN = noise3(x * 3.1 + 7, y * 2.3, z * 3.1), moss = smooth(1.4, 0.0, y) * smooth(0.48, 0.62, mossN) + smooth(0.3, 0.0, y) * 0.5;
      const streak = 0.9 + 0.12 * noise3(Math.atan2(x, z) * 3, y * 0.4, 1);
      const st = V.mul(COL.stone, streak * (0.9 + 0.12 * noise3(x * 9, y * 9, z * 9)));
      const c = V.lerp(st, COL.moss, clamp(moss, 0, 1));
      p.c[k * 4] = c[0]; p.c[k * 4 + 1] = c[1]; p.c[k * 4 + 2] = c[2]; if (p.c[k * 4 + 3] !== 5) p.c[k * 4 + 3] = moss > 0.5 ? 8 : 11;
    }
    return p;
  })();
  M.rune = (() => { const r = cylMesh(4, 0.2, 0.2, 1.6, [1, 1, 1, 13], true); return r; })();
  // portal: ring of carved stone blocks, gold inlay, keystone
  M.portalRing = (() => {
    const r = new Mesh();
    r.merge(torusMesh(2.4, 0.34, 64, 14, (p, n, a) => { const joint = Math.abs(Math.sin(a * 8)) < 0.06; return V.mul(COL.stone, joint ? 0.55 : 0.9 + 0.1 * Math.sin(a * 3)).concat([11]); }));
    // carved voussoirs: sink the joints between the sixteen blocks so each block stands proud
    for (let k = 0; k < r.vcount; k++) {
      const x = r.p[k * 3], y = r.p[k * 3 + 1], z = r.p[k * 3 + 2], a = Math.atan2(z, x), j = Math.abs(Math.sin(a * 8));
      if (j < 0.09) { const rr = Math.hypot(x, z), cx = x / rr * 2.4, cz = z / rr * 2.4, s = 1 - 0.14 * (1 - j / 0.09);
        r.p[k * 3] = cx + (x - cx) * s; r.p[k * 3 + 1] = y * s; r.p[k * 3 + 2] = cz + (z - cz) * s; }
    }
    r.recomputeNormals();
    r.merge(torusMesh(2.08, 0.05, 64, 8, [...COL.orb, 5]));
    r.merge(torusMesh(2.72, 0.04, 64, 8, [...COL.orb, 5]));
    r.merge(ellipsoid([0, 0, 2.75], [0.42, 0.36, 0.5], (n0) => V.mul(COL.stone, 0.95).concat([11]), 18, 12));
    r.merge(ellipsoid([0, 0.33, 2.9], [0.14, 0.03, 0.14], [...COL.rune, 6], 12, 6));
    return r;
  })();
  M.disc = cylMesh(64, 1, 1, 0.04, [1, 1, 1, 15]);
  // stepped plaza: three rings, mosaic floor on top
  M.shrineStep = cylMesh(64, 1, 1, 1, [...COL.stone, 14], true);
  return M;
}
// cone/cylinder built along +y placed at pos, pointing along dir
function basisY(pos, dir) {
  const y = V.norm(dir), ref = Math.abs(y[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = V.norm(V.cross(ref, y)), z = V.cross(x, y), m = new Float32Array(16);
  m[0] = x[0]; m[1] = x[1]; m[2] = x[2]; m[4] = y[0]; m[5] = y[1]; m[6] = y[2]; m[8] = z[0]; m[9] = z[1]; m[10] = z[2];
  m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
  return m;
}
