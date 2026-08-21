import { ActionIcon, Badge, Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconCopy, IconRefresh } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../types';
import { MarkdownMessage } from './MarkdownMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { parseThinking } from './thinking';

interface MessageBubbleProps {
  readonly message: ChatMessage;
  readonly isLastAssistant: boolean;
  readonly canRegenerate: boolean;
  readonly onRegenerate: () => void;
}

export function MessageBubble({ message, isLastAssistant, canRegenerate, onRegenerate }: MessageBubbleProps): ReactNode {
  const isUser = message.role === 'user';

  function handleCopy(): void {
    void navigator.clipboard.writeText(message.content);
  }

  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      data-testid={`message-${message.role}`}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        backgroundColor: isUser ? 'var(--mantine-color-dark-2)' : undefined,
      }}
    >
      {message.role === 'assistant' ? (
        (() => {
          const parsed = parseThinking(message.content);
          return (
            <>
              {parsed.thinking !== null && (
                <ThinkingBlock thinking={parsed.thinking} isThinking={parsed.isThinking} />
              )}
              <MarkdownMessage content={parsed.answer || '…'} />
            </>
          );
        })()
      ) : (
        <Text style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
      )}

      <Group gap="xs" mt="xs" justify="flex-end">
        {message.partial && (
          <Badge color="yellow" size="xs">
            incomplete
          </Badge>
        )}
        <Tooltip label="Copy">
          <ActionIcon variant="subtle" size="sm" aria-label="Copy message" onClick={handleCopy}>
            <IconCopy size={14} stroke={1.75} />
          </ActionIcon>
        </Tooltip>
        {message.role === 'assistant' && isLastAssistant && canRegenerate && (
          <Tooltip label="Regenerate">
            <ActionIcon variant="subtle" size="sm" aria-label="Regenerate response" onClick={onRegenerate}>
              <IconRefresh size={14} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );
}
