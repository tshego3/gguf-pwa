// The keyed upstream chain, in the order the user asked for: Ollama first,
// then Hugging Face, then NVIDIA NIM. All three speak the OpenAI
// chat-completions shape, so one adapter covers them and a provider is just
// a URL, a model name and a key.
//
// A provider whose key is absent is dropped here rather than attempted, so
// "out of quota" and "not configured" never look the same to the caller.
// When every provider in this chain is exhausted the Worker answers with an
// error status, and the PWA falls through to its two keyless endpoints.
import { isEnabled, type Env } from './env';

export type ProviderId = 'ollama' | 'huggingface' | 'nvidia';

export interface UpstreamProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly url: string;
  readonly model: string;
  readonly apiKey: string;
  readonly supportsTools: boolean;
}

interface ProviderSpec {
  readonly id: ProviderId;
  readonly name: string;
  readonly url: string;
  readonly defaultModel: string;
  key(env: Env): string | undefined;
  model(env: Env): string | undefined;
  tools(env: Env): string | undefined;
}

// Default models are tool-capable instruct models on each service. They are
// deliberately overridable: the deployer picks, and nothing here depends on
// a particular one.
const SPECS: readonly ProviderSpec[] = [
  {
    id: 'ollama',
    name: 'Ollama Cloud',
    url: 'https://ollama.com/v1/chat/completions',
    defaultModel: 'gpt-oss:120b',
    key: (env) => env.OLLAMA_API_KEY,
    model: (env) => env.OLLAMA_MODEL,
    tools: (env) => env.OLLAMA_TOOLS,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Router',
    url: 'https://router.huggingface.co/v1/chat/completions',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    key: (env) => env.HUGGINGFACE_API_KEY,
    model: (env) => env.HUGGINGFACE_MODEL,
    tools: (env) => env.HUGGINGFACE_TOOLS,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    key: (env) => env.NVIDIA_API_KEY,
    model: (env) => env.NVIDIA_MODEL,
    tools: (env) => env.NVIDIA_TOOLS,
  },
];

export function resolveProviders(env: Env): readonly UpstreamProvider[] {
  const resolved: UpstreamProvider[] = [];
  for (const spec of SPECS) {
    const apiKey = spec.key(env)?.trim();
    if (!apiKey) continue;
    resolved.push({
      id: spec.id,
      name: spec.name,
      url: spec.url,
      model: spec.model(env)?.trim() || spec.defaultModel,
      apiKey,
      supportsTools: isEnabled(spec.tools(env), true),
    });
  }
  return resolved;
}

// Which providers exist and which are configured, for GET /health. Never
// includes a key or any part of one.
export function providerStatus(env: Env): readonly { readonly id: ProviderId; readonly configured: boolean }[] {
  return SPECS.map((spec) => ({ id: spec.id, configured: Boolean(spec.key(env)?.trim()) }));
}

// Every non-2xx from an upstream moves to the next provider. Quota
// exhaustion is a 429 on all three services, and an expired or revoked key
// is a 401/403; both mean "this provider cannot answer", which is the same
// decision. Distinguishing them would only change a log line.
export function shouldFailOver(status: number): boolean {
  return status < 200 || status >= 300;
}

// A 400 that names tools is the one upstream failure worth retrying on the
// same provider: the model does not accept a tools array, so ask it again
// without one instead of burning a provider that is otherwise healthy.
export function isToolRejection(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /tool|function[_ ]call/i.test(body);
}

// Why the whole chain failed, expressed as the status the Worker answers
// with. The PWA turns that one number into a sentence, which is the only
// safe way to do it: an upstream's error body is a third party's text and
// must never reach a user's screen, but a status code is bounded data.
//
// Agreement is the rule - a class is only reported when every provider said
// it, because "all three keys are dead" and "one key is dead" need
// different words. Credit exhaustion is the exception: it is the most
// actionable failure here and the one most likely to be fixed by the
// person reading it, so a single provider reporting it is enough.
export function classifyChainFailure(statuses: readonly number[]): number {
  if (statuses.length === 0) return 503;
  if (statuses.includes(402)) return 402;
  if (statuses.every((status) => status === 401 || status === 403)) return 401;
  if (statuses.every((status) => status === 429)) return 429;
  // 0 is this Worker's own marker for "never answered" - a connection
  // failure or a timeout, neither of which carries an HTTP status.
  if (statuses.every((status) => status === 0)) return 504;
  return 502;
}
