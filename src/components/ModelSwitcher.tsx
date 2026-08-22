import { Select } from '@mantine/core';
import type { ReactNode } from 'react';
import type { InstalledModel } from '../types';

interface ModelSwitcherProps {
  readonly models: readonly InstalledModel[];
  readonly activeModelId: string | null;
  readonly onChange: (modelId: string) => void;
  readonly disabled?: boolean;
  readonly size?: string;
  readonly label?: string;
  readonly width?: number;
}

// Switching model is a load, not a preference toggle: the engine holds one
// model at a time, so picking a different entry here unloads the current
// one and loads the new one. Rendered in both the Chat header and Settings
// off the same component so the two never drift apart.
export function ModelSwitcher({
  models,
  activeModelId,
  onChange,
  disabled,
  size = 'xs',
  label,
  width,
}: ModelSwitcherProps): ReactNode {
  if (models.length === 0) return null;

  return (
    <Select
      aria-label={label ?? 'Active model'}
      label={label}
      size={size}
      w={width}
      disabled={disabled}
      allowDeselect={false}
      value={activeModelId}
      onChange={(value) => {
        if (value && value !== activeModelId) onChange(value);
      }}
      data={models.map((model) => ({ value: model.modelId, label: model.name }))}
      data-testid="model-switcher"
    />
  );
}
