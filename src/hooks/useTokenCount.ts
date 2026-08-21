import { useEffect, useState } from 'react';
import * as engine from '../engine';
import type { ChatMessage } from '../types';

// Recomputes on message-history changes only, not on every composer
// keystroke - countTokens runs a real (if minimal) inference call in this
// wllama build, so debouncing it to message boundaries keeps the context
// meter honest without costing a token on every character typed.
export function useTokenCount(messages: readonly ChatMessage[], systemPrompt: string | null, engineReady: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!engineReady || (messages.length === 0 && !systemPrompt)) {
      setCount(0);
      return;
    }
    let cancelled = false;
    // The system prompt counts toward the context budget even before the
    // first message is sent, so a user can see its cost while editing it
    // (P6-C1: "appears in the token count").
    const parts = systemPrompt ? [systemPrompt, ...messages.map((m) => m.content)] : messages.map((m) => m.content);
    const text = parts.join('\n');
    engine
      .countTokens(text)
      .then((result) => {
        if (!cancelled) setCount(result);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [messages, systemPrompt, engineReady]);

  return count;
}
