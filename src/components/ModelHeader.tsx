import { Badge, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { BackendTier } from '../types';

interface ModelHeaderProps {
  readonly modelName: string | null;
  readonly tier: BackendTier | null;
}

const TIER_LABEL: Record<BackendTier, string> = {
  webgpu: 'WebGPU',
  'wasm-mt': 'WASM (multi-thread)',
  'wasm-st': 'WASM (single-thread)',
};

// Always visible in the Chat header - the tier is the honest explanation
// for the speed the user is getting, and it is never hidden (P4-T10,
// design skill's backend-tier-badge pattern).
export function ModelHeader({ modelName, tier }: ModelHeaderProps): ReactNode {
  if (!modelName || !tier) return null;

  return (
    <Group gap="xs" data-testid="model-header">
      <Text fw={600} size="sm" truncate>
        {modelName}
      </Text>
      <Badge size="xs" variant="light" data-testid="tier-badge">
        {TIER_LABEL[tier]}
      </Badge>
      {tier === 'wasm-st' && (
        <Text size="xs" c="dark.1">
          slower on this device
        </Text>
      )}
    </Group>
  );
}
