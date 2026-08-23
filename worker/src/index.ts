// gguf-pwa online API proxy.
//
// The PWA is a public static site, so it cannot hold an API key: anything
// in the bundle is readable by anyone. This Worker holds the keys instead
// and is the only piece of the project with a running cost, which is why
// rate limiting and a prompt-size cap are in the request path rather than
// on a list of follow-ups.
//
// It answers a single streamed text/plain body, which is exactly what
// src/engine/remote.ts already knows how to read - to the PWA this is one
// more provider, sitting ahead of the two keyless endpoints that remain as
// the fallback when every keyed provider here is out of quota.
import { positiveInt, type Env } from './env';
import { classifyChainFailure, providerStatus, resolveProviders } from './providers';
import { buildToolRegistry } from './tools';
import { probeProvider, streamProvider, UpstreamError, type ChatMessage } from './upstream';

const DEFAULT_MAX_PROMPT_CHARS = 24_000;
const MAX_MESSAGES = 64;

type Role = ChatMessage['role'];
const INPUT_ROLES: readonly Role[] = ['system', 'user', 'assistant'];

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').trim();
  const origin = request.headers.get('Origin');
  const value = allowed === '*' || !origin ? '*' : allowList(allowed, origin);
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Expose-Headers': 'X-Gguf-Provider, X-Gguf-Model',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function allowList(allowed: string, origin: string): string {
  const entries = allowed.split(',').map((entry) => entry.trim());
  return entries.includes(origin) ? origin : entries[0] ?? '*';
}

function textResponse(body: string, status: number, headers: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export type ParsedRequest =
  | { readonly ok: true; readonly messages: readonly ChatMessage[] }
  | { readonly ok: false; readonly reason: string };

// Accepts either shape the PWA can send: a single flattened prompt (the
// `{prompt}` template every keyless provider uses), or the real role array,
// which is what a chat-completions upstream actually wants and what the
// PWA posts to this Worker.
export function parseChatInput(input: unknown, maxChars: number): ParsedRequest {
  const record = asRecord(input);
  if (!record) return { ok: false, reason: 'The request body must be a JSON object.' };

  if (typeof record.prompt === 'string') {
    const prompt = record.prompt.trim();
    if (!prompt) return { ok: false, reason: 'The prompt is empty.' };
    if (prompt.length > maxChars) return { ok: false, reason: 'The prompt is too long.' };
    return { ok: true, messages: [{ role: 'user', content: prompt }] };
  }

  const raw = record.messages;
  if (!Array.isArray(raw)) return { ok: false, reason: 'Send either a prompt string or a messages array.' };
  if (raw.length === 0) return { ok: false, reason: 'The messages array is empty.' };
  if (raw.length > MAX_MESSAGES) return { ok: false, reason: 'Too many messages in one request.' };

  const messages: ChatMessage[] = [];
  let total = 0;
  for (const entry of raw) {
    const message = asRecord(entry);
    const role = message?.role;
    const content = message?.content;
    if (typeof role !== 'string' || !INPUT_ROLES.includes(role as Role)) {
      return { ok: false, reason: 'Each message needs a role of system, user or assistant.' };
    }
    if (typeof content !== 'string') return { ok: false, reason: 'Each message needs string content.' };
    total += content.length;
    if (total > maxChars) return { ok: false, reason: 'The conversation is too long.' };
    messages.push({ role: role as Role, content });
  }
  return { ok: true, messages };
}

async function readInput(request: Request, maxChars: number): Promise<ParsedRequest> {
  if (request.method === 'GET') {
    const prompt = new URL(request.url).searchParams.get('prompt') ?? '';
    return parseChatInput({ prompt }, maxChars);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, reason: 'The request body was not valid JSON.' };
  }
  return parseChatInput(body, maxChars);
}

async function withinRateLimit(env: Env, request: Request): Promise<boolean> {
  const limiter = env.RATE_LIMITER;
  if (!limiter) return true;
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await limiter.limit({ key });
  return success;
}

// Pulls the first visible token before answering, so a provider that fails
// on connect, on status, or with an empty stream is replaced silently. Once
// this returns, the reply belongs to that provider.
async function openFirstWorkingProvider(
  env: Env,
  messages: readonly ChatMessage[],
  signal: AbortSignal,
): Promise<
  | { readonly ok: true; readonly provider: string; readonly model: string; readonly first: string; readonly rest: AsyncGenerator<string> }
  | { readonly ok: false; readonly status: number; readonly detail: string }
> {
  const providers = resolveProviders(env);
  if (providers.length === 0) {
    return { ok: false, status: 503, detail: 'No upstream provider is configured on this proxy.' };
  }

  const registry = buildToolRegistry(env);
  const statuses: number[] = [];
  let lastDetail = 'No upstream provider answered.';

  for (const provider of providers) {
    const rest = streamProvider(provider, messages, registry, signal);
    try {
      const first = await rest.next();
      if (first.done) {
        statuses.push(502);
        lastDetail = `${provider.name} returned nothing.`;
        continue;
      }
      return { ok: true, provider: provider.id, model: provider.model, first: first.value, rest };
    } catch (error) {
      await rest.return(undefined).catch(() => undefined);
      if (error instanceof UpstreamError) {
        statuses.push(error.status);
        lastDetail = `${error.provider} refused the request (${error.status}).`;
      } else {
        // No status at all: a connection failure or a timeout.
        statuses.push(0);
        lastDetail = `${provider.name} did not respond.`;
      }
    }
  }
  return { ok: false, status: classifyChainFailure(statuses), detail: lastDetail };
}

function toStream(first: string, rest: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(first));
    },
    async pull(controller) {
      try {
        const next = await rest.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      } catch {
        // Committed to this provider already, so there is nowhere to fail
        // over to. Erroring the stream is honest; a truncated answer that
        // looks complete is not.
        controller.error(new Error('The upstream stopped mid-reply.'));
      }
    },
    cancel() {
      void rest.return(undefined).catch(() => undefined);
    },
  });
}

async function handleChat(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!(await withinRateLimit(env, request))) {
    return textResponse('Too many requests. Wait a minute and try again.', 429, cors);
  }

  const maxChars = positiveInt(env.MAX_PROMPT_CHARS, DEFAULT_MAX_PROMPT_CHARS);
  const parsed = await readInput(request, maxChars);
  if (!parsed.ok) return textResponse(parsed.reason, 400, cors);

  const opened = await openFirstWorkingProvider(env, parsed.messages, request.signal);
  if (!opened.ok) return textResponse(opened.detail, opened.status, cors);

  return new Response(toStream(opened.first, opened.rest), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Gguf-Provider': opened.provider,
      'X-Gguf-Model': opened.model,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      // ?probe=1 actually calls each provider for one token, so it spends
      // real quota and is throttled like a chat request. Plain /health stays
      // free and answers from config alone.
      const probing = url.searchParams.has('probe');
      if (probing && !(await withinRateLimit(env, request))) {
        return textResponse('Too many requests. Wait a minute and try again.', 429, cors);
      }
      const body = JSON.stringify({
        ok: true,
        providers: providerStatus(env),
        webFetchTool: buildToolRegistry(env).has('fetch_url'),
        ...(probing ? { probe: await Promise.all(resolveProviders(env).map(probeProvider)) } : {}),
      });
      return new Response(body, {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return textResponse('Use GET with ?prompt= or POST a JSON body.', 405, cors);
    }

    return handleChat(request, env, cors);
  },
};
