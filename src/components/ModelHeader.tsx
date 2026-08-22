import { Badge, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { BackendTier } from '../types';

interface ModelHeaderProps {
  readonly modelName?: string | null;
  readonly tier: BackendTier | null;
  // True while the online API answers instead of a resident model. It gets
  // its own badge for the same reason the tier has one: it is the honest
  // explanation for what the user is getting, and here that includes the
  // fact that the prompt leaves the device.
  readonly isRemote?: boolean;
}

const TIER_LABEL: Record<BackendTier, string> = {
  webgpu: 'WebGPU',
  'wasm-mt': 'WASM (multi-thread)',
  'wasm-st': 'WASM (single-thread)',
};

// Always visible in the Chat header - the tier is the honest explanation
// for the speed the user is getting, and it is never hidden (P4-T10,
// design skill's backend-tier-badge pattern). modelName is omitted when a
// ModelSwitcher already names the active model beside this badge, so the
// name is never printed twice.
export function ModelHeader({ modelName, tier, isRemote = false }: ModelHeaderProps): ReactNode {
  if (isRemote) {
    return (
      <Group gap="xs" data-testid="model-header">
        <Badge size="xs" variant="light" color="yellow" data-testid="remote-badge">
          Online API
        </Badge>
        <Text size="xs" c="dark.1">
          prompts leave this device
        </Text>
      </Group>
    );
  }

  if (!tier) return null;

  return (
    <Group gap="xs" data-testid="model-header">
      {modelName && (
        <Text fw={600} size="sm" truncate>
          {modelName}
        </Text>
      )}
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
