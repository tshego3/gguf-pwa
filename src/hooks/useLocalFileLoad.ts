import { useCallback, useState } from 'react';
import { pickAndPersistLocalFiles } from '../models/localFileAccess';
import { copyLocalFilesToOpfs } from '../models/localFileInput';
import { toUserMessage, type EngineError } from '../types';

export type LocalLoadStatus = 'idle' | 'busy' | 'error';

interface LocalFileLoadState {
  readonly status: LocalLoadStatus;
  readonly errorMessage: string | null;
  readonly copyProgressPercent: number | null;
}

interface UseLocalFileLoad {
  readonly state: LocalFileLoadState;
  readonly pickViaFileSystemAccess: () => Promise<void>;
  readonly copyViaOpfs: (files: readonly File[]) => Promise<void>;
}

function deriveModelId(fileName: string): string {
  return `local-${fileName.replace(/\.gguf$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now().toString(36)}`;
}

function deriveDisplayName(fileName: string): string {
  return fileName.replace(/\.gguf$/i, '');
}

// Orchestrates both local-file acquisition paths behind one hook, per the
// "components never call services directly" rule - LocalFileCard only
// renders state and forwards user gestures here.
export function useLocalFileLoad(onInstalled: () => void): UseLocalFileLoad {
  const [state, setState] = useState<LocalFileLoadState>({ status: 'idle', errorMessage: null, copyProgressPercent: null });

  const pickViaFileSystemAccess = useCallback(async () => {
    setState({ status: 'busy', errorMessage: null, copyProgressPercent: null });
    try {
      await pickAndPersistLocalFiles(`local-pick-${Date.now().toString(36)}`, 'Local model');
      setState({ status: 'idle', errorMessage: null, copyProgressPercent: null });
      onInstalled();
    } catch (error) {
      const engineError = error as EngineError;
      if (engineError.type === 'aborted') {
        setState({ status: 'idle', errorMessage: null, copyProgressPercent: null });
        return;
      }
      setState({ status: 'error', errorMessage: engineError.message || toUserMessage(engineError), copyProgressPercent: null });
    }
  }, [onInstalled]);

  const copyViaOpfs = useCallback(
    async (files: readonly File[]) => {
      const first = files[0];
      if (!first) return;

      setState({ status: 'busy', errorMessage: null, copyProgressPercent: 0 });
      try {
        const modelId = deriveModelId(first.name);
        await copyLocalFilesToOpfs(modelId, deriveDisplayName(first.name), files, (_index, progress) => {
          setState((prev) => ({ ...prev, copyProgressPercent: Math.round((progress.bytesWritten / progress.bytesTotal) * 100) }));
        });
        setState({ status: 'idle', errorMessage: null, copyProgressPercent: null });
        onInstalled();
      } catch (error) {
        const engineError = error as EngineError;
        setState({ status: 'error', errorMessage: engineError.message || toUserMessage(engineError), copyProgressPercent: null });
      }
    },
    [onInstalled],
  );

  return { state, pickViaFileSystemAccess, copyViaOpfs };
}
