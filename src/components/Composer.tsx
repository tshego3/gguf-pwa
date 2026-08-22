import { ActionIcon, Alert, Group, Stack, Text, Textarea } from '@mantine/core';
import { IconPlayerStop, IconSend } from '@tabler/icons-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ATTACHMENT_ACCEPT, DOCUMENT_ACCEPT, classifyAttachment, createAttachment } from '../chat/attachments';
import type { Attachment, EngineError, ModelModalities } from '../types';
import { AttachButton, PendingAttachmentChips } from './AttachmentChips';
import { ContextMeter } from './ContextMeter';

interface ComposerProps {
  readonly disabled: boolean;
  readonly isStreaming: boolean;
  readonly tokensUsed: number;
  readonly nCtx: number;
  readonly modalities: ModelModalities;
  readonly onSend: (text: string, attachments: readonly Attachment[]) => void;
  readonly onStop: () => void;
}

// Send becomes Stop during generation, and stop stays reachable on every
// viewport without scrolling (P4-T6, design skill's interaction rules).
export function Composer({
  disabled,
  isStreaming,
  tokensUsed,
  nCtx,
  modalities,
  onSend,
  onStop,
}: ComposerProps): ReactNode {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<readonly Attachment[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Text and PDF are prompt text, so any model can take them. Images and
  // video need a vision projector, which the engine reads from the loaded
  // GGUF - so the accept list narrows rather than letting the user attach
  // something that would be silently dropped. Video counts as vision
  // because it is sent as sampled frames.
  const accept = modalities.supportsImage ? ATTACHMENT_ACCEPT : DOCUMENT_ACCEPT;

  async function handleFilesChosen(files: readonly File[]): Promise<void> {
    setIsReadingFiles(true);
    setAttachError(null);
    try {
      const accepted: Attachment[] = [];
      for (const file of files) {
        const kind = classifyAttachment(file);
        if ((kind === 'image' || kind === 'video') && !modalities.supportsImage) {
          setAttachError('This model cannot read images or video. Load a vision model to attach one.');
          continue;
        }
        accepted.push(await createAttachment(file));
      }
      if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
    } catch (error) {
      const engineError = error as EngineError;
      setAttachError(engineError?.message ?? 'That file could not be read.');
    } finally {
      setIsReadingFiles(false);
    }
  }

  function handleSend(): void {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled || isStreaming) return;
    onSend(trimmed, attachments);
    setValue('');
    setAttachments([]);
    setAttachError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

  return (
    <Stack gap={6}>
      <ContextMeter tokensUsed={tokensUsed} nCtx={nCtx} />

      {attachError && (
        <Alert color="yellow" p="xs" withCloseButton onClose={() => setAttachError(null)} data-testid="attach-error">
          {attachError}
        </Alert>
      )}

      {isReadingFiles && (
        <Text size="xs" c="dark.1" data-testid="attach-progress">
          Reading attachment… video is sampled into still frames, which takes a moment.
        </Text>
      )}

      <PendingAttachmentChips
        attachments={attachments}
        onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
      />

      <Group align="flex-end" gap="xs" wrap="nowrap">
        <AttachButton
          accept={accept}
          disabled={disabled}
          isBusy={isReadingFiles}
          onFilesChosen={(files) => void handleFilesChosen(files)}
        />
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
            disabled={!canSend}
            data-testid="send-button"
          >
            <IconSend size={20} stroke={1.75} />
          </ActionIcon>
        )}
      </Group>
    </Stack>
  );
}
