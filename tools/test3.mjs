import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const W = +(process.env.W || 960), H = +(process.env.H || 540);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader','--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.addInitScript({ path: 'harness.js' });
const logs = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('RESULTS')) logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await p.goto((process.env.BASE || 'http://localhost:8766/') + (process.env.PAGE || 'index.html'));
await p.waitForFunction(() => window.__brio, null, { timeout: 90000, polling: 300 }).catch(()=>{console.log('NOBOOT', logs.join('\n')); process.exit(1);});
const shot = async (name) => {
  // compose: webgpu frame + DOM overlay screenshot
  const url = await p.evaluate(() => window.__grab());
  fs.writeFileSync(name + '_gpu.png', Buffer.from(url.split(',')[1], 'base64'));
  await p.evaluate((u) => { let im = document.getElementById('__shot'); if (!im) { im = document.createElement('img'); im.id = '__shot'; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none'; document.body.insertBefore(im, document.body.firstChild); } im.src = u; }, url);
  await p.waitForTimeout(100);
  await p.screenshot({ path: name + '.png' });
};
const steps = JSON.parse(process.env.STEPS || fs.readFileSync(process.env.SF||"steps.json","utf8"));
await p.waitForTimeout(1500); await p.evaluate(() => window.__advance(+(new URLSearchParams(location.search).get('f') || 120)));
await shot('s0');
for (const [i, s] of steps.entries()) {
  await p.evaluate(s.js).catch(e => logs.push('STEPERR ' + e.message));
  await p.evaluate((n) => window.__advance(n), s.frames || 60);
  if (s.shot) await shot(s.shot);
}
const info = await p.evaluate(() => { const B = window.__brio; return { errors: B.GR.errors, pos: B.player.pos.map(v => +v.toFixed(2)), hp: B.player.hp, st: B.rig.state, t: +B.state.time.toFixed(2), mode: B.state.mode, orbs: B.stats.orbs }; });
console.log(JSON.stringify(info));
console.log(logs.filter(l => !l.includes('404') && !l.includes('CERT')).slice(0, 25).join('\n'));
await b.close();
