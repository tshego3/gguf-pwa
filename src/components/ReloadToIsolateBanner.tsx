import { Alert, Button, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface ReloadToIsolateBannerProps {
  readonly onReload: () => void;
}

// Isolation only takes effect after the service worker controls the page,
// so the first visit is never isolated. Offered as an explicit action with
// a plain-language reason - never reloaded silently (P5-T6).
export function ReloadToIsolateBanner({ onReload }: ReloadToIsolateBannerProps): ReactNode {
  return (
    <Alert color="blue" data-testid="reload-to-isolate-banner" mb="sm">
      <Group justify="space-between" wrap="wrap">
        <Text size="sm">This device may run faster after one reload, once background setup finishes.</Text>
        <Button size="xs" variant="light" onClick={onReload} data-testid="reload-to-isolate-button">
          Reload
        </Button>
      </Group>
    </Alert>
  );
}
