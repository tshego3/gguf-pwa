import { useEffect, useMemo, useState } from 'react';
import { BROWSABLE_REPO, getHuggingFaceModelDetail } from '../models/huggingfaceSearch';
import type { HfGgufFile, HfModelDetail } from '../types';

interface UseGgmlOrgModels {
  readonly detail: HfModelDetail | null;
  readonly files: readonly HfGgufFile[];
  readonly filter: string;
  readonly setFilter: (filter: string) => void;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
}

// Browsing is restricted to one repository by explicit instruction, so the
// whole file list is fetched once and filtered client-side - no per-
// keystroke network request the way a live hub-wide search would need.
export function useGgmlOrgModels(): UseGgmlOrgModels {
  const [detail, setDetail] = useState<HfModelDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getHuggingFaceModelDetail(BROWSABLE_REPO, controller.signal)
      .then((result) => {
        setDetail(result);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage((error as { message?: string }).message ?? 'Could not load the model list.');
        setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const files = useMemo(() => {
    const all = detail?.ggufFiles ?? [];
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((file) => file.name.toLowerCase().includes(needle)) : all;
  }, [detail, filter]);

  return { detail, files, filter, setFilter, isLoading, errorMessage };
}
