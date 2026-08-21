import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));

// Kept out of this suite for the same reason as models-catalog-download.spec.ts:
// this is about acquisition-path UX, not SW/isolation behavior.
test.use({ serviceWorkers: 'block' });

// The highest-value E2E test in the suite per the state-testing skill: it
// exercises the primary acquisition path end to end with no network.
test.describe('local file load', () => {
  test('loads the fixture via setInputFiles and survives a reload', async ({ page }) => {
    // showOpenFilePicker() opens a native OS dialog that Playwright cannot
    // drive (unlike <input type=file>, which setInputFiles() targets
    // directly). Forcing the capability probe to report it as unavailable
    // makes every browser project take the input+OPFS path, which is the
    // only one automatable end to end - the zero-copy File System Access
    // path is covered manually instead (P2-T4's acceptance criteria are
    // explicitly Manual).
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'showOpenFilePicker');
    });

    await page.goto(`${BASE}#/models`);
    await skipIfOpfsUnavailable(page);

    const fileInput = page.getByTestId('local-file-input');
    await fileInput.setInputFiles(FIXTURE);

    await expect(page.getByTestId('installed-models-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('installed-entry')).toContainText('stories260K');

    await page.reload();
    await expect(page.getByTestId('installed-entry')).toContainText('stories260K', { timeout: 10_000 });
  });
});
