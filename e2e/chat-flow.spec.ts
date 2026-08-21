import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));

// This suite is about the engine/chat flow, not SW/isolation behavior
// (covered separately) - keeping the SW out avoids any incidental
// interaction with its fetch interception.
test.use({ serviceWorkers: 'block' });

// Bounds generation length so these tests run in comparable wall-clock time
// across engines - Firefox's WASM single-thread tier (chosen deliberately
// per the tier-selection rule) is documented as several times slower than
// WebGPU. This only overrides a test fixture's settings, never the app's
// shipped defaults.
async function seedMaxTokens(page: Page, maxTokens: number): Promise<void> {
  await page.evaluate((tokens) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('gguf-db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ maxTokens: tokens }, 'app-settings');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, maxTokens);
}

// The full loop: load a real (tiny) GGUF via the primary acquisition path,
// then chat against it through the actual worker-hosted wllama engine.
// This is the closest this suite gets to the plan's P0-T2 smoke test
// ("tokens appear on desktop Chrome") - stories260K is the same known-good
// fixture the wllama docs use for exactly this purpose.
test.describe('chat flow', () => {
  // Real WASM model load + inference, not a mock - slower than the default
  // 30s test timeout, especially on Firefox without WebGPU.
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

  test('generates a streamed reply and persists it across reload', async ({ page }) => {
    await seedMaxTokens(page, 24);
    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('message-user')).toContainText('Hello');
    await expect(page.getByTestId('message-assistant')).toBeVisible();

    // Streaming should produce incremental content, not one final block -
    // wait for the streaming indicator to disappear rather than a fixed
    // sleep, since generation speed varies with the CI host.
    await expect(page.getByTestId('streaming-indicator')).toBeHidden({ timeout: 60_000 });

    const assistantText = await page.getByTestId('message-assistant').innerText();
    expect(assistantText.trim().length).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId('message-user')).toContainText('Hello', { timeout: 15_000 });
    await expect(page.getByTestId('message-assistant')).toBeVisible();
  });

  test('stopping mid-generation leaves a partial reply and a usable engine', async ({ page }) => {
    // Needs a wider token budget than the other tests here: too tight a cap
    // lets generation finish before the Stop click's round trip lands, so
    // the message completes normally instead of getting aborted mid-stream.
    await seedMaxTokens(page, 150);
    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Message' }).fill('Tell me a long story');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('stop-button')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('stop-button').click();

    await expect(page.getByTestId('streaming-indicator')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('[data-testid="message-assistant"] >> text=incomplete')).toBeVisible();

    // The engine must still answer the next message with no reload (P3-T8).
    // toHaveCount() polls until the condition holds rather than sampling
    // once - the abort teardown and the second generation both run at
    // variable speed depending on the host, so a single length check taken
    // at an arbitrary moment can catch state mid-transition.
    await page.getByRole('textbox', { name: 'Message' }).fill('Hi again');
    await page.getByTestId('send-button').click();
    await expect(page.getByTestId('message-user')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId('streaming-indicator')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId('message-assistant')).toHaveCount(2, { timeout: 15_000 });
  });

  // Sanitization of assistant markdown is covered deterministically at the
  // component level (src/components/MarkdownMessage.test.tsx) rather than
  // here: stories260K is too small to reliably be prompted into echoing a
  // specific script tag, which would make an E2E assertion on it flaky. The
  // user-message path is covered here since it is trivially deterministic -
  // React escapes text content by default, with no markdown pass involved.
  test('a user message containing a script tag renders as text, not markup', async ({ page }) => {
    await seedMaxTokens(page, 24);
    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('tier-badge')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Message' }).fill('<script>window.__xss = true</script>');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('message-user')).toContainText('<script>');
    const xssRan = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss === true);
    expect(xssRan).toBe(false);
  });
});
