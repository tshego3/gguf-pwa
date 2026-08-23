import { expect, test, type Page } from '@playwright/test';
import { seedRemoteProxy } from './settingsSeed';

const BASE = '/gguf-pwa/';
const PRIMARY = 'https://text.pollinations.ai/**';
const FALLBACK = 'https://prexzyapis.com/**';
// The keyed Cloudflare Worker, now a real deployed host. That makes the
// default route in beforeEach load-bearing rather than tidy: without it a
// spec that forgets to intercept would spend the project's own API quota
// on every CI run.
const PROXY = 'https://gguf-proxy.feeds-pwa.workers.dev/**';
const PROXY_URL = 'https://gguf-proxy.feeds-pwa.workers.dev/';

// The online API is the one path that leaves the device, so every request
// here is intercepted. These tests must never reach the real third-party
// services: a suite that depends on someone else's uptime is a flaky
// suite, and hammering a free keyless endpoint from CI is rude.
test.use({ serviceWorkers: 'block' });

// The proxy is index 0 and enabled, so every request in this file would
// reach it first. Answering 502 by default puts each spec in the state it
// actually means to test - the keyed tier exhausted, the keyless pair up -
// and guarantees no test can reach the real Worker. Playwright matches
// routes in reverse registration order, so a route registered inside a test
// overrides this one.
test.beforeEach(async ({ page }) => {
  await page.route(PROXY, (route) =>
    route.fulfill({ status: 502, contentType: 'text/plain', body: 'No upstream provider answered.' }),
  );
});

async function enableOnlineApi(page: Page): Promise<void> {
  await page.goto(`${BASE}#/settings`);
  await page.getByTestId('remote-enabled-switch').check();
  await expect(page.getByTestId('remote-endpoint-pollinations')).toBeVisible();
  await expect(page.getByTestId('remote-endpoint-worker')).toBeVisible();
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
    await expect(page.getByText(/Only .*text\.pollinations\.ai, prexzyapis\.com are allowed/)).toBeVisible();
  });
});

// The keyed proxy is the one provider that POSTs. It sends the real role
// array rather than a flattened {prompt} URL, because a chat-completions
// upstream answers better with roles and because a conversation carrying
// extracted attachment text does not fit in a URL.
test.describe('keyed proxy provider', () => {
  async function useProxy(page: Page): Promise<void> {
    await page.goto(`${BASE}#/settings`);
    await seedRemoteProxy(page, PROXY_URL);
    await page.goto(`${BASE}#/chat`);
  }

  test('posts the conversation as a role array and streams the reply', async ({ page }) => {
    const sent: { method: string; body: string }[] = [];
    await page.route(PROXY, (route) => {
      const request = route.request();
      sent.push({ method: request.method(), body: request.postData() ?? '' });
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'Hello from the proxy.' });
    });

    await useProxy(page);
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
    await page.getByTestId('send-button').click();
    await expect(page.getByText('Hello from the proxy.')).toBeVisible({ timeout: 15_000 });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('POST');
    const parsed = JSON.parse(sent[0]?.body ?? '{}') as { messages?: { role: string; content: string }[] };
    expect(parsed.messages?.at(-1)).toEqual({ role: 'user', content: 'Hello' });
  });

  // The whole point of putting the proxy at index 0: when every keyed
  // provider behind it is out of quota it answers non-2xx, and the keyless
  // endpoints still finish the turn.
  test('falls through to a keyless endpoint when every keyed provider is exhausted', async ({ page }) => {
    // The 502 comes from the default route above - that is the real shape of
    // an exhausted keyed chain, so this asserts it rather than restating it.
    await page.route(PRIMARY, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'Hello from the keyless endpoint.' }),
    );

    await useProxy(page);
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello');
    await page.getByTestId('send-button').click();
    await expect(page.getByText('Hello from the keyless endpoint.')).toBeVisible({ timeout: 15_000 });
  });

  // The proxy re-emits a reasoning model's separate reasoning_content field
  // as <think></think>, which is the marker src/components/thinking.ts
  // already parses - so the trace lands in its own block instead of leaking
  // into the answer's markdown.
  test('renders a proxied reasoning trace as a collapsible block', async ({ page }) => {
    await page.route(PROXY, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '<think>Checking the date.</think>It is Tuesday.',
      }),
    );

    await useProxy(page);
    await page.getByRole('textbox', { name: 'Message' }).fill('What day is it?');
    await page.getByTestId('send-button').click();
    await expect(page.getByText('It is Tuesday.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('thinking-content')).toHaveText('Checking the date.');
  });
});
