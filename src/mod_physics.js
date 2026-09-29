// ============================================================
//  Physics sandbox: rigid bodies, carry & throw, Mano Maestra (grab, rotate, glue, build),
//  buoyancy, and fire chemistry (burning grass, wood, explosive barrels, updrafts).
//  partG only calls physBoot(MESHES) / physStep(dt, inp) / physDraw(L, t) / physReset().
// ============================================================
const PHS = 0, PHC = 1, PHB = 2, PHY = 3;          // sphere, capsule, box, cylinder (barrel; a box for body pairs)
const PH_G = 20, PH_MARGIN = 0.03, PH_SLOP = 0.006, PH_BETA = 0.3, PH_ITER = 7, PH_PITER = 3;
const PHK = {
  crate: { type: PHB, h: [0.4, 0.4, 0.4], mass: 1.0, float: 1.9, mu: 0.65, rest: 0.12, wood: 1, lift: 1, mesh: 'phCrate' },
  crateS: { type: PHB, h: [0.27, 0.27, 0.27], mass: 0.5, float: 1.9, mu: 0.65, rest: 0.15, wood: 1, lift: 1, mesh: 'phCrateS' },
  barrel: { type: PHY, r: 0.33, hl: 0.44, mass: 1.2, float: 2.2, mu: 0.55, rest: 0.15, wood: 1, lift: 1, mesh: 'phBarrel' },
  bomb: { type: PHY, r: 0.33, hl: 0.44, mass: 1.0, float: 2.2, mu: 0.55, rest: 0.15, wood: 1, lift: 1, explosive: 1, mesh: 'phBomb' },
  boulder: { type: PHS, r: 0.85, mass: 9, float: 0.4, mu: 0.8, rest: 0.08, roll: 0.22, mesh: 'phBoulder', stone: 1 },
  rock: { type: PHS, r: 0.42, mass: 1.4, float: 0.4, mu: 0.8, rest: 0.1, roll: 0.5, lift: 1, mesh: 'phBoulder', stone: 1 },
  log: { type: PHC, r: 0.23, hl: 1.05, mass: 3, float: 1.8, mu: 0.7, rest: 0.08, roll: 0.9, wood: 1, mesh: 'phLog' },
  plank: { type: PHB, h: [0.24, 0.05, 1.25], mass: 0.8, float: 2.0, mu: 0.7, rest: 0.1, wood: 1, lift: 1, mesh: 'phPlank' },
  torch: { type: PHC, r: 0.06, hl: 0.34, mass: 0.3, float: 1.6, mu: 0.6, rest: 0.1, roll: 1.5, lift: 1, torch: 1, mesh: 'phTorch' },
};
let PH_M = 0.03;   // narrowphase margin (widened while probing for glue)
const PH = {
  bodies: [], spawns: [], later: [], scattering: false, fires: [], nextId: 1, time: 0, ready: false,
  carry: null, carryYaw: 0, throwT: 0,
  hand: { on: false, body: null, target: null, dist: 4.5, yawAdd: 0, pitchAdd: 0, qRel: [0, 0, 0, 1], glueTo: null, glueP: [0, 0, 0], glueT: 0 },
  act: {}, support: null, supportT: 0, prevPound: false, hudT: 0, hudTxt: '', padPrev: [], touchT: -1, lastSnd: 0,
  cam: [0, 0, 0], camDir: [0, 0, -1],
};

// ---------- small allocation-free math ----------
function phQ2M(q, R) {
  const x = q[0], y = q[1], z = q[2], w = q[3], x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  R[0] = 1 - (yy + zz); R[1] = xy + wz; R[2] = xz - wy;
  R[3] = xy - wz; R[4] = 1 - (xx + zz); R[5] = yz + wx;
  R[6] = xz + wy; R[7] = yz - wx; R[8] = 1 - (xx + yy);
}
function phM2Q(R, q) {
  const m00 = R[0], m10 = R[1], m20 = R[2], m01 = R[3], m11 = R[4], m21 = R[5], m02 = R[6], m12 = R[7], m22 = R[8], tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q[3] = 0.25 / s; q[0] = (m21 - m12) * s; q[1] = (m02 - m20) * s; q[2] = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q[3] = (m21 - m12) / s; q[0] = 0.25 * s; q[1] = (m01 + m10) / s; q[2] = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q[3] = (m02 - m20) / s; q[0] = (m01 + m10) / s; q[1] = 0.25 * s; q[2] = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q[3] = (m10 - m01) / s; q[0] = (m02 + m20) / s; q[1] = (m12 + m21) / s; q[2] = 0.25 * s; }
  phQNorm(q); return q;
}
function phQMul(a, b, o) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by; o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw; o[3] = aw * bw - ax * bx - ay * by - az * bz; return o;
}
function phQNorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q; }
function phQAxis(x, y, z, a, o) { const s = Math.sin(a / 2); o[0] = x * s; o[1] = y * s; o[2] = z * s; o[3] = Math.cos(a / 2); return o; }
function phMul3(A, B, o) { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o[j * 3 + i] = A[i] * B[j * 3] + A[3 + i] * B[j * 3 + 1] + A[6 + i] * B[j * 3 + 2]; return o; }
function phMul3T(A, B, o) { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o[j * 3 + i] = A[i] * B[j] + A[3 + i] * B[3 + j] + A[6 + i] * B[6 + j]; return o; }   // A * B^T
function phTMul3(A, B, o) { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o[j * 3 + i] = A[i * 3] * B[j * 3] + A[i * 3 + 1] * B[j * 3 + 1] + A[i * 3 + 2] * B[j * 3 + 2]; return o; } // A^T * B
function phInv3(m, o) {
  const a = m[0], b = m[3], c = m[6], d = m[1], e = m[4], f = m[7], g = m[2], h = m[5], k = m[8];
  const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) { o.fill(0); return o; }
  const id = 1 / det;
  o[0] = A * id; o[3] = -(b * k - c * h) * id; o[6] = (b * f - c * e) * id;
  o[1] = B * id; o[4] = (a * k - c * g) * id; o[7] = -(a * f - c * d) * id;
  o[2] = C * id; o[5] = -(a * h - b * g) * id; o[8] = (a * e - b * d) * id;
  return o;
}
// terrain normal without allocating
function phTN(x, z, o) {
  const e = WORLD.cell, hL = heightAt(x - e, z), hR = heightAt(x + e, z), hD = heightAt(x, z - e), hU = heightAt(x, z + e);
  const nx = hL - hR, ny = 2 * e, nz = hD - hU, l = Math.hypot(nx, ny, nz); o[0] = nx / l; o[1] = ny / l; o[2] = nz / l; return o;
}
const _pn = [0, 0, 0], _pa = [0, 0, 0], _pb = [0, 0, 0], _pc = [0, 0, 0], _pq = [0, 0, 0, 1], _pq2 = [0, 0, 0, 1], _pm = new Float64Array(9), _pm2 = new Float64Array(9);

// ---------- parts (shapes) and bodies ----------
function phBoxSamples(h, sp) {
  const out = [], [hx, hy, hz] = h;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(sx * hx, sy * hy, sz * hz);
  for (let ax = 0; ax < 3; ax++) { const c = [0, 0, 0]; for (const s of [-1, 1]) { c[ax] = s * h[ax]; out.push(c[0], c[1], c[2]); } }
  // interior edge points
  for (let ax = 0; ax < 3; ax++) {
    const n = Math.floor(2 * h[ax] / sp); if (n < 1) continue;
    const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) for (let k = 1; k <= n; k++) {
      const c = [0, 0, 0]; c[ax] = -h[ax] + 2 * h[ax] * k / (n + 1); c[o1] = s1 * h[o1]; c[o2] = s2 * h[o2]; out.push(c[0], c[1], c[2]);
    }
  }
  return new Float64Array(out);
}
function phMakePart(kind) {
  const K = PHK[kind];
  const s = {
    kind, K, type: K.type, r: K.r || 0, hl: K.hl || 0, h: null, mass: K.mass, mu: K.mu, rest: K.rest,
    off: [0, 0, 0], Ro: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), c: [0, 0, 0], R: new Float64Array(9), ax: [0, 1, 0], br: 0,
    probes: null, samples: null, burn: 0, fuel: 0, charred: 0, fuse: -1, M: new Float32Array(16), tint: [1, 1, 1, 0], prm: [0.8, 0.1, 0, 0],
    wood: !!K.wood, explosive: !!K.explosive, torch: !!K.torch, lit: false, wet: 0,
  };
  if (s.type === PHS) { s.br = s.r; s.probes = new Float64Array([0, 0, 0, s.r]); }
  else if (s.type === PHC) {
    s.br = s.hl + s.r; const p = [];
    for (let k = 0; k < 5; k++) p.push(0, -s.hl + 2 * s.hl * k / 4, 0, s.r);
    s.probes = new Float64Array(p); s.ns = clamp(Math.ceil(2 * s.hl / (0.9 * s.r)) + 1, 2, 10);
  } else if (s.type === PHB) {
    s.h = K.h.slice(); s.br = Math.hypot(s.h[0], s.h[1], s.h[2]); s.samples = phBoxSamples(s.h, 0.34);
    const p = []; for (let i = 0; i < s.samples.length; i += 3) p.push(s.samples[i], s.samples[i + 1], s.samples[i + 2], 0); s.probes = new Float64Array(p);
  } else {
    s.h = [s.r * 0.88, s.hl, s.r * 0.88]; s.br = Math.hypot(s.r, s.hl); s.samples = phBoxSamples(s.h, 0.34);
    const p = [];
    for (const y of [-s.hl, s.hl]) { p.push(0, y, 0, 0); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; p.push(Math.sin(a) * s.r, y, Math.cos(a) * s.r, 0); } }
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; p.push(Math.sin(a) * s.r, 0, Math.cos(a) * s.r, 0); }
    s.probes = new Float64Array(p);
  }
  s.prm = K.stone ? [0.85, 0.1, 0, 0] : [0.8, 0.12, 0, 0];
  s.fuel = s.wood ? 9 + Math.random() * 5 : 0;
  return s;
}
function phShapeInertia(s, o) {   // diagonal inertia in shape space
  const m = s.mass;
  if (s.type === PHS) { const v = 0.4 * m * s.r * s.r; o[0] = o[1] = o[2] = v; }
  else if (s.type === PHC) { const L = s.hl + 0.5 * s.r; o[1] = 0.5 * m * s.r * s.r; o[0] = o[2] = m * (3 * s.r * s.r + 4 * L * L) / 12; }
  else if (s.type === PHY) { o[1] = 0.5 * m * s.r * s.r; o[0] = o[2] = m * (3 * s.r * s.r + 4 * s.hl * s.hl) / 12; }
  else { const [x, y, z] = s.h; o[0] = m / 3 * (y * y + z * z); o[1] = m / 3 * (x * x + z * z); o[2] = m / 3 * (x * x + y * y); }
  return o;
}
function phNewBody(parts, pos, q) {
  const b = {
    id: PH.nextId++, parts, pos: pos.slice(), q: q.slice(), vel: [0, 0, 0], ang: [0, 0, 0], pv: [0, 0, 0], pw: [0, 0, 0],
    mass: 1, im: 1, IinvL: new Float64Array(9), IinvW: new Float64Array(9), R: new Float64Array(9), sleep: false, sleepT: 0, rad: 1,
    iscale: 1, float: 1, glue: [], grounded: false, wetF: 0, spawn: null, lastSnd: 0, hitT: 0, far: false,
  };
  phQ2M(b.q, b.R);
  phRebuild(b, false);
  return b;
}
// recompute mass, centre of mass (moving pos), inertia; parts keep their world placement
function phRebuild(b, fromWorld = true) {
  // callers keep every part's world cache (c, R) current before merging or splitting
  let M = 0, cx = 0, cy = 0, cz = 0, fl = 0;
  const wc = b.parts.map(s => { const c = fromWorld ? s.c.slice() : phV(b, s.off); return c; });
  const wr = b.parts.map(s => { const r = new Float64Array(9); phMul3(b.R, s.Ro, r); return r; });
  for (let i = 0; i < b.parts.length; i++) { const s = b.parts[i]; M += s.mass; cx += wc[i][0] * s.mass; cy += wc[i][1] * s.mass; cz += wc[i][2] * s.mass; fl += s.K.float * s.mass; }
  const glueW = b.glue.map(g => phV(b, g));
  b.pos = [cx / M, cy / M, cz / M]; b.mass = M; b.im = 1 / M; b.float = fl / M;
  const I = new Float64Array(9), d = [0, 0, 0], tmp = new Float64Array(9), tmp2 = new Float64Array(9), D = new Float64Array(9);
  let rad = 0;
  for (let i = 0; i < b.parts.length; i++) {
    const s = b.parts[i];
    // local offset and rotation relative to the body frame
    const dw = [wc[i][0] - b.pos[0], wc[i][1] - b.pos[1], wc[i][2] - b.pos[2]];
    s.off = [b.R[0] * dw[0] + b.R[1] * dw[1] + b.R[2] * dw[2], b.R[3] * dw[0] + b.R[4] * dw[1] + b.R[5] * dw[2], b.R[6] * dw[0] + b.R[7] * dw[1] + b.R[8] * dw[2]];
    phTMul3(b.R, wr[i], s.Ro);
    phShapeInertia(s, d); D.fill(0); D[0] = d[0]; D[4] = d[1]; D[8] = d[2];
    phMul3(s.Ro, D, tmp); phMul3T(tmp, s.Ro, tmp2);
    const o = s.off, oo = o[0] * o[0] + o[1] * o[1] + o[2] * o[2];
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) I[j * 3 + k] += tmp2[j * 3 + k] + s.mass * ((j === k ? oo : 0) - o[j] * o[k]);
    rad = Math.max(rad, Math.hypot(o[0], o[1], o[2]) + s.br);
  }
  phInv3(I, b.IinvL);
  b.rad = rad;
  b.glue = glueW.map(g => phLocal(b, g));
  phUpdateBody(b);
}
function phV(b, l) { const R = b.R; return [b.pos[0] + R[0] * l[0] + R[3] * l[1] + R[6] * l[2], b.pos[1] + R[1] * l[0] + R[4] * l[1] + R[7] * l[2], b.pos[2] + R[2] * l[0] + R[5] * l[1] + R[8] * l[2]]; }
function phLocal(b, w) { const R = b.R, d0 = w[0] - b.pos[0], d1 = w[1] - b.pos[1], d2 = w[2] - b.pos[2]; return [R[0] * d0 + R[1] * d1 + R[2] * d2, R[3] * d0 + R[4] * d1 + R[5] * d2, R[6] * d0 + R[7] * d1 + R[8] * d2]; }
function phUpdateBody(b) {
  phQ2M(b.q, b.R);
  phMul3(b.R, b.IinvL, _pm); phMul3T(_pm, b.R, b.IinvW);
  const R = b.R, p = b.pos;
  for (const s of b.parts) {
    const o = s.off;
    s.c[0] = p[0] + R[0] * o[0] + R[3] * o[1] + R[6] * o[2]; s.c[1] = p[1] + R[1] * o[0] + R[4] * o[1] + R[7] * o[2]; s.c[2] = p[2] + R[2] * o[0] + R[5] * o[1] + R[8] * o[2];
    phMul3(R, s.Ro, s.R);
    s.ax[0] = s.R[3]; s.ax[1] = s.R[4]; s.ax[2] = s.R[5];
  }
}
function phSpawn(kind, pos, yaw = 0, tilt = null, sleep = true) {
  const s = phMakePart(kind), q = phQAxis(0, 1, 0, yaw, [0, 0, 0, 1]);
  if (tilt) phQMul(q, phQAxis(tilt[0], tilt[1], tilt[2], tilt[3], [0, 0, 0, 1]), q);
  const b = phNewBody([s], pos, q);
  b.sleep = sleep; b.spawn = { kind, pos: pos.slice(), q: q.slice() };
  PH.bodies.push(b);
  if (PH.scattering) PH.spawns.push(b.spawn);
  return b;
}
function phWake(b) { if (b && b.sleep) { b.sleep = false; b.sleepT = 0; } }
function phWakeNear(p, r, except = null) {
  for (const b of PH.bodies) if (b !== except && b.sleep) { const dx = b.pos[0] - p[0], dy = b.pos[1] - p[1], dz = b.pos[2] - p[2]; if (dx * dx + dy * dy + dz * dz < (r + b.rad) * (r + b.rad)) phWake(b); }
}
function phRemoveBody(b) {
  const i = PH.bodies.indexOf(b); if (i >= 0) PH.bodies.splice(i, 1);
  if (PH.carry === b) PH.carry = null;
  if (PH.hand.body === b) PH.hand.body = null;
  if (PH.hand.glueTo === b) PH.hand.glueTo = null;
  if (PH.support === b) PH.support = null;
  phWakeNear(b.pos, b.rad + 0.5);
}
function phRemovePart(b, s) {
  if (b.parts.length <= 1) { phRemoveBody(b); return; }
  phUpdateBody(b);
  b.parts.splice(b.parts.indexOf(s), 1);
  b.glue = b.glue.filter(g => { const w = phV(b, g); return Math.hypot(w[0] - s.c[0], w[1] - s.c[1], w[2] - s.c[2]) > s.br * 0.9; });
  phRebuild(b); phWake(b);
}
// velocity of a world point riding on body b
function phPointVel(b, px, py, pz, o) {
  const rx = px - b.pos[0], ry = py - b.pos[1], rz = pz - b.pos[2], w = b.ang;
  o[0] = b.vel[0] + w[1] * rz - w[2] * ry; o[1] = b.vel[1] + w[2] * rx - w[0] * rz; o[2] = b.vel[2] + w[0] * ry - w[1] * rx; return o;
}
function phImpulse(b, px, py, pz, jx, jy, jz) {
  if (b.sleep) phWake(b);
  const k = b.iscale;
  b.vel[0] += jx * b.im * k; b.vel[1] += jy * b.im * k; b.vel[2] += jz * b.im * k;
  const rx = px - b.pos[0], ry = py - b.pos[1], rz = pz - b.pos[2], tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx, I = b.IinvW;
  b.ang[0] += (I[0] * tx + I[3] * ty + I[6] * tz) * k; b.ang[1] += (I[1] * tx + I[4] * ty + I[7] * tz) * k; b.ang[2] += (I[2] * tx + I[5] * ty + I[8] * tz) * k;
}

// ---------- static obstacles (trees, rocks, pillars, shrine plaza, props) in a coarse grid ----------
const PH_SG = { cell: 8, n: 25, cells: null, moving: [] };
function phBuildSolidGrid() {
  const n = PH_SG.n, cells = []; for (let i = 0; i < n * n; i++) cells.push([]);
  PH_SG.moving = [];
  for (const s of WORLD.solids) {
    if (s.kind === 'canopy') continue;
    if (s.kind === 'island') { PH_SG.moving.push(s); continue; }
    const r = s.r + 1;
    const i0 = clamp(Math.floor((s.x - r + 100) / PH_SG.cell), 0, n - 1), i1 = clamp(Math.floor((s.x + r + 100) / PH_SG.cell), 0, n - 1);
    const j0 = clamp(Math.floor((s.z - r + 100) / PH_SG.cell), 0, n - 1), j1 = clamp(Math.floor((s.z + r + 100) / PH_SG.cell), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * n + i].push(s);
  }
  PH_SG.cells = cells;
}
const _phSolidList = [];
function phSolidsNear(x, z, r) {
  const L = _phSolidList; L.length = 0;
  const n = PH_SG.n, c = PH_SG.cell;
  const i0 = clamp(Math.floor((x - r + 100) / c), 0, n - 1), i1 = clamp(Math.floor((x + r + 100) / c), 0, n - 1);
  const j0 = clamp(Math.floor((z - r + 100) / c), 0, n - 1), j1 = clamp(Math.floor((z + r + 100) / c), 0, n - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const s of PH_SG.cells[j * n + i]) if (L.indexOf(s) < 0) L.push(s);
  for (const s of PH_SG.moving) L.push(s);
  return L;
}

// ---------- contacts ----------
const PH_MAXC = 2400, PHCT = [];
for (let i = 0; i < PH_MAXC; i++) PHCT.push({ a: null, b: null, p: [0, 0, 0], n: [0, 0, 0], d: 0, ra: [0, 0, 0], rb: [0, 0, 0], kn: 0, t1: [0, 0, 0], t2: [0, 0, 0], k1: 0, k2: 0, ln: 0, l1: 0, l2: 0, lp: 0, tgt: 0, ptgt: 0, mu: 0, pa: null, pb: null });
let PH_NC = 0;
function phAddC(A, B, px, py, pz, nx, ny, nz, d, pa, pb, mu) {
  if (PH_NC >= PH_MAXC) return;
  const c = PHCT[PH_NC++];
  c.a = A; c.b = B; c.p[0] = px; c.p[1] = py; c.p[2] = pz; c.n[0] = nx; c.n[1] = ny; c.n[2] = nz; c.d = d; c.pa = pa; c.pb = pb;
  c.mu = mu; c.ln = c.l1 = c.l2 = c.lp = 0;
  if (ny > 0.5) A.grounded = true;
  if (B && ny < -0.5) B.grounded = true;
}
// sphere (centre c, radius r) against a part: returns depth (> -margin when touching), sets n (part -> sphere) and p (on part surface)
const _sp = { n: [0, 0, 0], p: [0, 0, 0] };
function phSpherePart(cx, cy, cz, r, s, out) {
  if (s.type === PHS || s.type === PHC) {
    let qx = s.c[0], qy = s.c[1], qz = s.c[2];
    if (s.type === PHC) {
      const ax = s.ax, t = clamp((cx - qx) * ax[0] + (cy - qy) * ax[1] + (cz - qz) * ax[2], -s.hl, s.hl);
      qx += ax[0] * t; qy += ax[1] * t; qz += ax[2] * t;
    }
    let dx = cx - qx, dy = cy - qy, dz = cz - qz, dl = Math.hypot(dx, dy, dz);
    if (dl < 1e-6) { dx = 0; dy = 1; dz = 0; dl = 1; }
    dx /= dl; dy /= dl; dz /= dl;
    out.n[0] = dx; out.n[1] = dy; out.n[2] = dz;
    out.p[0] = qx + dx * s.r; out.p[1] = qy + dy * s.r; out.p[2] = qz + dz * s.r;
    return r + s.r - dl;
  }
  // oriented box
  const R = s.R, h = s.h, dx = cx - s.c[0], dy = cy - s.c[1], dz = cz - s.c[2];
  const lx = R[0] * dx + R[1] * dy + R[2] * dz, ly = R[3] * dx + R[4] * dy + R[5] * dz, lz = R[6] * dx + R[7] * dy + R[8] * dz;
  const qx = clamp(lx, -h[0], h[0]), qy = clamp(ly, -h[1], h[1]), qz = clamp(lz, -h[2], h[2]);
  let nlx, nly, nlz, depth, px = qx, py = qy, pz = qz;
  if (qx === lx && qy === ly && qz === lz) {
    // centre inside: leave through the nearest face
    const ex = h[0] - Math.abs(lx), ey = h[1] - Math.abs(ly), ez = h[2] - Math.abs(lz);
    nlx = nly = nlz = 0;
    if (ex <= ey && ex <= ez) { nlx = lx < 0 ? -1 : 1; depth = r + ex; px = nlx * h[0]; }
    else if (ey <= ez) { nly = ly < 0 ? -1 : 1; depth = r + ey; py = nly * h[1]; }
    else { nlz = lz < 0 ? -1 : 1; depth = r + ez; pz = nlz * h[2]; }
  } else {
    const ox = lx - qx, oy = ly - qy, oz = lz - qz, ol = Math.hypot(ox, oy, oz);
    nlx = ox / ol; nly = oy / ol; nlz = oz / ol; depth = r - ol;
  }
  out.n[0] = R[0] * nlx + R[3] * nly + R[6] * nlz; out.n[1] = R[1] * nlx + R[4] * nly + R[7] * nlz; out.n[2] = R[2] * nlx + R[5] * nly + R[8] * nlz;
  out.p[0] = s.c[0] + R[0] * px + R[3] * py + R[6] * pz; out.p[1] = s.c[1] + R[1] * px + R[4] * py + R[7] * pz; out.p[2] = s.c[2] + R[2] * px + R[5] * py + R[8] * pz;
  return depth;
}
function phMu(a, b) { return Math.sqrt(a * b); }
// sphere of part sa (on body A) vs part sb (on body B); flip: A is the "other" side
function phSphereVs(A, sa, cx, cy, cz, r, B, sb) {
  const d = phSpherePart(cx, cy, cz, r, sb, _sp);
  if (d < -PH_M) return;
  const n = _sp.n, p = _sp.p, mu = phMu(sa.mu, sb.mu);
  phAddC(A, B, p[0] + n[0] * d * 0.5, p[1] + n[1] * d * 0.5, p[2] + n[2] * d * 0.5, n[0], n[1], n[2], d, sa, sb, mu);
}
function phCapsuleVs(A, sa, B, sb) {
  const n = sa.ns, c = sa.c, ax = sa.ax;
  for (let k = 0; k < n; k++) {
    const t = -sa.hl + 2 * sa.hl * k / (n - 1);
    phSphereVs(A, sa, c[0] + ax[0] * t, c[1] + ax[1] * t, c[2] + ax[2] * t, sa.r, B, sb);
  }
}
const _bbT = [0, 0, 0], _bbL = [0, 0, 0], _bbRm = new Float64Array(9), _bbAr = new Float64Array(9);
function phBoxBox(A, sa, B, sb) {
  const RA = sa.R, RB = sb.R, hA = sa.h, hB = sb.h;
  const Tx = sb.c[0] - sa.c[0], Ty = sb.c[1] - sa.c[1], Tz = sb.c[2] - sa.c[2];
  const Rm = _bbRm, Ar = _bbAr;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const v = RA[i * 3] * RB[j * 3] + RA[i * 3 + 1] * RB[j * 3 + 1] + RA[i * 3 + 2] * RB[j * 3 + 2]; Rm[i * 3 + j] = v; Ar[i * 3 + j] = Math.abs(v) + 1e-6; }
  const t0 = Tx * RA[0] + Ty * RA[1] + Tz * RA[2], t1 = Tx * RA[3] + Ty * RA[4] + Tz * RA[5], t2 = Tx * RA[6] + Ty * RA[7] + Tz * RA[8], t = [t0, t1, t2];
  let best = 1e9, bestFace = 1e9, bx = 0, by = 0, bz = 0, faceX = 0, faceY = 0, faceZ = 0;
  for (let i = 0; i < 3; i++) {
    const ov = hA[i] + hB[0] * Ar[i * 3] + hB[1] * Ar[i * 3 + 1] + hB[2] * Ar[i * 3 + 2] - Math.abs(t[i]);
    if (ov < -PH_M) return;
    if (ov < bestFace) { bestFace = ov; faceX = RA[i * 3]; faceY = RA[i * 3 + 1]; faceZ = RA[i * 3 + 2]; }
  }
  for (let j = 0; j < 3; j++) {
    const tb = Tx * RB[j * 3] + Ty * RB[j * 3 + 1] + Tz * RB[j * 3 + 2];
    const ov = hA[0] * Ar[j] + hA[1] * Ar[3 + j] + hA[2] * Ar[6 + j] + hB[j] - Math.abs(tb);
    if (ov < -PH_M) return;
    if (ov < bestFace - 1e-4) { bestFace = ov; faceX = RB[j * 3]; faceY = RB[j * 3 + 1]; faceZ = RB[j * 3 + 2]; }
  }
  best = bestFace; bx = faceX; by = faceY; bz = faceZ;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    // axis Ai x Bj
    const ai = [RA[i * 3], RA[i * 3 + 1], RA[i * 3 + 2]], bj = [RB[j * 3], RB[j * 3 + 1], RB[j * 3 + 2]];
    let lx = ai[1] * bj[2] - ai[2] * bj[1], ly = ai[2] * bj[0] - ai[0] * bj[2], lz = ai[0] * bj[1] - ai[1] * bj[0];
    const ll = Math.hypot(lx, ly, lz); if (ll < 1e-3) continue;
    lx /= ll; ly /= ll; lz /= ll;
    let ra = 0, rb = 0;
    for (let k = 0; k < 3; k++) { ra += hA[k] * Math.abs(RA[k * 3] * lx + RA[k * 3 + 1] * ly + RA[k * 3 + 2] * lz); rb += hB[k] * Math.abs(RB[k * 3] * lx + RB[k * 3 + 1] * ly + RB[k * 3 + 2] * lz); }
    const ov = ra + rb - Math.abs(Tx * lx + Ty * ly + Tz * lz);
    if (ov < -PH_M) return;
    if (ov < bestFace * 0.9 - 0.01 && ov < best) { best = ov; bx = lx; by = ly; bz = lz; }
  }
  // normal from B to A
  if (Tx * bx + Ty * by + Tz * bz > 0) { bx = -bx; by = -by; bz = -bz; }
  let rA = 0, rB = 0;
  for (let k = 0; k < 3; k++) { rA += hA[k] * Math.abs(RA[k * 3] * bx + RA[k * 3 + 1] * by + RA[k * 3 + 2] * bz); rB += hB[k] * Math.abs(RB[k * 3] * bx + RB[k * 3 + 1] * by + RB[k * 3 + 2] * bz); }
  const maxB = sb.c[0] * bx + sb.c[1] * by + sb.c[2] * bz + rB, minA = sa.c[0] * bx + sa.c[1] * by + sa.c[2] * bz - rA;
  const mu = phMu(sa.mu, sb.mu), m = PH_M;
  let found = 0;
  // points of A inside B
  const S = sa.samples;
  for (let i = 0, k = 0; i < S.length && k < 10; i += 3) {
    const px = sa.c[0] + RA[0] * S[i] + RA[3] * S[i + 1] + RA[6] * S[i + 2], py = sa.c[1] + RA[1] * S[i] + RA[4] * S[i + 1] + RA[7] * S[i + 2], pz = sa.c[2] + RA[2] * S[i] + RA[5] * S[i + 1] + RA[8] * S[i + 2];
    const dx = px - sb.c[0], dy = py - sb.c[1], dz = pz - sb.c[2];
    if (Math.abs(RB[0] * dx + RB[1] * dy + RB[2] * dz) > hB[0] + m || Math.abs(RB[3] * dx + RB[4] * dy + RB[5] * dz) > hB[1] + m || Math.abs(RB[6] * dx + RB[7] * dy + RB[8] * dz) > hB[2] + m) continue;
    const d = maxB - (px * bx + py * by + pz * bz);
    if (d < -m) continue;
    phAddC(A, B, px + bx * d * 0.5, py + by * d * 0.5, pz + bz * d * 0.5, bx, by, bz, d, sa, sb, mu); k++; found++;
  }
  const Q = sb.samples;
  for (let i = 0, k = 0; i < Q.length && k < 10; i += 3) {
    const px = sb.c[0] + RB[0] * Q[i] + RB[3] * Q[i + 1] + RB[6] * Q[i + 2], py = sb.c[1] + RB[1] * Q[i] + RB[4] * Q[i + 1] + RB[7] * Q[i + 2], pz = sb.c[2] + RB[2] * Q[i] + RB[5] * Q[i + 1] + RB[8] * Q[i + 2];
    const dx = px - sa.c[0], dy = py - sa.c[1], dz = pz - sa.c[2];
    if (Math.abs(RA[0] * dx + RA[1] * dy + RA[2] * dz) > hA[0] + m || Math.abs(RA[3] * dx + RA[4] * dy + RA[5] * dz) > hA[1] + m || Math.abs(RA[6] * dx + RA[7] * dy + RA[8] * dz) > hA[2] + m) continue;
    const d = (px * bx + py * by + pz * bz) - minA;
    if (d < -m) continue;
    phAddC(A, B, px - bx * d * 0.5, py - by * d * 0.5, pz - bz * d * 0.5, bx, by, bz, d, sa, sb, mu); k++; found++;
  }
  if (!found && best > 0) phAddC(A, B, (sa.c[0] + sb.c[0]) / 2, (sa.c[1] + sb.c[1]) / 2, (sa.c[2] + sb.c[2]) / 2, bx, by, bz, best, sa, sb, mu);
}
function phPartPair(A, sa, B, sb) {
  const dx = sa.c[0] - sb.c[0], dy = sa.c[1] - sb.c[1], dz = sa.c[2] - sb.c[2], rr = sa.br + sb.br + PH_M;
  if (dx * dx + dy * dy + dz * dz > rr * rr) return;
  if (sa.type === PHS) phSphereVs(A, sa, sa.c[0], sa.c[1], sa.c[2], sa.r, B, sb);
  else if (sb.type === PHS) { const n0 = PH_NC; phSphereVs(B, sb, sb.c[0], sb.c[1], sb.c[2], sb.r, A, sa); phFlipFrom(n0, A, B); }
  else if (sa.type === PHC) phCapsuleVs(A, sa, B, sb);
  else if (sb.type === PHC) { const n0 = PH_NC; phCapsuleVs(B, sb, A, sa); phFlipFrom(n0, A, B); }
  else phBoxBox(A, sa, B, sb);
}
// contacts generated with bodies swapped: make A the first body again (the solver assumes A is awake)
function phFlipFrom(n0, A, B) {
  for (let i = n0; i < PH_NC; i++) {
    const c = PHCT[i]; c.a = A; c.b = B; c.n[0] = -c.n[0]; c.n[1] = -c.n[1]; c.n[2] = -c.n[2];
    const t = c.pa; c.pa = c.pb; c.pb = t;
    if (c.n[1] > 0.5) A.grounded = true;
  }
}
// probes against terrain and static solids
function phWorldContacts(A, s) {
  const P = s.probes, R = s.R, c = s.c, mu = s.mu * 0.8 + 0.12;
  const sol = phSolidsNear(c[0], c[2], s.br + 1);
  for (let i = 0; i < P.length; i += 4) {
    const lx = P[i], ly = P[i + 1], lz = P[i + 2], pr = P[i + 3];
    const px = c[0] + R[0] * lx + R[3] * ly + R[6] * lz, py = c[1] + R[1] * lx + R[4] * ly + R[7] * lz, pz = c[2] + R[2] * lx + R[5] * ly + R[8] * lz;
    const h = heightAt(px, pz);
    if (py - pr < h + 0.5) {
      phTN(px, pz, _pn);
      const d = pr - (py - h) * _pn[1];
      if (d > -PH_MARGIN) phAddC(A, null, px - _pn[0] * pr, py - _pn[1] * pr, pz - _pn[2] * pr, _pn[0], _pn[1], _pn[2], d, s, null, mu);
    }
    for (let k = 0; k < sol.length; k++) {
      const o = sol[k];
      if (py - pr > o.top + PH_MARGIN || py + pr < o.bottom) continue;
      const dx = px - o.x, dz = pz - o.z, dl = Math.hypot(dx, dz), rr = o.r * (o.kind === 'island' ? 0.92 : 1);
      if (dl > rr + pr + PH_MARGIN) continue;
      const up = o.top - (py - pr), side = rr + pr - dl;
      if (up < side && up < 0.6) phAddC(A, null, px, py - pr, pz, 0, 1, 0, up, s, null, mu);
      else if (dl > 1e-5) phAddC(A, null, px - dx / dl * pr, py, pz - dz / dl * pr, dx / dl, 0, dz / dl, side, s, null, mu);
    }
  }
}

// ---------- world step ----------
function phWaterY(x, z) { return WORLD.water + 0.05 * Math.sin(PH.time * 1.3 + x * 0.4 + z * 0.3); }
function phForces(b, dt) {
  const v = b.vel, w = b.ang;
  if (!b.heldDrive) v[1] -= PH_G * dt;
  // buoyancy: submerged fraction at a few sample points per part
  let wet = 0;
  for (const s of b.parts) {
    if (s.c[1] - s.br > 0.6) continue;
    const F = s.mass * PH_G * s.K.float;
    if (s.type === PHS) {
      const hh = clamp((phWaterY(s.c[0], s.c[2]) - (s.c[1] - s.r)) / (2 * s.r), 0, 1), f = hh * hh * (3 - 2 * hh);
      if (f > 0) { v[1] += F * f * b.im * dt; wet += f * s.mass; }
      continue;
    }
    const pts = s.type === PHC ? 3 : 8, rs = s.type === PHC ? s.r : Math.min(s.h[0], s.h[1], s.h[2]) * 0.9 + 0.02;
    for (let k = 0; k < pts; k++) {
      let lx, ly, lz;
      if (s.type === PHC) { lx = 0; ly = (k - 1) * s.hl * 0.66; lz = 0; }
      else { lx = (k & 1 ? 0.5 : -0.5) * s.h[0]; ly = (k & 2 ? 0.5 : -0.5) * s.h[1]; lz = (k & 4 ? 0.5 : -0.5) * s.h[2]; }
      const R = s.R, px = s.c[0] + R[0] * lx + R[3] * ly + R[6] * lz, py = s.c[1] + R[1] * lx + R[4] * ly + R[7] * lz, pz = s.c[2] + R[2] * lx + R[5] * ly + R[8] * lz;
      const f = clamp((phWaterY(px, pz) - (py - rs)) / (2 * rs), 0, 1);
      if (f <= 0) continue;
      const fy = F / pts * f * dt;
      phImpulseRaw(b, px, py, pz, 0, fy, 0);
      wet += f * s.mass / pts;
    }
  }
  b.wetF = wet * b.im;
  if (wet > 0) {
    const k = Math.exp(-1.6 * b.wetF * dt), ka = Math.exp(-2.2 * b.wetF * dt);
    v[0] *= k; v[1] *= k; v[2] *= k; w[0] *= ka; w[1] *= ka; w[2] *= ka;
    const wd = phWind(); v[0] += wd[0] * 0.25 * b.wetF * dt; v[2] += wd[1] * 0.25 * b.wetF * dt;
  }
  const ld = Math.exp(-0.03 * dt), ad = Math.exp(-0.12 * dt);
  v[0] *= ld; v[1] *= ld; v[2] *= ld; w[0] *= ad; w[1] *= ad; w[2] *= ad;
}
function phImpulseRaw(b, px, py, pz, jx, jy, jz) {
  b.vel[0] += jx * b.im; b.vel[1] += jy * b.im; b.vel[2] += jz * b.im;
  const rx = px - b.pos[0], ry = py - b.pos[1], rz = pz - b.pos[2], tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx, I = b.IinvW;
  b.ang[0] += I[0] * tx + I[3] * ty + I[6] * tz; b.ang[1] += I[1] * tx + I[4] * ty + I[7] * tz; b.ang[2] += I[2] * tx + I[5] * ty + I[8] * tz;
}
function phKN(b, r, n) {   // n . ((I (r x n)) x r)
  const cx = r[1] * n[2] - r[2] * n[1], cy = r[2] * n[0] - r[0] * n[2], cz = r[0] * n[1] - r[1] * n[0], I = b.IinvW, k = b.iscale;
  const ix = (I[0] * cx + I[3] * cy + I[6] * cz) * k, iy = (I[1] * cx + I[4] * cy + I[7] * cz) * k, iz = (I[2] * cx + I[5] * cy + I[8] * cz) * k;
  return n[0] * (iy * r[2] - iz * r[1]) + n[1] * (iz * r[0] - ix * r[2]) + n[2] * (ix * r[1] - iy * r[0]);
}
function phApply(b, r, jx, jy, jz, pseudo) {
  const k = b.iscale, v = pseudo ? b.pv : b.vel, w = pseudo ? b.pw : b.ang, I = b.IinvW;
  v[0] += jx * b.im * k; v[1] += jy * b.im * k; v[2] += jz * b.im * k;
  const tx = r[1] * jz - r[2] * jy, ty = r[2] * jx - r[0] * jz, tz = r[0] * jy - r[1] * jx;
  w[0] += (I[0] * tx + I[3] * ty + I[6] * tz) * k; w[1] += (I[1] * tx + I[4] * ty + I[7] * tz) * k; w[2] += (I[2] * tx + I[5] * ty + I[8] * tz) * k;
}
function phRelV(c, dir, pseudo) {
  const A = c.a, B = c.b, ra = c.ra, rb = c.rb;
  const va = pseudo ? A.pv : A.vel, wa = pseudo ? A.pw : A.ang;
  let x = va[0] + wa[1] * ra[2] - wa[2] * ra[1], y = va[1] + wa[2] * ra[0] - wa[0] * ra[2], z = va[2] + wa[0] * ra[1] - wa[1] * ra[0];
  if (B && !B.sleep) {
    const vb = pseudo ? B.pv : B.vel, wb = pseudo ? B.pw : B.ang;
    x -= vb[0] + wb[1] * rb[2] - wb[2] * rb[1]; y -= vb[1] + wb[2] * rb[0] - wb[0] * rb[2]; z -= vb[2] + wb[0] * rb[1] - wb[1] * rb[0];
  }
  return x * dir[0] + y * dir[1] + z * dir[2];
}
function phSolve(dt) {
  // prepare
  for (let i = 0; i < PH_NC; i++) {
    const c = PHCT[i], A = c.a, B = c.b && !c.b.sleep ? c.b : null, n = c.n;
    c.ra[0] = c.p[0] - A.pos[0]; c.ra[1] = c.p[1] - A.pos[1]; c.ra[2] = c.p[2] - A.pos[2];
    if (c.b) { c.rb[0] = c.p[0] - c.b.pos[0]; c.rb[1] = c.p[1] - c.b.pos[1]; c.rb[2] = c.p[2] - c.b.pos[2]; }
    const imA = A.im * A.iscale, imB = B ? B.im * B.iscale : 0;
    c.kn = 1 / (imA + imB + phKN(A, c.ra, n) + (B ? phKN(B, c.rb, n) : 0));
    // tangent basis
    if (Math.abs(n[1]) < 0.9) { c.t1[0] = n[2]; c.t1[1] = 0; c.t1[2] = -n[0]; } else { c.t1[0] = 0; c.t1[1] = -n[2]; c.t1[2] = n[1]; }
    let l = Math.hypot(c.t1[0], c.t1[1], c.t1[2]); c.t1[0] /= l; c.t1[1] /= l; c.t1[2] /= l;
    c.t2[0] = n[1] * c.t1[2] - n[2] * c.t1[1]; c.t2[1] = n[2] * c.t1[0] - n[0] * c.t1[2]; c.t2[2] = n[0] * c.t1[1] - n[1] * c.t1[0];
    c.k1 = 1 / (imA + imB + phKN(A, c.ra, c.t1) + (B ? phKN(B, c.rb, c.t1) : 0));
    c.k2 = 1 / (imA + imB + phKN(A, c.ra, c.t2) + (B ? phKN(B, c.rb, c.t2) : 0));
    const vn = phRelV(c, n, false);
    const rest = Math.max(c.pa ? c.pa.rest : 0.1, c.pb ? c.pb.rest : 0.1);
    c.tgt = c.d < 0 ? c.d / dt : (vn < -1.5 ? -rest * vn : 0);
    c.ptgt = c.d > PH_SLOP ? Math.min(3, PH_BETA * (c.d - PH_SLOP) / dt) : 0;
    if (vn < -2.2) phImpactEvent(c, -vn);
  }
  const iters = PH_NC > 320 ? PH_ITER - 2 : PH_ITER;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < PH_NC; i++) {
      const c = PHCT[i], A = c.a, B = c.b && !c.b.sleep ? c.b : null, n = c.n;
      // friction first, clamped by the current normal impulse
      const lim = c.mu * c.ln;
      let vt = phRelV(c, c.t1, false), dl = -vt * c.k1, nl = clamp(c.l1 + dl, -lim, lim); dl = nl - c.l1; c.l1 = nl;
      if (dl) { phApply(A, c.ra, c.t1[0] * dl, c.t1[1] * dl, c.t1[2] * dl, false); if (B) phApply(B, c.rb, -c.t1[0] * dl, -c.t1[1] * dl, -c.t1[2] * dl, false); }
      vt = phRelV(c, c.t2, false); dl = -vt * c.k2; nl = clamp(c.l2 + dl, -lim, lim); dl = nl - c.l2; c.l2 = nl;
      if (dl) { phApply(A, c.ra, c.t2[0] * dl, c.t2[1] * dl, c.t2[2] * dl, false); if (B) phApply(B, c.rb, -c.t2[0] * dl, -c.t2[1] * dl, -c.t2[2] * dl, false); }
      const vn = phRelV(c, n, false);
      dl = (c.tgt - vn) * c.kn; nl = Math.max(0, c.ln + dl); dl = nl - c.ln; c.ln = nl;
      if (dl) { phApply(A, c.ra, n[0] * dl, n[1] * dl, n[2] * dl, false); if (B) phApply(B, c.rb, -n[0] * dl, -n[1] * dl, -n[2] * dl, false); }
    }
  }
  for (let it = 0; it < PH_PITER; it++) {
    for (let i = 0; i < PH_NC; i++) {
      const c = PHCT[i]; if (c.ptgt <= 0) continue;
      const A = c.a, B = c.b && !c.b.sleep ? c.b : null, n = c.n;
      const vn = phRelV(c, n, true);
      let dl = (c.ptgt - vn) * c.kn; const nl = Math.max(0, c.lp + dl); dl = nl - c.lp; c.lp = nl;
      if (dl) { phApply(A, c.ra, n[0] * dl, n[1] * dl, n[2] * dl, true); if (B) phApply(B, c.rb, -n[0] * dl, -n[1] * dl, -n[2] * dl, true); }
    }
  }
}
function phImpactEvent(c, speed) {
  const now = PH.time;
  for (const [b, s] of [[c.a, c.pa], [c.b, c.pb]]) {
    if (!b || !s) continue;
    if (s.explosive && speed > 7.5 && !b.heldDrive) phFuse(s, 0.02);
    if (now - b.lastSnd > 0.14 && speed > 3 && V.dist(b.pos, player.pos) < 30) { b.lastSnd = now; phSfx(s.K.stone ? 'rock' : 'wood', clamp(speed / 12, 0.1, 1)); if (speed > 6) dust(c.p, 3, 0.6); }
  }
}
function phWorldStep(dt) {
  const B = PH.bodies, pp = player.pos;
  PH_NC = 0;
  for (const b of B) {
    b.grounded = false;
    if (b.sleep || b.carried) continue;
    const dx = b.pos[0] - pp[0], dz = b.pos[2] - pp[2];
    if (dx * dx + dz * dz > 80 * 80 && !b.heldDrive) { b.vel[0] = b.vel[1] = b.vel[2] = 0; b.ang[0] = b.ang[1] = b.ang[2] = 0; b.sleep = true; continue; }
    b.iscale = b.heldDrive ? 0.3 : 1;
    phUpdateBody(b);
    phForces(b, dt);
    b.pv[0] = b.pv[1] = b.pv[2] = 0; b.pw[0] = b.pw[1] = b.pw[2] = 0;
  }
  for (let i = 0; i < B.length; i++) {
    const A = B[i];
    if (A.sleep || A.carried) continue;
    for (const s of A.parts) phWorldContacts(A, s);
    const moving = A.heldDrive || A.vel[0] * A.vel[0] + A.vel[1] * A.vel[1] + A.vel[2] * A.vel[2] > 0.25 || A.ang[0] * A.ang[0] + A.ang[1] * A.ang[1] + A.ang[2] * A.ang[2] > 0.5;
    for (let j = 0; j < B.length; j++) {
      if (j === i) continue;
      const Bb = B[j];
      if (Bb.carried || (!Bb.sleep && j < i)) continue;
      const dx = A.pos[0] - Bb.pos[0], dy = A.pos[1] - Bb.pos[1], dz = A.pos[2] - Bb.pos[2], rr = A.rad + Bb.rad + PH_MARGIN;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      const n0 = PH_NC;
      for (const sa of A.parts) for (const sb of Bb.parts) phPartPair(A, sa, Bb, sb);
      if (PH_NC > n0 && Bb.sleep && moving) { phWake(Bb); Bb.iscale = 1; phUpdateBody(Bb); Bb.pv[0] = Bb.pv[1] = Bb.pv[2] = 0; Bb.pw[0] = Bb.pw[1] = Bb.pw[2] = 0; }
    }
  }
  phSolve(dt);
  for (const b of B) {
    if (b.sleep || b.carried) continue;
    if (b.grounded) {
      let roll = 0; for (const s of b.parts) if (s.K.roll) roll = Math.max(roll, s.K.roll);
      if (roll) { const k = Math.exp(-roll * dt); b.ang[0] *= k; b.ang[1] *= k; b.ang[2] *= k; }
    }
    const v = b.vel, w = b.ang, sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > 40) { v[0] *= 40 / sp; v[1] *= 40 / sp; v[2] *= 40 / sp; }
    b.pos[0] += (v[0] + b.pv[0]) * dt; b.pos[1] += (v[1] + b.pv[1]) * dt; b.pos[2] += (v[2] + b.pv[2]) * dt;
    const wx = w[0] + b.pw[0], wy = w[1] + b.pw[1], wz = w[2] + b.pw[2], q = b.q, h = 0.5 * dt;
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] += h * (wx * qw + wy * qz - wz * qy); q[1] += h * (-wx * qz + wy * qw + wz * qx); q[2] += h * (wx * qy - wy * qx + wz * qw); q[3] += h * (-wx * qx - wy * qy - wz * qz);
    phQNorm(q);
    // sleep when calm
    if (!b.heldDrive && sp * sp < 0.05 && w[0] * w[0] + w[1] * w[1] + w[2] * w[2] < 0.08) { b.sleepT += dt; if (b.sleepT > 0.6) { b.sleep = true; v[0] = v[1] = v[2] = 0; w[0] = w[1] = w[2] = 0; } }
    else b.sleepT = 0;
    if (b.pos[1] < -25) phRespawn(b);
    phUpdateBody(b);
  }
}
function phRespawn(b) {
  if (!b.spawn || b.parts.length > 1) { phRemoveBody(b); return; }
  b.pos = b.spawn.pos.slice(); b.q = b.spawn.q.slice(); b.vel = [0, 0, 0]; b.ang = [0, 0, 0]; b.sleep = true;
  const s = b.parts[0]; s.burn = 0; s.charred = 0; s.fuse = -1; s.fuel = s.wood ? 10 : 0; s.lit = false;
  phUpdateBody(b);
}

// ---------- player / goblin interplay ----------
const _pcN = [0, 0, 0], _pv = [0, 0, 0];
function phPlayerCollide(dt, prevVy) {
  const p = player; if (p.deadT > 0 || p.hidden) { PH.support = null; return; }
  let support = null, supPt = null, landVy = 0;
  const cx = p.pos[0], cz = p.pos[2];
  for (let pass = 0; pass < 2; pass++) {
    for (const b of PH.bodies) {
      if (b.carried) continue;
      const dx = b.pos[0] - p.pos[0], dy = b.pos[1] - (p.pos[1] + 0.85), dz = b.pos[2] - p.pos[2], rr = b.rad + 1.3;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      for (const s of b.parts) {
        for (let k = 0; k < 4; k++) {
          const sy = 0.32 + k * 0.33, r = 0.32;
          const d = phSpherePart(p.pos[0], p.pos[1] + sy, p.pos[2], r, s, _sp);
          if (d <= 0.002) continue;
          const n = _sp.n;
          if (n[1] > 0.6 && k < 2) {
            // standing on it
            p.pos[1] += Math.min(d / n[1], 0.5);
            if (p.vel[1] <= 0.5) { landVy = Math.min(landVy, p.vel[1], prevVy); if (p.vel[1] < 0) p.vel[1] = 0; support = b; supPt = _sp.p.slice(); }
          } else if (n[1] < -0.6) {
            p.pos[1] -= d; if (p.vel[1] > 0) p.vel[1] = 0;
          } else {
            const hl = Math.hypot(n[0], n[2]) || 1, nx = n[0] / hl, nz = n[2] / hl;
            p.pos[0] += nx * d; p.pos[2] += nz * d;
            const vin = -(p.vel[0] * nx + p.vel[2] * nz);
            if (vin > 0) {
              p.vel[0] += nx * vin; p.vel[2] += nz * vin;
              if (!b.heldDrive && pass === 0) {
                // shove the body: light things slide at walking pace, boulders barely budge
                phPointVel(b, _sp.p[0], _sp.p[1], _sp.p[2], _pv);
                const along = -(_pv[0] * nx + _pv[2] * nz), want = vin * 0.9 - along;
                if (want > 0) { const j = want * b.mass / (1 + b.mass * 0.9) * 0.6; phImpulse(b, _sp.p[0], Math.min(_sp.p[1], b.pos[1] + 0.1), _sp.p[2], -nx * j, 0, -nz * j); }
              }
            }
            // a fast body hitting the hero hurts
            phPointVel(b, _sp.p[0], _sp.p[1], _sp.p[2], _pv);
            const vhit = _pv[0] * -nx + _pv[2] * -nz;
            if (vhit > 7 && b.mass >= 1.5 && !b.heldDrive && PH.carry !== b) hurt(b.pos);
          }
        }
      }
    }
  }
  if (support) {
    const wasSup = !!PH.support || p.onGround;
    p.onGround = true; p.coyote = TUNE.COY; p.jumps = 0; p.airT = 0; p.glide = false; if (p.dashT <= 0) p.canDash = true;
    if (!wasSup) { onLand(-landVy); if (landVy < -3) phWake(support); }
    if (!PH.support) phWake(support);
    if (!support.sleep) {
      phPointVel(support, supPt[0], supPt[1], supPt[2], _pv);
      p.pos[0] += _pv[0] * dt; p.pos[1] += Math.min(0, _pv[1]) * dt; p.pos[2] += _pv[2] * dt;
      if (!support.heldDrive) phImpulse(support, supPt[0], supPt[1], supPt[2], 0, -1.2 * PH_G * dt, 0);
    }
    if (PH.hand.body === support) { phHandRelease(false); toast('No puedes mover lo que estás pisando.', 2.5); }
  }
  PH.support = support;
}
function phFoesCollide(dt) {
  for (const f of foes) {
    if (!f.alive) continue;
    for (const b of PH.bodies) {
      if (b.carried) continue;
      const dx = b.pos[0] - f.pos[0], dy = b.pos[1] - f.pos[1] - 0.55, dz = b.pos[2] - f.pos[2], rr = b.rad + 0.8;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      for (const s of b.parts) {
        const d = phSpherePart(f.pos[0], f.pos[1] + 0.5, f.pos[2], 0.45, s, _sp);
        if (d <= 0) continue;
        const n = _sp.n, hl = Math.hypot(n[0], n[2]) || 1, nx = n[0] / hl, nz = n[2] / hl;
        phPointVel(b, _sp.p[0], _sp.p[1], _sp.p[2], _pv);
        if (n[1] > 0.7) { f.pos[1] += Math.min(d, 0.3); if (f.vel[1] < 0) { f.vel[1] = 0; f.onGround = true; } }
        else { f.pos[0] += nx * d; f.pos[2] += nz * d; const vi = -(f.vel[0] * nx + f.vel[2] * nz); if (vi > 0) { f.vel[0] += nx * vi; f.vel[2] += nz * vi; } }
        const sp = Math.hypot(_pv[0], _pv[1], _pv[2]);
        if (sp > 3.5 && sp * b.mass > 3 && (f.physT || 0) < PH.time && !b.heldDrive) {
          f.physT = PH.time + 0.6;
          const dir = V.norm([_pv[0], 0, _pv[2]]);
          if (sp > 6 && b.mass > 4) killFoe(f, dir); else damageFoe(f, dir, sp > 7 ? 2 : 1, _sp.p.slice());
          phImpulse(b, _sp.p[0], _sp.p[1], _sp.p[2], -_pv[0] * 0.15 * Math.min(b.mass, 2), 0, -_pv[2] * 0.15 * Math.min(b.mass, 2));
        }
      }
    }
  }
}
function phSwordHits() {
  const p = player;
  if (p.atk.n) {
    const a = ATK[p.atk.n], u = p.atk.t / a.dur;
    if (u < a.from || u > a.to) return;
    const spin = p.atk.n === 'spin', fwd = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
    for (const b of PH.bodies) {
      if (b.carried || p.atk.hit.has(b)) continue;
      const d = V.sub(b.pos, p.pos), h = Math.hypot(d[0], d[2]);
      if (h > a.reach + b.rad * 0.7 || d[1] < -1.5 || d[1] > 2.4) continue;
      if (!spin && (d[0] * fwd[0] + d[2] * fwd[2]) / (h || 1) < 0.1) continue;
      p.atk.hit.add(b);
      const hp = V.lerp(rig.bladeTip || b.pos, b.pos, 0.5), dir = spin ? V.norm([d[0], 0, d[2]]) : fwd;
      const k = (spin || p.atk.n === 3 ? 5 : 3.2) * Math.min(b.mass, 3);
      phImpulse(b, hp[0], hp[1], hp[2], dir[0] * k, k * 0.35, dir[2] * k);
      burst(hp, 8, [1.8, 1.6, 1.1, 1], 4, 0.25, 0.05); sfx('tink');
      for (const s of b.parts) if (s.explosive) phFuse(s, 0.05);
    }
  }
}

// ---------- carry & throw (F) ----------
function phLiftable(b) { return b.parts.length === 1 && b.parts[0].K.lift && !b.heldDrive; }
function phNearestLiftable() {
  const p = player, fwd = [Math.sin(p.yaw), Math.cos(p.yaw)];
  let best = null, bs = 2.1;
  for (const b of PH.bodies) {
    if (!phLiftable(b) || b === PH.support) continue;
    const dx = b.pos[0] - p.pos[0], dz = b.pos[2] - p.pos[2], dy = b.pos[1] - p.pos[1], h = Math.hypot(dx, dz);
    if (dy < -0.6 || dy > 1.6) continue;
    const score = h - b.rad * 0.6 - (dx * fwd[0] + dz * fwd[1]) / (h || 1) * 0.4;
    if (score < bs) { bs = score; best = b; }
  }
  return best;
}
function phCarryPose(b) {   // where the carried body sits (local to the hero)
  const s = b.parts[0];
  const up = s.type === PHB ? s.h[1] : s.type === PHY ? s.hl : s.type === PHS ? s.r : s.r;
  return 1.74 + up;
}
function phLift() {
  const p = player;
  if (PH.carry) { phThrow(false); return; }
  if (!p.onGround || p.atk.n || p.rollT > 0 || PH.hand.on) return;
  const b = phNearestLiftable(); if (!b) return;
  PH.carry = b; b.carried = true; b.sleep = false; b.vel = [0, 0, 0]; b.ang = [0, 0, 0];
  // keep the body's yaw relative to the hero; stand it upright (logs/planks lie across the shoulders)
  const s = b.parts[0];
  if (s.type === PHC || s.kind === 'plank') { PH.carryQ = phQAxis(0, 0, 1, Math.PI / 2, [0, 0, 0, 1]); if (s.kind === 'plank') PH.carryQ = phQAxis(0, 1, 0, Math.PI / 2, [0, 0, 0, 1]); }
  else { const fx = b.R[6], fz = b.R[8]; PH.carryQ = phQAxis(0, 1, 0, Math.atan2(fx, fz) - p.yaw, [0, 0, 0, 1]); if (Math.abs(b.R[4]) < 0.7) PH.carryQ = [0, 0, 0, 1]; }
  PH.carryT = 0;
  phWakeNear(b.pos, b.rad + 0.3, b);
  sfx('ui'); p.swordOut = 0;
}
function phThrow(gentle) {
  const b = PH.carry; if (!b) return;
  const p = player, fwd = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
  b.carried = false; PH.carry = null; b.sleep = false; b.sleepT = 0;
  if (gentle) { b.vel = [p.vel[0], 0, p.vel[2]]; b.pos = V.add(b.pos, V.mul(fwd, 0.5)); }
  else {
    const sp = 9.5 / Math.sqrt(Math.max(0.6, b.mass));
    b.vel = [p.vel[0] * 0.6 + fwd[0] * sp, 4.6, p.vel[2] * 0.6 + fwd[2] * sp];
    b.ang = [fwd[2] * -3, rand(-1, 1), fwd[0] * 3];
    PH.throwT = 0.3; sfx('whoosh'); b.thrownT = PH.time;
  }
  phUpdateBody(b);
}
function phCarryStep(dt) {
  const b = PH.carry; if (!b) return;
  const p = player, st = rig.state;
  if (p.deadT > 0 || p.hurtT > 0 || p.rollT > 0 || p.dashT > 0 || p.pound || p.glide || !PH.bodies.includes(b)) { phThrow(true); return; }
  if (p.atk.n) { p.atk = { n: 0, t: 0, queued: false, hit: new Set() }; p.swordOut = 0; phThrow(false); return; }
  PH.carryT += dt;
  if (b.parts[0].torch && rig.F) {
    // a torch is held in the right hand like a weapon, flame up and a little forward
    const hp = rig.F[BI.hand(-1)].P;
    phQMul(phQAxis(0, 1, 0, p.yaw, _pq), phQAxis(1, 0, 0, 0.45, _pq2), b.q);
    phQ2M(b.q, b.R);
    b.pos = [hp[0] + b.R[3] * 0.14, hp[1] + b.R[4] * 0.14, hp[2] + b.R[5] * 0.14];
    b.vel = [p.vel[0], p.vel[1], p.vel[2]]; b.ang = [0, 0, 0];
    phUpdateBody(b);
    return;
  }
  const k = Math.min(1, PH.carryT * 5), y = lerp(0.9, phCarryPose(b), smooth(0, 1, k));
  const fwd = [Math.sin(p.yaw), 0, Math.cos(p.yaw)];
  const bob = st === 'run' ? Math.abs(Math.sin(p.runPh)) * 0.04 : 0;
  b.pos = [p.pos[0] + fwd[0] * (0.08 + (1 - k) * 0.5), p.pos[1] + y + bob, p.pos[2] + fwd[2] * (0.08 + (1 - k) * 0.5)];
  phQMul(phQAxis(0, 1, 0, p.yaw, _pq), PH.carryQ, b.q);
  b.vel = [p.vel[0], p.vel[1], p.vel[2]]; b.ang = [0, 0, 0];
  phUpdateBody(b);
}

// ---------- Mano Maestra (G): aim, grab, move, rotate, glue (T), unglue (V) ----------
const _rayO = [0, 0, 0], _rayD = [0, 0, -1];
function phRayPart(s, o, d) {   // distance along the ray, or -1
  if (s.type === PHS || s.type === PHC) {
    let qx = s.c[0], qy = s.c[1], qz = s.c[2];
    if (s.type === PHC) {
      // closest points between the ray and the capsule axis
      const ax = s.ax, wx = o[0] - qx, wy = o[1] - qy, wz = o[2] - qz;
      const b = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2], dd = d[0] * wx + d[1] * wy + d[2] * wz, e = ax[0] * wx + ax[1] * wy + ax[2] * wz, den = 1 - b * b;
      const t = clamp(den > 1e-6 ? (e - b * dd) / den : 0, -s.hl, s.hl);
      qx += ax[0] * t; qy += ax[1] * t; qz += ax[2] * t;
    }
    const lx = qx - o[0], ly = qy - o[1], lz = qz - o[2], tc = lx * d[0] + ly * d[1] + lz * d[2];
    if (tc < 0) return -1;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc, r = s.r + 0.08;
    return d2 < r * r ? tc - Math.sqrt(r * r - d2) : -1;
  }
  const R = s.R, h = s.h, rx = o[0] - s.c[0], ry = o[1] - s.c[1], rz = o[2] - s.c[2];
  let tmin = 0, tmax = 1e9;
  for (let a = 0; a < 3; a++) {
    const oa = R[a * 3] * rx + R[a * 3 + 1] * ry + R[a * 3 + 2] * rz, da = R[a * 3] * d[0] + R[a * 3 + 1] * d[1] + R[a * 3 + 2] * d[2], ha = h[a] + 0.08;
    if (Math.abs(da) < 1e-8) { if (Math.abs(oa) > ha) return -1; continue; }
    let t1 = (-ha - oa) / da, t2 = (ha - oa) / da; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1;
  }
  return tmin;
}
function phAim() {
  const o = cam.pos, t = cam.target;
  const dl = Math.hypot(t[0] - o[0], t[1] - o[1], t[2] - o[2]) || 1;
  _rayO[0] = o[0]; _rayO[1] = o[1]; _rayO[2] = o[2]; _rayD[0] = (t[0] - o[0]) / dl; _rayD[1] = (t[1] - o[1]) / dl; _rayD[2] = (t[2] - o[2]) / dl;
  let best = null, bt = 1e9, assist = null, ba = 0.09;
  for (const b of PH.bodies) {
    if (b.carried || b === PH.support) continue;
    if (V.dist(b.pos, player.pos) > 24) continue;
    for (const s of b.parts) {
      const tt = phRayPart(s, _rayO, _rayD);
      if (tt > 0 && tt < bt) { bt = tt; best = b; }
    }
    // aim assist: nearest to the screen centre
    const lx = b.pos[0] - o[0], ly = b.pos[1] - o[1], lz = b.pos[2] - o[2], tc = lx * _rayD[0] + ly * _rayD[1] + lz * _rayD[2];
    if (tc > 0) { const perp = Math.sqrt(Math.max(0, lx * lx + ly * ly + lz * lz - tc * tc)) - b.rad * 0.5; if (perp / tc < ba) { ba = perp / tc; assist = b; } }
  }
  return best || assist;
}
function phHandToggle() {
  const H = PH.hand;
  if (PH.carry) return;
  if (!H.on) { H.on = true; H.body = null; sfx('ui'); phSfx('hum'); return; }
  if (H.body) { phHandRelease(true); return; }
  if (H.target) { phGrab(H.target); return; }
  H.on = false; sfx('ui');
}
function phGrab(b) {
  const H = PH.hand; if (!b || PH.carry) return;
  H.body = b; b.heldDrive = true; phWake(b); b.sleepT = 0;
  H.dist = clamp(Math.hypot(b.pos[0] - player.pos[0], b.pos[2] - player.pos[2]), 2.2, 12);
  H.height = clamp(b.pos[1] - (player.pos[1] + 1.2), -3, 8);
  H.yawAdd = 0; H.pitchAdd = 0;
  // orientation relative to the camera yaw, so the object turns with the view
  const qc = phQAxis(0, 1, 0, -cam.yaw, _pq); phQMul(qc, b.q, H.qRel); phQNorm(H.qRel);
  phWakeNear(b.pos, b.rad + 0.3, b);
  phSfx('grab');
}
function phHandRelease(exitMode) {
  const H = PH.hand, b = H.body;
  if (b) { b.heldDrive = false; b.sleepT = 0; b.vel[0] *= 0.5; b.vel[1] *= 0.5; b.vel[2] *= 0.5; b.ang[0] *= 0.5; b.ang[1] *= 0.5; b.ang[2] *= 0.5; phSfx('drop'); }
  H.body = null; H.glueTo = null;
  if (exitMode) H.on = false;
}
function phHandTarget(o) {
  const H = PH.hand, p = player, fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  // camera pitch raises/lowers the object; Q/E or the wheel push it away or pull it in
  const want = (0.32 - cam.pitch) * 8 + 1.0;
  H.height = damp(H.height, clamp(want, -3, 9), 6, 1 / 120);
  o[0] = p.pos[0] + fx * H.dist; o[2] = p.pos[2] + fz * H.dist;
  o[1] = Math.max(p.pos[1] + 1.2 + H.height, heightAt(o[0], o[2]) + (H.body ? H.body.rad * 0.5 : 0.5));
  return o;
}
const _ht = [0, 0, 0];
function phHandStep(dt) {
  const H = PH.hand;
  if (!H.on) { H.target = null; return; }
  const p = player;
  if (p.deadT > 0 || p.hurtT > 0 || state.mode !== 'play') { phHandRelease(true); return; }
  if (!H.body) { H.target = phAim(); return; }
  const b = H.body;
  if (!PH.bodies.includes(b)) { H.body = null; return; }
  if (keys.physNear) H.dist = Math.max(1.6, H.dist - 4 * dt);
  if (keys.physFar) H.dist = Math.min(14, H.dist + 4 * dt);
  phHandTarget(_ht);
  // velocity drive towards the target point
  const k = 10, dx = _ht[0] - b.pos[0], dy = _ht[1] - b.pos[1], dz = _ht[2] - b.pos[2];
  let vx = dx * k, vy = dy * k, vz = dz * k; const vl = Math.hypot(vx, vy, vz);
  if (vl > 14) { vx *= 14 / vl; vy *= 14 / vl; vz *= 14 / vl; }
  const a = 1 - Math.exp(-dt * 30);
  b.vel[0] += (vx - b.vel[0]) * a; b.vel[1] += (vy - b.vel[1]) * a; b.vel[2] += (vz - b.vel[2]) * a;
  // orientation: camera yaw * user turns * grabbed relation
  const qt = phQAxis(0, 1, 0, cam.yaw + H.yawAdd, _pq);
  phQMul(qt, phQAxis(1, 0, 0, H.pitchAdd, _pq2), qt); phQMul(qt, H.qRel, qt);
  // error rotation qt * conj(q)
  const q = b.q, cx = -q[0], cy = -q[1], cz = -q[2], cw = q[3];
  let ex = qt[3] * cx + qt[0] * cw + qt[1] * cz - qt[2] * cy, ey = qt[3] * cy - qt[0] * cz + qt[1] * cw + qt[2] * cx, ez = qt[3] * cz + qt[0] * cy - qt[1] * cx + qt[2] * cw, ew = qt[3] * cw - qt[0] * cx - qt[1] * cy - qt[2] * cz;
  if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
  const sl = Math.hypot(ex, ey, ez), ang = 2 * Math.atan2(sl, ew), kw = 9;
  const wx = sl > 1e-6 ? ex / sl * ang * kw : 0, wy = sl > 1e-6 ? ey / sl * ang * kw : 0, wz = sl > 1e-6 ? ez / sl * ang * kw : 0;
  b.ang[0] += (wx - b.ang[0]) * a; b.ang[1] += (wy - b.ang[1]) * a; b.ang[2] += (wz - b.ang[2]) * a;
  // face the held object
  if (Math.hypot(p.vel[0], p.vel[2]) < 0.5) p.yaw += angDiff(p.yaw, Math.atan2(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2])) * Math.min(1, dt * 8);
  // glue candidate: the nearest other body the held assembly (almost) touches
  H.glueT -= dt;
  if (H.glueT <= 0) { H.glueT = 0.1; phFindGlue(b); }
  if (Math.random() < dt * 40 && rig.F) {
    const hp = rig.F[BI.hand(-1)].P, u = Math.random(), m = V.lerp(hp, b.pos, u);
    particle([m[0] + rand(-0.05, 0.05), m[1] + Math.sin(u * Math.PI) * 0.35 + rand(-0.05, 0.05), m[2] + rand(-0.05, 0.05)], [rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3)], rand(0.25, 0.5), rand(0.03, 0.06), [1.0, 2.4, 0.7, 1], 0, 1);
  }
}
function phFindGlue(b) {
  const H = PH.hand, keepNC = PH_NC, margin = 0.28;
  let best = null, bd = -1e9, bp = null;
  for (const o of PH.bodies) {
    if (o === b || o.carried) continue;
    const dx = o.pos[0] - b.pos[0], dy = o.pos[1] - b.pos[1], dz = o.pos[2] - b.pos[2], rr = o.rad + b.rad + margin;
    if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
    phUpdateBody(o);
    for (const sa of b.parts) for (const sb of o.parts) {
      const n0 = PH_NC;
      // widen the contact margin for the probe
      PH_M = margin; phPartPair(b, sa, o, sb); PH_M = PH_MARGIN;
      for (let i = n0; i < PH_NC; i++) { const c = PHCT[i]; if (c.d > bd) { bd = c.d; best = o; bp = c.p.slice(); } }
      PH_NC = n0;
    }
  }
  PH_NC = keepNC;
  H.glueTo = bd > -margin ? best : null;
  if (bp) H.glueP = bp;
}
function phGlue() {
  const H = PH.hand, a = H.body, o = H.glueTo;
  if (!a || !o) { if (a) toast('Acerca el objeto a otro para pegarlos.', 2); return; }
  phUpdateBody(a); phUpdateBody(o);
  const gp = H.glueP.slice();
  const m = a.mass + o.mass;
  const v = [(a.vel[0] * a.mass + o.vel[0] * o.mass) / m, (a.vel[1] * a.mass + o.vel[1] * o.mass) / m, (a.vel[2] * a.mass + o.vel[2] * o.mass) / m];
  const glueW = a.glue.map(g => phV(a, g)).concat(o.glue.map(g => phV(o, g)), [gp]);
  a.parts = a.parts.concat(o.parts);
  a.glue = [];
  const i = PH.bodies.indexOf(o); if (i >= 0) PH.bodies.splice(i, 1);
  if (PH.support === o) PH.support = null;
  phRebuild(a);
  a.glue = glueW.map(g => phLocal(a, g));
  a.vel = v; a.spawn = null;
  // keep the grab relation continuous
  const qc = phQAxis(0, 1, 0, -(cam.yaw + H.yawAdd), _pq), qinv = phQAxis(1, 0, 0, -H.pitchAdd, _pq2);
  phQMul(qinv, qc, _pq); phQMul(_pq, a.q, H.qRel); phQNorm(H.qRel);
  H.glueTo = null;
  phSfx('glue');
  for (let k = 0; k < 16; k++) particle(gp, [rand(-2, 2), rand(0, 2.5), rand(-2, 2)], rand(0.3, 0.6), rand(0.04, 0.08), [1.2, 2.6, 0.6, 1], 4, 2);
  ring(gp, [0.8, 1.6, 0.4, 0.9], 0.8);
}
function phUnglue() {
  const H = PH.hand, b = H.body;
  if (!b) { if (PH.carry) phThrow(true); return; }
  phHandRelease(false);
  if (b.parts.length > 1) {
    phUpdateBody(b);
    const i = PH.bodies.indexOf(b); if (i >= 0) PH.bodies.splice(i, 1);
    for (const s of b.parts) {
      const q = phM2Q(s.R, [0, 0, 0, 1]), v = phPointVel(b, s.c[0], s.c[1], s.c[2], [0, 0, 0]);
      s.off = [0, 0, 0]; s.Ro = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const nb = phNewBody([s], s.c.slice(), q);
      nb.vel = v; nb.ang = b.ang.slice(); nb.sleep = false;
      PH.bodies.push(nb);
      burst(s.c, 6, [1.0, 2.2, 0.6, 1], 2.5, 0.3, 0.05);
    }
    phSfx('unglue');
  }
}

// ---------- fire ----------
const PHF = { n: 100, cell: 2, fuel: null, st: null, act: [], near: [], tick: 0, tufts: null, flowers: null, scorchQ: [] };
function phFireInit() {
  const n = PHF.n, c = PHF.cell;
  PHF.fuel = new Uint8Array(n * n); PHF.st = new Float32Array(n * n); PHF.act = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -100 + (i + 0.5) * c, z = -100 + (j + 0.5) * c, h = heightAt(x, z), nn = phTN(x, z, _pn);
    if (h > 1.3 && h < 25 && nn[1] > 0.78 && pathDist(x, z) > 1.6 && Math.hypot(x - SHRINE[0], z - SHRINE[2]) > 8.6) PHF.fuel[j * n + i] = 1;
  }
  for (const f of PH.fires) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const id = phCellAt(f.x + i * c, f.z + j * c); if (id >= 0) PHF.fuel[id] = 0; }
  PHF.tufts = []; PHF.flowers = [];
  for (let k = 0; k < n * n; k++) { PHF.tufts.push(null); PHF.flowers.push(null); }
  const put = (arr, list) => list.forEach((t, k) => { const i = Math.floor((t.x + 100) / c), j = Math.floor((t.z + 100) / c); if (i < 0 || j < 0 || i >= n || j >= n) return; const id = j * n + i; (arr[id] || (arr[id] = [])).push(k); });
  put(PHF.tufts, WORLD.props.tufts); put(PHF.flowers, WORLD.props.flowers);
  // bare ground makes natural firebreaks: only cells with grass or flowers burn
  for (let k = 0; k < n * n; k++) if (!PHF.tufts[k] && !PHF.flowers[k]) PHF.fuel[k] = 0;
}
function phCellAt(x, z) { const i = Math.floor((x + 100) / PHF.cell), j = Math.floor((z + 100) / PHF.cell); return i < 0 || j < 0 || i >= PHF.n || j >= PHF.n ? -1 : j * PHF.n + i; }
function phIgniteCell(id) {
  if (id < 0 || !PHF.fuel[id] || PHF.st[id] !== 0) return;
  PHF.st[id] = 3.5 + Math.random() * 2.5; PHF.act.push(id);
}
function igniteAt(pos, radius = 1.2) {
  if (!PH.ready) return;
  if (phRain() > 0.6) { for (let k = 0; k < 6; k++) particle(V.add(pos, [rand(-0.3, 0.3), 0.2, rand(-0.3, 0.3)]), [0, rand(0.5, 1), 0], 1, 0.2, [0.7, 0.7, 0.72, 0.4], -0.3, 1, 0.3); return; }
  const r = Math.max(radius, 0.5);
  if (pos[1] - heightAt(pos[0], pos[2]) < 2.5) {
    const c = PHF.cell, n = Math.ceil(r / c);
    const ci = Math.floor((pos[0] + 100) / c), cj = Math.floor((pos[2] + 100) / c);
    for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
      if (i < 0 || j < 0 || i >= PHF.n || j >= PHF.n) continue;
      const x = -100 + (i + 0.5) * c, z = -100 + (j + 0.5) * c;
      if (Math.hypot(x - pos[0], z - pos[2]) <= r + c * 0.5) phIgniteCell(j * PHF.n + i);
    }
  }
  for (const b of PH.bodies) for (const s of b.parts) {
    if (V.dist(s.c, pos) > r + s.br) continue;
    phIgnitePart(b, s);
  }
}
function phIgnitePart(b, s) {
  if (s.explosive) { phFuse(s, 1.3); phWake(b); return; }
  if (!s.wood || s.charred || s.burn > 0 || s.wet > 0) return;
  s.burn = 0.001; phWake(b);
}
function phFuse(s, t) { if (s.fuse < 0 || s.fuse > t) s.fuse = t; }
function phOwner(s) { for (const b of PH.bodies) if (b.parts.includes(s)) return b; return null; }
const PH_FLAME = [1.9, 0.62, 0.12, 0.9], PH_FLAME2 = [2.3, 1.15, 0.3, 0.95], PH_FLAME3 = [1.3, 0.28, 0.05, 0.8];
function phFlame(x, y, z, k = 1) {
  // tongues: bright yellow cores low down, orange and red licks that rise, drift with the wind and shrink away
  const w = phWind(), r = Math.random(), core = r < 0.3;
  particle([x + rand(-0.16, 0.16) * k, y + (core ? 0 : rand(0, 0.15) * k), z + rand(-0.16, 0.16) * k], [rand(-0.2, 0.2) + w[0] * 0.3, rand(0.8, 1.6) * Math.sqrt(k) * (core ? 0.6 : 1), rand(-0.2, 0.2) + w[1] * 0.3],
    core ? rand(0.2, 0.35) : rand(0.3, 0.55), (core ? rand(0.13, 0.22) : rand(0.11, 0.22)) * k, core ? PH_FLAME2 : (r < 0.75 ? PH_FLAME : PH_FLAME3), -2.5, 1.6, -0.36 * k);
}
function phSmoke(x, y, z, k = 1) {
  const w = phWind();
  particle([x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2)], [w[0] * 0.4 + rand(-0.2, 0.2), rand(0.8, 1.6), w[1] * 0.4 + rand(-0.2, 0.2)], rand(1.4, 2.4), rand(0.2, 0.35) * k, [0.13, 0.12, 0.11, 0.42], -0.4, 0.6, 0.55);
}
function phEmber(x, y, z) { particle([x, y, z], [rand(-0.6, 0.6), rand(1.5, 3.5), rand(-0.6, 0.6)], rand(0.6, 1.4), rand(0.02, 0.04), [3.2, 1.5, 0.4, 1], -1.0, 1.2); }
function phFireStep(dt) {
  const rain = phRain(), wind = phWind(), wl = Math.hypot(wind[0], wind[1]);
  PHF.tick += dt;
  // burning grass cells
  if (PHF.tick >= 0.1) {
    const T = PHF.tick; PHF.tick = 0;
    const n = PHF.n, act = PHF.act;
    for (let k = act.length - 1; k >= 0; k--) {
      const id = act[k];
      PHF.st[id] -= T * (1 + rain * 6);
      if (PHF.st[id] <= 0) { PHF.st[id] = -1; act.splice(k, 1); phScorch(id); continue; }
      if (rain > 0.5) continue;
      const i = id % n, j = (id - i) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const nid = jj * n + ii; if (PHF.st[nid] !== 0 || !PHF.fuel[nid]) continue;
        const dl = Math.hypot(di, dj), along = wl > 0.01 ? (di * wind[0] + dj * wind[1]) / (dl * wl) : 0;
        const pr = (dl > 1 ? 0.02 : 0.036) * (1 + Math.max(0, along) * Math.min(wl, 3) * 1.2) * (1 - Math.max(0, -along) * 0.6) * (1 - rain);
        if (Math.random() < pr * T * 10) phIgniteCell(nid);
      }
    }
    // flames: a particle budget shared by the burning cells near the camera
    const near = PHF.near; near.length = 0;
    for (let k = 0; k < act.length; k++) { const id = act[k], x = -100 + (id % n + 0.5) * PHF.cell, z = -100 + (Math.floor(id / n) + 0.5) * PHF.cell; if (Math.abs(x - cam.pos[0]) < 45 && Math.abs(z - cam.pos[2]) < 45) near.push(id); }
    const per = near.length ? Math.min(1.5, 50 / near.length) : 0;
    for (let k = 0; k < near.length; k++) {
      const id = near[k], i = id % n, j = (id - i) / n, life = PHF.st[id];
      for (let q = 0; q < per; q++) {
        if (q + 1 > per && Math.random() > per - q) break;
        const x = -100 + (i + Math.random()) * PHF.cell, z = -100 + (j + Math.random()) * PHF.cell, y = heightAt(x, z);
        phFlame(x, y + 0.05, z, life > 1.2 ? 1.4 : 0.9);
      }
      if (Math.random() < 0.3 * Math.min(1, per)) { const x = -100 + (i + Math.random()) * PHF.cell, z = -100 + (j + Math.random()) * PHF.cell; phSmoke(x, heightAt(x, z) + 1, z, 1.4); }
      if (Math.random() < 0.15) { const x = -100 + (i + Math.random()) * PHF.cell, z = -100 + (j + Math.random()) * PHF.cell; phEmber(x, heightAt(x, z) + 0.4, z); }
    }
    // grass fire hurts whoever stands in it and lights wood lying in it
    const p = player, pid = phCellAt(p.pos[0], p.pos[2]);
    if (pid >= 0 && PHF.st[pid] > 0 && p.pos[1] - heightAt(p.pos[0], p.pos[2]) < 1.2) hurt([-100 + (pid % n + 0.5) * PHF.cell, p.pos[1], -100 + (Math.floor(pid / n) + 0.5) * PHF.cell]);
    for (const f of foes) { if (!f.alive) continue; const fid = phCellAt(f.pos[0], f.pos[2]); if (fid >= 0 && PHF.st[fid] > 0 && (f.fireT || 0) < PH.time) { f.fireT = PH.time + 1.1; damageFoe(f, V.norm([rand(-1, 1), 0, rand(-1, 1)]), 1); } }
    for (const b of PH.bodies) {
      if (b.carried) continue;
      for (const s of b.parts) { if (!s.wood && !s.explosive) continue; const cid = phCellAt(s.c[0], s.c[2]); if (cid >= 0 && PHF.st[cid] > 0 && s.c[1] - s.br - heightAt(s.c[0], s.c[2]) < 0.4) phIgnitePart(b, s); }
    }
    if (act.length && Math.random() < 0.5) { const id = act[(Math.random() * act.length) | 0]; const x = -100 + (id % n + 0.5) * PHF.cell, z = -100 + (Math.floor(id / n) + 0.5) * PHF.cell; if (Math.hypot(x - p.pos[0], z - p.pos[2]) < 25) phSfx('crackle'); }
  }
  // burning parts, fuses, torches
  for (let bi = PH.bodies.length - 1; bi >= 0; bi--) {
    const b = PH.bodies[bi]; if (!b) continue;
    for (let si = b.parts.length - 1; si >= 0; si--) {
      const s = b.parts[si];
      const under = s.c[1] < phWaterY(s.c[0], s.c[2]) + 0.05;
      if (under) { if (s.burn > 0 || (s.lit && s.torch)) { for (let k = 0; k < 8; k++) particle(V.add(s.c, [rand(-0.2, 0.2), 0.2, rand(-0.2, 0.2)]), [0, rand(1, 2), 0], 1, 0.25, [0.8, 0.8, 0.82, 0.4], -0.3, 1, 0.4); phSfx('hiss'); } s.burn = 0; s.lit = false; if (s.fuse > 0.2) s.fuse = -1; s.wet = 3; }
      s.wet = Math.max(0, s.wet - dt);
      if (s.fuse >= 0) {
        s.fuse -= dt;
        if (Math.random() < dt * 30) { const t = V.add(s.c, [s.ax[0] * s.hl, s.ax[1] * s.hl, s.ax[2] * s.hl]); particle(t, [rand(-1, 1), rand(1, 2.5), rand(-1, 1)], 0.3, 0.05, [3, 2, 0.6, 1], 3, 1); }
        if (s.fuse < 0) { physExplode(s.c.slice(), 4.8, 1, b, s); break; }
      }
      if (s.torch && !s.lit && s.wet <= 0 && rain < 0.7) {
        const tp = [s.c[0] + s.ax[0] * s.hl, s.c[1] + s.ax[1] * s.hl, s.c[2] + s.ax[2] * s.hl];
        let lit = false;
        for (const f of PH.fires) if (f.lit > 0.3 && Math.hypot(tp[0] - f.x, (tp[1] - (f.y + 0.3)) * 0.6, tp[2] - f.z) < 0.8 * f.s + 0.25) lit = true;
        const cid = phCellAt(tp[0], tp[2]); if (cid >= 0 && PHF.st[cid] > 0 && tp[1] - heightAt(tp[0], tp[2]) < 1.2) lit = true;
        if (!lit) for (const o of PH.bodies) { if (o === b) continue; for (const q of o.parts) if (q.burn > 0.5 && V.dist(q.c, tp) < q.br + 0.35) lit = true; }
        if (lit) { s.lit = true; phSfx('ignite'); for (let k = 0; k < 8; k++) phFlame(tp[0], tp[1], tp[2], 0.6); }
      }
      if (s.torch && s.lit) {
        const tp = [s.c[0] + s.ax[0] * s.hl, s.c[1] + s.ax[1] * s.hl, s.c[2] + s.ax[2] * s.hl];
        if (rain > 0.7 && !b.carried) { s.lit = false; continue; }
        if (Math.random() < dt * 22) phFlame(tp[0], tp[1], tp[2], 0.55);
        if (Math.random() < dt * 3) phSmoke(tp[0], tp[1] + 0.3, tp[2], 0.5);
        // the flame lights what it touches
        if (Math.random() < dt * 6) phTouchIgnite(tp, 0.45, b);
      }
      if (s.burn > 0) {
        s.burn += dt * (1 + rain * 4);
        const life = s.burn / s.fuel;
        if (rain > 0.5 && s.burn > 1.5) { s.burn = 0; s.charred = Math.max(s.charred, 0.5); continue; }
        if (life >= 1) { s.burn = 0; s.charred = 1; for (let k = 0; k < 10; k++) phSmoke(s.c[0], s.c[1] + 0.3, s.c[2], 1); continue; }
        s.charred = Math.max(s.charred, life);
        const inten = Math.sin(Math.min(1, life * 1.3) * Math.PI) * 0.5 + 0.5;
        let rate = dt * (28 + s.br * 40) * Math.min(1, s.burn * 1.5 + 0.2) * inten;
        while (rate > 0 && Math.random() < rate) {
          rate -= 1;
          const R = s.R, e = s.h || [s.r, s.hl || s.r, s.r], lx = rand(-1, 1) * e[0], ly = rand(0.2, 1) * e[1], lz = rand(-1, 1) * e[2];
          phFlame(s.c[0] + R[0] * lx + R[3] * ly + R[6] * lz, s.c[1] + Math.abs(R[1] * lx + R[4] * ly + R[7] * lz) * 0.5 + 0.1, s.c[2] + R[2] * lx + R[5] * ly + R[8] * lz, 0.8 + s.br * 0.3);
        }
        if (Math.random() < dt * 2.5 * inten) phSmoke(s.c[0], s.c[1] + s.br, s.c[2], 1);
        if (Math.random() < dt * 1.5) phEmber(s.c[0], s.c[1] + s.br * 0.5, s.c[2]);
        if (s.burn > 1.2 && Math.random() < dt * 3) phTouchIgnite(s.c, s.br + 0.5, null);
        if (V.dist(s.c, player.pos) < s.br + 0.5 && PH.carry !== b) hurt(s.c);
      }
    }
  }
  // campfires and braziers
  for (const f of PH.fires) {
    if (rain > 0.7 && !f.roof) { f.lit = Math.max(0, f.lit - dt * 0.5); } else f.lit = Math.min(1, f.lit + dt * 0.3);
    if (f.lit < 0.1) continue;
    if (Math.random() < dt * 26 * f.lit) phFlame(f.x + rand(-0.2, 0.2) * f.s, f.y, f.z + rand(-0.2, 0.2) * f.s, 0.9 * f.s);
    if (Math.random() < dt * 3) phSmoke(f.x, f.y + 0.9 * f.s, f.z, f.s);
    if (Math.random() < dt * 4) phEmber(f.x, f.y + 0.3, f.z);
    if (Math.random() < dt * 5) phTouchIgnite([f.x, f.y + 0.2, f.z], 0.7 * f.s, null, true);
  }
}
function phTouchIgnite(pos, r, except, noGrass = false) {
  for (const b of PH.bodies) {
    if (b === except) continue;
    for (const s of b.parts) { if (!s.wood && !s.explosive) continue; if (V.dist(s.c, pos) < r + s.br * 0.8) phIgnitePart(b, s); }
  }
  if (!noGrass && pos[1] - heightAt(pos[0], pos[2]) < 0.6) phIgniteCell(phCellAt(pos[0], pos[2]));
}
// darken the burnt ground: terrain vertex colours plus the grass and flowers in the cell
function phScorch(id) {
  if (!GR.device) return;
  const n = PHF.n, i = id % n, j = (id - i) / n, x0 = -100 + i * PHF.cell, z0 = -100 + j * PHF.cell;
  const N = WORLD.n, S = WORLD.size, tc = WORLD.cell, tm = WORLD.terrainMesh;
  const i0 = clamp(Math.floor((x0 + S / 2) / tc), 0, N), i1 = clamp(Math.ceil((x0 + PHF.cell + S / 2) / tc), 0, N);
  const j0 = clamp(Math.floor((z0 + S / 2) / tc), 0, N), j1 = clamp(Math.ceil((z0 + PHF.cell + S / 2) / tc), 0, N);
  const burnt = [0.085, 0.036, 0.024];   // a touch of red keeps the terrain shader from re-greening it
  for (let jj = j0; jj <= j1; jj++) {
    const row = new Float32Array((i1 - i0 + 1) * 10);
    for (let ii = i0; ii <= i1; ii++) {
      const v = jj * (N + 1) + ii, o = (ii - i0) * 10, e = ii === i0 || ii === i1 || jj === j0 || jj === j1 ? 0.5 : 0.85;
      const k = e * (0.85 + 0.15 * hash2(ii * 7, jj * 3)) * 1.08;
      if (!tm.scorch) tm.scorch = new Float32Array(tm.vcount);
      tm.scorch[v] = Math.max(tm.scorch[v], Math.min(0.95, k));
      const kk = tm.scorch[v];
      row.set([tm.p[v * 3], tm.p[v * 3 + 1], tm.p[v * 3 + 2], tm.n[v * 3], tm.n[v * 3 + 1], tm.n[v * 3 + 2], lerp(tm.c[v * 4], burnt[0], kk), lerp(tm.c[v * 4 + 1], burnt[1], kk), lerp(tm.c[v * 4 + 2], burnt[2], kk), 0], o);
    }
    GR.device.queue.writeBuffer(GR.terrVB, (jj * (N + 1) + i0) * 40, row);
  }
  const grp = (name) => GR.staticGroups && GR.staticGroups.find(g => g.mesh === name);
  const tg = grp('tuft'), fg = grp('flower'), one = new Float32Array(INST_FLOATS);
  if (tg && PHF.tufts[id]) for (const k of PHF.tufts[id]) {
    const t = WORLD.props.tufts[k]; if (k >= tg.count) continue;
    const m = at(t.x, t.y - 0.03, t.z); M4.rotY(m, t.yaw); M4.scale(m, t.s * 0.7, t.s * 0.18, t.s * 0.7);
    one.set(m, 0); one.set([0.06, 0.05, 0.04, 0], 16); one.set([0.9, 0, 0.02, 0], 20);
    GR.device.queue.writeBuffer(GR.staticIB, (tg.first + k) * INST_FLOATS * 4, one);
  }
  if (fg && PHF.flowers[id]) for (const k of PHF.flowers[id]) {
    const f = WORLD.props.flowers[k]; if (k >= fg.count) continue;
    const m = at(f.x, f.y - 0.3, f.z); M4.scale(m, 0.001);
    one.set(m, 0); one.set([0, 0, 0, 0], 16); one.set([0.8, 0, 0, 0], 20);
    GR.device.queue.writeBuffer(GR.staticIB, (fg.first + k) * INST_FLOATS * 4, one);
  }
}
// explosions: damage, impulses, fire, particles and a shake
function physExplode(pos, radius = 4.5, power = 1, body = null, part = null) {
  if (body && part) phRemovePart(body, part);
  const R = radius, p = player;
  shake(0.9); hitstop(0.05); rumble(0.9, 260); phSfx('boom', clamp(1 - V.dist(pos, p.pos) / 40, 0.2, 1));
  particle(pos, [0, 0.5, 0], 0.14, R * 0.45, [3.2, 1.7, 0.6, 1], 0, 0, R * 2);
  for (let k = 0; k < 60; k++) { const d = V.norm([rand(-1, 1), rand(-0.2, 1), rand(-1, 1)]); particle(V.add(pos, V.mul(d, 0.3)), V.mul(d, rand(3, 10)), rand(0.35, 0.7), rand(0.45, 0.95), Math.random() < 0.5 ? [3.2, 1.6, 0.4, 0.95] : [2.8, 0.9, 0.25, 0.9], -2, 4, 0.6); }
  PH.later.push({ t: 0.22, fn: () => { for (let k = 0; k < 24; k++) { const d = V.norm([rand(-1, 1), rand(0, 1), rand(-1, 1)]); particle(V.add(pos, V.mul(d, rand(0.4, 1.4))), V.mul(d, rand(0.8, 2.6)), rand(1.8, 3.4), rand(0.5, 0.9), [0.1, 0.09, 0.085, 0.55], -0.7, 1.2, 1.0); } } });
  for (let k = 0; k < 16; k++) { const d = V.norm([rand(-1, 1), rand(0.3, 1), rand(-1, 1)]); particle(pos, V.mul(d, rand(5, 11)), rand(0.6, 1.1), rand(0.04, 0.08), [0.25, 0.16, 0.08, 1], 16, 0.5); }
  ring(V.add(pos, [0, 0.15 - (pos[1] - heightAt(pos[0], pos[2])), 0]), [3, 1.6, 0.6, 0.9], R * 1.1);
  for (const b of PH.bodies.slice()) {
    if (b.carried) continue;
    const d = V.sub(b.pos, pos), dl = V.len(d);
    if (dl > R + b.rad) continue;
    const k = power * 14 * (1 - clamp(dl / (R + b.rad), 0, 1)) * Math.min(b.mass, 4) + 1;
    const dir = V.norm(V.add(d, [0, 0.6, 0]));
    phImpulse(b, b.pos[0] + rand(-0.2, 0.2), b.pos[1] + rand(-0.2, 0.2), b.pos[2] + rand(-0.2, 0.2), dir[0] * k, dir[1] * k, dir[2] * k);
    for (const s of b.parts) { if (s.explosive && s !== part && V.dist(s.c, pos) < R) phFuse(s, rand(0.12, 0.3)); else if (s.wood && V.dist(s.c, pos) < R * 0.7) phIgnitePart(b, s); }
  }
  for (const f of foes) if (f.alive && V.dist(f.pos, pos) < R) { const dir = V.norm(V.sub(f.pos, pos)); if (V.dist(f.pos, pos) < R * 0.7) killFoe(f, dir); else damageFoe(f, dir, 1); }
  if (V.dist(V.add(p.pos, [0, 0.8, 0]), pos) < R * 0.75) { hurt(pos); if (p.deadT <= 0) { const d = V.norm(V.sub(p.pos, pos)); p.vel[0] = d[0] * 11; p.vel[2] = d[2] * 11; p.vel[1] = 9; } }
  igniteAt(pos, R * 0.55);
}

// ---------- updraft: fire lifts the glider ----------
function phUpdraft(dt) {
  const p = player; if (!p.glide && !(p.jumps >= 1 && !p.onGround && keys.jump)) return;
  let lift = 0;
  const test = (x, y, z, r, strength) => { const dx = p.pos[0] - x, dz = p.pos[2] - z, dh = p.pos[1] - y; if (dh < -0.5 || dh > 20) return; const d = Math.hypot(dx, dz); if (d < r) lift = Math.max(lift, strength * (1 - d / r) * (1 - dh / 22)); };
  for (const f of PH.fires) if (f.lit > 0.3) test(f.x, f.y, f.z, 2.4, 9);
  for (const b of PH.bodies) for (const s of b.parts) if (s.burn > 0.8) test(s.c[0], s.c[1], s.c[2], 2.6, 9);
  const ci = Math.floor((p.pos[0] + 100) / PHF.cell), cj = Math.floor((p.pos[2] + 100) / PHF.cell);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    if (i < 0 || j < 0 || i >= PHF.n || j >= PHF.n || PHF.st[j * PHF.n + i] <= 0) continue;
    const x = -100 + (i + 0.5) * PHF.cell, z = -100 + (j + 0.5) * PHF.cell;
    test(x, heightAt(x, z), z, 2.8, 10);
  }
  if (lift > 0.5) {
    p.pos[1] += lift * dt; p.vel[1] = Math.max(p.vel[1], -0.4);
    if (Math.random() < dt * 20) particle(V.add(p.pos, [rand(-1, 1), rand(-1.5, 0), rand(-1, 1)]), [0, rand(3, 6), 0], 0.5, 0.05, [1.6, 1.3, 1.0, 0.35], 0, 0.5);
  }
}

// ---------- environment hooks from the world module (optional) ----------
function phRain() {
  try { if (typeof rainAmount === 'number') return rainAmount; } catch (_) { }
  try {
    if (typeof weather === 'object' && weather) {
      const w = weather, v = w.rain ?? w.rainAmount ?? w.intensity ?? w.wet ?? 0;
      return typeof v === 'boolean' ? (v ? 1 : 0) : (+v || 0);
    }
  } catch (_) { }
  return 0;
}
const _wind = [0, 0];
function phWind() {
  _wind[0] = 0; _wind[1] = 0;
  try {
    if (typeof wind !== 'undefined' && wind) {
      if (Array.isArray(wind) || wind.length !== undefined) { if (wind.length >= 3) { _wind[0] = +wind[0] || 0; _wind[1] = +wind[2] || 0; } else { _wind[0] = +wind[0] || 0; _wind[1] = +wind[1] || 0; } }
      else if (typeof wind === 'object') { _wind[0] = +(wind.x ?? (wind.dir ? wind.dir[0] * (wind.strength || wind.speed || 1) : 0)) || 0; _wind[1] = +(wind.z ?? (wind.dir ? wind.dir[wind.dir.length - 1] * (wind.strength || wind.speed || 1) : 0)) || 0; }
    }
  } catch (_) { }
  return _wind;
}

// ---------- sound ----------
function phSfx(n, k = 1) {
  if (typeof AC === 'undefined' || !AC || muted) return;
  switch (n) {
    case 'wood': noise(0.09, 0.06 + k * 0.1, 420 + Math.random() * 200, 'bandpass', 0, 1.5); tone('triangle', 190 + Math.random() * 40, 110, 0.1, 0.04 + k * 0.06); break;
    case 'rock': noise(0.14, 0.08 + k * 0.14, 240, 'lowpass'); tone('sine', 90, 50, 0.14, 0.06 + k * 0.1); break;
    case 'boom': tone('sine', 95, 28, 0.9, 0.5 * k); noise(1.1, 0.5 * k, 320, 'lowpass'); noise(0.45, 0.3 * k, 1500, 'bandpass', 0.02); tone('sawtooth', 60, 30, 0.5, 0.1 * k); break;
    case 'grab': tone('triangle', 420, 880, 0.18, 0.06); tone('sine', 1320, 1760, 0.2, 0.03, 0.05); break;
    case 'drop': tone('triangle', 700, 380, 0.14, 0.05); break;
    case 'hum': tone('sine', 520, 780, 0.25, 0.04); tone('sine', 1040, 1180, 0.3, 0.02, 0.05); break;
    case 'glue': tone('square', 330, 660, 0.09, 0.04); tone('triangle', 990, 1480, 0.18, 0.06, 0.06); noise(0.12, 0.05, 2600, 'bandpass', 0.02); break;
    case 'unglue': tone('triangle', 900, 400, 0.2, 0.06); noise(0.2, 0.06, 1800); break;
    case 'crackle': for (let i = 0; i < 3; i++) noise(0.02 + Math.random() * 0.03, 0.03, 2500 + Math.random() * 2500, 'highpass', Math.random() * 0.2); break;
    case 'hiss': noise(0.6, 0.08, 4000, 'highpass'); break;
    case 'ignite': noise(0.5, 0.1, 700, 'bandpass', 0, 0.8); break;
  }
}

// ---------- input: own listeners so the shared key map stays untouched ----------
function phKeyDown(e) {
  if (typeof state === 'undefined' || state.mode !== 'play' || !PH.ready) return;
  const c = e.code, H = PH.hand, holding = H.on && H.body;
  const eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (holding && (c === 'KeyQ' || c === 'KeyE')) { eat(); keys[c === 'KeyQ' ? 'physNear' : 'physFar'] = true; return; }
  if (holding && (c === 'KeyZ' || c === 'KeyX')) { eat(); if (!e.repeat) PH.act[c === 'KeyZ' ? 'rotY' : 'rotX'] = true; return; }
  if (e.repeat) { if (c === 'KeyF' || c === 'KeyG' || c === 'KeyT' || c === 'KeyV') eat(); return; }
  if (c === 'KeyF') { eat(); PH.act.lift = true; }
  else if (c === 'KeyG') { eat(); PH.act.hand = true; }
  else if (c === 'KeyT') { eat(); PH.act.glue = true; }
  else if (c === 'KeyV') { eat(); PH.act.unglue = true; }
}
function phKeyUp(e) {
  if (e.code === 'KeyQ' && keys.physNear) { keys.physNear = false; e.stopImmediatePropagation(); }
  if (e.code === 'KeyE' && keys.physFar) { keys.physFar = false; e.stopImmediatePropagation(); }
}
function phPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const prev = PH.padPrev[gp.index] || [], edge = i => b(i) && !prev[i];
    if (edge(3)) PH.act.hand = true;       // Y: Mano Maestra / grab / drop
    if (edge(4)) PH.act.lift = true;       // LB: lift / throw
    if (edge(6)) PH.act.glue = true;       // LT: glue
    if (edge(11)) PH.act.unglue = true;    // R3: release all / unglue
    if (PH.hand.body) {
      keys.physFar = b(12); keys.physNear = b(13);   // d-pad up/down: distance
      if (edge(14)) PH.act.rotY = true; if (edge(15)) PH.act.rotX = true;   // d-pad left/right: rotate
    }
    PH.padPrev[gp.index] = gp.buttons.map((_, i) => b(i));
  }
}
function phTouch() {
  // one touch button: tap = lift/throw near small things, else Mano Maestra (aim, grab, glue when touching, drop); hold = release all
  const on = !!(input.touchBtn && input.touchBtn.phys);
  if (on && PH.touchT < 0) PH.touchT = PH.time;
  if (on && PH.touchT >= 0 && PH.time - PH.touchT > 0.6 && !PH.touchLong) { PH.touchLong = true; PH.act.unglue = true; if (PH.hand.on && !PH.hand.body) PH.hand.on = false; }
  if (!on && PH.touchT >= 0) {
    if (!PH.touchLong) {
      const H = PH.hand;
      if (PH.carry) PH.act.lift = true;
      else if (H.on && H.body) { if (H.glueTo) PH.act.glue = true; else PH.act.hand = true; }
      else if (!H.on && phNearestLiftable()) PH.act.lift = true;
      else PH.act.hand = true;
    }
    PH.touchT = -1; PH.touchLong = false;
  }
}
function phActions() {
  const A = PH.act, H = PH.hand;
  if (A.lift) { if (H.on && !H.body) H.on = false; if (!H.on) phLift(); }
  if (A.hand) { if (PH.carry) phThrow(true); phHandToggle(); }
  if (A.glue) phGlue();
  if (A.unglue) { if (H.body) phUnglue(); else if (PH.carry) phThrow(true); }
  if (A.rotY && H.body) { H.yawAdd += Math.PI / 4; phSfx('drop'); }
  if (A.rotX && H.body) { H.pitchAdd += Math.PI / 4; phSfx('drop'); }
  PH.act = {};
}

// ---------- carry / telekinesis pose on top of the hero's procedural pose ----------
if (typeof computePose === 'function') computePose = (function (orig) {
  return function (st, t) {
    const o = orig(st, t);
    if (PH.carry && PH.carry.parts[0].torch) {
      o.hr = [-0.24, 1.06, 0.3]; o.sword = 'back'; o.blade = null;
    } else if (PH.carry && (st === 'idle' || st === 'run' || st === 'rise' || st === 'fall' || st === 'charge' || st === 'attack')) {
      const s = PH.carry.parts[0], w = s.type === PHB ? Math.min(s.h[0], 0.24) : Math.min(s.r || 0.24, 0.24);
      const k = Math.min(1, PH.carryT * 5), y = lerp(1.0, 1.8, k);
      o.hl = [w * 0.85 + 0.03, y, 0.09]; o.hr = [-(w * 0.85 + 0.03), y, 0.09];
      o.sword = 'back'; o.blade = null; o.lean = Math.min(o.lean, 0.06) - 0.05; o.twC *= 0.3; o.mouth = 0.35; o.lookOff = [0, -0.15];
      if (st === 'charge' || st === 'attack') o.spinYaw = 0;
    } else if (PH.throwT > 0) {
      o.hl = [0.18, 1.45, 0.42]; o.hr = [-0.18, 1.45, 0.42]; o.lean += 0.15; o.sword = 'back'; o.blade = null;
    } else if (PH.hand.on && (st === 'idle' || st === 'run' || st === 'rise' || st === 'fall')) {
      // right arm reaches toward the held (or aimed) object, palm open
      const tg = PH.hand.body ? PH.hand.body.pos : (PH.hand.target ? PH.hand.target.pos : null), p = player;
      let d = [0, 0.1, 1];
      if (tg) { const w = V.norm(V.sub(tg, V.add(p.pos, [0, 1.4, 0]))); d = V.rotY(w, -(p.yaw + (o.spinYaw || 0))); }
      o.hr = V.add([-0.2, 1.38, 0.05], V.mul(d, 0.5)); o.sword = 'back'; o.blade = null;
      if (st === 'idle') { o.hl = [0.3, 0.95, 0.02]; o.fl = [0.15, 0.09, 0.08]; o.fr = [-0.14, 0.09, -0.1]; }
      o.lookOff = [0, 0];
    }
    return o;
  };
})(computePose);

// ---------- HUD ----------
function phHudInit() {
  const st = document.createElement('style');
  st.textContent = `#physHud{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);transform:translateX(-50%);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;pointer-events:none;z-index:5;max-width:calc(100% - 32px);transition:opacity .25s}
#physHud:empty{opacity:0}
#physHud span{background:rgba(18,20,36,.62);border:1px solid rgba(255,248,236,.22);border-radius:999px;padding:4px 10px;font-weight:800;font-size:12.5px;color:#fff8ec;white-space:nowrap;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#physHud span.mm{border-color:rgba(160,255,110,.6);color:#d9ffc4}
#physHud kbd{font-family:inherit;font-weight:900;font-size:11px;background:rgba(255,248,236,.16);border:1px solid rgba(255,248,236,.3);border-bottom-width:2px;border-radius:5px;padding:0 5px;margin-right:4px}
#physRet{position:fixed;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid rgba(170,255,120,.85);box-shadow:0 0 10px rgba(140,255,90,.6),inset 0 0 8px rgba(140,255,90,.4);pointer-events:none;z-index:5;display:none}
#physRet.on{display:block}#physRet.hit{border-color:#fff27a;box-shadow:0 0 14px rgba(255,240,110,.9)}
#touch .tb.phys{width:56px;height:56px;right:176px;bottom:24px;font-size:11px}`;
  document.head.appendChild(st);
  const hud = document.createElement('div'); hud.id = 'physHud'; hud.setAttribute('aria-live', 'polite'); document.body.appendChild(hud);
  const ret = document.createElement('div'); ret.id = 'physRet'; document.body.appendChild(ret);
  const btns = document.querySelector('#touch .btns');
  if (btns) { const b = document.createElement('button'); b.className = 'tb phys'; b.dataset.k = 'phys'; b.textContent = 'Mano'; b.setAttribute('aria-label', 'Levantar, Mano Maestra y pegar'); btns.appendChild(b); }
  const add = (id, rows) => { const dl = document.getElementById(id); if (!dl) return; for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.innerHTML = k; const dd = document.createElement('dd'); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); } };
  add('ctlKb', [['<kbd>F</kbd>', 'Levantar, cargar y lanzar objetos pequeños'], ['<kbd>G</kbd>', 'Mano Maestra: apunta, agarra (G o clic) y suelta'], ['<kbd>Q</kbd><kbd>E</kbd> / rueda', 'Con un objeto agarrado: acercar / alejar (la cámara lo sube o baja)'], ['<kbd>Z</kbd><kbd>X</kbd>', 'Girar el objeto agarrado 45°'], ['<kbd>T</kbd>', 'Pegar el objeto agarrado al que toca (construye puentes, balsas, torres)'], ['<kbd>V</kbd>', 'Soltar todo y despegar la construcción agarrada']]);
  add('ctlPad', [['LB', 'Levantar / lanzar'], ['Y', 'Mano Maestra: agarrar / soltar'], ['Cruceta', 'Distancia (arriba/abajo) · girar (izq./der.)'], ['LT', 'Pegar'], ['R3', 'Soltar todo / despegar']]);
  add('ctlTouch', [['Mano', 'Toca: levantar/lanzar o Mano Maestra (agarrar, pegar si toca otro objeto, soltar) · mantén: soltar todo']]);
  PH.hudEl = hud; PH.retEl = ret;
}
function phHudStep(dt) {
  PH.hudT -= dt; if (PH.hudT > 0) return; PH.hudT = 0.15;
  const H = PH.hand, touch = isTouch, K = (k, t) => touch ? `<span>${t}</span>` : `<span><kbd>${k}</kbd>${t}</span>`;
  let s = '';
  if (state.mode === 'play' && player.deadT <= 0) {
    if (PH.carry) s = K('F', 'Lanzar') + K('V', 'Dejar');
    else if (H.on && H.body) s = `<span class="mm">Mano Maestra</span>` + (touch ? '' : K('Q/E', 'Distancia') + K('Z/X', 'Girar')) + (H.glueTo ? K('T', '¡Pegar!') : '') + K('G', 'Soltar') + (H.body.parts.length > 1 ? K('V', 'Despegar') : '');
    else if (H.on) s = `<span class="mm">Mano Maestra</span>` + (H.target ? K('G', 'Agarrar') : '<span>Apunta a un objeto</span>') + K('F', 'Salir');
    else if (phNearestLiftable()) s = K('F', 'Levantar') + K('G', 'Mano Maestra');
  }
  if (s !== PH.hudTxt) { PH.hudTxt = s; PH.hudEl.innerHTML = s; }
  const ret = PH.retEl, on = H.on && !H.body && state.mode === 'play';
  ret.classList.toggle('on', on); ret.classList.toggle('hit', on && !!H.target);
}

// ---------- meshes ----------
function phBox(m, c, h, colFn, div = [2, 2, 2], M = null) {
  // subdivided box with flat faces; colFn(local point, normal, u, v) -> colour
  for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, nu = div[u], nv = div[v], base = m.vcount;
    const n = [0, 0, 0]; n[ax] = sg;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const p = [0, 0, 0]; p[ax] = sg * h[ax]; p[u] = -h[u] + 2 * h[u] * i / nu; p[v] = -h[v] + 2 * h[v] * j / nv;
      const col = colFn(p, n, i / nu, j / nv);
      let wp = V.add(p, c), wn = n;
      if (M) { wp = M4.apply(M, wp); wn = V.norm(M4.applyDir(M, n)); }
      m.v(wp, wn, col);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1;
      if (sg > 0) { m.tri(a, b, d); m.tri(a, d, cc); } else { m.tri(a, d, b); m.tri(a, cc, d); }
    }
  }
  return m;
}
function phWood(base, seed, dark = 1) {
  // streaky grain along the board's longest axis
  return (p, n, u, v) => {
    const g = 0.5 + 0.5 * Math.sin((p[0] * 3.1 + p[1] * 2.3 + p[2] * 2.9) * 9 + noise3(p[0] * 4 + seed, p[1] * 4, p[2] * 4 - seed) * 7);
    const k = (0.8 + 0.2 * g + 0.14 * (hash2(Math.floor(p[0] * 40 + seed), Math.floor(p[2] * 40 + p[1] * 30)) - 0.5)) * dark;
    return [base[0] * k, base[1] * k, base[2] * k, 0];
  };
}
function phBuildMeshes(M) {
  const woodL = hexToRgb('#c0925a'), woodM = hexToRgb('#9a6b3c'), woodD = hexToRgb('#6e4726'), iron = [...hexToRgb('#4a4a50'), 4], ironL = [...hexToRgb('#8a8b90'), 4];
  // crate: planked faces, framed edges, diagonal braces, iron corner caps
  const crate = (H) => {
    const m = new Mesh(), t = 0.035, fw = H * 0.17, g = 0.012;
    for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
      const u = (ax + 1) % 3, v = (ax + 2) % 3, nb = 3, bw = (2 * H - (nb - 1) * g) / nb;
      for (let k = 0; k < nb; k++) {
        const c = [0, 0, 0], h = [0, 0, 0];
        c[ax] = sg * (H - t / 2 - 0.004); h[ax] = t / 2; c[u] = -H + bw / 2 + k * (bw + g); h[u] = bw / 2; c[v] = 0; h[v] = H - 0.004;
        const d = [2, 2, 2]; d[v] = 6; d[u] = 2;
        phBox(m, c, h, phWood(k % 2 ? woodL : V.mul(woodL, 0.93), ax * 7 + k + (sg > 0 ? 3 : 0)), d);
      }
      // frame battens on this face (along v and u edges)
      for (const s2 of [-1, 1]) {
        const c = [0, 0, 0], h = [0, 0, 0]; c[ax] = sg * (H - 0.012); h[ax] = 0.014; c[u] = s2 * (H - fw / 2); h[u] = fw / 2; h[v] = H - 0.002;
        const d = [2, 2, 2]; d[v] = 5; phBox(m, c, h, phWood(woodM, ax * 11 + s2), d);
        const c2 = [0, 0, 0], h2 = [0, 0, 0]; c2[ax] = sg * (H - 0.012); h2[ax] = 0.0135; c2[v] = s2 * (H - fw / 2); h2[v] = fw / 2; h2[u] = H - fw - 0.002;
        const d2 = [2, 2, 2]; d2[u] = 5; phBox(m, c2, h2, phWood(woodM, ax * 13 + s2 + 5), d2);
      }
      // diagonal brace on the side faces
      if (ax !== 1) {
        const L = (H - fw) * Math.SQRT2 * 1.0, Mx = M4.id();
        const c = [0, 0, 0]; c[ax] = sg * (H - 0.012);
        M4.translate(Mx, c[0], c[1], c[2]);
        const rotAx = [0, 0, 0]; rotAx[ax] = 1;
        if (ax === 0) M4.rotX(Mx, Math.PI / 4 * sg); else M4.rotZ(Mx, Math.PI / 4 * sg);
        const hh = [0, 0, 0]; hh[ax] = 0.0125; hh[1] = L; hh[ax === 0 ? 2 : 0] = fw / 2 * 0.9;
        phBox(m, [0, 0, 0], hh, phWood(V.mul(woodM, 1.05), ax * 17 + sg), [2, 6, 2], Mx);
      }
    }
    // iron corner caps with a rivet
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      phBox(m, [sx * (H - 0.03), sy * (H - 0.03), sz * (H - 0.03)], [0.034, 0.034, 0.034], () => iron, [1, 1, 1]);
      m.merge(ellipsoid([sx * (H + 0.004), sy * (H - 0.03), sz * (H - 0.03)], [0.008, 0.012, 0.012], ironL, 6, 4));
    }
    return m;
  };
  M.phCrate = crate(0.4); M.phCrateS = crate(0.27);
  // barrel: bulging staves (bark material gives each stave its grooves), iron hoops, lids
  const barrel = (red) => {
    const m = new Mesh(), r = 0.33, hl = 0.44, N = 15;
    const body = red ? hexToRgb('#b3251c') : woodM, band = hexToRgb('#f2c230');
    const rf = (t) => r * (0.9 + 0.1 * Math.sin(t * Math.PI));
    const tb = tubeMesh([0, -hl, 0], [0, hl, 0], rf, (t, an) => {
      const st = (an / TAU * N) % 1, edge = st < 0.08 || st > 0.92 ? 0.62 : 1, tone = 0.88 + 0.2 * hash2(Math.floor(an / TAU * N), red ? 3 : 1);
      let c = V.mul(body, edge * tone);
      if (red && Math.abs(t - 0.5) < 0.09) c = V.mul(band, edge);
      if (red && Math.abs(t - 0.5) < 0.05 && Math.abs(((an / TAU) * 3) % 1 - 0.5) < 0.12) c = V.mul(hexToRgb('#1b1010'), edge);
      return [...c, red ? 0 : 10];
    }, 45, 12, [false, false]);
    m.merge(tb);
    for (const y of [-hl + 0.07, -hl + 0.22, hl - 0.22, hl - 0.07]) {
      const t = (y + hl) / (2 * hl);
      m.merge(transformed(torusMesh(rf(t) + 0.006, 0.014, 40, 5, iron), at(0, y, 0)));
    }
    for (const sg of [-1, 1]) {
      const lid = cylMesh(24, r * 0.9, r * 0.9, 0.02, [...woodD, 0], true, (p) => { const k = 0.8 + 0.2 * Math.sin(p[0] * 60) + 0.1 * (Math.abs(p[0] % 0.11) < 0.008 ? -2 : 0); return [...V.mul(red ? hexToRgb('#8c1d16') : woodM, k), 0]; });
      m.merge(lid, at(0, sg > 0 ? hl - 0.035 : -hl + 0.015, 0));
      m.merge(transformed(torusMesh(r * 0.9, 0.018, 32, 5, [...V.mul(red ? body : woodM, 0.8), 0]), at(0, sg * (hl - 0.01), 0)));
    }
    if (red) { // fuse on top
      m.merge(tubeMesh([0.1, hl - 0.02, 0.05], [0.13, hl + 0.12, 0.08], () => 0.012, () => [...hexToRgb('#3a2a1a'), 2], 6, 3));
      m.merge(ellipsoid([0.13, hl + 0.125, 0.08], [0.02, 0.02, 0.02], [...hexToRgb('#ff5a2a'), 0], 6, 4));
    }
    return m;
  };
  M.phBarrel = barrel(false); M.phBomb = barrel(true);
  // round boulder (unit radius): weathered stone, lichen, moss cap
  M.phBoulder = ellipsoid([0, 0, 0], [1, 1, 1], (n0) => {
    const moss = smooth(0.5, 0.85, n0[1] + 0.2 * noise3(n0[0] * 3 + 4, n0[1] * 3, n0[2] * 3));
    const crack = smooth(0.04, 0.0, Math.abs(noise3(n0[0] * 2.5 + 9, n0[1] * 2.5, n0[2] * 2.5) - 0.5));
    let c = V.mul(COL.rock, 0.82 + 0.3 * noise3(n0[0] * 3.5, n0[1] * 3.5 + 2, n0[2] * 3.5));
    c = V.lerp(c, COL.moss, moss * 0.85); c = V.lerp(c, V.mul(c, 0.5), crack * 0.7);
    return c.concat([moss > 0.5 ? 8 : 11]);
  }, 30, 20, (q, n0) => V.mul(q, 0.95 + 0.07 * noise3(n0[0] * 1.7 + 3, n0[1] * 1.7, n0[2] * 1.7) + 0.025 * noise3(n0[0] * 6, n0[1] * 6, n0[2] * 6)));
  // log: gnarled bark cylinder with sawn ends showing growth rings, a cut branch stub
  {
    const m = new Mesh(), r = 0.23, L = 1.05 + 0.2, bark = hexToRgb('#6b4a30');
    const tb = tubeMesh([0, -L, 0], [0, L, 0], (t) => r * (1 + 0.04 * Math.sin(t * 9)), (t, an) => [...V.mul(bark, 0.85 + 0.25 * noise3(t * 6, an, 2)), 10], 18, 14, [false, false]);
    for (let k = 0; k < tb.vcount; k++) { const x = tb.p[k * 3], y = tb.p[k * 3 + 1], z = tb.p[k * 3 + 2], rr = Math.hypot(x, z), a = Math.atan2(z, x); const f = 1 + 0.06 * noise3(Math.cos(a) * 2, y * 1.5, Math.sin(a) * 2) + 0.03 * Math.abs(Math.sin(a * 9 + y * 2)); tb.p[k * 3] = x / rr * r * f; tb.p[k * 3 + 2] = z / rr * r * f; }
    tb.recomputeNormals(); m.merge(tb);
    for (const sg of [-1, 1]) {
      const base = m.vcount, RN = 6, SN = 18;
      m.v([0, sg * L, 0], [0, sg, 0], [...hexToRgb('#8a5a32'), 0]);
      for (let ri = 1; ri <= RN; ri++) for (let s = 0; s < SN; s++) {
        const a = s / SN * TAU, rr = r * ri / RN * (ri === RN ? 1.02 : 1), ring = ri === RN ? 0.45 : (ri % 2 ? 1 : 0.84);
        const c = ri === RN ? V.mul(bark, 0.8) : V.mul(hexToRgb('#d6ad74'), ring * (0.92 + 0.1 * Math.sin(a * 3)));
        m.v([Math.cos(a) * rr, sg * L, Math.sin(a) * rr], [0, sg, 0], [...c, 0]);
      }
      for (let s = 0; s < SN; s++) { const a = base + 1 + s, b = base + 1 + (s + 1) % SN; sg > 0 ? m.tri(base, b, a) : m.tri(base, a, b); }
      for (let ri = 1; ri < RN; ri++) for (let s = 0; s < SN; s++) {
        const a = base + 1 + (ri - 1) * SN + s, b = base + 1 + (ri - 1) * SN + (s + 1) % SN, c = a + SN, d = b + SN;
        if (sg > 0) { m.tri(a, b, d); m.tri(a, d, c); } else { m.tri(a, d, b); m.tri(a, c, d); }
      }
    }
    m.merge(tubeMesh([0.15, 0.35, 0.05], [0.33, 0.52, 0.1], (t) => lerp(0.06, 0.045, t), (t) => [...(t > 0.95 ? hexToRgb('#d6ad74') : V.mul(bark, 0.8)), 10], 8, 3, [false, true]));
    M.phLog = m;
  }
  // plank: grained board with nail heads
  {
    const m = new Mesh(), h = [0.24, 0.05, 1.25];
    phBox(m, [0, 0, 0], h, phWood(hexToRgb('#b88752'), 21), [3, 1, 14]);
    for (const z of [-1.1, 1.1]) for (const x of [-0.12, 0.12]) m.merge(ellipsoid([x, 0.05, z], [0.012, 0.004, 0.012], ironL, 6, 3));
    M.phPlank = m;
  }
  // torch: wooden handle and a pitch-soaked cloth head
  {
    const m = new Mesh();
    m.merge(tubeMesh([0, -0.36, 0], [0, 0.26, 0], (t) => lerp(0.028, 0.038, t), (t, an) => [...V.mul(hexToRgb('#8d6238'), 0.9 + 0.15 * Math.sin(an * 5 + t * 20)), 10], 8, 6));
    m.merge(ellipsoid([0, 0.31, 0], [0.058, 0.085, 0.058], (n0) => [...V.mul(hexToRgb('#3a2a20'), 0.8 + 0.3 * Math.abs(Math.sin(n0[1] * 14))), 2], 10, 8));
    M.phTorch = m;
  }
  // campfire: ring of stones and a teepee of logs; coals are drawn separately so they can glow
  {
    const m = new Mesh();
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, s = 0.13 + 0.04 * hash2(k, 1); m.merge(ellipsoid([Math.sin(a) * 0.62, 0.05, Math.cos(a) * 0.62], [s * 1.2, s * 0.8, s], (n0) => [...V.mul(COL.stone, 0.75 + 0.3 * n0[1]), 11], 8, 6)); }
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; m.merge(tubeMesh([Math.sin(a) * 0.45, 0.02, Math.cos(a) * 0.45], [Math.sin(a) * 0.05, 0.62, Math.cos(a) * 0.05], (t) => lerp(0.055, 0.035, t), (t) => [...V.mul(hexToRgb('#4a3322'), t > 0.3 ? 0.35 : 0.9), 10], 8, 3)); }
    M.phCampfire = m;
    M.phCoals = ellipsoid([0, 0.02, 0], [0.34, 0.07, 0.34], (n0) => [...V.mul([0.9, 0.3, 0.08], 0.5 + 0.5 * noise3(n0[0] * 6, n0[1] * 6, n0[2] * 6)), 0], 14, 6);
  }
  // brazier: stone post with an iron bowl
  {
    const m = new Mesh();
    m.merge(cylMesh(8, 0.3, 0.22, 1.0, [...COL.stone, 11], true), M4.rotY(M4.id(), Math.PI / 8));
    m.merge(cylMesh(8, 0.36, 0.36, 0.1, [...V.mul(COL.stone, 0.85), 11], true), M4.rotY(at(0, 1.0, 0), Math.PI / 8));
    m.merge(cylMesh(16, 0.22, 0.42, 0.24, iron, true), at(0, 1.1, 0));
    m.merge(transformed(torusMesh(0.42, 0.03, 24, 5, ironL), at(0, 1.34, 0)));
    M.phBrazier = m;
  }
  M.phBeam = cylMesh(6, 1, 1, 1, [1, 1, 1, 0], false);
  // flame tongue: a twisted teardrop, white-yellow at the root to deep orange at the tip (drawn emissive)
  {
    // three licks around a hot core, each a teardrop swept into an S-curve
    const f = new Mesh();
    const lick = (ox, oz, h, w, ph) => f.merge(ellipsoid([0, 0, 0], [1, 1, 1], (n0) => { const t = clamp((n0[1] + 1) / 2, 0, 1); return [1.0, lerp(0.8, 0.16, t * t), lerp(0.28, 0.0, t), 0]; }, 10, 12, (q, n0) => {
      const y = n0[1], u = Math.max(0, y);
      if (y > 0) { const k = Math.pow(1 - y, 1.4); q[0] *= k; q[2] *= k; q[1] = y * h; } else q[1] = y * 0.45;
      q[0] = q[0] * w + ox + Math.sin(u * 3.2 + ph) * 0.22 * u; q[2] = q[2] * w + oz + Math.cos(u * 2.6 + ph) * 0.14 * u;
      return q;
    }));
    lick(0, 0, 2.9, 0.62, 0); lick(0.3, 0.1, 1.9, 0.42, 2); lick(-0.22, -0.2, 2.2, 0.45, 4); lick(0.05, 0.28, 1.5, 0.38, 1);
    M.phFlameT = f;
  }
  M.phGlue = sphereMesh(10, 8, [1, 1, 1]);
}

// ---------- scatter ----------
function phScatter() {
  let sd = 90211; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const placed = [];
  const clearAt = (x, z, r, pathClear = 4) => {
    if (pathDist(x, z) < pathClear + r) return false;
    if (Math.hypot(x - START[0], z - START[2]) < 3 + r) return false;
    for (const s of WORLD.solids) { if (s.kind === 'canopy' || s.kind === 'island' || s.kind === 'base') continue; if (Math.hypot(x - s.x, z - s.z) < s.r + r + 0.25) return false; }
    for (const p of placed) if (Math.hypot(x - p[0], z - p[1]) < r + p[2] + 0.15) return false;
    for (const f of WORLD.foes) if (Math.hypot(x - f.home[0], z - f.home[1]) < 1.2 + r) return false;
    return true;
  };
  const flat = (x, z, r, minN = 0.9) => { for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (phTN(x + dx, z + dz, _pn)[1] < minN) return false; return true; };
  const groundMax = (x, z, r) => { let h = -99; for (const [dx, dz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) h = Math.max(h, heightAt(x + dx, z + dz)); return h; };
  const put = (kind, x, z, yaw, opt = {}) => {
    const K = PHK[kind], r = K.type === PHB ? Math.hypot(K.h[0], K.h[2]) : K.type === PHC ? (opt.lying ? K.hl + K.r : K.r) : K.r;
    if (!opt.force && (!clearAt(x, z, r * 0.8, opt.pathClear ?? 4) || !flat(x, z, r * 0.7, opt.minN ?? 0.88) || heightAt(x, z) < (opt.minH ?? 1.0))) return null;
    const g = groundMax(x, z, r * 0.6) - 0.03;
    let y, tilt = null;
    if (K.type === PHB) y = g + K.h[1];
    else if (K.type === PHY) y = g + K.hl;
    else if (K.type === PHS) y = heightAt(x, z) + K.r * 0.93;
    else if (opt.lying) { y = g + K.r; tilt = [0, 0, 1, Math.PI / 2]; }
    else y = g + K.hl + K.r;
    y += opt.dy || 0;
    placed.push([x, z, r]);
    return phSpawn(kind, [x, y, z], yaw, tilt);
  };
  const around = (cx, cz, list, spread = 2.4, tries = 40) => {
    for (const [kind, opt] of list) {
      for (let t = 0; t < tries; t++) { const a = R() * TAU, d = R() * spread; if (put(kind, cx + Math.sin(a) * d, cz + Math.cos(a) * d, R() * TAU, opt || {})) break; }
    }
  };
  // 1. supply yard by the shrine: a crate pyramid, barrels, planks and a torch
  {
    const a = 1.25, cx = SHRINE[0] + Math.sin(a) * 10, cz = SHRINE[2] + Math.cos(a) * 10, yaw = a;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const g = Math.max(groundMax(cx - fx * 0.42, cz - fz * 0.42, 0.5), groundMax(cx + fx * 0.42, cz + fz * 0.42, 0.5)) - 0.02;
    if (clearAt(cx, cz, 1.2)) {
      placed.push([cx, cz, 1.2]);
      phSpawn('crate', [cx - fx * 0.42, g + 0.4, cz - fz * 0.42], yaw);
      phSpawn('crate', [cx + fx * 0.42, g + 0.4, cz + fz * 0.42], yaw);
      phSpawn('crate', [cx, g + 1.2, cz], yaw + 0.2);
    }
    around(cx, cz, [['barrel'], ['barrel'], ['crateS'], ['crate'], ['plank', { minN: 0.85 }], ['plank', { minN: 0.85 }], ['plank', { minN: 0.85 }], ['torch', { lying: true }], ['bomb']], 4.2, 60);
  }
  {
    const a = 2.6, cx = SHRINE[0] + Math.sin(a) * 10.5, cz = SHRINE[2] + Math.cos(a) * 10.5;
    around(cx, cz, [['crate'], ['crate'], ['crateS'], ['barrel'], ['plank', { minN: 0.85 }], ['plank', { minN: 0.85 }], ['log', { lying: true, minN: 0.85 }]], 3.5, 60);
  }
  // 2. goblin camps stocked with explosive barrels
  for (const [x, z] of [[16, -22], [-20, -12], [28, 6], [-26, 30]]) around(x + 2.5, z + 1.5, [['bomb'], ['bomb'], ['crate'], ['barrel'], ['crateS']], 3.4, 50);
  // 3. boulders perched on hillsides and a few loose rocks
  let nb = 0;
  for (let t = 0; t < 3000 && nb < 12; t++) {
    const x = (R() - 0.5) * 150, z = (R() - 0.5) * 150, h = heightAt(x, z);
    if (h < 3 || h > 26) continue;
    const n = phTN(x, z, _pn)[1];
    if (n < 0.8 || n > 0.95) continue;
    if (put(nb < 8 ? 'boulder' : 'rock', x, z, R() * TAU, { minN: 0.78, pathClear: 5 })) nb++;
  }
  // 4. logs lying near trees close to the route
  let nl = 0;
  const trees = WORLD.props.trees.map(t => ({ t, d: pathDist(t.x, t.z) })).filter(o => o.d > 5 && o.d < 22).sort((a, b) => a.d - b.d);
  for (const { t } of trees) {
    if (nl >= 14) break;
    for (let k = 0; k < 6; k++) {
      const a = R() * TAU, d = 1.9 + R() * 1.2;
      if (put('log', t.x + Math.sin(a) * d, t.z + Math.cos(a) * d, a + Math.PI / 2 + (R() - 0.5) * 0.6, { lying: true, minN: 0.86 })) { nl++; break; }
    }
  }
  // 5. building yard at the start: a stack of planks, crates, a campfire and a torch
  {
    const cx = START[0] - 6.5, cz = START[2] + 1;
    const g = groundMax(cx, cz, 1.3);
    if (clearAt(cx, cz, 1.3, 2)) {
      placed.push([cx, cz, 1.3]);
      for (let k = 0; k < 4; k++) phSpawn('plank', [cx, g + 0.05 + k * 0.1, cz], 0.1 + k * 0.03);
    }
    around(cx + 1.5, cz - 1.5, [['crate'], ['crate'], ['crateS'], ['barrel'], ['log', { lying: true }], ['log', { lying: true }], ['plank'], ['plank']], 3.6, 60);
    const fx = START[0] - 4.5, fz = START[2] + 5.5;
    if (clearAt(fx, fz, 0.8, 2)) { placed.push([fx, fz, 0.8]); phAddFire(fx, fz, 'campfire'); around(fx + 1.2, fz, [['torch', { lying: true }]], 1.2, 30); }
  }
  // 6. raft makings on the beach
  {
    let best = null;
    for (let k = 0; k < 40 && !best; k++) {
      const a = k / 40 * TAU;
      for (let d = 4; d < 30; d += 0.5) {
        const x = START[0] + Math.sin(a) * d, z = START[2] + Math.cos(a) * d, h = heightAt(x, z);
        if (h < 1.25 && h > 0.35) { if (pathDist(x, z) > 5) best = [x, z, a]; break; }
      }
    }
    if (best) {
      const [x, z, a] = best, tx = Math.cos(a), tz = -Math.sin(a), bx = x - Math.sin(a) * 1.5, bz = z - Math.cos(a) * 1.5;
      for (let k = 0; k < 3; k++) put('log', bx + tx * (k - 1) * 1.2 * 0 + tx * (k - 1) * 0.55, bz + tz * (k - 1) * 0.55, a, { lying: true, minH: 0.3, minN: 0.8, pathClear: 2 });
      around(bx, bz, [['plank', { minH: 0.3, minN: 0.8, pathClear: 2 }], ['plank', { minH: 0.3, minN: 0.8, pathClear: 2 }], ['plank', { minH: 0.3, minN: 0.8, pathClear: 2 }], ['barrel', { minH: 0.3, minN: 0.8, pathClear: 2 }]], 3.5, 60);
    }
  }
  // 7. braziers flanking the shrine approach
  {
    const ea = Math.atan2(PATH[PATH.length - 1][0] - SHRINE[0], PATH[PATH.length - 1][1] - SHRINE[2]);
    for (const s of [-1, 1]) { const a = ea + s * 0.62, x = SHRINE[0] + Math.sin(a) * 8.2, z = SHRINE[2] + Math.cos(a) * 8.2; phAddFire(x, z, 'brazier'); }
  }
}
function phAddFire(x, z, kind) {
  const y = heightAt(x, z);
  if (kind === 'brazier') {
    PH.fires.push({ x, z, y: y + 1.3, s: 0.8, lit: 1, kind, gy: y });
    WORLD.solids.push({ x, z, r: 0.34, top: y + 1.36, bottom: y - 1, kind: 'prop' });
  } else {
    PH.fires.push({ x, z, y: y + 0.12, s: 1.1, lit: 1, kind, gy: y });
    WORLD.solids.push({ x, z, r: 0.55, top: y + 0.7, bottom: y - 1, kind: 'prop' });
  }
}

// ---------- boot, step, draw, reset ----------
function physBoot(M) {
  phBuildMeshes(M);
  PH.scattering = true; phScatter(); PH.scattering = false;
  phBuildSolidGrid();
  phFireInit();
  phHudInit();
  addEventListener('keydown', phKeyDown, true);
  addEventListener('keyup', phKeyUp, true);
  canvas.addEventListener('mousedown', e => {
    if (state.mode !== 'play' || !PH.hand.on || e.button !== 0 || document.pointerLockElement !== canvas) return;
    e.stopImmediatePropagation(); PH.act.hand = true;
  }, true);
  canvas.addEventListener('wheel', e => {
    if (state.mode !== 'play' || !PH.hand.body) return;
    e.preventDefault(); PH.hand.dist = clamp(PH.hand.dist + Math.sign(e.deltaY) * 0.6, 1.6, 14);
  }, { passive: false });
  HINTS.push(
    { id: 'phLift', when: () => state.time > 12 && !!phNearestLiftable(), kb: 'Pulsa <kbd>F</kbd> para levantar el objeto y otra vez para lanzarlo.', touch: 'Pulsa Mano para levantar el objeto y otra vez para lanzarlo.' },
    { id: 'phHand', when: () => state.time > 30 && PH.bodies.some(b => V.dist(b.pos, player.pos) < 9), kb: '<kbd>G</kbd>: Mano Maestra. Agarra objetos a distancia, gíralos con <kbd>Z</kbd><kbd>X</kbd> y pégalos con <kbd>T</kbd> para construir.', touch: 'Mano: apunta con la cámara y toca para agarrar; toca de nuevo tocando otro objeto para pegarlos.' },
    { id: 'phBomb', when: () => PH.bodies.some(b => b.parts.some(s => s.explosive) && V.dist(b.pos, player.pos) < 7), kb: 'Barriles rojos: explotan con fuego, golpes fuertes o la espada. ¡Aléjate!', touch: 'Barriles rojos: explotan con fuego, golpes fuertes o la espada. ¡Aléjate!' },
  );
  PH.ready = true;
}
function physReset() {
  PH.carry = null; phHandRelease(true); PH.support = null;
  PH.bodies.length = 0;
  for (const sp of PH.spawns) { const b = phSpawn(sp.kind, sp.pos, 0); b.q = sp.q.slice(); b.spawn = sp; phUpdateBody(b); }
  for (const id of PHF.act) PHF.st[id] = -1;
  PHF.act.length = 0;
}
function physStep(dt, inp) {
  if (!PH.ready) return;
  try { phStepInner(dt, inp); } catch (e) { if (!PH.err) { PH.err = 1; console.error('physics:', e); } }
}
function phStepInner(dt, inp) {
  if (window.__brio && !window.__brio.phys) window.__brio.phys = PHYS;
  PH.time += dt;
  if (state.mode === 'play') { phPad(); phTouch(); phActions(); }
  PH.throwT = Math.max(0, PH.throwT - dt);
  for (let i = PH.later.length - 1; i >= 0; i--) { const l = PH.later[i]; l.t -= dt; if (l.t <= 0) { PH.later.splice(i, 1); l.fn(); } }
  const p = player, prevVy = PH.prevVy ?? p.vel[1];
  phPlayerCollide(dt, prevVy);
  phCarryStep(dt);
  phHandStep(dt);
  phSwordHits();
  // ground pound shockwave
  if (PH.prevPound && !p.pound && p.onGround) {
    for (const b of PH.bodies) { if (b.carried) continue; const d = V.sub(b.pos, p.pos), dl = V.len(d); if (dl < 4.6 + b.rad) { const k = (1 - dl / (4.6 + b.rad)) * 6 * Math.min(b.mass, 3) + 0.5, dir = V.norm([d[0], 1.2, d[2]]); phImpulse(b, b.pos[0], b.pos[1] - 0.1, b.pos[2], dir[0] * k, dir[1] * k, dir[2] * k); for (const s of b.parts) if (s.explosive && dl < 2.5) phFuse(s, 0.1); } }
  }
  PH.prevPound = p.pound;
  phWorldStep(dt);
  phFoesCollide(dt);
  phFireStep(dt);
  phUpdraft(dt);
  PH.prevVy = p.vel[1];
  phHudStep(dt);
}
const _phId = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function phPartMatrix(s) {
  const M = s.M, R = s.R, k = s.type === PHS ? s.r : 1;
  M[0] = R[0] * k; M[1] = R[1] * k; M[2] = R[2] * k; M[3] = 0; M[4] = R[3] * k; M[5] = R[4] * k; M[6] = R[5] * k; M[7] = 0;
  M[8] = R[6] * k; M[9] = R[7] * k; M[10] = R[8] * k; M[11] = 0; M[12] = s.c[0]; M[13] = s.c[1]; M[14] = s.c[2]; M[15] = 1;
  return M;
}
function physDraw(L, t) {
  if (!PH.ready) return;
  try { phDrawInner(L, t); } catch (e) { if (!PH.err2) { PH.err2 = 1; console.error('physics draw:', e); } }
}
function phDrawInner(L, t) {
  const H = PH.hand, cp = cam.pos;
  for (const b of PH.bodies) {
    const dx = b.pos[0] - cp[0], dz = b.pos[2] - cp[2];
    if (dx * dx + dz * dz > 110 * 110) continue;
    const held = H.body === b, aimed = H.on && !H.body && H.target === b, glue = H.glueTo === b;
    for (const s of b.parts) {
      const tn = s.tint, ch = s.charred;
      let r = 1 - ch * 0.72, g = 1 - ch * 0.76, bl = 1 - ch * 0.8, e = 0;
      if (s.burn > 0) { const f = 0.55 + 0.25 * Math.sin(t * 17 + s.c[0] * 3) + 0.2 * Math.sin(t * 29 + s.c[2]); r *= 1.25; g *= 0.85; bl *= 0.6; e = 0.35 + f * 0.5; }
      if (s.fuse >= 0) e = Math.max(e, 0.4 + 0.4 * Math.sin(t * 30));
      if (held) { r = r * 0.85 + 0.12; g = g * 0.9 + 0.35; bl = bl * 0.8 + 0.05; e = Math.max(e, 0.32 + 0.1 * Math.sin(t * 6)); }
      else if (glue) { r += 0.35; g += 0.35; e = Math.max(e, 0.35 + 0.2 * Math.sin(t * 10)); }
      else if (aimed) { g += 0.25; e = Math.max(e, 0.22 + 0.08 * Math.sin(t * 8)); }
      tn[0] = r; tn[1] = g; tn[2] = bl; tn[3] = e;
      L.add(s.K.mesh, phPartMatrix(s), tn, s.prm);
    }
    // glue nodules where parts were joined
    if (b.glue.length) for (const gl of b.glue) {
      const w = phV(b, gl), m = at(w[0], w[1], w[2]); M4.scale(m, 0.075 + 0.01 * Math.sin(t * 4 + gl[0] * 9));
      L.add('phGlue', m, [0.45, 1.3, 0.25, held ? 1.4 : 0.55], [0.3, 0.4, 0, 0]);
    }
  }
  phDrawFlames(L, t);
  for (const f of PH.fires) {
    const m = at(f.x, f.gy, f.z);
    if (f.kind === 'brazier') { L.add('phBrazier', m, [1, 1, 1, 0], [0.85, 0.1, 0, 0]); const c = at(f.x, f.gy + 1.28, f.z); M4.scale(c, 1.05, 1, 1.05); L.add('phCoals', c, [1.6, 1, 0.8, (1.4 + 0.5 * Math.sin(t * 7 + f.x)) * f.lit], [0.9, 0, 0, 0]); }
    else { L.add('phCampfire', m, [1, 1, 1, 0], [0.85, 0.1, 0, 0]); L.add('phCoals', at(f.x, f.gy + 0.03, f.z), [1.6, 1, 0.8, (1.2 + 0.6 * Math.sin(t * 5 + f.z)) * f.lit], [0.9, 0, 0, 0]); }
  }
  // telekinesis beam: a glowing arc from the right hand to the held object
  if (H.on && rig.F && player.deadT <= 0) {
    const a = rig.F[BI.hand(-1)].P, tb = H.body || null;
    if (tb) {
      const b2 = tb.pos, len = V.dist(a, b2), mid = V.add(V.lerp(a, b2, 0.5), [0, 0.18 * len * 0.25 + 0.2, 0]), N = 10;
      let prev = a;
      for (let k = 1; k <= N; k++) {
        const u = k / N, q = V.add(V.add(V.mul(a, (1 - u) * (1 - u)), V.mul(mid, 2 * u * (1 - u))), V.mul(b2, u * u));
        const seg = V.sub(q, prev), sl = V.len(seg);
        if (sl > 1e-4) {
          const m = basisY(prev, seg), w = 0.022 + 0.012 * Math.sin(t * 20 - k);
          M4.scale(m, w, sl, w);
          L.add('phBeam', m, [0.55, 1.35, 0.35, 3.2], [0.3, 0, 0, 0]);
        }
        prev = q;
      }
    }
  }
}
// stylised flame tongues (instanced, emissive) for burning grass, wood, torches and fire pits
const _flT = [1, 0.62, 0.4, 1.7], _flP = [0.9, 0, 0, 0];
function phTongue(L, x, y, z, s, t, seed, n) {
  if (n.c >= 110) return;
  n.c++;
  const fl = 0.78 + 0.22 * Math.sin(t * 13 + seed * 7.1) + 0.12 * Math.sin(t * 23 + seed * 3.3);
  const m = at(x, y, z); M4.rotY(m, seed * 6.28 + t * 1.5); M4.rotZ(m, Math.sin(t * 7 + seed * 4) * 0.12);
  M4.scale(m, s * 0.7 * (0.9 + 0.15 * Math.sin(t * 17 + seed)), s * fl, s * 0.7 * (0.9 + 0.15 * Math.cos(t * 15 + seed)));
  L.add('phFlameT', m, _flT, _flP);
}
function phDrawFlames(L, t) {
  const cnt = { c: 0 }, cp = cam.pos;
  for (const f of PH.fires) {
    if (f.lit < 0.1) continue;
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; phTongue(L, f.x + Math.sin(a) * 0.12 * f.s, f.y - 0.08, f.z + Math.cos(a) * 0.12 * f.s, (k ? 0.24 : 0.34) * f.s * f.lit, t, k + f.x, cnt); }
  }
  for (const b of PH.bodies) {
    for (const s of b.parts) {
      if (s.torch && s.lit) { phTongue(L, s.c[0] + s.ax[0] * (s.hl + 0.02), s.c[1] + s.ax[1] * (s.hl + 0.02), s.c[2] + s.ax[2] * (s.hl + 0.02), 0.075, t, b.id, cnt); continue; }
      if (s.burn <= 0) continue;
      const life = s.burn / s.fuel, k = Math.min(1, s.burn * 1.2) * (0.6 + 0.4 * Math.sin(Math.min(1, life * 1.3) * Math.PI)), n = s.br > 0.6 ? 4 : 3;
      const top = s.type === PHB || s.type === PHY ? Math.abs(s.R[1] * s.h[0]) + Math.abs(s.R[4] * s.h[1]) + Math.abs(s.R[7] * s.h[2]) : s.r;
      for (let j = 0; j < n; j++) {
        const hx = (hash2(b.id * 7 + j, 3) - 0.5) * s.br * 0.9, hz = (hash2(b.id * 5 + j, 9) - 0.5) * s.br * 0.9;
        phTongue(L, s.c[0] + hx, s.c[1] + top * 0.8, s.c[2] + hz, (0.12 + s.br * 0.18) * k * (j ? 0.8 : 1.1), t, b.id + j * 1.7, cnt);
      }
    }
  }
  const act = PHF.act, n = PHF.n;
  for (let q = 0; q < act.length && cnt.c < 110; q++) {
    const id = act[q], i = id % n, j = (id - i) / n, x0 = -100 + i * PHF.cell, z0 = -100 + j * PHF.cell;
    if (Math.abs(x0 - cp[0]) > 55 || Math.abs(z0 - cp[2]) > 55) continue;
    const st = PHF.st[id], k = Math.min(1, st * 0.8) * Math.min(1, (6.5 - st) * 0.7 + 0.35);
    for (let e = 0; e < 2; e++) {
      const x = x0 + 0.3 + hash2(id, e) * 1.4, z = z0 + 0.3 + hash2(e * 13, id) * 1.4;
      phTongue(L, x, heightAt(x, z) - 0.02, z, (0.16 + 0.16 * hash2(id, e + 7)) * k, t, id * 0.37 + e, cnt);
    }
  }
}
// public API (also on window.__brio.phys for the test tools)
const PHYS = {
  get bodies() { return PH.bodies; }, PH, PHF, spawn: phSpawn, igniteAt, explode: physExplode, wake: phWake,
  lift: phLift, throw: phThrow, grab: phGrab, release: phHandRelease, glue: phGlue, unglue: phUnglue,
  handMode: (on) => { PH.hand.on = !!on; if (!on) phHandRelease(true); },
  act: (name) => { PH.act[name] = true; },
  count: () => ({ bodies: PH.bodies.length, awake: PH.bodies.filter(b => !b.sleep).length, burning: PHF.act.length, contacts: PH_NC }),
  glueBodies: (a, o) => { phUpdateBody(a); phUpdateBody(o); PH.hand.body = a; PH.hand.glueTo = o; PH.hand.glueP = V.lerp(a.pos, o.pos, 0.5); phGlue(); PH.hand.body = null; a.heldDrive = false; return a; },
  impulse: (b, j) => phImpulse(b, b.pos[0], b.pos[1], b.pos[2], j[0], j[1], j[2]),
};
window.PHYS = PHYS;
