import { Alert, Button, Card, Group, Loader, ScrollArea, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconBrandOpenSource, IconSearch } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useGgmlOrgModels } from '../hooks/useGgmlOrgModels';
import { BROWSABLE_REPO, toCatalogModel } from '../models/huggingfaceSearch';
import type { CatalogModel } from '../types';

interface HuggingFaceSearchCardProps {
  readonly installedIds: ReadonlySet<string>;
  readonly onDownload: (model: CatalogModel) => void;
}

function formatGb(bytes: number): string {
  return bytes > 0 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : 'size unknown';
}

// Restricted to one Hugging Face repository by explicit instruction, not
// the full hub - reuses the exact same consent/pre-flight/download
// pipeline the curated catalog uses (P2-T7 through P2-T9), so nothing
// downstream needs to know a file came from here instead of
// public/models.json.
export function HuggingFaceSearchCard({ installedIds, onDownload }: HuggingFaceSearchCardProps): ReactNode {
  const models = useGgmlOrgModels();

  return (
    <Card withBorder padding="lg" radius="lg" data-testid="hf-search-card">
      <Stack gap="sm">
        <Title order={2} size="h4">
          <IconBrandOpenSource size={18} stroke={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          Browse {BROWSABLE_REPO}
        </Title>
        <Text c="dark.1" size="sm">
          Every GGUF file in this Hugging Face repository. Sizes are read live before you
          download.
        </Text>

        <TextInput
          aria-label="Filter models"
          placeholder="Filter by filename…"
          leftSection={<IconSearch size={16} stroke={1.75} />}
          value={models.filter}
          onChange={(event) => models.setFilter(event.currentTarget.value)}
          data-testid="hf-search-input"
          disabled={models.isLoading || !!models.errorMessage}
        />

        {models.isLoading && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs" c="dark.1">
              Loading the file list…
            </Text>
          </Group>
        )}

        {models.errorMessage && (
          <Alert color="red" title="Could not load the model list">
            {models.errorMessage}
          </Alert>
        )}

        {!models.isLoading && !models.errorMessage && models.files.length === 0 && (
          <Text size="sm" c="dark.1">
            No files matched.
          </Text>
        )}

        {models.files.length > 0 && (
          <ScrollArea.Autosize mah={280}>
            <Stack gap={4}>
              {models.files.map((file) => {
                const model = toCatalogModel(models.detail as NonNullable<typeof models.detail>, file);
                const installed = installedIds.has(model.id);
                return (
                  <Group key={file.name} justify="space-between" wrap="nowrap" gap="xs" data-testid="hf-file-entry">
                    <Group gap={4} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" truncate style={{ minWidth: 0 }}>
                        {file.name}
                      </Text>
                      <Text size="xs" c="dark.1" style={{ flexShrink: 0 }}>
                        · {formatGb(file.bytes)}
                      </Text>
                    </Group>
                    <Button
                      size="xs"
                      variant={installed ? 'default' : 'filled'}
                      disabled={installed}
                      onClick={() => onDownload(model)}
                      data-testid="hf-download-button"
                      style={{ flexShrink: 0 }}
                    >
                      {installed ? 'Installed' : 'Download'}
                    </Button>
                  </Group>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Card>
  );
}
