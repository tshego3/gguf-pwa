import { useCallback, useEffect, useState } from 'react';
import { deletePrompt, listPrompts, savePrompt } from '../db';
import type { SavedPrompt } from '../types';

interface UsePromptLibrary {
  readonly prompts: readonly SavedPrompt[];
  readonly isLoading: boolean;
  readonly save: (name: string, content: string) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
}

export function usePromptLibrary(): UsePromptLibrary {
  const [prompts, setPrompts] = useState<readonly SavedPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setPrompts(await listPrompts());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (name: string, content: string) => {
      await savePrompt({ id: crypto.randomUUID(), name, content, createdAt: Date.now() });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deletePrompt(id);
      await refresh();
    },
    [refresh],
  );

  return { prompts, isLoading, save, remove };
}
