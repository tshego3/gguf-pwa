import { Alert, Button, Card, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { IconDeviceLaptop } from '@tabler/icons-react';
import type { ChangeEvent, ReactNode } from 'react';
import type { LocalAcquisitionPath } from '../models/acquisitionPath';
import type { LocalLoadStatus } from '../hooks/useLocalFileLoad';

interface LocalFileCardProps {
  readonly path: LocalAcquisitionPath;
  readonly status: LocalLoadStatus;
  readonly errorMessage: string | null;
  readonly copyProgressPercent: number | null;
  readonly isStoragePersisted: boolean | null;
  readonly isRequestingStorage: boolean;
  readonly onEnableStorage: () => void;
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
  isStoragePersisted,
  isRequestingStorage,
  onEnableStorage,
  onPickViaFileSystemAccess,
  onFilesChosen,
}: LocalFileCardProps): ReactNode {
  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) onFilesChosen(files);
  }

  // Only the copy path depends on storage surviving: the File System Access
  // path leaves the file where the user put it and stores nothing.
  const showStorageEnabler = path === 'input-opfs' && isStoragePersisted !== true;

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

        {showStorageEnabler && (
          <Alert color="yellow" p="xs" data-testid="local-storage-enabler">
            <Stack gap={6}>
              <Text size="xs">
                This browser has not granted persistent storage, so it can delete the copied model
                later to reclaim space. Granting it first is recommended.
              </Text>
              <Button
                size="compact-xs"
                variant="light"
                w="fit-content"
                loading={isRequestingStorage}
                onClick={onEnableStorage}
                data-testid="local-enable-storage-button"
              >
                Enable storage
              </Button>
            </Stack>
          </Alert>
        )}

        {status === 'error' && errorMessage && (
          <Alert color="yellow" title="Could not load this file">
            {errorMessage}
          </Alert>
        )}

        {copyProgressPercent !== null && (
          <Stack gap={4}>
            <Progress
              value={copyProgressPercent}
              aria-label="Copy progress"
              aria-valuenow={copyProgressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
            <Text c="dark.1" size="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
              Copying into on-device storage - {copyProgressPercent}%
            </Text>
          </Stack>
        )}

        <Group>
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
        </Group>
      </Stack>
    </Card>
  );
}
