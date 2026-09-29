// ============================================================
//  Renderer: WebGPU + WGSL
// ============================================================
const WGSL_COMMON = /* wgsl */`
const PI = 3.14159265;
struct Frame {
  viewProj: mat4x4f, invViewProj: mat4x4f, lightVP: mat4x4f,
  camPos: vec4f, sunDir: vec4f, sunCol: vec4f, skyTop: vec4f, skyHor: vec4f,
  fogP: vec4f, res: vec4f, misc: vec4f, camRight: vec4f, camUp: vec4f, lightVP2: mat4x4f,
};
@group(0) @binding(0) var<uniform> F: Frame;

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  var a = 0.5; var s = 0.0; var q = p;
  for (var i = 0; i < 4; i++) { s += a * vnoise(q); q = q * 2.03 + vec2f(1.7, 9.2); a *= 0.5; }
  return s / 0.9375;
}
fn windOffset(wp: vec3f, h: f32, amp: f32) -> vec3f {
  let t = F.camPos.w;
  let gust = 0.6 + 0.4 * sin(t * 0.7 + wp.x * 0.05);
  return vec3f(sin(t * 1.7 + wp.z * 0.35 + wp.x * 0.2), 0.0, cos(t * 1.3 + wp.x * 0.3)) * amp * h * gust;
}
struct VIn {
  @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec4f,
  @location(3) m0: vec4f, @location(4) m1: vec4f, @location(5) m2: vec4f, @location(6) m3: vec4f,
  @location(7) tint: vec4f, @location(8) prm: vec4f,
};
fn meshWorld(i: VIn) -> vec3f {
  let M = mat4x4f(i.m0, i.m1, i.m2, i.m3);
  var wp = (M * vec4f(i.pos, 1.0)).xyz;
  if (i.prm.z > 0.0) { wp += windOffset(wp, max(i.pos.y + i.prm.w, 0.0), i.prm.z); }
  return wp;
}
`;

const WGSL_SCENE = WGSL_COMMON + /* wgsl */`
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var shadowSmp: sampler_comparison;
@group(0) @binding(3) var heightTex: texture_2d<f32>;
@group(0) @binding(4) var shadowTex2: texture_depth_2d;
@group(0) @binding(5) var reflTex: texture_2d<f32>;
@group(0) @binding(6) var linSmp: sampler;

fn skyColor(d: vec3f) -> vec3f {
  let t = clamp(d.y, 0.0, 1.0);
  let sd = max(dot(d, F.sunDir.xyz), 0.0);
  // warm the horizon on the sun's side
  let hor = mix(F.skyHor.rgb, vec3f(1.0, 0.8, 0.6), pow(sd, 3.0) * 0.55 * (1.0 - t));
  var c = mix(hor, F.skyTop.rgb, pow(t, 0.5));
  c += F.sunCol.rgb * (pow(sd, 6.0) * 0.22 + pow(sd, 90.0) * 0.8);
  c = mix(c, F.skyHor.rgb * vec3f(0.92, 0.97, 1.0), smoothstep(0.0, -0.25, d.y));
  return c;
}
fn applyFog(c: vec3f, wp: vec3f) -> vec3f {
  let d = distance(wp, F.camPos.xyz);
  let dir = (wp - F.camPos.xyz) / max(d, 1e-3);
  let hf = exp(-max(wp.y, 0.0) * F.fogP.y);
  let f = 1.0 - exp(-d * F.fogP.x * (0.4 + hf));
  let sun = pow(max(dot(dir, F.sunDir.xyz), 0.0), 8.0);
  let fc = mix(F.skyHor.rgb * vec3f(0.9, 0.96, 1.06), F.skyHor.rgb, clamp(d * 0.004, 0.0, 1.0)) * 0.95 + F.sunCol.rgb * sun * 0.35;
  return mix(c, fc, clamp(f, 0.0, 1.0));
}
fn shadowAt(wp: vec3f, n: vec3f) -> f32 {
  let p = F.lightVP * vec4f(wp + n * 0.08, 1.0);
  let uv = p.xy * vec2f(0.5, -0.5) + 0.5;
  let tx = 1.0 / 2048.0;
  var s = 0.0;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(f32(x), f32(y)) * tx * 1.25, p.z - 0.0012);
    }
  }
  let edge = smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  var s1 = mix(1.0, s / 9.0, edge);
  if (uv.x < 0.001 || uv.x > 0.999 || uv.y < 0.001 || uv.y > 0.999 || p.z > 1.0) { s1 = 1.0; }
  let q = F.lightVP2 * vec4f(wp + n * 0.012, 1.0);
  let uv2 = q.xy * vec2f(0.5, -0.5) + 0.5;
  let t2 = 1.0 / 1024.0;
  var s2 = 0.0;
  for (var x = -2; x <= 2; x++) {
    for (var y = -2; y <= 2; y++) {
      s2 += textureSampleCompareLevel(shadowTex2, shadowSmp, uv2 + vec2f(f32(x), f32(y)) * t2 * 0.8, q.z - 0.0006);
    }
  }
  s2 /= 25.0;
  let w2 = smoothstep(0.0, 0.12, min(min(uv2.x, 1.0 - uv2.x), min(uv2.y, 1.0 - uv2.y))) * step(q.z, 1.0) * step(0.0, q.z);
  // drifting cloud shadows, projected along the sun direction
  let cxz = (wp.xz - F.sunDir.xz / max(F.sunDir.y, 0.2) * wp.y) * 0.018 + vec2f(F.camPos.w * 0.01, F.camPos.w * 0.004);
  let cloud = smoothstep(0.42, 0.58, fbm(cxz));
  return mix(s1, min(s1 + 0.25, s2), w2) * (1.0 - 0.5 * cloud);
}
fn ggx(n: vec3f, v: vec3f, l: vec3f, rough: f32) -> f32 {
  let h = normalize(v + l); let nh = max(dot(n, h), 0.0);
  let a = max(rough * rough, 0.002); let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0; let D = a2 / (PI * d * d);
  let nl = max(dot(n, l), 0.0); let nv = max(dot(n, v), 0.001);
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  let G = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  return D * G / (4.0 * nv + 0.001);
}
// material ids (vertex colour alpha): 1 skin, 2 cloth, 3 leather, 4 steel, 5 gold, 6 eye, 7 hair, 8 foliage
fn lighting(base: vec3f, n: vec3f, wp: vec3f, roughIn: f32, rim: f32, sh: f32, mat: f32, tng: vec3f) -> vec3f {
  var rough = roughIn; var metal = 0.0; var sss = 0.0; var sheen = 0.0;
  let m = i32(mat + 0.5);
  if (m == 1) { rough = 0.48; sss = 1.0; }
  else if (m == 2 || m == 9) { rough = 0.86; sheen = 0.55; }
  else if (m == 3) { rough = 0.5; }
  else if (m == 4) { rough = 0.16; metal = 1.0; }
  else if (m == 5) { rough = 0.28; metal = 1.0; }
  else if (m == 6) { rough = 0.05; }
  else if (m == 7) { rough = 0.38; sheen = 0.4; }
  else if (m == 8) { rough = 0.7; sss = 0.55; }
  else if (m == 10) { rough = 0.92; }
  else if (m == 11) { rough = 0.85; }
  else if (m == 12) { rough = 0.9; sss = 0.25; }
  else if (m == 16) { rough = 0.42; metal = 1.0; }
  else if (m == 17) { rough = 0.7; sss = 0.55; }
  else if (m == 18) { rough = 0.12; sss = 0.3; }
  let v = normalize(F.camPos.xyz - wp); let l = F.sunDir.xyz;
  let nl = dot(n, l);
  // soft wrap for a painterly, forgiving look
  let wrap = clamp((nl + 0.25) / 1.25, 0.0, 1.0);
  let hemi = mix(vec3f(0.4, 0.34, 0.27), F.skyTop.rgb * 1.05 + vec3f(0.1, 0.12, 0.16), n.y * 0.5 + 0.5);
  let nv = max(dot(n, v), 0.0);
  let F0 = mix(vec3f(0.04), base, metal);
  let fres = F0 + (vec3f(1.0) - F0) * pow(1.0 - nv, 5.0);
  // skin and foliage scatter warm light into their shadows instead of picking up the blue sky
  let amb = hemi * mix(vec3f(1.0), vec3f(1.08, 0.93, 0.86), sss);
  var c = base * (1.0 - metal * 0.9) * (F.sunCol.rgb * wrap * sh * F.sunDir.w + amb * 0.62);
  if (sss > 0.0) {
    // light bleeding past the terminator and through thin edges, warm tinted
    let bleed = clamp((nl + 0.6) / 1.6, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
    c += base * vec3f(1.0, 0.36, 0.24) * bleed * sss * 0.85 * F.sunCol.rgb * max(sh, 0.45);
    let back = pow(clamp(dot(v, -l), 0.0, 1.0), 4.0) * pow(1.0 - nv, 2.0);
    c += base * vec3f(1.0, 0.5, 0.32) * back * sss * 0.6 * F.sunCol.rgb;
  }
  if (m == 7) {
    // Kajiya-Kay: two shifted lobes along the strand direction (white primary, tinted secondary)
    let t0 = normalize(tng - n * dot(tng, n));
    let hv = normalize(l + v);
    let t1 = normalize(t0 + n * 0.12); let t2 = normalize(t0 - n * 0.18);
    let d1 = dot(t1, hv); let d2 = dot(t2, hv);
    let s1 = pow(sqrt(max(1.0 - d1 * d1, 0.0)), 90.0); let s2 = pow(sqrt(max(1.0 - d2 * d2, 0.0)), 22.0);
    let lit = smoothstep(-0.1, 0.3, nl) * sh * F.sunDir.w;
    c += F.sunCol.rgb * (s1 * 0.3 + s2 * base * 0.7) * lit;
  } else {
    c += F.sunCol.rgb * ggx(n, v, l, rough) * sh * F.sunDir.w * fres * (1.0 - rough * 0.4);
  }
  // reflections: sky above the horizon, sunlit grass-and-earth below it, dimmed in shadow
  let rd = reflect(-v, n);
  let ground = vec3f(0.2, 0.24, 0.11) * (F.sunCol.rgb * 0.55 * F.sunDir.w + vec3f(0.35, 0.38, 0.42));
  let env = mix(skyColor(rd), ground, smoothstep(0.03, -0.1, rd.y)) * mix(0.5, 1.0, sh);
  if (m == 1 || m == 6) {
    // character key light: soft, warm, from above and to one side of the camera, so faces keep their modelling
    let up = vec3f(0.0, 1.0, 0.0); let rt = normalize(cross(up, v));
    let kd = normalize(v * 0.3 + up * 0.6 - rt * 0.85);
    let kw = smoothstep(-0.75, 1.0, dot(n, kd));
    c += base * vec3f(1.0, 0.9, 0.78) * kw * 0.45 * F.sunDir.w;
    c -= base * amb * 0.12 * (1.0 - kw);
    c += vec3f(1.0, 0.92, 0.82) * ggx(n, v, kd, max(rough, 0.3)) * 0.02 * F.sunDir.w;
  }
  if (m == 1) {
    // skin: a tight wet sheen over the broad lobe, and soft peach-fuzz scattering at grazing angles
    c += F.sunCol.rgb * ggx(n, v, l, 0.26) * sh * F.sunDir.w * 0.035;
    c += base * pow(1.0 - nv, 3.0) * 0.16 * (F.skyHor.rgb * 0.6 + F.sunCol.rgb * 0.25 * sh);
  }
  // mail rings shadow each other, so they only catch a fraction of the sky
  c += env * fres * mix(0.3 * (1.0 - rough), 0.85, metal) * select(1.0, 0.3, m == 16);
  c += sheen * pow(1.0 - nv, 4.0) * base * (F.skyHor.rgb * 0.9 + F.sunCol.rgb * 0.3);
  c += rim * pow(1.0 - nv, 3.0) * (F.skyHor.rgb * 0.55 + F.sunCol.rgb * 0.35 * max(sh, 0.4));
  return c;
}

// ---------- sky ----------
struct FOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> FOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: FOut; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(p.x, 1.0 - p.y); return o;
}
@fragment fn fsSky(v: FOut) -> @location(0) vec4f {
  let ndc = vec2f(v.uv.x * 2.0 - 1.0, 1.0 - v.uv.y * 2.0);
  let a = F.invViewProj * vec4f(ndc, 1.0, 1.0);
  let b = F.invViewProj * vec4f(ndc, 0.0, 1.0);
  let d = normalize(a.xyz / a.w - b.xyz / b.w);
  var c = skyColor(d);
  if (d.y > 0.0) {
    let uv = d.xz / (d.y + 0.12) * 1.4 + vec2f(F.camPos.w * 0.008, F.camPos.w * 0.003);
    // high wispy cirrus streaks
    let ci = fbm(vec2f(uv.x * 0.35 + uv.y * 0.2, uv.y * 2.4) * 0.8 + vec2f(3.1, 7.7));
    c = mix(c, vec3f(1.02, 1.0, 0.98), smoothstep(0.55, 0.8, ci) * smoothstep(0.05, 0.4, d.y) * 0.28);
    // cumulus: density with a detail octave, self-shadowed by marching a step toward the sun
    let cl = fbm(uv * 1.3) + 0.22 * fbm(uv * 4.3) - 0.11;
    let so = normalize(F.sunDir.xz + vec2f(1e-4)) * 0.16;
    let cls = fbm((uv + so) * 1.3) + 0.22 * fbm((uv + so) * 4.3) - 0.11;
    let m = smoothstep(0.5, 0.78, cl) * smoothstep(0.0, 0.3, d.y);
    let light = clamp(0.55 + (cl - cls) * 3.5, 0.0, 1.0);
    let sunG = pow(max(dot(d, F.sunDir.xyz), 0.0), 4.0);
    var shade = mix(vec3f(0.6, 0.64, 0.76), vec3f(1.12, 1.06, 0.97), light) * (0.85 + 0.35 * sunG);
    // silver lining: thin edges glow when the sun sits behind them
    shade += F.sunCol.rgb * sunG * 0.6 * (1.0 - smoothstep(0.5, 0.62, cl));
    c = mix(c, shade, m * 0.92);
  }
  c += F.sunCol.rgb * smoothstep(0.9990, 0.9996, dot(d, F.sunDir.xyz)) * 14.0;
  // distant islands and ranges on the horizon: two hazy layers, only in some directions
  let az = atan2(d.x, d.z);
  for (var L = 0; L < 2; L++) {
    let fl = f32(L);
    let mask = smoothstep(0.3, 0.42, fbm(vec2f(az * 0.9 + fl * 5.3, 2.0 + fl)));
    let ridge = (0.02 + 0.07 * fbm(vec2f(az * (6.0 + fl * 5.0), fl * 3.0)) + 0.02 * fbm(vec2f(az * 22.0, fl))) * mask * (1.0 - fl * 0.45);
    let inM = step(d.y, ridge) * step(-0.02, d.y);
    let haze = mix(vec3f(0.44, 0.55, 0.68), F.skyHor.rgb, 0.45 + fl * 0.3) * (0.9 + 0.2 * smoothstep(0.0, ridge + 1e-4, d.y));
    c = mix(c, haze, inM * (0.85 - fl * 0.25));
  }
  return vec4f(c, 1.0);
}

// ---------- terrain ----------
struct TIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec4f };
struct TOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f };
@vertex fn vsTerrain(i: TIn) -> TOut {
  var o: TOut; o.pos = F.viewProj * vec4f(i.pos, 1.0); o.wp = i.pos; o.n = i.nrm; o.col = i.col.rgb; return o;
}
@fragment fn fsTerrain(v: TOut) -> @location(0) vec4f {
  var n = normalize(v.n);
  let d1 = fbm(v.wp.xz * 0.45);
  let d2 = vnoise(v.wp.xz * 3.1);
  let rockW = smoothstep(0.86, 0.66, n.y);
  let strata = fbm(vec2f(v.wp.x * 0.6 + v.wp.z * 0.6, v.wp.y * 3.5)) ;
  let grassMicro = vnoise(v.wp.xz * 11.0) * 0.6 + vnoise(v.wp.xz * 27.0) * 0.4;
  // dirt path (told apart by its colour): scattered pebbles from a jittered cell pattern
  let dirt = smoothstep(0.02, 0.1, v.col.r - v.col.g) * (1.0 - rockW);
  let cq = v.wp.xz * 7.0; let ci = floor(cq); var peb = 0.0; var pebTone = 0.0;
  for (var ox = -1; ox <= 1; ox++) { for (var oz = -1; oz <= 1; oz++) {
    let cc = ci + vec2f(f32(ox), f32(oz));
    let hsh = fract(sin(vec2f(dot(cc, vec2f(127.1, 311.7)), dot(cc, vec2f(269.5, 183.3)))) * 43758.5453);
    let rr = 0.12 + 0.2 * hsh.y; let dd = length(cq - cc - hsh) / rr;
    let bump = (1.0 - smoothstep(0.55, 1.0, dd)) * step(0.35, hsh.x);
    if (bump > peb) { peb = bump; pebTone = hsh.x; }
  } }
  // grass ground: clumpy tonal patches and fine blade speckle
  let gpatch = fbm(v.wp.xz * 0.9); let speck = vnoise(v.wp.xz * 60.0);
  let th = grassMicro * 0.02 * (1.0 - rockW) * (1.0 - dirt) + strata * 0.22 * rockW + peb * 0.025 * dirt + speck * 0.003 * (1.0 - dirt) * (1.0 - rockW);
  let dhx = dpdx(th); let dhy = dpdy(th); let px = dpdx(v.wp); let py = dpdy(v.wp);
  let r1 = cross(py, n); let r2 = cross(n, px); let det = dot(px, r1);
  n = normalize(abs(det) * n - sign(det) * (dhx * r1 + dhy * r2));
  var base = v.col * (0.84 + 0.28 * d1) * (0.94 + 0.12 * d2) * (0.9 + 0.2 * mix(grassMicro, strata, rockW));
  base *= 1.0 - smoothstep(0.35, -0.15, v.wp.y) * 0.35;
  base = mix(base, base * (1.15 + 0.35 * pebTone) * vec3f(0.95, 0.93, 0.9), peb * dirt);
  base *= 1.0 - dirt * (1.0 - peb) * 0.12 * vnoise(v.wp.xz * 18.0);
  base *= mix(vec3f(1.0), mix(vec3f(0.86, 0.92, 0.8), vec3f(1.08, 1.06, 0.9), gpatch) * (0.94 + 0.12 * speck), (1.0 - dirt) * (1.0 - rockW));
  // broad meadow variation: sun-dried yellow-green swathes and deep lush hollows
  let meadow = fbm(v.wp.xz * 0.045 + vec2f(13.0, 7.0));
  let dry = clamp((meadow - 0.6) / 0.1, 0.0, 1.0);
  let lush = clamp((0.5 - meadow) / 0.1, 0.0, 1.0);
  let grassy = (1.0 - dirt) * (1.0 - rockW);
  base = mix(base, vec3f(0.36, 0.38, 0.12) * (0.9 + 0.2 * speck), dry * grassy * 0.45);
  base = mix(base, vec3f(0.08, 0.19, 0.06) * (0.9 + 0.2 * speck), lush * grassy * 0.5);
  // caustics dancing on the shallow sea floor
  let ct = F.camPos.w;
  let cp = v.wp.xz * 1.3;
  let cau = abs(sin(cp.x + sin(cp.y * 1.3 + ct * 1.1) * 1.4 + ct * 0.6) * sin(cp.y + sin(cp.x * 1.1 - ct * 0.9) * 1.4 - ct * 0.5));
  base += vec3f(0.55, 0.75, 0.7) * pow(1.0 - cau, 6.0) * smoothstep(0.05, -0.4, v.wp.y) * smoothstep(-3.5, -1.0, v.wp.y) * 0.5;
  // beach: ripple marks on the dry sand, then a dark glistening wet band right at the waterline
  let above = v.wp.y - F.fogP.z;
  let beach = clamp((1.6 - above) / 0.6, 0.0, 1.0) * step(-0.2, above);
  let rip = sin(dot(v.wp.xz, vec2f(0.8, 0.5)) * 9.0 + vnoise(v.wp.xz * 1.5) * 4.0);
  base *= 1.0 + beach * clamp((above - 0.6) / 0.2, 0.0, 1.0) * rip * 0.09;
  let wet = clamp((0.62 - above) / 0.22, 0.0, 1.0) * step(-0.2, above);
  base *= 1.0 - wet * 0.45;
  let sh = shadowAt(v.wp, n);
  var c = lighting(base, n, v.wp, mix(0.93, 0.25, wet), 0.0, sh, 0.0, vec3f(0.0, 1.0, 0.0));
  let vdir = normalize(F.camPos.xyz - v.wp);
  c += F.sunCol.rgb * pow(max(dot(n, normalize(vdir + F.sunDir.xyz)), 0.0), 60.0) * wet * sh * 0.5;
  if (F.misc.z > 0.5 && v.wp.y < F.fogP.z - 0.05) { discard; }
  return vec4f(applyFog(c, v.wp), 1.0);
}

// ---------- instanced meshes ----------
struct VOut {
  @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec4f,
  @location(3) @interpolate(flat) tint: vec4f, @location(4) @interpolate(flat) prm: vec4f,
  @location(5) lp: vec3f, @location(6) tng: vec3f,
};
@vertex fn vsMesh(i: VIn) -> VOut {
  var wp = meshWorld(i);
  // wind: blades and petals sway in travelling gusts (more at the tips); canopies roll slowly
  let tw = F.camPos.w; let mid = i32(i.col.a + 0.5);
  if (mid == 17) {
    let gust = 0.5 + 0.5 * sin(dot(wp.xz, vec2f(0.21, 0.13)) - tw * 1.3);
    let sway = (sin(tw * 2.1 + wp.x * 0.7 + wp.z * 0.5) * 0.6 + gust * 0.9) * i.pos.y * i.pos.y * 0.12;
    wp += vec3f(sway, -abs(sway) * 0.25, sway * 0.45);
    // blades part around the hero and flatten underfoot
    let dh = wp.xz - vec2f(F.camRight.w, F.camUp.w); let dl = length(dh);
    let push = smoothstep(1.1, 0.25, dl) * i.pos.y;
    wp += vec3f(dh.x / max(dl, 0.05) * push * 0.35, -push * 0.3, dh.y / max(dl, 0.05) * push * 0.35);
  } else if (mid == 8) {
    let roll = sin(tw * 0.8 + wp.x * 0.15 + wp.z * 0.11) * 0.025 * max(i.pos.y + 0.5, 0.0);
    wp += vec3f(roll, 0.0, roll * 0.6);
  }
  let s2 = vec3f(dot(i.m0.xyz, i.m0.xyz), dot(i.m1.xyz, i.m1.xyz), dot(i.m2.xyz, i.m2.xyz));
  let n = normalize(mat3x3f(i.m0.xyz, i.m1.xyz, i.m2.xyz) * (i.nrm / max(s2, vec3f(1e-10))));
  var o: VOut; o.pos = F.viewProj * vec4f(wp, 1.0); o.wp = wp; o.n = n; o.col = i.col; o.tint = i.tint; o.prm = i.prm;
  o.lp = i.pos; o.tng = normalize(i.m1.xyz); return o;
}
// skinned hero + cloth: world-space vertices plus their bind-space position for stable surface detail
struct HIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec4f, @location(9) bind: vec3f };
@vertex fn vsHero(i: HIn) -> VOut {
  var o: VOut; o.pos = F.viewProj * vec4f(i.pos, 1.0); o.wp = i.pos; o.n = i.nrm; o.col = i.col;
  o.tint = vec4f(1.0, 1.0, 1.0, 0.0); o.prm = vec4f(0.6, 0.35, 0.0, 0.0); o.lp = i.bind; o.tng = vec3f(0.0, -1.0, 0.0); return o;
}
fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), u.x), mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b = mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), u.x), mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
@fragment fn fsMesh(v: VOut, @builtin(front_facing) ffRaw: bool) -> @location(0) vec4f {
  // the mirrored reflection pass flips winding
  let ff = select(ffRaw, !ffRaw, F.misc.z > 0.5);
  var n = normalize(v.n);
  if (!ff) { n = -n; }
  let mat = v.col.a;
  let isSkin = 1.0 - step(0.5, abs(mat - 1.0)); let isEmb = 1.0 - step(0.5, abs(mat - 9.0)); let isCloth = 1.0 - step(0.5, abs(mat - 2.0)) + isEmb;
  let isLeather = 1.0 - step(0.5, abs(mat - 3.0)); let isMetal = step(3.5, mat) * (1.0 - step(5.5, mat));
  let isEye = 1.0 - step(0.5, abs(mat - 6.0)); let isHair = 1.0 - step(0.5, abs(mat - 7.0));
  let isLeaf = 1.0 - step(0.5, abs(mat - 8.0)); let isBark = 1.0 - step(0.5, abs(mat - 10.0));
  let isStone = 1.0 - step(0.5, abs(mat - 11.0)) + (1.0 - step(0.5, abs(mat - 14.0))) * 0.4; let isGrass = 1.0 - step(0.5, abs(mat - 12.0));
  let isRune = 1.0 - step(0.5, abs(mat - 13.0)); let isTile = 1.0 - step(0.5, abs(mat - 14.0)); let isPortal = 1.0 - step(0.5, abs(mat - 15.0));
  let isMail = 1.0 - step(0.5, abs(mat - 16.0));
  let isBlade = 1.0 - step(0.5, abs(mat - 17.0));
  let p = v.lp;
  // fade micro detail out before it can alias
  let fp = length(fwidth(p)) + 1e-6;
  // fabric: over-under weave plus slubby threads
  let wx = sin(p.x * 1500.0 + sin(p.y * 90.0) * 0.6); let wy = sin(p.y * 1500.0);
  let weave = (wx * 0.5 + 0.5) * (wy * 0.5 + 0.5) + vnoise3(p * 420.0) * 0.35;
  // leather: pebbled grain and soft creases
  let grain = vnoise3(p * 320.0) * 0.6 + vnoise3(p * 900.0) * 0.4 - smoothstep(0.62, 0.7, vnoise3(p * 60.0)) * 0.6;
  // skin: fine pores; metal: brushed along the blade; hair: strand striations
  let pores = vnoise3(p * 1100.0);
  let brushed = vnoise3(vec3f(p.x * 900.0, p.y * 18.0, p.z * 900.0));
  let strands = sin(p.x * 150.0 + vnoise3(vec3f(p.x * 30.0, p.y * 3.0, p.z * 30.0)) * 1.5) * 0.5 + 0.5;
  let capStr = sin(atan2(p.x, p.z) * 48.0 + vnoise3(p * 22.0) * 2.5) * 0.5 + 0.5;
  let hairH = mix(strands, capStr, step(1.2, p.y));
  let embH = isEmb * step(p.y, 0.72) * step(0.63, p.y) * (1.0 - smoothstep(0.08, 0.16, abs(abs(fract(atan2(p.x, p.z) * 7.0 / 3.14159) - 0.5) * 2.0 + abs((p.y - 0.676) / 0.02) - 0.75)));
  let leafy = vnoise3(p * 20.0) * 0.6 + vnoise3(p * 52.0) * 0.4;
  let grooves = sin(atan2(p.x, p.z) * 15.0 + vnoise3(p * vec3f(3.0, 0.5, 3.0)) * 5.0) * 0.5 + 0.5;
  let stone = vnoise3(p * 5.0) * 0.5 + vnoise3(p * 16.0) * 0.3 + vnoise3(p * 40.0) * 0.2 - smoothstep(0.015, 0.0, abs(vnoise3(p * 3.0) - 0.5)) * 0.3;
  let turf = vnoise3(p * 34.0) * 0.6 + vnoise3(p * 90.0) * 0.4;
  // riveted mail: staggered rows of interlocking rings
  let mu = atan2(p.x, p.z) * 16.0; let mv = p.y * 70.0; let mrow = floor(mv);
  let mc = vec2f(fract(mu + 0.5 * (mrow - 2.0 * floor(mrow * 0.5))) - 0.5, fract(mv) - 0.5);
  let mr = length(mc * vec2f(1.0, 0.8));
  let ringH = 1.0 - smoothstep(0.08, 0.2, abs(mr - 0.34));
  let mailFade = smoothstep(0.02, 0.006, fp);
  let h = isMail * ringH * mailFade * 0.0022 + isStone * stone * 0.035 + isGrass * turf * 0.012 + isLeaf * leafy * 0.02 + isBark * (grooves * 0.6 + vnoise3(p * 12.0) * 0.4) * 0.025 + embH * 0.0008 + isCloth * weave * smoothstep(0.004, 0.0012, fp) * 0.00035
        + isLeather * grain * smoothstep(0.006, 0.0015, fp) * 0.0006
        + isSkin * pores * smoothstep(0.0015, 0.0004, fp) * 0.00002
        + isMetal * brushed * 0.00008
        + isHair * hairH * smoothstep(0.004, 0.001, fp) * 0.0003;
  // bump from a height field using screen-space derivatives (no tangents needed)
  let dhx = dpdx(h); let dhy = dpdy(h); let px = dpdx(v.wp); let py = dpdy(v.wp);
  let r1 = cross(py, n); let r2 = cross(n, px); let det = dot(px, r1);
  let grad = sign(det) * (dhx * r1 + dhy * r2);
  n = normalize(abs(det) * n - grad);
  // gold-thread embroidery: a band of linked diamonds above the hem, bordered by twin rules
  let ea = atan2(p.x, p.z) * 7.0 / 3.14159;
  let ey = (p.y - 0.676) / 0.02;
  let dia = abs(fract(ea) - 0.5) * 2.0 + abs(ey);
  let emb = isEmb * step(p.y, 1.0) * max(max(1.0 - smoothstep(0.08, 0.16, abs(dia - 0.75)), 1.0 - smoothstep(0.1, 0.2, abs(abs(ey) - 1.45))), step(abs(ey), 1.0) * step(dia, 0.35) * 0.9);
  let hemBand = isEmb * step(p.y, 0.652);
  // chest: a gold-embroidered yoke dipping to a point, scroll work inside twin rules, and stitched princess seams
  let onTorso = isEmb * step(0.99, p.y) * step(p.y, 1.37);
  let yk = p.y - 1.215 + 0.42 * abs(p.x);
  let yokeRule = 1.0 - smoothstep(0.0012, 0.0024, abs(abs(yk) - 0.012));
  let sx = p.x * 46.0 + select(0.0, 0.5, p.z < 0.0);
  let scroll = 1.0 - smoothstep(0.0012, 0.0026, abs(yk - 0.0065 * sin(sx * 6.2832)));
  let bead = step(length(vec2f((fract(sx) - 0.5) / 46.0, yk)), 0.0028);
  let yoke = onTorso * step(abs(yk), 0.016) * max(max(yokeRule, scroll * 0.9), bead);
  let above = onTorso * step(0.016, yk);
  let seamX = abs(abs(p.x) - 0.072);
  let seam = onTorso * step(yk, -0.016) * (1.0 - smoothstep(0.0008, 0.0018, seamX));
  let stitch = onTorso * step(yk, -0.016) * step(abs(seamX - 0.005), 0.0012) * step(fract(p.y * 140.0), 0.55);
  let embAll = clamp(emb + hemBand, 0.0, 1.0);
  var base = v.col.rgb * v.tint.rgb;
  base = mix(base, base * mix(0.6, mix(0.12, 1.15, ringH), mailFade), isMail);
  base = mix(base, vec3f(0.78, 0.55, 0.2), embAll);
  base = mix(base, base * 0.82, above);
  base = mix(base, base * 0.55, seam);
  base = mix(base, vec3f(0.85, 0.72, 0.45), stitch);
  base = mix(base, vec3f(0.8, 0.57, 0.21), yoke);
  // rune glyphs: stacked angular symbols, only the carved strokes glow
  let gy = fract(p.y * 3.2); let gid = floor(p.y * 3.2); let gx = abs(p.x + p.z) * 5.0;
  let glyph = max(max(step(abs(gy - 0.5), 0.06) * step(gx, 0.7 + 0.2 * sin(gid * 3.1)), step(abs(gx - 0.35 - 0.2 * sin(gid * 1.7)), 0.07) * step(abs(gy - 0.5), 0.35)), step(abs(gy - gx * 0.6 - 0.2), 0.05) * step(gx, 0.8));
  base = mix(base, base * mix(0.18, 1.0, glyph), isRune);
  // mosaic floor: concentric rings of tiles with a sun inlay in the middle
  let tr = length(p.xz) * 7.0; let ta = atan2(p.z, p.x);
  let ringLine = step(0.92, fract(tr * 1.4)); let segLine = step(0.94, fract(ta / 6.2832 * (8.0 + floor(tr * 1.4) * 6.0)));
  let tileJoint = isTile * step(0.99, abs(v.n.y)) * max(ringLine, segLine);
  let sunInlay = isTile * step(tr, 1.2) * step(0.99, abs(v.n.y));
  // weathered tiles: each tile its own tone with grime toward its edges, moss creeping along the joints outward
  let tid = vec2f(floor(tr * 1.4), floor(ta / 6.2832 * (8.0 + floor(tr * 1.4) * 6.0)));
  let th = fract(sin(dot(tid, vec2f(12.9898, 78.233))) * 43758.5453);
  let edge = max(smoothstep(0.7, 0.92, fract(tr * 1.4)), smoothstep(0.75, 0.94, fract(ta / 6.2832 * (8.0 + floor(tr * 1.4) * 6.0))));
  let topFace = isTile * step(0.99, abs(v.n.y));
  base *= mix(1.0, (0.84 + 0.3 * th) * (1.0 - 0.15 * edge) * (0.92 + 0.16 * vnoise3(p * 14.0)), topFace);
  base = mix(base, base * 0.55, tileJoint);
  base = mix(base, vec3f(0.16, 0.24, 0.09), tileJoint * smoothstep(1.5, 3.0, tr) * step(0.58, vnoise3(p * 5.0)) * 0.85);
  base = mix(base, vec3f(0.78, 0.55, 0.2), sunInlay * step(abs(fract(tr * 2.5) - 0.5), 0.2));
  // portal: a slow spiral of light
  let sw = sin(ta * 5.0 + tr * 1.8 - F.camPos.w * 2.4) * 0.5 + 0.5;
  base = mix(base, base * (0.35 + 1.2 * sw * sw) * (0.6 + 0.6 * smoothstep(7.0, 0.0, tr)), isPortal);
  // cape: embroidered sun crest, gold side borders, darker lining on the inner face
  let isCape = isCloth * step(0.35, p.z) * step(p.z, 0.45);
  let cq = vec2f(p.x - 0.17, p.y + 0.58);
  let cr = length(cq); let ca = atan2(cq.y, cq.x);
  let scallop = step(abs(cr - 0.075 - 0.01 * cos(ca * 12.0)), 0.006);
  let spokes = step(cr, 0.03 + 0.024 * pow(abs(cos(ca * 6.0)), 6.0));
  let crest = max(max(step(abs(cr - 0.062), 0.004), spokes), scallop);
  let border = step(min(p.x, 0.34 - p.x), 0.012) * step(0.004, min(p.x, 0.34 - p.x));
  // hem greek-key band in gold thread just above the bottom edge
  let hy = (p.y + 0.8) / 0.03; let hk = fract(p.x * 45.0);
  let key = step(abs(hy), 1.0) * max(step(abs(abs(hy) - 0.85), 0.15), step(abs(hk - 0.5), 0.12) * step(hy, 0.6) + step(0.5, hk) * step(abs(hy - 0.1), 0.15));
  base = mix(base, vec3f(0.8, 0.58, 0.22), isCape * max(max(crest, border), key));
  if (!ff) { base *= 1.0 - isCape * 0.35; }
  base *= (1.0 + isStone * (stone - 0.5) * 0.5 + isGrass * (turf - 0.5) * 0.4);
  base *= (1.0 + isLeaf * (leafy - 0.5) * 0.45) * (1.0 - isBark * (1.0 - grooves) * 0.35);
  base *= 1.0 - isCloth * (1.0 - weave) * 0.11 - isCloth * (vnoise3(p * 45.0) - 0.5) * 0.1 - isLeather * (0.55 - grain) * 0.22 - isHair * (1.0 - hairH) * 0.08 * smoothstep(0.004, 0.001, fp);
  // iris fibres + dark limbal ring (only shows on the coloured part of the eye)
  let ir = length(p.xy); let ang = atan2(p.y, p.x);
  let fib = 0.8 + 0.2 * sin(ang * 46.0 + vnoise3(p * 9.0) * 6.0) - smoothstep(0.75, 1.0, ir) * 0.35 + smoothstep(0.35, 0.0, ir) * 0.2;
  let colored = clamp((1.0 - dot(base, vec3f(0.33))) * 1.4, 0.0, 1.0);
  base *= mix(1.0, fib, isEye * colored);
  // thin foliage (grass blades, leaves) would self-shadow in stripes: sample the shadow a little off the surface
  let sh = shadowAt(v.wp + normalize(v.n) * 0.12 * (isLeaf + isBlade), n);
  var c = lighting(base, n, v.wp, v.prm.x, v.prm.y, sh, mat, normalize(v.tng));
  c += base * v.tint.a;
  if (F.misc.z > 0.5 && v.wp.y < F.fogP.z - 0.05) { discard; }
  return vec4f(applyFog(c, v.wp), 1.0);
}

// ---------- water ----------
fn heightAtTex(xz: vec2f) -> f32 {
  let N = F.misc.y; let S = F.misc.x;
  let f = clamp((xz + S * 0.5) / S * N, vec2f(0.0), vec2f(N - 0.001));
  let i = vec2i(floor(f)); let u = fract(f);
  let a = textureLoad(heightTex, i, 0).r; let b = textureLoad(heightTex, i + vec2i(1, 0), 0).r;
  let c = textureLoad(heightTex, i + vec2i(0, 1), 0).r; let d = textureLoad(heightTex, i + vec2i(1, 1), 0).r;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn waveH(p: vec2f, t: f32) -> f32 {
  return sin(p.x * 0.35 + t * 0.9) * 0.5 + sin(p.y * 0.42 - t * 1.1) * 0.4 + sin((p.x + p.y) * 0.8 + t * 1.7) * 0.18
    + (vnoise(p * 0.9 + vec2f(t * 0.4, t * 0.3)) - 0.5) * 0.7 + (vnoise(p * 2.3 - vec2f(t * 0.6, 0.0)) - 0.5) * 0.3;
}
@vertex fn vsWater(i: TIn) -> TOut {
  var o: TOut; o.pos = F.viewProj * vec4f(i.pos, 1.0); o.wp = i.pos; o.n = i.nrm; o.col = i.col.rgb; return o;
}
@fragment fn fsWater(v: TOut) -> @location(0) vec4f {
  let t = F.camPos.w; let p = v.wp.xz; let e = 0.08;
  let h0 = waveH(p, t); let hx = waveH(p + vec2f(e, 0.0), t); let hz = waveH(p + vec2f(0.0, e), t);
  let dist = distance(F.camPos.xyz, v.wp);
  let amp = 0.14 / (1.0 + dist * 0.02);
  var n = normalize(vec3f(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
  // wind ripples: two drifting layers of fine noise perturb the normal, fading with distance
  let ra = 0.05 / (1.0 + dist * 0.06); let q1 = p * 5.0 + vec2f(t * 0.6, t * 0.35); let q2 = p * 11.0 - vec2f(t * 0.4, -t * 0.7);
  let e2 = 0.04;
  let r0 = vnoise(q1) + 0.5 * vnoise(q2);
  let rx = vnoise(q1 + vec2f(e2, 0.0)) + 0.5 * vnoise(q2 + vec2f(e2 * 2.2, 0.0));
  let rz = vnoise(q1 + vec2f(0.0, e2)) + 0.5 * vnoise(q2 + vec2f(0.0, e2 * 2.2));
  n = normalize(n + vec3f(-(rx - r0), 0.0, -(rz - r0)) * ra / e2);
  let depth = max(-heightAtTex(p), 0.0);
  let vd = normalize(F.camPos.xyz - v.wp);
  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, vd), 0.0), 5.0);
  let shallow = vec3f(0.16, 0.66, 0.64); let deep = vec3f(0.02, 0.15, 0.3);
  var body = mix(shallow, deep, smoothstep(0.0, 7.0, depth));
  let sh = shadowAt(v.wp, vec3f(0.0, 1.0, 0.0));
  body *= (0.6 + 0.4 * sh) * (F.sunCol.rgb * 0.55 * max(F.sunDir.y, 0.0) + F.skyTop.rgb * 0.45);
  // planar reflection of the island, rippled by the wave normal
  let ruv = v.pos.xy * F.res.zw + n.xz * vec2f(0.035, 0.035) / (1.0 + dist * 0.02);
  let rs = textureSample(reflTex, linSmp, ruv);
  let reflCol = mix(skyColor(reflect(-vd, n)), rs.rgb, rs.a);
  var c = mix(body, reflCol, fres);
  let h = normalize(vd + F.sunDir.xyz);
  c += F.sunCol.rgb * pow(max(dot(n, h), 0.0), 320.0) * 6.0 * sh;
  c += F.sunCol.rgb * pow(max(dot(n, h), 0.0), 48.0) * 0.25 * sh;
  // light passing through wave crests that face the sun glows turquoise
  c += vec3f(0.06, 0.3, 0.26) * smoothstep(0.0, 0.25, h0) * max(dot(-vd, F.sunDir.xyz) * 0.5 + 0.5, 0.0) * (1.0 - fres) * sh;
  // lacy shore foam: a surging wash line plus a net of bubbly threads that break apart as they spread
  let fn1 = vnoise(p * 2.2 + vec2f(t * 0.5, -t * 0.3));
  let surge = 0.18 + 0.12 * sin(t * 0.9 + p.x * 0.15 + p.y * 0.1);
  let wash = clamp((surge + 0.08 - depth) / 0.1, 0.0, 1.0);
  let lace1 = abs(vnoise(p * 6.0 + vec2f(t * 0.3, t * 0.2)) - 0.5); let lace2 = abs(vnoise(p * 13.0 - vec2f(t * 0.25, 0.0)) - 0.5);
  let net = clamp(1.0 - min(lace1, lace2) * 6.0, 0.0, 1.0);
  let near = clamp((0.9 - depth) / 0.9, 0.0, 1.0);
  let foam = max(wash * (0.75 + 0.25 * fn1), net * near * 0.9);
  c = mix(c, vec3f(1.0), clamp(foam, 0.0, 1.0) * 0.9);
  let alpha = clamp(mix(0.3, 0.95, smoothstep(0.0, 2.4, depth)) + fres * 0.25 + foam, 0.0, 1.0);
  c = applyFog(c, v.wp);
  return vec4f(c * alpha, alpha);
}

// ---------- particles ----------
struct PIn { @builtin(vertex_index) vi: u32, @location(0) ps: vec4f, @location(1) col: vec4f };
struct POut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) @interpolate(flat) ring: f32 };
@vertex fn vsPart(i: PIn) -> POut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[i.vi];
  var wp: vec3f; var ring = 0.0;
  if (i.col.a < 0.0) { ring = 1.0; wp = i.ps.xyz + vec3f(c.x, 0.0, c.y) * i.ps.w; }
  else { wp = i.ps.xyz + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * i.ps.w; }
  var o: POut; o.pos = F.viewProj * vec4f(wp, 1.0); o.uv = c; o.col = vec4f(i.col.rgb, abs(i.col.a)); o.ring = ring; return o;
}
@fragment fn fsPart(v: POut) -> @location(0) vec4f {
  let r = length(v.uv);
  var a: f32;
  if (v.ring > 0.5) { a = smoothstep(1.0, 0.86, r) * smoothstep(0.55, 0.86, r); }
  else { a = clamp(1.0 - r, 0.0, 1.0); a = a * a * (3.0 - 2.0 * a); }
  let al = a * v.col.a;
  return vec4f(v.col.rgb * al, al);
}

// ---------- debug lines ----------
struct LIn { @location(0) pos: vec3f, @location(1) col: vec4f };
struct LOut { @builtin(position) pos: vec4f, @location(0) col: vec4f };
@vertex fn vsLine(i: LIn) -> LOut { var o: LOut; o.pos = F.viewProj * vec4f(i.pos, 1.0); o.col = i.col; return o; }
@fragment fn fsLine(v: LOut) -> @location(0) vec4f { return vec4f(v.col.rgb * 1.6, 1.0); }
@fragment fn fsTrail(v: LOut) -> @location(0) vec4f { return vec4f(v.col.rgb * v.col.a, v.col.a); }
`;

const WGSL_SHADOW = WGSL_COMMON + /* wgsl */`
@vertex fn vsShadowMesh(i: VIn) -> @builtin(position) vec4f { return F.lightVP * vec4f(meshWorld(i), 1.0); }
@vertex fn vsShadowTerrain(@location(0) pos: vec3f) -> @builtin(position) vec4f { return F.lightVP * vec4f(pos, 1.0); }
@vertex fn vsShadowMesh2(i: VIn) -> @builtin(position) vec4f { return F.lightVP2 * vec4f(meshWorld(i), 1.0); }
@vertex fn vsShadowTerrain2(@location(0) pos: vec3f) -> @builtin(position) vec4f { return F.lightVP2 * vec4f(pos, 1.0); }
`;

const WGSL_POST = /* wgsl */`
struct FOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> FOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: FOut; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(p.x, 1.0 - p.y); return o;
}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@fragment fn fsBright(v: FOut) -> @location(0) vec4f {
  let t = 1.0 / vec2f(textureDimensions(src));
  var c = textureSample(src, smp, v.uv + vec2f(-t.x, -t.y)).rgb + textureSample(src, smp, v.uv + vec2f(t.x, -t.y)).rgb
        + textureSample(src, smp, v.uv + vec2f(-t.x, t.y)).rgb + textureSample(src, smp, v.uv + vec2f(t.x, t.y)).rgb;
  c *= 0.25;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(c * smoothstep(1.0, 2.2, l), 1.0);
}
fn blur(uv: vec2f, dir: vec2f) -> vec4f {
  let t = dir / vec2f(textureDimensions(src));
  var w = array<f32, 5>(0.227, 0.1946, 0.1216, 0.054, 0.0162);
  var c = textureSample(src, smp, uv).rgb * w[0];
  for (var i = 1; i < 5; i++) {
    c += textureSample(src, smp, uv + t * f32(i) * 1.6).rgb * w[i];
    c += textureSample(src, smp, uv - t * f32(i) * 1.6).rgb * w[i];
  }
  return vec4f(c, 1.0);
}
@fragment fn fsBlurH(v: FOut) -> @location(0) vec4f { return blur(v.uv, vec2f(1.0, 0.0)); }
@fragment fn fsBlurV(v: FOut) -> @location(0) vec4f { return blur(v.uv, vec2f(0.0, 1.0)); }
fn aces(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0)); }
struct Post { sun: vec4f };
@group(0) @binding(3) var<uniform> PU: Post;
@fragment fn fsFinal(v: FOut) -> @location(0) vec4f {
  // slight chromatic fringe toward the frame edges
  let q = v.uv - 0.5;
  let ca = q * dot(q, q) * 0.012;
  var c = vec3f(textureSample(src, smp, v.uv + ca).r, textureSample(src, smp, v.uv).g, textureSample(src, smp, v.uv - ca).b);
  // unsharp mask: crisper fabric, hair and eyes; clamped so bright edges do not ring
  let tx = 1.0 / vec2f(textureDimensions(src));
  let nb = (textureSample(src, smp, v.uv + vec2f(tx.x, 0.0)).rgb + textureSample(src, smp, v.uv - vec2f(tx.x, 0.0)).rgb
          + textureSample(src, smp, v.uv + vec2f(0.0, tx.y)).rgb + textureSample(src, smp, v.uv - vec2f(0.0, tx.y)).rgb) * 0.25;
  c = max(c + clamp((c - nb) * 0.55, vec3f(-0.08), vec3f(0.08)), vec3f(0.0));
  c += textureSample(bloomTex, smp, v.uv).rgb * 0.6;
  // god rays: march the bright buffer toward the sun; foliage and terrain carve the shafts
  let toSun = PU.sun.xy - v.uv;
  let stp = toSun / 28.0;
  var ruv = v.uv; var decay = 1.0; var rays = vec3f(0.0);
  for (var i = 0; i < 28; i++) {
    ruv += stp;
    rays += textureSample(bloomTex, smp, ruv).rgb * decay;
    decay *= 0.93;
  }
  let falloff = 1.0 - smoothstep(0.0, 0.9, length(toSun * vec2f(PU.sun.w, 1.0)));
  c += rays * 0.032 * PU.sun.z * falloff * vec3f(1.0, 0.92, 0.78);
  c *= 0.95;
  c = aces(c);
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(l), c, 1.1);
  // split toning: cool shadows, warm highlights
  c *= mix(vec3f(0.94, 0.98, 1.06), vec3f(1.05, 1.0, 0.93), smoothstep(0.05, 0.85, l));
  c *= 1.0 - dot(q, q) * 0.42;
  c = pow(clamp(c, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
  c += (fract(sin(dot(v.pos.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  return vec4f(c, 1.0);
}
`;

const GR = {}; // renderer state
const QUALITY = {
  alta: { label: 'Alta', dpr: 2, maxPix: 2560 * 1440, refl: true, fine: true, grass: true },
  media: { label: 'Media', dpr: 1.25, maxPix: 1920 * 1080, refl: true, fine: true, grass: true },
  baja: { label: 'Baja', dpr: 1, maxPix: 1280 * 720, refl: false, fine: false, grass: false },
};
const FRAME_FLOATS = 104;
const INST_FLOATS = 24;

async function initRenderer(meshes) {
  if (!navigator.gpu) throw new Error('Este navegador no expone navigator.gpu.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No se encontró un adaptador WebGPU compatible.');
  const device = await adapter.requestDevice();
  GR.device = device;
  device.lost.then(info => { if (info.reason !== 'destroyed') showError('El dispositivo gráfico se perdió: ' + info.message + '. Recarga la página para volver a jugar.'); });
  const errors = [];
  device.addEventListener && device.addEventListener('uncapturederror', e => { errors.push(e.error.message); console.error('WebGPU:', e.error.message); });
  GR.errors = errors;
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  Object.assign(GR, { ctx, format });

  const U = GPUBufferUsage;
  const mk = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage: usage | U.COPY_DST }); device.queue.writeBuffer(b, 0, data); return b; };
  const empty = (size, usage) => device.createBuffer({ size, usage: usage | U.COPY_DST });

  // ---- static geometry atlas ----
  const names = Object.keys(meshes);
  let vtot = 0, itot = 0;
  for (const n of names) { vtot += meshes[n].vcount; itot += meshes[n].i.length; }
  const vdata = new Float32Array(vtot * 10), idata = new Uint32Array(itot);
  GR.meshInfo = {};
  let vo = 0, io = 0;
  for (const n of names) {
    const m = meshes[n];
    for (let k = 0; k < m.vcount; k++) {
      vdata.set([m.p[k * 3], m.p[k * 3 + 1], m.p[k * 3 + 2], m.n[k * 3], m.n[k * 3 + 1], m.n[k * 3 + 2], m.c[k * 4], m.c[k * 4 + 1], m.c[k * 4 + 2], m.c[k * 4 + 3]], (vo + k) * 10);
    }
    idata.set(m.i, io);
    GR.meshInfo[n] = { first: io, count: m.i.length, base: vo };
    vo += m.vcount; io += m.i.length;
  }
  GR.meshVB = mk(vdata, U.VERTEX); GR.meshIB = mk(idata, U.INDEX);
  // terrain
  const tm = WORLD.terrainMesh, tv = new Float32Array(tm.vcount * 10);
  for (let k = 0; k < tm.vcount; k++) tv.set([tm.p[k * 3], tm.p[k * 3 + 1], tm.p[k * 3 + 2], tm.n[k * 3], tm.n[k * 3 + 1], tm.n[k * 3 + 2], tm.c[k * 4], tm.c[k * 4 + 1], tm.c[k * 4 + 2], 0], k * 10);
  GR.terrVB = mk(tv, U.VERTEX); GR.terrIB = mk(new Uint32Array(tm.i), U.INDEX); GR.terrCount = tm.i.length;
  // water: a big quad
  const W = 1400;
  GR.waterVB = mk(new Float32Array([-W, 0, -W, 0, 1, 0, 0, 0, 0, 0, W, 0, -W, 0, 1, 0, 0, 0, 0, 0, W, 0, W, 0, 1, 0, 0, 0, 0, 0, -W, 0, W, 0, 1, 0, 0, 0, 0, 0]), U.VERTEX);
  GR.waterIB = mk(new Uint32Array([0, 2, 1, 0, 3, 2]), U.INDEX);
  // skinned hero body, cloth cape and sword trail (dynamic)
  GR.heroVB = empty(HERO.out.byteLength, U.VERTEX); GR.heroIB = mk(HERO.idx, U.INDEX); GR.heroCount = HERO.idx.length;
  GR.capeData = new Float32Array(CAPE.W * CAPE.H * 13);
  const cidx = []; for (let j = 0; j < CAPE.H - 1; j++) for (let i = 0; i < CAPE.W - 1; i++) { const a = j * CAPE.W + i; cidx.push(a, a + 1, a + CAPE.W, a + 1, a + CAPE.W + 1, a + CAPE.W); }
  GR.capeVB = empty(GR.capeData.byteLength, U.VERTEX); GR.capeIB = mk(new Uint32Array(cidx), U.INDEX); GR.capeCount = cidx.length;
  GR.trailData = new Float32Array(16 * 12 * 7);
  GR.trailVB = empty(GR.trailData.byteLength, U.VERTEX);
  // instances
  GR.maxDyn = 1024;
  GR.dynData = new Float32Array(GR.maxDyn * INST_FLOATS);
  GR.dynIB = empty(GR.dynData.byteLength, U.VERTEX);
  GR.staticGroups = buildStaticInstances();
  GR.partData = new Float32Array(MAXP * 8);
  GR.partVB = empty(GR.partData.byteLength, U.VERTEX);
  GR.lineData = new Float32Array(1200 * 7);
  GR.lineVB = empty(GR.lineData.byteLength, U.VERTEX);
  GR.frameData = new Float32Array(FRAME_FLOATS);
  GR.frameUB = empty(FRAME_FLOATS * 4, U.UNIFORM);

  // heightmap texture for the water's depth colouring
  const N1 = WORLD.n + 1;
  GR.heightTex = device.createTexture({ size: [N1, N1], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: GR.heightTex }, WORLD.H, { bytesPerRow: N1 * 4 }, [N1, N1]);
  GR.shadowTex = device.createTexture({ size: [2048, 2048], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  GR.shadowView = GR.shadowTex.createView();
  // second, tight cascade around the hero for crisp self-shadowing (hair on face, cape, folds)
  GR.shadowTex2 = device.createTexture({ size: [1024, 1024], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  GR.shadowView2 = GR.shadowTex2.createView();
  GR.cmpSampler = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
  GR.linSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  // ---- layouts ----
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  GR.sceneBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
    { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
    { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
  ] });
  GR.shadowBGL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: { type: 'uniform' } }] });
  GR.frameUBR = empty(FRAME_FLOATS * 4, U.UNIFORM);
  GR.dummyTex = device.createTexture({ size: [1, 1], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING });
  GR.makeSceneBG = (ub, refl) => device.createBindGroup({ layout: GR.sceneBGL, entries: [
    { binding: 0, resource: { buffer: ub } }, { binding: 1, resource: GR.shadowView },
    { binding: 2, resource: GR.cmpSampler }, { binding: 3, resource: GR.heightTex.createView() }, { binding: 4, resource: GR.shadowView2 },
    { binding: 5, resource: refl }, { binding: 6, resource: GR.linSampler },
  ] });
  GR.sceneBGR = GR.makeSceneBG(GR.frameUBR, GR.dummyTex.createView());
  GR.shadowBG = device.createBindGroup({ layout: GR.shadowBGL, entries: [{ binding: 0, resource: { buffer: GR.frameUB } }] });
  const scenePL = device.createPipelineLayout({ bindGroupLayouts: [GR.sceneBGL] });
  const shadowPL = device.createPipelineLayout({ bindGroupLayouts: [GR.shadowBGL] });

  const sceneMod = device.createShaderModule({ code: WGSL_SCENE });
  const shadowMod = device.createShaderModule({ code: WGSL_SHADOW });
  const postMod = device.createShaderModule({ code: WGSL_POST });
  for (const [name, mod] of [['scene', sceneMod], ['shadow', shadowMod], ['post', postMod]]) {
    if (mod.getCompilationInfo) mod.getCompilationInfo().then(info => { for (const m of info.messages) if (m.type === 'error') { errors.push(name + ': ' + m.message + ' @' + m.lineNum); console.error(name, m.lineNum, m.message); } });
  }

  const vA = { arrayStride: 40, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }] };
  const vH = { arrayStride: 52, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }, { shaderLocation: 9, offset: 40, format: 'float32x3' }] };
  const vI = { arrayStride: INST_FLOATS * 4, stepMode: 'instance', attributes: [0, 1, 2, 3, 4, 5].map(k => ({ shaderLocation: 3 + k, offset: k * 16, format: 'float32x4' })) };
  const vP = { arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] };
  const vL = { arrayStride: 28, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x4' }] };
  const HDR = 'rgba16float', MS = { count: 4 };
  const depthOn = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };
  const depthRO = { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less' };
  const premul = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
  const P = (vs, fs, buffers, extra = {}) => device.createRenderPipeline({
    layout: scenePL,
    vertex: { module: sceneMod, entryPoint: vs, buffers },
    fragment: { module: sceneMod, entryPoint: fs, targets: [{ format: HDR, blend: extra.blend }] },
    primitive: { topology: extra.topology || 'triangle-list', cullMode: extra.cull || 'none' },
    depthStencil: extra.depth || depthOn,
    multisample: extra.ms1 ? { count: 1 } : MS,
  });
  GR.pSky = P('vsFull', 'fsSky', [], { depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' } });
  GR.pTerrain = P('vsTerrain', 'fsTerrain', [vA], { cull: 'none' });
  GR.pMesh = P('vsMesh', 'fsMesh', [vA, vI]);
  GR.pHero = P('vsHero', 'fsMesh', [vH]);
  // single-sample variants for the half-res mirrored reflection pass
  GR.pSkyR = P('vsFull', 'fsSky', [], { ms1: true, depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' } });
  GR.pTerrainR = P('vsTerrain', 'fsTerrain', [vA], { ms1: true });
  GR.pMeshR = P('vsMesh', 'fsMesh', [vA, vI], { ms1: true });
  GR.pHeroR = P('vsHero', 'fsMesh', [vH], { ms1: true });
  GR.pWater = P('vsWater', 'fsWater', [vA], { blend: premul, depth: depthRO });
  GR.pPart = P('vsPart', 'fsPart', [vP], { blend: premul, depth: depthRO });
  GR.pTrail = P('vsLine', 'fsTrail', [vL], { blend: premul, depth: depthRO });
  GR.pLine = P('vsLine', 'fsLine', [vL], { topology: 'line-list', depth: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' } });
  const SP = (vs, buffers) => device.createRenderPipeline({
    layout: shadowPL, vertex: { module: shadowMod, entryPoint: vs, buffers },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 },
  });
  GR.psMesh = SP('vsShadowMesh', [vA, vI]);
  GR.psTerrain = SP('vsShadowTerrain', [vA]);
  GR.psHero = SP('vsShadowTerrain', [vH]);
  const SP2 = (vs, buffers) => device.createRenderPipeline({
    layout: shadowPL, vertex: { module: shadowMod, entryPoint: vs, buffers },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 1, depthBiasSlopeScale: 1.5 },
  });
  GR.psMesh2 = SP2('vsShadowMesh2', [vA, vI]); GR.psTerrain2 = SP2('vsShadowTerrain2', [vA]); GR.psHero2 = SP2('vsShadowTerrain2', [vH]);
  const PP = (fs, fmt) => device.createRenderPipeline({ layout: 'auto', vertex: { module: postMod, entryPoint: 'vsFull' }, fragment: { module: postMod, entryPoint: fs, targets: [{ format: fmt }] }, primitive: { topology: 'triangle-list' } });
  GR.pBright = PP('fsBright', HDR); GR.pBlurH = PP('fsBlurH', HDR); GR.pBlurV = PP('fsBlurV', HDR); GR.pFinal = PP('fsFinal', format);
  resizeTargets();
}

function resizeTargets() {
  const d = GR.device;
  const Q = QUALITY[state.quality] || QUALITY.alta;
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  let w = Math.max(2, Math.floor(canvas.clientWidth * dpr)), h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  const maxPix = Q.maxPix, pix = w * h;
  if (pix > maxPix) { const s = Math.sqrt(maxPix / pix); w = Math.floor(w * s); h = Math.floor(h * s); }
  if (GR.w === w && GR.h === h) return;
  GR.w = w; GR.h = h; canvas.width = w; canvas.height = h;
  for (const k of ['msColor', 'msDepth', 'hdr', 'bloomA', 'bloomB', 'reflColor', 'reflDepth']) GR[k] && GR[k].destroy();
  const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING;
  GR.msColor = d.createTexture({ size: [w, h], format: 'rgba16float', sampleCount: 4, usage: RA });
  GR.msDepth = d.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: 4, usage: RA });
  GR.hdr = d.createTexture({ size: [w, h], format: 'rgba16float', usage: RA | TB });
  const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
  GR.reflColor = d.createTexture({ size: [bw, bh], format: 'rgba16float', usage: RA | TB });
  GR.reflDepth = d.createTexture({ size: [bw, bh], format: 'depth24plus', usage: RA });
  GR.sceneBG = GR.makeSceneBG(GR.frameUB, GR.reflColor.createView());
  GR.bloomA = d.createTexture({ size: [bw, bh], format: 'rgba16float', usage: RA | TB });
  GR.bloomB = d.createTexture({ size: [bw, bh], format: 'rgba16float', usage: RA | TB });
  const bg = (pipe, entries) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
  GR.bgBright = bg(GR.pBright, [{ binding: 0, resource: GR.hdr.createView() }, { binding: 1, resource: GR.linSampler }]);
  GR.bgBlurH = bg(GR.pBlurH, [{ binding: 0, resource: GR.bloomA.createView() }, { binding: 1, resource: GR.linSampler }]);
  GR.bgBlurV = bg(GR.pBlurV, [{ binding: 0, resource: GR.bloomB.createView() }, { binding: 1, resource: GR.linSampler }]);
  if (!GR.postUB) GR.postUB = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  GR.bgFinal = bg(GR.pFinal, [{ binding: 0, resource: GR.hdr.createView() }, { binding: 1, resource: GR.linSampler }, { binding: 2, resource: GR.bloomA.createView() }, { binding: 3, resource: { buffer: GR.postUB } }]);
}

// ---------- instance packing ----------
function packInstances(list, out, start = 0) {
  // list: Map meshName -> array of [M(16), tint(4), prm(4)]
  const groups = [];
  let n = start;
  for (const [mesh, items] of list) {
    if (!items.length) continue;
    const first = n;
    for (const it of items) {
      if (n >= out.length / INST_FLOATS) break;
      out.set(it[0], n * INST_FLOATS); out.set(it[1], n * INST_FLOATS + 16); out.set(it[2], n * INST_FLOATS + 20);
      n++;
    }
    groups.push({ mesh, first, count: n - first });
  }
  return { groups, n };
}
class InstList {
  constructor() { this.map = new Map(); }
  add(mesh, M, tint = [1, 1, 1, 0], prm = [0.6, 0, 0, 0]) { if (!this.map.has(mesh)) this.map.set(mesh, []); this.map.get(mesh).push([M, tint, prm]); }
}
function buildStaticInstances() {
  const L = new InstList(), P = WORLD.props;
  for (const t of P.trees) {
    const m = at(t.x, t.y - 0.2, t.z); M4.rotY(m, t.yaw); M4.scale(m, t.s);
    L.add('trunk', m, [1, 1, 1, 0], [0.85, 0, 0, 0]);
    const c = at(t.x, t.y + 3.4 * t.s + 0.6 * t.s, t.z); M4.rotY(c, t.yaw); M4.scale(c, 1.75 * t.s, 1.45 * t.s, 1.75 * t.s);
    L.add('canopy' + t.v, c, [1, 1, 1, 0], [0.8, 0.25, 0.05, 1.0]);
    const c2 = at(t.x + Math.sin(t.yaw) * 0.9 * t.s, t.y + 2.9 * t.s, t.z + Math.cos(t.yaw) * 0.9 * t.s); M4.scale(c2, 1.05 * t.s);
    L.add('canopy' + ((t.v + 1) % 3), c2, [1, 1, 1, 0], [0.8, 0.25, 0.05, 1.0]);
  }
  for (const r of P.rocks) { const m = at(r.x, r.y - 0.15 * r.s, r.z); M4.rotY(m, r.yaw); M4.scale(m, r.s, r.s * 0.8, r.s); L.add('rock' + r.v, m, [1, 1, 1, 0], [0.85, 0.1, 0, 0]); }
  for (const t of P.tufts) { const m = at(t.x, t.y - 0.03, t.z); M4.rotY(m, t.yaw); M4.scale(m, t.s, t.s * (0.8 + 0.5 * hash2(Math.floor(t.x * 7), Math.floor(t.z * 7))), t.s); const k = 0.82 + 0.3 * hash2(Math.floor(t.x * 3), Math.floor(t.z * 3)); L.add('tuft', m, [k, k * (0.95 + 0.1 * hash2(Math.floor(t.z), 5)), k * 0.9, 0], [0.9, 0, 0.12, 0]); }
  for (const f of P.flowers) { const m = at(f.x, f.y - 0.02, f.z); M4.rotY(m, f.yaw); M4.scale(m, f.s); L.add('flower', m, [...f.c, 0.05], [0.8, 0, 0.1, 0]); }
  for (const p of WORLD.pillars) { const m = at(p.x, SHRINE[1] + 0.75, p.z); M4.rotY(m, p.a); L.add('pillar', m, [1, 1, 1, 0], [0.8, 0.1, 0, 0]); }
  for (const [r, top] of [[7.5, 0.27], [7.15, 0.54], [6.8, 0.8]]) { const m = at(SHRINE[0], SHRINE[1] - 0.6, SHRINE[2]); M4.scale(m, r, top + 0.6, r); L.add('shrineStep', m, [1, 1, 1, 0], [0.85, 0, 0, 0]); }
  const ring = at(SHRINE[0], SHRINE[1] + 0.8 + 2.6, SHRINE[2]); M4.rotX(ring, Math.PI / 2);
  L.add('portalRing', ring, [1, 1, 1, 0], [0.6, 0.2, 0, 0]);
  const data = new Float32Array(Math.max(1, [...L.map.values()].reduce((a, b) => a + b.length, 0)) * INST_FLOATS);
  const r = packInstances(L.map, data);
  GR.staticIB = GR.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  GR.device.queue.writeBuffer(GR.staticIB, 0, data);
  GR.shadowSkip = new Set(['tuft', 'flower']);
  return r.groups;
}
