import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogModel } from '../types';

// The queue holds module-level state by design (one queue per session), so
// every test re-imports it fresh rather than sharing a dirty store.
const downloadCatalogModel = vi.fn();

vi.mock('./downloadManager', () => ({
  downloadCatalogModel: (...args: unknown[]) => downloadCatalogModel(...args),
}));

type QueueModule = typeof import('./downloadQueue');

async function freshQueue(): Promise<QueueModule> {
  vi.resetModules();
  return import('./downloadQueue');
}

function model(id: string): CatalogModel {
  return {
    id,
    name: `Model ${id}`,
    repo: 'org/repo',
    files: ['model.gguf'],
    params: '0.6B',
    quant: 'Q4_K_M',
    bytes: 1000,
    contextLength: 4096,
    licence: 'apache-2.0',
    licenceUrl: 'https://example.invalid/licence',
    minDeviceMemoryGb: 2,
  };
}

describe('downloadQueue', () => {
  beforeEach(() => {
    downloadCatalogModel.mockReset();
  });

  it('reports a job as active while it runs and installed once it resolves', async () => {
    let release = (): void => undefined;
    downloadCatalogModel.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));

    expect(queue.isDownloadActive('a')).toBe(true);

    release();
    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('done');
    });
    expect(queue.isDownloadActive('a')).toBe(false);
  });

  it('runs queued downloads one at a time, not in parallel', async () => {
    let concurrent = 0;
    let peak = 0;
    downloadCatalogModel.mockImplementation(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await Promise.resolve();
      concurrent -= 1;
    });

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));
    queue.enqueueDownload(model('b'));

    await vi.waitFor(() => {
      expect(queue.getDownloadJobs().every((job) => job.status === 'done')).toBe(true);
    });
    expect(peak).toBe(1);
    expect(downloadCatalogModel).toHaveBeenCalledTimes(2);
  });

  it('ignores a duplicate enqueue while the same model is already downloading', async () => {
    downloadCatalogModel.mockImplementation(() => new Promise<void>(() => undefined));

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));
    queue.enqueueDownload(model('a'));

    expect(queue.getDownloadJobs()).toHaveLength(1);
    expect(downloadCatalogModel).toHaveBeenCalledTimes(1);
  });

  it('maps an aborted transfer to cancelled rather than to an error', async () => {
    downloadCatalogModel.mockRejectedValue({ type: 'aborted', message: '' });

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));

    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('cancelled');
    });
    expect(queue.getDownloadJobs()[0]?.errorMessage).toBeNull();
  });

  it('surfaces the engine error message on a failed transfer', async () => {
    downloadCatalogModel.mockRejectedValue({ type: 'download', message: 'Download failed.' });

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));

    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('error');
    });
    expect(queue.getDownloadJobs()[0]?.errorMessage).toBe('Download failed.');
  });

  // The bug this covers: cancelDownload only aborted the controller, so the
  // job stayed 'downloading' until the abort propagated. A retry in that
  // window saw an "active" job and was dropped on the floor, leaving the
  // row on CANCELLED with nothing running.
  it('runs a retry queued immediately after a cancel', async () => {
    const attempts: AbortSignal[] = [];
    downloadCatalogModel.mockImplementation((_model: unknown, _onProgress: unknown, signal: AbortSignal) => {
      attempts.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          // wllama rejects some time after the abort, not synchronously.
          setTimeout(() => reject({ type: 'aborted', message: '' }), 0);
        });
      });
    });

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));
    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('downloading');
    });

    queue.cancelDownload('a');
    // Marked cancelled straight away, so a retry in the same tick is not
    // mistaken for an already-active download.
    expect(queue.getDownloadJobs()[0]?.status).toBe('cancelled');

    downloadCatalogModel.mockResolvedValue(undefined);
    queue.enqueueDownload(model('a'));

    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('done');
    });
    expect(attempts).toHaveLength(1);
  });

  // The aborted run settles late. By then the retry owns the row, and the
  // stale catch block must not overwrite it.
  it('does not let a cancelled run overwrite the job that replaced it', async () => {
    // Held on an object rather than a `let`: TypeScript narrows a variable
    // assigned only inside a callback to `never` and then refuses the call.
    const firstRun: { reject?: (reason: unknown) => void } = {};
    downloadCatalogModel.mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        firstRun.reject = reject;
      }),
    );

    const queue = await freshQueue();
    queue.enqueueDownload(model('a'));
    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('downloading');
    });

    queue.cancelDownload('a');
    downloadCatalogModel.mockResolvedValue(undefined);
    queue.enqueueDownload(model('a'));
    expect(queue.getDownloadJobs()[0]?.status).toBe('queued');

    firstRun.reject?.({ type: 'aborted', message: '' });

    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('done');
    });
  });

  it('notifies subscribers as a job progresses', async () => {
    downloadCatalogModel.mockResolvedValue(undefined);

    const queue = await freshQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribeToDownloads(listener);

    queue.enqueueDownload(model('a'));
    await vi.waitFor(() => {
      expect(queue.getDownloadJobs()[0]?.status).toBe('done');
    });

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
