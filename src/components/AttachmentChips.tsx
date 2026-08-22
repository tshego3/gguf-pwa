import { ActionIcon, Group, Pill, Text } from '@mantine/core';
import { IconFileText, IconFileTypePdf, IconPhoto, IconVideo } from '@tabler/icons-react';
import { useRef, type ReactNode } from 'react';
import type { Attachment, AttachmentKind, AttachmentRef } from '../types';

const KIND_ICON: Record<AttachmentKind, typeof IconPhoto> = {
  image: IconPhoto,
  video: IconVideo,
  pdf: IconFileTypePdf,
  text: IconFileText,
};

function KindIcon({ kind }: { readonly kind: AttachmentKind }): ReactNode {
  const Icon = KIND_ICON[kind];
  return <Icon size={13} stroke={1.75} style={{ verticalAlign: 'text-bottom' }} />;
}

interface PendingAttachmentChipsProps {
  readonly attachments: readonly Attachment[];
  readonly onRemove: (id: string) => void;
}

// The composer's own staged attachments, each removable before sending.
export function PendingAttachmentChips({ attachments, onRemove }: PendingAttachmentChipsProps): ReactNode {
  if (attachments.length === 0) return null;

  return (
    <Group gap={6} data-testid="pending-attachments">
      {attachments.map((attachment) => (
        <Pill
          key={attachment.id}
          size="sm"
          withRemoveButton
          onRemove={() => onRemove(attachment.id)}
          removeButtonProps={{ 'aria-label': `Remove ${attachment.name}` }}
        >
          <KindIcon kind={attachment.kind} /> {attachment.name}
        </Pill>
      ))}
    </Group>
  );
}

interface SentAttachmentChipsProps {
  readonly attachments: readonly AttachmentRef[];
}

// The read-only record shown inside a sent message.
export function SentAttachmentChips({ attachments }: SentAttachmentChipsProps): ReactNode {
  if (attachments.length === 0) return null;

  return (
    <Group gap={6} mb={6} data-testid="message-attachments">
      {attachments.map((attachment) => (
        <Text key={`${attachment.kind}-${attachment.name}`} size="xs" c="dark.1">
          <KindIcon kind={attachment.kind} /> {attachment.name}
        </Text>
      ))}
    </Group>
  );
}

interface AttachButtonProps {
  readonly accept: string;
  readonly disabled: boolean;
  readonly isBusy: boolean;
  readonly onFilesChosen: (files: readonly File[]) => void;
}

// A real <button> that forwards its click to a hidden file input, rather
// than an ActionIcon rendered as <label>. aria-label is prohibited on a
// <label> with no role, so the label form had no accessible name at all -
// axe caught it as aria-prohibited-attr, and a screen reader would have
// announced an unnamed control. The button also takes `disabled` directly
// instead of faking it with pointer-events.
export function AttachButton({ accept, disabled, isBusy, onFilesChosen }: AttachButtonProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <ActionIcon
        size={48}
        variant="subtle"
        color="gray"
        aria-label="Attach a file"
        loading={isBusy}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        data-testid="attach-button"
      >
        <IconFileText size={20} stroke={1.75} />
      </ActionIcon>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        disabled={disabled}
        data-testid="attach-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFilesChosen(files);
        }}
      />
    </>
  );
}
