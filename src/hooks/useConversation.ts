import { useCallback, useEffect, useRef, useState } from 'react';
import * as engine from '../engine';
import type { EngineChatMessage } from '../engine';
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
import { buildPromptWithAttachments } from '../chat/attachments';
import { toUserMessage, type Attachment, type ChatMessage, type EngineError, type GenerationParams } from '../types';

interface ConversationState {
  readonly messages: readonly ChatMessage[];
  readonly systemPrompt: string | null;
  readonly isLoading: boolean;
  readonly isStreaming: boolean;
  // Failure to read the conversation out of IndexedDB. This one owns the
  // transcript's error branch, because with no messages loaded there is
  // nothing else to show.
  readonly errorMessage: string | null;
  // Failure of one generation. Deliberately separate: the transcript is
  // still valid and still on screen, including the partial reply that was
  // just persisted, so this renders as an alert beside it rather than
  // replacing it. Conflating the two wiped a live transcript every time a
  // request failed - rare with a local model, routine with the online API.
  readonly generationErrorMessage: string | null;
}

const INITIAL_STATE: ConversationState = {
  messages: [],
  systemPrompt: null,
  isLoading: true,
  isStreaming: false,
  errorMessage: null,
  generationErrorMessage: null,
};

interface UseConversation {
  readonly state: ConversationState;
  readonly sendMessage: (text: string, attachments?: readonly Attachment[]) => Promise<void>;
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
      setState((prev) => ({ ...prev, isLoading: true, errorMessage: null, generationErrorMessage: null }));
      try {
        const [messages, conversation] = await Promise.all([listMessages(conversationId), getConversation(conversationId)]);
        const systemPrompt = conversation?.systemPrompt ?? null;
        systemPromptRef.current = systemPrompt;
        if (!cancelled) {
          setState({ messages, systemPrompt, isLoading: false, isStreaming: false, errorMessage: null, generationErrorMessage: null });
        }
      } catch {
        if (!cancelled) {
          setState({
            messages: [],
            systemPrompt: null,
            isLoading: false,
            isStreaming: false,
            errorMessage: 'Could not load this conversation.',
            generationErrorMessage: null,
          });
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
    async (
      historyForEngine: readonly ChatMessage[],
      assistantSeq: number,
      conversationIdForWrite: string,
      images?: readonly ArrayBuffer[],
    ): Promise<void> => {
      abortedByUserRef.current = false;
      streamBufferRef.current = '';

      const engineMessages: EngineChatMessage[] = historyForEngine.map((m) => ({ role: m.role, content: m.content }));
      // Images ride on the last user turn only - they belong to the message
      // just sent, and earlier turns never carry bytes because the
      // transcript does not persist them (see AttachmentRef).
      const lastIndex = engineMessages.length - 1;
      const lastTurn = engineMessages[lastIndex];
      if (images && images.length > 0 && lastTurn?.role === 'user') {
        engineMessages[lastIndex] = { ...lastTurn, images };
      }
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
        // reply, and returns to the idle branch with no message set.
        const isAborted = engineError.type === 'aborted';
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          generationErrorMessage: isAborted ? null : engineError.message || toUserMessage(engineError),
          messages: prev.messages.map((m) => (m.seq === assistantSeq ? { ...m, content: streamBufferRef.current, partial: true } : m)),
        }));
      }
    },
    [flushBuffer, params.maxTokens, params.seed, params.temperature, params.topK, params.topP],
  );

  const sendMessage = useCallback(
    async (text: string, attachments: readonly Attachment[] = []) => {
      if (!conversationId || !engineReady || state.isStreaming) return;
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;

      // The transcript keeps what the user typed; the engine receives that
      // plus any extracted document text, so the prompt stays faithful
      // without the transcript filling up with a pasted file.
      const promptText = buildPromptWithAttachments(trimmed, attachments);
      const images = attachments.flatMap((a) => a.images ?? []);
      const attachmentRefs = attachments.map((a) => ({ kind: a.kind, name: a.name }));

      const userSeq = await nextSeq(conversationId);
      const userMessage: ChatMessage = {
        conversationId,
        seq: userSeq,
        role: 'user',
        content: trimmed,
        partial: false,
        createdAt: Date.now(),
        ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
      };
      await appendMessage(userMessage);

      if (userSeq === 0) {
        const titleSource = trimmed || attachmentRefs[0]?.name || 'New conversation';
        const title = titleSource.length > 60 ? `${titleSource.slice(0, 60)}…` : titleSource;
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
        generationErrorMessage: null,
        messages: [...prev.messages, userMessage, assistantMessage],
      }));

      const history = [...state.messages, { ...userMessage, content: promptText }];
      await streamAssistantReply(history, assistantSeq, conversationId, images);
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
      generationErrorMessage: null,
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
