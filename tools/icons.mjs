import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const rays = (n, r0, r1, w, off, op) => Array.from({ length: n }, (_, k) => `<path d="M0 -${r1} L${w} -${r0} L-${w} -${r0} Z" transform="rotate(${off + k * 360 / n})" opacity="${op}"/>`).join('');
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 128 128" width="512" height="512">
<defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#22355c"/><stop offset=".6" stop-color="#0d1426"/><stop offset="1" stop-color="#04060d"/></radialGradient>
<radialGradient id="sg" cx="40%" cy="35%"><stop offset="0" stop-color="#fff6d8"/><stop offset=".5" stop-color="#ffcf6a"/><stop offset="1" stop-color="#a86b12"/></radialGradient></defs>
<rect x="-64" y="-64" width="128" height="128" fill="url(#bg)"/>
<g transform="scale(${pad})"><circle r="56" fill="none" stroke="#c9a35a" stroke-width="2" opacity=".75"/>
<g fill="url(#sg)">${rays(12, 20, 46, 5.5, 0, 1)}${rays(12, 20, 35, 3.2, 15, .85)}</g>
<circle r="18" fill="url(#sg)"/><circle r="18" fill="none" stroke="#6b4a17" stroke-width="1.2"/></g></svg>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
for (const [size, pad, name] of [[512, 0.92, 'icon-512'], [192, 0.92, 'icon-192'], [180, 0.9, 'apple-touch-icon'], [512, 0.72, 'icon-maskable-512']]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0">${svg(pad).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await p.screenshot({ path: `icons/${name}.png`, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
}
await b.close();
