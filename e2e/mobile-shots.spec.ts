import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';
import { seedMaxTokens } from './settingsSeed';

// Generates the phone-width screenshots the mobile-usability pass reads.
// It asserts nothing beyond "every screen reaches its rendered state" -
// the value is the images, and a screen that never gets there fails here
// rather than producing a blank picture.
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));
const SHOTS = 'test-results/mobile-shots';

test.use({ serviceWorkers: 'block', viewport: { width: 360, height: 740 } });

// Real WASM model load and inference, which is several times slower on
// Firefox's single-thread tier than the default 30s test timeout allows.
test.describe.configure({ timeout: 120_000 });

test('mobile shots', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  });

  await page.goto('/gguf-pwa/#/models');
  await skipIfOpfsUnavailable(page);
  await seedMaxTokens(page, 24);
  await page.screenshot({ path: `${SHOTS}/models-empty.png`, fullPage: true });

  await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
  await page.waitForSelector('[data-testid="installed-entry"]', { timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/models-installed.png`, fullPage: true });

  await page.goto('/gguf-pwa/#/chat');
  await page.waitForSelector('[data-testid="tier-badge"]', { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/chat-empty.png`, fullPage: true });

  await page.getByRole('textbox', { name: 'Message' }).fill('Tell me a short story');
  await page.getByTestId('send-button').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/chat-streaming.png`, fullPage: true });
  await page.waitForSelector('[data-testid="streaming-indicator"]', { state: 'hidden', timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/chat-done.png`, fullPage: true });

  await page.goto('/gguf-pwa/#/settings');
  await page.waitForSelector('[data-testid="capability-data"]', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
});
