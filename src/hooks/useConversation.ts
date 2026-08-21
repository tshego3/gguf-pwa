import { useCallback, useEffect, useRef, useState } from 'react';
import * as engine from '../engine';
import {
  appendMessage,
  createConversation,
  deleteConversation as dbDeleteConversation,
  getConversation,
  listMessages,
  nextSeq,
  updateConversation,
  updateMessage,
} from '../db';
import { toUserMessage, type ChatMessage, type EngineError, type GenerationParams } from '../types';

interface ConversationState {
  readonly messages: readonly ChatMessage[];
  readonly systemPrompt: string | null;
  readonly isLoading: boolean;
  readonly isStreaming: boolean;
  readonly errorMessage: string | null;
}

const INITIAL_STATE: ConversationState = {
  messages: [],
  systemPrompt: null,
  isLoading: true,
  isStreaming: false,
  errorMessage: null,
};

interface UseConversation {
  readonly state: ConversationState;
  readonly sendMessage: (text: string) => Promise<void>;
  readonly stop: () => void;
  readonly regenerate: () => Promise<void>;
  readonly setSystemPrompt: (prompt: string | null) => Promise<void>;
}

function genId(): string {
  return crypto.randomUUID();
}

// Per-conversation message state and streaming. isLoading covers fetching
// history from IndexedDB; isStreaming covers active generation - the two
// are never conflated, so the transcript never disappears mid-reply
// (P4-T2).
export function useConversation(
  conversationId: string | null,
  engineReady: boolean,
  params: GenerationParams,
): UseConversation {
  const [state, setState] = useState<ConversationState>(INITIAL_STATE);
  const abortedByUserRef = useRef(false);
  const streamBufferRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const systemPromptRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (!conversationId) {
        setState(INITIAL_STATE);
        systemPromptRef.current = null;
        return;
      }
      setState((prev) => ({ ...prev, isLoading: true, errorMessage: null }));
      try {
        const [messages, conversation] = await Promise.all([listMessages(conversationId), getConversation(conversationId)]);
        const systemPrompt = conversation?.systemPrompt ?? null;
        systemPromptRef.current = systemPrompt;
        if (!cancelled) setState({ messages, systemPrompt, isLoading: false, isStreaming: false, errorMessage: null });
      } catch {
        if (!cancelled) {
          setState({ messages: [], systemPrompt: null, isLoading: false, isStreaming: false, errorMessage: 'Could not load this conversation.' });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const flushBuffer = useCallback((seq: number) => {
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) => (m.seq === seq ? { ...m, content: streamBufferRef.current } : m)),
    }));
  }, []);

  const streamAssistantReply = useCallback(
    async (historyForEngine: readonly ChatMessage[], assistantSeq: number, conversationIdForWrite: string): Promise<void> => {
      abortedByUserRef.current = false;
      streamBufferRef.current = '';

      const engineMessages = historyForEngine.map((m) => ({ role: m.role, content: m.content }));
      // A per-conversation system prompt (P6-C1) is prepended to every
      // request, not stored as a ChatMessage - it is a property of the
      // conversation, not an entry in its transcript.
      if (systemPromptRef.current) {
        engineMessages.unshift({ role: 'system', content: systemPromptRef.current });
      }

      const scheduleFlush = (): void => {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          flushBuffer(assistantSeq);
        });
      };

      try {
        for await (const token of engine.chat(engineMessages, {
          temperature: params.temperature,
          topK: params.topK,
          topP: params.topP,
          maxTokens: params.maxTokens,
          seed: params.seed,
        })) {
          streamBufferRef.current += token;
          scheduleFlush();
        }

        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        flushBuffer(assistantSeq);

        const partial = abortedByUserRef.current;
        await updateMessage(conversationIdForWrite, assistantSeq, { content: streamBufferRef.current, partial });
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          messages: prev.messages.map((m) => (m.seq === assistantSeq ? { ...m, content: streamBufferRef.current, partial } : m)),
        }));
      } catch (error) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        flushBuffer(assistantSeq);
        await updateMessage(conversationIdForWrite, assistantSeq, { content: streamBufferRef.current, partial: true });

        const engineError = error as EngineError;
        // Abort is not an error - it ends the stream, persists the partial
        // reply, and returns to the idle branch with no errorMessage set.
        const isAborted = engineError.type === 'aborted';
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          errorMessage: isAborted ? null : engineError.message || toUserMessage(engineError),
          messages: prev.messages.map((m) => (m.seq === assistantSeq ? { ...m, content: streamBufferRef.current, partial: true } : m)),
        }));
      }
    },
    [flushBuffer, params.maxTokens, params.seed, params.temperature, params.topK, params.topP],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!conversationId || !engineReady || state.isStreaming) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const userSeq = await nextSeq(conversationId);
      const userMessage: ChatMessage = {
        conversationId,
        seq: userSeq,
        role: 'user',
        content: trimmed,
        partial: false,
        createdAt: Date.now(),
      };
      await appendMessage(userMessage);

      if (userSeq === 0) {
        const title = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
        await updateConversation(conversationId, { title, updatedAt: Date.now() });
      }

      const assistantSeq = userSeq + 1;
      const assistantMessage: ChatMessage = {
        conversationId,
        seq: assistantSeq,
        role: 'assistant',
        content: '',
        partial: false,
        createdAt: Date.now(),
      };
      await appendMessage(assistantMessage);

      setState((prev) => ({
        ...prev,
        isStreaming: true,
        errorMessage: null,
        messages: [...prev.messages, userMessage, assistantMessage],
      }));

      const history = [...state.messages, userMessage];
      await streamAssistantReply(history, assistantSeq, conversationId);
    },
    [conversationId, engineReady, state.isStreaming, state.messages, streamAssistantReply],
  );

  const stop = useCallback(() => {
    abortedByUserRef.current = true;
    engine.abort();
  }, []);

  const regenerate = useCallback(async () => {
    if (!conversationId || !engineReady || state.isStreaming) return;
    const lastAssistantIndex = [...state.messages].reverse().findIndex((m) => m.role === 'assistant');
    if (lastAssistantIndex === -1) return;
    const assistantMessage = state.messages[state.messages.length - 1 - lastAssistantIndex];
    if (!assistantMessage) return;

    const history = state.messages.filter((m) => m.seq < assistantMessage.seq);
    setState((prev) => ({
      ...prev,
      isStreaming: true,
      errorMessage: null,
      messages: prev.messages.map((m) => (m.seq === assistantMessage.seq ? { ...m, content: '', partial: false } : m)),
    }));

    await streamAssistantReply(history, assistantMessage.seq, conversationId);
  }, [conversationId, engineReady, state.isStreaming, state.messages, streamAssistantReply]);

  const setSystemPrompt = useCallback(
    async (prompt: string | null) => {
      if (!conversationId) return;
      systemPromptRef.current = prompt;
      await updateConversation(conversationId, { systemPrompt: prompt, updatedAt: Date.now() });
      setState((prev) => ({ ...prev, systemPrompt: prompt }));
    },
    [conversationId],
  );

  return { state, sendMessage, stop, regenerate, setSystemPrompt };
}

export async function createNewConversation(): Promise<string> {
  const id = genId();
  const now = Date.now();
  await createConversation({ id, title: 'New conversation', modelId: null, systemPrompt: null, createdAt: now, updatedAt: now });
  return id;
}

export async function removeConversation(id: string): Promise<void> {
  await dbDeleteConversation(id);
}
