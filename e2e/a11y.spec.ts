import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const ROUTES = ['#/chat', '#/models', '#/settings'];
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));

// Accessibility is checked independent of SW/PWA behavior.
test.use({ serviceWorkers: 'block' });

test.describe('accessibility', () => {
  for (const route of ROUTES) {
    test(`${route} has zero axe violations`, async ({ page }) => {
      await page.goto(`${BASE}${route}`);
      // Screens are dynamically imported, so a bare goto() can hand axe the
      // suspense fallback - which legitimately has no <h1> and reports
      // page-has-heading-one. Wait for the real screen to mount first.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('the system prompt modal (P6-C1) has zero axe violations', async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'showOpenFilePicker');
    });
    await page.goto(`${BASE}#/models`);
    await skipIfOpfsUnavailable(page);
    await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
    await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 15_000 });

    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('system-prompt-button').click();
    await expect(page.getByTestId('system-prompt-textarea')).toBeVisible();
    // Mantine's Modal enter transition briefly renders partially
    // transparent, which axe's screenshot-based contrast check can catch
    // mid-animation as a false positive - let it settle first.
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
