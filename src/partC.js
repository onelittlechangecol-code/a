// ============================================================
//  World: procedural island
// ============================================================
const WORLD = { size: 200, n: 256, water: 0 };
const SHRINE = [0, 0, -14];
const START = [0, 0, 58];
const PATH = [[0, 56], [5, 47], [14, 39], [19, 29], [15, 19], [4, 13], [-9, 8], [-15, -1], [-11, -9], [-5, -8]];

function terrainRaw(x, z) {
  const r = Math.hypot(x * 0.95, z);
  const island = smooth(96, 56, r);
  const n = fbm(x * 0.016 + 3.1, z * 0.016 - 7.4, 5);
  const ridge = 1 - Math.abs(fbm(x * 0.03 + 11, z * 0.03 + 5, 4) * 2 - 1);
  let h = -5 + island * (7.2 + (n - 0.45) * 15 + ridge * 2.2);
  const dm = Math.hypot(x - SHRINE[0], z - SHRINE[2]);
  h += island * 15 * Math.exp(-(dm * dm) / (2 * 21 * 21));
  // Zelda-style terraces: soft ledges you hop up
  const tq = 2.3, f = h / tq, fl = Math.floor(f);
  h = lerp(h, (fl + smooth(0.3, 0.7, f - fl)) * tq, 0.5 * island * smooth(0.5, 2.5, h));
  return h;
}
function terrainShaped(x, z) {
  let h = terrainRaw(x, z);
  const ds = Math.hypot(x - START[0], z - START[2]);
  h = lerp(h, 3.0, smooth(16, 6, ds));
  const dm = Math.hypot(x - SHRINE[0], z - SHRINE[2]);
  h = lerp(h, WORLD.shrineH, smooth(12, 7.5, dm));
  return h;
}
function pathDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

function buildWorld() {
  seedState = 20240917;
  WORLD.shrineH = terrainRaw(SHRINE[0], SHRINE[2]) + 1.2;
  const N = WORLD.n, S = WORLD.size, cell = S / N, H = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    H[j * (N + 1) + i] = terrainShaped(-S / 2 + i * cell, -S / 2 + j * cell);
  }
  WORLD.H = H; WORLD.cell = cell;
  SHRINE[1] = heightAt(SHRINE[0], SHRINE[2]);
  START[1] = heightAt(START[0], START[2]);

  // terrain mesh
  const m = new Mesh();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -S / 2 + i * cell, z = -S / 2 + j * cell, h = H[j * (N + 1) + i];
    const n = terrainNormal(x, z);
    m.v([x, h, z], n, terrainColor(x, z, h, n));
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    // alternate diagonal to reduce directional artifacts
    if ((i + j) & 1) { m.tri(a, c, b); m.tri(b, c, d); } else { m.tri(a, c, d); m.tri(a, d, b); }
  }
  WORLD.terrainMesh = m;

  // ---------- props ----------
  const solids = [], props = { trees: [], rocks: [], tufts: [], flowers: [] };
  const okLand = (x, z, minH = 1.4, maxH = 30, minNy = 0.8) => {
    const h = heightAt(x, z), n = terrainNormal(x, z);
    return h > minH && h < maxH && n[1] > minNy;
  };
  const far = (x, z, list, d) => list.every(o => Math.hypot(o.x - x, o.z - z) > d);
  const clearOfPlay = (x, z) => pathDist(x, z) > 3.2 && Math.hypot(x - START[0], z - START[2]) > 9 && Math.hypot(x - SHRINE[0], z - SHRINE[2]) > 12;
  for (let tries = 0; tries < 4000 && props.trees.length < 120; tries++) {
    const x = (srand() - 0.5) * 170, z = (srand() - 0.5) * 170;
    if (!okLand(x, z, 1.8, 26, 0.82) || !clearOfPlay(x, z) || !far(x, z, props.trees, 4.2)) continue;
    // forests cluster where low-frequency noise is high
    if (fbm(x * 0.03 + 40, z * 0.03, 3) < 0.46) continue;
    const s = 0.8 + srand() * 0.6, y = heightAt(x, z);
    const t = { x, z, y, s, v: Math.floor(srand() * 3), yaw: srand() * TAU };
    props.trees.push(t);
    solids.push({ x, z, r: 0.42 * s + 0.05, top: y + 3.2 * s, bottom: y - 2, kind: 'tree' });
    // canopy you can land on
    solids.push({ x, z, r: 1.6 * s, top: y + 3.4 * s + 1.3 * s, bottom: y + 3.0 * s, kind: 'canopy' });
  }
  for (let tries = 0; tries < 3000 && props.rocks.length < 46; tries++) {
    const x = (srand() - 0.5) * 175, z = (srand() - 0.5) * 175;
    if (!okLand(x, z, 0.3, 28, 0.7) || pathDist(x, z) < 2.6 || Math.hypot(x - START[0], z - START[2]) < 7 || !far(x, z, props.rocks, 5) || !far(x, z, props.trees, 3)) continue;
    const s = 0.5 + srand() * 1.3, y = heightAt(x, z);
    props.rocks.push({ x, z, y, s, v: Math.floor(srand() * 3), yaw: srand() * TAU });
    solids.push({ x, z, r: 0.85 * s, top: y + 0.75 * s, bottom: y - 2, kind: 'rock' });
  }
  for (let tries = 0; tries < 60000 && props.tufts.length < 8500; tries++) {
    const x = (srand() - 0.5) * 150, z = (srand() - 0.5) * 150;
    if (!okLand(x, z, 1.4, 22, 0.82) || pathDist(x, z) < 1.4) continue;
    props.tufts.push({ x, z, y: heightAt(x, z), s: 0.6 + srand() * 0.8, yaw: srand() * TAU });
  }
  const petal = ['#ffffff', '#ffd1e8', '#ffe27a', '#b9a6ff', '#ff9aa2'].map(hexToRgb);
  for (let tries = 0; tries < 20000 && props.flowers.length < 480; tries++) {
    const x = (srand() - 0.5) * 140, z = (srand() - 0.5) * 140;
    if (!okLand(x, z, 1.6, 20, 0.86) || pathDist(x, z) < 1.2) continue;
    if (fbm(x * 0.08, z * 0.08 + 9, 2) < 0.5) continue;
    props.flowers.push({ x, z, y: heightAt(x, z), s: 0.8 + srand() * 0.6, yaw: srand() * TAU, c: petal[Math.floor(srand() * petal.length)] });
  }

  // ---------- floating islands ----------
  const islands = [];
  const addIsland = (x, z, top, r, move = null) => {
    const isl = { x, z, top, r, move, bx: x, bz: z, dx: 0, dz: 0, dy: 0, kind: 'island' };
    isl.bottom = top - r * 1.4; islands.push(isl); solids.push(isl); return isl;
  };
  // spiral stair up to a high garden
  const sc = [-36, 24], sh = heightAt(sc[0], sc[1]);
  const spiral = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 1.15 + 0.4, rr = 7.5 - k * 0.35;
    spiral.push(addIsland(sc[0] + Math.sin(a) * rr, sc[1] + Math.cos(a) * rr, sh + 2.6 + k * 2.5, 2.1));
  }
  const garden = addIsland(sc[0] + 1, sc[1] - 1, sh + 18.5, 4.2);
  // glide route off the shrine, out over the west coast
  const g1 = addIsland(-20, -24, WORLD.shrineH + 1.5, 2.6);
  const g2 = addIsland(-36, -33, WORLD.shrineH - 1.5, 2.4);
  const g3 = addIsland(-54, -26, WORLD.shrineH - 4, 3.2);
  // moving islands across a gorge east of the path
  const m1 = addIsland(32, 14, heightAt(32, 14) + 3.5, 2.4, { ax: 5, az: 0, ay: 0, sp: 0.55, ph: 0 });
  const m2 = addIsland(34, -2, heightAt(34, -2) + 5.5, 2.4, { ax: 0, az: 5, ay: 1.2, sp: 0.45, ph: 1.7 });

  // ---------- shrine ----------
  const pillars = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU + 0.26;
    const x = SHRINE[0] + Math.sin(a) * 5.4, z = SHRINE[2] + Math.cos(a) * 5.4;
    pillars.push({ x, z, a });
    solids.push({ x, z, r: 0.6, top: SHRINE[1] + 0.8 + 4.6, bottom: SHRINE[1] - 1, kind: 'pillar' });
  }
  // three walkable steps up to the plaza
  for (const [r, top] of [[7.3, 0.27], [6.95, 0.54], [6.6, 0.8]]) solids.push({ x: SHRINE[0], z: SHRINE[2], r, top: SHRINE[1] + top, bottom: SHRINE[1] - 3, kind: 'base', ramp: true });

  // ---------- collectibles ----------
  const orbs = [];
  const addOrb = (x, y, z) => orbs.push({ x, y, z, got: false, ph: srand() * TAU, pull: 0 });
  // breadcrumb trail along the path
  let acc = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = acc; d < L; d += 4.2) {
      const t = d / L, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t);
      if (Math.hypot(x - START[0], z - START[2]) < 4) continue;
      addOrb(x, heightAt(x, z) + 1.0, z);
    }
    acc = 0;
  }
  for (const s of spiral) addOrb(s.x, s.top + 1.1, s.z);
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; addOrb(garden.x + Math.sin(a) * 2.2, garden.top + 1.1, garden.z + Math.cos(a) * 2.2); }
  // glide lines
  const line = (a, b, n, lift) => { for (let k = 1; k <= n; k++) { const t = k / (n + 1); addOrb(lerp(a.x, b.x, t), lerp(a.top, b.top, t) + lift + Math.sin(t * Math.PI) * 1.5, lerp(a.z, b.z, t)); } };
  const shrineIsl = { x: SHRINE[0], z: SHRINE[2], top: SHRINE[1] + 0.8 };
  line(shrineIsl, g1, 3, 1.2); line(g1, g2, 3, 0.6); line(g2, g3, 4, 0.4);
  addOrb(g3.x, g3.top + 1.1, g3.z);
  addOrb(m1.x, m1.top + 1.1, m1.z); addOrb(m2.x, m2.top + 1.1, m2.z);
  // secrets near the coast and on terraces
  const secretSpots = [[46, 42], [-52, 48], [58, 4], [-60, 6], [24, -44], [-24, 56], [40, -30]];
  for (const [x, z] of secretSpots) { const h = heightAt(x, z); if (h > 0.6) { addOrb(x, h + 1, z); addOrb(x + 1.4, h + 1, z + 0.6); } }

  const hearts = [
    { x: garden.x, y: garden.top + 1.2, z: garden.z, got: false },
    { x: g3.x + 1.5, y: g3.top + 1.2, z: g3.z, got: false },
    { x: 46, y: heightAt(46, 20) + 1.2, z: 20, got: false },
  ];

  // ---------- foes ----------
  const foeSpots = [[8, 44], [20, 33], [11, 22], [-4, 14], [-16, 4], [-26, 30], [28, 6], [-20, -12], [16, -22], [-40, 40], [40, 32]];
  const foes = foeSpots.filter(([x, z]) => heightAt(x, z) > 1).map(([x, z]) => ({ home: [x, z], spawn: [x, heightAt(x, z), z] }));

  Object.assign(WORLD, { solids, props, islands, pillars, orbs, hearts, foes, garden });
}

function heightAt(x, z) {
  const N = WORLD.n, S = WORLD.size, H = WORLD.H;
  const fx = clamp((x + S / 2) / WORLD.cell, 0, N - 0.001), fz = clamp((z + S / 2) / WORLD.cell, 0, N - 0.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = H[j * (N + 1) + i], b = H[j * (N + 1) + i + 1], c = H[(j + 1) * (N + 1) + i], d = H[(j + 1) * (N + 1) + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function terrainNormal(x, z) {
  const e = WORLD.cell || 0.8;
  const hL = WORLD.H ? heightAt(x - e, z) : terrainShaped(x - e, z), hR = WORLD.H ? heightAt(x + e, z) : terrainShaped(x + e, z);
  const hD = WORLD.H ? heightAt(x, z - e) : terrainShaped(x, z - e), hU = WORLD.H ? heightAt(x, z + e) : terrainShaped(x, z + e);
  return V.norm([hL - hR, 2 * e, hD - hU]);
}
function terrainColor(x, z, h, n) {
  const v = fbm(x * 0.05, z * 0.05, 3), d = hash2(Math.floor(x * 3), Math.floor(z * 3));
  let c = V.lerp(COL.grass, COL.grass2, smooth(0.35, 0.7, v));
  c = V.lerp(c, hexToRgb('#4f8f34'), smooth(0.55, 0.8, fbm(x * 0.11 + 5, z * 0.11, 2)) * 0.5);
  c = V.mul(c, 0.92 + d * 0.12);
  // beach
  c = V.lerp(c, COL.sand, smooth(1.5, 0.9, h));
  c = V.lerp(c, V.mul(COL.sand, 0.72), smooth(0.35, -0.2, h));
  c = V.lerp(c, hexToRgb('#6b7f73'), smooth(-0.6, -2.5, h));
  // rock on steep slopes
  c = V.lerp(c, V.mul(COL.rock, 0.9 + d * 0.2), smooth(0.8, 0.66, n[1]));
  // dirt path
  const pd = pathDist(x, z);
  c = V.lerp(c, V.mul(COL.dirt, 0.9 + d * 0.15), smooth(1.9, 0.9, pd) * smooth(0.5, 1.5, h));
  // stone plaza around shrine
  const dm = Math.hypot(x - SHRINE[0], z - SHRINE[2]);
  c = V.lerp(c, V.mul(COL.stone, 0.85 + d * 0.1), smooth(8.5, 7.2, dm));
  return c;
}

// ground height including platforms/props the player can stand on
function groundAt(x, z, y, rad = 0.3) {
  let h = heightAt(x, z), ref = null, steep = false;
  for (const s of WORLD.solids) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (s.kind === 'tree') continue;
    if (d < s.r + rad * 0.5 && s.top <= y + 0.45 && s.top > h) {
      if (s.ramp) { h = s.top; ref = s; continue; }
      h = s.top; ref = s;
    }
  }
  if (!ref) steep = terrainNormal(x, z)[1] < 0.62;
  return { h, ref, steep };
}
