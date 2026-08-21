import { expect, test } from '@playwright/test';

const BASE = '/gguf-pwa/';

test.use({ serviceWorkers: 'block' });

// Simulates exactly what real Safari does in Private Browsing: the OPFS
// API is present (so a typeof check alone would miss this) but throws the
// moment it's actually called. Verifies the capability probe's real
// functional check (src/engine/capabilities.ts) catches this and the
// Models screen warns clearly, rather than only failing deep in a
// download or copy attempt.
test('warns clearly when OPFS is present but throws on use, matching Safari Private Browsing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'getDirectory', {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException('The operation failed for an unknown transient reason (e.g. out of memory).', 'UnknownError'),
        ),
    });
  });

  await page.goto(`${BASE}#/models`);
  await expect(page.getByTestId('opfs-broken-banner')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('opfs-broken-banner')).toContainText('Private Browsing');
});
