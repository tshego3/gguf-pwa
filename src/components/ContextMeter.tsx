import { Progress, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface ContextMeterProps {
  readonly tokensUsed: number;
  readonly nCtx: number;
}

const WARNING_THRESHOLD = 0.85;

// Tokens used against n_ctx, turning warning-toned as the window fills.
// The truncation policy is stated in words, not implied (P4-T9, design
// skill's context-meter pattern).
export function ContextMeter({ tokensUsed, nCtx }: ContextMeterProps): ReactNode {
  const percent = nCtx > 0 ? Math.min(100, Math.round((tokensUsed / nCtx) * 100)) : 0;
  const isWarning = percent / 100 >= WARNING_THRESHOLD;

  return (
    <Stack gap={2} data-testid="context-meter">
      <Text size="xs" c={isWarning ? 'yellow' : 'dark.1'} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {tokensUsed.toLocaleString()} / {nCtx.toLocaleString()} tokens
        {isWarning && ' - context window nearly full. The oldest messages will drop from the prompt next.'}
      </Text>
      <Progress value={percent} color={isWarning ? 'yellow' : undefined} size="xs" aria-label="Context window used" />
    </Stack>
  );
}
