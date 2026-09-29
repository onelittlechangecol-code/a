// ============================================================
//  Living world: clock + sky, weather, wind, and the body (stamina, sweat, wet)
//  Globals for other systems: wind, weather, rainAmount (window properties, live)
// ============================================================
const WCLOCK = { hour: 15.5, rate: 24 / 960, frozen: false };      // a full day in 16 real minutes; start mid-afternoon
const wind = { x: 0.4, z: 0.2, dirX: 0.9, dirZ: 0.45, strength: 0.55, gust: 0, angle: 0.46, phase: 0 };
const WEATHERS = {
  clear:  { name: 'Despejado', cover: 0.28, rain: 0,    wind: 0.55, fog: 0,    dark: 0,    dur: [110, 220], next: [['cloudy', 0.75], ['clear', 0.25]] },
  cloudy: { name: 'Nublado',   cover: 0.64, rain: 0,    wind: 0.9,  fog: 0.08, dark: 0.12, dur: [70, 150],  next: [['rain', 0.5], ['clear', 0.5]] },
  rain:   { name: 'Lluvia',    cover: 0.86, rain: 0.65, wind: 1.1,  fog: 0.1,  dark: 0.42, dur: [70, 140],  next: [['storm', 0.4], ['cloudy', 0.6]] },
  storm:  { name: 'Tormenta',  cover: 0.97, rain: 1.0,  wind: 1.9,  fog: 0.14, dark: 0.8,  dur: [45, 100],  next: [['rain', 1]] },
  fog:    { name: 'Niebla',    cover: 0.42, rain: 0,    wind: 0.18, fog: 1.0,  dark: 0.06, dur: [60, 120],  next: [['clear', 0.8], ['cloudy', 0.2]] },
};
const wx = { state: 'clear', t: 150, cover: 0.28, rain: 0, wind: 0.55, fog: 0, dark: 0, wet: 0, flash: 0, strikes: [], nextStrike: 5, fogDay: -1, cloudOff: [0, 0], rainOff: [0, 0, 0] };
const body = { st: 1, exhausted: false, sprint: false, holdT: 0, regen: 0, pant: 0, exert: 0, sweat: 0, wet: 0, full: 9, held: false, breathT: 0 };
Object.defineProperty(window, 'wind', { get: () => wind, configurable: true });
Object.defineProperty(window, 'weather', { get: () => wx.state, configurable: true });
Object.defineProperty(window, 'rainAmount', { get: () => wx.rain, configurable: true });

// ---------- sky model: sun and moon paths, colour ramps keyed on the sun's elevation ----------
const SKY_AZ = -21.2 * Math.PI / 180, SKY_E = [Math.cos(SKY_AZ), 0, Math.sin(SKY_AZ)], SKY_S = [-Math.sin(SKY_AZ), 0, Math.cos(SKY_AZ)];
function celestial(theta, tilt) {
  const c = Math.cos(theta), s = Math.sin(theta), ct = Math.cos(tilt), st = Math.sin(tilt);
  return V.norm([SKY_E[0] * c + SKY_S[0] * st * s, ct * s, SKY_E[2] * c + SKY_S[2] * st * s]);
}
const sunAt = h => celestial((h - 6) / 12 * Math.PI, 35 * Math.PI / 180);
const moonAt = h => celestial((h - 6) / 12 * Math.PI + Math.PI + 0.35, 25 * Math.PI / 180);
function ramp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1].slice();
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) {
    const a = tab[i - 1], b = tab[i], u = (x - a[0]) / (b[0] - a[0]), s = u * u * (3 - 2 * u);
    return a[1].map((v, k) => v + (b[1][k] - v) * s);
  }
  return tab[tab.length - 1][1].slice();
}
const SUN_COL = [[-0.05, [0, 0, 0]], [0.0, [1.15, 0.3, 0.08]], [0.04, [1.65, 0.6, 0.22]], [0.1, [1.9, 0.98, 0.48]], [0.2, [1.85, 1.22, 0.76]], [0.46, [1.75, 1.36, 0.98]], [0.8, [1.88, 1.6, 1.26]]];
const SKY_TOP = [[-0.35, [0.006, 0.012, 0.034]], [-0.18, [0.014, 0.03, 0.08]], [-0.08, [0.025, 0.05, 0.16]], [0.0, [0.07, 0.12, 0.34]], [0.08, [0.12, 0.26, 0.6]], [0.25, [0.15, 0.35, 0.8]], [0.46, [0.16, 0.38, 0.86]], [0.9, [0.13, 0.36, 0.88]]];
const SKY_HOR = [[-0.35, [0.014, 0.022, 0.045]], [-0.18, [0.035, 0.05, 0.1]], [-0.08, [0.12, 0.12, 0.24]], [0.0, [0.95, 0.36, 0.14]], [0.08, [0.86, 0.66, 0.52]], [0.25, [0.68, 0.75, 0.86]], [0.46, [0.66, 0.78, 0.9]], [0.9, [0.62, 0.77, 0.92]]];
const GLOW = [[-0.22, [0.3, 0.12, 0.25, 0]], [-0.1, [0.6, 0.22, 0.32, 0.7]], [-0.03, [1.1, 0.34, 0.16, 1.0]], [0.03, [1.45, 0.42, 0.1, 1.0]], [0.1, [1.15, 0.72, 0.42, 0.8]], [0.25, [1.0, 0.8, 0.6, 0.55]], [1, [1.0, 0.8, 0.6, 0.5]]];
const AMB = [[-0.3, [0.1, 0.12, 0.22]], [-0.12, [0.14, 0.16, 0.28]], [-0.03, [0.36, 0.34, 0.48]], [0.05, [0.8, 0.7, 0.68]], [0.2, [0.95, 0.93, 0.92]], [0.4, [1, 1, 1]]];
const EXPO = [[-0.3, [1.4]], [-0.12, [1.45]], [-0.03, [1.35]], [0.05, [1.15]], [0.2, [1.02]], [0.4, [1.0]]];
const SAT = [[-0.3, [0.62]], [-0.08, [0.8]], [0.02, [1.28]], [0.15, [1.15]], [0.4, [1.1]]];
const luma = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
let WENV = null;
function worldEnv() {
  const h = WCLOCK.hour, sun = sunAt(h), moon = moonAt(h), e = sun[1];
  const night = clamp((-0.03 - e) / 0.15, 0, 1), ov = clamp((wx.cover - 0.35) / 0.55, 0, 1), dark = wx.dark;
  const mI = clamp(moon[1] / 0.2, 0, 1) * night;
  const sunUp = e > -0.03;
  let keyCol = sunUp ? ramp(SUN_COL, e) : [0.13 * mI, 0.18 * mI, 0.33 * mI];
  const dim = (1 - 0.8 * ov) * (1 - 0.35 * dark);
  keyCol = keyCol.map(v => v * dim);
  let key = sunUp ? sun.slice() : moon.slice();
  if (key[1] < 0.08) { const l = Math.hypot(key[0], key[2]) || 1, k = Math.sqrt(1 - 0.0064) / l; key = [key[0] * k, 0.08, key[2] * k]; }
  // overcast skies wash toward grey; storms darken them
  const grey = (c, k, d) => { const l = luma(c); return c.map((v, i) => (v + (l * [0.92, 0.97, 1.06][i] - v) * k) * d); };
  const skyTop = grey(ramp(SKY_TOP, e), ov * 0.8, 1 - dark * 0.72), skyHor = grey(ramp(SKY_HOR, e), ov * 0.75, 1 - dark * 0.66);
  const glow = ramp(GLOW, e); glow[3] *= 1 - ov * 0.85;
  const ambT = ramp(AMB, e), amb = ambT.map(v => v * (1 + ov * 0.15) * (1 - dark * 0.45 * (1 - night * 0.7)));
  const mist = clamp(1 - Math.abs(h - 6.3) / 1.5, 0, 1);
  const fog = [0.0042 + wx.fog * 0.03 + wx.rain * 0.0035 + mist * 0.004, 0.05 + wx.fog * 0.1];
  const lit = keyCol.map((v, i) => (v * 0.55 + skyHor[i] * 0.45) * 0.92 * (1 - night * 0.55));
  const shade = skyTop.map((v, i) => (v * 0.4 + skyHor[i] * 0.6) * 0.8 + lit[i] * 0.12);
  const expo = ramp(EXPO, e)[0] * (1 + ov * 0.12) * (1 + dark * night * 0.9);
  const lamp = clamp((0.1 - e) / 0.16, 0, 1) + dark * 0.5;
  const flick = 0.85 + 0.1 * Math.sin(state.time * 13.1) + 0.05 * Math.sin(state.time * 31.7);
  WENV = {
    hour: h, sun, moon, e, night, ov, key, keyCol, skyTop, skyHor, glow, amb, fog, lit, shade, lamp: Math.min(1, lamp), flick,
    rays: clamp(e / 0.05, 0, 1) * (1 - ov * 0.9),
    stars: clamp((-0.06 - e) / 0.14, 0, 1) * (1 - ov * 0.8),
    moonVis: clamp(moon[1] * 8, 0, 1) * (0.35 + 0.65 * night) * (1 - ov * 0.7),
    fill: clamp(luma(keyCol) / 1.35 + 0.1, 0.1, 1.0),
    post: [expo, ramp(SAT, e)[0] * (1 - ov * 0.12), wx.flash, night * 0.85],
  };
  return WENV;
}
function worldUniforms(f, vp) {
  const E = WENV || worldEnv();
  f.set([...E.sun, 0.5 - 0.2 * clamp(1 - Math.abs(E.e + 0.02) / 0.14, 0, 1) * (1 - E.ov)], 104);   // .w: sky gradient exponent (tighter at sunset)
  f.set([...E.moon, E.moonVis], 108);
  f.set([wind.dirX, wind.dirZ, wind.strength * (0.75 + 0.5 * wind.gust), wind.phase], 112);
  f.set([wx.rain, wx.wet, wx.cover, wx.flash], 116);
  f.set([body.wet, body.sweat, E.stars, E.night], 120);
  f.set([wx.cloudOff[0], wx.cloudOff[1], wx.dark, E.fill], 124);
  f.set(E.glow, 128);
  f.set([SHRINE[0], SHRINE[1] + 2.2, SHRINE[2], E.lamp * 3.2 * E.flick * (state.shrineAwake ? 0.5 : 1)], 132);
  f.set([...E.amb, wx.rainOff[2]], 136);
  f.set([...E.lit, wx.rainOff[0]], 140);
  f.set([...E.shade, wx.rainOff[1]], 144);
  const Q = QUALITY[state.quality] || QUALITY.alta;
  GR.rainCount = Math.round(wx.rain * (Q.grass ? 5200 : 2200));
  GR.splashCount = wx.rain > 0.02 ? 900 : 0;
  hudStamina(vp);
}
// shrine glyphs smoulder amber at night before the shrine wakes
function worldRuneTint(pl) {
  const E = WENV; if (!E || E.lamp <= 0.01) return [0.35, 0.4, 0.45, 0];
  const k = E.lamp, f = E.flick * (0.9 + 0.1 * Math.sin(state.time * 2 + pl.a * 3));
  return [lerp(0.35, 1.0, k), lerp(0.4, 0.6, k), lerp(0.45, 0.28, k), k * 1.7 * f];
}

// ---------- weather state machine ----------
function pickNext(list) { let r = Math.random(); for (const [n, w] of list) { if ((r -= w) <= 0) return n; } return list[0][0]; }
function setWeather(name, instant = true) {
  if (!WEATHERS[name]) return;
  const W = WEATHERS[name];
  wx.state = name; wx.t = rand(W.dur[0], W.dur[1]);
  if (instant) {
    Object.assign(wx, { cover: W.cover, rain: W.rain, wind: W.wind, fog: W.fog, dark: W.dark });
    wx.wet = W.rain > 0 ? Math.max(wx.wet, 0.4 + 0.6 * W.rain) : wx.wet;
    if (W.rain > 0) body.wet = Math.max(body.wet, 0.8 * W.rain + 0.2);
    wx.nextStrike = 1.5;
  }
  hudClock(true);
}
function lightning(now) {
  wx.strikes.push([now, 1], [now + 0.09, 0.45], [now + 0.2, 0.8 + Math.random() * 0.4]);
  const delay = rand(0.5, 3.2);
  noise(3.2, 0.5, 110, 'lowpass', delay); noise(0.45, 0.28, 800, 'bandpass', delay); tone('sine', 58, 28, 2.4, 0.22, delay, 0.05);
  noise(2.2, 0.25, 260, 'lowpass', delay + 0.5);
}
function worldStep(dt) {
  if (!WCLOCK.frozen) WCLOCK.hour = (WCLOCK.hour + dt * WCLOCK.rate) % 24;
  const h = WCLOCK.hour, day = Math.floor(state.time / 960);
  // state transitions; mist likes to settle at dawn
  wx.t -= dt;
  if ((wx.state === 'clear' || wx.state === 'cloudy') && h > 4.5 && h < 6.5 && wx.fogDay !== day) { wx.fogDay = day; if (Math.random() < 0.55) setWeather('fog', false); }
  if (wx.t <= 0) setWeather(pickNext(WEATHERS[wx.state].next), false);
  const W = WEATHERS[wx.state], k = 1 - Math.exp(-dt / 22);
  wx.cover += (W.cover - wx.cover) * k; wx.dark += (W.dark - wx.dark) * k; wx.fog += (W.fog - wx.fog) * k; wx.wind += (W.wind - wx.wind) * k;
  // rain waits for the clouds to gather, and eases off first
  const rT = wx.cover > 0.72 ? W.rain : 0;
  wx.rain += (rT - wx.rain) * (1 - Math.exp(-dt / 14));
  if (wx.rain < 1e-3 && rT === 0) wx.rain = 0;
  // ground wetness soaks up quickly and dries slowly (faster in the sun)
  const E = WENV || worldEnv(), sunDry = clamp(E.e * 3, 0, 1) * (1 - E.ov);
  wx.wet = clamp(wx.wet + (wx.rain > 0.05 ? wx.rain * 0.1 : -(0.006 + 0.02 * sunDry)) * dt, 0, 1);
  // wind: slowly wandering direction, strength follows the weather, gusts on top
  const t = state.time;
  wind.angle += (Math.sin(t * 0.021) * 0.02 + Math.sin(t * 0.0071 + 2) * 0.012) * dt * 3;
  wind.gust = clamp(0.5 + 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1) + 0.25 * Math.sin(t * 1.1 + Math.sin(t * 0.3) * 2) * (wx.wind > 1.2 ? 1 : 0.5), 0, 1);
  wind.strength = wx.wind;
  wind.dirX = Math.cos(wind.angle); wind.dirZ = Math.sin(wind.angle);
  const ws = wind.strength * (0.6 + 0.8 * wind.gust);
  wind.x = wind.dirX * ws; wind.z = wind.dirZ * ws;
  wind.phase += dt * (0.7 + wind.strength * 1.3);
  wx.cloudOff[0] += wind.dirX * (0.004 + 0.009 * wind.strength) * dt; wx.cloudOff[1] += wind.dirZ * (0.004 + 0.009 * wind.strength) * dt;
  // rain drop offset: falling plus wind drift, wrapped to the rain box
  const RB = [36, 22, 36], rv = [wind.dirX * wind.strength * 3.5, -15, wind.dirZ * wind.strength * 3.5];
  for (let i = 0; i < 3; i++) { wx.rainOff[i] += rv[i] * dt; wx.rainOff[i] -= Math.floor(wx.rainOff[i] / RB[i]) * RB[i]; }
  // lightning in storms
  if (wx.state === 'storm' && wx.rain > 0.5) { wx.nextStrike -= dt; if (wx.nextStrike <= 0) { lightning(t); wx.nextStrike = rand(4, 13); } }
  let fl = 0;
  for (const [t0, a] of wx.strikes) if (t >= t0) fl += a * Math.exp(-(t - t0) * 16);
  wx.strikes = wx.strikes.filter(s => t - s[0] < 1.2);
  wx.flash = Math.min(1.5, fl);
  // hero: rain soaks hair, skin and clothes; the sun dries them
  body.wet = clamp(body.wet + (wx.rain > 0.05 ? wx.rain * 0.16 : -(0.008 + 0.02 * sunDry)) * dt, 0, 1);
  const heat = clamp((E.e - 0.45) / 0.3, 0, 1) * (1 - E.ov);
  body.exert = clamp(body.exert - dt * (0.012 + 0.02 * (wx.rain > 0.1 ? 1 : 0)), 0, 1);
  const sweatT = clamp(body.exert * 1.3 + heat * 0.45 * (player.onGround && Math.hypot(player.vel[0], player.vel[2]) > 2 ? 1 : 0.4), 0, 1);
  body.sweat += (sweatT - body.sweat) * (1 - Math.exp(-dt / (sweatT > body.sweat ? 8 : 25)));
}

// ---------- body: stamina, sprint, exhaustion ----------
const STAM = { SPRINT: 0.125, GLIDE: 0.085, SWIM: 0.07, REGEN: 0.32, REGEN_EX: 0.2, DELAY: 0.7, HOLD: 0.25, SPRINT_MUL: 1.45, TIRED_MUL: 0.6 };
function bodyStep(dt, inp) {
  const p = player;
  body.holdT = body.held && state.mode === 'play' ? body.holdT + dt : 0;
  const mag = Math.hypot(inp.mx, inp.mz);
  body.sprint = body.holdT > STAM.HOLD && mag > 0.3 && !body.exhausted && body.st > 0 && p.rollT <= 0 && p.dashT <= 0 && !p.atk.n && !p.charging && p.deadT <= 0 && (p.onGround || body.sprint);
  let drain = 0;
  if (body.sprint && p.onGround) drain += STAM.SPRINT;
  if (p.glide) drain += STAM.GLIDE;
  if (p.swimming) drain += mag > 0.1 ? STAM.SWIM : STAM.SWIM * 0.4;
  if (drain > 0) { body.st -= drain * dt; body.regen = STAM.DELAY; body.exert = Math.min(1, body.exert + dt * 0.035); }
  if (body.st <= 0) { body.st = 0; if (!body.exhausted) { body.exhausted = true; body.sprint = false; tone('sine', 300, 180, 0.3, 0.05); } }
  if (drain <= 0 && (p.onGround || p.deadT > 0)) { body.regen -= dt; if (body.regen <= 0) body.st += (body.exhausted ? STAM.REGEN_EX : STAM.REGEN) * dt; }
  if (body.st >= 1) { body.st = 1; if (body.exhausted) { body.exhausted = false; tone('triangle', 660, 880, 0.15, 0.04); } }
  body.pant = damp(body.pant, body.exhausted ? 1 : 0, body.exhausted ? 3 : 0.8, dt);
  if (body.exhausted && !p.onGround && p.jumps >= 1) inp.jumpHeld = false;     // too tired to open the glider
  return p.onGround ? (body.sprint ? STAM.SPRINT_MUL : (body.exhausted ? STAM.TIRED_MUL : 1)) : (body.sprint ? STAM.SPRINT_MUL : 1);
}
const _playerStepW = playerStep;
playerStep = function (dt, inp) {
  const mul = bodyStep(dt, inp), run0 = TUNE.RUN;
  TUNE.RUN = run0 * mul;
  try { _playerStepW(dt, inp); } finally { TUNE.RUN = run0; }
  const p = player;
  if (body.sprint && p.onGround && Math.hypot(p.vel[0], p.vel[2]) > 8) {
    if (Math.random() < dt * 14) dust(p.pos, 1, 0.8);
    if (!reduceMotion) cam.fovKick = Math.max(cam.fovKick, 3.5);
  }
};
// exhausted: bent over, chest and shoulders heaving, head bobbing with each breath
const _computePoseW = computePose;
computePose = function (st, t) {
  const o = _computePoseW(st, t), k = body.pant;
  if (k > 0.02 && (st === 'idle' || st === 'run')) {
    const b = Math.sin(t * 7.8), b2 = Math.max(0, b);
    o.breath += (0.04 + 0.05 * b) * k;
    o.pel[1] += (-0.03 + b * 0.012) * k;
    o.lean += (st === 'idle' ? 0.34 : 0.12) * k;
    if (st === 'idle' && o.sword !== 'guard') { o.hl = V.lerp(o.hl, [0.2, 0.58 + b2 * 0.02, 0.24], k * 0.85); o.hr = V.lerp(o.hr, [-0.2, 0.58 + b2 * 0.02, 0.24], k * 0.85); }
    else { o.hl = V.add(o.hl, [0, b2 * 0.03 * k, 0]); o.hr = V.add(o.hr, [0, b2 * 0.03 * k, 0]); }
    o.mouth = Math.max(o.mouth, (0.55 + 0.3 * b2) * k);
    o.lookOff = [0, 0.2 * k + b * 0.05 * k];
  }
  return o;
};
const _simStepW = simStep;
simStep = function (dt, inp) { worldStep(dt); _simStepW(dt, inp); };

// ---------- per-frame: input polling, particles, audio, HUD ----------
let rainAudio = null;
function worldAudio() {
  if (!AC || !noiseBuf) return;
  if (!rainAudio) {
    const mk = (type, f, q) => { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const b = AC.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; const g = AC.createGain(); g.gain.value = 0; s.connect(b); b.connect(g); g.connect(master); s.start(0, Math.random()); return g; };
    rainAudio = { rain: mk('highpass', 1600, 0.5), patter: mk('bandpass', 4200, 0.8), wind: mk('bandpass', 420, 0.6) };
  }
  const t = AC.currentTime;
  rainAudio.rain.gain.setTargetAtTime(wx.rain * 0.09, t, 0.3);
  rainAudio.patter.gain.setTargetAtTime(wx.rain * 0.035 * (0.7 + 0.3 * Math.random()), t, 0.1);
  rainAudio.wind.gain.setTargetAtTime(Math.max(0, wind.strength - 0.4) * 0.05 * (0.5 + wind.gust), t, 0.4);
}
function worldFrame(dt) {
  if (window.__brio && !window.__brio.world) window.__brio.world = WORLD_API;
  // dash button held (keyboard, touch or pad shoulder/trigger) decides tap-dodge vs sprint
  let held = !!keys.dash || !!input.touchBtn.dash;
  if (!held && navigator.getGamepads) for (const gp of navigator.getGamepads()) { if (!gp) continue; const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5); if (b(5) || b(7)) held = true; }
  body.held = held;
  const E = WENV || worldEnv(), p = player.pos;
  // braziers on the shrine pillars burn from dusk to dawn
  if (E.lamp > 0.05 && Math.hypot(p[0] - SHRINE[0], p[2] - SHRINE[2]) < 70) {
    for (const pl of WORLD.pillars) {
      if (Math.random() < dt * 14 * E.lamp) particle([pl.x + rand(-0.12, 0.12), SHRINE[1] + 5.1, pl.z + rand(-0.12, 0.12)], [wind.x * 0.4 + rand(-0.1, 0.1), rand(0.9, 1.6), wind.z * 0.4 + rand(-0.1, 0.1)], rand(0.35, 0.7), rand(0.1, 0.2), [2.2, 0.75, 0.16, 0.5], -1.5, 1.2, -0.18);
      if (Math.random() < dt * 3 * E.lamp) particle([pl.x, SHRINE[1] + 5.2, pl.z], [wind.x + rand(-0.4, 0.4), rand(1.5, 3), wind.z + rand(-0.4, 0.4)], rand(0.8, 1.6), 0.025, [2.6, 1.0, 0.25, 1], -0.4, 0.6);
    }
  }
  // fireflies drift over the meadow on clear nights
  if (E.night > 0.4 && wx.rain < 0.1 && Math.random() < dt * 6 * E.night) {
    const a = rand(0, TAU), r = rand(3, 16), x = p[0] + Math.sin(a) * r, z = p[2] + Math.cos(a) * r, y = heightAt(x, z);
    if (y > WORLD.water + 0.3) particle([x, y + rand(0.3, 1.5), z], [rand(-0.3, 0.3), rand(-0.05, 0.2), rand(-0.3, 0.3)], rand(1.5, 3), rand(0.03, 0.05), [1.4, 2.4, 0.5, 1], 0, 0.3);
  }
  // exhausted panting
  if (body.pant > 0.5 && state.mode === 'play') { body.breathT -= dt; if (body.breathT <= 0) { body.breathT = 0.4; noise(0.28, 0.03, 1100, 'bandpass', 0, 1.2); } }
  worldAudio();
  hudClock(false);
}
const _ambientW = ambientParticles;
ambientParticles = function (dt) { _ambientW(dt); worldFrame(dt); };

// ---------- HUD: sun/moon dial and the stamina wheel ----------
const HUDW = { clock: null, stam: null, lastMin: -1 };
function hudInit() {
  if (HUDW.clock || !document.querySelector('.hud-r')) return;
  const css = document.createElement('style');
  css.textContent = `
.wclock{display:flex;align-items:center;gap:8px;background:rgba(12,14,28,.62);border:1px solid rgba(201,163,90,.5);border-radius:999px;padding:3px 13px 3px 3px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:inset 0 0 0 1px rgba(255,220,150,.06)}
.wclock svg{width:40px;height:40px;display:block}
.wclock .wt{display:flex;flex-direction:column;line-height:1.05}
.wclock b{font-family:'Cinzel',serif;font-weight:700;font-size:15px;letter-spacing:.08em;color:#f5e6c4;font-variant-numeric:tabular-nums}
.wclock small{font-family:'Cinzel',serif;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:#c9a35a;margin-top:2px}
#stamina{position:fixed;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;z-index:4;pointer-events:none;opacity:0;transition:opacity .45s}
#stamina.on{opacity:1}
#stamina circle{fill:none;stroke-linecap:round}
#stamina .bg{stroke:rgba(10,14,24,.55);stroke-width:7}
#stamina .fg{stroke:#8be35a;stroke-width:4.6;filter:drop-shadow(0 0 3px rgba(140,230,90,.55));transition:stroke .3s}
#stamina.tired .fg{stroke:#ff7a3d;filter:drop-shadow(0 0 3px rgba(255,110,50,.6))}
#stamina.tired svg{animation:stamPulse .6s ease-in-out infinite}
@keyframes stamPulse{50%{transform:scale(1.08)}}`;
  document.head.appendChild(css);
  const c = document.createElement('div');
  c.className = 'wclock'; c.id = 'wclock'; c.setAttribute('role', 'img');
  c.innerHTML = `<svg viewBox="-24 -24 48 48" aria-hidden="true">
<defs><clipPath id="wcTop"><rect x="-24" y="-24" width="48" height="24"/></clipPath>
<radialGradient id="wcSunG"><stop offset="0" stop-color="#fff6d8"/><stop offset=".55" stop-color="#ffd36a"/><stop offset="1" stop-color="#d9901c"/></radialGradient></defs>
<circle r="22.5" fill="#0d1022" stroke="#c9a35a" stroke-width="1.1"/>
<g clip-path="url(#wcTop)"><circle id="wcSky" r="21" fill="#3a6fb8"/>
<g id="wcRot"><g stroke="#ffd36a" stroke-width="1" opacity=".85"><path d="M0 -21.5v2.5M0 -6.5v-2.5M7.5 -14h-2.5M-7.5 -14h2.5M5.3 -19.3l-1.7 1.7M-5.3 -8.7l1.7 -1.7M5.3 -8.7l-1.7 -1.7M-5.3 -19.3l1.7 1.7"/></g>
<circle cy="-14" r="4.3" fill="url(#wcSunG)"/>
<circle cy="14" r="4" fill="#e8e6f2"/><circle cx="1.8" cy="12.8" r="3.5" fill="#1b2140" id="wcMoonCut"/></g></g>
<path d="M-21 0 A21 21 0 0 0 21 0 Z" fill="#141730"/>
<g stroke="#c9a35a" stroke-width=".8" opacity=".7"><path d="M0 3v3M-10.5 1.5l1.2 2.6M10.5 1.5l-1.2 2.6M-18 .5l2.2 1.6M18 .5l-2.2 1.6"/></g>
<line x1="-22" y1="0" x2="22" y2="0" stroke="#e6c27a" stroke-width="1.1"/>
<circle r="1.3" fill="#e6c27a"/></svg><div class="wt"><b id="wcTime">15:30</b><small id="wcWx">Despejado</small></div>`;
  const hr = document.querySelector('.hud-r');
  hr.insertBefore(c, hr.firstChild);
  const s = document.createElement('div');
  s.id = 'stamina'; s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="17"/><circle class="fg" cx="23" cy="23" r="17" transform="rotate(-90 23 23)" stroke-dasharray="106.8 106.8" stroke-dashoffset="0"/></svg>';
  document.body.appendChild(s);
  HUDW.clock = c; HUDW.stam = s; HUDW.fg = s.querySelector('.fg');
  HUDW.rot = c.querySelector('#wcRot'); HUDW.sky = c.querySelector('#wcSky'); HUDW.time = c.querySelector('#wcTime'); HUDW.wx = c.querySelector('#wcWx');
  hudClock(true);
}
function hudClock(force) {
  if (!HUDW.clock) { hudInit(); if (!HUDW.clock) return; }
  const h = WCLOCK.hour, min = Math.floor(h * 60);
  if (!force && min === HUDW.lastMin) return;
  HUDW.lastMin = min;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const txt = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  HUDW.time.textContent = txt; HUDW.wx.textContent = WEATHERS[wx.state].name;
  HUDW.rot.setAttribute('transform', `rotate(${((h - 12) / 24 * 360).toFixed(1)})`);
  const E = WENV || worldEnv(), tm = c => Math.round(255 * Math.pow(clamp(c * E.post[0] * 1.1 / (1 + c * E.post[0] * 1.1), 0, 1), 1 / 2.2));
  const sc = V.lerp(E.skyTop, E.skyHor, 0.35);
  HUDW.sky.setAttribute('fill', `rgb(${tm(sc[0])},${tm(sc[1])},${tm(sc[2])})`);
  HUDW.clock.setAttribute('aria-label', `Hora ${txt}, ${WEATHERS[wx.state].name}`);
}
function hudStamina(vp) {
  const s = HUDW.stam; if (!s) return;
  body.full = body.st >= 1 ? body.full + 1 / 60 : 0;
  const show = state.mode === 'play' && !player.hidden && body.full < 0.8;
  s.classList.toggle('on', show);
  s.classList.toggle('tired', body.exhausted);
  if (!show && !s.classList.contains('on')) return;
  const q = V.add(player.pos, [0, 1.25, 0]);
  const cx = vp[0] * q[0] + vp[4] * q[1] + vp[8] * q[2] + vp[12], cy = vp[1] * q[0] + vp[5] * q[1] + vp[9] * q[2] + vp[13], cw = vp[3] * q[0] + vp[7] * q[1] + vp[11] * q[2] + vp[15];
  if (cw <= 0) return;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const x = (cx / cw * 0.5 + 0.5) * W + Math.min(90, 260 / cw) + 18, y = (0.5 - cy / cw * 0.5) * H;
  s.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  HUDW.fg.setAttribute('stroke-dashoffset', (106.8 * (1 - body.st)).toFixed(2));
}

// ---------- test / debug hooks (window.__brio.world) ----------
const WORLD_API = {
  setTime(h) { WCLOCK.hour = ((h % 24) + 24) % 24; worldEnv(); hudClock(true); },
  setWeather, freeze(on = true) { WCLOCK.frozen = on; },
  get hour() { return WCLOCK.hour; }, get weather() { return wx.state; }, get rain() { return wx.rain; },
  wx, wind, body, clock: WCLOCK, env: () => WENV,
};

// ---------- GPU rain: instanced streaks around the camera + ground splashes (no CPU per drop) ----------
const WGSL_WORLD = /* wgsl */`
struct ROut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) a: f32, @location(2) @interpolate(flat) kind: f32 };
@vertex fn vsRain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> ROut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let fi = f32(ii);
  let h1 = hash2(vec2f(fi * 0.1371, 1.37)); let h2 = hash2(vec2f(fi * 0.2913, 7.13)); let h3 = hash2(vec2f(fi * 0.0719, 3.71));
  let size = vec3f(36.0, 22.0, 36.0);
  let vel = vec3f(F.wWind.x, 0.0, F.wWind.y) * F.wWind.z * 3.5 + vec3f(0.0, -15.0, 0.0);
  let base = F.camPos.xyz - size * vec3f(0.5, 0.45, 0.5);
  // world-anchored drops (shared fall + drift offset integrated on the CPU) wrapped into a box around the camera
  let p0 = vec3f(h1, h3, h2) * size + vec3f(F.wCL.w, F.wCS.w, F.wAmb.w);
  let rel = p0 - base;
  let wp0 = base + rel - size * floor(rel / size);
  let ax = normalize(vel);
  let toC = F.camPos.xyz - wp0; let dist = max(length(toC), 1e-3);
  let side = normalize(cross(ax, toC / dist));
  let len = 0.3 + 0.25 * h1;
  let wid = 0.007 + dist * 0.0011;
  let wp = wp0 + side * c.x * wid + ax * c.y * len;
  var o: ROut; o.pos = F.viewProj * vec4f(wp, 1.0); o.uv = c; o.kind = 0.0;
  o.a = clamp((dist - 1.2) / 2.5, 0.0, 1.0) * clamp((19.0 - dist) / 6.0, 0.0, 1.0) * (0.15 + 0.1 * h2) * clamp(F.wWx.x * 3.0, 0.0, 1.0);
  return o;
}
fn rainLight() -> vec3f { return F.skyHor.rgb * 0.35 + F.sunCol.rgb * 0.08 + F.wAmb.rgb * 0.18 + vec3f(2.5, 2.6, 3.0) * F.wWx.w; }
@fragment fn fsRain(v: ROut) -> @location(0) vec4f {
  let a = v.a * (1.0 - v.uv.x * v.uv.x) * clamp(1.0 - abs(v.uv.y), 0.0, 1.0) * (0.6 + 0.4 * (v.uv.y * 0.5 + 0.5));
  return vec4f(rainLight() * a, a);
}
@vertex fn vsSplash(@builtin(vertex_index) viIn: u32, @builtin(instance_index) ii: u32) -> ROut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let crown = viIn >= 6u; let c = corners[viIn % 6u];
  // a grid of world cells around the camera; each cell throws one splash per cycle at a fresh random spot
  let cs = 1.2;
  let g = vec2f(f32(ii % 30u), f32(ii / 30u)) - 15.0;
  let cell = floor(F.camPos.xz / cs) + g;
  let rate = 1.4 + hash2(cell * 0.37 + vec2f(2.1, 0.0)) * 0.9;
  let cyc = F.camPos.w * rate + hash2(cell * 0.93 + vec2f(5.3, 1.0));
  let k = floor(cyc); let ph = fract(cyc);
  let r1 = hash2(cell + vec2f(k * 1.7, 9.1)); let r2 = hash2(cell + vec2f(4.4, k * 0.71));
  let on = step(hash2(cell + vec2f(k * 0.113, 2.9)), F.wWx.x * 0.8);
  let xz = (cell + vec2f(r1, r2)) * cs;
  let gy = heightAtTex(xz);
  let vis = on * step(F.fogP.z + 0.1, gy) * clamp((17.0 - distance(xz, F.camPos.xz)) / 5.0, 0.0, 1.0);
  var wp: vec3f;
  var o: ROut;
  if (crown) {
    let hgt = 0.07 * sin(ph * 3.14159) + 0.01; let w = 0.03 + ph * 0.05;
    let rt = normalize(vec3f(F.camRight.x, 0.0, F.camRight.z));
    wp = vec3f(xz.x, gy + 0.02, xz.y) + rt * c.x * w + vec3f(0.0, (c.y * 0.5 + 0.5) * hgt, 0.0);
    o.kind = 1.0; o.a = vis * (1.0 - ph) * 0.4;
  } else {
    let r = 0.02 + ph * 0.1;
    wp = vec3f(xz.x + c.x * r, gy + 0.025, xz.y + c.y * r);
    o.kind = 0.0; o.a = -vis * (1.0 - ph) * 0.4;
  }
  o.pos = F.viewProj * vec4f(wp, 1.0); o.uv = c;
  return o;
}
@fragment fn fsSplash(v: ROut) -> @location(0) vec4f {
  let r = length(v.uv);
  var a: f32;
  if (v.kind > 0.5) { a = clamp(1.0 - abs(v.uv.x), 0.0, 1.0) * clamp(v.uv.y * 0.5 + 0.5, 0.0, 1.0) * clamp((1.0 - v.uv.y) * 2.0, 0.0, 1.0) * v.a; }
  else { a = clamp(1.0 - abs(r - 0.8) / 0.18, 0.0, 1.0) * -v.a; }
  return vec4f(rainLight() * 1.3 * a, a);
}
`;
