import { Alert, Button, Group, Modal, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useMemo, useState, type ReactNode } from 'react';
import { CatalogList } from '../components/CatalogList';
import { ConsentDialog } from '../components/ConsentDialog';
import { HuggingFaceSearchCard } from '../components/HuggingFaceSearchCard';
import { InstalledModelsList } from '../components/InstalledModelsList';
import { LocalFileCard } from '../components/LocalFileCard';
import { StorageUsage } from '../components/StorageUsage';
import { useCapabilities } from '../hooks/useCapabilities';
import { useCatalog } from '../hooks/useCatalog';
import { useInstalledModels } from '../hooks/useInstalledModels';
import { useLocalFileLoad } from '../hooks/useLocalFileLoad';
import { useModelDownload } from '../hooks/useModelDownload';
import { selectLocalAcquisitionPath } from '../models/acquisitionPath';
import type { CatalogModel } from '../types';

export function Models(): ReactNode {
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const catalog = useCatalog();
  const installed = useInstalledModels();
  const localFileLoad = useLocalFileLoad(() => void installed.refresh());
  const download = useModelDownload(() => void installed.refresh());

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const installedIds = useMemo(() => new Set(installed.models.map((m) => m.modelId)), [installed.models]);
  const localPath = capabilities ? selectLocalAcquisitionPath(capabilities) : 'input-opfs';
  // capabilities.opfs is a real functional probe (it actually calls
  // getDirectory(), not just a typeof check) - Safari's Private Browsing
  // exposes the API but throws the moment it's called, confirmed against
  // real Safari via a "Download failed" / "Could not copy the model"
  // report that traced back to this. Every acquisition path except the
  // File System Access one needs OPFS, so this is worth a loud warning.
  const opfsBroken = capabilities !== null && !capabilities.opfs;

  const isLoading = capabilitiesLoading || catalog.isLoading || installed.isLoading;
  const errorMessage = catalog.errorMessage ?? installed.errorMessage;

  function handleDownload(model: CatalogModel): void {
    void download.beginPreflight(model, capabilities?.deviceMemoryGb ?? null);
  }

  function handleRetry(): void {
    catalog.refetch();
    void installed.refresh();
  }

  if (isLoading) {
    return (
      <Stack gap="lg">
        <Title order={1}>Models</Title>
        <Skeleton height={140} radius="lg" />
        <Skeleton height={140} radius="lg" />
      </Stack>
    );
  }

  if (errorMessage) {
    return (
      <Stack gap="lg">
        <Title order={1}>Models</Title>
        <Alert color="red" title="Could not load Models">
          {errorMessage}
        </Alert>
        <Button onClick={handleRetry}>Try again</Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg" maw={720}>
      <Title order={1}>Models</Title>

      {opfsBroken && (
        <Alert color="yellow" title="On-device model storage is unavailable" data-testid="opfs-broken-banner">
          Downloads and copying a file from your device both need a storage feature (OPFS) this
          browser reports as broken right now. On Safari, the most common cause is{' '}
          <strong>Private Browsing</strong> - it blocks this even though the feature otherwise
          looks available. Try a regular window, or if this isn’t Private Browsing, closing other
          tabs may free up storage.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <LocalFileCard
          path={localPath}
          status={localFileLoad.state.status}
          errorMessage={localFileLoad.state.errorMessage}
          copyProgressPercent={localFileLoad.state.copyProgressPercent}
          onPickViaFileSystemAccess={() => void localFileLoad.pickViaFileSystemAccess()}
          onFilesChosen={(files) => void localFileLoad.copyViaOpfs(files)}
        />
        <CatalogList
          models={catalog.models}
          installedIds={installedIds}
          deviceMemoryGb={capabilities?.deviceMemoryGb ?? null}
          onDownload={handleDownload}
        />
      </SimpleGrid>

      <HuggingFaceSearchCard installedIds={installedIds} onDownload={handleDownload} />

      <InstalledModelsList models={installed.models} onDelete={(modelId) => setPendingDelete(modelId)} />

      <Stack gap={4}>
        <Text size="sm" fw={600}>
          Storage
        </Text>
        <StorageUsage usageBytes={capabilities?.storageUsageBytes ?? null} quotaBytes={capabilities?.storageQuotaBytes ?? null} />
      </Stack>

      {download.state.status !== 'idle' && download.state.model && (
        <ConsentDialog
          model={download.state.model}
          status={download.state.status}
          warnings={download.state.warnings}
          progress={download.state.progress}
          errorMessage={download.state.errorMessage}
          onConfirm={() => void download.confirmAndDownload()}
          onCancel={download.cancel}
          onClose={download.dismiss}
        />
      )}

      <Modal opened={pendingDelete !== null} onClose={() => setPendingDelete(null)} title="Delete this model?" centered>
        <Stack gap="md">
          <Text size="sm">This frees the storage it uses. You can download or load it again later.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (pendingDelete) void installed.remove(pendingDelete);
                setPendingDelete(null);
              }}
              data-testid="confirm-delete-button"
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
