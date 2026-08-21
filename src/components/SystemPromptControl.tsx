import { ActionIcon, Button, Group, Modal, ScrollArea, Stack, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { IconMessage2Bolt, IconTrash } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { usePromptLibrary } from '../hooks/usePromptLibrary';

interface SystemPromptControlProps {
  readonly systemPrompt: string | null;
  readonly onChange: (prompt: string | null) => void;
}

// Nearly free per the plan's own assessment of this candidate - a system
// prompt is a property of the conversation, and a small library of saved
// ones is reused across conversations (P6-C1).
export function SystemPromptControl({ systemPrompt, onChange }: SystemPromptControlProps): ReactNode {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(systemPrompt ?? '');
  const [saveName, setSaveName] = useState('');
  const library = usePromptLibrary();

  useEffect(() => {
    if (opened) setDraft(systemPrompt ?? '');
  }, [opened, systemPrompt]);

  function handleApply(): void {
    onChange(draft.trim() ? draft.trim() : null);
    setOpened(false);
  }

  function handleClear(): void {
    setDraft('');
    onChange(null);
    setOpened(false);
  }

  async function handleSaveToLibrary(): Promise<void> {
    const name = saveName.trim() || draft.trim().slice(0, 40) || 'Untitled prompt';
    if (!draft.trim()) return;
    await library.save(name, draft.trim());
    setSaveName('');
  }

  return (
    <>
      <Tooltip label={systemPrompt ? 'Edit system prompt' : 'Add a system prompt'}>
        <ActionIcon
          size={36}
          variant={systemPrompt ? 'filled' : 'subtle'}
          aria-label="System prompt"
          onClick={() => setOpened(true)}
          data-testid="system-prompt-button"
        >
          <IconMessage2Bolt size={18} stroke={1.75} />
        </ActionIcon>
      </Tooltip>

      <Modal opened={opened} onClose={() => setOpened(false)} title="System prompt" size="lg">
        <Stack gap="md">
          <Text size="sm" c="dark.1">
            Applies to this conversation only, and counts toward its context budget.
          </Text>
          <Textarea
            aria-label="System prompt text"
            placeholder="e.g. Answer concisely. Prefer bullet points."
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            minRows={4}
            autosize
            maxRows={10}
            data-testid="system-prompt-textarea"
          />

          <Group gap="xs">
            <TextInput
              aria-label="Name for library"
              placeholder="Save as…"
              value={saveName}
              onChange={(event) => setSaveName(event.currentTarget.value)}
              style={{ flex: 1 }}
              size="xs"
            />
            <Button size="xs" variant="default" onClick={() => void handleSaveToLibrary()} disabled={!draft.trim()}>
              Save to library
            </Button>
          </Group>

          {library.prompts.length > 0 && (
            <Stack gap={4}>
              <Text size="xs" fw={600}>
                Library
              </Text>
              <ScrollArea.Autosize mah={160}>
                <Stack gap={4}>
                  {library.prompts.map((prompt) => (
                    <Group key={prompt.id} justify="space-between" wrap="nowrap" gap="xs">
                      <Button
                        variant="subtle"
                        size="xs"
                        justify="flex-start"
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => setDraft(prompt.content)}
                        data-testid="prompt-library-entry"
                      >
                        <Text size="xs" truncate>
                          {prompt.name}
                        </Text>
                      </Button>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={`Delete ${prompt.name}`}
                        onClick={() => void library.remove(prompt.id)}
                      >
                        <IconTrash size={14} stroke={1.75} />
                      </ActionIcon>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>
          )}

          <Group justify="space-between">
            <Button variant="subtle" color="red" onClick={handleClear} disabled={!systemPrompt}>
              Clear
            </Button>
            <Button onClick={handleApply} data-testid="system-prompt-apply">
              Apply
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
