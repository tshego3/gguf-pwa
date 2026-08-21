import { Collapse, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ThinkingBlockProps {
  readonly thinking: string;
  readonly isThinking: boolean;
}

// Reasoning models expose their <think> trace as plain text, not markdown -
// rendered directly (React escapes it by default, same as a user message)
// rather than through MarkdownMessage's marked+DOMPurify pass, since it is
// not intended to be read as formatted output. Open by default while the
// model is still thinking, so the user can watch it work; collapses once
// the real answer starts, matching the common pattern for this UI element.
export function ThinkingBlock({ thinking, isThinking }: ThinkingBlockProps): ReactNode {
  const [expanded, setExpanded] = useState(true);
  const wasThinking = useRef(isThinking);

  useEffect(() => {
    if (wasThinking.current && !isThinking) setExpanded(false);
    wasThinking.current = isThinking;
  }, [isThinking]);

  if (!thinking && !isThinking) return null;

  return (
    <div data-testid="thinking-block">
      <UnstyledButton
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        data-testid="thinking-toggle"
      >
        <Group gap={6}>
          {expanded ? <IconChevronDown size={14} stroke={1.75} /> : <IconChevronRight size={14} stroke={1.75} />}
          {isThinking && <Loader size="xs" />}
          <Text size="xs" c="dark.1" fw={600}>
            {isThinking ? 'Thinking…' : 'Thought'}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={expanded}>
        <Text size="xs" c="dark.1" style={{ whiteSpace: 'pre-wrap' }} mt={4} ml={20} data-testid="thinking-content">
          {thinking}
        </Text>
      </Collapse>
    </div>
  );
}
