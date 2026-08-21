import { Button, Group, Notification } from '@mantine/core';
import type { ReactNode } from 'react';

interface UpdatePromptProps {
  readonly onReload: () => void;
  readonly onDismiss: () => void;
}

// An explicit prompt, never a silent skipWaiting() - the SW version and the
// WASM version move together, so applying an update mid-session without
// asking would swap inference code out from under a live tab (P5-T3).
export function UpdatePrompt({ onReload, onDismiss }: UpdatePromptProps): ReactNode {
  return (
    <Notification
      title="Update available"
      onClose={onDismiss}
      data-testid="update-prompt"
      style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 200, maxWidth: 360 }}
    >
      A new version is ready.
      <Group mt="xs">
        <Button size="xs" onClick={onReload} data-testid="update-reload-button">
          Reload to update
        </Button>
      </Group>
    </Notification>
  );
}
