import { expect, test } from '@playwright/test';

const BASE = '/gguf-pwa/';

// This suite is about routing and layout, not SW/PWA behavior.
test.use({ serviceWorkers: 'block' });

test.describe('navigation', () => {
  test('loads the app at the base path', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible();
  });

  test('navigates to Models and Settings via the tab bar', async ({ page }) => {
    await page.goto(BASE);

    await page.getByRole('button', { name: 'Models' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}#/models$`));
    await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE}#/settings$`));
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('resolves a deep link to Settings on a hard refresh', async ({ page }) => {
    await page.goto(`${BASE}#/settings`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('reports capability probe data on Settings', async ({ page }) => {
    await page.goto(`${BASE}#/settings`);
    await expect(page.getByTestId('capability-data')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('layout', () => {
  for (const width of [360, 768, 1280]) {
    test(`holds layout at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(BASE);
      await expect(page.locator('body')).toHaveScreenshot(`layout-${width}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
});
