import { Alert, Button, Card, Progress, Stack, Text, Title } from '@mantine/core';
import { IconDeviceLaptop } from '@tabler/icons-react';
import type { ChangeEvent, ReactNode } from 'react';
import type { LocalAcquisitionPath } from '../models/acquisitionPath';
import type { LocalLoadStatus } from '../hooks/useLocalFileLoad';

interface LocalFileCardProps {
  readonly path: LocalAcquisitionPath;
  readonly status: LocalLoadStatus;
  readonly errorMessage: string | null;
  readonly copyProgressPercent: number | null;
  readonly onPickViaFileSystemAccess: () => void;
  readonly onFilesChosen: (files: readonly File[]) => void;
}

// Presentational only: receives state as props and forwards user gestures
// via callbacks. The two acquisition mechanisms (native picker vs
// input+OPFS copy) are chosen upstream from the capability probe.
export function LocalFileCard({
  path,
  status,
  errorMessage,
  copyProgressPercent,
  onPickViaFileSystemAccess,
  onFilesChosen,
}: LocalFileCardProps): ReactNode {
  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) onFilesChosen(files);
  }

  return (
    <Card withBorder padding="lg" radius="lg" data-testid="local-file-card">
      <Stack gap="sm">
        <Title order={2} size="h4">
          <IconDeviceLaptop size={18} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          Load from this device
        </Title>
        <Text c="dark.1" size="sm">
          Point at a GGUF file you already have. No download, no waiting.
        </Text>
        {path === 'input-opfs' && (
          <Text c="dark.1" size="xs">
            This browser copies the file into on-device storage - it will use the space twice
            until you delete the original.
          </Text>
        )}

        {status === 'error' && errorMessage && (
          <Alert color="yellow" title="Could not load this file">
            {errorMessage}
          </Alert>
        )}

        {copyProgressPercent !== null && (
          <Progress
            value={copyProgressPercent}
            aria-label="Copy progress" />
        )}

        {path === 'file-system-access' ? (
          <Button onClick={onPickViaFileSystemAccess} loading={status === 'busy'} data-testid="pick-file-button">
            Choose a file
          </Button>
        ) : (
          <Button component="label" loading={status === 'busy'} data-testid="pick-file-button">
            Choose a file
            <input type="file" accept=".gguf" multiple hidden onChange={handleInputChange} data-testid="local-file-input" />
          </Button>
        )}
      </Stack>
    </Card>
  );
}
