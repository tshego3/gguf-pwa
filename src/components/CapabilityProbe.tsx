import { Alert, List, Loader, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import type { EngineCapabilities } from '../types';

interface CapabilityProbeProps {
  readonly capabilities: EngineCapabilities | null;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

const TIER_LABEL: Record<EngineCapabilities['tier'], string> = {
  webgpu: 'Tier A - WebGPU',
  'wasm-mt': 'Tier B - WASM (multi-thread)',
  'wasm-st': 'Tier C - WASM (single-thread)',
};

// Presentational only - receives probe results as props, per the
// "components never call services" rule. Settings orchestrates the probe.
export function CapabilityProbe({ capabilities, isLoading, errorMessage }: CapabilityProbeProps): ReactNode {
  if (isLoading) {
    return (
      <Stack align="center" py="xl" data-testid="capability-loading">
        <Loader />
        <Text c="dark.1">Reading device capabilities…</Text>
      </Stack>
    );
  }

  if (errorMessage) {
    return (
      <Alert color="yellow" title="Capability probe failed" data-testid="capability-error">
        {errorMessage}
      </Alert>
    );
  }

  if (!capabilities) {
    return (
      <Text c="dark.1" data-testid="capability-empty">
        No capability data available.
      </Text>
    );
  }

  return (
    <Stack gap="xs" data-testid="capability-data">
      <Title order={2}>Backend tier</Title>
      <Text fw={600}>{TIER_LABEL[capabilities.tier]}</Text>

      <Title order={2} mt="md">
        Device
      </Title>
      <List spacing={4} size="sm">
        <List.Item>Platform: {capabilities.platform}</List.Item>
        <List.Item>Device memory: {capabilities.deviceMemoryGb ? `${capabilities.deviceMemoryGb} GB` : 'unreported'}</List.Item>
        <List.Item>CPU cores: {capabilities.hardwareConcurrency}</List.Item>
      </List>

      <Title order={2} mt="md">
        Runtime
      </Title>
      <List spacing={4} size="sm">
        <List.Item>WebGPU: {yesNo(capabilities.webgpu)}</List.Item>
        {capabilities.webgpu && (
          <List.Item>
            WebGPU max buffer: {formatBytes(capabilities.webgpuMaxBufferSize)} / max storage binding:{' '}
            {formatBytes(capabilities.webgpuMaxStorageBufferBindingSize)}
          </List.Item>
        )}
        <List.Item>SharedArrayBuffer: {yesNo(capabilities.sharedArrayBuffer)}</List.Item>
        <List.Item>Cross-origin isolated: {yesNo(capabilities.crossOriginIsolated)}</List.Item>
        <List.Item>File System Access API: {yesNo(capabilities.fileSystemAccess)}</List.Item>
        <List.Item>OPFS: {yesNo(capabilities.opfs)}</List.Item>
      </List>

      <Title order={2} mt="md">
        Storage
      </Title>
      <List spacing={4} size="sm">
        <List.Item>Quota: {formatBytes(capabilities.storageQuotaBytes)}</List.Item>
        <List.Item>In use: {formatBytes(capabilities.storageUsageBytes)}</List.Item>
      </List>
    </Stack>
  );
}
