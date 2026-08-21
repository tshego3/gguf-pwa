import { test, type Page } from '@playwright/test';

// The Playwright-bundled WebKit build (verified: 26.5, headed and headless,
// on this development machine) throws UnknownError from
// navigator.storage.getDirectory() itself - OPFS is unusable before any
// app code runs. This is exactly the gap the state-testing skill names
// explicitly ("Playwright's WebKit is not iOS Safari... different OPFS
// quotas"). Every spec that exercises OPFS (both local-file-input and
// catalog-download paths write there) should skip rather than report a
// false failure when this is detected, and rely on the Manual real-Safari
// pass for coverage of this path.
export async function skipIfOpfsUnavailable(page: Page): Promise<void> {
  const opfsAvailable = await page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  });
  test.skip(!opfsAvailable, 'OPFS unavailable in this browser/engine build - see opfsSupport.ts');
}
