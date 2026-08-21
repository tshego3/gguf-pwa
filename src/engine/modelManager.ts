// The published @wllama/wllama@3.6.0 package.json has "main": "index.js",
// but no such file ships in the tarball - only the unbuilt root index.ts and
// the real build under esm/. Importing the bare specifier pulls in
// unbuilt, unstrict TypeScript source and breaks `tsc -b`. Deep-importing
// the actual ESM build works around the upstream packaging defect.
import { ModelManager, ModelValidationStatus, type Model } from '@wllama/wllama/esm/index.js';
import { withOpfsHint, type DownloadProgress, type EngineError } from '../types';

// wllama's ModelManager owns the OPFS-backed download cache, so it lives
// here rather than in src/models/ - the engineering rule reserves
// @wllama/wllama imports to src/engine/ alone (verified by a CI grep, per
// P3-T3). src/models/downloadManager.ts is the layer everything else calls;
// this file is its only wllama-aware dependency.

let manager: ModelManager | null = null;

function getManager(): ModelManager {
  manager ??= new ModelManager({ parallelDownloads: 3, allowOffline: true });
  return manager;
}

export interface DownloadHandle {
  readonly bytes: number;
  readonly open: () => Promise<Blob[]>;
}

function toEngineError(error: unknown): EngineError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { type: 'aborted', message: '' };
  }
  // The rendered message stays user-safe and generic (P7-T3), but the raw
  // cause is otherwise invisible on a device this project has no console
  // access to - logging it is what makes a real-device bug report
  // diagnosable instead of just "download failed."
  console.error('Model download failed:', error);
  return { type: 'download', message: withOpfsHint('Model download failed.', error) };
}

// Downloads (or resumes a partial download of) every shard in `urls`
// sequentially, reporting combined byte progress. wllama's CacheManager
// persists partial downloads to OPFS, so calling this again with the same
// URLs after a killed tab resumes rather than restarting.
export async function downloadModelShards(
  urls: readonly string[],
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadHandle> {
  if (urls.length === 0) throw { type: 'download', message: 'No model URL was provided.' };

  const mgr = getManager();
  const shardTotals = new Array<number>(urls.length).fill(0);
  const shardLoaded = new Array<number>(urls.length).fill(0);
  const models: Model[] = [];

  try {
    // wllama caches each URL as its own OPFS-backed entry; sequential
    // shard-by-shard download keeps peak memory bounded and lets a resume
    // pick up from whichever shard was interrupted, rather than restarting
    // the whole model.
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (!url) continue;

      const model = await mgr.downloadModel(url, {
        signal,
        progressCallback: ({ loaded, total }) => {
          shardLoaded[i] = loaded;
          shardTotals[i] = total;
          onProgress({
            bytesLoaded: shardLoaded.reduce((a, b) => a + b, 0),
            bytesTotal: shardTotals.reduce((a, b) => a + b, 0),
          });
        },
      });
      models.push(model);
    }
  } catch (error) {
    throw toEngineError(error);
  }

  return {
    bytes: shardTotals.reduce((a, b) => a + b, 0),
    open: async () => (await Promise.all(models.map((m) => m.open()))).flat(),
  };
}

// Checks the OPFS cache only - never triggers a network fetch. Used by
// eviction detection, which must not silently start a multi-hundred-MB
// download without the user's explicit consent (P2-T9).
export async function getCachedModelIfValid(urls: readonly string[]): Promise<DownloadHandle | null> {
  const mgr = getManager();
  const cached = await mgr.getModels({ includeInvalid: true });

  const models: Model[] = [];
  for (const url of urls) {
    const match = cached.find((m) => m.url === url);
    if (!match || match.validate() !== ModelValidationStatus.VALID) return null;
    models.push(match);
  }

  return {
    bytes: models.reduce((sum, m) => sum + m.size, 0),
    open: async () => (await Promise.all(models.map((m) => m.open()))).flat(),
  };
}

export async function removeDownloadedModel(urls: readonly string[]): Promise<void> {
  const mgr = getManager();
  const models = await mgr.getModels({ includeInvalid: true });
  for (const url of urls) {
    const match = models.find((m) => m.url === url);
    if (match) await match.remove();
  }
}
