import { downloadCatalogModel } from './downloadManager';
import { toUserMessage, type CatalogModel, type DownloadProgress, type EngineError } from '../types';

// App-wide download queue. Downloads previously lived in a component hook,
// so navigating away from Models threw away the progress state of a
// gigabyte-sized transfer that was still running. A service module keeps
// one queue for the whole session, which is what makes this a manager
// rather than a per-screen spinner.
//
// Jobs run strictly one at a time. Parallel gigabyte downloads on a phone
// compete for the same memory and bandwidth the inference engine needs, and
// a deterministic single runner keeps the progress figures honest.

export type DownloadJobStatus = 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';

export interface DownloadJob {
  readonly modelId: string;
  readonly model: CatalogModel;
  readonly status: DownloadJobStatus;
  readonly progress: DownloadProgress | null;
  readonly errorMessage: string | null;
}

let jobs: readonly DownloadJob[] = [];
let isRunning = false;
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();

function emit(): void {
  for (const listener of listeners) listener();
}

function patchJob(modelId: string, patch: Partial<DownloadJob>): void {
  jobs = jobs.map((job) => (job.modelId === modelId ? { ...job, ...patch } : job));
  emit();
}

export function subscribeToDownloads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDownloadJobs(): readonly DownloadJob[] {
  return jobs;
}

export function isDownloadActive(modelId: string): boolean {
  return jobs.some((job) => job.modelId === modelId && (job.status === 'queued' || job.status === 'downloading'));
}

async function runNext(): Promise<void> {
  if (isRunning) return;
  const next = jobs.find((job) => job.status === 'queued');
  if (!next) return;

  isRunning = true;
  const controller = new AbortController();
  controllers.set(next.modelId, controller);
  patchJob(next.modelId, { status: 'downloading', progress: { bytesLoaded: 0, bytesTotal: next.model.bytes } });

  try {
    await downloadCatalogModel(next.model, (progress) => patchJob(next.modelId, { progress }), controller.signal);
    patchJob(next.modelId, { status: 'done', errorMessage: null });
  } catch (error) {
    const engineError = error as EngineError;
    if (engineError?.type === 'aborted') {
      patchJob(next.modelId, { status: 'cancelled', progress: null, errorMessage: null });
    } else {
      // engineError.message carries the type-specific sentence already
      // (set in src/engine/modelManager.ts); toUserMessage is the fallback.
      patchJob(next.modelId, {
        status: 'error',
        errorMessage: engineError?.message || toUserMessage(engineError),
      });
    }
  } finally {
    controllers.delete(next.modelId);
    isRunning = false;
  }

  await runNext();
}

export function enqueueDownload(model: CatalogModel): void {
  if (isDownloadActive(model.id)) return;

  // A finished or failed entry for the same model is replaced rather than
  // duplicated, so retrying does not stack rows in the manager.
  jobs = [
    ...jobs.filter((job) => job.modelId !== model.id),
    { modelId: model.id, model, status: 'queued', progress: null, errorMessage: null },
  ];
  emit();
  void runNext();
}

export function cancelDownload(modelId: string): void {
  const controller = controllers.get(modelId);
  if (controller) {
    controller.abort();
    return;
  }
  // Not started yet: drop it from the queue outright.
  patchJob(modelId, { status: 'cancelled', progress: null });
}

export function dismissDownload(modelId: string): void {
  jobs = jobs.filter((job) => job.modelId !== modelId);
  emit();
}
