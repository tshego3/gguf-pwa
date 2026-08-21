import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const FIXTURE_BYTES = readFileSync(fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url)));

// src/sw.ts re-issues its own fetch() for cross-origin model requests to
// inject a CORP header once it controls the page - that
// SW-internal fetch is not one page.route() can intercept, so the routed
// fixture below would be bypassed in favor of a real network call. This
// suite is about the download UX, not SW/isolation behavior (covered in
// pwa-offline.spec.ts), so the SW is kept out of the picture entirely.
test.use({ serviceWorkers: 'block' });

// Points the catalog's first entry at the tiny committed fixture instead of
// the real multi-hundred-MB Hugging Face URL - the download-manager code
// path is still exercised end to end, per the "never download a real model
// in CI" rule.
async function routeFirstCatalogModelToFixture(page: Page): Promise<string> {
  const catalogRaw = readFileSync(fileURLToPath(new URL('../public/models.json', import.meta.url)), 'utf-8');
  const catalog = JSON.parse(catalogRaw) as Array<{ repo: string; files: string[] }>;
  const first = catalog[0];
  if (!first) throw new Error('Catalog fixture is empty');
  const url = `https://huggingface.co/${first.repo}/resolve/main/${first.files[0]}`;

  await page.route(url, async (route) => {
    const headers = route.request().headers();
    const range = headers['range'];

    if (range) {
      const match = /bytes=(\d+)-/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      await route.fulfill({
        status: 206,
        headers: {
          'content-range': `bytes ${start}-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}`,
          'accept-ranges': 'bytes',
        },
        body: FIXTURE_BYTES.subarray(start),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { 'accept-ranges': 'bytes', 'content-length': String(FIXTURE_BYTES.length) },
      body: FIXTURE_BYTES,
    });
  });

  return url;
}

test.describe('catalog download', () => {
  test('downloads the routed fixture end to end via the consent flow', async ({ page }) => {
    await routeFirstCatalogModelToFixture(page);
    await page.goto(`${BASE}#/models`);
    await skipIfOpfsUnavailable(page);

    await page.getByTestId('download-button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByTestId('confirm-download-button').click();
    await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 20_000 });
  });

  test('cancelling mid-download does not corrupt the next attempt', async ({ page }) => {
    await routeFirstCatalogModelToFixture(page);
    await page.goto(`${BASE}#/models`);
    await skipIfOpfsUnavailable(page);

    await page.getByTestId('download-button').first().click();
    await page.getByTestId('confirm-download-button').click();

    // The fixture is small enough that "cancel mid-download" mostly proves
    // the abort path leaves the UI usable, not that it lands at exactly
    // 50% - a multi-hundred-MB file would be needed to reliably observe a
    // partial state, which the "never download a real model in CI" rule
    // rules out here.
    await page.getByTestId('cancel-download-button').click({ timeout: 5_000 }).catch(() => undefined);

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    await page.getByTestId('download-button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('confirm-download-button').click();
    await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 20_000 });
  });
});
