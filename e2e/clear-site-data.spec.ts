import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { skipIfOpfsUnavailable } from './opfsSupport';

const BASE = '/gguf-pwa/';
const FIXTURE = fileURLToPath(new URL('./fixtures/stories260K.gguf', import.meta.url));

test.use({ serviceWorkers: 'block' });

// Answers a real question: what happens if the user clears all site data
// (IndexedDB + OPFS + caches together, as "Clear Website Data" actually
// does) without deleting the model first? Verifies the app recovers
// cleanly to the first-run state rather than erroring or showing a
// phantom "installed" entry pointing at bytes that no longer exist.
test('clearing all site data after installing a model recovers to the first-run state, not an error', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  });

  await page.goto(`${BASE}#/models`);
  await skipIfOpfsUnavailable(page);
  await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
  await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 15_000 });

  // Simulates the real "Clear Website Data" action: IndexedDB, OPFS, and
  // the Cache API all wiped together for this origin - not just one store.
  await context.clearCookies();
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(dbs.map((db) => db.name && indexedDB.deleteDatabase(db.name)));

    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) {
      await root.removeEntry(name, { recursive: true });
    }

    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  });

  await page.reload();

  // Graceful first-run state, not a crash and not a phantom "installed" row.
  await expect(page.getByTestId('installed-empty')).toBeVisible({ timeout: 10_000 });

  await page.goto(`${BASE}#/chat`);
  await expect(page.getByTestId('chat-first-run')).toBeVisible({ timeout: 10_000 });
});

// A narrower, also-real scenario: only the OPFS bytes disappear (browser
// storage-pressure eviction, or a narrower "clear cache" than "clear all
// site data") while the IndexedDB record of "this model is installed"
// survives. This is exactly what P2-T12's eviction recovery exists for -
// the stale record must not be presented as usable.
test('losing only the OPFS bytes (not the IndexedDB record) prompts re-acquire, not a crash', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showOpenFilePicker');
  });

  await page.goto(`${BASE}#/models`);
  await skipIfOpfsUnavailable(page);
  await page.getByTestId('local-file-input').setInputFiles(FIXTURE);
  await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 15_000 });

  // IndexedDB (the "stories260K is installed" record) is left untouched -
  // only the actual model bytes in OPFS are removed.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) {
      await root.removeEntry(name, { recursive: true });
    }
  });

  await page.reload();

  // The stale record is still listed on Models (it doesn't know yet) -
  // the point is that opening Chat with it resolves to a clear re-acquire
  // prompt instead of a silent failure or a raw error.
  await expect(page.getByTestId('installed-entry')).toBeVisible({ timeout: 10_000 });

  await page.goto(`${BASE}#/chat`);
  await expect(page.getByText('no longer available on this device')).toBeVisible({ timeout: 15_000 });
});
