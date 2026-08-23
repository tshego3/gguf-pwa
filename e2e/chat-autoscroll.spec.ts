import { expect, test, type Page } from '@playwright/test';
import { seedRemoteProxy } from './settingsSeed';

const BASE = '/gguf-pwa/';
const PROXY = 'https://gguf-proxy.feeds-pwa.workers.dev/**';
const PROXY_URL = 'https://gguf-proxy.feeds-pwa.workers.dev/';

// Driven through the online API rather than a real model: this spec is
// about scroll behaviour under a long reply, and the keyed proxy is the
// cheapest way to produce one deterministically. Every request is
// intercepted, so nothing here reaches the real Worker.
test.use({ serviceWorkers: 'block' });

const LONG_REPLY = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ${'text '.repeat(14)}`).join('\n\n');

async function scrollDistanceFromBottom(page: Page): Promise<number> {
  return page.getByTestId('transcript-scroller').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
}

// A real wheel gesture, not el.scrollTo(). The feature reacts to the scroll
// event, and WebKit does not reliably emit one for a programmatic scroll
// issued from evaluate() - which made this spec fail against a build that
// works correctly by hand. Driving the mouse tests what the user does.
async function scrollUp(page: Page): Promise<void> {
  await page.getByTestId('transcript-scroller').hover();
  await page.mouse.wheel(0, -4000);
}

async function sendAndWait(page: Page): Promise<void> {
  await page.goto(`${BASE}#/settings`);
  await seedRemoteProxy(page, PROXY_URL);
  await page.goto(`${BASE}#/chat`);
  await page.getByRole('textbox', { name: 'Message' }).fill('Write something long.');
  await page.getByTestId('send-button').click();
  await expect(page.getByText('Paragraph 40.')).toBeAttached({ timeout: 15_000 });
  await expect(page.getByTestId('streaming-indicator')).toBeHidden({ timeout: 15_000 });
}

test.describe('chat auto-scroll', () => {
  // A 40-paragraph reply is a lot of markdown to parse, sanitize and lay
  // out, and each case does that after a full engine activation. The
  // default 30s covers the work but leaves no room for the assertions
  // after it.
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.route(PROXY, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: LONG_REPLY }),
    );
  });

  test('follows a reply that is taller than the viewport', async ({ page }) => {
    await sendAndWait(page);
    // The whole point: the newest text is on screen without the user
    // having touched the scrollbar.
    expect(await scrollDistanceFromBottom(page)).toBeLessThan(64);
    await expect(page.getByTestId('jump-to-latest')).toBeHidden();
  });

  // Scrolling up is a deliberate act - reading back through the reply - and
  // the transcript must not yank itself down out from under it.
  test('stops following when the user scrolls up, and offers a way back', async ({ page }) => {
    await sendAndWait(page);
    await scrollUp(page);

    await expect.poll(() => scrollDistanceFromBottom(page), { timeout: 5_000 }).toBeGreaterThan(64);
    const jump = page.getByTestId('jump-to-latest');
    await expect(jump).toBeVisible();

    await jump.click();
    await expect(jump).toBeHidden();
    await expect.poll(() => scrollDistanceFromBottom(page), { timeout: 5_000 }).toBeLessThan(64);
  });

  // A short conversation has nothing to scroll, so the affordance would be
  // noise. isNearBottom treats content shorter than the viewport as
  // followed; this proves that reaches the UI.
  test('shows no jump affordance on a conversation that fits', async ({ page }) => {
    await page.unroute(PROXY);
    await page.route(PROXY, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'Short.' }));
    await sendAndWaitShort(page);
    await expect(page.getByTestId('jump-to-latest')).toBeHidden();
  });
});

async function sendAndWaitShort(page: Page): Promise<void> {
  await page.goto(`${BASE}#/settings`);
  await seedRemoteProxy(page, PROXY_URL);
  await page.goto(`${BASE}#/chat`);
  await page.getByRole('textbox', { name: 'Message' }).fill('Hi');
  await page.getByTestId('send-button').click();
  await expect(page.getByText('Short.')).toBeVisible({ timeout: 15_000 });
}
