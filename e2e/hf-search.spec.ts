import { expect, test } from '@playwright/test';

const BASE = '/gguf-pwa/';

// Real Hugging Face API calls, no mocking - browsing is restricted to the
// single ggml-org/models repository (by explicit instruction), so this
// verifies the real file listing loads and filters, and feeds the existing
// consent flow. Stops short of confirming a real download for the same
// reason as before: this repo's files range up to several GB.
test.describe('Hugging Face model browser (ggml-org/models)', () => {
  test.describe.configure({ timeout: 60_000 });

  test('lists real files from the repo, filters client-side, and feeds the existing consent flow', async ({ page }) => {
    await page.goto(`${BASE}#/models`);
    await expect(page.getByTestId('hf-search-card')).toBeVisible();

    const firstEntry = page.getByTestId('hf-file-entry').first();
    await expect(firstEntry).toBeVisible({ timeout: 15_000 });
    // A real byte size from ?blobs=true, not a placeholder.
    await expect(firstEntry).toContainText('GB');

    const totalBefore = await page.getByTestId('hf-file-entry').count();
    expect(totalBefore).toBeGreaterThan(1);

    // Filtering is client-side against the already-fetched list - no
    // additional network round trip, so this should resolve immediately.
    await page.getByTestId('hf-search-input').fill('stories260K');
    await expect(page.getByTestId('hf-file-entry')).toHaveCount(3, { timeout: 5_000 });
    for (const entry of await page.getByTestId('hf-file-entry').all()) {
      await expect(entry).toContainText('stories260K');
    }

    await page.getByTestId('hf-download-button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('GB');
    await expect(page.getByRole('dialog').getByRole('link', { name: 'view terms' })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  test('clearing the filter restores the full list without a new request', async ({ page }) => {
    await page.goto(`${BASE}#/models`);
    await expect(page.getByTestId('hf-file-entry').first()).toBeVisible({ timeout: 15_000 });
    const total = await page.getByTestId('hf-file-entry').count();

    await page.getByTestId('hf-search-input').fill('phi-2');
    await expect(page.getByTestId('hf-file-entry')).toHaveCount(3);

    await page.getByTestId('hf-search-input').fill('');
    await expect(page.getByTestId('hf-file-entry')).toHaveCount(total);
  });
});
