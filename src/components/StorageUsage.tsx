import { Progress, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface StorageUsageProps {
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function StorageUsage({ usageBytes, quotaBytes }: StorageUsageProps): ReactNode {
  if (usageBytes === null || quotaBytes === null || quotaBytes === 0) {
    return (
      <Text c="dark.1" size="xs" data-testid="storage-usage-unknown">
        Storage usage is not reported by this browser.
      </Text>
    );
  }

  const percent = Math.min(100, Math.round((usageBytes / quotaBytes) * 100));

  return (
    <Stack gap={4} data-testid="storage-usage">
      <Progress value={percent} aria-label="Storage used" />
      <Text c="dark.1" size="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatGb(usageBytes)} of {formatGb(quotaBytes)} used
      </Text>
    </Stack>
  );
}
