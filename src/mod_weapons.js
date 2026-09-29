// ============================================================
//  Weapons: sword, spear, war hammer (or a goblin's club) and a bow with simulated arrows.
//  Self-contained module: it wraps a handful of core functions at load time (sim step, pose,
//  rig, camera, instance lists, game flow) instead of editing them, so it merges cleanly.
// ============================================================
const WPN_DEF = {
  sword: { slot: 0, name: 'Espada del Alba', short: 'Espada', got: 'obtenida' },
  spear: { slot: 1, name: 'Lanza del Vigía', short: 'Lanza', got: 'obtenida', mesh: 'wSpear', glow: 'wSpearGlow', grip: [0.26, 0.6], seg: [1.0, 1.45], head: 1.25, spd: 1, dmg: 0, prm: [0.28, 0.3, 0, 0] },
  hammer: { slot: 2, name: 'Martillo del Titán', short: 'Martillo', got: 'obtenido', mesh: 'wHammer', glow: 'wHammerGlow', grip: [-0.19, -0.07], seg: [0.5, 0.86], head: 0.72, spd: 1, dmg: 0, slamK: 1, prm: [0.3, 0.3, 0, 0] },
  club: { slot: 2, name: 'Garrote de Gruñón', short: 'Garrote', got: 'obtenido', mesh: 'wClub', grip: [-0.15, -0.06], seg: [0.36, 0.74], head: 0.56, spd: 0.85, dmg: -1, slamK: 0.72, prm: [0.7, 0.15, 0, 0] },
  bow: { slot: 3, name: 'Arco del Halcón', short: 'Arco', got: 'obtenido' },
};
// attack moves: normalised timing (from..to = hit window), reach from the hero's centre, cos of the hit arc, damage, knockback
const WPN_ATK = {
  sp1: { dur: 0.36, from: 0.3, to: 0.52, reach: 3.1, arc: 0.55, dmg: 1, kb: 4.5, up: 3, lunge: 4, stop: 0.035, shake: 0.2, fly: 1.3 },
  sp2: { dur: 0.36, from: 0.3, to: 0.52, reach: 3.1, arc: 0.55, dmg: 1, kb: 4.5, up: 3, lunge: 4, stop: 0.035, shake: 0.2, fly: 1.3 },
  sp3: { dur: 0.56, from: 0.36, to: 0.6, reach: 3.7, arc: 0.5, dmg: 2, kb: 8, up: 4.5, lunge: 8.5, stop: 0.07, shake: 0.45, fly: 1.8 },
  spF: { dur: 1.3, from: 0, to: 1, reach: 3.0, arc: 0.55, dmg: 1, kb: 2.2, up: 2, lunge: 0, stop: 0.02, shake: 0.12, fly: 1.2 },
  hm1: { dur: 0.72, from: 0.4, to: 0.6, reach: 2.7, arc: -0.3, dmg: 2, kb: 10, up: 6, lunge: 3, stop: 0.085, shake: 0.5, fly: 2.3 },
  hm2: { dur: 0.72, from: 0.4, to: 0.6, reach: 2.7, arc: -0.3, dmg: 2, kb: 10, up: 6, lunge: 3, stop: 0.085, shake: 0.5, fly: 2.3 },
  hm3: { dur: 0.95, from: 0.44, to: 0.53, slamAt: 0.5, reach: 2.4, arc: 0.3, dmg: 3, kb: 11, up: 8, lunge: 2, stop: 0.1, shake: 0.9, fly: 2.5, slam: 3.6 },
  hmS: { dur: 0.85, from: 0.4, to: 0.5, slamAt: 0.45, reach: 2.6, arc: 0.3, dmg: 3, kb: 13, up: 10, lunge: 5, stop: 0.12, shake: 1.2, fly: 2.9, slam: 5.4, leap: 7 },
};
const WPN_MAXA = 30, WPN_G = 12;
const WPN = {
  cur: 'sword', slots: ['sword', null, null, null], arrows: 0, out: 0, seeded: false,
  a: { kind: 0, n: 0, t: 0, dur: 1, queued: false, hit: new Set(), lunged: false, slammed: false, charging: false, charge: 0, ready: false, cyc: -1 },
  bow: { drawing: false, draw: 0, full: false, vib: 0 },
  aiming: false, aimHold: 0, camK: 0, aimPitch: 0.2, aimDir: [0, 0, -1], aimPt: [0, 0, 0], aimFoe: null,
  pz: { mode: 'back', face: [0, 1, 0], two: false },
  handM: new Float32Array(16), backM: new Float32Array(16), sheathM: new Float32Array(16),
  bowM: new Float32Array(16), limbU: new Float32Array(16), limbL: new Float32Array(16), strU: new Float32Array(16), strL: new Float32Array(16), nockM: new Float32Array(16),
  nockW: [0, 0, 0], arrowDir: [0, 0, 1], tipW: [0, 0, 0], baseW: [0, 0, 0], headW: [0, 0, 0],
  pickups: [], arr: [], hudT: 0, padPrev: [], pool: [], pn: 0,
};
for (let i = 0; i < 40; i++) WPN.arr.push({ s: 0, p: [0, 0, 0], v: [0, 0, 0], d: [0, 0, 1], foe: null, lo: [0, 0, 0], ld: [0, 0, 1], t: 0, age: 0, fire: 0, dmg: 1 });
let WPN_TIP = [0, 0.45, -0.15];

// ---------- small matrix helpers (write into existing arrays) ----------
function wpnBasisS(m, ox, oy, oz, yx, yy, yz, rx, ry, rz, s = 1) {
  let d = rx * yx + ry * yy + rz * yz, zx = rx - yx * d, zy = ry - yy * d, zz = rz - yz * d, l = Math.hypot(zx, zy, zz);
  if (l < 1e-4) {
    if (Math.abs(yx) < 0.9) { zx = 1 - yx * yx; zy = -yy * yx; zz = -yz * yx; } else { zx = -yx * yz; zy = -yy * yz; zz = 1 - yz * yz; }
    l = Math.hypot(zx, zy, zz);
  }
  zx /= l; zy /= l; zz /= l;
  const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
  m[0] = xx * s; m[1] = xy * s; m[2] = xz * s; m[3] = 0; m[4] = yx * s; m[5] = yy * s; m[6] = yz * s; m[7] = 0;
  m[8] = zx * s; m[9] = zy * s; m[10] = zz * s; m[11] = 0; m[12] = ox; m[13] = oy; m[14] = oz; m[15] = 1;
  return m;
}
function wpnBasis(m, o, y, r) { const l = Math.hypot(y[0], y[1], y[2]) || 1; return wpnBasisS(m, o[0], o[1], o[2], y[0] / l, y[1] / l, y[2] / l, r[0], r[1], r[2]); }
function wpnSegM(m, a, b, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-5;
  wpnBasisS(m, a[0], a[1], a[2], dx / L, dy / L, dz / L, 0, 0, 1);
  m[0] *= r; m[1] *= r; m[2] *= r; m[4] *= L; m[5] *= L; m[6] *= L; m[8] *= r; m[9] *= r; m[10] *= r;
  return m;
}
function wpnM() { if (WPN.pn >= WPN.pool.length) WPN.pool.push(new Float32Array(16)); return WPN.pool[WPN.pn++]; }
const WT1 = [1, 1, 1, 0], WPRM_WOOD = [0.6, 0.2, 0, 0], WPRM_STR = [0.8, 0, 0, 0], WT_STR = [0.95, 0.92, 0.85, 0];

// ============================================================
//  Meshes (same construction style as the sword: lofted sections, cord wraps, gold fittings)
// ============================================================
// elliptical section swept along a polyline in the y-z plane (x is the section's wide axis)
function wpnLoft(pts, rx, rz, col, seg = 10) {
  const m = new Mesh(), N = pts.length;
  for (let i = 0; i < N; i++) {
    const tg = V.norm(V.sub(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)])), Zp = V.norm(V.cross([1, 0, 0], tg));
    const t = i / (N - 1), wx = rx(t), wz = rz(t);
    for (let j = 0; j <= seg; j++) {
      const an = j / seg * TAU, c = Math.cos(an), s = Math.sin(an);
      m.v([pts[i][0] + c * wx, pts[i][1] + Zp[1] * s * wz, pts[i][2] + Zp[2] * s * wz], V.norm([c / Math.max(wx, 1e-4), Zp[1] * s / Math.max(wz, 1e-4), Zp[2] * s / Math.max(wz, 1e-4)]), col(t, an));
    }
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < seg; j++) { const q = i * (seg + 1) + j, w = q + seg + 1; m.tri(q, w, q + 1); m.tri(q + 1, w, w + 1); }
  return m;
}
// faceted blade: closed sections at stations, flat-shaded quads between them
function wpnBlade(m, st, sec, col) {
  for (let k = 0; k < st.length - 1; k++) {
    const A = sec(st[k]), B = sec(st[k + 1]), n = A.length;
    for (let f = 0; f < n; f++) {
      const a0 = A[f], a1 = A[(f + 1) % n], b0 = B[f], b1 = B[(f + 1) % n];
      let nn = V.cross(V.sub(a1, a0), V.sub(b0, a0));
      if (V.len(nn) < 1e-10) nn = V.cross(V.sub(b1, a1), V.sub(b0, a1));
      nn = V.norm(nn);
      const c = col(f, k), i0 = m.v(a0, nn, c), i1 = m.v(a1, nn, c), i2 = m.v(b0, nn, c), i3 = m.v(b1, nn, c);
      m.tri(i0, i1, i2); m.tri(i1, i3, i2);
    }
  }
  return m;
}
// spiral cord wrap around a shaft (like the sword grip)
function wpnWrap(m, y0, y1, r, cord, col, step = 0.0036) {
  const n = Math.floor((y1 - y0) / step);
  for (let k = 0; k < n; k++) {
    const a0 = k * 0.55, a1 = (k + 1) * 0.55, ya = y0 + k * step, yb = ya + step;
    m.merge(tubeMesh([Math.cos(a0) * r, ya, Math.sin(a0) * r], [Math.cos(a1) * r, yb, Math.sin(a1) * r], () => cord, () => col, 5, 1, [false, false]));
  }
}
// rounded box (superellipsoid)
function wpnBox(c, r, col, e = 0.35, seg = 24, ring = 16) {
  const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
  return ellipsoid(c, r, col, seg, ring, (q, n0) => [f(n0[0]) * r[0], f(n0[1]) * r[1], f(n0[2]) * r[2]]);
}
function buildWeaponMeshes(M) {
  const blue = mc('#3fd2ff', 6), white = [1, 1, 1, 0];
  const edgeC = [0.95, 0.97, 1, 4], faceC = [0.82, 0.86, 0.9, 4];
  // ---------- spear: ash shaft, cord-wrapped grip, gold ferrules, winged socket with a tassel, leaf blade ----------
  {
    const s = new Mesh(), ash = mc('#c08c52', 3), red = mc('#b3262f', 2), redD = mc('#7c1820', 2);
    s.merge(tubeMesh([0, -0.7, 0], [0, 1.02, 0], t => 0.0165 - 0.0025 * t, (t, an) => V.mul(ash, 0.84 + 0.1 * Math.sin(t * 70 + Math.sin(an * 3) * 1.5) + 0.06 * Math.sin(an * 5 + t * 23)).concat([3]), 12, 44));
    s.merge(tubeMesh([0, -0.14, 0], [0, 0.62, 0], () => 0.0182, (t) => (Math.abs(((t * 30) % 1) - 0.5) < 0.1 ? HC.leatherDark : HC.leather), 12, 60, [false, false]));
    wpnWrap(s, -0.13, 0.61, 0.0188, 0.0024, HC.leatherLight, 0.0062);
    for (const y of [-0.15, 0.625]) s.merge(transformed(torusMesh(0.0192, 0.0045, 16, 6, HC.gold), at(0, y, 0)));
    for (const y of [-0.45, 0.82]) s.merge(transformed(torusMesh(0.0165, 0.003, 14, 5, HC.gold), at(0, y, 0)));
    // butt: gold collar and a short steel spike
    s.merge(tubeMesh([0, -0.745, 0], [0, -0.69, 0], t => lerp(0.014, 0.018, t), () => HC.gold, 12, 3));
    s.merge(transformed(cylMesh(10, 0.0125, 0.0, 0.07, HC.steel, false), M4.rotX(at(0, -0.745, 0), Math.PI)));
    // socket: flared gold collar, blue gems, small wing lugs
    s.merge(tubeMesh([0, 0.97, 0], [0, 1.115, 0], t => 0.02 - 0.008 * t + 0.004 * Math.sin(t * Math.PI), (t) => t < 0.35 ? HC.gold : V.mul(HC.steel, 0.9).concat([4]), 14, 8));
    s.merge(transformed(torusMesh(0.0205, 0.004, 16, 6, HC.gold), at(0, 0.975, 0)));
    for (const z of [1, -1]) s.merge(ellipsoid([0, 1.02, 0.021 * z], [0.0065, 0.009, 0.004], blue, 8, 6));
    for (const x of [1, -1]) {
      s.merge(tubeMesh([0.012 * x, 1.06, 0], [0.05 * x, 1.075, 0], t => lerp(0.0075, 0.004, t), () => HC.gold, 8, 2));
      s.merge(ellipsoid([0.053 * x, 1.077, 0], [0.007, 0.007, 0.007], HC.gold, 8, 6));
    }
    // tassel: red cords hanging from under the collar
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU, r0 = 0.021, x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, len = 0.1 + 0.03 * Math.sin(k * 2.3);
      const p1 = [x0 * 1.6, 0.94, z0 * 1.6], p2 = [x0 * 2.1, 0.96 - len, z0 * 2.1];
      s.merge(tubeMesh([x0, 0.965, z0], p1, () => 0.0032, () => red, 5, 1));
      s.merge(tubeMesh(p1, p2, t => lerp(0.0032, 0.0018, t), (t) => V.lerp(red, redD, t).concat([2]), 5, 3));
    }
    // leaf blade: diamond section with a raised ridge
    const sec = ([y, w, th]) => [[w, 0], [w * 0.62, th * 0.42], [w * 0.25, th * 0.85], [0, th], [-w * 0.25, th * 0.85], [-w * 0.62, th * 0.42], [-w, 0], [-w * 0.62, -th * 0.42], [-w * 0.25, -th * 0.85], [0, -th], [w * 0.25, -th * 0.85], [w * 0.62, -th * 0.42]].map(p => [p[0], y, p[1]]);
    wpnBlade(s, [[1.1, 0.011, 0.009], [1.14, 0.03, 0.009], [1.2, 0.041, 0.0085], [1.27, 0.037, 0.0075], [1.34, 0.025, 0.006], [1.4, 0.012, 0.0036], [1.45, 0, 0]], sec, (f) => (f === 0 || f === 5 || f === 6 || f === 11 ? edgeC : f === 2 || f === 3 || f === 8 || f === 9 ? HC.steel : faceC));
    M.wSpear = s;
    const g = new Mesh();
    for (const z of [1, -1]) { g.merge(tubeMesh([0, 1.15, 0.0088 * z], [0, 1.33, 0.0066 * z], () => 0.0016, () => white, 5, 2)); g.merge(ellipsoid([0, 1.02, 0.0245 * z], [0.0035, 0.005, 0.0015], white, 6, 4)); }
    M.wSpearGlow = g;
  }
  // ---------- war hammer: dark wood haft, leather grip, iron langets, forged head with steel faces and a sun boss ----------
  {
    const h = new Mesh(), wood = mc('#5d3b22', 3), iron = mc('#4a4d55', 4), ironD = mc('#34363c', 4);
    h.merge(tubeMesh([0, -0.21, 0], [0, 0.8, 0], t => 0.02 + 0.0045 * t, (t, an) => V.mul(wood, 0.85 + 0.12 * Math.sin(t * 50 + Math.sin(an * 2) * 2)).concat([3]), 12, 30));
    h.merge(tubeMesh([0, -0.2, 0], [0, 0.17, 0], () => 0.0232, (t) => (Math.abs(((t * 18) % 1) - 0.5) < 0.1 ? HC.leatherDark : HC.leather), 12, 30, [false, false]));
    wpnWrap(h, -0.19, 0.16, 0.0238, 0.0026, HC.leatherLight, 0.0065);
    for (const y of [-0.2, 0.172]) h.merge(transformed(torusMesh(0.024, 0.005, 16, 6, HC.gold), at(0, y, 0)));
    h.merge(ellipsoid([0, -0.235, 0], [0.03, 0.026, 0.03], HC.gold, 14, 10, (q) => { q[1] *= 1 + 0.12 * Math.cos(Math.atan2(q[0], q[2]) * 8); return q; }));
    h.merge(ellipsoid([0, -0.262, 0], [0.012, 0.012, 0.012], blue, 8, 6));
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4, x = Math.cos(a) * 0.024, z = Math.sin(a) * 0.024; h.merge(tubeMesh([x, 0.46, z], [x * 1.05, 0.64, z * 1.05], t => lerp(0.004, 0.0055, t), () => iron, 6, 3)); for (const y of [0.49, 0.58]) h.merge(ellipsoid([x * 1.2, y, z * 1.2], [0.004, 0.004, 0.004], HC.gold, 6, 4)); }
    // head: rounded iron block, long axis along z
    const hc = [0, 0.72, 0];
    h.merge(wpnBox(hc, [0.075, 0.088, 0.15], (n0) => V.mul(iron, 0.85 + 0.2 * hash2(Math.floor(n0[0] * 7 + 9), Math.floor(n0[2] * 7 + 9))).concat([4]), 0.32, 28, 18));
    for (const z of [1, -1]) {
      // octagonal steel striking faces with a gold rim
      const f = transformed(cylMesh(8, 0.094, 0.088, 0.04, V.mul(HC.steel, 1.05).concat([4]), true), M4.rotX(at(0, 0.72, 0.135 * z), z > 0 ? Math.PI / 2 : -Math.PI / 2));
      h.merge(f);
      h.merge(transformed(torusMesh(0.091, 0.006, 8, 5, HC.gold), M4.rotX(at(0, 0.72, 0.172 * z), Math.PI / 2)));
      h.merge(transformed(torusMesh(0.082, 0.005, 24, 5, ironD), M4.rotX(at(0, 0.72, 0.1 * z), Math.PI / 2)));
    }
    // gold bands around the eye and a sun boss with a gem on each cheek
    h.merge(wpnBox([0, 0.72, 0], [0.082, 0.095, 0.034], HC.gold, 0.3, 20, 12));
    for (const x of [1, -1]) {
      h.merge(transformed(cylMesh(20, 0.042, 0.036, 0.012, HC.gold, true), M4.rotZ(at(0.078 * x, 0.72, 0), -x * Math.PI / 2)));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; h.merge(ellipsoid([0.09 * x, 0.72 + Math.cos(a) * 0.028, Math.sin(a) * 0.028], [0.004, 0.006, 0.006], HC.gold, 6, 4)); }
      h.merge(ellipsoid([0.091 * x, 0.72, 0], [0.006, 0.016, 0.016], blue, 10, 8));
    }
    // top spike and a collar where the haft enters
    h.merge(transformed(cylMesh(8, 0.03, 0.0, 0.09, V.mul(HC.steel, 0.95).concat([4]), false), at(0, 0.8, 0)));
    h.merge(tubeMesh([0, 0.6, 0], [0, 0.64, 0], () => 0.03, () => HC.gold, 12, 2));
    M.wHammer = h;
    const g = new Mesh();
    for (const x of [1, -1]) { g.merge(ellipsoid([0.0975 * x, 0.72, 0], [0.0018, 0.012, 0.012], white, 10, 8)); g.merge(transformed(torusMesh(0.034, 0.0016, 24, 4, white), M4.rotZ(at(0.091 * x, 0.72, 0), Math.PI / 2))); }
    for (const z of [1, -1]) g.merge(transformed(torusMesh(0.06, 0.0014, 8, 4, white), M4.rotX(at(0, 0.72, 0.176 * z), Math.PI / 2)));
    M.wHammerGlow = g;
  }
  // ---------- goblin club: knotty swelling log with an iron band and spikes, rope-bound grip ----------
  {
    const c = new Mesh(), wood = mc('#6f4a2c', 3), rope = mc('#a08556', 3);
    c.merge(tubeMesh([0, -0.18, 0], [0, 0.42, 0], t => lerp(0.022, 0.032, t), (t, an) => V.mul(wood, 0.82 + 0.16 * Math.sin(an * 7 + t * 9)).concat([3]), 12, 12));
    wpnWrap(c, -0.16, 0.1, 0.025, 0.004, rope, 0.009);
    const hm = tubeMesh([0, 0.36, 0], [0, 0.74, 0], t => 0.05 + Math.sin(t * Math.PI) * 0.035 + t * 0.012, (t, an) => {
      const grain = 0.8 + 0.25 * Math.sin(an * 9 + Math.sin(t * 7) * 2), knot = Math.abs(Math.sin(an * 3 + 1) * Math.sin(t * 9)) > 0.93 ? 0.55 : 1;
      return V.mul(wood, grain * knot).concat([3]);
    }, 24, 16);
    for (let k = 0; k < hm.vcount; k++) { const x = hm.p[k * 3], y = hm.p[k * 3 + 1], z = hm.p[k * 3 + 2], f = 1 + 0.2 * noise3(x * 26, y * 26, z * 26) - 0.1; hm.p[k * 3] = x * f; hm.p[k * 3 + 2] = z * f; }
    hm.recomputeNormals(); c.merge(hm);
    c.merge(transformed(torusMesh(0.068, 0.008, 22, 6, mc('#4a4a50', 4)), at(0, 0.44, 0)));
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + (k % 2) * 0.3, y = 0.52 + (k % 3) * 0.07, r = 0.078 + Math.sin((y - 0.36) / 0.38 * Math.PI) * 0.01, rd = [Math.cos(a), 0.15, Math.sin(a)];
      c.merge(cylMesh(6, 0.011, 0.0, 0.055, mc('#3a3a40', 4), false), basisY([rd[0] * r, y, rd[2] * r], rd));
    }
    M.wClub = c;
  }
  // ---------- bow: laminated recurve limbs on a carved riser, gold nocks, leather grip ----------
  {
    const b = new Mesh(), riser = mc('#4b2e1a', 3), wood = mc('#b98a55', 3);
    b.merge(wpnLoft([[0, -0.115, 0.004], [0, -0.07, 0.012], [0, 0, 0.016], [0, 0.07, 0.012], [0, 0.115, 0.004]], (t) => 0.014 + 0.004 * Math.sin(t * Math.PI), (t) => 0.02 + 0.006 * Math.sin(t * Math.PI), () => riser, 12));
    b.merge(wpnLoft([[0, -0.055, 0.0165], [0, 0, 0.0205], [0, 0.045, 0.0165]], () => 0.0185, () => 0.0245, (t, an) => (Math.abs(((t * 9) % 1) - 0.5) < 0.12 ? HC.leatherDark : HC.leather), 12));
    for (const y of [-0.058, 0.048]) b.merge(transformed(torusMesh(0.02, 0.004, 14, 5, HC.gold), M4.scale(at(0, y, 0.017), 1, 1, 1.25)));
    b.merge(wpnBox([0.013, 0.058, 0.02], [0.006, 0.008, 0.012], HC.gold, 0.4, 10, 8)); // arrow shelf
    b.merge(ellipsoid([0, 0.085, 0.033], [0.008, 0.011, 0.005], blue, 10, 6));
    b.merge(transformed(torusMesh(0.011, 0.0025, 12, 4, HC.gold), M4.rotX(at(0, 0.085, 0.031), Math.PI / 2)));
    M.wBowGrip = b;
    // upper limb in its own pivot space (root at the origin); drawn twice, mirrored for the lower limb
    const pts = [];
    for (let i = 0; i <= 22; i++) { const t = i / 22; pts.push([0, t * 0.46 - 0.012 * smooth(0.8, 1, t), -0.2 * Math.pow(Math.sin(t * Math.PI / 2), 1.15) + 0.055 * Math.pow(smooth(0.72, 1, t), 2)]); }
    WPN_TIP = pts[pts.length - 1].slice();
    const L = new Mesh();
    L.merge(wpnLoft(pts, (t) => lerp(0.024, 0.009, t), (t) => lerp(0.012, 0.0055, t), (t, an) => {
      const back = Math.sin(an) > 0.55; // the back (target side) is a dark laminate strip
      if (t < 0.06) return HC.gold;
      return back ? V.mul(riser, 1.1).concat([3]) : V.mul(wood, 0.9 + 0.1 * Math.sin(t * 60)).concat([3]);
    }, 10));
    L.merge(ellipsoid(V.add(WPN_TIP, [0, 0.004, 0]), [0.011, 0.02, 0.009], HC.gold, 10, 8));
    L.merge(transformed(torusMesh(0.018, 0.003, 12, 4, HC.gold), M4.scale(at(pts[4][0], pts[4][1], pts[4][2]), 1, 1, 0.6)));
    M.wBowLimb = L;
    const g = new Mesh(); g.merge(ellipsoid([0, 0.085, 0.037], [0.0035, 0.0055, 0.0012], white, 8, 5)); M.wBowGlow = g;
    M.wString = tubeMesh([0, 0, 0], [0, 1, 0], () => 1, () => [0.95, 0.92, 0.84, 2], 5, 1, [false, false]);
  }
  // ---------- arrow: wooden shaft, steel broadhead, red and white fletching, gold nock ----------
  {
    const a = new Mesh(), shaft = mc('#c89a5c', 3), fl1 = mc('#c8303a', 2), fl2 = mc('#f3ead8', 2);
    a.merge(tubeMesh([0, 0.012, 0], [0, 0.705, 0], () => 0.0042, (t) => V.mul(shaft, 0.9 + 0.1 * Math.sin(t * 40)).concat([3]), 6, 6));
    a.merge(tubeMesh([0, -0.004, 0], [0, 0.02, 0], () => 0.0052, () => HC.gold, 6, 1));
    for (let k = 0; k < 3; k++) {
      const an = k / 3 * TAU + 0.3, dx = Math.cos(an), dz = Math.sin(an), col = k === 0 ? fl2 : fl1, base = a.vcount;
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, y = 0.03 + t * 0.13, hh = 0.004 + 0.016 * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI / 2) * smooth(0, 0.15, t) + 0.004 * (1 - t);
        const n = [-dz, 0, dx];
        a.v([dx * 0.004, y, dz * 0.004], n, col); a.v([dx * (0.004 + hh), y - hh * 0.35, dz * (0.004 + hh)], n, col);
      }
      for (let i = 0; i < 6; i++) { const q = base + i * 2; a.tri(q, q + 1, q + 2); a.tri(q + 1, q + 3, q + 2); }
    }
    wpnBlade(a, [[0.7, 0.0052, 0.0052], [0.712, 0.0145, 0.0034], [0.745, 0.011, 0.0028], [0.782, 0, 0]], ([y, w, th]) => [[w, y, 0], [0, y, th], [-w, y, 0], [0, y, -th]], () => edgeC);
    M.wArrow = a;
  }
  // ---------- quiver: stitched leather tube, gold rim and bands, sun medallion ----------
  {
    const q = new Mesh(), lea = mc('#7a4a2a', 3);
    q.merge(tubeMesh([0, 0, 0], [0, 0.44, 0], t => lerp(0.042, 0.052, t), (t, an) => (Math.abs(Math.cos(an)) > 0.985 ? HC.leatherDark : V.mul(lea, 0.9 + 0.1 * Math.sin(t * 30)).concat([3])), 16, 12, [true, false]));
    q.merge(tubeMesh([0, 0.43, 0], [0, 0.445, 0], () => 0.053, () => HC.gold, 16, 1, [false, false]));
    q.merge(transformed(torusMesh(0.053, 0.005, 18, 5, HC.gold), at(0, 0.445, 0)));
    for (const y of [0.06, 0.3]) q.merge(transformed(torusMesh(lerp(0.043, 0.052, y / 0.44), 0.004, 18, 5, HC.gold), at(0, y, 0)));
    q.merge(transformed(cylMesh(16, 0.018, 0.016, 0.006, HC.gold, true), M4.rotX(at(0, 0.2, 0.046), Math.PI / 2)));
    q.merge(ellipsoid([0, 0.2, 0.054], [0.007, 0.007, 0.004], blue, 8, 5));
    q.merge(tubeMesh([0, 0.34, -0.05], [0, 0.1, -0.048], () => 0.006, () => HC.leatherDark, 6, 3));
    M.wQuiver = q;
  }
}

// ============================================================
//  Inventory, pickups, switching
// ============================================================
function wpnSeed() {
  WPN.pickups.length = 0;
  const place = (kind, x, z, yaw, stuck) => WPN.pickups.push({ kind, p: [x, heightAt(x, z), z], v: [0, 0, 0], yaw, roll: 0, spin: 0, rest: true, stuck, t: 0, life: 1e9 });
  place('spear', 3.2, 52.6, 0.5, true);
  place('bow', -3, 50, 1.2, false);
  place('hammer', 16.4, 34.2, 2.2, true);
  place('arrows', -8.5, 9.5, 0.4, false);
  place('arrows', 13.5, 24, 2.6, false);
  WPN.seeded = true;
}
function wpnReset() {
  wpnCancel();
  WPN.cur = 'sword'; WPN.slots = ['sword', null, null, null]; WPN.arrows = 0; WPN.out = 0; WPN.camK = 0;
  for (const a of WPN.arr) { a.s = 0; a.foe = null; }
  wpnSeed(); wpnHud(); wpnTouchLabel();
}
function wpnCancel() {
  const A = WPN.a; A.kind = 0; A.charging = false; A.ready = false; A.queued = false;
  WPN.bow.drawing = false; WPN.bow.full = false; WPN.aimHold = 0; WPN.aiming = false;
}
function wpnGive(kind, silent) {
  if (kind === 'arrows') { if (WPN.arrows >= WPN_MAXA) return false; WPN.arrows = Math.min(WPN_MAXA, WPN.arrows + 6); if (!silent) { wpnSfx('pick'); toast('Haz de flechas: +6', 2); } wpnHud(); return true; }
  const d = WPN_DEF[kind], had = WPN.slots[d.slot];
  if (had === kind) { if (kind === 'bow' && WPN.arrows < WPN_MAXA) { WPN.arrows = Math.min(WPN_MAXA, WPN.arrows + 5); wpnHud(); return true; } return false; }
  if (kind === 'club' && had === 'hammer') return false;
  WPN.slots[d.slot] = kind;
  if (kind === 'bow') WPN.arrows = Math.max(WPN.arrows, 12);
  if (had && WPN.cur === had) WPN.cur = kind;
  if (!silent) {
    wpnSfx('get');
    toast(`<b>${d.name}</b> ${d.got}. Pulsa <kbd>${d.slot + 1}</kbd> o <kbd>Tab</kbd> para empuñarl${d.got.endsWith('a') ? 'a' : 'o'}.`, 4.5);
    burst(V.add(player.pos, [0, 1.2, 0]), 22, [1.8, 1.5, 0.7, 1], 3.5, 0.6, 0.08);
    wpnHudShow(d.slot);
  }
  wpnHud(); wpnTouchLabel();
  return true;
}
function wpnEquip(kind) {
  const p = player;
  if (!kind || kind === WPN.cur) return;
  wpnCancel();
  p.atk.n = 0; p.atk.queued = false; p.charging = false; p.chargeReady = false;
  WPN.cur = kind; WPN.out = 2.5;
  if (kind === 'sword') p.swordOut = 2.5; else p.swordOut = 0;
  if (rig.trail) rig.trail.length = 0;
  wpnSfx('equip', kind);
  if (rig.F) burst(rig.F[BI.hand(-1)].P, 8, [1.6, 1.3, 0.6, 1], 1.8, 0.35, 0.05);
  wpnHudShow(WPN_DEF[kind].slot); wpnHud(); wpnTouchLabel();
}
function wpnSelect(i) {
  const k = WPN.slots[i];
  if (!k) { wpnSfx('empty'); wpnHudShow(i); return; }
  if (k === WPN.cur) { wpnHudShow(i); return; }
  wpnEquip(k);
}
function wpnCycle(dir) {
  let i = WPN_DEF[WPN.cur].slot;
  for (let n = 0; n < 4; n++) { i = (i + dir + 4) % 4; if (WPN.slots[i]) break; }
  wpnSelect(i);
}
function wpnDropClub(f) {
  const k = f.kdir || [0, 0, 1];
  WPN.pickups.push({ kind: 'club', p: [f.pos[0], f.pos[1] + 0.9, f.pos[2]], v: [k[0] * 2 + rand(-1, 1), 5.5, k[2] * 2 + rand(-1, 1)], yaw: rand(0, TAU), roll: 0, spin: rand(-9, 9), rest: false, stuck: false, t: 0, life: 45 });
  if (WPN.pickups.length > 14) { const i = WPN.pickups.findIndex(q => q.life < 1e8); if (i >= 0) WPN.pickups.splice(i, 1); }
}
function wpnPickupsStep(dt) {
  const p = player, play = state.mode === 'play' && p.deadT <= 0 && !p.hidden;
  for (let i = WPN.pickups.length - 1; i >= 0; i--) {
    const k = WPN.pickups[i];
    k.t += dt;
    if (!k.rest) {
      k.v[1] -= 22 * dt; k.p[0] += k.v[0] * dt; k.p[1] += k.v[1] * dt; k.p[2] += k.v[2] * dt; k.roll += k.spin * dt;
      const h = heightAt(k.p[0], k.p[2]);
      if (k.p[1] <= h) {
        if (h < WORLD.water + 0.05) { splash(k.p); WPN.pickups.splice(i, 1); continue; }
        k.p[1] = h;
        if (k.v[1] < -3) { k.v[1] *= -0.32; k.v[0] *= 0.55; k.v[2] *= 0.55; k.spin *= 0.4; dust(k.p, 3, 0.5); wpnSfx('thunk', -1); }
        else { k.rest = true; k.v[0] = k.v[1] = k.v[2] = 0; k.roll = 0; }
      }
    }
    if (k.t > k.life) { WPN.pickups.splice(i, 1); continue; }
    const dx = k.p[0] - p.pos[0], dz = k.p[2] - p.pos[2], dy = k.p[1] - p.pos[1], d2 = dx * dx + dz * dz;
    if (play && k.t > 0.4 && d2 < 1.1 && dy > -0.8 && dy < 1.6 && wpnGive(k.kind)) { WPN.pickups.splice(i, 1); continue; }
    // glints: new weapons send up golden motes, everything lying around twinkles now and then
    if (d2 < 1600) {
      const fresh = k.kind !== 'arrows' && WPN.slots[WPN_DEF[k.kind].slot] !== k.kind && !(k.kind === 'club' && WPN.slots[2] === 'hammer');
      if (fresh && Math.random() < dt * 9) particle([k.p[0] + rand(-0.35, 0.35), k.p[1] + rand(0.05, 0.4), k.p[2] + rand(-0.35, 0.35)], [0, rand(0.5, 1.2), 0], rand(0.8, 1.4), rand(0.03, 0.06), [1.8, 1.4, 0.55, 1], -0.2, 0.6);
      if (Math.random() < dt * 0.8) particle([k.p[0] + rand(-0.3, 0.3), k.p[1] + rand(0.05, 0.5), k.p[2] + rand(-0.3, 0.3)], [0, 0.1, 0], 0.25, 0.09, [2.4, 2.3, 2, 1], 0, 0, -0.2);
    }
  }
}

// ============================================================
//  Arrows: gravity, drag, sticking into foes, trees and terrain, retrievable
// ============================================================
function wpnFireNear(p) {
  try {
    if (typeof fireNear === 'function') return !!fireNear(p, 0.9);
    if (typeof isBurningAt === 'function') return !!isBurningAt(p);
  } catch (_) { }
  return false;
}
function wpnIgnite(x, y, z) { try { if (typeof igniteAt === 'function') igniteAt([x, y, z]); } catch (_) { } }
function wpnArrowAlloc() {
  let best = null;
  for (const a of WPN.arr) { if (!a.s) return a; if ((a.s === 2 || a.s === 4) && (!best || a.age > best.age)) best = a; }
  return best || WPN.arr[0];
}
function wpnStick(a, x, y, z, wood) {
  a.s = 2; a.age = 0; a.foe = null;
  a.p[0] = x + a.d[0] * 0.1; a.p[1] = y + a.d[1] * 0.1; a.p[2] = z + a.d[2] * 0.1;
  wpnSfx('thunk', wood ? 1 : 0);
  if (wood) burst([x, y, z], 5, [0.55, 0.4, 0.25, 1], 2, 0.3, 0.035); else dust([x, y, z], 3, 0.5);
  if (a.fire) { wpnIgnite(x, y, z); a.fire = 0; }
}
function wpnArrowHitFoe(a, f, hx, hy, hz) {
  const head = hy - f.pos[1] > 0.84, l = Math.hypot(a.v[0], a.v[2]) || 1, dir = [a.v[0] / l, 0, a.v[2] / l];
  const dmg = a.dmg + (head ? 1 : 0) + (a.fire ? 1 : 0);
  damageFoe(f, dir, dmg, [hx, hy, hz]);
  wpnSfx('arrowHit');
  if (head) { burst([hx, hy, hz], 14, [2.2, 1.8, 0.6, 1], 5, 0.4, 0.07); ring([hx, hy, hz], [1, 0.9, 0.5, 0.9], 0.7); }
  if (a.fire) wpnIgnite(hx, hy, hz);
  a.fire = 0;
  if (f.alive) {
    f.vel[0] += dir[0] * 2.5; f.vel[2] += dir[2] * 2.5;
    a.s = 3; a.foe = f; a.age = 0;
    const rel = V.rotY([hx - f.pos[0] + a.d[0] * 0.12, hy - f.pos[1] + a.d[1] * 0.12, hz - f.pos[2] + a.d[2] * 0.12], -f.yaw), rd = V.rotY(a.d, -f.yaw);
    a.lo[0] = rel[0]; a.lo[1] = rel[1]; a.lo[2] = rel[2]; a.ld[0] = rd[0]; a.ld[1] = rd[1]; a.ld[2] = rd[2];
  } else {
    a.s = 4; a.foe = null; a.p[0] = hx; a.p[1] = hy; a.p[2] = hz;
    a.v[0] = -dir[0] * 1.5; a.v[1] = 3; a.v[2] = -dir[2] * 1.5;
  }
}
function wpnArrowsStep(dt) {
  const p = player, play = state.mode === 'play' && p.deadT <= 0 && !p.hidden;
  const px = p.pos[0], py = p.pos[1] + 0.7, pz = p.pos[2];
  for (let i = 0; i < WPN.arr.length; i++) {
    const a = WPN.arr[i];
    if (!a.s) continue;
    a.age += dt;
    if (a.s === 1) {
      a.t += dt;
      const v = a.v, sp = Math.hypot(v[0], v[1], v[2]), dr = Math.max(0, 1 - 0.0045 * sp * dt);
      v[0] *= dr; v[1] = v[1] * dr - WPN_G * dt; v[2] *= dr;
      const ox = a.p[0], oy = a.p[1], oz = a.p[2], sx = v[0] * dt, sy = v[1] * dt, sz = v[2] * dt, nx = ox + sx, ny = oy + sy, nz = oz + sz;
      const l = Math.hypot(v[0], v[1], v[2]) || 1; a.d[0] = v[0] / l; a.d[1] = v[1] / l; a.d[2] = v[2] / l;
      // foes: swept segment against a sphere around the body
      let hitF = null, bt = 2;
      const ss = sx * sx + sy * sy + sz * sz || 1e-9;
      for (const f of foes) {
        if (!f.alive) continue;
        const cx = f.pos[0], cy = f.pos[1] + 0.62, cz = f.pos[2];
        const t = clamp(((cx - ox) * sx + (cy - oy) * sy + (cz - oz) * sz) / ss, 0, 1);
        const qx = ox + sx * t - cx, qy = oy + sy * t - cy, qz = oz + sz * t - cz;
        if (qx * qx + qy * qy * 0.6 + qz * qz < 0.25 && t < bt) { bt = t; hitF = f; }
      }
      if (hitF) { wpnArrowHitFoe(a, hitF, ox + sx * bt, oy + sy * bt, oz + sz * bt); continue; }
      let stuck = false;
      for (const s of WORLD.solids) {
        if (s.kind !== 'tree' && s.kind !== 'rock' && s.kind !== 'pillar') continue;
        const dx = nx - s.x, dz = nz - s.z;
        if (dx * dx + dz * dz < s.r * s.r && ny < s.top && ny > s.bottom) { wpnStick(a, ox, oy, oz, true); stuck = true; break; }
      }
      if (stuck) continue;
      const h = heightAt(nx, nz);
      if (ny < h && h > WORLD.water) {
        let lo = 0, hi = 1;
        for (let k = 0; k < 6; k++) { const m = (lo + hi) * 0.5; if (oy + sy * m < heightAt(ox + sx * m, oz + sz * m)) hi = m; else lo = m; }
        wpnStick(a, ox + sx * hi, oy + sy * hi, oz + sz * hi, false);
        continue;
      }
      if (ny < WORLD.water) {
        for (let k = 0; k < 8; k++) particle([nx, WORLD.water + 0.05, nz], [rand(-1, 1), rand(1.5, 3.5), rand(-1, 1)], rand(0.3, 0.6), rand(0.04, 0.08), [0.85, 0.95, 1, 0.85], 12, 0.5);
        a.s = 0; continue;
      }
      a.p[0] = nx; a.p[1] = ny; a.p[2] = nz;
      if (!a.fire && wpnFireNear(a.p)) a.fire = 1;
      if (a.fire) particle(a.p, [rand(-0.3, 0.3), rand(0.4, 1), rand(-0.3, 0.3)], rand(0.2, 0.35), rand(0.05, 0.09), [2.6, 1.1, 0.25, 1], -1, 1, -0.1);
      else if ((i + Math.floor(a.t * 120)) % 3 === 0) particle(a.p, [0, 0, 0], 0.16, 0.018, [1.5, 1.5, 1.3, 0.6], 0, 0, -0.05);
      if (a.t > 7) a.s = 0;
    } else if (a.s === 3) {
      const f = a.foe;
      if (!f || !f.alive) {
        const y = f ? f.yaw : 0, c = Math.cos(y), s = Math.sin(y), fp = f ? f.pos : a.p;
        a.p[0] = fp[0] + a.lo[0] * c + a.lo[2] * s; a.p[1] = fp[1] + a.lo[1]; a.p[2] = fp[2] - a.lo[0] * s + a.lo[2] * c;
        a.d[0] = a.ld[0] * c + a.ld[2] * s; a.d[1] = a.ld[1]; a.d[2] = -a.ld[0] * s + a.ld[2] * c;
        a.v[0] = rand(-1.2, 1.2); a.v[1] = 3; a.v[2] = rand(-1.2, 1.2); a.s = 4; a.foe = null;
      }
    } else if (a.s === 4) {
      a.v[1] -= 20 * dt; a.p[0] += a.v[0] * dt; a.p[1] += a.v[1] * dt; a.p[2] += a.v[2] * dt;
      const h = heightAt(a.p[0], a.p[2]);
      if (a.p[1] <= h + 0.015) {
        if (h < WORLD.water) { a.s = 0; continue; }
        a.p[1] = h + 0.015; a.d[1] = 0;
        const l = Math.hypot(a.d[0], a.d[2]); if (l < 1e-3) { a.d[0] = 1; a.d[2] = 0; } else { a.d[0] /= l; a.d[2] /= l; }
        a.s = 2; a.age = 0;
      }
    }
    if (play && (a.s === 2 || a.s === 4) && WPN.arrows < WPN_MAXA) {
      const dx = a.p[0] - px, dy = a.p[1] - py, dz = a.p[2] - pz;
      if (dx * dx + dz * dz < 1.0 && dy > -1.3 && dy < 1.4) {
        WPN.arrows++; a.s = 0; wpnSfx('pick');
        particle(a.p, [0, 1.2, 0], 0.4, 0.07, [2, 1.7, 0.8, 1], 0, 1);
        wpnHud();
      }
    }
  }
}
function wpnFire() {
  const B = WPN.bow, p = player;
  WPN.arrows--; wpnHud();
  const a = wpnArrowAlloc();
  const sp = lerp(20, 48, B.draw), o = WPN.nockW;
  let tx, ty, tz;
  if (WPN.camK > 0.3) { tx = WPN.aimPt[0]; ty = WPN.aimPt[1]; tz = WPN.aimPt[2]; }
  else { tx = o[0] + Math.sin(p.yaw) * 30; ty = o[1] + 1; tz = o[2] + Math.cos(p.yaw) * 30; }
  let dx = tx - o[0], dy = ty - o[1], dz = tz - o[2];
  const hd = Math.hypot(dx, dz), t = hd / sp;
  dy += 0.5 * WPN_G * t * t * 0.92;
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  a.s = 1; a.t = 0; a.age = 0; a.fire = 0; a.foe = null; a.dmg = B.draw >= 1 ? 2 : 1;
  a.d[0] = dx; a.d[1] = dy; a.d[2] = dz;
  a.p[0] = o[0] + dx * 0.78; a.p[1] = o[1] + dy * 0.78; a.p[2] = o[2] + dz * 0.78;
  a.v[0] = dx * sp; a.v[1] = dy * sp; a.v[2] = dz * sp;
  if (wpnFireNear(a.p)) a.fire = 1;
  B.vib = 1;
  wpnSfx('twang', B.draw);
  fovKick(-1.5 * B.draw); shake(0.06 + 0.06 * B.draw);
  if (B.draw >= 1) burst(a.p, 6, [1.6, 1.8, 2.2, 1], 2.5, 0.25, 0.04);
}

// ============================================================
//  Combat: melee moves for spear and hammer/club, hits, slams
// ============================================================
function wpnStart(kind, inp) {
  const p = player, A = WPN.a, K = WPN_ATK[kind], def = WPN_DEF[WPN.cur];
  A.kind = kind; A.t = 0; A.dur = K.dur * (def.spd || 1); A.queued = false; A.lunged = false; A.slammed = false; A.hit.clear(); A.cyc = -1;
  A.n = kind === 'sp1' || kind === 'hm1' ? 1 : kind === 'sp2' || kind === 'hm2' ? 2 : 3;
  WPN.out = 4;
  if (p.onGround) {
    // face the stick direction, or snap to the nearest foe in front
    if (inp && Math.hypot(inp.mx, inp.mz) > 0.2) p.yaw = Math.atan2(inp.mx, inp.mz);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let best = null, bd = 1e9;
    for (const f of foes) {
      if (!f.alive) continue;
      const dx = f.pos[0] - p.pos[0], dz = f.pos[2] - p.pos[2], h = Math.hypot(dx, dz);
      if (h < K.reach + 1.4 && h > 0.05 && Math.abs(f.pos[1] - p.pos[1]) < 2 && (dx * fx + dz * fz) / h > 0.35 && h < bd) { bd = h; best = f; }
    }
    if (best) p.yaw = Math.atan2(best.pos[0] - p.pos[0], best.pos[2] - p.pos[2]);
    if (K.leap) { p.vel[1] = K.leap; p.onGround = false; p.airT = 0.001; }
  }
  if (rig.trail) rig.trail.length = 0;
  if (kind[0] === 'h') wpnSfx('windup');
}
function wpnApplyHit(f, nx, nz, dmg, K, at, heavy) {
  damageFoe(f, [nx, 0, nz], dmg, at);
  if (f.alive) { f.vel[0] = nx * K.kb; f.vel[2] = nz * K.kb; f.vel[1] = K.up; f.stun = Math.max(f.stun, K.kb > 7 ? 1.1 : 0.6); f.onGround = false; }
  else f.kmul = K.fly;
  hitstop(K.stop); shake(K.shake); rumble(heavy ? 0.7 : 0.35, heavy ? 140 : 70);
  if (heavy) {
    burst(at, 18, [2, 1.6, 1, 1], 7, 0.35, 0.07); ring(at, [1, 0.9, 0.7, 0.8], 1.3); dust(f.pos, 6, 1.3);
    fovKick(-3); wpnSfx('heavyHit');
  } else {
    for (let i = 0; i < 10; i++) particle(at, [nx * rand(4, 9) + rand(-2, 2), rand(0, 3), nz * rand(4, 9) + rand(-2, 2)], rand(0.1, 0.22), rand(0.025, 0.05), [2.4, 2.1, 1.4, 1], 6, 3);
    fovKick(-1); wpnSfx('pierce');
  }
}
function wpnHits(K) {
  const p = player, A = WPN.a, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), def = WPN_DEF[WPN.cur], heavy = WPN.cur !== 'spear';
  for (const f of foes) {
    if (!f.alive || A.hit.has(f)) continue;
    const dx = f.pos[0] - p.pos[0], dz = f.pos[2] - p.pos[2], h = Math.hypot(dx, dz) || 1e-3;
    if (h > K.reach + 0.45 || Math.abs(f.pos[1] - p.pos[1]) > 1.8) continue;
    if (h > 0.4 && (dx * fx + dz * fz) / h < K.arc) continue;
    A.hit.add(f);
    const c = [f.pos[0], f.pos[1] + 0.7, f.pos[2]];
    wpnApplyHit(f, dx / h, dz / h, Math.max(1, K.dmg + (def.dmg || 0)), K, V.lerp(WPN.tipW, c, 0.5), heavy);
  }
}
function wpnSlam(K, center, R) {
  const p = player, A = WPN.a, def = WPN_DEF[WPN.cur];
  const c = center.slice();
  c[1] = heightAt(c[0], c[2]);
  if (Math.abs(c[1] - p.pos[1]) > 1.5) { c[0] = p.pos[0] + Math.sin(p.yaw) * 1.1; c[2] = p.pos[2] + Math.cos(p.yaw) * 1.1; c[1] = p.pos[1]; }
  const cu = [c[0], c[1] + 0.08, c[2]];
  ring(cu, [1, 0.93, 0.7, 0.95], R); ring([c[0], c[1] + 0.12, c[2]], [1, 0.62, 0.3, 0.7], R * 0.55);
  dust(c, 26, 2.4);
  for (let i = 0; i < 22; i++) { const a = rand(0, TAU), s = rand(1.5, 4); particle([c[0] + Math.sin(a) * 0.3, c[1] + 0.1, c[2] + Math.cos(a) * 0.3], [Math.sin(a) * s, rand(4, 9), Math.cos(a) * s], rand(0.5, 0.9), rand(0.04, 0.09), [0.42, 0.34, 0.25, 1], 22, 0.5); }
  for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; particle([c[0] + Math.sin(a) * 0.5, c[1] + 0.12, c[2] + Math.cos(a) * 0.5], [Math.sin(a) * R * 2.3, 0.5, Math.cos(a) * R * 2.3], 0.42, 0.2, [0.92, 0.86, 0.74, 0.55], 0, 3.2, 0.7); }
  burst([c[0], c[1] + 0.25, c[2]], 16, [2, 1.6, 0.9, 1], 6, 0.35, 0.06);
  shake(K.shake); hitstop(K.stop); fovKick(-5); rumble(0.9, 260); wpnSfx('slam');
  for (const f of foes) {
    if (!f.alive || A.hit.has(f)) continue;
    const dx = f.pos[0] - c[0], dz = f.pos[2] - c[2], h = Math.hypot(dx, dz) || 1e-3;
    if (h > R || Math.abs(f.pos[1] - c[1]) > 2.2) continue;
    A.hit.add(f);
    wpnApplyHit(f, dx / h, dz / h, Math.max(1, (h < R * 0.5 ? K.dmg : K.dmg - 1) + (def.dmg || 0)), K, [f.pos[0], f.pos[1] + 0.5, f.pos[2]], true);
  }
}
function wpnMelee(dt, inp, pp, ph, free) {
  const p = player, A = WPN.a, heavy = WPN.cur !== 'spear';
  if (!free) { if (A.kind || A.charging) wpnCancel(); return; }
  if (pp) {
    if (!A.kind && !A.charging) wpnStart(heavy ? 'hm1' : 'sp1', inp);
    else if (A.kind && A.kind !== 'spF' && A.n < 3 && A.t > A.dur * 0.28) A.queued = true;
  }
  if (A.kind) {
    const K = WPN_ATK[A.kind];
    A.t += dt;
    const u = A.t / A.dur;
    if (p.onGround) { p.lock = Math.max(p.lock, 0.03); const f = Math.exp(-(heavy ? 9 : 7) * dt); p.vel[0] *= f; p.vel[2] *= f; }
    if (!A.lunged && u >= K.from - 0.03 && A.kind !== 'spF') {
      A.lunged = true;
      if (p.onGround && K.lunge) { p.vel[0] += Math.sin(p.yaw) * K.lunge; p.vel[2] += Math.cos(p.yaw) * K.lunge; }
      wpnSfx(heavy ? 'heavySwing' : 'thrust', A.n);
    }
    if (A.kind === 'spF') {
      const cyc = 0.12, idx = Math.floor(A.t / cyc), ph2 = (A.t % cyc) / cyc;
      if (idx !== A.cyc) { A.cyc = idx; A.hit.clear(); wpnSfx('thrust', idx % 3); if (p.onGround) { p.vel[0] += Math.sin(p.yaw) * 0.8; p.vel[2] += Math.cos(p.yaw) * 0.8; } }
      if (ph2 > 0.3 && ph2 < 0.7) wpnHits(K);
      if (!ph || A.t >= K.dur) { wpnStart('sp3', inp); return; }
    } else if (u >= K.from && u <= K.to) wpnHits(K);
    if (K.slam && !A.slammed && u >= K.slamAt && (p.onGround || u > 0.92)) { A.slammed = true; wpnSlam(K, WPN.headW, K.slam * (WPN_DEF[WPN.cur].slamK || 1)); }
    if (A.t >= A.dur && A.kind !== 'spF') {
      const was = A.kind;
      if (A.queued && A.n < 3) wpnStart(heavy ? (A.n === 1 ? 'hm2' : 'hm3') : (A.n === 1 ? 'sp2' : 'sp3'), inp);
      else {
        A.kind = 0; WPN.out = 4;
        if (ph && p.onGround && (was === 'sp1' || was === 'sp2' || was === 'hm1' || was === 'hm2')) {
          if (heavy) { A.charging = true; A.charge = 0; A.ready = false; sfx('charge'); } else wpnStart('spF', inp);
        }
      }
    }
  }
  if (A.charging) {
    A.charge += dt; WPN.out = 4;
    if (A.charge > 0.65 && !A.ready) { A.ready = true; sfx('ready'); burst(WPN.headW, 12, [2, 1.4, 0.5, 1], 2.4, 0.4, 0.07); }
    if (A.ready && Math.random() < dt * 20) particle(WPN.headW, [rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5)], 0.35, 0.05, [2, 1.5, 0.6, 1], -1, 1);
    if (!ph) { const ok = A.ready; A.charging = false; A.ready = false; if (ok) wpnStart('hmS', inp); }
  }
}
function wpnBowStep(dt, inp, pp, ph, free) {
  const B = WPN.bow;
  if (!free) { if (B.drawing) { B.drawing = false; B.full = false; } return; }
  if (pp && !B.drawing) {
    if (WPN.arrows > 0) { B.drawing = true; B.draw = 0; B.full = false; WPN.out = 4; wpnSfx('draw'); }
    else { wpnSfx('empty'); toast('No te quedan flechas: recoge las que clavaste.', 2.5); }
  }
  if (B.drawing) {
    B.draw = Math.min(1, B.draw + dt / 0.62);
    if (B.draw >= 1 && !B.full) { B.full = true; wpnSfx('full'); }
    WPN.aimHold = 0.45; WPN.out = 4;
    if (!ph) { B.drawing = false; B.full = false; if (B.draw >= 0.18) wpnFire(); }
  }
}
function wpnBefore(dt, inp, pp, ph) {
  const p = player;
  const free = p.rollT <= 0 && p.dashT <= 0 && !p.pound && p.hurtT <= 0 && p.deadT <= 0;
  p.swordOut = 0; p.atk.n = 0; p.charging = false; p.chargeReady = false;
  if (WPN.cur === 'bow') wpnBowStep(dt, inp, pp, ph, free); else wpnMelee(dt, inp, pp, ph, free);
}
function wpnAfter(dt, y0) {
  const p = player, A = WPN.a, B = WPN.bow;
  WPN.aimHold = Math.max(0, WPN.aimHold - dt);
  WPN.aiming = WPN.cur === 'bow' && (B.drawing || WPN.aimHold > 0) && p.deadT <= 0;
  B.vib = Math.max(0, B.vib - dt * 3.5);
  const slow = WPN.aiming ? 2.6 : A.charging ? 2.0 : 0;
  if (WPN.aiming) { const ty = Math.atan2(WPN.aimDir[0], WPN.aimDir[2]); p.yaw = y0 + clamp(angDiff(y0, ty), -14 * dt, 14 * dt); p.yawRate = 0; }
  if (slow && p.onGround) { const s = Math.hypot(p.vel[0], p.vel[2]); if (s > slow) { p.vel[0] *= slow / s; p.vel[2] *= slow / s; } }
  if (!A.kind && !A.charging && !WPN.aiming && WPN.out > 0) { WPN.out -= dt; if (WPN.out <= 0) sfx('sheath'); }
}

// ============================================================
//  Poses: attack curves in hero space (+z forward, +x the hero's left), driven through the existing rig
// ============================================================
function wpnPoseAttack(o, t) {
  const p = player, A = WPN.a, Z = WPN.pz, k = A.kind, K = WPN_ATK[k] || WPN_ATK.hm1, u = clamp(A.t / A.dur, 0, 1), g = p.onGround;
  o.sword = 'hand'; o.mouth = 0.6; Z.two = true;
  if (k === 'sp1' || k === 'sp2' || k === 'sp3') {
    const amp = k === 'sp3' ? 1.3 : 1, w0 = K.from - 0.05, s1 = K.from + 0.1;
    const ext = u < w0 ? -smooth(0, w0, u) : u < s1 ? lerp(-1, 1, smooth(w0, s1, u)) : lerp(1, 0.1, smooth(K.to, 1, u)), e = Math.max(0, ext);
    const hi = k === 'sp2' ? 0.1 : k === 'sp3' ? -0.03 : 0, sx = k === 'sp2' ? 0.05 : 0;
    o.hr = [-0.17 + sx, 1.07 + hi, 0.08 + ext * 0.3 * amp];
    o.blade = V.norm([0.05 - sx, 0.02 + hi * 0.5 - e * 0.03, 1]);
    o.twC = 0.18 + ext * 0.3; o.twP = 0.08 * ext; o.lean = 0.1 + 0.16 * e * amp;
    o.pel = [0, -0.07 - 0.07 * e * amp, 0.02];
    if (g) { o.fl = [0.15, 0.09, 0.16 + (amp - 1) * 0.3]; o.fr = [-0.13, 0.09, -0.2]; }
    Z.face[0] = 0; Z.face[1] = 1; Z.face[2] = 0;
  } else if (k === 'spF') {
    const cyc = 0.12, idx = Math.floor(A.t / cyc), ext = -Math.cos((A.t % cyc) / cyc * TAU);
    const jx = hash2(idx, 3) - 0.5, jy = hash2(idx, 11) - 0.5;
    o.hr = [-0.17 + jx * 0.1, 1.1 + jy * 0.14, 0.12 + ext * 0.28];
    o.blade = V.norm([jx * 0.3, jy * 0.25, 1]);
    o.twC = 0.2 + ext * 0.22; o.lean = 0.2; o.pel = [0, -0.1, 0.02];
    if (g) { o.fl = [0.15, 0.09, 0.2]; o.fr = [-0.13, 0.09, -0.2]; }
    Z.face[0] = 0; Z.face[1] = 1; Z.face[2] = 0;
  } else if (k === 'hm1' || k === 'hm2') {
    const s = k === 'hm2' ? -1 : 1, w = K.from, e1 = K.to + 0.05;
    const al = s * (u < w ? lerp(-1.3, -2.55, smooth(0, w, u)) : lerp(-2.55, 1.95, smooth(w, e1, u)));
    const C = [-0.05, 1.12, 0.06];
    o.hr = [C[0] + Math.sin(al) * 0.42, C[1] - 0.04 + (u < w ? 0.07 * smooth(0, w, u) : 0), C[2] + Math.cos(al) * 0.42];
    o.blade = V.norm([Math.sin(al), 0.14 - (u > w ? 0.22 * smooth(w, e1, u) : 0), Math.cos(al)]);
    Z.face[0] = s * Math.cos(al); Z.face[1] = 0; Z.face[2] = -s * Math.sin(al);
    o.twC = -al * 0.45; o.twP = -al * 0.15; o.lean = 0.12; o.pel = [0, -0.11, 0.02];
    if (g) { o.fl = [0.17, 0.09, 0.12]; o.fr = [-0.16, 0.09, -0.12]; }
  } else {
    // overhead slam (hm3), charged slam (hmS), charging pose
    let be, str = 0, rec = 0;
    if (A.charging) { be = -1.05 + Math.sin(t * 40) * (A.ready ? 0.02 : 0.005); }
    else {
      const imp = K.slamAt, w = k === 'hmS' ? 0.04 : K.from - 0.1;
      be = u < w ? lerp(0.2, -0.95, smooth(0, w, u)) : u < imp ? lerp(-0.95, 2.55, Math.pow(smooth(w, imp, u), 1.6)) : 2.55;
      if (k === 'hmS' && u < w) be = -1.05;
      str = smooth(w, imp, u); rec = smooth(imp + 0.22, 1, u);
    }
    o.hr = [-0.03, 1.2 + Math.cos(be) * 0.4, 0.06 + Math.sin(be) * 0.4];
    o.blade = V.norm([0.02, Math.cos(be), Math.sin(be)]);
    Z.face[0] = 0; Z.face[1] = -Math.sin(be); Z.face[2] = Math.cos(be);
    o.lean = 0.05 + 0.5 * str * (1 - rec * 0.7); o.twC = A.charging ? -0.15 : 0;
    o.pel = [0, -0.05 - 0.2 * str * (1 - rec * 0.6) - (A.charging ? 0.08 : 0), 0.03];
    if (g) { o.fl = [0.15, 0.09, 0.16]; o.fr = [-0.15, 0.09, -0.14]; }
  }
}
function wpnPoseGuard(o, st, t) {
  const p = player, Z = WPN.pz, heavy = WPN.cur !== 'spear';
  o.sword = 'hand';
  const b = Math.sin(p.runPh * 2) * 0.02;
  if (!heavy) {
    Z.face[0] = 0; Z.face[1] = 1; Z.face[2] = 0;
    if (st === 'idle') { o.hr = [-0.2, 1.0, 0.04]; o.blade = V.norm([0.1, 0.32, 1]); o.twC = -0.2; o.fl = [0.15, 0.09, 0.14]; o.fr = [-0.13, 0.09, -0.14]; o.pel[1] = -0.05; Z.two = true; }
    else if (st === 'run') { o.hr = [-0.27, 0.95 + b, 0.02]; o.blade = V.norm([0.1, 0.24, 1]); Z.two = true; }
    else o.blade = V.norm([-0.2, 0.55, 0.8]);
  } else {
    Z.face[0] = 0; Z.face[1] = 0.57; Z.face[2] = 0.82;
    if (st === 'idle' || st === 'run') { o.hr = st === 'idle' ? [-0.2, 1.1, 0.14] : [-0.22, 1.12 + b, 0.1]; o.blade = V.norm([-0.25, 0.8, -0.55]); Z.two = st === 'idle'; }
    else o.blade = V.norm([-0.2, 0.7, -0.3]);
  }
}
function wpnPoseBow(o, st, mine) {
  const p = player, Z = WPN.pz, B = WPN.bow;
  if (mine) {
    const a = V.rotY(WPN.aimDir, -p.yaw), k = B.drawing ? smooth(0, 1, B.draw) : 0;
    o.twC = -0.55; o.twP = -0.3; o.lean = 0.02; o.sword = 'back'; o.blade = null;
    o.hl = [-0.02 + a[0] * 0.58, 1.39 + a[1] * 0.58, a[2] * 0.58];
    const nock = [o.hl[0] - a[0] * 0.19, o.hl[1] - a[1] * 0.19, o.hl[2] - a[2] * 0.19];
    const anchor = [-0.08 + a[0] * 0.03, 1.465 + a[1] * 0.06, 0.03 + a[2] * 0.03];
    o.hr = B.drawing ? V.lerp(nock, anchor, k) : [anchor[0] - 0.05, anchor[1] + 0.02, anchor[2] - 0.07];
    if (p.onGround && Math.hypot(p.vel[0], p.vel[2]) < 0.6) { o.fl = [0.1, 0.09, 0.18]; o.fr = [-0.15, 0.09, -0.12]; }
    o.pel[1] -= 0.03; o.mouth = 0.12;
    o.lookOff = [0.5, -Math.asin(clamp(a[1], -1, 1)) * 0.8];
    Z.mode = 'aim';
  } else if (WPN.out > 0 && (st === 'idle' || st === 'run')) Z.mode = 'hold';
  else Z.mode = 'back';
}

// ============================================================
//  Rig post-process: weapon matrices, left hand locked onto the shaft, bow string and arrow
// ============================================================
const WPN_POLE_L = [0.35, -0.45, -0.8], WPN_POLE_LB = [0.6, -0.5, -0.2], WPN_POLE_RB = [-0.5, 0.25, -0.9];
const WPN_SHEATH = basisY([-0.12, 1.43, -0.17], V.norm([0.5, -0.86, -0.08]));
const WPN_BACK = {};
{
  const back = (dir, anchor, along, face) => { const d = V.norm(dir); return wpnBasis(new Float32Array(16), V.sub(anchor, V.mul(d, along)), d, face); };
  WPN_BACK.spear = back([-0.62, 0.78, -0.04], [0.02, 1.1, -0.305], 0.36, [0, 0, -1]);
  WPN_BACK.hammer = back([-0.3, 0.95, -0.03], [-0.2, 1.52, -0.33], 0.72, [1, 0, 0]);
  WPN_BACK.club = back([-0.3, 0.95, -0.03], [-0.19, 1.45, -0.31], 0.56, [1, 0, 0]);
  WPN_BACK.bow = wpnBasis(new Float32Array(16), [0.02, 1.12, -0.3], V.norm([0.55, 0.83, 0]), [0, 0, -1]);
}
const WPN_QUIVER = basisY([-0.16, 0.8, -0.12], V.norm([-0.22, 1, -0.38]));
const WPN_QARROWS = [[0.012, 0.018], [-0.018, 0.01], [0.004, -0.02], [-0.02, -0.014], [0.022, -0.006]].map(([x, z], i) => basisY([x, 0.56 + (i % 2) * 0.012, z], V.norm([-x * 3, -1, -z * 3])));
function wpnArm(i, target, poleL, axis) {
  const F = rig.F, sgn = i ? -1 : 1, bu = BI.ua(sgn), bf = BI.fa(sgn), bh = BI.hand(sgn), Rc = F[2].R, sh = F[bu].P;
  const el = ik(sh, target, LIMB.ua, LIMB.fa, R3.v(Rc, poleL));
  const wr = V.add(el, V.mul(V.norm(V.sub(target, el)), LIMB.fa));
  const restU = R3.mul(Rc, BONES[bu].Rb), Ru = R3.mul(R3.between(V.norm(R3.v(restU, [0, 1, 0])), V.norm(V.sub(el, sh))), restU);
  const restF = R3.mul(Ru, R3.mul(R3.T(BONES[bu].Rb), BONES[bf].Rb)), Rf = R3.mul(R3.between(V.norm(R3.v(restF, [0, 1, 0])), V.norm(V.sub(wr, el))), restF);
  let Rh = R3.mul(Rf, R3.mul(R3.T(BONES[bf].Rb), BONES[bh].Rb));
  if (axis) { const want = V.norm(V.add(R3.v(Rh, [0, 1, 0]), V.mul(axis, 0.6))); Rh = R3.mul(R3.between(V.norm(R3.v(Rh, [0, 1, 0])), want), Rh); }
  F[bu] = { R: Ru, P: sh }; F[bf] = { R: Rf, P: el }; F[bh] = { R: Rh, P: wr };
  for (const b of [bu, bf, bh]) { const M = R3.mul(F[b].R, R3.T(BONES[b].Rb)); rig.skin[b] = { M, t: V.sub(F[b].P, R3.v(M, BONES[b].Pb)) }; }
  const s = rig.hands[i]; s.p = wr.slice(); s.v = [0, 0, 0];
}
// limbs, string and tips for a bow whose grip frame is G
function wpnBowParts(G, bend, nock, lu, ll, su, sl, vib) {
  lu.set(G); M4.translate(lu, 0, 0.1, 0); M4.rotX(lu, bend);
  ll.set(G); M4.scale(ll, 1, -1, 1); M4.translate(ll, 0, 0.1, 0); M4.rotX(ll, bend);
  const tu = M4.apply(lu, WPN_TIP), tl = M4.apply(ll, WPN_TIP);
  let n = nock;
  if (!n) { const w = Math.sin(state.time * 95) * vib * 0.025; n = [(tu[0] + tl[0]) * 0.5 + G[8] * w, (tu[1] + tl[1]) * 0.5 + G[9] * w, (tu[2] + tl[2]) * 0.5 + G[10] * w]; }
  wpnSegM(su, tu, n, 0.0024); wpnSegM(sl, n, tl, 0.0024);
  return n;
}
function wpnRigPost(time) {
  const cur = WPN.cur;
  if (cur === 'sword' || !rig.F) return;
  const F = rig.F, Z = WPN.pz, pose = rig.pose, def = WPN_DEF[cur];
  if (cur !== 'bow') M4.mul(rig.chestM, WPN_BACK[cur], WPN.backM);
  if (cur === 'bow') {
    rig.trail.length = 0;
    if (Z.mode === 'aim') { wpnArm(0, rig.toW(pose.hl), WPN_POLE_LB, null); wpnArm(1, rig.toW(pose.hr), WPN_POLE_RB, null); }
    if (Z.mode === 'back') { M4.mul(rig.chestM, WPN_BACK.bow, WPN.bowM); wpnBowParts(WPN.bowM, 0, null, WPN.limbU, WPN.limbL, WPN.strU, WPN.strL, 0); return; }
    const hb = F[BI.hand(1)], hy = R3.v(hb.R, [0, 1, 0]), grip = V.add(hb.P, V.mul(hy, 0.075));
    let yb, zb;
    if (Z.mode === 'aim') { zb = WPN.aimDir; yb = V.sub([0, 1, 0], V.mul(zb, zb[1])); const xb = V.cross(yb, zb); yb = V.add(yb, V.mul(xb, -0.14)); }
    else { yb = R3.v(rig.Rfull, [0.1, 0.95, 0.28]); zb = R3.v(rig.Rfull, [0, -0.25, 1]); }
    wpnBasis(WPN.bowM, grip, yb, zb);
    let nock = null, drawAmt = 0;
    if (Z.mode === 'aim' && WPN.bow.drawing) {
      const hr = F[BI.hand(-1)];
      nock = V.add(hr.P, V.mul(R3.v(hr.R, [0, 1, 0]), 0.05));
      drawAmt = clamp((V.dist(grip, nock) - 0.17) / 0.45, 0, 1);
    }
    const n = wpnBowParts(WPN.bowM, -0.3 * drawAmt, nock, WPN.limbU, WPN.limbL, WPN.strU, WPN.strL, WPN.bow.vib);
    WPN.nockW = n;
    const ad = V.norm(V.sub(V.add(grip, [WPN.bowM[0] * 0.012, WPN.bowM[1] * 0.012, WPN.bowM[2] * 0.012]), n));
    WPN.arrowDir = ad;
    wpnBasis(WPN.nockM, n, ad, yb);
    return;
  }
  if (Z.mode === 'hand') {
    const S = rig.swordM, y = V.norm([S[4], S[5], S[6]]), pos = [S[12], S[13], S[14]];
    wpnBasis(WPN.handM, pos, y, R3.v(rig.Rfull, Z.face));
    M4.mul(rig.chestM, WPN_SHEATH, WPN.sheathM);
    rig.swordM = WPN.sheathM;
    WPN.baseW = M4.apply(WPN.handM, [0, def.seg[0], 0]); WPN.tipW = M4.apply(WPN.handM, [0, def.seg[1], 0]); WPN.headW = M4.apply(WPN.handM, [0, def.head, 0]);
    rig.bladeBase = WPN.baseW; rig.bladeTip = WPN.tipW;
    if (rig.state === 'attack' && rig.trail.length) rig.trail[rig.trail.length - 1] = [WPN.baseW, WPN.tipW, time];
    if (Z.two) {
      const sh = F[BI.ua(1)].P, s = clamp(V.dot(V.sub(sh, pos), y), def.grip[0], def.grip[1]), g = V.add(pos, V.mul(y, s));
      wpnArm(0, V.add(g, V.mul(V.norm(V.sub(sh, g)), 0.075)), WPN_POLE_L, y);
    }
  } else {
    WPN.headW = M4.apply(WPN.backM, [0, def.head, 0]); WPN.tipW = WPN.headW;
  }
}

// ============================================================
//  Drawing: weapon in hand / on the back, quiver, pickups and arrows in the world
// ============================================================
function wpnDrawBow(L, G, lu, ll, su, sl, arrowM) {
  L.add('wBowGrip', G, WT1, WPRM_WOOD); L.add('wBowLimb', lu, WT1, WPRM_WOOD); L.add('wBowLimb', ll, WT1, WPRM_WOOD);
  L.add('wString', su, WT_STR, WPRM_STR); L.add('wString', sl, WT_STR, WPRM_STR);
  L.add('wBowGlow', G, [0.5, 1, 1, 1.2], [0.2, 0, 0, 0]);
  if (arrowM) L.add('wArrow', arrowM, WT1, WPRM_WOOD);
}
function wpnDrawHero(L, t) {
  const Z = WPN.pz, cur = WPN.cur, A = WPN.a;
  if (WPN.slots[3] && rig.skin) {
    const s0 = rig.skin[0], M = wpnM(); M4.mul(m4RT(s0.M, s0.t), WPN_QUIVER, M);
    L.add('wQuiver', M, WT1, WPRM_WOOD);
    const n = Math.min(WPN.arrows - (WPN.bow.drawing ? 1 : 0), 5);
    for (let i = 0; i < n; i++) { const Q = wpnM(); M4.mul(M, WPN_QARROWS[i], Q); L.add('wArrow', Q, WT1, WPRM_WOOD); }
  }
  if (cur === 'sword') return;
  if (cur === 'bow') { wpnDrawBow(L, WPN.bowM, WPN.limbU, WPN.limbL, WPN.strU, WPN.strL, WPN.bow.drawing && Z.mode === 'aim' ? WPN.nockM : null); return; }
  const d = WPN_DEF[cur], M = Z.mode === 'hand' ? WPN.handM : WPN.backM;
  L.add(d.mesh, M, WT1, d.prm);
  if (d.glow) {
    let g = 0.7;
    if (A.charging) g = A.ready ? 3.2 + Math.sin(t * 40) : 0.7 + A.charge * 3.5;
    else if (A.kind === 'hmS' || A.kind === 'sp3' || A.kind === 'spF') g = 2.4 * (1 - clamp(A.t / A.dur, 0, 1)) + 0.7;
    L.add(d.glow, M, [0.45, 1, 1, g], [0.2, 0, 0, 0]);
  }
}
function wpnPickupM(k, M) {
  const c = Math.cos(k.yaw), s = Math.sin(k.yaw), q = k.p;
  if (k.kind === 'spear') { const d = V.norm([0.18 * c + 0.08 * s, 1, -0.18 * s + 0.08 * c]); return wpnBasisS(M, q[0] + d[0] * 0.47, q[1] + d[1] * 0.47, q[2] + d[2] * 0.47, d[0], d[1], d[2], c, 0, -s); }
  if (k.kind === 'hammer') { const d = V.norm([0.3 * c + 0.1 * s, -0.95, -0.3 * s + 0.1 * c]); return wpnBasisS(M, q[0] - d[0] * 0.72, q[1] + 0.085 - d[1] * 0.72, q[2] - d[2] * 0.72, d[0], d[1], d[2], c, 0, -s); }
  if (k.kind === 'club') {
    const r = k.rest ? 0 : k.roll, cr = Math.cos(r), sr = Math.sin(r);
    const dx = s * cr, dy = k.rest ? -0.1 : sr, dz = c * cr, l = Math.hypot(dx, dy, dz), y0 = k.rest ? 0.085 : 0.0;
    return wpnBasisS(M, q[0] - dx / l * 0.56, q[1] + y0 - dy / l * 0.56, q[2] - dz / l * 0.56, dx / l, dy / l, dz / l, 0, 1, 0);
  }
  // bow lying flat
  return wpnBasisS(M, q[0], q[1] + 0.03, q[2], s, 0, c, c, 0, -s);
}
function wpnDrawWorld(L, t) {
  WPN.pn = 0;
  for (const k of WPN.pickups) {
    if (Math.abs(k.p[0] - player.pos[0]) > 80 || Math.abs(k.p[2] - player.pos[2]) > 80) continue;
    const fade = k.life < 1e8 && k.t > k.life - 3 && Math.floor(t * 10) % 2 === 0;
    if (fade) continue;
    if (k.kind === 'arrows') {
      for (let i = 0; i < 3; i++) { const M = wpnM(), a = k.yaw + (i - 1) * 0.12; wpnBasisS(M, k.p[0] - Math.sin(a) * 0.36 + (i - 1) * 0.02, k.p[1] + 0.02 + (i === 1 ? 0.008 : 0), k.p[2] - Math.cos(a) * 0.36, Math.sin(a), 0, Math.cos(a), 0, 1, 0); L.add('wArrow', M, WT1, WPRM_WOOD); }
      continue;
    }
    const M = wpnPickupM(k, wpnM());
    if (k.kind === 'bow') { const lu = wpnM(), ll = wpnM(), su = wpnM(), sl = wpnM(); wpnBowParts(M, 0, null, lu, ll, su, sl, 0); wpnDrawBow(L, M, lu, ll, su, sl, null); continue; }
    const d = WPN_DEF[k.kind];
    L.add(d.mesh, M, WT1, d.prm);
    if (d.glow) L.add(d.glow, M, [0.45, 1, 1, 0.8 + 0.4 * Math.sin(t * 3)], [0.2, 0, 0, 0]);
  }
  for (const a of WPN.arr) {
    if (!a.s) continue;
    let px = a.p[0], py = a.p[1], pz = a.p[2], dx = a.d[0], dy = a.d[1], dz = a.d[2];
    if (a.s === 3 && a.foe) {
      const f = a.foe, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      px = f.pos[0] + a.lo[0] * c + a.lo[2] * s; py = f.pos[1] + a.lo[1]; pz = f.pos[2] - a.lo[0] * s + a.lo[2] * c;
      dx = a.ld[0] * c + a.ld[2] * s; dy = a.ld[1]; dz = -a.ld[0] * s + a.ld[2] * c;
    }
    if (Math.abs(px - player.pos[0]) > 90 || Math.abs(pz - player.pos[2]) > 90) continue;
    const M = wpnM();
    wpnBasisS(M, px - dx * 0.78, py - dy * 0.78, pz - dz * 0.78, dx, dy, dz, 0, 1, 0);
    L.add('wArrow', M, a.fire ? [1.4, 0.9, 0.6, 0.6] : WT1, WPRM_WOOD);
  }
}

// ============================================================
//  Camera: over-the-shoulder zoom while drawing the bow, aim ray
// ============================================================
function wpnAimCam() {
  const K = WPN.camK, k = K * K * (3 - 2 * K), p = player;
  const yaw = cam.yaw, pit = lerp(cam.pitch, WPN.aimPitch, k);
  const cp = Math.cos(pit), dx = Math.sin(yaw) * cp, dy = Math.sin(pit), dz = Math.cos(yaw) * cp, rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const sx = p.pos[0] + rx * 0.72, sy = p.pos[1] + 1.55, sz = p.pos[2] + rz * 0.72;
  let d = 2.45;
  for (let i = 1; i <= 6; i++) { const t = i / 6 * d; if (sy + dy * t < heightAt(sx + dx * t, sz + dz * t) + 0.3) { d = Math.max(0.6, t - 0.3); break; } }
  const px = sx + dx * d, pz = sz + dz * d, py = Math.max(sy + dy * d, heightAt(px, pz) + 0.3, WORLD.water + 0.3);
  cam.target = [lerp(cam.target[0], sx, k), lerp(cam.target[1], sy, k), lerp(cam.target[2], sz, k)];
  cam.pos = [lerp(cam.pos[0], px, k), lerp(cam.pos[1], py, k), lerp(cam.pos[2], pz, k)];
  cam.curFov = lerp(cam.curFov, 40 - 6 * WPN.bow.draw, k);
}
function wpnAimRay() {
  const o = cam.pos, dir = V.norm(V.sub(cam.target, cam.pos));
  WPN.aimDir = dir;
  let hitT = 80; WPN.aimFoe = null;
  for (let t = 1.2; t < 80; t += 0.6) { if (o[1] + dir[1] * t < heightAt(o[0] + dir[0] * t, o[2] + dir[2] * t)) { hitT = t - 0.3; break; } }
  for (const f of foes) {
    if (!f.alive) continue;
    const cx = f.pos[0] - o[0], cy = f.pos[1] + 0.65 - o[1], cz = f.pos[2] - o[2], t = cx * dir[0] + cy * dir[1] + cz * dir[2];
    if (t <= 0 || t > hitT) continue;
    const qx = cx - dir[0] * t, qy = cy - dir[1] * t, qz = cz - dir[2] * t;
    if (qx * qx + qy * qy + qz * qz < 0.36) { hitT = t; WPN.aimFoe = f; }
  }
  WPN.aimPt = [o[0] + dir[0] * hitT, o[1] + dir[1] * hitT, o[2] + dir[2] * hitT];
}

// ============================================================
//  Sound: built on the shared synthesiser
// ============================================================
function wpnSfx(n, k = 0) {
  switch (n) {
    case 'equip':
      if (k === 'bow') { tone('triangle', 330, 280, 0.08, 0.05); noise(0.12, 0.05, 1400, 'bandpass', 0.02, 2); }
      else if (k === 'hammer' || k === 'club') { tone('square', 140, 110, 0.1, 0.05); noise(0.18, 0.08, 600, 'bandpass', 0, 1); }
      else { tone('triangle', 1500, 2100, 0.1, 0.05); noise(0.16, 0.05, 4800, 'highpass', 0.02); }
      tone('sine', 880, 1320, 0.1, 0.03, 0.06); break;
    case 'thrust': noise(0.12, 0.13, 3000 - k * 300, 'bandpass', 0, 2.2); tone('sine', 1100 - k * 100, 420, 0.1, 0.035); break;
    case 'windup': noise(0.25, 0.04, 300, 'lowpass'); break;
    case 'heavySwing': noise(0.38, 0.17, 420 + k * 80, 'bandpass', 0, 0.9); tone('sawtooth', 110, 55, 0.32, 0.035); break;
    case 'heavyHit': tone('sine', 150, 42, 0.32, 0.32); noise(0.22, 0.26, 380, 'lowpass'); tone('square', 220, 70, 0.1, 0.07); noise(0.1, 0.1, 2400, 'bandpass', 0, 2); break;
    case 'pierce': noise(0.07, 0.14, 2600, 'bandpass', 0, 2.5); tone('triangle', 700, 260, 0.08, 0.06); break;
    case 'slam': tone('sine', 85, 28, 0.8, 0.5); noise(0.7, 0.34, 240, 'lowpass'); noise(0.35, 0.14, 1600, 'bandpass', 0.03, 0.8); tone('triangle', 55, 35, 0.6, 0.22, 0.04); break;
    case 'draw': tone('triangle', 170, 250, 0.55, 0.035, 0, 0.25); noise(0.5, 0.025, 1100, 'bandpass', 0, 4); break;
    case 'full': tone('sine', 1500, 1500, 0.12, 0.035); tone('sine', 2250, 2250, 0.18, 0.02, 0.04); break;
    case 'twang': tone('triangle', 520 + k * 80, 170, 0.2, 0.12); tone('sine', 120, 85, 0.26, 0.1); noise(0.14, 0.07, 2600, 'highpass'); noise(0.35, 0.05, 1800, 'bandpass', 0.03, 2); break;
    case 'thunk': tone('square', 240 + k * 60, 80, 0.07, 0.06); noise(0.07, 0.1, 800, 'bandpass', 0, 1.5); break;
    case 'arrowHit': noise(0.08, 0.15, 1300, 'bandpass', 0, 1.6); tone('sine', 280, 120, 0.1, 0.08); break;
    case 'pick': tone('sine', 880, 1320, 0.07, 0.05); tone('triangle', 1760, 1760, 0.06, 0.02, 0.04); break;
    case 'get': [0, 4, 7, 12].forEach((s, i) => tone('triangle', 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.32, 0.08, i * 0.09)); tone('sine', 1568, 1568, 0.6, 0.05, 0.36); break;
    case 'empty': tone('square', 190, 170, 0.06, 0.04); tone('square', 150, 140, 0.06, 0.03, 0.07); break;
  }
}

// ============================================================
//  HUD: weapon selector (gold on dark, Cinzel), mini indicator, bow reticle, touch button
// ============================================================
const WPN_ICON = {
  sword: '<path d="M40.5 6.5 L41.5 13 L22 32.5 L16.5 27 L36 7.5 Z" class="f"/><path d="M38 10 L20 28"/><path d="M11.5 25.5 L23.5 37.5"/><path d="M17.5 31.5 L9 40"/><circle cx="7.6" cy="41.4" r="2.2"/>',
  spear: '<path d="M6 42 L31 17"/><path d="M31 17 C31.5 11 36 7 43 5 C41 12 37 16.5 31 17 Z" class="f"/><path d="M27.5 20.5 L24 24 M29 23 L27 30 M25 19 L18 21"/><path d="M8.5 36.5 L11.5 39.5 M13 32 L16 35"/>',
  hammer: '<path d="M8 41 L28 21"/><path d="M19 13.5 L30.5 2 L46 17.5 L34.5 29 Z" class="f"/><path d="M24.5 8 L40 23.5"/><circle cx="32.5" cy="15.5" r="3"/><path d="M8 41 L5.5 43.5"/>',
  club: '<path d="M8 41 L22 27"/><path d="M19 24 C16 14 24 5 33 6 C42 7 45 16 40 23 C35 30 26 31 19 24 Z" class="f"/><path d="M27 9 l-2 -4 M37 10 l3 -3 M42 19 l4 1 M34 27 l2 4 M24 17 l-4 1"/><path d="M11 36 l3 3 M14 33 l3 3"/>',
  bow: '<path d="M13 5 C33 12 33 36 13 43" class="f"/><path d="M13 5 L13 43"/><path d="M6 24 L41 24"/><path d="M41 24 L35.5 20.5 M41 24 L35.5 27.5"/><path d="M6 24 l-2.5 -3 M6 24 l-2.5 3 M9 24 l-2.5 -3 M9 24 l-2.5 3"/>',
};
const wpnSvg = (k) => `<svg viewBox="0 0 48 48" aria-hidden="true">${WPN_ICON[k] || ''}</svg>`;
function wpnHudInit() {
  if (document.getElementById('wsel')) return;
  const css = document.createElement('style');
  css.textContent = `
#wsel{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);transform:translate(-50%,14px);display:flex;flex-direction:column;align-items:center;gap:9px;opacity:0;transition:opacity .35s ease,transform .35s ease;pointer-events:none;z-index:6}
#wsel.on{opacity:1;transform:translate(-50%,0)}
#wsel .row{display:flex;gap:12px;align-items:center;padding:12px 22px;background:linear-gradient(180deg,rgba(14,16,30,.84),rgba(6,7,16,.7));border:1px solid rgba(230,194,122,.5);border-radius:2px;box-shadow:0 10px 34px rgba(0,0,0,.5),inset 0 0 0 3px rgba(6,7,16,.55),inset 0 0 0 4px rgba(230,194,122,.16);position:relative;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#wsel .row::before,#wsel .row::after{content:"";position:absolute;top:50%;width:9px;height:9px;margin-top:-5px;background:#e6c27a;transform:rotate(45deg);box-shadow:0 0 10px rgba(230,194,122,.7)}
#wsel .row::before{left:-5px}#wsel .row::after{right:-5px}
#wsel .ws{position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(230,194,122,.3);background:radial-gradient(circle at 50% 40%,rgba(255,236,190,.07),rgba(0,0,0,0) 70%);color:rgba(230,194,122,.75);transition:transform .25s ease,border-color .25s,box-shadow .25s,color .25s;border-radius:2px}
#wsel .ws svg{width:38px;height:38px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
#wsel .ws svg .f{fill:rgba(230,194,122,.18)}
#wsel .ws.sel{transform:translateY(-4px) scale(1.14);border-color:#e6c27a;color:#fff3d0;background:radial-gradient(circle at 50% 38%,rgba(255,214,130,.32),rgba(60,40,10,.25) 75%);box-shadow:0 0 18px rgba(230,194,122,.55),inset 0 0 12px rgba(255,214,130,.25)}
#wsel .ws.sel svg .f{fill:rgba(255,226,160,.4)}
#wsel .ws.off{color:rgba(230,194,122,.22);border-style:dashed}
#wsel .ws.off svg{opacity:.28}
#wsel .ws i{position:absolute;left:3px;top:1px;font:700 10px 'Cinzel',serif;font-style:normal;color:rgba(251,241,218,.6)}
#wsel .ws b{position:absolute;right:3px;bottom:1px;font:700 11px 'Cinzel',serif;color:#fbf1da;text-shadow:0 1px 2px #000}
#wsel .nm{font-family:'Cinzel',serif;font-weight:700;letter-spacing:.24em;font-size:14px;color:#fbf1da;text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,.85);margin-left:.24em}
#wsel .nm::after{content:"";display:block;width:180px;height:1px;margin:6px auto 0;background:linear-gradient(90deg,transparent,#e6c27a,transparent)}
.wmini{padding:4px 12px 4px 6px!important;gap:6px!important}
.wmini svg{width:24px;height:24px;fill:none;stroke:#e6c27a;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.wmini svg .f{fill:rgba(230,194,122,.25)}
.wmini span{font-family:'Cinzel',serif;font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-dim)}
.wmini b{font-size:17px!important}
#wret{position:fixed;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;pointer-events:none;z-index:5;opacity:0;transition:opacity .2s;--k:0}
#wret.on{opacity:1}
#wret svg{width:100%;height:100%;overflow:visible;fill:none;stroke:#f5e0a8;stroke-width:1.6;filter:drop-shadow(0 0 2px rgba(0,0,0,.9))}
#wret .tk{transform-origin:22px 22px;transform:scale(calc(1.5 - var(--k) * .6))}
#wret.foe svg{stroke:#ff7a5c}
#wret.full circle{stroke:#fff;stroke-width:2}
#wtb{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(222px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:50%;border:2px solid rgba(230,194,122,.75);background:rgba(14,16,30,.55);color:#f5e0a8;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;padding:0}
#wtb svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
#wtb svg .f{fill:rgba(230,194,122,.25)}
#wtb.on{background:#e6c27a;color:#1a1204}
@media (max-width:720px){#wsel{bottom:calc(env(safe-area-inset-bottom,0px) + 250px)}#wsel .ws{width:44px;height:44px}#wsel .ws svg{width:30px;height:30px}#wsel .row{gap:8px;padding:10px 14px}}
`;
  document.head.appendChild(css);
  const sel = document.createElement('div');
  sel.id = 'wsel'; sel.setAttribute('aria-live', 'polite');
  sel.innerHTML = '<div class="row">' + [0, 1, 2, 3].map(i => `<div class="ws" data-i="${i}"><i>${i + 1}</i></div>`).join('') + '</div><div class="nm"></div>';
  document.body.appendChild(sel);
  const ret = document.createElement('div');
  ret.id = 'wret';
  ret.innerHTML = '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="3"/><g class="tk"><path d="M22 6 L22 13 M22 31 L22 38 M6 22 L13 22 M31 22 L38 22"/></g></svg>';
  document.body.appendChild(ret);
  const hl = document.querySelector('.hud-l');
  if (hl) { const m = document.createElement('div'); m.className = 'counter wmini'; m.id = 'wmini'; m.setAttribute('aria-label', 'Arma'); hl.appendChild(m); }
  const touch = document.getElementById('touch');
  if (touch) {
    const b = document.createElement('button');
    b.id = 'wtb'; b.setAttribute('aria-label', 'Cambiar de arma');
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); if (state.mode === 'play') wpnCycle(1); });
    const up = () => b.classList.remove('on');
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    touch.appendChild(b);
  }
  // controls in the pause menu
  const add = (id, dt, dd) => { const dl = document.getElementById(id); if (!dl) return; const a = document.createElement('dt'), b = document.createElement('dd'); a.innerHTML = dt; b.textContent = dd; dl.appendChild(a); dl.appendChild(b); };
  add('ctlKb', '<kbd>1</kbd>–<kbd>4</kbd> / <kbd>Tab</kbd>', 'Armas: espada, lanza, martillo, arco (mantén ataque para tensar, suelta para disparar)');
  add('ctlPad', 'Cruceta ◀ ▶', 'Cambiar de arma · con el arco, mantén X para tensar');
  add('ctlTouch', 'Arma', 'Botón dorado: cambiar de arma · con el arco, mantén el botón de ataque');
  wpnHud(); wpnTouchLabel();
}
function wpnHud() {
  const sel = document.getElementById('wsel');
  if (!sel) return;
  const cs = WPN_DEF[WPN.cur].slot;
  sel.querySelectorAll('.ws').forEach((el) => {
    const i = +el.dataset.i, k = WPN.slots[i] || ['sword', 'spear', 'hammer', 'bow'][i];
    const key = `${k}|${!!WPN.slots[i]}|${i === cs}|${i === 3 ? WPN.arrows : ''}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.className = 'ws' + (WPN.slots[i] ? '' : ' off') + (i === cs ? ' sel' : '');
    el.innerHTML = `<i>${i + 1}</i>` + wpnSvg(k) + (i === 3 && WPN.slots[3] ? `<b>${WPN.arrows}</b>` : '');
  });
  const nm = sel.querySelector('.nm'), txt = WPN_DEF[WPN.cur].name;
  if (nm.textContent !== txt) nm.textContent = txt;
  const mini = document.getElementById('wmini');
  if (mini) {
    const key = WPN.cur + '|' + WPN.arrows;
    if (mini.dataset.key !== key) { mini.dataset.key = key; mini.innerHTML = wpnSvg(WPN.cur) + (WPN.cur === 'bow' ? `<b>${WPN.arrows}</b>` : `<span>${WPN_DEF[WPN.cur].short}</span>`); }
  }
}
function wpnHudShow(slot) {
  const sel = document.getElementById('wsel');
  if (!sel) return;
  wpnHud();
  if (slot !== WPN_DEF[WPN.cur].slot) { const nm = sel.querySelector('.nm'); nm.textContent = WPN.slots[slot] ? WPN_DEF[WPN.slots[slot]].name : 'Por descubrir'; }
  sel.classList.add('on'); WPN.hudT = 1.7;
}
function wpnTouchLabel() {
  const b = document.querySelector('#touch .tb.punch');
  if (b) b.textContent = WPN_DEF[WPN.cur].short;
  const w = document.getElementById('wtb');
  if (w) { const k = 'k' + WPN.cur; if (w.dataset.k !== k) { w.dataset.k = k; w.innerHTML = wpnSvg(WPN.cur); } }
}
function wpnHudFrame(dt) {
  if (WPN.hudT > 0 && (WPN.hudT -= dt) <= 0) { const s = document.getElementById('wsel'); if (s) s.classList.remove('on'); }
  const ret = document.getElementById('wret');
  if (ret) {
    const on = state.mode === 'play' && WPN.aiming && WPN.camK > 0.5;
    if (ret.classList.contains('on') !== on) ret.classList.toggle('on', on);
    if (on) {
      ret.style.setProperty('--k', WPN.bow.drawing ? WPN.bow.draw.toFixed(2) : '0');
      const foe = !!WPN.aimFoe, full = WPN.bow.full;
      if (ret.classList.contains('foe') !== foe) ret.classList.toggle('foe', foe);
      if (ret.classList.contains('full') !== full) ret.classList.toggle('full', full);
    }
  }
}

// ============================================================
//  Hooks: wrap the core functions (no edits to shared files)
// ============================================================
{
  const _buildHeroProps = buildHeroProps;
  buildHeroProps = function (M) { _buildHeroProps(M); buildWeaponMeshes(M); };

  const _playerStep = playerStep;
  playerStep = function (dt, inp) {
    if (!WPN.seeded && WORLD.solids) wpnSeed();
    if (WPN.cur === 'sword' || state.mode !== 'play') _playerStep(dt, inp);
    else {
      const pp = inp.punchP, ph = inp.punchHeld;
      inp.punchP = false; inp.punchHeld = false;
      wpnBefore(dt, inp, pp, ph);
      const y0 = player.yaw;
      _playerStep(dt, inp);
      inp.punchP = pp; inp.punchHeld = ph;
      wpnAfter(dt, y0);
    }
    wpnArrowsStep(dt);
    wpnPickupsStep(dt);
  };

  const _playerState = playerState;
  playerState = function () {
    const s = _playerState();
    if (WPN.cur !== 'sword' && (WPN.a.kind || WPN.a.charging || WPN.aiming) && (s === 'idle' || s === 'run' || s === 'rise' || s === 'fall' || s === 'flip')) return 'attack';
    return s;
  };

  const _computePose = computePose;
  computePose = function (st, t) {
    if (WPN.cur === 'sword') return _computePose(st, t);
    const p = player, Z = WPN.pz, mine = st === 'attack';
    const loco = !p.onGround ? (p.vel[1] > 0 ? 'rise' : 'fall') : Math.hypot(p.vel[0], p.vel[2]) > 0.6 ? 'run' : 'idle';
    const o = _computePose(mine ? loco : st, t);
    Z.two = false; Z.mode = 'back'; Z.face[0] = 0; Z.face[1] = 0; Z.face[2] = 1;
    if (WPN.cur === 'bow') { wpnPoseBow(o, st, mine); return o; }
    if (mine) { wpnPoseAttack(o, t); Z.mode = 'hand'; }
    else if (o.sword === 'hand') { Z.mode = 'hand'; Z.two = true; }
    else if (WPN.out > 0 && st !== 'glide' && st !== 'roll' && st !== 'dash') { wpnPoseGuard(o, st, t); Z.mode = 'hand'; }
    return o;
  };

  const _updateRig = updateRig;
  updateRig = function (dt, time) { _updateRig(dt, time); if (rig.init) wpnRigPost(time); };

  const _addHero = addHero;
  addHero = function (L, t) { _addHero(L, t); wpnDrawHero(L, t); };

  const _addLife = addLife;
  addLife = function (L, t) { _addLife(L, t); wpnDrawWorld(L, t); };

  const _cameraUpdate = cameraUpdate;
  cameraUpdate = function (dt, inputCam) {
    const aim = state.mode === 'play' && WPN.aiming;
    if (aim) WPN.aimPitch = clamp(WPN.aimPitch + inputCam[1], -0.8, 1.05); else WPN.aimPitch = cam.pitch;
    _cameraUpdate(dt, inputCam);
    WPN.camK = damp(WPN.camK, aim ? 1 : 0, aim ? 9 : 6, dt);
    if (WPN.camK > 0.003 && state.mode === 'play') wpnAimCam();
    if (aim) wpnAimRay();
    wpnHudFrame(dt);
  };

  const _readInput = readInput;
  readInput = function (dt) {
    const out = _readInput(dt);
    if (state.mode === 'play') {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) {
        if (!gp) continue;
        const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), prev = WPN.padPrev[gp.index] || (WPN.padPrev[gp.index] = [false, false]);
        const l = b(14), r = b(15);
        if (l && !prev[0]) wpnCycle(-1);
        if (r && !prev[1]) wpnCycle(1);
        prev[0] = l; prev[1] = r;
      }
    }
    return out;
  };

  // goblins sometimes drop their club; heavy hits send them flying further
  const _killFoe = killFoe;
  killFoe = function (f, dir) { const was = f.alive; _killFoe(f, dir); if (was && !f.alive && Math.random() < 0.45) wpnDropClub(f); };
  const _deadPos = deadPos;
  deadPos = function (f) {
    const k = f.kmul || 1;
    if (k === 1) return _deadPos(f);
    const t = Math.min(f.deadT, 0.45), d = f.kdir || [0, 0, 1];
    return [f.pos[0] + d[0] * t * 5 * k, f.pos[1] + 0.6 + t * 4 * k - t * t * 9, f.pos[2] + d[2] * t * 5 * k];
  };
  // a downward thrust with the hammer lands as a shockwave
  const _onLand = onLand;
  onLand = function (impact) {
    const pounding = player.pound;
    _onLand(impact);
    if (pounding && (WPN.cur === 'hammer' || WPN.cur === 'club')) { WPN.a.hit.clear(); wpnSlam(WPN_ATK.hmS, player.pos, 5.6 * (WPN_DEF[WPN.cur].slamK || 1)); }
  };

  const _restartGame = restartGame;
  restartGame = function () { _restartGame(); wpnReset(); };

  addEventListener('keydown', e => {
    if (state.mode !== 'play' || e.repeat) return;
    const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
    if (m) { e.preventDefault(); wpnSelect(+m[2] - 1); }
    else if (e.code === 'Tab') { e.preventDefault(); wpnCycle(1); }
  });

  // public API for tests and other modules: window.__brio.weapons
  const api = {
    state: WPN, defs: WPN_DEF,
    get cur() { return WPN.cur; }, get slots() { return WPN.slots.slice(); }, get arrows() { return WPN.arrows; }, set arrows(v) { WPN.arrows = clamp(v | 0, 0, WPN_MAXA); wpnHud(); },
    give: (k) => wpnGive(k, true), giveAll: () => { for (const k of ['spear', 'hammer', 'bow']) wpnGive(k, true); WPN.arrows = WPN_MAXA; wpnHud(); },
    equip: (k) => { if (!WPN.slots.includes(k)) wpnGive(k, true); wpnEquip(k); }, select: wpnSelect, cycle: wpnCycle, fire: wpnFire, reset: wpnReset,
  };
  window.__brioWeapons = api;
  let bv;
  try {
    Object.defineProperty(window, '__brio', { configurable: true, get() { return bv; }, set(x) { bv = x; if (x && typeof x === 'object' && !x.weapons) x.weapons = api; } });
  } catch (_) { }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', wpnHudInit); else wpnHudInit();
}
