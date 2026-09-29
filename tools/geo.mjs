import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.addInitScript({ path: 'harness.js' });
await p.goto('http://localhost:8766/index.html?v=' + Date.now());
await p.waitForFunction(() => window.__brio, null, { timeout: 90000, polling: 300 });
const r = await p.evaluate(async () => {
  window.__brio.startGame(); await window.__advance(30);
  const tri = (groups) => { const m = {}; let t = 0; for (const g of groups) { const mi = GR.meshInfo[g.mesh]; const n = mi.count / 3 * g.count; t += n; m[g.mesh] = (m[g.mesh] || 0) + n; } return [t, m]; };
  const [st, sm] = tri(GR.staticGroups), [dt, dm] = tri(GR.dynGroups || []);
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + ':' + Math.round(v / 1000) + 'k');
  return { staticTrisK: Math.round(st / 1000), dynTrisK: Math.round(dt / 1000), heroTrisK: Math.round(GR.heroCount / 3000), capeK: Math.round(GR.capeCount / 3000), terrK: Math.round(GR.terrCount / 3000), topStatic: top(sm), topDyn: top(dm), groups: GR.staticGroups.length, dynGroups: (GR.dynGroups||[]).length, heroVerts: HERO && HERO.vcount };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
