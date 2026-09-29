import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu'] });
for (const [w, h, name] of [[932, 430, 'mob_land'], [430, 932, 'mob_port']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.addInitScript({ path: 'harness.js' });
  await p.goto('http://localhost:8766/index.html?v=' + Date.now());
  await p.waitForFunction(() => window.__brio, null, { timeout: 90000, polling: 300 });
  await p.evaluate(async () => { window.__brio.startGame(); await window.__advance(60); });
  const url = await p.evaluate(() => window.__grab());
  await p.evaluate((u) => { const im = document.createElement('img'); im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none'; im.src = u; document.body.insertBefore(im, document.getElementById('game')); document.getElementById('game').style.opacity = 0; }, url);
  await p.waitForTimeout(300);
  await p.screenshot({ path: name + '.png' });
  console.log(name, await p.evaluate(() => [state.quality, GR.w, GR.h].join(' ')));
  await ctx.close();
}
await b.close();
