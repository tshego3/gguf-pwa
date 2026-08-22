import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconCloudDownload, IconPhoto } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { isVideoModel, isVisionModel } from '../models/catalog';
import type { CatalogModel } from '../types';

interface CatalogListProps {
  readonly models: readonly CatalogModel[];
  readonly installedIds: ReadonlySet<string>;
  readonly deviceMemoryGb: number | null;
  readonly onDownload: (model: CatalogModel) => void;
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function CatalogList({ models, installedIds, deviceMemoryGb, onDownload }: CatalogListProps): ReactNode {
  return (
    <Card withBorder padding="lg" radius="lg" data-testid="catalog-card">
      <Stack gap="sm">
        <Title order={2} size="h4">
          <IconCloudDownload size={18} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          Download a model
        </Title>
        <Text c="dark.1" size="sm">
          Fetched directly from Hugging Face. Costs a real transfer of data.
        </Text>

        <Stack gap="xs" mt="xs">
          {models.map((model) => {
            const installed = installedIds.has(model.id);
            const suitable = deviceMemoryGb === null || deviceMemoryGb >= model.minDeviceMemoryGb;
            return (
              <Group key={model.id} justify="space-between" wrap="nowrap" data-testid="catalog-entry">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {model.name}
                  </Text>
                  <Group gap="xs">
                    <Text c="dark.1" size="xs">
                      {formatGb(model.bytes)} - {model.contextLength.toLocaleString()} ctx
                    </Text>
                    {isVisionModel(model) && (
                      <Badge size="xs" variant="light" leftSection={<IconPhoto size={10} stroke={2} />}>
                        {isVideoModel(model) ? 'reads images + video' : 'reads images'}
                      </Badge>
                    )}
                    {!suitable && (
                      <Badge color="yellow" size="xs">
                        may be too large for this device
                      </Badge>
                    )}
                  </Group>
                </Stack>
                <Button
                  size="xs"
                  variant={installed ? 'default' : 'filled'}
                  disabled={installed}
                  onClick={() => onDownload(model)}
                  data-testid="download-button"
                  style={{ flexShrink: 0 }}
                >
                  {installed ? 'Installed' : 'Download'}
                </Button>
              </Group>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}
