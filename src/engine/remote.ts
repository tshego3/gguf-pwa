// The online API backend. It sits beside the wllama worker behind the same
// engine barrel, so nothing above src/engine/ knows which one answered.
//
// Unlike the local path this one leaves the device, so it is opt-in, the
// UI names it, and this file holds no key of any kind - the keyless
// endpoints need none, and the keyed ones are reached through a Cloudflare
// Worker that holds the key on its side (worker/). Failures fall through to
// the next provider only while nothing has been shown yet; once a reply has
// started streaming a failure is reported rather than silently restarted
// somewhere else.
import { buildRemoteUrl, type RemoteProvider } from '../types/remote';
import type { EngineError } from '../types';
import type { EngineChatMessage } from './protocol';

// Bounds the wait for response headers only. The timer is cleared once
// they arrive, because a long generation legitimately streams for longer
// than any header timeout should allow.
const HEADERS_TIMEOUT_MS = 30_000;

// Deterministic upper bound on the read loop that looks for the first
// non-empty chunk (robust-coding rule: every loop terminates).
const MAX_EMPTY_READS = 64;

const ROLE_LABEL: Record<EngineChatMessage['role'], string> = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
};

let activeController: AbortController | null = null;
let abortedByUser = false;

function inferenceError(message: string): EngineError {
  return { type: 'inference', message };
}

// These endpoints take one prompt string, not a role array. A first turn
// is sent as the bare text so the reply is not shaped by transcript
// formatting it never asked for; anything longer is labelled, which is the
// only way a stateless GET endpoint can see the history at all.
export function flattenMessages(messages: readonly EngineChatMessage[]): string {
  const system = messages.find((m) => m.role === 'system')?.content.trim() ?? '';
  const turns = messages.filter((m) => m.role !== 'system');
  const lastTurn = turns[turns.length - 1];

  if (turns.length <= 1) {
    const text = lastTurn?.content.trim() ?? '';
    return system ? `${system}\n\n${text}` : text;
  }

  const transcript = turns.map((m) => `${ROLE_LABEL[m.role]}: ${m.content.trim()}`).join('\n\n');
  const body = `${transcript}\n\n${ROLE_LABEL.assistant}:`;
  return system ? `${system}\n\n${body}` : body;
}

// Roughly four characters per token. The online path has no tokenizer to
// ask, and the context meter is a budget indicator, not an invoice.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const JSON_TEXT_KEYS: readonly string[] = ['message', 'response', 'result', 'text', 'content', 'answer', 'data', 'output'];

// Strings a provider returns in the reply slot when its own upstream
// failed, while still answering HTTP 200 with a success-shaped body. The
// prexzyapis ai4chat endpoint does exactly this today: every prompt comes
// back as {"status":true,...,"data":{"response":"Invalid Request"}}.
// Without this check that string would be rendered as the assistant's
// answer instead of failing over to nothing, which is worse than an error.
// Matched whole, case-insensitively, so a real reply containing these
// words is unaffected.
const NON_REPLY_SENTINELS: readonly string[] = [
  'invalid request',
  'bad request',
  'error',
  'not found',
  'internal server error',
  'service unavailable',
];

export function isNonReply(text: string): boolean {
  return NON_REPLY_SENTINELS.includes(text.trim().toLowerCase());
}

// Walks a JSON body for the first plausible reply string. Depth-bounded,
// because an unknown third-party shape is untrusted input and must not be
// able to drive an unbounded traversal.
function extractJsonText(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (depth >= 4 || value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = extractJsonText(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of JSON_TEXT_KEYS) {
    if (key in record) {
      const found = extractJsonText(record[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function* oneShot(text: string): AsyncIterable<string> {
  yield text;
}

async function* streamRest(
  first: string,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): AsyncIterable<string> {
  yield first;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      const tail = decoder.decode();
      if (tail) yield tail;
      return;
    }
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) yield chunk;
  }
}

async function readFirstChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string> {
  for (let i = 0; i < MAX_EMPTY_READS; i++) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk.trim()) return chunk;
  }
  throw inferenceError('The online API returned an empty reply.');
}

// Sends the prompt to one provider and returns a stream only once the
// response has proved itself - status checked, body opened, first real
// chunk in hand. That is what lets the caller fall back to the next
// provider without ever having shown half a reply from this one.
// A success-shaped body that is actually a failure. Checked before the
// reply is extracted, because these providers answer HTTP 200 either way.
function isFailureBody(body: unknown): boolean {
  if (body === null || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  if (record.status === false) return true;
  return typeof record.error === 'string' && record.error.trim().length > 0;
}

// A GET endpoint takes the flattened prompt in the URL. A POST endpoint
// takes the real role array in the body, which is both a better prompt for
// a chat-completions upstream and the only shape that survives a
// conversation carrying extracted attachment text - a URL has a length
// ceiling and a message body does not. Image bytes are dropped rather than
// serialised: only the local path can carry them.
function requestInit(
  provider: RemoteProvider,
  messages: readonly EngineChatMessage[],
  controller: AbortController,
): RequestInit {
  const common = {
    signal: controller.signal,
    referrerPolicy: 'no-referrer',
    credentials: 'omit',
  } as const satisfies RequestInit;

  if (provider.method !== 'POST') {
    return { ...common, method: 'GET', headers: { Accept: 'text/plain, application/json' } };
  }
  return {
    ...common,
    method: 'POST',
    headers: { Accept: 'text/plain, application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    }),
  };
}

async function startAttempt(
  provider: RemoteProvider,
  messages: readonly EngineChatMessage[],
  prompt: string,
  controller: AbortController,
): Promise<AsyncIterable<string>> {
  // Aborts this attempt's own controller, not whichever one happens to be
  // active - a timer left over from an abandoned request must never kill
  // the request that replaced it.
  const timer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(
      buildRemoteUrl(provider.urlTemplate, prompt),
      requestInit(provider, messages, controller),
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw inferenceError(`${provider.name} refused the request (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    const body: unknown = await response.json();
    if (isFailureBody(body)) throw inferenceError(`${provider.name} rejected the request.`);
    const text = extractJsonText(body);
    if (!text) throw inferenceError(`${provider.name} returned a reply this app could not read.`);
    if (isNonReply(text)) throw inferenceError(`${provider.name} could not answer this prompt.`);
    return oneShot(text);
  }

  const body = response.body;
  if (!body) {
    const text = (await response.text()).trim();
    if (!text) throw inferenceError('The online API returned an empty reply.');
    if (isNonReply(text)) throw inferenceError(`${provider.name} could not answer this prompt.`);
    return oneShot(text);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const first = await readFirstChunk(reader, decoder);
  return streamRest(first, reader, decoder);
}

// Tries each enabled provider in order. Index 0 is the primary; the rest
// are fallbacks, reached only when the one before failed before producing
// any output.
export async function* remoteChat(
  messages: readonly EngineChatMessage[],
  providers: readonly RemoteProvider[],
): AsyncIterable<string> {
  const enabled = providers.filter((p) => p.enabled);
  if (enabled.length === 0) {
    throw inferenceError('No online API is configured. Add one in Settings, or pick a downloaded model.');
  }
  if (!navigator.onLine) {
    throw inferenceError('This device is offline. The online API needs a connection - a downloaded model does not.');
  }

  const prompt = flattenMessages(messages);
  const controller = new AbortController();
  activeController = controller;
  abortedByUser = false;

  let lastError: EngineError = inferenceError('The online API could not be reached.');

  try {
    for (const provider of enabled) {
      let stream: AsyncIterable<string>;
      try {
        stream = await startAttempt(provider, messages, prompt, controller);
      } catch (error) {
        if (abortedByUser) throw { type: 'aborted', message: '' } satisfies EngineError;
        lastError = toEngineError(error, provider);
        continue;
      }
      try {
        yield* stream;
      } catch (error) {
        if (abortedByUser) throw { type: 'aborted', message: '' } satisfies EngineError;
        throw toEngineError(error, provider);
      }
      return;
    }
    // Naming only the last provider would read as if one endpoint failed,
    // when every configured one did.
    throw enabled.length > 1
      ? inferenceError(`No online endpoint answered. Last try: ${lastError.message}`)
      : lastError;
  } finally {
    if (activeController === controller) activeController = null;
  }
}

function toEngineError(error: unknown, provider: RemoteProvider): EngineError {
  if (error && typeof error === 'object' && 'type' in error) return error as EngineError;
  return inferenceError(`${provider.name} did not respond.`);
}

export function remoteAbort(): void {
  abortedByUser = true;
  activeController?.abort();
  activeController = null;
}
