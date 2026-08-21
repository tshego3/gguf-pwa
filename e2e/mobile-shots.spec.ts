import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('/Users/netuser/source/repos/gguf-pwa/e2e/fixtures/stories260K.gguf', import.meta.url));
test.use({ serviceWorkers: 'block', viewport: { width: 360, height: 740 } });

test('mobile shots', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, 'showOpenFilePicker'); });

  await page.goto('/gguf-pwa/#/models');
  await page.screenshot({ path: '/tmp/mobile-models-empty.png', fullPage: true });

  await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
  await page.waitForSelector('[data-testid="installed-entry"]', { timeout: 15000 });
  await page.screenshot({ path: '/tmp/mobile-models-installed.png', fullPage: true });

  await page.goto('/gguf-pwa/#/chat');
  await page.waitForSelector('[data-testid="tier-badge"]', { timeout: 30000 });
  await page.screenshot({ path: '/tmp/mobile-chat-empty.png', fullPage: true });

  await page.getByRole('textbox', { name: 'Message' }).fill('Tell me a short story');
  await page.getByTestId('send-button').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/mobile-chat-streaming.png', fullPage: true });
  await page.waitForSelector('[data-testid="streaming-indicator"]', { state: 'hidden', timeout: 30000 });
  await page.screenshot({ path: '/tmp/mobile-chat-done.png', fullPage: true });

  await page.goto('/gguf-pwa/#/settings');
  await page.waitForSelector('[data-testid="capability-data"]', { timeout: 10000 });
  await page.screenshot({ path: '/tmp/mobile-settings.png', fullPage: true });
});
