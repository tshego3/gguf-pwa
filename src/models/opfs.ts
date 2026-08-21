import { withOpfsHint } from '../types';

// Thin OPFS wrapper. Model weights that arrive as a plain File (no File
// System Access API - iOS Safari, Firefox) are stream-copied here rather
// than materialized as a whole-file ArrayBuffer, per the memory-discipline
// rule: a single 1 GB ArrayBuffer is the most likely cause of an iOS tab kill.
//
// Writes run in a dedicated worker (opfsWriteWorker.ts) - Safari has no
// FileSystemFileHandle.createWritable() at all, confirmed on real Safari,
// and only supports the synchronous access-handle API, which the spec
// restricts to workers. Reads and deletes stay on the main thread: Safari's
// OPFS reads are reported working there, and this mirrors the exact split
// @wllama/wllama's own OPFS backend uses.

const OPFS_MODELS_DIR = 'gguf-models';

async function getModelsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_MODELS_DIR, { create: true });
}

export interface OpfsCopyProgress {
  readonly bytesWritten: number;
  readonly bytesTotal: number;
}

type WriteResponse =
  | { readonly id: number; readonly kind: 'progress'; readonly bytesWritten: number; readonly bytesTotal: number }
  | { readonly id: number; readonly kind: 'ok' }
  | { readonly id: number; readonly kind: 'error'; readonly message: string };

let writeWorker: Worker | null = null;
let nextRequestId = 1;

function getWriteWorker(): Worker {
  writeWorker ??= new Worker(new URL('./opfsWriteWorker.ts', import.meta.url), { type: 'module' });
  return writeWorker;
}

export async function copyFileToOpfs(
  key: string,
  source: File,
  onProgress?: (progress: OpfsCopyProgress) => void,
): Promise<void> {
  const id = nextRequestId++;
  const worker = getWriteWorker();

  await new Promise<void>((resolve, reject) => {
    function onMessage(event: MessageEvent<WriteResponse>): void {
      const response = event.data;
      if (response.id !== id) return;

      if (response.kind === 'progress') {
        onProgress?.({ bytesWritten: response.bytesWritten, bytesTotal: response.bytesTotal });
        return;
      }
      worker.removeEventListener('message', onMessage);
      if (response.kind === 'ok') {
        resolve();
      } else {
        reject({
          type: 'load',
          message: withOpfsHint('Could not copy the model into on-device storage.', response.message),
          cause: response.message,
        });
      }
    }

    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, kind: 'write', key, file: source });
  });
}

export async function readFileFromOpfs(key: string): Promise<File | null> {
  try {
    const dir = await getModelsDirectory();
    const fileHandle = await dir.getFileHandle(key);
    return await fileHandle.getFile();
  } catch {
    // Missing file is an expected outcome here (eviction, first run) - the
    // caller treats null as "not present", not as an error.
    return null;
  }
}

export async function deleteFileFromOpfs(key: string): Promise<void> {
  try {
    const dir = await getModelsDirectory();
    await dir.removeEntry(key);
  } catch {
    // Already gone - deleting a missing entry is not an error here.
  }
}
