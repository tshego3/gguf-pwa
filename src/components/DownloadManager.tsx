import { ActionIcon, Alert, Badge, Button, Card, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { IconDownload, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { DownloadJob } from '../models/downloadQueue';

interface DownloadManagerProps {
  readonly jobs: readonly DownloadJob[];
  readonly onCancel: (modelId: string) => void;
  readonly onDismiss: (modelId: string) => void;
  readonly onRetry: (job: DownloadJob) => void;
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

const STATUS_LABEL: Record<DownloadJob['status'], string> = {
  queued: 'waiting',
  downloading: 'downloading',
  done: 'installed',
  error: 'failed',
  cancelled: 'cancelled',
};

// A gigabyte needs a real progress bar with byte figures, not a spinner,
// and cancel stays reachable for the whole transfer (design skill's
// download-progress pattern).
function DownloadRow({ job, onCancel, onDismiss, onRetry }: {
  readonly job: DownloadJob;
  readonly onCancel: (modelId: string) => void;
  readonly onDismiss: (modelId: string) => void;
  readonly onRetry: (job: DownloadJob) => void;
}): ReactNode {
  const isActive = job.status === 'queued' || job.status === 'downloading';
  const loaded = job.progress?.bytesLoaded ?? 0;
  const total = job.progress?.bytesTotal ?? job.model.bytes;
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

  return (
    <Stack gap={6} data-testid="download-job">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fw={600} size="sm" truncate style={{ minWidth: 0 }}>
          {job.model.name}
        </Text>
        <Group gap={6} wrap="nowrap">
          <Badge size="xs" variant="light" color={job.status === 'error' ? 'red' : undefined}>
            {STATUS_LABEL[job.status]}
          </Badge>
          {isActive ? (
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              aria-label={`Cancel download of ${job.model.name}`}
              onClick={() => onCancel(job.modelId)}
              data-testid="cancel-download-button"
            >
              <IconX size={15} stroke={1.75} />
            </ActionIcon>
          ) : (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Dismiss ${job.model.name}`}
              onClick={() => onDismiss(job.modelId)}
            >
              <IconX size={15} stroke={1.75} />
            </ActionIcon>
          )}
        </Group>
      </Group>

      {isActive && (
        <>
          <Progress
            value={percent}
            aria-label={`Download progress for ${job.model.name}`}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
          <Text c="dark.1" size="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {job.status === 'queued'
              ? `Waiting - ${formatBytes(total)}`
              : `${formatBytes(loaded)} of ${formatBytes(total)} - ${percent}%`}
          </Text>
        </>
      )}

      {job.status === 'error' && (
        <Alert color="red" p="xs">
          <Stack gap={6}>
            <Text size="xs">{job.errorMessage}</Text>
            <Button size="compact-xs" variant="light" w="fit-content" onClick={() => onRetry(job)}>
              Try again
            </Button>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

export function DownloadManager({ jobs, onCancel, onDismiss, onRetry }: DownloadManagerProps): ReactNode {
  if (jobs.length === 0) return null;

  return (
    <Card withBorder padding="lg" radius="lg" data-testid="download-manager">
      <Stack gap="md">
        <Title order={2} size="h4">
          <IconDownload size={18} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          Downloads
        </Title>
        {jobs.map((job) => (
          <DownloadRow key={job.modelId} job={job} onCancel={onCancel} onDismiss={onDismiss} onRetry={onRetry} />
        ))}
      </Stack>
    </Card>
  );
}
