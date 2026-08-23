// One OpenAI-compatible chat-completions adapter, used for all three
// providers, plus the tool-calling loop that sits on top of it.
//
// The ordering rule matches the PWA's own: a provider is only committed to
// once it has produced real output. Everything before the first token -
// connecting, a non-2xx status, an empty stream, a tools rejection - falls
// through to the next provider silently. After the first token the reply
// belongs to that provider, and a later failure ends the stream as an error
// rather than restarting somewhere else, because half a reply from one
// model followed by half from another is worse than a visible failure.
import { collectToolCalls, applyChunk, closeReasoning, createStreamState } from './deltas';
import { isToolRejection, shouldFailOver, type UpstreamProvider } from './providers';
import { createSseParser, SSE_DONE } from './sse';
import { runToolCall, toolSpecs, type Tool, type ToolSpec } from './tools';

// Three rounds is enough for "call a tool, read the result, answer", with
// one spare. The last round never offers tools, so the loop cannot end on a
// tool call it has no round left to satisfy.
const MAX_TOOL_ROUNDS = 3;
const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_TOOL_OUTPUT_CHARS = 8_000;

export interface UpstreamToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly UpstreamToolCall[];
}

export class UpstreamError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

type Opened =
  | { readonly ok: true; readonly body: ReadableStream<Uint8Array> }
  | { readonly ok: false; readonly status: number; readonly detail: string };

async function postCompletion(
  provider: UpstreamProvider,
  messages: readonly ChatMessage[],
  specs: readonly ToolSpec[] | null,
  signal: AbortSignal,
  overrides: Record<string, unknown> = {},
): Promise<Response> {
  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    stream: true,
    ...overrides,
  };
  if (specs && specs.length > 0) {
    payload.tools = specs;
    payload.tool_choice = 'auto';
  }

  return fetch(provider.url, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });
}

// At most two requests: the asked-for one, and a retry without tools when
// the upstream rejects the tools array. A model that cannot do tool calling
// should still answer.
async function openUpstream(
  provider: UpstreamProvider,
  messages: readonly ChatMessage[],
  specs: readonly ToolSpec[] | null,
  signal: AbortSignal,
): Promise<Opened> {
  let response = await postCompletion(provider, messages, specs, signal);

  if (shouldFailOver(response.status)) {
    const detail = (await response.text()).slice(0, 500);
    if (specs && isToolRejection(response.status, detail)) {
      response = await postCompletion(provider, messages, null, signal);
      if (shouldFailOver(response.status)) {
        return { ok: false, status: response.status, detail: (await response.text()).slice(0, 500) };
      }
    } else {
      return { ok: false, status: response.status, detail };
    }
  }

  const body = response.body;
  if (!body) return { ok: false, status: response.status, detail: 'empty body' };
  return { ok: true, body };
}

async function* readDeltas(
  body: ReadableStream<Uint8Array>,
  state: ReturnType<typeof createStreamState>,
): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const payload of parser.push(value)) {
        if (payload === SSE_DONE || payload === '') continue;
        const text = applyChunk(state, payload);
        if (text) yield text;
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function toUpstreamCalls(drafts: readonly { id: string; name: string; args: string }[]): readonly UpstreamToolCall[] {
  return drafts.map((draft, index) => ({
    id: draft.id || `call_${index}`,
    type: 'function' as const,
    function: { name: draft.name, arguments: draft.args || '{}' },
  }));
}

// Streams one provider's answer, running any tool the model asks for and
// feeding the result back in. Yields only visible text.
export async function* streamProvider(
  provider: UpstreamProvider,
  initialMessages: readonly ChatMessage[],
  registry: ReadonlyMap<string, Tool>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const messages: ChatMessage[] = [...initialMessages];
  const offersTools = provider.supportsTools && registry.size > 0;
  // Tracked across rounds, not per round: a tool round legitimately emits
  // nothing, and only a provider that said nothing at all has failed.
  let emittedAnything = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    const specs = offersTools && !lastRound ? toolSpecs(registry) : null;

    const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
    const opened = await openUpstream(provider, messages, specs, AbortSignal.any([signal, timeout]));
    if (!opened.ok) {
      throw new UpstreamError(provider.name, opened.status, opened.detail);
    }

    const state = createStreamState();
    yield* readDeltas(opened.body, state);
    if (state.emittedText) emittedAnything = true;
    const tail = closeReasoning(state);
    if (tail) yield tail;

    const drafts = collectToolCalls(state);
    if (drafts.length === 0) {
      if (!emittedAnything) {
        throw new UpstreamError(provider.name, 502, 'the stream carried no reply');
      }
      return;
    }

    const calls = toUpstreamCalls(drafts);
    messages.push({ role: 'assistant', content: null, tool_calls: calls });
    for (const call of calls) {
      const output = await runToolCall(registry, call.function.name, call.function.arguments);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: output.slice(0, MAX_TOOL_OUTPUT_CHARS),
      });
    }
  }

  throw new UpstreamError(provider.name, 508, 'the model kept calling tools without answering');
}

export interface ProbeResult {
  readonly id: string;
  readonly model: string;
  readonly status: number;
  readonly ok: boolean;
  readonly ms: number;
  readonly detail: string;
}

// Deliberately shorter than the chat path's 60s but long enough to outlast
// a cold start. A provider that misses this is not necessarily dead - the
// reported `ms` is what separates "slow to wake" from "unreachable", and
// guessing between those two from a bare timeout wasted a round trip once
// already.
const PROBE_TIMEOUT_MS = 45_000;

// Asks one provider for a single token and reports what came back. This is
// the only way to see why a configured provider is being skipped: the chat
// path deliberately swallows a provider's failure and moves on, which is
// right for a user waiting on a reply and useless when you are the operator
// trying to find out whether a key is dead, a model name is wrong, or a
// quota is spent. Costs one token per provider, so it is rate limited like
// any other request and never runs unless asked for.
export async function probeProvider(provider: UpstreamProvider): Promise<ProbeResult> {
  const started = Date.now();
  const base = { id: provider.id, model: provider.model } as const;
  try {
    // Streams like the chat path does, rather than asking for a
    // non-streaming reply: the request headers already say
    // Accept: text/event-stream, and NVIDIA hangs until the timeout when a
    // stream:false body contradicts that. The status is all this needs, so
    // the body is cancelled the moment it arrives.
    const response = await postCompletion(
      provider,
      [{ role: 'user', content: 'ping' }],
      null,
      AbortSignal.timeout(PROBE_TIMEOUT_MS),
      { max_tokens: 1 },
    );
    if (response.ok) {
      await response.body?.cancel();
      return { ...base, status: response.status, ok: true, ms: Date.now() - started, detail: '' };
    }
    const detail = (await response.text()).slice(0, 300);
    return { ...base, status: response.status, ok: false, ms: Date.now() - started, detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'request failed';
    return { ...base, status: 0, ok: false, ms: Date.now() - started, detail };
  }
}
