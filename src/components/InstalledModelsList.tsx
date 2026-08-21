import { ActionIcon, Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { InstalledModel, ModelSource } from '../types';

interface InstalledModelsListProps {
  readonly models: readonly InstalledModel[];
  readonly onDelete: (modelId: string) => void;
}

const SOURCE_LABEL: Record<ModelSource, string> = {
  catalog: 'downloaded',
  'local-file': 'on this device (copied)',
  'local-handle': 'on this device',
};

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function InstalledModelsList({ models, onDelete }: InstalledModelsListProps): ReactNode {
  if (models.length === 0) {
    return (
      <Text c="dark.1" size="sm" data-testid="installed-empty">
        No models installed yet.
      </Text>
    );
  }

  return (
    <Card withBorder padding="lg" radius="lg" data-testid="installed-models-card">
      <Stack gap="sm">
        <Title order={2} size="h4">
          Installed
        </Title>
        <Stack gap="xs">
          {models.map((model) => (
            <Group key={model.modelId} justify="space-between" wrap="nowrap" data-testid="installed-entry">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={600} truncate>
                  {model.name}
                </Text>
                <Group gap="xs">
                  <Badge size="xs" variant="light">
                    {SOURCE_LABEL[model.source]}
                  </Badge>
                  <Text c="dark.1" size="xs">
                    {formatGb(model.bytes)}
                  </Text>
                </Group>
              </Stack>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={`Delete ${model.name}`}
                onClick={() => onDelete(model.modelId)}
              >
                <IconTrash size={18} stroke={1.75} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
