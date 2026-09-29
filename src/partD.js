// ============================================================
//  Hero model: a skinned adventurer built from code
//  Bind pose faces +z, +x is the hero's left, feet at y = 0 (metres)
// ============================================================
const HB = {
  hip: [0, 0.9, 0], spine: [0, 1.02, 0], chest: [0, 1.18, 0], neck: [0, 1.36, 0], headB: [0, 1.42, 0], headC: [0, 1.535, 0.012],
  sh: [0.17, 1.33, -0.01], el: [0.3, 1.1, -0.03], wr: [0.39, 0.89, 0.0], ha: [0.43, 0.8, 0.012],
  hp: [0.09, 0.9, 0], kn: [0.1, 0.5, 0.015], an: [0.1, 0.09, -0.01], to: [0.1, 0.015, 0.15],
};
const sd = (p, s) => [p[0] * s, p[1], p[2]];
const LIMB = { ua: V.dist(HB.sh, HB.el), fa: V.dist(HB.el, HB.wr), th: V.dist(HB.hp, HB.kn), sn: V.dist(HB.kn, HB.an) };
// bones: segment (for weighting), pivot (bind origin)
const BONES = [
  { n: 'pelvis', a: [0, 0.8, 0], b: [0, 1.0, 0], pv: HB.hip },
  { n: 'spine', a: [0, 1.0, 0], b: [0, 1.12, 0], pv: HB.spine },
  { n: 'chest', a: [0, 1.12, 0], b: [0, 1.32, 0], pv: HB.chest },
  { n: 'neck', a: [0, 1.33, 0], b: [0, 1.43, 0], pv: HB.neck },
  { n: 'head', a: [0, 1.45, 0.01], b: [0, 1.66, 0.01], pv: HB.headB },
];
for (const s of [1, -1]) {
  BONES.push({ n: 'ua', a: sd(HB.sh, s), b: sd(HB.el, s) }, { n: 'fa', a: sd(HB.el, s), b: sd(HB.wr, s) }, { n: 'hand', a: sd(HB.wr, s), b: sd(HB.ha, s) });
}
for (const s of [1, -1]) {
  BONES.push({ n: 'thigh', a: sd(HB.hp, s), b: sd(HB.kn, s) }, { n: 'shin', a: sd(HB.kn, s), b: sd(HB.an, s) }, { n: 'foot', a: sd(HB.an, s), b: sd(HB.to, s) });
}
// index helpers: arms L 5,6,7 R 8,9,10 ; legs L 11,12,13 R 14,15,16
const BI = { pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4, ua: s => s > 0 ? 5 : 8, fa: s => s > 0 ? 6 : 9, hand: s => s > 0 ? 7 : 10, thigh: s => s > 0 ? 11 : 14, shin: s => s > 0 ? 12 : 15, foot: s => s > 0 ? 13 : 16 };

// 3x3 rotations, column-major [x axis, y axis, z axis]
const R3 = {
  I: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; },
  v(a, v) { return [a[0] * v[0] + a[3] * v[1] + a[6] * v[2], a[1] * v[0] + a[4] * v[1] + a[7] * v[2], a[2] * v[0] + a[5] * v[1] + a[8] * v[2]]; },
  T(a) { return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]; },
  rx(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, s, 0, -s, c]; },
  ry(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 1, 0, s, 0, c]; },
  rz(t) { const c = Math.cos(t), s = Math.sin(t); return [c, s, 0, -s, c, 0, 0, 0, 1]; },
  basis(y, zr) { y = V.norm(y); let z = V.sub(zr, V.mul(y, V.dot(zr, y))); z = V.norm(z); const x = V.cross(y, z); return [...x, ...y, ...z]; },
  between(u, v) {
    const c = V.dot(u, v);
    if (c > 0.99999) return R3.I();
    if (c < -0.9999) { const a = V.norm(Math.abs(u[0]) < 0.9 ? V.cross(u, [1, 0, 0]) : V.cross(u, [0, 1, 0])); return R3.axis(a, Math.PI); }
    const k = V.cross(u, v), f = 1 / (1 + c);
    return [1 - (k[1] * k[1] + k[2] * k[2]) * f, k[2] + k[0] * k[1] * f, -k[1] + k[0] * k[2] * f,
      -k[2] + k[0] * k[1] * f, 1 - (k[0] * k[0] + k[2] * k[2]) * f, k[0] + k[1] * k[2] * f,
      k[1] + k[0] * k[2] * f, -k[0] + k[1] * k[2] * f, 1 - (k[0] * k[0] + k[1] * k[1]) * f];
  },
  axis(a, t) {
    const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = a;
    return [c + x * x * C, y * x * C + z * s, z * x * C - y * s, x * y * C - z * s, c + y * y * C, z * y * C + x * s, x * z * C + y * s, y * z * C - x * s, c + z * z * C];
  },
};
function m4RT(R, t) { const m = new Float32Array(16); m[0] = R[0]; m[1] = R[1]; m[2] = R[2]; m[4] = R[3]; m[5] = R[4]; m[6] = R[5]; m[8] = R[6]; m[9] = R[7]; m[10] = R[8]; m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1; return m; }
// bind frames
for (const b of BONES) {
  if (b.pv) { b.Rb = R3.I(); b.Pb = b.pv; }
  else { b.Rb = R3.basis(V.sub(b.b, b.a), [0, 0, 1]); b.Pb = b.a; }
}

const HC = {
  skin: mc('#ecbb96', 1), blush: mc('#e39a86', 1), lip: mc('#b4545a', 1), brow: mc('#6e4219', 7),
  tunic: mc('#1f6f8b', 2), tunicDark: mc('#15546b', 2), trim: mc('#d8a64c', 5), shirt: mc('#ece0c8', 2),
  pants: mc('#36406a', 2), leather: mc('#6b4428', 3), leatherLight: mc('#94603a', 3), leatherDark: mc('#3d2617', 3),
  hair: mc('#d19a45', 7), hairDark: mc('#7a5024', 7), cape: mc('#a8242f', 2), capeIn: mc('#6c1720', 2),
  steel: mc('#a9b0b9', 4), gold: mc('#e2b24f', 5), wood: mc('#8b5a2b', 3), eyeW: mc('#f6f2ea', 6), iris: mc('#2b9c80', 6), irisDark: mc('#1c5f52', 6), pupil: mc('#0c0c10', 6),
  leaf: mc('#62b23b', 8), leafVein: mc('#3e7e27', 8), sole: mc('#2a1b12', 3), gem: mc('#5ff0ff', 6),
};

// tube along a->b with analytic normals, rounded caps
function tubeMesh(a, b, rFn, cFn, seg = 18, rings = 10, caps = [true, true]) {
  const m = new Mesh(), ax = V.sub(b, a), L = V.len(ax), y = V.norm(ax);
  const ref = Math.abs(y[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x = V.norm(V.cross(y, ref)), z = V.cross(x, y);
  const prof = [], r0 = rFn(0), r1 = rFn(1);
  if (caps[0]) for (let k = 0; k < 4; k++) { const th = -Math.PI / 2 + k / 4 * Math.PI / 2; prof.push([r0 * Math.sin(th), r0 * Math.cos(th), 0, Math.sin(th), Math.cos(th)]); }
  for (let k = 0; k <= rings; k++) { const t = k / rings; prof.push([t * L, rFn(t), t, 0, 1]); }
  if (caps[1]) for (let k = 1; k <= 4; k++) { const th = k / 4 * Math.PI / 2; prof.push([L + r1 * Math.sin(th), r1 * Math.cos(th), 1, Math.sin(th), Math.cos(th)]); }
  for (const [s, r, t, ny, nr] of prof) for (let j = 0; j <= seg; j++) {
    const an = j / seg * TAU, ca = Math.cos(an), sa = Math.sin(an);
    const rad = V.add(V.mul(x, ca), V.mul(z, sa));
    m.v(V.add(a, V.add(V.mul(y, s), V.mul(rad, r))), V.norm(V.add(V.mul(y, ny), V.mul(rad, nr))), cFn(t, an));
  }
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < seg; j++) { const q = i * (seg + 1) + j, w = q + seg + 1; m.tri(q, w, q + 1); m.tri(q + 1, w, w + 1); }
  return m;
}
function G(x, y, cx, cy, sx, sy) { return Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2)); }
// radial displacement of a tube's surface by (t along a->b, angle around it): folds and wrinkles
function wrinkle(m, a, b, fn) {
  const ax = V.sub(b, a), L = V.len(ax), y = V.norm(ax), ref = Math.abs(y[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x = V.norm(V.cross(y, ref)), z = V.cross(x, y);
  for (let k = 0; k < m.vcount; k++) {
    const p = [m.p[k * 3], m.p[k * 3 + 1], m.p[k * 3 + 2]], d = V.sub(p, a), t = V.dot(d, y) / L;
    const rv = V.sub(d, V.mul(y, t * L)), r = V.len(rv); if (r < 1e-6) continue;
    const an = Math.atan2(V.dot(rv, z), V.dot(rv, x)), dsp = fn(clamp(t, 0, 1), an), q = V.add(p, V.mul(rv, dsp / r));
    // shade the valleys so the folds read even under flat light
    const sh = clamp(1 + dsp * 30, 0.72, 1.06); m.c[k * 4] *= sh; m.c[k * 4 + 1] *= sh; m.c[k * 4 + 2] *= sh;
    m.p[k * 3] = q[0]; m.p[k * 3 + 1] = q[1]; m.p[k * 3 + 2] = q[2];
  }
  m.recomputeNormals();
  return m;
}
function ellipsoid(c, r, col, seg = 24, ring = 18, deform = null) {
  const m = new Mesh();
  for (let i = 0; i <= ring; i++) {
    const th = i / ring * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const ph = j / seg * TAU, n0 = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
      let q = [n0[0] * r[0], n0[1] * r[1], n0[2] * r[2]];
      if (deform) q = deform(q, n0);
      const n = V.norm([q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2])]);
      m.v(V.add(c, q), n, typeof col === 'function' ? col(n0, q) : col);
    }
  }
  for (let i = 0; i < ring; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; m.tri(a, b, a + 1); m.tri(a + 1, b, b + 1); }
  if (deform) m.recomputeNormals();
  return m;
}
function keepTris(m, pred) {
  const o = new Mesh(); o.p = m.p; o.n = m.n; o.c = m.c;
  for (let t = 0; t < m.i.length; t += 3) {
    const ok = [m.i[t], m.i[t + 1], m.i[t + 2]].every(k => pred([m.p[k * 3], m.p[k * 3 + 1], m.p[k * 3 + 2]]));
    if (ok) o.i.push(m.i[t], m.i[t + 1], m.i[t + 2]);
  }
  return o;
}
function transformed(mesh, m) { return new Mesh().merge(mesh, m); }
function segDist(p, a, b) {
  const ab = V.sub(b, a), t = clamp(V.dot(V.sub(p, a), ab) / V.dot(ab, ab), 0, 1);
  return V.dist(p, V.add(a, V.mul(ab, t)));
}

function buildHero() {
  const parts = [];
  const P = (mesh, bones, custom = null) => parts.push({ mesh, bones, custom });
  // ---- head ----
  // sculpted in metric face space (X across, Y up from the head centre, forward along the normal):
  // realistic thirds (eyes at mid-height, nose base halfway to the chin, mouth a third below it),
  // carved sockets, brow ridge, a real nose with bridge, tip and alae, philtrum, shaped lips, chin, cheekbones and jaw
  const FACE = {
    disp(X, Y, front) {
      const ax = Math.abs(X);
      let d = 0;
      d += -0.0105 * G(ax, Y, 0.041, 0.006, 0.023, 0.0125);                 // eye sockets
      d += 0.005 * G(ax, Y, 0.04, 0.027, 0.026, 0.008);                // brow ridge
      d += 0.0022 * G(X, Y, 0, 0.022, 0.011, 0.01);                       // glabella
      d += 0.0065 * G(ax, Y, 0.058, -0.02, 0.021, 0.015);                // cheekbones
      d += -0.0028 * G(ax, Y, 0.05, -0.062, 0.019, 0.016);                // cheek hollows
      d += -0.002 * G(ax, Y, 0.072, 0.03, 0.014, 0.02);                   // temples
      d += 0.0015 * G(X, Y, 0, -0.064, 0.022, 0.01);                      // maxilla / muzzle
      // nose: bridge rising from between the eyes to the tip, alae and a soft tip ball
      const t = clamp((0.012 - Y) / 0.056, 0, 1), w = 0.0072 + 0.0052 * t;
      d += (0.0025 + 0.0175 * Math.pow(t, 1.35)) * Math.exp(-((X / w) ** 2)) * smooth(0.02, 0.006, Y) * smooth(-0.056, -0.045, Y);
      d += 0.0075 * G(X, Y, 0, -0.043, 0.0098, 0.0078);
      d += 0.0085 * G(ax, Y, 0.015, -0.047, 0.0075, 0.0068);
      d += -0.0014 * G(ax, Y, 0.026, -0.062, 0.0045, 0.013);                // nasolabial crease
      // mouth: philtrum, cupid's bow upper lip, parted line, fuller lower lip, mentolabial groove, chin
      d += -0.0011 * G(X, Y, 0, -0.061, 0.0034, 0.0055) + 0.0007 * G(ax, Y, 0.0048, -0.061, 0.0018, 0.0055);
      d += 0.0031 * G(X, Y + 0.0013 * Math.cos(X * 160) * G(X, 0, 0, 0, 0.014, 1), 0, -0.068, 0.03, 0.0042) + 0.0007 * G(X, Y + 0.0013 * Math.cos(X * 160) * G(X, 0, 0, 0, 0.014, 1), 0, -0.0648, 0.028, 0.0009);   // upper lip + vermilion ridge
      d += -0.0026 * G(X, Y + 0.003 * (X / 0.03) ** 2, 0, -0.0732, 0.033, 0.0013);
      d += 0.0034 * G(X, Y, 0, -0.0792, 0.025, 0.005);
      d += -0.0024 * G(X, Y, 0, -0.0885, 0.015, 0.0042);
      d += 0.009 * G(X, Y, 0, -0.107, 0.02, 0.014) + 0.003 * G(ax, Y, 0.012, -0.11, 0.008, 0.01);   // chin, slightly squared
      d += 0.0045 * G(ax, Y, 0.074, -0.083, 0.012, 0.018);                // jaw angle
      d += -0.002 * G(ax, Y, 0.068, -0.108, 0.016, 0.012);                // taper under the jaw
      return d * front;
    },
  };
  P(ellipsoid(HB.headC, [0.11, 0.132, 0.12], (n0, q) => {
    const X = q[0], Y = q[1], front = smooth(0.25, 0.65, n0[2]), ax = Math.abs(X);
    // skin tones: warm flush on cheeks, nose and ears, cooler under the eyes and along the jaw, lips blended in
    let c = HC.skin.slice(0, 3);
    c = V.lerp(c, HC.blush, (0.22 * G(ax, Y, 0.05, -0.035, 0.024, 0.022) + 0.2 * G(X, Y, 0, -0.045, 0.012, 0.012)) * front);
    c = V.lerp(c, V.mul(HC.skin, 0.88), 0.15 * G(ax, Y, 0.041, -0.009, 0.018, 0.006) * front);
    c = V.lerp(c, [0.8, 0.64, 0.56], 0.1 * smooth(-0.06, -0.11, Y) * (1 - G(X, Y, 0, -0.107, 0.02, 0.014)));
    const lip = Math.max(G(X, Y + 0.0013 * Math.cos(X * 160) * G(X, 0, 0, 0, 0.014, 1), 0, -0.069, 0.028, 0.0044), G(X, Y, 0, -0.0795, 0.024, 0.0056));
    c = V.lerp(c, V.lerp(HC.lip, HC.blush, 0.35), smooth(0.25, 0.75, lip) * 0.7 * front);
    c = V.lerp(c, [0.9, 0.6, 0.56], G(X, Y, 0, -0.0786, 0.011, 0.0022) * 0.18 * front);   // moist sheen on the lower lip
        c = V.lerp(c, [0.3, 0.12, 0.1], G(X, Y + 0.003 * (X / 0.03) ** 2, 0, -0.0732, 0.032, 0.0008) * 0.85 * front);
    c = V.lerp(c, [0.45, 0.24, 0.2], G(ax, Y, 0.031, -0.0745, 0.0035, 0.002) * 0.3 * front);
    c = V.lerp(c, [0.3, 0.14, 0.12], G(ax, Y, 0.0085, -0.0515, 0.0032, 0.0018) * smooth(0, -0.4, n0[1] - 0.2) * 0.9);
    // cavity occlusion from the sculpt: sockets, alar creases, mouth corners and the groove under the lip sit in shade
    const cav = FACE.disp(X, Y, front), ao = clamp(1 + Math.min(cav, 0) * 40 * (1 - G(X, Y, 0, -0.062, 0.012, 0.008)), 0.66, 1.0)
      * (1 - front * (0.13 * G(ax, Y, 0.013, -0.022, 0.0065, 0.02) + 0.13 * G(ax, Y, 0.038, 0.017, 0.022, 0.006) + 0.09 * G(ax, Y, 0.056, -0.046, 0.02, 0.012) + 0.1 * G(ax, Y, 0.021, 0.004, 0.006, 0.008)));
    const under = 1 - 0.06 * G(X, Y, 0, -0.054, 0.012, 0.0028) * front - 0.1 * G(ax, Y, 0.017, -0.052, 0.005, 0.004) * front - 0.08 * G(X, Y, 0, -0.086, 0.014, 0.003) * front;
    c = V.mul(c, ao * under);
    return c.concat([1]);
  }, 110, 90, (q, n0) => {
    if (n0[1] < 0) { const k = -n0[1]; q[0] *= 1 - 0.17 * Math.pow(k, 1.4); q[2] += 0.005 * k * k * Math.max(0, n0[2]); }
    if (n0[2] < -0.3) q[2] *= 0.94;
    // jawline: squash the underside of the jaw up into a plane so the chin and jaw meet the neck at an edge
    { const jy = -0.118 + 0.03 * (1 - smooth(-0.1, 0.9, n0[2])), lim = jy - 0.003;
      if (n0[2] > -0.35 && q[1] < lim) { q[1] = lim - (lim - q[1]) * 0.3; q[2] -= (lim - q[1]) * 0.4 * Math.max(0, n0[2]); } }
    const front = smooth(0.25, 0.65, n0[2]);
    const d = FACE.disp(q[0], q[1], front);
    // the nose and lips push straight forward; everything else along the surface normal
    const fw = G(q[0], q[1], 0, -0.05, 0.02, 0.04);
    return V.add(q, V.add(V.mul(n0, d * (1 - fw)), [0, 0, d * fw]));
  }), [BI.head]);
  // hair cap: covers crown, back and sides; leaves the face open
  const hc = HB.headC;
  const cap = ellipsoid(V.add(hc, [0, 0.008, -0.006]), [0.123, 0.145, 0.133], (n0) => {
    const streak = 0.95 + 0.07 * hash2(Math.floor(Math.atan2(n0[0], n0[2]) * 14), 3);
    return V.mul(V.lerp(HC.hairDark, HC.hair, 0.15 + 0.35 * smooth(-0.6, 0.9, n0[1])), streak * 0.85).concat([7]);
  }, 34, 26);
  P(keepTris(cap, (p) => { const q = [(p[0] - hc[0]) / 0.123, (p[1] - hc[1] - 0.008) / 0.145, (p[2] - hc[2] + 0.006) / 0.133]; return q[1] > 0.3 || (q[2] < 0.1 && q[1] > -0.5) || (q[2] < 0.4 && q[1] > 0.05 && Math.abs(q[0]) > 0.7); }), [BI.head]);
  // neck: sternocleidomastoid ridges running from behind the ears to the collarbones, Adam's apple, soft hollows between
  {
    const na = [0, 1.3, -0.006], nb = [0, 1.46, 0];
    const scm = (t, an) => { let d = 0; for (const sg of [1, -1]) d += G(an, t, Math.PI / 2 + sg * lerp(0.35, 1.35, t), 0, 0.22, 10); return d; };
    const neckC = (t, an) => V.mul(HC.skin, 1 - 0.1 * G(an, t, Math.PI / 2, 0.15, 0.3, 0.2) - 0.06 * Math.max(0, 0.6 - scm(t, an)) * G(an, 0, Math.PI / 2, 0, 1.1, 1)).concat([1]);
    P(wrinkle(tubeMesh(na, nb, t => lerp(0.052, 0.046, t), neckC, 36, 14), na, nb,
      (t, an) => 0.0028 * scm(t, an) * smooth(0.05, 0.3, t) * (1 - smooth(0.8, 1, t)) + 0.0045 * G(an, t, Math.PI / 2, 0.5, 0.22, 0.12)), [BI.neck, BI.head, BI.chest]);
  }
  // ---- torso ----
  // cloth bloused over the belt: fullness gathered into vertical folds that fade up the ribs
  const blouse = (n0) => {
    const ph = Math.atan2(n0[0], n0[2]), w = Math.pow(1 - smooth(-0.95, -0.05, n0[1]), 1.3);
    return [w, Math.sin(ph * 13 + Math.sin(ph * 3.2) * 1.4) * 0.6 + Math.sin(ph * 22 + 1.1) * 0.4];
  };
  P(ellipsoid([0, 1.19, -0.006], [0.158, 0.19, 0.112], (n0) => {
    // V-neck shirt opening: linen recessed behind a gold-trimmed edge, shaded toward the point, with a soft fold
    const vIn = Math.abs(n0[0]) < (n0[1] - 0.42) * 0.9, vRim = Math.abs(n0[0]) < (n0[1] - 0.36) * 0.9 + 0.05;
    if (n0[2] > 0.5 && n0[1] > 0.44 && vIn) { const k = 0.78 + 0.22 * smooth(0.44, 0.8, n0[1]) - 0.06 * Math.cos(n0[0] * 40); return V.mul(HC.shirt, k).concat([2]); }
    if (n0[2] > 0.45 && n0[1] > 0.36 && vRim) return HC.trim;
    const [bw, bf] = blouse(n0), bk = 1 - bw * (0.34 - 0.44 * Math.pow(bf * 0.5 + 0.5, 0.8));
    return V.mul(V.lerp(HC.tunicDark, HC.tunic, smooth(-0.9, 0.3, n0[1])), bk).concat([9]);
  }, 96, 72, (q, n0) => {
    { const [bw, bf] = blouse(n0); q = V.add(q, V.mul(n0, bw * (0.006 + 0.006 * bf))); }
    if (n0[2] > 0.5 && n0[1] > 0.44 && Math.abs(n0[0]) < (n0[1] - 0.42) * 0.9) q = V.sub(q, V.mul(n0, 0.006));
    else if (n0[2] > 0.45 && n0[1] > 0.36 && Math.abs(n0[0]) < (n0[1] - 0.36) * 0.9 + 0.05) q = V.add(q, V.mul(n0, 0.002));
    // V-taper: broad across the shoulders, narrowing to the waist; flatter front with a hint of pectorals, flat back
    q[0] *= 1 + 0.13 * smooth(-0.1, 0.65, n0[1]) - 0.1 * smooth(0.0, -0.8, n0[1]);
    if (n0[2] > 0) { q[2] *= 0.9; q[2] += 0.007 * G(Math.abs(n0[0]), n0[1], 0.42, 0.35, 0.25, 0.2) * n0[2]; } else q[2] *= 0.84;
    return q;
  }), [BI.chest, BI.spine, BI.ua(1), BI.ua(-1)]);
  P(ellipsoid([0, 1.0, 0], [0.118, 0.14, 0.088], () => HC.tunic, 26, 14), [BI.spine, BI.pelvis, BI.chest]);
  P(transformed(torusMesh(0.064, 0.02, 28, 8, HC.trim), at(0, 1.35, -0.004)), [BI.chest, BI.neck]);
  // folded cowl gathered around the neck
  // draped cowl: a soft folded collar, fuller and lower at the front, with irregular folds and shaded valleys
  for (const [R, r, y, col, bones] of [[0.07, 0.026, 1.36, HC.tunicDark, [BI.chest, BI.neck]], [0.057, 0.018, 1.388, V.mul(HC.tunic, 0.9).concat([2]), [BI.neck, BI.chest]]]) {
    const m = new Mesh(), NA = 64, NS = 12;
    for (let i = 0; i <= NA; i++) for (let j = 0; j <= NS; j++) {
      const a = i / NA * TAU, b = j / NS * TAU, fold = Math.sin(a * 9 + Math.sin(a * 3) * 1.5) * 0.35 + Math.sin(a * 17 + 1) * 0.15;
      const front = Math.max(0, Math.cos(a)), rr = r * (1 + 0.25 * fold + 0.3 * front), RR = R * (1 + 0.04 * fold);
      const cx = Math.sin(a) * RR, cz = Math.cos(a) * RR * 0.92 - 0.01, dy = -0.012 * front;
      const nx = Math.sin(a) * Math.cos(b), ny = Math.sin(b), nz = Math.cos(a) * Math.cos(b);
      const sh = 0.82 + 0.18 * (fold * 0.5 + 0.5);
      m.v([cx + nx * rr, y + dy + ny * rr * 0.85, cz + nz * rr], [nx, ny, nz], [col[0] * sh, col[1] * sh, col[2] * sh, 2]);
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NS; j++) { const q = i * (NS + 1) + j, w = q + NS + 1; m.tri(q, w, q + 1); m.tri(q + 1, w, w + 1); }
    m.recomputeNormals();
    P(m, bones);
  }
  // tunic skirt: blended between pelvis and the thighs so it flares with each stride
  {
    const m = new Mesh(), seg = 160, rings = 30;
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * TAU;
        // cloth gathered under the belt opening into deep, irregular drape folds toward the hem
        const g = Math.sin(a * 23 + Math.sin(a * 4.3) * 1.2) * 0.5 + Math.sin(a * 37 + 1.3) * 0.5;
        const d = Math.sin(a * 9 + Math.sin(a * 2.7 + 0.6) * 1.6 + t * 0.9) * 0.62 + Math.sin(a * 15 + 2.1 + t * 1.7) * 0.28 + Math.sin(a * 5 + 1) * 0.2;
        const fold = lerp(g, d, smooth(0.0, 0.35, t)), amp = 0.006 * (1 - smooth(0, 0.3, t)) + 0.12 * Math.pow(t, 1.25);
        const wave = fold * amp, y = lerp(0.975, 0.64, t) - 0.014 * t * t * (fold * 0.5 + 0.5) + 0.006 * t * Math.sin(a * 3 + 0.4);
        const rx = lerp(0.15, 0.235, Math.sqrt(t)), rz = lerp(0.112, 0.18, Math.sqrt(t));
        const sh = clamp(0.62 + 0.5 * Math.pow(fold * 0.5 + 0.5, 0.8) - 0.1 * (1 - smooth(0, 0.12, t)), 0.55, 1.1);
        m.v([Math.sin(a) * rx * (1 + wave), y, Math.cos(a) * rz * (1 + wave)], V.norm([Math.sin(a), 0.35, Math.cos(a)]), V.mul(HC.tunic, sh).concat([9]));
      }
    }
    for (let k = 0; k < rings; k++) for (let j = 0; j < seg; j++) { const a = k * (seg + 1) + j, b = a + seg + 1; m.tri(a, b, a + 1); m.tri(a + 1, b, b + 1); }
    m.recomputeNormals();
    P(m, null, (p) => {
      const t = clamp((0.975 - p[1]) / 0.335, 0, 1), s = smooth(-0.07, 0.07, p[0]), k = 0.8 * t * t;
      return [[BI.pelvis, 1 - k], [BI.thigh(1), k * s], [BI.thigh(-1), k * (1 - s)]];
    });
  }
  // mail skirt: a hauberk hem hanging a hand's width below the tunic
  {
    const m = new Mesh(), seg = 64, rings = 5, mail = [0.3, 0.31, 0.33, 16];
    for (let k = 0; k <= rings; k++) {
      const t = k / rings, y = lerp(0.74, 0.585, t), tt = lerp(0.7, 1.16, t), rx = lerp(0.15, 0.235, Math.sqrt(tt)) - 0.012, rz = lerp(0.112, 0.18, Math.sqrt(tt)) - 0.012;
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * TAU, dag = k === rings ? 0.012 * (Math.abs(Math.sin(a * 24)) - 0.5) : 0;
        m.v([Math.sin(a) * rx, y + dag, Math.cos(a) * rz], V.norm([Math.sin(a), 0.2, Math.cos(a)]), mail);
      }
    }
    for (let k = 0; k < rings; k++) for (let j = 0; j < seg; j++) { const a = k * (seg + 1) + j, b = a + seg + 1; m.tri(a, b, a + 1); m.tri(a + 1, b, b + 1); }
    m.recomputeNormals();
    P(m, null, (p) => {
      const t = clamp((0.975 - p[1]) / 0.335, 0, 1), s = smooth(-0.07, 0.07, p[0]), k = 0.8 * t * t;
      return [[BI.pelvis, 1 - k], [BI.thigh(1), k * s], [BI.thigh(-1), k * (1 - s)]];
    });
  }
  // belt: a flat leather band with bevelled edges, a stitched groove, brass rivets and a framed buckle
  {
    const bc = [0, 0.958, 0], rx = 0.168, rz = 0.126, seg = 72;
    const prof = [[-0.003, -0.023], [0.006, -0.023], [0.0095, -0.019], [0.0095, -0.014], [0.0085, -0.0125], [0.0095, -0.011], [0.0095, 0.011], [0.0085, 0.0125], [0.0095, 0.014], [0.0095, 0.019], [0.006, 0.023], [-0.003, 0.023]];
    const m = new Mesh();
    for (let k = 0; k < prof.length; k++) for (let j = 0; j <= seg; j++) {
      const a = j / seg * TAU, e = [Math.sin(a) * rx, Math.cos(a) * rz], nn = V.norm([Math.sin(a) / rx, 0, Math.cos(a) / rz]);
      const [dr, dy] = prof[k], groove = (k >= 3 && k <= 5) || (k >= 6 && k <= 8);
      m.v([e[0] + nn[0] * dr, bc[1] + dy, e[1] + nn[2] * dr], nn, groove ? HC.leatherDark : V.mul(HC.leather, 0.95).concat([3]));
    }
    for (let k = 0; k < prof.length - 1; k++) for (let j = 0; j < seg; j++) { const q = k * (seg + 1) + j, w = q + seg + 1; m.tri(q, w, q + 1); m.tri(q + 1, w, w + 1); }
    m.recomputeNormals();
    P(m, [BI.pelvis]);
    // rivets in pairs around the band, skipping the buckle
    for (let j = 0; j < 22; j++) {
      const a = j / 22 * TAU + 0.14; if (Math.abs(Math.sin(a / 2)) < 0.16) continue;
      const nn = V.norm([Math.sin(a) / rx, 0, Math.cos(a) / rz]), p0 = [Math.sin(a) * (rx + 0.009), bc[1], Math.cos(a) * (rz + 0.009)];
      for (const dy of [-0.0075, 0.0075]) P(ellipsoid(V.add(p0, [0, dy, 0]), [0.0042, 0.0042, 0.0042], HC.gold, 8, 5, (q) => V.add([q[0] * 0.5 + q[0] * 0.5 * Math.abs(nn[2]), q[1], q[2] * 0.5 + q[2] * 0.5 * Math.abs(nn[0])], [0, 0, 0])), [BI.pelvis]);
    }
    // buckle: rounded gold frame, centre bar and prong, with the tongue threaded through
    const z0 = rz + 0.013, bw = 0.03, bh = 0.029, br = 0.0045;
    const fr = [[-bw, -bh], [bw, -bh], [bw, bh], [-bw, bh]];
    for (let k = 0; k < 4; k++) { const a = fr[k], b = fr[(k + 1) % 4]; P(tubeMesh([a[0], bc[1] + a[1], z0], [b[0], bc[1] + b[1], z0], () => br, () => HC.gold, 10, 2), [BI.pelvis]); }
    P(tubeMesh([-0.004, bc[1] - bh, z0 - 0.002], [-0.004, bc[1] + bh, z0 - 0.002], () => 0.003, () => HC.gold, 8, 2), [BI.pelvis]);
    P(tubeMesh([-0.004, bc[1], z0 + 0.003], [bw + 0.004, bc[1], z0 + 0.004], () => 0.0026, () => HC.steel, 8, 2), [BI.pelvis]);
    P(ellipsoid([-bw * 0.52, bc[1], z0 - 0.004], [bw * 0.46, 0.022, 0.004], V.mul(HC.leather, 0.95).concat([3]), 12, 6), [BI.pelvis]);
    // free end of the strap tucked through a keeper and hanging down the hip
    P(ellipsoid([bw + 0.022, bc[1], z0 - 0.004], [0.007, 0.026, 0.005], HC.leatherDark, 8, 6), [BI.pelvis]);
    P(tubeMesh([bw + 0.034, bc[1] + 0.012, z0 - 0.008], [bw + 0.05, bc[1] - 0.09, z0 - 0.002], t => 0.011 - t * 0.002, () => V.mul(HC.leather, 0.95).concat([3]), 10, 6), [BI.pelvis, BI.thigh(-1)]);
    P(ellipsoid([bw + 0.05, bc[1] - 0.095, z0 - 0.001], [0.011, 0.006, 0.004], HC.gold, 8, 5), [BI.pelvis, BI.thigh(-1)]);
  }
  // belt pouches: boxy stitched leather bags with a rounded flap and a brass toggle
  const pouch = (c, yaw, sz, col, bones) => {
    const m = new Mesh(), [w, h, dpt] = sz, R = M4.rotY(at(c[0], c[1], c[2]), yaw);
    m.merge(ellipsoid([0, 0, 0], [w, h, dpt], (n0) => (Math.abs(n0[0]) > 0.93 || n0[1] < -0.93 ? V.mul(col, 0.8).concat([3]) : col), 16, 12,
      (q, n0) => { q[0] = Math.sign(q[0]) * Math.pow(Math.abs(q[0] / w), 0.55) * w; q[2] = Math.sign(q[2]) * Math.pow(Math.abs(q[2] / dpt), 0.7) * dpt; if (q[1] > 0) q[1] *= 0.85; return q; }));
    const flap = new Mesh(), N = 10;
    for (let u = 0; u <= 3; u++) for (let j = 0; j <= N; j++) {
      const t = u / 3, x = lerp(-w * 1.02, w * 1.02, j / N), round = t > 0.7 ? (1 - Math.pow(Math.abs(x / w), 2)) * (t - 0.7) * 0.8 : 0;
      const y = h * 0.8 - t * h * 0.95 - round * h, z = dpt * (1.02 + 0.1 * Math.sin(t * Math.PI));
      flap.v([x * (t > 0.7 ? 1 - (t - 0.7) * 0.8 * Math.pow(Math.abs(x / w), 3) : 1), y, z], [0, 0.3, 1], u === 3 || j === 0 || j === N ? HC.leatherDark : V.mul(col, 1.08).concat([3]));
    }
    for (let u = 0; u < 3; u++) for (let j = 0; j < N; j++) { const q = u * (N + 1) + j, b = q + N + 1; flap.tri(q, b, q + 1); flap.tri(q + 1, b, b + 1); }
    flap.recomputeNormals(); m.merge(flap);
    m.merge(ellipsoid([0, -h * 0.25, dpt * 1.15], [w * 0.16, h * 0.1, dpt * 0.18], HC.gold, 10, 6));
    P(transformed(m, R), bones);
  };
  pouch([-0.172, 0.905, 0.06], -1.1, [0.042, 0.048, 0.026], HC.leather, [BI.pelvis, BI.thigh(-1)]);
  pouch([0.16, 0.912, -0.08], 2.2, [0.034, 0.04, 0.022], HC.leatherLight, [BI.pelvis, BI.thigh(1)]);
  // baldric across the chest (front and back)
  // flat leather strap: a ribbon with bevelled edges following the torso surface, dotted with rivets
  const strap = (pts) => {
    const m = new Mesh(), W = 0.017, T = 0.004, sub = [];
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) sub.push(V.lerp(pts[i], pts[i + 1], k / 6));
    sub.push(pts[pts.length - 1]);
    const prof = [[-W, -T * 0.3], [-W * 0.85, T], [W * 0.85, T], [W, -T * 0.3]];
    sub.forEach((p, i) => {
      const tg = V.norm(V.sub(sub[Math.min(i + 1, sub.length - 1)], sub[Math.max(i - 1, 0)]));
      const out = V.norm(V.sub([p[0], p[1], p[2]], [0, p[1], -0.006])), side = V.norm(V.cross(tg, out)), up = V.cross(side, tg);
      for (const [s, o] of prof) m.v(V.add(p, V.add(V.mul(side, s), V.mul(up, o))), up, Math.abs(s) > W * 0.9 ? HC.leatherDark : HC.leather);
    });
    for (let i = 0; i < sub.length - 1; i++) for (let k = 0; k < 3; k++) { const q = i * 4 + k, b = q + 4; m.tri(q, b, q + 1); m.tri(q + 1, b, b + 1); }
    m.recomputeNormals();
    P(m, [BI.chest, BI.spine]);
    for (let i = 3; i < sub.length - 3; i += 5) { const p = sub[i], out = V.norm(V.sub(p, [0, p[1], -0.006])); P(ellipsoid(V.add(p, V.mul(out, 0.005)), [0.0035, 0.0035, 0.0035], HC.gold, 6, 4), [BI.chest, BI.spine]); }
  };
  strap([[0.12, 1.33, 0.06], [0.05, 1.24, 0.112], [-0.04, 1.12, 0.113], [-0.12, 1.0, 0.13], [-0.17, 0.96, 0.08]]);
  strap([[0.12, 1.33, -0.07], [0.04, 1.22, -0.104], [-0.06, 1.1, -0.1], [-0.13, 0.98, -0.07]]);
  // left spaulder: steel cap with a raised ridge, three overlapping lames down the upper arm, gold edging and rivets
  {
    const c = [0.19, 1.33, -0.01], r = [0.088, 0.058, 0.086];
    const steelD = [0.4, 0.42, 0.46, 4], steelL = [0.62, 0.64, 0.68, 4];
    const dome = ellipsoid(c, r, (n0) => n0[1] < 0.2 ? HC.gold : (Math.abs(n0[2]) < 0.1 ? steelL : steelD), 32, 18,
      (q, n0) => { q[1] -= q[0] * 0.35; if (Math.abs(n0[2]) < 0.1 && n0[1] > 0.2) q = V.add(q, V.mul(n0, 0.006 * (1 - Math.abs(n0[2]) / 0.1))); return q; });
    P(keepTris(dome, q => q[1] - (q[0] - c[0]) * -0.35 > c[1] - 0.004), [BI.ua(1), BI.chest]);
    for (let j = 0; j < 5; j++) { const a = -1.1 + j * 0.55; P(ellipsoid([c[0] + Math.sin(a) * r[0] * 0.95, c[1] + 0.006 - Math.sin(a) * r[0] * 0.95 * 0.35, c[2] + Math.cos(a) * r[2] * 0.95], [0.005, 0.005, 0.005], HC.gold, 6, 4), [BI.ua(1)]); }
    const sh = HB.sh, el = HB.el, ay = V.norm(V.sub(el, sh)), L = V.len(V.sub(el, sh));
    const ox = V.norm(V.sub([1, 0.25, 0], V.mul(ay, V.dot([1, 0.25, 0], ay)))), oz = V.cross(ay, ox);
    for (let k = 0; k < 3; k++) {
      const m = new Mesh(), tc = 0.13 + k * 0.13, w = 0.2, rr = 0.07 - k * 0.004, NA = 20, NU = 4, span = 1.5 - k * 0.1;
      for (let u = 0; u <= NU; u++) for (let j = 0; j <= NA; j++) {
        const uu = u / NU, a = lerp(-span, span, j / NA), rad = rr + uu * 0.012;
        const dir = V.add(V.mul(ox, Math.cos(a)), V.mul(oz, Math.sin(a)));
        const q = V.add(sh, V.add(V.mul(ay, (tc + (uu - 0.5) * w) * L), V.mul(dir, rad)));
        const edge = uu > 0.8 || j === 0 || j === NA;
        m.v(q, dir, edge ? HC.gold : (Math.abs(a) < 0.12 ? steelL : steelD));
      }
      for (let u = 0; u < NU; u++) for (let j = 0; j < NA; j++) { const a = u * (NA + 1) + j, b = a + NA + 1; m.tri(a, a + 1, b); m.tri(a + 1, b + 1, b); }
      m.recomputeNormals();
      P(m, [BI.ua(1)]);
      for (const a of [-span * 0.8, 0, span * 0.8]) {
        const dir = V.add(V.mul(ox, Math.cos(a)), V.mul(oz, Math.sin(a)));
        P(ellipsoid(V.add(sh, V.add(V.mul(ay, (tc + 0.2 * w) * L), V.mul(dir, rr + 0.011))), [0.0042, 0.0042, 0.0042], HC.gold, 6, 4), [BI.ua(1)]);
      }
    }
    // leather strap holding the lames to the arm
    const ring = []; for (let j = 0; j <= 20; j++) { const a = j / 20 * TAU; ring.push(V.add(sh, V.add(V.mul(ay, 0.5 * L), V.add(V.mul(ox, Math.cos(a) * 0.056), V.mul(oz, Math.sin(a) * 0.056))))); }
    for (let j = 0; j < 20; j++) P(tubeMesh(ring[j], ring[j + 1], () => 0.004, () => HC.leatherDark, 5, 1, [false, false]), [BI.ua(1)]);
  }
  // cloak clasp at the front of the cowl: gold boss with a ruby
  P(ellipsoid([0, 1.336, 0.1], [0.028, 0.028, 0.011], (n0) => Math.hypot(n0[0], n0[1]) > 0.8 ? V.mul(HC.gold, 0.8).concat([5]) : HC.gold, 16, 10), [BI.chest, BI.neck]);
  P(ellipsoid([0, 1.336, 0.109], [0.012, 0.012, 0.007], mc('#c8102e', 6), 12, 8), [BI.chest, BI.neck]);
  for (const s of [1, -1]) P(tubeMesh([s * 0.026, 1.338, 0.098], [s * 0.1, 1.345, 0.02], () => 0.0035, (t) => (Math.floor(t * 8) % 2 ? HC.gold : V.mul(HC.gold, 0.7).concat([5])), 6, 8), [BI.chest]);
  // V-neck laces criss-crossing the shirt opening
  const chestZ = (x, y) => -0.006 + 0.112 * Math.sqrt(Math.max(0, 1 - (x / 0.158) ** 2 - ((y - 1.19) / 0.19) ** 2)) + 0.004;
  for (let k = 0; k < 3; k++) {
    const y0 = 1.292 + k * 0.016, y1 = y0 + 0.012, x = 0.03 - k * 0.006;
    for (const s of [1, -1]) P(tubeMesh([-x * s, y0, chestZ(-x * s, y0)], [x * s, y1, chestZ(x * s, y1)], () => 0.0024, () => HC.leatherDark, 6, 2), [BI.chest]);
  }
  // knife in a sheath on the left hip
  {
    const A = [0.186, 0.925, 0.05], Bp = [0.215, 0.72, 0.085], ax = V.norm(V.sub(Bp, A));
    // flattened stitched sheath with a pointed gold chape and a throat band
    const sh = tubeMesh(A, Bp, t => lerp(0.017, 0.009, t), (t, an) => t > 0.9 ? HC.gold : (Math.abs(Math.cos(an)) > 0.96 ? HC.leather : HC.leatherDark), 12, 8, [false, false]);
    for (let k = 0; k < sh.vcount; k++) { const p = V.sub([sh.p[k * 3], sh.p[k * 3 + 1], sh.p[k * 3 + 2]], A), along = V.dot(p, ax), perp = V.sub(p, V.mul(ax, along)); const q = V.add(A, V.add(V.mul(ax, along), [perp[0], perp[1], perp[2] * 0.55])); sh.p[k * 3] = q[0]; sh.p[k * 3 + 1] = q[1]; sh.p[k * 3 + 2] = q[2]; }
    sh.recomputeNormals();
    P(sh, [BI.pelvis, BI.thigh(1)]);
    P(tubeMesh(Bp, V.add(Bp, V.mul(ax, 0.02)), t => lerp(0.009, 0.001, t), () => HC.gold, 8, 2, [false, true]), [BI.pelvis, BI.thigh(1)]);
    P(transformed(torusMesh(0.0175, 0.003, 14, 5, HC.gold), basisY(A, ax)), [BI.pelvis, BI.thigh(1)]);
    // hilt: guard, cord-wrapped grip, pommel
    const g0 = V.sub(A, V.mul(ax, 0.006)), g1 = V.sub(A, V.mul(ax, 0.07));
    P(ellipsoid(g0, [0.026, 0.006, 0.009], HC.steel, 10, 6), [BI.pelvis, BI.thigh(1)]);
    P(tubeMesh(g0, g1, () => 0.0085, (t) => (Math.floor(t * 10) % 2 ? HC.leather : HC.leatherDark), 8, 10), [BI.pelvis, BI.thigh(1)]);
    P(ellipsoid(V.sub(g1, V.mul(ax, 0.006)), [0.012, 0.012, 0.012], HC.steel, 10, 8), [BI.pelvis, BI.thigh(1)]);
  }
  P(tubeMesh([0.183, 0.945, 0.048], [0.176, 1.02, 0.04], () => 0.011, (t) => (Math.floor(t * 6) % 2 ? HC.leather : HC.wood), 8, 6), [BI.pelvis]);
  P(ellipsoid([0.184, 0.94, 0.049], [0.03, 0.007, 0.014], HC.gold, 10, 6), [BI.pelvis]);
  P(ellipsoid([0.175, 1.028, 0.04], [0.014, 0.014, 0.014], HC.gold, 8, 6), [BI.pelvis]);
  // pouch flap and buckle
  P(ellipsoid([-0.172, 0.945, 0.078], [0.044, 0.024, 0.03], HC.leatherDark, 12, 8), [BI.pelvis, BI.thigh(-1)]);
  P(ellipsoid([-0.172, 0.93, 0.1], [0.009, 0.008, 0.005], HC.gold, 8, 6), [BI.pelvis]);
  // ---- arms + hands ----
  for (const s of [1, -1]) {
    const sh = sd(HB.sh, s), el = sd(HB.el, s), wr = sd(HB.wr, s), ha = sd(HB.ha, s);
    // short tunic sleeve: a deltoid-shaped cap flowing into a flared sleeve with soft folds and a gold-trimmed hem
    P(ellipsoid(sd([0.15, 1.326, -0.008], s), [0.054, 0.04, 0.058], HC.tunic, 20, 12, (q) => { if (q[1] < 0) q[1] *= 0.5; return q; }), [BI.ua(s), BI.chest]);
    {
      const A = sd([0.158, 1.345, -0.009], s), B = V.lerp(sh, el, 0.36);
      P(wrinkle(tubeMesh(A, B, t => lerp(0.062, 0.06, t) + 0.006 * smooth(0.6, 1, t), (t) => t > 0.86 ? (t > 0.95 ? V.mul(HC.trim, 0.8).concat([5]) : HC.trim) : V.lerp(HC.tunicDark, HC.tunic, smooth(0, 0.5, t)).concat([2]), 36, 16, [true, false]), A, B,
        (t, an) => 0.0028 * Math.sin(an * 6 + t * 3) * smooth(0.2, 0.8, t)), [BI.ua(s), BI.chest]);
    }
    // linen sleeve: soft vertical pleats from the shoulder seam, compression folds bunching at the elbow, gathered cuff
    P(wrinkle(tubeMesh(sh, el, t => lerp(0.053, 0.044, t) + Math.sin(t * Math.PI) * 0.005, (t) => t > 0.9 ? HC.trim : HC.shirt, 40, 36), sh, el,
      (t, an) => 0.009 * Math.sin(an * 7 + Math.sin(t * 7) * 1.4) * smooth(0.05, 0.3, t) * (1 - smooth(0.7, 0.9, t))
        + 0.0065 * Math.max(0, Math.sin(t * 40 + an * 1.6 + Math.sin(an * 3))) * smooth(0.55, 0.85, t) * (t < 0.9 ? 1 : 0)
        + (t > 0.9 ? 0.0025 * Math.abs(Math.sin(an * 11)) : 0)), [BI.ua(s), BI.chest, BI.fa(s)]);
    P(tubeMesh(el, wr, t => t < 0.3 ? lerp(0.041, 0.037, t / 0.3) : lerp(0.045, 0.036, (t - 0.3) / 0.7), (t) => t < 0.28 ? HC.skin : (t < 0.36 || t > 0.93 ? HC.leatherLight : HC.leather), 18, 12), [BI.fa(s), BI.ua(s), BI.hand(s)]);
    // bracer: steel vambrace plate on the outer forearm, buckled straps and cross lacing on the inside
    {
      const ay = V.norm(V.sub(wr, el)), L = V.len(V.sub(wr, el));
      const oz = V.norm(V.sub([0, 0, 1], V.mul(ay, ay[2]))), ox = V.mul(V.cross(ay, oz), -s);
      const br = t => lerp(0.045, 0.036, (t - 0.3) / 0.7);
      const pt = (t, a, off) => V.add(el, V.add(V.mul(ay, t * L), V.mul(V.add(V.mul(ox, Math.cos(a)), V.mul(oz, Math.sin(a) * s)), br(t) + off)));
      const pm = new Mesh(), nt = 14, na = 16, a0 = 1.0;
      for (let i = 0; i <= nt; i++) for (let j = 0; j <= na; j++) {
        const t = lerp(0.4, 0.9, i / nt), a = lerp(-a0, a0, j / na), ridge = 0.004 * Math.max(0, 1 - Math.abs(a) * 4) + 0.0015 * Math.cos(a * 1.5);
        const q = pt(t, a, 0.004 + ridge), nn = V.norm(V.sub(q, V.add(el, V.mul(ay, t * L))));
        pm.v(q, nn, Math.abs(a) > a0 * 0.8 || i <= 1 || i >= nt - 1 ? HC.gold : (Math.abs(a) < 0.12 ? [0.62, 0.64, 0.68, 4] : [0.4, 0.42, 0.46, 4]));
      }
      for (let i = 0; i < nt; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + na + 1; pm.tri(a, a + 1, b); pm.tri(a + 1, b + 1, b); }
      pm.recomputeNormals();
      P(pm, [BI.fa(s)]);
      for (const t of [0.44, 0.86]) for (const a of [-0.7, 0.7]) P(ellipsoid(pt(t, a, 0.007), [0.0035, 0.0035, 0.0035], HC.gold, 8, 5), [BI.fa(s)]);
      // two straps with small buckles
      for (const t of [0.52, 0.78]) {
        const ring = [];
        for (let j = 0; j <= 20; j++) ring.push(pt(t, a0 + j / 20 * (TAU - 2 * a0), 0.0025));
        for (let j = 0; j < 20; j++) P(tubeMesh(ring[j], ring[j + 1], () => 0.0032, () => HC.leatherDark, 5, 1, [false, false]), [BI.fa(s)]);
        P(ellipsoid(pt(t, a0 + 0.3, 0.003), [0.0055, 0.0055, 0.0055], HC.gold, 8, 6), [BI.fa(s)]);
      }
      // criss-cross lacing on the inner forearm
      const lz = [];
      for (let k = 0; k <= 6; k++) { const t = lerp(0.4, 0.9, k / 6); lz.push(pt(t, Math.PI + 0.32, 0.002), pt(t, Math.PI - 0.32, 0.002)); }
      for (let k = 0; k < 6; k++) {
        P(tubeMesh(lz[k * 2], lz[k * 2 + 3], () => 0.0018, () => HC.shirt, 5, 1), [BI.fa(s)]);
        P(tubeMesh(lz[k * 2 + 1], lz[k * 2 + 2], () => 0.0018, () => HC.shirt, 5, 1), [BI.fa(s)]);
      }
      for (const q of lz) P(ellipsoid(q, [0.0025, 0.0025, 0.0025], HC.gold, 6, 4), [BI.fa(s)]);
    }
    // hand in its own frame: y toward fingertips, fingers curl inward
    const y = V.norm(V.sub(ha, wr)), z = V.norm(V.sub([0, 0, 1], V.mul(y, y[2]))), x = V.cross(y, z);
    const M = new Float32Array([...x, 0, ...y, 0, ...z, 0, ...wr, 1]);
    const h = new Mesh(), g = s; // inward is +x local on both sides after the basis flip
    // palm: a flattened, slightly boxy glove shell
    h.merge(ellipsoid([0, 0.045, 0], [0.021, 0.042, 0.035], HC.leather, 18, 14, (q) => { q[2] *= 1 + 0.12 * (1 - Math.abs(q[1]) / 0.042); return q; }));
    // fingers: three tapering phalanges each, knuckles, nails on the back of the tips; middle finger longest
    const nail = [0.93, 0.78, 0.74, 1];
    const seg3 = (p0, zz, lens, angs, r0) => {
      let p = p0, th = 0;
      for (let k = 0; k < 3; k++) {
        th += angs[k];
        const d = [Math.sin(th) * g, Math.cos(th), 0], q = V.add(p, V.mul(d, lens[k])), r = r0 * (1 - k * 0.12);
        h.merge(tubeMesh(p, q, (t) => lerp(r, r * 0.9, t), () => HC.skin, 10, 2, [k === 0, k === 2]));
        h.merge(ellipsoid(p, [r * 1.12, r * 1.05, r * 1.12], HC.skin, 8, 6));
        if (k === 2) {
          const nb = [-Math.cos(th) * g, Math.sin(th), 0], c = V.add(V.lerp(p, q, 0.62), V.mul(nb, r * 0.82));
          h.merge(transformed(ellipsoid([0, 0, 0], [1, 1, 1], nail, 8, 6), new Float32Array([nb[0] * 0.0018, nb[1] * 0.0018, 0, 0, d[0] * r * 0.85, d[1] * r * 0.85, 0, 0, 0, 0, r * 0.8, 0, c[0], c[1], c[2], 1])));
        }
        p = q;
      }
    };
    for (let f = 0; f < 4; f++) {
      const zz = 0.025 - f * 0.0165, L = [1, 1.08, 1.0, 0.8][f], r0 = [0.0092, 0.0095, 0.009, 0.0078][f];
      seg3([0.001 * g, 0.08 - Math.abs(f - 1.2) * 0.003, zz], zz, [0.024 * L, 0.016 * L, 0.013 * L], [0.45 + f * 0.05, 0.95, 0.55], r0);
    }
    // thumb: two phalanges from the base of the palm, curling across
    {
      const a = [0.012 * g, 0.028, 0.03], b = [0.024 * g, 0.052, 0.04], c2 = [0.036 * g, 0.07, 0.036];
      h.merge(tubeMesh(a, b, (t) => lerp(0.0125, 0.0105, t), () => HC.skin, 10, 2));
      h.merge(ellipsoid(b, [0.0112, 0.0112, 0.0112], HC.skin, 8, 6));
      h.merge(tubeMesh(b, c2, (t) => lerp(0.0102, 0.0088, t), () => HC.skin, 10, 2, [false, true]));
      const d = V.norm(V.sub(c2, b)), nb = V.norm(V.cross(d, [0, 0, g])), cc = V.add(V.lerp(b, c2, 0.62), V.mul(nb, 0.0075));
      h.merge(transformed(ellipsoid([0, 0, 0], [1, 1, 1], nail, 8, 6), new Float32Array([nb[0] * 0.0018, nb[1] * 0.0018, nb[2] * 0.0018, 0, d[0] * 0.0078, d[1] * 0.0078, d[2] * 0.0078, 0, 0, 0, 0.007, 0, cc[0], cc[1], cc[2], 1])));
    }
    h.merge(ellipsoid([-0.0175 * g, 0.05, 0.002], [0.0045, 0.026, 0.024], (n0) => Math.hypot(n0[1], n0[2]) > 0.85 ? HC.leather : HC.leatherDark, 14, 8));   // back-of-hand plate
    h.merge(ellipsoid([-0.0218 * g, 0.05, 0.002], [0.0025, 0.004, 0.004], HC.gold, 8, 6));        // stud
    h.merge(transformed(torusMesh(1, 0.2, 18, 6, HC.leatherDark), M4.scale(at(0, 0.012, 0), 0.028, 0.022, 0.034)));  // wrist strap
    P(transformed(h, M), [BI.hand(s), BI.fa(s)]);
  }
  // ---- legs + boots ----
  for (const s of [1, -1]) {
    const hp = sd(HB.hp, s), kn = sd(HB.kn, s), an = sd(HB.an, s);
    // trousers: outer side seam with stitching, worn knee, folds bunching behind the knee
    const pantsCol = (t, an) => {
      const side = Math.cos(an - (s > 0 ? 0 : Math.PI)), seam = Math.abs(side - 1) < 0.004 ? 0.6 : (Math.abs(side - 0.994) < 0.003 && Math.floor(t * 60) % 2 ? 1.25 : 1);
      const knee = G(t, 0, 0.92, 0, 0.1, 1) * Math.max(0, Math.sin(an)) * 0.15;
      return V.mul(V.lerp(HC.pants, [0.3, 0.33, 0.42], knee), seam).concat([2]);
    };
    // folds: diagonal drag lines fanning from the crotch to the outer thigh, stacked folds over and behind the knee
    P(wrinkle(tubeMesh(hp, kn, t => lerp(0.08, 0.056, t) + Math.sin(t * Math.PI) * 0.006, pantsCol, 72, 64), hp, kn,
      (t, an) => {
        const u = s > 0 ? Math.abs(an) : Math.PI - Math.abs(an), front = Math.max(0, Math.sin(an) + 0.25);
        const drag = Math.pow(Math.max(0, Math.sin(u * 2.6 - t * 15 + Math.sin(an * 3) * 0.6)), 1.6) * smooth(0.02, 0.2, t) * (1 - smooth(0.45, 0.7, t)) * (1 - u / Math.PI * 0.7) * front;
        const stack = Math.pow(Math.max(0, Math.sin(t * 42 + Math.sin(an * 2) * 1.8)), 1.4) * smooth(0.62, 0.95, t) * (Math.max(0, -Math.sin(an) + 0.3) + 0.35 * front);
        return 0.0055 * (drag - 0.3 * smooth(0.02, 0.2, t) * (1 - smooth(0.45, 0.7, t)) * front) + 0.005 * (stack - 0.3 * smooth(0.62, 0.95, t)) + 0.0015 * Math.sin(an * 5 + t * 4) * smooth(0.1, 0.5, t);
      }), [BI.thigh(s), BI.pelvis, BI.shin(s)]);
    // shin: cloth bunching in soft rolls where it tucks into the boot
    P(wrinkle(tubeMesh(kn, an, t => t < 0.34 ? lerp(0.055, 0.05, t / 0.34) : (t < 0.44 ? 0.064 : lerp(0.058, 0.046, (t - 0.44) / 0.56)),
      (t) => t < 0.34 ? HC.pants : (t < 0.44 ? HC.leatherLight : HC.leather), 48, 60), kn, an,
      (t, a) => t < 0.33 ? 0.0045 * smooth(0.08, 0.3, t) * (-0.35 + Math.pow(Math.max(0, Math.sin(t * 95 + Math.sin(a * 3) * 2.2 + a)), 1.3)) : 0), [BI.shin(s), BI.thigh(s), BI.foot(s)]);
    // knee cop: ridged steel cup, a fan wing on the outer side, small lames above and below, gold rims, strap behind
    {
      const stD = [0.28, 0.3, 0.34, 4], stL = [0.5, 0.52, 0.56, 4], kc = V.add(kn, [0, 0.005, 0.048]);
      P(ellipsoid(kc, [0.045, 0.047, 0.021], (n0) => Math.hypot(n0[0], n0[1]) > 0.9 ? HC.gold : (Math.abs(n0[0]) < 0.12 ? stL : stD), 22, 14,
        (q, n0) => { if (Math.abs(n0[0]) < 0.12 && n0[2] > 0) q[2] += 0.004 * (1 - Math.abs(n0[0]) / 0.12); return q; }), [BI.shin(s), BI.thigh(s)]);
      // fan wing: a shallow shell flaring out and back on the outside of the knee
      const wing = new Mesh(), NA = 10, NR = 5;
      for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
        const rr = 0.012 + i / NR * 0.04, a = lerp(-1.25, 1.25, j / NA);
        const q = V.add(kc, [s * (0.03 + rr * 0.75), Math.sin(a) * rr, -rr * 0.9 + Math.cos(a) * 0.012 - 0.01 + (1 - Math.cos(a)) * 0.004]);
        wing.v(q, V.norm([s * 0.8, Math.sin(a) * 0.2, 0.5]), i >= NR - 1 || j === 0 || j === NA ? HC.gold : (j % 3 === 0 ? stL : stD));
      }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; wing.tri(a, a + 1, b); wing.tri(a + 1, b + 1, b); }
      wing.recomputeNormals();
      P(wing, [BI.shin(s), BI.thigh(s)]);
      P(ellipsoid(V.add(kc, [s * 0.034, 0, -0.004]), [0.006, 0.006, 0.006], HC.gold, 8, 5), [BI.shin(s), BI.thigh(s)]);
      // articulating lames above (on the thigh) and below (on the shin)
      for (const [dy, bone, w] of [[0.058, BI.thigh(s), 0.044], [-0.06, BI.shin(s), 0.042]]) {
        const lm = new Mesh(), N = 14;
        for (let u = 0; u <= 2; u++) for (let j = 0; j <= N; j++) {
          const a = lerp(-1.3, 1.3, j / N), rr = 0.05 + (dy > 0 ? 0.006 : 0.002), y = kc[1] + dy + (u - 1) * 0.011;
          lm.v([kn[0] + Math.sin(a) * rr, y, kn[2] + 0.004 + Math.cos(a) * rr], [Math.sin(a), 0, Math.cos(a)], u === 0 || u === 2 ? HC.gold : stD);
        }
        for (let u = 0; u < 2; u++) for (let j = 0; j < N; j++) { const a = u * (N + 1) + j, b = a + N + 1; lm.tri(a, a + 1, b); lm.tri(a + 1, b + 1, b); }
        lm.recomputeNormals();
        P(lm, [bone]);
      }
      // strap round the back of the knee
      const ring = []; for (let j = 0; j <= 16; j++) { const a = 1.3 + j / 16 * (TAU - 2.6); ring.push([kn[0] + Math.sin(a) * 0.057, kn[1] + 0.005, kn[2] + Math.cos(a) * 0.057]); }
      for (let j = 0; j < 16; j++) P(tubeMesh(ring[j], ring[j + 1], () => 0.0042, () => HC.leatherDark, 5, 1, [false, false]), [BI.shin(s), BI.thigh(s)]);
    }
    for (let k = 0; k < 4; k++) {
      const t0 = 0.52 + k * 0.1, t1 = t0 + 0.07, c0 = V.lerp(kn, an, t0), c1 = V.lerp(kn, an, t1);
      const r0 = lerp(0.058, 0.046, (t0 - 0.44) / 0.56) + 0.002, r1 = lerp(0.058, 0.046, (t1 - 0.44) / 0.56) + 0.002;
      for (const q of [1, -1]) P(tubeMesh(V.add(c0, [-0.022 * q, 0, Math.sqrt(r0 * r0 - 0.0005)]), V.add(c1, [0.022 * q, 0, Math.sqrt(r1 * r1 - 0.0005)]), () => 0.0028, () => HC.leatherDark, 6, 2), [BI.shin(s)]);
    }
    for (const tt of [0.6, 0.8]) {
      const c = V.lerp(kn, an, tt), r = lerp(0.058, 0.046, (tt - 0.44) / 0.56) + 0.004;
      P(transformed(torusMesh(r, 0.006, 26, 6, HC.leatherDark), at(c[0], c[1], c[2])), [BI.shin(s)]);
      P(ellipsoid(V.add(c, [s * r, 0, 0.01]), [0.006, 0.012, 0.01], HC.gold, 10, 6), [BI.shin(s)]);
    }
    P(ellipsoid([0.1 * s, 0.052, 0.05], [0.05, 0.052, 0.108], (n0, q) => q[1] < -0.03 ? HC.sole : (n0[2] > 0.8 ? HC.leatherDark : HC.leather), 20, 14,
      (q) => { if (q[1] < 0) q[1] *= 0.72; if (q[2] > 0) q[1] *= 1 - 0.3 * (q[2] / 0.108); return q; }), [BI.foot(s), BI.shin(s)]);
    // boot details: folded cuff with a wavy edge, welted sole and stacked heel, instep strap with buckle, stitched toe cap
    {
      const ax = V.norm(V.sub(an, kn)), L = V.len(V.sub(an, kn)), cm = new Mesh(), NA = 36;
      for (let u = 0; u <= 4; u++) for (let j = 0; j <= NA; j++) {
        const a = j / NA * TAU, t = lerp(0.325, 0.47, u / 4), wav = u === 4 ? 0.012 * Math.cos(a * 6) : 0;
        const rr = lerp(0.066, 0.07, u / 4) + (u === 0 ? -0.004 : 0);
        const c = V.lerp(kn, an, t + wav / L), dir = [Math.sin(a), 0, Math.cos(a)];
        cm.v(V.add(c, V.mul(dir, rr)), dir, u === 0 ? HC.gold : (u === 1 ? V.mul(HC.leatherLight, 0.85).concat([3]) : HC.leatherLight));
      }
      for (let u = 0; u < 4; u++) for (let j = 0; j < NA; j++) { const a = u * (NA + 1) + j, b = a + NA + 1; cm.tri(a, a + 1, b); cm.tri(a + 1, b + 1, b); }
      cm.recomputeNormals();
      P(cm, [BI.shin(s), BI.thigh(s)]);
      const fx = 0.1 * s;
      P(ellipsoid([fx, 0.012, 0.054], [0.047, 0.012, 0.11], (n0) => Math.abs(n0[1]) < 0.35 ? V.mul(HC.sole, 1.6).concat([3]) : HC.sole, 22, 8), [BI.foot(s)]);
      P(ellipsoid([fx, 0.022, -0.028], [0.043, 0.022, 0.04], (n0) => n0[1] < -0.6 ? HC.sole : V.mul(HC.sole, 1.3).concat([3]), 14, 8), [BI.foot(s), BI.shin(s)]);
      const arc = []; for (let k = 0; k <= 12; k++) { const a = lerp(-1.9, 1.9, k / 12); arc.push([fx + Math.sin(a) * 0.054, 0.052 + Math.cos(a) * 0.049, 0.035]); }
      for (let k = 0; k < 12; k++) P(tubeMesh(arc[k], arc[k + 1], () => 0.0055, () => HC.leatherDark, 6, 1, [false, false]), [BI.foot(s)]);
      P(ellipsoid([fx + s * 0.053, 0.06, 0.035], [0.004, 0.011, 0.011], HC.gold, 8, 6), [BI.foot(s)]);
      const toe = []; for (let k = 0; k <= 10; k++) { const a = lerp(-1.35, 1.35, k / 10); toe.push([fx + Math.sin(a) * 0.046, 0.044 + Math.cos(a) * 0.028, 0.095 - (1 - Math.cos(a)) * 0.03]); }
      for (let k = 0; k < 10; k++) P(tubeMesh(toe[k], toe[k + 1], () => 0.0022, () => V.mul(HC.leatherLight, 1.1).concat([3]), 5, 1, [false, false]), [BI.foot(s)]);
    }
  }

  // ---- merge + weights ----
  const mesh = new Mesh(), bi = [], bw = [];
  for (const pt of parts) {
    const base = mesh.vcount;
    mesh.merge(pt.mesh);
    for (let k = base; k < mesh.vcount; k++) {
      const p = [mesh.p[k * 3], mesh.p[k * 3 + 1], mesh.p[k * 3 + 2]];
      let ws;
      if (pt.custom) ws = pt.custom(p);
      else ws = pt.bones.map(b => [b, 1 / Math.pow(segDist(p, BONES[b].a, BONES[b].b) + 0.012, 5)]);
      ws.sort((a, b) => b[1] - a[1]); ws = ws.slice(0, 3);
      const tot = ws.reduce((a, b) => a + b[1], 0) || 1;
      for (let j = 0; j < 3; j++) { bi.push(ws[j] ? ws[j][0] : 0); bw.push(ws[j] ? ws[j][1] / tot : 0); }
    }
  }
  const nv = mesh.vcount;
  bakeAO(mesh);
  const out = new Float32Array(nv * 13);
  for (let k = 0; k < nv; k++) out.set([mesh.c[k * 4], mesh.c[k * 4 + 1], mesh.c[k * 4 + 2], mesh.c[k * 4 + 3], mesh.p[k * 3], mesh.p[k * 3 + 1], mesh.p[k * 3 + 2]], k * 13 + 6);
  return { mesh, bi: new Uint8Array(bi), bw: new Float32Array(bw), out, idx: new Uint32Array(mesh.i), nv };
}

function bakeAO(mesh) {
  const nv = mesh.vcount, cs = 0.018;
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let k = 0; k < nv; k++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], mesh.p[k * 3 + a]); mx[a] = Math.max(mx[a], mesh.p[k * 3 + a]); }
  mn = mn.map(v => v - 0.3); mx = mx.map(v => v + 0.3);
  const D = mn.map((v, a) => Math.ceil((mx[a] - v) / cs));
  const grid = new Uint8Array(D[0] * D[1] * D[2]);
  const cell = (x, y, z) => { const i = Math.floor((x - mn[0]) / cs), j = Math.floor((y - mn[1]) / cs), k = Math.floor((z - mn[2]) / cs); return (i < 0 || j < 0 || k < 0 || i >= D[0] || j >= D[1] || k >= D[2]) ? -1 : (k * D[1] + j) * D[0] + i; };
  for (let t = 0; t < mesh.i.length; t += 3) {
    const A = mesh.i[t] * 3, B = mesh.i[t + 1] * 3, C = mesh.i[t + 2] * 3;
    for (const [u, w] of [[0, 0], [1, 0], [0, 1], [0.33, 0.33], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
      const x = mesh.p[A] + (mesh.p[B] - mesh.p[A]) * u + (mesh.p[C] - mesh.p[A]) * w, y = mesh.p[A + 1] + (mesh.p[B + 1] - mesh.p[A + 1]) * u + (mesh.p[C + 1] - mesh.p[A + 1]) * w, z = mesh.p[A + 2] + (mesh.p[B + 2] - mesh.p[A + 2]) * u + (mesh.p[C + 2] - mesh.p[A + 2]) * w;
      const c = cell(x, y, z); if (c >= 0) grid[c] = 1;
    }
  }
  const dirs = [];
  for (let k = 0; k < 24; k++) { const y = 1 - (k + 0.5) / 24 * 2, r = Math.sqrt(1 - y * y), ph = k * 2.39996; dirs.push([Math.cos(ph) * r, y, Math.sin(ph) * r]); }
  const aoArr = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const p = [mesh.p[v * 3], mesh.p[v * 3 + 1], mesh.p[v * 3 + 2]], n = [mesh.n[v * 3], mesh.n[v * 3 + 1], mesh.n[v * 3 + 2]];
    let occ = 0, cnt = 0;
    for (const d of dirs) {
      const c = V.dot(d, n); if (c < 0.15) continue;
      cnt += c;
      for (let s = 0.035; s < 0.22; s += 0.016) {
        const q = cell(p[0] + (d[0] + n[0] * 0.3) * s, p[1] + (d[1] + n[1] * 0.3) * s, p[2] + (d[2] + n[2] * 0.3) * s);
        if (q >= 0 && grid[q]) { occ += c * (1 - s / 0.26); break; }
      }
    }
    aoArr[v] = clamp(occ / (cnt || 1), 0, 1);
  }
  // smooth across the mesh so voxel steps never show
  const sum = new Float32Array(nv), num = new Float32Array(nv);
  for (let pass = 0; pass < 4; pass++) {
    sum.fill(0); num.fill(0);
    for (let t = 0; t < mesh.i.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { sum[mesh.i[t + a]] += aoArr[mesh.i[t + b]]; num[mesh.i[t + a]]++; }
    for (let v = 0; v < nv; v++) aoArr[v] = num[v] ? sum[v] / num[v] : aoArr[v];
  }
  for (let v = 0; v < nv; v++) { const ao = 1 - 0.6 * aoArr[v]; for (let a = 0; a < 3; a++) mesh.c[v * 4 + a] *= ao; }
}

// accessory meshes (drawn as instances attached to bones)
function buildHeroProps(M) {
  // hair lock: a clump of three tapered strands with a lens-shaped section, bending out and splitting toward pointed tips
  {
    const c = new Mesh(), seg = 8, rings = 14;
    for (const [x0, len, ph] of [[-0.3, 0.88, 0.7], [0, 1, 0], [0.3, 0.82, 1.9]]) {
      const base = c.vcount;
      for (let r = 0; r <= rings; r++) {
        // z is scaled by the lock length at draw time, so thickness is divided down and the bend is a fraction of length
        const t = r / rings, y = t * len, ws = (0.3 * (1 - Math.pow(t, 1.5)) + 0.012) * (0.55 + 0.45 * smooth(0, 0.12, t)), th = (ws * 0.3 + 0.006) * 0.42;
        const bend = -y * y * 0.32, cx = x0 * (1 + 0.4 * t) + Math.sin(t * 5 + ph) * 0.025 * t;
        for (let s = 0; s <= seg; s++) {
          const a = s / seg * TAU;
          const col = V.lerp(HC.hairDark, HC.hair, clamp(0.15 + t * 0.75 + 0.08 * Math.cos(a) - Math.abs(x0) * 0.2, 0, 1));
          c.v([cx + Math.cos(a) * ws, y, Math.sin(a) * th - bend], [0, 0, 1], col.concat([7]));
        }
      }
      for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = base + r * (seg + 1) + s, b = a + seg + 1; c.tri(a, b, a + 1); c.tri(a + 1, b, b + 1); }
    }
    c.recomputeNormals();
    M.lock = c;
  }
  M.eyeW = ellipsoid([0, 0, 0], [1, 1, 1], (n0) => V.lerp(HC.eyeW, [0.93, 0.76, 0.72], smooth(0.55, 0.95, Math.abs(n0[0])) * 0.6).concat([6]), 24, 16);
  // iris: blue-grey stroma with an amber collarette round the pupil and a dark limbal ring
  M.iris = ellipsoid([0, 0, 0], [1, 1, 1], (n0) => {
    const r = Math.hypot(n0[0], n0[1]);
    if (n0[2] < 0) return HC.irisDark;
    let c = V.lerp([0.3, 0.5, 0.68], [0.2, 0.36, 0.55], smooth(0.3, 0.8, r));
    c = V.lerp(c, [0.7, 0.52, 0.26], (1 - smooth(0.22, 0.42, r)) * 0.75);
    c = V.lerp(c, [0.06, 0.1, 0.16], smooth(0.8, 0.97, r));
    return c.concat([6]);
  }, 32, 16);
  M.pupil = ellipsoid([0, 0, 0], [1, 1, 1], HC.pupil, 12, 8);
  M.skinBlob = ellipsoid([0, 0, 0], [1, 1, 1], HC.skin, 14, 10);
  M.lipBlob = ellipsoid([0, 0, 0], [1, 1, 1], [0.2, 0.06, 0.06, 1], 12, 8);
  M.browBlob = ellipsoid([0, 0, 0], [1, 1, 1], HC.brow, 10, 6);
  // eyelids: spherical skin shells hinged on the eyeball centre, with a rolled margin, crease shading and a dark lash line
  const lidMesh = (upper) => {
    const m = new Mesh(), NP = 14, NT = 28, T0 = 1.85;
    const rows = [];
    for (let i = 0; i <= NP; i++) rows.push([0.08 + i / NP * (Math.PI / 2 - 0.08), 1]);
    rows.push([Math.PI / 2 + 0.05, 0.985], [Math.PI / 2 + 0.08, 0.93]);
    rows.forEach(([ph, r], i) => {
      for (let j = 0; j <= NT; j++) {
        const th = lerp(-T0, T0, j / NT), side = Math.abs(th) / T0;
        const phe = Math.min(ph, Math.PI / 2 + 0.08) - (i >= NP ? 0 : 0) + (ph >= Math.PI / 2 ? -0.18 * side * side : 0);
        const p = [Math.sin(phe) * Math.sin(th) * r, Math.cos(phe) * r, Math.sin(phe) * Math.cos(th) * r];
        const crease = upper ? G(ph, 0, 0.95, 0, 0.12, 1) : 0;
        let c = V.lerp(HC.skin, V.mul(HC.blush, 0.85), crease * 0.55 + (i > NP ? 0.3 : 0));
        if (upper && i >= NP - 1) c = i >= NP ? [0.1, 0.06, 0.045] : V.lerp(HC.skin, [0.25, 0.15, 0.1], 0.6);
        if (!upper && i >= NP) c = V.lerp(HC.skin, [0.55, 0.32, 0.28], 0.5);
        m.v(p, V.norm(p), c.concat([1]));
      }
    });
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; m.tri(a, b, a + 1); m.tri(a + 1, b, b + 1); }
    return m;
  };
  M.lidUp = lidMesh(true);
  M.lidLo = lidMesh(false);
  // closed-mouth smile: a thin arc curving up at the corners
  { const pts = []; for (let k = 0; k <= 8; k++) { const x = -1 + k / 4; pts.push([x, 0.35 * x * x, 0]); }
    const sm = new Mesh(); for (let k = 0; k < 8; k++) sm.merge(tubeMesh(pts[k], pts[k + 1], () => 0.16, () => HC.lip, 6, 1)); M.smile = sm; }
  // elf ear: leaf outline with a rounded lobe and a long point, raised helix rim, hollow concha, flat back
  M.ear = (() => {
    const m = new Mesh(), NU = 24, NV = 14;
    const wAt = (u) => u < 0.28 ? 0.44 * Math.sqrt(Math.max(0, 1 - ((0.28 - u) / 0.28) ** 2)) + 0.02 : 0.46 * Math.pow(1 - (u - 0.28) / 0.72, 1.25);
    const face = (front) => {
      const base = m.vcount;
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
        const u = i / NU, v = j / NV * 2 - 1, av = Math.abs(v), w = wAt(u);
        const rim = smooth(0.55, 0.85, av) * (1 - smooth(0.85, 1, av));
        const concha = Math.max(0, 1 - av / 0.6) ** 1.5 * smooth(0.06, 0.18, u) * (1 - smooth(0.42, 0.62, u));
        const z = front ? 0.6 * rim * (1 - smooth(0.85, 1, u)) - 0.75 * concha + 0.1 * (1 - av) : -0.35 * (1 - av * av) * (1 - smooth(0.8, 1, u));
        const x = v * w * 2 + (u > 0.6 ? -0.08 * (u - 0.6) : 0);
        let c = HC.skin.slice(0, 3);
        if (front) c = V.lerp(c, V.mul(HC.blush, 0.62), concha * 0.8 + rim * 0.1);
        c = V.lerp(c, HC.blush, 0.25 * smooth(0.6, 1, u));
        m.v([x, u, z], [0, 0, front ? 1 : -1], c.concat([1]));
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const a = base + i * (NV + 1) + j, b = a + NV + 1;
        if (front) { m.tri(a, b, a + 1); m.tri(a + 1, b, b + 1); } else { m.tri(a, a + 1, b); m.tri(a + 1, b + 1, b); }
      }
    };
    face(true); face(false);
    m.recomputeNormals();
    return m;
  })();
  // eyebrow: individual tapered hair strokes along an arch; the inner ones rise, the outer ones lie flat toward the temple
  {
    const br = new Mesh(); let sd = 11; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let k = 0; k < 72; k++) {
      const x = -1 + (k / 71) * 2 + (rnd() - 0.5) * 0.04, y0 = -0.3 * x * x + 0.15 * x + (rnd() - 0.5) * 0.35 * (1 - Math.abs(x) * 0.5);
      const ang = lerp(1.15, 0.12, (x + 1) / 2) + (rnd() - 0.5) * 0.3, len = lerp(0.2, 0.34, 1 - Math.abs(x + 0.2) * 0.6) * (0.8 + rnd() * 0.4);
      const dx = Math.cos(ang), dy = Math.sin(ang), w = 0.055, base = br.vcount;
      const col = V.mul(V.lerp(HC.brow, HC.hairDark, rnd() * 0.4), 0.55).concat([3]);
      for (let u = 0; u <= 3; u++) {
        const t = u / 3, px = x + dx * len * t, py = y0 + dy * len * t - 0.04 * t * t, ww = w * (1 - t * 0.9);
        br.v([px - dy * ww, py + dx * ww, 0.3 * t * (1 - t)], [0, 0, 1], col);
        br.v([px + dy * ww, py - dx * ww, 0.3 * t * (1 - t)], [0, 0, 1], col);
      }
      for (let u = 0; u < 3; u++) { const a = base + u * 2; br.tri(a, a + 1, a + 2); br.tri(a + 1, a + 3, a + 2); }
    }
    M.browArc = br;
  }
  // sword: wrapped grip, winged guard with a gem, fullered blade with a leaf taper, faceted pommel
  {
    const s = new Mesh(), blue = mc('#3fd2ff', 6);
    s.merge(tubeMesh([0, 0, 0], [0, 0.13, 0], (t) => 0.0135 + 0.0015 * Math.sin(t * Math.PI), () => HC.leatherDark, 10, 6));
    // spiral cord wrap around the grip
    for (let k = 0; k < 36; k++) {
      const a0 = k * 0.55, a1 = (k + 1) * 0.55, y0 = 0.006 + k * 0.0034, y1 = y0 + 0.0034;
      s.merge(tubeMesh([Math.cos(a0) * 0.0155, y0, Math.sin(a0) * 0.0155], [Math.cos(a1) * 0.0155, y1, Math.sin(a1) * 0.0155], () => 0.0026, () => HC.leather, 5, 1, [false, false]));
    }
    s.merge(transformed(torusMesh(0.016, 0.004, 14, 6, HC.gold), at(0, 0.004, 0)));
    s.merge(transformed(torusMesh(0.017, 0.004, 14, 6, HC.gold), at(0, 0.128, 0)));
    // pommel: gold cage around a gem
    s.merge(ellipsoid([0, -0.02, 0], [0.024, 0.02, 0.024], HC.gold, 12, 8, (q) => { q[1] *= 1 + 0.1 * Math.cos(Math.atan2(q[0], q[2]) * 8); return q; }));
    s.merge(ellipsoid([0, -0.02, 0.019], [0.009, 0.009, 0.007], blue, 10, 6));
    s.merge(ellipsoid([0, -0.02, -0.019], [0.009, 0.009, 0.007], blue, 10, 6));
    // winged crossguard sweeping up toward the blade, with a centre block and gem
    for (const sx of [1, -1]) {
      const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([sx * (0.018 + t * 0.075), 0.142 + t * t * 0.03, 0]); }
      for (let k = 0; k < 6; k++) s.merge(tubeMesh(pts[k], pts[k + 1], (t) => lerp(0.012, 0.007, (k + t) / 6), () => HC.gold, 8, 1, [k === 0, false]));
      s.merge(ellipsoid(pts[6], [0.011, 0.011, 0.011], HC.gold, 10, 6));
      s.merge(ellipsoid(V.add(pts[6], [0, 0, 0.008]), [0.005, 0.005, 0.004], blue, 8, 5));
    }
    s.merge(ellipsoid([0, 0.146, 0], [0.026, 0.02, 0.017], HC.gold, 14, 8, (q) => { q[1] -= Math.abs(q[0]) * 0.3; return q; }));
    s.merge(ellipsoid([0, 0.148, 0.015], [0.009, 0.012, 0.005], blue, 10, 6));
    s.merge(ellipsoid([0, 0.148, -0.015], [0.009, 0.012, 0.005], blue, 10, 6));
    // blade: hexagonal section with a sunken fuller, gently leaf-shaped, bevelled point
    const sec = (w, th, fu) => [[w, 0], [w * 0.55, th], [w * 0.22, th], [0, th * fu], [-w * 0.22, th], [-w * 0.55, th], [-w, 0], [-w * 0.55, -th], [-w * 0.22, -th], [0, -th * fu], [w * 0.22, -th], [w * 0.55, -th]];
    const stations = [[0.155, 0.026, 0.0075, 0.35], [0.3, 0.028, 0.007, 0.35], [0.5, 0.0275, 0.0065, 0.4], [0.7, 0.025, 0.006, 0.5], [0.8, 0.022, 0.0055, 0.8], [0.88, 0.014, 0.004, 1], [0.935, 0, 0, 1]];
    const cols = (f) => f === 3 || f === 9 || f === 2 || f === 4 || f === 8 || f === 10 ? [0.82, 0.86, 0.9, 4] : HC.steel;
    for (let k = 0; k < stations.length - 1; k++) {
      const [ya, wa, ta, fa] = stations[k], [yb, wb, tb, fb] = stations[k + 1];
      const A = sec(wa, ta, fa).map(p => [p[0], ya, p[1]]), Bq = sec(wb, tb, fb).map(p => [p[0], yb, p[1]]);
      for (let f = 0; f < 12; f++) {
        const a0 = A[f], a1 = A[(f + 1) % 12], b0 = Bq[f], b1 = Bq[(f + 1) % 12];
        const n = V.norm(V.cross(V.sub(a1, a0), V.sub(b0, a0))), c = f === 0 || f === 5 || f === 6 || f === 11 ? [0.95, 0.97, 1, 4] : cols(f);
        const i0 = s.v(a0, n, c), i1 = s.v(a1, n, c), i2 = s.v(b0, n, c), i3 = s.v(b1, n, c);
        s.tri(i0, i1, i2); s.tri(i1, i3, i2);
      }
    }
    M.sword = s;
    M.rune = tubeMesh([0, 0.17, 0], [0, 0.78, 0], () => 0.0035, () => [1, 1, 1, 0], 6, 2);
  }
  // scabbard: blue-dyed leather over a flattened core, gold locket, band and pointed chape with filigree rings
  M.scabbard = (() => {
    const m = new Mesh(), bl = mc('#23536b', 3);
    m.merge(tubeMesh([0, 0.13, 0], [0, 0.93, 0], t => lerp(0.034, 0.024, t), (t) => t < 0.1 || (t > 0.44 && t < 0.49) ? HC.gold : (Math.abs(((t * 40) % 1) - 0.5) < 0.04 ? V.mul(bl, 0.7).concat([3]) : bl), 14, 30));
    m.merge(tubeMesh([0, 0.9, 0], [0, 0.985, 0], t => lerp(0.026, 0.004, t * t), () => HC.gold, 14, 5, [false, true]));
    for (const y of [0.13, 0.215, 0.49, 0.9]) m.merge(transformed(torusMesh(lerp(0.035, 0.025, (y - 0.13) / 0.8), 0.0045, 20, 6, HC.gold), at(0, y, 0)));
    m.merge(ellipsoid([0, 0.17, 0.034], [0.01, 0.014, 0.006], mc('#3fd2ff', 6), 10, 6));
    for (let k = 0; k < m.vcount; k++) m.p[k * 3 + 2] *= 0.45;
    return m;
  })();
  // round shield: fitted planks with grain and seams, iron bands, painted sun crest, steel rim, gold boss
  {
    const sh = new Mesh(), R = 0.25, H = 0.035, SEG = 128, RINGS = 48;
    const plank = (x, z, shade) => {
      const u = (x + R) / 0.0714, id = Math.floor(u), f = u - id;
      const tone = 0.78 + 0.3 * hash2(id, 7), grain = 0.92 + 0.08 * Math.sin(z * 90 + Math.sin(z * 13 + id) * 3 + id * 5) + 0.05 * Math.sin(z * 310 + id);
      const seam = f < 0.05 || f > 0.95 ? 0.45 : 1;
      return V.mul(HC.wood, tone * grain * seam * shade).concat([3]);
    };
    const iron = [0.36, 0.37, 0.4, 4];
    const face = (front) => {
      const base = sh.vcount, y0 = front ? H : 0;
      for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= SEG; j++) {
        const r = i / RINGS * R, a = j / SEG * TAU, x = Math.sin(a) * r, z = Math.cos(a) * r;
        const dome = front ? 0.014 * (1 - (r / R) ** 2) : 0;
        const nn = front ? V.norm([x * 0.22 / R, 1, z * 0.22 / R]) : [0, -1, 0];
        let c;
        if (front) {
          const ray = Math.abs(((Math.atan2(x, z) / TAU * 16) % 1 + 1) % 1 - 0.5) * 2;
          if (r < 0.155) c = (r > 0.05 && ray < 1 - (r - 0.05) / 0.1) || r < 0.062 ? HC.trim : mc('#1f6f8b', 2);
          else if (r < 0.168) c = HC.trim;
          else c = plank(x, z, 1);
        } else {
          c = Math.abs(x) < 0.03 ? V.mul(HC.wood, 0.6).concat([3]) : plank(x, z, 0.85);
        }
        sh.v([x, y0 + dome, z], nn, c);
      }
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
        const a = base + i * (SEG + 1) + j, b = a + SEG + 1;
        if (front) { sh.tri(a, b, a + 1); sh.tri(a + 1, b, b + 1); } else { sh.tri(a, a + 1, b); sh.tri(a + 1, b + 1, b); }
      }
    };
    face(true); face(false);
    sh.merge(cylMesh(SEG, R, R, H, HC.wood, false));
    sh.merge(transformed(torusMesh(R, 0.018, 64, 8, HC.steel), at(0, H * 0.55, 0)));
    // iron bands: raised strips following the dome
    for (const zc of [0.125, -0.125]) {
      const xw = Math.sqrt(0.232 * 0.232 - zc * zc), base = sh.vcount, N = 40;
      for (let k = 0; k <= N; k++) for (const dz of [-0.013, -0.011, 0.011, 0.013]) {
        const x = lerp(-xw, xw, k / N), z = zc + dz, top = Math.abs(dz) < 0.012;
        const y = H + 0.014 * (1 - (x * x + z * z) / (R * R)) + (top ? 0.004 : 0.0005);
        sh.v([x, y, z], top ? V.norm([x * 0.22 / R, 1, z * 0.22 / R]) : V.norm([0, 0.4, Math.sign(dz)]), iron);
      }
      for (let k = 0; k < N; k++) for (let q = 0; q < 3; q++) { const a = base + k * 4 + q, b = a + 4; sh.tri(a, a + 1, b); sh.tri(a + 1, b + 1, b); }
    }
    // rivets around the rim and along the iron bands
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; sh.merge(ellipsoid([Math.sin(a) * 0.222, H + 0.0035, Math.cos(a) * 0.222], [0.0065, 0.004, 0.0065], HC.gold, 8, 5)); }
    for (const z of [0.125, -0.125]) for (const x of [-0.17, -0.1, 0.1, 0.17]) if (Math.hypot(x, z) < 0.235) sh.merge(ellipsoid([x, H + 0.014 * (1 - (x * x + z * z) / (R * R)) + 0.005, z], [0.006, 0.004, 0.006], HC.steel, 8, 5));
    sh.merge(ellipsoid([0, H + 0.012, 0], [0.05, 0.034, 0.05], HC.gold, 18, 10));
    sh.merge(transformed(torusMesh(0.05, 0.006, 24, 6, HC.gold), at(0, H + 0.013, 0)));
    // back: wooden brace and two leather arm straps with buckles
    sh.merge(tubeMesh([0, -0.012, -0.21], [0, -0.012, 0.21], () => 0.014, () => V.mul(HC.wood, 0.7).concat([3]), 8, 4));
    for (const x of [-0.08, 0.08]) {
      sh.merge(tubeMesh([x, -0.006, -0.13], [x, -0.03, 0], () => 0.009, () => HC.leather, 8, 3));
      sh.merge(tubeMesh([x, -0.03, 0], [x, -0.006, 0.13], () => 0.009, () => HC.leather, 8, 3));
      sh.merge(ellipsoid([x, -0.022, 0.07], [0.014, 0.004, 0.012], HC.gold, 8, 5));
    }
    M.shield = sh;
  }
  // giant leaf glider
  M.leaf = ellipsoid([0, 0, 0], [1, 0.04, 1], (n0) => (Math.abs(n0[0]) < 0.05 || Math.abs(Math.abs(n0[0]) - Math.abs(n0[2]) * 0.6 - 0.25) < 0.035 ? HC.leafVein : V.mul(HC.leaf, 0.9 + 0.15 * n0[2]).concat([8])), 28, 14,
    (q, n0) => { q[2] *= 1.6; q[1] -= q[0] * q[0] * 0.35 - q[2] * 0.04; if (q[2] > 0) q[0] *= 1 - q[2] / 1.6 * 0.5; return q; });
  M.stem = tubeMesh([0, 0, -1.55], [0, -0.12, -1.95], () => 0.035, () => HC.leafVein, 6, 3);
}


// ---------- goblin foe ("Gruñón"): articulated parts, each an instance ----------
function buildGoblin(M) {
  const warts = (n, zones, seed) => { const m = new Mesh(); let sd = seed; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let k = 0; k < n; k++) { const z = zones[k % zones.length]; const p = [z[0] + (r() - 0.5) * z[3], z[1] + (r() - 0.5) * z[3], z[2] + (r() - 0.5) * z[3] * 0.5]; const s = 0.008 + r() * 0.012; m.merge(ellipsoid(p, [s, s * 0.8, s], mc('#7e3129', 1), 6, 4)); }
    return m; };
  const G = {
    skin: mc('#a3443a', 3), skinDark: mc('#6e2a24', 3), belly: mc('#c78370', 3), leather: mc('#5a3a22', 3), rope: mc('#b8955a', 2),
    wood: mc('#7a4a26', 3), woodDark: mc('#4d2d16', 3), bone: mc('#efe3c4', 3), nail: mc('#3a2a24', 3), pupil: mc('#1a0c08', 6),
  };
  // torso: pot belly, loincloth, rope belt, a few warts
  {
    const b = new Mesh();
    b.merge(ellipsoid([0, 0.56, 0], [0.27, 0.28, 0.25], (n0) => {
      let c = V.lerp(G.skin, G.belly, smooth(0.2, 0.8, n0[2]) * smooth(0.6, -0.2, n0[1]) * 0.9);
      // old scars: pale raised slashes across chest and back
      const sc1 = Math.abs(n0[1] - 0.35 + n0[0] * 0.6) < 0.025 && n0[2] > 0.3 && n0[0] > -0.1 && n0[0] < 0.5;
      const sc2 = Math.abs(n0[1] - 0.1 - n0[0] * 0.5) < 0.014 && n0[2] < -0.3 && Math.abs(n0[0]) < 0.45;
      if (sc1 || sc2) c = V.lerp(c, [0.78, 0.5, 0.45], 0.4);
      const navel = n0[2] > 0.9 && Math.hypot(n0[0], n0[1] + 0.28) < 0.05;
      if (navel) c = V.mul(c, 0.5);
      return c.concat([3]);
    }, 36, 26, (q, n0) => {
      if (n0[2] > 0 && n0[1] < 0.3) q[2] *= 1.12; if (n0[1] > 0.6) q[0] *= 1.08;
      const ax = Math.abs(n0[0]);
      // sagging pectorals with an underline, navel dimple, spine furrow and shoulder-blade ridges
      if (n0[2] > 0.2) { const pec = Math.exp(-(((ax - 0.35) / 0.2) ** 2) - (((n0[1] - 0.42) / 0.14) ** 2)); q = V.add(q, V.mul(n0, 0.018 * pec)); }
      if (n0[2] > 0.85) q = V.sub(q, V.mul(n0, 0.012 * Math.exp(-((n0[0] / 0.05) ** 2) - (((n0[1] + 0.28) / 0.05) ** 2))));
      if (n0[2] < -0.3) { q = V.sub(q, V.mul(n0, 0.012 * Math.exp(-((n0[0] / 0.08) ** 2)) * smooth(-0.6, 0.2, n0[1])));
        q = V.add(q, V.mul(n0, 0.015 * Math.exp(-(((ax - 0.38) / 0.16) ** 2) - (((n0[1] - 0.45) / 0.18) ** 2)))); }
      return q;
    }));
    // loincloth: overlapping hide flaps of uneven length with ragged, notched hems and soft folds
    for (let k = 0; k < 9; k++) {
      const a0 = k / 9 * TAU - 0.15, a1 = a0 + TAU / 9 + 0.18, len = 0.22 + 0.07 * ((k * 5) % 3) / 2, fm = new Mesh(), NU = 6, NA = 6;
      const tone = V.mul(G.leather, 0.85 + 0.35 * ((k * 7) % 4) / 3);
      for (let u = 0; u <= NU; u++) for (let j = 0; j <= NA; j++) {
        const t = u / NU, a = lerp(a0, a1, j / NA), rag = u === NU ? 0.03 * Math.abs(Math.sin(j * 2.7 + k)) : 0;
        const r = lerp(0.245, 0.305, t) + 0.008 * Math.sin(j * 1.9 + t * 3) + (k % 2) * 0.006;
        fm.v([Math.sin(a) * r, 0.44 - t * len + rag, Math.cos(a) * r + 0.01 * t], [Math.sin(a), 0, Math.cos(a)], V.mul(tone, 1 - 0.18 * t).concat([3]));
      }
      for (let u = 0; u < NU; u++) for (let j = 0; j < NA; j++) { const q = u * (NA + 1) + j, bq = q + NA + 1; fm.tri(q, bq, q + 1); fm.tri(q + 1, bq, bq + 1); }
      fm.recomputeNormals(); b.merge(fm);
    }
    b.merge(tubeMesh([0, 0.44, 0], [0, 0.26, 0.01], t => lerp(0.235, 0.27, t), () => V.mul(G.leather, 0.6).concat([3]), 20, 3, [false, false]));
    b.merge(transformed(torusMesh(1, 0.08, 34, 6, G.rope), M4.scale(at(0, 0.45, 0), 0.25, 0.25, 0.235)));
    for (const [x, y, z] of [[0.16, 0.66, 0.17], [-0.2, 0.52, 0.12], [0.05, 0.75, -0.2]]) b.merge(ellipsoid([x, y, z], [0.02, 0.02, 0.02], G.skinDark, 8, 6));
    // shoulder mounds
    for (const s of [1, -1]) b.merge(ellipsoid([0.24 * s, 0.73, -0.01], [0.09, 0.08, 0.09], G.skin, 14, 10));
    // leather strap across the chest, bone necklace, skull pauldron, ragged loincloth fringe
    const sp = [[0.2, 0.78, 0.1], [0.08, 0.66, 0.24], [-0.08, 0.52, 0.27], [-0.2, 0.42, 0.2]];
    for (let k = 0; k < sp.length - 1; k++) b.merge(tubeMesh(sp[k], sp[k + 1], () => 0.022, () => G.leather, 8, 2));
    b.merge(ellipsoid([-0.08, 0.52, 0.28], [0.03, 0.03, 0.012], mc('#9a9aa2', 4), 10, 6));
    for (let k = 0; k < 9; k++) {
      const a = -1.2 + k * 0.3, x = Math.sin(a) * 0.19, z = Math.cos(a) * 0.17 + 0.02;
      b.merge(ellipsoid([x, 0.79 - Math.abs(a) * 0.03, z], [0.014, 0.03, 0.012], G.bone, 8, 6));
    }
    b.merge(transformed(torusMesh(0.18, 0.006, 24, 4, G.rope), M4.scale(at(0, 0.8, 0.02), 1, 1, 0.95)));
    const sk = new Mesh();
    // animal skull: cranium with deep sockets, brow ridge, nasal hole, cheekbones, a row of teeth, aged bone with cracks
    sk.merge(ellipsoid([0, 0, 0], [0.1, 0.085, 0.1], (n0) => {
      const ax = Math.abs(n0[0]), sock = n0[2] > 0.45 && Math.hypot(ax - 0.36, n0[1] - 0.08) < 0.2, nose = n0[2] > 0.7 && ax < 0.09 && n0[1] < -0.12 && n0[1] > -0.34;
      const crack = Math.abs(Math.sin(n0[0] * 9 + n0[1] * 4) * Math.cos(n0[2] * 7)) < 0.04 && n0[1] > 0;
      if (sock || nose) return G.pupil;
      const age = 0.8 + 0.25 * Math.abs(Math.sin(n0[0] * 5 + n0[1] * 3 + n0[2] * 4));
      return V.mul(V.lerp(G.bone, [0.72, 0.62, 0.45], smooth(0.2, -0.6, n0[1])), crack ? 0.6 : age).concat([3]);
    }, 22, 16, (q, n0) => {
      const ax = Math.abs(n0[0]);
      if (n0[2] > 0.45 && Math.hypot(ax - 0.36, n0[1] - 0.08) < 0.22) q = V.sub(q, V.mul(n0, 0.022 * (1 - Math.hypot(ax - 0.36, n0[1] - 0.08) / 0.22)));
      if (n0[2] > 0.4 && n0[1] > 0.22 && n0[1] < 0.42) q = V.add(q, V.mul(n0, 0.008));
      if (n0[2] > 0.3 && ax > 0.5 && n0[1] < 0 && n0[1] > -0.35) q = V.add(q, V.mul(n0, 0.01));
      if (n0[1] < -0.2 && n0[2] > 0.2) q[2] += 0.03 * (-n0[1] - 0.2);
      return q;
    }));
    for (let k = 0; k < 6; k++) sk.merge(cylMesh(5, 0.008, 0.002, 0.024, G.bone, false), M4.rotX(at(-0.035 + k * 0.014, -0.055, 0.108), Math.PI));
    b.merge(sk, M4.rotY(at(0.25, 0.8, 0.0), 0.9));
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU, r = 0.285, x0 = Math.sin(a) * r, z0 = Math.cos(a) * r, len = 0.06 + (k % 3) * 0.025;
      b.merge(tubeMesh([x0, 0.2, z0], [x0 * 1.05, 0.2 - len, z0 * 1.05], (t) => lerp(0.03, 0.006, t), () => V.mul(G.leather, 0.8).concat([3]), 5, 2));
    }
    M.gobBody = b;
  }
  // head: brow ridge, snout, jaw with tusks, big pointed ears, one horn
  {
    const h = new Mesh();
    h.merge(ellipsoid([0, 0.17, 0.0], [0.19, 0.17, 0.18], (n0) => {
      // war paint: two pale stripes across each cheek
      // soot war paint: two diagonal claw stripes down each cheek, below the eyes
      const cheek = n0[2] > 0.3 && Math.abs(n0[0]) > 0.3 && Math.abs(n0[0]) < 0.8 && n0[1] < -0.02 && n0[1] > -0.5;
      const stripe = cheek && (Math.abs(n0[1] + 0.1 + (Math.abs(n0[0]) - 0.3) * 0.7) < 0.035 || Math.abs(n0[1] + 0.24 + (Math.abs(n0[0]) - 0.3) * 0.7) < 0.03);
      return stripe ? mc('#2a1410', 3) : G.skin;
    }, 44, 34, (q, n0) => {
      const fr = Math.max(0, n0[2]), ax = Math.abs(n0[0]);
      if (n0[1] > 0.25 && n0[2] > 0.3) q[2] += 0.02 * n0[1];
      // scowling forehead: furrows over a heavy brow
      q = V.add(q, V.mul(n0, 0.006 * Math.sin(n0[1] * 38) * smooth(0.35, 0.6, n0[1]) * (1 - smooth(0.8, 0.95, n0[1])) * fr));
      // broad flattened snout pushed out of the face, with carved nostrils
      const sn = Math.exp(-((n0[0] / 0.32) ** 2) - (((n0[1] + 0.35) / 0.2) ** 2)) * fr;
      q[2] += 0.05 * sn; q[0] *= 1 + 0.25 * sn;
      q = V.sub(q, V.mul(n0, 0.012 * Math.exp(-(((ax - 0.12) / 0.06) ** 2) - (((n0[1] + 0.4) / 0.06) ** 2)) * fr));
      // cheekbones and a jutting lower jaw
      q = V.add(q, V.mul(n0, 0.014 * Math.exp(-(((ax - 0.55) / 0.2) ** 2) - (((n0[1] + 0.1) / 0.18) ** 2)) * fr));
      if (n0[1] < -0.5) q[2] += 0.03 * (-n0[1] - 0.5) * fr;
      return q;
    }));
    for (let k = 0; k < 6; k++) { const x = -0.05 + k * 0.02; h.merge(cylMesh(5, 0.008, 0.0, 0.025, G.bone, false), M4.rotX(at(x, 0.055, 0.195 - Math.abs(x) * 0.3), 0.2)); }  // teeth
    for (const s of [1, -1]) h.merge(transformed(torusMesh(0.02, 0.004, 14, 5, mc('#e2b24f', 5)), M4.rotZ(at(0.26 * s, 0.17, -0.02), Math.PI / 2)));  // ear hoops
    h.merge(ellipsoid([0, 0.2, 0.15], [0.14, 0.035, 0.05], G.skinDark, 18, 8));                      // brow ridge
    h.merge(ellipsoid([0, 0.02, 0.1], [0.15, 0.06, 0.1], G.skinDark, 20, 10));                        // jaw
    for (const s of [1, -1]) {
      h.merge(transformed(cylMesh(8, 0.018, 0.002, 0.07, G.bone, false), M4.rotX(at(0.075 * s, 0.03, 0.18), -0.25)));   // tusks
      const e = new Mesh(); e.merge(cylMesh(12, 1, 0.03, 1, G.skin, true));
      const em = basisY([0.17 * s, 0.2, 0.0], V.norm([s * 1, 0.35, -0.25])); M4.scale(em, 0.06, 0.24, 0.022);
      h.merge(e, em);                                                                                  // ears
    }
    h.merge(transformed(cylMesh(10, 0.035, 0.004, 0.14, G.bone, false), M4.rotX(at(0, 0.3, 0.08), -0.35))); // horn
    M.gobHead = h;
    M.gobEye = ellipsoid([0, 0, 0], [1, 1, 1], (n0) => (n0[2] > 0.3 && Math.abs(n0[0]) < 0.13 ? [0.06, 0.03, 0.02, 6] : V.lerp([1, 0.86, 0.3], [0.85, 0.42, 0.08], smooth(0.9, 0.3, n0[2])).concat([6])), 14, 10);
  }
  // arm (left, unit pivot at shoulder), right arm carries the club
  const arm = (club) => {
    const a = new Mesh(), s = club ? -1 : 1;
    a.merge(tubeMesh([0, 0, 0], [0.06 * s, -0.22, 0.04], t => lerp(0.07, 0.056, t) + 0.016 * Math.sin(t * Math.PI) ** 1.5, () => G.skin, 18, 10));   // bulging biceps
    a.merge(tubeMesh([0.06 * s, -0.22, 0.04], [0.08 * s, -0.4, 0.14], t => lerp(0.058, 0.046, t) + 0.013 * Math.sin(Math.min(1, t * 1.4) * Math.PI), () => G.skin, 18, 10));   // forearm
    // knuckly fist: blocky palm, four thick curled fingers ending in black claws, and a thumb
    a.merge(ellipsoid([0.085 * s, -0.45, 0.16], [0.058, 0.06, 0.055], G.skin, 14, 10, (q) => { q[1] *= q[1] < 0 ? 0.85 : 1; return q; }));
    for (let k = 0; k < 4; k++) {
      const x = (0.05 + k * 0.024) * s, k0 = [x, -0.47, 0.205], k1 = [x, -0.51, 0.215], k2 = [x, -0.52, 0.18];
      a.merge(ellipsoid(k0, [0.016, 0.015, 0.016], G.skin, 8, 6));
      a.merge(tubeMesh(k0, k1, () => 0.014, () => G.skin, 8, 1)); a.merge(tubeMesh(k1, k2, () => 0.012, () => G.skin, 8, 1));
      a.merge(cylMesh(6, 0.009, 0.0, 0.022, G.nail, false), basisY(k2, [0, 0.2, -1]));
    }
    a.merge(tubeMesh([0.045 * s, -0.43, 0.19], [0.03 * s, -0.47, 0.225], () => 0.015, () => G.skin, 8, 1));
    a.merge(cylMesh(6, 0.009, 0.0, 0.02, G.nail, false), basisY([0.03 * s, -0.47, 0.225], [-0.3 * s, -0.5, 0.8]));
    a.merge(ellipsoid([0.02 * s, -0.12, 0.0], [0.05, 0.04, 0.05], G.leather, 10, 6));   // bracer knot
    if (club) {
      const c0 = [0.085 * s, -0.47, 0.12], dir = V.norm([0, 0.55, 1]);
      a.merge(tubeMesh(V.sub(c0, V.mul(dir, 0.08)), V.add(c0, V.mul(dir, 0.42)), t => lerp(0.024, 0.036, t), () => G.wood, 10, 4));
      const hc = V.add(c0, V.mul(dir, 0.56));
      a.merge(ellipsoid(hc, [0.075, 0.075, 0.075], (n0) => V.mul(G.wood, 0.85 + 0.2 * hash2(Math.floor(n0[0] * 5), Math.floor(n0[1] * 5))).concat([3]), 16, 12));
      // knotty club head: lumpy swelling log with lengthwise grain and dark knots
      { const hm = tubeMesh(V.add(c0, V.mul(dir, 0.42)), V.add(c0, V.mul(dir, 0.68)), t => 0.058 + Math.sin(t * Math.PI) * 0.028, (t, an) => {
          const grain = 0.8 + 0.25 * Math.sin(an * 9 + Math.sin(t * 7) * 2), knot = Math.abs(Math.sin(an * 3 + 1) * Math.sin(t * 9)) > 0.93 ? 0.55 : 1;
          return V.mul(G.wood, grain * knot).concat([3]); }, 22, 12);
        const cc = V.add(c0, V.mul(dir, 0.55));
        for (let k = 0; k < hm.vcount; k++) { const p = [hm.p[k * 3], hm.p[k * 3 + 1], hm.p[k * 3 + 2]], d0 = V.sub(p, cc), f = 1 + 0.18 * noise3(p[0] * 30, p[1] * 30, p[2] * 30) - 0.09;
          const q = V.add(cc, V.add(V.mul(dir, V.dot(d0, dir)), V.mul(V.sub(d0, V.mul(dir, V.dot(d0, dir))), f))); hm.p[k * 3] = q[0]; hm.p[k * 3 + 1] = q[1]; hm.p[k * 3 + 2] = q[2]; }
        hm.recomputeNormals(); a.merge(hm); }
      for (const tt of [0.46]) { const cc = V.add(c0, V.mul(dir, tt)); a.merge(transformed(torusMesh(0.066, 0.007, 20, 6, mc('#4a4a50', 4)), basisY(cc, dir))); }   // iron bands
      for (let k = 0; k < 7; k++) {
        const a2 = k / 7 * TAU, rd = V.norm(V.add(V.mul(V.cross(dir, [1, 0, 0]), Math.cos(a2)), V.mul([1, 0, 0], Math.sin(a2))));
        a.merge(cylMesh(6, 0.011, 0.0, 0.06, mc('#3a3a40', 4), false), basisY(V.add(hc, V.mul(rd, 0.075)), rd));
      }
    }
    return a;
  };
  M.gobArmL = arm(false); M.gobArmR = arm(true);
  {
    const l = new Mesh();
    l.merge(tubeMesh([0, 0, 0], [0, -0.3, 0.02], t => lerp(0.085, 0.062, t) + 0.014 * Math.sin(Math.min(1, t * 1.6) * Math.PI), () => G.skin, 18, 10));
    l.merge(ellipsoid([0, -0.34, 0.06], [0.075, 0.05, 0.11], G.skinDark, 14, 10, (q) => { if (q[1] < 0) q[1] *= 0.6; return q; }));
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * 0.034, t0 = [x, -0.35, 0.12], t1 = [x * 1.1, -0.36, 0.175];
      l.merge(tubeMesh(t0, t1, () => 0.02, () => G.skinDark, 8, 1));
      l.merge(cylMesh(6, 0.012, 0.0, 0.03, G.nail, false), basisY(t1, [0, -0.25, 1]));
    }
    l.merge(transformed(torusMesh(0.07, 0.012, 16, 6, G.rope), at(0, -0.24, 0.015)));
    M.gobLeg = l;
  }
  // mottled, blotchy hide on every skin vertex: darker patches, lighter knuckles of pigment
  for (const k of ['gobBody', 'gobHead', 'gobArmL', 'gobArmR', 'gobLeg']) {
    const m = M[k];
    for (let v = 0; v < m.vcount; v++) {
      if (Math.round(m.c[v * 4 + 3]) !== 3 || m.c[v * 4] < m.c[v * 4 + 1] * 1.6) continue;
      const x = m.p[v * 3] * 14, y = m.p[v * 3 + 1] * 14, z = m.p[v * 3 + 2] * 14;
      const f = 0.7 + 0.5 * noise3(x, y, z) + 0.12 * noise3(x * 4, y * 4, z * 4);
      for (let c = 0; c < 3; c++) m.c[v * 4 + c] *= f;
    }
  }
}


// ---------- ambient life: butterflies, birds, falling leaves ----------
function buildLife(M) {
  // butterfly wing (one side, spans +x), painted with dark veins and an edge band
  M.bfWing = ellipsoid([0.5, 0, 0], [0.5, 0.02, 0.36], (n0) => {
    const edge = smooth(0.7, 0.95, Math.hypot(n0[0], n0[2]));
    return V.lerp([1, 1, 1], [0.08, 0.06, 0.08], edge).concat([8]);
  }, 14, 6, (q) => { q[2] += q[0] * 0.25; return q; });
  M.bfBody = ellipsoid([0, 0, 0], [0.08, 0.08, 0.5], mc('#2a2018', 3), 8, 6);
  // bird wing (one side, spans +x) and body
  M.birdWing = ellipsoid([0.5, 0, 0], [0.5, 0.03, 0.14], (n0) => (Math.abs(n0[0]) > 0.7 ? mc('#1f1f24', 2) : mc('#e8e4dc', 2)), 12, 6, (q) => { q[2] -= q[0] * q[0] * 0.4; return q; });
  M.birdBody = ellipsoid([0, 0, 0], [0.14, 0.12, 0.42], (n0) => (n0[1] > 0 ? mc('#3b3b44', 2) : mc('#efece6', 2)), 12, 8);
  M.leafBit = ellipsoid([0, 0, 0], [1, 0.06, 0.55], (n0) => V.mul(COL.leaf2, 0.9 + 0.2 * n0[2]).concat([8]), 10, 6, (q) => { q[1] += q[0] * q[0] * 0.15; return q; });
}

// hair locks laid out in bind space: base point, direction, length, width
const HEAD_SCALE = 0.89;
const LOCKS = (() => {
  const L = [], hc = HB.headC;
  let sd0 = 3; const r = () => { sd0 = (sd0 * 16807) % 2147483647; return sd0 / 2147483647; };
  // fringe: two layers swept to one side, curling in toward the brow
  for (let layer = 0; layer < 2; layer++) for (let k = 0; k < 13; k++) {
    const x = -0.088 + k * 0.0147 + layer * 0.0073;
    L.push({ b: [x, 1.652 - Math.abs(x) * 0.3 + layer * 0.006, 0.108 - layer * 0.008 - x * x * 1.2], d: [x * 2.6 + 0.35 + (r() - 0.5) * 0.2, -1, 0.75], len: 0.075 + r() * 0.035 - layer * 0.01, w: 0.042, sway: 0.6 });
  }
  // crown: layered locks sweeping back over the skull
  for (let row = 0; row < 4; row++) for (let k = 0; k < 10; k++) {
    const x = -0.074 + k * 0.0164 + (row % 2) * 0.008;
    L.push({ b: [x * 0.95, 1.668 - row * 0.012, 0.05 - row * 0.042 - Math.abs(x) * 0.2], d: [x * 1.2 + (r() - 0.5) * 0.2, -0.3 - row * 0.19, -1], len: 0.14 + r() * 0.045, w: 0.052, sway: 0.8 });
  }
  // sides framing the face, ears poke through
  for (const s of [1, -1]) for (let k = 0; k < 7; k++) L.push({ b: [0.108 * s, 1.598 - k * 0.006, 0.07 - k * 0.027], d: [0.18 * s, -1, 0.12 - k * 0.048], len: 0.1 + k * 0.011 + r() * 0.025, w: 0.044, sway: 0.7 });
  // back: three overlapping layers hugging the skull down to the nape
  for (let row = 0; row < 3; row++) for (let k = 0; k < 13; k++) {
    const x = -0.088 + k * 0.0147 + (row % 2) * 0.0073;
    L.push({ b: [x * (1 - row * 0.05), 1.635 - row * 0.035, -0.118 - row * 0.004 + Math.abs(x) * 0.15], d: [x * 0.7, -1, -0.12 + row * 0.05], len: 0.12 + r() * 0.035 - row * 0.015, w: 0.05, sway: 0.9 });
  }
  // crown whorl: locks radiating from a point on the crown and lying flat over the skull in every direction
  for (let k = 0; k < 22; k++) {
    const a = k / 22 * Math.PI * 2 + (r() - 0.5) * 0.2, cw = [0.004, 1.672, -0.04];
    const dir = [Math.sin(a) * 0.8, -0.35 - 0.2 * Math.max(0, Math.cos(a)), Math.cos(a) * 0.8 - 0.2];
    L.push({ b: V.add(cw, [Math.sin(a) * 0.012, 0, Math.cos(a) * 0.012]), d: dir, len: 0.11 + r() * 0.04, w: 0.05, sway: 0.5 });
  }
  // flyaways: thin loose strands scattered over the crown, sides and nape that break up the silhouette
  for (let k = 0; k < 44; k++) {
    const a = r() * Math.PI * 2, el = 0.35 + r() * 0.9, cr = [Math.sin(a) * Math.sin(el), Math.cos(el), Math.cos(a) * Math.sin(el)];
    if (cr[2] > 0.55 && cr[1] < 0.75) continue;   // keep the face clear
    const b = V.add(hc, [cr[0] * 0.118, cr[1] * 0.138 + 0.006, cr[2] * 0.128 - 0.004]);
    const d = [cr[0] * 0.9 + (r() - 0.5) * 0.4, -0.7 - r() * 0.4, cr[2] * 0.9 - 0.25];
    L.push({ b, d, len: 0.1 + r() * 0.09, w: 0.011 + r() * 0.006, sway: 1.1 });
  }
  // short tail tied at the nape
  for (let k = 0; k < 5; k++) L.push({ b: [(k - 2) * 0.008, 1.525, -0.128], d: [(k - 2) * 0.1, -1, -0.35], len: 0.15 + r() * 0.035, w: 0.036, sway: 1.4, tail: true });
  for (const l of L) { l.d = V.norm(l.d); l.out = V.norm(V.sub(l.b, hc)); l.b = V.sub(l.b, V.mul(l.out, 0.0025)); l.tone = 0.86 + r() * 0.26; }
  return L;
})();

// ============================================================
//  Player: controller + combat
// ============================================================
const TUNE = { RUN: 7.2, ACC: 46, DEC: 38, AIR: 20, GRAV: 30, JUMP: 11.2, DJ: 10.2, GLIDE: 2.0, GLIDE_SPEED: 9, DASH: 18, DASHT: 0.2, ROLL: 11.5, ROLLT: 0.42, POUND: 30, COY: 0.11, BUF: 0.14, TURN: 13, FLIP: 0.45, STEP: 0.45 };
const ATK = { 1: { dur: 0.3, from: 0.22, to: 0.62, reach: 2.1, lunge: 3.5 }, 2: { dur: 0.3, from: 0.22, to: 0.62, reach: 2.1, lunge: 3.5 }, 3: { dur: 0.44, from: 0.3, to: 0.7, reach: 2.5, lunge: 6 }, air: { dur: 0.3, from: 0.2, to: 0.65, reach: 2.2, lunge: 0 }, spin: { dur: 0.52, from: 0.08, to: 0.92, reach: 2.9, lunge: 0 } };

const player = {};
const rig = {};
function resetPlayer(pos, yaw = Math.PI) {
  Object.assign(player, {
    pos: pos.slice(), vel: [0, 0, 0], yaw, onGround: true, ref: null, coyote: 0, buf: 0, jumps: 0, flipT: 0, glide: false,
    dashT: 0, rollT: 0, dashDir: [0, 0, 1], canDash: true, dashCD: 0, pound: false, poundT: 0,
    atk: { n: 0, t: 0, queued: false, hit: new Set(), kind: 0 }, charging: false, charge: 0, swordOut: 0,
    hurtT: 0, inv: 0, hp: player.maxHp || 4, maxHp: player.maxHp || 4, lock: 0, deadT: 0, hidden: false, safe: pos.slice(), safeT: 0,
    runPh: 0, idleT: 0, sq: 0, sqv: 0, bank: 0, yawRate: 0, lookYaw: 0, lookPitch: 0, steep: false, airT: 0, landT: 0,
  });
  rig.init = false;
}
function spring() { return { p: [0, 0, 0], v: [0, 0, 0] }; }
function springTo(s, t, k, z, dt) {
  const c = 2 * Math.sqrt(k) * z;
  for (let i = 0; i < 3; i++) { s.v[i] += ((t[i] - s.p[i]) * k - s.v[i] * c) * dt; s.p[i] += s.v[i] * dt; }
}
function playerState() {
  const p = player;
  if (p.deadT > 0) return 'dead';
  if (p.hurtT > 0) return 'hurt';
  if (p.rollT > 0) return 'roll';
  if (p.dashT > 0) return 'dash';
  if (p.pound) return 'pound';
  if (p.atk.n) return 'attack';
  if (p.charging) return 'charge';
  if (!p.onGround) {
    if (p.glide) return 'glide';
    if (p.flipT > 0) return 'flip';
    return p.vel[1] > 0 ? 'rise' : 'fall';
  }
  return Math.hypot(p.vel[0], p.vel[2]) > 0.6 ? 'run' : 'idle';
}
function startAttack(kind) {
  const p = player, a = ATK[kind];
  p.atk = { n: kind, t: 0, queued: false, hit: new Set(), dur: a.dur };
  p.swordOut = 3; p.charging = false;
  if (p.onGround && a.lunge) { p.vel[0] += Math.sin(p.yaw) * a.lunge; p.vel[2] += Math.cos(p.yaw) * a.lunge; }
  sfx(kind === 'spin' ? 'spin' : 'slash', kind === 3 ? 1 : 0);
  rig.trail = [];
}

function playerStep(dt, inp) {
  const p = player, T = TUNE;
  p.inv = Math.max(0, p.inv - dt); p.lock = Math.max(0, p.lock - dt); p.hurtT = Math.max(0, p.hurtT - dt);
  p.flipT = Math.max(0, p.flipT - dt); p.dashCD = Math.max(0, p.dashCD - dt); p.buf = Math.max(0, p.buf - dt);
  p.coyote = Math.max(0, p.coyote - dt); p.landT = Math.max(0, p.landT - dt);
  if (p.swordOut > 0 && !p.atk.n && !p.charging) { p.swordOut -= dt; if (p.swordOut <= 0) sfx('sheath'); }
  if (p.deadT > 0) { p.deadT -= dt; if (p.deadT <= 0) respawnPlayer(); return; }
  if (inp.jumpP) p.buf = T.BUF;
  const mv = [inp.mx, 0, inp.mz], mag = Math.min(1, Math.hypot(inp.mx, inp.mz));

  // ---- sword: 3-hit combo, hold to charge a spin attack ----
  if (inp.punchP && p.rollT <= 0 && p.dashT <= 0 && !p.pound) {
    if (!p.atk.n && !p.charging) startAttack(p.onGround ? 1 : 'air');
    else if (p.atk.n && typeof p.atk.n === 'number' && p.atk.n < 3 && p.atk.t > p.atk.dur * 0.35) p.atk.queued = true;
  }
  if (p.atk.n) {
    const a = ATK[p.atk.n];
    p.atk.t += dt;
    const u = p.atk.t / a.dur;
    if (u >= a.from && u <= a.to) swordHits(a, p.atk.n === 'spin');
    if (p.atk.t >= a.dur) {
      const was = p.atk.n;
      if (p.atk.queued && typeof was === 'number' && was < 3) startAttack(was + 1);
      else { p.atk = { n: 0, t: 0, queued: false, hit: new Set() }; if (inp.punchHeld && was !== 'spin' && p.onGround) { p.charging = true; p.charge = 0; sfx('charge'); } }
    }
  }
  if (p.charging) {
    p.charge += dt;
    if (p.charge > 0.55 && !p.chargeReady) { p.chargeReady = true; sfx('ready'); burst(rig.bladeTip || V.add(p.pos, [0, 1, 0]), 10, [0.6, 1.6, 2, 1], 2, 0.35, 0.06); }
    if (!inp.punchHeld) { const ok = p.chargeReady; p.charging = false; p.chargeReady = false; if (ok) startAttack('spin'); }
  }
  // ---- dodge roll (ground) / air dash ----
  if (inp.dashP && p.canDash && p.dashCD <= 0 && p.dashT <= 0 && p.rollT <= 0 && !p.pound) {
    const d = mag > 0.1 ? V.norm(mv) : [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
    p.dashDir = d; p.yaw = Math.atan2(d[0], d[2]); p.charging = false; p.glide = false; p.atk.n = 0;
    if (p.onGround) { p.rollT = T.ROLLT; p.dashCD = 0.5; sfx('roll'); dust(p.pos, 8, 1); }
    else { p.dashT = T.DASHT; p.dashCD = 0.42; p.canDash = false; sfx('dash'); fovKick(6); shake(0.2); burst(V.add(p.pos, [0, 0.9, 0]), 10, [1, 1, 1, 0.8], 3, 0.35, 0.1); }
  }
  const wasGround = p.onGround, prevVy = p.vel[1];
  if (p.rollT > 0) {
    p.rollT -= dt;
    const k = p.rollT / T.ROLLT;
    p.vel[0] = p.dashDir[0] * T.ROLL * (0.55 + 0.45 * k); p.vel[2] = p.dashDir[2] * T.ROLL * (0.55 + 0.45 * k);
    if (!p.onGround) p.vel[1] -= T.GRAV * dt;
    if (Math.random() < 0.4) dust(p.pos, 1, 0.5);
    if (p.buf > 0 && (p.onGround || p.coyote > 0)) { p.rollT = 0; doJump(1.05); p.vel[0] = p.dashDir[0] * T.RUN * 1.35; p.vel[2] = p.dashDir[2] * T.RUN * 1.35; }
  } else if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel[0] = p.dashDir[0] * T.DASH; p.vel[2] = p.dashDir[2] * T.DASH; p.vel[1] = 0;
    if (Math.random() < 0.6) particle(V.add(p.pos, [rand(-0.2, 0.2), rand(0.4, 1.4), rand(-0.2, 0.2)]), [0, 0, 0], 0.3, 0.16, [0.9, 0.7, 0.6, 0.5], 0, 2);
    if (p.dashT <= 0) { p.vel[0] *= 0.5; p.vel[2] *= 0.5; }
  } else if (p.pound) {
    if (p.poundT > 0) { p.poundT -= dt; p.vel = [0, 1.5, 0]; }
    else p.vel = [0, -T.POUND, 0];
  } else {
    if (p.lock <= 0) {
      const busy = p.atk.n && p.onGround ? 0.15 : (p.charging ? 0.35 : 1);
      const cap = T.RUN * busy * (p.glide ? T.GLIDE_SPEED / T.RUN : 1);
      const tx = mv[0] * cap, tz = mv[2] * cap;
      const acc = p.onGround ? (mag > 0.05 ? T.ACC : T.DEC) * (p.atk.n ? 0.6 : 1) : T.AIR * (p.glide ? 1.4 : 1);
      const dx = tx - p.vel[0], dz = tz - p.vel[2], dl = Math.hypot(dx, dz), step = acc * dt;
      if (dl <= step) { p.vel[0] = tx; p.vel[2] = tz; } else { p.vel[0] += dx / dl * step; p.vel[2] += dz / dl * step; }
      if (mag > 0.1 && !(p.atk.n && p.atk.t > 0.05)) {
        const ty = Math.atan2(mv[0], mv[2]), d = angDiff(p.yaw, ty), mx = T.TURN * dt * (p.onGround ? 1 : 0.6) * (p.charging ? 0.5 : 1);
        const turn = clamp(d, -mx, mx); p.yaw += turn; p.yawRate = turn / dt;
      } else p.yawRate = 0;
    }
    let g = T.GRAV;
    if (p.vel[1] > 0 && !inp.jumpHeld) g *= 2.2;
    if (Math.abs(p.vel[1]) < 2 && inp.jumpHeld) g *= 0.55;
    if (!p.onGround) p.vel[1] -= g * dt;
    p.glide = !p.onGround && inp.jumpHeld && p.vel[1] < 0 && p.jumps >= 1 && p.flipT <= 0 && p.lock <= 0 && !p.atk.n;
    if (p.glide) p.vel[1] = Math.max(p.vel[1], -T.GLIDE);
    p.vel[1] = Math.max(p.vel[1], -34);
    if (p.buf > 0 && !p.atk.n) {
      if (p.onGround || p.coyote > 0) doJump(1);
      else if (p.jumps < 1) { p.jumps = 1; p.vel[1] = T.DJ; p.flipT = T.FLIP; p.buf = 0; sfx('dj'); ring(V.add(p.pos, [0, 0.1, 0]), [1, 1, 1, 0.8], 1.2); }
    }
    if (inp.poundP && !p.onGround && p.airT > 0.12) { p.pound = true; p.poundT = 0.16; p.glide = false; p.charging = false; p.atk.n = 0; p.swordOut = 3; sfx('whoosh'); }
  }

  // ---- integrate + collide ----
  let px = p.pos[0] + p.vel[0] * dt, pz = p.pos[2] + p.vel[2] * dt, ny = p.pos[1] + p.vel[1] * dt;
  for (const s of WORLD.solids) {
    if (s.kind === 'canopy') continue;
    if (ny > s.top - 0.4 || ny + 1.6 < s.bottom) continue;
    const dx = px - s.x, dz = pz - s.z, d = Math.hypot(dx, dz), r = s.r + 0.32;
    if (d < r && d > 1e-6) { px = s.x + dx / d * r; pz = s.z + dz / d * r; const vn = (p.vel[0] * dx + p.vel[2] * dz) / d; if (vn < 0) { p.vel[0] -= vn * dx / d; p.vel[2] -= vn * dz / d; } }
  }
  const gNew = groundAt(px, pz, ny), gOld = groundAt(p.pos[0], p.pos[2], p.pos[1]);
  const rise = gNew.h - Math.max(ny, p.pos[1]);
  if ((rise > T.STEP && !gNew.ref) || (gNew.steep && gNew.h > gOld.h + 0.02 && p.onGround && rise > -0.05)) { px = p.pos[0]; pz = p.pos[2]; p.vel[0] *= 0.2; p.vel[2] *= 0.2; }
  const g = groundAt(px, pz, ny);
  p.onGround = false;
  const snap = wasGround && !p.pound && p.vel[1] <= 0.01 ? 0.35 : 0;
  if (ny <= g.h + snap && p.vel[1] <= 0.01) {
    ny = g.h; p.vel[1] = 0; p.onGround = !g.steep; p.ref = g.ref;
    if (g.steep) { const n = terrainNormal(px, pz); p.vel[0] += n[0] * 24 * dt; p.vel[2] += n[2] * 24 * dt; }
  } else if (ny < g.h) ny = g.h;
  for (const s of WORLD.islands) {
    const d = Math.hypot(px - s.x, pz - s.z);
    if (d < s.r * 0.8 && ny + 1.65 > s.bottom + 0.4 && ny < s.bottom + 1 && p.vel[1] > 0) { p.vel[1] = -1; ny = s.bottom + 0.4 - 1.65; }
  }
  p.pos = [px, ny, pz];
  if (p.onGround) {
    p.coyote = T.COY; p.jumps = 0; p.airT = 0; if (p.dashT <= 0) p.canDash = true; p.glide = false;
    if (!wasGround) onLand(-prevVy);
    if (p.atk.n === 'air') p.atk.n = 0;
    if (p.ref && p.ref.move) { p.pos[0] += p.ref.dx; p.pos[1] += p.ref.dy; p.pos[2] += p.ref.dz; }
    p.safeT += dt;
    if (p.safeT > 0.5 && !p.ref && g.h > 0.7) { p.safe = p.pos.slice(); p.safeT = 0; }
    const sp = Math.hypot(p.vel[0], p.vel[2]), prevPh = p.runPh;
    p.runPh += sp * dt * 1.5;
    if (sp > 2 && p.rollT <= 0 && Math.floor(prevPh / Math.PI) !== Math.floor(p.runPh / Math.PI)) { sfx('step'); dust(p.pos, 2, 0.6); }
    p.idleT = sp < 0.3 && !p.atk.n ? p.idleT + dt : 0;
  } else { p.airT += dt; p.idleT = 0; }
  if (p.pos[1] < WORLD.water - 0.9) { splash(p.pos); sfx('splash'); hurt(null, true); }
  p.sqv += (-p.sq * 220 - p.sqv * 15) * dt; p.sq += p.sqv * dt;
  p.bank = damp(p.bank, clamp(-p.yawRate * Math.hypot(p.vel[0], p.vel[2]) * 0.01, -0.3, 0.3), 8, dt);
}
function swordHits(a, spin) {
  const p = player, fwd = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
  for (const f of foes) {
    if (!f.alive || p.atk.hit.has(f)) continue;
    const d = V.sub(f.pos, p.pos), h = Math.hypot(d[0], d[2]);
    if (h > a.reach + 0.4 || Math.abs(d[1]) > 1.8) continue;
    if (!spin && (d[0] * fwd[0] + d[2] * fwd[2]) / (h || 1) < -0.15) continue;
    p.atk.hit.add(f);
    const heavy = spin || p.atk.n === 3;
    damageFoe(f, V.norm([d[0], 0, d[2]]), heavy ? 2 : 1, V.lerp(rig.bladeTip || f.pos, V.add(f.pos, [0, 0.7, 0]), 0.5));
  }
}
function doJump(mult) {
  const p = player;
  p.vel[1] = TUNE.JUMP * mult; p.onGround = false; p.coyote = 0; p.buf = 0; p.sqv -= 4; p.airT = 0.001;
  if (p.ref && p.ref.move) { p.vel[0] += p.ref.dx * 120; p.vel[2] += p.ref.dz * 120; }
  dust(p.pos, 7, 1); sfx('jump');
}
function onLand(impact) {
  const p = player, k = clamp(impact / 22, 0, 1);
  p.sqv += 2.5 + k * 8; p.landT = 0.28; p.landK = k;
  if (impact > 6) { dust(p.pos, 5 + Math.round(k * 12), 1 + k); sfx('land', k); }
  if (p.pound) {
    p.pound = false; shake(0.9); hitstop(0.07); sfx('pound'); fovKick(-4);
    ring(V.add(p.pos, [0, 0.1, 0]), [1, 0.95, 0.7, 0.9], 4.5);
    dust(p.pos, 26, 2.4);
    burst(V.add(p.pos, [0, 0.2, 0]), 16, [0.6, 1.5, 2, 1], 6, 0.4, 0.07);
    for (const f of foes) if (f.alive && V.dist(f.pos, p.pos) < 4.6 && Math.abs(f.pos[1] - p.pos[1]) < 1.6) killFoe(f, V.norm(V.sub(f.pos, p.pos)));
  }
}
function hurt(src, water = false) {
  const p = player;
  if (p.deadT > 0) return;
  if (!water && (p.inv > 0 || p.dashT > 0 || p.rollT > 0)) return;
  p.hp -= 1; updateHUD(); shake(0.7); hitstop(0.08); sfx('hurt'); rumble(0.6, 180);
  burst(V.add(p.pos, [0, 1, 0]), 18, [1, 0.35, 0.4, 1], 5, 0.5, 0.12);
  if (p.hp <= 0 || water) {
    p.deadT = water ? 0.55 : 0.9; p.hidden = !water; p.vel = [0, 0, 0]; stats.falls++;
    if (!water) burst(V.add(p.pos, [0, 1, 0]), 40, [1, 0.8, 0.5, 1], 7, 0.8, 0.14);
    return;
  }
  p.inv = 1.4; p.hurtT = 0.4; p.lock = 0.3; p.pound = false; p.dashT = 0; p.charging = false; p.glide = false; p.atk.n = 0;
  const away = src ? V.norm([p.pos[0] - src[0], 0, p.pos[2] - src[2]]) : [0, 0, 0];
  p.vel = [away[0] * 8, 8.5, away[2] * 8]; p.onGround = false;
}
function respawnPlayer() {
  const p = player, hp = p.hp <= 0 ? p.maxHp : p.hp, safe = p.safe.slice();
  resetPlayer(safe, p.yaw);
  p.hp = hp; p.safe = safe; p.inv = 1.5;
  updateHUD(); sfx('respawn');
  burst(V.add(safe, [0, 1, 0]), 24, [1, 0.9, 0.5, 1], 4, 0.6, 0.1);
}

// ============================================================
//  Procedural animation: pose targets -> skeleton -> skin matrices
// ============================================================
const ease = u => u < 0.12 ? -0.06 * Math.sin(u / 0.12 * Math.PI) : smooth(0.12, 0.68, u);
function computePose(st, t) {
  const p = player, sp = Math.hypot(p.vel[0], p.vel[2]), s = clamp(sp / TUNE.RUN, 0, 1.2);
  const o = {
    hl: [0.3, 0.9, 0.03], hr: [-0.3, 0.9, 0.03], fl: [0.12, 0.09, 0.0], fr: [-0.12, 0.09, -0.02], pitch: [0, 0], lift: [0, 0],
    pel: [0, -0.012, 0], lean: 0, twP: 0, twC: 0, breath: 0, flip: 0, pivot: 1.0, sword: p.swordOut > 0 ? 'guard' : 'back', blade: null, leaf: 0, spinYaw: 0, mouth: 0.15, glow: 0,
  };
  const guard = () => { o.hr = [-0.26, 1.0, 0.2]; o.blade = V.norm([-0.25, -0.18, 0.95]); };
  switch (st) {
    case 'idle': {
      const b = Math.sin(t * 2.1), sw = Math.sin(t * 0.8);
      o.pel = [sw * 0.012, -0.015 + b * 0.004, 0]; o.breath = b * 0.02;
      o.hl = [0.3 + sw * 0.01, 0.9 + b * 0.006, 0.04]; o.hr = [-0.3 + sw * 0.01, 0.9 + b * 0.006, 0.04];
      o.fl = [0.13, 0.09, 0.02]; o.fr = [-0.12, 0.09, -0.04];
      // slow weight shift from foot to foot, and a glance around every few seconds
      const shift = Math.sin(t * 0.45) * 0.022;
      o.pel[0] += shift; o.pel[1] -= Math.abs(shift) * 0.4; o.twP = Math.sin(t * 0.45) * 0.05; o.twC = -Math.sin(t * 0.45) * 0.04;
      const g = (t % 9) / 9;
      o.lookOff = [Math.sin(g * TAU) * 0.7 * smooth(0.55, 0.65, g) * smooth(0.98, 0.88, g), -0.1 * smooth(0.55, 0.65, g) * smooth(0.98, 0.88, g)];
      if (o.sword === 'guard') { guard(); o.fl = [0.15, 0.09, 0.1]; o.fr = [-0.13, 0.09, -0.12]; o.pel[1] = -0.05; }
      break;
    }
    case 'run': {
      const ph = p.runPh, m1 = Math.min(1, s), st2 = 0.38 * m1, lift = 0.26 * m1;
      for (const [k, side, off, i] of [['fl', 0.105, 0, 0], ['fr', -0.105, Math.PI, 1]]) {
        const a = ph + off, sw = Math.max(0, Math.cos(a));
        // swing phase: knee drives up and forward; stance: foot planted and pushed back
        o[k] = [side, 0.09 + sw * lift + Math.pow(sw, 3) * 0.08 * m1, Math.sin(a) * st2 + 0.05 + sw * 0.05 * m1];
        o.lift[i] = sw * lift; o.pitch[i] = -0.55 * Math.sin(a) * m1 + (sw > 0.2 ? 0.15 : 0);
      }
      // elbows bent near 90 degrees, hands pumping close to the body
      const pumpL = -Math.sin(ph), pumpR = Math.sin(ph);
      o.hl = [0.22 - Math.max(0, pumpL) * 0.05, 1.02 + Math.max(0, pumpL) * 0.1 * m1, 0.08 + pumpL * 0.3 * m1];
      o.hr = [-0.22 + Math.max(0, pumpR) * 0.05, 1.02 + Math.max(0, pumpR) * 0.1 * m1, 0.08 + pumpR * 0.3 * m1];
      o.pel = [0, -0.03 * s - 0.035 * s * Math.abs(Math.cos(ph)), 0];
      o.twP = -Math.sin(ph) * 0.18 * s; o.twC = Math.sin(ph) * 0.36 * s;
      // lean into acceleration, lean back while braking
      o.lean = 0.18 * s + clamp((rig.accel || 0) * 0.012, -0.25, 0.2); o.mouth = 0.3;
      if (o.sword === 'guard') { o.hr = [-0.3, 0.95, -0.08]; o.blade = V.norm([-0.3, -0.45, -0.85]); }
      break;
    }
    case 'rise': o.hl = [0.32, 1.18, 0.1]; o.hr = [-0.32, 1.12, 0.06]; o.fl = [0.1, 0.36, 0.14]; o.fr = [-0.1, 0.17, -0.12]; o.pitch = [0.3, 0.4]; o.lean = 0.05; o.mouth = 0.5; break;
    case 'fall': o.hl = [0.4, 1.12, 0.02]; o.hr = [-0.4, 1.1, 0.02]; o.fl = [0.12, 0.05, 0.08]; o.fr = [-0.12, 0.12, -0.1]; o.pitch = [0.3, 0.2]; o.mouth = 0.4; break;
    case 'flip': o.hl = [0.2, 1.0, 0.26]; o.hr = [-0.2, 1.0, 0.26]; o.fl = [0.1, 0.46, 0.16]; o.fr = [-0.1, 0.46, 0.16]; o.flip = (1 - p.flipT / TUNE.FLIP) * TAU; o.pivot = 0.95; o.pel = [0, -0.08, 0]; o.mouth = 0.6; break;
    case 'glide': { const w = Math.sin(t * 5) * 0.02; o.hl = [0.16, 1.8 + w, 0.06]; o.hr = [-0.16, 1.8 - w, 0.06]; o.fl = [0.1, 0.05, -0.12]; o.fr = [-0.1, 0.1, -0.2]; o.pitch = [0.5, 0.6]; o.lean = 0.14; o.leaf = 1; o.sword = 'back'; o.mouth = 0.3; break; }
    case 'roll': { const u = 1 - p.rollT / TUNE.ROLLT; o.flip = u * TAU; o.pivot = 0.55; o.pel = [0, -0.36 * Math.sin(u * Math.PI), 0.05]; o.hl = [0.2, 0.9, 0.3]; o.hr = [-0.2, 0.9, 0.3]; o.fl = [0.1, 0.34, 0.12]; o.fr = [-0.1, 0.34, 0.12]; o.sword = 'back'; break; }
    case 'dash': o.hl = [0.26, 1.05, -0.36]; o.hr = [-0.26, 1.05, -0.36]; o.fl = [0.1, 0.25, -0.36]; o.fr = [-0.1, 0.3, -0.3]; o.lean = 0.8; o.pitch = [0.7, 0.7]; o.sword = 'back'; break;
    case 'pound':
      if (p.poundT > 0) { o.hl = [0.05, 1.3, 0.12]; o.hr = [-0.03, 1.32, 0.12]; o.blade = [0, 1, 0.05]; o.fl = [0.1, 0.4, 0.08]; o.fr = [-0.1, 0.4, 0.08]; }
      else { o.hl = [0.05, 1.0, 0.2]; o.hr = [-0.03, 1.02, 0.2]; o.blade = V.norm([0, -1, 0.12]); o.fl = [0.1, 0.3, 0]; o.fr = [-0.1, 0.34, 0]; o.glow = 1; }
      o.sword = 'hand'; o.mouth = 0.7; break;
    case 'charge': {
      const k = clamp(p.charge / 0.55, 0, 1), sh = p.chargeReady ? (Math.random() - 0.5) * 0.01 : 0;
      o.hr = [-0.36 + sh, 1.06, -0.18]; o.blade = V.norm([-0.55, 0.12, -0.8]); o.hl = [0.28, 1.0, 0.24]; o.twC = -0.5 * k; o.pel = [0, -0.1 * k, 0];
      o.fl = [0.16, 0.09, 0.16]; o.fr = [-0.15, 0.09, -0.16]; o.sword = 'hand'; o.glow = p.chargeReady ? 1.6 : k * 0.6; o.mouth = 0.1;
      break;
    }
    case 'attack': {
      const n = p.atk.n, a = ATK[n], u = clamp(p.atk.t / a.dur, 0, 1), e = ease(u), C = [-0.04, 1.18, 0.06];
      o.sword = 'hand'; o.pel = [0, -0.06, 0.02]; o.lean = 0.12; o.fl = [0.15, 0.09, 0.14]; o.fr = [-0.14, 0.09, -0.12]; o.hl = [0.32, 1.0, -0.12]; o.mouth = 0.55;
      if (n === 1 || n === 'air') { const al = lerp(-2.0, 1.7, e); o.hr = V.add(C, [Math.sin(al) * 0.44, -0.02, Math.cos(al) * 0.44]); o.blade = V.norm([Math.sin(al), 0.06, Math.cos(al)]); o.twC = -al * 0.32; }
      else if (n === 2) { const al = lerp(1.7, -2.0, e); o.hr = V.add(C, [Math.sin(al) * 0.44, lerp(0.2, -0.14, e), Math.cos(al) * 0.44]); o.blade = V.norm([Math.sin(al), lerp(0.55, -0.35, e), Math.cos(al)]); o.twC = -al * 0.32; }
      else if (n === 3) { const be = lerp(-0.45, 2.25, e); o.hr = V.add(C, [0.0, Math.cos(be) * 0.44, Math.sin(be) * 0.44]); o.blade = V.norm([0, Math.cos(be), Math.sin(be)]); o.hl = V.add(o.hr, [0.06, -0.05, -0.04]); o.lean = 0.1 + 0.3 * e; o.pel[1] = -0.06 - 0.08 * e; }
      else if (n === 'spin') { o.spinYaw = e * TAU; const al = -1.25; o.hr = V.add(C, [Math.sin(al) * 0.46, -0.05, Math.cos(al) * 0.46]); o.blade = V.norm([Math.sin(al), 0.02, Math.cos(al)]); o.hl = [0.34, 1.05, 0.0]; o.pel[1] = -0.12; o.glow = 1.4 * (1 - u); }
      if (n === 'air') { o.fl = [0.1, 0.3, 0.1]; o.fr = [-0.1, 0.2, -0.1]; }
      break;
    }
    case 'hurt': o.hl = [0.36, 1.2 + Math.sin(t * 30) * 0.05, -0.1]; o.hr = [-0.36, 1.2 + Math.cos(t * 30) * 0.05, -0.1]; o.fl = [0.14, 0.2, 0.1]; o.fr = [-0.14, 0.14, 0.12]; o.lean = -0.3; o.mouth = 0.9; break;
  }
  if (o.sword === 'guard' && !o.blade) guard();
  // heavy landing: crouch, hands forward to absorb the impact
  if (p.landT > 0 && (st === 'idle' || st === 'run') && (p.landK || 0) > 0.35) {
    const k = Math.sin((1 - p.landT / 0.28) * Math.PI) * p.landK;
    o.pel[1] -= 0.16 * k; o.lean += 0.25 * k;
    o.hl = V.lerp(o.hl, [0.3, 0.72, 0.25], k); if (o.sword !== 'guard') o.hr = V.lerp(o.hr, [-0.3, 0.72, 0.25], k);
    o.fl = V.lerp(o.fl, [0.15, 0.09, 0.08], k); o.fr = V.lerp(o.fr, [-0.15, 0.09, -0.06], k);
  }
  return o;
}

function updateRig(dt, time) {
  const p = player, st = playerState(), pose = computePose(st, time);
  if (!rig.init) {
    rig.hands = [spring(), spring()]; rig.feet = [spring(), spring()]; rig.headLag = [0, 0]; rig.headLagV = [0, 0];
    rig.hair = [0, 0]; rig.hairV = [0, 0]; rig.blinkT = 3.4; rig.blink = 0; rig.mouth = 0.2; rig.trail = [];
    rig.s = { lean: 0, twP: 0, twC: 0, pel: [0, 0, 0], breath: 0, leaf: 0, glow: 0 };
    rig.prevPos = p.pos.slice(); rig.cape = null;
  }
  const S = rig.s, k = 1 - Math.exp(-dt * (st === 'attack' ? 22 : 12));
  const spNow = Math.hypot(p.vel[0], p.vel[2]);
  rig.accel = damp(rig.accel || 0, (spNow - (rig.pSp || 0)) / dt, 8, dt); rig.pSp = spNow;
  S.lean += (pose.lean - S.lean) * k; S.twP += (pose.twP - S.twP) * k; S.twC += (pose.twC - S.twC) * k; S.breath += (pose.breath - S.breath) * k;
  for (let i = 0; i < 3; i++) S.pel[i] += (pose.pel[i] - S.pel[i]) * k;
  S.leaf = damp(S.leaf, pose.leaf, 12, dt); S.glow = damp(S.glow, pose.glow, 10, dt);
  rig.state = st; rig.pose = pose;
  const dpos = V.sub(p.pos, rig.prevPos); rig.prevPos = p.pos.slice();
  const snapAll = !rig.init || V.len(dpos) > 3;

  // body frames: yaw (+ spin attack) * bank * flip about a pivot
  const Rbody = R3.mul(R3.ry(p.yaw + pose.spinYaw), R3.rz(p.bank));
  const Rflip = R3.rx(pose.flip), Rfull = R3.mul(Rbody, Rflip);
  const pv = [0, pose.pivot, 0];
  const toW = (l) => V.add(p.pos, R3.v(Rbody, V.add(R3.v(Rflip, V.sub(l, pv)), pv)));
  const toWdir = (d) => R3.v(Rfull, d);
  rig.toW = toW; rig.Rfull = Rfull;

  // feet first: they decide how low the pelvis must sit
  const ft = [toW(pose.fl), toW(pose.fr)];
  if (p.onGround && !pose.flip) for (let i = 0; i < 2; i++) {
    const g = groundAt(ft[i][0], ft[i][2], p.pos[1] + 0.5);
    const gy = Math.abs(g.h - p.pos[1]) < 0.6 ? g.h : p.pos[1];
    ft[i][1] = gy + 0.09 * 0 + (pose.fl[1] - 0.09) * 0 + 0.09 + pose.lift[i];
  }
  const sq = p.sq;
  const pelLocal = V.add([0, 0.9, 0], [S.pel[0], S.pel[1] - sq * 0.22, S.pel[2]]);
  let pelvisP = toW(pelLocal);
  // drop the pelvis if a foot target is out of reach (slopes, big steps)
  let drop = 0;
  for (let i = 0; i < 2; i++) {
    const hip = V.add(pelvisP, R3.v(Rfull, sd([0.09, 0, 0], i ? -1 : 1)));
    const ex = V.dist(hip, ft[i]) - (LIMB.th + LIMB.sn) * 0.985;
    if (ex > drop) drop = ex;
  }
  if (p.onGround) pelvisP = V.add(pelvisP, [0, -Math.min(0.3, drop), 0]);
  const F = [];
  const Rp = R3.mul(Rfull, R3.mul(R3.ry(S.twP), R3.rx(S.lean * 0.4)));
  F[0] = { R: Rp, P: pelvisP };
  const Rs = R3.mul(Rp, R3.mul(R3.rx(S.lean * 0.3), R3.ry(S.twC * 0.45)));
  F[1] = { R: Rs, P: V.add(pelvisP, R3.v(Rp, [0, 0.12, 0])) };
  const Rc = R3.mul(Rs, R3.mul(R3.rx(S.lean * 0.3 + S.breath), R3.ry(S.twC * 0.55)));
  F[2] = { R: Rc, P: V.add(F[1].P, R3.v(Rs, [0, 0.16, 0])) };
  // look at nearby things
  let look = null, best = 9;
  for (const o of WORLD.orbs) if (!o.got) { const d = V.dist([o.x, o.y, o.z], p.pos); if (d < best) { best = d; look = [o.x, o.y, o.z]; } }
  for (const f of foes) if (f.alive) { const d = V.dist(f.pos, p.pos); if (d < best + 2) { best = d; look = V.add(f.pos, [0, 0.6, 0]); } }
  let ly = 0, lp = 0;
  if (look && (st === 'idle' || st === 'run' || st === 'fall' || st === 'charge')) {
    const d = V.sub(look, V.add(p.pos, [0, 1.5, 0])), a = Math.atan2(d[0], d[2]);
    ly = clamp(angDiff(p.yaw + pose.spinYaw, a) - S.twC * 0.8, -0.9, 0.9); lp = clamp(-Math.atan2(d[1], Math.hypot(d[0], d[2])), -0.5, 0.5);
    if (Math.abs(angDiff(p.yaw, a)) > 1.8) { ly = 0; lp = 0; }
  } else if (st === 'run') ly = -S.twC * 0.9;
  else if (pose.lookOff) { ly = pose.lookOff[0]; lp = pose.lookOff[1]; }
  p.lookYaw = damp(p.lookYaw, ly, 6, dt); p.lookPitch = damp(p.lookPitch, lp, 6, dt);
  // head lag spring (reacts to acceleration)
  for (let i = 0; i < 2; i++) { rig.headLagV[i] += (-rig.headLag[i] * 260 - rig.headLagV[i] * 14) * dt; rig.headLag[i] += rig.headLagV[i] * dt; }
  rig.headLagV[0] += (p.vel[1] - (rig.pvy || 0)) * 0.015; rig.pvy = p.vel[1];
  const Rn = R3.mul(Rc, R3.mul(R3.ry(p.lookYaw * 0.35), R3.rx(p.lookPitch * 0.35 - S.lean * 0.5 - S.breath)));
  F[3] = { R: Rn, P: V.add(F[2].P, R3.v(Rc, [0, 0.18, 0])) };
  const Rh = R3.mul(Rn, R3.mul(R3.ry(p.lookYaw * 0.65), R3.rx(p.lookPitch * 0.65 - S.lean * 0.3 + rig.headLag[0] * 0.5)));
  F[4] = { R: Rh, P: V.add(F[3].P, R3.v(Rn, [0, 0.06, 0])) };

  // arms: springs on the wrist targets, two-bone IK, swing-only rotations from the rest pose
  const attacking = st === 'attack' || st === 'charge' || st === 'pound';
  const wt = [toW(pose.hl), toW(pose.hr)];
  for (let i = 0; i < 2; i++) {
    const s = rig.hands[i], stiff = attacking && (i === 1 || pose.sword === 'hand') ? 2400 : 300;
    if (snapAll) { s.p = wt[i].slice(); s.v = [0, 0, 0]; }
    else { s.p = V.add(s.p, V.mul(dpos, 0.92)); springTo(s, wt[i], stiff, attacking ? 0.9 : 0.6, dt); }
  }
  for (let i = 0; i < 2; i++) {
    const sgn = i ? -1 : 1, bu = BI.ua(sgn), bf = BI.fa(sgn), bh = BI.hand(sgn);
    const sh = V.add(F[2].P, R3.v(Rc, V.sub(sd(HB.sh, sgn), HB.chest)));
    const pole = R3.v(Rc, [sgn * 0.35, -0.45, -0.8]);
    const el = ik(sh, rig.hands[i].p, LIMB.ua, LIMB.fa, pole);
    const wr = V.add(el, V.mul(V.norm(V.sub(rig.hands[i].p, el)), LIMB.fa));
    const restU = R3.mul(Rc, BONES[bu].Rb), Ru = R3.mul(R3.between(V.norm(R3.v(restU, [0, 1, 0])), V.norm(V.sub(el, sh))), restU);
    F[bu] = { R: Ru, P: sh };
    const restF = R3.mul(Ru, R3.mul(R3.T(BONES[bu].Rb), BONES[bf].Rb)), Rf = R3.mul(R3.between(V.norm(R3.v(restF, [0, 1, 0])), V.norm(V.sub(wr, el))), restF);
    F[bf] = { R: Rf, P: el };
    let Rhd = R3.mul(Rf, R3.mul(R3.T(BONES[bf].Rb), BONES[bh].Rb));
    if (i === 1 && pose.blade && pose.sword !== 'back') {
      // wrist rolls so the fist faces along the blade
      const want = V.norm(V.add(R3.v(Rhd, [0, 1, 0]), V.mul(toWdir(pose.blade), 0.6)));
      Rhd = R3.mul(R3.between(V.norm(R3.v(Rhd, [0, 1, 0])), want), Rhd);
    }
    if (i === 0 && S.leaf > 0.5) Rhd = R3.mul(R3.between(V.norm(R3.v(Rhd, [0, 1, 0])), [0, 1, 0]), Rhd);
    F[bh] = { R: Rhd, P: wr };
  }
  // legs
  for (let i = 0; i < 2; i++) {
    const sgn = i ? -1 : 1, bt = BI.thigh(sgn), bs = BI.shin(sgn), bf = BI.foot(sgn), s = rig.feet[i];
    if (snapAll) { s.p = ft[i].slice(); s.v = [0, 0, 0]; }
    else { s.p = V.add(s.p, V.mul(dpos, 0.95)); springTo(s, ft[i], p.onGround && st !== 'roll' ? 1600 : 700, 0.9, dt); }
    const hip = V.add(pelvisP, R3.v(Rp, V.sub(sd(HB.hp, sgn), HB.hip)));
    const pole = R3.v(Rfull, [sgn * 0.12, 0.1, 1]);
    const kn = ik(hip, s.p, LIMB.th, LIMB.sn, pole);
    const an = V.add(kn, V.mul(V.norm(V.sub(s.p, kn)), LIMB.sn));
    const restT = R3.mul(Rp, BONES[bt].Rb), Rt = R3.mul(R3.between(V.norm(R3.v(restT, [0, 1, 0])), V.norm(V.sub(kn, hip))), restT);
    F[bt] = { R: Rt, P: hip };
    const restS = R3.mul(Rt, R3.mul(R3.T(BONES[bt].Rb), BONES[bs].Rb)), Rsn = R3.mul(R3.between(V.norm(R3.v(restS, [0, 1, 0])), V.norm(V.sub(an, kn))), restS);
    F[bs] = { R: Rsn, P: kn };
    F[bf] = { R: R3.mul(R3.mul(Rfull, R3.rx(pose.pitch[i])), BONES[bf].Rb), P: an };
  }
  rig.F = F;
  // skin matrices (bind space -> world)
  rig.skin = F.map((f, b) => { const M = R3.mul(f.R, R3.T(BONES[b].Rb)); return { M, t: V.sub(f.P, R3.v(M, BONES[b].Pb)) }; });
  // heroic proportions: the head is scaled about the top of the neck (about 7.3 heads tall instead of 6.4)
  { const s = HEAD_SCALE, h = rig.skin[4], P = [0, 1.43, 0.005]; h.t = V.add(h.t, V.mul(R3.v(h.M, P), 1 - s)); h.M = h.M.map(v => v * s); }
  rig.headM = m4RT(rig.skin[4].M, rig.skin[4].t);
  rig.chestM = m4RT(rig.skin[2].M, rig.skin[2].t);
  // sword placement
  const fwdR = R3.v(F[BI.fa(-1)].R, [0, 1, 0]);
  if (pose.sword === 'back') {
    const cm = rig.chestM;
    rig.swordM = M4.mul(cm, basisY([-0.12, 1.43, -0.17], V.norm([0.5, -0.86, -0.08])));
  } else {
    const bd = toWdir(pose.blade), wr = F[BI.hand(-1)].P;
    const hilt = V.add(wr, V.mul(V.norm(V.add(fwdR, V.mul(bd, 0.3))), 0.06));
    rig.swordM = basisY(V.sub(hilt, V.mul(bd, 0.065)), bd);
  }
  rig.bladeBase = M4.apply(rig.swordM, [0, 0.17, 0]); rig.bladeTip = M4.apply(rig.swordM, [0, 0.93, 0]);
  if (pose.sword !== 'back' && Math.random() < dt * 5) particle(V.lerp(rig.bladeBase, rig.bladeTip, Math.random()), [0, 0.1, 0], 0.18, 0.035, [2.4, 2.4, 2.2, 1], 0, 0, -0.1);
  if (st === 'attack') { rig.trail.push([rig.bladeBase, rig.bladeTip, time]); if (rig.trail.length > 14) rig.trail.shift(); }
  else if (rig.trail.length) rig.trail.shift();
  // face
  rig.blinkT -= dt; if (rig.blinkT <= 0) { rig.blink = 0.13; rig.blinkT = 2 + Math.random() * 3.5; }
  rig.blink = Math.max(0, rig.blink - dt);
  rig.mouth = damp(rig.mouth, pose.mouth, 12, dt);
  // hair springs (driven by head motion)
  const sp = Math.hypot(p.vel[0], p.vel[2]);
  const ht = [-clamp(sp / TUNE.RUN, 0, 1.3) * 0.35 - (p.vel[1] < -4 ? -0.3 : 0) + (p.vel[1] > 3 ? 0.2 : 0) - (st === 'glide' ? 0.4 : 0), p.bank * 0.8 + (st === 'attack' ? S.twC * 0.4 : 0)];
  for (let i = 0; i < 2; i++) { rig.hairV[i] += ((ht[i] - rig.hair[i]) * 120 - rig.hairV[i] * 8) * dt; rig.hair[i] += rig.hairV[i] * dt; }
  capeStep(dt, snapAll, time);
  rig.init = true;
}

// two-bone IK with a pole vector
function ik(a, b, l1, l2, pole) {
  const ab = V.sub(b, a), d = clamp(V.len(ab), 1e-4, l1 + l2 - 1e-4), dir = V.norm(ab);
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  let perp = V.sub(pole, V.mul(dir, V.dot(pole, dir))); perp = V.norm(perp);
  return V.add(a, V.add(V.mul(dir, l1 * ca), V.mul(perp, l1 * sa)));
}

// skin the body mesh on the CPU (3 bones per vertex) into an interleaved buffer
function skinHero() {
  const H = HERO, m = H.mesh, out = H.out, S = rig.skin;
  for (let v = 0; v < H.nv; v++) {
    const px = m.p[v * 3], py = m.p[v * 3 + 1], pz = m.p[v * 3 + 2], nx = m.n[v * 3], ny = m.n[v * 3 + 1], nz = m.n[v * 3 + 2];
    let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0;
    for (let j = 0; j < 3; j++) {
      const w = H.bw[v * 3 + j]; if (!w) continue;
      const s = S[H.bi[v * 3 + j]], M = s.M, t = s.t;
      x += w * (M[0] * px + M[3] * py + M[6] * pz + t[0]); y += w * (M[1] * px + M[4] * py + M[7] * pz + t[1]); z += w * (M[2] * px + M[5] * py + M[8] * pz + t[2]);
      a += w * (M[0] * nx + M[3] * ny + M[6] * nz); b += w * (M[1] * nx + M[4] * ny + M[7] * nz); c += w * (M[2] * nx + M[5] * ny + M[8] * nz);
    }
    const l = Math.hypot(a, b, c) || 1, o = v * 13;
    out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = a / l; out[o + 4] = b / l; out[o + 5] = c / l;
  }
}

// ---------- cape: verlet cloth pinned across the shoulders ----------
const CAPE = { W: 11, H: 18, CH: 0.052 };
function capeStep(dt, snap, time) {
  const W = CAPE.W, H = CAPE.H, F = rig.F, Rc = F[2].R, cp = F[2].P;
  const pin = (i) => V.add(cp, R3.v(Rc, [lerp(-0.2, 0.2, i / (W - 1)), 0.13 - Math.pow(Math.abs(i / (W - 1) - 0.5) * 2, 2) * 0.03, -0.19 + Math.pow(Math.abs(i / (W - 1) - 0.5) * 2, 2) * 0.03]));
  if (snap || !rig.cape) {
    rig.cape = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const top = pin(i), off = R3.v(Rc, [lerp(-0.2, 0.2, i / (W - 1)) * (j / (H - 1)) * 0.6, -j * CAPE.CH, -0.02 * j]);
      const q = V.add(top, off); rig.cape.push({ p: q, q: q.slice() });
    }
    rig.capeRest = { h: CAPE.CH, w: [] };
    for (let j = 0; j < H; j++) rig.capeRest.w.push(0.4 / (W - 1) * (1 + 0.6 * Math.pow(j / (H - 1), 0.8)));
  }
  // global wind (mod_world.js) pushes the cloth downwind and makes it flutter harder
  const C = rig.cape, g = -9.8 * dt * dt, air = [Math.sin(time * 1.4) * 0.5 + wind.x * 4, 0, Math.cos(time * 1.1) * 0.35 + wind.z * 4], fl = 1 + wind.strength * 1.5;
  const fwd = R3.v(rig.Rfull, [0, 0, 1]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const n = C[j * W + i];
    if (j === 0) { n.q = n.p; n.p = pin(i); continue; }
    const vx = (n.p[0] - n.q[0]) * 0.975, vy = (n.p[1] - n.q[1]) * 0.975, vz = (n.p[2] - n.q[2]) * 0.975;
    n.q = n.p.slice();
    const flutter = Math.sin(time * 9 * (0.8 + wind.strength * 0.4) + i * 1.3 + j * 0.8) * 0.0004 * j * fl;
    n.p = [n.p[0] + vx + air[0] * dt * dt + flutter, n.p[1] + vy + g, n.p[2] + vz + air[2] * dt * dt + flutter];
  }
  const R = rig.capeRest;
  const rel = (a, b, L, wa) => {
    const d = V.sub(b.p, a.p), l = V.len(d) || 1e-6, c = V.mul(d, (l - L) / l);
    if (wa === 0) b.p = V.sub(b.p, c); else { a.p = V.add(a.p, V.mul(c, 0.5)); b.p = V.sub(b.p, V.mul(c, 0.5)); }
  };
  const torsoA = V.add(F[0].P, R3.v(F[0].R, [0, -0.05, 0])), torsoB = V.add(F[2].P, R3.v(Rc, [0, 0.1, 0]));
  const thighs = [[F[11].P, F[12].P], [F[14].P, F[15].P]];
  for (let it = 0; it < 4; it++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (i < W - 1) rel(C[k], C[k + 1], R.w[j], j === 0 ? 2 : 1);
      if (j < H - 1) rel(C[k], C[k + W], R.h, j === 0 ? 0 : 1);
      if (j < H - 1 && i < W - 1) rel(C[k], C[k + W + 1], Math.hypot(R.h, R.w[j]), j === 0 ? 0 : 1);
      if (j < H - 1 && i > 0) rel(C[k], C[k + W - 1], Math.hypot(R.h, R.w[j]), j === 0 ? 0 : 1);
      // bending springs across two cells keep the cloth from crumpling into a strip
      if (i < W - 2 && j > 0) rel(C[k], C[k + 2], R.w[j] * 1.9, 1);
      if (j < H - 2) rel(C[k], C[k + 2 * W], R.h * 1.96, j === 0 ? 0 : 1);
    }
    for (let k = W; k < C.length; k++) {
      const n = C[k];
      const push = (a, b, r) => { const ab = V.sub(b, a), t = clamp(V.dot(V.sub(n.p, a), ab) / V.dot(ab, ab), 0, 1), c = V.add(a, V.mul(ab, t)), d = V.sub(n.p, c), l = V.len(d); if (l < r && l > 1e-6) n.p = V.add(c, V.mul(d, r / l)); };
      push(torsoA, torsoB, 0.19);
      // the cape hangs under the shield: keep it between the back and the shield's inner face
      const dl = R3.v(R3.T(Rc), V.sub(n.p, cp));
      if (Math.hypot(dl[0] - 0.03, dl[1] - 0.01) < 0.27 && dl[2] < -0.212) { dl[2] = -0.212; n.p = V.add(cp, R3.v(Rc, dl)); }
      for (const [a, b] of thighs) push(a, b, 0.1);
      const gy = heightAt(n.p[0], n.p[2]) + 0.02; if (n.p[1] < gy) n.p[1] = gy;
      // keep the cape behind the hips
      const d = V.sub(n.p, F[0].P), f = V.dot(d, fwd);
      if (f > -0.06 && Math.abs(V.dot(d, R3.v(rig.Rfull, [1, 0, 0]))) < 0.24 && d[1] < 0.35) n.p = V.sub(n.p, V.mul(fwd, f + 0.06));
    }
  }
}
function buildCapeVerts(out) {
  const W = CAPE.W, H = CAPE.H, C = rig.cape;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, p = C[k].p;
    const l = C[j * W + Math.max(0, i - 1)].p, r = C[j * W + Math.min(W - 1, i + 1)].p, u = C[Math.max(0, j - 1) * W + i].p, d = C[Math.min(H - 1, j + 1) * W + i].p;
    const n = V.norm(V.cross(V.sub(r, l), V.sub(d, u)));
    // fold shading from cloth curvature: valleys darken, crests catch a little light
    const lap = V.sub(p, V.mul(V.add(V.add(l, r), V.add(u, d)), 0.25)), fold = clamp(1 + V.dot(lap, n) * 9, 0.62, 1.12);
    const col0 = j >= H - 1 ? HC.trim : (i === 0 || i === W - 1 ? HC.capeIn : HC.cape), col = [col0[0] * fold, col0[1] * fold, col0[2] * fold, col0[3]];
    out.set([p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], col[3], i / (W - 1) * 0.34, -j * 0.066 * 13 / (H - 1), 0.4], k * 13);
  }
}
