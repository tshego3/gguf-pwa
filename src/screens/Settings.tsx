import { Alert, Button, Group, List, Select, Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CapabilityProbe } from '../components/CapabilityProbe';
import { ModelSwitcher } from '../components/ModelSwitcher';
import { StorageUsage } from '../components/StorageUsage';
import { loadSettings, patchSettings } from '../db';
import { useCapabilities } from '../hooks/useCapabilities';
import { useInstalledModels } from '../hooks/useInstalledModels';
import { usePersistentStorageStatus } from '../hooks/usePersistentStorageStatus';
import { useSwVersion } from '../hooks/useSwVersion';
import { resolveActiveModel, setActiveModel } from '../models/activeModel';
import type { BackendOverride } from '../types';

const BACKEND_OPTIONS: ReadonlyArray<{ readonly value: BackendOverride; readonly label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'webgpu', label: 'Tier A - WebGPU' },
  { value: 'wasm-mt', label: 'Tier B - WASM (multi-thread)' },
  { value: 'wasm-st', label: 'Tier C - WASM (single-thread)' },
];

export function Settings(): ReactNode {
  const { capabilities, isLoading, errorMessage } = useCapabilities();
  const storage = usePersistentStorageStatus();
  const swVersion = useSwVersion();
  const installed = useInstalledModels();
  const [backendOverride, setBackendOverride] = useState<BackendOverride | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings()
      .then((settings) => setBackendOverride(settings.backendOverride))
      .catch(() => undefined);
  }, []);

  // The effective active model, not the raw setting - activeModelId is null
  // until an explicit choice is made, and the newest install stands in for
  // it (see resolveActiveModel).
  useEffect(() => {
    resolveActiveModel()
      .then((model) => setActiveModelId(model?.modelId ?? null))
      .catch(() => undefined);
  }, [installed.models]);

  function handleBackendChange(value: string | null): void {
    if (!value) return;
    const override = value as BackendOverride;
    setBackendOverride(override);
    void patchSettings({ backendOverride: override });
  }

  const handleActiveModelChange = useCallback(async (modelId: string) => {
    setActiveModelId(modelId);
    await setActiveModel(modelId);
  }, []);

  return (
    <Stack gap="lg" maw={640}>
      <Title order={1}>Settings</Title>
      <CapabilityProbe capabilities={capabilities} isLoading={isLoading} errorMessage={errorMessage} />

      <Title order={2} size="h4">
        Active model
      </Title>
      {installed.models.length === 0 ? (
        <Text c="dark.1" size="sm" data-testid="settings-no-models">
          No models installed yet. Open Models to load or download one.
        </Text>
      ) : (
        <>
          <ModelSwitcher
            models={installed.models}
            activeModelId={activeModelId}
            onChange={(modelId) => void handleActiveModelChange(modelId)}
            size="sm"
          />
          <Text c="dark.1" size="xs">
            One model is resident at a time. Chat loads this one, and switching unloads the
            current model first.
          </Text>
        </>
      )}

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
      <StorageUsage
        usageBytes={capabilities?.storageUsageBytes ?? null}
        quotaBytes={capabilities?.storageQuotaBytes ?? null}
      />
      <List spacing={4} size="sm">
        <List.Item>
          Persistent storage:{' '}
          {storage.persisted === null
            ? 'not reported by this browser'
            : storage.persisted
              ? 'granted'
              : 'not granted'}
        </List.Item>
      </List>
      {storage.persisted !== true && (
        <Stack gap="xs">
          <Text c="dark.1" size="xs">
            Without this, the browser can delete a downloaded model at any time to reclaim space,
            with no warning. Granting it keeps your models installed.
          </Text>
          <Group>
            <Button
              size="xs"
              variant="light"
              loading={storage.isRequesting}
              onClick={() => void storage.request()}
              data-testid="enable-persistent-storage-button"
            >
              Enable persistent storage
            </Button>
          </Group>
          {storage.wasDenied && (
            <Alert color="yellow" p="xs" data-testid="persistent-storage-denied">
              <Text size="xs">
                This browser declined. Chromium only grants it once a site is used regularly, or
                after you install the app to your home screen - try again later. Your models still
                work; they are just evictable under storage pressure.
              </Text>
            </Alert>
          )}
        </Stack>
      )}

      <Title order={2} size="h4">
        App
      </Title>
      <List spacing={4} size="sm">
        <List.Item data-testid="engine-version">Engine version: {swVersion ?? 'unavailable offline-first-run'}</List.Item>
      </List>
    </Stack>
  );
}
