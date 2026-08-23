import { Alert, Button, Group, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { useEffect, useState, type ReactNode } from 'react';
import { checkRemoteEndpoint, type RemoteProvider } from '../types';

interface RemoteApiSectionProps {
  readonly enabled: boolean;
  readonly providers: readonly RemoteProvider[];
  readonly onToggle: (enabled: boolean) => void;
  readonly onEndpointChange: (id: string, urlTemplate: string) => void;
  readonly onReset: () => void;
}

function roleLabel(index: number): string {
  if (index === 0) return 'Primary endpoint';
  return index === 1 ? 'Fallback endpoint' : `Fallback endpoint ${index}`;
}

// The one place in the app that admits a prompt can leave the device. The
// warning is stated before the switch, not after it, and the switch is off
// until someone reads that and decides otherwise.
export function RemoteApiSection({
  enabled,
  providers,
  onToggle,
  onEndpointChange,
  onReset,
}: RemoteApiSectionProps): ReactNode {
  // Drafts let a half-typed address exist without being validated on every
  // keystroke or written to storage mid-edit. They resync whenever the
  // stored providers change, including after Reset.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(providers.map((p) => [p.id, p.urlTemplate])));
    setErrors({});
  }, [providers]);

  function commit(provider: RemoteProvider): void {
    const draft = drafts[provider.id] ?? provider.urlTemplate;
    if (draft === provider.urlTemplate) return;
    const check = checkRemoteEndpoint(draft.trim(), provider.method);
    if (!check.valid) {
      setErrors((prev) => ({ ...prev, [provider.id]: check.reason }));
      return;
    }
    setErrors((prev) => ({ ...prev, [provider.id]: '' }));
    onEndpointChange(provider.id, draft.trim());
  }

  return (
    <>
      <Title order={2} size="h4">
        Online API
      </Title>
      <Alert color="yellow" title="This sends your prompt off the device" data-testid="remote-privacy-warning">
        <Text size="xs">
          Everything else in this app runs locally and sends nothing. Switch this on and your
          messages, including any text pulled out of an attachment, are sent to the services below.
          The keyed proxy is this project&apos;s own Cloudflare Worker, which forwards to Ollama,
          Hugging Face, or NVIDIA; the two keyless endpoints need no account and are not operated by
          this app. Do not send anything private through any of them.
        </Text>
      </Alert>
      <Switch
        checked={enabled}
        onChange={(event) => onToggle(event.currentTarget.checked)}
        label="Offer an online API alongside downloaded models"
        data-testid="remote-enabled-switch"
      />
      {enabled && (
        <Stack gap="sm">
          {providers.map((provider, index) => (
            <TextInput
              key={provider.id}
              label={`${roleLabel(index)} - ${provider.name}`}
              description={provider.enabled ? undefined : 'Inactive in this build, so it is skipped.'}
              value={drafts[provider.id] ?? provider.urlTemplate}
              error={errors[provider.id] || undefined}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setDrafts((prev) => ({ ...prev, [provider.id]: value }));
              }}
              onBlur={() => commit(provider)}
              spellCheck={false}
              autoCapitalize="none"
              data-testid={`remote-endpoint-${provider.id}`}
            />
          ))}
          <Text c="dark.1" size="xs">
            {'The keyless endpoints use {prompt} where the message belongs; the keyed proxy sends '}
            the conversation in the request body instead. Each fallback is tried only when the one
            before it fails before any reply has appeared. Hosts other than the three shipped here
            are blocked by the app&apos;s content security policy, which is fixed when the app is
            built.
          </Text>
          <Group>
            <Button size="xs" variant="subtle" onClick={onReset} data-testid="remote-reset-button">
              Reset endpoints
            </Button>
          </Group>
        </Stack>
      )}
    </>
  );
}
