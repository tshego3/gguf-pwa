import type { Page } from '@playwright/test';

// Bounds generation length so specs run in comparable wall-clock time
// across engines - Firefox's WASM single-thread tier (chosen deliberately
// per the tier-selection rule) is documented as several times slower than
// WebGPU. This only overrides a test fixture's settings, never the app's
// shipped defaults.
export async function seedMaxTokens(page: Page, maxTokens: number): Promise<void> {
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

// Writes the online-API settings straight into IndexedDB, so a spec lands
// on the online backend without walking the Settings UI first. It also
// pins the proxy's address and enabled flag, which Settings has no
// per-provider switch for. loadSettings() merges over DEFAULT_SETTINGS, so
// a partial record here is enough.
export async function seedRemoteProxy(page: Page, proxyUrl: string): Promise<void> {
  await page.evaluate((url) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('gguf-db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(
          {
            remoteEnabled: true,
            activeModelId: 'remote:online',
            remoteProviders: [{ id: 'worker', urlTemplate: url, enabled: true }],
          },
          'app-settings',
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, proxyUrl);
}
