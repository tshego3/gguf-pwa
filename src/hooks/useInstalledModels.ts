import { useCallback, useEffect, useState } from 'react';
import { deleteInstalledModel, listInstalledModels } from '../db';
import type { InstalledModel } from '../types';

interface InstalledModelsState {
  readonly models: readonly InstalledModel[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly refresh: () => Promise<void>;
  readonly remove: (modelId: string) => Promise<void>;
}

export function useInstalledModels(): InstalledModelsState {
  const [models, setModels] = useState<readonly InstalledModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await listInstalledModels();
      setModels(list);
    } catch {
      setErrorMessage('Could not read installed models.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (modelId: string) => {
      await deleteInstalledModel(modelId);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { models, isLoading, errorMessage, refresh, remove };
}
