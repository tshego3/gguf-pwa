import { AsyncQueue } from './asyncQueue';
import { probeCapabilities } from './capabilities';
import { estimateTokens, remoteAbort, remoteChat } from './remote';
import { resolveGpuLayers } from './webgpuBudget';
import type { WorkerRequest, WorkerResponse, EngineChatMessage, EngineChatParams } from './protocol';
import type { RemoteProvider } from '../types/remote';
import { TEXT_ONLY_MODALITIES, type EngineCapabilities, type EngineError, type GenerationParams, type ModelModalities } from '../types';

// The public engine interface. Nothing outside src/engine/ may import
// @wllama/wllama directly - everything talks to the worker through this
// file, verified by a grep in CI (P3-T3).

let worker: Worker | null = null;
let nextRequestId = 1;
let isModelLoaded = false;

// Non-null while the online API is the selected backend. It and a loaded
// local model are mutually exclusive: activating either releases the
// other, so "one model resident at a time" still holds and a prompt can
// never be sent to both.
let activeRemoteProviders: readonly RemoteProvider[] | null = null;

interface PendingRequest {
  readonly resolve: (response: WorkerResponse) => void;
  readonly reject: (error: EngineError) => void;
  readonly onToken?: (token: string) => void;
}

const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const entry = pending.get(response.id);
      if (!entry) return;

      if (response.kind === 'chatToken') {
        entry.onToken?.(response.token);
        return;
      }
      if (response.kind === 'loadProgress') {
        return;
      }

      pending.delete(response.id);
      if (response.kind === 'error') {
        entry.reject(response.error);
      } else {
        entry.resolve(response);
      }
    };
  }
  return worker;
}

function send(request: WorkerRequest, onToken?: (token: string) => void): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    pending.set(request.id, { resolve, reject, onToken });
    getWorker().postMessage(request);
  });
}

export async function capabilities(): Promise<EngineCapabilities> {
  return probeCapabilities();
}

export async function loadModel(
  blobs: Blob[],
  caps: EngineCapabilities,
  params: GenerationParams,
): Promise<ModelModalities> {
  const nGpuLayers =
    caps.tier === 'webgpu'
      ? resolveGpuLayers(
          blobs.reduce((sum, b) => sum + b.size, 0),
          caps.webgpuMaxBufferSize,
          caps.webgpuMaxStorageBufferBindingSize,
        )
      : 0;
  const nThreads = caps.tier === 'wasm-mt' ? Math.max(1, caps.hardwareConcurrency) : 1;

  const id = nextRequestId++;
  const request: WorkerRequest = {
    id,
    kind: 'load',
    blobs,
    params: { nCtx: params.nCtx, tier: caps.tier, nGpuLayers, nThreads },
  };

  const response = await send(request);
  isModelLoaded = true;
  activeRemoteProviders = null;
  return response.kind === 'loaded' ? response.modalities : TEXT_ONLY_MODALITIES;
}

// Selects the online API as the active backend. Unloads any resident local
// model first, for the same reason switching between two local models
// does: the device holds one backend at a time and the swap is explicit.
export async function activateRemote(providers: readonly RemoteProvider[]): Promise<void> {
  await unloadModel();
  activeRemoteProviders = providers;
}

export function deactivateRemote(): void {
  activeRemoteProviders = null;
}

export async function unloadModel(): Promise<void> {
  if (!isModelLoaded) return;
  const id = nextRequestId++;
  try {
    await send({ id, kind: 'unload' });
  } finally {
    isModelLoaded = false;
  }
}

export function isLoaded(): boolean {
  return isModelLoaded;
}

// Returns an async stream of tokens, per the engine interface contract.
// Consumed with `for await (const token of chat(...))`.
export function chat(messages: EngineChatMessage[], params: EngineChatParams): AsyncIterable<string> {
  // The online API is stateless and takes no sampling parameters, so
  // `params` is deliberately unused on this branch rather than faked into
  // query string arguments the endpoints do not document.
  if (activeRemoteProviders) return remoteChat(messages, activeRemoteProviders);

  const queue = new AsyncQueue<string>();
  const id = nextRequestId++;

  send({ id, kind: 'chat', messages, params }, (token) => queue.push(token))
    .then(() => queue.end())
    .catch((error: EngineError) => {
      if (error.type === 'aborted') {
        queue.end();
        return;
      }
      queue.fail(error);
    });

  return queue;
}

export function abort(): void {
  if (activeRemoteProviders) {
    remoteAbort();
    return;
  }
  const id = nextRequestId++;
  getWorker().postMessage({ id, kind: 'abort', targetId: 0 } satisfies WorkerRequest);
}

export async function countTokens(text: string): Promise<number> {
  // No tokenizer exists on the online path - there is no local model to
  // ask - so the context meter falls back to a character estimate.
  if (activeRemoteProviders) return estimateTokens(text);

  const id = nextRequestId++;
  const response = await send({ id, kind: 'countTokens', text });
  return response.kind === 'countTokensResult' ? response.count : 0;
}
