import { useCallback, useEffect, useState } from 'react';
import { fetchCatalog } from '../models/catalog';
import type { CatalogModel } from '../types';

interface CatalogState {
  readonly models: readonly CatalogModel[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly refetch: () => void;
}

export function useCatalog(): CatalogState {
  const [models, setModels] = useState<readonly CatalogModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchCatalog()
      .then((result) => {
        if (cancelled) return;
        setModels(result);
        setErrorMessage(null);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setErrorMessage('Could not load the model catalog.');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { models, isLoading, errorMessage, refetch };
}
