import { useCallback, useState } from 'react';
import { enqueueDownload } from '../models/downloadQueue';
import { runPreflightChecks, type PreflightWarning } from '../models/preflight';
import type { CatalogModel } from '../types';

// Owns the consent step only. The transfer itself belongs to the app-wide
// queue in src/models/downloadQueue.ts, so progress survives navigating
// away from Models - this hook hands the model over and gets out of the way.
export type DownloadStatus = 'idle' | 'preflight' | 'awaiting-consent';

interface DownloadState {
  readonly status: DownloadStatus;
  readonly model: CatalogModel | null;
  readonly warnings: readonly PreflightWarning[];
}

const IDLE_STATE: DownloadState = { status: 'idle', model: null, warnings: [] };

interface UseModelDownload {
  readonly state: DownloadState;
  readonly beginPreflight: (model: CatalogModel, deviceMemoryGb: number | null) => Promise<void>;
  readonly confirmAndDownload: () => void;
  readonly dismiss: () => void;
}

export function useModelDownload(): UseModelDownload {
  const [state, setState] = useState<DownloadState>(IDLE_STATE);

  const beginPreflight = useCallback(async (model: CatalogModel, deviceMemoryGb: number | null) => {
    setState({ status: 'preflight', model, warnings: [] });
    const warnings = await runPreflightChecks(model, deviceMemoryGb);
    setState({ status: 'awaiting-consent', model, warnings });
  }, []);

  // Reads state.model directly rather than from a setState updater - an
  // updater must stay pure, and StrictMode invokes it twice.
  const confirmAndDownload = useCallback(() => {
    if (state.model) enqueueDownload(state.model);
    setState(IDLE_STATE);
  }, [state.model]);

  const dismiss = useCallback(() => {
    setState(IDLE_STATE);
  }, []);

  return { state, beginPreflight, confirmAndDownload, dismiss };
}
