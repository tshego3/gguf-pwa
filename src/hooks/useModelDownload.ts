import { useCallback, useRef, useState } from 'react';
import { downloadCatalogModel } from '../models/downloadManager';
import { runPreflightChecks, type PreflightWarning } from '../models/preflight';
import { toUserMessage, type CatalogModel, type DownloadProgress, type EngineError } from '../types';

export type DownloadStatus = 'idle' | 'preflight' | 'awaiting-consent' | 'downloading' | 'done' | 'error';

interface DownloadState {
  readonly status: DownloadStatus;
  readonly model: CatalogModel | null;
  readonly warnings: readonly PreflightWarning[];
  readonly progress: DownloadProgress | null;
  readonly errorMessage: string | null;
}

const IDLE_STATE: DownloadState = { status: 'idle', model: null, warnings: [], progress: null, errorMessage: null };

interface UseModelDownload {
  readonly state: DownloadState;
  readonly beginPreflight: (model: CatalogModel, deviceMemoryGb: number | null) => Promise<void>;
  readonly confirmAndDownload: () => Promise<void>;
  readonly cancel: () => void;
  readonly dismiss: () => void;
}

export function useModelDownload(onInstalled: () => void): UseModelDownload {
  const [state, setState] = useState<DownloadState>(IDLE_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const beginPreflight = useCallback(async (model: CatalogModel, deviceMemoryGb: number | null) => {
    setState({ status: 'preflight', model, warnings: [], progress: null, errorMessage: null });
    const warnings = await runPreflightChecks(model, deviceMemoryGb);
    setState({ status: 'awaiting-consent', model, warnings, progress: null, errorMessage: null });
  }, []);

  const confirmAndDownload = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'downloading', progress: { bytesLoaded: 0, bytesTotal: prev.model?.bytes ?? 0 } }));

    const model = state.model;
    if (!model) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await downloadCatalogModel(
        model,
        (progress) => setState((prev) => ({ ...prev, progress })),
        controller.signal,
      );
      setState((prev) => ({ ...prev, status: 'done' }));
      onInstalled();
    } catch (error) {
      const engineError = error as EngineError;
      if (engineError.type === 'aborted') {
        setState(IDLE_STATE);
        return;
      }
      // engineError.message carries the type-specific sentence already
      // (set in src/engine/modelManager.ts, sometimes with an actionable
      // hint appended) - toUserMessage() is only the generic fallback for
      // an EngineError that somehow has no message of its own.
      setState((prev) => ({ ...prev, status: 'error', errorMessage: engineError.message || toUserMessage(engineError) }));
    } finally {
      abortRef.current = null;
    }
  }, [state.model, onInstalled]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const dismiss = useCallback(() => {
    setState(IDLE_STATE);
  }, []);

  return { state, beginPreflight, confirmAndDownload, cancel, dismiss };
}
