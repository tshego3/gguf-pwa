import { useCallback, useEffect, useState } from 'react';
import { listConversations } from '../db';
import type { Conversation } from '../types';

interface ConversationListState {
  readonly conversations: readonly Conversation[];
  readonly isLoading: boolean;
  readonly refresh: () => Promise<void>;
}

export function useConversationList(): ConversationListState {
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setConversations(await listConversations());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { conversations, isLoading, refresh };
}
