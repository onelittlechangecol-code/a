// ============================================================
//  Per-frame scene assembly
// ============================================================
let SUN = V.norm([-0.5, 0.46, 0.62]);   // key light (sun by day, moon by night), set by the world clock
function frameUniforms() {
  const f = GR.frameData, asp = GR.w / GR.h, E = worldEnv();
  SUN = E.key;
  const proj = M4.perspective(cam.curFov * Math.PI / 180, asp, 0.1, 900);
  const view = M4.lookAt(cam.pos, cam.target, [0, 1, 0]);
  const vp = M4.mul(proj, view);
  GR.frustum = frustumPlanes(vp);
  // stable shadow frustum: snap the light-space centre to whole texels
  const lv = M4.lookAt(V.mul(SUN, 200), [0, 0, 0], [0, 1, 0]);
  const center = V.add(player.pos, V.mul([Math.sin(cam.yaw), 0, Math.cos(cam.yaw)], -8));
  const c = M4.apply(lv, center), ext = 34, unit = ext * 2 / 2048;
  c[0] = Math.round(c[0] / unit) * unit; c[1] = Math.round(c[1] / unit) * unit;
  const lp = M4.ortho(c[0] - ext, c[0] + ext, c[1] - ext, c[1] + ext, -c[2] - 170, -c[2] + 120);
  const lvp = M4.mul(lp, lv);
  f.set(vp, 0); f.set(M4.invert(vp), 16); f.set(lvp, 32);
  f.set([...cam.pos, state.time], 48);
  f.set([...SUN, 1.0], 52);
  f.set([...E.keyCol, 0], 56);               // sun / moon colour
  f.set([...E.skyTop, 0], 60);               // sky zenith
  f.set([...E.skyHor, 0], 64);               // horizon haze
  f.set([E.fog[0], E.fog[1], WORLD.water, state.shrineAwake ? 1 : 0], 68);
  f.set([GR.w, GR.h, 1 / GR.w, 1 / GR.h], 72);
  f.set([WORLD.size, WORLD.n, 0, 1], 76);
  f.set([view[0], view[4], view[8], player.pos[0]], 80);   // .w: hero x (grass push)
  f.set([view[1], view[5], view[9], player.pos[2]], 84);   // .w: hero z
  const c2 = M4.apply(lv, V.add(player.pos, [0, 1.0, 0])), ext2 = 3.4, unit2 = ext2 * 2 / 1024;
  c2[0] = Math.round(c2[0] / unit2) * unit2; c2[1] = Math.round(c2[1] / unit2) * unit2;
  if (QUALITY[state.quality].fine) f.set(M4.mul(M4.ortho(c2[0] - ext2, c2[0] + ext2, c2[1] - ext2, c2[1] + ext2, -c2[2] - 40, -c2[2] + 40), lv), 88);
  else { const off = new Float32Array(16); off[12] = 10; off[15] = 1; f.set(off, 88); }  // fine cascade off: every lookup lands outside it
  worldUniforms(f, vp);
  GR.device.queue.writeBuffer(GR.frameUB, 0, f);
  // mirrored camera for the water reflection (reflect across the water plane, clip below it)
  const mirror = M4.id(); mirror[5] = -1; mirror[13] = 2 * WORLD.water;
  const vpR = M4.mul(proj, M4.mul(view, mirror));
  const fr = GR.frameDataR || (GR.frameDataR = new Float32Array(FRAME_FLOATS));
  fr.set(f); fr.set(vpR, 0); fr.set(M4.invert(vpR), 16);
  fr.set([cam.pos[0], 2 * WORLD.water - cam.pos[1], cam.pos[2], state.time], 48);
  fr[78] = 1; fr[72] = GR.w / 2; fr[73] = GR.h / 2; fr[74] = 2 / GR.w; fr[75] = 2 / GR.h;
  GR.device.queue.writeBuffer(GR.frameUBR, 0, fr);
  // sun position on screen for the god-ray pass
  const sp = V.add(cam.pos, V.mul(SUN, 500));
  const cx = vp[0] * sp[0] + vp[4] * sp[1] + vp[8] * sp[2] + vp[12], cy = vp[1] * sp[0] + vp[5] * sp[1] + vp[9] * sp[2] + vp[13], cw = vp[3] * sp[0] + vp[7] * sp[1] + vp[11] * sp[2] + vp[15];
  const vis = cw > 0 ? clamp(V.dot(V.norm(V.sub(cam.target, cam.pos)), SUN) * 2.5, 0, 1) : 0;
  GR.device.queue.writeBuffer(GR.postUB, 0, new Float32Array([cw > 0 ? cx / cw * 0.5 + 0.5 : 0.5, cw > 0 ? 0.5 - cy / cw * 0.5 : -1, vis * E.rays, asp, ...E.post]));
}

function buildDynamic() {
  const L = new InstList(), t = state.time, p = player;
  // islands (some move)
  for (const s of WORLD.islands) { const m = at(s.x, s.top, s.z); M4.scale(m, s.r, s.r, s.r); L.add('island', m, [1, 1, 1, 0], [0.85, 0.05, 0, 0]); }
  // orbs
  for (const o of WORLD.orbs) {
    if (o.got) continue;
    const m = at(o.x, o.y + Math.sin(t * 2.4 + o.ph) * 0.12, o.z); M4.rotY(m, t * 1.8 + o.ph); M4.rotZ(m, Math.sin(t * 1.3 + o.ph) * 0.15); M4.scale(m, 0.14);
    L.add('orb', m, [1.0, 0.7, 0.2, 0.45], [0.25, 0.6, 0, 0]);
  }
  for (const h of WORLD.hearts) {
    if (h.got) continue;
    const m = at(h.x, h.y + Math.sin(t * 2) * 0.15, h.z); M4.rotY(m, t * 1.5); M4.scale(m, 0.42);
    L.add('heart', m, [1, 1, 1, 0.7], [0.35, 0.5, 0, 0]);
  }
  // shrine glow
  const glow = state.shrineAwake ? 2.4 + Math.sin(t * 3) * 0.6 : 0.0;
  for (const pl of WORLD.pillars) {
    const m = at(pl.x + Math.sin(pl.a) * 0.47, SHRINE[1] + 2.4, pl.z + Math.cos(pl.a) * 0.47); M4.rotY(m, pl.a);
    L.add('rune', m, state.shrineAwake ? [0.45, 1.0, 1.0, glow] : worldRuneTint(pl), [0.4, 0, 0, 0]);
  }
  if (state.shrineAwake) {
    const d = at(SHRINE[0], SHRINE[1] + 0.8 + 2.6, SHRINE[2]); M4.rotX(d, Math.PI / 2); M4.rotY(d, t * 0.8); M4.scale(d, 2.25, 1, 2.25);
    L.add('disc', d, [0.35, 0.85, 1.0, 0.9 + Math.sin(t * 4) * 0.25], [0.2, 0.8, 0, 0]);
  }
  // goblin foes: body, head, arms and legs animated per instance
  for (const f of foes) {
    if (!f.alive && f.deadT > 0.45) continue;
    const sq = f.sq, sp = Math.hypot(f.vel[0], f.vel[2]);
    const ph = t * 9 + f.home[0], w = f.stun > 0 ? 0 : clamp(sp / 3, 0, 1), air = f.onGround ? 0 : 1, atk = f.cd > 1.1 && f.stun <= 0 ? 1 : 0;
    let root;
    if (f.alive) { root = at(f.pos[0], f.pos[1], f.pos[2]); M4.rotY(root, f.yaw); if (f.stun > 0) M4.rotX(root, -0.35 * Math.min(1, f.stun * 3)); }
    else { const c = deadPos(f); root = at(c[0], c[1] - 0.6, c[2]); M4.rotY(root, f.yaw); M4.translate(root, 0, 0.6, 0); M4.rotX(root, -f.deadT * 14); M4.translate(root, 0, -0.6, 0); }
    const shrink = f.alive ? 1 : Math.max(0.05, 1 - Math.max(0, f.deadT - 0.3) * 6);
    M4.scale(root, 1.05 * (1 + sq * 0.3) * shrink, 1.05 * (1 - sq * 0.45) * shrink, 1.05 * (1 + sq * 0.3) * shrink);
    const flash = f.alive ? (f.hitFlash > 0 ? 2.2 : 0) : 0.8, tint = [1, 1, 1, flash], prm = [0.55, 0.3, 0, 0];
    const bob = Math.abs(Math.sin(ph)) * 0.03 * w;
    const body = root.slice(); M4.translate(body, 0, bob, 0); M4.rotZ(body, Math.sin(ph) * 0.06 * w); M4.rotX(body, 0.08 * w - 0.1 * atk);
    L.add('gobBody', body, tint, prm);
    const head = body.slice(); M4.translate(head, 0, 0.8, 0.02); M4.rotY(head, Math.sin(t * 1.3 + f.home[1]) * 0.3 * (1 - w)); M4.rotX(head, -0.1 * atk + Math.sin(ph * 2) * 0.03 * w);
    L.add('gobHead', head, tint, prm);
    for (const s of [1, -1]) {
      const e = head.slice(); M4.translate(e, 0.062 * s, 0.16, 0.168); M4.scale(e, 0.026, 0.022, 0.012);
      L.add('gobEye', e, [1, 1, 1, f.state === 'chase' ? 2.5 : 1.2], [0.1, 0, 0, 0]);
      const pu = head.slice(); M4.translate(pu, 0.062 * s, 0.158, 0.18); M4.scale(pu, 0.009, 0.014, 0.005);
      L.add('pupil', pu, [1, 1, 1, 0], [0.1, 0, 0, 0]);
      const leg = root.slice(); M4.translate(leg, 0.12 * s, 0.38, 0); M4.rotX(leg, Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.6 * w - air * 0.5);
      L.add('gobLeg', leg, tint, prm);
      const arm = body.slice(); M4.translate(arm, 0.27 * s, 0.72, 0);
      M4.rotX(arm, -Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.5 * w - (s < 0 ? atk * 2.2 + air * 1.2 : air * 0.6));
      M4.rotZ(arm, s * 0.15);
      L.add(s > 0 ? 'gobArmL' : 'gobArmR', arm, tint, prm);
    }
  }
  addLife(L, t);
  // hero
  const flicker = p.inv > 0 && Math.floor(t * 18) % 2 === 0;
  if (!p.hidden && !flicker && rig.init) addHero(L, t);
  if (typeof physDraw === 'function') physDraw(L, t);
  const r = packInstances(L.map, GR.dynData);
  GR.dynGroups = r.groups;
  GR.device.queue.writeBuffer(GR.dynIB, 0, GR.dynData, 0, Math.max(1, r.n) * INST_FLOATS);
}

function axesM(pos, x, y, z, sx, sy, sz) {
  return new Float32Array([x[0] * sx, x[1] * sx, x[2] * sx, 0, y[0] * sy, y[1] * sy, y[2] * sy, 0, z[0] * sz, z[1] * sz, z[2] * sz, 0, pos[0], pos[1], pos[2], 1]);
}
function addHero(L, t) {
  const p = player, H = rig.headM, st = rig.state;
  const hm = (local) => M4.mul(H, local);
  const bl = rig.blink > 0 ? 0.1 : 1, hurtEyes = st === 'hurt' ? 0.35 : 1, fierce = st === 'attack' || st === 'charge' || st === 'pound';
  const lx = clamp(p.lookYaw * 0.25, -0.22, 0.22), ly = clamp(-p.lookPitch * 0.3, -0.18, 0.18);
  for (const s of [1, -1]) {
    // eyeball: a real-sized sphere; the iris disc and pupil turn with the gaze, lids hinge on its centre
    const E = [s * 0.041, 1.5415, 0.1015], ER = 0.0162;
    const w = at(E[0], E[1], E[2]); M4.scale(w, ER); L.add('eyeW', hm(w), [0.86, 0.83, 0.8, 0.0], [0.05, 0.1, 0, 0]);
    const g = at(E[0], E[1], E[2]); M4.rotY(g, lx * 0.9 + s * 0.04); M4.rotX(g, -ly * 0.9);
    const ir = g.slice(); M4.translate(ir, 0, 0, ER - 0.0014); M4.scale(ir, 0.0079, 0.0079, 0.0022); L.add('iris', hm(ir), [1, 1, 1, 0.1], [0.1, 0, 0, 0]);
    const pu = g.slice(); M4.translate(pu, 0, 0, ER - 0.0004); M4.scale(pu, 0.0037, 0.0037, 0.001); L.add('pupil', hm(pu), [1, 1, 1, 0], [0.1, 0, 0, 0]);
    const gl = g.slice(); M4.translate(gl, 0.0028, 0.0032, ER + 0.0002); M4.scale(gl, 0.0014 * (bl < 1 ? 0 : 1)); L.add('eyeW', hm(gl), [1, 1, 1, 2.4], [0.1, 0, 0, 0]);
    const gl2 = g.slice(); M4.translate(gl2, -0.0026, -0.0022, ER - 0.0001); M4.scale(gl2, 0.0007 * (bl < 1 ? 0 : 1)); L.add('eyeW', hm(gl2), [1, 1, 1, 1.4], [0.1, 0, 0, 0]);
    // caruncle: the pink fold in the inner corner of the eye
    const ca = at(E[0] - s * ER * 0.93, E[1] - 0.0008, E[2] + ER * 0.3); M4.scale(ca, 0.0026, 0.0034, 0.003); L.add('skinBlob', hm(ca), [1.0, 0.62, 0.6, 0], [0.3, 0.1, 0, 0]);
    // lids: open with the upper edge over the top of the iris; squint when hurt or fierce; meet on a blink
    const aU = bl < 1 ? -0.3 : (hurtEyes < 1 ? 0.08 : (fierce ? 0.26 : 0.5)), aL = bl < 1 ? 0.2 : (hurtEyes < 1 ? 0.16 : (fierce ? 0.26 : 0.4));
    const lu = at(E[0], E[1], E[2]); M4.rotX(lu, -aU); M4.scale(lu, ER * 1.07 * s, ER * 1.07, ER * 1.07); L.add('lidUp', hm(lu), [0.9, 0.84, 0.82, 0], [0.5, 0.2, 0, 0]);
    const lo = at(E[0], E[1], E[2]); M4.rotX(lo, aL); M4.scale(lo, ER * 1.05, -ER * 1.05, ER * 1.05); L.add('lidLo', hm(lo), [0.92, 0.86, 0.84, 0], [0.5, 0.2, 0, 0]);
    const br = at(s * 0.04, 1.5625 - (fierce ? 0.004 : 0), 0.1262); M4.rotY(br, s * 0.36); M4.rotZ(br, -s * (fierce ? 0.28 : -0.04)); M4.scale(br, -s * 0.026, 0.02, 0.006);
    L.add('browArc', hm(br), [1, 1, 1, 0], [0.5, 0, 0, 0]);
    // pointed ear
    const eb = [s * 0.102, 1.524, 0.004], ed = V.norm([s * 0.85, 0.42, -0.36]), ez = V.norm(V.sub([0, 0, 1], V.mul(ed, ed[2]))), ex = V.cross(ed, ez);
    L.add('ear', hm(axesM(eb, V.mul(ex, s), ed, ez, 0.03, 0.085, 0.017)), [0.86, 0.78, 0.75, 0], [0.5, 0.3, 0, 0]);
  }
  if (rig.mouth > 0.32) { const mo = at(0, 1.4618, 0.1205); M4.scale(mo, 0.013 - rig.mouth * 0.002, 0.0015 + (rig.mouth - 0.3) * 0.009, 0.005); L.add('lipBlob', hm(mo), [1, 1, 1, 0], [0.4, 0, 0, 0]); }
  // hair locks with spring sway
  for (const lk of LOCKS) {
    const m = at(lk.b[0], lk.b[1], lk.b[2]);
    M4.rotX(m, rig.hair[0] * lk.sway * (lk.tail ? 1.6 : 1)); M4.rotZ(m, rig.hair[1] * lk.sway);
    const z = V.mul(lk.out, -1), zz = V.norm(V.sub(z, V.mul(lk.d, V.dot(z, lk.d)))), x = V.cross(lk.d, zz);
    L.add('lock', hm(M4.mul(m, axesM([0, 0, 0], x, lk.d, zz, lk.w, lk.len, lk.len))), [lk.tone, lk.tone * 0.98, lk.tone * 0.95, 0], [0.4, 0.25, 0, 0]);
  }
  // gear on the back
  const backM = M4.mul(rig.chestM, basisY([-0.12, 1.43, -0.17], V.norm([0.5, -0.86, -0.08])));
  const sh = M4.mul(rig.chestM, (() => { const m = at(0.03, 1.19, -0.235); M4.rotZ(m, 0.18); M4.rotX(m, -Math.PI / 2); return m; })());
  L.add('shield', sh, [1, 1, 1, 0], [0.6, 0.2, 0, 0]);
  L.add('scabbard', backM, [1, 1, 1, 0], [0.5, 0.2, 0, 0]);
  const swM = rig.swordM.slice(); M4.scale(swM, 1.15);
  L.add('sword', swM, [1, 1, 1, 0], [0.2, 0.3, 0, 0]);
  const gw = rig.s.glow;
  L.add('rune', swM, [0.45, 1.0, 1.0, 0.5 + gw * 3.5], [0.2, 0, 0, 0]);
  if (rig.s.leaf > 0.03) {
    const k = rig.s.leaf, R = R3.mul(rig.Rfull, R3.rx(-0.1)), M = m4RT(R, rig.toW([0, 1.96 + (1 - k) * -0.4, 0.02]));
    M4.scale(M, 0.62 * k, 0.62, 0.52 * k);
    L.add('leaf', M, [1, 1, 1, 0.02], [0.7, 0.3, 0, 0]);
    L.add('stem', M, [1, 1, 1, 0], [0.7, 0, 0, 0]);
  }
}

const BF_COLORS = [[1, 0.62, 0.15], [0.35, 0.6, 1], [1, 0.95, 0.5], [0.95, 0.45, 0.7], [0.75, 0.95, 1]];
function addLife(L, t) {
  const p = player.pos;
  // butterflies drift around flower patches near the player
  const fl = WORLD.props.flowers;
  let shown = 0;
  for (let i = 0; i < fl.length && shown < 16; i += 17) {
    const f = fl[i];
    if (Math.abs(f.x - p[0]) > 40 || Math.abs(f.z - p[2]) > 40) continue;
    shown++;
    const s = i * 0.37, x = f.x + Math.sin(t * 0.6 + s) * 1.6 + Math.sin(t * 1.7 + s * 2) * 0.4, z = f.z + Math.cos(t * 0.5 + s * 1.3) * 1.6;
    const y = f.y + 0.7 + Math.sin(t * 2.3 + s) * 0.25 + Math.sin(t * 0.7 + s) * 0.3;
    const dx = Math.cos(t * 0.6 + s) * 0.96 + Math.cos(t * 1.7 + s * 2) * 0.68, dz = -Math.sin(t * 0.5 + s * 1.3) * 0.8;
    const yaw = Math.atan2(dx, dz), flap = Math.sin(t * 22 + s * 5) * 0.9 + 0.3;
    const col = BF_COLORS[i % BF_COLORS.length];
    const root = at(x, y, z); M4.rotY(root, yaw); M4.rotX(root, 0.35); M4.scale(root, 0.1);
    L.add('bfBody', root, [1, 1, 1, 0], [0.6, 0, 0, 0]);
    for (const sd2 of [1, -1]) { const w = root.slice(); M4.rotZ(w, sd2 * flap); M4.scale(w, sd2, 1, 1); L.add('bfWing', w, [...col, 0.15], [0.6, 0.3, 0, 0]); }
  }
  // birds circling high above the island
  for (let fk = 0; fk < 2; fk++) for (let b = 0; b < 5; b++) {
    const a = t * (0.07 + fk * 0.02) + fk * 2.5 + b * 0.05, R = 45 + fk * 20 + (b % 2) * 3;
    const x = Math.sin(a) * R - (b >> 1) * 1.5 * Math.cos(a), z = Math.cos(a) * R + (b >> 1) * 1.5 * Math.sin(a), y = 34 + fk * 6 + Math.sin(t * 0.8 + b) * 0.8 + (b % 2) * 0.6;
    const root = at(x, y, z); M4.rotY(root, a + Math.PI / 2); M4.scale(root, 0.55);
    L.add('birdBody', root, [1, 1, 1, 0], [0.6, 0.2, 0, 0]);
    const flap = Math.sin(t * 7 + b * 1.3 + fk) * 0.5;
    for (const sd2 of [1, -1]) { const w = root.slice(); M4.translate(w, sd2 * 0.08, 0.04, 0); M4.rotZ(w, sd2 * flap); M4.scale(w, sd2 * 1.3, 1, 1); L.add('birdWing', w, [1, 1, 1, 0], [0.6, 0.2, 0, 0]); }
  }
  // leaves falling from nearby trees, drifting in the wind
  let nt = 0;
  for (let i = 0; i < WORLD.props.trees.length && nt < 10; i++) {
    const tr = WORLD.props.trees[i];
    if (Math.abs(tr.x - p[0]) > 26 || Math.abs(tr.z - p[2]) > 26) continue;
    nt++;
    for (let k = 0; k < 3; k++) {
      const s = i * 1.7 + k * 2.3, per = 5 + (k % 2) * 2, u = ((t + s * 3) % per) / per;
      const top = tr.y + 4.2 * tr.s, fall = top * 0 + u * (4.2 * tr.s);
      const x = tr.x + Math.sin(s) * 1.3 * tr.s + u * 2.2 + Math.sin(t * 2 + s) * 0.3, z = tr.z + Math.cos(s) * 1.3 * tr.s + u * 1.2 + Math.cos(t * 1.6 + s) * 0.3;
      const y = top - fall + 0.05;
      const m = at(x, y, z); M4.rotY(m, t * 2 + s); M4.rotX(m, Math.sin(t * 3 + s) * 1.1); M4.rotZ(m, t * 1.3 + s); M4.scale(m, 0.06 * (u < 0.92 ? 1 : (1 - u) / 0.08));
      L.add('leafBit', m, k === 2 ? [1.25, 0.8, 0.35, 0] : [1, 1, 1, 0], [0.7, 0.2, 0, 0]);
    }
  }
}
function buildCapeTrail() {
  buildCapeVerts(GR.capeData);
  GR.device.queue.writeBuffer(GR.capeVB, 0, GR.capeData);
  const tr = rig.trail, d = GR.trailData; let n = 0;
  for (let i = 1; i < tr.length; i++) {
    const a0 = tr[i - 1], a1 = tr[i], f0 = (i - 1) / tr.length, f1 = i / tr.length;
    // energy arc: nearly clear toward the hilt, a hot blue-white edge at the tip, fading with age
    const tipC = (f) => [2.4, 2.7, 3.0, Math.pow(Math.min(1, f * 1.15), 1.6)], baseC = (f) => [0.5, 0.9, 1.4, Math.min(1, f) * 0.08];
    const mid = (a, b) => V.lerp(a, b, 0.72), midC = (f) => [1.2, 1.7, 2.2, Math.min(1, f) * 0.35];
    const m0 = mid(a0[0], a0[1]), m1 = mid(a1[0], a1[1]);
    const quads = [[[a0[0], baseC(f0)], [m0, midC(f0)], [m1, midC(f1)], [a1[0], baseC(f1)]], [[m0, midC(f0)], [a0[1], tipC(f0)], [a1[1], tipC(f1)], [m1, midC(f1)]]];
    for (const qd of quads) for (const k of [0, 1, 2, 0, 2, 3]) { d.set([...qd[k][0], ...qd[k][1]], n * 7); n++; }
  }
  GR.trailCount = n;
  if (n) GR.device.queue.writeBuffer(GR.trailVB, 0, d, 0, n * 7);
}
function buildLines() {
  const d = GR.lineData; let n = 0;
  const seg = (a, b, c) => { if (n >= 1198) return; d.set([...a, ...c], n * 7); d.set([...b, ...c], (n + 1) * 7); n += 2; };
  const CYAN = [0.22, 0.9, 1, 1], PINK = [1, 0.35, 0.82, 1], GOLD = [1, 0.82, 0.23, 1], LIME = [0.62, 1, 0.42, 1];
  const F = rig.F, P = i => F[i].P, tip = (i, len) => V.add(F[i].P, R3.v(F[i].R, [0, len, 0]));
  const joint = (q, c, r = 0.025) => { seg(V.add(q, [-r, 0, 0]), V.add(q, [r, 0, 0]), c); seg(V.add(q, [0, -r, 0]), V.add(q, [0, r, 0]), c); seg(V.add(q, [0, 0, -r]), V.add(q, [0, 0, r]), c); };
  const headTop = M4.apply(rig.headM, [0, 1.68, 0.01]);
  seg(P(0), P(1), CYAN); seg(P(1), P(2), CYAN); seg(P(2), P(3), CYAN); seg(P(3), P(4), CYAN); seg(P(4), headTop, CYAN);
  for (let i = 0; i < 5; i++) joint(P(i), CYAN);
  for (const s of [1, -1]) {
    const u = BI.ua(s), f = BI.fa(s), h = BI.hand(s), t = BI.thigh(s), sn = BI.shin(s), ft = BI.foot(s);
    seg(P(2), P(u), CYAN); seg(P(u), P(f), PINK); seg(P(f), P(h), PINK); seg(P(h), tip(h, 0.1), PINK);
    seg(P(0), P(t), CYAN); seg(P(t), P(sn), PINK); seg(P(sn), P(ft), PINK); seg(P(ft), tip(ft, 0.17), PINK);
    for (const q of [u, f, h, t, sn, ft]) joint(P(q), PINK);
  }
  for (let i = 0; i < 2; i++) { joint(rig.hands[i].p, LIME, 0.04); joint(rig.feet[i].p, LIME, 0.04); }
  const C = rig.cape, W = CAPE.W;
  for (let k = 0; k < C.length; k++) { if (k % W < W - 1) seg(C[k].p, C[k + 1].p, GOLD); if (k + W < C.length) seg(C[k].p, C[k + W].p, GOLD); }
  for (const lk of LOCKS) { const a = M4.apply(rig.headM, lk.b), b = M4.apply(rig.headM, V.add(lk.b, V.mul(lk.d, lk.len))); seg(a, b, GOLD); }
  seg(rig.bladeBase, rig.bladeTip, LIME);
  GR.lineCount = n;
  GR.device.queue.writeBuffer(GR.lineVB, 0, d, 0, n * 7);
}

function buildParticles() {
  const d = GR.partData; let n = 0;
  for (const q of parts) {
    const k = q.life / q.max;
    if (q.ring) { const r = q.size * (1.15 - k); d.set([q.p[0], q.p[1], q.p[2], r, q.col[0], q.col[1], q.col[2], -q.col[3] * k], n * 8); }
    else d.set([q.p[0], q.p[1], q.p[2], q.size * (0.4 + 0.6 * k), q.col[0], q.col[1], q.col[2], q.col[3] * Math.min(1, k * 2.5)], n * 8);
    n++;
  }
  // ambient: pollen motes + orb sparkles + awakened portal motes
  GR.partCount = n;
  if (n) GR.device.queue.writeBuffer(GR.partVB, 0, d, 0, n * 8);
}

function frustumPlanes(m) {
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]], r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  return [V4add(r3, r0), V4sub(r3, r0), V4add(r3, r1), V4sub(r3, r1), r2, V4sub(r3, r2)].map(p => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l, p[3] / l]; });
}
const V4add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]], V4sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
// culling modes: 'view' = camera frustum + grass draw distance; 'fine' = near the hero (fine shadow cascade); none = draw all
function groupVisible(g, mode) {
  const b = g.b; if (!b || !mode) return true;
  if (mode === 'fine') return Math.hypot(b[0] - player.pos[0], b[2] - player.pos[2]) < 22 + b[3];
  if (mode === 'shadow') return Math.hypot(b[0] - player.pos[0], b[2] - player.pos[2]) < 60 + b[3];
  if (g.small) { const Q = QUALITY[state.quality]; if (Math.hypot(b[0] - cam.pos[0], b[2] - cam.pos[2]) > (Q.grassDist || 60) + b[3]) return false; }
  for (const p of GR.frustum) if (p[0] * b[0] + p[1] * b[1] + p[2] * b[2] + p[3] < -b[3]) return false;
  return true;
}
function drawGroups(pass, groups, instBuf, cull) {
  pass.setVertexBuffer(1, instBuf);
  for (const g of groups) {
    if (cull && cull !== 'lo' && !groupVisible(g, cull)) continue;
    // level of detail: distant chunks, shadows and the reflection use the _lo mesh when one exists
    let mi = GR.meshInfo[g.mesh];
    if (g.b && cull !== undefined) { const lo = GR.meshInfo[g.mesh + '_lo']; if (lo && (cull !== 'view' || Math.hypot(g.b[0] - cam.pos[0], g.b[2] - cam.pos[2]) - g.b[3] > 30)) mi = lo; }
    pass.drawIndexed(mi.count, g.count, mi.first, mi.base, g.first);
  }
}
const identityInst = (() => { const a = new Float32Array(INST_FLOATS); a.set(M4.id(), 0); a.set([1, 1, 1, 0], 16); a.set([0.6, 0.35, 0, 0], 20); return a; })();

function render() {
  resizeTargets();
  frameUniforms();
  buildDynamic();
  const heroVisible = !player.hidden && !(player.inv > 0 && Math.floor(state.time * 18) % 2 === 0) && rig.init;
  if (rig.init) { skinHero(); GR.device.queue.writeBuffer(GR.heroVB, 0, HERO.out); buildCapeTrail(); }
  if (!GR.identIB) { GR.identIB = GR.device.createBuffer({ size: INST_FLOATS * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); GR.device.queue.writeBuffer(GR.identIB, 0, identityInst); }
  buildParticles();
  if (state.debug && rig.init) buildLines();
  if (!GR.shadowGroups || GR.shadowGroupsSrc !== GR.staticGroups) { GR.shadowGroups = GR.staticGroups.filter(g => !GR.shadowSkip.has(g.mesh)); GR.shadowGroupsSrc = GR.staticGroups; }
  const d = GR.device, enc = d.createCommandEncoder();

  // --- shadow pass ---
  {
    const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: GR.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
    pass.setBindGroup(0, GR.shadowBG);
    pass.setPipeline(GR.psTerrain); pass.setVertexBuffer(0, GR.terrVB); pass.setIndexBuffer(GR.terrIB, 'uint32'); pass.drawIndexed(GR.terrCount);
    pass.setPipeline(GR.psMesh); pass.setVertexBuffer(0, GR.meshVB); pass.setIndexBuffer(GR.meshIB, 'uint32');
    drawGroups(pass, GR.shadowGroups, GR.staticIB, 'shadow');
    drawGroups(pass, GR.dynGroups, GR.dynIB);
    if (heroVisible) {
      pass.setPipeline(GR.psHero);
      pass.setVertexBuffer(0, GR.heroVB); pass.setIndexBuffer(GR.heroIB, 'uint32'); pass.drawIndexed(GR.heroCount);
      pass.setVertexBuffer(0, GR.capeVB); pass.setIndexBuffer(GR.capeIB, 'uint32'); pass.drawIndexed(GR.capeCount);
    }
    pass.end();
  }
  // --- fine cascade around the hero ---
  const Q = QUALITY[state.quality];
  if (Q.fine) {
    const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: GR.shadowView2, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
    pass.setBindGroup(0, GR.shadowBG);
    pass.setPipeline(GR.psTerrain2); pass.setVertexBuffer(0, GR.terrVB); pass.setIndexBuffer(GR.terrIB, 'uint32'); pass.drawIndexed(GR.terrCount);
    pass.setPipeline(GR.psMesh2); pass.setVertexBuffer(0, GR.meshVB); pass.setIndexBuffer(GR.meshIB, 'uint32');
    drawGroups(pass, GR.shadowGroups, GR.staticIB, 'fine');
    drawGroups(pass, GR.dynGroups, GR.dynIB);
    if (heroVisible) {
      pass.setPipeline(GR.psHero2);
      pass.setVertexBuffer(0, GR.heroVB); pass.setIndexBuffer(GR.heroIB, 'uint32'); pass.drawIndexed(GR.heroCount);
      pass.setVertexBuffer(0, GR.capeVB); pass.setIndexBuffer(GR.capeIB, 'uint32'); pass.drawIndexed(GR.capeCount);
    }
    pass.end();
  }
  // --- mirrored reflection pass (half resolution) ---
  {
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: GR.reflColor.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: GR.reflDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, GR.sceneBGR);
    if (Q.refl) {
    pass.setPipeline(GR.pSkyR); pass.draw(3);
    pass.setPipeline(GR.pTerrainR); pass.setVertexBuffer(0, GR.terrVB); pass.setIndexBuffer(GR.terrIB, 'uint32'); pass.drawIndexed(GR.terrCount);
    pass.setPipeline(GR.pMeshR); pass.setVertexBuffer(0, GR.meshVB); pass.setIndexBuffer(GR.meshIB, 'uint32');
    drawGroups(pass, GR.shadowGroups, GR.staticIB, 'lo');
    drawGroups(pass, GR.dynGroups, GR.dynIB);
    if (heroVisible) {
      pass.setPipeline(GR.pHeroR);
      pass.setVertexBuffer(0, GR.heroVB); pass.setIndexBuffer(GR.heroIB, 'uint32'); pass.drawIndexed(GR.heroCount);
      pass.setVertexBuffer(0, GR.capeVB); pass.setIndexBuffer(GR.capeIB, 'uint32'); pass.drawIndexed(GR.capeCount);
    }
    }
    pass.end();
  }
  // --- main HDR pass (4x MSAA) ---
  {
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: GR.msColor.createView(), resolveTarget: GR.hdr.createView(), clearValue: { r: 0.6, g: 0.75, b: 0.9, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
      depthStencilAttachment: { view: GR.msDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });
    pass.setBindGroup(0, GR.sceneBG);
    pass.setPipeline(GR.pSky); pass.draw(3);
    pass.setPipeline(GR.pTerrain); pass.setVertexBuffer(0, GR.terrVB); pass.setIndexBuffer(GR.terrIB, 'uint32'); pass.drawIndexed(GR.terrCount);
    pass.setPipeline(GR.pMesh); pass.setVertexBuffer(0, GR.meshVB); pass.setIndexBuffer(GR.meshIB, 'uint32');
    drawGroups(pass, Q.grass ? GR.staticGroups : GR.shadowGroups, GR.staticIB, 'view');
    drawGroups(pass, GR.dynGroups, GR.dynIB);
    if (heroVisible) {
      pass.setPipeline(GR.pHero);
      pass.setVertexBuffer(0, GR.heroVB); pass.setIndexBuffer(GR.heroIB, 'uint32'); pass.drawIndexed(GR.heroCount);
      pass.setVertexBuffer(0, GR.capeVB); pass.setIndexBuffer(GR.capeIB, 'uint32'); pass.drawIndexed(GR.capeCount);
    }
    pass.setPipeline(GR.pWater); pass.setVertexBuffer(0, GR.waterVB); pass.setIndexBuffer(GR.waterIB, 'uint32'); pass.drawIndexed(6);
    if (heroVisible && GR.trailCount) { pass.setPipeline(GR.pTrail); pass.setVertexBuffer(0, GR.trailVB); pass.draw(GR.trailCount); }
    if (GR.partCount) { pass.setPipeline(GR.pPart); pass.setVertexBuffer(0, GR.partVB); pass.draw(6, GR.partCount); }
    if (GR.rainCount) { pass.setPipeline(GR.pSplash); pass.draw(12, GR.splashCount); pass.setPipeline(GR.pRain); pass.draw(6, GR.rainCount); }
    if (state.debug && rig.init && GR.lineCount) { pass.setPipeline(GR.pLine); pass.setVertexBuffer(0, GR.lineVB); pass.draw(GR.lineCount); }
    pass.end();
  }
  // --- bloom + tonemap ---
  const post = (pipe, bg, view) => { const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] }); pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end(); };
  post(GR.pBright, GR.bgBright, GR.bloomA.createView());
  post(GR.pBlurH, GR.bgBlurH, GR.bloomB.createView());
  post(GR.pBlurV, GR.bgBlurV, GR.bloomA.createView());
  post(GR.pFinal, GR.bgFinal, GR.ctx.getCurrentTexture().createView());
  d.queue.submit([enc.finish()]);
}

// ============================================================
//  Game flow + main loop
// ============================================================
const state = { quality: (() => { try { return localStorage.getItem('brio-quality2') || (isTouch ? 'baja' : 'media'); } catch (_) { return isTouch ? 'baja' : 'media'; } })(), mode: 'title', time: 0, playTime: 0, required: 0, shrineAwake: false, won: false, hitstop: 0, debug: false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let HERO = null, MESHES = null;
function hitstop(t) { state.hitstop = Math.max(state.hitstop, t); }

function islandsStep(dt) {
  for (const s of WORLD.islands) {
    if (!s.move) { s.dx = s.dy = s.dz = 0; continue; }
    const m = s.move, a = state.time * m.sp + m.ph;
    const nx = s.bx + Math.sin(a) * m.ax, nz = s.bz + Math.sin(a) * m.az, ny = (s.by ?? (s.by = s.top)) + Math.sin(a * 2) * m.ay;
    s.dx = nx - s.x; s.dz = nz - s.z; s.dy = ny - s.top;
    s.x = nx; s.z = nz; s.top = ny; s.bottom = ny - s.r * 1.4;
  }
}
const EMPTY_IN = { mx: 0, mz: 0, jumpHeld: false, punchHeld: false, jumpP: false, punchP: false, dashP: false, poundP: false, cam: [0, 0] };
function simStep(dt, inp) {
  state.time += dt;
  islandsStep(dt);
  playerStep(dt, inp);
  for (const f of foes) foeStep(f, dt);
  if (typeof physStep === 'function') physStep(dt, inp);
  pickupsStep(dt);
  updateRig(dt, state.time);
}
function ambientParticles(dt) {
  // pollen near the player, sparkles on orbs, motes from an awake portal
  if (Math.random() < dt * 14) {
    const a = rand(0, TAU), r = rand(2, 14), q = V.add(player.pos, [Math.sin(a) * r, rand(0.3, 3), Math.cos(a) * r]);
    particle(q, [rand(-0.2, 0.2), rand(0.05, 0.25), rand(-0.2, 0.2)], rand(2, 4), rand(0.025, 0.05), [1.4, 1.35, 1.0, 0.8], -0.02, 0.2);
  }
  for (const o of WORLD.orbs) if (!o.got && Math.random() < dt * 1.2 && V.dist([o.x, o.y, o.z], player.pos) < 30) particle([o.x + rand(-0.2, 0.2), o.y + rand(-0.2, 0.2), o.z + rand(-0.2, 0.2)], [0, 0.5, 0], 0.7, 0.07, [1.6, 1.2, 0.45, 1], 0, 0.5);
  if (state.shrineAwake && Math.random() < dt * 30) {
    const a = rand(0, TAU), r = rand(0, 2.2);
    particle([SHRINE[0] + Math.sin(a) * r, SHRINE[1] + 0.9 + rand(0, 4), SHRINE[2] + Math.cos(a) * r * 0.2], [0, rand(0.8, 2), 0], rand(1, 2), rand(0.05, 0.1), [0.8, 2.0, 2.2, 0.9], -0.3, 0.4);
  }
}

let last = performance.now(), acc = 0;
const STEP = 1 / 120;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  const inp = readInput(dt);
  if (state.mode === 'play' || state.mode === 'title' || state.mode === 'cine') {
    const useIn = state.mode === 'play' ? inp : EMPTY_IN;
    if (state.hitstop > 0) { state.hitstop -= dt; }
    else {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 8) {
        simStep(STEP, useIn);
        useIn.jumpP = useIn.punchP = useIn.dashP = useIn.poundP = false;
        acc -= STEP; n++;
      }
      if (n === 8) acc = 0;
    }
    partsStep(dt);
    ambientParticles(dt);
    if (state.mode === 'play') {
      state.playTime += dt;
      const tt = fmtTime(state.playTime);
      if (tt !== frame.lastT) { document.getElementById('timer').textContent = tt; frame.lastT = tt; }
      musicStep(dt);
    }
    if (state.mode === 'cine') cineStep(dt);
    toastStep(dt); questStep(dt);
  }
  cameraUpdate(dt, state.mode === 'play' ? inp.cam : [0, 0]);
  if (!window.__skipRender) perfStep(dt);
  if (FPSHUD) fpsHud(dt);
  if (!window.__skipRender) { try { render(); } catch (e) { console.error(e); } }
  requestAnimationFrame(frame);
}

function show(id, on) { document.getElementById(id).hidden = !on; }
// ---- cinematic intro: three shots with story subtitles, skippable at any time ----
const CINE = { t: 0, len: 15, lines: [
  [0.8, 5.0, 'Hace mil años, las Chispas guardaban la luz de esta isla.'],
  [5.4, 9.8, 'Cuando el santuario se apagó, se dispersaron por la hierba… y los Gruñones despertaron.'],
  [10.3, 14.6, 'Brío, el último guardián del Sol, jura devolverles la luz.']] };
function startGame(cine = true) {
  document.getElementById('loader').classList.add('done');
  initAudio(); if (AC && AC.state === 'suspended') AC.resume();
  sfx('ui');
  show('intro', false);
  if (!cine) { beginPlay(); return; }
  state.mode = 'cine'; CINE.t = 0; cam.orbit = 0;
  document.body.classList.add('cine'); show('skipCine', true);
}
function cineStep(dt) {
  CINE.t += dt;
  const line = CINE.lines.find(l => CINE.t >= l[0] && CINE.t < l[1]), el = document.getElementById('subs');
  const txt = line ? line[2] : '';
  if (txt && el.textContent !== txt) el.textContent = txt;
  el.classList.toggle('on', !!line && CINE.t < line[1] - 0.6);
  if (CINE.t >= CINE.len) beginPlay();
}
function beginPlay() {
  player.swordOut = 0.5;
  state.mode = 'play';
  document.body.classList.remove('cine'); show('skipCine', false);
  document.getElementById('subs').classList.remove('on');
  show('hud', true); show('touch', isTouch);
  cam.yaw = player.yaw + Math.PI; cam.pitch = 0.32; cam.manualT = 0; cam.dist = 5.6;
  showQuest('Misión', 'Reúne las Chispas perdidas', 5.5);
  canvas.focus();
}
let questTimer = 0;
function showQuest(kind, text, secs) {
  document.getElementById('questK').textContent = kind; document.getElementById('questT').textContent = text;
  document.getElementById('quest').classList.add('on'); questTimer = secs;
}
function questStep(dt) { if (questTimer > 0 && (questTimer -= dt) <= 0) document.getElementById('quest').classList.remove('on'); }
function pauseGame() {
  if (state.mode !== 'play') return;
  state.mode = 'pause'; show('pause', true);
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('resumeBtn').focus();
}
function resumeGame() {
  if (state.mode !== 'pause') return;
  state.mode = 'play'; show('pause', false); last = performance.now(); canvas.focus();
}
function winGame() {
  state.won = true; state.mode = 'win'; sfx('win');
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('wTime').textContent = fmtTime(state.playTime);
  document.getElementById('wOrbs').textContent = stats.orbs + ' / ' + WORLD.orbs.length;
  document.getElementById('wFoes').textContent = stats.foes;
  document.getElementById('wFalls').textContent = stats.falls;
  show('win', true); show('touch', false); show('hud', false); show('skelLegend', false);
  toastTimer = 0; document.getElementById('toast').classList.remove('on');
  burst([SHRINE[0], SHRINE[1] + 3.4, SHRINE[2]], 80, [1.5, 1.3, 0.6, 1], 9, 1.2, 0.18);
}
function restartGame() {
  for (const o of WORLD.orbs) { o.got = false; o.x = o.ox; o.y = o.oy; o.z = o.oz; o.pull = 0; }
  for (const h of WORLD.hearts) h.got = false;
  resetFoes();
  if (typeof physReset === 'function') physReset();
  player.maxHp = 4;
  resetPlayer(START.slice(), Math.PI);
  Object.assign(stats, { orbs: 0, foes: 0, falls: 0 });
  Object.assign(state, { shrineAwake: false, won: false, playTime: 0 });
  parts.length = 0;
  document.getElementById('objective').textContent = 'Recoge chispas para despertar el santuario de la colina.';
  updateHUD();
  show('win', false); show('pause', false);
  state.mode = 'play'; show('hud', true); show('touch', isTouch);
  cam.yaw = Math.PI * 0 + player.yaw + Math.PI;
  last = performance.now();
}
function setQuality(q, auto = false) {
  state.quality = q; GR.w = 0;
  if (state.qualityManual) { try { localStorage.setItem('brio-quality2', q); } catch (_) { } }
  const b = document.getElementById('qualBtn'); if (b) b.textContent = 'Calidad: ' + QUALITY[q].label;
}
function cycleQuality() { const order = ['alta', 'media', 'baja']; setQuality(order[(order.indexOf(state.quality) + 1) % 3]); }
const perf = { t: 0, n: 0, slow: 0 };
// optional diagnostics: open the game with ?fps to see frame rate, resolution and quality on the device
const FPSHUD = /[?&]fps/.test(location.search);
const fpsS = { t: 0, n: 0, worst: 0, el: null };
function fpsHud(dt) {
  fpsS.t += dt; fpsS.n++; fpsS.worst = Math.max(fpsS.worst, dt);
  if (fpsS.t < 0.5) return;
  if (!fpsS.el) { fpsS.el = document.createElement('div'); fpsS.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:12px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;pointer-events:none;white-space:pre'; document.body.appendChild(fpsS.el); }
  fpsS.el.textContent = `${Math.round(fpsS.n / fpsS.t)} fps · ${(fpsS.t / fpsS.n * 1000).toFixed(1)} ms (peor ${(fpsS.worst * 1000).toFixed(0)})\n${GR.w}×${GR.h} · escala ${(GR.rscale || 1).toFixed(2)} · ${state.quality}`;
  fpsS.t = 0; fpsS.n = 0; fpsS.worst = 0;
}
// adaptive performance: dynamic resolution first (every second), then quality presets; aims at ~60 fps on any device
function perfStep(dt) {
  if (state.mode !== 'play' && state.mode !== 'cine' && state.mode !== 'title') return;
  perf.t += dt; perf.n++;
  if (perf.t < 1) return;
  const avg = perf.t / perf.n; perf.t = 0; perf.n = 0;
  const rs = GR.rscale || 1;
  if (avg > 1 / 50) {
    perf.fast = 0;
    if (rs > 0.55) GR.rscale = Math.max(0.55, rs * (avg > 1 / 30 ? 0.75 : 0.88));
    else if (!state.qualityManual && state.quality !== 'baja') { perf.ceiling = state.quality; setQuality(state.quality === 'alta' ? 'media' : 'baja', true); GR.rscale = 0.8; }
  } else if (avg < 1 / 57) {
    perf.fast = (perf.fast || 0) + 1;
    if (perf.fast >= 2 && rs < 1) { GR.rscale = Math.min(1, rs * 1.08); perf.fast = 0; }
    else if (perf.fast >= 6 && rs >= 1 && !state.qualityManual && state.quality !== 'alta' && perf.ceiling !== (state.quality === 'baja' ? 'media' : 'alta')) { setQuality(state.quality === 'baja' ? 'media' : 'alta'); perf.fast = 0; }
  } else perf.fast = 0;
}
function toggleSkeleton() {
  state.debug = !state.debug;
  document.getElementById('skelBtn').setAttribute('aria-pressed', state.debug ? 'true' : 'false');
  show('skelLegend', state.debug);
}
function showError(msg) {
  document.getElementById('errMsg').textContent = msg;
  show('err', true); show('intro', false); show('hud', false);
}

const LORE = ['«Donde cae una Chispa, la hierba recuerda el sol.»', '«Los Gruñones temen la luz, pero no la espada.»', '«El portal solo se abre para quien reúne la luz perdida.»', '«Brío aprendió a planear mirando las hojas del gran árbol.»'];
async function boot() {
  const tick = () => new Promise(r => setTimeout(r, 30));
  const bar = document.getElementById('lbar'), pct = document.getElementById('lpct'), stg = document.getElementById('lstage'), lore = document.getElementById('llore'), ld = document.getElementById('loader');
  let li = Math.floor(Math.random() * LORE.length); lore.textContent = LORE[li];
  const loreT = setInterval(() => { lore.style.opacity = 0; setTimeout(() => { li = (li + 1) % LORE.length; lore.textContent = LORE[li]; lore.style.opacity = 1; }, 800); }, 4200);
  const step = async (p, label) => { bar.style.width = p + '%'; pct.textContent = Math.round(p) + '%'; stg.textContent = label; ld.setAttribute('aria-valuenow', Math.round(p)); await tick(); };
  await step(4, 'Alzando la isla');
  buildWorld();
  for (const o of WORLD.orbs) { o.ox = o.x; o.oy = o.y; o.oz = o.z; }
  state.required = Math.max(1, WORLD.orbs.length - 8);
  await step(22, 'Tallando rocas y árboles');
  MESHES = buildMeshes();
  await step(40, 'Forjando espada y escudo');
  buildHeroProps(MESHES);
  buildGoblin(MESHES);
  buildLife(MESHES);
  if (typeof physBoot === 'function') physBoot(MESHES);
  await step(55, 'Esculpiendo al héroe');
  HERO = buildHero();
  resetFoes();
  resetPlayer(START.slice(), Math.PI);
  updateHUD();
  await step(72, 'Compilando la luz');
  try { await initRenderer(MESHES); }
  catch (e) {
    clearInterval(loreT); ld.classList.add('done');
    showError((e && e.message ? e.message + ' ' : '') + 'Brío se dibuja con WebGPU y shaders WGSL. Ábrelo en Chrome o Edge 113+, Safari 26+ o Firefox 141+ con aceleración por hardware activada.');
    return;
  }
  await step(90, 'Pintando el cielo');
  try { cameraUpdate(0.016, [0, 0]); render(); } catch (_) { }
  await step(100, 'Listo');
  clearInterval(loreT);
  setTimeout(() => { ld.classList.add('done'); show('intro', true); document.body.classList.add('cine'); document.getElementById('playBtn').focus(); }, 350);
  // wire UI
  document.getElementById('playBtn').addEventListener('click', () => startGame());
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
  document.getElementById('restartBtn').addEventListener('click', () => { show('pause', false); restartGame(); });
  document.getElementById('againBtn').addEventListener('click', restartGame);
  document.getElementById('pauseBtn').addEventListener('click', pauseGame);
  document.getElementById('skelBtn').addEventListener('click', () => { toggleSkeleton(); canvas.focus(); });
  document.getElementById('muteBtn').addEventListener('click', () => { toggleMute(); canvas.focus(); });
  document.getElementById('qualBtn').addEventListener('click', () => { state.qualityManual = true; cycleQuality(); canvas.focus(); });
  setQuality(state.quality);
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
    show('ctlKb', b.dataset.tab === 'kb'); show('ctlPad', b.dataset.tab === 'pad'); show('ctlTouch', b.dataset.tab === 'touch');
  }));
  if (isTouch) document.querySelector('.tabs button[data-tab="touch"]').click();
  setupTouch();
  addEventListener('resize', () => { });
  window.__brio = { state, player, stats, WORLD, GR, foes, HERO, rig, cam, keys, input, press, startGame: () => startGame(false), startCine: () => startGame(true), toggleSkeleton };
  document.getElementById('skipCine').addEventListener('click', () => { if (state.mode === 'cine') beginPlay(); });
  document.getElementById('intro').addEventListener('click', (e) => { if (state.mode === 'title' && e.target.id !== 'playBtn') startGame(); });
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}
boot();
