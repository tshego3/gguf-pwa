import { Alert, Button, Loader, Skeleton, Stack, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface TranscriptProps {
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly messages: readonly ChatMessage[];
  readonly isStreaming: boolean;
  readonly onRegenerate: () => void;
  readonly onRetryLoad: () => void;
}

// A transcript is an unbounded list. Rendering all of it forever is the
// most likely path to a dropped frame on a long conversation, so only the
// most recent window renders by default - a simplified stand-in for full
// virtualization (P4-T12), not a library dependency.
const WINDOW_SIZE = 80;

// 4-branch pattern, in order. The transcript stays rendered once messages
// exist - isStreaming never falls this back to the loading branch (P4-T2,
// P4-T3).
export function Transcript({ isLoading, errorMessage, messages, isStreaming, onRegenerate, onRetryLoad }: TranscriptProps): ReactNode {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <Stack gap="sm" data-testid="transcript-loading">
        <Skeleton height={60} radius="lg" />
        <Skeleton height={60} radius="lg" ml="auto" w="70%" />
        <Skeleton height={60} radius="lg" />
      </Stack>
    );
  }

  if (errorMessage) {
    return (
      <Alert color="red" title="Could not load this conversation" data-testid="transcript-error">
        <Stack gap="sm">
          <Text size="sm">{errorMessage}</Text>
          <Button size="xs" onClick={onRetryLoad} w="fit-content">
            Try again
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (messages.length > 0) {
    const hidden = messages.length - WINDOW_SIZE;
    const visible = showAll || hidden <= 0 ? messages : messages.slice(hidden);
    const lastAssistantSeq = [...messages].reverse().find((m) => m.role === 'assistant')?.seq;

    return (
      <Stack gap="md" data-testid="transcript-data" aria-live="polite" aria-relevant="additions">
        {hidden > 0 && !showAll && (
          <Button variant="subtle" size="xs" onClick={() => setShowAll(true)} w="fit-content" mx="auto">
            Show {hidden} earlier messages
          </Button>
        )}
        {visible.map((message) => (
          <MessageBubble
            key={`${message.conversationId}-${message.seq}`}
            message={message}
            isLastAssistant={message.seq === lastAssistantSeq}
            canRegenerate={!isStreaming}
            onRegenerate={onRegenerate}
          />
        ))}
        {isStreaming && (
          <Text size="xs" c="dark.1" data-testid="streaming-indicator">
            <Loader size="xs" style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Generating…
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Stack align="center" py="xl" data-testid="transcript-empty">
      <Text c="dark.1">Send a message to start the conversation.</Text>
    </Stack>
  );
}
