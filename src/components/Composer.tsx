import { ActionIcon, Group, Stack, Textarea } from '@mantine/core';
import { IconPlayerStop, IconSend } from '@tabler/icons-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ContextMeter } from './ContextMeter';

interface ComposerProps {
  readonly disabled: boolean;
  readonly isStreaming: boolean;
  readonly tokensUsed: number;
  readonly nCtx: number;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
}

// Send becomes Stop during generation, and stop stays reachable on every
// viewport without scrolling (P4-T6, design skill's interaction rules).
export function Composer({ disabled, isStreaming, tokensUsed, nCtx, onSend, onStop }: ComposerProps): ReactNode {
  const [value, setValue] = useState('');

  function handleSend(): void {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <Stack gap={4}>
      <ContextMeter tokensUsed={tokensUsed} nCtx={nCtx} />
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <Textarea
          aria-label="Message"
          placeholder="Send a message…"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autosize
          minRows={1}
          maxRows={10}
          size="md"
          style={{ flex: 1 }}
        />
        {isStreaming ? (
          <ActionIcon
            size={48}
            color="red"
            variant="filled"
            aria-label="Stop generating"
            onClick={onStop}
            data-testid="stop-button"
          >
            <IconPlayerStop size={20} stroke={1.75} />
          </ActionIcon>
        ) : (
          <ActionIcon
            size={48}
            variant="filled"
            aria-label="Send message"
            onClick={handleSend}
            disabled={disabled || value.trim().length === 0}
            data-testid="send-button"
          >
            <IconSend size={20} stroke={1.75} />
          </ActionIcon>
        )}
      </Group>
    </Stack>
  );
}
