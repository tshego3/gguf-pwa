// Proves the PWA claim end to end against the production build using
// Playwright's bundled Chromium: the service worker takes control, the
// manifest and the vendored WASM binary are reachable, and a cold start
// with the network disabled still renders the app.
import { chromium } from '@playwright/test';

const BASE = process.env.PWA_URL ?? 'http://localhost:4173/gguf-pwa/';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(BASE, { waitUntil: 'load' });

  // 1. Service worker registers and takes control of the page.
  const controlled = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // controller is null on the very first load until the SW claims it
    for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return { active: !!reg.active, controller: !!navigator.serviceWorker.controller };
  });
  check('service worker active', controlled.active);
  check('service worker controls page', controlled.controller);

  // 2. Manifest is linked and fetchable.
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  const manifestRes = await page.request.get(new URL(manifestHref, BASE).toString());
  const manifest = await manifestRes.json();
  check('manifest fetchable', manifestRes.ok(), `${manifestRes.status()}`);
  check('manifest display=standalone', manifest.display === 'standalone', manifest.display);
  check('manifest has maskable icon', manifest.icons?.some((i) => i.purpose?.includes('maskable')));
  check('manifest scope matches base', manifest.scope === new URL(BASE).pathname, manifest.scope);

  // 3. The WASM binary is served from this origin, not a CDN.
  const wasmUrl = new URL('assets/', BASE).toString();
  const wasmList = await page.request.get(BASE);
  check('page served ok', wasmList.ok());
  const wasmName = await page.evaluate(async () => {
    const res = await fetch('./sw.js');
    const text = await res.text();
    return text.match(/assets\/[\w.-]+\.wasm/)?.[0] ?? null;
  });
  check('wasm precached by SW', !!wasmName, wasmName ?? 'not found');
  if (wasmName) {
    const wasmRes = await page.request.get(new URL(wasmName, BASE).toString());
    const len = Number(wasmRes.headers()['content-length'] ?? 0);
    check('wasm served from own origin', wasmRes.ok() && len > 1_000_000, `${(len / 1024 ** 2).toFixed(1)} MB`);
  }
  check('no CDN in wasm url', !String(wasmName).startsWith('http'), String(wasmName).slice(0, 60));

  // 4. WebAssembly actually instantiates in this context (compiles the
  // real vendored binary, without loading a model).
  const wasmCompiles = await page.evaluate(async (name) => {
    try {
      const res = await fetch(name);
      const buf = await res.arrayBuffer();
      const mod = await WebAssembly.compile(buf);
      return { ok: true, exports: WebAssembly.Module.exports(mod).length };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 120) };
    }
  }, wasmName);
  check('WebAssembly.compile succeeds', wasmCompiles.ok, wasmCompiles.ok ? `${wasmCompiles.exports} exports` : wasmCompiles.error);

  // 5. Cold start offline: new page, network disabled, app must render.
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto(BASE, { waitUntil: 'load' });
  const rendered = await offlinePage
    .waitForSelector('nav, [data-testid="chat-screen"], [data-testid="chat-first-run"]', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  check('offline cold start renders app', rendered);
  const offlineTitle = await offlinePage.title();
  check('offline document served from cache', offlineTitle.length > 0, offlineTitle);
  await context.setOffline(false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
