// ============================================================
//  Foes, pickups, fist, particles
// ============================================================
let foes = [];
const stats = { orbs: 0, foes: 0, falls: 0, time: 0 };

function resetFoes() {
  foes = WORLD.foes.map(f => ({ pos: f.spawn.slice(), vel: [0, 0, 0], yaw: srand() * TAU, home: f.home, alive: true, hp: 2, stun: 0, puffed: false, deadT: 0, state: 'wander', t: rand(0, 2), goal: f.spawn.slice(), sq: 0, sqv: 0, cd: 0, onGround: true, hitFlash: 0 }));
}
function foeStep(f, dt) {
  if (!f.alive) {
    f.deadT += dt;
    if (!f.puffed && f.deadT > 0.42) {
      f.puffed = true;
      const c = deadPos(f);
      for (let i = 0; i < 18; i++) { const d = V.norm([rand(-1, 1), rand(0, 1), rand(-1, 1)]); particle(V.add(c, V.mul(d, 0.2)), V.mul(d, rand(0.8, 2.2)), rand(0.5, 0.9), rand(0.16, 0.3), [0.55, 0.45, 0.6, 0.7], -0.6, 2.5, 0.5); }
      burst(c, 8, [1.4, 1.2, 0.7, 1], 3, 0.4, 0.06);
    }
    return;
  }
  const p = player, toP = V.sub(p.pos, f.pos), dP = Math.hypot(toP[0], toP[2]);
  f.t -= dt; f.cd = Math.max(0, f.cd - dt); f.hitFlash = Math.max(0, f.hitFlash - dt); f.stun = Math.max(0, f.stun - dt);
  const chase = dP < 11 && p.deadT <= 0 && Math.abs(toP[1]) < 4 && f.stun <= 0;
  let speed = 0, dir = [0, 0, 0];
  if (chase) {
    f.state = 'chase'; speed = 3.1; dir = V.norm([toP[0], 0, toP[2]]);
    if (dP < 3.6 && f.onGround && f.cd <= 0) { f.vel[1] = 7.5; f.vel[0] = dir[0] * 6.5; f.vel[2] = dir[2] * 6.5; f.onGround = false; f.cd = 1.6; f.sqv -= 6; sfx('foehop'); }
  } else {
    f.state = 'wander';
    if (f.t <= 0) { f.t = rand(1.5, 4); const a = rand(0, TAU), r = rand(0, 6); f.goal = [f.home[0] + Math.sin(a) * r, 0, f.home[1] + Math.cos(a) * r]; }
    const d = [f.goal[0] - f.pos[0], 0, f.goal[2] - f.pos[2]];
    if (Math.hypot(d[0], d[2]) > 0.5) { speed = 1.6; dir = V.norm(d); }
  }
  if (f.onGround && f.stun <= 0) {
    f.vel[0] = damp(f.vel[0], dir[0] * speed, 6, dt); f.vel[2] = damp(f.vel[2], dir[2] * speed, 6, dt);
  }
  if (speed > 0) f.yaw += clamp(angDiff(f.yaw, Math.atan2(dir[0], dir[2])), -6 * dt, 6 * dt);
  f.vel[1] -= 26 * dt;
  let nx = f.pos[0] + f.vel[0] * dt, nz = f.pos[2] + f.vel[2] * dt, ny = f.pos[1] + f.vel[1] * dt;
  const h = heightAt(nx, nz);
  if (h < 0.6 || terrainNormal(nx, nz)[1] < 0.62 && h > f.pos[1] + 0.3) { nx = f.pos[0]; nz = f.pos[2]; f.t = 0; f.vel[0] *= -0.5; f.vel[2] *= -0.5; }
  for (const s of WORLD.solids) {
    if (s.kind !== 'tree' && s.kind !== 'rock' && s.kind !== 'pillar') continue;
    const dx = nx - s.x, dz = nz - s.z, d = Math.hypot(dx, dz), r = s.r + 0.5;
    if (d < r && d > 1e-6) { nx = s.x + dx / d * r; nz = s.z + dz / d * r; }
  }
  const gh = heightAt(nx, nz);
  if (ny <= gh) { if (!f.onGround && f.vel[1] < -3) { f.sqv += 5; dust([nx, gh, nz], 4, 0.7); } ny = gh; f.vel[1] = 0; f.onGround = true; } else f.onGround = false;
  f.pos = [nx, ny, nz];
  // bob while walking
  f.sqv += (-f.sq * 200 - f.sqv * 10) * dt; f.sq += f.sqv * dt;
  if (f.onGround && speed > 0) f.sq += Math.sin(state.time * 14 + f.home[0]) * 0.004;
  // contact with player
  if (p.deadT <= 0 && !p.hidden) {
    const c1 = V.add(f.pos, [0, 0.55, 0]), c2 = V.add(p.pos, [0, 0.6, 0]);
    const d = V.dist(c1, c2);
    if (d < 1.0) {
      if (p.dashT > 0 || p.pound) killFoe(f, V.norm(V.sub(f.pos, p.pos)));
      else if (p.vel[1] < -1 && p.pos[1] > f.pos[1] + 0.45) {
        killFoe(f, [0, -1, 0]);
        p.vel[1] = TUNE.JUMP * 0.95; p.jumps = 0; p.canDash = true; p.sqv -= 5; sfx('stomp');
      } else hurt(f.pos);
    }
  }
}
// a hit: stagger and knock back, or finish the foe off
function damageFoe(f, dir, dmg, at) {
  if (!f.alive) return;
  f.hp -= dmg;
  const c = at || V.add(f.pos, [0, 0.7, 0]);
  for (let i = 0; i < 14; i++) { const d = V.norm([rand(-1, 1), rand(-0.3, 1), rand(-1, 1)]); particle(c, V.mul(d, rand(4, 9)), rand(0.12, 0.25), rand(0.03, 0.06), [2.2, 1.9, 1.2, 1], 8, 3); }
  if (f.hp <= 0) { killFoe(f, dir); return; }
  f.hitFlash = 0.14; f.stun = 0.55; f.cd = Math.max(f.cd, 0.8);
  f.vel = [dir[0] * 2.6, 3.2, dir[2] * 2.6]; f.onGround = false; f.sqv -= 6;
  hitstop(0.05); shake(0.25); sfx('hit'); rumble(0.3, 60);
}
function deadPos(f) {
  const t = Math.min(f.deadT, 0.45), k = f.kdir || [0, 0, 1];
  return [f.pos[0] + k[0] * t * 5, f.pos[1] + 0.6 + t * 4 - t * t * 9, f.pos[2] + k[2] * t * 5];
}
function killFoe(f, dir) {
  if (!f.alive) return;
  f.alive = false; f.deadT = 0; f.kdir = V.norm([dir[0], 0, dir[2]]); f.puffed = false; stats.foes++;
  hitstop(0.06); shake(0.4); sfx('pop'); rumble(0.4, 90);
  burst(V.add(f.pos, [0, 0.6, 0]), 26, [1, 0.45, 0.7, 1], 6, 0.6, 0.15);
  burst(V.add(f.pos, [0, 0.6, 0]), 12, [1, 0.95, 0.6, 1], 4, 0.5, 0.1);
  ring(V.add(f.pos, [0, 0.2, 0]), [1, 0.6, 0.8, 0.8], 2);
}

function pickupsStep(dt) {
  const p = player, c = V.add(p.pos, [0, 0.7, 0]);
  for (const o of WORLD.orbs) {
    if (o.got) continue;
    const d = V.dist([o.x, o.y, o.z], c);
    if (d < 2.6 && p.deadT <= 0) {
      // magnet pull
      o.pull = Math.min(1, o.pull + dt * 3);
      const k = o.pull * dt * 14;
      o.x = lerp(o.x, c[0], k); o.y = lerp(o.y, c[1], k); o.z = lerp(o.z, c[2], k);
    }
    if (d < 0.7 && p.deadT <= 0) {
      o.got = true; stats.orbs++;
      orbCombo = orbComboT > 0 ? orbCombo + 1 : 0; orbComboT = 0.8;
      sfx('orb', orbCombo);
      burst([o.x, o.y, o.z], 12, [1, 0.92, 0.5, 1], 3.5, 0.45, 0.09);
      updateHUD();
      if (stats.orbs === state.required) {
        state.shrineAwake = true; sfx('awake'); shake(0.3);
        showQuest('Nueva misión', 'El santuario despertó: cruza el portal', 6);
        document.getElementById('objective').textContent = 'Sube a la colina y cruza el portal del santuario.';
      }
    }
  }
  orbComboT = Math.max(0, orbComboT - dt);
  for (const h of WORLD.hearts) {
    if (h.got) continue;
    if (V.dist([h.x, h.y, h.z], c) < 0.9) {
      h.got = true; p.maxHp = Math.min(6, p.maxHp + 1); p.hp = p.maxHp; updateHUD(); sfx('heart');
      burst([h.x, h.y, h.z], 22, [1, 0.4, 0.5, 1], 4, 0.6, 0.12);
      toast('Corazón extra: vida máxima +1', 3);
    }
  }
  // portal
  if (state.shrineAwake && !state.won) {
    const hd = Math.hypot(p.pos[0] - SHRINE[0], p.pos[2] - SHRINE[2]), dy = p.pos[1] - SHRINE[1];
    if (hd < 1.6 && dy > 0.3 && dy < 5.5) winGame();
  }
}
let orbCombo = 0, orbComboT = 0;

// ---------- particles ----------
const MAXP = 1800;
const parts = [];
function particle(pos, vel, life, size, col, grav = 0, drag = 0, grow = 0) {
  if (parts.length >= MAXP) parts.shift();
  parts.push({ p: pos.slice(), v: vel.slice(), life, max: life, size, col, grav, drag, grow, ring: 0 });
}
function burst(pos, n, col, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const d = V.norm([rand(-1, 1), rand(-0.3, 1), rand(-1, 1)]);
    particle(pos, V.mul(d, spd * rand(0.4, 1)), life * rand(0.6, 1.2), size * rand(0.6, 1.3), col, 6, 2);
  }
}
function dust(pos, n, k = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.6, 2.2) * k;
    particle(V.add(pos, [Math.sin(a) * 0.2, 0.05, Math.cos(a) * 0.2]), [Math.sin(a) * s, rand(0.3, 1.4), Math.cos(a) * s], rand(0.35, 0.7), rand(0.08, 0.16) * Math.sqrt(k), [0.93, 0.88, 0.78, 0.7], -1, 3, 0.25);
  }
}
function ring(pos, col, r) { parts.push({ p: pos.slice(), v: [0, 0, 0], life: 0.35, max: 0.35, size: r, col, grav: 0, drag: 0, grow: 0, ring: 1 }); }
function splash(pos) {
  for (let i = 0; i < 30; i++) { const a = rand(0, TAU), s = rand(1, 4); particle([pos[0], 0.05, pos[2]], [Math.sin(a) * s, rand(3, 8), Math.cos(a) * s], rand(0.5, 0.9), rand(0.08, 0.16), [0.85, 0.95, 1, 0.85], 14, 0.5); }
  ring([pos[0], 0.05, pos[2]], [0.9, 1, 1, 0.8], 2.5);
}
function partsStep(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life -= dt;
    if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.v[1] -= q.grav * dt;
    const dr = Math.exp(-q.drag * dt);
    q.v[0] *= dr; q.v[1] *= dr; q.v[2] *= dr;
    q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
    q.size += q.grow * dt;
  }
}

// ============================================================
//  Camera
// ============================================================
const cam = { yaw: 0, pitch: 0.3, dist: 5.4, target: [0, 0, 0], pos: [0, 5, 10], manualT: 9, fov: 56, fovKick: 0, shake: 0, orbit: 0 };
function shake(a) { if (!reduceMotion) cam.shake = Math.max(cam.shake, a); }
function fovKick(a) { if (!reduceMotion) cam.fovKick += a; }
function cameraUpdate(dt, inputCam) {
  const p = player;
  if (state.mode === 'title') {
    // two slow alternating shots: low-angle bust close-up, then a full-body hero shot
    cam.orbit += dt;
    const shot = Math.floor(cam.orbit / 9) % 2, u = (cam.orbit % 9) / 9;
    p.swordOut = 99;
    if (shot === 0) { cam.yaw = Math.PI * 0.86 + lerp(-0.25, 0.2, u); cam.pitch = lerp(-0.02, 0.06, u); cam.dist = lerp(1.7, 1.4, u); cam.target = V.add(p.pos, [0.3, 1.38, 0]); }
    else { cam.yaw = Math.PI * 0.8 + lerp(0.3, -0.1, u); cam.pitch = lerp(0.02, 0.12, u); cam.dist = lerp(3.6, 3.0, u); cam.target = V.add(p.pos, [0.6, 0.95, 0]); }
    cam.curDist = cam.dist;
  } else if (state.mode === 'cine') {
    // shot 1: aerial crane over the island toward the shrine; 2: low sweep across the meadow; 3: close on the hero
    const t = CINE.t, e = (x) => x * x * (3 - 2 * x);
    if (t < 5.2) { const u = e(t / 5.2); cam.target = V.add(V.lerp(SHRINE, p.pos, 0.35), [0, 2 - u * 1.5, 0]); cam.yaw = p.yaw + Math.PI + 0.9 - u * 0.7; cam.pitch = lerp(0.62, 0.34, u); cam.dist = lerp(70, 42, u); }
    else if (t < 10.1) { const u = e((t - 5.2) / 4.9); cam.target = V.add(p.pos, [0, lerp(0.8, 1.25, u), 0]); cam.yaw = p.yaw + Math.PI + lerp(1.7, 0.55, u); cam.pitch = lerp(0.05, 0.16, u); cam.dist = lerp(11, 4.2, u); }
    else { const u = e(clamp((t - 10.1) / 4.9, 0, 1)); cam.target = V.add(p.pos, [0, 1.47, 0]); cam.yaw = p.yaw + lerp(-0.55, -0.2, u); cam.pitch = lerp(0.1, 0.0, u); cam.dist = lerp(2.2, 1.45, u); }
    cam.curDist = cam.dist;
  } else {
    cam.yaw += inputCam[0]; cam.pitch = clamp(cam.pitch + inputCam[1], -0.2, 1.15);
    if (Math.abs(inputCam[0]) + Math.abs(inputCam[1]) > 1e-4) cam.manualT = 0; else cam.manualT += dt;
    const sp = Math.hypot(p.vel[0], p.vel[2]);
    if (cam.manualT > 1.4 && sp > 1.5) {
      const behind = p.yaw + Math.PI;
      cam.yaw += angDiff(cam.yaw, behind) * (1 - Math.exp(-dt * 1.1 * clamp(sp / TUNE.RUN, 0, 1)));
    }
    const want = V.add(p.pos, [0, 1.35 + (p.onGround ? 0 : 0.15), 0]);
    const k = 1 - Math.exp(-dt * 9);
    cam.target = [lerp(cam.target[0], want[0], k), lerp(cam.target[1], want[1], 1 - Math.exp(-dt * (p.onGround ? 6 : 3))), lerp(cam.target[2], want[2], k)];
    const portrait = GR.h > GR.w ? 1.4 : 1;
    cam.dist = damp(cam.dist, (p.glide ? 7 : 5.6) * portrait, 3, dt);
  }
  const dir = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
  // pull in if terrain blocks the view
  let d = cam.dist;
  for (let i = 1; i <= 10; i++) {
    const t = i / 10 * cam.dist, q = V.add(cam.target, V.mul(dir, t));
    if (q[1] < heightAt(q[0], q[2]) + 0.45) { d = Math.max(1.4, t - 0.4); break; }
  }
  cam.curDist = damp(cam.curDist || d, d, d < (cam.curDist || d) ? 20 : 4, dt);
  let pos = V.add(cam.target, V.mul(dir, cam.curDist));
  pos[1] = Math.max(pos[1], heightAt(pos[0], pos[2]) + 0.5, WORLD.water + 0.35);
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
  const sh = cam.shake * cam.shake * 0.35;
  pos = V.add(pos, [rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)]);
  cam.pos = pos;
  cam.fovKick = damp(cam.fovKick, 0, 5, dt);
  cam.curFov = cam.fov + cam.fovKick + (player.dashT > 0 ? 4 : 0);
}

// ============================================================
//  Input: keyboard, mouse (pointer lock), gamepad, touch
// ============================================================
const keys = {};
const input = { jumpP: false, punchP: false, dashP: false, poundP: false, mouseDX: 0, mouseDY: 0, touchMove: [0, 0], touchCam: [0, 0], touchBtn: {}, padPrev: [] };
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump', KeyJ: 'punch', KeyX: 'punch', ShiftLeft: 'dash', ShiftRight: 'dash', KeyL: 'dash', KeyK: 'pound', ControlLeft: 'pound', ControlRight: 'pound', KeyC: 'pound', KeyQ: 'camL', KeyE: 'camR' };
function press(a) { if (a === 'jump') input.jumpP = true; if (a === 'punch') input.punchP = true; if (a === 'dash') input.dashP = true; if (a === 'pound') input.poundP = true; }
addEventListener('keydown', e => {
  const a = KEYMAP[e.code];
  if (a && state.mode === 'play') { e.preventDefault(); if (!keys[a]) press(a); keys[a] = true; }
  if (e.repeat) return;
  if (e.code === 'KeyB') toggleSkeleton();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') { if (state.mode === 'play') pauseGame(); else if (state.mode === 'pause') resumeGame(); }
  if (state.mode === 'title' && !document.getElementById('intro').hidden && !e.repeat) { e.preventDefault(); startGame(); }
  else if (state.mode === 'cine' && !e.repeat) { e.preventDefault(); beginPlay(); }
  if (e.code === 'KeyR' && state.mode === 'play') { hurt(null, true); }
});
addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) keys[a] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const canvas = document.getElementById('game');
let dragging = false, lastMX = 0, lastMY = 0, mouseDownBtn = -1;
canvas.addEventListener('mousedown', e => {
  if (state.mode !== 'play') return;
  if (document.pointerLockElement === canvas) { if (e.button === 0) { press('punch'); keys.mpunch = true; } return; }
  dragging = true; lastMX = e.clientX; lastMY = e.clientY; mouseDownBtn = e.button;
  canvas.dataset.moved = '0';
});
addEventListener('mouseup', e => {
  if (e.button === 0) keys.mpunch = false;
  if (dragging && canvas.dataset.moved === '0' && mouseDownBtn === 0 && state.mode === 'play' && !isTouch) {
    try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { }
  }
  dragging = false;
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; return; }
  if (dragging) { input.mouseDX += e.clientX - lastMX; input.mouseDY += e.clientY - lastMY; if (Math.abs(e.clientX - lastMX) + Math.abs(e.clientY - lastMY) > 2) canvas.dataset.moved = '1'; lastMX = e.clientX; lastMY = e.clientY; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && hadLock && state.mode === 'play') pauseGame();
  hadLock = locked;
});

// touch
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
function setupTouch() {
  const zone = document.getElementById('stickZone'), knob = document.getElementById('knob'), look = document.getElementById('lookZone');
  let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
  zone.addEventListener('pointerdown', e => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; zone.setPointerCapture(e.pointerId); knob.style.display = 'block'; knob.style.left = sx + 'px'; knob.style.top = sy + 'px'; knob.firstElementChild.style.transform = ''; });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - sx, dy = e.clientY - sy; const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx *= m / l; dy *= m / l; }
    input.touchMove = [dx / m, dy / m];
    knob.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const endS = e => { if (e.pointerId !== sid) return; sid = null; input.touchMove = [0, 0]; knob.style.display = 'none'; };
  zone.addEventListener('pointerup', endS); zone.addEventListener('pointercancel', endS);
  look.addEventListener('pointerdown', e => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(e.pointerId); });
  look.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; input.touchCam[0] += (e.clientX - lx); input.touchCam[1] += (e.clientY - ly); lx = e.clientX; ly = e.clientY; });
  const endL = e => { if (e.pointerId === lid) lid = null; };
  look.addEventListener('pointerup', endL); look.addEventListener('pointercancel', endL);
  document.querySelectorAll('#touch .tb').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); input.touchBtn[k] = true; press(k); });
    const up = () => { b.classList.remove('on'); input.touchBtn[k] = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });
}

function readInput(dt) {
  let ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), iy = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  let camX = (keys.camR ? 1 : 0) - (keys.camL ? 1 : 0);
  let camDX = input.mouseDX * 0.0026 + input.touchCam[0] * 0.006, camDY = input.mouseDY * 0.0022 + input.touchCam[1] * 0.005;
  input.mouseDX = input.mouseDY = 0; input.touchCam = [0, 0];
  camDX += camX * 2.2 * dt;
  let jumpHeld = !!keys.jump || !!input.touchBtn.jump, punchHeld = !!keys.punch || !!keys.mpunch || !!input.touchBtn.punch;
  if (Math.hypot(input.touchMove[0], input.touchMove[1]) > 0.08) { ix = input.touchMove[0]; iy = -input.touchMove[1]; }
  // gamepad
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const dz = v => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (Math.hypot(lx, ly) > 0) { ix = lx; iy = -ly; }
    camDX += rx * 2.6 * dt; camDY += ry * 1.8 * dt;
    const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const prev = input.padPrev[gp.index] || [];
    const edge = i => b(i) && !prev[i];
    if (state.mode === 'play') {
      if (edge(0)) press('jump'); if (edge(2)) press('punch'); if (edge(5) || edge(7)) press('dash'); if (edge(1)) press('pound');
      if (edge(8)) toggleSkeleton();
      if (edge(9)) pauseGame();
    } else if (state.mode === 'title' && !document.getElementById('intro').hidden && (edge(0) || edge(9))) startGame();
    else if (state.mode === 'cine' && (edge(0) || edge(9) || edge(1))) beginPlay();
    else if (state.mode === 'pause' && (edge(0) || edge(9))) resumeGame();
    else if (state.mode === 'win' && edge(0)) restartGame();
    jumpHeld = jumpHeld || b(0); punchHeld = punchHeld || b(2);
    input.padPrev[gp.index] = gp.buttons.map((_, i) => b(i));
  }
  // camera-relative move vector
  const fwd = [-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)], right = V.cross(fwd, [0, 1, 0]);
  let mag = Math.min(1, Math.hypot(ix, iy));
  const mv = mag > 0 ? V.mul(V.norm(V.add(V.mul(fwd, iy), V.mul(right, ix))), mag) : [0, 0, 0];
  const out = { mx: mv[0], mz: mv[2], jumpHeld, punchHeld, jumpP: input.jumpP, punchP: input.punchP, dashP: input.dashP, poundP: input.poundP, cam: [-camDX, camDY] };
  input.jumpP = input.punchP = input.dashP = input.poundP = false;
  return out;
}
function rumble(strength, ms) {
  try { for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) gp && gp.vibrationActuator && gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {}); } catch (_) { }
}

// ============================================================
//  Audio: everything synthesised
// ============================================================
let AC = null, master = null, muted = false, musicT = 0, noiseBuf = null;
function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = muted ? 0 : 0.5;
    const comp = AC.createDynamicsCompressor(); master.connect(comp); comp.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambient wind + surf bed
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = AC.createGain(); g.gain.value = 0.05;
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
  } catch (_) { AC = null; }
}
function tone(type, f0, f1, dur, vol = 0.2, delay = 0, attack = 0.005) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, type = 'bandpass', delay = 0, q = 1) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
function sfx(n, k = 0) {
  switch (n) {
    case 'jump': tone('square', 290, 620, 0.13, 0.06); tone('sine', 420, 820, 0.12, 0.08); break;
    case 'dj': tone('triangle', 520, 1180, 0.22, 0.12); noise(0.2, 0.05, 2400); break;
    case 'land': noise(0.12, 0.08 + k * 0.12, 260, 'lowpass'); tone('sine', 140, 60, 0.12, 0.1 * (0.4 + k)); break;
    case 'step': noise(0.05, 0.025, 900 + Math.random() * 400); break;
    case 'dash': noise(0.25, 0.14, 1400, 'bandpass', 0, 0.7); tone('sawtooth', 240, 90, 0.2, 0.05); break;
    case 'whoosh': noise(0.2, 0.08, 700); tone('sine', 700, 300, 0.2, 0.06); break;
    case 'pound': tone('sine', 110, 38, 0.45, 0.35); noise(0.35, 0.22, 220, 'lowpass'); break;
    case 'charge': tone('sine', 300, 900, 0.6, 0.035, 0, 0.3); break;
    case 'ready': tone('triangle', 1200, 1800, 0.25, 0.07); tone('sine', 2400, 2400, 0.3, 0.03, 0.05); break;
    case 'slash': noise(0.16, 0.12 + k * 0.05, 2600 - k * 800, 'bandpass', 0, 1.4); tone('sine', 900 - k * 300, 300, 0.12, 0.03); break;
    case 'spin': noise(0.45, 0.16, 1800, 'bandpass', 0, 1); tone('sawtooth', 300, 900, 0.4, 0.05); tone('triangle', 1200, 1600, 0.3, 0.04, 0.1); break;
    case 'sheath': tone('triangle', 1400, 1100, 0.06, 0.04); noise(0.12, 0.05, 3500, 'highpass', 0.04); tone('square', 160, 140, 0.05, 0.03, 0.12); break;
    case 'roll': noise(0.3, 0.1, 500, 'lowpass'); break;
    case 'tink': tone('triangle', 1500, 1100, 0.08, 0.06); break;
    case 'hit': noise(0.08, 0.14, 2200, 'bandpass', 0, 2); tone('square', 300, 160, 0.08, 0.06); break;
    case 'pop': tone('square', 520, 120, 0.18, 0.08); noise(0.15, 0.1, 1600); tone('sine', 880, 1760, 0.12, 0.06, 0.05); break;
    case 'stomp': tone('square', 330, 660, 0.12, 0.07); break;
    case 'foehop': tone('sine', 200, 340, 0.12, 0.05); break;
    case 'orb': { const f = 523.25 * Math.pow(2, PENTA[Math.min(k, PENTA.length - 1)] / 12); tone('sine', f, f * 1.01, 0.3, 0.12); tone('triangle', f * 2, f * 2, 0.12, 0.04); break; }
    case 'heart': [0, 4, 7, 12].forEach((s, i) => tone('triangle', 440 * Math.pow(2, s / 12), 440 * Math.pow(2, s / 12), 0.25, 0.08, i * 0.07)); break;
    case 'hurt': tone('sawtooth', 380, 110, 0.3, 0.1); noise(0.2, 0.08, 500); break;
    case 'splash': noise(0.6, 0.2, 900, 'lowpass'); noise(0.3, 0.1, 3000, 'highpass', 0.05); break;
    case 'respawn': [0, 7, 12].forEach((s, i) => tone('sine', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.3, 0.07, i * 0.06)); break;
    case 'awake': [0, 4, 7, 11, 14, 19].forEach((s, i) => tone('triangle', 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.6, 0.08, i * 0.09)); break;
    case 'win': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone('triangle', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.8, 0.09, i * 0.1)); break;
    case 'ui': tone('sine', 660, 990, 0.08, 0.06); break;
  }
}
// gentle generative marimba
const CHORDS = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]];
function musicStep(dt) {
  if (!AC || muted || state.mode !== 'play') return;
  musicT -= dt;
  if (musicT > 0) return;
  musicT = 0.3;
  const bar = Math.floor(state.time / 4.8) % CHORDS.length, ch = CHORDS[bar];
  if (Math.random() < 0.55) {
    const n = ch[Math.floor(Math.random() * 3)] + (Math.random() < 0.3 ? 12 : 0);
    const f = 261.63 * Math.pow(2, n / 12);
    tone('sine', f, f, 0.9, 0.035); tone('triangle', f * 4, f * 4, 0.15, 0.008);
  }
  if (Math.floor(state.time / 0.3) % 16 === 0) { const f = 65.4 * Math.pow(2, ch[0] / 12); tone('sine', f, f, 1.6, 0.05); }
}
function toggleMute() {
  muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5;
  document.getElementById('muteBtn').setAttribute('aria-pressed', muted ? 'true' : 'false');
}

// ============================================================
//  HUD + flow helpers
// ============================================================
const HEART_SVG = '<svg viewBox="0 0 30 28" aria-hidden="true"><path d="M15 26 C4 18 1 12 3 7.5 C5 2.5 11.5 1.8 15 6.6 C18.5 1.8 25 2.5 27 7.5 C29 12 26 18 15 26Z" fill="#ff4d5e" stroke="#fff8ec" stroke-width="2" stroke-linejoin="round"/></svg>';
function updateHUD() {
  const h = document.getElementById('hearts');
  let s = '';
  for (let i = 0; i < player.maxHp; i++) s += i < player.hp ? HEART_SVG : HEART_SVG.replace('<svg', '<svg class="empty"');
  h.innerHTML = s;
  h.setAttribute('aria-label', `Vida ${player.hp} de ${player.maxHp}`);
  document.getElementById('orbc').textContent = stats.orbs;
  document.getElementById('orbt').textContent = state.required;
  document.getElementById('orbbar').style.width = Math.min(100, stats.orbs / state.required * 100) + '%';
}
let toastTimer = 0;
function toast(html, secs = 4) {
  const t = document.getElementById('toast');
  t.innerHTML = html; t.classList.add('on');
  toastTimer = secs;
}
function toastStep(dt) { if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) document.getElementById('toast').classList.remove('on'); } }
const HINTS = [
  { id: 'move', when: () => state.time > 0.6, kb: 'Corre con <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> y salta con <kbd>Espacio</kbd>. Sigue el camino de chispas.', touch: 'Arrastra a la izquierda para correr. Pulsa Saltar.' },
  { id: 'dj', when: () => state.time > 9, kb: 'En el aire pulsa <kbd>Espacio</kbd> otra vez: doble salto con voltereta.', touch: 'En el aire pulsa Saltar otra vez para el doble salto.' },
  { id: 'foe', when: () => foes.some(f => f.alive && V.dist(f.pos, player.pos) < 13), kb: 'Un Gruñón. Ataca con la espada: <kbd>J</kbd> o clic tres veces seguidas para un combo. Mantén para un ataque giratorio.', touch: 'Un Gruñón. Pulsa Espada tres veces para un combo, o mantén para un ataque giratorio.' },
  { id: 'glide', when: () => player.jumps >= 1 && player.vel[1] < -3, kb: 'Tras el doble salto, mantén <kbd>Espacio</kbd>: sacas tu hoja-planeador y vuelas.', touch: 'Tras el doble salto, mantén Saltar para planear con la hoja.' },
  { id: 'dash', when: () => state.time > 40, kb: '<kbd>Shift</kbd>: voltereta para esquivar (dash en el aire). <kbd>K</kbd> en el aire: estocada descendente.', touch: 'Esquivar hace una voltereta (dash en el aire). Estocada, en el aire, clava la espada en el suelo.' },
  { id: 'isl', when: () => V.dist(player.pos, [-36, player.pos[1], 24]) < 16, kb: 'Islas flotantes: sube en espiral hasta el jardín del cielo. Hay un corazón arriba.', touch: 'Sube por las islas flotantes. Hay un corazón arriba.' },
  { id: 'skel', when: () => state.time > 70, kb: 'Pulsa <kbd>B</kbd> para ver el esqueleto de Brío, su IK y la capa simulada.', touch: 'Pulsa Esqueleto (arriba) para ver sus huesos.' },
];
const hintDone = new Set();
function hintsStep() {
  if (toastTimer > 0.5 || state.mode !== 'play') return;
  for (const h of HINTS) if (!hintDone.has(h.id) && h.when()) { hintDone.add(h.id); toast(isTouch ? h.touch : h.kb, 5.5); break; }
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }
