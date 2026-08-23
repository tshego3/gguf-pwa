// Turns OpenAI-shaped stream deltas into the plain text the PWA renders,
// and accumulates any tool call the model asks for along the way.
//
// Two things happen here beyond concatenation:
//
// 1. `reasoning_content` (NVIDIA and DeepSeek-family models emit it as a
//    separate field) is wrapped in <think></think>. That is the exact
//    convention src/components/thinking.ts already parses for local
//    reasoning models, so the online path gets the same collapsible trace
//    without the client learning a second format.
// 2. `tool_calls` arrive as fragments spread over many chunks - an id in
//    one, a name in another, the arguments JSON a few characters at a time -
//    keyed by `index`. They are reassembled here and only executed once the
//    stream reports finish_reason: 'tool_calls'.
//
// The payloads are third-party JSON, so every field is narrowed before use
// and nothing is trusted to be the shape the spec promises.

export interface ToolCallDraft {
  id: string;
  name: string;
  args: string;
}

export interface StreamState {
  readonly toolCalls: Map<number, ToolCallDraft>;
  reasoningOpen: boolean;
  finishReason: string | null;
  emittedText: boolean;
}

export function createStreamState(): StreamState {
  return { toolCalls: new Map(), reasoningOpen: false, finishReason: null, emittedText: false };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readToolCallFragments(state: StreamState, delta: Record<string, unknown>): void {
  const calls = delta.tool_calls;
  if (!Array.isArray(calls)) return;

  for (let position = 0; position < calls.length; position++) {
    const call = asRecord(calls[position]);
    if (!call) continue;
    const index = typeof call.index === 'number' ? call.index : position;
    const draft = state.toolCalls.get(index) ?? { id: '', name: '', args: '' };
    if (typeof call.id === 'string' && call.id) draft.id = call.id;

    const fn = asRecord(call.function);
    if (fn) {
      if (typeof fn.name === 'string' && fn.name) draft.name = fn.name;
      draft.args += asString(fn.arguments);
    }
    state.toolCalls.set(index, draft);
  }
}

// Returns the text to forward to the client for this payload. An empty
// string means the payload carried no visible output (a tool fragment, a
// keepalive, a role-only first chunk).
export function applyChunk(state: StreamState, payload: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return '';
  }

  const root = asRecord(parsed);
  const choices = root?.choices;
  if (!Array.isArray(choices)) return '';
  const choice = asRecord(choices[0]);
  if (!choice) return '';

  if (typeof choice.finish_reason === 'string') state.finishReason = choice.finish_reason;

  const delta = asRecord(choice.delta);
  if (!delta) return '';

  readToolCallFragments(state, delta);

  let out = '';
  const reasoning = asString(delta.reasoning_content) || asString(delta.reasoning);
  if (reasoning) {
    if (!state.reasoningOpen) {
      state.reasoningOpen = true;
      out += '<think>';
    }
    out += reasoning;
  }

  const content = asString(delta.content);
  if (content) {
    if (state.reasoningOpen) {
      state.reasoningOpen = false;
      out += '</think>';
    }
    out += content;
  }

  if (out) state.emittedText = true;
  return out;
}

// Closes an unterminated reasoning block so the client never renders a
// think trace that swallows the whole reply.
export function closeReasoning(state: StreamState): string {
  if (!state.reasoningOpen) return '';
  state.reasoningOpen = false;
  return '</think>';
}

export function collectToolCalls(state: StreamState): readonly ToolCallDraft[] {
  return [...state.toolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, draft]) => draft)
    .filter((draft) => draft.name !== '');
}
