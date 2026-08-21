import { List, Stack, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { CapabilityProbe } from '../components/CapabilityProbe';
import { useCapabilities } from '../hooks/useCapabilities';
import { usePersistentStorageStatus } from '../hooks/usePersistentStorageStatus';
import { useSwVersion } from '../hooks/useSwVersion';

export function Settings(): ReactNode {
  const { capabilities, isLoading, errorMessage } = useCapabilities();
  const persisted = usePersistentStorageStatus();
  const swVersion = useSwVersion();

  return (
    <Stack gap="lg" maw={640}>
      <Title order={1}>Settings</Title>
      <CapabilityProbe capabilities={capabilities} isLoading={isLoading} errorMessage={errorMessage} />

      <Title order={2} size="h4">
        Storage
      </Title>
      <List spacing={4} size="sm">
        <List.Item>
          Persistent storage:{' '}
          {persisted === null ? 'not reported by this browser' : persisted ? 'granted' : 'not granted'}
        </List.Item>
      </List>

      <Title order={2} size="h4">
        App
      </Title>
      <List spacing={4} size="sm">
        <List.Item data-testid="engine-version">Engine version: {swVersion ?? 'unavailable offline-first-run'}</List.Item>
      </List>
    </Stack>
  );
}
