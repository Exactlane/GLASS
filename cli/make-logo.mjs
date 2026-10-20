// Vector GLASS mark → SVG master + crisp PNGs at any size (extension icons, X avatar, video).
// Usage: node cli/make-logo.mjs   (writes icons/*.png, brand/glass-logo.svg, brand/glass-avatar-*.png)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/claude-0/-home-claude/e73672fa-52ae-5597-9d79-2bca9a66fe40/scratchpad/video/node_modules/playwright-core/index.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);

/** The mark: dark rounded tile, cyan→green magnifying lens with a subtle glint, thick handle. */
export function logoSvg({ size = 1024, tile = true, bg = '#0b0d12' } = {}) {
  const r = 0.22 * size;
  const cx = 0.455 * size, cy = 0.455 * size, R = 0.255 * size, w = 0.082 * size;
  const hx = cx + R * 0.70, hy = cy + R * 0.70, hl = 0.21 * size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4cc9f0"/><stop offset="1" stop-color="#3ecf8e"/></linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#131722"/><stop offset="1" stop-color="#0b0d12"/></linearGradient>
    <radialGradient id="glint" cx="0.35" cy="0.33" r="0.5"><stop offset="0" stop-color="#7ddcff" stop-opacity="0.45"/><stop offset="1" stop-color="#7ddcff" stop-opacity="0"/></radialGradient>
  </defs>
  ${tile ? `<rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>` : ''}
  <circle cx="${cx}" cy="${cy}" r="${R - w * 0.6}" fill="url(#glint)"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="url(#g)" stroke-width="${w}"/>
  <line x1="${hx}" y1="${hy}" x2="${hx + hl}" y2="${hy + hl}" stroke="url(#g)" stroke-width="${w * 1.05}" stroke-linecap="round"/>
</svg>`;
}

async function render(svg, size, out) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, type: 'png' });
  await browser.close();
}

const brand = path.join(root, 'brand');
fs.mkdirSync(brand, { recursive: true });
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
fs.writeFileSync(path.join(brand, 'glass-logo.svg'), logoSvg({ size: 1024 }));
fs.writeFileSync(path.join(brand, 'glass-mark-transparent.svg'), logoSvg({ size: 1024, tile: false }));
for (const s of [16, 32, 48, 128]) await render(logoSvg({ size: s }), s, path.join(root, 'icons', `icon${s}.png`));
for (const s of [400, 1024, 2048]) await render(logoSvg({ size: s }), s, path.join(brand, `glass-avatar-${s}.png`));
await render(logoSvg({ size: 1024, tile: false }), 1024, path.join(brand, 'glass-mark-transparent-1024.png'));
console.log('logo written: brand/ + icons/');
