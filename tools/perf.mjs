import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.addInitScript({ path: 'harness.js' });
await p.goto((process.env.BASE||'http://localhost:8766/') + 'index.html?v=' + Date.now());
await p.waitForFunction(() => window.__brio, null, { timeout: 90000, polling: 300 });
const r = await p.evaluate(async () => {
  const B = window.__brio; B.startGame();
  await window.__advance(60);
  // CPU cost of sim+buildDynamic without GPU submit: time frames with render skipped
  const t0 = performance.now();
  await window.__advance(241);
  const sim = (performance.now() - t0) / 241;
  const t1 = performance.now(); for (let i = 0; i < 3; i++) { buildDynamic && 0; } const rend = 0;
  const t2 = performance.now(); for (let i = 0; i < 30; i++) { if (typeof buildDynamic === 'function') buildDynamic(); } const dynMs = (performance.now() - t2) / 30;
  return { simMsPerFrame: +sim.toFixed(2), buildDynamicMs: +dynMs.toFixed(2), dyn: GR.dynCount, w: GR.w, h: GR.h };
});
console.log(JSON.stringify(r));
await b.close();
