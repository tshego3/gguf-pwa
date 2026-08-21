export interface ParsedThinking {
  readonly thinking: string | null;
  readonly answer: string;
  readonly isThinking: boolean;
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

// Reasoning models (Qwen3 in thinking mode, DeepSeek-R1 distills, QwQ) emit
// their reasoning inline as <think>...</think> before the real answer, by
// convention - wllama is loaded with reasoning_format: 'deepseek-legacy'
// specifically so this stays a single text stream rather than a separate
// field our AsyncQueue<string> pipeline has no way to carry (P3-T7's chat()
// only yields plain token strings). Parsed client-side so the thinking
// trace renders as a distinct, collapsible block instead of leaking into
// the answer's markdown.
export function parseThinking(content: string): ParsedThinking {
  const openIndex = content.indexOf(THINK_OPEN);
  if (openIndex === -1) {
    return { thinking: null, answer: content, isThinking: false };
  }

  const afterOpen = content.slice(openIndex + THINK_OPEN.length);
  const closeIndex = afterOpen.indexOf(THINK_CLOSE);

  if (closeIndex === -1) {
    // Still streaming inside the think block - no answer content yet.
    return { thinking: afterOpen, answer: '', isThinking: true };
  }

  const thinking = afterOpen.slice(0, closeIndex);
  const answer = afterOpen.slice(closeIndex + THINK_CLOSE.length);
  return { thinking: thinking.trim(), answer: answer.trim(), isThinking: false };
}
