/// <reference lib="webworker" />

// Safari does not implement FileSystemFileHandle.createWritable() - the
// async writable-stream API src/models/opfs.ts used to call directly on the
// main thread. Confirmed against real Safari (not just Playwright's
// WebKit build, which threw the identical DOMException): main-thread OPFS
// writes fail there with "the operation failed for an unknown transient
// reason (e.g. out of memory)". The only write path Safari implements is
// the synchronous FileSystemSyncAccessHandle, and the spec restricts that
// to dedicated workers - this file is that worker. It mirrors the pattern
// @wllama/wllama's own OPFS backend already uses internally for its
// download writes (src/storage/opfs.ts + workers-code/opfs-utils.js in the
// installed package), which is why catalog/Hugging Face downloads do not
// need this same fix: they already run through wllama's worker.

declare const self: DedicatedWorkerGlobalScope;

const OPFS_MODELS_DIR = 'gguf-models';
const CHUNK_BYTES = 8 * 1024 * 1024;

type WriteRequest = { readonly id: number; readonly kind: 'write'; readonly key: string; readonly file: File };
type WriteResponse =
  | { readonly id: number; readonly kind: 'progress'; readonly bytesWritten: number; readonly bytesTotal: number }
  | { readonly id: number; readonly kind: 'ok' }
  | { readonly id: number; readonly kind: 'error'; readonly message: string };

async function getModelsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_MODELS_DIR, { create: true });
}

async function writeFile(request: WriteRequest): Promise<void> {
  const dir = await getModelsDirectory();
  const fileHandle = await dir.getFileHandle(request.key, { create: true });
  const accessHandle = await fileHandle.createSyncAccessHandle();

  try {
    accessHandle.truncate(0);
    let bytesWritten = 0;
    const total = request.file.size;

    while (bytesWritten < total) {
      const chunk = request.file.slice(bytesWritten, bytesWritten + CHUNK_BYTES);
      const buffer = await chunk.arrayBuffer();
      accessHandle.write(new Uint8Array(buffer), { at: bytesWritten });
      bytesWritten += buffer.byteLength;
      self.postMessage({ id: request.id, kind: 'progress', bytesWritten, bytesTotal: total } satisfies WriteResponse);
    }

    accessHandle.flush();
  } finally {
    accessHandle.close();
  }
}

self.onmessage = (event: MessageEvent<WriteRequest>) => {
  const request = event.data;
  if (request.kind !== 'write') return;

  writeFile(request)
    .then(() => self.postMessage({ id: request.id, kind: 'ok' } satisfies WriteResponse))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'OPFS write failed.';
      self.postMessage({ id: request.id, kind: 'error', message } satisfies WriteResponse);
    });
};
