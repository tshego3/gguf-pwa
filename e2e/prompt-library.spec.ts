import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));

test.use({ serviceWorkers: 'block' });

test.describe('prompt library (P6-C1)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'showOpenFilePicker');
    });
    await page.goto(`${BASE}#/models`);
    await skipIfOpfsUnavailable(page);
    await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
    await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 15_000 });
  });

  test('a saved system prompt applies to the conversation, persists, and counts toward tokens', async ({ page }) => {
    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });

    const before = await page.getByTestId('context-meter').innerText();
    expect(before).toContain('0 /');

    await page.getByTestId('system-prompt-button').click();
    await page
      .getByTestId('system-prompt-textarea')
      .fill('You are a pirate. Always answer in pirate speak, and keep every reply under ten words.');

    await page.getByPlaceholder('Save as…').fill('Pirate');
    await page.getByRole('button', { name: 'Save to library' }).click();
    await expect(page.getByTestId('prompt-library-entry')).toBeVisible();

    await page.getByTestId('system-prompt-apply').click();

    // The system prompt is not a ChatMessage - it should show up in the
    // context meter immediately, before any message is sent.
    await expect(page.getByTestId('context-meter')).not.toContainText('0 /', { timeout: 10_000 });

    // Persists across reload, per the conversation.
    await page.reload();
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('context-meter')).not.toContainText('0 /', { timeout: 10_000 });
    await page.getByTestId('system-prompt-button').click();
    await expect(page.getByTestId('system-prompt-textarea')).toHaveValue(/pirate/i);
    await page.getByRole('button', { name: 'Apply' }).click();

    // A new conversation does not inherit the previous one's system prompt
    // - it is per-conversation, not global.
    await page.getByRole('button', { name: 'New' }).click();
    await expect(page.getByTestId('context-meter')).toContainText('0 /', { timeout: 10_000 });

    // But the library entry is reusable from the new conversation.
    await page.getByTestId('system-prompt-button').click();
    await expect(page.getByTestId('prompt-library-entry')).toContainText('Pirate');
    await page.getByTestId('prompt-library-entry').click();
    await expect(page.getByTestId('system-prompt-textarea')).toHaveValue(/pirate/i);
  });
});
