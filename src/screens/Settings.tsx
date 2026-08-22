import { List, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState, type ReactNode } from 'react';
import { CapabilityProbe } from '../components/CapabilityProbe';
import { loadSettings, patchSettings } from '../db';
import { useCapabilities } from '../hooks/useCapabilities';
import { usePersistentStorageStatus } from '../hooks/usePersistentStorageStatus';
import { useSwVersion } from '../hooks/useSwVersion';
import type { BackendOverride } from '../types';

const BACKEND_OPTIONS: ReadonlyArray<{ readonly value: BackendOverride; readonly label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'webgpu', label: 'Tier A - WebGPU' },
  { value: 'wasm-mt', label: 'Tier B - WASM (multi-thread)' },
  { value: 'wasm-st', label: 'Tier C - WASM (single-thread)' },
];

export function Settings(): ReactNode {
  const { capabilities, isLoading, errorMessage } = useCapabilities();
  const persisted = usePersistentStorageStatus();
  const swVersion = useSwVersion();
  const [backendOverride, setBackendOverride] = useState<BackendOverride | null>(null);

  useEffect(() => {
    loadSettings()
      .then((settings) => setBackendOverride(settings.backendOverride))
      .catch(() => undefined);
  }, []);

  function handleBackendChange(value: string | null): void {
    if (!value) return;
    const override = value as BackendOverride;
    setBackendOverride(override);
    void patchSettings({ backendOverride: override });
  }

  return (
    <Stack gap="lg" maw={640}>
      <Title order={1}>Settings</Title>
      <CapabilityProbe capabilities={capabilities} isLoading={isLoading} errorMessage={errorMessage} />

      <Title order={2} size="h4">
        Backend
      </Title>
      <Select
        aria-label="Backend override"
        data={BACKEND_OPTIONS}
        value={backendOverride}
        onChange={handleBackendChange}
        allowDeselect={false}
        data-testid="backend-override-select"
      />
      <Text c="dark.1" size="xs">
        Auto picks WebGPU whenever it is available. On some mid-range GPUs, WASM can run a model
        faster than WebGPU - if generation feels slow, try Tier B or Tier C here and compare. The
        change applies the next time a model loads: leave Chat and come back, or reopen the app.
      </Text>

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
