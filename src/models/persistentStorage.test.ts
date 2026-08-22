import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persistentStorage';

function stubPersist(persist: () => Promise<boolean>): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist, persisted: () => Promise.resolve(false) },
  });
}

describe('requestPersistentStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('reports a grant', async () => {
    stubPersist(() => Promise.resolve(true));
    await expect(requestPersistentStorage()).resolves.toBe('granted');
  });

  it('reports a refusal', async () => {
    stubPersist(() => Promise.resolve(false));
    await expect(requestPersistentStorage()).resolves.toBe('denied');
  });

  it('treats a throw as a refusal, not an error', async () => {
    stubPersist(() => Promise.reject(new Error('nope')));
    await expect(requestPersistentStorage()).resolves.toBe('denied');
  });

  // Firefox shows a permission prompt and never settles the promise until
  // the user answers. Awaiting that unbounded froze the local-file copy at
  // 0% forever, so the wait is capped and reported as undecided.
  it('gives up waiting on a prompt nobody answers', async () => {
    stubPersist(() => new Promise<boolean>(() => undefined));
    const pending = requestPersistentStorage();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBe('undecided');
  });

  it('does not give up before the timeout', async () => {
    stubPersist(() => new Promise<boolean>(() => undefined));
    const pending = requestPersistentStorage();
    const settled = vi.fn();
    void pending.then(settled);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
  });

  it('reports a refusal when the browser has no persist() at all', async () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
    await expect(requestPersistentStorage()).resolves.toBe('denied');
  });
});
