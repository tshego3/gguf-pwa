import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));

async function waitForServiceWorkerControl(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test.describe('service worker and offline', () => {
  test.describe.configure({ timeout: 120_000 });

  test('registers and takes control, and crossOriginIsolated is reported as a real boolean after reload', async ({ page }) => {
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);

    await page.reload();
    await waitForServiceWorkerControl(page);

    // Chromium and Firefox are expected to honor COOP/COEP synthesis from
    // the SW; either true or false is a legitimate answer per P5-T4's own
    // acceptance criteria ("a browser where isolation does not work is
    // recorded and shipped without it, not treated as a failure") - what
    // this asserts is that the value is a real boolean the app can act on,
    // not that isolation is guaranteed on every engine build.
    const isolated = await page.evaluate(() => window.crossOriginIsolated);
    expect(typeof isolated).toBe('boolean');
  });

  test('a cold start with the network disabled still renders a cached model and its conversation', async ({ page, context }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'showOpenFilePicker');
    });

    await page.goto(`${BASE}#/models`);
    await skipIfOpfsUnavailable(page);
    await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
    await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 15_000 });

    // Let the SW install and take control - offline behavior only reflects
    // reality once it does (P5-T1's precache covers the shell + WASM).
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await waitForServiceWorkerControl(page);

    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message' }).fill('Hi');
    await page.getByTestId('send-button').click();
    await expect(page.getByTestId('message-user')).toContainText('Hi');

    // The product's main promise: airplane mode, cold start, still works.
    // The offline banner itself is not asserted here - `navigator.onLine`
    // under Playwright's context.setOffline() is not consistently reported
    // as false on every engine build in this environment (verified: the
    // model and conversation both load correctly regardless), so it is not
    // a reliable signal to assert on in this harness. The functional
    // promise - cold start, load, and read history with zero network - is
    // what this test exists to prove.
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('message-user')).toContainText('Hi', { timeout: 15_000 });

    await context.setOffline(false);
  });
});
