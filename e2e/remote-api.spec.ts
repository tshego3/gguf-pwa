import { expect, test, type Page } from '@playwright/test';

const BASE = '/gguf-pwa/';
const PRIMARY = 'https://text.pollinations.ai/**';
const FALLBACK = 'https://prexzyapis.com/**';

// The online API is the one path that leaves the device, so every request
// here is intercepted. These tests must never reach the real third-party
// services: a suite that depends on someone else's uptime is a flaky
// suite, and hammering a free keyless endpoint from CI is rude.
test.use({ serviceWorkers: 'block' });

async function enableOnlineApi(page: Page): Promise<void> {
  await page.goto(`${BASE}#/settings`);
  await page.getByTestId('remote-enabled-switch').check();
  await expect(page.getByTestId('remote-endpoint-pollinations')).toBeVisible();
  await page.getByTestId('model-switcher').click();
  await page.getByRole('option', { name: 'Online API (no download)' }).click();
}

test.describe('online API backend', () => {
  test('warns before the switch and hides the option until it is on', async ({ page }) => {
    await page.goto(`${BASE}#/settings`);
    await expect(page.getByTestId('remote-privacy-warning')).toBeVisible();
    await expect(page.getByTestId('remote-endpoint-pollinations')).toBeHidden();
  });

  test('streams a reply from the primary endpoint', async ({ page }) => {
    await page.route(PRIMARY, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'Hello from the primary endpoint.' }),
    );

    await enableOnlineApi(page);
    await page.goto(`${BASE}#/chat`);
    await expect(page.getByTestId('remote-badge')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
    await page.getByTestId('send-button').click();
    await expect(page.getByText('Hello from the primary endpoint.')).toBeVisible({ timeout: 15_000 });
  });

  // The whole point of an ordered provider list: a dead primary must be
  // invisible to the user, and the JSON-shaped fallback must be read
  // correctly rather than rendered raw.
  test('falls back to the second endpoint when the first fails', async ({ page }) => {
    await page.route(PRIMARY, (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.route(FALLBACK, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: true, data: { response: 'Hello from the fallback.' } }),
      }),
    );

    await enableOnlineApi(page);
    await page.goto(`${BASE}#/chat`);
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
    await page.getByTestId('send-button').click();
    await expect(page.getByText('Hello from the fallback.')).toBeVisible({ timeout: 15_000 });
  });

  // A provider that answers 200 with a success-shaped body whose reply slot
  // is a failure string (what prexzyapis ai4chat does today) must be
  // treated as a failure, not rendered as the assistant's answer.
  test('rejects a success-shaped failure body and reports an error', async ({ page }) => {
    await page.route(PRIMARY, (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.route(FALLBACK, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: true, data: { response: 'Invalid Request' } }),
      }),
    );

    await enableOnlineApi(page);
    await page.goto(`${BASE}#/chat`);
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
    await page.getByTestId('send-button').click();
    await expect(page.getByText('Invalid Request')).toBeHidden();
    await expect(page.getByTestId('generation-error')).toBeVisible({ timeout: 15_000 });
    // The failure belongs to one turn, so the transcript survives it - the
    // message that was just sent is still on screen.
    await expect(page.getByTestId('transcript-data')).toBeVisible();
    await expect(page.getByTestId('transcript-error')).toBeHidden();
  });

  // Every provider failing is the common offline-ish case, and it must not
  // take the conversation down with it.
  test('keeps the transcript when every provider fails', async ({ page }) => {
    await page.route(PRIMARY, (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.route(FALLBACK, (route) => route.fulfill({ status: 503, body: 'down' }));

    await enableOnlineApi(page);
    await page.goto(`${BASE}#/chat`);
    await page.getByRole('textbox', { name: 'Message' }).fill('Still here?');
    await page.getByTestId('send-button').click();

    await expect(page.getByTestId('generation-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Still here?')).toBeVisible();
    await expect(page.getByTestId('generation-retry-button')).toBeVisible();
  });

  test('refuses an endpoint the content security policy would block', async ({ page }) => {
    await page.goto(`${BASE}#/settings`);
    await page.getByTestId('remote-enabled-switch').check();
    const input = page.getByTestId('remote-endpoint-pollinations');
    await input.fill('https://example.com/{prompt}');
    await input.blur();
    await expect(page.getByText(/Only text\.pollinations\.ai and prexzyapis\.com are allowed/)).toBeVisible();
  });
});
