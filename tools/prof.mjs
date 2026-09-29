import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.addInitScript({ path: 'harness.js' });
await p.goto((process.env.BASE||'http://localhost:8766/') + 'index.html?v=' + Date.now());
await p.waitForFunction(() => window.__brio, null, { timeout: 90000, polling: 300 });
await p.evaluate(async () => { window.__brio.startGame(); await window.__advance(60); });
const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await p.evaluate(async () => { await window.__advance(181); });
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const counts = new Map();
profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
for (const [id, t] of counts) { const n = byId.get(id); const k = n.callFrame.functionName + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + t); }
const tot = [...self.values()].reduce((a, b) => a + b, 0);
console.log('total ms', (tot / 1000).toFixed(0));
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, t]) => (t / tot * 100).toFixed(1) + '% ' + k).join('\n'));
await b.close();
