import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('/Users/netuser/source/repos/gguf-pwa/e2e/fixtures/stories260K.gguf', import.meta.url));
test.use({ serviceWorkers: 'block', viewport: { width: 360, height: 740 } });

test('chat send debug', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, 'showOpenFilePicker'); });
  await page.goto('/gguf-pwa/#/models');
  await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
  await page.waitForSelector('[data-testid="installed-entry"]', { timeout: 15000 });
  await page.goto('/gguf-pwa/#/chat');
  await page.waitForSelector('[data-testid="tier-badge"]', { timeout: 30000 });

  await page.waitForTimeout(1000);
  const comboValue = await page.getByRole('combobox', { name: 'Switch conversation' }).inputValue().catch(() => 'N/A');
  console.log('combo value', comboValue);

  const sendBtnExists = await page.getByTestId('send-button').count();
  console.log('send button count', sendBtnExists);
  const sendBtnDisabled = await page.getByTestId('send-button').isDisabled().catch((e) => String(e));
  console.log('send button disabled?', sendBtnDisabled);

  await page.getByRole('textbox', { name: 'Message' }).fill('Tell me a short story');
  await page.getByTestId('send-button').click();
  await page.waitForTimeout(1500);

  const userMsgCount = await page.getByTestId('message-user').count();
  console.log('user message count after click', userMsgCount);
});
