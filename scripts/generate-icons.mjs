// Rasterizes the app mark into the PNG sizes iOS and Android actually
// honour, using the Chromium that @playwright/test already vendors - no
// new dependency, and the PNGs are committed so a normal build never
// needs this script.
//
// Why PNGs exist at all when the design rule says "PWA icon is
// favicon.svg": iOS ignores an SVG apple-touch-icon outright. With no
// usable one declared, Safari falls back to /apple-touch-icon.png at the
// ORIGIN root - which on a github.io account is a different project's
// icon. That is the bug this file fixes.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Design tokens, duplicated here only because this runs outside the app
// bundle and cannot import src/theme (Charcoal canvas, Off-White text).
const CANVAS = '#131313';
const TEXT = '#F5F5F5';
const ACCENT = '#FFFFFF';

// `inset` pulls the wordmark inside the maskable safe zone (Android crops
// to a circle of ~80% of the icon). The plain `any` icons and
// apple-touch-icon use a smaller inset, since iOS masks them itself.
function markSvg({ rounded, inset }) {
  const scale = 1 - inset * 2;
  const shape = rounded
    ? `<rect width="512" height="512" rx="112" fill="${CANVAS}"/>`
    : `<rect width="512" height="512" fill="${CANVAS}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${shape}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <text id="wordmark" x="232" y="302" text-anchor="middle" fill="${TEXT}"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="186" font-weight="700" letter-spacing="-9">gguf</text>
    <rect id="caret" fill="${ACCENT}" rx="7"/>
  </g>
</svg>`;
}

// The caret is placed from the rendered text's own bounding box rather
// than a guessed x - a hardcoded offset overlapped the "f" at every font
// fallback that was not the one this was tuned on.
const PLACE_CARET = `
  const text = document.getElementById('wordmark');
  const caret = document.getElementById('caret');
  const box = text.getBBox();
  caret.setAttribute('x', String(box.x + box.width + 22));
  caret.setAttribute('y', String(box.y + box.height * 0.08));
  caret.setAttribute('width', '26');
  caret.setAttribute('height', String(box.height * 0.92));
`;

const targets = [
  { file: 'apple-touch-icon.png', size: 180, rounded: false, inset: 0.06 },
  { file: 'icon-192.png', size: 192, rounded: false, inset: 0.06 },
  { file: 'icon-512.png', size: 512, rounded: false, inset: 0.06 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, inset: 0.18 },
];

const browser = await chromium.launch();
try {
  for (const target of targets) {
    const page = await browser.newPage({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:${CANVAS}}svg{display:block;width:${target.size}px;height:${target.size}px}</style>${markSvg(target)}`,
    );
    await page.evaluate(PLACE_CARET);
    const png = await page.screenshot();
    writeFileSync(join(publicDir, target.file), png);
    console.log(`wrote ${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
    await page.close();
  }

  // The browser favicon keeps its own rounded corners, and is written out
  // with the caret coordinates already resolved so the file is static.
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:512px;height:512px}</style>${markSvg({ rounded: true, inset: 0.06 })}`,
  );
  await page.evaluate(PLACE_CARET);
  const svg = await page.evaluate(() => document.querySelector('svg').outerHTML);
  writeFileSync(join(publicDir, 'favicon.svg'), `${svg}\n`);
  console.log('wrote favicon.svg');
  await page.close();
} finally {
  await browser.close();
}
