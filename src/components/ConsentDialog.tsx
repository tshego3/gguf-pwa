import { Alert, Button, Group, Modal, Progress, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { PreflightWarning } from '../models/preflight';
import type { DownloadStatus } from '../hooks/useModelDownload';
import type { CatalogModel, DownloadProgress } from '../types';

interface ConsentDialogProps {
  readonly model: CatalogModel;
  readonly status: DownloadStatus;
  readonly warnings: readonly PreflightWarning[];
  readonly progress: DownloadProgress | null;
  readonly errorMessage: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatSpec(model: CatalogModel): string {
  return [model.quant, model.params].filter(Boolean).join(', ');
}

// A large download never starts from a single tap: this names the exact
// size, the licence, and every pre-flight warning before the user confirms
// (P2-T9). Warnings never block - they only inform the decision.
export function ConsentDialog({
  model,
  status,
  warnings,
  progress,
  errorMessage,
  onConfirm,
  onCancel,
  onClose,
}: ConsentDialogProps): ReactNode {
  const isDownloading = status === 'downloading';
  const percent = progress && progress.bytesTotal > 0 ? Math.round((progress.bytesLoaded / progress.bytesTotal) * 100) : 0;

  return (
    <Modal opened onClose={onClose} title={model.name} centered>
      <Stack gap="md">
        {!isDownloading && status !== 'done' && (
          <>
            <Text>
              This downloads <strong>{formatGb(model.bytes)}</strong>
              {formatSpec(model) && ` (${formatSpec(model)})`} from Hugging Face.
            </Text>
            <Text size="sm">
              Licence: {model.licence} -{' '}
              <a href={model.licenceUrl} target="_blank" rel="noopener noreferrer">
                view terms
              </a>
            </Text>

            {warnings.map((warning) => (
              <Alert key={warning.kind} color="yellow" title="Before you continue">
                {warning.message}
              </Alert>
            ))}

            {status === 'error' && errorMessage && (
              <Alert color="red" title="Download failed">
                {errorMessage}
              </Alert>
            )}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onConfirm} data-testid="confirm-download-button">
                Download {formatGb(model.bytes)}
              </Button>
            </Group>
          </>
        )}

        {isDownloading && (
          <>
            <Progress value={percent} aria-label="Download progress" size="lg" />
            <Text size="sm" ff="var(--mantine-font-family)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {progress ? `${formatGb(progress.bytesLoaded)} / ${formatGb(progress.bytesTotal)}` : 'Starting…'}
            </Text>
            <Group justify="flex-end">
              <Button variant="subtle" color="red" onClick={onCancel} data-testid="cancel-download-button">
                Cancel download
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
