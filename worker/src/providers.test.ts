import { describe, expect, it } from 'vitest';
import { classifyChainFailure, isToolRejection, providerStatus, resolveProviders, shouldFailOver } from './providers';
import type { Env } from './env';

describe('resolveProviders', () => {
  // The order is the product decision: Ollama until its quota is gone, then
  // Hugging Face, then NVIDIA, and only then the PWA's keyless endpoints.
  it('keeps ollama, then hugging face, then nvidia', () => {
    const env: Env = { OLLAMA_API_KEY: 'a', HUGGINGFACE_API_KEY: 'b', NVIDIA_API_KEY: 'c' };
    expect(resolveProviders(env).map((p) => p.id)).toEqual(['ollama', 'huggingface', 'nvidia']);
  });

  // A provider with no key is not a provider that failed - it never existed,
  // so it must not consume an attempt or show up in an error message.
  it('drops a provider with no key and one with a blank key', () => {
    const env: Env = { OLLAMA_API_KEY: '   ', NVIDIA_API_KEY: 'c' };
    expect(resolveProviders(env).map((p) => p.id)).toEqual(['nvidia']);
  });

  it('returns nothing when no key is set', () => {
    expect(resolveProviders({})).toEqual([]);
  });

  it('falls back to the built-in model and overrides it from env', () => {
    const bare = resolveProviders({ OLLAMA_API_KEY: 'a' })[0];
    expect(bare?.model).toBe('gpt-oss:120b');
    const picked = resolveProviders({ OLLAMA_API_KEY: 'a', OLLAMA_MODEL: 'qwen3:32b' })[0];
    expect(picked?.model).toBe('qwen3:32b');
  });

  it('offers tools by default and honours an explicit false', () => {
    expect(resolveProviders({ NVIDIA_API_KEY: 'c' })[0]?.supportsTools).toBe(true);
    expect(resolveProviders({ NVIDIA_API_KEY: 'c', NVIDIA_TOOLS: 'false' })[0]?.supportsTools).toBe(false);
  });

  it('never leaks a key through the health report', () => {
    const status = providerStatus({ OLLAMA_API_KEY: 'secret-value' });
    expect(JSON.stringify(status)).not.toContain('secret-value');
    expect(status).toEqual([
      { id: 'ollama', configured: true },
      { id: 'huggingface', configured: false },
      { id: 'nvidia', configured: false },
    ]);
  });
});

describe('shouldFailOver', () => {
  it('moves on for an exhausted quota, a dead key, and an upstream fault', () => {
    expect(shouldFailOver(429)).toBe(true);
    expect(shouldFailOver(401)).toBe(true);
    expect(shouldFailOver(402)).toBe(true);
    expect(shouldFailOver(503)).toBe(true);
  });

  it('stays on a provider that answered', () => {
    expect(shouldFailOver(200)).toBe(false);
  });
});

describe('isToolRejection', () => {
  // The one failure worth retrying on the same provider: the model does not
  // take a tools array, so ask again without one instead of burning a
  // provider that still has quota.
  it('recognises a 400 that names tools', () => {
    expect(isToolRejection(400, '{"error":"tools are not supported by this model"}')).toBe(true);
    expect(isToolRejection(422, 'function_call is not available')).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(isToolRejection(400, 'context length exceeded')).toBe(false);
    expect(isToolRejection(429, 'tools rate limited')).toBe(false);
  });
});

describe('probe endpoint contract', () => {
  // The probe exists to answer "why is this configured provider being
  // skipped", so it must cover every provider a chat request would try -
  // no more, no fewer.
  it('probes exactly the providers a chat request would use', () => {
    const env = { OLLAMA_API_KEY: 'a', NVIDIA_API_KEY: 'c' };
    expect(resolveProviders(env).map((p) => p.id)).toEqual(['ollama', 'nvidia']);
  });
});

describe('classifyChainFailure', () => {
  it('reports no configured provider as 503', () => {
    expect(classifyChainFailure([])).toBe(503);
  });

  // A class is only reported when every provider agrees, because "all three
  // keys are dead" and "one key is dead" need different words downstream.
  it('reports dead credentials only when every provider rejected them', () => {
    expect(classifyChainFailure([401, 403, 401])).toBe(401);
    expect(classifyChainFailure([401, 500])).toBe(502);
  });

  it('reports rate limiting only when every provider was rate limited', () => {
    expect(classifyChainFailure([429, 429])).toBe(429);
    expect(classifyChainFailure([429, 500])).toBe(502);
  });

  // Credit exhaustion is the exception to the agreement rule: it is the
  // most actionable failure and the one the reader can actually fix.
  it('surfaces a spent allowance even when only one provider reported it', () => {
    expect(classifyChainFailure([500, 402, 429])).toBe(402);
  });

  it('reports an all-timeout chain as a gateway timeout', () => {
    expect(classifyChainFailure([0, 0])).toBe(504);
    expect(classifyChainFailure([0, 500])).toBe(502);
  });

  it('falls back to a plain bad-gateway for a mixed failure', () => {
    expect(classifyChainFailure([500, 404])).toBe(502);
  });
});
