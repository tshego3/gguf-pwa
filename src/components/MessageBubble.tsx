import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
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

// Asymmetric by design: only the user's turn gets bubble chrome, right
// aligned on the Elevated tone. The assistant's answer is the thing being
// read, so it runs full width as plain text with no competing container -
// two bordered bubbles facing each other made the transcript look busy and
// left the answer no more prominent than the question.
export function MessageBubble({ message, isLastAssistant, canRegenerate, onRegenerate }: MessageBubbleProps): ReactNode {
  const isUser = message.role === 'user';

  function handleCopy(): void {
    void navigator.clipboard.writeText(message.content);
  }

  const actions = (
    <Group gap={2} justify={isUser ? 'flex-end' : 'flex-start'}>
      {message.partial && (
        <Badge color="yellow" size="xs" mr={4}>
          incomplete
        </Badge>
      )}
      <Tooltip label="Copy">
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Copy message" onClick={handleCopy}>
          <IconCopy size={15} stroke={1.75} />
        </ActionIcon>
      </Tooltip>
      {message.role === 'assistant' && isLastAssistant && canRegenerate && (
        <Tooltip label="Regenerate">
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Regenerate response" onClick={onRegenerate}>
            <IconRefresh size={15} stroke={1.75} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );

  if (isUser) {
    return (
      <Stack gap={4} align="flex-end" data-testid="message-user">
        <Paper
          radius="lg"
          py="sm"
          px="md"
          bg="dark.2"
          style={{ maxWidth: '85%' }}
        >
          <Text size="lg" style={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Text>
        </Paper>
        {actions}
      </Stack>
    );
  }

  const parsed = parseThinking(message.content);

  return (
    <Stack gap={4} data-testid="message-assistant">
      {parsed.thinking !== null && <ThinkingBlock thinking={parsed.thinking} isThinking={parsed.isThinking} />}
      <MarkdownMessage content={parsed.answer || '…'} />
      {actions}
    </Stack>
  );
}
