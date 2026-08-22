import { ActionIcon, Alert, Button, Group, Select, Stack, Text, Title } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Composer } from '../components/Composer';
import { ModelHeader } from '../components/ModelHeader';
import { ModelSwitcher } from '../components/ModelSwitcher';
import { SystemPromptControl } from '../components/SystemPromptControl';
import { Transcript } from '../components/Transcript';
import { loadSettings } from '../db';
import { useChatEngine } from '../hooks/useChatEngine';
import { createNewConversation, removeConversation, useConversation } from '../hooks/useConversation';
import { useConversationList } from '../hooks/useConversationList';
import { useInstalledModels } from '../hooks/useInstalledModels';
import { useTokenCount } from '../hooks/useTokenCount';
import { setActiveModel } from '../models/activeModel';
import { reacquireLocalFiles } from '../models/localFileAccess';
import { DEFAULT_SETTINGS, REMOTE_MODEL_ID, type GenerationParams } from '../types';

const ENGINE_STATUS_MESSAGE: Record<string, string> = {
  missing: 'This model is no longer available on this device. Open Models to re-download or re-pick it.',
  error: 'The model could not be loaded.',
};

export function Chat(): ReactNode {
  const [reloadKey, setReloadKey] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [params, setParams] = useState<GenerationParams>({
    nCtx: DEFAULT_SETTINGS.nCtx,
    temperature: DEFAULT_SETTINGS.temperature,
    topK: DEFAULT_SETTINGS.topK,
    topP: DEFAULT_SETTINGS.topP,
    maxTokens: DEFAULT_SETTINGS.maxTokens,
    seed: null,
    systemPrompt: null,
  });

  const engine = useChatEngine(reloadKey);
  const installed = useInstalledModels();
  const conversationList = useConversationList();
  const conversation = useConversation(conversationId, engine.status === 'ready', params);
  const tokensUsed = useTokenCount(conversation.state.messages, conversation.state.systemPrompt, engine.status === 'ready');

  useEffect(() => {
    loadSettings()
      .then((settings) => {
        setRemoteEnabled(settings.remoteEnabled);
        setParams((prev) => ({
          ...prev,
          nCtx: settings.nCtx,
          temperature: settings.temperature,
          topK: settings.topK,
          topP: settings.topP,
          maxTokens: settings.maxTokens,
        }));
      })
      .catch(() => undefined);
  }, []);

  const isCreatingFirstConversationRef = useRef(false);

  useEffect(() => {
    if (conversationId || conversationList.isLoading) return;

    if (conversationList.conversations.length > 0) {
      const first = conversationList.conversations[0];
      if (first) setConversationId(first.id);
      return;
    }

    // Nothing to switch to yet: create the first conversation automatically
    // rather than making a freshly-installed model's first chat depend on
    // an explicit "New" click. Guarded against re-entry, since this effect
    // re-runs while the create/refresh round trip is still in flight.
    if (engine.status === 'ready' && !isCreatingFirstConversationRef.current) {
      isCreatingFirstConversationRef.current = true;
      createNewConversation()
        .then((id) => {
          setConversationId(id);
          return conversationList.refresh();
        })
        .catch(() => undefined)
        .finally(() => {
          isCreatingFirstConversationRef.current = false;
        });
    }
  }, [conversationId, conversationList.isLoading, conversationList.conversations, conversationList.refresh, engine.status]);

  const handleNewConversation = useCallback(async () => {
    const id = await createNewConversation();
    await conversationList.refresh();
    setConversationId(id);
  }, [conversationList]);

  const handleDeleteConversation = useCallback(async () => {
    if (!conversationId) return;
    await removeConversation(conversationId);
    setConversationId(null);
    await conversationList.refresh();
  }, [conversationId, conversationList]);

  // Switching model is a reload of the engine, not a preference change -
  // setActiveModel persists the choice, and the reloadKey bump makes
  // useChatEngine unload the current model and load the new one. The bump
  // also bypasses the crash guard, which is correct: this is an explicit
  // user action, not an automatic retry of a load that killed the tab.
  const handleSwitchModel = useCallback(async (modelId: string) => {
    await setActiveModel(modelId);
    setReloadKey((k) => k + 1);
  }, []);

  const [grantAccessError, setGrantAccessError] = useState<string | null>(null);
  const [isGranting, setIsGranting] = useState(false);

  // requestPermission() on a file handle only succeeds with a live user
  // gesture behind it - some browsers (Samsung Internet among them) reject
  // it outright when it runs from a background effect, which is what the
  // automatic re-acquire on app start does. Calling it directly from this
  // button's click keeps that gesture intact. Every branch sets feedback -
  // a prior version left the button looking dead on a browser that denies
  // silently instead of throwing or showing its own prompt.
  const handleGrantAccess = useCallback(async () => {
    if (!engine.model) return;
    setGrantAccessError(null);
    setIsGranting(true);
    try {
      const result = await reacquireLocalFiles(engine.model);
      if (result.status === 'ok') {
        setReloadKey((k) => k + 1);
        return;
      }
      setGrantAccessError(
        result.status === 'permission-denied'
          ? 'This browser denied access without asking. Delete this model in Models and load it again.'
          : 'The original file could not be reopened. Delete this model in Models and load it again.',
      );
    } catch {
      setGrantAccessError('This browser could not reopen the file. Delete this model in Models and load it again.');
    } finally {
      setIsGranting(false);
    }
  }, [engine.model]);

  if (engine.status === 'no-model') {
    return (
      <Stack gap="lg" align="center" py="xl" data-testid="chat-first-run">
        <Title order={1}>Chat</Title>
        <Text c="dark.1" ta="center" maw={420}>
          No model is installed yet. Load one from this device or download one from the catalog to
          start chatting.
        </Text>
        <Group>
          <Button component="a" href="#/models">
            Go to Models
          </Button>
          {remoteEnabled && (
            <Button
              variant="subtle"
              onClick={() => void handleSwitchModel(REMOTE_MODEL_ID)}
              data-testid="use-remote-button"
            >
              Use the online API
            </Button>
          )}
        </Group>
      </Stack>
    );
  }

  if (engine.status === 'crash-risk') {
    return (
      <Stack gap="lg">
        <Title order={1}>Chat</Title>
        <Alert color="yellow" title="This model may have crashed the app last time">
          Loading {engine.model?.name ?? 'this model'} did not finish last time you opened the app -
          it likely ran out of memory and closed the tab. You can try again, or switch to a smaller
          model.
        </Alert>
        <Group>
          <Button onClick={() => setReloadKey((k) => k + 1)}>Load anyway</Button>
          <Button component="a" href="#/models" variant="subtle">
            Go to Models
          </Button>
        </Group>
      </Stack>
    );
  }

  if (engine.status === 'needs-permission') {
    return (
      <Stack gap="lg">
        <Title order={1}>Chat</Title>
        <Alert color="yellow" title="This model needs permission">
          {engine.model?.name ?? 'This model'} needs permission to re-access the file it was loaded
          from. Tap Grant access below - your browser may show its own file-access prompt.
        </Alert>
        {grantAccessError && (
          <Alert color="red" title="Still couldn't get access" data-testid="grant-access-error">
            {grantAccessError}
          </Alert>
        )}
        <Group>
          <Button onClick={() => void handleGrantAccess()} loading={isGranting} data-testid="grant-access-button">
            Grant access
          </Button>
          <Button component="a" href="#/models" variant="subtle">
            Go to Models
          </Button>
        </Group>
      </Stack>
    );
  }

  if (engine.status === 'missing' || engine.status === 'error') {
    return (
      <Stack gap="lg">
        <Title order={1}>Chat</Title>
        <Alert color="yellow" title="This model needs attention">
          {ENGINE_STATUS_MESSAGE[engine.status]}
        </Alert>
        <Group>
          <Button component="a" href="#/models">
            Go to Models
          </Button>
          <Button variant="subtle" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack
      gap="sm"
      data-testid="chat-screen"
      // AppShell.Main has no definite height of its own (it grows to fit
      // content), so a plain h="100%" here resolves against nothing and
      // the composer ends up pushed below the fold on any conversation
      // taller than one screen. Mantine's own AppShell CSS vars give the
      // real, viewport-accurate bound: the shell's header/footer offsets
      // plus the padding this AppShell.Main was given on both edges.
      style={{
        height:
          'calc(100dvh - var(--app-shell-header-offset, 0rem) - var(--app-shell-footer-offset, 0rem) - var(--app-shell-padding, 0rem) * 2)',
      }}
    >
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Stack gap={6} style={{ minWidth: 0 }}>
          <Title order={1} size="h4">
            Chat
          </Title>
          <Group gap="xs" wrap="wrap">
            <ModelSwitcher
              models={installed.models}
              activeModelId={engine.backend === 'remote' ? REMOTE_MODEL_ID : (engine.model?.modelId ?? null)}
              onChange={(modelId) => void handleSwitchModel(modelId)}
              includeRemote={remoteEnabled}
              disabled={conversation.state.isStreaming || engine.status === 'loading-model'}
              width={180}
            />
            <ModelHeader tier={engine.tier} isRemote={engine.backend === 'remote'} />
          </Group>
        </Stack>
        <Group gap="xs" wrap="wrap">
          <Select
            aria-label="Switch conversation"
            placeholder="Conversations"
            value={conversationId}
            onChange={setConversationId}
            data={conversationList.conversations.map((c) => ({ value: c.id, label: c.title }))}
            w={160}
            size="xs"
          />
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => void handleNewConversation()}>
            New
          </Button>
          {conversationId && (
            <SystemPromptControl systemPrompt={conversation.state.systemPrompt} onChange={(p) => void conversation.setSystemPrompt(p)} />
          )}
          {conversationId && (
            <ActionIcon
              size="lg"
              variant="subtle"
              color="red"
              aria-label="Delete conversation"
              onClick={() => void handleDeleteConversation()}
            >
              <IconTrash size={16} stroke={1.75} />
            </ActionIcon>
          )}
        </Group>
      </Group>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <Transcript
          isLoading={conversation.state.isLoading}
          errorMessage={conversation.state.errorMessage}
          messages={conversation.state.messages}
          isStreaming={conversation.state.isStreaming}
          onRegenerate={() => void conversation.regenerate()}
          onRetryLoad={() => setConversationId((id) => id)}
        />
      </div>

      {/* A failed generation leaves the transcript intact and reports
          beside it. Replacing the transcript here would throw away the
          partial reply that was just persisted, and the failure belongs to
          one turn, not to the conversation. */}
      {conversation.state.generationErrorMessage && (
        <Alert color="red" title="That reply did not finish" data-testid="generation-error">
          <Stack gap="xs">
            <Text size="sm">{conversation.state.generationErrorMessage}</Text>
            <Button
              size="xs"
              w="fit-content"
              onClick={() => void conversation.regenerate()}
              data-testid="generation-retry-button"
            >
              Try again
            </Button>
          </Stack>
        </Alert>
      )}

      <Composer
        disabled={!conversationId || engine.status !== 'ready'}
        isStreaming={conversation.state.isStreaming}
        tokensUsed={tokensUsed}
        nCtx={params.nCtx}
        modalities={engine.modalities}
        onSend={(text, attachments) => void conversation.sendMessage(text, attachments)}
        onStop={conversation.stop}
      />
    </Stack>
  );
}
