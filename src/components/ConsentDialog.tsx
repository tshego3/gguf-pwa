import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { PreflightWarning } from '../models/preflight';
import type { CatalogModel } from '../types';

interface ConsentDialogProps {
  readonly model: CatalogModel;
  readonly warnings: readonly PreflightWarning[];
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatSpec(model: CatalogModel): string {
  return [model.quant, model.params].filter(Boolean).join(', ');
}

// A large download never starts from a single tap: this names the exact
// size, the licence, and every pre-flight warning before the user confirms
// (P2-T9). Warnings never block - they only inform the decision. Confirming
// hands the model to the download queue and closes this dialog; progress
// and cancel live in the download manager from that point on, so a transfer
// is no longer tied to a modal the user cannot navigate away from.
export function ConsentDialog({ model, warnings, onConfirm, onClose }: ConsentDialogProps): ReactNode {
  return (
    <Modal opened onClose={onClose} title={model.name} centered>
      <Stack gap="md">
        <Text>
          This downloads <strong>{formatGb(model.bytes)}</strong>
          {formatSpec(model) && ` (${formatSpec(model)})`} from Hugging Face.
        </Text>
        <Text size="sm">
          Licence: {model.licence} -{' '}
          <a href={model.licenceUrl} target="_blank" rel="noopener noreferrer">
            view terms
          </a>
        </Text>

        {warnings.map((warning) => (
          <Alert key={warning.kind} color="yellow" title="Before you continue">
            {warning.message}
          </Alert>
        ))}

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} data-testid="confirm-download-button">
            Download {formatGb(model.bytes)}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
