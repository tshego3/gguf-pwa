import { Select } from '@mantine/core';
import type { ReactNode } from 'react';
import { REMOTE_MODEL_ID, REMOTE_MODEL_LABEL, type InstalledModel } from '../types';

interface ModelSwitcherProps {
  readonly models: readonly InstalledModel[];
  readonly activeModelId: string | null;
  readonly onChange: (modelId: string) => void;
  // Adds the online API as a peer of the installed models. Only true when
  // the user has switched it on in Settings, so the option never appears
  // for someone who has not opted into sending anything off the device.
  readonly includeRemote?: boolean;
  readonly disabled?: boolean;
  readonly size?: string;
  readonly label?: string;
  readonly width?: number;
}

// Switching model is a load, not a preference toggle: the engine holds one
// backend at a time, so picking a different entry here unloads the current
// one and activates the new one. Rendered in both the Chat header and
// Settings off the same component so the two never drift apart.
export function ModelSwitcher({
  models,
  activeModelId,
  onChange,
  includeRemote = false,
  disabled,
  size = 'xs',
  label,
  width,
}: ModelSwitcherProps): ReactNode {
  if (models.length === 0 && !includeRemote) return null;

  const data = [
    ...models.map((model) => ({ value: model.modelId, label: model.name })),
    ...(includeRemote ? [{ value: REMOTE_MODEL_ID, label: REMOTE_MODEL_LABEL }] : []),
  ];

  return (
    <Select
      aria-label={label ?? 'Active model'}
      label={label}
      placeholder="Choose a backend"
      size={size}
      w={width}
      disabled={disabled}
      allowDeselect={false}
      value={activeModelId}
      onChange={(value) => {
        if (value && value !== activeModelId) onChange(value);
      }}
      data={data}
      data-testid="model-switcher"
    />
  );
}
