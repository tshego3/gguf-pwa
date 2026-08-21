import { Alert } from '@mantine/core';
import type { ReactNode } from 'react';

export function OfflineBanner(): ReactNode {
  return (
    <Alert color="yellow" data-testid="offline-banner" mb="sm">
      You are offline. Chat with an installed model still works; downloading a new one does not.
    </Alert>
  );
}
